"""Fallbacks + provenance discipline (PRD S8, S10, S15, S34)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from ksweather import config
from ksweather.app import app
from ksweather.pipeline import WeatherEngine


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_feature_fallback_uses_baseline_with_low_confidence(client, engine):
    """Model unavailable -> baseline output, confidence 'low', provenance unchanged."""
    original = engine.model
    try:
        engine.model = None
        body = client.post("/weather/downscale", json={
            "block_id": engine.block_id,
            "forecast": [{"date": "2026-01-10", "t_max_c": 31.2, "rainfall_mm": 5.0}],
        }).json()
        for f in body["features"]:
            props = f["properties"]
            assert props["confidence"] == "low"
            # baseline fallback: model value equals B1 block copy
            assert abs(props["model_raw_t_max_c"] - props["b1_t_max_c"]) < 1e-6
            assert props["anomaly_c"] == 0.0
        # provenance must not change because of the fallback
        assert body["meta"]["source_type"] == config.SOURCE_SIMULATED
        assert body["meta"]["provenance"]["note"].startswith("Provenance does not change")
    finally:
        engine.model = original


def test_provenance_never_upgrades_even_if_requested(engine):
    """A caller cannot ask for a stronger provenance than the data supports."""
    engine.ensure_ready()
    assert engine._weakest_source_type(config.SOURCE_OFFICIAL) == config.SOURCE_SIMULATED
    assert engine._weakest_source_type(None) == config.SOURCE_SIMULATED
    assert engine._weakest_source_type(config.SOURCE_SIMULATED) == config.SOURCE_SIMULATED


def test_weakest_link_logic_picks_simulation_over_historical():
    eng = WeatherEngine()
    eng.reference_provenance = {"source_type": config.SOURCE_HISTORICAL}
    eng.forecast_provenance = {"source_type": config.SOURCE_SIMULATED}
    from ksweather.canonical import PilotBlock

    eng.block = PilotBlock(
        block_id="LGD-271012", name="x", district="y", state="z", bbox=[],
        mean_elevation_m=0.0, boundary_source="s",
        boundary_provenance={"source_type": config.SOURCE_OFFICIAL},
        selection_rationale="",
    )
    assert eng._weakest_source_type(None) == config.SOURCE_SIMULATED


def test_downscale_payload_with_no_rainfall_still_works(client, engine):
    body = client.post("/weather/downscale", json={
        "block_id": engine.block_id,
        "forecast": [{"date": "2026-01-10", "t_max_c": 30.0}],
    }).json()
    assert all(f["properties"]["rainfall_mm"] is None for f in body["features"])


def test_rainfall_not_claimed_when_unvalidated(client, engine):
    body = client.post("/weather/downscale", json={
        "block_id": engine.block_id,
        "forecast": [{"date": "2026-01-10", "t_max_c": 30.0, "rainfall_mm": 40.0}],
    }).json()
    props = body["features"][0]["properties"]
    assert props["rainfall_status"].startswith("p1_unvalidated")
    assert "not validated" in props["rainfall_disclosure"].lower()


def test_mandatory_disclaimers_present_in_meta(client, engine):
    body = client.post("/weather/downscale", json={
        "block_id": engine.block_id,
        "forecast": [{"date": "2026-01-10", "t_max_c": 30.0}],
    }).json()
    d = body["meta"]["disclaimers"]
    assert d["demo_data"] == "Illustrative demo data"
    assert d["hindcast"] == config.DISCLAIMER_HINDCAST
    assert d["uncalibrated"] == config.DISCLAIMER_UNCALIBRATED
    assert "Track B unavailable" in d["track_b"]


def test_no_hardcoded_accuracy_strings_in_source():
    """Guard rail: no invented accuracy percentage may live in the service."""
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    offenders = []
    for path in root.rglob("*.py"):
        if "tests" in path.parts:
            continue
        text = path.read_text(encoding="utf-8").lower()
        for bad in ("98% accurate", "% accurate", "accuracy:", "guaranteed accuracy"):
            if bad in text:
                offenders.append((path.name, bad))
    assert not offenders, f"invented accuracy language found: {offenders}"
