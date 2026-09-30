"""Shared fixtures. The engine is built once per test session."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

SERVICE_DIR = Path(__file__).resolve().parents[1]
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from ksweather.pipeline import get_engine  # noqa: E402


@pytest.fixture(scope="session")
def engine():
    eng = get_engine()
    eng.ensure_ready()
    return eng


@pytest.fixture(scope="session")
def panchayats(engine):
    return engine.panchayats


@pytest.fixture(scope="session")
def block_id(engine):
    return engine.block_id


@pytest.fixture(scope="session")
def demo_day():
    return {"date": "2026-01-10", "t_max_c": 31.2, "t_min_c": 18.4, "rainfall_mm": 12.5, "lead_days": 1}
