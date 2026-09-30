"""API schemas (PRD S7 contract, S8 error behaviour, S18 input validation).

The request/response shapes here are the canonical PRD contract. The request
accepts JSON (primary) and CSV (convenience) block forecasts; the response is
always the FeatureCollection with `meta` + per-Panchayat `properties`.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from . import config


class ForecastDayIn(BaseModel):
    date: str = Field(..., description="ISO date, e.g. 2026-01-10")
    t_max_c: float = Field(..., ge=-20.0, le=60.0)
    t_min_c: Optional[float] = Field(default=None, ge=-30.0, le=50.0)
    rainfall_mm: Optional[float] = Field(default=None, ge=0.0, le=2000.0)
    lead_days: int = Field(default=1, ge=0, le=30)

    @field_validator("date")
    @classmethod
    def _iso_date(cls, v: str) -> str:
        from datetime import date as _date

        try:
            _date.fromisoformat(v)
        except ValueError as exc:
            raise ValueError(f"date must be ISO YYYY-MM-DD, got {v!r}") from exc
        return v


class DownscaleRequest(BaseModel):
    block_id: str = Field(..., description="LGD block id, e.g. LGD-271012")
    forecast: List[ForecastDayIn] = Field(default_factory=list)
    forecast_csv: Optional[str] = Field(
        default=None,
        description="Alternative to `forecast`: CSV with header date,t_max_c[,t_min_c,rainfall_mm]",
    )
    source_type: Optional[str] = Field(
        default=None,
        description="Requested provenance. Never used to *upgrade* provenance.",
    )

    @field_validator("block_id")
    @classmethod
    def _block_id_shape(cls, v: str) -> str:
        import re

        if not re.match(config.BLOCK_ID_PATTERN, v or ""):
            raise ValueError("block_id must look like LGD-271012")
        return v

    @field_validator("source_type")
    @classmethod
    def _source_type_allowed(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in config.ALLOWED_SOURCE_TYPES:
            raise ValueError(
                f"source_type must be one of {list(config.ALLOWED_SOURCE_TYPES)}"
            )
        return v

    def resolved_days(self) -> List[ForecastDayIn]:
        days = list(self.forecast)
        if not days and self.forecast_csv:
            days = parse_forecast_csv(self.forecast_csv)
        if not days:
            raise ValueError("provide either `forecast` or `forecast_csv`")
        if len(days) > config.MAX_FORECAST_DAYS:
            raise ValueError(
                f"at most {config.MAX_FORECAST_DAYS} forecast days are accepted per request"
            )
        return days


class AdvisoryRequest(BaseModel):
    block_id: str
    panchayat_id: str
    crop: str
    valid_date: Optional[str] = None


def parse_forecast_csv(text: str) -> List[ForecastDayIn]:
    """Parse the convenience CSV form. Header required, unknown columns ignored."""
    if len(text.encode("utf-8")) > config.MAX_CSV_BYTES:
        raise ValueError("forecast_csv exceeds the size limit")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if len(lines) < 2:
        raise ValueError("forecast_csv must contain a header and at least one row")
    header = [h.strip().lower() for h in lines[0].split(",")]
    if "date" not in header or "t_max_c" not in header:
        raise ValueError("forecast_csv header must include date and t_max_c")
    out: List[ForecastDayIn] = []
    for row in lines[1:]:
        cells = [c.strip() for c in row.split(",")]
        if len(cells) != len(header):
            raise ValueError(f"forecast_csv row has {len(cells)} cells, header has {len(header)}")
        rec = dict(zip(header, cells))
        out.append(
            ForecastDayIn(
                date=rec["date"],
                t_max_c=float(rec["t_max_c"]),
                t_min_c=float(rec["t_min_c"]) if rec.get("t_min_c") not in (None, "") else None,
                rainfall_mm=float(rec["rainfall_mm"]) if rec.get("rainfall_mm") not in (None, "") else None,
                lead_days=int(rec["lead_days"]) if rec.get("lead_days") not in (None, "") else 1,
            )
        )
    return out
