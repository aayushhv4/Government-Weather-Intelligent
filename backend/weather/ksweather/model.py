"""Temperature Random Forest residual correction (PRD S5.P0.4, S7, S23).

Core model, exactly as specified:

    T_p,t = B_t + f_T(X_p) + e_p,t

`f_T` is a Random Forest regressor trained on the local anomaly
`(reference - block)` using the geospatial predictors. The coarse Block signal
is always the backbone; the forest only ever supplies a bounded local
correction, so a misbehaving model degrades toward B1 rather than falling off a
cliff.

Every metric in this module is computed by code from arrays. Nothing is typed
in, emailed in, or read from a slide.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np
from sklearn.ensemble import RandomForestRegressor

from . import config
from .features import FEATURE_NAMES


def git_sha() -> str:
    """Best-effort git SHA for reproducibility records (PRD S13)."""
    try:
        root = str(config.SERVICE_DIR.parent.parent)
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if out.returncode == 0:
            return out.stdout.strip() or "unknown"
    except Exception:
        pass
    return "unknown"


def train_residual_forest(
    X: np.ndarray,
    y: np.ndarray,
    seed: int = config.RANDOM_SEED,
    n_estimators: int = 120,
) -> RandomForestRegressor:
    """Deterministic RF. Fixed seed + fixed split => reproducible metrics."""
    model = RandomForestRegressor(
        n_estimators=n_estimators,
        max_depth=None,
        min_samples_leaf=3,
        random_state=seed,
        n_jobs=1,          # single-threaded: bit-identical runs across machines
    )
    model.fit(X, y)
    return model


def metrics(y_true: Sequence[float], y_pred: Sequence[float]) -> Dict[str, float]:
    """MAE / RMSE / bias, all from arrays."""
    t = np.asarray(list(y_true), dtype=float)
    p = np.asarray(list(y_pred), dtype=float)
    if t.size == 0:
        return {"mae": None, "rmse": None, "bias": None, "n": 0}
    err = p - t
    return {
        "mae": round(float(np.mean(np.abs(err))), 4),
        "rmse": round(float(np.sqrt(np.mean(err ** 2))), 4),
        "bias": round(float(np.mean(err)), 4),
        "n": int(t.size),
    }


def skill_vs_b1(mae_model: Optional[float], mae_b1: Optional[float]) -> Optional[float]:
    """skill = 1 - MAE_model / MAE_B1 (PRD S3). None if undefined."""
    if mae_model is None or mae_b1 in (None, 0):
        return None
    return round(1.0 - float(mae_model) / float(mae_b1), 4)


@dataclass
class TrainedModel:
    """Everything needed for reproducible inference and honest reporting."""

    regressor: RandomForestRegressor
    feature_names: List[str] = field(default_factory=lambda: list(FEATURE_NAMES))
    hist_anomalies: Dict[str, float] = field(default_factory=dict)
    residual_quantiles: Dict[str, Dict[str, float]] = field(default_factory=dict)
    metrics: Dict[str, Dict] = field(default_factory=dict)
    lopo_cv: Dict[str, Dict] = field(default_factory=dict)
    importances: Dict[str, float] = field(default_factory=dict)
    # Importances with the target-derived `historical anomaly` predictor removed.
    # See rank_top_features() for why the UI ranks on this set.
    terrain_importances: Dict[str, float] = field(default_factory=dict)
    lopo_stable: bool = False
    n_train: int = 0
    n_test: int = 0
    trained_at: str = ""
    model_version: str = config.MODEL_VERSION
    seed: int = config.RANDOM_SEED
    git_sha: str = "unknown"

    def predict_anomaly(self, X: np.ndarray) -> np.ndarray:
        return self.regressor.predict(X)

    def provenance_dict(self) -> Dict:
        return {
            "model_version": self.model_version,
            "seed": self.seed,
            "git_sha": self.git_sha,
            "n_train": self.n_train,
            "n_test": self.n_test,
            "feature_names": self.feature_names,
            "trained_at": self.trained_at,
        }


def rank_top_features(importances: Dict[str, float], k: int = 3) -> List[Dict]:
    """Top-k contributing features, framed as contributions not causes.

    `historical anomaly` is a legitimate PRD-listed predictor, but it is derived
    from the reference series (the training-period mean local anomaly) and so it
    trivially dominates any importance ranking. Ranking it inside the "why does
    this Panchayat differ" list would bury the geophysical drivers without
    telling the reader anything they can act on. The caller therefore passes the
    terrain/vegetation importances here, and the full ranked list (including the
    historical-anomaly predictor) is still returned separately and disclosed.
    """
    ordered = sorted(importances.items(), key=lambda kv: kv[1], reverse=True)
    return [
        {"feature": name, "contribution": round(float(value), 4)}
        for name, value in ordered[:k]
    ]
