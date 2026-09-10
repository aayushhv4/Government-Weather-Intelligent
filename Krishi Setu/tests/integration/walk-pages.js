// Krishi Setu — page walker
// Usage: node walk-pages.js <role> <viewportWidth>   (role: farmer|buyer|supervisor)
const puppeteer = require('puppeteer-core');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE = pathToFileURL(path.join(ROOT, 'frontend', 'LAST_GOV_API_GRAPHS_FINAL.html')).href + '?app=1';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const NAV_TARGETS = {
  farmer: ['dashboard', 'cropDoctor', 'riskShield', 'cropGuide', 'shelfPredictor', 'inventory', 'sell', 'farmerOffers', 'trustScore', 'profitCalc', 'market', 'realisationEngine', 'aggregation', 'cropOutlook', 'logisticsCompare', 'instantSell', 'retailChannels', 'payments', 'farmerGuide', 'siteTutorial', 'customerCare', 'lotPassport', 'financing', 'contracts', 'storage', 'logistics', 'whatsapp', 'schemes'],
  buyer: ['buyerDashboard', 'buyerMarket', 'buyerRfq', 'buyerOrders', 'buyerPriceIndex', 'buyerContracts', 'buyerSuppliers', 'buyerLogistics', 'buyerFinancing', 'buyerGuide', 'market', 'logistics', 'storage', 'lotPassport', 'whatsapp', 'customerCare'],
  supervisor: ['adminDashboard', 'adminUsers', 'adminSellers', 'adminBuyers', 'adminListings', 'adminPurchases', 'adminPayments', 'adminLogistics', 'adminAnalytics', 'adminRisk', 'adminAlerts', 'adminInvestigations', 'adminAudit', 'adminSettings']
};

(async () => {
  const role = process.argv[2] || 'farmer';
  const viewW = Number(process.argv[3] || 1280);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: viewW, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });

  await page.goto(FILE, { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise(r => setTimeout(r, 1800));
  await page.evaluate(r => window.demoLogin(r), role);
  await new Promise(r => setTimeout(r, 2400));

  const pages = NAV_TARGETS[role] || NAV_TARGETS.farmer;
  let failures = 0;
  for (const pid of pages) {
    await page.evaluate(p => window.showPage(p), pid);
    await new Promise(r => setTimeout(r, 600));
    const info = await page.evaluate(() => {
      const active = document.querySelector('.page.active');
      if (!active || active.style.display === 'none') return { fail: 'not visible' };
      const txt = active.textContent || '';
      const loading = [...active.querySelectorAll('*')].filter(el => el.children.length === 0 && /^(loading…|loading\.\.\.)$/i.test(el.textContent.trim())).length;
      const wide = document.documentElement.scrollWidth > window.innerWidth + 1;
      const dead = [];
      const seen = new Set();
      active.querySelectorAll('[onclick]').forEach(el => {
        const m = el.getAttribute('onclick').match(/^([A-Za-z_$][\w$]*)\s*\(/);
        if (m && !seen.has(m[1])) { seen.add(m[1]); if (typeof window[m[1]] !== 'function') dead.push(m[1]); }
      });
      return { fail: wide ? 'overflow ' + document.documentElement.scrollWidth : null, loading, dead };
    });
    if (info.fail || info.loading || info.dead.length) {
      failures++;
      console.log('FAIL', pid, JSON.stringify(info));
    } else {
      console.log('ok  ', pid);
    }
  }
  console.log(errors.length ? 'CONSOLE ERRORS: ' + JSON.stringify(errors.slice(0, 6)) : 'CONSOLE ERRORS: none');
  console.log(failures === 0 ? 'ALL PAGES CLEAN' : failures + ' PAGE(S) FAILED');
  await browser.close();
  process.exit(failures === 0 && errors.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });