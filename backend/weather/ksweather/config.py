"""Central configuration for the weather downscaling service.

Every number that affects reproducibility lives here (PRD S13):
  * fixed random seed 42
  * fixed split dates (train 2015-2022, test 2023-2024)
  * versioned model string
  * pilot block id

Nothing here should be edited to make results look better. If the split or the
seed changes, the persisted validation run must change with it.
"""

from __future__ import annotations

import os
from pathlib import Path

# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------
PACKAGE_DIR = Path(__file__).resolve().parent
SERVICE_DIR = PACKAGE_DIR.parent
# Fixtures ship inside the package so the service is self-contained; generated
# artifacts live outside it so a rebuild never rewrites source data.
DATA_DIR = PACKAGE_DIR / "data"
ARTIFACTS_DIR = SERVICE_DIR / "artifacts"

PILOT_BLOCK_FILE = DATA_DIR / "pilot_block.json"
BOUNDARIES_DIR = DATA_DIR / "boundaries"
HINDCAST_FILE = DATA_DIR / "hindcast_staged.json"
MODEL_ARTIFACT = ARTIFACTS_DIR / "model_rf_residual_temp.joblib"
VALIDATION_ARTIFACT = ARTIFACTS_DIR / "validation_results.json"
ADVISORY_RULES_FILE = DATA_DIR / "advisory_rules.json"

# --------------------------------------------------------------------------
# Reproducibility
# --------------------------------------------------------------------------
RANDOM_SEED = 42
MODEL_VERSION = "rf-residual-temp-v0.3"

TRAIN_START = "2015-01-01"
TRAIN_END = "2022-12-31"
TEST_START = "2023-01-01"
TEST_END = "2024-12-31"

# PRD S7 core math: T_p = B_t - 6.5 degC/km * (z_p - zbar_block) / 1000
LAPSE_RATE_C_PER_KM = 6.5

# --------------------------------------------------------------------------
# Pilot block (PRD S22). CHOSEN PER THE PRD'S OWN CRITERIA, documented in
# data/pilot_block.json -> `selection_rationale`. The id below is the example
# id used in the PRD API contract (LGD-271012); we adopt it so the contract and
# the implementation agree, and we document exactly why the area fits.
# --------------------------------------------------------------------------
DEFAULT_BLOCK_ID = "LGD-271012"

# --------------------------------------------------------------------------
# Provenance vocabulary (PRD S10). These three strings are the ONLY allowed
# values for `source_type`. Never blur them.
# --------------------------------------------------------------------------
SOURCE_OFFICIAL = "official"
SOURCE_HISTORICAL = "historical_reference"
SOURCE_SIMULATED = "simulated_demo"
ALLOWED_SOURCE_TYPES = (SOURCE_OFFICIAL, SOURCE_HISTORICAL, SOURCE_SIMULATED)

# Mandatory disclaimer strings (PRD S5.P0.6, S15). The UI must show these.
DISCLAIMER_HINDCAST = "Reanalysis hindcast validation — not operational forecast skill."
DISCLAIMER_UNCALIBRATED = "Indicative — uncalibrated"
DISCLAIMER_DEMO_DATA = "Illustrative demo data"
DISCLAIMER_HISTORICAL_REF = "Historical reference"
DISCLAIMER_TRACK_B_ABSENT = (
    "Track B unavailable — no suitable station observations configured."
)

# --------------------------------------------------------------------------
# Runtime / deployment
# --------------------------------------------------------------------------
# Comma-separated list of allowed browser origins. "*" is only appropriate for
# a demo; production should list the Vercel domain explicitly.
CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get("WEATHER_CORS_ORIGINS", "*").split(",")
    if o.strip()
]

# Optional Supabase persistence (service-role key is server-side only, PRD S18).
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

# Guards (PRD S18: reasonable request limits, safe geographic identifiers)
MAX_FORECAST_DAYS = 14
MAX_CSV_BYTES = 64 * 1024
BLOCK_ID_PATTERN = r"^LGD-[0-9]{4,8}$"
