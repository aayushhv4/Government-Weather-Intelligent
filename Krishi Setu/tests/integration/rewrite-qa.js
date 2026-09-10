// Krishi Setu — Deployment QA against a Vercel-rewrite-equivalent server
//
// Emulates Vercel static-deploy behavior (vercel.json rewrites applied in
// order, first match wins, query preserved, static-file fallback, 404) and
// validates every final URL mapping + real browser rendering.
//
// Usage:  node tests/integration/rewrite-qa.js
const sim = require('../vercel-sim.js');
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let failures = 0;
let warnings = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
  if (!ok) failures++;
}
function warn(name, extra) {
  console.log('WARN ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
  warnings++;
}

function getOnce(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => resolve({
        status: res.statusCode,
        type: res.headers['content-type'] || '',
        body,
        location: res.headers['location'] || '',
        finalUrl: res.url || url,
      }));
    }).on('error', reject);
  });
}

// follow redirects like a browser (up to 5 hops)
async function get(url) {
  let cur = url;
  for (let hop = 0; hop < 5; hop++) {
    const r = await getOnce(cur);
    if (r.status >= 300 && r.status < 400 && r.location) {
      cur = new URL(r.location, cur).href;
      continue;
    }
    return r;
  }
  throw new Error('too many redirects');
}

