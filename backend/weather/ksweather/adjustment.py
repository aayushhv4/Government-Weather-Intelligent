"""Mean-preserving adjustment (PRD S5.P0.5).

This is a CONSISTENCY / RECONCILIATION step. It does not make the forecast more
accurate and must never be pitched as an accuracy improvement. Metrics are
computed on the pre-adjustment values; the post-adjustment consistency check is
reported separately.

PRD form (ratio variables such as rainfall):

    R*_p = R_p * B / sum(w_p * R_p),   w_p = area_p / sum(area)

Edge cases, exactly as specified:
  * denominator == 0            -> every Panchayat set to B
  * negatives clipped to 0      -> removed mass redistributed over what remains

Temperature is an interval variable in degC, so the *multiplicative* form is not
applicable to it. The analogous mean-preserving reconciliation is additive:

    T*_p = T_p + (B - sum(w_p * T_p))

Same area weights, same "weighted mean equals the Block value" guarantee, same
edge-case discipline. This choice is documented in the API `meta.adjustment`
string and in README.md; the PRD formula itself is implemented verbatim for the
variable it applies to.
"""

from __future__ import annotations

from typing import Dict, List, Sequence, Tuple


def _weighted_mean(values: Dict[str, float], weights: Dict[str, float]) -> float:
    return sum(weights[k] * values[k] for k in values)


def multiplicative_adjustment(
    values: Dict[str, float],
    weights: Dict[str, float],
    target: float,
) -> Tuple[Dict[str, float], Dict]:
    """PRD S5.P0.5 for non-negative ratio variables (rainfall)."""
    diagnostics: Dict = {
        "method": "mean-preserving, area-weighted (multiplicative)",
        "denominator": None,
        "negatives_clipped": False,
        "fallback_to_block": False,
    }

    clipped: List[str] = []
    working: Dict[str, float] = {}
    for k, v in values.items():
        if v < 0:
            clipped.append(k)
            working[k] = 0.0
        else:
            working[k] = float(v)
    diagnostics["negatives_clipped"] = bool(clipped)
    diagnostics["negatives_clipped_ids"] = sorted(clipped)

    denom = _weighted_mean(working, weights)
    diagnostics["denominator"] = round(denom, 6)

    if denom == 0:
        # Nothing to scale: every Panchayat takes the Block value.
        diagnostics["fallback_to_block"] = True
        return {k: float(target) for k in values}, diagnostics

    factor = float(target) / denom
    out: Dict[str, float] = {}
    for k, v in working.items():
        if k in clipped:
            # Clipped cells stay at the floor; the removed mass is carried by
            # the remaining cells through `factor` (mass redistribution).
            out[k] = 0.0
        else:
            out[k] = v * factor

    diagnostics["scale_factor"] = round(factor, 6)
    return out, diagnostics


def additive_mean_preserving(
    values: Dict[str, float],
    weights: Dict[str, float],
    target: float,
) -> Tuple[Dict[str, float], Dict]:
    """Mean-preserving reconciliation for temperature (degC)."""
    wmean = _weighted_mean(values, weights)
    offset = float(target) - wmean
    out = {k: float(v) + offset for k, v in values.items()}
    diagnostics = {
        "method": "mean-preserving, area-weighted (additive)",
        "offset_c": round(offset, 6),
        "fallback_to_block": False,
    }
    return out, diagnostics


def consistency_check(
    values: Dict[str, float],
    weights: Dict[str, float],
    target: float,
    tolerance: float = 1e-6,
) -> Dict:
    """Post-adjustment check: area-weighted Panchayat mean == Block value."""
    wmean = _weighted_mean(values, weights)
    diff = abs(wmean - float(target))
    return {
        "area_weighted_panchayat_mean": round(wmean, 6),
        "block_value": round(float(target), 6),
        "abs_difference": round(diff, 9),
        "tolerance": tolerance,
        "passed": bool(diff <= tolerance),
        "note": (
            "Consistency / reconciliation check only. Passing it does not "
            "imply forecast accuracy."
        ),
    }


def rainfall_residual_multiplicative(
    anomalies: Sequence[float],
) -> Dict[str, float]:
    """P1 placeholder for the PRD's single multiplicative rainfall residual model.

    `R_p,t = B_t * g(X_p,t)`. This build does not claim a validated rainfall
    model; the function exists so the P1 branch has a defined home and so the
    fallback path is explicit rather than absent.
    """
    return {str(i): 1.0 + float(a) for i, a in enumerate(anomalies)}
