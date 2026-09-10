// Screenshot helper: logs in as farmer and captures dashboard at given widths.
// Usage: node shot-before.js [outPrefix]
const puppeteer = require('puppeteer-core');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', 'frontend', 'LAST_GOV_API_GRAPHS_FINAL.html').replace(/\\/g, '/');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const prefix = process.argv[2] || 'before';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(FILE, { waitUntil: 'networkidle2', timeout: 30000 });
  // click farmer demo login
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => (b.textContent || '').includes('Farmer'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  const out = path.join(__dirname, prefix + '-dashboard-desktop.png');
  await page.screenshot({ path: out, fullPage: true });
  console.log('saved', out);

  // mobile
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await new Promise(r => setTimeout(r, 800));
  const outM = path.join(__dirname, prefix + '-dashboard-mobile.png');
  await page.screenshot({ path: outM, fullPage: true });
  console.log('saved', outM);
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
