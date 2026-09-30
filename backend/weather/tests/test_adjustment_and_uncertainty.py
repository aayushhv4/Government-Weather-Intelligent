"""Mean-preserving adjustment + indicative uncertainty (PRD S5.P0.5, S5.P0.7)."""

from __future__ import annotations

import pytest

from ksweather import config
from ksweather.adjustment import (
    additive_mean_preserving,
    consistency_check,
    multiplicative_adjustment,
)


W = {"a": 0.5, "b": 0.3, "c": 0.2}


def test_multiplicative_matches_prd_formula():
    values = {"a": 10.0, "b": 20.0, "c": 30.0}
    target = 24.0
    out, diag = multiplicative_adjustment(values, W, target)
    denom = sum(W[k] * values[k] for k in values)
    for k in values:
        assert pytest.approx(out[k], abs=1e-9) == values[k] * target / denom
    assert diag["negatives_clipped"] is False


def test_multiplicative_denominator_zero_falls_back_to_block():
    values = {"a": 0.0, "b": 0.0, "c": 0.0}
    out, diag = multiplicative_adjustment(values, W, 7.5)
    assert diag["fallback_to_block"] is True
    assert all(v == 7.5 for v in out.values())


def test_negative_values_clipped_and_mass_redistributed():
    values = {"a": -5.0, "b": 20.0, "c": 30.0}
    out, diag = multiplicative_adjustment(values, W, 20.0)
    assert diag["negatives_clipped"] is True
    assert diag["negatives_clipped_ids"] == ["a"]
    assert out["a"] == 0.0
    # weighted mean of the result equals the target: mass was redistributed
    assert pytest.approx(sum(W[k] * out[k] for k in out), abs=1e-9) == 20.0
    assert out["b"] > 0 and out["c"] > 0


def test_additive_mean_preserving_matches_block():
    values = {"a": 29.0, "b": 31.0, "c": 33.0}
    target = 30.0
    out, diag = additive_mean_preserving(values, W, target)
    assert pytest.approx(sum(W[k] * out[k] for k in out), abs=1e-9) == target
    assert "offset_c" in diag


def test_consistency_check_reports_pass_and_fail():
    ok = consistency_check({"a": 10.0, "b": 10.0, "c": 10.0}, W, 10.0)
    assert ok["passed"] is True
    bad = consistency_check({"a": 10.0, "b": 10.0, "c": 40.0}, W, 10.0)
    assert bad["passed"] is False
    assert bad["abs_difference"] > 0


def test_adjustment_is_not_described_as_accuracy():
    _, diag = additive_mean_preserving({"a": 1.0, "b": 2.0}, {"a": 0.5, "b": 0.5}, 2.0)
    assert "accuracy" not in str(diag).lower()


def test_uncertainty_quantiles_are_labelled_uncalibrated(panchayats):
    from ksweather.uncertainty import apply_indicative_range, residual_quantiles

    lo, hi = residual_quantiles([-1, -0.5, 0, 0.5, 1, 1.5, 2, -2, 0.2, 0.3])
    assert lo < hi
    rlo, rhi, label = apply_indicative_range(30.0, {"low": -1.0, "high": 1.5})
    assert rlo == 29.0 and rhi == 31.5
    assert label == config.DISCLAIMER_UNCALIBRATED


def test_confidence_mapping_follows_prd():
    from ksweather.uncertainty import confidence_for

    assert confidence_for(0.35, True, False) == "high"
    assert confidence_for(0.35, False, False) == "medium"
    assert confidence_for(0.05, True, False) == "medium"
    assert confidence_for(-0.2, True, False) == "low"
    assert confidence_for(0.9, True, True) == "low"   # baseline fallback
    assert confidence_for(None, True, False) == "low"
