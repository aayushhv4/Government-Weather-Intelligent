"""Administrative layer sanity check + named baselines (PRD S5.P0.1, S5.P0.3)."""

from __future__ import annotations

import pytest

from ksweather import config
from ksweather.adapters import boundaries
from ksweather.baselines import (
    area_weights,
    b1_block_copy,
    b2_lapse_rate,
    mean_block_elevation,
)


def test_pilot_block_has_5_to_15_panchayats(panchayats):
    assert 5 <= len(panchayats) <= 15
    assert len(panchayats) == 11


def test_geometry_and_area_weight_sanity(panchayats):
    weights = area_weights(panchayats)
    assert pytest.approx(sum(weights.values()), abs=1e-9) == 1.0
    for p in panchayats:
        assert p.area_km2 > 0
        assert p.geometry["type"] == "Polygon"
        assert len(p.geometry["coordinates"][0]) >= 4


def test_elevation_variation_is_visible(panchayats):
    zs = [p.elevation_m for p in panchayats]
    assert max(zs) - min(zs) > 200, "pilot block must show terrain variation"


def test_boundary_source_is_disclosed_and_not_official(engine):
    prov = engine.block.boundary_provenance
    assert prov["source_type"] in config.ALLOWED_SOURCE_TYPES
    assert prov["source_type"] == config.SOURCE_SIMULATED
    assert "NOT official" in engine.block.boundary_source or "schematic" in engine.block.boundary_source


def test_b1_is_block_copy(panchayats):
    out = b1_block_copy(31.2, panchayats)
    assert set(out) == {p.panchayat_id for p in panchayats}
    assert all(abs(v - 31.2) < 1e-12 for v in out.values())


def test_b2_matches_prd_equation_exactly(panchayats):
    z_bar = mean_block_elevation(panchayats)
    out = b2_lapse_rate(30.0, panchayats)
    for p in panchayats:
        expected = 30.0 - 6.5 * (p.elevation_m - z_bar) / 1000.0
        assert pytest.approx(out[p.panchayat_id], abs=1e-12) == expected


def test_b2_lapse_direction(panchayats):
    out = b2_lapse_rate(30.0, panchayats)
    highest = max(panchayats, key=lambda p: p.elevation_m)
    lowest = min(panchayats, key=lambda p: p.elevation_m)
    assert out[highest.panchayat_id] < out[lowest.panchayat_id]


def test_area_weights_reject_zero_area(panchayats):
    from dataclasses import replace

    broken = [replace(p, area_km2=0.0) for p in panchayats]
    with pytest.raises(ValueError):
        area_weights(broken)


def test_pilot_loader_returns_fresh_objects(config_default_block=None):
    # loading twice must not share mutable state with the fixture
    a, _ = boundaries.load_boundaries(config.DEFAULT_BLOCK_ID)
    b, _ = boundaries.load_boundaries(config.DEFAULT_BLOCK_ID)
    a[0].area_km2 = -1.0
    assert b[0].area_km2 > 0
