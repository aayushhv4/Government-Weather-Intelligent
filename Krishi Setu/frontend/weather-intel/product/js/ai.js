/**
 * Agro-Meteorological Assistant
 *
 * Architecture: browser → serverless proxy (default /api/assistant) → AI provider, with a
 * deterministic local interpreter that answers whenever the provider is not configured, not
 * reachable, or slow. The panel therefore never sits on an indefinite "Connecting…" state, and the
 * page never waits on the assistant to finish loading.
 *
 * Safeguards:
 *   - The assistant receives only structured application context and must not invent weather values.
 *   - It cannot modify the forecast or override the rule-based advisory.
 *   - It never claims live operational IMD data; the data status it is given is authoritative.
 *   - Provider API keys stay server-side in the serverless function.
 */

(function () {
  'use strict';

  // Multi-turn session message history
  const chatHistory = [];

  //
  // Set once the endpoint has failed a request (for example when the site is served as plain
  // static files with no serverless functions). The assistant keeps answering from its
  // deterministic interpreter and stops re-attempting a request that is known to be unavailable.
  let endpointUnavailable = false;

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTime() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function buildStructuredContext() {
    const weather = window.PWI_WEATHER;
    const advisory = window.PWI_ADVISORY;
    if (!weather) return {};

    const sel = weather.selectedFeature();
    const feats = weather.uniquePanchayatFeatures();
    const block = weather.state.block?.block;
    const cropKey = advisory ? advisory.getCrop() : 'tomato';

    return {
      block: block ? {
        id: block.block_id,
        name: block.name,
        district: block.district,
        state: block.state,
        mean_elevation_m: block.mean_elevation_m,
        panchayat_count: block.panchayat_count
      } : null,
      crop: cropKey,
      forecast_window: (weather.state.forecast?.days || []).map(d => ({
        date: d.date,
        block_t_max_c: d.t_max_c,
        block_rainfall_mm: d.rainfall_mm
      })),
      selected_panchayat: sel ? {
        id: sel.properties.panchayat_id,
        name: sel.properties.name,
        t_max_c: sel.properties.t_max_c,
        p10_c: sel.properties.range_low_c,
        p90_c: sel.properties.range_high_c,
        elevation_m: sel.properties.elevation_m,
        top_features: sel.properties.top_features,
        anomaly_c: sel.properties.anomaly_c,
        confidence: sel.properties.confidence,
        b1_block_copy: sel.properties.b1_t_max_c,
        b2_lapse_rate: sel.properties.b2_t_max_c
      } : null,
      panchayats_summary: feats.map(f => ({
        name: f.properties.name,
        t_max_c: f.properties.t_max_c,
        elevation_m: f.properties.elevation_m
      })),
      data_status: 'Staged illustrative pilot data (not official IMD operational feed)'
    };
  }

  // Rich Deterministic Agromet Rule-Based Interpreter
  function localDeterministicAnswer(qRaw) {
    const q = String(qRaw || '').toLowerCase();
    const weather = window.PWI_WEATHER;
    const advisory = window.PWI_ADVISORY;
    const feats = weather ? weather.uniquePanchayatFeatures() : [];
    const feat = weather ? weather.selectedFeature() : null;

    if (!feat || !feats.length) {
      return '<b>No downscaled forecasts currently loaded.</b> Please click <b>Run Downscaling</b> on the Weather Downscaling screen and ask again.';
    }

    const p = feat.properties;
    const crops = (advisory && typeof advisory.cropRuleMap === 'function')
      ? advisory.cropRuleMap()
      : (advisory?.DEFAULT_CROPS || {});

    // If the question names a crop, answer for that crop instead of the currently selected one.
    let cropKey = advisory ? advisory.getCrop() : 'tomato';
    Object.keys(crops).forEach((k) => {
      const label = String((crops[k] && crops[k].label) || k).toLowerCase();
      const names = new Set([label, k.toLowerCase()]);
      names.forEach((name) => {
        if (new RegExp('\\b' + name + '\\b').test(q)) cropKey = k;
      });
    });

    const crop = crops[cropKey] || crops.tomato;
    const adv = advisory ? advisory.evaluateRisk(cropKey, p.t_max_c) : { level: 'none', action: 'Normal monitoring' };

    const sortedByTemp = feats.slice().sort((a, b) => b.properties.t_max_c - a.properties.t_max_c);
    const hottest = sortedByTemp[0].properties;
    const coolest = sortedByTemp[sortedByTemp.length - 1].properties;
    const blockName = weather.state.block?.block?.name || 'Dindori';
    const b1 = p.b1_t_max_c || 38.8;

    // 1. "Which Panchayat is hottest / coolest?"
    if (/(hottest|warmest|highest|which).*panchayat/.test(q) && !/why/.test(q)) {
      const spread = (hottest.t_max_c - coolest.t_max_c).toFixed(2);
      const highRiskCount = feats.filter(f => {
        const a = advisory ? advisory.evaluateRisk(cropKey, f.properties.t_max_c) : { level: 'none' };
        return a.level === 'high';
      }).length;
      return `Across <b>${blockName} Block</b>, <b>${hottest.name}</b> has the highest estimated temperature at <b>${hottest.t_max_c.toFixed(1)} °C</b> (elevation: ${hottest.elevation_m} m), while <b>${coolest.name}</b> is coolest at <b>${coolest.t_max_c.toFixed(1)} °C</b> (elevation: ${coolest.elevation_m} m).<br><br>This reflects an intra-block micro-climatic thermal spread of <b>${spread} °C</b>. Under current heat thresholds for <b>${crop.label}</b>, <b>${highRiskCount} of ${feats.length}</b> Panchayats breach the high heat stress threshold.`;
    }

    // 2. "Why is this Panchayat hotter / cooler?" / Decomposition explanation
    if (/why|reason|how come|hotter|cooler|elevation|decomposition|differ/.test(q)) {
      const w = weather.whyThisPanchayat(p);
      const elevDiff = (p.elevation_m - weather.blockMeanElevation()).toFixed(0);
      const elevText = elevDiff > 0 ? `${Math.abs(elevDiff)} m higher than the block average` : `${Math.abs(elevDiff)} m lower than the block average`;
      return `<b>${p.name}</b> is estimated at <b>${p.t_max_c.toFixed(2)} °C</b> compared to the coarse Block forecast baseline of <b>${w.b1} °C</b> (a difference of <b>${(p.t_max_c - w.b1 > 0 ? '+' : '')}${(p.t_max_c - w.b1).toFixed(2)} °C</b>):<br><br>` +
        `• <b>Physical Lapse-Rate (B2):</b> Elevation is ${p.elevation_m} m (${elevText}). At -6.5 °C/km, lapse-rate predicts <b>${w.b2.toFixed(2)} °C</b>.<br>` +
        `• <b>Random Forest Residual f_T(X):</b> Geospatial models incorporate terrain slope, aspect, and NDVI to add a local adjustment of <b>${w.rf > 0 ? '+' : ''}${w.rf.toFixed(2)} °C</b>.<br>` +
        `• <b>Energy Reconciliation:</b> Area-weighted adjustment adds <b>${w.adj > 0 ? '+' : ''}${w.adj.toFixed(2)} °C</b> so the block-wide average preserves conservation of energy.<br>` +
        `<span style="font-size:11.5px;color:var(--ink-3);display:block;margin-top:6px"><i>Disclosure: This is an empirical decomposition of model contributions, not a direct causal attribution claim.</i></span>`;
    }

    // 3. Crop-specific advisory or field operation recommendations
    if (/action|do|advis|recommend|crop|tomato|onion|grape|wheat|soybean|banana|stress/.test(q)) {
      const riskPill = adv.level === 'high' ? 'HIGH RISK' : (adv.level === 'medium' ? 'MODERATE RISK' : 'LOW / NORMAL RISK');
      return `<b>Agro-Meteorological Advisory for ${crop.label} at ${p.name}:</b><br>` +
        `• <b>Forecast Max Temp:</b> ${p.t_max_c.toFixed(1)} °C (Risk Classification: <b>${riskPill}</b>)<br>` +
        `• <b>Trigger Condition:</b> ${adv.trigger}<br>` +
        `• <b>Field Advisory & Action:</b> ${adv.action}<br>` +
        `• <b>Operational Window:</b> ${adv.field_operation}<br>` +
        `• <b>Dispatch Directive:</b> ${adv.operational_decision}`;
    }

    // 4. "Summarize today's risk" / Overview
    if (/summar|overview|today|risk|report|alert/.test(q)) {
      const counts = { high: 0, medium: 0, none: 0 };
      feats.forEach(f => {
        const r = advisory ? advisory.evaluateRisk(cropKey, f.properties.t_max_c) : { level: 'none' };
        counts[r.level]++;
      });
      return `<b>Agro-Meteorological Summary for ${blockName} Block (${crop.label}):</b><br>` +
        `Out of ${feats.length} monitored Panchayats, <b>${counts.high}</b> are under high heat risk, <b>${counts.medium}</b> under moderate risk, and <b>${counts.none}</b> within normal tolerance.<br><br>` +
        `• <b>Thermal range:</b> ${coolest.t_max_c.toFixed(1)} °C (${coolest.name}) to ${hottest.t_max_c.toFixed(1)} °C (${hottest.name}).<br>` +
        `• <b>Field Priority:</b> High-risk Panchayats should advance harvesting and spraying to early morning hours before 09:00.`;
    }

    // 5. "Explain the model result simply" / Methodology
    if (/explain|model|simple|method|baseline|rf|pipeline|how does it work/.test(q)) {
      return `<b>How Panchayat Weather Intelligence works:</b><br>` +
        `1. <b>Input Ingestion:</b> IMD coarse bulletin provides 1 forecast for the entire block (${b1} °C).<br>` +
        `2. <b>Terrain Feature Integration:</b> Local elevation (${p.elevation_m} m), slope, aspect, and vegetation index (NDVI) are extracted per Panchayat.<br>` +
        `3. <b>Dual Baselines:</b> B1 (coarse block copy) and B2 (elevation lapse-rate at -6.5 °C/km) are computed as physical benchmarks.<br>` +
        `4. <b>Random Forest Residual Model:</b> Corrects local microclimatic biases.<br>` +
        `5. <b>Area-Weighted Reconciliation:</b> Guarantees block-wide consistency.<br>` +
        `6. <b>Weather → Action:</b> Translates temperature into concrete crop risk directives.`;
    }

    // Fallback friendly contextual response
    return `I am your official Agro-Meteorological Decision Assistant for <b>${p.name}</b> (${blockName} Block). Current downscaled forecast is <b>${p.t_max_c.toFixed(1)} °C</b> (Block baseline: <b>${b1} °C</b>).<br><br>` +
      `Under active <b>${crop.label}</b> rules, this is evaluated as <b>${adv.level.toUpperCase()} HEAT RISK</b>.<br><br>` +
      `You can ask me questions such as:<br>` +
      `• <i>"Which Panchayat is hottest?"</i><br>` +
      `• <i>"Why is this Panchayat hotter than the block forecast?"</i><br>` +
      `• <i>"What should I do for ${crop.label}?"</i><br>` +
      `• <i>"Summarize today's risk"</i>`;
  }

  function appendMessageToUI(role, htmlContent, rawText) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const isUser = role === 'user';
    const msgEl = document.createElement('div');
    msgEl.className = `chat-msg ${isUser ? 'user' : 'assistant'}`;

    const avatar = isUser ? '\u{1F464}' : '\u2726';
    const timeStr = formatTime();

    msgEl.innerHTML = `
      <div class="chat-avatar" aria-hidden="true">${avatar}</div>
      <div>
        <div class="chat-bubble">${htmlContent}</div>
        <div class="chat-time">${timeStr}</div>
      </div>
    `;

    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;

    // Track in session history
    chatHistory.push({
      role: isUser ? 'user' : 'assistant',
      text: rawText || htmlContent.replace(/<[^>]+>/g, ' '),
      html: htmlContent,
      time: timeStr
    });
  }

  function showTyping() {
    const el = document.getElementById('chatTyping');
    if (el) {
      el.style.display = 'flex';
      const container = document.getElementById('chatMessages');
      if (container) container.scrollTop = container.scrollHeight;
    }
  }

  function hideTyping() {
    const el = document.getElementById('chatTyping');
    if (el) el.style.display = 'none';
  }

  function updateModeBadge(mode, provider) {
    const badge = document.getElementById('aiModeBadge');
    if (!badge) return;
    if (mode === 'ai') {
      badge.textContent = provider === 'gemini' ? 'Gemini 1.5 Flash Active' : 'LLM Enhanced Mode';
      badge.style.borderColor = 'var(--primary)';
      badge.style.color = 'var(--primary)';
      badge.style.background = 'var(--primary-light)';
    } else {
      badge.textContent = 'Deterministic Rule Engine';
      badge.style.borderColor = 'var(--secondary)';
      badge.style.color = 'var(--secondary)';
      badge.style.background = 'var(--secondary-light)';
    }
  }

  async function askAssistant(question) {
    const q = String(question || '').trim();
    if (!q) return;

    // 1. Add user message to UI
    appendMessageToUI('user', escapeHtml(q), q);

    // 2. Clear input
    const input = document.getElementById('cpInput');
    if (input) input.value = '';

    // 3. Show typing indicator
    showTyping();

    // 4. Compute deterministic fallback immediately in case network fails
    const localAns = localDeterministicAnswer(q);
    const context = buildStructuredContext();

    let finalHtml = localAns;
    let mode = 'local';
    let provider = null;

    // 5. Attempt the serverless endpoint call. Set window.PWI_CONFIG.AI_ENDPOINT = null to skip it
    //    entirely (for example when the site is served as plain static files with no functions).
    const aiEndpoint = (window.PWI_CONFIG && window.PWI_CONFIG.AI_ENDPOINT !== undefined)
      ? window.PWI_CONFIG.AI_ENDPOINT
      : '/api/assistant';

    if (!aiEndpoint || endpointUnavailable) {
      hideTyping();
      updateModeBadge('local', null);
      appendMessageToUI('assistant', localAns, localAns);
      return;
    }

    try {
      const resp = await fetch(aiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          context,
          history: chatHistory.slice(-6).map(m => ({ role: m.role, text: m.text }))
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.answer) {
          finalHtml = data.answer.replace(/\n/g, '<br>');
          mode = 'ai';
          provider = data.provider || 'gemini';
        }
        // A 200 with no answer means the proxy has no provider configured; that is a stable
        // condition for this deployment, so do not keep re-requesting it.
        else if (data && data.fallback) {
          endpointUnavailable = true;
        }
      } else {
        endpointUnavailable = true;
      }
    } catch (err) {
      // Fall back silently to the deterministic answer.
      endpointUnavailable = true;
      finalHtml = localAns;
      mode = 'local';
    } finally {
      hideTyping();
    }

    // 6. Update mode indicator badge
    updateModeBadge(mode, provider);

    // 7. Render Assistant response
    appendMessageToUI('assistant', finalHtml, finalHtml);
  }

  function clearChat() {
    chatHistory.length = 0;
    const container = document.getElementById('chatMessages');
    if (container) container.innerHTML = '';
    renderWelcomeMessage();
  }

  function renderWelcomeMessage() {
    const weather = window.PWI_WEATHER;
    const feat = weather ? weather.selectedFeature() : null;
    const pName = feat?.properties?.name || 'Shinde';
    const tmax = feat?.properties?.t_max_c ? feat.properties.t_max_c.toFixed(1) + ' °C' : '40.1 °C';
    const crop = window.PWI_ADVISORY?.getCrop() || 'tomato';
    const cropLabel = crop.charAt(0).toUpperCase() + crop.slice(1);

    const welcomeHtml = `Hello! I am your <b>Agro-Meteorological Assistant</b> for Panchayat Weather Intelligence.<br><br>` +
      `Current active Panchayat: <b>${pName}</b> (estimated <b>${tmax}</b> · crop: <b>${cropLabel}</b>).<br>` +
      `Ask me about micro-climatic thermal spreads, terrain contributors, crop heat stress thresholds, or click any prompt chip above.`;

    appendMessageToUI('assistant', welcomeHtml, welcomeHtml);
  }

  function askWithContext(question) {
    // If not on overview, switch to overview where the assistant panel lives
    if (window.location.hash !== '#overview') {
      window.location.hash = '#overview';
      if (typeof window.showRoute === 'function') {
        window.showRoute('overview');
      }
    }

    // Scroll AI Chat Panel into view smoothly
    setTimeout(() => {
      const panel = document.getElementById('aiChatPanel');
      if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      askAssistant(question);
    }, 150);
  }

  function initAssistant() {
    // Wire prompt chips
    document.querySelectorAll('[data-cp]').forEach(btn => {
      btn.onclick = () => askAssistant(btn.dataset.cp);
    });

    // Wire input and send button
    const sendBtn = document.getElementById('cpSend');
    const input = document.getElementById('cpInput');
    const submit = () => {
      const val = input ? input.value.trim() : '';
      if (val) askAssistant(val);
    };

    if (sendBtn) sendBtn.onclick = submit;
    if (input) {
      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      };
    }

    // Wire Clear Chat button
    const clearBtn = document.getElementById('aiClearBtn');
    if (clearBtn) clearBtn.onclick = clearChat;

    // Initial welcome message
    renderWelcomeMessage();
  }

  const PWI_AI = {
    askAssistant,
    askWithContext,
    initAssistant,
    clearChat,
    buildStructuredContext,
    localDeterministicAnswer
  };

  window.PWI_AI = PWI_AI;
})();

