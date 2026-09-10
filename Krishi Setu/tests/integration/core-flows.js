// Krishi Setu — core flow checks (add crop -> publish -> offers -> profit -> logistics -> payments -> buyer -> supervisor)
const puppeteer = require('puppeteer-core');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE = pathToFileURL(path.join(ROOT, 'frontend', 'LAST_GOV_API_GRAPHS_FINAL.html')).href + '?app=1';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));

  await page.goto(FILE, { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise(r => setTimeout(r, 1800));
  await page.evaluate(() => window.demoLogin('farmer'));
  await new Promise(r => setTimeout(r, 2200));

  const results = {};

  results.addCrop = await page.evaluate(() => {
    const before = state.inventory.length;
    window.openAddInventoryModal();
    const opened = document.getElementById('addInventoryModal').classList.contains('open');
    document.getElementById('invNewCrop').value = 'Tomato';
    document.getElementById('invNewVariety').value = 'Rupali';
    document.getElementById('invNewQty').value = '750';
    document.getElementById('invNewStorage').value = 'Cold Storage (4°C - 8°C)';
    document.getElementById('invNewMoisture').value = '11';
    window.saveNewInventoryItem();
    return { opened, added: state.inventory.length === before + 1, inGrid: document.getElementById('inventoryGrid').textContent.includes('Tomato') };
  });

  results.publish = await page.evaluate(() => {
    const item = state.inventory.find(i => i.crop === 'Tomato');
    window.quickPublishFromInventory(item.id);
    const qtyFilled = document.getElementById('lotQty').value === String(item.availableQty);
    document.getElementById('lotPrice').value = '3400';
    window.publishNewLot();
    const lot = state.lots.find(l => l.crop === 'Tomato');
    return { qtyFilled, lotActive: !!lot && lot.status === 'Active' };
  });

  results.offers = await page.evaluate(() => {
    window.showPage('farmerOffers');
    return { hasContent: document.getElementById('farmerOffers').textContent.trim().length > 300 };
  });

  results.profit = await page.evaluate(() => {
    window.showPage('profitCalc');
    window.runProfitCalc();
    const d1 = document.getElementById('profitDifference').textContent;
    document.getElementById('calcYield').value = '120';
    window.runProfitCalc();
    const d2 = document.getElementById('profitDifference').textContent;
    return { dynamic: d1 !== d2 };
  });

  results.logistics = await page.evaluate(() => {
    window.showPage('logisticsCompare');
    const b = document.getElementById('logisticsCompare').textContent.trim().length;
    document.getElementById('logQty').value = '90';
    window.renderLogistics();
    const a = document.getElementById('logisticsCompare').textContent.trim().length;
    return { dynamic: b !== a };
  });

  results.payments = await page.evaluate(() => {
    window.showPage('payments');
    const cards = document.getElementById('paymentCards');
    return { rendered: !!cards && cards.textContent.trim().length > 100 };
  });

  results.notifications = await page.evaluate(() => {
    window.openNotifications();
    const drawer = document.getElementById('notificationDrawer');
    const opened = drawer && drawer.classList.contains('open');
    const list = document.getElementById('notificationList');
    // The drawer may legitimately show its empty state (no notifications on a fresh profile)
    const items = list ? list.querySelectorAll('.notification-item').length : -1;
    const emptyState = list ? !!list.querySelector('.empty-state') : false;
    window.closeNotifications();
    const closed = drawer && !drawer.classList.contains('open');
    return { opened, closed, emptyState, items }; // pass: opened && closed && (items > 0 || emptyState)
  });

  results.buyer = await page.evaluate(() => {
    window.switchPersonaRole('buyer');
    window.showPage('buyerMarket');
    return { role: currentRole, lots: document.querySelectorAll('#buyerMarket [onclick*="inspectLotModal"]').length };
  });

  results.supervisor = await page.evaluate(() => {
    window.switchPersonaRole('supervisor');
    window.showPage('adminUsers');
    const users = document.querySelectorAll('#adminUsers tbody tr, #adminUsers .table tbody tr').length;
    window.showPage('adminPurchases');
    const orders = document.querySelectorAll('#adminPurchases tbody tr, #adminPurchases .table tbody tr').length;
    return { users, orders };
  });

  // notifications passes when the drawer opens+closes and either lists items or shows its empty state
  const notifOk = results.notifications.opened && results.notifications.closed && (results.notifications.items > 0 || results.notifications.emptyState);
  const rest = Object.fromEntries(Object.entries(results).filter(([k]) => k !== 'notifications'));
  const allOk = notifOk && Object.values(rest).every(v => Object.values(v).every(x => x !== false && x !== 0 && x !== -1));
  console.log(JSON.stringify(results, null, 1));
  console.log(errs.length ? 'PAGE ERRORS: ' + JSON.stringify(errs.slice(0, 5)) : 'PAGE ERRORS: none');
  console.log(allOk && errs.length === 0 ? 'CORE FLOWS OK' : 'CORE FLOWS FAILED');
  await browser.close();
  process.exit(allOk && errs.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });