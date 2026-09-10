const puppeteer = require('puppeteer-core');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE = pathToFileURL(path.join(ROOT, 'frontend', 'LAST_GOV_API_GRAPHS_FINAL.html')).href + '?app=1';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(FILE, { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise(r => setTimeout(r, 1800));
  await page.evaluate(() => window.demoLogin('farmer'));
  await new Promise(r => setTimeout(r, 2000));

  // Theme class state precision
  const theme = await page.evaluate(() => {
    window.applyTheme('light', false);
    const light = {
      darkClass: document.body.classList.contains('dark-mode'),
      bodyBgColor: getComputedStyle(document.body).backgroundColor,
      bodyBgImage: getComputedStyle(document.body).backgroundImage.slice(0, 60)
    };
    window.applyTheme('dark', false);
    const dark = {
      darkClass: document.body.classList.contains('dark-mode'),
      bodyBgColor: getComputedStyle(document.body).backgroundColor
    };
    window.applyTheme('light', false);
    return { light, dark };
  });
  console.log('THEME_STATE', JSON.stringify(theme));

  // Drawer/modal rect precision
  const rects = await page.evaluate(() => {
    const out = {};
    window.openNotifications();
    const d = document.getElementById('notificationDrawer');
    if (d) { const r = d.getBoundingClientRect(); out.drawer = { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), vw: window.innerWidth, css: d.className }; }
    window.closeNotifications();
    window.switchPersonaRole('supervisor');
    window.showPage('adminUsers');
    if (typeof window.openAdminUserDrawer === 'function') {
      try { window.openAdminUserDrawer(); } catch (e) { out.admin = 'err ' + e; }
      const ad = document.querySelector('#adminUserDrawer, [id*="adminUserDrawer"], .admin-drawer');
      if (ad) { const r = ad.getBoundingClientRect(); out.admin = { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), vw: window.innerWidth, id: ad.id }; }
    }
    return out;
  });
  console.log('RECTS', JSON.stringify(rects));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });