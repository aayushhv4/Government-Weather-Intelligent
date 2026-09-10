// KrishiSetu v2026 verification: render, screenshot, catch runtime errors + overflow.
// Usage: node verify-after.js [prefix]
const puppeteer = require('puppeteer-core');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', 'frontend', 'LAST_GOV_API_GRAPHS_FINAL.html').replace(/\\/g, '/');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const prefix = process.argv[2] || 'after';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e)));

  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(FILE, { waitUntil: 'networkidle2', timeout: 40000 });

  // Farmer demo login (call demoLogin directly + force light theme for first pass)
  await page.evaluate(() => { try { applyTheme('light', false); } catch(e) {} });
  await page.evaluate(() => { try { demoLogin('farmer'); } catch(e) { window.__demoErr=String(e); } });
  await new Promise(r => setTimeout(r, 2200));
  const demoErr = await page.evaluate(() => window.__demoErr || '');
  if (demoErr) console.log('  demoLogin error:', demoErr);

  const bodyClass = await page.evaluate(() => document.body.className);
  const overflowD = await page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });

  async function shot(name) {
    const out = path.join(__dirname, name);
    await page.screenshot({ path: out });
    console.log('  saved', out);
  }
  async function overflow() {
    return await page.evaluate(() => (document.scrollingElement || document.documentElement).scrollWidth - document.documentElement.clientWidth);
  }

  console.log('== FARMER LOGIN ==');
  console.log('  body class after login:', bodyClass);

  console.log('== DASHBOARD (desktop) ==');
  console.log('  horizontal overflow (px):', overflowD > 0 ? overflowD : 'none');
  await new Promise(r => setTimeout(r, 1500));
  await shot(prefix + '-dashboard.png');

  console.log('== DARK MODE ==');
  await page.evaluate(() => { try { toggleTheme(); } catch(e) {} });
  await new Promise(r => setTimeout(r, 700));
  const dark = await page.evaluate(() => document.body.classList.contains('dark-mode'));
  console.log('  dark-mode active:', dark);
  await shot(prefix + '-dashboard-dark.png');
  await page.evaluate(() => { try { toggleTheme(); } catch(e) {} }); // back to light
  await new Promise(r => setTimeout(r, 500));

  // Walk key pages, checking for errors + overflow
  const pages = ['market', 'inventory', 'farmerOffers', 'realisationEngine', 'logistics', 'trustScore', 'profitCalc', 'cropOutlook', 'retailChannels', 'payments', 'schemes', 'cropDoctor'];
  console.log('== PAGE WALK (farmer) ==');
  for (const p of pages) {
    await page.evaluate((pid) => { const b = document.querySelector(`.nav button[onclick*="'${pid}'"]`) || [...document.querySelectorAll('.nav button')].find(b => (b.getAttribute('onclick')||'').includes(pid)); if (b) b.click(); }, p);
    await new Promise(r => setTimeout(r, 500));
    const ov = await overflow();
    const active = await page.evaluate(() => (document.querySelector('.page.active') || {}).id || '(none)');
    console.log(`  ${p}: active=${active} overflow=${ov>0?ov+'px':'none'}`);
  }
  await page.evaluate(() => { const b=[...document.querySelectorAll('.nav button')].find(b=>(b.getAttribute('onclick')||'').includes('showHome')); if(b) b.click(); });
  await new Promise(r => setTimeout(r, 600));

  console.log('== MOBILE DASHBOARD ==');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await new Promise(r => setTimeout(r, 1000));
  console.log('  mobile overflow (px):', await overflow());
  await shot(prefix + '-dashboard-mobile.png');

  console.log('== ERRORS ==');
  console.log(errors.length ? errors : 'none');
  console.log('== DONE ==');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });