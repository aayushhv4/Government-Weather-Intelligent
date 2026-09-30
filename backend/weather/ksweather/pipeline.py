"""Downscaling engine (PRD S7 flow) — the piece the API layer calls.

    Block forecast
      -> geospatial feature extraction
      -> named baselines (B1 / B2)
      -> temperature RF residual correction
      -> mean-preserving adjustment
      -> indicative uncertainty
      -> Panchayat forecast
      -> heat-risk crop advisory
      -> decision support action

The engine is trained once at start-up (or loaded from a cached artifact), so
inference is fast and the judge never waits for a model fit (PRD S19).

Error/fallback discipline (PRD S7, S8):
  * missing feature data -> baseline (B1/B2) output with confidence "low"
  * model unavailable    -> seeded fallback, source_type "simulated_demo"
  * provenance never changes because of a fallback; it is always whatever the
    weakest provider in the chain actually is.
"""

from __future__ import annotations

import json
import logging
import pickle
import threading
from datetime import datetime, timezone
from typing import Dict, List, Optional

import numpy as np

from . import config
from .adapters import boundaries, registry
from .adapters.base import AdapterResult
from .adjustment import (
    additive_mean_preserving,
    consistency_check,
    multiplicative_adjustment,
)
from .baselines import area_weights, b1_block_copy, b2_lapse_rate
from .canonical import Panchayat, PilotBlock
from .features import feature_matrix, aggregate_feature_importance
from .model import TrainedModel, git_sha, rank_top_features, train_residual_forest
from .provenance import SEEDED_FORECAST, STAGED_HINDCAST
from .uncertainty import apply_indicative_range, confidence_for
from .validation import (
    historical_anomalies,
    run_rainfall_validation,
    run_validation,
    split_records,
)

logger = logging.getLogger("ksweather.engine")

