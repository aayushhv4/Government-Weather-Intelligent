"""Advisory engine tests (PRD S5.P0.9, S26)."""

from __future__ import annotations

from ksweather import config
from ksweather.advisory import evaluate_advisory, list_crops, load_rules


def _call(t_max_c, crop="tomato", rainfall_validated=False, rainfall_mm=None):
    return evaluate_advisory(
        panchayat_id="LGD-271033",
        panchayat_name="Shinde",
        valid_date="2026-01-10",
        t_max_c=t_max_c,
        range_low_c=t_max_c - 1.5,
        range_high_c=t_max_c + 1.5,
        confidence="medium",
        crop_key=crop,
        block_id=config.DEFAULT_BLOCK_ID,
        block_name="Dindori",
        model_version=config.MODEL_VERSION,
        source_type=config.SOURCE_SIMULATED,
        rainfall_mm=rainfall_mm,
        rainfall_validated=rainfall_validated,
    )


def test_rules_file_loads_and_is_versioned():
    rules = load_rules()
    assert rules["version"].startswith("advisory-rules")
    assert "tomato" in rules["crops"]
    assert rules["p0_variable"] == "temperature_heat_risk"
    assert rules["rainfall_rules"]["p1"] is True


def test_high_heat_produces_specific_action():
    out = _call(38.0)
    assert out["risk_level"] == "high"
    assert "Recommended action:" in out["message"]
    assert "irrigate" in out["action"].lower()
    assert "Shinde" in out["message"]
    assert "LGD-271033" in out["message"]


def test_moderate_heat_tier():
    out = _call(34.0)
    assert out["risk_level"] == "medium"


def test_no_risk_below_thresholds():
    out = _call(28.0)
    assert out["risk_level"] == "none"
    assert out["action"] is None


def test_thresholds_are_configurable():
    out = _call(38.0)
    assert out["threshold"] == 36.0
    rules = load_rules()
    assert rules["crops"]["tomato"]["heat"]["high"]["threshold_t_max_c"] == 36.0


def test_explainability_rule_shape():
    out = _call(38.0)
    assert out["explainability"]["rule"] == "IF heat-risk = HIGH AND crop = tomato THEN apply configured action"
    assert "not causal" in out["explainability"]["note"]


def test_handoff_targets_decision_support_pages():
    out = _call(38.0)
    pages = {v["page"] for v in out["handoff"].values()}
    assert {"market", "logisticsCompare", "logistics"} & pages
    assert "logisticsCompare" in pages


def test_rainfall_advisory_only_when_validated():
    blocked = _call(28.0, rainfall_mm=60.0, rainfall_validated=False)
    assert blocked["risk_level"] == "none"
    assert blocked["rainfall_risk_level"] == "none"
    active = _call(28.0, rainfall_mm=60.0, rainfall_validated=True)
    assert active["rainfall_risk_level"] == "high"


def test_unknown_crop_reported_with_configured_list():
    out = _call(38.0, crop="dragonfruit")
    assert out["available"] is False
    assert any(c["key"] == "tomato" for c in out["configured_crops"])


def test_every_configured_crop_has_a_high_heat_rule():
    for crop in list_crops():
        rules = load_rules()
        assert "heat" in rules["crops"][crop["key"]]
        assert "high" in rules["crops"][crop["key"]]["heat"]


def test_advisory_carries_disclaimer_and_provenance():
    out = _call(38.0)
    assert out["disclaimer"].startswith("Illustrative demo data")
    assert out["provenance"]["source_type"] == config.SOURCE_SIMULATED
    assert out["model_version"] == config.MODEL_VERSION
