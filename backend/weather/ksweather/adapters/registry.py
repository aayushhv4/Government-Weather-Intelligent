"""Adapter registry (PRD S11).

Selection policy, strongest provenance first:

    era5land (historical_reference) -> seeded (simulated_demo)

The registry NEVER upgrades provenance. Whatever provider answers, its own
`Provenance` travels with the data, and the pipeline reports the weakest link.
"""

from __future__ import annotations

from typing import Dict, List

from .base import AdapterResult, WeatherDataAdapter
from .era5land import Era5LandAdapter
from .imd_stations import ImdStationAdapter
from .seeded import SeededAdapter

ADAPTERS: Dict[str, WeatherDataAdapter] = {
    "seeded": SeededAdapter(),
    "era5land": Era5LandAdapter(),
    "imd_stations": ImdStationAdapter(),
}

_PRIORITY: List[str] = ["era5land", "seeded"]


def get_adapter(name: str) -> WeatherDataAdapter:
    if name not in ADAPTERS:
        raise KeyError(f"unknown adapter: {name}")
    return ADAPTERS[name]


def select_hindcast_adapter(preferred: str | None = None) -> WeatherDataAdapter:
    """First available provider in priority order, with an explicit override."""
    if preferred and preferred in ADAPTERS and ADAPTERS[preferred].available():
        return ADAPTERS[preferred]
    for name in _PRIORITY:
        adapter = ADAPTERS[name]
        if adapter.available():
            return adapter
    return ADAPTERS["seeded"]


def select_forecast_adapter(preferred: str | None = None) -> WeatherDataAdapter:
    """Coarse forecast provider. Only the seeded adapter can serve one today."""
    if preferred == "seeded":
        return ADAPTERS["seeded"]
    return ADAPTERS["seeded"]


def station_adapter() -> ImdStationAdapter:
    return ADAPTERS["imd_stations"]  # type: ignore[return-value]


def adapter_status() -> List[Dict]:
    """Reported by /weather/provenance so the UI can show what is wired up."""
    return [
        {"name": name, "available": ad.available(), "role": _role(name)}
        for name, ad in ADAPTERS.items()
    ]


def _role(name: str) -> str:
    return {
        "seeded": "coarse forecast + staged hindcast reference (simulated_demo)",
        "era5land": "reanalysis hindcast reference (historical_reference)",
        "imd_stations": "independent station holdout — Track B (official)",
    }.get(name, "unknown")


__all__ = [
    "ADAPTERS",
    "get_adapter",
    "select_hindcast_adapter",
    "select_forecast_adapter",
    "station_adapter",
    "adapter_status",
    "AdapterResult",
    "WeatherDataAdapter",
]
