"""Named baselines (PRD S5.P0.3), implemented as executable code.

B1 — Block copy: every Panchayat receives the coarse Block value.
B2 — Elevation lapse-rate (temperature):
        T_p = B_t - 6.5 degC/km * (z_p - zbar_block) / 1000

These are deliberately *named* baselines, not straw men: the validation screen
reports MAE/RMSE/bias for each, and the skill score is computed against B1.
"""

from __future__ import annotations

from typing import Dict, Sequence

from . import config
from .canonical import Panchayat


def area_weights(panchayats: Sequence[Panchayat]) -> Dict[str, float]:
    """w_p = area_p / sum(area). Raises if total area is zero (PRD S7)."""
    total = sum(p.area_km2 for p in panchayats)
    if total <= 0:
        raise ValueError("total panchayat area is zero — cannot form area weights")
    return {p.panchayat_id: p.area_km2 / total for p in panchayats}


def mean_block_elevation(panchayats: Sequence[Panchayat]) -> float:
    """zbar_block — area-weighted mean elevation of the block."""
    w = area_weights(panchayats)
    return sum(w[p.panchayat_id] * p.elevation_m for p in panchayats)


def b1_block_copy(block_t_max_c: float, panchayats: Sequence[Panchayat]) -> Dict[str, float]:
    """B1: identical Block value everywhere."""
    return {p.panchayat_id: float(block_t_max_c) for p in panchayats}


def b2_lapse_rate(
    block_t_max_c: float,
    panchayats: Sequence[Panchayat],
    lapse_rate_c_per_km: float = config.LAPSE_RATE_C_PER_KM,
) -> Dict[str, float]:
    """B2: exact PRD lapse-rate equation, no approximation."""
    z_bar = mean_block_elevation(panchayats)
    out: Dict[str, float] = {}
    for p in panchayats:
        lapse = lapse_rate_c_per_km * (p.elevation_m - z_bar) / 1000.0
        out[p.panchayat_id] = float(block_t_max_c) - lapse
    return out
