# Panchayat Weather Intelligence — Scientific Downscaling Backend (SIH26074)

A block-to-Panchayat downscaling service for localized agro-meteorological decision
support. It turns a coarse Block-level temperature forecast into Panchayat-level
estimates, attaches an indicative (explicitly **uncalibrated**) range, validates the
result against two named baselines on a blocked temporal holdout, and converts the
output into a localized heat-risk crop advisory and action chain.

This is the standalone computational engine powering the Panchayat Weather Intelligence platform.

---

## 1. Read this before you quote a number

This build is **scientifically limited on purpose**, and the limits are surfaced in
the API and the UI rather than hidden:

| Claim | Status in this build |
|---|---|
| Live IMD forecast ingestion | **Not implemented.** No official feed exists for this build. |
| Coarse input | **Seeded illustrative fixture** (`source_type: "simulated_demo"`) |
| Fine reference (Track A) | **Staged deterministic synthetic hindcast**, standing in for ERA5-Land / CHIRPS |
| Validation type | **Hindcast reconstruction**, not operational forecast skill |
| Track B (IMD AWS/ARG holdout) | **Unavailable** — no station observations configured |
| Uncertainty | **Indicative / uncalibrated** empirical residual quantiles |
| Panchayat boundaries | **Schematic pilot grid**, NOT official and NOT community-mapped |
| Rainfall | **P1, not validated** — the temperature/heat path is the guaranteed demo |

Every metric shown anywhere in the product is produced by code from arrays. Nothing
is typed in. Because the reference dataset is a staged synthetic fixture, the
metrics demonstrate that the **pipeline** is correct and that the model genuinely
participates in the calculation — they do **not** establish real-world skill, and
the UI says so on the validation screen.

Replacing the fixtures with real data requires no change to the model, the API or
the frontend — only new files under `ksweather/data/` (see §6).

---

## 2. The pipeline

```
Block forecast
  → geospatial feature extraction          (elevation, slope/aspect, lat/lon, land cover, NDVI, historical anomaly)
  → named baselines B1 / B2
  → temperature Random Forest residual correction
  → mean-preserving, area-weighted adjustment
  → indicative uncertainty (P10–P90, uncalibrated)
  → Panchayat forecast
  → heat-risk crop advisory
  → decision support / localized action chain
```

Core math, implemented verbatim:

* **B1 — Block copy:** every Panchayat receives the Block value.
* **B2 — Elevation lapse-rate:** `T_p = B_t − 6.5 °C/km · (z_p − z̄_block) / 1000`
* **Model:** `T_p,t = B_t + f_T(X_p) + e_p,t`, where `f_T` is a Random Forest
  trained on the local anomaly `(reference − block)` with seed 42.
* **Adjustment (PRD form):** `R*_p = R_p · B / Σ(w_p·R_p)` with `w_p = area_p / Σarea`.
  * denominator `0` → every Panchayat set to `B`
  * negatives clipped to `0`, removed mass redistributed over the remainder
  * metrics computed **pre-adjustment**; the consistency check reported **post**
* **Skill:** `1 − MAE_model / MAE_B1`
* **Validation split:** blocked temporal, train **2015-01-01 → 2022-12-31**,
  test **2023-01-01 → 2024-12-31**. Random row splits are prohibited and no
  shuffling helper exists anywhere in the codebase.
* **LOPO CV:** leave-one-Panchayat-out, reported as *indicative* (11 Panchayats is
  a tiny spatial sample).

### Temperature vs rainfall and the adjustment formula

The PRD's adjustment is **multiplicative**, which is correct for a ratio variable
such as rainfall. Temperature is an interval variable in °C, so a multiplicative
factor would be dimensionally meaningless. The implementation therefore:

* applies the PRD formula **verbatim** to rainfall (`adjustment.multiplicative_adjustment`), and
* applies the analogous mean-preserving **additive** reconciliation to temperature
  (`adjustment.additive_mean_preserving`), with the same area weights, the same
  "weighted mean equals the Block value" guarantee and the same edge-case discipline.

Both are described as **consistency / reconciliation**, never as an accuracy gain.
This is declared in `meta.adjustment` on every response.

---

## 3. Run it

```bash
cd "backend/weather"

# one-time environment
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# build artifacts once (≈1 min, deterministic), then it loads in milliseconds
python scripts/train_model.py

# serve
python -m uvicorn ksweather.app:app --host 0.0.0.0 --port 8088
```

The app warms up on startup. If `artifacts/engine_cache.pkl` matches the current
model version, seed, block and split dates, startup is effectively instant; if it
is missing or stale it rebuilds automatically once and re-caches.

```bash
# tests
python -m pytest tests -q            # 86 tests

# validation report
python scripts/train_model.py --json
```

