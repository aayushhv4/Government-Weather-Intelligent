// Krishi Setu — i18n + mobile check (Hindi at 390px)
const puppeteer = require('puppeteer-core');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE = pathToFileURL(path.join(ROOT, 'frontend', 'LAST_GOV_API_GRAPHS_FINAL.html')).href + '?app=1';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const PAGES = ['dashboard', 'inventory', 'market', 'sell', 'farmerOffers', 'profitCalc', 'realisationEngine', 'logisticsCompare', 'payments', 'retailChannels', 'schemes', 'cropGuide', 'customerCare', 'whatsapp'];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const warns = [];
  page.on('console', m => { if (m.type() === 'warning') warns.push(m.text().slice(0, 120)); });

  await page.goto(FILE, { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise(r => setTimeout(r, 1800));
  await page.evaluate(() => window.demoLogin('farmer'));
  await new Promise(r => setTimeout(r, 2200));
  await page.evaluate(() => {
    const sel = document.getElementById('languageSelect');
    sel.value = 'hi';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 1200));

  let fails = 0;
  for (const pid of PAGES) {
    await page.evaluate(p => window.showPage(p), pid);
    await new Promise(r => setTimeout(r, 500));
    const info = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        wide: doc.scrollWidth > window.innerWidth + 1,
        hindi: /[अ-ह]/.test(document.body.textContent.slice(0, 4000))
      };
    });
    if (info.wide || !info.hindi) { fails++; console.log('FAIL', pid, JSON.stringify(info)); } else console.log('ok  ', pid);
  }
  const nav = await page.evaluate(() => [...document.querySelectorAll('.nav button')].slice(0, 5).map(b => b.textContent.trim().replace(/\s+/g, ' ').slice(0, 25)));
  console.log('NAV(HI):', JSON.stringify(nav));
  console.log(warns.length ? 'WARNINGS: ' + JSON.stringify(warns.slice(0, 5)) : 'WARNINGS: none');
  console.log(fails === 0 && warns.length === 0 ? 'I18N MOBILE OK' : 'I18N MOBILE FAILED');
  await browser.close();
  process.exit(fails === 0 && warns.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });