/**
 * Panchayat Weather Intelligence — Advisory & Weather → Action module
 *
 * Evaluates the deterministic, configurable heat-risk rules per crop and translates a localized
 * forecast into concrete agronomic recommendations, field-operation windows and dispatch actions.
 * These rules are the authoritative source for risk level; the assistant may explain them but
 * never overrides them.
 */

(function () {
  'use strict';

  // Authoritative default crop thresholds and operational guidance
  const DEFAULT_CROPS = {
    tomato: {
      label: 'Tomato',
      heat: {
        high: {
          threshold_t_max_c: 36.0,
          trigger: 'Forecast maximum temperature ≥ 36.0 °C',
          action: 'Advance harvest of breaker-stage fruit to pre-dawn window (05:00–08:30). Irrigate at dawn and late afternoon, apply 50% shade-net or straw mulch to protect root zones from thermal shock.',
          field_operation: 'Suspend midday spraying and weeding. Restrict heavy field operations to before 09:00.',
          operational_decision: 'Deploy shade covers immediately and schedule pre-dawn drip irrigation cycles.'
        },
        medium: {
          threshold_t_max_c: 33.0,
          trigger: 'Forecast maximum temperature ≥ 33.0 °C',
          action: 'Provide light morning irrigation to maintain soil moisture buffer. Inspect fruiting clusters for blossom-end rot and sunscald.',
          field_operation: 'Conduct pest scouting before 10:00.',
          operational_decision: 'Increase irrigation frequency by 20% to prevent flower drop.'
        }
      }
    },
    onion: {
      label: 'Onion',
      heat: {
        high: {
          threshold_t_max_c: 37.0,
          trigger: 'Forecast maximum temperature ≥ 37.0 °C',
          action: 'Withhold irrigation 10–14 days prior to harvest to harden bulb necks. Cure lifted bulbs under covered, ventilated sheds rather than in open sunlight.',
          field_operation: 'Avoid midday topping and field handling.',
          operational_decision: 'Secure shaded, well-ventilated storage space to prevent bacterial neck rot.'
        },
        medium: {
          threshold_t_max_c: 34.0,
          trigger: 'Forecast maximum temperature ≥ 34.0 °C',
          action: 'Maintain micro-sprinkler or light furrow irrigation in late afternoon to reduce soil temperature peaks.',
          field_operation: 'Shift soil loosening to early morning hours.',
          operational_decision: 'Inspect bulbs for sunscald and adjust shade canopy.'
        }
      }
    },
    grape: {
      label: 'Grape',
      heat: {
        high: {
          threshold_t_max_c: 38.0,
          trigger: 'Forecast maximum temperature ≥ 38.0 °C',
          action: 'Run overhead micro-sprinklers in pre-dawn hours to lower canopy temperatures. Keep leaf cover intact over grape clusters. Defer gibberellic acid application by 48 hours.',
          field_operation: 'Halt all canopy trimming between 11:00 and 16:00.',
          operational_decision: 'Coordinate early morning harvest dispatch to preserve bunch firmness.'
        },
        medium: {
          threshold_t_max_c: 35.0,
          trigger: 'Forecast maximum temperature ≥ 35.0 °C',
          action: 'Increase drip irrigation volume and monitor western-facing canopy rows for berry sunburn.',
          field_operation: 'Apply preventative potassium silicate spray in early hours.',
          operational_decision: 'Schedule harvest slots during the coolest 04:00–07:30 window.'
        }
      }
    },
    wheat: {
      label: 'Wheat',
      heat: {
        high: {
          threshold_t_max_c: 35.0,
          trigger: 'Terminal heat stress window (t_max ≥ 35.0 °C)',
          action: 'Provide light irrigation during grain filling stage to mitigate forced maturity. Prepare combine harvest machinery for early harvesting if grain moisture is below 14%.',
          field_operation: 'Conclude threshing operations during dry daylight.',
          operational_decision: 'Prioritize harvesting plots at grain maturity before heat shrivels grain weight.'
        },
        medium: {
          threshold_t_max_c: 32.0,
          trigger: 'Forecast maximum temperature ≥ 32.0 °C',
          action: 'Monitor flag leaf senescence and maintain optimal root zone moisture through light irrigation.',
          field_operation: 'Avoid afternoon chemical spraying.',
          operational_decision: 'Reserve threshing slots and grain storage tarpaulins.'
        }
      }
    },
    soybean: {
      label: 'Soybean',
      heat: {
        high: {
          threshold_t_max_c: 36.0,
          trigger: 'Forecast maximum temperature ≥ 36.0 °C',
          action: 'Irrigate pod-filling sections during dawn hours. Avoid inter-cultivation to prevent root damage under high soil temperature.',
          field_operation: 'Suspend all mid-day tractor operations.',
          operational_decision: 'Apply organic mulch or crop residue to preserve soil moisture.'
        },
        medium: {
          threshold_t_max_c: 33.0,
          trigger: 'Forecast maximum temperature ≥ 33.0 °C',
          action: 'Scout for pod-borer insect activity which accelerates with higher daytime temperatures.',
          field_operation: 'Conduct bio-pesticide applications after 17:00.',
          operational_decision: 'Check soil moisture at 15cm depth.'
        }
      }
    },
    banana: {
      label: 'Banana',
      heat: {
        high: {
          threshold_t_max_c: 37.0,
          trigger: 'Forecast maximum temperature ≥ 37.0 °C',
          action: 'Irrigate heavily before 08:00. Cover developing bunches with perforated polyethylene sleeves or dry leaves to prevent sunburn. Postpone cutting green bunches by 24 hours.',
          field_operation: 'Prohibit bunch handling between 11:00 and 16:00.',
          operational_decision: 'Ensure protected transit packaging to avoid premature ripening.'
        },
        medium: {
          threshold_t_max_c: 34.0,
          trigger: 'Forecast maximum temperature ≥ 34.0 °C',
          action: 'Ensure clean drainage and regular drip cycles. Monitor leaves for marginal scorching.',
          field_operation: 'Perform de-suckering only in late afternoon.',
          operational_decision: 'Check irrigation emitter discharge rates across blocks.'
        }
      }
    }
  };

  let selectedCrop = 'tomato';

  /**
   * Resolve the effective crop rule set.
   *
   * The service's advisory-rule payload carries the served crop list (key + display label) and
   * rainfall rules, while the heat-stress thresholds are configured here. The two are merged by
   * crop key so that a served crop list never silently degrades every crop to one threshold set.
   */
  function cropRuleMap() {
    const bundled = window.PWI_WEATHER?.state?.advisoryRules;
    const bundledCrops = bundled && Array.isArray(bundled.crops) ? bundled.crops : null;
    if (!bundledCrops || !bundledCrops.length) return DEFAULT_CROPS;

    const out = {};
    Object.keys(DEFAULT_CROPS).forEach((k) => { out[k] = DEFAULT_CROPS[k]; });
    bundledCrops.forEach((c) => {
      const key = c.key || (c.label ? String(c.label).toLowerCase() : null);
      if (!key) return;
      const local = DEFAULT_CROPS[key] || {};
      const servedHeat = c.heat && c.heat.high ? c.heat : null;
      out[key] = Object.assign({}, local, c, {
        label: c.label || local.label || key,
        heat: servedHeat || local.heat
      });
    });
    return out;
  }

  function evaluateRisk(cropKey, tmax) {
    const crops = cropRuleMap();
    const crop = crops[cropKey] || DEFAULT_CROPS.tomato;
    if (!tmax || isNaN(tmax)) return { level: 'none', trigger: '—', action: 'No forecast data', field_operation: '—', operational_decision: '—' };

    if (crop.heat?.high && tmax >= crop.heat.high.threshold_t_max_c) {
      return {
        level: 'high',
        threshold: crop.heat.high.threshold_t_max_c,
        trigger: crop.heat.high.trigger,
        action: crop.heat.high.action,
        field_operation: crop.heat.high.field_operation,
        operational_decision: crop.heat.high.operational_decision || 'Adjust irrigation cycle and advance harvesting.',
        crop_label: crop.label
      };
    }
    if (crop.heat?.medium && tmax >= crop.heat.medium.threshold_t_max_c) {
      return {
        level: 'medium',
        threshold: crop.heat.medium.threshold_t_max_c,
        trigger: crop.heat.medium.trigger,
        action: crop.heat.medium.action,
        field_operation: crop.heat.medium.field_operation,
        operational_decision: crop.heat.medium.operational_decision || 'Maintain soil moisture buffer.',
        crop_label: crop.label
      };
    }
    return {
      level: 'none',
      threshold: crop.heat?.medium?.threshold_t_max_c,
      trigger: `Temperature (${tmax.toFixed(1)} °C) below alert thresholds`,
      action: 'Normal cultivation practices recommended. Maintain standard scheduled irrigation.',
      field_operation: 'All standard field operations can proceed as scheduled.',
      operational_decision: 'Routine farm management; no emergency weather intervention required.',
      crop_label: crop.label
    };
  }

  function renderAdvisoryChain(feat, adv, cropKey) {
    if (!feat) return '<div class="empty">Please select a Panchayat and run downscaling to view the advisory chain.</div>';
    const p = feat.properties;
    const tmax = p.t_max_c;
    const rangeText = (p.range_low_c != null && p.range_high_c != null)
      ? `Indicative P10–P90: ${p.range_low_c}–${p.range_high_c} °C`
      : 'Uncalibrated empirical spread';

    const riskLabel = adv.level === 'high' ? 'High Heat Stress Risk' : (adv.level === 'medium' ? 'Moderate Heat Stress Risk' : 'Normal / Low Risk');

    const steps = [
      {
        num: 'Step 1',
        title: 'Forecast',
        content: `<b>${tmax.toFixed(1)} °C</b> estimated at ${p.name}`,
        sub: rangeText
      },
      {
        num: 'Step 2',
        title: 'Local Risk',
        content: `<span class="pill ${adv.level === 'high' ? 'pill-high' : (adv.level === 'medium' ? 'pill-medium' : 'pill-none')}">${riskLabel}</span>`,
        sub: adv.trigger
      },
      {
        num: 'Step 3',
        title: 'Crop Impact',
        content: adv.level === 'none' ? 'No adverse heat stress expected for current growth phase.' : (adv.level === 'high' ? 'Severe risk of floral abortion, fruit sunscald and accelerated transpiration.' : 'Moderate evapotranspiration demand; root zone moisture depletion risk.'),
        sub: `Target crop: ${adv.crop_label || cropKey}`
      },
      {
        num: 'Step 4',
        title: 'Recommended Action',
        content: adv.action,
        sub: `Timing: ${adv.field_operation}`
      },
      {
        num: 'Step 5',
        title: 'Operational Decision',
        content: adv.operational_decision,
        sub: 'Field management dispatch'
      }
    ];

    return `
      <div class="chain">
        ${steps.map(s => `
          <div class="chain-step">
            <div class="cs-num">${s.num}</div>
            <div class="cs-label">${s.title}</div>
            <div class="cs-value">${s.content}</div>
            ${s.sub ? `<div class="t-xs" style="color:var(--ink-3);margin-top:6px">${s.sub}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  function refreshAdvisoryScreen() {
    const weather = window.PWI_WEATHER;
    const feat = weather?.selectedFeature();
    const cropKey = selectedCrop;
    const cropSelect = document.getElementById('advisoryCropSelect');
    const panchayatSelect = document.getElementById('advisoryPanchayatSelect');

    if (cropSelect && cropSelect.value !== cropKey) {
      cropSelect.value = cropKey;
    }

    // Populate panchayat dropdown if needed
    if (panchayatSelect && weather?.state?.panchayats?.length && panchayatSelect.options.length <= 1) {
      panchayatSelect.innerHTML = '<option value="">— Select Panchayat —</option>' +
        weather.state.panchayats.map(p => `<option value="${p.panchayat_id}">${p.name} (${p.panchayat_id})</option>`).join('');
    }
    if (panchayatSelect && weather?.state?.selectedPanchayatId) {
      panchayatSelect.value = weather.state.selectedPanchayatId;
    }

    if (!feat) return;

    const p = feat.properties;
    const adv = evaluateRisk(cropKey, p.t_max_c);

    // Update Advisory View Card
    const targetEl = document.getElementById('advisoryResultContent');
    if (targetEl) {
      targetEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px">
          <div>
            <h3 style="margin:0 0 4px;font-size:18px;color:var(--ink)">${p.name} · ${adv.crop_label} Advisory</h3>
            <div style="font-size:12.5px;color:var(--ink-3)">Valid date: <b>${p.valid_date || '—'}</b> · Downscaled temp: <b>${p.t_max_c.toFixed(1)} °C</b> (Block baseline: ${p.b1_t_max_c != null ? p.b1_t_max_c.toFixed(1) + ' °C' : '—'})</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span class="pill ${adv.level === 'high' ? 'pill-high' : (adv.level === 'medium' ? 'pill-medium' : 'pill-none')}">
              ${adv.level === 'high' ? 'High Heat Risk' : (adv.level === 'medium' ? 'Moderate Risk' : 'Low / Normal Risk')}
            </span>
            <button type="button" class="ctrl-btn" id="advisoryAskAssistant" style="font-size:12px;display:inline-flex;align-items:center;gap:6px;cursor:pointer">
              <span aria-hidden="true">\u2726</span> Ask Assistant to Explain Advisory
            </button>
          </div>
        </div>

        <div style="background:var(--bg-soft);border:1px solid var(--line);border-radius:8px;padding:14px;margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:var(--ink-3);text-transform:uppercase;margin-bottom:4px">Trigger Condition</div>
          <div style="font-size:13.5px;font-weight:650;color:var(--ink)">${adv.trigger}</div>
        </div>

        <div class="grid-2" style="margin-bottom:16px">
          <div style="background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:14px">
            <div style="font-size:12px;font-weight:700;color:var(--primary);text-transform:uppercase;margin-bottom:6px">Field Advisory &amp; Action</div>
            <div style="font-size:13px;color:var(--ink);line-height:1.5">${adv.action}</div>
          </div>
          <div style="background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:14px">
            <div style="font-size:12px;font-weight:700;color:var(--secondary);text-transform:uppercase;margin-bottom:6px">Operational Window &amp; Dispatch</div>
            <div style="font-size:13px;color:var(--ink);line-height:1.5">${adv.field_operation}</div>
            <div style="font-size:12px;color:var(--ink-3);margin-top:8px"><b>Dispatch directive:</b> ${adv.operational_decision}</div>
          </div>
        </div>

        <h4 style="margin:20px 0 10px;font-size:15px;color:var(--ink)">Signature Feature: Weather → Action Chain</h4>
        ${renderAdvisoryChain(feat, adv, cropKey)}
      `;

      const askBtn = document.getElementById('advisoryAskAssistant');
      if (askBtn) {
        askBtn.addEventListener('click', () => {
          if (window.PWI_AI?.askWithContext) {
            window.PWI_AI.askWithContext(`Explain the heat stress risk and recommended actions for ${adv.crop_label || cropKey} in ${p.name}.`);
          }
        });
      }
    }

    // Populate Thresholds Table
    const tableBody = document.getElementById('advisoryThresholdBody');
    if (tableBody) {
      const crops = cropRuleMap();
      tableBody.innerHTML = Object.entries(crops).map(([k, c]) => `
        <tr class="${k === cropKey ? 'best' : ''}">
          <td><b>${c.label || k}</b> ${k === cropKey ? '<span class="pill pill-info" style="font-size:10px;margin-left:6px">Active</span>' : ''}</td>
          <td>${c.heat?.medium ? c.heat.medium.threshold_t_max_c + ' °C' : '—'}</td>
          <td>${c.heat?.high ? c.heat.high.threshold_t_max_c + ' °C' : '—'}</td>
          <td style="font-size:12px">${c.heat?.high?.field_operation ? c.heat.high.field_operation.slice(0, 50) + '…' : '—'}</td>
        </tr>
      `).join('');
    }
  }

  const PWI_ADVISORY = {
    DEFAULT_CROPS,
    cropRuleMap,
    getCrop() { return selectedCrop; },
    setCrop(cropKey) {
      if (cropRuleMap()[cropKey] || DEFAULT_CROPS[cropKey]) {
        selectedCrop = cropKey;
        refreshAdvisoryScreen();
      }
    },
    evaluateRisk,
    renderAdvisoryChain,
    refreshAdvisoryScreen
  };

  window.PWI_ADVISORY = PWI_ADVISORY;
})();
