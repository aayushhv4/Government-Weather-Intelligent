"""IMD AWS/ARG station adapter — PRD Track B (PRD S5.P0.6, S6).

Track B is the *only* track that could support an operational-forecast-skill
claim, because it is an independent observational holdout. It is therefore
never simulated: if no station observations are configured, this adapter says
so in the response (`track_b.available = false`) and the UI prints

    "Track B unavailable — no suitable station observations configured."

Expected staging when stations are available:
    data/stations/<block_id>.json
    { "stations": [ { "station_id": "...", "lat": .., "lon": ..,
                      "panchayat_id": "...", "observations": [
                         { "date": "2023-05-01", "t_max_c": 38.4 } ] } ] }
"""

from __future__ import annotations

import json
from typing import Dict, List

from .. import config
from ..canonical import Panchayat
from ..provenance import IMD_STATION
from .base import AdapterResult, WeatherDataAdapter

STATION_DIR = config.DATA_DIR / "stations"


class ImdStationAdapter(WeatherDataAdapter):
    name = "imd_stations"

    def _path(self, block_id: str):
        return STATION_DIR / f"{block_id}.json"

    def available(self) -> bool:
        return STATION_DIR.exists() and any(STATION_DIR.glob("*.json"))

    def block_forecast(self, block_id: str, dates: List[str]) -> AdapterResult:
        return AdapterResult(
            ok=False,
            provenance=IMD_STATION,
            data=None,
            detail="stations do not provide a block forecast; they are a validation target",
        )

    def hindcast_pairs(self, block_id: str, panchayats: List[Panchayat]) -> AdapterResult:
        return AdapterResult(
            ok=False,
            provenance=IMD_STATION,
            data=None,
            detail="stations are a holdout, not a training reference",
        )

    def station_observations(self, block_id: str, panchayats: List[Panchayat]) -> AdapterResult:
        path = self._path(block_id)
        if not path.exists():
            return AdapterResult(
                ok=False,
                provenance=IMD_STATION,
                data=None,
                detail=config.DISCLAIMER_TRACK_B_ABSENT,
            )
        try:
            with open(path, "r", encoding="utf-8") as fh:
                payload = json.load(fh)
        except Exception as exc:  # pragma: no cover - defensive
            return AdapterResult(
                ok=False,
                provenance=IMD_STATION,
                data=None,
                detail=f"station file unreadable: {exc}",
            )
        stations: List[Dict] = payload.get("stations", [])
        if not stations:
            return AdapterResult(
                ok=False,
                provenance=IMD_STATION,
                data=None,
                detail=config.DISCLAIMER_TRACK_B_ABSENT,
            )
        return AdapterResult(
            ok=True,
            provenance=IMD_STATION,
            data=stations,
            detail=f"{len(stations)} station(s) configured",
        )
