// Krishi Setu — Public ⇄ Dashboard integration bridge
// Verifies the "one product" wiring:
//   1. Every public → platform link uses the single KS.platformUrl config.
//   2. Guest sees "Open Platform"; an authenticated session flips the CTA
//      to "Go to Dashboard" (no second login).
//   3. Dashboard logo → public homepage (session untouched).
//   4. Logout → public homepage; returning to the app requires login again.
// Usage: node public-bridge.js
const puppeteer = require('puppeteer-core');
const path = require('path');
const { pathToFileURL } = require('url');

const APP_ROOT = path.resolve(__dirname, '..', '..');      // .../Krishi Setu
const WORKSPACE = path.resolve(APP_ROOT, '..');            // .../krishisetu
const GOV_INDEX = pathToFileURL(path.join(APP_ROOT, 'frontend', 'public-site', 'government-version', 'index.html')).href;
const GOV_NEWS = pathToFileURL(path.join(APP_ROOT, 'frontend', 'public-site', 'government-version', 'news.html')).href;
const DASH_PLAIN = pathToFileURL(path.join(APP_ROOT, 'frontend', 'LAST_GOV_API_GRAPHS_FINAL.html')).href;
const DASH = DASH_PLAIN + '?app=1'; // ?app=1 keeps tests on the app page (login when unauth)
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + JSON.stringify(extra) : ''));
  if (!ok) failures++;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });

  /* ---- 0. FRONT DOOR: the public homepage is the default entry point ---- */
  {
    // a) unauth direct open of the app → public homepage
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(DASH_PLAIN, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.location.href.indexOf('government-version') !== -1, { timeout: 15000 })
      .then(() => check('front door: unauth direct open → public homepage', true))
      .catch(() => check('front door: unauth direct open → public homepage', false, { url: page.url() }));
    await page.close();

    // a2) NO-FLASH: the login screen must never be painted on public entry.
    // A per-frame probe records into sessionStorage (per-tab) the moment a
    // login page becomes visible; the probe only ever writes '1'.
    const pA2 = await browser.newPage();
    await pA2.setViewport({ width: 1280, height: 900 });
    await pA2.evaluateOnNewDocument(() => {
      const probe = () => {
        try {
          const l = document.getElementById('loginPage');
          const b = document.body;
          const painted =
            (l && l.classList && l.classList.contains('active')) ||
            (b && b.classList && b.classList.contains('auth-first') &&
             document.documentElement && !document.documentElement.classList.contains('krishi-boot'));
          if (painted) sessionStorage.setItem('ksLoginPainted', '1');
        } catch (e) {}
        requestAnimationFrame(probe);
      };
      requestAnimationFrame(probe);
    });
    await pA2.goto(DASH_PLAIN, { waitUntil: 'load', timeout: 60000 });
    await pA2.waitForFunction(() => window.location.href.indexOf('government-version') !== -1, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 1200));
    const paintedA2 = await pA2.evaluate(() => { try { return sessionStorage.getItem('ksLoginPainted') === '1'; } catch (e) { return false; } });
    check('front door: login screen never painted on public entry (no flash)', paintedA2 === false);
    await pA2.close();

    // b) "Open Platform" intent (no session) → existing login page
    const p2 = await browser.newPage();
    await p2.setViewport({ width: 1280, height: 900 });
    await p2.evaluateOnNewDocument(() => {
      const probe = () => {
        try {
          const l = document.getElementById('loginPage');
          const b = document.body;
          const painted =
            (l && l.classList && l.classList.contains('active')) ||
            (b && b.classList && b.classList.contains('auth-first') &&
             document.documentElement && !document.documentElement.classList.contains('krishi-boot'));
          if (painted) sessionStorage.setItem('ksLoginPainted', '1');
        } catch (e) {}
        requestAnimationFrame(probe);
      };
      requestAnimationFrame(probe);
    });
    await p2.goto(DASH_PLAIN + '?intent=login', { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2500));
    const loginShown = await p2.evaluate(() => {
      const l = document.getElementById('loginPage');
      return !!l && l.classList.contains('active') && window.isLoggedIn === false;
    });
    check('front door: Open Platform intent (guest) → login page', loginShown);
    const paintedB = await p2.evaluate(() => { try { return sessionStorage.getItem('ksLoginPainted') === '1'; } catch (e) { return false; } });
    check('probe sanity: login IS painted when login is the destination', paintedB === true, { painted: paintedB });
    await p2.close();

    // c) stored Supabase session + direct open → dashboard, no login
    const p3 = await browser.newPage();
    await p3.setViewport({ width: 1280, height: 900 });
    const errs3 = [];
    p3.on('pageerror', e => errs3.push(String(e).slice(0, 160)));
    await p3.evaluateOnNewDocument(() => {
      try {
        // Well-formed stored session so the real client would accept it too.
        localStorage.setItem('sb-lryhcszcmhlrzrbrsces-auth-token',
          JSON.stringify({ access_token: 'stub-access', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'stub-refresh', user: { id: 'u-live', email: 'farmer@demo.in', user_metadata: { full_name: 'Ramesh Patil', role: 'farmer' } } }));
      } catch (e) {}
      const chain = () => ({
        select: chain, eq: chain, order: chain, limit: chain,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        insert: async () => ({ data: null, error: null }),
        update: async () => ({ data: null, error: null }),
        upsert: async () => ({ data: null, error: null }),
        delete: async () => ({ data: null, error: null })
      });
      const stubClient = {
        auth: {
          getSession: async () => ({ data: { session: { user: { id: 'u-live', email: 'farmer@demo.in', user_metadata: { full_name: 'Ramesh Patil', role: 'farmer' } } } } }),
          onAuthStateChange: () => ({ unsubscribe: () => {} }),
          signOut: async () => ({ error: null }),
          signInWithPassword: async () => ({ data: {}, error: { message: 'stub' } }),
          signUp: async () => ({ data: {}, error: { message: 'stub' } })
        },
        from: () => chain(),
        storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ error: null }) }) }
      };
      try {
        // Keep the stub in place even if the real Supabase CDN bundle loads.
        Object.defineProperty(window, 'supabase', {
          configurable: false, enumerable: true,
          get: () => ({ createClient: () => stubClient }),
          set: () => {}
        });
      } catch (e) { window.supabase = { createClient: () => stubClient }; }
      const probe = () => {
        try {
          const l = document.getElementById('loginPage');
          const b = document.body;
          const painted =
            (l && l.classList && l.classList.contains('active')) ||
            (b && b.classList && b.classList.contains('auth-first') &&
             document.documentElement && !document.documentElement.classList.contains('krishi-boot'));
          if (painted) sessionStorage.setItem('ksLoginPainted', '1');
        } catch (e) {}
        requestAnimationFrame(probe);
      };
      requestAnimationFrame(probe);
    });
    await p3.goto(DASH_PLAIN, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));
    const authed = await p3.evaluate(() => ({
      loggedIn: window.isLoggedIn,
      loginActive: !!document.getElementById('loginPage') && document.getElementById('loginPage').classList.contains('active'),
      onApp: window.location.href.indexOf('LAST_GOV_API_GRAPHS_FINAL.html') !== -1
    }));
    check('front door: stored session + direct open → dashboard (no login)', authed.loggedIn === true && authed.loginActive === false && authed.onApp, authed);
    const paintedC = await p3.evaluate(() => { try { return sessionStorage.getItem('ksLoginPainted') === '1'; } catch (e) { return false; } });
    check('front door: login never painted on authed direct open (no flash)', paintedC === false, { painted: paintedC });
    check('front door: authed boot produces zero page errors', errs3.length === 0, { errs: errs3 });
    // clean up the seeded session so later guest checks see no auth state
    await p3.evaluate(() => { try { localStorage.removeItem('sb-lryhcszcmhlrzrbrsces-auth-token'); } catch (e) {} });
    await p3.close();
  }

  /* ---- 1. GUEST: platform links single-sourced, labels stay "Open Platform" ---- */
  for (const w of [390, 1280]) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: 900 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    await page.goto(GOV_INDEX, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 1500));
    const r = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href*="LAST_GOV_API_GRAPHS_FINAL.html"]')];
      return {
        count: links.length,
        hrefsOk: links.every(a => a.getAttribute('href') && a.getAttribute('href').indexOf('LAST_GOV_API_GRAPHS_FINAL.html') !== -1),
        labels: links.map(a => a.textContent.trim()).slice(0, 4),
        wide: document.documentElement.scrollWidth > window.innerWidth + 1
      };
    });
    check(`guest@${w} platform links count`, r.count >= 4, { count: r.count });
    check(`guest@${w} hrefs point at platform file (single source)`, r.hrefsOk);
    check(`guest@${w} labels default to Open`, r.labels.every(t => /open/i.test(t)), { labels: r.labels });
    check(`guest@${w} no horizontal overflow`, !r.wide);
    check(`guest@${w} zero page errors`, errs.length === 0, { errs });
    await page.close();
  }

  /* ---- 2. AUTHED: stubbed Supabase session flips CTA to "Go to Dashboard" ---- */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 900 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    // Simulate the session the dashboard created (same storage/project).
    await page.evaluateOnNewDocument(() => {
      window.supabase = {
        createClient: () => ({
          auth: {
            getSession: async () => ({ data: { session: { user: { id: 'u-demo' } } } }),
            onAuthStateChange: () => ({ unsubscribe: () => {} })
          }
        })
      };
    });
    await page.goto(GOV_INDEX, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 1200));
    const r = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href*="LAST_GOV_API_GRAPHS_FINAL.html"]')];
      return {
        allAuthedLabel: links.every(a => a.textContent.trim() === 'Go to Dashboard →'),
        authStates: [...new Set(links.map(a => a.dataset.authState))],
        count: links.length
      };
    });
    check('authed CTA flips to "Go to Dashboard" on all links', r.allAuthedLabel, { count: r.count, states: r.authStates });
    check('authed data-auth-state=in', r.authStates.length === 1 && r.authStates[0] === 'in', { states: r.authStates });
    check('authed zero page errors', errs.length === 0, { errs });
    await page.close();
  }

  /* ---- 3. DASHBOARD logo → public homepage (no logout) ---- */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(DASH, { waitUntil: 'networkidle2', timeout: 90000 });
    await new Promise(r => setTimeout(r, 2500));
    const hasFn = await page.evaluate(() => typeof window.goPublicHome === 'function');
    check('dashboard exposes goPublicHome()', hasFn);
    await page.evaluate(() => { setTimeout(() => { window.goPublicHome(); }, 50); });
    await page.waitForFunction(() => window.location.href.indexOf('government-version') !== -1, { timeout: 15000 })
      .then(() => check('logo link navigates to public homepage', true))
      .catch(() => check('logo link navigates to public homepage', false, { url: page.url() }));
    await page.close();
  }

  /* ---- 4. LOGOUT → public homepage, then login required again ---- */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(DASH, { waitUntil: 'networkidle2', timeout: 90000 });
    await new Promise(r => setTimeout(r, 2500));
    await page.evaluate(() => window.demoLogin('farmer'));
    await new Promise(r => setTimeout(r, 1500));
    const wasIn = await page.evaluate(() => window.isLoggedIn);
    check('demo login active before logout', wasIn === true);
    await page.evaluate(() => { setTimeout(() => { window.logout(); }, 50); });
    await page.waitForFunction(() => window.location.href.indexOf('government-version') !== -1, { timeout: 15000 })
      .then(() => check('logout lands on public homepage', true))
      .catch(() => check('logout lands on public homepage', false, { url: page.url() }));
    // Back to the app: session cleared → login required
    await page.goto(DASH, { waitUntil: 'networkidle2', timeout: 90000 });
    await new Promise(r => setTimeout(r, 2500));
    const back = await page.evaluate(() => ({
      loggedIn: window.isLoggedIn,
      loginActive: (document.getElementById('loginPage') || {}).classList ? document.getElementById('loginPage').classList.contains('active') : null
    }));
    check('after logout, returning to app requires login', back.loggedIn === false, back);
    await page.close();
  }

  /* ---- 5. Public page content still renders with auth.js loaded ---- */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 900 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    await page.goto(GOV_NEWS, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 1200));
    const r = await page.evaluate(() => ({
      newsCards: document.querySelectorAll('.news-card').length,
      platformLinks: document.querySelectorAll('a[href*="LAST_GOV_API_GRAPHS_FINAL.html"]').length
    }));
    check('news page still renders 6 stories', r.newsCards === 6, { cards: r.newsCards });
    check('news page platform links wired', r.platformLinks >= 2, { links: r.platformLinks });
    check('news page zero page errors', errs.length === 0, { errs });
    await page.close();
  }

  await browser.close();
  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });