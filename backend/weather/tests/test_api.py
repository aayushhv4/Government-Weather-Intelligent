"""API contract tests (PRD S7, S8, S17)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from ksweather import config
from ksweather.app import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


BLOCK = config.DEFAULT_BLOCK_ID


def _payload(days=2):
    return {
        "block_id": BLOCK,
        "forecast": [
            {"date": "2026-01-10", "t_max_c": 31.2, "t_min_c": 18.4, "rainfall_mm": 12.5, "lead_days": 1},
            {"date": "2026-01-11", "t_max_c": 33.6, "t_min_c": 19.1, "rainfall_mm": 4.0, "lead_days": 2},
        ][:days],
    }


# -- health ---------------------------------------------------------------
def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "healthy"
    assert body["model_version"] == config.MODEL_VERSION


# -- pilot ----------------------------------------------------------------
def test_pilot_endpoint(client):
    r = client.get("/weather/pilot")
    assert r.status_code == 200
    body = r.json()
    assert body["block"]["block_id"] == BLOCK
    assert 5 <= len(body["panchayats"]) <= 15
    assert abs(sum(p["area_weight"] for p in body["panchayats"]) - 1.0) < 1e-6
    assert body["block"]["boundary_provenance"]["source_type"] in config.ALLOWED_SOURCE_TYPES


# -- downscale contract ---------------------------------------------------
def test_downscale_happy_path_matches_contract(client):
    r = client.post("/weather/downscale", json=_payload())
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "FeatureCollection"
    meta = body["meta"]
    for key in (
        "model_version", "boundary_source", "source_type", "adjustment",
        "validation", "issued_at", "generated_at",
    ):
        assert key in meta
    assert meta["validation"]["disclaimer"] == config.DISCLAIMER_HINDCAST
    assert meta["source_type"] == config.SOURCE_SIMULATED

    feats = body["features"]
    assert len(feats) >= 5 * 2  # >=5 panchayats for each of 2 days
    required = {
        "panchayat_id", "valid_date", "lead_days", "t_max_c",
        "range_low_c", "range_high_c", "confidence", "top_features",
    }
    for f in feats:
        props = f["properties"]
        assert required.issubset(props.keys())
        assert f["geometry"]["type"] == "Polygon"
        assert 1 <= len(props["top_features"]) <= 3
        assert props["confidence"] in ("low", "medium", "high")


def test_downscaled_values_differ_across_panchayats(client):
    body = client.post("/weather/downscale", json=_payload(1)).json()
    values = {f["properties"]["t_max_c"] for f in body["features"]}
    assert len(values) >= 5, "downscaling must produce differentiated values"


def test_consistency_check_reported_in_meta(client):
    body = client.post("/weather/downscale", json=_payload(2)).json()
    checks = body["meta"]["consistency_check"]
    assert len(checks) == 2
    for c in checks:
        assert c["passed"] is True


# -- validation -----------------------------------------------------------
def test_validation_endpoint(client):
    r = client.get("/weather/validation")
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is True
    assert body["rows"]["RF_residual"]["mae"] is not None


def test_rainfall_validation_endpoint_is_p1(client):
    r = client.get("/weather/validation/rainfall")
    assert r.status_code == 200
    assert r.json().get("p1") is True


def test_provenance_endpoint_discloses_everything(client):
    r = client.get("/weather/provenance")
    assert r.status_code == 200
    body = r.json()
    assert body["disclaimers"]["hindcast"] == config.DISCLAIMER_HINDCAST
    assert body["disclaimers"]["track_b_absent"] == config.DISCLAIMER_TRACK_B_ABSENT
    assert any(s["name"] == "era5land" for s in body["adapters"])
    assert body["reproducibility"]["seed"] == config.RANDOM_SEED


def test_advisory_rules_endpoint(client):
    body = client.get("/weather/advisory-rules").json()
    assert body["crops"]
    assert body["p0_variable"] == "temperature_heat_risk"


# -- errors ---------------------------------------------------------------
def test_missing_forecast_is_422(client):
    r = client.post("/weather/downscale", json={"block_id": BLOCK})
    assert r.status_code == 422


def test_invalid_block_id_shape_is_422(client):
    r = client.post("/weather/downscale", json={"block_id": "271012", "forecast": _payload()["forecast"]})
    assert r.status_code == 422


def test_unknown_block_is_422(client):
    r = client.post("/weather/downscale", json={"block_id": "LGD-999999", "forecast": _payload()["forecast"]})
    assert r.status_code == 422


def test_bad_date_is_422(client):
    r = client.post("/weather/downscale", json={
        "block_id": BLOCK,
        "forecast": [{"date": "10-01-2026", "t_max_c": 31.0}],
    })
    assert r.status_code == 422


def test_out_of_range_temperature_is_422(client):
    r = client.post("/weather/downscale", json={
        "block_id": BLOCK,
        "forecast": [{"date": "2026-01-10", "t_max_c": 900.0}],
    })
    assert r.status_code == 422


def test_too_many_days_is_422(client):
    days = [{"date": f"2026-01-{10+i:02d}", "t_max_c": 31.0} for i in range(config.MAX_FORECAST_DAYS + 3)]
    r = client.post("/weather/downscale", json={"block_id": BLOCK, "forecast": days})
    assert r.status_code == 422


def test_unknown_panchayat_advisory_is_422(client):
    r = client.get("/weather/advisory", params={"block_id": BLOCK, "panchayat_id": "LGD-000000", "crop": "tomato"})
    assert r.status_code == 422


def test_invalid_source_type_is_422(client):
    r = client.post("/weather/downscale", json={**_payload(1), "source_type": "definitely_official"})
    assert r.status_code == 422


# -- csv + demo -----------------------------------------------------------
def test_csv_endpoint(client):
    csv = "date,t_max_c,t_min_c,rainfall_mm\n2026-01-10,31.2,18.4,12.5\n2026-01-11,33.6,19.1,4.0\n"
    r = client.post("/weather/downscale/csv", params={"block_id": BLOCK}, content=csv,
                    headers={"content-type": "text/csv"})
    assert r.status_code == 200
    assert len(r.json()["features"]) >= 10


def test_csv_forecast_csv_field(client):
    body = {"block_id": BLOCK, "forecast_csv": "date,t_max_c\n2026-01-10,31.2\n"}
    r = client.post("/weather/downscale", json=body)
    assert r.status_code == 200


def test_bad_csv_is_422(client):
    r = client.post("/weather/downscale/csv", params={"block_id": BLOCK},
                    content="nonsense", headers={"content-type": "text/csv"})
    assert r.status_code == 422


def test_demo_forecast_is_labelled(client):
    body = client.get("/weather/demo-forecast").json()
    assert body["source_type"] == config.SOURCE_SIMULATED
    assert body["disclaimer"] == config.DISCLAIMER_DEMO_DATA
    assert "not an official IMD forecast" in body["note"]


# -- advisory -------------------------------------------------------------
def test_advisory_returns_action_and_handoff(client):
    pid = client.get("/weather/pilot").json()["panchayats"][0]["panchayat_id"]
    r = client.get("/weather/advisory", params={"block_id": BLOCK, "panchayat_id": pid, "crop": "tomato"})
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is True
    assert body["handoff"]["market"]["page"] == "market"
    assert body["handoff"]["logistics"]["page"] == "logisticsCompare"


def test_unknown_crop_is_reported_not_crashed(client):
    pid = client.get("/weather/pilot").json()["panchayats"][0]["panchayat_id"]
    body = client.get("/weather/advisory", params={"block_id": BLOCK, "panchayat_id": pid, "crop": "dragonfruit"}).json()
    assert body["available"] is False
    assert body["configured_crops"]
