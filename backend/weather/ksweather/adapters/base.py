"""Adapter interface (PRD S11)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from ..canonical import BlockForecast, HindcastRecord, Panchayat
from ..provenance import Provenance


@dataclass
class AdapterResult:
    """A provider response plus the provenance that must travel with it."""

    ok: bool
    provenance: Provenance
    data: Any
    detail: str = ""
    degraded_from: Optional[str] = None


class WeatherDataAdapter(ABC):
    """A coarse/fine weather provider.

    Implementations must be honest: if the provider cannot serve the request
    they return `ok=False` with a `detail` string, never a fabricated sample.
    """

    name: str = "abstract"

    @abstractmethod
    def available(self) -> bool:
        """Whether this provider can actually serve data in this deployment."""

    @abstractmethod
    def block_forecast(self, block_id: str, dates: List[str]) -> AdapterResult:
        """Coarse block-level forecast (or its seeded stand-in)."""

    @abstractmethod
    def hindcast_pairs(self, block_id: str, panchayats: List[Panchayat]) -> AdapterResult:
        """Coarse/fine training + validation pairs (PRD Track A)."""

    def station_observations(self, block_id: str, panchayats: List[Panchayat]) -> AdapterResult:
        """Independent point observations (PRD Track B). Default: not offered."""
        return AdapterResult(
            ok=False,
            provenance=Provenance(
                source_type="simulated_demo",
                source_name=f"{self.name}: no station support",
                source_url="n/a",
                license="n/a",
                is_live=False,
                note="This adapter does not provide station observations.",
            ),
            data=None,
            detail="no station observations configured",
        )
