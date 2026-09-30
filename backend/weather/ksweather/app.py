"""FastAPI application (PRD S7, S8, S17).

Endpoints
---------
GET  /health                     liveness + readiness
GET  /weather/pilot              pilot block, Panchayats, boundary provenance
POST /weather/downscale          the PRD contract endpoint
POST /weather/downscale/csv      same, text/csv body
GET  /weather/demo-forecast      labelled seeded demo forecast (simulated_demo)
GET  /weather/validation         Track A + Track B report (code-generated)
GET  /weather/validation/rainfall P1 rainfall report (separate, never gating)
GET  /weather/advisory           localized heat-risk advisory + hand-off
GET  /weather/advisory-rules     the configurable rules layer
GET  /weather/provenance         adapter status, licenses, disclaimers

Error policy (PRD S8)
---------------------
422  invalid block / invalid forecast payload
200  with seeded fallback when the model or features are unavailable —
     `source_type` then reports `simulated_demo` and provenance is disclosed
503  only when even the seeded fallback cannot run
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import config
from .advisory import evaluate_advisory, list_crops, load_rules
from .adapters.seeded import demo_forecast_dates
from .pipeline import get_engine
from .provenance import Provenance
from .schemas import AdvisoryRequest, DownscaleRequest, ForecastDayIn, parse_forecast_csv

logger = logging.getLogger("ksweather")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Train/cache once so the judge never waits for a model fit (PRD S19)."""
    try:
        get_engine().ensure_ready()
        logger.info("weather engine warmed up")
    except Exception as exc:  # startup diagnostics only
        logger.exception("weather engine warm-up failed: %s", exc)
    yield


