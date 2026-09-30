"""Canonical in-memory weather / geospatial types (PRD S21).

The pipeline downstream of the adapters only ever sees these structures, so a
real ERA5-Land/CHIRPS feed and the staged demo fixture enter the same system.
Swapping a provider must not require touching the model or the API layer.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class Panchayat:
    """One Panchayat inside the pilot block."""

    panchayat_id: str          # stable service id, e.g. LGD-271033
    lgd_code: str              # LGD code (codes only; LGD publishes no polygons)
    name: str
    block_id: str
    geometry: Dict             # GeoJSON Polygon
    centroid_lat: float
    centroid_lon: float
    elevation_m: float
    slope_deg: float
    aspect_deg: float
    land_cover: str
    ndvi: float
    area_km2: float            # computed from geometry, verified by sanity check
    boundary_source: str

    def to_properties(self) -> Dict:
        return {
            "panchayat_id": self.panchayat_id,
            "lgd_code": self.lgd_code,
            "name": self.name,
            "block_id": self.block_id,
            "elevation_m": round(self.elevation_m, 1),
            "slope_deg": round(self.slope_deg, 2),
            "aspect_deg": round(self.aspect_deg, 1),
            "land_cover": self.land_cover,
            "ndvi": round(self.ndvi, 3),
            "area_km2": round(self.area_km2, 4),
            "boundary_source": self.boundary_source,
        }


@dataclass
class PilotBlock:
    block_id: str
    name: str
    district: str
    state: str
    bbox: List[float]          # [lon_min, lat_min, lon_max, lat_max]
    mean_elevation_m: float
    boundary_source: str
    boundary_provenance: Dict
    selection_rationale: str
    panchayats: List[Panchayat] = field(default_factory=list)


@dataclass
class ForecastDay:
    """One coarse (block-level) forecast day — the contract input."""

    date: str
    t_max_c: float
    t_min_c: Optional[float] = None
    rainfall_mm: Optional[float] = None
    lead_days: int = 1

    def as_dict(self) -> Dict:
        return {
            "date": self.date,
            "t_max_c": self.t_max_c,
            "t_min_c": self.t_min_c,
            "rainfall_mm": self.rainfall_mm,
            "lead_days": self.lead_days,
        }


@dataclass
class BlockForecast:
    """A coarse forecast bundle plus its provenance."""

    block_id: str
    days: List[ForecastDay]
    provenance: Dict
    requested_source_type: str = "simulated_demo"


@dataclass
class HindcastRecord:
    """One coarse/fine training or validation pair (PRD S5.P0.6 Track A)."""

    date: str
    panchayat_id: str
    block_t_max_c: float
    reference_t_max_c: float
    block_rainfall_mm: Optional[float] = None
    reference_rainfall_mm: Optional[float] = None


@dataclass
class Prediction:
    """A single Panchayat-day output before/after reconciliation."""

    panchayat_id: str
    valid_date: str
    lead_days: int
    b1_t_max_c: float
    b2_t_max_c: float
    model_raw_t_max_c: float          # pre-adjustment (metrics use this)
    t_max_c: float                    # post-adjustment (displayed)
    anomaly_c: float                  # f_T(X_p)
    range_low_c: float
    range_high_c: float
    confidence: str
    top_features: List[Dict]
    rainfall_mm: Optional[float] = None
    rainfall_raw_mm: Optional[float] = None
    range_low_mm: Optional[float] = None
    range_high_mm: Optional[float] = None
    rainfall_status: str = "not_implemented"