BLOCK_IDS: Dict[str, Dict] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class WeatherEngine:
    """Single-flight engine shared by all API routes."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._ready = False
        self.block: Optional[PilotBlock] = None
        self.panchayats: List[Panchayat] = []
        self.block_meta: Dict = {}
        self.model: Optional[TrainedModel] = None
        self.validation: Dict = {}
        self.rainfall_validation: Dict = {}
        self.rainfall_forest = None
        self.rainfall_g: Optional[np.ndarray] = None
        self.rainfall_ok = False
        self.warnings: List[str] = []
        self.forecast_provenance: Dict = SEEDED_FORECAST.as_dict()
        self.reference_provenance: Dict = STAGED_HINDCAST.as_dict()

    # ------------------------------------------------------------------
    # start-up / caching
    # ------------------------------------------------------------------
    def ensure_ready(self, block_id: str = config.DEFAULT_BLOCK_ID) -> None:
        """Idempotent. Loads the precomputed artifact when it matches, else builds."""
        with self._lock:
            if self._ready:
                return
            if self._load_cache(block_id):
                self._ready = True
                logger.info("weather engine loaded from cached artifact")
                return
            self._build(block_id)
            self._save_cache()
            self._ready = True

    # -- artifact cache (PRD S19: never make the judge wait for a model fit) --
    def _cache_signature(self, block_id: str) -> str:
        return "|".join([
            "engine-cache-v1",
            config.MODEL_VERSION,
            str(config.RANDOM_SEED),
            block_id,
            config.TRAIN_START,
            config.TRAIN_END,
            config.TEST_START,
            config.TEST_END,
        ])

    def _cache_path(self):
        return config.ARTIFACTS_DIR / "engine_cache.pkl"

    def _load_cache(self, block_id: str) -> bool:
        path = self._cache_path()
        if not path.exists():
            return False
        try:
            with open(path, "rb") as fh:
                payload = pickle.load(fh)
            if payload.get("signature") != self._cache_signature(block_id):
                return False
            state = payload["state"]
            for key, value in state.items():
                setattr(self, key, value)
            return self.block is not None and bool(self.panchayats)
        except Exception as exc:  # pragma: no cover - corrupt cache is not fatal
            logger.warning("engine cache unusable (%s); rebuilding", exc)
            return False

    def _save_cache(self) -> None:
        try:
            config.ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
            state = {
                "block": self.block,
                "panchayats": self.panchayats,
                "block_meta": self.block_meta,
                "model": self.model,
                "validation": self.validation,
                "rainfall_validation": self.rainfall_validation,
                "rainfall_forest": self.rainfall_forest,
                "rainfall_g": self.rainfall_g,
                "rainfall_ok": self.rainfall_ok,
                "warnings": self.warnings,
                "forecast_provenance": self.forecast_provenance,
                "reference_provenance": self.reference_provenance,
            }
            with open(self._cache_path(), "wb") as fh:
                pickle.dump({"signature": self._cache_signature(self.block_id), "state": state}, fh)
        except Exception as exc:  # pragma: no cover - best-effort
            logger.warning("engine cache write skipped: %s", exc)

    def _build(self, block_id: str) -> None:
        panchayats, meta = boundaries.load_boundaries(block_id)
        self.panchayats = panchayats
        self.block_meta = meta
        self.block = PilotBlock(
            block_id=block_id,
            name=str(meta.get("name", block_id)),
            district=str(meta.get("district", "")),
            state=str(meta.get("state", "")),
            bbox=list(meta.get("bbox", [])),
            mean_elevation_m=float(
                sum(area_weights(panchayats)[p.panchayat_id] * p.elevation_m for p in panchayats)
            ),
            boundary_source=str(meta.get("boundary_source", "")),
            boundary_provenance=dict(meta.get("boundary_provenance", {})),
            selection_rationale=str(meta.get("selection_rationale", "")),
            panchayats=panchayats,
        )

        hind_adapter = registry.select_hindcast_adapter()
        hind = hind_adapter.hindcast_pairs(block_id, panchayats)
        if not hind.ok:
            hind = registry.get_adapter("seeded").hindcast_pairs(block_id, panchayats)
            self.warnings.append(
                f"hindcast adapter '{hind_adapter.name}' unavailable; seeded fallback used"
            )
        self.reference_provenance = hind.provenance.as_dict()

        forecast_adapter = registry.select_forecast_adapter()
        self.forecast_provenance = (
            forecast_adapter.block_forecast(block_id, ["2026-01-10"]).provenance.as_dict()
            if forecast_adapter.available()
            else SEEDED_FORECAST.as_dict()
        )

        records = hind.data or []

        # Validation first: it produces the residual quantiles and the LOPO
        # stability signal that the production model and the UI both consume,
        # so the uncertainty band and the displayed metrics share one source.
        track_b = registry.station_adapter().station_observations(block_id, panchayats)
        self.validation = run_validation(panchayats, records, track_b=track_b)
        self._train(records)
        self.validation["reference_dataset"] = self.reference_provenance.get("source_name")
        self.validation["reference_dataset_note"] = self.reference_provenance.get("note")

        self.rainfall_validation = run_rainfall_validation(panchayats, records)
        # Honesty gate (PRD S6/S15): a skill number computed against a staged
        # synthetic reference must never be presented as a validated rainfall
        # model. The metrics stay visible; the claim does not.
        if self.reference_provenance.get("source_type") == config.SOURCE_SIMULATED:
            self.rainfall_validation["validated_on_staged_dataset"] = bool(
                self.rainfall_validation.get("validated")
            )
            self.rainfall_validation["validated"] = False
            self.rainfall_validation["validation_withheld_reason"] = (
                "Reference dataset is a staged synthetic fixture, so the rainfall "
                "residual model is NOT claimed as scientifically validated. The "
                "guaranteed heat-risk advisory is used instead."
            )
        self.rainfall_validation["reference_dataset"] = self.reference_provenance.get("source_name")

        self._persist_validation()

    def _train(self, records) -> None:
        if not records or not self.validation.get("available"):
            self.model = None
            self.warnings.append("no hindcast/validation available; engine will serve baseline-only output")
            return
        train, test = split_records(records)
        hist = historical_anomalies(train)
        X = feature_matrix(self.panchayats, hist)
        pid_index = {p.panchayat_id: i for i, p in enumerate(self.panchayats)}

        X_tr, y_tr = [], []
        for r in train:
            i = pid_index.get(r.panchayat_id)
            if i is None:
                continue
            X_tr.append(X[i])
            y_tr.append(r.reference_t_max_c - r.block_t_max_c)
        if not X_tr:
            self.model = None
            return

        forest = train_residual_forest(np.asarray(X_tr, float), np.asarray(y_tr, float))

        # Residual quantiles + LOPO stats come from the validation report so
        # the uncertainty band and the displayed metrics share one source.
        quantiles = self.validation.get("residual_quantiles") or {}
        grouped = aggregate_feature_importance(forest.feature_importances_)
        self.model = TrainedModel(
            regressor=forest,
            hist_anomalies=hist,
            residual_quantiles=quantiles,
            importances=grouped,
            terrain_importances={k: v for k, v in grouped.items() if k != "historical anomaly"},
            metrics=self.validation.get("rows", {}),
            lopo_cv=self.validation.get("lopo", {}),
            lopo_stable=bool(self.validation.get("lopo_stable")),
            n_train=len(X_tr),
            n_test=int(self.validation.get("sample_counts", {}).get("test_rows", 0)),
            trained_at=_now_iso(),
            git_sha=git_sha(),
        )

        # P1 rainfall model (only used when its validation says it is positive).
        self._train_rainfall(records)

    def _train_rainfall(self, records) -> None:
        self.rainfall_ok = bool(self.rainfall_validation.get("validated"))
        if not self.rainfall_ok:
            self.rainfall_forest = None
            return
        usable = [
            r for r in records
            if r.block_rainfall_mm is not None and r.reference_rainfall_mm is not None
        ]
        train, _ = split_records(usable)
        acc: Dict[str, List[float]] = {}
        for r in train:
            if r.block_rainfall_mm and r.block_rainfall_mm > 1e-6:
                acc.setdefault(r.panchayat_id, []).append(
                    (r.reference_rainfall_mm + 1e-6) / (r.block_rainfall_mm + 1e-6) - 1.0
                )
        hist_ratio = {pid: float(np.mean(v)) for pid, v in acc.items()}
        X = feature_matrix(self.panchayats, hist_ratio)
        pid_index = {p.panchayat_id: i for i, p in enumerate(self.panchayats)}
        X_tr, y_tr = [], []
        for r in train:
            i = pid_index.get(r.panchayat_id)
            if i is None or not r.block_rainfall_mm:
                continue
            X_tr.append(X[i])
            y_tr.append((r.reference_rainfall_mm + 1e-6) / (r.block_rainfall_mm + 1e-6) - 1.0)
        if X_tr:
            self.rainfall_forest = train_residual_forest(np.asarray(X_tr, float), np.asarray(y_tr, float))
            self.rainfall_g = self.rainfall_forest.predict(X)

    def _persist_validation(self) -> None:
        # Optional Supabase persistence (PRD S9/S13). No-op without credentials.
        try:
            from .persistence import get_writer

            writer = get_writer()
            writer.insert_validation_run(self.validation)
            writer.upsert_panchayats(self.block_id, self.pilot_payload())
        except Exception as exc:  # pragma: no cover - best-effort
            logger.info("validation persistence skipped: %s", exc)
        try:
            config.ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
            payload = {
                "validation": self.validation,
                "rainfall_validation": self.rainfall_validation,
                "model_version": config.MODEL_VERSION,
                "seed": config.RANDOM_SEED,
                "git_sha": git_sha(),
                "written_at": _now_iso(),
            }
            with open(config.VALIDATION_ARTIFACT, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)
            if self.model is not None:
                with open(config.MODEL_ARTIFACT, "wb") as fh:
                    pickle.dump(self.model, fh)
        except Exception as exc:  # pragma: no cover - persistence is best-effort
            self.warnings.append(f"artifact persistence skipped: {exc}")

    # ------------------------------------------------------------------
    # reads
    # ------------------------------------------------------------------
    @property
    def block_id(self) -> str:
        return self.block.block_id if self.block else config.DEFAULT_BLOCK_ID

    def pilot_payload(self) -> Dict:
        assert self.block is not None
        w = area_weights(self.panchayats)
        return {
            "block": {
                "block_id": self.block.block_id,
                "name": self.block.name,
                "district": self.block.district,
                "state": self.block.state,
                "bbox": self.block.bbox,
                "mean_elevation_m": round(self.block.mean_elevation_m, 2),
                "panchayat_count": len(self.panchayats),
                "boundary_source": self.block.boundary_source,
                "boundary_provenance": self.block.boundary_provenance,
                "boundary_is_schematic": bool(self.block_meta.get("boundary_is_schematic")),
                "selection_rationale": self.block.selection_rationale,
            },
            "panchayats": [
                {
                    **p.to_properties(),
                    "area_weight": round(w[p.panchayat_id], 6),
                    "centroid": {"lat": round(p.centroid_lat, 5), "lon": round(p.centroid_lon, 5)},
                    "geometry": p.geometry,
                }
                for p in self.panchayats
            ],
            "model_version": config.MODEL_VERSION,
            "elevation_reference": "area-weighted mean elevation (zbar_block)",
            "warnings": list(self.warnings),
        }

    def provenance_payload(self) -> Dict:
        return {
            "adapters": registry.adapter_status(),
            "forecast_input": self.forecast_provenance,
            "reference_dataset": self.reference_provenance,
            "boundaries": self.block.boundary_provenance if self.block else {},
            "allowed_source_types": list(config.ALLOWED_SOURCE_TYPES),
            "disclaimers": {
                "demo_data": config.DISCLAIMER_DEMO_DATA,
                "historical_reference": config.DISCLAIMER_HISTORICAL_REF,
                "hindcast": config.DISCLAIMER_HINDCAST,
                "uncalibrated": config.DISCLAIMER_UNCALIBRATED,
                "track_b_absent": config.DISCLAIMER_TRACK_B_ABSENT,
            },
            "licenses": [
                {"source": "ERA5-Land", "license": "Copernicus C3S licence (attribution)"},
                {"source": "CHIRPS", "license": "Public domain"},
                {"source": "MODIS NDVI / Land Cover", "license": "NASA open licence"},
                {"source": "India Geodata", "license": "CC0-1.0"},
                {"source": "DataMeet", "license": "ODbL"},
                {
                    "source": "Pilot schematic grid (this build)",
                    "license": "Generated placeholder — no third-party data",
                },
            ],
            "reproducibility": {
                "seed": config.RANDOM_SEED,
                "train_period": f"{config.TRAIN_START}–{config.TRAIN_END}",
                "test_period": f"{config.TEST_START}–{config.TEST_END}",
                "model_version": config.MODEL_VERSION,
                "git_sha": git_sha(),
            },
        }

    # ------------------------------------------------------------------
    # inference
    # ------------------------------------------------------------------
    def downscale(self, block_id: str, days: List[Dict], source_type: Optional[str] = None) -> Dict:
        self.ensure_ready(block_id)
        if block_id != self.block_id:
            raise KeyError(f"unknown block_id: {block_id}")

        w = area_weights(self.panchayats)
        pid_index = {p.panchayat_id: i for i, p in enumerate(self.panchayats)}
        hist = self.model.hist_anomalies if self.model else {}
        X = feature_matrix(self.panchayats, hist)

        used_baseline = self.model is None
        skill = (self.validation.get("skill_vs_block_copy")
                 if self.validation.get("available") else None)
        base_confidence = confidence_for(skill, bool(self.validation.get("lopo_stable")), used_baseline)

        # provenance of this response = weakest link (PRD S8/S10)
        effective_source_type = self._weakest_source_type(source_type)

        quantiles = (self.model.residual_quantiles if self.model else {}) or {}

        features: List[Dict] = []
        day_checks: List[Dict] = []
        for day in days:
            block_t = float(day["t_max_c"])
            b1 = b1_block_copy(block_t, self.panchayats)
            b2 = b2_lapse_rate(block_t, self.panchayats)
            if used_baseline:
                raw = dict(b1)
                anomaly = {p.panchayat_id: 0.0 for p in self.panchayats}
            else:
                anomaly_arr = self.model.predict_anomaly(X)
                anomaly = {p.panchayat_id: float(anomaly_arr[pid_index[p.panchayat_id]]) for p in self.panchayats}
                raw = {pid: block_t + anomaly[pid] for pid in b1}

            adjusted, diag = additive_mean_preserving(raw, w, block_t)
            check = consistency_check(adjusted, w, block_t)

            rain_raw: Dict[str, float] = {}
            rain_adj: Dict[str, float] = {}
            rain_block = day.get("rainfall_mm")
            if rain_block is not None:
                if self.rainfall_forest is not None and self.rainfall_g is not None:
                    rain_raw = {
                        p.panchayat_id: max(0.0, float(rain_block) * (1.0 + float(self.rainfall_g[pid_index[p.panchayat_id]])))
                        for p in self.panchayats
                    }
                    rain_adj, _rdiag = multiplicative_adjustment(rain_raw, w, float(rain_block))
                else:
                    rain_raw = {p.panchayat_id: float(rain_block) for p in self.panchayats}
                    rain_adj = dict(rain_raw)

            for p in self.panchayats:
                q = quantiles.get(p.panchayat_id) or quantiles.get("__pooled__") or {"low": 0.0, "high": 0.0}
                lo, hi, _label = apply_indicative_range(adjusted[p.panchayat_id], q)
                terrain = (
                    self.model.terrain_importances
                    or {k: v for k, v in (self.model.importances or {}).items() if k != "historical anomaly"}
                ) if self.model else {}
                top = rank_top_features(terrain, k=3)
                top_features = [t["feature"] for t in top]
                all_contributions = rank_top_features(self.model.importances if self.model else {}, k=6)
                props = {
                    "panchayat_id": p.panchayat_id,
                    "lgd_code": p.lgd_code,
                    "name": p.name,
                    "valid_date": day["date"],
                    "lead_days": int(day.get("lead_days", 1)),
                    "t_max_c": round(adjusted[p.panchayat_id], 2),
                    "model_raw_t_max_c": round(raw[p.panchayat_id], 2),
                    "b1_t_max_c": round(b1[p.panchayat_id], 2),
                    "b2_t_max_c": round(b2[p.panchayat_id], 2),
                    "anomaly_c": round(anomaly[p.panchayat_id], 3),
                    "range_low_c": lo,
                    "range_high_c": hi,
                    "confidence": base_confidence,
                    "top_features": top_features,
                    "top_feature_contributions": all_contributions,
                    "top_features_basis": "geophysical predictors only; the training-period historical-anomaly predictor is reported separately",
                    "explanation": self._explain(p, anomaly[p.panchayat_id], top),
                    "rainfall_mm": round(rain_adj.get(p.panchayat_id, 0.0), 2) if rain_block is not None else None,
                    "rainfall_raw_mm": round(rain_raw.get(p.panchayat_id, 0.0), 2) if rain_block is not None else None,
                    "range_low_mm": self._rain_range(rain_adj.get(p.panchayat_id), quantiles, p).get("low"),
                    "range_high_mm": self._rain_range(rain_adj.get(p.panchayat_id), quantiles, p).get("high"),
                    "rainfall_status": "p1_validated" if self.rainfall_ok else "p1_unvalidated_fallback_to_block_copy",
                    "rainfall_disclosure": (
                        "P1 — rainfall residual model; ships only when its own validation is positive"
                        if self.rainfall_ok else
                        "P1 not validated in this build — rainfall shown as block copy only"
                    ),
                    "elevation_m": round(p.elevation_m, 1),
                    "area_km2": round(p.area_km2, 4),
                    "area_weight": round(w[p.panchayat_id], 6),
                    "boundary_source": p.boundary_source,
                }
                features.append({
                    "type": "Feature",
                    "properties": props,
                    "geometry": p.geometry,
                })

            day_checks.append({"date": day["date"], **check})

        response = {
            "type": "FeatureCollection",
            "meta": self._meta(effective_source_type, day_checks),
            "features": features,
        }
        self._persist_forecast(block_id, days, effective_source_type, response)
        return response

    def _persist_forecast(self, block_id: str, days: List[Dict], source_type: str, response: Dict) -> None:
        """Best-effort Supabase write. Never affects the API response."""
        try:
            from .persistence import get_writer

            writer = get_writer()
            if not writer.enabled:
                return
            writer.insert_weather_input(block_id, days, source_type)
            writer.insert_downscaled_forecasts(block_id, response)
        except Exception as exc:  # pragma: no cover - best-effort
            logger.info("forecast persistence skipped: %s", exc)

    def _rain_range(self, value: Optional[float], quantiles: Dict, p: Panchayat) -> Dict:
        if value is None:
            return {"low": None, "high": None}
        q = quantiles.get(p.panchayat_id) or quantiles.get("__pooled__") or {"low": 0.0, "high": 0.0}
        spread = max(abs(float(q.get("high", 0.0))), abs(float(q.get("low", 0.0))), 0.5)
        lo = max(0.0, round(value - spread, 2))
        hi = round(value + spread, 2)
        return {"low": lo, "high": hi}

    def _weakest_source_type(self, requested: Optional[str]) -> str:
        """Weakest link wins. A fallback may downgrade provenance, never upgrade."""
        chain = [
            str(self.reference_provenance.get("source_type", config.SOURCE_SIMULATED)),
            str(self.forecast_provenance.get("source_type", config.SOURCE_SIMULATED)),
            str((self.block.boundary_provenance or {}).get("source_type", config.SOURCE_SIMULATED))
            if self.block else config.SOURCE_SIMULATED,
        ]
        order = {config.SOURCE_HISTORICAL: 0, config.SOURCE_OFFICIAL: 1, config.SOURCE_SIMULATED: 2}
        # simulated_demo is the weakest, then historical_reference, then official
        weakest = max(chain, key=lambda s: order.get(s, 2))
        return weakest

    def _explain(self, p: Panchayat, anomaly: float, top: List[Dict]) -> str:
        """Explain the direction of the correction using the ranked contributors.

        The lead sentence is chosen from the top-ranked geophysical feature that
        is actually in the list, so the sentence never claims a driver the model
        did not use.
        """
        names = [t["feature"] for t in top]
        joined = ", ".join(names) or "terrain and vegetation covariates"
        if abs(anomaly) < 0.3:
            lead = "This Panchayat is estimated close to the block value"
        elif "elevation" in names:
            lead = (
                "Higher elevation contributed to the lower estimated temperature"
                if anomaly < 0 else
                "Lower elevation contributed to the higher estimated temperature"
            )
        else:
            lead = (
                "Terrain and vegetation covariates lowered the estimate below the block value"
                if anomaly < 0 else
                "Terrain and vegetation covariates raised the estimate above the block value"
            )
        return (
            f"{lead}. Top contributing features: {joined}. "
            f"Local correction f_T(X) = {anomaly:+.2f} C. Model contribution, not a causal statement."
        )

    def _meta(self, source_type: str, day_checks: List[Dict]) -> Dict:
        assert self.block is not None
        v = self.validation if self.validation.get("available") else {}
        return {
            "model_version": config.MODEL_VERSION,
            "boundary_source": self.block.boundary_source,
            "boundary_provenance": self.block.boundary_provenance,
            "source_type": source_type,
            "reference_dataset": self.reference_provenance.get("source_name"),
            "reference_dataset_note": self.reference_provenance.get("note"),
            "adjustment": (
                "mean-preserving, area-weighted — additive for temperature; the PRD "
                "multiplicative form (R*_p = R_p * B / sum(w_p*R_p)) is applied to "
                "rainfall (P1)"
            ),
            "validation": {
                "type": v.get("type"),
                "test_period": v.get("test_period"),
                "skill_vs_block_copy": v.get("skill_vs_block_copy"),
                "track_b_available": bool((v.get("track_b") or {}).get("available")),
                "disclaimer": config.DISCLAIMER_HINDCAST,
                "uncertainty": config.DISCLAIMER_UNCALIBRATED,
            },
            "consistency_check": day_checks,
            "top_features_note": (
                "`top_features` ranks geophysical contributors (elevation, slope/aspect, "
                "latitude/longitude, NDVI, land cover). The PRD-listed historical-anomaly "
                "predictor is derived from the training-period reference mean, so it "
                "trivially dominates any importance ranking and is reported separately in "
                "`top_feature_contributions` instead. Contributions are not causal claims."
            ),
            "uncertainty_note": (
                "Ranges are empirical P10-P90 offsets from hindcast residuals per "
                "Panchayat (pooled where the Panchayat sample is small). Uncalibrated: no "
                "coverage test has been performed."
            ),
            "provenance": {
                "forecast_input": self.forecast_provenance,
                "reference_dataset": self.reference_provenance,
                "boundaries": self.block.boundary_provenance,
                "note": "Provenance does not change because of a fallback; fallbacks are disclosed, not hidden.",
            },
            "issued_at": _now_iso(),
            "generated_at": _now_iso(),
            "warnings": list(self.warnings),
            "disclaimers": {
                "demo_data": config.DISCLAIMER_DEMO_DATA,
                "historical_reference": config.DISCLAIMER_HISTORICAL_REF,
                "hindcast": config.DISCLAIMER_HINDCAST,
                "uncalibrated": config.DISCLAIMER_UNCALIBRATED,
                "track_b": config.DISCLAIMER_TRACK_B_ABSENT,
            },
        }


_ENGINE: Optional[WeatherEngine] = None


def get_engine() -> WeatherEngine:
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = WeatherEngine()
    return _ENGINE
