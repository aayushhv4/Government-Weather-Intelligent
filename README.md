# Panchayat Weather Intelligence

**Localized Agro-Meteorological Decision Support Platform**

> SIH26074 — Smart India Hackathon 2026

---

Panchayat Weather Intelligence is a localized agro-meteorological decision-support platform that converts Block-level weather information into Panchayat-level estimates using geospatial predictors and machine-learning residual correction, validates the downscaling against explicit baselines, estimates indicative uncertainty, and converts localized weather risk into crop-specific advisory support.

**This is not an official operational IMD forecasting service.** It is an independent research prototype built in the context of the Government/IMD problem statement SIH26074.

---

## Problem Statement — SIH26074

Indian Meteorological Department (IMD) provides weather forecasts at Block level (~100–300 km²). Individual farmers operate at Panchayat level (~5–50 km²), where terrain, elevation, land cover, and local micro-climate create temperature and rainfall variation that Block-level data cannot capture.

A farmer in a high-elevation Panchayat may experience 2–4 °C lower peak temperatures than a valley Panchayat in the same Block — a difference large enough to change crop-protection decisions.

---

## Solution

A statistical downscaling pipeline that:

1. Takes a coarse **Block-level temperature forecast** as input
2. Extracts **geospatial predictors** per Panchayat (elevation, slope, aspect, land cover, NDVI, centroid lat/lon, historical anomaly)
3. Computes two named **baselines** — B1 (Block copy) and B2 (elevation lapse-rate)
4. Applies a **Random Forest residual correction** trained on historical Panchayat–Block anomalies
5. Applies **mean-preserving area-weighted reconciliation**
6. Estimates an **indicative P10–P90 uncertainty range** (uncalibrated)
7. **Validates** against baselines on a blocked temporal holdout
8. Converts to a **heat-risk crop advisory** and action chain

---

## Downscaling Methodology

### B1 — Block Copy Baseline
```
T_p = B_t  for all p in block
```

### B2 — Elevation Lapse-Rate Baseline
```
T_p = B_t − 6.5 °C/km · (z_p − z̄_block) / 1000
```

### Random Forest Residual Correction
```
T_p,t = B_t + f_T(X_p) + e_p,t
```
where `f_T` is a Random Forest trained on `(reference_panchayat − block)` with seed 42.

### Validation
- **Track A**: Blocked temporal holdout — train 2015-2022 / test 2023-2024. No random row splits.
- **Track B**: IMD AWS/ARG station holdout — **unavailable** in this build.
- **Skill formula**: `Skill = 1 − MAE_model / MAE_B1`

---

## Scientific Honesty

| Claim | Status |
|---|---|
| Live IMD forecast ingestion | **Not implemented** — no official operational feed |
| Coarse input | **Staged illustrative fixture** (`source_type: simulated_demo`) |
| Fine reference (Track A) | **Staged deterministic synthetic hindcast** |
| Validation type | **Hindcast reconstruction** — not operational forecast skill |
| Track B station holdout | **Unavailable** — no stations configured |
| Uncertainty ranges | **Indicative / uncalibrated** empirical quantiles |
| Panchayat boundaries | **Schematic pilot grid** — NOT official, NOT community-mapped |

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5 · Vanilla CSS · Vanilla JavaScript (no framework, no build step) |
| Geographic map | Leaflet 1.9.4 (vendored) |
| Downscaling service | Python 3.11 · FastAPI · scikit-learn (Random Forest) |
| Geospatial stack | GeoPandas · Rasterio · Xarray (optional, interface-ready) |
| Database | Supabase / PostgreSQL (optional persistence) |
| AI assistant | Deterministic local interpreter + optional remote AI proxy |
| Deployment | Vercel (static frontend, Root Directory = `website`) |
| Offline data | Committed `data/weather-bundle.js` snapshot (no build step) |
| Testing | Puppeteer headless Chrome · pytest (86 backend tests) |

---

## Project Structure