const REL_REF = /(?:href|src)="([^"]+)"/g;
function isExternal(ref) {
  // skip JS template literals (${...}) — not real asset references
  return /^(https?:|data:|mailto:|tel:|javascript:|#)/i.test(ref) || ref === '' || ref.indexOf('${') !== -1;
}

// ---------------------------------------------------------------- HTTP mapping
async function httpMappingTests(BASE) {
  console.log('\n=== A. Final URL mapping (HTTP through Vercel rewrite semantics) ===');
  const cases = [
    // [url, expectedStatus, expectedTypeContains, contentMarker, label]
    ['/', 200, 'text/html', 'Farm. Connect. Prosper', 'root → Government homepage'],
    ['/index.html', 200, 'text/html', 'Farm. Connect. Prosper', '/index.html → gov homepage'],
    ['/about.html', 200, 'text/html', 'Krishi Setu', '/about.html'],
    ['/how-it-works.html', 200, 'text/html', 'Krishi Setu', '/how-it-works.html'],
    ['/schemes.html', 200, 'text/html', 'Krishi Setu', '/schemes.html'],
    ['/news.html', 200, 'text/html', 'Krishi Setu', '/news.html'],
    ['/news-article.html?id=news1', 200, 'text/html', 'Krishi Setu', '/news-article.html?id=news1'],
    ['/resources.html', 200, 'text/html', 'Krishi Setu', '/resources.html'],
    ['/impact.html', 200, 'text/html', 'Krishi Setu', '/impact.html'],
    ['/support.html', 200, 'text/html', 'Krishi Setu', '/support.html'],
    ['/contact.html', 200, 'text/html', 'Krishi Setu', '/contact.html'],
    ['/css/styles.css', 200, 'text/css', '--green', '/css/styles.css (gov stylesheet)'],
    ['/js/data.js', 200, 'javascript', 'KS', '/js/data.js'],
    ['/js/main.js', 200, 'javascript', '', '/js/main.js'],
    ['/js/i18n.js', 200, 'javascript', '', '/js/i18n.js'],
    ['/js/auth.js', 200, 'javascript', '', '/js/auth.js'],
    ['/platform', 200, 'text/html', 'loginPage', '/platform → dashboard'],
    ['/platform/', 200, 'text/html', 'loginPage', '/platform/ → dashboard (trailing slash)'],
    ['/platform/?intent=login', 200, 'text/html', 'loginPage', '/platform/?intent=login → dashboard'],
    ['/platform/dashboard', 200, 'text/html', 'loginPage', '/platform/<deep> → dashboard (SPA fallback)'],
    ['/platform/whatsapp-beta', 307, '', '', '/platform/whatsapp-beta → redirects to index.html (fixes relative assets)', '/index.html'],
    ['/platform/whatsapp-beta/index.html', 200, 'text/html', 'whatsapp', '/platform/whatsapp-beta/index.html → WhatsApp Beta'],
    ['/platform/whatsapp-beta/js/whatsapp-demo.js', 200, 'javascript', '', '/platform/whatsapp-beta assets (precedence over /platform/:path*)'],
    ['/whatsapp-beta', 307, '', '', '/whatsapp-beta → redirects to index.html (fixes relative assets)', '/index.html'],
    ['/whatsapp-beta/index.html', 200, 'text/html', 'whatsapp', '/whatsapp-beta/index.html → WhatsApp Beta'],
    ['/whatsapp-beta/', 200, 'text/html', 'whatsapp', '/whatsapp-beta/'],
    ['/whatsapp-beta/css/whatsapp-demo.css', 200, 'text/css', '', '/whatsapp-beta/css/whatsapp-demo.css'],
    ['/whatsapp-beta/js/whatsapp-demo.js', 200, 'javascript', '', '/whatsapp-beta/js/whatsapp-demo.js'],
    ['/LAST_GOV_API_GRAPHS_FINAL.html', 200, 'text/html', 'loginPage', '/LAST_GOV_API_GRAPHS_FINAL.html (gov footer platform link)'],
    ['/public-site/government-version/index.html', 200, 'text/html', 'Farm. Connect. Prosper', 'guard redirect target from /platform (guest home bounce)'],
    ['/public-site/government-version/about.html', 200, 'text/html', 'Krishi Setu', 'guard redirect target subpage'],
    ['/public-site/government-version/css/styles.css', 200, 'text/css', '--green', 'gov stylesheet at /public-site base'],
    ['/public-site/government-version/js/main.js', 200, 'javascript', '', 'gov js at /public-site base'],
    ['/platform/public-site/government-version/index.html', 200, 'text/html', 'Farm. Connect. Prosper', 'guard redirect target from /platform/ (NOT the dashboard)'],
    ['/platform/public-site/government-version/css/styles.css', 200, 'text/css', '--green', 'gov stylesheet under /platform/ base'],
    ['/public-site/LAST_GOV_API_GRAPHS_FINAL.html', 200, 'text/html', 'loginPage', 'gov raw platform link at /public-site base'],
    ['/frontend/public-site/government-version/index.html', 200, 'text/html', 'Farm. Connect. Prosper', 'direct static gov path'],
    ['/frontend/LAST_GOV_API_GRAPHS_FINAL.html', 200, 'text/html', 'loginPage', 'direct static dashboard path'],
    ['/frontend/whatsapp-beta/index.html', 200, 'text/html', 'whatsapp', 'direct static whatsapp path'],
    ['/no-such-page.html', 404, '', '', 'unknown root path → 404 (no catch-all)', undefined],
    ['/api/anything', 404, '', '', '/api/* → 404 (no API interception)'],
  ];
  for (const [url, status, type, marker, label, expectLocation] of cases) {
    try {
      if (expectLocation) {
        // redirect case: assert 307 + Location, then follow to the final page
        const r0 = await getOnce(BASE + url);
        const okRedir = r0.status === status && r0.location.endsWith(expectLocation);
        const r1 = await get(new URL(r0.location, BASE + url).href);
        const okFinal = r1.status === 200 && (!marker || r1.body.indexOf(marker) !== -1);
        check(label + ' [' + url + ']', okRedir && okFinal, { redirect: r0.status, location: r0.location, final: r1.status, marker: r1.body.indexOf(marker) !== -1 ? undefined : 'MISSING' });
      } else {
        const r = await get(BASE + url);
        const okStatus = r.status === status;
        const okType = !type || (r.type || '').toLowerCase().indexOf(type.toLowerCase()) !== -1;
        const okMarker = !marker || r.body.indexOf(marker) !== -1;
        check(label + ' [' + url + ']', okStatus && okType && okMarker, { status: r.status, type: r.type.slice(0, 30), marker: okMarker ? undefined : 'MISSING' });
      }
    } catch (e) {
      check(label + ' [' + url + ']', false, { error: String(e).slice(0, 80) });
    }
  }
}

// ------------------------------------------------------------- crawl all refs
async function crawlTests(BASE) {
  console.log('\n=== B. Full crawl — every page + every relative asset/link resolves ===');
  const startPages = [
    '/', '/about.html', '/how-it-works.html', '/schemes.html', '/news.html',
    '/news-article.html?id=news1', '/resources.html', '/impact.html', '/support.html', '/contact.html',
    '/platform', '/platform/?intent=login', '/whatsapp-beta', '/platform/whatsapp-beta',
    '/public-site/government-version/index.html', '/platform/public-site/government-version/index.html',
  ];
  const seen = new Set();
  const broken = [];
  const pagesToVisit = [...startPages];
  while (pagesToVisit.length) {
    const pageUrl = pagesToVisit.pop();
    if (seen.has(pageUrl)) continue;
    seen.add(pageUrl);
    let html, finalUrl;
    try {
      const r = await get(BASE + pageUrl);
      if (r.status !== 200) { broken.push(pageUrl + ' → HTTP ' + r.status); continue; }
      html = r.body;
      finalUrl = r.finalUrl;
    } catch (e) { broken.push(pageUrl + ' → ' + String(e).slice(0, 60)); continue; }
    let m;
    REL_REF.lastIndex = 0;
    while ((m = REL_REF.exec(html)) !== null) {
      const ref = m[1];
      if (isExternal(ref)) continue;
      let abs;
      try { abs = new URL(ref, finalUrl).pathname; } catch (e) { continue; }
      const key = abs + (new URL(ref, finalUrl).search || '');
      if (seen.has('asset:' + key)) continue;
      seen.add('asset:' + key);
      try {
        // resolve against the FINAL url (after any redirect) — like a real browser
        const r = await get(BASE + (ref.startsWith('/') ? '' : '/') + key.replace(/^\//, ''));
        if (r.status !== 200) broken.push(pageUrl + ' → ' + ref + ' (' + key + ') → HTTP ' + r.status);
      } catch (e) {
        broken.push(pageUrl + ' → ' + ref + ' → ' + String(e).slice(0, 60));
      }
    }
  }
  check('crawled ' + seen.size + ' unique URLs, 0 broken', broken.length === 0, broken.length ? broken.slice(0, 10) : undefined);
}

// --------------------------------------- public ⇄ platform bridge (routing)
async function bridgeTests(BASE) {
  console.log('\n=== D. Public ⇄ platform auth bridge over Vercel routing ===');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const consoleErrors = [];
  const badResponses = [];
  const failedReqs = [];
  const isBenign = u => /supabase\.co|jsdelivr\.net|fonts\.|favicon\.ico/i.test(u);
  const snapshot = () => ({
    consoleErrors: consoleErrors.slice(),
    bad: badResponses.slice(),
    failed: failedReqs.slice(),
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 160)); });
  page.on('response', res => { if (res.status() >= 400) badResponses.push(res.status() + ' ' + res.url()); });
  page.on('requestfailed', req => failedReqs.push((req.failure() || {}).errorText + ' ' + req.url()));

  // D1 — guest clicks "Open Platform" from / → login page (requirement 2)
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 45000 });
  await new Promise(r => setTimeout(r, 2000));
  const ctaHref = await page.evaluate(() => {
    const a = document.querySelector('.header-actions a.btn-primary, a[href*="intent=login"]');
    return a ? a.getAttribute('href') : null;
  });
  check('bridge: guest CTA generated from KS.platformUrl with ?intent=login', ctaHref === '/platform/?intent=login', { href: ctaHref });
  await page.click('a[href*="intent=login"]');
  await page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3500));
  const login = await page.evaluate(() => {
    const l = document.getElementById('loginPage');
    return {
      path: location.pathname,
      query: location.search,
      loginActive: !!l && l.classList.contains('active') && getComputedStyle(l).display !== 'none',
      url: location.href,
    };
  });
  check('bridge: guest Open Platform → /platform/?intent=login → login page (NO 404)', login.path === '/platform/' && login.query === '?intent=login' && login.loginActive, login);

  // D2–D4 — guests opening the app directly must land on the public homepage, not 404/loop
  for (const direct of ['/platform', '/platform/', '/LAST_GOV_API_GRAPHS_FINAL.html']) {
    const before = snapshot();
    await page.goto(BASE + direct, { waitUntil: 'load', timeout: 45000 });
    await new Promise(r => setTimeout(r, 2000));
    const r = await page.evaluate(() => ({
      url: location.href,
      green: getComputedStyle(document.documentElement).getPropertyValue('--green').trim(),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      title: document.title,
    }));
    const onGov = /public-site\/government-version\/index\.html/.test(r.url) || r.url.replace(/\/$/, '') === BASE;
    const styled = r.green === '#0d5c31' && r.bodyBg === 'rgb(246, 248, 245)';
    const newLocalErrs = snapshot().bad.filter(u => !isBenign(u)).length + snapshot().failed.filter(u => !isBenign(u)).length - (before.bad.filter(u => !isBenign(u)).length + before.failed.filter(u => !isBenign(u)).length);
    check('bridge: guest direct ' + direct + ' → public homepage, styled, no 404', onGov && styled && newLocalErrs === 0, { url: r.url, styled, newLocalErrs });
  }

  // D5 — login page's home link → public homepage
  await page.goto(BASE + '/platform/?intent=login', { waitUntil: 'load', timeout: 45000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.evaluate(() => { setTimeout(() => { window.goPublicHome(); }, 50); });
  await page.waitForFunction(() => window.location.href.indexOf('public-site/government-version') !== -1, { timeout: 15000 })
    .then(() => check('bridge: login-page home link → public homepage', true))
    .catch(() => check('bridge: login-page home link → public homepage', false, { url: page.url() }));

  // D6 — authed direct open → dashboard, no login (requirement 3)
  const p2 = await browser.newPage();
  await p2.setViewport({ width: 1280, height: 900 });
  await p2.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('sb-lryhcszcmhlrzrbrsces-auth-token',
        JSON.stringify({ access_token: 'stub-access', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'stub-refresh', user: { id: 'u-live', email: 'farmer@demo.in', user_metadata: { full_name: 'Ramesh Patil', role: 'farmer' } } }));
      localStorage.setItem('krishiSetuDemoLoggedIn', '1');
    } catch (e) {}
    const chain = () => ({ select: chain, eq: chain, order: chain, limit: chain, maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }), insert: async () => ({ data: null, error: null }), update: async () => ({ data: null, error: null }), upsert: async () => ({ data: null, error: null }), delete: async () => ({ data: null, error: null }) });
    const stubClient = {
      auth: {
        // mirrors real Supabase: after signOut (flag set), no session exists
        getSession: async () => {
          let out = null;
          try { if (localStorage.getItem('__stubLoggedOut') !== '1') out = { user: { id: 'u-live', email: 'farmer@demo.in', user_metadata: { full_name: 'Ramesh Patil', role: 'farmer' } } }; } catch (e) {}
          return { data: { session: out } };
        },
        onAuthStateChange: () => ({ unsubscribe: () => {} }),
        signOut: async () => { try { localStorage.removeItem('sb-lryhcszcmhlrzrbrsces-auth-token'); localStorage.removeItem('krishiSetuDemoLoggedIn'); localStorage.setItem('__stubLoggedOut', '1'); } catch (e) {} return { error: null }; },
        signInWithPassword: async () => ({ data: {}, error: { message: 'stub' } }),
        signUp: async () => ({ data: {}, error: { message: 'stub' } }),
      },
      from: () => chain(),
      storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ error: null }) }) },
    };
    try {
      Object.defineProperty(window, 'supabase', { configurable: false, enumerable: true, get: () => ({ createClient: () => stubClient }), set: () => {} });
    } catch (e) { window.supabase = { createClient: () => stubClient }; }
  });
  await p2.goto(BASE + '/platform', { waitUntil: 'load', timeout: 45000 });
  await new Promise(r => setTimeout(r, 3500));
  const authed = await p2.evaluate(() => ({
    loggedIn: window.isLoggedIn,
    loginActive: (document.getElementById('loginPage') || {}).classList ? document.getElementById('loginPage').classList.contains('active') : null,
    path: location.pathname,
  }));
  check('bridge: authed direct /platform → dashboard directly, no login', authed.loggedIn === true && authed.loginActive === false && authed.path === '/platform', authed);

  // D6b — authed user CLICKS "Open Platform" from / → dashboard directly, no second login (requirement 3)
  await p2.goto(BASE + '/', { waitUntil: 'load', timeout: 45000 });
  await new Promise(r => setTimeout(r, 2000));
  await p2.click('a[data-i18n-authed]');
  await p2.waitForNavigation({ waitUntil: 'load', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3500));
  const authedClick = await p2.evaluate(() => ({
    path: location.pathname,
    query: location.search,
    loggedIn: window.isLoggedIn,
    loginActive: (document.getElementById('loginPage') || {}).classList ? document.getElementById('loginPage').classList.contains('active') : null
  }));
  check('bridge: authed CTA click → dashboard directly (no second login)', authedClick.path === '/platform/' && authedClick.query === '?intent=login' && authedClick.loggedIn === true && authedClick.loginActive === false, authedClick);

  // D7 — dashboard home → public homepage (requirement 4)
  await p2.evaluate(() => { setTimeout(() => { window.goPublicHome(); }, 50); });
  await p2.waitForFunction(() => window.location.href.indexOf('public-site/government-version') !== -1, { timeout: 15000 })
    .then(() => check('bridge: dashboard home → public homepage', true))
    .catch(() => check('bridge: dashboard home → public homepage', false, { url: p2.url() }));

  // D8 — logout → public homepage; Open Platform → login again (requirements 5–6)
  await p2.goto(BASE + '/platform', { waitUntil: 'load', timeout: 45000 });
  await new Promise(r => setTimeout(r, 2500));
  await p2.evaluate(() => { setTimeout(() => { window.logout(); }, 50); });
  await p2.waitForFunction(() => window.location.href.indexOf('public-site/government-version') !== -1, { timeout: 15000 })
    .then(() => check('bridge: logout → public homepage', true))
    .catch(() => check('bridge: logout → public homepage', false, { url: p2.url() }));
  await p2.goto(BASE + '/', { waitUntil: 'load', timeout: 45000 });
  await new Promise(r => setTimeout(r, 2000));
  await p2.click('a[href*="intent=login"]');
  await p2.waitForNavigation({ waitUntil: 'load', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));
  const relogin = await p2.evaluate(() => ({
    loginActive: (document.getElementById('loginPage') || {}).classList ? document.getElementById('loginPage').classList.contains('active') : null,
    path: location.pathname,
  }));
  check('bridge: after logout, Open Platform → login again', relogin.path === '/platform/' && relogin.loginActive === true, relogin);
  await p2.close();

  const fixRelated = badResponses.filter(u => !isBenign(u));
  check('bridge: zero 4xx/5xx on local assets across the whole flow', fixRelated.length === 0, fixRelated.slice(0, 5));
  check('bridge: zero console errors across the whole flow', consoleErrors.length === 0, consoleErrors.slice(0, 5));
  await browser.close();
}

