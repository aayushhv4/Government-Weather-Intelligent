# Krishi Setu — Panchayat Weather Intelligence (SIH26074)

Operator + judge documentation for the downscaling module. The engineering
contract lives in `backend/weather/README.md`; this file covers deployment,
environment, licences and exactly what may and may not be claimed.

---

## 1. What this adds to Krishi Setu

A new **decision layer** inside the existing dashboard, not a separate product:

```
Farmer → Location → Block → Panchayat → downscaling → weather intelligence
       → risk detection → crop advisory → Market / Logistics action
```

* Sidebar entry: **WEATHER INTELLIGENCE → Panchayat Weather** (visible to
  Farmer and Buyer; hidden for Supervisor, matching the existing role gates).
* A five-step judge flow: pilot block + coarse forecast → Downscale → map →
  validation → advisory + hand-off.
* Hand-off buttons navigate to **existing** pages (`market`,
  `logisticsCompare`, `logistics`, `buyerLogistics`, `buyerRfq`). No parallel
  workflow was invented.
* Advisory thresholds/actions live in `backend/weather/ksweather/data/advisory_rules.json`
  — a configuration/rules layer, never inline in the frontend.

## 2. Deployment architecture

The existing site stays exactly as it is: Vercel serves the static frontend from
Root Directory `Krishi Setu` with `vercel.json` (8 redirects / 38 compiled
routes). **No existing route, root directory, framework, build command or output
directory was changed.**

The Python service is a separate container because the frontend has no build step
and scikit-learn does not belong in a static deploy.

```
Browser ──► Vercel  (static: public site + dashboard)  ──┐
                                                         │  fetch()
                                                         ▼
                            Krishi Setu Weather Intelligence API
                            FastAPI + scikit-learn (Docker)
                            /health · /weather/*        ──►  Supabase Postgres
                                                             (5 weather tables)
```

### 2.1 Front-end → API wiring

The module resolves its API base in this order:

1. `window.KS_WEATHER_API_BASE` if set (recommended for production);
2. `http://127.0.0.1:8088` when the page is served from localhost and is not
   already on 8088;
3. `/weather-api` (same-origin proxy path) otherwise.

To ship production, set the base in the dashboard `<head>` before the module
loads, e.g.:

```html
<script>window.KS_WEATHER_API_BASE = 'https://ksweather-api.onrender.com';</script>
```

or add a Vercel rewrite so no cross-origin request is needed:

```json
{ "source": "/weather-api/:path*", "destination": "https://<service-host>/:path*" }
```

**Verified for this build:** no `localhost` URL is hard-coded into any shipped
asset path — the localhost default only activates when the page itself is on
localhost.

### 2.2 Deploying the API

```bash
cd "Krishi Setu/backend/weather"
docker build -t krishi-weather .
docker run -p 8088:8088 \
  -e WEATHER_CORS_ORIGINS=https://<your-vercel-domain> \
  -e SUPABASE_URL=https://<project>.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  krishi-weather
```

Startup command (non-Docker):

```bash
python -m uvicorn ksweather.app:app --host 0.0.0.0 --port 8088 --workers 1
```

`--workers 1` is deliberate: the forest is trained single-threaded for
bit-identical results, and one worker keeps a single warm engine in memory.

The image builds the model artifacts at build time, so container start is
instant. Without artifacts the service rebuilds once (~50 s) and re-caches.

### 2.3 Health check

`GET /health` → `{"status":"healthy","model_version":"rf-residual-temp-v0.3","ready":true,...}`.
Use it as the platform health/readiness probe.

## 3. Environment variables

| Variable | Where | Required | Purpose |
|---|---|---|---|
| `WEATHER_CORS_ORIGINS` | API | production yes | Comma-separated browser origins. Default `*` (demo only). |
| `SUPABASE_URL` | API | optional | Enables persistence of the five weather tables. |
| `SUPABASE_SERVICE_ROLE_KEY` | API | optional | **Server-side only.** Never placed in frontend code. |
| `KS_WEATHER_API_BASE` | browser global | optional | Overrides the API base (see §2.1). |
| `CHROME_PATH` | tests | optional | Chrome/Edge path for the headless suites. |

No secret is read from, or written to, anything under `frontend/`.

## 4. Database

Migration `backend/supabase/migrations/006_weather_intelligence.sql` adds:

| Table | Contents |
|---|---|
| `panchayats` | admin layer: id, LGD code, geometry (GeoJSON in JSONB), area, area weight, terrain, `boundary_source`, `boundary_source_type` |
| `weather_inputs` | the coarse block forecast as submitted, with `source_type` |
| `downscaled_forecasts` | one row per Panchayat per valid date: value, indicative range, confidence, top features, model version, provenance |
| `validation_runs` | per-baseline metrics, skill score, LOPO, consistency check, Track B, **git SHA + model version + seed** |
| `advisories` | crop, risk level, message, action, Market/Logistics hand-off target |

