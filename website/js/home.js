/**
 * Panchayat Weather Intelligence — public home page
 *
 * Handles the portal-level interactions (theme, language, mobile menu, deep-link section
 * routing) and renders the live product preview from the same bundled snapshot the workspace
 * uses. Every number shown here comes from the dataset — nothing is hard-coded into the page.
 */

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var DEFAULT_CROP = 'tomato';

  // ---------- Theme ----------

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    var t = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('pwi-theme', t); } catch (e) {}
    var icon = $('themeIcon');
    var label = $('themeLabel');
    var btn = $('themeToggle');
    if (icon) icon.textContent = t === 'dark' ? '\u2600' : '\u263E';
    if (label) label.textContent = t === 'dark' ? 'Light' : 'Dark';
    if (btn) btn.setAttribute('aria-pressed', t === 'dark');
    refreshTiles(t);
  }

  // ---------- Mobile navigation ----------

  function closeMenu() {
    var nav = $('siteNav');
    var toggle = $('siteNavToggle');
    if (nav) nav.classList.remove('nav-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  function wireMenu() {
    var nav = $('siteNav');
    var toggle = $('siteNavToggle');
    if (!nav || !toggle) return;
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !nav.classList.contains('nav-open');
      nav.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('.site-nav-menu a').forEach(function (a) {
      a.addEventListener('click', closeMenu);
    });
    document.addEventListener('click', function (e) {
      if (nav.classList.contains('nav-open') && !nav.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 900) closeMenu();
    });
  }

  // ---------- Deep-link section routing ----------
  // /about, /how-it-works and /data are routed to this page, so map the path to a section.

  function routeFromPath() {
    var map = {
      '/about': 'about',
      '/how-it-works': 'how-it-works',
      '/faq': 'faq',
      '/index.html': null,
      '/': null
    };
    var path = window.location.pathname.replace(/\/+$/, '') || '/';
    var target = Object.prototype.hasOwnProperty.call(map, path) ? map[path] : null;
    if (!target) return;
    var el = document.getElementById(target);
    if (el) {
      window.requestAnimationFrame(function () {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  // ---------- Language ----------
  // The workspace carries the full i18n dictionary; the home page translates the strings it owns
  // so the selector is a working control on this page too.

  var I18N = {
    en: {
      nav: {
        '#siteTop': 'Home',
        '#about': 'About',
        '#how-it-works': 'How It Works',
        '#capabilities': 'Capabilities',
        'app.html#downscale': 'Weather Intelligence',
        'app.html#map': 'Panchayat Map',
        'app.html#advisory': 'Advisory',
        'app.html#methodology': 'Methodology',
        'app.html#provenance': 'Data & Provenance'
      },
      heroSub: 'From Block-level forecasts to localized Panchayat-level agricultural decision support.',
      heroPrimary: 'Explore Weather Intelligence',
      heroSecondary: 'How It Works',
      headings: {
        aboutTitle: 'A block-level forecast hides the differences that matter on the ground',
        capTitle: 'Everything the platform provides',
        hiwTitle: 'Nine steps from a Block bulletin to a field action',
        previewTitle: 'See Panchayat-level intelligence',
        whyTitle: 'Who uses Panchayat-scale weather information',
        sigTitle: 'Three things this platform does that a weather dashboard does not',
        trustTitle: 'What you are looking at, stated plainly',
        faqTitle: 'Frequently asked questions'
      }
    },
    hi: {
      nav: {
        '#siteTop': 'मुख्य पृष्ठ',
        '#about': 'परिचय',
        '#how-it-works': 'यह कैसे काम करता है',
        '#capabilities': 'क्षमताएँ',
        'app.html#downscale': 'मौसम बुद्धिमत्ता',
        'app.html#map': 'पंचायत मानचित्र',
        'app.html#advisory': 'सलाह',
        'app.html#methodology': 'कार्यप्रणाली',
        'app.html#provenance': 'डेटा और स्रोत'
      },
      heroSub: 'ब्लॉक स्तर के पूर्वानुमान से पंचायत स्तर के स्थानीयकृत कृषि-मौसम निर्णय समर्थन तक।',
      heroPrimary: 'मौसम बुद्धिमत्ता देखें',
      heroSecondary: 'यह कैसे काम करता है',
      headings: {
        aboutTitle: 'ब्लॉक स्तर का पूर्वानुमान ज़मीनी अंतर छिपा देता है',
        capTitle: 'यह प्लेटफ़ॉर्म क्या-क्या देता है',
        hiwTitle: 'ब्लॉक बुलेटिन से खेत के निर्णय तक नौ चरण',
        previewTitle: 'पंचायत स्तर की जानकारी देखें',
        whyTitle: 'पंचायत स्तर की मौसम जानकारी किसके काम आती है',
        sigTitle: 'ये तीन बातें इसे सामान्य डैशबोर्ड से अलग बनाती हैं',
        trustTitle: 'आप क्या देख रहे हैं — स्पष्ट रूप से',
        faqTitle: 'अक्सर पूछे जाने वाले प्रश्न'
      }
    }
  };

  function setLanguage(lang) {
    var l = I18N[lang] ? lang : 'en';
    var dict = I18N[l];
    document.documentElement.setAttribute('lang', l);
    try { localStorage.setItem('pwi-lang', l); } catch (e) {}

    document.querySelectorAll('.site-nav-menu .nav-item').forEach(function (a) {
      var key = a.getAttribute('href');
      if (dict.nav[key]) a.textContent = dict.nav[key];
    });

    var sub = document.querySelector('.hero-sub');
    if (sub) sub.textContent = dict.heroSub;

    var actions = document.querySelectorAll('.hero-actions .ctrl-btn');
    if (actions.length >= 2) {
      actions[0].textContent = dict.heroPrimary;
      actions[1].textContent = dict.heroSecondary;
    }

    Object.keys(dict.headings).forEach(function (id) {
      var el = $(id);
      if (el) el.textContent = dict.headings[id];
    });

    var select = $('langSelect');
    if (select && select.value !== l) select.value = l;
  }

  function wireLanguage() {
    var select = $('langSelect');
    if (!select) return;
    var saved = 'en';
    try { saved = localStorage.getItem('pwi-lang') || 'en'; } catch (e) {}
    if (I18N[saved]) select.value = saved;
    select.addEventListener('change', function (e) { setLanguage(e.target.value); });
  }

  // ---------- Live product preview ----------

  var previewState = {
    map: null,
    tileLayer: null,
    geoLayer: null,
    selectedId: null,
    features: [],
    block: null
  };

  var TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  var TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  var TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener" target="_blank">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" rel="noopener" target="_blank">CARTO</a>';

  function bundle() {
    return window.PWI_BUNDLE || window.KS_WEATHER_BUNDLE || null;
  }

  function riskFor(tempC) {
    var advisory = window.PWI_ADVISORY;
    if (advisory && typeof advisory.evaluateRisk === 'function') {
      try {
        return advisory.evaluateRisk(DEFAULT_CROP, tempC);
      } catch (e) { /* fall through */ }
    }
    return { level: 'none', trigger: 'No advisory rules loaded', action: 'No advisory available.' };
  }

  function riskPill(level) {
    if (level === 'high') return '<span class="pill pill-high">High heat risk</span>';
    if (level === 'medium') return '<span class="pill pill-medium">Moderate heat risk</span>';
    return '<span class="pill pill-none">Normal heat risk</span>';
  }

  function tileUrl(theme) {
    return theme === 'dark' ? TILE_DARK : TILE_LIGHT;
  }

  function refreshTiles(theme) {
    if (!previewState.map || !window.L) return;
    if (previewState.tileLayer) previewState.map.removeLayer(previewState.tileLayer);
    previewState.tileLayer = window.L.tileLayer(tileUrl(theme), {
      maxZoom: 18,
      minZoom: 5,
      attribution: TILE_ATTR
    }).addTo(previewState.map);
  }

  function renderBars() {
    var host = $('pvBars');
    if (!host) return;
    var feats = previewState.features.slice().sort(function (a, b) {
      return (b.properties.t_max_c || 0) - (a.properties.t_max_c || 0);
    });
    var values = feats.map(function (f) { return f.properties.t_max_c; });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);

    host.innerHTML = feats.map(function (f) {
      var p = f.properties;
      var norm = max === min ? 0.5 : (p.t_max_c - min) / (max - min);
      var colour = window.PWI_GEO.temperatureColor(p.t_max_c, min, max);
      var isSelected = p.panchayat_id === previewState.selectedId;
      return '' +
        '<button type="button" class="preview-bar-row" data-pid="' + p.panchayat_id + '"' +
        ' style="background:none;border:0;padding:2px 0;cursor:pointer;text-align:left;' +
        (isSelected ? 'font-weight:700;' : '') + '">' +
        '<span class="pbr-name">' + p.name + '</span>' +
        '<span class="preview-bar-track"><span class="preview-bar-fill" style="width:' +
        Math.max(6, norm * 100).toFixed(1) + '%;background:' + colour + ';display:block"></span></span>' +
        '<span class="pbr-val">' + p.t_max_c.toFixed(1) + ' &deg;C</span>' +
        '</button>';
    }).join('');

    host.querySelectorAll('[data-pid]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectPanchayat(btn.getAttribute('data-pid'));
      });
    });
  }

  function renderSelected() {
    var host = $('pvSelected');
    var actions = $('pvActions');
    if (!host) return;

    var feat = previewState.features.find(function (f) {
      return f.properties.panchayat_id === previewState.selectedId;
    });
    if (!feat) {
      host.textContent = 'Select a Panchayat from the list to inspect its estimate.';
      if (actions) actions.innerHTML = '';
      return;
    }

    var p = feat.properties;
    var adv = riskFor(p.t_max_c);
    var range = (p.range_low_c != null && p.range_high_c != null)
      ? p.range_low_c.toFixed(1) + ' – ' + p.range_high_c.toFixed(1) + ' &deg;C'
      : 'not reported';

    host.innerHTML = '' +
      '<div class="preview-value" style="font-size:23px">' + p.t_max_c.toFixed(1) + ' &deg;C</div>' +
      '<div class="preview-sub">' + p.name + ' &middot; LGD ' + (p.lgd_code || '—') +
      ' &middot; elevation ' + p.elevation_m + ' m</div>' +
      '<div class="preview-sub">Indicative P10–P90: ' + range + '</div>' +
      '<div style="margin-top:8px">' + riskPill(adv.level) +
      ' <span class="preview-sub" style="display:inline">for ' + (adv.crop_label || 'Tomato') + '</span></div>' +
      '<div class="preview-sub" style="margin-top:10px"><b>Why this Panchayat:</b> Block baseline ' +
      (p.b1_t_max_c != null ? p.b1_t_max_c.toFixed(2) : '—') + ' &deg;C &rarr; terrain correction ' +
      (p.anomaly_c != null ? (p.anomaly_c > 0 ? '+' : '') + Number(p.anomaly_c).toFixed(2) : '—') +
      ' &deg;C &rarr; reconciled estimate ' + p.t_max_c.toFixed(2) + ' &deg;C.</div>' +
      '<div class="preview-sub" style="margin-top:8px"><b>Recommended action:</b> ' + adv.action + '</div>';

    if (actions) {
      actions.innerHTML = '' +
        '<a class="ctrl-btn primary" href="app.html#advisory">View full advisory</a>' +
        '<a class="ctrl-btn" href="app.html#overview">Ask the assistant</a>';
    }
  }

  function selectPanchayat(pid) {
    previewState.selectedId = pid;
    renderBars();
    renderSelected();
    if (!previewState.map) {
      // A Panchayat was selected before the map finished loading — make sure it renders.
      scheduleMiniMap();
      return;
    }
    if (previewState.geoLayer) {
      previewState.geoLayer.setStyle(function (feature) {
        return styleFor(feature, feature.properties.panchayat_id === pid);
      });
    }
  }

  function styleFor(feature, isSelected) {
    var values = previewState.features.map(function (f) { return f.properties.t_max_c; });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var t = feature.properties.t_max_c;
    return {
      fillColor: window.PWI_GEO.temperatureColor(t, min, max),
      fillOpacity: isSelected ? 0.95 : 0.8,
      color: isSelected ? '#b45309' : '#0b1f36',
      weight: isSelected ? 2.6 : 1,
      opacity: isSelected ? 1 : 0.5
    };
  }

  // The mapping library is declared with defer in the page, so it is fetched in parallel with the
  // other scripts and never blocks the first paint. This helper exists so the preview can still be
  // rendered if the library arrives late or has to be fetched on demand.
  var leafletPromise = null;

  function ensureLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="js/vendor/leaflet.js"]');
      if (existing) {
        existing.addEventListener('load', function () {
          window.L ? resolve(window.L) : reject(new Error('Leaflet did not initialise'));
        });
        existing.addEventListener('error', function () { reject(new Error('Leaflet could not be fetched')); });
        return;
      }
      var script = document.createElement('script');
      script.src = 'js/vendor/leaflet.js';
      script.async = true;
      script.onload = function () { window.L ? resolve(window.L) : reject(new Error('Leaflet did not initialise')); };
      script.onerror = function () { reject(new Error('Leaflet could not be fetched')); };
      document.head.appendChild(script);
    });
    return leafletPromise;
  }

  function scheduleMiniMap() {
    if (window.L) {
      renderMiniMap();
      return;
    }
    ensureLeaflet().then(renderMiniMap, function () { renderMiniMap(); });
  }

  function renderMiniMap() {
    var el = $('pvMap');
    if (!el) return;
    if (!window.L || !window.PWI_GEO) {
      el.innerHTML = '<div class="map-fallback" style="padding:14px;font-size:12px">' +
        '<div class="map-fallback-title">Map unavailable</div>' +
        '<p>The mapping library could not be loaded, so the geographic view is not shown. ' +
        'Panchayat values remain available in the list.</p></div>';
      return;
    }

    var block = previewState.block || {};
    var bbox = block.bbox || [73.8, 20.16, 73.94, 20.3];
    var collection = window.PWI_GEO.buildTessellation(block.panchayats || [], bbox, { seed: 271012 });
    window.PWI_GEO.joinValues(collection, previewState.features);

    previewState.map = window.L.map(el, {
      zoomControl: false,
      attributionControl: true,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      minZoom: 5,
      maxZoom: 18
    });

    previewState.map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], { padding: [8, 8] });
    refreshTiles(currentTheme());

    previewState.geoLayer = window.L.geoJSON(collection, {
      style: function (feature) {
        return styleFor(feature, feature.properties.panchayat_id === previewState.selectedId);
      },
      onEachFeature: function (feature, layer) {
        layer.bindTooltip(
          '<b>' + feature.properties.name + '</b><br>' +
          (feature.properties.t_max_c != null ? feature.properties.t_max_c.toFixed(1) + ' °C' : '—'),
          { sticky: true, className: 'pwi-tooltip' }
        );
        layer.on('click', function () { selectPanchayat(feature.properties.panchayat_id); });
      }
    }).addTo(previewState.map);

    window.addEventListener('resize', function () {
      if (previewState.map) previewState.map.invalidateSize();
    });
  }

  function renderPreview() {
    var b = bundle();
    var statusEl = $('pvStatus');
    var footEl = $('pvFoot');

    if (!b || !b.downscale || !b.downscale.features || !b.downscale.features.length) {
      var bars = $('pvBars');
      if (bars) bars.innerHTML = '<div class="preview-sub">The bundled pilot snapshot could not be loaded, so the preview is unavailable. The weather workspace will report the same condition.</div>';
      if ($('pvSelected')) $('pvSelected').textContent = 'No Panchayat records loaded.';
      if (statusEl) statusEl.innerHTML = '<span class="status-dot degraded"></span> Data status: preview unavailable';
      return;
    }

    // One record per Panchayat — the bundled snapshot carries three lead days.
    var day1 = b.downscale.features.filter(function (f) {
      return ((f.properties && f.properties.lead_days) || 1) === 1;
    });
    previewState.features = day1.length ? day1 : b.downscale.features;
    previewState.block = b.pilot || null;

    var day0 = (b.forecast && b.forecast.days && b.forecast.days[0]) || null;
    var blockTemp = $('pvBlockTemp');
    if (blockTemp && day0) {
      blockTemp.innerHTML = day0.t_max_c.toFixed(1) + ' <span style="font-size:14px;font-weight:600;color:var(--ink-3)">&deg;C maximum</span>';
    }
    var blockMeta = $('pvBlockMeta');
    if (blockMeta) {
      var blockMetaText = [];
      if (b.pilot && b.pilot.block) {
        blockMetaText.push(b.pilot.block.name + ' Block, ' + b.pilot.block.district + ' district, ' + b.pilot.block.state);
      }
      if (day0) {
        blockMetaText.push('valid ' + day0.date + ' (lead day +' + (day0.lead_days || 1) + ')');
        if (day0.rainfall_mm != null) blockMetaText.push('rainfall ' + day0.rainfall_mm.toFixed(1) + ' mm');
      }
      blockMeta.textContent = blockMetaText.join(' · ');
    }

    var values = previewState.features.map(function (f) { return f.properties.t_max_c; });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var spread = $('pvSpread');
    if (spread) {
      spread.innerHTML = 'Spread across ' + previewState.features.length + ' Panchayats: ' +
        min.toFixed(1) + ' – ' + max.toFixed(1) + ' °C (' + (max - min).toFixed(1) +
        ' °C of intra-Block variation) against a single Block value of ' +
        (day0 ? day0.t_max_c.toFixed(1) : '—') + ' °C.';
    }

    var title = $('pvTitle');
    if (title && b.pilot && b.pilot.block) {
      title.textContent = 'Pilot block · ' + b.pilot.block.name + ', ' + b.pilot.block.district + ', ' + b.pilot.block.state;
    }

    if (statusEl) {
      statusEl.innerHTML = '<span class="status-dot degraded"></span> Data status: staged illustrative data';
    }
    if (footEl) {
      // Human-readable model label; the raw model identifier lives in Data & Provenance.
      var rawVersion = (b.downscale.meta && b.downscale.meta.model_version) || '';
      var versionMatch = String(rawVersion).match(/v(\d+(?:\.\d+)*)/);
      footEl.textContent = 'Illustrative boundaries — not official Gram Panchayat boundaries. Model: Random Forest residual correction' +
        (versionMatch ? ', version ' + versionMatch[1] : '') + '.';
    }

    previewState.selectedId = previewState.features[0].properties.panchayat_id;
    renderBars();
    renderSelected();
    scheduleMiniMap();
  }

  // ---------- Boot ----------

  function boot() {
    var theme = 'light';
    try {
      var saved = localStorage.getItem('pwi-theme');
      if (saved === 'light' || saved === 'dark') theme = saved;
    } catch (e) {}
    applyTheme(theme);

    $('themeToggle') && $('themeToggle').addEventListener('click', function () {
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    });

    wireMenu();
    wireLanguage();

    var lang = 'en';
    try { lang = localStorage.getItem('pwi-lang') || 'en'; } catch (e) {}
    if (I18N[lang]) setLanguage(lang);

    renderPreview();
    routeFromPath();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
