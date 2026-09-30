# System Architecture — Panchayat Weather Intelligence

**Localized Agro-Meteorological Decision Support Platform (SIH26074)**

---

## 1. High-Level Architecture

Panchayat Weather Intelligence bridges the spatial resolution gap between coarse Block-level forecasts (~100–300 km²) and village-level farm realities (~5–50 km²).

The platform is organized into three decoupled, production-grade layers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          PRESENTATION LAYER                            │
│  Static Single-Page Application (HTML5 / Vanilla CSS / Vanilla JS)     │
│  • Public Front-Door (Problem, Solution, Workflow, Disclosures)        │
│  • Interactive Downscaling Matrix (11 Panchayats, Baselines B1/B2/RF)  │
│  • Leaflet Interactive Geographic Map (GeoJSON Boundaries & Thermal)   │
│  • Agro-Meteorological Crop Advisory (Heat Thresholds & Actions)       │
│  • Agro-Meteorological Assistant (Local Rule Fallback + AI Proxy)       │
│  • Local Client-Side Session & State Management                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                    JSON / REST API │ (or committed offline bundle)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         COMPUTATIONAL ENGINE                           │
│  FastAPI + scikit-learn Downscaling Service (Python 3.11)              │
│  • Geospatial Predictor Extraction (Elevation, Slope, Aspect, NDVI)    │
│  • Named Baselines: B1 (Block Copy), B2 (Elevation Lapse Rate)         │
│  • Random Forest Residual Model (Trained on Local Anomalies, Seed 42)  │
│  • Area-Weighted Mean-Preserving Reconciliation Filter                 │
│  • Empirical Quantile Uncertainty Engine (Indicative P10–P90)          │
│  • Blocked Temporal Holdout Validator (Train: 2015-22 / Test: 2023-24) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                SQL │ (Optional persistence)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                            DATA PERSISTENCE                            │
│  Supabase / PostgreSQL Schema (`001_weather_intelligence.sql`)         │
│  • panchayats (Centroids, Elevation, Areas, Boundary GeoJSON)          │
│  • weather_inputs (Coarse Forecast Fixtures & Observations)            │
│  • downscaled_forecasts (Panchayat Estimates, Ranges, Provenance)      │
│  • validation_runs (Baseline MAE/RMSE/Bias & Skill Scores)             │
│  • advisories (Generated Crop Guidance & Notification Logs)            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Breakdown

### 2.1 Static Frontend (`website/`)
- **Zero Build Step**: Pure HTML5, modern semantic CSS (custom design system with CSS custom properties and light/dark theme tokens), and vanilla ES6+ JavaScript.
- **Offline Self-Sufficiency**: Shipped with a committed deterministic data snapshot (`data/weather-bundle.js`), guaranteeing full operational capability even without an active backend service.
- **GIS Mapping**: Integrated Leaflet 1.9.4 with vector polygons for the 11 Panchayats of the Dindori Block pilot area.
- **Security & Privacy**: No tracking cookies, no third-party analytics, zero exposed credentials or API keys.

### 2.2 Downscaling Service (`backend/weather/`)
- **FastAPI Application**: High-performance asynchronous microservice providing endpoints for downscaling, map geojson delivery, model validation, and advisory evaluation.
- **Reproducible ML Pipeline**: Deterministic random forest residual modeling (`random_state=42`) with fixed feature ordering.
- **Provenance Tracking**: Every calculation generates cryptographic run identifiers and explicit data source metadata.

### 2.3 Database Layer (`backend/database/`)
- Relational schema enforcing referential integrity across blocks, panchayats, forecasts, validation metrics, and advisory outputs.
- Row-level security (RLS) policies isolating administrative access from public read-only consumption.

---

## 3. Data Flow

1. **Ingestion**: Coarse Block-level forecast ingested (temperature, humidity, wind).
2. **Feature Joins**: Panchayat terrain and land surface attributes joined from geospatial registry.
3. **Baseline Computation**:
   - $B1$: Uniform spatial assignment across all Panchayats in the block.
   - $B2$: Elevation-adjusted estimation using environmental lapse rate ($-6.5\text{ °C/km}$).
4. **Machine Learning Residual**: Random Forest model estimates micro-climate residual deviations based on multi-factor terrain features.
5. **Reconciliation**: Area-weighted adjustment guarantees block-mean conservation.
6. **Advisory Formulation**: Crop biological heat thresholds evaluated against downscaled estimates to produce concrete field management recommendations.