```
panchayat-weather-intelligence/
├── website/                        ← Production static frontend (Vercel root)
│   ├── index.html                  Public home page
│   ├── app.html                    Weather intelligence workspace
│   ├── login.html                  Optional sign-in
│   ├── 404.html                    Custom not-found page
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── favicon.svg
│   ├── vercel.json                 Deployment config (rewrites + security headers)
│   ├── css/
│   │   ├── website.css             Design system (tokens, dual themes)
│   │   ├── site.css                Production layer
│   │   └── vendor/leaflet.css
│   ├── js/
│   │   ├── site-config.js          Origin / social URL config
│   │   ├── home.js                 Home page behaviour
│   │   ├── website.js              Workspace coordinator (routing, theme, i18n)
│   │   ├── weather.js              Downscaling state + bundle fallback
│   │   ├── pilot-geo.js            Panchayat tessellation + colour scales
│   │   ├── map.js                  Leaflet map, baselines, detail panel
│   │   ├── advisory.js             Crop heat-stress rules + action chain
│   │   ├── ai.js                   Agro-Meteorological Assistant
│   │   ├── table-stack.js          Mobile table reflow utility
│   │   ├── auth.js                 Optional local accounts + guest session
│   │   └── vendor/leaflet.js
│   ├── data/
│   │   └── weather-bundle.js       Offline snapshot (committed, no build step)
│   └── assets/
│       └── hero-farmer-field.jpg
│
├── backend/
│   ├── weather/                    ← FastAPI downscaling service (SIH26074)
│   │   ├── ksweather/              Python package (pipeline, baselines, model, advisory…)
│   │   ├── scripts/                train_model.py, export_product_bundle.py
│   │   ├── tests/                  86 pytest tests
│   │   ├── Dockerfile
│   │   ├── requirements.txt        Pinned core deps
│   │   ├── requirements-geo.txt    Optional geospatial extras
│   │   └── README.md               Engineering contract + provenance rules
│   └── database/
│       └── 001_weather_intelligence.sql  Supabase schema (5 weather tables)
│
├── tests/
│   ├── test-production-website.js  Headless Puppeteer verification (10 checks)
│   └── package.json
│
├── .gitignore
└── README.md
```

---

## Local Setup

### Frontend only (no backend required)

```bash
git clone <repo-url>
cd website
python -m http.server 8000
# Open http://localhost:8000/
```

The site works offline via the committed `data/weather-bundle.js` snapshot.

### With scientific downscaling backend

```bash
cd backend/weather
python -m venv .venv
.venv\Scripts\activate           # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python scripts/train_model.py    # Build model artifacts (~1 min, deterministic)

python -m uvicorn ksweather.app:app --host 0.0.0.0 --port 8088 --workers 1
```

Then in a separate terminal:
```bash
cd website && python -m http.server 8000
```

### Run backend tests

```bash
cd backend/weather
python -m pytest tests -q        # 86 tests
python scripts/train_model.py    # Human-readable validation report
```

### Run frontend verification

```bash
cd tests && node test-production-website.js
```

---

## Vercel Deployment

1. Import the repository in Vercel
2. **Project Settings → Root Directory → `website`**
3. Framework Preset: **Other** · Build Command: *(empty)* · Output Directory: *(empty)*
4. Deploy

No build step. No serverless functions. No environment variables required for the static deployment.

---

## Environment Variables (all optional)

| Variable | Where | Purpose |
|---|---|---|
| `WEATHER_CORS_ORIGINS` | API | Allowed browser origins (default `*`) |
| `SUPABASE_URL` | API | Enables weather table persistence |
| `SUPABASE_SERVICE_ROLE_KEY` | API only | **Server-side only** — never in frontend |
| `PWI_CONFIG.AI_ENDPOINT` | Browser global | Remote AI proxy for the assistant |
| `PWI_CONFIG.SITE_URL` | Browser global | Canonical URL for SEO / social preview |
| `PWI_CONFIG.SUPABASE_URL` | Browser global | Optional Supabase URL for browser auth |
| `PWI_CONFIG.SUPABASE_ANON_KEY` | Browser global | Optional anon key (browser-safe) |

---

## API Endpoints (Backend)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness + readiness + model version |
| `GET` | `/weather/pilot` | Pilot block, Panchayats, area weights, boundary provenance |
| `POST` | `/weather/downscale` | Main downscaling endpoint (JSON body) |
| `GET` | `/weather/demo-forecast` | Labelled seeded demo forecast |
| `GET` | `/weather/validation` | Track A + B report (code-generated) |
| `GET` | `/weather/advisory` | Localized heat-risk advisory |
| `GET` | `/weather/advisory-rules` | Configurable rules layer |
| `GET` | `/weather/provenance` | Adapter status, licences, disclaimers |

---

## Reproducibility

- Seed **42** fixed everywhere
- Fixed blocked split: train 2015-2022 / test 2023-2024
- Model version string: `rf-residual-temp-v0.3`
- Single-threaded forest training (bit-identical across machines)
- Pinned dependencies in `requirements.txt`
