/* ============================================================
   KRISHI SETU — WHATSAPP BETA DEMO (isolated prototype)
   A guided, conversational interface for the most important
   Krishi Setu actions. This is a PROTOTYPE: every action is
   simulated and clearly labelled demo-only. Nothing here writes
   to Supabase or the live platform, and no real WhatsApp
   Business API is involved.
   ============================================================ */
(function () {
  'use strict';

  var chat = document.getElementById('chat');
  var themeBtn = document.getElementById('themeBtn');
  var homeBtn = document.getElementById('homeBtn');
  if (!chat) return;

  /* ---------------- theme (shared with the main app) ---------------- */
  function resolveTheme() {
    var saved = null;
    try { saved = localStorage.getItem('ks_theme'); } catch (e) {}
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light';
  }
  function applyTheme(t) {
    document.documentElement.classList.toggle('dark', t === 'dark');
    if (themeBtn) themeBtn.textContent = t === 'dark' ? '☀️' : '🌙';
  }
  applyTheme(resolveTheme());
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('ks_theme', next); } catch (e) {}
  });

  /* ---------------- read existing session (read-only, best effort) ---------------- */
  function readSessionName() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf('sb-') !== 0) continue;
        var raw = localStorage.getItem(k);
        if (!raw) continue;
        var p = JSON.parse(raw);
        var u = p && (p.user || (p.currentSession && p.currentSession.user));
        if (!u) continue;
        if (u.user_metadata && u.user_metadata.full_name) return String(u.user_metadata.full_name).split(' ')[0];
        if (u.email) return String(u.email).split('@')[0];
      }
    } catch (e) {}
    return null;
  }
  var firstName = readSessionName();

  /* ---------------- role (from the entry link) ---------------- */
  var ROLE = 'farmer';
  try {
    var rp = new URLSearchParams(location.search).get('role');
    if (rp === 'buyer' || rp === 'supervisor') ROLE = rp;
  } catch (e) {
    var rm = location.search.match(/[?&]role=([^&]+)/);
    if (rm && (rm[1] === 'buyer' || rm[1] === 'supervisor')) ROLE = rm[1];
  }
  var waSub = document.querySelector('.wa-sub');
  if (waSub) waSub.textContent = ROLE === 'buyer' ? 'Buyer Assistant' : 'WhatsApp Assistant';

  /* ---------------- tiny helpers ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function inr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
  function scrollDown() { chat.scrollTop = chat.scrollHeight; }

  var state = { flow: null, step: 0, data: {} };

  /* ---------------- rendering ---------------- */
  function addBot(html, actionsHtml) {
    var b = document.createElement('div');
    b.className = 'wa-bubble bot';
    b.innerHTML = html + (actionsHtml ? actionsHtml : '');
    chat.appendChild(b);
    scrollDown();
  }
  function addUser(label) {
    var b = document.createElement('div');
    b.className = 'wa-bubble me';
    b.textContent = label;
    chat.appendChild(b);
    scrollDown();
  }
  function typing(cb, ms) {
    var t = document.createElement('div');
    t.className = 'wa-bubble bot wa-typing';
    t.setAttribute('aria-hidden', 'true');
    t.innerHTML = '<i></i><i></i><i></i>';
    chat.appendChild(t);
    scrollDown();
    setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
      cb();
    }, ms || 480);
  }
  function actionBtn(label, act, value, cls) {
    return '<button class="wa-btn ' + (cls || '') + '" type="button" data-act="' + act + '" data-val="' + esc(value) + '">' + label + '</button>';
  }
  function menuButtons() {
    var items = [
      ['🌾', 'Sell My Crop', 'sell'], ['📊', 'Mandi Prices', 'prices'],
      ['💰', 'Buyer Offers', 'offers'], ['🧮', 'Calculate Earnings', 'profit'],
      ['🚚', 'Logistics', 'logistics'], ['💳', 'Payments', 'payments'],
      ['🏛', 'Government Schemes', 'schemes'], ['❓', 'Help', 'help']
    ];
    return '<div class="wa-menu">' + items.map(function (it) {
      return '<button class="wa-btn" type="button" data-act="menu" data-val="' + it[2] + '"><b>' + it[0] + '</b>' + it[1] + '</button>';
    }).join('') + '</div>';
  }
  function buyerMenuButtons() {
    var items = [
      ['🛒', 'Browse Farmer Lots', 'browse'], ['📢', 'Post RFQ / Tender', 'rfq'],
      ['🤝', 'My Orders & QC', 'borders'], ['🧮', 'Landed Cost Check', 'landed'],
      ['💳', 'Payments & Escrow', 'bpay'], ['🏛', 'Government Schemes', 'schemes'],
      ['❓', 'Help', 'help']
    ];
    return '<div class="wa-menu">' + items.map(function (it) {
      return '<button class="wa-btn" type="button" data-act="menu" data-val="' + it[2] + '"><b>' + it[0] + '</b>' + it[1] + '</button>';
    }).join('') + '</div>';
  }
  function note(text) { return '<p class="wa-note">' + text + '</p>'; }
  function demoChip() { return '<span class="wa-demo-chip">DEMO DATA</span>'; }

  /* ---------------- shared data ---------------- */
  var CROPS = {
    onion:  { name: '🧅 Onion',     price: 2950, trend: '↑', trendTxt: 'Up 2% vs yesterday' },
    tomato: { name: '🍅 Tomato',    price: 2150, trend: '↓', trendTxt: 'Down 4% vs yesterday' },
    potato: { name: '🥔 Potato',    price: 1780, trend: '→', trendTxt: 'Steady this week' },
    grapes: { name: '🍇 Grapes',    price: 6800, trend: '↑', trendTxt: 'Up 6% vs last week' },
    other:  { name: '🌾 Other Crop', price: 2400, trend: '→', trendTxt: 'Steady this week' }
  };
  var OFFER = {
    buyer: 'FreshGro Agro Retail & Exports', crop: 'Onion', qty: 500, unit: 'kg',
    pricePerKg: 28, logistics: 1200, grade: 'Grade A — Export / Premium'
  };
  var BUYER_LOTS = [
    { id: 'LOT-1042', crop: '🧅 Onion', qty: '500 kg', price: 28, fresh: 96, loc: 'Dindori, Nashik', grade: 'Grade A' },
    { id: 'LOT-1038', crop: '🍅 Tomato', qty: '300 kg', price: 22, fresh: 91, loc: 'Sinnar, Nashik', grade: 'Grade A' },
    { id: 'LOT-1031', crop: '🥔 Potato', qty: '1,000 kg', price: 17, fresh: 88, loc: 'Khed, Pune', grade: 'Grade B' },
    { id: 'LOT-1027', crop: '🍇 Grapes', qty: '200 kg', price: 64, fresh: 93, loc: 'Pimpalgaon, Nashik', grade: 'Premium' }
  ];
  var BUYER_RFQS = [
    { id: 'RFQ-201', crop: '🧅 Onion', qty: '2 MT', bids: 3, best: 27.5, status: 'Live reverse auction' },
    { id: 'RFQ-202', crop: '🍅 Tomato', qty: '1 MT', bids: 1, best: 21, status: 'Live reverse auction' }
  ];
  var BUYER_ORDERS = [
    { id: 'PO-501', crop: '🧅 Onion', qty: '500 kg', amount: 14000, status: '🚚 In transit', eta: 'ETA 4 hours' },
    { id: 'PO-498', crop: '🥔 Potato', qty: '1,000 kg', amount: 17000, status: '🚧 Gate QC pending', eta: 'At Vashi APMC' },
    { id: 'PO-495', crop: '🍇 Grapes', qty: '200 kg', amount: 12800, status: '✅ Completed', eta: 'Settled via escrow' }
  ];
  var SCHEMES = [
    { name: 'PM-KISAN', full: 'Pradhan Mantri Kisan Samman Nidhi', cat: 'Income Support',
      purpose: 'Direct income support of ₹6,000 per year in three instalments to eligible landholding farmer families.',
      eligible: 'Landholding farmer families, subject to scheme exclusion criteria.',
      benefits: ['₹6,000/year in 3 instalments', 'Direct Benefit Transfer to Aadhaar-linked account', 'Online application & status check'],
      official: 'https://pmkisan.gov.in/' },
    { name: 'PMFBY', full: 'Pradhan Mantri Fasal Bima Yojana', cat: 'Crop Insurance',
      purpose: 'Crop insurance against natural risks with subsidised premium (2% kharif, 1.5% rabi, 5% horticulture).',
      eligible: 'Farmers growing notified crops in notified areas.',
      benefits: ['Subsidised premium', 'Covers prevented sowing & post-harvest losses', 'Online enrolment via bank / CSC'],
      official: 'https://pmfby.gov.in/' },
    { name: 'KCC', full: 'Kisan Credit Card', cat: 'Credit & Finance',
      purpose: 'Flexible short-term credit for cultivation, post-harvest needs and farm assets.',
      eligible: 'Farmers, sharecroppers, tenant farmers and FPOs with a farm activity plan.',
      benefits: ['Low-interest crop loans', 'Withdraw as needed within limit', 'Interest subvention under some states'],
      official: 'https://www.nabard.org/' },
    { name: 'eNAM', full: 'National Agriculture Market', cat: 'Market & Trade',
      purpose: 'Unified online pan-India trading portal linking APMC mandis for transparent bidding.',
      eligible: 'Farmers, traders, FPOs and commission agents registered on eNAM.',
      benefits: ['Transparent online bidding', 'Buyers beyond your local mandi', 'Standardised quality assessment'],
      official: 'https://enam.gov.in/' },
    { name: 'Soil Health Card', full: 'Soil Health Card (SHC)', cat: 'Crop Advisory',
      purpose: 'Soil nutrient report for every farm holding with fertiliser recommendations.',
      eligible: 'All farmers; soil samples tested at government/approved labs.',
      benefits: ['Free soil testing', 'Crop-wise fertiliser recommendation', 'Lower input cost'],
      official: 'https://soilhealth.dac.gov.in/' },
    { name: 'PMKSY', full: 'Per Drop More Crop (Micro-Irrigation)', cat: 'Water & Irrigation',
      purpose: 'Efficient water use through drip/sprinkler systems with subsidy support.',
      eligible: 'Individual farmers and FPOs; subsidy varies by state.',
      benefits: ['Up to 55% subsidy on micro-irrigation', 'Higher water-use efficiency', 'Better yield stability'],
      official: 'https://pmksy.gov.in/' }
  ];

  /* ---------------- flows ---------------- */
  function startFlow(name) {
    state.flow = name;
    state.step = 0;
    state.data = {};
    step();
  }
  function step() {
    var f = state.flow;
    if (f === 'sell') sellStep();
    else if (f === 'prices') pricesStep();
    else if (f === 'offers') offersStep();
    else if (f === 'profit') profitStep();
    else if (f === 'logistics') logisticsStep();
    else if (f === 'payments') paymentsStep();
    else if (f === 'schemes') schemesStep();
    else if (f === 'help') { if (ROLE === 'buyer') buyerHelpStep(); else helpStep(); }
    else if (f === 'browse') browseStep();
    else if (f === 'rfq') rfqStep();
    else if (f === 'borders') bordersStep();
    else if (f === 'landed') landedStep();
    else if (f === 'bpay') bpayStep();
  }

  /* ---- main menu ---- */
  function showMenu(quiet) {
    state.flow = null; state.step = 0; state.data = {};
    if (quiet) { addBot('Back to the main menu. 👇'); return; }
    if (ROLE === 'supervisor') { supervisorDenied(); return; }
    typing(function () {
      addBot(
        '🌱 <b>KRISHI SETU</b><br>' +
        'Namaste' + (firstName ? ', ' + esc(firstName) : '') + '! 👋<br>' +
        (ROLE === 'buyer'
          ? 'I\'m your Krishi Setu <b>procurement assistant</b>.<br>Here is your buyer menu 👇'
          : 'I\'m your Krishi Setu assistant.<br>What would you like to do today?'),
        ROLE === 'buyer' ? buyerMenuButtons() : menuButtons()
      );
    });
  }
  function supervisorDenied() {
    addBot('🔒 <b>WhatsApp Beta — access restricted</b><br>' +
      'This prototype is available for <b>Farmer</b> and <b>Buyer</b> profiles only.<br>' +
      'Supervisor oversight stays in the main Krishi Setu dashboard.',
      '<div class="wa-actions">' + actionBtn('Open Krishi Setu Dashboard', 'open-dash', 'yes', 'solid') + '</div>' +
      note('Prototype interface for SIH demonstration.')
    );
  }

  /* ---- sell my crop ---- */
  function sellStep() {
    var s = state.data;
    if (state.step === 0) {
      typing(function () {
        addBot('What would you like to sell?', '<div class="wa-actions">' + Object.keys(CROPS).map(function (k) {
          return actionBtn(CROPS[k].name, 'crop-pick', k);
        }).join('') + '</div>');
      });
    } else if (state.step === 1) {
      typing(function () {
        addBot('How much do you have?', '<form class="wa-form" data-act="qty-submit">' +
          '<input type="number" name="qty" min="1" step="any" required placeholder="e.g. 500" aria-label="Quantity">' +
          '<select name="unit" aria-label="Unit">' +
          '<option value="kg">kg</option><option value="quintal">quintal</option><option value="ton">ton</option>' +
          '</select><button class="wa-btn solid" type="submit">Send</button></form>');
      });
    } else if (state.step === 2) {
      typing(function () {
        addBot('Where is the produce located?', '<div class="wa-actions">' +
          actionBtn('📍 Use saved location (Dindori, Nashik)', 'loc-pick', 'saved') +
          actionBtn('📍 Enter location', 'loc-pick', 'enter') + '</div>');
      });
    } else if (state.step === 3) {
      typing(function () {
        var kg = toKg(s.qty, s.unit);
        var value = Math.round((kg / 100) * CROPS[s.crop].price);
        state.data.value = value;
        addBot('Here is your summary 👇',
          '<div class="wa-card"><h4>🧺 READY TO PUBLISH</h4>' +
          '<div class="wa-row"><span>Crop</span><b>' + CROPS[s.crop].name.replace(/^.. /, '') + '</b></div>' +
          '<div class="wa-row"><span>Quantity</span><b>' + s.qty + ' ' + s.unit + '</b></div>' +
          '<div class="wa-row"><span>Grade</span><b>Grade A — Premium</b></div>' +
          '<div class="wa-row"><span>Estimated market value</span><b>' + inr(value) + '</b></div>' +
          '<div class="wa-actions">' +
          actionBtn('✅ Publish Lot', 'publish-lot', 'yes', 'solid') +
          actionBtn('✏️ Edit', 'publish-lot', 'edit', 'ghost') + '</div></div>' +
          note('Estimated value uses demo mandi rates ' + demoChip())
        );
      });
    }
  }
  function toKg(qty, unit) {
    var n = Number(qty) || 0;
    if (unit === 'ton') return n * 1000;
    if (unit === 'quintal') return n * 100;
    return n;
  }

  /* ---- mandi prices ---- */
  function pricesStep() {
    if (state.step === 0) {
      typing(function () {
        addBot('What crop price would you like to check?', '<div class="wa-actions">' + Object.keys(CROPS).map(function (k) {
          return actionBtn(CROPS[k].name, 'price-pick', k);
        }).join('') + '</div>');
      });
    } else {
      var c = CROPS[state.data.crop];
      typing(function () {
        addBot('📊 <b>Mandi Price</b> ' + demoChip(),
          '<div class="wa-card"><h4>' + c.name + '</h4>' +
          '<div class="wa-row"><span>Current</span><b>' + inr(c.price) + ' / quintal</b></div>' +
          '<div class="wa-row"><span>Market</span><b>Nashik APMC</b></div>' +
          '<div class="wa-row"><span>Trend (24h)</span><b>' + c.trend + ' ' + esc(c.trendTxt) + '</b></div>' +
          '<div class="wa-actions">' +
          actionBtn('Check another crop', 'price-pick', 'again', 'ghost') +
          actionBtn('Main Menu', 'menu', 'home') + '</div></div>' +
          note('Demo reference data — not a live market feed.')
        );
      });
    }
  }

  /* ---- buyer offers ---- */
  function offersStep() {
    if (state.step === 0) {
      typing(function () {
        var gross = OFFER.qty * OFFER.pricePerKg;
        var net = gross - OFFER.logistics;
        state.data.net = net;
        addBot('💰 You have <b>1 new offer</b> 👇',
          '<div class="wa-card"><h4>' + esc(OFFER.buyer) + '</h4>' +
          '<div class="wa-row"><span>Produce</span><b>' + OFFER.crop + ' · ' + OFFER.qty + ' ' + OFFER.unit + '</b></div>' +
          '<div class="wa-row"><span>Offer price</span><b>' + inr(OFFER.pricePerKg) + ' / kg</b></div>' +
          '<div class="wa-row"><span>Est. logistics</span><b>' + inr(OFFER.logistics) + '</b></div>' +
          '<div class="wa-row"><span>Expected net value</span><b>' + inr(net) + '</b></div>' +
          '<div class="wa-actions">' +
          actionBtn('View Offer', 'offer-act', 'view', 'solid') +
          actionBtn('Accept', 'offer-act', 'accept') +
          actionBtn('Counter', 'offer-act', 'counter', 'ghost') + '</div></div>' +
          note('Demo offer — not a real buyer bid.')
        );
      });
    } else if (state.step === 1) {
      var act = state.data.act;
      if (act === 'view') {
        addBot(esc(OFFER.buyer) + ' is offering <b>' + inr(OFFER.pricePerKg) + '/kg</b> for ' + OFFER.qty + ' kg ' +
          OFFER.crop + ' (' + OFFER.grade + ').<br>Pickup: buyer arranges doorstep truck pickup.<br>Payment: Instant UPI on delivery approval.',
          '<div class="wa-actions">' +
          actionBtn('Accept', 'offer-act', 'accept', 'solid') +
          actionBtn('Counter', 'offer-act', 'counter') +
          actionBtn('Main Menu', 'menu', 'home', 'ghost') + '</div>');
      } else if (act === 'accept') {
        addBot('✅ <b>Offer accepted!</b><br>Order <b>OFF-901</b> created for ' + OFFER.qty + ' kg ' + OFFER.crop +
          ' — expected net <b>' + inr(state.data.net) + '</b>.<br>Settlement releases after delivery approval.' +
          note('Prototype action — demo only. No live order was created.'),
          '<div class="wa-actions">' + actionBtn('Main Menu', 'menu', 'home', 'solid') + '</div>');
      } else if (act === 'counter') {
        addBot('What price would you like to counter with? (₹ per kg)',
          '<form class="wa-form" data-act="counter-submit">' +
          '<input type="number" name="price" min="1" step="0.01" required placeholder="e.g. 29" aria-label="Counter price per kg">' +
          '<button class="wa-btn solid" type="submit">Send</button></form>');
      }
    } else if (state.step === 2) {
      addBot('✅ <b>Counter offer prepared.</b><br>Your counter of <b>' + inr(state.data.counter) + '/kg</b> has been sent to ' +
        esc(OFFER.buyer) + '. You will be notified if they respond.' +
        note('Prototype action — demo only.'),
        '<div class="wa-actions">' + actionBtn('Main Menu', 'menu', 'home', 'solid') + '</div>');
    }
  }

  /* ---- profit / calculate earnings ---- */
  function profitStep() {
    var s = state.data;
    if (state.step === 0) {
      typing(function () {
        addBot('Let\'s calculate your earnings. 🧮<br>How much produce do you have?',
          '<form class="wa-form" data-act="calc-qty">' +
          '<input type="number" name="qty" min="1" step="any" required placeholder="e.g. 500" aria-label="Quantity in kg">' +
          '<select name="unit" aria-label="Unit"><option value="kg">kg</option><option value="quintal">quintal</option><option value="ton">ton</option></select>' +
          '<button class="wa-btn solid" type="submit">Send</button></form>');
      });
    } else if (state.step === 1) {
      typing(function () {
        addBot('What selling price do you expect? (₹ per kg)',
          '<form class="wa-form" data-act="calc-price">' +
          '<input type="number" name="price" min="1" step="0.01" required placeholder="e.g. 30" aria-label="Selling price per kg">' +
          '<button class="wa-btn solid" type="submit">Send</button></form>');
      });
    } else if (state.step === 2) {
      typing(function () {
        addBot('Transport cost? (₹)',
          '<form class="wa-form" data-act="calc-transport">' +
          '<input type="number" name="cost" min="0" step="any" required placeholder="e.g. 1200" aria-label="Transport cost in rupees">' +
          '<button class="wa-btn solid" type="submit">Send</button></form>');
      });
    } else if (state.step === 3) {
      typing(function () {
        addBot('Any other costs? (packing, commission, etc. — ₹)',
          '<form class="wa-form" data-act="calc-other">' +
          '<input type="number" name="cost" min="0" step="any" required placeholder="e.g. 500" aria-label="Other costs in rupees">' +
          '<button class="wa-btn solid" type="submit">Send</button></form>');
      });
    } else {
      var gross = toKg(s.qty, s.unit) * s.price;
      var commission = Math.round(gross * 0.02);
      var net = Math.round(gross - s.transport - commission - s.other);
      typing(function () {
        addBot('Here is your earning estimate 👇',
          '<div class="wa-card"><h4>🧮 Earning Estimate</h4>' +
          '<div class="wa-row"><span>Gross value</span><b>' + inr(gross) + '</b></div>' +
          '<div class="wa-row"><span>Transport</span><b>− ' + inr(s.transport) + '</b></div>' +
          '<div class="wa-row"><span>Commission (2%)</span><b>− ' + inr(commission) + '</b></div>' +
          '<div class="wa-row"><span>Other costs</span><b>− ' + inr(s.other) + '</b></div></div>' +
          '<div class="wa-result"><small>NET REALISATION</small><b>' + inr(net) + '</b></div>' +
          '<div class="wa-actions">' +
          actionBtn('Calculate again', 'calc-again', 'yes', 'ghost') +
          actionBtn('Main Menu', 'menu', 'home', 'solid') + '</div>' +
          note('Estimated only — actual realisation depends on the final buyer offer.')
        );
      });
    }
  }

  /* ---- logistics ---- */
  function logisticsStep() {
    if (state.step === 0) {
      typing(function () {
        addBot('🚚 <b>Your shipment</b> 👇',
          '<div class="wa-card"><h4>Onion — 500 kg</h4>' +
          '<div class="wa-row"><span>Destination</span><b>Nashik FPO Hub</b></div>' +
          '<div class="wa-row"><span>Distance</span><b>22 km</b></div>' +
          '<div class="wa-row"><span>Est. transport</span><b>' + inr(1200) + '</b></div>' +
          '<div class="wa-row"><span>Est. delivery</span><b>4 hours</b></div>' +
          '<div class="wa-row"><span>Status</span><b><span class="wa-pill ok">Ready for pickup</span></b></div>' +
          '<div class="wa-actions">' +
          actionBtn('Arrange Transport', 'logi-act', 'arrange', 'solid') +
          actionBtn('Track Delivery', 'logi-act', 'track') +
          actionBtn('Main Menu', 'menu', 'home', 'ghost') + '</div></div>' +
          note('Demo shipment — not connected to any live logistics provider.')
        );
      });
    } else if (state.data.act === 'arrange') {
      addBot('✅ <b>Transport arranged!</b><br>Pickup window: <b>9:00 – 11:00 AM</b> tomorrow.<br>Vehicle: 1-ton refrigerated tempo.' +
        note('Prototype action — demo only.'),
        '<div class="wa-actions">' + actionBtn('Main Menu', 'menu', 'home', 'solid') + '</div>');
    } else if (state.data.act === 'track') {
      addBot('📍 <b>Delivery tracking</b> ' + demoChip(),
        '<ul class="wa-timeline">' +
        '<li class="done"><span class="dot"></span><div><b>Picked up</b><small>Dindori, Nashik · 8:40 AM</small></div></li>' +
        '<li class="now"><span class="dot"></span><div><b>In transit</b><small>22 km to Nashik FPO Hub</small></div></li>' +
        '<li><span class="dot"></span><div><b>Delivered</b><small>Expected 12:40 PM</small></div></li></ul>' +
        '<div class="wa-actions">' + actionBtn('Main Menu', 'menu', 'home', 'solid') + '</div>' +
        note('Simulated tracking for the demo.')
      );
    }
  }

  /* ---- payments ---- */
  function paymentsStep() {
    typing(function () {
      addBot('💳 <b>Your payments</b> ' + demoChip(),
        '<div class="wa-card">' +
        '<div class="wa-row"><span>Onion sale · OFF-901</span><b>' + inr(59000) + '</b></div>' +
        '<div class="wa-row"><span>Status</span><b><span class="wa-pill ok">✅ Completed</span></b></div>' +
        '<hr style="border:0;border-top:1px solid var(--wa-line);margin:8px 0">' +
        '<div class="wa-row"><span>Potato sale · OFF-898</span><b>' + inr(26700) + '</b></div>' +
        '<div class="wa-row"><span>Status</span><b><span class="wa-pill wait">⏳ Processing</span></b></div>' +
        '<hr style="border:0;border-top:1px solid var(--wa-line);margin:8px 0">' +
        '<div class="wa-row"><span>Logistics fee</span><b>' + inr(1200) + '</b></div>' +
        '<div class="wa-row"><span>Status</span><b><span class="wa-pill pend">⏳ Pending</span></b></div>' +
        '</div>' +
        '<div class="wa-actions">' + actionBtn('Main Menu', 'menu', 'home', 'solid') + '</div>' +
        note('Demo transactions — no live payment was processed.')
      );
    });
  }

  /* ---- government schemes ---- */
  function schemesStep() {
    if (state.step === 0) {
      typing(function () {
        addBot('🏛 <b>Government Schemes</b><br>Tap a scheme to see details 👇',
          '<div class="wa-actions">' + SCHEMES.map(function (s, i) {
            return actionBtn(s.name + ' · ' + s.cat, 'scheme-view', i);
          }).join('') + '</div>' +
          note('Guidance only — always verify on the official portal.')
        );
      });
    } else {
      var s = SCHEMES[state.data.scheme];
      typing(function () {
        addBot('<b>' + esc(s.full) + '</b><br><span class="wa-demo-chip">' + esc(s.cat) + '</span>',
          '<div class="wa-card">' +
          '<div class="wa-row"><span>Purpose</span><b style="max-width:60%;text-align:right">' + esc(s.purpose) + '</b></div>' +
          '<div class="wa-row"><span>Eligible</span><b style="max-width:60%;text-align:right">' + esc(s.eligible) + '</b></div>' +
          '<b style="font-size:13px;display:block;margin-top:8px">Key benefits</b>' +
          '<ul style="margin:6px 0 0;padding-left:18px;font-size:13.5px">' + s.benefits.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
          '</div>' +
          '<p style="margin:10px 0 0"><a class="wa-link" href="' + s.official + '" target="_blank" rel="noopener noreferrer">Official portal ↗</a></p>' +
          '<div class="wa-actions">' +
          actionBtn('More schemes', 'scheme-more', 'yes', 'ghost') +
          actionBtn('Main Menu', 'menu', 'home', 'solid') + '</div>' +
          note('Scheme summary is guidance — confirm eligibility on the official portal.')
        );
      });
    }
  }

  /* ---- help ---- */
  function helpStep() {
    typing(function () {
      addBot('❓ <b>How can I use Krishi Setu?</b><br>Pick what you need — I\'ll guide you step by step:',
        '<div class="wa-actions">' +
        actionBtn('🌾 Sell My Crop', 'menu', 'sell') +
        actionBtn('📊 Mandi Prices', 'menu', 'prices') +
        actionBtn('💰 Buyer Offers', 'menu', 'offers') +
        actionBtn('🧮 Calculate Earnings', 'menu', 'profit') +
        actionBtn('🚚 Logistics', 'menu', 'logistics') +
        actionBtn('💳 Payments', 'menu', 'payments') +
        actionBtn('🏛 Government Schemes', 'menu', 'schemes') +
        actionBtn('Open Krishi Setu Dashboard', 'open-dash', 'yes') + '</div>' +
        note('I\'m a guided assistant — not a full AI chatbot.')
      );
    });
  }

  /* ---- buyer: browse farmer lots ---- */
  function browseStep() {
    if (state.step === 0) {
      typing(function () {
        addBot('🛒 <b>Fresh farmer lots</b> ' + demoChip() + '<br>Verified lots with AI freshness scores 👇',
          '<div class="wa-actions">' + BUYER_LOTS.map(function (l, i) {
            return actionBtn(l.crop + ' · ' + l.qty + ' · ₹' + l.price + '/kg · 🍃' + l.fresh + '%', 'lot-view', i);
          }).join('') + '</div>' + note('Demo lots — not live listings.')
        );
      });
    } else if (state.step === 1) {
      var l = BUYER_LOTS[state.data.lot];
      typing(function () {
        addBot('🛒 <b>' + l.id + '</b>',
          '<div class="wa-card"><h4>' + l.crop + '</h4>' +
          '<div class="wa-row"><span>Quantity</span><b>' + l.qty + '</b></div>' +
          '<div class="wa-row"><span>Asking price</span><b>₹' + l.price + ' / kg</b></div>' +
          '<div class="wa-row"><span>Freshness</span><b>🍃 ' + l.fresh + '% (AI)</b></div>' +
          '<div class="wa-row"><span>Location</span><b>' + esc(l.loc) + '</b></div>' +
          '<div class="wa-row"><span>Grade</span><b>' + l.grade + '</b></div>' +
          '<div class="wa-actions">' +
          actionBtn('💼 Make Offer', 'lot-offer', 'yes', 'solid') +
          actionBtn('More lots', 'browse-back', 'yes') +
          actionBtn('Main Menu', 'menu', 'home', 'ghost') + '</div></div>' +
          note('Seller trust score 92 · Escrow-protected deal.')
        );
      });
    } else if (state.step === 2) {
      typing(function () {
        addBot('How much would you like to buy, and at what price?',
          '<form class="wa-form" data-act="buyer-offer-qty">' +
          '<input type="number" name="qty" min="1" step="any" required placeholder="Quantity (kg), e.g. 500" aria-label="Quantity in kg">' +
          '<input type="number" name="price" min="1" step="0.01" required placeholder="Your price (₹/kg), e.g. 27" aria-label="Offer price per kg">' +
          '<button class="wa-btn solid" type="submit">Send</button></form>');
      });
    } else if (state.step === 3) {
      var l2 = BUYER_LOTS[state.data.lot];
      var gross = state.data.qty * state.data.price;
      state.data.gross = gross;
      typing(function () {
        addBot('Confirm your offer 👇',
          '<div class="wa-card"><h4>💼 OFFER PREVIEW</h4>' +
          '<div class="wa-row"><span>Lot</span><b>' + l2.id + ' · ' + l2.crop.replace(/^.. /, '') + '</b></div>' +
          '<div class="wa-row"><span>Quantity</span><b>' + state.data.qty + ' kg</b></div>' +
          '<div class="wa-row"><span>Price</span><b>₹' + state.data.price + ' / kg</b></div>' +
          '<div class="wa-row"><span>Total value</span><b>' + inr(gross) + '</b></div>' +
          '<div class="wa-actions">' +
          actionBtn('✅ Submit Offer', 'buyer-offer-confirm', 'yes', 'solid') +
          actionBtn('✏️ Edit', 'buyer-offer-edit', 'yes', 'ghost') + '</div></div>' +
          note('Offer is escrow-backed — funds release after gate QC.')
        );
      });
    } else if (state.step === 4) {
      addBot('✅ <b>Offer submitted to seller!</b><br>' + inr(state.data.gross) + ' for ' + state.data.qty + ' kg on ' +
        BUYER_LOTS[state.data.lot].id + '.<br>You\'ll be notified when the seller responds.' +
        note('Prototype action — demo only. No live offer was created.'),
        '<div class="wa-actions">' + actionBtn('Browse more lots', 'browse-back', 'yes', 'solid') + actionBtn('Main Menu', 'menu', 'home', 'ghost') + '</div>');
    }
  }

  /* ---- buyer: RFQ / tender status ---- */
  function rfqStep() {
    if (state.step === 0) {
      typing(function () {
        addBot('📢 <b>Your sourcing tenders</b> ' + demoChip() + '<br>Tap a tender to see live bids 👇',
          '<div class="wa-actions">' + BUYER_RFQS.map(function (r, i) {
            return actionBtn(r.id + ' · ' + r.crop + ' · ' + r.qty, 'rfq-view', i);
          }).join('') + '</div>' + note('Demo tenders — no live RFQ exists.')
        );
      });
    } else {
      var r = BUYER_RFQS[state.data.rfq];
      typing(function () {
        addBot('📢 <b>' + r.id + '</b>',
          '<div class="wa-card"><h4>' + r.crop + '</h4>' +
          '<div class="wa-row"><span>Requirement</span><b>' + r.qty + '</b></div>' +
          '<div class="wa-row"><span>Bids received</span><b>' + r.bids + '</b></div>' +
          '<div class="wa-row"><span>Best bid</span><b>₹' + r.best + ' / kg</b></div>' +
          '<div class="wa-row"><span>Status</span><b><span class="wa-pill ok">' + esc(r.status) + '</span></b></div>' +
          '<div class="wa-actions">' +
          actionBtn('More tenders', 'rfq-back', 'yes', 'ghost') +
          actionBtn('Main Menu', 'menu', 'home', 'solid') + '</div></div>' +
          note('Reverse auction — farmers and FPOs bid down to your target price.')
        );
      });
    }
  }

  /* ---- buyer: orders & gate QC ---- */
  function bordersStep() {
    if (state.step === 0) {
      typing(function () {
        addBot('🤝 <b>Your purchase orders</b> ' + demoChip(),
          '<div class="wa-card">' + BUYER_ORDERS.map(function (o) {
            return '<div class="wa-row"><span>' + o.crop + ' · ' + o.qty + '</span><b>' + inr(o.amount) + '</b></div>' +
              '<div class="wa-row"><span>Status</span><b><span class="wa-pill ' + (o.status.indexOf('✅') === 0 ? 'ok' : o.status.indexOf('🚚') === 0 ? 'wait' : 'pend') + '">' + esc(o.status) + '</span></b></div>' +
              '<div style="font-size:12px;color:var(--wa-muted);margin:-4px 0 8px">' + esc(o.id) + ' · ' + esc(o.eta) + '</div><hr style="border:0;border-top:1px solid var(--wa-line);margin:4px 0">';
          }).join('') + '</div>' +
          '<div class="wa-actions">' + actionBtn('Track PO-501', 'borders-track', 'yes', 'solid') + actionBtn('Main Menu', 'menu', 'home', 'ghost') + '</div>' +
          note('Demo orders — not connected to the live platform.')
        );
      });
    } else if (state.data.track) {
      addBot('📍 <b>PO-501 tracking</b> ' + demoChip(),
        '<ul class="wa-timeline">' +
        '<li class="done"><span class="dot"></span><div><b>Seller dispatched</b><small>Dindori, Nashik · 8:40 AM</small></div></li>' +
        '<li class="now"><span class="dot"></span><div><b>In transit</b><small>Reefer · 18°C · 42 km to Vashi APMC</small></div></li>' +
        '<li><span class="dot"></span><div><b>Gate QC & escrow release</b><small>Expected 12:40 PM</small></div></li></ul>' +
        '<div class="wa-actions">' + actionBtn('Main Menu', 'menu', 'home', 'solid') + '</div>' +
        note('Simulated tracking for the demo.')
      );
    }
  }

  /* ---- buyer: landed cost check ---- */
  function landedStep() {
    if (state.step === 0) {
      typing(function () {
        addBot('🧮 <b>Landed cost check</b><br>Compare farm-gate buying vs mandi — enter your numbers (₹/quintal):',
          '<form class="wa-form" data-act="landed-calc">' +
          '<input type="number" name="farmgate" min="0" step="any" required placeholder="Farm-gate price (₹/q), e.g. 2950" aria-label="Farm gate price per quintal">' +
          '<input type="number" name="mandi" min="0" step="any" required placeholder="Mandi price (₹/q), e.g. 3180" aria-label="Mandi price per quintal">' +
          '<input type="number" name="freight" min="0" step="any" required placeholder="Freight + cess (₹/q), e.g. 120" aria-label="Freight and cess per quintal">' +
          '<button class="wa-btn solid" type="submit">Send</button></form>');
      });
    } else {
      var save = state.data.mandi - state.data.farmgate - state.data.freight;
      var total = Math.round(save * 500); // 50 MT = 500 quintal
      typing(function () {
        addBot('📊 <b>Direct purchase advantage</b>',
          '<div class="wa-card"><h4>🧮 Landed Cost</h4>' +
          '<div class="wa-row"><span>Mandi benchmark</span><b>' + inr(state.data.mandi) + '/q</b></div>' +
          '<div class="wa-row"><span>Farm-gate + freight</span><b>' + inr(state.data.farmgate + state.data.freight) + '/q</b></div>' +
          '<div class="wa-row"><span>Saving per quintal</span><b style="color:var(--wa-green)">' + inr(save) + '</b></div></div>' +
          '<div class="wa-result"><small>SAVING ON 50 MT LOT</small><b>' + inr(total) + '</b></div>' +
          '<div class="wa-actions">' + actionBtn('Calculate again', 'landed-again', 'yes', 'ghost') + actionBtn('Main Menu', 'menu', 'home', 'solid') + '</div>' +
          note('Illustrative calculation with your inputs — demo data.')
        );
      });
    }
  }

  /* ---- buyer: payments & escrow ---- */
  function bpayStep() {
    typing(function () {
      addBot('💳 <b>Payments & escrow</b> ' + demoChip(),
        '<div class="wa-card">' +
        '<div class="wa-row"><span>Escrow balance</span><b>' + inr(184000) + '</b></div>' +
        '<div class="wa-row"><span>PO-501 · Onion</span><b>' + inr(14000) + '</b></div>' +
        '<div class="wa-row"><span>Status</span><b><span class="wa-pill wait">⏳ Locked in escrow</span></b></div>' +
        '<hr style="border:0;border-top:1px solid var(--wa-line);margin:8px 0">' +
        '<div class="wa-row"><span>PO-495 · Grapes</span><b>' + inr(12800) + '</b></div>' +
        '<div class="wa-row"><span>Status</span><b><span class="wa-pill ok">✅ Released after QC</span></b></div>' +
        '<hr style="border:0;border-top:1px solid var(--wa-line);margin:8px 0">' +
        '<div class="wa-row"><span>Warehouse fee</span><b>' + inr(950) + '</b></div>' +
        '<div class="wa-row"><span>Status</span><b><span class="wa-pill pend">⏳ Pending</span></b></div>' +
        '</div>' +
        '<div class="wa-actions">' + actionBtn('Main Menu', 'menu', 'home', 'solid') + '</div>' +
        note('Demo escrow — no live payment was processed.')
      );
    });
  }

  /* ---- buyer help ---- */
  function buyerHelpStep() {
    typing(function () {
      addBot('❓ <b>Buyer quick guide</b><br>Pick what you need — I\'ll guide you:', '<div class="wa-actions">' +
        actionBtn('🛒 Browse Farmer Lots', 'menu', 'browse') +
        actionBtn('📢 Post RFQ / Tender', 'menu', 'rfq') +
        actionBtn('🤝 Track Orders & QC', 'menu', 'borders') +
        actionBtn('🧮 Landed Cost Check', 'menu', 'landed') +
        actionBtn('💳 Payments & Escrow', 'menu', 'bpay') +
        actionBtn('🏛 Government Schemes', 'menu', 'schemes') +
        actionBtn('Open Krishi Setu Dashboard', 'open-dash', 'yes') + '</div>' +
        note('I\'m a guided assistant — not a full AI chatbot.')
      );
    });
  }

  /* ---------------- actions ---------------- */
  var handlers = {
    'menu': function (btn) {
      var v = btn.getAttribute('data-val');
      addUser(btn.textContent.trim().replace(/\n/g, ' '));
      if (v === 'home' || !v) { showMenu(true); return; }
      startFlow(v);
    },
    'crop-pick': function (btn) {
      addUser(CROPS[btn.getAttribute('data-val')].name);
      state.data.crop = btn.getAttribute('data-val');
      state.step = 1; step();
    },
    'loc-pick': function (btn) {
      var v = btn.getAttribute('data-val');
      addUser(v === 'saved' ? '📍 Use saved location' : '📍 Enter location');
      if (v === 'saved') {
        state.data.loc = 'Dindori, Nashik';
        state.step = 3; step();
      } else {
        typing(function () {
          addBot('Please type your village and district:',
            '<form class="wa-form" data-act="loc-enter"><input type="text" name="loc" required placeholder="e.g. Dindori, Nashik" aria-label="Location">' +
            '<button class="wa-btn solid" type="submit">Send</button></form>');
        });
      }
    },
    'publish-lot': function (btn) {
      var v = btn.getAttribute('data-val');
      addUser(v === 'yes' ? '✅ Publish Lot' : '✏️ Edit');
      if (v === 'yes') {
        var kg = toKg(state.data.qty, state.data.unit);
        addBot('✅ <b>Produce lot published successfully!</b><br>' +
          CROPS[state.data.crop].name.replace(/^.. /, '') + ' · ' + state.data.qty + ' ' + state.data.unit +
          ' · ' + esc(state.data.loc) + '<br>Estimated value: <b>' + inr(state.data.value) + '</b>' +
          note('Prototype action — demo only. This did not write to your live inventory or Supabase.'),
          '<div class="wa-actions">' + actionBtn('Sell Another Crop', 'menu', 'sell', 'solid') + actionBtn('Main Menu', 'menu', 'home', 'ghost') + '</div>');
      } else {
        state.flow = 'sell'; state.step = 0; state.data = {};
        addBot('OK, let\'s start over. 👇');
        sellStep();
      }
    },
    'price-pick': function (btn) {
      var v = btn.getAttribute('data-val');
      if (v === 'again') { state.step = 0; state.data = {}; }
      else { addUser(CROPS[v].name); state.data.crop = v; state.step = 1; }
      step();
    },
    'offer-act': function (btn) {
      var v = btn.getAttribute('data-val');
      addUser(v === 'view' ? '👁 View Offer' : v === 'accept' ? '✅ Accept' : '↩️ Counter');
      state.data.act = v;
      state.step = 1; step();
    },
    'calc-again': function (btn) {
      addUser('🧮 Calculate again');
      state.flow = 'profit'; state.step = 0; state.data = {};
      profitStep();
    },
    'logi-act': function (btn) {
      var v = btn.getAttribute('data-val');
      addUser(v === 'arrange' ? '🚚 Arrange Transport' : '📍 Track Delivery');
      state.data.act = v;
      state.step = 1; logisticsStep();
    },
    'scheme-view': function (btn) {
      var i = Number(btn.getAttribute('data-val'));
      addUser(SCHEMES[i].name);
      state.data.scheme = i;
      state.step = 1; schemesStep();
    },
    'scheme-more': function (btn) {
      addUser('More schemes');
      state.flow = 'schemes'; state.step = 0; state.data = {};
      schemesStep();
    },
    'lot-view': function (btn) {
      var i = Number(btn.getAttribute('data-val'));
      addUser(BUYER_LOTS[i].crop);
      state.data.lot = i;
      state.step = 1; browseStep();
    },
    'browse-back': function (btn) {
      addUser('🛒 More lots');
      state.flow = 'browse'; state.step = 0; state.data = {};
      browseStep();
    },
    'lot-offer': function (btn) {
      addUser('💼 Make Offer');
      state.step = 2; browseStep();
    },
    'buyer-offer-edit': function (btn) {
      addUser('✏️ Edit');
      state.step = 2; browseStep();
    },
    'buyer-offer-confirm': function (btn) {
      addUser('✅ Submit Offer');
      state.step = 4; browseStep();
    },
    'rfq-view': function (btn) {
      var i = Number(btn.getAttribute('data-val'));
      addUser(BUYER_RFQS[i].id);
      state.data.rfq = i;
      state.step = 1; rfqStep();
    },
    'rfq-back': function (btn) {
      addUser('More tenders');
      state.flow = 'rfq'; state.step = 0; state.data = {};
      rfqStep();
    },
    'borders-track': function (btn) {
      addUser('📍 Track PO-501');
      state.data.track = true;
      state.step = 1; bordersStep();
    },
    'landed-again': function (btn) {
      addUser('🧮 Calculate again');
      state.flow = 'landed'; state.step = 0; state.data = {};
      landedStep();
    },
    'open-dash': function (btn) {
      addUser('Open Krishi Setu Dashboard');
      addBot('The full dashboard opens in a new tab — you stay logged in. 🌱');
    }
  };

  /* form submissions */
  function submitForm(form, act) {
    var vals = {};
    form.querySelectorAll('[name]').forEach(function (el) { vals[el.name] = el.value; });
    if (act === 'qty-submit') {
      var qty = Number(vals.qty);
      if (!(qty > 0)) { addBot('Please enter a valid quantity, e.g. <b>500</b>. 🙏'); return; }
      addUser(vals.qty + ' ' + vals.unit);
      state.data.qty = vals.qty; state.data.unit = vals.unit;
      state.step = 2; step();
    } else if (act === 'loc-enter') {
      var loc = String(vals.loc || '').trim();
      if (!loc) { addBot('Please enter your location. 🙏'); return; }
      addUser(loc);
      state.data.loc = loc;
      state.step = 3; step();
    } else if (act === 'counter-submit') {
      var p = Number(vals.price);
      if (!(p > 0)) { addBot('Please enter a valid price, e.g. <b>29</b>. 🙏'); return; }
      addUser('₹' + p + ' / kg');
      state.data.counter = p;
      state.step = 2; step();
    } else if (act === 'calc-qty') {
      var cq = Number(vals.qty);
      if (!(cq > 0)) { addBot('Please enter a valid quantity. 🙏'); return; }
      addUser(vals.qty + ' ' + vals.unit);
      state.data.qty = vals.qty; state.data.unit = vals.unit;
      state.step = 1; step();
    } else if (act === 'calc-price') {
      var cp = Number(vals.price);
      if (!(cp > 0)) { addBot('Please enter a valid price. 🙏'); return; }
      addUser('₹' + cp + ' / kg');
      state.data.price = cp;
      state.step = 2; step();
    } else if (act === 'calc-transport' || act === 'calc-other') {
      var cc = Number(vals.cost);
      if (isNaN(cc) || cc < 0) { addBot('Please enter a valid amount in ₹. 🙏'); return; }
      addUser('₹' + cc);
      if (act === 'calc-transport') { state.data.transport = cc; state.step = 3; }
      else { state.data.other = cc; state.step = 4; }
      step();
    } else if (act === 'buyer-offer-qty') {
      var bq = Number(vals.qty); var bp = Number(vals.price);
      if (!(bq > 0) || !(bp > 0)) { addBot('Please enter a valid quantity and price. 🙏'); return; }
      addUser(bq + ' kg @ ₹' + bp + '/kg');
      state.data.qty = bq; state.data.price = bp;
      state.step = 3; step();
    } else if (act === 'landed-calc') {
      var fg = Number(vals.farmgate), md = Number(vals.mandi), fr = Number(vals.freight);
      if (isNaN(fg) || isNaN(md) || isNaN(fr) || fg < 0 || md < 0 || fr < 0) { addBot('Please enter valid amounts. 🙏'); return; }
      addUser('Farm-gate ₹' + fg + ' · Mandi ₹' + md + ' · Freight ₹' + fr);
      state.data.farmgate = fg; state.data.mandi = md; state.data.freight = fr;
      state.step = 1; step();
    }
  }

  /* ---------------- wire events ---------------- */
  chat.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!btn || !chat.contains(btn)) return;
    var act = btn.getAttribute('data-act');
    if (handlers[act]) handlers[act](btn);
  });
  chat.addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    if (!form || !form.getAttribute || !form.getAttribute('data-act')) return;
    submitForm(form, form.getAttribute('data-act'));
  });
  if (homeBtn) homeBtn.addEventListener('click', function () { showMenu(true); });

  /* ---------------- start ---------------- */
  var day = document.createElement('div');
  day.className = 'wa-day';
  day.textContent = 'Today';
  chat.appendChild(day);
  showMenu();
})();