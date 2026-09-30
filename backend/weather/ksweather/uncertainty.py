"""Indicative uncertainty (PRD S5.P0.7).

P10-P90 ranges come from empirical residual quantiles. They are INDICATIVE and
UNCALIBRATED: no coverage test, no conformal/window calibration and no quantile
forest is implemented in this build, so the range must always travel with the
label "Indicative — uncalibrated".

Nothing here may be described as a calibrated prediction interval.
"""

from __future__ import annotations

from typing import Dict, List, Sequence, Tuple

import numpy as np

from . import config


def residual_quantiles(residuals: Sequence[float]) -> Tuple[float, float]:
    """Empirical P10 / P90 of a residual sample."""
    arr = np.asarray(list(residuals), dtype=float)
    arr = arr[np.isfinite(arr)]
    if arr.size == 0:
        return 0.0, 0.0
    lo, hi = np.percentile(arr, [10, 90])
    return float(lo), float(hi)


def pooled_and_per_panchayat(
    residuals_by_panchayat: Dict[str, List[float]],
) -> Dict[str, Dict[str, float]]:
    """Quantiles per Panchayat plus a pooled fallback.

    Small Panchayat samples are noisy, so a Panchayat with fewer than
    `MIN_SAMPLES_FOR_OWN_QUANTILE` residual observations borrows the pooled
    quantiles. Which one was used is reported so the UI can stay honest.
    """
    min_samples = 30
    pooled: List[float] = []
    for values in residuals_by_panchayat.values():
        pooled.extend(float(v) for v in values if np.isfinite(v))
    pooled_lo, pooled_hi = residual_quantiles(pooled)

    out: Dict[str, Dict[str, float]] = {
        "__pooled__": {
            "low": round(pooled_lo, 4),
            "high": round(pooled_hi, 4),
            "n": len(pooled),
            "basis": "pooled",
        }
    }
    for pid, values in residuals_by_panchayat.items():
        clean = [float(v) for v in values if np.isfinite(v)]
        if len(clean) >= min_samples:
            lo, hi = residual_quantiles(clean)
            out[pid] = {
                "low": round(lo, 4),
                "high": round(hi, 4),
                "n": len(clean),
                "basis": "panchayat",
            }
        else:
            out[pid] = {
                "low": round(pooled_lo, 4),
                "high": round(pooled_hi, 4),
                "n": len(clean),
                "basis": "pooled (insufficient panchayat sample)",
            }
    return out


def apply_indicative_range(
    value: float,
    quantiles: Dict[str, float],
    floor: float | None = None,
) -> Tuple[float, float, str]:
    """Centre the indicative range on the value using residual offsets."""
    lo = float(value) + float(quantiles.get("low", 0.0))
    hi = float(value) + float(quantiles.get("high", 0.0))
    if floor is not None:
        lo = max(floor, lo)
        hi = max(floor, hi)
    if lo > hi:
        lo, hi = hi, lo
    return round(lo, 2), round(hi, 2), config.DISCLAIMER_UNCALIBRATED


def confidence_for(skill_vs_b1: float | None, lopo_stable: bool, used_baseline: bool) -> str:
    """PRD confidence mapping.

    high   -> skill > 0.2 and LOPO stable
    medium -> skill > 0
    low    -> baseline fallback (or no skill signal at all)
    """
    if used_baseline or skill_vs_b1 is None:
        return "low"
    if skill_vs_b1 > 0.2 and lopo_stable:
        return "high"
    if skill_vs_b1 > 0.0:
        return "medium"
    return "low"
