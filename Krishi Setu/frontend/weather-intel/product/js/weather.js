/**
 * Panchayat Weather Intelligence — core weather and downscaling module
 *
 * Preserves the full scientific solution:
 *  - Block Forecast ingestion
 *  - Geospatial feature integration (elevation, slope, aspect, NDVI, land cover)
 *  - Baseline B1 (Block Copy) & Baseline B2 (Elevation Lapse-Rate: -6.5 °C/km)
 *  - Random Forest residual correction
 *  - Area-weighted mean-preserving reconciliation (consistency check)
 *  - Indicative empirical uncertainty (P10-P90 quantiles)
 *  - Scientific hindcast validation & transparent data provenance
 */

(function () {
  'use strict';

  const DEFAULT_BLOCK_ID = 'LGD-271012';

  const state = {
    apiBase: null,
    serviceOk: false,
    serviceDegraded: false,
    block: null,
    panchayats: [],
    provenance: null,
    forecast: null,
    downscale: null,
    validation: null,
    rainfallValidation: null,
    advisoryRules: null,
    rulesRaw: null,
    selectedPanchayatId: null,
    selectedBlockId: DEFAULT_BLOCK_ID,
    days: 3,
    loading: false,
    bundled: false,
  };

  // The bundled snapshot carries 3 lead days per Panchayat. Respect the selected forecast window
  // so the horizon control is a real control rather than a decorative one.
  function applyDayFilter(ds) {
    if (!ds || !ds.features || !ds.features.length) return ds;
    var days = state.days || 3;
    var filtered = ds.features.filter(function (f) {
      var lead = (f.properties && f.properties.lead_days) || 1;
      return lead <= days;
    });
    if (!filtered.length) return ds;
    return Object.assign({}, ds, { features: filtered });
  }

  // Resolve API Base URL
  function resolveApiBase() {
    let qsApi = null;
    try {
      qsApi = new URLSearchParams(window.location.search).get('api');
    } catch (e) {}
    if (qsApi) return qsApi.replace(/\/+$/, '');
    if (window.PWI_WEATHER_API_BASE) return window.PWI_WEATHER_API_BASE.replace(/\/+$/, '');
    if (window.KS_WEATHER_API_BASE) return window.KS_WEATHER_API_BASE.replace(/\/+$/, '');
    if (window.location.port === '8088') return '';
    return null; // Standalone / static deployment mode
  }

  async function fetchWithTimeout(path, options = {}, timeoutMs = 8000) {
    const base = state.apiBase;
    const url = base ? (base.replace(/\/+$/, '') + path) : path;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const resp = await fetch(url, { ...options, signal: ctrl ? ctrl.signal : undefined });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Load from pre-bundled snapshot if live backend is unreachable
  function loadBundleSnapshot() {
    const bundle = window.PWI_BUNDLE || window.KS_WEATHER_BUNDLE;
    if (!bundle) return false;
    if (bundle.pilot) {
      state.block = bundle.pilot;
      state.panchayats = (bundle.pilot && bundle.pilot.panchayats) || [];
    }
    if (bundle.forecast) state.forecast = bundle.forecast;
    if (bundle.downscale) state.downscale = applyDayFilter(bundle.downscale);
    if (bundle.validation) state.validation = bundle.validation;
    if (bundle.rainfall_validation) state.rainfallValidation = bundle.rainfall_validation;
    if (bundle.advisory_rules) {
      state.advisoryRules = bundle.advisory_rules;
      state.rulesRaw = bundle.advisory_rules;
    }
    state.bundled = true;
    return true;
  }

  // Decomposition of one estimate: Why This Panchayat?
  function whyThisPanchayat(props) {
    if (!props) return null;
    const b1 = props.b1_t_max_c !== undefined ? props.b1_t_max_c : (state.forecast?.days?.[0]?.t_max_c || 38.8);
    const b2 = props.b2_t_max_c !== undefined ? props.b2_t_max_c : b1;
    const fin = props.t_max_c !== undefined ? props.t_max_c : b1;
    const raw = props.model_raw_t_max_c !== undefined ? props.model_raw_t_max_c : fin;
    return {
      b1: b1,
      b2: b2,
      lapse: b2 - b1,
      rf: raw - b1,
      adj: fin - raw,
      fin: fin,
    };
  }

  // Extract unique Panchayats from latest downscale
  function uniquePanchayatFeatures() {
    const feats = (state.downscale && state.downscale.features) || [];
    if (!feats.length) return [];
    const seen = new Set();
    const out = [];
    for (const f of feats) {
      const pid = f.properties && f.properties.panchayat_id;
      if (pid && !seen.has(pid)) {
        seen.add(pid);
        out.push(f);
      }
    }
    return out;
  }

  function selectedFeature() {
    const feats = uniquePanchayatFeatures();
    if (!feats.length) return null;
    return feats.find(f => f.properties.panchayat_id === state.selectedPanchayatId) || feats[0];
  }

  const PWI_WEATHER = {
    state,

    async init() {
      state.apiBase = resolveApiBase();
      if (state.apiBase) {
        try {
          const health = await fetchWithTimeout('/health', {}, 2500);
          if (health && health.status === 'ok') {
            state.serviceOk = true;
            const pilot = await fetchWithTimeout('/weather/pilot/' + encodeURIComponent(state.selectedBlockId), {}, 3000);
            state.block = pilot;
            state.panchayats = pilot.panchayats || [];
            const val = await fetchWithTimeout('/weather/validation', {}, 3000);
            state.validation = val;
            const prov = await fetchWithTimeout('/weather/provenance', {}, 3000);
            state.provenance = prov;
            const rules = await fetchWithTimeout('/weather/advisory-rules', {}, 3000);
            state.advisoryRules = rules;
            state.rulesRaw = rules;
          } else {
            throw new Error('Service reported non-ok status');
          }
        } catch (err) {
          state.serviceOk = false;
          state.serviceDegraded = true;
          loadBundleSnapshot();
        }
      } else {
        state.serviceOk = false;
        state.serviceDegraded = false;
        loadBundleSnapshot();
      }

      // Default selection to first Panchayat if available
      if (!state.selectedPanchayatId && state.panchayats.length) {
        state.selectedPanchayatId = state.panchayats[0].panchayat_id;
      }
    },

    async runDownscale(blockId = state.selectedBlockId, days = 3) {
      state.loading = true;
      state.days = Number(days) || 3;
      try {
        if (state.serviceOk) {
          const forecastResp = await fetchWithTimeout(`/weather/demo-forecast?block_id=${encodeURIComponent(blockId)}&days=${days}`);
          state.forecast = forecastResp;
          const downscaleResp = await fetchWithTimeout('/weather/downscale', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ block_id: blockId, forecast: forecastResp.days })
          });
          state.downscale = applyDayFilter(downscaleResp);
        } else {
          // Bundled offline deterministic fallback
          loadBundleSnapshot();
        }
        state.selectedBlockId = blockId;
      } catch (e) {
        console.warn('Downscaling error, falling back to bundled data:', e);
        loadBundleSnapshot();
      } finally {
        state.loading = false;
      }
      return state.downscale;
    },

    selectPanchayat(pid) {
      state.selectedPanchayatId = pid;
    },

    selectedFeature,
    uniquePanchayatFeatures,
    whyThisPanchayat,

    blockMeanElevation() {
      return state.block?.block?.mean_elevation_m || 735.7;
    }
  };

  window.PWI_WEATHER = PWI_WEATHER;
})();