app = FastAPI(
    title="Panchayat Weather Intelligence API",
    version="0.3.0",
    description=(
        "Block-to-Panchayat weather downscaling for SIH26074 (Localized Agro-Meteorological Decision Support). "
        "build is a hindcast reconstruction and must not be read as operational "
        "forecast skill."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS or ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# health
# ---------------------------------------------------------------------------
@app.get("/health")
def health() -> Dict:
    engine = get_engine()
    ready = engine._ready  # readiness flag; engine is built lazily
    return {
        "status": "healthy",
        "service": "ksweather",
        "model_version": config.MODEL_VERSION,
        "ready": bool(ready),
        "seed": config.RANDOM_SEED,
        "source_type_default": config.SOURCE_SIMULATED,
        "note": "Hindcast-validation build. Not an operational forecast service.",
    }


# ---------------------------------------------------------------------------
# reads
# ---------------------------------------------------------------------------
@app.get("/weather/pilot")
def pilot() -> Dict:
    engine = get_engine()
    engine.ensure_ready()
    return engine.pilot_payload()


@app.get("/weather/provenance")
def provenance() -> Dict:
    engine = get_engine()
    engine.ensure_ready()
    return engine.provenance_payload()


@app.get("/weather/advisory-rules")
def advisory_rules() -> Dict:
    rules = load_rules()
    return {
        "version": rules.get("version"),
        "disclaimer": rules.get("disclaimer"),
        "crops": list_crops(rules),
        "p0_variable": rules.get("p0_variable"),
        "p1_variable": rules.get("p1_variable"),
        "alert_prefix": rules.get("alert_prefix"),
        "default_risk_message": rules.get("default_risk_message"),
        "rainfall_rules": rules.get("rainfall_rules"),
        # `raw` lets the front-end evaluate the SAME rules object when the
        # service is unreachable. Thresholds and actions still come from this
        # configuration file — no agronomic logic is written into the UI.
        "raw": rules,
    }


@app.get("/weather/validation")
def validation() -> Dict:
    engine = get_engine()
    engine.ensure_ready()
    report = engine.validation
    if not report or not report.get("available"):
        return JSONResponse(status_code=200, content={
            "available": False,
            "reason": (report or {}).get("reason", "validation unavailable"),
            "disclaimer": config.DISCLAIMER_HINDCAST,
            "message": "Validation unavailable — no metrics are shown rather than inventing numbers.",
        })
    return report


@app.get("/weather/validation/rainfall")
def rainfall_validation() -> Dict:
    engine = get_engine()
    engine.ensure_ready()
    report = engine.rainfall_validation or {}
    report.setdefault("p1", True)
    return report


# ---------------------------------------------------------------------------
# coarse forecast (demo / adapter)
# ---------------------------------------------------------------------------
@app.get("/weather/demo-forecast")
def demo_forecast(
    block_id: str = Query(default=config.DEFAULT_BLOCK_ID),
    days: int = Query(default=3, ge=1, le=config.MAX_FORECAST_DAYS),
) -> Dict:
    """The seeded illustrative forecast, visibly labelled simulated_demo."""
    engine = get_engine()
    from .adapters import registry

    adapter = registry.select_forecast_adapter()
    dates = demo_forecast_dates(days)
    result = adapter.block_forecast(block_id, dates)
    if not result.ok:
        raise HTTPException(status_code=503, detail="even the seeded fallback is unavailable")
    prov: Provenance = result.provenance
    return {
        "block_id": block_id,
        "source_type": prov.source_type,
        "provenance": prov.as_dict(),
        "disclaimer": config.DISCLAIMER_DEMO_DATA,
        "days": [d.as_dict() for d in result.data.days],
        "note": "Illustrative demo data — not an official IMD forecast.",
    }


# ---------------------------------------------------------------------------
# the contract endpoint
# ---------------------------------------------------------------------------
def _run_downscale(body: DownscaleRequest) -> Dict:
    engine = get_engine()
    try:
        try:
            days = body.resolved_days()
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        engine.ensure_ready(body.block_id)
    except HTTPException:
        raise
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    day_dicts = [
        {
            "date": d.date,
            "t_max_c": d.t_max_c,
            "t_min_c": d.t_min_c,
            "rainfall_mm": d.rainfall_mm,
            "lead_days": d.lead_days,
        }
        for d in days
    ]
    try:
        return engine.downscale(body.block_id, day_dicts, source_type=body.source_type)
    except KeyError as exc:
        # unknown block -> invalid payload, not a degradation case
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # pragma: no cover - final safety net
        logger.exception("downscale failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="downscaling service unavailable and the seeded fallback could not run",
        )


@app.post("/weather/downscale")
def downscale(body: DownscaleRequest) -> Dict:
    return _run_downscale(body)


@app.post("/weather/downscale/csv")
async def downscale_csv(request: Request, block_id: str = Query(...)) -> Dict:
    raw = await request.body()
    if len(raw) > config.MAX_CSV_BYTES:
        raise HTTPException(status_code=422, detail="CSV payload exceeds the size limit")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=422, detail="CSV payload must be UTF-8")
    try:
        days: List[ForecastDayIn] = parse_forecast_csv(text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return _run_downscale(DownscaleRequest(block_id=block_id, forecast=days))


# ---------------------------------------------------------------------------
# advisory
# ---------------------------------------------------------------------------
@app.get("/weather/advisory")
def advisory(
    block_id: str = Query(default=config.DEFAULT_BLOCK_ID),
    panchayat_id: str = Query(...),
    crop: str = Query(...),
    date: str | None = Query(default=None),
) -> Dict:
    """Localized heat-risk advisory for one Panchayat, with a Market/Logistics hand-off."""
    engine = get_engine()
    engine.ensure_ready(block_id)
    if not any(p.panchayat_id == panchayat_id for p in engine.panchayats):
        raise HTTPException(status_code=422, detail=f"unknown panchayat_id for block {block_id}")

    return _advisory_from_forecast(engine, block_id, panchayat_id, crop, date)


def _advisory_from_forecast(engine, block_id: str, panchayat_id: str, crop: str, date: Optional[str]) -> Dict:
    from .adapters import registry

    target_date = date or demo_forecast_dates(1)[0]
    adapter = registry.select_forecast_adapter()
    fc = adapter.block_forecast(block_id, [target_date])
    if not fc.ok:
        raise HTTPException(status_code=503, detail="seeded fallback unavailable")
    day = fc.data.days[0]
    result = engine.downscale(
        block_id,
        [{"date": day.date, "t_max_c": day.t_max_c, "rainfall_mm": day.rainfall_mm, "lead_days": day.lead_days}],
    )
    feature = next(
        (f for f in result["features"] if f["properties"]["panchayat_id"] == panchayat_id),
        None,
    )
    if feature is None:
        raise HTTPException(status_code=422, detail="panchayat not present in downscaled output")
    props = feature["properties"]
    p = next(q for q in engine.panchayats if q.panchayat_id == panchayat_id)
    result_advisory = evaluate_advisory(
        panchayat_id=panchayat_id,
        panchayat_name=p.name,
        valid_date=props["valid_date"],
        t_max_c=props["t_max_c"],
        range_low_c=props["range_low_c"],
        range_high_c=props["range_high_c"],
        confidence=props["confidence"],
        crop_key=crop,
        block_id=block_id,
        block_name=engine.block.name if engine.block else block_id,
        model_version=config.MODEL_VERSION,
        source_type=result["meta"]["source_type"],
        rainfall_mm=props.get("rainfall_mm"),
        rainfall_validated=bool((engine.rainfall_validation or {}).get("validated")),
    )
    try:  # optional Supabase persistence (PRD S9) — never affects the response
        from .persistence import get_writer

        get_writer().insert_advisory(result_advisory)
    except Exception as exc:  # pragma: no cover - best-effort
        logger.info("advisory persistence skipped: %s", exc)
    return result_advisory


@app.post("/weather/advisory")
def advisory_post(body: AdvisoryRequest) -> Dict:
    engine = get_engine()
    engine.ensure_ready(body.block_id)
    return _advisory_from_forecast(engine, body.block_id, body.panchayat_id, body.crop, body.valid_date)