// ------------------------------------------------------------------ browser
async function browserTests(BASE) {
  console.log('\n=== C. Real-browser rendering (styled pages, JS ran, navigation, login flow) ===');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1365, height: 900 });

  const consoleErrors = [];
  const badResponses = [];
  const failedReqs = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 160)); });
  page.on('response', res => { if (res.status() >= 400) badResponses.push(res.status() + ' ' + res.url()); });
  page.on('requestfailed', req => failedReqs.push((req.failure() || {}).errorText + ' ' + req.url()));

  // 1. Homepage fully styled + JS ran
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 45000 });
  await new Promise(r => setTimeout(r, 2000));
  const home = await page.evaluate(() => ({
    title: document.title,
    green: getComputedStyle(document.documentElement).getPropertyValue('--green').trim(),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    tickerItems: document.querySelectorAll('#tickerTrack > *').length,
    sheets: document.styleSheets.length,
    hero: !!document.querySelector('.home-hero'),
  }));
  check('homepage: CSS applied (--green var + body background from styles.css)', home.green === '#0d5c31' && home.bodyBg === 'rgb(246, 248, 245)', home);
  check('homepage: gov JS ran (ticker populated from js/data.js)', home.tickerItems > 0, home);
  check('homepage: hero section rendered', !!home.hero, {});

  // 2. Navigate between government pages
  const beforeNav = consoleErrors.length + badResponses.length + failedReqs.length;
  await page.click('nav.main-nav a[href="about.html"]');
  await page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));
  const nav = await page.evaluate(() => ({
    url: location.href,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    heading: (document.querySelector('h1') || {}).textContent || '',
  }));
  check('navigation: /about.html reached via nav click, still styled', nav.url.endsWith('/about.html') && nav.bodyBg === 'rgb(246, 248, 245)', nav);
  check('navigation: no new console/network errors on /about.html', consoleErrors.length + badResponses.length + failedReqs.length === beforeNav, { consoleErrors: consoleErrors.slice(-3), bad: badResponses.slice(-3) });

  // 3. /platform/?intent=login → dashboard login flow
  await page.goto(BASE + '/platform/?intent=login', { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));
  const plat = await page.evaluate(() => {
    const login = document.getElementById('loginPage');
    const vis = login ? getComputedStyle(login).display !== 'none' && login.classList.contains('active') : false;
    return { title: document.title, loginVisible: vis, hasLoginForm: !!document.getElementById('loginMobile') || !!document.getElementById('loginPassword') };
  });
  check('/platform/?intent=login: dashboard + login flow rendered', plat.loginVisible && plat.hasLoginForm, plat);

  // 4. WhatsApp Beta (both entry points)
  for (const u of ['/whatsapp-beta', '/platform/whatsapp-beta']) {
    await page.goto(BASE + u, { waitUntil: 'load', timeout: 45000 });
    await new Promise(r => setTimeout(r, 1500));
    const wa = await page.evaluate(() => ({
      chat: !!document.getElementById('chat'),
      styled: (getComputedStyle(document.body).backgroundColor || '') !== '',
    }));
    check('WhatsApp Beta renders at ' + u, wa.chat, wa);
  }

  // 5. Errors caused by the fix (local asset resolution)
  const isBenign = u => /supabase\.co|jsdelivr\.net|fonts\.|favicon\.ico/i.test(u);

  const fixRelated = badResponses.filter(u => !isBenign(u));
  const envRelated = badResponses.filter(u => isBenign(u));
  check('zero failed local asset requests (4xx/5xx)', fixRelated.length === 0, fixRelated.slice(0, 5));
  check('zero failed local asset loads (network errors)', failedReqs.filter(u => !isBenign(u)).length === 0, failedReqs.filter(u => !isBenign(u)).slice(0, 5));
  check('zero page/console JS errors', consoleErrors.length === 0, consoleErrors.slice(0, 5));
  if (envRelated.length) warn('external/CDN or favicon requests failed (pre-existing, not caused by this fix)', envRelated.slice(0, 5));

  await browser.close();
}

(async () => {
  if (!fs.existsSync(CHROME)) {
    console.error('Chrome not found at ' + CHROME + ' — set CHROME_PATH');
    process.exit(2);
  }
  const server = await sim.start(PROJECT_ROOT, 0);
  const BASE = 'http://127.0.0.1:' + server.address().port;
  console.log('Vercel-sim project root: ' + PROJECT_ROOT);
  console.log('Simulated deployment base: ' + BASE + '/');

  await httpMappingTests(BASE);
  await crawlTests(BASE);
  await browserTests(BASE);
  await bridgeTests(BASE);

  server.close();
  console.log('\n==============================================');
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED' + (warnings ? ' + ' + warnings + ' warning(s)' : ''));
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });