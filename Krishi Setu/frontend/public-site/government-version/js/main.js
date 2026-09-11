/* ============================================================
   KRISHI SETU — GOVERNMENT SITE (Version 1) interactions
   Restrained: navigation, filters, search, article rendering.
   No scroll-storytelling / heavy animation by design.

   i18n: renderers read UI strings through tr() so the language
   module (js/i18n.js, loaded after this file) can re-render every
   dynamic section in the selected language. window.KS_RENDER
   exposes the renderers for that purpose.
   ============================================================ */
(function () {
  'use strict';

  /* ============================================================
     THEME: Light/Dark toggle
     - Default: always 'light' for first-time visitors.
     - Saved preference in localStorage key 'ks_gov_theme'.
     - No prefers-color-scheme override — product default is light.
     ============================================================ */
  (function initTheme() {
    var saved = localStorage.getItem('ks_gov_theme');
    var theme = (saved === 'dark') ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    /* Update toggle button icon once DOM is ready */
    document.addEventListener('DOMContentLoaded', function () {
      syncThemeBtn(theme);
    });
    /* Also sync immediately if already loaded (scripts at end of body) */
    syncThemeBtn(theme);
  })();

  function syncThemeBtn(theme) {
    var btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    if (theme === 'dark') {
      btn.textContent = '☀️ Light';
      btn.setAttribute('aria-label', 'Switch to light mode');
      btn.setAttribute('title', 'Switch to light mode');
    } else {
      btn.textContent = '🌙 Dark';
      btn.setAttribute('aria-label', 'Switch to dark mode');
      btn.setAttribute('title', 'Switch to dark mode');
    }
  }


  /* ---------- i18n string helper (English fallback until js/i18n.js loads) ---------- */
  function tr(key, fb) {
    if (window.KS_I18N && typeof KS_I18N.t === 'function') {
      var v = KS_I18N.t(key, fb);
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return fb;
  }

  /* ---------- Mobile nav ---------- */
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('mainNav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? tr('menu_close', '✕ Close') : tr('menu_open', '☰ Menu');
    });
  }

  /* ---------- Render news list ---------- */
  function renderNews() {
    var grid = document.getElementById('newsGrid');
    var featured = document.getElementById('newsFeatured');
    if (!grid) return;
    if (!window.KS) return;

    var active = (document.getElementById('newsFilter') || {}).value || 'All';
    var q = ((document.getElementById('newsSearch') || {}).value || '').toLowerCase();

    var items = KS.news.filter(function (n) {
      var catOk = active === 'All' || n.cat === active;
      var qOk = !q || (n.title + n.dek + n.cat).toLowerCase().indexOf(q) !== -1;
      return catOk && qOk;
    });

    if (featured) {
      var feat = KS.news.filter(function (n) { return n.featured; })[0];
      if (feat && (active === 'All' || active === feat.cat)) {
        featured.innerHTML =
          '<span class="tag">' + tr('cat_' + feat.cat, feat.cat) + '</span>' +
          '<h3>' + feat.title + '</h3>' +
          '<p>' + feat.dek + '</p>' +
          '<div class="meta">' + feat.date + ' · ' + feat.read + ' ' + tr('news_read', 'read') + ' · <span class="sample-chip">' + tr('news_sample', 'Sample story') + '</span></div>' +
          '<a class="btn btn-light" href="news-article.html?id=' + feat.id + '">' + tr('news_read_story', 'Read story →') + '</a>';
      } else {
        featured.innerHTML = '';
      }
    }

    grid.innerHTML = items.map(function (n) {
      return '<article class="news-card">' +
        '<div class="meta"><span class="news-tag">' + tr('cat_' + n.cat, n.cat) + '</span><span>' + n.date + '</span><span>' + n.read + ' ' + tr('news_read', 'read') + '</span></div>' +
        '<h3>' + n.title + '</h3>' +
        '<p>' + n.dek + '</p>' +
        '<a class="more" href="news-article.html?id=' + n.id + '">' + tr('news_read_more', 'Read more →') + '</a>' +
        '</article>';
    }).join('') || '<p style="grid-column:1/-1;color:var(--muted)">' + tr('news_empty', 'No stories match your filter.') + '</p>';
  }

  var filterSel = document.getElementById('newsFilter');
  var searchBox = document.getElementById('newsSearch');
  if (filterSel) filterSel.addEventListener('change', renderNews);
  if (searchBox) searchBox.addEventListener('input', renderNews);
  renderNews();

  /* ---------- Article detail ---------- */
  function renderArticle() {
    var box = document.getElementById('articleBox');
    if (!box) return;
    var id = new URLSearchParams(location.search).get('id');
    var art = (window.KS ? KS.news : []).filter(function (n) { return n.id === id; })[0];
    if (!art) {
      box.innerHTML = '<div class="notice">' + tr('article_not_found', 'Sample article not found.') + ' <a href="news.html">' + tr('article_back_short', 'Back to News & Updates') + '</a></div>';
      return;
    }
    document.title = art.title + tr('article_title_suffix', ' — Krishi Setu (sample)');
    box.innerHTML =
      '<span class="news-tag">' + tr('cat_' + art.cat, art.cat) + '</span> <span class="sample-chip">' + tr('news_sample', 'Sample story') + '</span>' +
      '<h1>' + art.title + '</h1>' +
      '<div class="meta">' + art.date + ' · ' + art.read + ' ' + tr('news_read', 'read') + '</div>' +
      '<p style="font-size:17px;color:var(--ink);font-weight:600">' + art.dek + '</p>' +
      '<div class="article-body">' + art.body.map(function (p) { return '<p>' + p + '</p>'; }).join('') + '</div>' +
      '<p style="margin-top:22px"><a class="btn btn-outline" href="news.html">' + tr('article_back', '← Back to News & Updates') + '</a></p>';
  }
  renderArticle();

  /* ---------- Schemes: category filter + search ---------- */
  function renderSchemes() {
    var grid = document.getElementById('schemesGrid');
    if (!grid) return;
    var active = (document.getElementById('schemeFilter') || {}).value || 'All';
    var q = ((document.getElementById('schemeSearch') || {}).value || '').toLowerCase();

    var list = KS.schemes.filter(function (s) {
      var catOk = active === 'All' || s.cat === active;
      var qOk = !q || (s.name + s.purpose + s.cat).toLowerCase().indexOf(q) !== -1;
      return catOk && qOk;
    });

    grid.innerHTML = list.map(function (s) {
      return '<article class="scheme-card">' +
        '<span class="scheme-cat">' + tr('cat_' + s.cat, s.cat) + '</span>' +
        '<h3>' + s.name + '</h3>' +
        '<p style="margin:0;color:var(--muted);font-size:14.5px"><b>' + tr('schemes_purpose', 'Purpose:') + '</b> ' + s.purpose + '</p>' +
        '<p style="margin:0;color:var(--muted);font-size:14.5px"><b>' + tr('schemes_eligible', 'Eligible:') + '</b> ' + s.eligible + '</p>' +
        '<div><b style="font-size:14px">' + tr('schemes_benefits', 'Key benefits') + '</b><ul>' + s.benefits.map(function (b) { return '<li>' + b + '</li>'; }).join('') + '</ul></div>' +
        '<div class="docs"><b>' + tr('schemes_docs', 'Documents needed:') + '</b> ' + s.documents + '</div>' +
        '<a class="scheme-link" href="' + s.official + '" target="_blank" rel="noopener noreferrer">' + tr('schemes_portal', 'Official portal ↗') + '</a>' +
        '</article>';
    }).join('') || '<p style="grid-column:1/-1;color:var(--muted)">' + tr('schemes_empty', 'No schemes match your filter.') + '</p>';
  }
  var schemeSel = document.getElementById('schemeFilter');
  var schemeSearch = document.getElementById('schemeSearch');
  if (schemeSel) schemeSel.addEventListener('change', renderSchemes);
  if (schemeSearch) schemeSearch.addEventListener('input', renderSchemes);
  renderSchemes();

  /* ---------- Resources: filter + search ---------- */
  function renderResources() {
    var grid = document.getElementById('resourcesGrid');
    if (!grid) return;
    var active = (document.getElementById('resourceFilter') || {}).value || 'All';
    var q = ((document.getElementById('resourceSearch') || {}).value || '').toLowerCase();
    var list = KS.resources.filter(function (r) {
      var catOk = active === 'All' || r.cat === active;
      var qOk = !q || (r.title + r.desc + r.cat).toLowerCase().indexOf(q) !== -1;
      return catOk && qOk;
    });
    grid.innerHTML = list.map(function (r) {
      return '<article class="resource-card">' +
        '<span class="r-icon">' + r.icon + '</span>' +
        '<span class="r-type">' + tr('cat_' + r.cat, r.cat) + ' · ' + tr('type_' + r.type, r.type) + '</span>' +
        '<h3>' + r.title + '</h3>' +
        '<p>' + r.desc + '</p>' +
        '</article>';
    }).join('') || '<p style="grid-column:1/-1;color:var(--muted)">' + tr('res_empty', 'No resources match your filter.') + '</p>';
  }
  var resSel = document.getElementById('resourceFilter');
  var resSearch = document.getElementById('resourceSearch');
  if (resSel) resSel.addEventListener('change', renderResources);
  if (resSearch) resSearch.addEventListener('input', renderResources);
  renderResources();

  /* ---------- Steps (home hero + how-it-works) ---------- */
  function renderSteps() {
    var home = document.getElementById('homeSteps');
    if (home && window.KS) {
      home.innerHTML = KS.steps.map(function (s) {
        return '<div class="step-card"><div class="step-num">' + s.n + ' · ' + s.icon + '</div><h3>' + s.title + '</h3><p>' + s.text + '</p></div>';
      }).join('');
    }
    var grid = document.getElementById('stepsGrid');
    if (grid && window.KS) {
      grid.innerHTML = KS.steps.map(function (s) {
        return '<div class="step-card"><div class="step-num">' + tr('steps_label', 'Step') + ' ' + s.n + '</div><h3>' + s.icon + ' ' + s.title + '</h3><p>' + s.text + '</p></div>';
      }).join('');
    }
  }
  renderSteps();

  /* ---------- Home resource preview (first 4) ---------- */
  function renderHomeResources() {
    var res = document.getElementById('homeResources');
    if (!res || !window.KS) return;
    res.innerHTML = KS.resources.slice(0, 4).map(function (r) {
      return '<div class="resource-card"><span class="r-icon">' + r.icon + '</span><span class="r-type">' + tr('cat_' + r.cat, r.cat) + '</span><h3>' + r.title + '</h3><p>' + r.desc + '</p></div>';
    }).join('');
  }
  renderHomeResources();

  /* ---------- Market price ticker (home only) ----------
     Demo reference prices from the shared KS.marketTicker layer
     (same offline/reference values the dashboard shows). Renders
     two identical lists inside one animated track: the CSS loops
     translateX(-50%) for a seamless marquee, and the second list
     is aria-hidden so screen readers only hear the items once. */
  function renderTicker() {
    var track = document.getElementById('tickerTrack');
    if (!track || !window.KS) return;
    var items = KS.marketTicker || [];
    if (!items.length) {
      track.innerHTML = '<div class="ticker-list"><div class="ticker-item ticker-fallback">' +
        tr('ticker_unavailable', 'Market prices temporarily unavailable') + '</div></div>';
      return;
    }
    var html = items.map(function (m) {
      var down = m.dir === 'down';
      var arrow = down ? '↓' : '↑';
      var sign = down ? '-' : '+';
      var chgLabel = sign + m.pct.toFixed(1) + '% ' + tr(down ? 'ticker_down' : 'ticker_up', down ? 'down' : 'up');
      return '<div class="ticker-item">' +
        '<span class="ticker-emoji" aria-hidden="true">' + m.emoji + '</span>' +
        '<b>' + tr('crop_' + m.crop, m.crop) + '</b>' +
        '<span class="ticker-sub">' + tr('state_' + m.state, m.state) + ' · ' + m.market + '</span>' +
        '<span class="ticker-price">₹' + m.price.toLocaleString('en-IN') + '<small>' + tr('ticker_qtl', '/qtl') + '</small></span>' +
        '<span class="ticker-chg ' + (down ? 'down' : 'up') + '" aria-label="' + chgLabel + '">' + arrow + ' ' + sign + m.pct.toFixed(1) + '%</span>' +
        '</div>';
    }).join('');
    track.innerHTML =
      '<div class="ticker-list">' + html + '</div>' +
      '<div class="ticker-list" aria-hidden="true">' + html + '</div>';
  }

  /* ---------- Support FAQs ---------- */
  function renderFaqs() {
    var list = document.getElementById('faqList');
    if (!list || !window.KS) return;
    list.innerHTML = KS.faqs.map(function (f) {
      return '<details><summary>' + f.q + '</summary><div class="faq-a">' + f.a + '</div></details>';
    }).join('');
  }
  renderFaqs();

  /* ---------- Contact form (demo) ---------- */
  var form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = document.getElementById('formSuccess');
      if (ok) ok.style.display = 'block';
      form.reset();
    });
  }

  /* Expose renderers so js/i18n.js can re-render in the selected language */
  window.KS_RENDER = {
    news: renderNews,
    article: renderArticle,
    schemes: renderSchemes,
    resources: renderResources,
    steps: renderSteps,
    homeResources: renderHomeResources,
    faqs: renderFaqs,
    ticker: renderTicker
  };
  renderTicker();
})();

/* ============================================================
   GLOBAL: toggleTheme — called from the button onclick.
   Reads current theme, flips it, saves to localStorage, applies
   to <html data-theme>, and syncs the button label.
   ============================================================ */
function toggleTheme() {
  var current = document.documentElement.getAttribute('data-theme') || 'light';
  var next = (current === 'dark') ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('ks_gov_theme', next); } catch(e) {}
  /* sync button label — works on all pages sharing this script */
  var btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  if (next === 'dark') {
    btn.textContent = '☀️ Light';
    btn.setAttribute('aria-label', 'Switch to light mode');
    btn.setAttribute('title', 'Switch to light mode');
  } else {
    btn.textContent = '🌙 Dark';
    btn.setAttribute('aria-label', 'Switch to dark mode');
    btn.setAttribute('title', 'Switch to dark mode');
  }
}