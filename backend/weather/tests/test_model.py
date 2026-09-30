"""Random Forest residual model tests (PRD S5.P0.4, S23, S12)."""

from __future__ import annotations

import numpy as np

from ksweather import config
from ksweather.features import FEATURE_NAMES, feature_matrix, feature_row, aggregate_feature_importance
from ksweather.model import metrics, rank_top_features, skill_vs_b1, train_residual_forest


def test_feature_matrix_shape_and_names(panchayats):
    hist = {p.panchayat_id: 0.1 for p in panchayats}
    X = feature_matrix(panchayats, hist)
    assert X.shape == (len(panchayats), len(FEATURE_NAMES))
    assert np.isfinite(X).all()


def test_feature_row_one_hot_is_exclusive(panchayats):
    for p in panchayats:
        row = feature_row(p, 0.0)
        lc = [v for k, v in row.items() if k.startswith("lc_")]
        assert sum(lc) == 1.0
        assert len(row) == len(FEATURE_NAMES)


def test_seed_42_is_deterministic():
    rng = np.random.default_rng(0)
    X = rng.normal(size=(200, 4))
    y = X[:, 0] * 2.0 + rng.normal(scale=0.1, size=200)
    m1 = train_residual_forest(X, y, seed=config.RANDOM_SEED, n_estimators=25)
    m2 = train_residual_forest(X, y, seed=config.RANDOM_SEED, n_estimators=25)
    assert np.array_equal(m1.predict(X), m2.predict(X))


def test_forest_actually_participates(panchayats, engine):
    assert engine.model is not None
    hist = engine.model.hist_anomalies
    X = feature_matrix(panchayats, hist)
    preds = engine.model.predict_anomaly(X)
    # A forest that returns a single constant has not learned anything.
    assert len(set(np.round(preds, 4))) > 1


def test_metrics_are_arithmetic_not_typed():
    m = metrics([10.0, 12.0], [11.0, 12.0])
    assert m["n"] == 2
    assert m["mae"] == 0.5
    assert m["bias"] == 0.5
    assert abs(m["rmse"] - (0.5) ** 0.5) < 1e-3


def test_skill_formula():
    assert skill_vs_b1(0.5, 1.0) == 0.5
    assert skill_vs_b1(1.0, 1.0) == 0.0
    assert skill_vs_b1(1.5, 1.0) == -0.5
    assert skill_vs_b1(None, 1.0) is None
    assert skill_vs_b1(0.5, 0) is None


def test_rank_top_features_orders_by_contribution():
    top = rank_top_features({"elevation": 0.5, "ndvi": 0.3, "slope": 0.2}, k=2)
    assert [t["feature"] for t in top] == ["elevation", "ndvi"]


def test_feature_importance_grouping_sums_to_one():
    grouped = aggregate_feature_importance([0.1] * len(FEATURE_NAMES))
    assert abs(sum(grouped.values()) - 1.0) < 1e-3
    assert "elevation" in grouped and "land cover" in grouped


def test_missing_hist_anomaly_defaults_to_zero(panchayats):
    X = feature_matrix(panchayats, {})  # no history supplied
    assert np.isfinite(X).all()
