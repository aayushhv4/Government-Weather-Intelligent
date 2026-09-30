# Scientific Downscaling Methodology — SIH26074

**Panchayat Weather Intelligence: Localized Agro-Meteorological Decision Support Platform**

---

## 1. Problem Formulation

The India Meteorological Department (IMD) provides operational numerical weather prediction forecasts aggregated to the Block administrative unit (~100–300 km²). However, individual farmers make operational field decisions at the Gram Panchayat scale (~5–50 km²).

Within a single Block, terrain heterogeneity, elevation gradients, aspect, and surface land cover induce micro-climatic thermal variances of $2\text{ to }4\text{ °C}$. A valley Panchayat at 545 m elevation experiences substantially higher heat stress than a ridge Panchayat at 968 m in the same administrative block.

---

## 2. Downscaling Pipeline

```
Block Coarse Forecast (B_t)
            │
            ├───────────────────────────────────────────────┐
            ▼                                               ▼
Baseline B1: Block Copy                         Baseline B2: Lapse Rate
T_p = B_t                                       T_p = B_t - 6.5 · Δz / 1000
            │                                               │
            └───────────────────────┬───────────────────────┘
                                    │
                                    ▼
                      Geospatial Predictor Vector (X_p)
                      • Centroid Latitude & Longitude
                      • Mean Elevation (z_p) & Relief (z_max - z_min)
                      • Slope & Topographic Aspect
                      • Dominant Land Cover & NDVI Anomaly
                      • Historical Micro-climate Anomaly
                                    │
                                    ▼
                      Random Forest Residual Model (f_T)
                      ΔT_p = f_T(X_p)
                      T_raw = B_t + ΔT_p
                                    │
                                    ▼
                      Area-Weighted Reconciliation
                      Ensures: Σ(w_p · T_p) = B_t
                                    │
                                    ▼
                      Indicative Uncertainty Engine
                      Empirical Quantiles [P10, P90]
                                    │
                                    ▼
                      Panchayat-Level Forecast & Advisory
```

---

## 3. Mathematical Specifications

### 3.1 Baseline B1 — Block Copy
The naive reference baseline assigns the block forecast uniformly to all member Panchayats:
$$T_{p}^{B1} = B_t \quad \forall p \in \text{Block}$$

### 3.2 Baseline B2 — Elevation Lapse Rate
The physical lapse-rate baseline applies standard tropospheric cooling ($-6.5\text{ °C/km}$) relative to the block mean elevation ($\bar{z}_{\text{block}}$):
$$T_{p}^{B2} = B_t - 0.0065 \cdot (z_p - \bar{z}_{\text{block}})$$
where $z_p$ is the area-weighted mean elevation of Panchayat $p$ in meters.

### 3.3 Random Forest Residual Model
The machine-learning layer models high-order non-linear interactions between terrain features and observed local micro-climatic departures:
$$T_{p,t} = B_t + f_T(X_p) + \epsilon_{p,t}$$
- **Algorithm**: Ensembled regression trees (scikit-learn `RandomForestRegressor`, `n_estimators=100`, `max_depth=6`, `random_state=42`).
- **Target**: Anomaly vector $(T_{\text{reference}} - B_t)$.
- **Predictors ($X_p$)**:
  1. Mean elevation ($m$)
  2. Topographic relief ($m$)
  3. Slope angle (degrees)
  4. Topographic aspect cosine/sine transformations
  5. Mean NDVI index
  6. Historical 10-year monthly thermal anomaly

### 3.4 Area-Weighted Mean-Preserving Reconciliation
Downscaled values must strictly conserve the macro-scale energy balance of the parent Block forecast:
$$T_p^* = T_p \cdot \frac{B_t}{\sum_{i=1}^{N} w_i \cdot T_i}$$
where $w_i = \frac{\text{Area}_i}{\sum_{j=1}^{N} \text{Area}_j}$. This reconciliation step eliminates systematic drift without distorting inter-panchayat spatial gradients.

### 3.5 Uncertainty Estimation
Empirical residual error distributions are quantified to provide indicative intervals:
$$[P_{10}(T_p), P_{90}(T_p)]$$
*Explicit Disclosure: Intervals reflect historical reanalysis dispersion and are uncalibrated against real-time operational surface networks.*

---

## 4. Validation Framework

Model skill is validated using a **blocked temporal holdout** protocol:
- **Training Period**: Historical years 2015–2022.
- **Evaluation Holdout**: Years 2023–2024 (unseen test partition; strictly preventing cross-row contamination).
- **Evaluation Metrics**:
  - Mean Absolute Error (MAE): $\text{MAE} = \frac{1}{M}\sum |T_{\text{model}} - T_{\text{ref}}|$
  - Root Mean Squared Error (RMSE): $\text{RMSE} = \sqrt{\frac{1}{M}\sum (T_{\text{model}} - T_{\text{ref}})^2}$
  - Systematic Mean Bias: $\text{Bias} = \frac{1}{M}\sum (T_{\text{model}} - T_{\text{ref}})$
  - Relative Skill Score against $B1$: $\text{Skill}_{B1} = 1 - \frac{\text{MAE}_{\text{model}}}{\text{MAE}_{B1}}$

All metrics displayed on the platform are computed directly from evaluation arrays and labeled truthfully: **Reanalysis hindcast validation — not operational forecast skill.**
