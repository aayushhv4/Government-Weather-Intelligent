/**
 * Panchayat Weather Intelligence — Pilot Geography Module
 *
 * Builds the illustrative Panchayat tessellation that the geographic map renders on top of a
 * real basemap. Each Panchayat record from the weather bundle (joined by panchayat_id) receives a
 * polygon that tiles the published pilot block envelope.
 *
 * HONESTY RULE
 *   These polygons are DERIVED, ILLUSTRATIVE geometry. They are NOT official Gram Panchayat
 *   boundaries and are never presented as such. The block envelope and centroid coordinates come
 *   from the staged pilot fixture; the cell shapes are a deterministic tessellation of that
 *   envelope. Every surface that renders them must carry BOUNDARY_DISCLOSURE.
 */

(function () {
  'use strict';

  var BOUNDARY_DISCLOSURE = 'Illustrative boundaries — not official Gram Panchayat boundaries.';
  var BOUNDARY_SOURCE = 'Derived pilot tessellation of the staged Dindori block envelope (LGD-271012)';

  // ---------- small numeric helpers ----------

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Local equirectangular projection, accurate enough for a ~15 km envelope.
  function makeProjector(lon0, lat0) {
    var M_PER_DEG_LAT = 110540;
    var mPerDegLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
    return {
      toXY: function (lon, lat) {
        return [(lon - lon0) * mPerDegLon, (lat - lat0) * M_PER_DEG_LAT];
      },
      toLonLat: function (x, y) {
        return [lon0 + x / mPerDegLon, lat0 + y / M_PER_DEG_LAT];
      }
    };
  }

  function ringAreaXY(ring) {
    var s = 0;
    for (var i = 0, n = ring.length; i < n; i++) {
      var a = ring[i];
      var b = ring[(i + 1) % n];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }

  function ringCentroidXY(ring) {
    var cx = 0, cy = 0, a = 0;
    for (var i = 0, n = ring.length; i < n; i++) {
      var p = ring[i];
      var q = ring[(i + 1) % n];
      var cross = p[0] * q[1] - q[0] * p[1];
      a += cross;
      cx += (p[0] + q[0]) * cross;
      cy += (p[1] + q[1]) * cross;
    }
    if (Math.abs(a) < 1e-9) {
      // Degenerate ring — fall back to vertex mean.
      var sx = 0, sy = 0;
      for (var j = 0; j < ring.length; j++) { sx += ring[j][0]; sy += ring[j][1]; }
      return [sx / ring.length, sy / ring.length];
    }
    a *= 0.5;
    return [cx / (6 * a), cy / (6 * a)];
  }

  /**
   * Sutherland–Hodgman clip of a convex ring against the half-plane  a*x + b*y <= c.
   * Returns a new ring (possibly empty).
   */
  function clipHalfPlane(ring, a, b, c) {
    var out = [];
    var n = ring.length;
    if (!n) return out;
    for (var i = 0; i < n; i++) {
      var P = ring[i];
      var Q = ring[(i + 1) % n];
      var dp = a * P[0] + b * P[1] - c;
      var dq = a * Q[0] + b * Q[1] - c;
      var pIn = dp <= 0;
      var qIn = dq <= 0;
      if (pIn) out.push(P);
      if (pIn !== qIn) {
        var denom = dp - dq;
        if (Math.abs(denom) > 1e-12) {
          var t = dp / denom;
          out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]);
        }
      }
    }
    return out;
  }

  function bboxRing(bbox) {
    // bbox = [lonMin, latMin, lonMax, latMax] — anticlockwise in projected XY space.
    return [
      [bbox[0], bbox[1]],
      [bbox[2], bbox[1]],
      [bbox[2], bbox[3]],
      [bbox[0], bbox[3]]
    ];
  }

  function ringFromLonLatToXY(ring, proj) {
    return ring.map(function (pt) { return proj.toXY(pt[0], pt[1]); });
  }

  function ringFromXYToLonLat(ring, proj) {
    var out = ring.map(function (pt) {
      var ll = proj.toLonLat(pt[0], pt[1]);
      return [Number(ll[0].toFixed(6)), Number(ll[1].toFixed(6))];
    });
    // Close the ring if the clipper dropped the duplicate vertex.
    if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) {
      out.push([out[0][0], out[0][1]]);
    }
    return out;
  }

  /**
   * Build the illustrative Panchayat FeatureCollection.
   *
   * @param {Array}  panchayats  records with panchayat_id / name / centroid{lat,lon} (bundle "pilot.panchayats")
   * @param {Array}  bbox        [lonMin, latMin, lonMax, latMax] pilot block envelope
   * @param {Object} [opts]      { seed, jitter }
   * @returns {Object} GeoJSON FeatureCollection with geometry + derived area weights
   */
  function buildTessellation(panchayats, bbox, opts) {
    var options = opts || {};
    var seed = options.seed || 271012;
    var jitter = options.jitter == null ? 0.22 : options.jitter;
    var list = (panchayats || []).filter(Boolean);
    if (!list.length || !bbox || bbox.length !== 4) {
      return { type: 'FeatureCollection', features: [], meta: { boundarySource: BOUNDARY_SOURCE, disclosure: BOUNDARY_DISCLOSURE } };
    }

    var lon0 = (bbox[0] + bbox[2]) / 2;
    var lat0 = (bbox[1] + bbox[3]) / 2;
    var proj = makeProjector(lon0, lat0);
    var spanX = (bbox[2] - bbox[0]) * 111320 * Math.cos((lat0 * Math.PI) / 180);
    var spanY = (bbox[3] - bbox[1]) * 110540;
    var spacing = Math.sqrt((spanX * spanY) / list.length);

    var rand = mulberry32(seed);
    var sites = list.map(function (p) {
      var lon = p.centroid && p.centroid.lon != null ? p.centroid.lon : (bbox[0] + bbox[2]) / 2;
      var lat = p.centroid && p.centroid.lat != null ? p.centroid.lat : (bbox[1] + bbox[3]) / 2;
      var xy = proj.toXY(lon, lat);
      return {
        record: p,
        // Deterministic jitter keeps the tessellation organic instead of a visible grid,
        // while every site stays inside the published block envelope.
        xy: [
          xy[0] + (rand() - 0.5) * spacing * jitter,
          xy[1] + (rand() - 0.5) * spacing * jitter
        ]
      };
    });

    var envelope = ringFromLonLatToXY(bboxRing(bbox), proj);
    var cells = sites.map(function (site, i) {
      var ring = envelope;
      for (var j = 0; j < sites.length; j++) {
        if (i === j) continue;
        var other = sites[j];
        // Perpendicular bisector, keeping the side closer to this site.
        var a = 2 * (other.xy[0] - site.xy[0]);
        var b = 2 * (other.xy[1] - site.xy[1]);
        var c = (other.xy[0] * other.xy[0] + other.xy[1] * other.xy[1]) - (site.xy[0] * site.xy[0] + site.xy[1] * site.xy[1]);
        ring = clipHalfPlane(ring, a, b, c);
        if (ring.length < 3) break;
      }
      return { site: site, ring: ring };
    });

    var withGeometry = cells.filter(function (c) { return c.ring.length >= 3; });
    var totalAreaM2 = withGeometry.reduce(function (acc, c) { return acc + ringAreaXY(c.ring); }, 0);

    var features = withGeometry.map(function (cell) {
      var p = cell.site.record;
      var areaM2 = ringAreaXY(cell.ring);
      var cXY = ringCentroidXY(cell.ring);
      var cLL = proj.toLonLat(cXY[0], cXY[1]);
      return {
        type: 'Feature',
        properties: {
          panchayat_id: p.panchayat_id,
          lgd_code: p.lgd_code,
          name: p.name,
          block_id: p.block_id,
          elevation_m: p.elevation_m,
          slope_deg: p.slope_deg,
          aspect_deg: p.aspect_deg,
          land_cover: p.land_cover,
          ndvi: p.ndvi,
          // Model area weight (used by the reconciliation maths in the pipeline).
          model_area_weight: p.area_weight,
          model_area_km2: p.area_km2,
          // Geometry-derived values, for display only.
          geom_area_km2: Number((areaM2 / 1e6).toFixed(3)),
          geom_area_weight: totalAreaM2 > 0 ? Number((areaM2 / totalAreaM2).toFixed(6)) : null,
          geom_centroid: { lat: Number(cLL[1].toFixed(6)), lon: Number(cLL[0].toFixed(6)) },
          boundary_source: BOUNDARY_SOURCE,
          boundary_is_official: false,
          boundary_disclosure: BOUNDARY_DISCLOSURE
        },
        geometry: {
          type: 'Polygon',
          coordinates: [ringFromXYToLonLat(cell.ring, proj)]
        }
      };
    });

    return {
      type: 'FeatureCollection',
      features: features,
      meta: {
        block_id: (list[0] && list[0].block_id) || null,
        bbox: bbox.slice(),
        boundary_source: BOUNDARY_SOURCE,
        boundary_is_official: false,
        disclosure: BOUNDARY_DISCLOSURE,
        seed: seed,
        feature_count: features.length
      }
    };
  }

  /**
   * Attach a weather record (values from the downscale features) to each tessellation feature,
   * joined on panchayat_id — the stable Panchayat identifier.
   */
  function joinValues(collection, valueRecords) {
    if (!collection || !collection.features) return collection;
    var index = {};
    (valueRecords || []).forEach(function (f) {
      var pid = f && f.properties && f.properties.panchayat_id;
      if (pid && !index[pid]) index[pid] = f.properties;
    });
    collection.features.forEach(function (feat) {
      var values = index[feat.properties.panchayat_id] || null;
      feat.properties.values = values;
      if (values) {
        feat.properties.t_max_c = values.t_max_c;
        feat.properties.b1_t_max_c = values.b1_t_max_c;
        feat.properties.b2_t_max_c = values.b2_t_max_c;
        feat.properties.model_raw_t_max_c = values.model_raw_t_max_c;
        feat.properties.range_low_c = values.range_low_c;
        feat.properties.range_high_c = values.range_high_c;
        feat.properties.confidence = values.confidence;
        feat.properties.valid_date = values.valid_date;
        feat.properties.lead_days = values.lead_days;
      }
    });
    return collection;
  }

  // ---------- Semantic colour scale (shared by map + legend + homepage preview) ----------

  var TEMPERATURE_STOPS = [
    { t: 0.00, rgb: [2, 132, 199] },   // cool — sky blue
    { t: 0.30, rgb: [13, 127, 118] },  // teal
    { t: 0.55, rgb: [180, 83, 9] },    // amber
    { t: 0.80, rgb: [194, 65, 12] },   // orange
    { t: 1.00, rgb: [185, 28, 28] }    // critical red
  ];

  function interpolateStops(norm) {
    var v = Math.max(0, Math.min(1, norm));
    for (var i = 1; i < TEMPERATURE_STOPS.length; i++) {
      var a = TEMPERATURE_STOPS[i - 1];
      var b = TEMPERATURE_STOPS[i];
      if (v <= b.t) {
        var span = b.t - a.t || 1;
        var k = (v - a.t) / span;
        return [
          Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * k),
          Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * k),
          Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * k)
        ];
      }
    }
    return TEMPERATURE_STOPS[TEMPERATURE_STOPS.length - 1].rgb.slice();
  }

  function normalise(value, min, max) {
    if (value == null || !isFinite(value)) return null;
    if (max === min) return 0.5;
    return (value - min) / (max - min);
  }

  function rgbToHex(rgb) {
    return '#' + rgb.map(function (c) { return ('0' + c.toString(16)).slice(-2); }).join('');
  }

  /** Diverging scale for the "downscaling difference" layer (blue = cooler than block, red = warmer). */
  function differenceColor(delta, extent) {
    var e = extent || 2;
    var v = Math.max(-1, Math.min(1, (delta || 0) / e));
    var mid = 215;
    var r, g, b;
    if (v >= 0) {
      r = Math.round(mid + (185 - mid) * v);
      g = Math.round(mid + (28 - mid) * v);
      b = Math.round(mid + (28 - mid) * v);
    } else {
      var k = -v;
      r = Math.round(mid + (2 - mid) * k);
      g = Math.round(mid + (132 - mid) * k);
      b = Math.round(mid + (199 - mid) * k);
    }
    return '#' + [r, g, b].map(function (c) { return ('0' + Math.max(0, Math.min(255, c)).toString(16)).slice(-2); }).join('');
  }

  function bandForRisk(norm) {
    if (norm == null) return 'unknown';
    if (norm >= 0.8) return 'critical';
    if (norm >= 0.55) return 'high';
    if (norm >= 0.3) return 'moderate';
    return 'normal';
  }

  window.PWI_GEO = {
    BOUNDARY_DISCLOSURE: BOUNDARY_DISCLOSURE,
    BOUNDARY_SOURCE: BOUNDARY_SOURCE,
    buildTessellation: buildTessellation,
    joinValues: joinValues,
    normalise: normalise,
    interpolateStops: interpolateStops,
    rgbToHex: rgbToHex,
    differenceColor: differenceColor,
    bandForRisk: bandForRisk,
    temperatureColor: function (value, min, max) {
      var n = normalise(value, min, max);
      return n == null ? '#94a3b8' : rgbToHex(interpolateStops(n));
    }
  };
})();
