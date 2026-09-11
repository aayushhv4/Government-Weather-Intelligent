/* ============================================================
   KRISHI SETU — PREMIUM SITE (Version 2) interactions
   Theme, mobile menu, scroll reveals, counters, filters,
   article rendering, demo form. Motion-safe (reduced motion).
   ============================================================ */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Theme (light/dark, persisted, system-aware) ---------- */
  var root = document.documentElement;
  function applyTheme(t) {
    root.classList.toggle('dark', t === 'dark');
    var b = document.getElementById('themeBtn');
    if (b) b.textContent = t === 'dark' ? '☀️' : '🌙';
  }
  var saved = null;
  try { saved = localStorage.getItem('ks_theme'); } catch (e) {}
  // Same rule as the dashboard: only honor an explicit saved value. For a
  // first-time visitor the product's intended default is LIGHT, not the OS
  // preference.
  applyTheme(saved || 'light');
  var themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = root.classList.contains('dark') ? 'light' : 'dark';
      try { localStorage.setItem('ks_theme', next); } catch (e) {}
      applyTheme(next);
    });
  }

  /* ---------- Mobile menu ---------- */
  var burger = document.getElementById('navBurger');
  var mm = document.getElementById('mobileMenu');
  var mmClose = document.getElementById('mmClose');
  function closeMenu() { if (mm) mm.classList.remove('open'); }
  if (burger && mm) {
    burger.addEventListener('click', function () { mm.classList.add('open'); });
    if (mmClose) mmClose.addEventListener('click', closeMenu);
    mm.addEventListener('click', function (e) { if (e.target.tagName === 'A') closeMenu(); });
  }

  /* ---------- Scroll reveal ---------- */
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll('[data-reveal]').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('[data-reveal]').forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- Animated counters ---------- */
  function animateCount(el) {
    var target = parseFloat(el.getAttribute('data-count')) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    var dur = 1400, start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = Math.round(target * eased);
      el.textContent = val.toLocaleString('en-IN') + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  document.querySelectorAll('[data-count]').forEach(function (el) {
    if (reduce) { el.textContent = (parseFloat(el.getAttribute('data-count')) || 0).toLocaleString('en-IN') + (el.getAttribute('data-suffix') || ''); return; }
    if ('IntersectionObserver' in window) {
      var io2 = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { animateCount(el); io2.unobserve(el); } });
      }, { threshold: 0.4 });
      io2.observe(el);
    } else animateCount(el);
  });

  /* ---------- News: filter + search + list render ---------- */
  function renderNews() {
    var grid = document.getElementById('newsGrid');
    if (!grid || !window.KS) return;
    var active = (document.querySelector('.filter-pills .filter-pill.active') || {}).getAttribute ? document.querySelector('.filter-pills .filter-pill.active').getAttribute('data-filter') : 'All';
    var q = ((document.getElementById('newsSearch') || {}).value || '').toLowerCase();
    var items = KS.news.filter(function (n) {
      var catOk = active === 'All' || n.cat === active;
      var qOk = !q || (n.title + n.dek + n.cat).toLowerCase().indexOf(q) !== -1;
      return catOk && qOk;
    });
    grid.innerHTML = items.map(function (n) {
      return '<article class="news-card" data-reveal>' +
        '<div class="nc-visual" aria-hidden="true">' + (n.featured ? '🌾' : n.cat === 'Market' ? '📊' : n.cat === 'Schemes' ? '🏛️' : n.cat === 'Farmer Stories' ? '👨‍🌾' : '🚀') + '</div>' +
        '<div class="nc-body">' +
        '<div class="news-meta"><span class="pill-badge">' + n.cat + '</span><span>' + n.date + '</span><span class="sample-chip">Sample</span></div>' +
        '<h3>' + n.title + '</h3><p>' + n.dek + '</p>' +
        '<a class="more" href="news-article.html?id=' + n.id + '">Read story →</a>' +
        '</div></article>';
    }).join('') || '<p style="grid-column:1/-1;color:var(--ink-2)">No stories match your filter.</p>';
    if (!reduce && 'IntersectionObserver' in window) {
      var io3 = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io3.unobserve(e.target); } }); }, { threshold: 0.1 });
      grid.querySelectorAll('[data-reveal]').forEach(function (el) { io3.observe(el); });
    }
  }
  document.querySelectorAll('.filter-pills .filter-pill').forEach(function (p) {
    p.addEventListener('click', function () {
      document.querySelectorAll('.filter-pills .filter-pill').forEach(function (x) { x.classList.remove('active'); });
      p.classList.add('active');
      renderNews();
    });
  });
  var newsSearch = document.getElementById('newsSearch');
  if (newsSearch) newsSearch.addEventListener('input', renderNews);
  renderNews();

  /* Featured news (home + news pages) */
  function renderFeatured() {
    var box = document.getElementById('newsFeatured');
    if (!box || !window.KS) return;
    var feat = KS.news.filter(function (n) { return n.featured; })[0];
    if (!feat) return;
    box.innerHTML = '<div class="news-f-visual" aria-hidden="true">🌾</div>' +
      '<div class="news-f-body">' +
      '<span class="sample-chip" style="align-self:flex-start">Sample story</span>' +
      '<h3>' + feat.title + '</h3>' +
      '<p>' + feat.dek + '</p>' +
      '<div class="news-meta">' + feat.cat + ' · ' + feat.date + ' · ' + feat.read + ' read</div>' +
      '<a class="btn btn-primary" style="align-self:flex-start" href="news-article.html?id=' + feat.id + '">Read the story</a>' +
      '</div>';
  }
  renderFeatured();

  /* ---------- Article detail ---------- */
  function renderArticle() {
    var box = document.getElementById('articleBox');
    if (!box) return;
    var id = new URLSearchParams(location.search).get('id');
    var art = (window.KS ? KS.news : []).filter(function (n) { return n.id === id; })[0];
    if (!art) {
      box.innerHTML = '<div class="notice">Sample article not found. <a href="news.html">Back to News</a></div>';
      return;
    }
    document.title = art.title + ' — Krishi Setu (sample)';
    box.innerHTML =
      '<div class="news-meta"><span class="pill-badge">' + art.cat + '</span><span>' + art.date + '</span><span>' + art.read + ' read</span><span class="sample-chip">Sample story</span></div>' +
      '<h1>' + art.title + '</h1>' +
      '<p class="dek">' + art.dek + '</p>' +
      '<div class="body">' + art.body.map(function (p) { return '<p>' + p + '</p>'; }).join('') + '</div>' +
      '<p style="margin-top:24px"><a class="btn btn-ghost" href="news.html">← Back to News</a></p>';
  }
  renderArticle();

  /* ---------- Schemes: filter + search + cards ---------- */
  function renderSchemes() {
    var grid = document.getElementById('schemesGrid');
    if (!grid || !window.KS) return;
    var activeEl = document.querySelector('.filter-pills .filter-pill.active');
    var active = activeEl ? (activeEl.getAttribute('data-scheme-filter') || 'All') : 'All';
    var q = ((document.getElementById('schemeSearch') || {}).value || '').toLowerCase();
    var list = KS.schemes.filter(function (s) {
      var catOk = active === 'All' || s.cat === active;
      var qOk = !q || (s.name + s.purpose + s.cat).toLowerCase().indexOf(q) !== -1;
      return catOk && qOk;
    });
    grid.innerHTML = list.map(function (s) {
      return '<details class="scheme-expand" data-reveal>' +
        '<summary><span>' + s.name + '</span></summary>' +
        '<div class="sc-body">' +
        '<span class="scheme-cat-chip">' + s.cat + '</span>' +
        '<p style="margin:0"><b>Purpose:</b> ' + s.purpose + '</p>' +
        '<p style="margin:0"><b>Eligible:</b> ' + s.eligible + '</p>' +
        '<div><b>Key benefits</b><ul>' + s.benefits.map(function (b) { return '<li>' + b + '</li>'; }).join('') + '</ul></div>' +
        '<div class="docs"><b>Documents:</b> ' + s.documents + '</div>' +
        '<a class="scheme-link" href="' + s.official + '" target="_blank" rel="noopener noreferrer">Official portal ↗</a>' +
        '</div></details>';
    }).join('') || '<p style="grid-column:1/-1;color:var(--ink-2)">No schemes match your filter.</p>';
  }
  document.querySelectorAll('[data-scheme-filter]').forEach(function (p) {
    p.addEventListener('click', function () {
      document.querySelectorAll('[data-scheme-filter]').forEach(function (x) { x.classList.remove('active'); });
      p.classList.add('active');
      renderSchemes();
    });
  });
  var schemeSearch = document.getElementById('schemeSearch');
  if (schemeSearch) schemeSearch.addEventListener('input', renderSchemes);
  renderSchemes();

  /* ---------- Resources: filter + search ---------- */
  function renderResources() {
    var grid = document.getElementById('resourcesGrid');
    if (!grid || !window.KS) return;
    var activeEl = document.querySelector('.filter-pills .filter-pill.active');
    var active = activeEl ? (activeEl.getAttribute('data-resource-filter') || 'All') : 'All';
    var q = ((document.getElementById('resourceSearch') || {}).value || '').toLowerCase();
    var list = KS.resources.filter(function (r) {
      var catOk = active === 'All' || r.cat === active;
      var qOk = !q || (r.title + r.desc + r.cat).toLowerCase().indexOf(q) !== -1;
      return catOk && qOk;
    });
    grid.innerHTML = list.map(function (r) {
      return '<article class="resource-card" data-reveal>' +
        '<span class="r-icon">' + r.icon + '</span>' +
        '<span class="r-type">' + r.cat + ' · ' + r.type + '</span>' +
        '<h3>' + r.title + '</h3><p>' + r.desc + '</p></article>';
    }).join('') || '<p style="grid-column:1/-1;color:var(--ink-2)">No resources match your filter.</p>';
  }
  document.querySelectorAll('[data-resource-filter]').forEach(function (p) {
    p.addEventListener('click', function () {
      document.querySelectorAll('[data-resource-filter]').forEach(function (x) { x.classList.remove('active'); });
      p.classList.add('active');
      renderResources();
    });
  });
  var resSearch = document.getElementById('resourceSearch');
  if (resSearch) resSearch.addEventListener('input', renderResources);
  renderResources();

  /* ---------- Steps / FAQ / counters generic fill ---------- */
  function fillSteps() {
    var grid = document.getElementById('stepsGrid');
    if (grid && window.KS) {
      grid.innerHTML = KS.steps.map(function (s, i) {
        return '<div class="card" data-reveal data-delay="' + (i % 4) + '"><span class="card-num">' + s.n + '</span><span class="big-icon">' + s.icon + '</span><h3>' + s.title + '</h3><p>' + s.text + '</p></div>';
      }).join('');
    }
  }
  function fillFaq() {
    var list = document.getElementById('faqList');
    if (list && window.KS) {
      list.innerHTML = KS.faqs.map(function (f) {
        return '<details><summary>' + f.q + '</summary><div class="faq-a">' + f.a + '</div></details>';
      }).join('');
    }
  }
  fillSteps();
  fillFaq();

  /* ---------- Contact form (demo) ---------- */
  var form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      document.getElementById('formSuccess').style.display = 'block';
      form.reset();
    });
  }

  /* ---------- Homepage fillers ---------- */
  var homeSteps = document.getElementById('homeSteps');
  if (homeSteps && window.KS) {
    homeSteps.innerHTML = KS.steps.map(function (s, i) {
      return '<div class="card" data-reveal data-delay="' + (i % 4) + '"><span class="card-num">' + s.n + '</span><span class="big-icon">' + s.icon + '</span><h3>' + s.title + '</h3><p>' + s.text + '</p></div>';
    }).join('');
  }
  var homeRes = document.getElementById('homeResources');
  if (homeRes && window.KS) {
    homeRes.innerHTML = KS.resources.slice(0, 4).map(function (r, i) {
      return '<article class="resource-card" data-reveal data-delay="' + i + '"><span class="r-icon">' + r.icon + '</span><span class="r-type">' + r.cat + '</span><h3>' + r.title + '</h3><p>' + r.desc + '</p></article>';
    }).join('');
  }
  var homeCounters = document.getElementById('homeCounters');
  if (homeCounters && window.KS) {
    homeCounters.innerHTML = KS.stats.map(function (s, i) {
      return '<div class="counter" data-reveal data-delay="' + (i % 4) + '"><b data-count="' + s.value + '" data-suffix="' + s.suffix + '">0</b><span>' + s.label + '</span></div>';
    }).join('');
    document.querySelectorAll('[data-count]').forEach(function (el) {
      if (reduce) { el.textContent = (parseFloat(el.getAttribute('data-count')) || 0).toLocaleString('en-IN') + (el.getAttribute('data-suffix') || ''); return; }
      if ('IntersectionObserver' in window) {
        var io4 = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { animateCount(el); io4.unobserve(el); } }); }, { threshold: 0.4 });
        io4.observe(el);
      } else animateCount(el);
    });
  }
  var impactCounters = document.getElementById('impactCounters');
  if (impactCounters && window.KS) {
    impactCounters.innerHTML = KS.stats.map(function (s, i) {
      return '<div class="counter" data-reveal data-delay="' + (i % 4) + '"><b data-count="' + s.value + '" data-suffix="' + s.suffix + '">0</b><span>' + s.label + '</span></div>';
    }).join('');
    document.querySelectorAll('[data-count]').forEach(function (el) {
      if (reduce) { el.textContent = (parseFloat(el.getAttribute('data-count')) || 0).toLocaleString('en-IN') + (el.getAttribute('data-suffix') || ''); return; }
      if ('IntersectionObserver' in window) {
        var io5 = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { animateCount(el); io5.unobserve(el); } }); }, { threshold: 0.4 });
        io5.observe(el);
      } else animateCount(el);
    });
  }

  /* ---------- Platform links: keep the login intent ----------
     Guests clicking "Open Platform" land on the existing login
     screen (authenticated users skip it automatically). */
  document.querySelectorAll('a[href*="LAST_GOV_API_GRAPHS_FINAL.html"]').forEach(function (a) {
    var h = a.getAttribute('href');
    if (h && h.indexOf('?') === -1) a.href = h + '?intent=login';
  });
})();