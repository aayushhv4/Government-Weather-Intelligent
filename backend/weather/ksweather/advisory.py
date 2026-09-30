"""Crop advisory engine (PRD S5.P0.9, S26, S28).

Advisory logic lives here — in a backend rules layer loaded from
`data/advisory_rules.json` — and NOT inline in frontend JavaScript. The frontend
only renders what this engine returns, which is what makes the rules
explainable and changeable without touching the dashboard.

P0 is temperature / heat risk. Rainfall risk is P1 and only surfaces when the
rainfall residual model actually validates; if it does not, the heat-risk path
is the guaranteed demo (an intentional fallback, not a failure).

The engine produces a specific, localized sentence and handoff actions for
agro-meteorological decision support. It makes no unsupported
agronomic claim: thresholds are declared as configurable defaults.
"""

from __future__ import annotations

import json
from typing import Dict, Optional

from . import config


def load_rules() -> Dict:
    with open(config.ADVISORY_RULES_FILE, "r", encoding="utf-8") as fh:
        return json.load(fh)


def list_crops(rules: Optional[Dict] = None) -> list:
    rules = rules or load_rules()
    return [
        {"key": key, "label": val.get("label", key)}
        for key, val in rules.get("crops", {}).items()
    ]


def evaluate_advisory(
    *,
    panchayat_id: str,
    panchayat_name: str,
    valid_date: str,
    t_max_c: Optional[float],
    range_low_c: Optional[float],
    range_high_c: Optional[float],
    confidence: str,
    crop_key: str,
    block_id: str,
    block_name: str,
    model_version: str,
    source_type: str,
    rainfall_mm: Optional[float] = None,
    rainfall_validated: bool = False,
    rules: Optional[Dict] = None,
) -> Dict:
    """Evaluate the heat-risk (and optionally rain-risk) rule for one Panchayat."""
    rules = rules or load_rules()
    crop = rules.get("crops", {}).get(crop_key)
    if crop is None:
        return {
            "available": False,
            "reason": f"no advisory rule configured for crop '{crop_key}'",
            "configured_crops": list_crops(rules),
        }

    heat = crop.get("heat", {})
    risk_level = "none"
    matched: Optional[Dict] = None
    if t_max_c is not None:
        if "high" in heat and t_max_c >= heat["high"]["threshold_t_max_c"]:
            risk_level, matched = "high", heat["high"]
        elif "medium" in heat and t_max_c >= heat["medium"]["threshold_t_max_c"]:
            risk_level, matched = "medium", heat["medium"]

    rain_level = "none"
    rain_matched: Optional[Dict] = None
    rr = rules.get("rainfall_rules", {})
    if rainfall_validated and rainfall_mm is not None:
        if rainfall_mm >= rr.get("high", {}).get("threshold_mm", 1e9):
            rain_level, rain_matched = "high", rr["high"]
        elif rainfall_mm >= rr.get("medium", {}).get("threshold_mm", 1e9):
            rain_level, rain_matched = "medium", rr["medium"]

    primary = matched or rain_matched
    if primary is None:
        message = (
            f"{rules.get('default_risk_message')} "
            f"(forecast maximum {t_max_c} C in {panchayat_name}, {block_name})"
        )
    else:
        driver = "heat" if matched else "rainfall"
        level_word = "high" if (risk_level == "high" or rain_level == "high") else "moderate"
        message = (
            f"{crop['label']} in {panchayat_name} ({panchayat_id}): "
            f"{level_word} {driver} risk on {valid_date} "
            f"because {primary.get('trigger', 'the configured threshold was crossed')}. "
            f"Recommended action: {primary['action']}"
        )

    return {
        "available": True,
        "rule_version": rules.get("version"),
        "p0_variable": rules.get("p0_variable"),
        "panchayat_id": panchayat_id,
        "panchayat_name": panchayat_name,
        "block_id": block_id,
        "block_name": block_name,
        "valid_date": valid_date,
        "crop": crop_key,
        "crop_label": crop.get("label", crop_key),
        "risk_level": risk_level,
        "rainfall_risk_level": rain_level,
        "trigger": (primary or {}).get("trigger"),
        "threshold": (primary or {}).get("threshold_t_max_c") or (primary or {}).get("threshold_mm"),
        "action": (primary or {}).get("action"),
        "field_operation": (primary or {}).get("field_operation"),
        "message": message,
        "explainability": {
            "rule": "IF heat-risk = {level} AND crop = {crop} THEN apply configured action".format(
                level=(risk_level or "none").upper(), crop=crop_key
            ),
            "inputs": {
                "t_max_c": t_max_c,
                "range_low_c": range_low_c,
                "range_high_c": range_high_c,
                "confidence": confidence,
                "rainfall_mm": rainfall_mm if rainfall_validated else None,
                "rainfall_validated": rainfall_validated,
            },
            "note": "Feature contributions explain the estimate; they are not causal statements.",
        },
        "handoff": {
            "market": {
                "label": "Review Market",
                "page": "market",
                "hint": crop.get("market_hint", ""),
            },
            "logistics": {
                "label": "Plan Logistics",
                "page": "logisticsCompare",
                "hint": crop.get("logistics_hint", ""),
            },
            "buyer_logistics": {"label": "Cold Chain & Reefers", "page": "buyerLogistics"},
            "schedule_pickup": {"label": "Schedule Pickup", "page": "logistics"},
        },
        "rainfall_p1": {
            "implemented": True,
            "validated": rainfall_validated,
            "note": rules.get("rainfall_rules", {}).get("note"),
        },
        "provenance": {"source_type": source_type},
        "model_version": model_version,
        "disclaimer": rules.get("disclaimer"),
        "confidence": confidence,
    }
