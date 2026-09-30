"""Validation protocol (PRD S5.P0.6, S8, S24).

Track A (guaranteed): reanalysis-hindcast reconstruction.
    * blocked temporal split  train 2015-2022 / test 2023-2024
    * random row splits are PROHIBITED and are not implemented anywhere
    * leave-one-Panchayat-out spatial CV, reported as indicative because the
      block holds only a handful of Panchayats
Track B (if stations exist): independent holdout vs IMD AWS/ARG.

Metrics (MAE / RMSE / bias / skill vs B1) are computed from arrays on the
PRE-adjustment values, exactly as the PRD requires. The post-adjustment
consistency check is reported separately.

If Track B has no stations this module returns an explicit unavailability
record. It never fabricates station observations.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from . import config
from .adapters.base import AdapterResult
from .baselines import area_weights, b1_block_copy, b2_lapse_rate
from .canonical import HindcastRecord, Panchayat
from .features import FEATURE_NAMES, feature_matrix
from .model import metrics, skill_vs_b1, train_residual_forest
from .adjustment import (
    additive_mean_preserving,
    consistency_check,
    multiplicative_adjustment,
)

MIN_LOPO_FOLDS = 5

# Training-row caps. Day-level pairs repeat the same static feature vector, so a
# deterministic stride subsample changes the fitted conditional mean only inside
# the noise floor while keeping a cold build inside a demo-friendly budget
# (PRD S19). The holdout/test window is NEVER subsampled.
MAIN_TRAIN_STRIDE = 13
LOPO_TRAIN_STRIDE = 40
LOPO_TREES = 80


def _stride(records: Sequence[HindcastRecord], stride: int) -> List[HindcastRecord]:
    if stride <= 1:
        return list(records)
    return list(records)[::stride]


def _index_by_panchayat(records: Sequence[HindcastRecord]) -> Dict[str, List[HindcastRecord]]:
    out: Dict[str, List[HindcastRecord]] = {}
    for r in records:
        out.setdefault(r.panchayat_id, []).append(r)
    return out


def split_records(
    records: Sequence[HindcastRecord],
) -> Tuple[List[HindcastRecord], List[HindcastRecord]]:
    """Blocked temporal split. No shuffling, no random splits, ever."""
    train = [r for r in records if config.TRAIN_START <= r.date <= config.TRAIN_END]
    test = [r for r in records if config.TEST_START <= r.date <= config.TEST_END]
    return train, test


def historical_anomalies(
    train_records: Sequence[HindcastRecord],
    fallback: float = 0.0,
) -> Dict[str, float]:
    """Mean (reference - block) per Panchayat over the TRAINING window only."""
    acc: Dict[str, List[float]] = {}
    for r in train_records:
        acc.setdefault(r.panchayat_id, []).append(r.reference_t_max_c - r.block_t_max_c)
    return {pid: float(np.mean(v)) for pid, v in acc.items()} or {"__none__": fallback}


def run_validation(
    panchayats: List[Panchayat],
    records: List[HindcastRecord],
    track_b: Optional[AdapterResult] = None,
) -> Dict:
    """Full Track A validation + optional Track B, all code-generated."""
    if not records:
        return {
            "available": False,
            "reason": "no hindcast records available",
            "disclaimer": config.DISCLAIMER_HINDCAST,
        }

    train, test = split_records(records)
    if not train or not test:
        return {
            "available": False,
            "reason": "blocked split produced an empty train or test window",
            "disclaimer": config.DISCLAIMER_HINDCAST,
        }

    per_panch = _index_by_panchayat(records)
    hist = historical_anomalies(train)

    X = feature_matrix(panchayats, hist)              # (n_panch, n_features)
    pid_index = {p.panchayat_id: i for i, p in enumerate(panchayats)}

    # -- training matrix: one row per (panchayat, day) -------------------
    train_fit = _stride(train, MAIN_TRAIN_STRIDE)
    X_train = []
    y_train = []
    for r in train_fit:
        i = pid_index.get(r.panchayat_id)
        if i is None:
            continue
        X_train.append(X[i])
        y_train.append(r.reference_t_max_c - r.block_t_max_c)
    X_train_arr = np.asarray(X_train, dtype=float)
    y_train_arr = np.asarray(y_train, dtype=float)

    forest = train_residual_forest(X_train_arr, y_train_arr, seed=config.RANDOM_SEED)
    anomaly_hat = forest.predict(X)

    # -- test-set predictions -------------------------------------------
    b1_true, b1_pred = [], []
    b2_true, b2_pred = [], []
    rf_true, rf_pred = [], []
    residuals_by_panchayat: Dict[str, List[float]] = {}

    for r in test:
        i = pid_index.get(r.panchayat_id)
        if i is None:
            continue
        t = r.reference_t_max_c
        b1 = r.block_t_max_c
        b2 = b1 - config.LAPSE_RATE_C_PER_KM * (
            panchayats[i].elevation_m - _area_weighted_elevation(panchayats)
        ) / 1000.0
        rf = b1 + float(anomaly_hat[i])

        b1_true.append(t); b1_pred.append(b1)
        b2_true.append(t); b2_pred.append(b2)
        rf_true.append(t); rf_pred.append(rf)
        residuals_by_panchayat.setdefault(r.panchayat_id, []).append(t - rf)

    m_b1 = metrics(b1_true, b1_pred)
    m_b2 = metrics(b2_true, b2_pred)
    m_rf = metrics(rf_true, rf_pred)
    skill_rf = skill_vs_b1(m_rf["mae"], m_b1["mae"])
    skill_b2 = skill_vs_b1(m_b2["mae"], m_b1["mae"])

    # -- LOPO spatial CV --------------------------------------------------
    lopo = _lopo_cv(panchayats, records, pid_index, X)

    # -- post-adjustment consistency check --------------------------------
    consistency = _consistency_report(panchayats, test, pid_index, anomaly_hat)

    # -- residual quantiles (indicative, uncalibrated) --------------------
    from .uncertainty import pooled_and_per_panchayat

    quantiles = pooled_and_per_panchayat(residuals_by_panchayat)

    track_b_report = _track_b_report(track_b, test, panchayats)

    lopo_stable = bool(
        lopo.get("available")
        and lopo.get("mean_skill_vs_b1") is not None
        and lopo["mean_skill_vs_b1"] > 0.0
        and (lopo.get("std_mae") or 0) < max(m_rf["mae"] or 0, 1e-6) * 2.5
    )

    from .model import git_sha

    return {
        "available": True,
        "type": "reanalysis_hindcast",
        "test_period": f"{config.TEST_START}–{config.TEST_END}",
        "train_period": f"{config.TRAIN_START}–{config.TRAIN_END}",
        "split": "blocked temporal (no random row splits)",
        "sample_counts": {
            "train_rows": int(len(train)),
            "train_fit_rows": int(len(X_train_arr)),
            "test_rows": int(len(test)),
            "panchayats": len(panchayats),
            "train_stride": MAIN_TRAIN_STRIDE,
        },
        "model_version": config.MODEL_VERSION,
        "seed": config.RANDOM_SEED,
        "git_sha": git_sha(),
        "rows": {
            "B1_block_copy": {**m_b1, "skill_vs_b1": 0.0, "label": "B1 — Block copy"},
            "B2_lapse_rate": {**m_b2, "skill_vs_b1": skill_b2, "label": "B2 — Elevation lapse-rate"},
            "RF_residual": {**m_rf, "skill_vs_b1": skill_rf, "label": "RF — Residual correction"},
        },
        "skill_vs_block_copy": skill_rf,
        "lopo": lopo,
        "lopo_stable": lopo_stable,
        "consistency_check": consistency,
        "residual_quantiles": quantiles,
        "feature_importance": _importance_report(forest),
        "track_a_note": (
            "Track A compares the model against the coarse signal it was built "
            "from. It is a reconstruction (hindcast) and carries no "
            "operational forecast-skill meaning."
        ),
        "track_b": track_b_report,
        "disclaimer": config.DISCLAIMER_HINDCAST,
        "uncertainty_label": config.DISCLAIMER_UNCALIBRATED,
        "generated_at": _now_iso(),
    }


def run_rainfall_validation(
    panchayats: List[Panchayat],
    records: List[HindcastRecord],
) -> Dict:
    """P1 stretch: multiplicative rainfall residual model (PRD S6, S7).

    Reported separately and explicitly flagged `p1: true` + `validated: false`
    in the product unless the skill is genuinely positive. A rainfall result is
    never allowed to gate the temperature path.
    """
    usable = [r for r in records if r.block_rainfall_mm is not None and r.reference_rainfall_mm is not None]
    if not usable:
        return {
            "available": False,
            "p1": True,
            "reason": "no rainfall reference in the staged dataset",
        }
    train, test = split_records(usable)
    if not train or not test:
        return {"available": False, "p1": True, "reason": "blocked split empty"}

    per_panch = _index_by_panchayat(train)
    hist_ratio = {
        pid: float(np.mean([
            (r.reference_rainfall_mm + 1e-6) / (r.block_rainfall_mm + 1e-6)
            for r in rows if r.block_rainfall_mm is not None and r.block_rainfall_mm > 0
        ]))
        for pid, rows in per_panch.items()
    }
    hist_ratio = {k: v for k, v in hist_ratio.items() if np.isfinite(v)}
    if not hist_ratio:
        return {"available": False, "p1": True, "reason": "no usable rainfall ratios"}

    X = feature_matrix(panchayats, {k: (v - 1.0) for k, v in hist_ratio.items()})
    pid_index = {p.panchayat_id: i for i, p in enumerate(panchayats)}

    X_train, y_train = [], []
    for r in train:
        i = pid_index.get(r.panchayat_id)
        if i is None or not r.block_rainfall_mm:
            continue
        X_train.append(X[i])
        ratio = (r.reference_rainfall_mm + 1e-6) / (r.block_rainfall_mm + 1e-6)
        y_train.append(ratio - 1.0)
    if len(X_train) < 50:
        return {"available": False, "p1": True, "reason": "insufficient rainfall training rows"}

    forest = train_residual_forest(np.asarray(X_train, float), np.asarray(y_train, float))
    g = forest.predict(X)

    truth, b1_pred, rf_pred = [], [], []
    for r in test:
        i = pid_index.get(r.panchayat_id)
        if i is None:
            continue
        truth.append(r.reference_rainfall_mm)
        b1_pred.append(r.block_rainfall_mm)
        rf_pred.append(r.block_rainfall_mm * (1.0 + float(g[i])))

    m_b1 = metrics(truth, b1_pred)
    m_rf = metrics(truth, rf_pred)
    skill = skill_vs_b1(m_rf["mae"], m_b1["mae"])
    return {
        "available": True,
        "p1": True,
        "type": "reanalysis_hindcast",
        "test_period": f"{config.TEST_START}–{config.TEST_END}",
        "rows": {
            "B1_block_copy": {**m_b1, "skill_vs_b1": 0.0, "label": "B1 — Block copy (rainfall)"},
            "RF_multiplicative": {**m_rf, "skill_vs_b1": skill, "label": "RF — Multiplicative residual (rainfall)"},
        },
        "skill_vs_block_copy": skill,
        "validated": bool(skill is not None and skill > 0.0),
        "disclaimer": config.DISCLAIMER_HINDCAST,
        "generated_at": _now_iso(),
    }


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _area_weighted_elevation(panchayats: List[Panchayat]) -> float:
    w = area_weights(panchayats)
    return sum(w[p.panchayat_id] * p.elevation_m for p in panchayats)


def _lopo_cv(
    panchayats: List[Panchayat],
    records: List[HindcastRecord],
    pid_index: Dict[str, int],
    X: np.ndarray,
) -> Dict:
    """Leave-one-Panchayat-out spatial CV, reported as indicative only."""
    if len(panchayats) < MIN_LOPO_FOLDS:
        return {
            "available": False,
            "reason": f"only {len(panchayats)} panchayats; LOPO needs >= {MIN_LOPO_FOLDS}",
        }
    train, test = split_records(records)
    folds: List[Dict] = []
    for held_out in panchayats:
        tr = _stride([r for r in train if r.panchayat_id != held_out.panchayat_id], LOPO_TRAIN_STRIDE)
        te = [r for r in test if r.panchayat_id == held_out.panchayat_id]
        if not tr or not te:
            continue
        # Train-period anomaly statistics from the OTHER Panchayats only; the
        # held-out Panchayat gets the training mean, so the forest must
        # extrapolate from terrain features rather than memorise its offset.
        others = historical_anomalies(tr)
        mean_other = float(np.mean(list(others.values()))) if others else 0.0
        hist_fold = {pid: mean_other for pid in pid_index}
        X_fold = feature_matrix(panchayats, hist_fold)

        X_tr, y_tr = [], []
        for r in tr:
            i = pid_index[r.panchayat_id]
            X_tr.append(X_fold[i])
            y_tr.append(r.reference_t_max_c - r.block_t_max_c)
        forest = train_residual_forest(
            np.asarray(X_tr, float), np.asarray(y_tr, float), n_estimators=LOPO_TREES
        )

        truth, pred, b1p = [], [], []
        for r in te:
            i = pid_index[r.panchayat_id]
            truth.append(r.reference_t_max_c)
            pred.append(r.block_t_max_c + float(forest.predict(X_fold[i : i + 1])[0]))
            b1p.append(r.block_t_max_c)
        m = metrics(truth, pred)
        m_b1 = metrics(truth, b1p)
        folds.append({
            "panchayat_id": held_out.panchayat_id,
            "mae": m["mae"],
            "rmse": m["rmse"],
            "bias": m["bias"],
            "skill_vs_b1": skill_vs_b1(m["mae"], m_b1["mae"]),
            "n": m["n"],
        })

    if not folds:
        return {"available": False, "reason": "no folds produced"}
    maes = [f["mae"] for f in folds if f["mae"] is not None]
    skills = [f["skill_vs_b1"] for f in folds if f["skill_vs_b1"] is not None]
    return {
        "available": True,
        "folds": folds,
        "mean_mae": round(float(np.mean(maes)), 4) if maes else None,
        "std_mae": round(float(np.std(maes)), 4) if maes else None,
        "mean_skill_vs_b1": round(float(np.mean(skills)), 4) if skills else None,
        "note": (
            "Small spatial sample: LOPO is indicative and must not be presented "
            "as a stable generalisation estimate."
        ),
    }


def _consistency_report(
    panchayats: List[Panchayat],
    test: List[HindcastRecord],
    pid_index: Dict[str, int],
    anomaly_hat: np.ndarray,
) -> Dict:
    """Mean-preserving adjustment + post-hoc consistency check, per test day."""
    w = area_weights(panchayats)
    worst = 0.0
    example = None
    by_date: Dict[str, List[HindcastRecord]] = {}
    for r in test:
        by_date.setdefault(r.date, []).append(r)

    for day, rows in by_date.items():
        block = rows[0].block_t_max_c
        raw = {r.panchayat_id: block + float(anomaly_hat[pid_index[r.panchayat_id]]) for r in rows}
        adjusted, _diag = additive_mean_preserving(raw, w, block)
        check = consistency_check(adjusted, w, block, tolerance=1e-6)
        worst = max(worst, check["abs_difference"])
        if example is None:
            example = {
                "date": day,
                "block_value": round(block, 3),
                "pre_adjustment_weighted_mean": round(
                    sum(w[k] * v for k, v in raw.items()), 6
                ),
                **check,
            }

    out = {
        "method": "mean-preserving, area-weighted (additive for temperature)",
        "prd_form": "R*_p = R_p * B / sum(w_p * R_p) is applied verbatim to rainfall (P1)",
        "days_checked": len(by_date),
        "max_abs_difference": round(worst, 9),
        "tolerance": 1e-6,
        "passed": bool(worst <= 1e-6),
        "example_day": example,
        "note": "Consistency / reconciliation only — it is not an accuracy gain.",
    }
    if example:
        # Hoist the representative day's numbers so a reader does not have to
        # open `example_day` to see the check itself.
        out.update({
            "area_weighted_panchayat_mean": example["area_weighted_panchayat_mean"],
            "block_value": example["block_value"],
            "pre_adjustment_weighted_mean": example["pre_adjustment_weighted_mean"],
            "example_date": example["date"],
            "values_shown_for": "representative test day",
        })
    return out


def _importance_report(forest) -> Dict:
    from .features import aggregate_feature_importance

    raw = forest.feature_importances_
    return {
        "grouped": aggregate_feature_importance(raw),
        "note": "Contributions, not causal attributions.",
    }


def _track_b_report(
    track_b: Optional[AdapterResult],
    test: List[HindcastRecord],
    panchayats: List[Panchayat],
) -> Dict:
    if track_b is None or not track_b.ok:
        return {
            "available": False,
            "message": config.DISCLAIMER_TRACK_B_ABSENT,
            "station_count": 0,
            "detail": getattr(track_b, "detail", "") if track_b else "",
        }
    stations = track_b.data or []
    matched = []
    ref_by = {(r.date, r.panchayat_id): r.reference_t_max_c for r in test}
    for st in stations:
        pid = st.get("panchayat_id")
        obs = st.get("observations", [])
        for o in obs:
            key = (o.get("date"), pid)
            if key in ref_by and o.get("t_max_c") is not None:
                matched.append((float(o["t_max_c"]), ref_by[key]))
    if not matched:
        return {
            "available": False,
            "message": config.DISCLAIMER_TRACK_B_ABSENT,
            "station_count": len(stations),
            "detail": "stations configured but no observations overlap the test window",
        }
    truth = [m[0] for m in matched]
    ref = [m[1] for m in matched]
    m = metrics(truth, ref)
    return {
        "available": True,
        "station_count": len(stations),
        "matched_observations": len(matched),
        "metrics": m,
        "note": (
            "Track B compares the reference series against independent station "
            "observations. Only this track could support an operational-skill "
            "claim, and only when the stations are real."
        ),
    }


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
