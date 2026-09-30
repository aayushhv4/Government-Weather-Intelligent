"""Validation protocol tests (PRD S5.P0.6, S8, S24)."""

from __future__ import annotations

from ksweather import config
from ksweather.adapters import registry
from ksweather.adapters.seeded import SeededAdapter
from ksweather.validation import (
    historical_anomalies,
    run_rainfall_validation,
    run_validation,
    split_records,
)


def _records(panchayats):
    return SeededAdapter().hindcast_pairs(config.DEFAULT_BLOCK_ID, panchayats).data


def test_blocked_split_has_no_overlap_and_no_shuffle(panchayats):
    recs = _records(panchayats)
    train, test = split_records(recs)
    assert train and test
    assert max(r.date for r in train) <= config.TRAIN_END
    assert min(r.date for r in test) >= config.TEST_START
    assert max(r.date for r in train) < min(r.date for r in test)


def test_random_row_split_is_not_implemented():
    """A guard rail: the module must not expose any shuffling split helper."""
    import ksweather.validation as v

    assert not hasattr(v, "train_test_split")
    assert not hasattr(v, "random_split")


def test_historical_anomalies_use_train_window_only(panchayats):
    recs = _records(panchayats)
    train, _test = split_records(recs)
    hist = historical_anomalies(train)
    assert set(hist).issubset({p.panchayat_id for p in panchayats})


def test_validation_report_shape(engine):
    v = engine.validation
    assert v["available"] is True
    assert v["type"] == "reanalysis_hindcast"
    assert v["split"].startswith("blocked temporal")
    for key in ("B1_block_copy", "B2_lapse_rate", "RF_residual"):
        row = v["rows"][key]
        for metric in ("mae", "rmse", "bias", "n"):
            assert row[metric] is not None
    assert v["rows"]["B1_block_copy"]["skill_vs_b1"] == 0.0


def test_metrics_are_code_generated_and_self_consistent(engine):
    v = engine.validation
    b1 = v["rows"]["B1_block_copy"]["mae"]
    rf = v["rows"]["RF_residual"]["mae"]
    skill = v["skill_vs_block_copy"]
    assert abs(skill - (1 - rf / b1)) < 1e-3


def test_lopo_cv_present_and_indicative(engine):
    lopo = engine.validation["lopo"]
    assert lopo["available"] is True
    assert len(lopo["folds"]) == len(engine.panchayats)
    assert "indicative" in lopo["note"].lower()


def test_consistency_check_is_post_adjustment_and_passes(engine):
    cc = engine.validation["consistency_check"]
    assert cc["passed"] is True
    assert cc["max_abs_difference"] <= cc["tolerance"]
    assert "not an accuracy" in cc["note"].lower()


def test_disclaimers_present(engine):
    assert engine.validation["disclaimer"] == config.DISCLAIMER_HINDCAST
    assert engine.validation["uncertainty_label"] == config.DISCLAIMER_UNCALIBRATED
    note = engine.validation["track_a_note"].lower()
    assert "no operational forecast-skill" in note
    assert "hindcast" in note


def test_track_b_reports_unavailable_not_fabricated(engine):
    tb = engine.validation["track_b"]
    assert tb["available"] is False
    assert tb["station_count"] == 0
    assert "Track B unavailable" in tb["message"]


def test_station_adapter_never_invents_observations(panchayats):
    res = registry.station_adapter().station_observations(config.DEFAULT_BLOCK_ID, panchayats)
    assert res.ok is False
    assert res.data is None


def test_rainfall_p1_is_flagged_and_not_claimed_as_validated(engine):
    rv = engine.rainfall_validation
    assert rv.get("p1") is True
    assert rv.get("validated") is False
    assert rv.get("validated_on_staged_dataset") in (True, False)
    assert engine.rainfall_ok is False


def test_validation_unavailable_path_returns_no_metrics(panchayats):
    report = run_validation(panchayats, [])
    assert report["available"] is False
    assert "mae" not in report
    assert report["disclaimer"] == config.DISCLAIMER_HINDCAST


def test_rainfall_validation_without_reference():
    from ksweather.canonical import HindcastRecord

    recs = [HindcastRecord("2020-01-01", "LGD-271033", 30.0, 31.0)]
    out = run_rainfall_validation([], recs)
    assert out["available"] is False and out["p1"] is True
