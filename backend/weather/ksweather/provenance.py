"""Provenance helpers (PRD S6 / S10).

Every record that reaches the UI carries a `source_type` drawn from exactly
three values, plus a human-readable description. Fallbacks change
`source_type`; they never silently keep an "official" badge. This module is the
single place that decides those strings.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Dict

from . import config


@dataclass(frozen=True)
class Provenance:
    source_type: str            # official | historical_reference | simulated_demo
    source_name: str            # human readable provider name
    source_url: str             # where the data came from (or "n/a")
    license: str                # license string, disclosed in the UI footer
    is_live: bool               # True only for a real operational feed
    note: str                   # free-text honesty note

    def as_dict(self) -> Dict:
        return asdict(self)

    def validate(self) -> None:
        if self.source_type not in config.ALLOWED_SOURCE_TYPES:
            raise ValueError(f"illegal source_type: {self.source_type!r}")


# ---------------------------------------------------------------------------
# Committed providers. `is_live=False` everywhere is deliberate: this build has
# no operational IMD feed and must never claim one.
# ---------------------------------------------------------------------------

SEEDED_FORECAST = Provenance(
    source_type=config.SOURCE_SIMULATED,
    source_name="Seeded block forecast (illustrative)",
    source_url="n/a",
    license="n/a — generated fixture",
    is_live=False,
    note=(
        "No official IMD block bulletin feed is available in this build. Values "
        "are a seeded demonstration fixture, not a live forecast."
    ),
)

STAGED_HINDCAST = Provenance(
    source_type=config.SOURCE_SIMULATED,
    source_name="Staged hindcast reference (synthetic, deterministic)",
    source_url="n/a — replace with ERA5-Land / CHIRPS adapter",
    license="n/a — generated fixture",
    is_live=False,
    note=(
        "Stands in for ERA5-Land / IMD gridded reference while no reanalysis "
        "tiles are staged. Validation metrics demonstrate pipeline correctness, "
        "NOT real-world forecast skill."
    ),
)

ERA5LAND = Provenance(
    source_type=config.SOURCE_HISTORICAL,
    source_name="ECMWF ERA5-Land (0.1 deg) — historical reference",
    source_url="https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land",
    license="Copernicus C3S licence (attribution)",
    is_live=False,
    note="Reanalysis, not an observation network and not an operational forecast.",
)

CHIRPS = Provenance(
    source_type=config.SOURCE_HISTORICAL,
    source_name="CHIRPS v2.0 (0.05 deg) — historical rainfall reference",
    source_url="https://www.chc.ucsb.edu/data/chirps",
    license="Public domain",
    is_live=False,
    note="Coarser than a Panchayat; used only as a P1 historical reference.",
)

IMD_GRIDDED = Provenance(
    source_type=config.SOURCE_HISTORICAL,
    source_name="IMD gridded rainfall (0.25 deg)",
    source_url="https://www.imdpune.gov.in/",
    license="IMD open data terms",
    is_live=False,
    note="Historical, not live.",
)

IMD_STATION = Provenance(
    source_type=config.SOURCE_OFFICIAL,
    source_name="IMD AWS/ARG point observations (Track B)",
    source_url="https://aws.imd.gov.in/",
    license="IMD open data terms",
    is_live=True,
    note="Only usable when real station observations are configured for the pilot block.",
)

SCHEMATIC_BOUNDARY = Provenance(
    source_type=config.SOURCE_SIMULATED,
    source_name="Illustrative pilot grid (schematic cell boundaries)",
    source_url="n/a — replace with India Geodata / DataMeet GP GeoJSON",
    license="n/a — schematic placeholder",
    is_live=False,
    note=(
        "NOT official Gram Panchayat boundaries and NOT community-mapped "
        "boundaries. A regular grid over the pilot block envelope is used so "
        "the pipeline can run; every area weight and map polygon is therefore "
        "illustrative."
    ),
)

COMMUNITY_BOUNDARY = Provenance(
    source_type=config.SOURCE_HISTORICAL,
    source_name="India Geodata / DataMeet GP polygons (community, LGD-mapped)",
    source_url="https://github.com/datameet",
    license="India Geodata CC0-1.0 / DataMeet ODbL",
    is_live=False,
    note="Community-mapped. Not an official government boundary product.",
)

OFFICIAL_BOUNDARY = Provenance(
    source_type=config.SOURCE_OFFICIAL,
    source_name="Bhuvan / ISRO NRSC administrative boundary",
    source_url="https://bhuvan.nrsc.gov.in/",
    license="Bhuvan terms of use",
    is_live=False,
    note="Official source; only claimable when polygons are actually loaded from Bhuvan.",
)