* No PostGIS dependency — geometry is GeoJSON inside JSONB, as the PRD allows.
* `source_type` is constrained by `CHECK` to the three PRD provenance values, so
  an ill-formed write cannot invent a fourth state.
* RLS: public **read** for `panchayats`, `downscaled_forecasts`,
  `validation_runs`, `advisories`. Writes come from the service role only.
* Nothing renames or alters an existing table.

Apply with `supabase db push`, or paste into the SQL editor after migrations 001–005.

## 5. Licences and attribution

Shown in the module's provenance panel and reproduced here for the pitch deck.

| Source | Role | Licence |
|---|---|---|
| IMD Agromet block bulletins | operational coarse-forecast *concept* | no feed confirmed — not integrated |
| IMD AWS/ARG stations | Track B holdout | IMD open data terms — **no stations configured** |
| ERA5-Land (0.1°) | Track A coarse input + fine reference | Copernicus C3S licence (attribution) |
| CHIRPS (0.05°) | P1 historical rainfall reference | Public domain |
| IMD gridded rainfall (0.25°) | historical training/validation target | IMD open data terms |
| MODIS NDVI / land cover | fine-scale predictors | NASA open licence |
| India Geodata | Panchayat polygon fallback | CC0-1.0 |
| DataMeet | Panchayat polygon fallback | ODbL |
| Bhuvan / ISRO NRSC | preferred polygon source | Bhuvan terms of use |
| LGD | stable administrative IDs | codes only — no polygons |
| Schematic pilot grid (this build) | boundary stand-in | generated placeholder, no third-party data |

## 6. What is real vs simulated in this build

**Real (implemented and executed):**

* the downscaling pipeline: feature extraction, B1, B2, Random Forest residual
  correction, mean-preserving area-weighted reconciliation, P10–P90 residual
  quantiles, blocked temporal validation, leave-one-Panchayat-out CV, metrics
* every number on the validation screen (produced by `scripts/train_model.py`)
* the provenance system, the fallback ladder and the rules-based advisory engine
* the database schema and the persistence path

**Simulated / staged (disclosed everywhere):**

* the coarse block forecast (`source_type: simulated_demo`)
* the Track A reference dataset (deterministic synthetic hindcast standing in
  for ERA5-Land / CHIRPS)
* the Panchayat polygons (**schematic grid — NOT official and NOT community-mapped**)
* terrain attributes (illustrative values, not a DEM extract)
* the rainfall P1 branch (implemented, **not** claimed as validated)

## 7. Claim discipline

**Say:** "We built a Panchayat-level downscaling pipeline and validated it
against named baselines on a blocked temporal holdout. Because no official feed
or station data is available to us, the input and reference are staged and the
result is a reconstruction."

**Never say:**

* "real-time IMD integration" — there is none
* "operational forecast skill" — Track A is a hindcast; Track B is unavailable
* "calibrated uncertainty" — the ranges are indicative and uncalibrated
* "official Panchayat boundaries" — the polygons are a disclosed schematic grid
* "98% accurate" or any accuracy percentage — none exists and none is displayed
* "validated rainfall model" — the P1 rainfall branch is withheld, not claimed
* "the adjustment improves accuracy" — it is a consistency step, and the
  metrics are computed **before** it

## 8. Reproducing the validation

```bash
cd "Krishi Setu/backend/weather"
python scripts/train_model.py            # human-readable report
python scripts/train_model.py --json     # machine-readable
python scripts/train_model.py --force    # ignore the cache and retrain
```

Fixed seed 42, fixed split (train 2015-2022 / test 2023-2024), no random row
splits anywhere in the codebase. The artifact cache is keyed by model version +
seed + block + split dates, so changing any of them forces a fresh run rather
than silently serving stale metrics.

## 9. Test coverage

| Suite | Command | What it proves |
|---|---|---|
| Backend + model | `cd backend/weather && python -m pytest tests -q` | 86 tests: contract, error codes, fallbacks, adjustment edge cases, determinism, validation protocol, provenance |
| Weather module (browser) | `cd tests && npm run weather` | 47 checks: nav, offline fallback, differentiation, detail card, validation panel, advisory, hand-off, role gates, mobile |
| Routing regression | `cd tests && npm run routing` | all 38 Vercel routes still resolve |
| Auth bridge | `cd tests && npm run bridge` | public ⇄ platform session bridge |
