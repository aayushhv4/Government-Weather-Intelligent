"""Supabase persistence (PRD S9, S13, S18).

Writes to the five weather tables created by
`backend/supabase/migrations/006_weather_intelligence.sql`:

    panchayats · weather_inputs · downscaled_forecasts · validation_runs · advisories

Rules honoured here:
  * uses the SERVICE ROLE key, which is server-side only and never shipped to a
    browser (PRD S18);
  * without `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` every call becomes a
    logged no-op, so local development and the demo never break;
  * geometry is stored as GeoJSON inside JSONB — no PostGIS dependency
    (PRD S7/S9);
  * each validation run also persists the git SHA and model version (PRD S13).
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

from . import config

logger = logging.getLogger("ksweather.persistence")


class SupabaseWriter:
    """Minimal REST writer — avoids pulling in a client library for five inserts."""

    def __init__(self) -> None:
        self.url = config.SUPABASE_URL.rstrip("/")
        self.key = config.SUPABASE_SERVICE_ROLE_KEY
        self.enabled = bool(self.url and self.key)

    # -- transport ------------------------------------------------------
    def _post(self, table: str, rows: List[Dict[str, Any]], prefer: str = "return=minimal") -> bool:
        if not self.enabled:
            logger.info("persistence disabled (no SUPABASE_URL / service role) — skipping %s", table)
            return False
        if not rows:
            return False
        endpoint = f"{self.url}/rest/v1/{table}"
        body = json.dumps(rows).encode("utf-8")
        req = urllib.request.Request(
            endpoint,
            data=body,
            method="POST",
            headers={
                "apikey": self.key,
                "Authorization": f"Bearer {self.key}",
                "Content-Type": "application/json",
                "Prefer": prefer,
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                resp.read()
            return True
        except urllib.error.HTTPError as exc:  # pragma: no cover - network path
            logger.warning("persist to %s failed: HTTP %s %s", table, exc.code, exc.reason)
        except Exception as exc:  # pragma: no cover - network path
            logger.warning("persist to %s failed: %s", table, exc)
        return False

    # -- entity helpers -------------------------------------------------
    def upsert_panchayats(self, block_id: str, payload: Dict) -> bool:
        rows = [
            {
                "panchayat_id": p["panchayat_id"],
                "lgd_code": p["lgd_code"],
                "name": p["name"],
                "block_id": block_id,
                "block_name": payload.get("block", {}).get("name"),
                "district": payload.get("block", {}).get("district"),
                "state": payload.get("block", {}).get("state"),
                "area_km2": p["area_km2"],
                "area_weight": p["area_weight"],
                "elevation_m": p["elevation_m"],
                "slope_deg": p["slope_deg"],
                "aspect_deg": p["aspect_deg"],
                "land_cover": p["land_cover"],
                "ndvi": p["ndvi"],
                "centroid_lat": p["centroid"]["lat"],
                "centroid_lon": p["centroid"]["lon"],
                "geometry": p["geometry"],
                "boundary_source": p["boundary_source"],
            }
            for p in payload.get("panchayats", [])
        ]
        return self._post(
            "panchayats", rows, prefer="resolution=merge-duplicates,return=minimal"
        )

    def insert_weather_input(self, block_id: str, days: List[Dict], source_type: str) -> bool:
        return self._post(
            "weather_inputs",
            [{
                "block_id": block_id,
                "source_type": source_type,
                "forecast": days,
                "day_count": len(days),
            }],
        )

    def insert_downscaled_forecasts(self, block_id: str, response: Dict) -> bool:
        meta = response.get("meta", {})
        rows = [
            {
                "block_id": block_id,
                "panchayat_id": f["properties"]["panchayat_id"],
                "valid_date": f["properties"]["valid_date"],
                "lead_days": f["properties"]["lead_days"],
                "t_max_c": f["properties"]["t_max_c"],
                "range_low_c": f["properties"]["range_low_c"],
                "range_high_c": f["properties"]["range_high_c"],
                "rainfall_mm": f["properties"].get("rainfall_mm"),
                "confidence": f["properties"]["confidence"],
                "top_features": f["properties"].get("top_feature_contributions"),
                "source_type": meta.get("source_type"),
                "model_version": meta.get("model_version"),
                "boundary_source": meta.get("boundary_source"),
                "properties": f["properties"],
                "geometry": f.get("geometry"),
            }
            for f in response.get("features", [])
        ]
        return self._post("downscaled_forecasts", rows)

    def insert_validation_run(self, report: Dict) -> bool:
        if not report or not report.get("available"):
            return False
        return self._post(
            "validation_runs",
            [{
                "validation_type": report.get("type"),
                "train_period": report.get("train_period"),
                "test_period": report.get("test_period"),
                "split": report.get("split"),
                "model_version": report.get("model_version"),
                "git_sha": report.get("git_sha"),
                "seed": report.get("seed"),
                "sample_counts": report.get("sample_counts"),
                "metrics": report.get("rows"),
                "skill_vs_block_copy": report.get("skill_vs_block_copy"),
                "lopo": report.get("lopo"),
                "consistency_check": report.get("consistency_check"),
                "track_b": report.get("track_b"),
                "reference_dataset": report.get("reference_dataset"),
                "disclaimer": report.get("disclaimer"),
            }],
        )

    def insert_advisory(self, advisory: Dict) -> bool:
        if not advisory or not advisory.get("available"):
            return False
        return self._post(
            "advisories",
            [{
                "block_id": advisory.get("block_id"),
                "panchayat_id": advisory.get("panchayat_id"),
                "crop": advisory.get("crop"),
                "valid_date": advisory.get("valid_date"),
                "risk_level": advisory.get("risk_level"),
                "rule_version": advisory.get("rule_version"),
                "message": advisory.get("message"),
                "action": advisory.get("action"),
                "handoff": advisory.get("handoff"),
                "source_type": (advisory.get("provenance") or {}).get("source_type"),
                "model_version": advisory.get("model_version"),
            }],
        )


_writer: Optional[SupabaseWriter] = None


def get_writer() -> SupabaseWriter:
    global _writer
    if _writer is None:
        _writer = SupabaseWriter()
    return _writer
