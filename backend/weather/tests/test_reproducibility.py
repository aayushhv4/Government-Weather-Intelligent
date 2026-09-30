"""Reproducibility tests (PRD S12, S13)."""

from __future__ import annotations

import json

from ksweather import config
from ksweather.adapters.seeded import SeededAdapter


DAY = [{"date": "2026-01-10", "t_max_c": 31.2, "t_min_c": 18.4, "rainfall_mm": 12.5, "lead_days": 1}]


def _stateful_engine():
    """Build a fresh engine that reuses the cached artifact (no 50 s rebuild)."""
    from ksweather.pipeline import WeatherEngine

    eng = WeatherEngine()
    eng.ensure_ready()
    return eng


def test_seeded_forecast_is_deterministic(panchayats):
    a = SeededAdapter().block_forecast(config.DEFAULT_BLOCK_ID, ["2026-01-10", "2026-01-11"])
    b = SeededAdapter().block_forecast(config.DEFAULT_BLOCK_ID, ["2026-01-10", "2026-01-11"])
    assert [d.as_dict() for d in a.data.days] == [d.as_dict() for d in b.data.days]


def test_hindcast_generation_is_deterministic(panchayats):
    a = SeededAdapter().hindcast_pairs(config.DEFAULT_BLOCK_ID, panchayats).data
    b = SeededAdapter().hindcast_pairs(config.DEFAULT_BLOCK_ID, panchayats).data
    assert len(a) == len(b)
    assert a[0] == b[0]
    assert a[len(a) // 2] == b[len(b) // 2]


def test_two_engines_produce_identical_downscale(engine):
    other = _stateful_engine()
    first = engine.downscale(engine.block_id, DAY)
    second = other.downscale(other.block_id, DAY)
    strip = lambda body: [
        {k: v for k, v in f["properties"].items()} for f in body["features"]
    ]
    assert strip(first) == strip(second)
    assert first["meta"]["model_version"] == config.MODEL_VERSION


def test_model_version_and_seed_are_recorded(engine):
    assert engine.validation["model_version"] == config.MODEL_VERSION
    assert engine.validation["seed"] == config.RANDOM_SEED
    assert engine.validation["git_sha"]


def test_validation_artifact_is_written(engine):
    assert config.VALIDATION_ARTIFACT.exists()
    payload = json.loads(config.VALIDATION_ARTIFACT.read_text(encoding="utf-8"))
    assert payload["model_version"] == config.MODEL_VERSION
    assert payload["seed"] == config.RANDOM_SEED
    assert payload["validation"]["rows"]["RF_residual"]["mae"] is not None


def test_engine_cache_round_trip(engine):
    assert config.ARTIFACTS_DIR.joinpath("engine_cache.pkl").exists()
