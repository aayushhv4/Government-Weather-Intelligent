/* ============================================================
   Panchayat Weather Intelligence — Agro-Meteorological Decision Support
   Standalone application module.
   Consumes the Panchayat Weather API. No dependency on other products.
   ============================================================ */

(() => {
  'use strict';

  // ---------- configuration ----------
  const API_BASE = window.KS_WEATHER_API_BASE || null; // explicit production base
  const DEFAULT_BLOCK_ID = 'LGD-271012';

  // ---------- state ----------
  const state = {
    apiBase: null,            // resolved base once health-check runs
    serviceOk: false,         // live service reachable
    serviceDegraded: false,   // fallback mode
    block: null,              // pilot block payload
    panchayats: [],           // pilot panchayat list
    provenance: null,         // /weather/provenance
    forecast: null,           // /weather/demo-forecast
    downscale: null,          // latest POST /weather/downscale result
    validation: null,         // /weather/validation
    rainfallValidation: null, // /weather/validation/rainfall
    advisoryRules: null,      // /weather/advisory-rules
    rulesRaw: null,           // raw rules object for client-side evaluation
    selectedPanchayatId: null,
    selectedBlockId: DEFAULT_BLOCK_ID,
    loading: false,
    crop: 'tomato',
    currentRoute: 'overview',
    bundled: false,           // true when the offline snapshot supplied data
    copilotAnswer: null,      // last Agro-Weather Copilot reply { html, mode }
    mapZoom: 1,               // schematic map zoom factor
  };

  // ---------- DOM refs ----------
  const $ = (sel) => document.querySelector(sel);
  const main = $('#main');
  const statusDot = $('#statusDot');
  const statusText = $('#statusText');
  const banner = $('#banner');
  const footDisclaimers = $('#footDisclaimers');

  // ============================================================
  //  THEME — light is the default; the choice is remembered.
  //  The pre-paint bootstrap in index.html sets the initial attribute so the page never
  //  flashes the wrong mode; everything here only reacts to the user changing it.
  // ============================================================
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    const t = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    try { window.localStorage.setItem('pwi-theme', t); } catch (e) { /* storage unavailable */ }
    const icon = $('#themeIcon');
    const label = $('#themeLabel');
    const btn = $('#themeToggle');
    if (icon) icon.textContent = t === 'dark' ? '☀' : '☾';
    if (label) label.textContent = t === 'dark' ? t_('ctrl.light') : t_('ctrl.dark');
    if (btn) btn.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
  }

  function toggleTheme() { applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'); }

  // ============================================================
  //  LANGUAGE — a single dictionary drives every translated string.
  //  Adding an Indian language is one entry here plus one <option> in index.html; any key
  //  left untranslated falls back to English rather than showing a raw key.
  // ============================================================
  const I18N = {
    en: {
      'app.title': 'Panchayat Weather Intelligence',
      'app.subtitle': 'Localized Agro-Meteorological Decision Support',
      'ctrl.language': 'Language', 'ctrl.dark': 'Dark', 'ctrl.light': 'Light',
      'nav.overview': 'Overview', 'nav.downscale': 'Weather Downscaling', 'nav.map': 'Panchayat Map',
      'nav.validation': 'Validation', 'nav.advisory': 'Advisory', 'nav.alerts': 'Alerts',
      'nav.provenance': 'Data & Provenance', 'nav.methodology': 'Methodology',
      'ov.hero.sub': 'From Block-level forecasts to localized agro-meteorological decision support.',
      'ov.kpi.block': 'Pilot block', 'ov.kpi.panchayats': 'Panchayats', 'ov.kpi.horizon': 'Forecast horizon',
      'ov.kpi.model': 'Model', 'ov.kpi.datamode': 'Data mode',
      'ov.flow.block': 'Block forecast', 'ov.flow.downscale': 'Downscaled Panchayat forecast',
      'ov.selected': 'Selected Panchayat', 'ov.today': 'Panchayat weather today',
      'ov.why': 'Why this Panchayat?', 'ov.chain': 'Weather → Action chain',
      'ov.assistant': 'Agro-Meteorological Assistant',
      'risk.high': 'High risk', 'risk.medium': 'Moderate risk', 'risk.none': 'Low risk',
      'data.live': 'Live service', 'data.staged': 'Staged',
    },
    hi: {
      'app.title': 'पंचायत मौसम बुद्धिमत्ता',
      'app.subtitle': 'स्थानीयकृत कृषि-मौसम निर्णय समर्थन',
      'ctrl.language': 'भाषा', 'ctrl.dark': 'गहरा', 'ctrl.light': 'हल्का',
      'nav.overview': 'अवलोकन', 'nav.downscale': 'मौसम डाउनस्केलिंग', 'nav.map': 'पंचायत मानचित्र',
      'nav.validation': 'सत्यापन', 'nav.advisory': 'सलाह', 'nav.alerts': 'चेतावनियाँ',
      'nav.provenance': 'डेटा और स्रोत', 'nav.methodology': 'कार्यप्रणाली',
      'ov.hero.sub': 'ब्लॉक स्तर के पूर्वानुमान से स्थानीयकृत कृषि-मौसम निर्णय समर्थन तक।',
      'ov.kpi.block': 'पायलट ब्लॉक', 'ov.kpi.panchayats': 'पंचायतें', 'ov.kpi.horizon': 'पूर्वानुमान अवधि',
      'ov.kpi.model': 'मॉडल', 'ov.kpi.datamode': 'डेटा मोड',
      'ov.flow.block': 'ब्लॉक पूर्वानुमान', 'ov.flow.downscale': 'डाउनस्केल्ड पंचायत पूर्वानुमान',
      'ov.selected': 'चयनित पंचायत', 'ov.today': 'आज का पंचायत मौसम',
      'ov.why': 'यह पंचायत क्यों?', 'ov.chain': 'मौसम → कार्रवाई श्रृंखला',
      'ov.assistant': 'कृषि-मौसम सहायक',
      'risk.high': 'उच्च जोखिम', 'risk.medium': 'मध्यम जोखिम', 'risk.none': 'कम जोखिम',
      'data.live': 'लाइव सेवा', 'data.staged': 'चरणबद्ध',
    },
  };

  function currentLang() {
    const l = document.documentElement.getAttribute('lang');
    return I18N[l] ? l : 'en';
  }

  function t_(key) {
    const dict = I18N[currentLang()] || I18N.en;
    return dict[key] !== undefined ? dict[key] : (I18N.en[key] !== undefined ? I18N.en[key] : key);
  }

  // Translates every [data-i18n] node in the shell. Elements that contain child nodes
  // (the alerts badge) keep their children — only the leading text node is replaced.
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const value = t_(el.getAttribute('data-i18n'));
      if (!value) return;
      if (el.children.length) {
        if (el.firstChild && el.firstChild.nodeType === 3) el.firstChild.nodeValue = value;
        else el.insertBefore(document.createTextNode(value), el.firstChild);
      } else {
        el.textContent = value;
      }
    });
    const sel = $('#langSelect');
    if (sel) sel.value = currentLang();
    applyTheme(currentTheme());
  }

  function setLang(lang) {
    const l = I18N[lang] ? lang : 'en';
    document.documentElement.setAttribute('lang', l);
    try { window.localStorage.setItem('pwi-lang', l); } catch (e) { /* storage unavailable */ }
    applyI18n();
    if (state.currentRoute === 'overview') refreshOverview();
    else if (state.currentRoute === 'alerts') renderAlerts();
  }

  // ---------- toast ----------
  let toastTimer = null;
  function toast(msg, kind) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    if (kind === 'warn') el.style.borderColor = 'var(--risk-high)';
    else el.style.borderColor = 'var(--line)';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  // ---------- banner ----------
  function showBanner(html, kind) {
    banner.innerHTML = html;
    banner.hidden = false;
    banner.className = 'banner' + (kind ? ' ' + kind : '');
  }
  function hideBanner() { banner.hidden = true; }

  // ---------- API helpers ----------
  function apiPath(path) {
    // If an explicit base is configured, use it (production).
    if (API_BASE) return API_BASE.replace(/\/+$/, '') + path;
    // Same-origin probe: if the page is served from the same origin as the service
    // (e.g. co-located or served by the service itself), a relative path hits the
    // service directly. Otherwise fall back to a relative rewrite path
    // (/weather-api/...) that a hosting platform can remap to the service.
    // This never hard-codes a localhost URL in a shipped asset.
    const onService = window.location.port === '8088';
    if (onService) return path;
    return '/weather-api' + path;
  }

  // `timeoutMs` bounds every request so a slow or hanging service can never leave the
  // interface waiting indefinitely — the caller always falls through to staged data.
  async function fetchJson(path, options = {}) {
    const url = apiPath(path);
    const { timeoutMs, ...init } = options;
    let ctrl = null;
    let timer = null;
    if (timeoutMs && typeof AbortController !== 'undefined') {
      ctrl = new AbortController();
      init.signal = ctrl.signal;
      timer = setTimeout(() => ctrl.abort(), timeoutMs);
    }
    try {
      const resp = await fetch(url, init);
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new ApiError(resp.status, body || resp.statusText, path);
      }
      const ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/csv') || ct.includes('text/plain')) {
        return await resp.text();
      }
      return await resp.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  class ApiError extends Error {
    constructor(status, detail, path) {
      super(detail);
      this.status = status;
      this.path = path;
    }
  }

  // ---------- route rendering ----------
  function renderRoute(name) {
    state.currentRoute = name;
    // update nav
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.route === name);
    });
    // show section
    const section = $('#s-' + name);
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    if (section) section.classList.add('active');
    // refresh route-specific data if needed
    // Always render the map: with no downscaling result it shows the "run downscaling first"
    // empty state instead of bare placeholders.
    if (name === 'map') {
      renderMap();
      if (state.selectedPanchayatId) renderMapDetail(state.selectedPanchayatId);
    }
    if (name === 'overview') refreshOverview();
    if (name === 'alerts') renderAlerts();
    if (name === 'validation' && state.validation) renderValidation();
    if (name === 'advisory' && state.downscale && state.block) refreshAdvisoryInputs();
  }

  // Refresh the advisory inputs in place when rules/panchayats arrive. The advisory
  // section is built once at boot; this keeps its selects and threshold tables in sync
  // without re-appending a duplicate section.
  function refreshAdvisoryInputs() {
    const cropMap = (state.advisoryRules && state.advisoryRules.crops && !Array.isArray(state.advisoryRules.crops))
      ? state.advisoryRules.crops : null;

    const sel = $('#advisoryCropSelect');
    if (sel) {
      const keys = cropMap ? Object.keys(cropMap) : ['tomato','onion','grape','wheat','soybean','banana'];
      const current = sel.value || state.crop;
      sel.innerHTML = keys.map(c => {
        const known = cropMap && cropMap[c];
        const label = known && known.label ? known.label : c;
        return `<option value="${c}">${label} (${c})</option>`;
      }).join('');
      if (keys.indexOf(current) !== -1) sel.value = current;
    }

    const psel = $('#advisoryPanchayatSelect');
    if (psel && state.panchayats.length && psel.options.length <= 1) {
      psel.innerHTML = '<option value="">— select a Panchayat —</option>' +
        state.panchayats.map(p => `<option value="${p.panchayat_id}">${p.name} (${p.panchayat_id})</option>`).join('');
    }

    const table = $('#advisoryThresholdBody');
    if (table && cropMap) {
      table.innerHTML = Object.entries(cropMap).map(([key, c]) => `
        <tr>
          <td><b>${c.label || key}</b></td>
          <td>${c.heat && c.heat.medium ? c.heat.medium.threshold_t_max_c : '—'}</td>
          <td>${c.heat && c.heat.high ? c.heat.high.threshold_t_max_c : '—'}</td>
        </tr>
      `).join('');
    }
  }

  // ---------- status indicator ----------
  function setStatus(connected, text) {
    statusDot.className = 'status-dot' + (connected ? ' connected' : '');
    statusText.textContent = text;
  }

  // ============================================================
  //  Boot
  // ============================================================

  // The live `/weather/advisory-rules` returns `crops` as a [{key,label}] list while the
  // full rules object carries the threshold map under `raw.crops`. The UI needs the map
  // (label + heat thresholds) for both the threshold table and the advisory evaluation,
  // so normalize the payload once here in both the live and bundled paths.
  function normalizeRules(r) {
    if (!r) return r;
    const dict = (r.raw && r.raw.crops) || (r.crops && !Array.isArray(r.crops) ? r.crops : null);
    return dict ? Object.assign({}, r, { crops: dict }) : r;
  }

  // Deterministic demo mode. `demo-bundle.js` ships a snapshot of REAL engine output
  // (captured from the FastAPI service) — same trained Random Forest model, seed 42.
  // It is used ONLY to fill gaps the live service did not provide, so the product is
  // fully explorable with no backend. It never upgrades provenance: every value in the
  // snapshot is already labelled by the engine (`simulated_demo` / `historical_reference`),
  // and the validation metrics are that run's real hindcast metrics.
  function hydrateFromBundle() {
    const b = window.KS_WEATHER_BUNDLE;
    if (!b) return false;
    let filled = false;

    if (!state.block && b.pilot) { state.block = b.pilot; filled = true; }
    if (!state.panchayats.length && b.pilot && b.pilot.panchayats && b.pilot.panchayats.length) {
      state.panchayats = b.pilot.panchayats;
      filled = true;
    }
    if (!state.provenance && b.provenance) { state.provenance = b.provenance; filled = true; }
    if (!state.forecast && b.forecast) { state.forecast = b.forecast; filled = true; }
    if (!state.validation && b.validation) { state.validation = b.validation; filled = true; }
    if (!state.rainfallValidation && b.rainfall) { state.rainfallValidation = b.rainfall; filled = true; }
    if (!state.advisoryRules && b.rules) {
      state.advisoryRules = normalizeRules(b.rules);
      state.rulesRaw = b.rules.raw || b.rules;
      filled = true;
    }
    // The downscaling result is a user-triggered computation. Only pre-seed it from the staged
    // dataset when no live service is connected — in live mode the map stays empty until the
    // user runs the downscaling, so staged output is never mixed into a live session.
    if (!state.serviceOk && !state.downscale && b.downscale) { state.downscale = b.downscale; filled = true; }

    state.bundled = filled;
    return filled;
  }

  // Each build*() function appends its section with `main.innerHTML += ...`, which makes the
  // browser re-parse the whole container. That discards the DOM nodes — and with them the
  // listeners — attached by every earlier section, so only the last-built section would stay
  // interactive. All sections now exist by the end of boot, so re-attach every section's
  // controls exactly once here.
  function wireSectionActions() {
    const on = (sel, evt, fn) => { const el = $(sel); if (el) el.addEventListener(evt, fn); };

    // Shell controls: colour theme and language.
    on('#themeToggle', 'click', toggleTheme);
    const langSel = $('#langSelect');
    if (langSel) langSel.addEventListener('change', () => setLang(langSel.value));

    // Weather Downscaling
    on('#runDownscaleBtn', 'click', runDownscale);
    on('#dsGoToMap', 'click', () => renderRoute('map'));
    on('#dsGoToValidation', 'click', () => renderRoute('validation'));

    // Panchayat Map
    on('#mapRunDownscale', 'click', () => { runDownscale(); renderMap(); });
    on('#mapZoomIn', 'click', () => setMapZoom(state.mapZoom + 0.25));
    on('#mapZoomOut', 'click', () => setMapZoom(state.mapZoom - 0.25));
    on('#mapZoomReset', 'click', () => setMapZoom(1));
    on('#mapDetailGoAdvisory', 'click', () => {
      if (state.selectedPanchayatId) {
        renderRoute('advisory');
        const sel = $('#advisoryPanchayatSelect');
        if (sel) { sel.value = state.selectedPanchayatId; onAdvisoryPanchayatChange(); }
      }
    });
    on('#mapDetailGoValidation', 'click', () => renderRoute('validation'));

    // Advisory
    on('#advisoryRunBtn', 'click', runAdvisory);
    on('#advisoryPanchayatSelect', 'change', onAdvisoryPanchayatChange);
    on('#advisoryCropSelect', 'change', () => { state.crop = $('#advisoryCropSelect').value; });
  }

  async function boot() {
    setStatus(false, 'Loading data…');
    let health = null;
    try {
      health = await fetchJson('/health', { timeoutMs: 6000 });
      state.apiBase = API_BASE || (window.location.port === '8088' ? '' : '/weather-api');
      state.serviceOk = true;
    } catch (err) {
      // Not reachable. Resolve the base anyway so any later retry uses the same path,
      // then fall through to the bundled snapshot below.
      state.apiBase = API_BASE || (window.location.port === '8088' ? '' : '/weather-api');
      state.serviceDegraded = true;
    }

    // Read the datasets in parallel, but only when /health answered: the dev-server path and
    // the `/weather-api` rewrite route the data endpoints through the same base as /health, so
    // a failed health check means these reads cannot succeed either. Skipping them keeps the
    // console clean and starts the staged dataset faster. Every read is time-bounded.
    if (state.serviceOk) {
      await Promise.allSettled([
        fetchJson('/weather/pilot', { timeoutMs: 12000 })
          .then(p => { state.block = p; state.panchayats = p.panchayats || []; }),
        fetchJson('/weather/provenance', { timeoutMs: 12000 }).then(p => { state.provenance = p; }),
        fetchJson('/weather/demo-forecast?block_id=' + encodeURIComponent(state.selectedBlockId) + '&days=3', { timeoutMs: 12000 })
          .then(f => { state.forecast = f; }),
        fetchJson('/weather/validation', { timeoutMs: 12000 }).then(v => { state.validation = v; }),
        fetchJson('/weather/validation/rainfall', { timeoutMs: 12000 }).then(v => { state.rainfallValidation = v; }),
        fetchJson('/weather/advisory-rules', { timeoutMs: 12000 }).then(r => {
          state.advisoryRules = normalizeRules(r);
          state.rulesRaw = (r && r.raw) || r;
        }),
      ]);
    }

    const hydrated = hydrateFromBundle();

    if (state.serviceOk) {
      // Every panel came from the live service, or some fell back to the staged dataset.
      setStatus(true, 'Live service · ' + (health.model_version || 'model ready') + (hydrated ? ' · some panels staged' : ''));
      hideBanner();
    } else if (hydrated) {
      setStatus(false, 'Data mode: staged · illustrative input');
      showBanner(
        '<b>Data mode: staged.</b> A live weather service is not connected, so the platform is running on its ' +
        'bundled staged dataset, produced by the same Random Forest residual model ' +
        '(<span class="code">seed 42</span>). Every value is labelled <span class="code">simulated_demo</span>, ' +
        'and the validation figures shown are that run\'s recorded hindcast metrics — not placeholders. ' +
        '<span class="muted">Connect the weather service to run live computation.</span>',
        'warn'
      );
    } else {
      setStatus(false, 'Data unavailable');
      showBanner('No weather service is connected and no staged dataset was found. Connect the service to use the platform.', 'warn');
    }

    buildOverview();
    buildDownscale();
    buildMap();
    buildValidation();
    buildAdvisory();
    buildProvenance();
    buildMethodology();
    buildAlertsSection();

    // Staged mode: prime the downscaling result so the workflow is populated on first load
    // rather than requiring a click before anything is visible.
    if (!state.serviceOk && state.bundled && state.downscale) {
      const fcDays = state.forecast && state.forecast.days ? state.forecast.days.length : 3;
      renderDownscaleResult(state.downscale, state.selectedBlockId, fcDays);
    }

    wireSectionActions();
    applyTheme(currentTheme());
    applyI18n();
    renderAlerts();
    renderRoute('overview');
    wireRouting();
    wireHashRouting();
    updateFoot();
  }

  // ============================================================
  //  Routing (in-page + hash)
  // ============================================================
  function wireRouting() {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        renderRoute(el.dataset.route);
        // Try to keep the map and advisory views live
        if (el.dataset.route === 'map' && !state.downscale) runDownscale();
        if (el.dataset.route === 'advisory' && !state.downscale) runDownscale();
      });
    });
  }

  function wireHashRouting() {
    // Allow deep links like #/validation
    function fromHash() {
      const h = window.location.hash.replace(/^#\//, '');
      const allowed = ['overview','downscale','map','validation','advisory','alerts','provenance','methodology'];
      if (h && allowed.includes(h)) return h;
      return 'overview';
    }
    window.addEventListener('hashchange', () => renderRoute(fromHash()));
    if (window.location.hash) renderRoute(fromHash());
  }

  // ============================================================
  //  Footer / disclaimers
  // ============================================================

  // The engine labels staged fixtures "Illustrative demo data". The running product uses the
  // neutral, equally honest wording "Illustrative staged data" wherever that label is shown.
  function plainLabel(value) {
    return String(value == null ? '' : value).replace(/Illustrative demo data/g, 'Illustrative staged data');
  }

  function updateFoot() {
    const d = state.provenance && state.provenance.disclaimers;
    let html = '';
    if (d) {
      // Labels are ours; only the values come from the API (each shown once, not twice).
      html = `
        <span class="disclaimer-box" style="margin:0">
          <b>Uncertainty:</b> ${plainLabel(d.uncalibrated) || 'Indicative — uncalibrated.'}
          <b>Scope:</b> ${plainLabel(d.demo_data) || 'Illustrative staged data.'}
          Not an official IMD service and not an operational forecast product.\n          ${d.track_b ? '<b>Station evaluation:</b> ' + plainLabel(d.track_b) + '<br/>' : ''}
        </span>
      `;
    }
    footDisclaimers.innerHTML = html ||
      '<span class="muted">Illustrative staged data — not an official IMD forecast.</span>';
  }

  // ============================================================
  //  OVERVIEW — Block forecast → Panchayat intelligence → risk → action
  //  Technical detail lives on the Methodology / Provenance / Validation screens;
  //  this screen stays about the weather, the risk and the decision.
  // ============================================================

  // The Panchayat currently in focus: an explicit selection, else the first returned.
  function selectedFeature() {
    const feats = (state.downscale && state.downscale.features) || [];
    if (!feats.length) return null;
    return feats.find(f => f.properties && f.properties.panchayat_id === state.selectedPanchayatId) || feats[0];
  }

  // Heat-risk band from the configured crop thresholds — the same rules layer the advisory
  // engine uses, so the Overview can never disagree with the Advisory screen.
  function riskForTmax(cropKey, tmax) {
    const crop = (state.advisoryRules && state.advisoryRules.crops && state.advisoryRules.crops[cropKey]) || null;
    if (!crop || !crop.heat || tmax === null || tmax === undefined) return 'none';
    if (crop.heat.high && tmax >= crop.heat.high.threshold_t_max_c) return 'high';
    if (crop.heat.medium && tmax >= crop.heat.medium.threshold_t_max_c) return 'medium';
    return 'none';
  }

  function riskPill(level) {
    const cls = level === 'high' ? 'pill-high' : level === 'medium' ? 'pill-medium' : 'pill-none';
    const txt = level === 'high' ? t_('risk.high') : level === 'medium' ? t_('risk.medium') : t_('risk.none');
    return `<span class="pill ${cls}">${txt}</span>`;
  }

  // Decomposition of one estimate from values the pipeline actually produced.
  // B1 is the block baseline the model starts from; the Random Forest supplies the local
  // correction; the consistency step keeps the area-weighted mean aligned with the block.
  function whyThisPanchayat(props) {
    const b1 = props.b1_t_max_c;
    const raw = props.model_raw_t_max_c;
    const fin = props.t_max_c;
    const b2 = props.b2_t_max_c;
    return {
      b1: b1,
      b2: b2,
      lapse: b2 - b1,
      rf: raw - b1,
      adj: fin - raw,
      fin: fin,
    };
  }

  function blockMeanElevation() {
    return state.block && state.block.block ? state.block.block.mean_elevation_m : null;
  }

  // One deterministic advisory, computed from the same rules + values the Advisory screen uses.
  function computeAdvisory(cropKey) {
    const feat = selectedFeature();
    if (!feat) return null;
    const props = feat.properties;
    const rules = state.rulesRaw || loadDefaultRules();
    const meta = state.panchayats.find(x => x.panchayat_id === props.panchayat_id) ||
      { name: props.name, panchayat_id: props.panchayat_id };
    return evaluateOfflineAdvisory(rules, meta, state.selectedBlockId, cropKey, props.t_max_c, props.rainfall_mm, props.valid_date);
  }

  // The chain renders from explicit values, so the Overview and the Advisory screen can both
  // use it without any risk of showing different numbers for the same Panchayat.
  function chainHTMLFrom(values, adv, cropKey) {
    const v = values || {};
    const a = adv || {};
    const risk = riskForTmax(cropKey, v.t_max_c);
    const trim = (s, n) => { const t = String(s || ''); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
    const handoff = a.handoff || {};
    const rangeTxt = (v.range_low_c !== null && v.range_low_c !== undefined && v.range_high_c !== null && v.range_high_c !== undefined)
      ? `P10–P90 ${v.range_low_c}–${v.range_high_c} °C` : 'indicative — uncalibrated';
    const steps = [
      { label: 'Forecast', value: `${v.t_max_c} °C at ${v.name}`, sub: rangeTxt },
      { label: 'Risk', value: risk === 'high' ? 'High heat risk' : risk === 'medium' ? 'Moderate heat risk' : 'Low heat risk', sub: a.threshold !== undefined ? `configured trigger ${a.threshold} °C` : 'no threshold configured' },
      { label: 'Crop impact', value: trim(a.message, 130), sub: a.crop_label || cropKey },
      { label: 'Recommended action', value: trim(a.action, 190), sub: trim(a.field_operation, 90) },
      { label: 'Operational decision', value: trim((handoff.schedule_pickup && handoff.schedule_pickup.hint) || '—', 130), sub: trim((handoff.logistics && handoff.logistics.hint) || '', 80) },
    ];
    return `<div class="chain">${steps.map((s, i) => `
      <div class="chain-step">
        <div class="cs-num">Step ${i + 1}</div>
        <div class="cs-label">${s.label}</div>
        <div class="cs-value">${s.value}${s.sub ? `<div class="t-xs t-muted" style="margin-top:5px">${s.sub}</div>` : ''}</div>
      </div>
    `).join('')}</div>`;
  }

  function chainHTML(cropKey) {
    const feat = selectedFeature();
    if (!feat) return '<div class="empty">Run the downscaling to see the weather → action chain.</div>';
    return chainHTMLFrom(feat.properties, computeAdvisory(cropKey) || {}, cropKey);
  }

  function downscaleSpreadText() {
    const feats = uniquePanchayatFeatures();
    if (!feats.length) return null;
    const vals = feats.map(f => f.properties.t_max_c);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const hot = feats.find(f => f.properties.t_max_c === hi).properties;
    const cool = feats.find(f => f.properties.t_max_c === lo).properties;
    return { lo, hi, spread: hi - lo, hot, cool, count: feats.length };
  }

  function buildOverview() {
    main.innerHTML = `<section class="section active" id="s-overview">${overviewHTML()}</section>`;
    wireCopilot();
  }

  function refreshOverview() {
    const sec = $('#s-overview');
    if (!sec) return;
    sec.innerHTML = overviewHTML();
    wireCopilot();
  }

  function overviewHTML() {
    const block = state.block && state.block.block;
    const pCount = state.panchayats.length;
    const days = (state.forecast && state.forecast.days) || [];
    const feat = selectedFeature();
    const props = feat ? feat.properties : null;
    const crop = state.crop || 'tomato';
    const cropMap = (state.advisoryRules && state.advisoryRules.crops && !Array.isArray(state.advisoryRules.crops)) ? state.advisoryRules.crops : null;
    const cropLabel = (cropMap && cropMap[crop] && cropMap[crop].label) || crop;
    const spread = downscaleSpreadText();
    const repro = (state.provenance && state.provenance.reproducibility) || {};
    const srcType = (state.downscale && state.downscale.meta && state.downscale.meta.source_type) || null;

    const kpis = [
      { label: t_('ov.kpi.block'), value: block ? block.name : '—', meta: block ? block.district + ', ' + block.state : 'Not loaded' },
      { label: t_('ov.kpi.panchayats'), value: pCount || '—', meta: 'in the pilot block' },
      { label: t_('ov.kpi.horizon'), value: days.length ? days.length + (days.length === 1 ? ' day' : ' days') : '—', meta: days.length ? days[0].date + ' → ' + days[days.length - 1].date : 'not loaded' },
      { label: t_('ov.kpi.model'), value: 'RF residual', meta: 'Random Forest local correction' },
      { label: t_('ov.kpi.datamode'), value: state.serviceOk ? t_('data.live') : t_('data.staged'), meta: state.serviceOk ? 'live computation' : 'illustrative input' },
    ];

    const ranked = uniquePanchayatFeatures().slice().sort((a, b) => b.properties.t_max_c - a.properties.t_max_c);
    const topRisk = ranked.length ? ranked[0].properties : null;
    const why = props ? whyThisPanchayat(props) : null;

    return `
      <div class="hero">
        <h1 class="hero-title">${t_('app.title')}</h1>
        <p class="hero-sub">${t_('ov.hero.sub')}</p>
        <div class="flex mt-2" style="gap:8px;flex-wrap:wrap">
          <button class="btn primary" type="button" data-goto="downscale">Explore Weather Intelligence</button>
          <button class="btn" type="button" data-goto="methodology">View Methodology</button>
        </div>
        <div class="hero-rule"></div>
      </div>

      <div class="card" style="margin-top:18px">
        <h3>${t_('ov.today')}</h3>
        ${spread ? `
        <div class="grid-4" style="margin-top:10px">
          <div><div class="kpi-label">Highest temperature</div><div class="kpi-value" style="font-size:18px">${spread.hi.toFixed(2)} °C</div><div class="kpi-meta">${spread.hot.name}</div></div>
          <div><div class="kpi-label">Lowest temperature</div><div class="kpi-value" style="font-size:18px">${spread.lo.toFixed(2)} °C</div><div class="kpi-meta">${spread.cool.name}</div></div>
          <div><div class="kpi-label">Highest heat risk — ${cropLabel}</div><div class="kpi-value" style="font-size:18px">${topRisk ? topRisk.name : '—'}</div><div class="kpi-meta">${topRisk ? topRisk.t_max_c + ' °C · ' + (riskForTmax(crop, topRisk.t_max_c) === 'high' ? 'high' : riskForTmax(crop, topRisk.t_max_c) === 'medium' ? 'moderate' : 'low') + ' risk' : '—'}</div></div>
          <div><div class="kpi-label">${t_('ov.selected')}</div><div class="kpi-value" style="font-size:18px">${props ? props.name : '—'}</div><div class="kpi-meta">confidence ${props ? (props.confidence || '—') : '—'}</div></div>
        </div>
        ` : '<div class="empty">Run the downscaling to populate today\'s Panchayat picture.</div>'}
      </div>

      <div class="kpi-grid">
        ${kpis.map(k => `
          <div class="kpi${k.label === 'Data mode' && !state.serviceOk ? ' accent' : ''}">
            <div class="kpi-label">${k.label}</div>
            <div class="kpi-value">${k.value}</div>
            <div class="kpi-meta">${k.meta}</div>
          </div>
        `).join('')}
      </div>

      <div class="flow" style="margin-top:20px">
        <div class="flow-pane">
          <h4>${t_('ov.flow.block')}</h4>
          <div class="fp-head">${block ? block.name : 'Pilot block'} · ${block ? block.mean_elevation_m + ' m mean elevation' : '—'}</div>
          ${days.length ? `
            <div class="days">
              ${days.map(d => `
                <div class="day-row">
                  <span class="d-k">${d.date}</span>
                  <span class="d-v">${d.t_max_c} °C · rain ${d.rainfall_mm !== null && d.rainfall_mm !== undefined ? d.rainfall_mm + ' mm' : '—'}</span>
                </div>
              `).join('')}
            </div>
          ` : '<div class="empty">Block forecast not loaded.</div>'}
        </div>

        <div class="flow-arrow" aria-hidden="true">→</div>

        <div class="flow-pane">
          <h4>${t_('ov.flow.downscale')}</h4>
          ${spread ? `
            <div class="fp-head">${spread.count} Panchayats · ${spread.spread.toFixed(2)} °C spread</div>
            <div class="days">
              <div class="day-row"><span class="d-k">Warmest</span><span class="d-v">${spread.hot.name} · ${spread.hi.toFixed(2)} °C</span></div>
              <div class="day-row"><span class="d-k">Coolest</span><span class="d-v">${spread.cool.name} · ${spread.lo.toFixed(2)} °C</span></div>
              <div class="day-row"><span class="d-k">Range</span><span class="d-v">${spread.lo.toFixed(2)} – ${spread.hi.toFixed(2)} °C</span></div>
            </div>
            <div class="mt-2 flex" style="gap:8px">
              <button class="btn small primary" data-goto="map">Open Panchayat Map</button>
              <button class="btn small" data-goto="downscale">Re-run Downscaling</button>
            </div>
          ` : `
            <div class="empty">Run the downscaling to produce Panchayat-level estimates.</div>
            <div class="mt-1"><button class="btn small primary" data-goto="downscale">Run Downscaling</button></div>
          `}
        </div>
      </div>

      <div class="card" style="margin-top:20px">
        <h3>${t_('ov.selected')}</h3>
        ${props ? `
          <div class="flex" style="align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0 2px">
            <div style="font-size:19px;font-weight:750;color:var(--ink)">${props.name}</div>
            <span class="pill pill-src">${props.panchayat_id}</span>
            ${riskPill(riskForTmax(crop, props.t_max_c))}
            <span class="pill pill-src">${cropLabel}</span>
          </div>
          <div class="grid-4" style="margin-top:12px">
            <div><div class="kpi-label">Forecast t_max</div><div class="kpi-value">${props.t_max_c} °C</div><div class="kpi-meta">${props.valid_date || ''}</div></div>
            <div><div class="kpi-label">P10–P90 range</div><div class="kpi-value" style="font-size:16px">${props.range_low_c} – ${props.range_high_c} °C</div><div class="kpi-meta">indicative, uncalibrated</div></div>
            <div><div class="kpi-label">Confidence</div><div class="kpi-value" style="font-size:16px;text-transform:capitalize">${props.confidence || '—'}</div><div class="kpi-meta">from hindcast residuals</div></div>
            <div><div class="kpi-label">Elevation</div><div class="kpi-value" style="font-size:16px">${props.elevation_m} m</div><div class="kpi-meta">block mean ${blockMeanElevation() !== null ? blockMeanElevation() + ' m' : '—'}</div></div>
          </div>

          <h3 style="margin-top:20px">${t_('ov.why')}</h3>
          <div class="why-grid">
            <div class="why-cell"><div class="wc-k">Block baseline</div><div class="wc-v">${why.b1} °C</div><div class="wc-s">B1 block copy</div></div>
            <div class="why-op">+</div>
            <div class="why-cell"><div class="wc-k">RF local correction</div><div class="wc-v">${why.rf > 0 ? '+' : ''}${why.rf.toFixed(2)} °C</div><div class="wc-s">${(props.top_features || []).join(', ') || 'geophysical predictors'}</div></div>
            <div class="why-op">+</div>
            <div class="why-cell"><div class="wc-k">Consistency step</div><div class="wc-v">${why.adj > 0 ? '+' : ''}${why.adj.toFixed(2)} °C</div><div class="wc-s">area-weighted reconciliation</div></div>
            <div class="why-op">=</div>
            <div class="why-cell final"><div class="wc-k">Panchayat estimate</div><div class="wc-v">${why.fin} °C</div><div class="wc-s">${props.name}</div></div>
          </div>
          <div class="mt-2">
            <div class="why-cell" style="border-style:dashed">
              <div class="wc-k">Elevation lapse-rate baseline (B2)</div>
              <div class="wc-v" style="font-size:15px">${why.b2} °C</div>
              <div class="wc-s">${why.lapse > 0 ? '+' : ''}${why.lapse.toFixed(2)} °C vs the block value, from ${props.elevation_m} m against the block mean of ${blockMeanElevation()} m. Evaluated alongside the model as a named baseline — it is not added into the equation above.</div>
            </div>
          </div>

          <details class="disclosure">
            <summary>View provenance details</summary>
            <div class="disc-body">
              Data source: <b>${srcType === 'official' ? 'official' : srcType === 'historical_reference' ? 'historical reference data' : 'staged illustrative data'}</b><br/>
              Model version: <span class="code">${(state.downscale && state.downscale.meta && state.downscale.meta.model_version) || repro.model_version || '—'}</span><br/>
              Reference dataset: ${(state.downscale && state.downscale.meta && state.downscale.meta.reference_dataset) || '—'}<br/>
              Uncertainty: ${(state.downscale && state.downscale.meta && state.downscale.meta.uncertainty) || 'Indicative — uncalibrated'}<br/>
              Adjustment: ${(state.downscale && state.downscale.meta && state.downscale.meta.adjustment) || '—'}<br/>
              Boundary source: ${(state.downscale && state.downscale.meta && state.downscale.meta.boundary_source) || '—'}
            </div>
          </details>
        ` : '<div class="empty">Run the downscaling to inspect a Panchayat estimate.</div>'}
      </div>

      <div class="card" style="margin-top:20px">
        <h3>${t_('ov.chain')}</h3>
        <p class="t-sm t-muted" style="margin:4px 0 0">How a Block forecast becomes an operational decision for ${cropLabel} at the selected Panchayat.</p>
        ${chainHTML(crop)}
      </div>

      ${copilotHTML()}
    `;
  }

  // ============================================================
  //  AGRO-WEATHER COPILOT
  //  It interprets the deterministic outputs above and never produces weather values: every
  //  number it states is read from the current forecast, and every action comes from the same
  //  rules layer the Advisory screen uses. An assistant endpoint is used for phrasing only if
  //  one is configured; without it (or on any failure) the local explanation is used, so the
  //  panel always answers and never blocks the page.
  // ============================================================
  const COPILOT_CHIPS = [
    'Which Panchayat is hottest?',
    'Why is this Panchayat hotter?',
    'What should I do for tomato?',
    'Summarise the risk today',
  ];

  function cropMapNow() {
    const c = state.advisoryRules && state.advisoryRules.crops;
    return (c && !Array.isArray(c)) ? c : null;
  }

  function cropLabelNow() {
    const m = cropMapNow();
    const key = state.crop || 'tomato';
    return (m && m[key] && m[key].label) || key;
  }

  function copilotHTML() {
    const ans = state.copilotAnswer;
    return `
      <div class="copilot" style="margin-top:20px">
        <div class="copilot-top">
          <span aria-hidden="true" style="font-size:16px;color:var(--amber)">◎</span>
          <div style="min-width:0">
            <div class="cp-title">${t_('ov.assistant')}</div>
            <div class="cp-sub">Explains the current forecast and advisory. It does not compute or change weather values.</div>
          </div>
        </div>
        <div class="cp-body">
          <div id="cpAnswer">${ans ? `<div class="cp-msg answer">${ans.html}</div>` : '<span class="cp-msg">Ask about this forecast using a prompt below, or type your own question.</span>'}</div>
          <div class="cp-chips">
            ${COPILOT_CHIPS.map(c => `<button class="cp-chip" type="button" data-cp="${c}">${c}</button>`).join('')}
          </div>
          <div class="cp-input-row">
            <input type="text" id="cpInput" placeholder="Ask about the forecast, a Panchayat or a crop…" />
            <button class="btn small primary" type="button" id="cpSend">Ask</button>
          </div>
          <div class="cp-note" id="cpNote">${ans && ans.mode === 'assistant'
            ? 'Explanation composed by the configured assistant from the values shown on this page.'
            : 'Local explanation — computed from the values currently shown.'} Thresholds are configurable defaults, not agronomic prescriptions.</div>
        </div>
      </div>
    `;
  }

  // The exact structured context the copilot can reason over. No weather value is ever
  // generated here — this is a read-only view of what the pipeline already produced.
  function copilotContext() {
    const block = state.block && state.block.block;
    const sel = selectedFeature();
    return {
      block: block ? { name: block.name, district: block.district, state: block.state, mean_elevation_m: block.mean_elevation_m } : null,
      forecast_days: ((state.forecast && state.forecast.days) || []).map(d => ({ date: d.date, t_max_c: d.t_max_c, rainfall_mm: d.rainfall_mm })),
      panchayats: uniquePanchayatFeatures().map(f => ({
        panchayat: f.properties.name,
        panchayat_id: f.properties.panchayat_id,
        t_max_c: f.properties.t_max_c,
        p10_c: f.properties.range_low_c,
        p90_c: f.properties.range_high_c,
        confidence: f.properties.confidence,
        elevation_m: f.properties.elevation_m,
        b1_block_copy_c: f.properties.b1_t_max_c,
        b2_lapse_rate_c: f.properties.b2_t_max_c,
        top_features: f.properties.top_features,
      })),
      selected_panchayat_id: sel ? sel.properties.panchayat_id : null,
      crop: state.crop || 'tomato',
      data_mode: state.serviceOk ? 'live_service' : 'staged_illustrative',
    };
  }

  function copilotAnswer(qRaw) {
    const q = String(qRaw || '').toLowerCase();
    const feats = uniquePanchayatFeatures();
    const feat = selectedFeature();
    if (!feat || !feats.length) {
      return '<b>No Panchayat estimates yet.</b> Run the downscaling on the <b>Weather Downscaling</b> screen and ask again.';
    }
    const props = feat.properties;
    const crop = state.crop || 'tomato';
    const cropLabel = cropLabelNow();
    const adv = computeAdvisory(crop) || {};
    const risk = riskForTmax(crop, props.t_max_c);
    const sorted = feats.slice().sort((a, b) => b.properties.t_max_c - a.properties.t_max_c);
    const hot = sorted[0].properties;
    const cool = sorted[sorted.length - 1].properties;
    const block = state.block && state.block.block;

    if (/(hottest|warmest|highest|which).*panchayat/.test(q) && !/why|explain/.test(q)) {
      const above = feats.filter(f => riskForTmax(crop, f.properties.t_max_c) === 'high').length;
      return `<b>${hot.name}</b> is the warmest Panchayat at <b>${hot.t_max_c} °C</b> (P10–P90 ${hot.range_low_c}–${hot.range_high_c} °C, elevation ${hot.elevation_m} m), and <b>${cool.name}</b> the coolest at <b>${cool.t_max_c} °C</b> — a ${(hot.t_max_c - cool.t_max_c).toFixed(2)} °C spread across ${feats.length} Panchayats. For ${cropLabel}, <b>${above}</b> of ${feats.length} cross the high-heat threshold.`;
    }

    if (/why|explain|reason|hotter|cooler/.test(q)) {
      const w = whyThisPanchayat(props);
      return `<b>${props.name}</b> is estimated at <b>${props.t_max_c} °C</b>. The Block baseline is ${w.b1} °C; the Random Forest applies a local correction of ${w.rf > 0 ? '+' : ''}${w.rf.toFixed(2)} °C (${w.rf > 0 ? 'warmer' : 'cooler'} than the block value), and the area-weighted consistency step contributes ${w.adj > 0 ? '+' : ''}${w.adj.toFixed(2)} °C. The predictors it leaned on here are ${(props.top_features || []).join(', ') || 'geophysical terrain terms'}. An elevation lapse-rate baseline (B2) would place it at ${w.b2} °C (${w.lapse > 0 ? '+' : ''}${w.lapse.toFixed(2)} °C versus the block) — that is evaluated as a named comparison baseline, not added into the estimate. The uncertainty range is indicative and uncalibrated.`;
    }

    if (/should i|what.*do|action|advice|advisory|tomato|onion|grape|wheat|soybean|banana/.test(q)) {
      const lvl = risk === 'high' ? 'high' : risk === 'medium' ? 'moderate' : 'low';
      return `For <b>${cropLabel}</b> at ${props.name}, the forecast maximum of ${props.t_max_c} °C puts this at <b>${lvl} heat risk</b>${adv.threshold !== undefined ? ` (configured trigger ${adv.threshold} °C)` : ''}. <b>Recommended action:</b> ${adv.action || 'No configured threshold is crossed.'} <b>Field operation:</b> ${adv.field_operation || '—'}`;
    }

    if (/summar|overview|today|risk/.test(q)) {
      const counts = { high: 0, medium: 0, none: 0 };
      feats.forEach(f => { counts[riskForTmax(crop, f.properties.t_max_c)]++; });
      const days = (state.forecast && state.forecast.days) || [];
      return `Across ${feats.length} Panchayats in ${block ? block.name : 'the pilot block'} over the current ${days.length}-day window: <b>${counts.high}</b> at high heat risk, <b>${counts.medium}</b> at moderate and <b>${counts.none}</b> low, using ${cropLabel} thresholds. Warmest is ${hot.name} at ${hot.t_max_c} °C. ${counts.high ? 'Prioritise harvest timing and irrigation in the high-risk Panchayats.' : 'No Panchayat crosses the high-risk threshold for this crop.'}`;
    }

    return `I can explain the forecast currently on screen: <b>${feats.length}</b> Panchayats, warmest ${hot.name} at <b>${hot.t_max_c} °C</b>, selected ${props.name}. Ask why a Panchayat is warmer or cooler, what to do for ${cropLabel}, or for a risk summary.`;
  }

  function renderCopilotAnswer() {
    const el = $('#cpAnswer');
    if (!el) return;
    const ans = state.copilotAnswer;
    el.innerHTML = ans
      ? `<div class="cp-msg answer">${ans.html}</div>`
      : '<span class="cp-msg">Ask about this forecast using a prompt below, or type your own question.</span>';
    const note = $('#cpNote');
    if (note) {
      note.textContent = (ans && ans.mode === 'assistant'
        ? 'Explanation composed by the configured assistant from the values shown on this page.'
        : 'Local explanation — computed from the values currently shown.') +
        ' Thresholds are configurable defaults, not agronomic prescriptions.';
    }
  }

  async function postJson(url, body, timeoutMs) {
    const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    let timer = null;
    if (timeoutMs && typeof AbortController !== 'undefined') {
      const ctrl = new AbortController();
      init.signal = ctrl.signal;
      timer = setTimeout(() => ctrl.abort(), timeoutMs);
    }
    try {
      const resp = await fetch(url, init);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function askCopilot(question) {
    const q = String(question || '').trim();
    if (!q) return;
    const el = $('#cpAnswer');
    const local = copilotAnswer(q);
    const endpoint = window.KS_AI_ENDPOINT || null;
    if (el) el.innerHTML = '<span class="cp-msg t-muted">Reading the current forecast…</span>';
    let html = local;
    let mode = 'local';
    if (endpoint) {
      try {
        const resp = await postJson(endpoint, {
          question: q,
          context: copilotContext(),
          instructions: 'Answer only from the supplied context. Do not invent, round or change any weather value.',
        }, 9000);
        const text = resp && (resp.answer || resp.text || resp.content);
        if (text) { html = text; mode = 'assistant'; }
      } catch (err) {
        html = local;
        mode = 'local';
      }
    }
    state.copilotAnswer = { html, mode };
    renderCopilotAnswer();
  }

  function wireCopilot() {
    document.querySelectorAll('[data-cp]').forEach(b => {
      b.addEventListener('click', () => askCopilot(b.dataset.cp));
    });
    const send = $('#cpSend');
    const input = $('#cpInput');
    const submit = () => {
      const v = input && input.value;
      if (v && v.trim()) { askCopilot(v); input.value = ''; }
    };
    if (send) send.addEventListener('click', submit);
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    // The header nav is wired once in wireSectionActions(); these in-section jumps are re-bound
    // on every overview render because the section markup is rebuilt.
    document.querySelectorAll('[data-goto]').forEach(b => {
      b.addEventListener('click', () => renderRoute(b.dataset.goto));
    });
  }

  // ============================================================
  //  ALERT CENTRE — every alert is derived from the current forecast and the configured
  //  thresholds, so nothing here can contradict the numbers on the other screens.
  // ============================================================
  function computeAlerts() {
    const out = [];
    const feats = uniquePanchayatFeatures();
    const crop = state.crop || 'tomato';
    const cropLabel = cropLabelNow();

    if (!feats.length) {
      out.push({ sev: 'info', icon: 'ℹ', title: 'No downscaled forecast loaded',
        body: 'Run the downscaling to generate Panchayat estimates and risk alerts.',
        meta: 'Weather Downscaling', route: 'downscale' });
    } else {
      const risky = feats.filter(f => riskForTmax(crop, f.properties.t_max_c) === 'high')
        .sort((a, b) => b.properties.t_max_c - a.properties.t_max_c);
      if (risky.length) {
        const top = risky[0].properties;
        out.push({ sev: 'high', icon: '▲', title: 'Heat risk — ' + cropLabel,
          body: risky.length + ' of ' + feats.length + ' Panchayats cross the configured high-heat threshold. Highest: ' + top.name + ' at ' + top.t_max_c + ' °C.',
          meta: 'Advisory · recommended action available', route: 'advisory' });
      }
      const warm = feats.slice().sort((a, b) => b.properties.t_max_c - a.properties.t_max_c)[0].properties;
      out.push({ sev: 'medium', icon: '●', title: 'Warmest Panchayat — ' + warm.name,
        body: 'Estimated t_max ' + warm.t_max_c + ' °C (P10–P90 ' + warm.range_low_c + '–' + warm.range_high_c + ' °C), elevation ' + warm.elevation_m + ' m.',
        meta: 'Panchayat Map · open the detail panel', route: 'map' });
    }

    out.push({ sev: 'info', icon: 'ℹ', title: 'Rainfall risk not enabled',
      body: 'The rainfall layer (P1) ships only once its residual model validates. It is not validated in this build, so the heat-risk path is the active advisory.',
      meta: 'Configured rainfall thresholds remain visible under Advisory', route: 'advisory' });

    if (!state.serviceOk) {
      out.push({ sev: 'info', icon: 'ℹ', title: 'Staged data mode',
        body: 'A live weather service is not connected. The platform is running on its bundled staged dataset, produced by the same Random Forest residual model.',
        meta: 'Data & Provenance', route: 'provenance' });
    }

    out.push({ sev: 'info', icon: 'ℹ', title: 'Illustrative boundaries',
      body: 'Panchayat polygons are a schematic pilot grid used so the pipeline can run — they are not official Gram Panchayat boundaries.',
      meta: 'Methodology and Data & Provenance', route: 'methodology' });

    return out;
  }

  function buildAlertsSection() {
    main.innerHTML += `
      <section class="section" id="s-alerts">
        <div class="section-head">
          <div class="eyebrow">Alert centre</div>
          <h2 class="section-title">Weather and advisory <span class="hl">alerts</span></h2>
          <p class="section-sub">
            Alerts are generated from the current Panchayat forecast and the configured advisory
            thresholds. Each one links to the screen where you can act on it.
          </p>
        </div>
        <div class="alert-list" id="alertsList"></div>
      </section>
    `;
  }

  function renderAlerts() {
    const list = $('#alertsList');
    const items = computeAlerts();
    if (list) {
      list.innerHTML = items.map(a => `
        <div class="alert sev-${a.sev}">
          <div class="a-icon" style="color:${a.sev === 'high' ? 'var(--risk-high)' : a.sev === 'medium' ? 'var(--risk-medium)' : 'var(--primary)'}">${a.icon}</div>
          <div style="min-width:0">
            <div class="a-title">${a.title}</div>
            <div class="a-body">${a.body}</div>
            ${a.meta ? `<div class="a-meta">${a.meta}</div>` : ''}
          </div>
          ${a.route ? `<button class="btn small" type="button" data-alert-route="${a.route}">Open</button>` : '<span></span>'}
        </div>
      `).join('');
      list.querySelectorAll('[data-alert-route]').forEach(b => {
        b.addEventListener('click', () => renderRoute(b.dataset.alertRoute));
      });
    }
    const badge = $('#alertsBadge');
    if (badge) {
      const n = items.filter(a => a.sev === 'high').length;
      badge.hidden = n === 0;
      badge.textContent = String(n);
    }
  }

  // ============================================================
  //  DOWNSCALE
  // ============================================================
  function buildDownscale() {
    const block = state.block && state.block.block;
    main.innerHTML += `
      <section class="section" id="s-downscale">
        <div class="section-head">
          <div class="eyebrow">Step 2 · Weather Downscaling</div>
          <h2 class="section-title">Block Forecast → <span class="hl">Panchayat Downscaling</span></h2>
          <p class="section-sub">
            Submit a Block-level (coarse) forecast for ${block ? block.name : 'the pilot block'} and the
            pipeline produces Panchayat-level temperature and rainfall estimates for each day, with an
            indicative uncertainty range, the top contributing features, and full provenance.
          </p>
        </div>

        <div class="grid-2">
          <div>
            <div class="card">
              <h3>Block</h3>
              <div class="field" style="margin-top:8px">
                <label for="blockIdInput">Block ID</label>
                <input type="text" id="blockIdInput" value="${state.selectedBlockId}" placeholder="LGD-271012"
                  style="font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:.3px">
              </div>
              <div class="field" style="margin-top:12px">
                <label for="daysInput">Forecast days (1–14)</label>
                <input type="number" id="daysInput" value="3" min="1" max="14" style="width:90px">
              </div>
              <div class="field" style="margin-top:12px">
                <label for="startDateInput">Start date (ISO YYYY-MM-DD)</label>
                <input type="text" id="startDateInput" value="2026-04-18" placeholder="2026-04-18">
              </div>
              <button class="btn primary mt-2" id="runDownscaleBtn">Run Downscaling</button>
              <p class="text-xs muted mt-1">
                The coarse forecast uses a seeded illustrative fixture (<span class="code">simulated_demo</span>).
                The pipeline applies B1, B2 and the Random Forest residual correction to produce
                Panchayat-level output.
              </p>
            </div>

            <div class="card mt-2" id="downscaleResultCard" style="display:none">
              <h3>Downscaling result</h3>
              <div class="row"><span class="k">Block</span><span class="v" id="dsBlock">—</span></div>
              <div class="row"><span class="k">Source type</span><span class="v" id="dsSource">—</span></div>
              <div class="row"><span class="k">Model version</span><span class="v" id="dsModel">—</span></div>
              <div class="row"><span class="k">Panchayats</span><span class="v" id="dsPanchayatCount">—</span></div>
              <div class="row"><span class="k">Days returned</span><span class="v" id="dsDayCount">—</span></div>
              <div class="row"><span class="k">Mean t_max_c</span><span class="v" id="dsMeanTmax">—</span></div>
              <div class="row"><span class="k">Min t_max_c</span><span class="v" id="dsMinTmax">—</span></div>
              <div class="row"><span class="k">Max t_max_c</span><span class="v" id="dsMaxTmax">—</span></div>
              <div class="row"><span class="k">Confidence</span><span class="v" id="dsConfidence">—</span></div>
              <div class="row"><span class="k">Consistency check</span><span class="v" id="dsConsistency">—</span></div>
              <div class="mt-2 text-xs muted" id="dsDisclosure" style="line-height:1.5"></div>
              <div class="mt-2 flex">
                <button class="btn small primary" id="dsGoToMap">Open Panchayat Map</button>
                <button class="btn small" id="dsGoToValidation">Open Validation</button>
              </div>
            </div>
          </div>

          <div>
            <div class="card">
              <h3>Coarse (Block) forecast — inputs</h3>
              <div id="coarseForecastBox">
                ${renderCoarseForecast(state.forecast)}
              </div>
              <div class="mt-2 disclaimer-box">
                <b>Labels stay honest.</b> If the live service is unreachable, every response carries
                <span class="code">source_type: simulated_demo</span> and the provenance panel explains
                exactly which adapters are wired up. A fallback never upgrades provenance.
              </div>
            </div>
          </div>
        </div>
      </section>
    `;

    // Controls are wired once in wireSectionActions(), after every section exists.
  }

  function renderCoarseForecast(fc) {
    if (!fc || !fc.days || !fc.days.length) {
      return '<div class="empty">No block forecast loaded. Run the downscaling below or check the service connection.</div>';
    }
    const rows = fc.days.map(d => `
      <div class="row">
        <span class="k">${d.date}</span>
        <span class="v">t_max ${d.t_max_c}°C · t_min ${d.t_min_c !== null && d.t_min_c !== undefined ? d.t_min_c : '—'}°C · rain ${d.rainfall_mm !== null && d.rainfall_mm !== undefined ? d.rainfall_mm : '—'} mm</span>
      </div>
    `).join('');
    return `
      <div class="text-xs muted mb-1">source_type: <span class="code">${fc.source_type || '—'}</span> · ${fc.note || ''}</div>
      <div class="text-xs muted mb-1">${plainLabel(fc.disclaimer)}</div>
      ${rows}
    `;
  }

  async function runDownscale() {
    if (state.loading) return;
    const blockId = $('#blockIdInput').value.trim() || DEFAULT_BLOCK_ID;
    const days = Math.max(1, Math.min(14, parseInt($('#daysInput').value, 10) || 3));
    const start = $('#startDateInput').value.trim() || '2026-04-18';

    // Build the seeded forecast days locally (same deterministic function the backend uses)
    // so the UI and the service agree on the demo numbers. We then POST the *same* numbers to
    // the service, which returns the downscale. If the service is unreachable, we run the
    // downscaling *here* using the bundled snapshot. This keeps the demo usable offline while
    // the backend stays authoritative when reachable.
    state.loading = true;
    $('#runDownscaleBtn').disabled = true;
    $('#runDownscaleBtn').textContent = 'Running…';

    try {
      // 1) Try the live service first.
      const forecastResp = await fetchJson('/weather/demo-forecast?block_id=' + encodeURIComponent(blockId) + '&days=' + days);
      const daysPayload = forecastResp.days.map(d => ({
        date: d.date,
        t_max_c: d.t_max_c,
        t_min_c: d.t_min_c,
        rainfall_mm: d.rainfall_mm,
        lead_days: d.lead_days,
      }));
      state.forecast = forecastResp;

      const result = await fetchJson('/weather/downscale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block_id: blockId, forecast: daysPayload }),
      });
      state.downscale = result;
      state.selectedBlockId = blockId;
      state.selectedPanchayatId = null;
      renderDownscaleResult(result, blockId, days);
      const uq = new Set((result.features || []).map(f => f.properties && f.properties.panchayat_id).filter(Boolean)).size;
      toast('Downscaling complete — ' + uq + ' Panchayats × ' + days + ' day' + (days === 1 ? '' : 's'), 'ok');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          // Service not reachable at this path — run the demo locally using the
          // bundled snapshot if present, otherwise show a clear empty state.
          runDownscaleOffline(blockId, days, start);
        } else if (err.status === 422) {
          toast('Invalid request: ' + (err.message || ''), 'warn');
        } else {
          toast('Service error ' + err.status + ': ' + (err.message || ''), 'warn');
          runDownscaleOffline(blockId, days, start);
        }
      } else {
        runDownscaleOffline(blockId, days, start);
      }
    } finally {
      state.loading = false;
      $('#runDownscaleBtn').disabled = false;
      $('#runDownscaleBtn').textContent = 'Run Downscaling';
      // The Overview and the alert centre read the latest result, so refresh them once the run settles.
      refreshOverview();
      renderAlerts();
    }
  }

  function renderDownscaleResult(result, blockId, days) {
    const card = $('#downscaleResultCard');
    card.style.display = 'block';
    const feats = result.features || [];
    $('#dsBlock').textContent = blockId;
    $('#dsSource').textContent = result.meta && result.meta.source_type ? result.meta.source_type : '—';
    $('#dsModel').textContent = result.meta && result.meta.model_version ? result.meta.model_version : '—';
    // The result carries one feature per Panchayat per day; report unique Panchayats.
    const uniqPanchayats = new Set(feats.map(f => f.properties && f.properties.panchayat_id).filter(Boolean)).size;
    $('#dsPanchayatCount').textContent = uniqPanchayats || feats.length;
    $('#dsDayCount').textContent = days;
    const tmaxes = feats.map(f => f.properties && f.properties.t_max_c).filter(v => v !== undefined && v !== null);
    $('#dsMeanTmax').textContent = tmaxes.length ? (tmaxes.reduce((a,b)=>a+b,0)/tmaxes.length).toFixed(2) + '°C' : '—';
    $('#dsMinTmax').textContent = tmaxes.length ? Math.min(...tmaxes).toFixed(2) + '°C' : '—';
    $('#dsMaxTmax').textContent = tmaxes.length ? Math.max(...tmaxes).toFixed(2) + '°C' : '—';
    const confs = [...new Set(feats.map(f => (f.properties && f.properties.confidence) || 'low'))];
    $('#dsConfidence').textContent = confs.join(', ') || 'low';
    const cc = (result.meta && result.meta.consistency_check) || [];
    $('#dsConsistency').textContent = cc.length
      ? (cc[0].passed ? 'passed (Δ ' + cc[0].abs_difference + ')' : 'failed (Δ ' + cc[0].abs_difference + ')')
      : '—';
    $('#dsDisclosure').innerHTML = `
      <b>Provenance</b>: ${result.meta && result.meta.source_type ? result.meta.source_type : '—'}<br>
      <b>Reference dataset</b>: ${result.meta && result.meta.reference_dataset ? result.meta.reference_dataset : '—'}<br>
      <b>Adjustment</b>: ${result.meta && result.meta.adjustment ? result.meta.adjustment : '—'}<br>
      <b>Uncertainty</b>: ${result.meta && result.meta.uncertainty ? result.meta.uncertainty : '—'}<br>
      ${result.meta && result.meta.warnings && result.meta.warnings.length ? '<b>Warnings</b>: ' + result.meta.warnings.join('; ') + '<br>' : ''}
    `;
  }

  // ---------- offline fallback downscaling ----------
  // The backend ships a bundled snapshot (window.KS_WEATHER_BUNDLE) when the dashboard is
  // built. The standalone product does NOT depend on that dashboard, but IF the snapshot is
  // available on the page (e.g. an operator inlines it), we can use it as an offline fallback.
  // If it is not available, we generate a small offline downscale ourselves using the same
  // formulas the backend uses (B1, B2, RF-structure mean-preserving), labelled simulated_demo.
  // This is an honest fallback, not a hidden upgrade.

  function runDownscaleOffline(blockId, days, start) {
    // Try to use a bundled snapshot if the page happens to have one (optional, never required).
    const bundle = window.KS_WEATHER_BUNDLE;
    if (bundle && bundle.downscale && bundle.downscale.features) {
      state.downscale = bundle.downscale;
      state.selectedBlockId = blockId;
      state.selectedPanchayatId = null;
      // Adapt the bundle result to our rendering by setting forecast from bundle too.
      if (bundle.forecast) state.forecast = bundle.forecast;
      const bdays = bundle.forecast && bundle.forecast.days ? bundle.forecast.days.length : days;
      renderDownscaleResult(bundle.downscale, blockId, bdays);
      showBanner('Using bundled snapshot for offline downscaling. Responses are labelled <b>simulated_demo</b>.', 'warn');
      toast('Offline downscaling using bundled snapshot', 'warn');
      return;
    }

    // Generate an offline illustrative downscale ourselves, using the SAME math the backend
    // implements (B1, B2, area-weighted mean-preserving adjustment). We do NOT claim a trained
    // model here; we label everything simulated_demo and disclose that the trained RF is only
    // available from the live service.
    const panchayats = state.panchayats;
    if (!panchayats.length) {
      toast('No pilot block data available — cannot run offline downscaling. Start the service or select a block.', 'warn');
      return;
    }

    // Build seeded forecast days (mirror the backend seeded adapter's seasonal function).
    const seededDays = buildSeededForecastDays(start, days);

    // Coarse forecast block
    const block = {
      block_id: blockId,
      name: (state.block && state.block.block && state.block.block.name) || blockId,
      district: (state.block && state.block.block && state.block.block.district) || '',
      state: (state.block && state.block.block && state.block.block.state) || '',
      mean_elevation_m: state.block && state.block.block ? state.block.block.mean_elevation_m : areaWeightedElevation(panchayats),
      panchayats,
    };

    // Run the offline downscaling using the same formulas.
    const result = offlineDownscale(block, seededDays);
    state.downscale = result;
    state.selectedBlockId = blockId;
    state.selectedPanchayatId = null;
    state.forecast = {
      block_id: blockId,
      source_type: 'simulated_demo',
      disclaimer: 'Illustrative staged data — offline fallback',
      days: seededDays,
      note: 'Seeded illustrative block forecast (offline fallback)',
    };

    renderDownscaleResult(result, blockId, days);
    showBanner('Live service not reachable. Showing an <b>illustrative offline fallback</b> (B1/B2 + mean-preserving adjustment, no trained RF). Responses are labelled <b>simulated_demo</b>.', 'warn');
    toast('Offline illustrative downscaling (no trained RF) — service not reachable', 'warn');
  }

  // ---------- seeded forecast day builder (matches backend seeded adapter) ----------
  function buildSeededForecastDays(startIso, n) {
    const start = new Date(startIso + 'T00:00:00');
    if (isNaN(start.getTime())) {
      // fallback to the deterministic backend default window
      start.setTime(Date.UTC(2026, 3, 18, 0, 0, 0));
    }
    const BASE_TMAX_MEAN_C = 32.5;
    const SEASONAL_AMP_C = 5.5;
    const SEASONAL_PEAK_DOY = 120;
    const BLOCK_NOISE_SIGMA_C = 1.0;
    const RAIN_SEASON_AMP_MM = 14.0;
    const RAIN_SEASON_PEAK_DOY = 205;
    const RAIN_FLOOR_MM = 0.0;
    const RAIN_NOISE_SIGMA_MM = 1.2;

    function doy(d) {
      const y = d.getUTCFullYear();
      const startOfYear = new Date(Date.UTC(y, 0, 1));
      return Math.floor((d - startOfYear) / 86400000);
    }
    function seasonalTmax(d) {
      const phase = 2 * Math.PI * (doy(d) - SEASONAL_PEAK_DOY) / 365.25;
      return BASE_TMAX_MEAN_C + SEASONAL_AMP_C * Math.cos(phase);
    }
    function seasonalRain(d) {
      const phase = 2 * Math.PI * (doy(d) - RAIN_SEASON_PEAK_DOY) / 365.25;
      return Math.max(RAIN_FLOOR_MM, RAIN_SEASON_AMP_MM * (0.5 + 0.5 * Math.cos(phase)));
    }
    // Deterministic pseudo-random using the same seed scheme as the backend
    function rngFor(dateIso, blockId) {
      const ord = dayToOrdinal(dateIso);
      const h = hashBlock(blockId);
      let s = 42 + ord + (Math.abs(h) % 9973);
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return (s - 0x40000000) / 0x7fffffff; // approx uniform [-1,1]-ish
      };
    }
    function dayToOrdinal(iso) {
      const d = new Date(iso + 'T00:00:00');
      const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0));
      return Math.floor((d - start) / 86400000);
    }
    function hashBlock(id) {
      let h = 0;
      for (let i = 0; i < id.length; i++) {
        h = (h * 31 + id.charCodeAt(i)) | 0;
      }
      return h;
    }

    const out = [];
    const pad = n > 1 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const iso = d.getUTCFullYear() + '-' +
        String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(d.getUTCDate()).padStart(2, '0');
      const rng = rngFor(iso, state.selectedBlockId || 'LGD-271012');
      const tmax = Math.round((seasonalTmax(d) + (rng() * BLOCK_NOISE_SIGMA_C * 2 - BLOCK_NOISE_SIGMA_C)) * 10) / 10;
      const tmin = Math.round((tmax - (9 + rng() * 4)) * 10) / 10;
      const rain = Math.round(Math.max(RAIN_FLOOR_MM, seasonalRain(d) + (rng() * RAIN_NOISE_SIGMA_MM * 2 - RAIN_NOISE_SIGMA_MM)) * 10) / 10;
      out.push({
        date: iso,
        t_max_c: tmax,
        t_min_c: tmin,
        rainfall_mm: rain,
        lead_days: i + 1,
      });
    }
    return out;
  }

  // ---------- offline downscale (B1, B2, mean-preserving additive) ----------
  function offlineDownscale(block, days) {
    const panchayats = block.panchayats;
    const w = areaWeights(panchayats);
    const zbar = block.mean_elevation_m;
    const LAPSE = 6.5;

    const features = [];
    const dayChecks = [];
    for (const day of days) {
      const blockT = day.t_max_c;
      const b1 = {};
      const b2 = {};
      const raw = {};
      for (const p of panchayats) {
        b1[p.panchayat_id] = blockT;
        b2[p.panchayat_id] = blockT - LAPSE * (p.elevation_m - zbar) / 1000;
        // Offline: no trained RF, so raw = B1 (baseline-only). Disclosure makes this honest.
        raw[p.panchayat_id] = blockT;
      }
      // area-weighted mean preserving (additive for temperature)
      const wmean = sumWeighted(raw, w);
      const offset = blockT - wmean;
      const adjusted = {};
      for (const pid in raw) adjusted[pid] = raw[pid] + offset;

      const check = {
        date: day.date,
        area_weighted_panchayat_mean: round(sumWeighted(adjusted, w), 6),
        block_value: blockT,
        abs_difference: round(Math.abs(sumWeighted(adjusted, w) - blockT), 9),
        passed: Math.abs(sumWeighted(adjusted, w) - blockT) <= 1e-6,
        tolerance: 1e-6,
        note: 'Consistency / reconciliation check only. Passing it does not imply forecast accuracy.',
      };
      dayChecks.push(check);

      for (const p of panchayats) {
        const anomaly = 0; // baseline-only offline fallback
        const props = {
          panchayat_id: p.panchayat_id,
          lgd_code: p.lgd_code,
          name: p.name,
          valid_date: day.date,
          lead_days: day.lead_days,
          t_max_c: round(adjusted[p.panchayat_id], 2),
          model_raw_t_max_c: round(raw[p.panchayat_id], 2),
          b1_t_max_c: round(b1[p.panchayat_id], 2),
          b2_t_max_c: round(b2[p.panchayat_id], 2),
          anomaly_c: round(anomaly, 3),
          range_low_c: round(adjusted[p.panchayat_id] - 1.0, 2),
          range_high_c: round(adjusted[p.panchayat_id] + 1.0, 2),
          confidence: 'low',
          top_features: ['elevation', 'slope', 'aspect'],
          top_feature_contributions: [
            { feature: 'elevation', contribution: 0.5 },
            { feature: 'slope', contribution: 0.2 },
            { feature: 'aspect', contribution: 0.15 },
            { feature: 'latitude', contribution: 0.05 },
            { feature: 'ndvi', contribution: 0.05 },
            { feature: 'land cover', contribution: 0.05 },
          ],
          top_features_basis: 'offline illustrative fallback — no trained model available; geophysical covariates shown for structure only',
          explanation: 'Offline illustrative fallback — no trained Random Forest available. This Panchayat is shown at the block value with a mean-preserving area-weighted adjustment. Connect the live service to see the trained residual correction.',
          rainfall_mm: day.rainfall_mm !== null && day.rainfall_mm !== undefined ? day.rainfall_mm : null,
          rainfall_raw_mm: day.rainfall_mm !== null && day.rainfall_mm !== undefined ? day.rainfall_mm : null,
          range_low_mm: day.rainfall_mm !== null && day.rainfall_mm !== undefined ? Math.max(0, round(day.rainfall_mm - 1.5, 2)) : null,
          range_high_mm: day.rainfall_mm !== null && day.rainfall_mm !== undefined ? round(day.rainfall_mm + 1.5, 2) : null,
          rainfall_status: 'p1_unvalidated_fallback_to_block_copy',
          rainfall_disclosure: 'P1 not validated in this build — rainfall shown as block copy only',
          elevation_m: round(p.elevation_m, 1),
          area_km2: round(p.area_km2, 4),
          area_weight: round(w[p.panchayat_id], 6),
          boundary_source: p.boundary_source || 'Illustrative pilot grid (schematic cell boundaries)',
        };
        features.push({
          type: 'Feature',
          properties: props,
          geometry: p.geometry,
        });
      }
    }

    return {
      type: 'FeatureCollection',
      meta: {
        model_version: 'rf-residual-temp-v0.3 (offline fallback — no trained model)',
        boundary_source: block.boundary_source || 'illustrative-schematic-grid-pilot',
        boundary_provenance: { source_type: 'simulated_demo', source_name: 'Illustrative pilot grid (schematic cell boundaries)', source_url: 'n/a', license: 'n/a — schematic placeholder', is_live: false, note: 'NOT official Gram Panchayat boundaries.' },
        source_type: 'simulated_demo',
        reference_dataset: 'Staged hindcast reference (synthetic, deterministic) — offline fallback',
        reference_dataset_note: 'Offline fallback: no live service, no trained model. Values are illustrative.',
        adjustment: 'mean-preserving, area-weighted — additive for temperature (offline fallback; trained RF not available)',
        validation: { type: 'reanalysis_hindcast', test_period: '2023-01-01–2024-12-31', skill_vs_block_copy: null, track_b_available: false, disclaimer: 'Reanalysis hindcast validation — not operational forecast skill.', uncertainty: 'Indicative — uncalibrated' },
        consistency_check: dayChecks,
        top_features_note: 'Offline fallback — top features shown for structure only; no trained model.',
        uncertainty_note: 'Offline fallback — indicative ranges only.',
        provenance: {
          forecast_input: { source_type: 'simulated_demo', source_name: 'Seeded block forecast (illustrative)', source_url: 'n/a', license: 'n/a — generated fixture', is_live: false, note: 'Offline fallback.' },
          reference_dataset: { source_type: 'simulated_demo', source_name: 'Staged hindcast reference (synthetic, deterministic)', source_url: 'n/a', license: 'n/a — generated fixture', is_live: false, note: 'Offline fallback.' },
          boundaries: { source_type: 'simulated_demo', source_name: 'Illustrative pilot grid (schematic cell boundaries)', source_url: 'n/a', license: 'n/a — schematic placeholder', is_live: false, note: 'NOT official.' },
          note: 'Provenance does not change because of a fallback; fallbacks are disclosed, not hidden.',
        },
        issued_at: new Date().toISOString(),
        generated_at: new Date().toISOString(),
        warnings: ['Offline fallback: no trained Random Forest. Connect the live service to see the trained residual correction and real validation metrics.'],
        disclaimers: {
          demo_data: 'Illustrative staged data',
          historical_reference: 'Historical reference',
          hindcast: 'Reanalysis hindcast validation — not operational forecast skill.',
          uncalibrated: 'Indicative — uncalibrated',
          track_b: 'No suitable station observations are configured for this block.',
        },
      },
      features,
    };
  }

  // ---------- helpers ----------
  function areaWeights(panchayats) {
    const total = panchayats.reduce((s, p) => s + (p.area_km2 || 0), 0);
    if (total <= 0) throw new Error('total panchayat area is zero');
    const w = {};
    panchayats.forEach(p => { w[p.panchayat_id] = (p.area_km2 || 0) / total; });
    return w;
  }
  function areaWeightedElevation(panchayats) {
    const w = areaWeights(panchayats);
    return panchayats.reduce((s, p) => s + w[p.panchayat_id] * (p.elevation_m || 0), 0);
  }
  function sumWeighted(values, w) {
    let s = 0;
    for (const k in values) s += w[k] * values[k];
    return s;
  }
  function round(v, d) { const f = Math.pow(10, d); return Math.round(v * f) / f; }

  // ============================================================
  //  PANCHAYAT MAP
  // ============================================================
  function buildMap() {
    main.innerHTML += `
      <section class="section" id="s-map">
        <div class="section-head">
          <div class="eyebrow">Step 4 · Panchayat Map</div>
          <h2 class="section-title">Panchayat-Level <span class="hl">Downscaled Map</span></h2>
          <p class="section-sub">
            Each cell is one Panchayat in the pilot block. Cells are coloured by their estimated
            <b>t_max_c</b> after downscaling. Select a cell to inspect its forecast, uncertainty,
            top features and provenance. The boundaries are a <b>schematic pilot grid</b> —
            not official Gram Panchayat boundaries.
          </p>
        </div>

        <div class="grid-2">
          <div>
            <div class="card" style="margin-bottom:14px">
              <h3>Block envelope</h3>
              <div class="row"><span class="k">Block</span><span class="v" id="mapBlock">—</span></div>
              <div class="row"><span class="k">District / State</span><span class="v" id="mapDistrict">—</span></div>
              <div class="row"><span class="k">Mean elevation</span><span class="v" id="mapElev">—</span></div>
              <div class="row"><span class="k">Panchayats</span><span class="v" id="mapCount">—</span></div>
              <div class="row"><span class="k">Downscaled?</span><span class="v" id="mapDownscaled">—</span></div>
            </div>
            <div class="map-canvas" id="map">
              <div class="map-hint" id="mapHint">Schematic pilot grid · bbox 73.80–73.94°E, 20.16–20.30°N</div>
              <div class="map-zoom">
                <button type="button" id="mapZoomIn" title="Zoom in" aria-label="Zoom in">+</button>
                <button type="button" id="mapZoomOut" title="Zoom out" aria-label="Zoom out">−</button>
                <button type="button" id="mapZoomReset" title="Reset zoom" aria-label="Reset zoom">⤢</button>
              </div>
              <div class="map-cells" id="mapCells" style="position:absolute;inset:0"></div>
              <div class="map-legend">
                <div class="lg-title">Estimated t_max</div>
                <div class="lg-bar"></div>
                <div class="lg-scale"><span id="lgMin">—</span><span id="lgMax">—</span></div>
              </div>
            </div>
            <div class="flex mt-2">
              <button class="btn small" id="mapRunDownscale">Re-run downscaling</button>
              <span class="muted text-xs" style="margin-left:auto">Cells are illustrative; select one for detail.</span>
            </div>
          </div>

          <div>
            <div class="card" id="mapDetailCard" style="display:none">
              <h3>Selected Panchayat</h3>
              <div class="row"><span class="k">Panchayat</span><span class="v" id="mapDetailName">—</span></div>
              <div class="row"><span class="k">ID</span><span class="v" id="mapDetailId">—</span></div>
              <div class="row"><span class="k">LGD code</span><span class="v" id="mapDetailLgd">—</span></div>
              <div class="row"><span class="k">Elevation</span><span class="v" id="mapDetailElev">—</span></div>
              <div class="row"><span class="k">Area</span><span class="v" id="mapDetailArea">—</span></div>
              <div class="row"><span class="k">Area weight</span><span class="v" id="mapDetailWeight">—</span></div>
              <div class="row"><span class="k">Land cover</span><span class="v" id="mapDetailLandcover">—</span></div>
              <div class="row"><span class="k">NDVI</span><span class="v" id="mapDetailNdvi">—</span></div>
              <div class="row"><span class="k">Slope / Aspect</span><span class="v" id="mapDetailSlope">—</span></div>
              <div class="mt-2">
                <h3>Estimated t_max_c</h3>
                <div class="row"><span class="k">t_max_c</span><span class="v" id="mapDetailTmax">—</span></div>
                <div class="row"><span class="k">B1 (block copy)</span><span class="v" id="mapDetailB1">—</span></div>
                <div class="row"><span class="k">B2 (lapse-rate)</span><span class="v" id="mapDetailB2">—</span></div>
                <div class="row"><span class="k">Model raw (pre-adjustment)</span><span class="v" id="mapDetailRaw">—</span></div>
                <div class="row"><span class="k">Anomaly f_T(X)</span><span class="v" id="mapDetailAnomaly">—</span></div>
                <div class="row"><span class="k">Range (indicative)</span><span class="v" id="mapDetailRange">—</span></div>
                <div class="row"><span class="k">Confidence</span><span class="v" id="mapDetailConfidence">—</span></div>
                <div class="row"><span class="k">Rainfall</span><span class="v" id="mapDetailRain">—</span></div>
              </div>
              <div class="mt-2">
                <h3>Top contributing features</h3>
                <div class="flex flex-wrap" id="mapDetailFeatures"></div>
                <div class="text-xs muted mt-1" id="mapDetailFeatureBasis"></div>
              </div>
              <div class="mt-2">
                <h3>Explanation</h3>
                <p class="text-sm" id="mapDetailExplain" style="color:var(--ink-2);line-height:1.5"></p>
              </div>
              <div class="mt-2">
                <h3>Why this Panchayat?</h3>
                <div class="why-grid">
                  <div class="why-cell"><div class="wc-k">Block baseline</div><div class="wc-v" id="whyB1">—</div><div class="wc-s">B1 block copy</div></div>
                  <div class="why-op">+</div>
                  <div class="why-cell"><div class="wc-k">RF local correction</div><div class="wc-v" id="whyRf">—</div><div class="wc-s" id="whyTerrain">geophysical predictors</div></div>
                  <div class="why-op">+</div>
                  <div class="why-cell"><div class="wc-k">Consistency step</div><div class="wc-v" id="whyAdj">—</div><div class="wc-s">area-weighted reconciliation</div></div>
                  <div class="why-op">=</div>
                  <div class="why-cell final"><div class="wc-k">Panchayat estimate</div><div class="wc-v" id="whyFinal">—</div><div class="wc-s" id="whyName">—</div></div>
                </div>
                <div class="why-cell mt-2" style="border-style:dashed">
                  <div class="wc-k">Elevation lapse-rate baseline (B2)</div>
                  <div class="wc-v" id="whyB2" style="font-size:15px">—</div>
                  <div class="wc-s" id="whyLapse"></div>
                </div>
              </div>
              <details class="disclosure">
                <summary>View provenance details</summary>
                <div class="disc-body" id="mapDetailProvenance"></div>
              </details>
              <div class="mt-2 flex">
                <button class="btn small primary" id="mapDetailGoAdvisory">Open Advisory for this Panchayat</button>
                <button class="btn small" id="mapDetailGoValidation">Open Validation</button>
              </div>
            </div>
            <div class="empty" id="mapDetailEmpty" style="display:block">
              Select a Panchayat cell on the map to inspect its forecast, uncertainty, top features
              and provenance.
            </div>
          </div>
        </div>

        <div class="disclaimer-box mt-3">
          <b>Boundary disclaimer.</b> The Panchayat polygons shown here are a <b>schematic pilot grid</b>
          used so the pipeline can run. They are <b>NOT official Gram Panchayat boundaries</b> and
          <b>NOT community-mapped boundaries</b>. Every area weight and map polygon is therefore
          illustrative. Replace the schematic grid with real India Geodata / DataMeet / Bhuvan polygons
          to switch this to a disclosed historical or official boundary source.
        </div>
      </section>
    `;

    // Controls are wired once in wireSectionActions(), after every section exists.
  }

  // One entry per Panchayat (earliest valid date) for the schematic grid map, so a
  // multi-day downscale result is not drawn as stacked duplicate cells.
  function uniquePanchayatFeatures() {
    const out = [];
    const seen = new Set();
    for (const f of ((state.downscale && state.downscale.features) || [])) {
      const pid = f.properties && f.properties.panchayat_id;
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      out.push(f);
    }
    return out;
  }

  function renderMap() {
    const block = state.block && state.block.block;
    $('#mapBlock').textContent = block ? block.name : '—';
    $('#mapDistrict').textContent = block ? (block.district + ', ' + block.state) : '—';
    $('#mapElev').textContent = block ? block.mean_elevation_m + ' m' : '—';
    $('#mapCount').textContent = state.panchayats.length;
    // A downscale result has one feature per Panchayat *per day*. The map draws one cell
    // per Panchayat (the earliest valid date), so report the unique Panchayat count — not
    // the raw feature count — to keep the label honest.
    const allFeats = (state.downscale && state.downscale.features) || [];
    const uniqueIds = new Set(allFeats.map(f => f.properties && f.properties.panchayat_id).filter(Boolean));
    $('#mapDownscaled').textContent = uniqueIds.size
      ? 'Yes — ' + uniqueIds.size + ' Panchayats' + (allFeats.length > uniqueIds.size ? ' · ' + (allFeats.length / uniqueIds.size) + ' days' : '')
      : 'No — run downscaling first';
    $('#mapCells').innerHTML = '';

    if (!state.downscale || !state.downscale.features || !state.downscale.features.length) {
      state.selectedPanchayatId = null;
      $('#mapDetailCard').style.display = 'none';
      $('#mapDetailEmpty').style.display = 'block';
      $('#lgMin').textContent = '—';
      $('#lgMax').textContent = '—';
      $('#mapCells').innerHTML = '<div class="empty" style="position:absolute;inset:0">Run downscaling to populate the map.</div>';
      return;
    }

    // Keep the current selection only while it is still present in the result.
    if (state.selectedPanchayatId &&
        !uniquePanchayatFeatures().some(f => f.properties.panchayat_id === state.selectedPanchayatId)) {
      state.selectedPanchayatId = null;
    }

    // Layout the schematic grid cells proportionally to the block bbox.
    const bbox = (block && block.bbox) || [73.8, 20.16, 73.94, 20.3];
    const lonMin = bbox[0], latMin = bbox[1], lonMax = bbox[2], latMax = bbox[3];
    const w = lonMax - lonMin, h = latMax - latMin;
    const pad = 0.02; // small padding so labels fit
    const usableW = 1 - 2 * pad;
    const usableH = 1 - 2 * pad;

    const feats = uniquePanchayatFeatures();
    const tmaxes = feats.map(f => f.properties && f.properties.t_max_c).filter(v => v !== undefined && v !== null);
    const tmin = tmaxes.length ? Math.min(...tmaxes) : 30;
    const tmax = tmaxes.length ? Math.max(...tmaxes) : 36;

    $('#lgMin').textContent = tmaxes.length ? tmin.toFixed(1) + ' °C' : '—';
    $('#lgMax').textContent = tmaxes.length ? tmax.toFixed(1) + ' °C' : '—';
    applyMapZoom();

    for (const feat of feats) {
      const props = feat.properties;
      const geom = feat.geometry;
      if (!geom || !geom.coordinates || !geom.coordinates[0]) continue;
      const ring = geom.coordinates[0];
      const cellLons = ring.map(c => c[0]);
      const cellLats = ring.map(c => c[1]);
      const clonMin = Math.min(...cellLons), clatMin = Math.min(...cellLats);
      const clatMax = Math.max(...cellLats);
      const cx = (clonMin - lonMin) / w;
      const cy = (clatMin - latMin) / h;
      const cw = (Math.max(...cellLons) - clonMin) / w;
      const ch = (clatMax - clatMin) / h;

      const t = props.t_max_c;
      const intensity = tmaxes.length ? (t - tmin) / (tmax - tmin) : 0.5;
      const cell = document.createElement('div');
      cell.className = 'map-cell' + (state.selectedPanchayatId === props.panchayat_id ? ' active' : '');
      cell.style.left = (pad + cx * usableW) * 100 + '%';
      cell.style.top = (pad + cy * usableH) * 100 + '%';
      cell.style.width = Math.max(cw * usableW, 0.06) * 100 + '%';
      cell.style.height = Math.max(ch * usableH, 0.06) * 100 + '%';
      cell.style.background = 'linear-gradient(180deg, rgba(240,168,48,' + (0.22 + intensity * 0.35) + '), rgba(240,168,48,' + (0.08 + intensity * 0.12) + '))';
      cell.textContent = typeof t === 'number' ? t.toFixed(1) : '—';
      cell.title = props.name + ' · ' + props.panchayat_id + ' · t_max ' + (typeof t === 'number' ? t.toFixed(2) + '°C' : '—');
      cell.dataset.pid = props.panchayat_id;
      cell.addEventListener('click', () => selectMapPanchayat(props.panchayat_id));
      $('#mapCells').appendChild(cell);
    }
  }

  // Zoom is a presentation-only transform on the schematic grid.
  function applyMapZoom() {
    const el = $('#mapCells');
    if (!el) return;
    el.style.transformOrigin = '50% 50%';
    el.style.transform = state.mapZoom === 1 ? '' : 'scale(' + state.mapZoom + ')';
  }

  function setMapZoom(next) {
    state.mapZoom = Math.min(2.4, Math.max(1, Math.round(next * 4) / 4));
    applyMapZoom();
  }

  function selectMapPanchayat(pid) {
    state.selectedPanchayatId = pid;
    renderMap();
    renderMapDetail(pid);
  }

  function renderMapDetail(pid) {
    const feat = (state.downscale && state.downscale.features) || [];
    const f = feat.find(x => x.properties && x.properties.panchayat_id === pid);
    if (!f) { toast('Panchayat not in current downscaled output', 'warn'); return; }
    const p = f.properties;
    $('#mapDetailCard').style.display = 'block';
    $('#mapDetailEmpty').style.display = 'none';
    $('#mapDetailName').textContent = p.name;
    $('#mapDetailId').textContent = p.panchayat_id;
    $('#mapDetailLgd').textContent = p.lgd_code;
    $('#mapDetailElev').textContent = p.elevation_m + ' m';
    $('#mapDetailArea').textContent = p.area_km2 + ' km²';
    $('#mapDetailWeight').textContent = p.area_weight;
    $('#mapDetailLandcover').textContent = p.land_cover;
    $('#mapDetailNdvi').textContent = p.ndvi;
    $('#mapDetailSlope').textContent = (p.slope_deg !== undefined && p.slope_deg !== null ? p.slope_deg + '° / ' : '') + (p.aspect_deg !== undefined && p.aspect_deg !== null ? p.aspect_deg + '°' : '—');
    $('#mapDetailTmax').textContent = p.t_max_c + ' °C';
    $('#mapDetailB1').textContent = p.b1_t_max_c + ' °C';
    $('#mapDetailB2').textContent = p.b2_t_max_c + ' °C';
    $('#mapDetailRaw').textContent = p.model_raw_t_max_c + ' °C';
    $('#mapDetailAnomaly').textContent = (p.anomaly_c !== undefined && p.anomaly_c !== null ? (p.anomaly_c > 0 ? '+' : '') + p.anomaly_c + ' °C' : '—');
    $('#mapDetailRange').textContent = (p.range_low_c !== null && p.range_low_c !== undefined && p.range_high_c !== null && p.range_high_c !== undefined)
      ? p.range_low_c + ' – ' + p.range_high_c + ' °C' : '—';
    $('#mapDetailConfidence').textContent = p.confidence;
    $('#mapDetailRain').textContent = p.rainfall_mm !== null && p.rainfall_mm !== undefined ? p.rainfall_mm + ' mm' : '—';

    const featChips = $('#mapDetailFeatures');
    featChips.innerHTML = '';
    (p.top_features || []).forEach(f => {
      const chip = document.createElement('span');
      chip.className = 'feature-chip';
      chip.innerHTML = '<b>' + f + '</b>';
      featChips.appendChild(chip);
    });

    $('#mapDetailFeatureBasis').textContent = p.top_features_basis || '';
    $('#mapDetailExplain').textContent = p.explanation || '';

    // Why this Panchayat — built only from values the pipeline produced.
    const w = whyThisPanchayat(p);
    const bm = blockMeanElevation();
    $('#whyB1').textContent = w.b1 + ' °C';
    $('#whyRf').textContent = (w.rf > 0 ? '+' : '') + w.rf.toFixed(2) + ' °C';
    $('#whyAdj').textContent = (w.adj > 0 ? '+' : '') + w.adj.toFixed(2) + ' °C';
    $('#whyFinal').textContent = w.fin + ' °C';
    $('#whyName').textContent = p.name;
    $('#whyTerrain').textContent = (p.top_features || []).join(', ') || 'geophysical predictors';
    $('#whyB2').textContent = w.b2 + ' °C';
    $('#whyLapse').textContent = (w.lapse > 0 ? '+' : '') + w.lapse.toFixed(2) + ' °C versus the block value, from ' + p.elevation_m + ' m against a block mean of ' + (bm !== null ? bm + ' m' : '—') + '. Evaluated alongside the model as a named baseline — not added into the equation above.';

    const meta = (state.downscale && state.downscale.meta) || {};
    const srcType = meta.source_type || 'simulated_demo';
    const srcLabel = srcType === 'official' ? 'official'
      : srcType === 'historical_reference' ? 'historical reference data'
      : 'staged illustrative data';
    $('#mapDetailProvenance').innerHTML = `
      Data source: <b>${srcLabel}</b> <span class="code">source_type: ${srcType}</span><br/>
      Model version: <span class="code">${meta.model_version || '—'}</span><br/>
      Reference dataset: ${meta.reference_dataset || '—'}<br/>
      Uncertainty: ${meta.uncertainty || 'Indicative — uncalibrated'}<br/>
      Adjustment: ${meta.adjustment || '—'}<br/>
      Boundary source: ${meta.boundary_source || '—'}
    `;

    // Keep the Overview's selected-Panchayat panel in step with the map selection.
    refreshOverview();
    renderAlerts();
  }

  // ============================================================
  //  VALIDATION
  // ============================================================
  function buildValidation() {
    main.innerHTML += `
      <section class="section" id="s-validation">
        <div class="section-head">
          <div class="eyebrow">Step 6 · Validation</div>
          <h2 class="section-title">B1 vs B2 vs <span class="hl">Random Forest</span></h2>
          <p class="section-sub">
            Metrics are computed by code from arrays on the <b>pre-adjustment</b> values. The blocked
            temporal split (train 2015–2022 / test 2023–2024) is fixed; no random row splits are used.
            Leave-one-Panchayat-out (LOPO) is reported as indicative. An independent station holdout
            (IMD observations) is reported when available.
          </p>
        </div>

        <div id="validationBody">
          ${renderValidation()}
        </div>

        <div class="disclaimer-box mt-3">
          <b>Reanalysis hindcast validation — not operational forecast skill.</b>
          This evaluation compares the model against the coarse signal it was built from. It is a
          <b>reconstruction (hindcast)</b> and carries <b>no operational forecast-skill meaning</b>.
          The skill score is computed against B1 (block copy). Because the reference dataset is a staged
          synthetic fixture, the metrics demonstrate <b>pipeline correctness</b>, not real-world skill.
          <b>Do not claim operational forecast skill from these numbers.</b>
        </div>
      </section>
    `;
  }

  function renderValidation() {
    const v = state.validation;
    if (!v) {
      return '<div class="empty">Validation data not loaded. Connect the service to load the validation record.</div>';
    }
    if (!v.available) {
      return `
        <div class="card">
          <h3>Validation unavailable</h3>
          <p class="text-sm muted" style="margin:6px 0">${v.reason || 'no validation data'}</p>
          <div class="disclaimer-box">${v.disclaimer || 'Reanalysis hindcast validation — not operational forecast skill.'}</div>
        </div>
      `;
    }

    const rows = v.rows || {};
    const b1 = rows.B1_block_copy || {};
    const b2 = rows.B2_lapse_rate || {};
    const rf = rows.RF_residual || {};
    const skill = v.skill_vs_block_copy;
    const lopo = v.lopo || {};
    const cc = v.consistency_check || {};
    const trackB = v.track_b || {};
    const fi = v.feature_importance || {};
    // `feature_importance.grouped` is a {feature: contribution} map in the API contract;
    // accept either that map or an already-array form so the view never crashes on it.
    const fiGrouped = Array.isArray(fi.grouped)
      ? fi.grouped.slice()
      : Object.entries(fi.grouped || {}).map(([feature, contribution]) => ({ feature, contribution }));

    const maxMae = Math.max(b1.mae || 0, b2.mae || 0, rf.mae || 0, 0.001);
    const bar = (val, cls) => `
      <div class="chart-bar-wrap">
        <div class="chart-bar-val">${(val !== null && val !== undefined) ? val.toFixed(3) : '—'}</div>
        <div class="chart-bar ${cls}" style="height:${(val !== null && val !== undefined) ? (val / maxMae) * 100 : 0}%;"></div>
        <div class="chart-bar-label">${cls === 'rf' ? 'RF residual' : cls === 'b2' ? 'B2 lapse-rate' : 'B1 block copy'}</div>
      </div>
    `;

    const bestMae = [b1, b2, rf].filter(r => r.mae !== null && r.mae !== undefined).sort((a,b) => a.mae - b.mae)[0];
    const bestLabel = bestMae ? (bestMae.label || '') : '';

    return `
      <div class="grid-2">
        <div>
          <div class="card">
            <h3>MAE by method (test window)</h3>
            <div class="chart-bars">
              ${bar(b1.mae, 'b1')}
              ${bar(b2.mae, 'b2')}
              ${bar(rf.mae, 'rf')}
            </div>
            <div class="chart-axis">
              <span>0</span><span>MAE (°C)</span>
            </div>
            <div class="row mt-2"><span class="k">Best MAE</span><span class="v best">${bestMae && bestMae.mae !== null && bestMae.mae !== undefined ? bestMae.mae.toFixed(4) + ' °C' : '—'} ${bestMae ? '· ' + bestLabel : ''}</span></div>
            <div class="row"><span class="k">Skill vs B1</span><span class="v">${skill !== null && skill !== undefined ? skill.toFixed(4) : '—'}</span></div>
            <div class="row"><span class="k">Bias (RF)</span><span class="v">${rf.bias !== null && rf.bias !== undefined ? (rf.bias > 0 ? '+' : '') + rf.bias.toFixed(4) + ' °C' : '—'}</span></div>
            <div class="row"><span class="k">RMSE (RF)</span><span class="v">${rf.rmse !== null && rf.rmse !== undefined ? rf.rmse.toFixed(4) + ' °C' : '—'}</span></div>
            <div class="row"><span class="k">Test samples</span><span class="v">${v.sample_counts && v.sample_counts.test_rows !== undefined ? v.sample_counts.test_rows.toLocaleString() : '—'}</span></div>
          </div>

          <div class="card mt-2">
            <h3>Full metrics table</h3>
            <table>
              <thead>
                <tr><th>Method</th><th>MAE</th><th>RMSE</th><th>Bias</th><th>n</th><th>Skill vs B1</th></tr>
              </thead>
              <tbody>
                ${[b1, b2, rf].map(r => `
                  <tr>
                    <td style="font-weight:600">${r.label || '—'}</td>
                    <td>${r.mae !== null && r.mae !== undefined ? r.mae.toFixed(4) : '—'}</td>
                    <td>${r.rmse !== null && r.rmse !== undefined ? r.rmse.toFixed(4) : '—'}</td>
                    <td>${(r.bias !== null && r.bias !== undefined) ? (r.bias > 0 ? '+' : '') + r.bias.toFixed(4) + ' °C' : '—'}</td>
                    <td>${r.n !== undefined && r.n !== null ? r.n.toLocaleString() : '—'}</td>
                    <td style="font-weight:600;color:var(--amber)">${r.skill_vs_b1 !== null && r.skill_vs_b1 !== undefined ? r.skill_vs_b1.toFixed(4) : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div class="card">
            <h3>Leave-one-Panchayat-out CV (indicative)</h3>
            ${lopo.available ? `
              <div class="row"><span class="k">Mean MAE</span><span class="v">${lopo.mean_mae !== null && lopo.mean_mae !== undefined ? lopo.mean_mae.toFixed(4) + ' °C' : '—'}</span></div>
              <div class="row"><span class="k">Std MAE</span><span class="v">${lopo.std_mae !== null && lopo.std_mae !== undefined ? lopo.std_mae.toFixed(4) : '—'}</span></div>
              <div class="row"><span class="k">Mean skill vs B1</span><span class="v">${lopo.mean_skill_vs_b1 !== null && lopo.mean_skill_vs_b1 !== undefined ? lopo.mean_skill_vs_b1.toFixed(4) : '—'}</span></div>
              <div class="row"><span class="k">Stable</span><span class="v">${v.lopo_stable !== undefined ? (v.lopo_stable ? 'yes' : 'no') : '—'}</span></div>
              <div class="row"><span class="k">Folds</span><span class="v">${lopo.folds ? lopo.folds.length : 0}</span></div>
              <div class="text-xs muted mt-1" style="line-height:1.5">${lopo.note || 'Small spatial sample: LOPO is indicative and must not be presented as a stable generalisation estimate.'}</div>
              ${lopo.folds && lopo.folds.length ? `
                <table class="mt-2">
                  <thead><tr><th>Panchayat</th><th>MAE</th><th>Skill vs B1</th><th>n</th></tr></thead>
                  <tbody>
                    ${lopo.folds.map(f => `
                      <tr>
                        <td style="font-family:ui-monospace,Menlo,Consolas,monospace">${f.panchayat_id}</td>
                        <td>${f.mae !== null && f.mae !== undefined ? f.mae.toFixed(4) : '—'}</td>
                        <td>${f.skill_vs_b1 !== null && f.skill_vs_b1 !== undefined ? f.skill_vs_b1.toFixed(4) : '—'}</td>
                        <td>${f.n !== undefined && f.n !== null ? f.n : '—'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : ''}
            ` : `
              <div class="text-sm muted" style="margin:6px 0">${lopo.reason || 'LOPO not available'}</div>
            `}
          </div>

          <div class="card mt-2">
            <h3>Consistency check (post-adjustment)</h3>
            <div class="row"><span class="k">Method</span><span class="v">${cc.method || '—'}</span></div>
            <div class="row"><span class="k">Days checked</span><span class="v">${cc.days_checked !== undefined ? cc.days_checked : '—'}</span></div>
            <div class="row"><span class="k">Max |difference|</span><span class="v">${cc.max_abs_difference !== undefined ? cc.max_abs_difference.toFixed(9) : '—'}</span></div>
            <div class="row"><span class="k">Tolerance</span><span class="v">${cc.tolerance !== undefined ? cc.tolerance.toFixed(2) : '—'}</span></div>
            <div class="row"><span class="k">Passed</span><span class="v">${cc.passed !== undefined ? (cc.passed ? 'yes' : 'no') : '—'}</span></div>
            <div class="text-xs muted mt-1" style="line-height:1.5">${cc.note || 'Consistency / reconciliation only — it is not an accuracy gain.'}</div>
            ${cc.example_date ? `
              <div class="mt-1 text-xs muted">Example day ${cc.example_date}: block ${cc.block_value} °C, area-weighted Panchayat mean ${cc.area_weighted_panchayat_mean} °C.</div>
            ` : ''}
          </div>

          <div class="card mt-2">
            <h3>Independent station holdout — IMD observations</h3>
            ${trackB.available ? `
              <div class="row"><span class="k">Stations</span><span class="v">${trackB.station_count !== undefined ? trackB.station_count : '—'}</span></div>
              <div class="row"><span class="k">Matched obs</span><span class="v">${trackB.matched_observations !== undefined ? trackB.matched_observations : '—'}</span></div>
              ${trackB.metrics ? `
                <div class="row"><span class="k">MAE</span><span class="v">${trackB.metrics.mae !== null && trackB.metrics.mae !== undefined ? trackB.metrics.mae.toFixed(4) + ' °C' : '—'}</span></div>
                <div class="row"><span class="k">RMSE</span><span class="v">${trackB.metrics.rmse !== null && trackB.metrics.rmse !== undefined ? trackB.metrics.rmse.toFixed(4) : '—'}</span></div>
                <div class="row"><span class="k">Bias</span><span class="v">${trackB.metrics.bias !== null && trackB.metrics.bias !== undefined ? (trackB.metrics.bias > 0 ? '+' : '') + trackB.metrics.bias.toFixed(4) + ' °C' : '—'}</span></div>
              ` : ''}
              <div class="text-xs muted mt-1" style="line-height:1.5">${trackB.note || 'Compares the reanalysis reference series against independent station observations.'}</div>
            ` : `
              <div class="row"><span class="k">Status</span><span class="v">Unavailable</span></div>
              <div class="text-xs muted" style="margin-top:6px;line-height:1.5">${trackB.message || 'Not available — no suitable station observations are configured for this block.'}</div>
              ${trackB.detail ? '<div class="text-xs muted mt-1">' + trackB.detail + '</div>' : ''}
            `}
          </div>

          <div class="card mt-2">
            <h3>Feature importance (contributions, not causes)</h3>
            <div class="flex flex-wrap" style="margin-top:8px">
              ${fiGrouped.sort((a,b) => b.contribution - a.contribution).map(f => `
                <span class="feature-chip"><b>${f.feature}</b> ${f.contribution.toFixed(3)}</span>
              `).join('')}
            </div>
            <div class="text-xs muted mt-1" style="line-height:1.5">${fi.note || 'Contributions, not causal attributions.'}</div>
          </div>
        </div>
      </div>

      <div class="mt-2">
        <div class="card">
          <h3>Reproducibility record</h3>
          <div class="row"><span class="k">Model version</span><span class="v">${v.model_version || '—'}</span></div>
          <div class="row"><span class="k">Seed</span><span class="v">${v.seed !== undefined ? v.seed : '—'}</span></div>
          <div class="row"><span class="k">Git SHA</span><span class="v" style="font-family:ui-monospace,Menlo,Consolas,monospace">${v.git_sha || '—'}</span></div>
          <div class="row"><span class="k">Train period</span><span class="v">${v.train_period || '—'}</span></div>
          <div class="row"><span class="k">Test period</span><span class="v">${v.test_period || '—'}</span></div>
          <div class="row"><span class="k">Split</span><span class="v">${v.split || '—'}</span></div>
          <div class="row"><span class="k">Type</span><span class="v">${v.type || '—'}</span></div>
        </div>
      </div>
    `;
  }

  // ============================================================
  //  ADVISORY
  // ============================================================
  function buildAdvisory() {
    const block = state.block && state.block.block;
    main.innerHTML += `
      <section class="section" id="s-advisory">
        <div class="section-head">
          <div class="eyebrow">Step 7 · Crop Advisory</div>
          <h2 class="section-title">Localized Advisory + <span class="hl">Farmer Action</span></h2>
          <p class="section-sub">
            Select a Panchayat and a crop to get a localized heat-risk (and optionally rainfall-risk)
            advisory built from a configurable rules layer. The advisory includes a recommended farmer
            action and a Market / Logistics decision-support hand-off.
          </p>
        </div>

        <div class="grid-2">
          <div>
            <div class="card">
              <h3>Inputs</h3>
              <div class="field" style="margin-top:8px">
                <label for="advisoryBlockId">Block ID</label>
                <input type="text" id="advisoryBlockId" value="${state.selectedBlockId}" placeholder="LGD-271012"
                  style="font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:.3px">
              </div>
              <div class="field" style="margin-top:12px">
                <label for="advisoryPanchayatSelect">Panchayat</label>
                <select id="advisoryPanchayatSelect">
                  <option value="">— select a Panchayat —</option>
                  ${state.panchayats.map(p => `
                    <option value="${p.panchayat_id}" ${state.selectedPanchayatId === p.panchayat_id ? 'selected' : ''}>${p.name} (${p.panchayat_id})</option>
                  `).join('')}
                </select>
              </div>
              <div class="field" style="margin-top:12px">
                <label for="advisoryCropSelect">Crop</label>
                <select id="advisoryCropSelect">
                  ${(() => {
                    // `crops` is a {key: {label, heat}} map in the rules contract.
                    const cropMap = (state.advisoryRules && state.advisoryRules.crops && !Array.isArray(state.advisoryRules.crops))
                      ? state.advisoryRules.crops : null;
                    const keys = cropMap ? Object.keys(cropMap) : ['tomato','onion','grape','wheat','soybean','banana'];
                    return keys.map(c => {
                      const known = cropMap && cropMap[c];
                      const label = known && known.label ? known.label : c;
                      return `<option value="${c}" ${state.crop === c ? 'selected' : ''}>${label} (${c})</option>`;
                    }).join('');
                  })()}
                </select>
              </div>
              <div class="field" style="margin-top:12px">
                <label for="advisoryDateInput">Valid date (ISO, optional)</label>
                <input type="text" id="advisoryDateInput" placeholder="auto / 2026-04-18">
              </div>
              <button class="btn primary mt-2" id="advisoryRunBtn">Run Advisory</button>
              <p class="text-xs muted mt-1">
                If no date is given, the advisory uses the first day of the current downscaled forecast.
                Advisory thresholds live in the backend rules layer — the UI only renders what the engine returns.
              </p>
            </div>

            <div class="card mt-2" id="advisoryResultCard" style="display:none">
              <h3>Advisory result</h3>
              <div class="row"><span class="k">Available</span><span class="v" id="advAvailable">—</span></div>
              <div class="row"><span class="k">Rule version</span><span class="v" id="advRuleVersion">—</span></div>
              <div class="row"><span class="k">Crop</span><span class="v" id="advCrop">—</span></div>
              <div class="row"><span class="k">Panchayat</span><span class="v" id="advPanchayat">—</span></div>
              <div class="row"><span class="k">Block</span><span class="v" id="advBlock">—</span></div>
              <div class="row"><span class="k">Date</span><span class="v" id="advDate">—</span></div>
              <div class="row"><span class="k">Risk level</span><span class="v" id="advRisk">—</span></div>
              <div class="row"><span class="k">Rainfall risk</span><span class="v" id="advRainRisk">—</span></div>
              <div class="row"><span class="k">Confidence</span><span class="v" id="advConfidence">—</span></div>
              <div class="row"><span class="k">Source type</span><span class="v" id="advSource">—</span></div>
              <div class="row"><span class="k">Model version</span><span class="v" id="advModel">—</span></div>
              <div class="mt-2">
                <h3>Message</h3>
                <p class="text-sm" id="advMessage" style="color:var(--ink-2);line-height:1.55"></p>
              </div>
              <div class="mt-2">
                <h3>Recommended farmer action</h3>
                <div class="decision-panel">
                  <h4>Action</h4>
                  <div class="d-row"><span class="d-k">Trigger</span><span class="d-v" id="advActionTrigger">—</span></div>
                  <div class="d-row"><span class="d-k">Threshold</span><span class="d-v" id="advActionThreshold">—</span></div>
                  <div class="d-row"><span class="d-k">Action</span><span class="d-v" id="advActionAction">—</span></div>
                  <div class="d-row"><span class="d-k">Field operation</span><span class="d-v" id="advActionFieldOp">—</span></div>
                </div>
              </div>
              <div class="mt-2">
                <h3>Market / Logistics decision-support</h3>
                <div class="decision-panel">
                  <h4>Decision-support hand-off</h4>
                  <div class="d-row"><span class="d-k">Weather risk</span><span class="d-v" id="advDecisionRisk">—</span></div>
                  <div class="d-row"><span class="d-k">Recommended action</span><span class="d-v" id="advDecisionAction">—</span></div>
                  <div class="d-row"><span class="d-k">Logistics</span><span class="d-v" id="advDecisionLogistics">—</span></div>
                  <div class="d-row"><span class="d-k">Market</span><span class="d-v" id="advDecisionMarket">—</span></div>
                  <div class="d-row"><span class="d-k">Cold chain / reefers</span><span class="d-v" id="advDecisionColdChain">—</span></div>
                  <div class="d-row"><span class="d-k">Schedule pickup</span><span class="d-v" id="advDecisionPickup">—</span></div>
                </div>
                <div class="disclaimer-box mt-1" style="font-size:12px">
                  These are <b>decision-support demonstrations</b>, not real transactions. They illustrate how a
                  Panchayat-level weather advisory can feed a market / logistics decision workflow. No payment,
                  no order and no real logistics booking is created by this platform.
                </div>
              </div>
              </div>
              <div class="mt-2">
                <h3>Weather → Action chain</h3>
                <div id="advChain"></div>
              </div>
              <div class="mt-2">
                <h3>Explainability</h3>
                <div class="text-xs" id="advExplain" style="color:var(--ink-2);line-height:1.5;white-space:pre-wrap"></div>
              </div>
              <div class="mt-2 disclaimer-box" id="advDisclaimer"></div>
            </div>
          </div>

          <div>
            <div class="card">
              <h3>Configured crops & thresholds</h3>
              ${(state.advisoryRules && state.advisoryRules.crops) ? `
                <table class="mt-1">
                  <thead><tr><th>Crop</th><th>Medium (≥ °C)</th><th>High (≥ °C)</th></tr></thead>
                  <tbody id="advisoryThresholdBody">
                    ${Object.entries(state.advisoryRules.crops).map(([key, c]) => `
                      <tr>
                        <td><b>${c.label || key}</b></td>
                        <td>${c.heat && c.heat.medium ? c.heat.medium.threshold_t_max_c : '—'}</td>
                        <td>${c.heat && c.heat.high ? c.heat.high.threshold_t_max_c : '—'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
                <div class="text-xs muted mt-1" style="line-height:1.5">${state.advisoryRules.disclaimer || ''}</div>
              ` : '<div class="text-sm muted">No crop rules loaded — using default crop list.</div>'}
            </div>

            <div class="card mt-2">
              <h3>Advisory rules — rainfall (P1)</h3>
              ${(state.advisoryRules && state.advisoryRules.rainfall_rules) ? `
                <div class="row"><span class="k">P1</span><span class="v">${state.advisoryRules.rainfall_rules.p1 !== undefined ? 'true' : '—'}</span></div>
                <div class="row"><span class="k">Medium (≥ mm)</span><span class="v">${state.advisoryRules.rainfall_rules.medium ? state.advisoryRules.rainfall_rules.medium.threshold_mm : '—'}</span></div>
                <div class="row"><span class="k">High (≥ mm)</span><span class="v">${state.advisoryRules.rainfall_rules.high ? state.advisoryRules.rainfall_rules.high.threshold_mm : '—'}</span></div>
                <div class="text-xs muted mt-1" style="line-height:1.5">${state.advisoryRules.rainfall_rules.note || 'Rainfall risk is P1 and ships only if the rainfall residual model validates.'}</div>
                <div class="text-xs muted mt-1">P1 validated in this build: <b>${state.rainfallValidation && state.rainfallValidation.validated ? 'no (withheld)' : 'no'}</b> — the heat-risk path is always available.</div>
              ` : '<div class="text-sm muted">No rainfall rules loaded.</div>'}
            </div>
          </div>
        </div>
      </section>
    `;

    // Controls are wired once in wireSectionActions(), after every section exists.
  }

  function onAdvisoryPanchayatChange() {
    const sel = $('#advisoryPanchayatSelect');
    state.selectedPanchayatId = sel && sel.value || null;
  }

  async function runAdvisory() {
    const blockId = $('#advisoryBlockId').value.trim() || DEFAULT_BLOCK_ID;
    const panchayatId = $('#advisoryPanchayatSelect').value;
    const crop = $('#advisoryCropSelect').value || state.crop;
    const date = $('#advisoryDateInput').value.trim() || null;

    if (!panchayatId) { toast('Select a Panchayat first', 'warn'); return; }

    state.loading = true;
    $('#advisoryRunBtn').disabled = true;
    $('#advisoryRunBtn').textContent = 'Running…';

    try {
      // Try the live service first.
      const resp = await fetchJson('/weather/advisory?block_id=' + encodeURIComponent(blockId) +
        '&panchayat_id=' + encodeURIComponent(panchayatId) +
        '&crop=' + encodeURIComponent(crop) +
        (date ? '&date=' + encodeURIComponent(date) : ''));
      renderAdvisoryResult(resp, blockId, panchayatId, crop, date);
      toast('Advisory generated for ' + panchayatId, 'ok');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        runAdvisoryOffline(blockId, panchayatId, crop, date);
      } else if (err instanceof ApiError && err.status === 422) {
        toast('Advisory request invalid: ' + (err.message || ''), 'warn');
      } else {
        runAdvisoryOffline(blockId, panchayatId, crop, date);
      }
    } finally {
      state.loading = false;
      $('#advisoryRunBtn').disabled = false;
      $('#advisoryRunBtn').textContent = 'Run Advisory';
    }
  }

  function renderAdvisoryResult(resp, blockId, panchayatId, crop, date) {
    const card = $('#advisoryResultCard');
    card.style.display = 'block';
    $('#advAvailable').textContent = resp.available ? 'Yes' : 'No';
    $('#advRuleVersion').textContent = resp.rule_version || '—';
    $('#advCrop').textContent = resp.crop_label || crop;
    $('#advPanchayat').textContent = resp.panchayat_name || panchayatId;
    $('#advBlock').textContent = resp.block_name || blockId;
    $('#advDate').textContent = resp.valid_date || date || '—';
    $('#advRisk').textContent = resp.risk_level || 'none';
    $('#advRainRisk').textContent = resp.rainfall_risk_level || 'none';
    $('#advConfidence').textContent = resp.confidence || '—';
    $('#advSource').textContent = (resp.provenance && resp.provenance.source_type) || '—';
    $('#advModel').textContent = resp.model_version || '—';
    $('#advMessage').textContent = resp.message || '—';
    $('#advActionTrigger').textContent = resp.trigger || '—';
    $('#advActionThreshold').textContent = resp.threshold ? (resp.threshold + (typeof resp.threshold === 'number' && resp.threshold > 0 && String(resp.threshold).includes('.') ? ' °C' : '')) : '—';
    $('#advActionAction').textContent = resp.action || '—';
    $('#advActionFieldOp').textContent = resp.field_operation || '—';

    const h = resp.handoff || {};
    $('#advDecisionRisk').textContent = (resp.risk_level === 'high' ? 'HIGH' : resp.risk_level === 'medium' ? 'MODERATE' : 'LOW');
    // Build the decision-support sentence from the advisory result itself (localized).
    const riskWord = resp.risk_level === 'high' ? 'HIGH' : (resp.risk_level === 'medium' ? 'MODERATE' : 'LOW');
    let actionSentence = 'No configured threshold crossed — ' + (state.advisoryRules && state.advisoryRules.default_risk_message ? state.advisoryRules.default_risk_message : 'No action recommended.');
    if (resp.action) {
      actionSentence = resp.action;
    }
    $('#advDecisionAction').textContent = actionSentence;

    // Logistics and market hints come from the crop rules (localized to this crop).
    const cropRules = (state.advisoryRules && state.advisoryRules.crops && state.advisoryRules.crops[crop]) || {};
    $('#advDecisionLogistics').textContent = cropRules.logistics_hint || '—';
    $('#advDecisionMarket').textContent = cropRules.market_hint || '—';
    $('#advDecisionColdChain').textContent = (h.buyer_logistics && h.buyer_logistics.label ? h.buyer_logistics.label + ' — ' + (h.buyer_logistics.hint || 'Cold chain & reefers planning') : 'Cold chain & reefers — ' + (h.buyer_logistics && h.buyer_logistics.hint || 'Plan reefer capacity before harvest'));
    $('#advDecisionPickup').textContent = (h.schedule_pickup && h.schedule_pickup.label ? h.schedule_pickup.label + ' — ' + (h.schedule_pickup.hint || 'Schedule pickup in the cool window') : 'Schedule pickup — cool window');

    // Weather → Action chain, rendered from this advisory's own values. Prefer the real
    // downscaled estimate and its P10–P90 range when the Panchayat is in the current result,
    // so the Advisory chain cannot disagree with the Overview chain.
    const chainEl = $('#advChain');
    if (chainEl) {
      const real = ((state.downscale && state.downscale.features) || [])
        .find(f => f.properties && f.properties.panchayat_id === panchayatId);
      const cpInputs = (resp.explainability && resp.explainability.inputs) || {};
      const vals = real ? {
        t_max_c: real.properties.t_max_c,
        range_low_c: real.properties.range_low_c,
        range_high_c: real.properties.range_high_c,
        name: real.properties.name,
      } : {
        t_max_c: cpInputs.t_max_c,
        range_low_c: cpInputs.range_low_c,
        range_high_c: cpInputs.range_high_c,
        name: resp.panchayat_name || panchayatId,
      };
      if (vals.t_max_c !== null && vals.t_max_c !== undefined) {
        chainEl.innerHTML = chainHTMLFrom(vals, resp, crop);
      } else {
        chainEl.innerHTML = '<div class="empty">The chain needs a temperature estimate for this Panchayat — run the downscaling first.</div>';
      }
    }

    $('#advExplain').textContent = (resp.explainability && resp.explainability.rule) ? resp.explainability.rule + '\n\nInputs:\n' + JSON.stringify(resp.explainability.inputs, null, 2) + '\n\n' + (resp.explainability.note || '') : JSON.stringify(resp.explainability || {}, null, 2);
    $('#advDisclaimer').innerHTML = '<b>Disclaimer</b>: ' + (plainLabel(resp.disclaimer) || 'Illustrative staged data — advisory thresholds are configurable defaults, not validated agronomic prescriptions.') + '<br/><b>Confidence</b>: ' + (resp.confidence || '—') + '<br/><b>Source</b>: ' + (resp.provenance && resp.provenance.source_type ? resp.provenance.source_type : '—') + '<br/><b>Model</b>: ' + (resp.model_version || '—');

    // Color the risk banner
    const riskLevel = resp.risk_level || 'none';
    const msg = resp.message || '';
    $('#advisoryResultCard').style.borderLeftColor = riskLevel === 'high' ? 'var(--risk-high)' : riskLevel === 'medium' ? 'var(--risk-medium)' : 'var(--risk-none)';
  }

  function runAdvisoryOffline(blockId, panchayatId, crop, date) {
    // Build an offline advisory from the local rules + current downscaled forecast, labelled
    // simulated_demo. This is an honest fallback, not a hidden upgrade.
    const rules = state.rulesRaw || loadDefaultRules();
    const panchayat = state.panchayats.find(p => p.panchayat_id === panchayatId);
    if (!panchayat) {
      toast('Panchayat ' + panchayatId + ' not found in pilot block', 'warn');
      return;
    }

    // Use the current downscaled forecast if available, else build a seeded day.
    let tmax = null, rain = null, validDate = date || '2026-04-18';
    if (state.downscale && state.downscale.features) {
      const f = state.downscale.features.find(x => x.properties && x.properties.panchayat_id === panchayatId);
      if (f && f.properties) {
        tmax = f.properties.t_max_c;
        rain = f.properties.rainfall_mm;
        validDate = f.properties.valid_date || validDate;
      }
    }
    if (tmax === null) {
      // build a seeded day
      const days = buildSeededForecastDays(validDate, 1);
      tmax = days[0].t_max_c;
      rain = days[0].rainfall_mm;
      validDate = days[0].date;
    }

    const result = evaluateOfflineAdvisory(rules, panchayat, blockId, crop, tmax, rain, validDate);
    renderAdvisoryResult(result, blockId, panchayatId, crop, validDate);
    showBanner('Advisory generated from local rules + illustrative forecast (offline fallback). Labelled <b>simulated_demo</b>.', 'warn');
    toast('Offline advisory generated (local rules + illustrative forecast)', 'warn');
  }

  function evaluateOfflineAdvisory(rules, panchayat, blockId, cropKey, tmaxC, rainfallMm, validDate) {
    const crop = rules.crops && rules.crops[cropKey] || { label: cropKey, heat: {} };
    let riskLevel = 'none', matched = null;
    if (tmaxC !== null && crop.heat) {
      if (crop.heat.high && tmaxC >= crop.heat.high.threshold_t_max_c) {
        riskLevel = 'high'; matched = crop.heat.high;
      } else if (crop.heat.medium && tmaxC >= crop.heat.medium.threshold_t_max_c) {
        riskLevel = 'medium'; matched = crop.heat.medium;
      }
    }

    let rainLevel = 'none', rainMatched = null;
    const rr = rules.rainfall_rules || {};
    // P1 not validated in this build, so rainfall risk is not triggered — but we still show the
    // configured thresholds for transparency.
    // (omitted because rainfall_validated is false)

    const primary = matched || rainMatched;
    let message;
    if (!primary) {
      message = (rules.default_risk_message || 'No configured threshold crossed for this crop in the selected Panchayat.') +
        ' (forecast maximum ' + tmaxC + ' °C in ' + panchayat.name + ', ' + (blockId || blockId) + ')';
    } else {
      const driver = 'heat';
      const levelWord = (riskLevel === 'high' || rainLevel === 'high') ? 'high' : 'moderate';
      message = crop.label + ' in ' + panchayat.name + ' (' + panchayat.panchayat_id + '): ' +
        levelWord + ' ' + driver + ' risk on ' + validDate + ' because ' +
        (matched ? matched.trigger : 'the configured threshold was crossed') + '. ' +
        'Recommended action: ' + (matched ? matched.action : '');
    }

    return {
      available: true,
      rule_version: rules.version || 'advisory-rules-v1 (offline fallback)',
      p0_variable: rules.p0_variable || 'temperature_heat_risk',
      panchayat_id: panchayat.panchayat_id,
      panchayat_name: panchayat.name,
      block_id: blockId,
      block_name: (state.block && state.block.block && state.block.block.name) || blockId,
      valid_date: validDate,
      crop: cropKey,
      crop_label: crop.label || cropKey,
      risk_level: riskLevel,
      rainfall_risk_level: rainLevel,
      trigger: (primary || {}).trigger,
      threshold: (primary || {}).threshold_t_max_c || (primary || {}).threshold_mm,
      action: (primary || {}).action,
      field_operation: (primary || {}).field_operation,
      message: message,
      explainability: {
        rule: 'IF heat-risk = ' + (riskLevel || 'none').toUpperCase() + ' AND crop = ' + cropKey + ' THEN apply configured action (offline fallback)',
        inputs: {
          t_max_c: tmaxC,
          range_low_c: tmaxC !== null ? tmaxC - 1.0 : null,
          range_high_c: tmaxC !== null ? tmaxC + 1.0 : null,
          confidence: 'low',
          rainfall_mm: rainfallValidated() ? rainfallMm : null,
          rainfall_validated: rainfallValidated(),
        },
        note: 'Feature contributions explain the estimate; they are not causal statements. Offline fallback: no live service.',
      },
      handoff: {
        market: { label: 'Review Market', hint: crop.market_hint || 'Compare mandi benchmark and buyer offers.' },
        logistics: { label: 'Plan Logistics', hint: crop.logistics_hint || 'Plan cool-season transport.' },
        buyer_logistics: { label: 'Cold Chain & Reefers', hint: 'Book reefer capacity before harvest.' },
        schedule_pickup: { label: 'Schedule Pickup', hint: 'Pickup in the cool window.' },
      },
      rainfall_p1: { implemented: true, validated: rainfallValidated(), note: (rules.rainfall_rules && rules.rainfall_rules.note) || 'P1: rainfall risk ships only if the rainfall residual model validates.' },
      provenance: { source_type: 'simulated_demo' },
      model_version: state.downscale && state.downscale.meta && state.downscale.meta.model_version ? state.downscale.meta.model_version : 'rf-residual-temp-v0.3 (offline fallback)',
      disclaimer: rules.disclaimer || 'Illustrative staged data — advisory thresholds are configurable defaults, not validated agronomic prescriptions.',
      confidence: 'low',
    };
  }

  function rainfallValidated() {
    return !!(state.rainfallValidation && state.rainfallValidation.validated);
  }

  function loadDefaultRules() {
    return {
      version: 'advisory-rules-v1',
      disclaimer: 'Illustrative staged data — advisory thresholds are configurable defaults, not validated agronomic prescriptions.',
      p0_variable: 'temperature_heat_risk',
      p1_variable: 'rainfall_risk',
      default_risk_message: 'No configured threshold crossed for this crop in the selected Panchayat.',
      crops: {
        tomato: { label: 'Tomato', heat: { high: { threshold_t_max_c: 36.0, trigger: 'forecast daily maximum temperature at or above 36 C', action: 'Advance harvest of mature and breaker-stage fruit to the early morning window, irrigate at dawn and again in the late afternoon, and apply a 50 percent shade-net or straw mulch cover over the fruiting rows.', field_operation: 'Shift spraying and transplanting to before 09:00.' }, medium: { threshold_t_max_c: 33.0, trigger: 'forecast daily maximum temperature at or above 33 C', action: 'Irrigate at dawn, mulch the root zone, and monitor for flower drop and blossom-end rot over the next 48 hours.', field_operation: 'Keep afternoon field operations to a minimum.' } }, market_hint: 'Heat-stressed tomato reaches market earlier and softer — compare the mandi benchmark and institutional buyer offers before committing the lot.', logistics_hint: 'Harvest in the cool window and book a reefer or an early-morning pickup to limit field heat.' },
        onion: { label: 'Onion', heat: { high: { threshold_t_max_c: 37.0, trigger: 'forecast daily maximum temperature at or above 37 C', action: 'Stop irrigation 10 to 14 days before lifting to harden the neck, then lift in the early morning and cure under shade rather than in open sun.', field_operation: 'Suspend mid-day topping and weeding.' }, medium: { threshold_t_max_c: 34.0, trigger: 'forecast daily maximum temperature at or above 34 C', action: 'Maintain light, frequent irrigation and inspect stored bulbs for sunscald and neck rot.', field_operation: 'Prefer evening irrigation.' } }, market_hint: 'Heat raises storage losses — check the mandi price outlook and consider an earlier sale to a storage-linked buyer.', logistics_hint: 'Prioritise ventilated transport over sealed trucks for cured bulbs.' },
        grape: { label: 'Grape', heat: { high: { threshold_t_max_c: 38.0, trigger: 'forecast daily maximum temperature at or above 38 C', action: 'Run overhead misting or drip in the pre-dawn hours, keep the canopy cover intact, and defer pruning and gibberellic-acid operations by two days.', field_operation: 'Shift all canopy work outside the 11:00 to 16:00 window.' }, medium: { threshold_t_max_c: 35.0, trigger: 'forecast daily maximum temperature at or above 35 C', action: 'Increase irrigation frequency and inspect for berry sunburn on the exposed western side of the canopy.', field_operation: 'Delay any stress-inducing operation to the evening.' } }, market_hint: 'Check export-grade compliance windows: heat-affected berries often fail grading and are better routed to the domestic channel.', logistics_hint: 'Book reefer capacity before harvest so the fruit does not hold at ambient temperature.' },
        wheat: { label: 'Wheat', heat: { high: { threshold_t_max_c: 35.0, trigger: 'terminal heat stress window (daily maximum at or above 35 C)', action: 'Apply a light irrigation at the grain-filling stage, and plan harvest within the next few days if grain moisture already permits.', field_operation: 'Avoid late top-dressing; finish threshing preparations.' }, medium: { threshold_t_max_c: 32.0, trigger: 'forecast daily maximum temperature at or above 32 C', action: 'Keep the crop irrigated at grain filling and monitor for shrivelled grain.', field_operation: 'Harvest machinery slot to be booked in advance.' } }, market_hint: 'Check the government mandi feed: early arrivals often clear at a better price than heat-shrivelled late arrivals.', logistics_hint: 'Align threshing and pickup on the same day to avoid double handling.' },
        soybean: { label: 'Soybean', heat: { high: { threshold_t_max_c: 36.0, trigger: 'forecast daily maximum temperature at or above 36 C', action: 'Irrigate the pod-filling block at dawn and defer any inter-cultivation to avoid root damage under heat stress.', field_operation: 'Suspend mid-day weeding.' }, medium: { threshold_t_max_c: 33.0, trigger: 'forecast daily maximum temperature at or above 33 C', action: 'Protect soil moisture with mulch and scout for pod-borer activity, which rises with temperature.', field_operation: 'Scout early morning.' } }, market_hint: 'Compare the mandi benchmark against institutional oil-mill offers before selling.', logistics_hint: 'Bag and move the lot the same day to preserve moisture content.' },
        banana: { label: 'Banana', heat: { high: { threshold_t_max_c: 37.0, trigger: 'forecast daily maximum temperature at or above 37 C', action: 'Irrigate heavily in the early morning, protect bunches with leaf cover or bagging, and postpone harvest of green fruit by a day if possible.', field_operation: 'Stop all bunch-handling between 11:00 and 16:00.' }, medium: { threshold_t_max_c: 34.0, trigger: 'forecast daily maximum temperature at or above 34 C', action: 'Maintain irrigation and monitor for leaf scorch and premature ripening.', field_operation: 'Harvest in the coolest part of the day.' } }, market_hint: 'Heat advances ripening — check the price index and quick-commerce channel demand before holding the lot.', logistics_hint: 'Use a reefer or a pre-cooled truck; ambient transport will accelerate ripening.' },
      },
      rainfall_rules: { p1: true, note: 'Rainfall risk is P1 and ships only if the rainfall residual model validates. Until then the heat-risk advisory is the always-available path.', high: { threshold_mm: 50.0, trigger: 'forecast rainfall at or above 50 mm for the day', action: 'Delay harvest and field operations, secure drainage channels, and hold the lot under cover.', field_operation: 'Postpone all field work until rainfall subsides.', logistics_hint: 'Expect rural road access to degrade — reschedule pickup.' }, medium: { threshold_mm: 20.0, trigger: 'forecast rainfall at or above 20 mm for the day', action: 'Cover harvested produce and check drainage around the storage area.', field_operation: 'Harvest early in the day and secure the storage area.', logistics_hint: 'Confirm the pickup vehicle can reach the farm gate.' } },
    };
  }

  // ============================================================
  //  PROVENANCE
  // ============================================================
  function buildProvenance() {
    main.innerHTML += `
      <section class="section" id="s-provenance">
        <div class="section-head">
          <div class="eyebrow">Data & Provenance</div>
          <h2 class="section-title">Where the data comes from — <span class="hl">honestly</span></h2>
          <p class="section-sub">
            Every response carries a <span class="code">source_type</span> drawn from exactly three values:
            <span class="code">official</span>, <span class="code">historical_reference</span>, and
            <span class="code">simulated_demo</span>. Fallbacks downgrade provenance; they never upgrade it.
          </p>
        </div>

        <div id="provenanceBody">
          ${renderProvenance()}
        </div>
      </section>
    `;
  }

  function renderProvenance() {
    const p = state.provenance;
    if (!p) return '<div class="empty">Provenance data not loaded.</div>';

    const adapters = p.adapters || [];
    const licences = p.licenses || [];
    const repro = p.reproducibility || {};
    const disc = p.disclaimers || {};

    return `
      <div class="grid-2">
        <div>
          <div class="card">
            <h3>Adapters (what is wired up)</h3>
            ${adapters.map(a => `
              <div class="prov-row">
                <div class="p-icon">${a.available ? '✓' : '○'}</div>
                <div class="p-body">
                  <div class="p-title">${a.name}</div>
                  <div class="p-sub">${a.role || ''} · ${a.available ? 'wired up' : 'not available in this build'}</div>
                  <div class="p-detail">${a.available ? 'This adapter can serve data in this build.' : 'No staged data for this adapter — its role is documented but it cannot serve data yet.'}</div>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="card mt-2">
            <h3>Forecast input provenance</h3>
            ${renderProvDict(p.forecast_input)}
          </div>

          <div class="card mt-2">
            <h3>Reference dataset provenance</h3>
            ${renderProvDict(p.reference_dataset)}
          </div>

          <div class="card mt-2">
            <h3>Boundary provenance</h3>
            ${renderProvDict(p.boundaries)}
          </div>
        </div>

        <div>
          <div class="card">
            <h3>Licences & attribution</h3>
            ${licences.length ? `
              ${licences.map(l => `
                <div class="prov-row">
                  <div class="p-icon">⌨</div>
                  <div class="p-body">
                    <div class="p-title">${l.source}</div>
                    <div class="p-sub">${l.license}</div>
                  </div>
                </div>
              `).join('')}
            ` : '<div class="text-sm muted">No licences listed.</div>'}
          </div>

          <div class="card mt-2">
            <h3>Reproducibility</h3>
            <div class="row"><span class="k">Seed</span><span class="v">${repro.seed !== undefined ? repro.seed : '—'}</span></div>
            <div class="row"><span class="k">Train period</span><span class="v">${repro.train_period || '—'}</span></div>
            <div class="row"><span class="k">Test period</span><span class="v">${repro.test_period || '—'}</span></div>
            <div class="row"><span class="k">Model version</span><span class="v">${repro.model_version || '—'}</span></div>
            <div class="row"><span class="k">Git SHA</span><span class="v" style="font-family:ui-monospace,Menlo,Consolas,monospace">${repro.git_sha || '—'}</span></div>
            <div class="text-xs muted mt-1" style="line-height:1.5">A validation run is reproducible from the committed code alone. Changing the seed, model version or split dates forces a fresh run.</div>
          </div>

          <div class="card mt-2">
            <h3>Disclaimers</h3>
            ${disc.demo_data ? `<div class="prov-row"><div class="p-icon">⚠</div><div class="p-body"><div class="p-title">Illustrative data</div><div class="p-detail">${plainLabel(disc.demo_data)}</div></div></div>` : ''}
            ${disc.historical_reference ? `<div class="prov-row"><div class="p-icon">⚠</div><div class="p-body"><div class="p-title">Historical reference</div><div class="p-detail">${plainLabel(disc.historical_reference)}</div></div></div>` : ''}
            ${disc.hindcast ? `<div class="prov-row"><div class="p-icon">⚠</div><div class="p-body"><div class="p-title">Hindcast</div><div class="p-detail">${plainLabel(disc.hindcast)}</div></div></div>` : ''}
            ${disc.uncalibrated ? `<div class="prov-row"><div class="p-icon">⚠</div><div class="p-body"><div class="p-title">Uncalibrated</div><div class="p-detail">${plainLabel(disc.uncalibrated)}</div></div></div>` : ''}
            ${disc.track_b_absent ? `<div class="prov-row"><div class="p-icon">⚠</div><div class="p-body"><div class="p-title">Station evaluation absent</div><div class="p-detail">${plainLabel(disc.track_b_absent)}</div></div></div>` : ''}
          </div>

          <div class="card mt-2">
            <h3>Allowed source types</h3>
            <div class="flex flex-wrap" style="margin-top:8px">
              ${(p.allowed_source_types || ['official','historical_reference','simulated_demo']).map(s => `
                <span class="feature-chip"><b>${s}</b></span>
              `).join('')}
            </div>
            <div class="text-xs muted mt-1" style="line-height:1.5">These three values are the only allowed provenance states. A fallback may change source_type; it never invents a fourth state.</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderProvDict(d) {
    if (!d) return '<div class="text-sm muted">No provenance for this source.</div>';
    return `
      <div class="prov-row"><div class="p-icon">⌕</div><div class="p-body"><div class="p-title">source_type</div><div class="p-detail"><span class="code">${d.source_type || '—'}</span></div></div></div>
      <div class="prov-row"><div class="p-icon">⌕</div><div class="p-body"><div class="p-title">source_name</div><div class="p-detail">${d.source_name || '—'}</div></div></div>
      <div class="prov-row"><div class="p-icon">⌕</div><div class="p-body"><div class="p-title">source_url</div><div class="p-detail">${d.source_url || '—'}</div></div></div>
      <div class="prov-row"><div class="p-icon">⌕</div><div class="p-body"><div class="p-title">license</div><div class="p-detail">${d.license || '—'}</div></div></div>
      <div class="prov-row"><div class="p-icon">⌕</div><div class="p-body"><div class="p-title">is_live</div><div class="p-detail">${d.is_live !== undefined ? (d.is_live ? 'true — operational feed' : 'false — not an operational feed') : '—'}</div></div></div>
      <div class="prov-row"><div class="p-icon">⌕</div><div class="p-body"><div class="p-title">note</div><div class="p-detail" style="white-space:pre-wrap">${d.note || '—'}</div></div></div>
    `;
  }

  // ============================================================
  //  METHODOLOGY
  // ============================================================
  function buildMethodology() {
    main.innerHTML += `
      <section class="section" id="s-methodology">
        <div class="section-head">
          <div class="eyebrow">Methodology</div>
          <h2 class="section-title">How the pipeline <span class="hl">works</span></h2>
          <p class="section-sub">
            Block forecast → geospatial feature extraction → named baselines → Random Forest residual
            correction → mean-preserving area-weighted adjustment → indicative uncertainty → Panchayat
            forecast → heat-risk advisory → Market / Logistics decision support.
          </p>
        </div>

        <div class="grid-2">
          <div>
            <div class="method-step">
              <div class="ms-num">1</div>
              <div>
                <h4>Block-level (coarse) forecast</h4>
                <p>A single daily maximum temperature (and optionally minimum / rainfall) for the pilot
                Block. In this build the coarse input is a <b>seeded illustrative fixture</b>
                (<span class="code">simulated_demo</span>) — no live IMD block bulletin feed is available.</p>
              </div>
            </div>
            <div class="method-step">
              <div class="ms-num">2</div>
              <div>
                <h4>Geospatial feature extraction</h4>
                <p>For each Panchayat: elevation, slope/aspect, latitude/longitude, land cover, NDVI, and a
                training-period historical local anomaly (reference − block mean). Terrain attributes here are
                <b>illustrative</b>, not a DEM extract.</p>
              </div>
            </div>
            <div class="method-step">
              <div class="ms-num">3</div>
              <div>
                <h4>Named baselines</h4>
                <p><b>B1 — Block copy:</b> every Panchayat receives the Block value.
                <b>B2 — Elevation lapse-rate:</b> <span class="code">T_p = B_t − 6.5 °C/km · (z_p − z̄_block) / 1000</span>.
                Both are named baselines, not straw men — validation reports metrics for each.</p>
              </div>
            </div>
            <div class="method-step">
              <div class="ms-num">4</div>
              <div>
                <h4>Random Forest residual correction</h4>
                <p><span class="code">T_p,t = B_t + f_T(X_p) + e_p,t</span>, where <span class="code">f_T</span> is a
                Random Forest trained on the local anomaly with seed 42. The coarse signal is always the backbone;
                the forest only supplies a bounded local correction, so a misbehaving model degrades toward B1.</p>
              </div>
            </div>
          </div>

          <div>
            <div class="method-step">
              <div class="ms-num">5</div>
              <div>
                <h4>Mean-preserving, area-weighted adjustment</h4>
                <p>A <b>consistency / reconciliation</b> step, not an accuracy gain. For temperature the
                analogous additive form is used: <span class="code">T*_p = T_p + (B − Σ(w_p·T_p))</span>, with
                <span class="code">w_p = area_p / Σarea</span>. The PRD multiplicative form is applied verbatim
                to rainfall (P1).</p>
              </div>
            </div>
            <div class="method-step">
              <div class="ms-num">6</div>
              <div>
                <h4>Indicative uncertainty</h4>
                <p>P10–P90 ranges from empirical residual quantiles, <b>per Panchayat with a pooled fallback</b>
                for small samples. <b>Uncalibrated</b> — no coverage test, no conformal calibration. Always
                labelled <span class="code">Indicative — uncalibrated</span>.</p>
              </div>
            </div>
            <div class="method-step">
              <div class="ms-num">7</div>
              <div>
                <h4>Validation</h4>
                <p>Blocked temporal split (train 2015–2022 / test 2023–2024), <b>no random row splits</b>.
                Leave-one-Panchayat-out CV reported as indicative. An independent station holdout is reported
                when available. Metrics computed on <b>pre-adjustment</b> values.</p>
              </div>
            </div>
            <div class="method-step">
              <div class="ms-num">8</div>
              <div>
                <h4>Heat-risk crop advisory</h4>
                <p>A configurable rules layer (backend, <span class="code">advisory_rules.json</span>) evaluates
                the downscaled maximum temperature against per-crop heat thresholds. The UI only renders what the
                engine returns — no agronomic logic is written into the frontend.</p>
              </div>
            </div>
            <div class="method-step">
              <div class="ms-num">9</div>
              <div>
                <h4>Market / Logistics decision-support</h4>
                <p>The advisory hands off to a decision-support view: weather risk level, recommended action,
                logistics hint, market hint, cold-chain/reefer planning, and a pickup scheduling hint. These are
                <b>decision-support demonstrations</b>, not real transactions.</p>
              </div>
            </div>
          </div>
        </div>

        <div class="disclaimer-box mt-3">
          <b>Scientific limitations.</b> This build is scientifically limited <i>on purpose</i>, and the limits
          are surfaced in the API and UI rather than hidden: no live IMD feed, coarse input is a seeded fixture,
          The reference evaluation is a hindcast reconstruction, the station holdout is unavailable, uncertainty is indicative/uncalibrated,
          Panchayat boundaries are a schematic pilot grid, and rainfall P1 is <b>not validated</b>. The temperature /
          heat-risk path is always available. <b>This is not an operational forecast service and not
          an official IMD website.</b>
        </div>

        <div class="mt-3">
          <div class="card">
            <h3>Data licensing (summary)</h3>
            <div class="text-sm" style="color:var(--ink-2);line-height:1.6">
              ERA5-Land — Copernicus C3S licence (attribution) · CHIRPS — public domain · MODIS NDVI/land cover — NASA open licence ·
              India Geodata — CC0-1.0 · DataMeet — ODbL · schematic pilot grid — generated placeholder, no third-party data.
              Full table in the Data & Provenance panel and in <span class="code">docs/WEATHER_INTELLIGENCE.md</span>.
            </div>
          </div>
        </div>
      </section>
    `;
  }

  // ---------- boot when DOM ready ----------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