## 4. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | liveness + readiness + model version |
| `GET` | `/weather/pilot` | pilot block, Panchayats, area weights, boundary provenance |
| `POST` | `/weather/downscale` | the PRD contract endpoint (JSON body) |
| `POST` | `/weather/downscale/csv` | same, with a `text/csv` body |
| `GET` | `/weather/demo-forecast` | labelled seeded demo forecast (`simulated_demo`) |
| `GET` | `/weather/validation` | Track A + Track B report, code-generated |
| `GET` | `/weather/validation/rainfall` | P1 rainfall report (separate; never gates temperature) |
| `GET` | `/weather/advisory` | localized heat-risk advisory + Market/Logistics hand-off |
| `GET` | `/weather/advisory-rules` | the configurable rules layer |
| `GET` | `/weather/provenance` | adapter status, licences, disclaimers, reproducibility |

Request:

```json
{
  "block_id": "LGD-271012",
  "forecast": [
    { "date": "2026-01-10", "t_max_c": 31.2, "t_min_c": 18.4, "rainfall_mm": 12.5 }
  ]
}
```

`forecast_csv` is accepted as an alternative to `forecast`. At most 14 days per
request; dates must be ISO `YYYY-MM-DD`; temperatures are range-checked.

### Error and fallback policy

| Situation | Behaviour |
|---|---|
| Invalid block / bad date / bad numbers / too many days | **422** |
| Model or feature data unavailable | **200**, baseline (B1/B2) output, `confidence: "low"` |
| Live model/boundaries unavailable | **200** with seeded fallback, `source_type: "simulated_demo"` |
| Even the seeded fallback missing | **503** |

**Provenance never changes because of a fallback.** The response reports the
*weakest* link in the chain (`pipeline.WeatherEngine._weakest_source_type`), so
simulated data can never inherit an `official` badge.

---

## 5. Layout

```
backend/weather/
├── ksweather/
│   ├── config.py            seed, split dates, model version, host config, limits
│   ├── provenance.py        the only place that decides source_type strings
│   ├── canonical.py         adapter-facing dataclasses (provider-agnostic)
│   ├── features.py          feature engineering + importance grouping
│   ├── baselines.py         B1 and B2, executable
│   ├── model.py             RF residual model, metrics, skill
│   ├── adjustment.py        mean-preserving adjustment + edge cases
│   ├── uncertainty.py       P10–P90 quantiles, confidence mapping
│   ├── validation.py        Track A (blocked split + LOPO), Track B, P1 rainfall
│   ├── advisory.py          rules-layer advisory engine
│   ├── pipeline.py          the downscaling engine + artifact cache
│   ├── persistence.py       Supabase writer (service role, best-effort)
│   ├── schemas.py           request validation
│   ├── app.py               FastAPI routes
│   ├── data/                committed fixtures (pilot block, advisory rules)
│   └── adapters/            data providers — see §6
├── scripts/train_model.py   reproducible training + validation run
├── tests/                   86 tests
├── requirements.txt         pinned core deps
├── requirements-geo.txt     optional geospatial extras (real raster ingest)
└── artifacts/               generated: engine cache, model, validation results
```

## 6. Wiring in real data (no code change required)

| File to stage | Effect |
|---|---|
| `ksweather/data/boundaries/LGD-271012.geojson` (+ `.meta.json`) | switches boundaries from schematic to community/official, with the declared source and licence |
| `ksweather/data/era5land/LGD-271012/{meta,block_tmax_daily,panchayat_tmax_daily}.json` | switches Track A reference from `simulated_demo` to `historical_reference` (ERA5-Land) |
| `ksweather/data/stations/LGD-271012.json` | enables **Track B**; the UI then reports station counts instead of "Track B unavailable" |
| `ksweather/data/hindcast_staged.json` | replaces the generated hindcast with a staged fixture |

`GET /weather/provenance` reports which adapters are live, so the product can never
quietly claim a source it is not actually using.

Licences (disclosed in the UI footer and `docs/WEATHER_INTELLIGENCE.md`):
ERA5-Land — Copernicus C3S licence (attribution); CHIRPS — public domain;
MODIS NDVI/land cover — NASA open licence; India Geodata — CC0-1.0;
DataMeet — ODbL; the schematic pilot grid — generated placeholder, no third-party data.

---

## 7. Environment variables

| Variable | Purpose |
|---|---|
| `WEATHER_CORS_ORIGINS` | comma-separated allowed browser origins (default `*`; set the Vercel domain in production) |
| `SUPABASE_URL` | Supabase project URL — enables persistence |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-side only.** Never shipped to a browser. |

No secret is ever read from the frontend, and the service-role key is never placed
in any file under `frontend/`.

---

## 8. Reproducibility

* random seed **42**, fixed everywhere (`config.RANDOM_SEED`)
* fixed blocked split, train 2015–2022 / test 2023–2024
* versioned model string `rf-residual-temp-v0.3`
* single-threaded forest training so runs are bit-identical across machines
* pinned dependencies in `requirements.txt`
* `validation_runs` rows carry `git_sha` + `model_version` + `seed`
* the artifact cache is keyed by model version + seed + block + split dates, so a
  change to any of those forces a fresh validation run rather than silently
  serving stale metrics
