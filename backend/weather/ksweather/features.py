"""Geospatial feature engineering (PRD S5.P0.4, S23).

Predictors (PRD-listed): elevation, slope/aspect, latitude/longitude, land
cover, NDVI, historical local anomaly.

Where a predictor cannot be obtained in this environment the value is still
presented through the *same* interface, sourced from the documented staged
fixture and reported in `/weather/provenance`. We never silently invent a
measured variable: every staged value is labelled simulated_demo.

`hist_anomaly_c` is the Panchayat's mean (reference - block) anomaly over the
TRAINING period only. It is therefore leakage-free with respect to the test
window, and it is the only feature that is not a static terrain property.
"""

from __future__ import annotations

from typing import Dict, Iterable, List, Sequence

import numpy as np

from .canonical import Panchayat

# Fixed land-cover vocabulary so the one-hot encoding is stable across runs.
LAND_COVER_CLASSES = (
    "cropland",
    "plantation",
    "horticulture",
    "forest",
    "fallow",
)

FEATURE_NAMES: List[str] = [
    "elevation_m",
    "slope_deg",
    "aspect_sin",
    "aspect_cos",
    "latitude",
    "longitude",
    "ndvi",
    *[f"lc_{c}" for c in LAND_COVER_CLASSES],
    "hist_anomaly_c",
]

# Human-readable labels used in the UI "top contributing features" list.
FEATURE_LABELS: Dict[str, str] = {
    "elevation_m": "elevation",
    "slope_deg": "slope",
    "aspect_sin": "aspect",
    "aspect_cos": "aspect",
    "latitude": "latitude",
    "longitude": "longitude",
    "ndvi": "ndvi",
    **{f"lc_{c}": "land cover" for c in LAND_COVER_CLASSES},
    "hist_anomaly_c": "historical anomaly",
}


def feature_row(p: Panchayat, hist_anomaly_c: float) -> Dict[str, float]:
    """One Panchayat -> one named feature row."""
    aspect_rad = np.deg2rad(p.aspect_deg)
    row: Dict[str, float] = {
        "elevation_m": float(p.elevation_m),
        "slope_deg": float(p.slope_deg),
        "aspect_sin": float(np.sin(aspect_rad)),
        "aspect_cos": float(np.cos(aspect_rad)),
        "latitude": float(p.centroid_lat),
        "longitude": float(p.centroid_lon),
        "ndvi": float(p.ndvi),
        "hist_anomaly_c": float(hist_anomaly_c),
    }
    for c in LAND_COVER_CLASSES:
        row[f"lc_{c}"] = 1.0 if p.land_cover == c else 0.0
    return row


def feature_matrix(
    panchayats: Sequence[Panchayat],
    hist_anomalies: Dict[str, float],
) -> np.ndarray:
    """(n_panchayats, n_features) matrix in FEATURE_NAMES order."""
    rows: Iterable[Dict[str, float]] = (
        feature_row(p, hist_anomalies.get(p.panchayat_id, 0.0)) for p in panchayats
    )
    return np.asarray(
        [[r[name] for name in FEATURE_NAMES] for r in rows], dtype=float
    )


def aggregate_feature_importance(importances: Sequence[float]) -> Dict[str, float]:
    """Collapse the raw feature importances onto UI-level labels.

    aspect_sin/aspect_cos fold into "slope/aspect"; the binary land-cover
    columns fold into "land cover". Reported as *contributions*, never as
    causal attributions.
    """
    grouped: Dict[str, float] = {}
    for name, value in zip(FEATURE_NAMES, importances):
        label = FEATURE_LABELS.get(name, name)
        grouped[label] = grouped.get(label, 0.0) + float(value)
    total = sum(grouped.values()) or 1.0
    return {k: round(v / total, 4) for k, v in grouped.items()}
