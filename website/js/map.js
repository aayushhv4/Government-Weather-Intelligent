/**
 * Panchayat Weather Intelligence — Geographic Panchayat Map (Leaflet)
 *
 * Renders the pilot Block on a real geographic basemap and drapes the illustrative Panchayat
 * tessellation over it. Every polygon is joined to a model record through the stable
 * Panchayat identifier (panchayat_id / LGD code) — geometry has no weather values of its own.
 *
 * Layers      : Estimated Temperature (default) · Heat Risk · Elevation · Downscaling Difference
 * Comparison  : RF residual output · B1 Block copy · B2 Elevation lapse-rate
 * Honesty     : boundaries are ILLUSTRATIVE and disclosed as such on every surface.
 * Resilience  : if the mapping library or the tile provider is unreachable the map degrades to a
 *               clearly labelled non-geographic value view instead of failing silently.
 */

(function () {
  'use strict';

  var METHODS = {
    final: {
      key: 't_max_c',
      short: 'RF',
      label: 'RF — Residual correction (downscaled output)',
      note: 'Random Forest residual correction output after area-weighted reconciliation. This is the estimate used by the advisory chain.'
    },
    b1: {
      key: 'b1_t_max_c',
      short: 'B1',
      label: 'B1 — Block copy baseline',
      note: 'Baseline: every Panchayat receives the same Block-level value, so the map shows no spatial difference by construction.'
    },
    b2: {
      key: 'b2_t_max_c',
      short: 'B2',
      label: 'B2 — Elevation lapse-rate baseline',
      note: 'Baseline: standard environmental lapse rate (\u22126.5 \u00b0C/km) applied to each Panchayat elevation relative to the block mean.'
    }
  };

  var LAYERS = {
    temperature: {
      label: 'Estimated Temperature',
      unit: '°C',
      methodDependent: true,
      description: 'Downscaled maximum temperature estimate per Panchayat.'
    },
    heat: {
      label: 'Heat Risk',
      unit: '',
      methodDependent: false,
      description: 'Risk band from the configured heat-stress thresholds for the active crop.'
    },
    elevation: {
      label: 'Elevation',
      unit: ' m',
      methodDependent: false,
      description: 'Terrain elevation used as the primary downscaling predictor.'
    },
    difference: {
      label: 'Downscaling Difference',
      unit: '°C',
      methodDependent: false,
      description: 'Downscaled estimate minus the Block-copy baseline — where terrain moved the value.'
    }
  };

  // Keyless public tile sources — no API key can ever break the basemap.
  // Light: OpenStreetMap standard raster tiles (osm.org tile usage policy applies).
  // Dark:  Esri World Imagery (public ArcGIS Online tile service), which reads well
  //        under heat-coloured polygons; OSM has no official dark style.
  var TILE_LIGHT = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var TILE_DARK = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  var TILE_ATTRIBUTION_LIGHT = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
  var TILE_ATTRIBUTION_DARK = 'Tiles &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics';

  var state = {
    map: null,
    tileLayer: null,
    blockOutline: null,
    geoLayer: null,
    currentLayer: 'temperature',
    currentMethod: 'final',
    collection: null,
    tileErrors: 0,
    tileFailed: false,
    fallbackRendered: false,
    theme: 'light'
  };

  var $ = function (id) { return document.getElementById(id); };

  // ---------- value access per layer / method ----------

  function methodValue(props, method) {
    var key = METHODS[method].key;
    var v = props.values ? props.values[key] : props[key];
    return v == null ? null : Number(v);
  }

  function layerValue(props, layer, method) {
    if (layer === 'temperature') return methodValue(props, method);
    if (layer === 'elevation') return props.elevation_m == null ? null : Number(props.elevation_m);
    if (layer === 'difference') {
      var final = methodValue(props, 'final');
      var base = methodValue(props, 'b1');
      return (final == null || base == null) ? null : Number((final - base).toFixed(2));
    }
    return null;
  }

  function activeTemperatureMethod() {
    // Heat-risk and difference layers are always evaluated on the downscaled output.
    return state.currentLayer === 'temperature' ? state.currentMethod : 'final';
  }

  function seriesFor(layer, method) {
    var feats = (state.collection && state.collection.features) || [];
    var out = [];
    feats.forEach(function (f) {
      var v = layerValue(f.properties, layer, method);
      if (v != null && isFinite(v)) out.push(v);
    });
    return out;
  }

  function cropRiskLevel(tempC) {
    var advisory = window.PWI_ADVISORY;
    if (!advisory || tempC == null) return 'none';
    try {
      var crop = advisory.getCrop();
      var res = advisory.evaluateRisk(crop, tempC);
      return (res && res.level) || 'none';
    } catch (e) {
      return 'none';
    }
  }

  var RISK_COLORS = { high: '#b91c1c', medium: '#b45309', none: '#1a7342', unknown: '#94a3b8' };

  function elevationColor(norm) {
    // Sequential terrain ramp: pale teal (low) → deep slate-indigo (high).
    var stops = [
      { t: 0, rgb: [222, 240, 238] },
      { t: 1 / 3, rgb: [125, 178, 190] },
      { t: 2 / 3, rgb: [66, 116, 152] },
      { t: 1, rgb: [36, 62, 102] }
    ];
    var v = Math.max(0, Math.min(1, norm == null ? 0.5 : norm));
    for (var i = 1; i < stops.length; i++) {
      var a = stops[i - 1], b = stops[i];
      if (v <= b.t) {
        var k = (v - a.t) / (b.t - a.t || 1);
        return '#' + [0, 1, 2].map(function (c) {
          var val = Math.round(a.rgb[c] + (b.rgb[c] - a.rgb[c]) * k);
          return ('0' + val.toString(16)).slice(-2);
        }).join('');
      }
    }
    return '#243e66';
  }

  function styleFor(props) {
    var layer = state.currentLayer;
    var method = activeTemperatureMethod();
    var geo = window.PWI_GEO;

    if (layer === 'heat') {
      var t = methodValue(props, 'final');
      var level = cropRiskLevel(t);
      var colors = { high: '#b91c1c', medium: '#d97706', none: '#15803d' };
      return {
        fillColor: colors[level] || '#94a3b8',
        fillOpacity: 0.72,
        color: '#0b1f36',
        weight: 1.1,
        opacity: 0.55
      };
    }

    var values = seriesFor(layer, method);
    var min = values.length ? Math.min.apply(null, values) : null;
    var max = values.length ? Math.max.apply(null, values) : null;
    var v = layerValue(props, layer, method);

    if (layer === 'elevation') {
      return { fillColor: elevationColor(geo.normalise(v, min, max)), fillOpacity: 0.78, color: '#0b1f36', weight: 1.1, opacity: 0.5 };
    }
    if (layer === 'difference') {
      var extent = Math.max(0.5, Math.max(Math.abs(min == null ? 0 : min), Math.abs(max == null ? 0 : max)));
      return { fillColor: geo.differenceColor(v, extent), fillOpacity: 0.82, color: '#0b1f36', weight: 1.1, opacity: 0.5 };
    }
    // temperature
    return {
      fillColor: geo.temperatureColor(v, min, max),
      fillOpacity: 0.82,
      color: '#0b1f36',
      weight: 1.1,
      opacity: 0.55
    };
  }

  // ---------- legend ----------

  function updateLegend() {
    var labelEl = $('mapLegendLabel');
    var minEl = $('mapLegendMin');
    var maxEl = $('mapLegendMax');
    var gradientEl = $('mapLegendGradient');
    var bandEl = $('mapLegendBands');
    var layer = state.currentLayer;
    var method = activeTemperatureMethod();

    if (labelEl) labelEl.textContent = LAYERS[layer].label + (layer === 'temperature' ? ' · ' + METHODS[method].short : '');

    if (layer === 'heat') {
      if (gradientEl) gradientEl.style.display = 'none';
      if (bandEl) {
        bandEl.style.display = 'flex';
        bandEl.innerHTML = [
          { c: '#15803d', t: 'Normal' },
          { c: '#d97706', t: 'Moderate' },
          { c: '#b91c1c', t: 'High' }
        ].map(function (b) {
          return '<span class="legend-band"><i style="background:' + b.c + '"></i>' + b.t + '</span>';
        }).join('');
      }
      if (minEl) minEl.textContent = '';
      if (maxEl) maxEl.textContent = '';
      return;
    }

    if (bandEl) { bandEl.style.display = 'none'; bandEl.innerHTML = ''; }
    if (gradientEl) gradientEl.style.display = '';

    var values = seriesFor(layer, method);
    var min = values.length ? Math.min.apply(null, values) : null;
    var max = values.length ? Math.max.apply(null, values) : null;
    var unit = LAYERS[layer].unit;
    var isDiff = layer === 'difference';

    if (gradientEl) {
      if (layer === 'elevation') {
        gradientEl.style.background = 'linear-gradient(90deg, #def0ee 0%, #7db2be 33%, #427498 66%, #243e66 100%)';
      } else if (isDiff) {
        gradientEl.style.background = 'linear-gradient(90deg, #0284c7 0%, #d7d7d7 50%, #b91c1c 100%)';
      } else {
        gradientEl.style.background = 'linear-gradient(90deg, #0284c7 0%, #0d7f76 30%, #b45309 55%, #c2410c 80%, #b91c1c 100%)';
      }
    }

    if (minEl) minEl.textContent = min == null ? '—' : min.toFixed(isDiff ? 2 : 1) + unit;
    if (maxEl) maxEl.textContent = max == null ? '—' : max.toFixed(isDiff ? 2 : 1) + unit;
  }

  // ---------- map construction ----------

  function setStatus(message, isWarning) {
    var el = $('mapStatus');
    if (!el) return;
    if (!message) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.style.display = 'block';
    el.className = 'map-status' + (isWarning ? ' warn' : '');
    el.textContent = message;
  }

  function tileUrlFor(theme) {
    return theme === 'dark' ? TILE_DARK : TILE_LIGHT;
  }

  function tileAttributionFor(theme) {
    return theme === 'dark' ? TILE_ATTRIBUTION_DARK : TILE_ATTRIBUTION_LIGHT;
  }

  function ensureBasemap(theme) {
    if (!state.map) return;
    state.theme = theme === 'dark' ? 'dark' : 'light';
    if (state.tileLayer) {
      state.map.removeLayer(state.tileLayer);
      state.tileLayer = null;
    }
    if (state.tileFailed) return;
    var layer = window.L.tileLayer(tileUrlFor(state.theme), {
      maxZoom: 18,
      minZoom: 5,
      attribution: tileAttributionFor(state.theme),
      crossOrigin: true
    });
    var errors = 0;
    layer.on('tileerror', function () {
      errors += 1;
      if (errors >= 4 && !state.tileFailed) {
        state.tileFailed = true;
        setStatus('Basemap tiles are unreachable right now — Panchayat values are still shown, without map imagery underneath.', true);
        var container = $('pwiMap');
        if (container) container.classList.add('map-no-tiles');
      }
    });
    layer.on('tileload', function () {
      if (!state.tileFailed) setStatus('');
    });
    layer.addTo(state.map);
    state.tileLayer = layer;
  }

  function blockBounds() {
    var block = window.PWI_WEATHER && window.PWI_WEATHER.state.block && window.PWI_WEATHER.state.block.block;
    var bbox = (block && block.bbox) || [73.8, 20.16, 73.94, 20.3];
    return [[bbox[1], bbox[0]], [bbox[3], bbox[2]]];
  }

  function buildCollection() {
    var weather = window.PWI_WEATHER;
    var geo = window.PWI_GEO;
    if (!weather || !geo) return null;
    var block = weather.state.block && weather.state.block.block;
    var panchayats = (weather.state.block && weather.state.block.panchayats) ||
      weather.state.panchayats || [];
    if (!panchayats.length) return null;
    var bbox = (block && block.bbox) || [73.8, 20.16, 73.94, 20.3];
    var collection = geo.buildTessellation(panchayats, bbox, { seed: 271012 });
    geo.joinValues(collection, weather.uniquePanchayatFeatures());
    return collection;
  }

  /**
   * Tear down the current map instance and clear Leaflet's container marker.
   * Without this, rebuilding the map (for example after a basemap or library failure that has since
   * recovered) would throw "Map container is already initialized".
   */
  function resetContainer(container) {
    if (state.map) {
      try { state.map.remove(); } catch (e) { /* already gone */ }
      state.map = null;
      state.tileLayer = null;
      state.blockOutline = null;
      state.geoLayer = null;
    }
    var el = container || $('pwiMap');
    if (el && el._leaflet_id) {
      try { delete el._leaflet_id; } catch (e) { el._leaflet_id = undefined; }
    }
  }

  function initMap() {
    if (state.map) return true;
    var container = $('pwiMap');
    if (!container) return false;
    if (!window.L) return false;
    if (container._leaflet_id) resetContainer(container);

    state.map = window.L.map(container, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
      minZoom: 5,
      maxZoom: 18
    });
    window.L.control.zoom({ position: 'topleft' }).addTo(state.map);
    window.L.control.scale({ position: 'bottomleft', imperial: false }).addTo(state.map);

    state.map.fitBounds(blockBounds(), { padding: [18, 18] });

    // Pilot block envelope — published fixture extent, drawn as geographic context.
    var bbox = blockBounds();
    state.blockOutline = window.L.rectangle(bbox, {
      color: '#0f4c81',
      weight: 2,
      dashArray: '6 5',
      fill: false,
      interactive: false
    }).addTo(state.map);

    ensureBasemap(state.theme);
    setStatus('');
    return true;
  }

  function renderFallbackList(reason) {
    var container = $('pwiMap');
    if (!container) return;
    resetContainer(container);
    var feats = (state.collection && state.collection.features) || [];
    var rows = feats.map(function (f) {
      var p = f.properties;
      var t = methodValue(p, 'final');
      return '<li><b>' + p.name + '</b><span>' + (t == null ? '—' : t.toFixed(1) + ' °C') + '</span></li>';
    }).join('');
    container.innerHTML =
      '<div class="map-fallback" role="status">' +
      '<div class="map-fallback-title">Geographic basemap unavailable</div>' +
      '<p>' + reason + ' Panchayat estimates remain fully usable and are listed below.</p>' +
      '<ul class="map-fallback-list">' + (rows || '<li>No Panchayat records loaded.</li>') + '</ul>' +
      '<p class="map-fallback-note">' + window.PWI_GEO.BOUNDARY_DISCLOSURE + '</p>' +
      '<div><button type="button" class="ctrl-btn" id="mapRetryBtn">Retry the map</button></div>' +
      '</div>';
    state.fallbackRendered = true;

    var retry = $('mapRetryBtn');
    if (retry) {
      retry.addEventListener('click', function () {
        state.fallbackRendered = false;
        state.tileFailed = false;
        state.tileErrors = 0;
        container.innerHTML = '';
        renderMap();
      });
    }
  }

  // ---------- public render ----------

  function renderMap() {
    var weather = window.PWI_WEATHER;
    var feats = weather ? weather.uniquePanchayatFeatures() : [];
    var container = $('pwiMap');
    if (!container) return;

    state.collection = buildCollection();

    if (!feats.length || !state.collection || !state.collection.features.length) {
      resetContainer(container);
      container.innerHTML = '<div class="map-empty">Downscaled Panchayat estimates are not loaded yet. Run the downscaling step to populate the map.</div>';
      updateLegend();
      return;
    }

    if (state.fallbackRendered) {
      container.innerHTML = '';
      state.fallbackRendered = false;
    }

    if (!window.L) {
      renderFallbackList('The interactive mapping library could not be loaded (no network access or blocked script).');
      updateLegend();
      return;
    }

    if (!initMap()) {
      renderFallbackList('The map view could not be created in this browser.');
      updateLegend();
      return;
    }

    state.map.invalidateSize();

    if (state.geoLayer) {
      state.map.removeLayer(state.geoLayer);
      state.geoLayer = null;
    }

    var selectedId = weather.state.selectedPanchayatId;

    state.geoLayer = window.L.geoJSON(state.collection, {
      style: function (feature) {
        var s = styleFor(feature.properties);
        var isSelected = feature.properties.panchayat_id === selectedId;
        if (isSelected) {
          s.color = '#b45309';
          s.weight = 3;
          s.opacity = 1;
          s.fillOpacity = Math.min(0.95, (s.fillOpacity || 0.8) + 0.1);
        }
        return s;
      },
      onEachFeature: function (feature, layer) {
        var p = feature.properties;
        layer.bindTooltip(
          '<b>' + p.name + '</b><br>' +
          (p.t_max_c == null ? '' : p.t_max_c.toFixed(1) + ' °C · ') + p.elevation_m + ' m',
          { sticky: true, direction: 'top', className: 'pwi-tooltip' }
        );
        layer.on('mouseover', function () { layer.setStyle({ weight: 2.4, opacity: 0.9 }); });
        layer.on('mouseout', function () { state.geoLayer.resetStyle(layer); });
        layer.on('click', function () {
          selectPanchayat(p.panchayat_id);
          layer.bindPopup(popupHtml(p), { maxWidth: 300, className: 'pwi-popup' }).openPopup(layer.getBounds().getCenter());
        });
      }
    }).addTo(state.map);

    updateLegend();
  }

  function popupHtml(p) {
    var v = p.values || {};
    var t = v.t_max_c != null ? v.t_max_c.toFixed(1) + ' °C' : '—';
    var range = (v.range_low_c != null && v.range_high_c != null)
      ? v.range_low_c.toFixed(1) + ' – ' + v.range_high_c.toFixed(1) + ' °C'
      : 'Indicative (uncalibrated)';
    return '' +
      '<div class="pwi-popup-inner">' +
      '<div class="pwi-popup-name">' + p.name + '</div>' +
      '<div class="pwi-popup-id">LGD ' + (p.lgd_code || '—') + '</div>' +
      '<div class="pwi-popup-row"><span>Estimated max temp</span><b>' + t + '</b></div>' +
      '<div class="pwi-popup-row"><span>Indicative range (P10–P90)</span><b>' + range + '</b></div>' +
      '<div class="pwi-popup-row"><span>Elevation</span><b>' + p.elevation_m + ' m</b></div>' +
      '<div class="pwi-popup-actions">' +
      '<button type="button" class="ctrl-btn primary" data-popup-advisory="1">View Advisory</button>' +
      '<button type="button" class="ctrl-btn" data-popup-ask="1">Ask Assistant</button>' +
      '</div>' +
      '<div class="pwi-popup-note">' + window.PWI_GEO.BOUNDARY_DISCLOSURE + '</div>' +
      '</div>';
  }

  function selectPanchayat(pid) {
    var weather = window.PWI_WEATHER;
    if (!weather) return;
    weather.selectPanchayat(pid);
    renderMapDetail(pid);
    if (state.geoLayer) state.geoLayer.setStyle(styleForFeatureRefresh());
    if (typeof window.refreshOverviewSelectedPanchayat === 'function') {
      window.refreshOverviewSelectedPanchayat();
    }
  }

  function styleForFeatureRefresh() {
    var selectedId = window.PWI_WEATHER && window.PWI_WEATHER.state.selectedPanchayatId;
    return function (feature) {
      var s = styleFor(feature.properties);
      if (feature.properties.panchayat_id === selectedId) {
        s.color = '#b45309';
        s.weight = 3;
        s.opacity = 1;
        s.fillOpacity = Math.min(0.95, (s.fillOpacity || 0.8) + 0.1);
      }
      return s;
    };
  }

  // Delegated handlers for popup buttons (popups are re-created on every click).
  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.getAttribute) return;
    if (target.getAttribute('data-popup-advisory')) {
      window.location.hash = '#advisory';
      if (typeof window.showRoute === 'function') window.showRoute('advisory');
    } else if (target.getAttribute('data-popup-ask')) {
      var feat = window.PWI_WEATHER && window.PWI_WEATHER.selectedFeature();
      var p = feat && feat.properties;
      if (p) {
        window.PWI_AI && window.PWI_AI.askWithContext(
          'Explain why ' + p.name + ' is estimated at ' + (p.t_max_c != null ? p.t_max_c.toFixed(1) + ' °C' : 'this value') +
          ' and what the terrain contribution means for field work.'
        );
      }
    }
  });

  // ---------- detail panel ----------

  function renderMapDetail(pid) {
    var weather = window.PWI_WEATHER;
    var feats = weather ? weather.uniquePanchayatFeatures() : [];
    var feat = feats.find(function (f) { return f.properties && f.properties.panchayat_id === pid; });
    var card = $('mapDetailCard');
    if (!feat || !card) return;

    var p = feat.properties;
    var setText = function (id, val) {
      var el = $(id);
      if (el) el.textContent = val == null || val === '' ? '—' : val;
    };

    setText('mapDetailName', p.name);
    setText('mapDetailId', p.lgd_code ? 'LGD ' + p.lgd_code : p.panchayat_id);
    setText('mapDetailElev', p.elevation_m + ' m');
    setText('mapDetailArea', p.area_km2 ? p.area_km2.toFixed(1) + ' km²' : '—');
    setText('mapDetailWeight', p.area_weight ? (p.area_weight * 100).toFixed(2) + '%' : '—');
    setText('mapDetailLandcover', p.land_cover || '—');
    setText('mapDetailNdvi', p.ndvi != null ? Number(p.ndvi).toFixed(2) : '—');
    setText('mapDetailSlope', (p.slope_deg != null ? p.slope_deg + '° slope' : '') + (p.aspect_deg != null ? ' / ' + p.aspect_deg + '° aspect' : ''));
    setText('mapDetailTmax', p.t_max_c != null ? p.t_max_c.toFixed(1) + ' °C' : '—');
    setText('mapDetailB1', p.b1_t_max_c != null ? p.b1_t_max_c.toFixed(2) + ' °C' : '—');
    setText('mapDetailB2', p.b2_t_max_c != null ? p.b2_t_max_c.toFixed(2) + ' °C' : '—');
    setText('mapDetailRaw', p.model_raw_t_max_c != null ? p.model_raw_t_max_c.toFixed(2) + ' °C' : '—');
    setText('mapDetailAnomaly', (p.anomaly_c > 0 ? '+' : '') + (p.anomaly_c != null ? Number(p.anomaly_c).toFixed(2) : '—') + ' °C');
    setText('mapDetailRange', (p.range_low_c != null && p.range_high_c != null)
      ? p.range_low_c.toFixed(1) + ' – ' + p.range_high_c.toFixed(1) + ' °C · indicative (uncalibrated)'
      : 'Indicative (uncalibrated)');
    setText('mapDetailConfidence', (p.confidence || 'medium').toUpperCase() + ' CONFIDENCE');
    setText('mapDetailRain', (p.rainfall_mm != null ? p.rainfall_mm + ' mm' : '—'));

    var chipsContainer = $('mapDetailFeatures');
    if (chipsContainer) {
      var contribs = p.top_feature_contributions || [];
      if (contribs.length) {
        chipsContainer.innerHTML = contribs.slice(0, 5).map(function (c) {
          var pct = Math.round((c.contribution || 0) * 100);
          return '<span class="feature-chip"><b>' + c.feature + '</b> ' + pct + '%</span>';
        }).join('');
      } else {
        chipsContainer.innerHTML = '<span class="feature-chip">No contribution breakdown available</span>';
      }
    }

    setText('mapDetailExplain', p.explanation ||
      'The downscaled value is the block baseline plus a terrain-driven model correction, then adjusted so the area-weighted block mean is preserved.');

    var w = weather.whyThisPanchayat(p);
    if (w) {
      setText('whyB1', w.b1 + ' °C');
      setText('whyRf', (w.rf > 0 ? '+' : '') + w.rf.toFixed(2) + ' °C');
      setText('whyAdj', (w.adj > 0 ? '+' : '') + w.adj.toFixed(2) + ' °C');
      setText('whyFinal', w.fin.toFixed(2) + ' °C');
      setText('whyB2', w.b2 + ' °C');
      setText('whyPaneName', p.name);
    }

    var provEl = $('mapDetailProvenance');
    if (provEl) {
      var geo = window.PWI_GEO;
      provEl.innerHTML = '' +
        '<div class="detail-provenance">' +
        '<div><span>Data status</span><b>Staged illustrative data</b></div>' +
        '<div><span>Estimate updated</span><b>' + (p.valid_date || '—') + (p.lead_days ? ' · lead day +' + p.lead_days : '') + '</b></div>' +
        '<div><span>Model</span><b>Random Forest residual correction, version 0.3</b></div>' +
        '<div><span>Boundaries</span><b>' + geo.BOUNDARY_DISCLOSURE + '</b></div>' +
        '<div><span>Consistency</span><b>Area-weighted mean equals the Block forecast exactly</b></div>' +
        '</div>' +
        '<details class="tech-details"><summary>View provenance details</summary>' +
        '<div class="tech-details-body">' +
        '<div><span>panchayat_id</span><code>' + p.panchayat_id + '</code></div>' +
        '<div><span>block_id</span><code>' + (p.block_id || '—') + '</code></div>' +
        '<div><span>boundary_source</span><code>' + geo.BOUNDARY_SOURCE + '</code></div>' +
        '<div><span>value fields</span><code>t_max_c · b1_t_max_c · b2_t_max_c · model_raw_t_max_c</code></div>' +
        '</div></details>';
    }
  }

  window.PWI_MAP = {
    renderMap: renderMap,
    renderMapDetail: renderMapDetail,
    selectPanchayat: selectPanchayat,
    setLayer: function (layer) {
      if (!LAYERS[layer]) return;
      state.currentLayer = layer;
      var methodSel = $('mapMethodSelect');
      if (methodSel) {
        var disablesMethod = layer !== 'temperature';
        methodSel.disabled = disablesMethod;
        methodSel.title = disablesMethod
          ? 'The ' + LAYERS[layer].label + ' layer is always evaluated on the downscaled output.'
          : 'Switch between the downscaled output and the two named baselines.';
      }
      var noteEl = $('mapLayerNote');
      if (noteEl) {
        noteEl.textContent = LAYERS[layer].description + (layer === 'temperature' ? ' ' + METHODS[state.currentMethod].note : '');
      }
      renderMap();
    },
    setMethod: function (method) {
      if (!METHODS[method]) return;
      state.currentMethod = method;
      var noteEl = $('mapLayerNote');
      if (noteEl && state.currentLayer === 'temperature') {
        noteEl.textContent = LAYERS.temperature.description + ' ' + METHODS[method].note;
      }
      renderMap();
    },
    fitToBlock: function () {
      if (state.map) state.map.fitBounds(blockBounds(), { padding: [18, 18] });
    },
    setTheme: function (theme) {
      state.theme = theme === 'dark' ? 'dark' : 'light';
      if (state.map && !state.tileFailed) ensureBasemap(state.theme);
      var container = $('pwiMap');
      if (container) container.classList.toggle('map-dark', state.theme === 'dark');
    },
    zoomIn: function () { if (state.map) state.map.zoomIn(); },
    zoomOut: function () { if (state.map) state.map.zoomOut(); },
    resetZoom: function () { this.fitToBlock(); },
    state: state,
    METHODS: METHODS,
    LAYERS: LAYERS
  };

  // React to theme changes from anywhere in the app.
  if (window.MutationObserver) {
    var observer = new MutationObserver(function () {
      var theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      if (theme !== state.theme) window.PWI_MAP.setTheme(theme);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (!state.map) return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { state.map.invalidateSize(); }, 180);
  });
})();
