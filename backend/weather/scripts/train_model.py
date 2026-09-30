#!/usr/bin/env python
"""Reproducible training + validation run (PRD S12, S13).

    python scripts/train_model.py [--force] [--json]

Always uses the fixed seed (42) and the fixed blocked split
(train 2015-2022 / test 2023-2024). There is no option to shuffle rows, and no
option to change the split without changing the cache signature — which is the
point: a validation run must be reproducible from the committed code alone.

Emits:
    artifacts/engine_cache.pkl          precomputed engine (fast inference)
    artifacts/model_rf_residual_temp.joblib
    artifacts/validation_results.json   metrics + git SHA + model version
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parents[1]
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from ksweather import config  # noqa: E402
from ksweather.pipeline import get_engine  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Train + validate the downscaling model")
    parser.add_argument("--force", action="store_true", help="ignore any cached artifact and retrain")
    parser.add_argument("--json", action="store_true", help="print the validation report as JSON")
    args = parser.parse_args()

    if args.force:
        for path in (
            config.ARTIFACTS_DIR / "engine_cache.pkl",
            config.MODEL_ARTIFACT,
            config.VALIDATION_ARTIFACT,
        ):
            if path.exists():
                path.unlink()
                print(f"removed {path}")

    engine = get_engine()
    engine.ensure_ready()

    report = engine.validation
    if not report.get("available"):
        print("VALIDATION UNAVAILABLE —", report.get("reason"))
        print("No metrics are reported rather than inventing numbers.")
        return 1

    if args.json:
        print(json.dumps(report, indent=2))
        return 0

    print("=" * 72)
    print("PANCHAYAT WEATHER INTELLIGENCE — DOWNSCALING VALIDATION")
    print("=" * 72)
    print(f"model version : {report['model_version']}")
    print(f"seed          : {report['seed']}   git sha: {report['git_sha']}")
    print(f"split         : {report['split']}")
    print(f"train period  : {report['train_period']}")
    print(f"test period   : {report['test_period']}")
    print(f"samples       : {report['sample_counts']}")
    print(f"reference     : {report.get('reference_dataset')}")
    print("-" * 72)
    print(f"{'baseline':<34}{'MAE':>8}{'RMSE':>8}{'bias':>9}{'skill':>9}")
    for key in ("B1_block_copy", "B2_lapse_rate", "RF_residual"):
        row = report["rows"][key]
        skill = "" if row["skill_vs_b1"] is None else f"{row['skill_vs_b1']:.4f}"
        print(f"{row['label']:<34}{row['mae']:>8.4f}{row['rmse']:>8.4f}{row['bias']:>9.4f}{skill:>9}")
    print("-" * 72)
    lopo = report["lopo"]
    print(f"LOPO CV       : mean MAE {lopo.get('mean_mae')}  std {lopo.get('std_mae')}  "
          f"mean skill {lopo.get('mean_skill_vs_b1')}  stable={report['lopo_stable']}")
    cc = report["consistency_check"]
    print(f"consistency   : passed={cc['passed']}  max|diff|={cc['max_abs_difference']}  "
          f"days={cc['days_checked']}")
    tb = report["track_b"]
    print(f"Track B       : {'available' if tb['available'] else tb['message']}")
    print("-" * 72)
    print(report["disclaimer"])
    print(f"Uncertainty   : {config.DISCLAIMER_UNCALIBRATED}")
    print(f"Reference     : {report.get('reference_dataset_note')}")
    print("=" * 72)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
