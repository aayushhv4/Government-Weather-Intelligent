"""ERA5-Land / CHIRPS adapter (PRD S5.P0.6 Track A, S6, S11).

Interface-only in this build: no reanalysis tiles are staged, and the service
will not silently substitute the seeded fixture while claiming the ERA5-Land
provenance. If an operator stages NetCDF/JSON tiles at the paths below, this
adapter starts serving them and the whole product switches from
`simulated_demo` to `historical_reference` automatically.

Expected staging (see README.md):
    data/era5land/<block_id>/block_tmax_daily.json   coarse  (B_t)
    data/era5land/<block_id>/panchayat_tmax_daily.json  fine  (reference)
    data/era5land/<block_id>/meta.json
"""

from __future__ import annotations

import json
from typing import Dict, List

from .. import config
from ..canonical import HindcastRecord, Panchayat
from ..provenance import CHIRPS, ERA5LAND
from .base import AdapterResult, WeatherDataAdapter

STAGE_DIR = config.DATA_DIR / "era5land"


class Era5LandAdapter(WeatherDataAdapter):
    name = "era5land"

    def _paths(self, block_id: str) -> Dict[str, str]:
        base = STAGE_DIR / block_id
        return {
            "block": base / "block_tmax_daily.json",
            "fine": base / "panchayat_tmax_daily.json",
            "meta": base / "meta.json",
        }

    def available(self) -> bool:
        return STAGE_DIR.exists() and any(STAGE_DIR.glob("*/meta.json"))

    def block_forecast(self, block_id: str, dates: List[str]) -> AdapterResult:
        paths = self._paths(block_id)
        if not paths["block"].exists():
            return AdapterResult(
                ok=False,
                provenance=ERA5LAND,
                data=None,
                detail="ERA5-Land tiles not staged for this block",
            )
        with open(paths["block"], "r", encoding="utf-8") as fh:
            payload = json.load(fh)
        wanted = [p for p in payload["days"] if p["date"] in set(dates)]
        return AdapterResult(
            ok=True,
            provenance=ERA5LAND,
            data=wanted,
            detail="ERA5-Land historical block series (not an operational forecast)",
        )

    def hindcast_pairs(self, block_id: str, panchayats: List[Panchayat]) -> AdapterResult:
        paths = self._paths(block_id)
        if not (paths["block"].exists() and paths["fine"].exists()):
            return AdapterResult(
                ok=False,
                provenance=ERA5LAND,
                data=None,
                detail="ERA5-Land hindcast tiles not staged for this block",
            )
        with open(paths["block"], "r", encoding="utf-8") as fh:
            block = json.load(fh)
        with open(paths["fine"], "r", encoding="utf-8") as fh:
            fine = json.load(fh)
        block_by_date = {d["date"]: d for d in block["days"]}
        records: List[HindcastRecord] = []
        for pid, series in fine["panchayats"].items():
            for entry in series:
                b = block_by_date.get(entry["date"])
                if not b:
                    continue
                records.append(
                    HindcastRecord(
                        date=entry["date"],
                        panchayat_id=pid,
                        block_t_max_c=float(b["t_max_c"]),
                        reference_t_max_c=float(entry["t_max_c"]),
                        block_rainfall_mm=b.get("rainfall_mm"),
                        reference_rainfall_mm=entry.get("rainfall_mm"),
                    )
                )
        return AdapterResult(
            ok=True,
            provenance=ERA5LAND,
            data=records,
            detail=f"ERA5-Land hindcast pairs loaded ({len(records)} rows)",
        )

    def chirps_rainfall(self, block_id: str) -> AdapterResult:
        """CHIRPS rainfall reference (P1). Interface only."""
        return AdapterResult(
            ok=False,
            provenance=CHIRPS,
            data=None,
            detail="CHIRPS tiles not staged; rainfall reference unavailable",
        )
