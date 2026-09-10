// Krishi Setu — deep pre-deployment audit probe
const puppeteer = require('puppeteer-core');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE = pathToFileURL(path.join(ROOT, 'frontend', 'LAST_GOV_API_GRAPHS_FINAL.html')).href + '?app=1';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e).slice(0, 150)));

  // ============ A. MODALS/DRAWERS FIT AT 390 ============
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(FILE, { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise(r => setTimeout(r, 1800));
  await page.evaluate(() => window.demoLogin('farmer'));
  await new Promise(r => setTimeout(r, 2200));

  const modals = await page.evaluate(() => {
    const out = {};
    const measure = (name, el) => {
      if (!el) { out[name] = 'missing'; return; }
      const r = el.getBoundingClientRect();
      out[name] = { w: Math.round(r.width), vw: window.innerWidth, fits: r.width <= window.innerWidth + 1 && r.right <= window.innerWidth + 1 };
    };
    // farmer inventory modal
    window.openAddInventoryModal();
    measure('addInventoryModal', document.getElementById('addInventoryModal'));
    window.closeAddInventoryModal && window.closeAddInventoryModal();
    // notification drawer
    window.openNotifications();
    measure('notificationDrawer', document.getElementById('notificationDrawer'));
    window.closeNotifications && window.closeNotifications();
    // location picker
    if (typeof window.openLocationPicker === 'function') { window.openLocationPicker(); measure('locationPicker', document.querySelector('[id*="ocation"][class*="modal"], [class*="modal"][style*="display: flex"], .modal-card[style*="display"]')); }
    // translator
    if (typeof window.openMainTranslator === 'function') { window.openMainTranslator(); measure('translator', document.querySelector('.modal-card[style*="display"], [id*="ranslat"][class*="modal"]')); }
    // whatsapp modal
    if (typeof window.openWhatsAppModal === 'function') { window.openWhatsAppModal(); measure('whatsapp', document.querySelector('.modal-card[style*="display"], [id*="hatsapp"][class*="modal"]')); }
    // admin drawer
    window.switchPersonaRole('supervisor');
    window.showPage('adminUsers');
    if (typeof window.openAdminUserDrawer === 'function') { try { window.openAdminUserDrawer(); } catch (e) { out.adminDrawer = 'err ' + e; } measure('adminUserDrawer', document.querySelector('[id*="rawer"]')); }
    window.switchPersonaRole('farmer');
    return out;
  });
  console.log('MODALS@390', JSON.stringify(modals));

  // ============ B. THEME COMBOS ============
  const themes = await page.evaluate(() => {
    const g = (s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).backgroundColor : 'n/a'; };
    const out = {};
    const sample = (k) => { out[k] = { body: g('body'), card: g('.card'), sidebar: g('.sidebar'), tableTh: g('.table th') }; };
    window.applyTheme('light', false); window.switchPersonaRole('farmer'); window.showPage('inventory'); sample('farmerLight');
    window.applyTheme('dark', false); sample('farmerDark');
    window.switchPersonaRole('buyer'); window.showPage('buyerMarket'); sample('buyerDark');
    window.applyTheme('light', false); sample('buyerLight');
    return out;
  });
  console.log('THEMES', JSON.stringify(themes));

  // ============ C. I18N mr / bn / ta at 390 ============
  const i18n = {};
  for (const lang of ['mr', 'bn', 'ta']) {
    await page.evaluate((l) => {
      const sel = document.getElementById('languageSelect');
      sel.value = l;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, lang);
    await new Promise(r => setTimeout(r, 1000));
    const res = await page.evaluate(() => {
      const doc = document.documentElement;
      return { wide: doc.scrollWidth > window.innerWidth + 1, scrollW: doc.scrollWidth };
    });
    await page.evaluate(() => window.showPage('market'));
    await new Promise(r => setTimeout(r, 400));
    const res2 = await page.evaluate(() => ({ wide: document.documentElement.scrollWidth > window.innerWidth + 1 }));
    i18n[lang] = { dashboard: res, market: res2 };
    console.log('I18N_' + lang, JSON.stringify(i18n[lang]));
  }
  await page.evaluate(() => { const s = document.getElementById('languageSelect'); s.value = 'en'; s.dispatchEvent(new Event('change', { bubbles: true })); });

  // ============ D. AUTH: session persistence + protected routes ============
  const auth = {};
  await page.evaluate(() => { window.applyTheme('light', false); window.switchPersonaRole('farmer'); window.demoLogin('farmer'); });
  await new Promise(r => setTimeout(r, 1200));
  auth.loggedInBefore = await page.evaluate(() => window.isLoggedIn);
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1800));
  auth.loggedInAfterReload = await page.evaluate(() => window.isLoggedIn);
  // unauth protected route — logout now lands on the public homepage (front door)
  await page.evaluate(() => { try { window.logout(); } catch (e) {} });
  await new Promise(r => setTimeout(r, 3000));
  auth.afterLogout = await page.evaluate(() => window.isLoggedIn === false || window.isLoggedIn === undefined);
  auth.logoutLandsOnPublic = page.url().indexOf('government-version') !== -1;
  // return to the app (no session) to verify protected routes still gate unauth users
  await page.goto(FILE, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));
  const prot = await page.evaluate(() => {
    try { window.showPage('inventory'); return { wentToInventory: document.querySelector('.page.active').id === 'inventory', loginShown: document.getElementById('loginPage').classList.contains('active') }; } catch (e) { return 'err ' + e; }
  });
  auth.protectedRoute = prot;
  console.log('AUTH', JSON.stringify(auth));

  console.log('=== PAGE ERRORS ===', JSON.stringify(errs.slice(0, 6)));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });