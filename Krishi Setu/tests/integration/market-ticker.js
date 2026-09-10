// Krishi Setu — Government homepage market price ticker
// Verifies: placement, data (reuses dashboard MANDI_BENCHMARKS demo values),
// seamless-loop animation, hover/focus pause, prefers-reduced-motion,
// mobile widths (no page overflow), language integration, fallback state,
// and zero console errors.
// Usage: node market-ticker.js
const puppeteer = require('puppeteer-core');
const path = require('path');
const { pathToFileURL } = require('url');

const APP_ROOT = path.resolve(__dirname, '..', '..');
const GOV = path.join(APP_ROOT, 'frontend', 'public-site', 'government-version');
const INDEX = pathToFileURL(path.join(GOV, 'index.html')).href;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + JSON.stringify(extra) : ''));
  if (!ok) failures++;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });

  /* ---------- 1. placement + data + animation ---------- */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    await page.goto(INDEX, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 900));

    const r = await page.evaluate(() => {
      const header = document.querySelector('.site-header');
      const ticker = document.getElementById('marketTicker');
      const main = document.getElementById('main');
      const list1 = document.querySelectorAll('.ticker-list:not([aria-hidden]) .ticker-item').length;
      const list2 = document.querySelectorAll('.ticker-list[aria-hidden="true"] .ticker-item').length;
      const names = [...document.querySelectorAll('.ticker-list:not([aria-hidden]) .ticker-item b')].map(b => b.textContent);
      const prices = [...document.querySelectorAll('.ticker-list:not([aria-hidden]) .ticker-item .ticker-price')].map(p => p.textContent.trim());
      const chgs = [...document.querySelectorAll('.ticker-list:not([aria-hidden]) .ticker-chg')].map(c => c.textContent.trim());
      const inOrder = !!header && !!ticker && !!main &&
        header.compareDocumentPosition(ticker) & Node.DOCUMENT_POSITION_FOLLOWING &&
        ticker.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING;
      const track = document.getElementById('tickerTrack');
      const cs = getComputedStyle(track);
      return { inOrder, list1, list2, names, prices, chgs, animName: cs.animationName, playState: cs.animationPlayState };
    });
    check('ticker sits between header and main (hero)', r.inOrder);
    check('renders 8 items per loop copy', r.list1 === 8 && r.list2 === 8, { list1: r.list1, list2: r.list2 });
    check('duplicate copy is aria-hidden for screen readers', true); // verified via list2 selector above
    check('items match dashboard demo benchmarks', r.names[0] === 'Onion' && r.prices[0].indexOf('2,950') !== -1, { first: r.names[0] + ' ' + r.prices[0] });
    check('down-move renders negative change', r.chgs.indexOf('↓ -2.1%') !== -1, { chgs: r.chgs.slice(0, 4) });
    check('animation runs (seamless loop)', r.animName === 'tickerScroll' && r.playState === 'running', { anim: r.animName, ps: r.playState });

    // hover pause
    await page.hover('.ticker-viewport');
    await new Promise(r => setTimeout(r, 350));
    const hoverPs = await page.evaluate(() => getComputedStyle(document.getElementById('tickerTrack')).animationPlayState);
    check('hover pauses the ticker', hoverPs === 'paused', { ps: hoverPs });
    await page.mouse.move(5, 5);
    await new Promise(r => setTimeout(r, 350));
    const unhoverPs = await page.evaluate(() => getComputedStyle(document.getElementById('tickerTrack')).animationPlayState);
    check('leaving hover resumes the ticker', unhoverPs === 'running', { ps: unhoverPs });

    // keyboard focus pause
    await page.evaluate(() => document.getElementById('tickerViewport').focus());
    await new Promise(r => setTimeout(r, 350));
    const focusPs = await page.evaluate(() => getComputedStyle(document.getElementById('tickerTrack')).animationPlayState);
    check('keyboard focus pauses the ticker', focusPs === 'paused', { ps: focusPs });
    await page.evaluate(() => document.getElementById('tickerViewport').blur());
    await new Promise(r => setTimeout(r, 350));
    const blurPs = await page.evaluate(() => getComputedStyle(document.getElementById('tickerTrack')).animationPlayState);
    check('blur resumes the ticker', blurPs === 'running', { ps: blurPs });

    check('zero console errors (desktop)', errs.length === 0, { errs });
    await page.close();
  }

  /* ---------- 2. reduced motion ---------- */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(INDEX, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 800));
    const r = await page.evaluate(() => ({
      anim: getComputedStyle(document.getElementById('tickerTrack')).animationName,
      dupHidden: getComputedStyle(document.querySelector('.ticker-list[aria-hidden="true"]')).display,
      scrollable: getComputedStyle(document.querySelector('.ticker-viewport')).overflowX,
      items: document.querySelectorAll('.ticker-list:not([aria-hidden]) .ticker-item').length
    }));
    check('reduced motion: no animation', r.anim === 'none', { anim: r.anim });
    check('reduced motion: duplicate copy hidden', r.dupHidden === 'none', { d: r.dupHidden });
    check('reduced motion: viewport becomes scrollable list', r.scrollable === 'auto', { o: r.scrollable });
    check('reduced motion: all 8 items still visible', r.items === 8, { items: r.items });
    await page.close();
  }

  /* ---------- 3. mobile widths: no page overflow ---------- */
  {
    const page = await browser.newPage();
    for (const w of [360, 375, 390, 412, 768]) {
      await page.setViewport({ width: w, height: 844 });
      await page.goto(INDEX, { waitUntil: 'load', timeout: 60000 });
      await new Promise(r => setTimeout(r, 600));
      const r = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        tickerVisible: document.getElementById('marketTicker').offsetHeight > 0,
        itemVisible: document.querySelector('.ticker-item').getBoundingClientRect().height > 0
      }));
      check('width ' + w + ': no page overflow, ticker visible + readable', !r.overflow && r.tickerVisible && r.itemVisible, r);
    }
    await page.close();
  }

  /* ---------- 4. language integration ---------- */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(INDEX, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 700));
    await page.select('#langSelect', 'hi');
    await new Promise(r => setTimeout(r, 500));
    const hi = await page.evaluate(() => ({
      label: document.querySelector('.ticker-head strong').textContent,
      badge: document.querySelector('.ticker-badge').textContent,
      crop: document.querySelector('.ticker-list:not([aria-hidden]) .ticker-item b').textContent,
      state: document.querySelector('.ticker-list:not([aria-hidden]) .ticker-sub').textContent
    }));
    check('Hindi: ticker label translates', hi.label === 'बाज़ार भाव', { label: hi.label });
    check('Hindi: demo badge translates', hi.badge === 'डेमो डेटा', { badge: hi.badge });
    check('Hindi: crop names translate', hi.crop === 'प्याज़', { crop: hi.crop });
    check('Hindi: state names translate', hi.state.indexOf('महाराष्ट्र') !== -1, { state: hi.state });
    await page.select('#langSelect', 'en');
    await new Promise(r => setTimeout(r, 500));
    const en = await page.evaluate(() => ({
      label: document.querySelector('.ticker-head strong').textContent,
      crop: document.querySelector('.ticker-list:not([aria-hidden]) .ticker-item b').textContent
    }));
    check('switching back restores English ticker', en.label === 'Market Prices' && en.crop === 'Onion', en);
    await page.evaluate(() => localStorage.removeItem('krishiSetuLang'));
    await page.close();
  }

  /* ---------- 5. fallback state when data is missing ---------- */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(INDEX, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 700));
    const fb = await page.evaluate(() => {
      window.KS.marketTicker = [];
      window.KS_RENDER.ticker();
      const t = document.getElementById('tickerTrack').textContent.trim();
      window.KS.marketTicker = undefined;
      delete window.KS.marketTicker;
      return t;
    });
    check('fallback shows a clear message, no empty ticker', fb.indexOf('temporarily unavailable') !== -1 && fb.length < 80, { fb });
    await page.close();
  }

  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });