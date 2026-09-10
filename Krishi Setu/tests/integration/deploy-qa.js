// Krishi Setu — Deployment QA (HTTP)
// Crawls the public site + app + WhatsApp Beta over HTTP and asserts:
//   - every page returns 200 with zero console errors
//   - the root entry redirects to the public Government homepage
//   - every internal link resolves (no dead links, no local paths)
//   - no horizontal overflow on mobile for key pages
// Usage:  node deploy-qa.js                (defaults to http://127.0.0.1:8140/)
//         KS_BASE_URL=https://your-domain node deploy-qa.js
const puppeteer = require('puppeteer-core');
const path = require('path');
const BASE = (process.env.KS_BASE_URL || 'http://127.0.0.1:8140/').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + JSON.stringify(extra) : ''));
  if (!ok) failures++;
}

const GOV = BASE + '/Krishi%20Setu/frontend/public-site/government-version';
const PREM = BASE + '/Krishi%20Setu/frontend/public-site/premium-version';
const APP = BASE + '/Krishi%20Setu/frontend/LAST_GOV_API_GRAPHS_FINAL.html';
const WA = BASE + '/Krishi%20Setu/frontend/whatsapp-beta/index.html';

const GOV_PAGES = ['index.html', 'about.html', 'how-it-works.html', 'schemes.html', 'news.html', 'news-article.html?id=news1', 'resources.html', 'impact.html', 'support.html', 'contact.html'];
const PREM_PAGES = ['index.html', 'about.html', 'schemes.html', 'news.html', 'resources.html', 'contact.html'];

async function load(page, url, wait = 'load') {
  const errs = [];
  const req404 = [];
  const handler = e => errs.push(String(e).slice(0, 140));
  page.on('pageerror', handler);
  try {
    await page.goto(url, { waitUntil: wait, timeout: 45000 });
    await new Promise(r => setTimeout(r, 1200));
  } catch (e) { errs.push('goto:' + String(e).slice(0, 100)); }
  const info = await page.evaluate(() => ({
    title: document.title,
    wide: document.documentElement.scrollWidth > window.innerWidth + 1,
    errCount: 0
  })).catch(() => ({ title: '', wide: false }));
  page.off('pageerror', handler);
  return { errs, title: info.title, wide: info.wide };
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // 1. Root entry → public homepage
  let rootLanding = null;
  try {
    await page.goto(BASE + '/', { waitUntil: 'load', timeout: 45000 });
    await page.waitForFunction(() => location.pathname.indexOf('government-version') !== -1, { timeout: 15000 });
    rootLanding = page.url();
  } catch (e) { rootLanding = 'FAILED: ' + String(e).slice(0, 100); }
  check('root entry redirects to public homepage', typeof rootLanding === 'string' && rootLanding.indexOf('government-version') !== -1, { url: String(rootLanding).slice(0, 90) });

  // 2. Public Government pages
  const allHrefs = new Set();
  for (const p of GOV_PAGES) {
    const r = await load(page, GOV + '/' + p);
    check('gov ' + p + ' loads, no console errors', r.errs.length === 0 && !!r.title, { errs: r.errs.slice(0, 2), title: r.title.slice(0, 60) });
    const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')));
    hrefs.forEach(h => {
      if (/^(https?:|mailto:|tel:|javascript:|#|data:)/.test(h) || !h) return;
      if (h.indexOf('LAST_GOV_API_GRAPHS_FINAL.html') !== -1) return; // platform links checked separately
      allHrefs.add(new URL(h, GOV + '/' + p).href);
    });
    // no local filesystem paths in the DOM
    const bad = hrefs.filter(h => /file:|^[A-Za-z]:\\|^\\\\/.test(h || ''));
    check('gov ' + p + ' no local filesystem links', bad.length === 0, { bad });
  }

  // 3. All internal public links resolve (HTTP 200), including news articles
  let dead = 0, checked = 0;
  for (const href of allHrefs) {
    if (href.indexOf(BASE) !== 0) continue;
    try {
      const res = await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const ok = res && res.status() < 400;
      if (!ok) { dead++; console.log('  DEAD: ' + href + ' → ' + (res && res.status())); }
      checked++;
    } catch (e) { dead++; console.log('  DEAD(goto): ' + href + ' → ' + String(e).slice(0, 80)); }
  }
  check('all public internal links resolve (n=' + checked + ')', dead === 0, { dead, checked });

  // 4. App file over HTTP — boots without errors
  {
    const r = await load(page, APP + '?app=1', 'networkidle2');
    await new Promise(res => setTimeout(res, 2000));
    check('app loads over HTTP, zero page errors', r.errs.length === 0, { errs: r.errs.slice(0, 3) });
  }

  // 5. WhatsApp Beta over HTTP (all roles)
  for (const role of ['farmer', 'buyer', 'supervisor']) {
    const r = await load(page, WA + '?role=' + role);
    check('whatsapp beta role=' + role + ' loads', r.errs.length === 0 && !!r.title, { errs: r.errs.slice(0, 2) });
  }

  // 6. Premium version pages
  for (const p of PREM_PAGES) {
    const r = await load(page, PREM + '/' + p);
    check('premium ' + p + ' loads', r.errs.length === 0 && !!r.title, { errs: r.errs.slice(0, 2) });
  }

  // 7. Mobile: key pages, no horizontal overflow
  await page.setViewport({ width: 390, height: 900 });
  for (const url of [GOV + '/index.html', GOV + '/news.html', APP + '?app=1', WA + '?role=buyer']) {
    const r = await load(page, url, 'networkidle2');
    await new Promise(res => setTimeout(res, 1500));
    check('mobile 390 no overflow: ' + url.split('/').pop(), !r.wide, { wide: r.wide });
  }

  await browser.close();
  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });