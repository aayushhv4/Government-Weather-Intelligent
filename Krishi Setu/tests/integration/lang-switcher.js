// Krishi Setu — Public Government site language switcher
// Verifies:
//   1. Selecting Hindi actually changes visible content (real switcher, not demo).
//   2. Preference persists (krishiSetuLang — the SAME key the dashboard uses).
//   3. Synchronization in BOTH directions: public → dashboard, dashboard → public.
//   4. Dynamic content (news, schemes, resources, steps, FAQs, article) follows
//      the language.
//   5. English switch-back, cross-tab storage sync, other-language fallback.
//   6. Mobile (390px): switcher works, no horizontal overflow.
//   7. Auth interplay: authenticated CTA label localizes too.
// Usage: node lang-switcher.js
const puppeteer = require('puppeteer-core');
const path = require('path');
const { pathToFileURL } = require('url');

const APP_ROOT = path.resolve(__dirname, '..', '..');
const GOV = path.join(APP_ROOT, 'frontend', 'public-site', 'government-version');
const pageUrl = (name, qs) => pathToFileURL(path.join(GOV, name + '.html')).href + (qs || '');
const DASH = pathToFileURL(path.join(APP_ROOT, 'frontend', 'LAST_GOV_API_GRAPHS_FINAL.html')).href + '?app=1';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + JSON.stringify(extra) : ''));
  if (!ok) failures++;
}

const hasDevanagari = s => /[\u0900-\u097F]/.test(s || '');

async function setLang(page, code) {
  await page.select('#langSelect', code);
  await new Promise(r => setTimeout(r, 300));
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });

  /* ---------- 1. HOME: switch to Hindi → real content change ---------- */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    await page.goto(pageUrl('index'), { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 800));
    const enH1 = await page.evaluate(() => document.querySelector('.home-hero h1').textContent.trim());
    check('home starts in English', !hasDevanagari(enH1), { h1: enH1.slice(0, 40) });

    await setLang(page, 'hi');
    const hi = await page.evaluate(() => ({
      h1: document.querySelector('.home-hero h1').textContent.trim(),
      nav: document.querySelector('.main-nav a').textContent.trim(),
      stored: localStorage.getItem('krishiSetuLang'),
      htmlLang: document.documentElement.lang,
      heroStat: document.querySelector('.hero-stat small').textContent.trim(),
      cta: document.querySelector('.header-actions .btn-primary').textContent.trim()
    }));
    check('clicking Hindi changes the hero to Hindi', hasDevanagari(hi.h1), { h1: hi.h1.slice(0, 40) });
    check('nav translates', hi.nav === 'होम', { nav: hi.nav });
    check('preference stored under dashboard key', hi.stored === 'hi', { stored: hi.stored });
    check('html lang updates', hi.htmlLang === 'hi', { htmlLang: hi.htmlLang });
    check('hero stats translate', hasDevanagari(hi.heroStat), { s: hi.heroStat });
    check('header CTA translates', hasDevanagari(hi.cta), { cta: hi.cta });

    // refresh → persists
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 800));
    const afterReload = await page.evaluate(() => document.querySelector('.home-hero h1').textContent.trim());
    check('Hindi persists after refresh', hasDevanagari(afterReload), { h1: afterReload.slice(0, 40) });

    // dynamic content on home
    const dyn = await page.evaluate(() => ({
      step: document.querySelector('#homeSteps .step-card h3').textContent.trim(),
      res: document.querySelector('#homeResources .resource-card h3').textContent.trim()
    }));
    check('home steps render in Hindi', hasDevanagari(dyn.step), { s: dyn.step.slice(0, 40) });
    check('home resources render in Hindi', hasDevanagari(dyn.res), { s: dyn.res.slice(0, 40) });

    // switch back to English
    await setLang(page, 'en');
    const en = await page.evaluate(() => ({
      h1: document.querySelector('.home-hero h1').textContent.trim(),
      stored: localStorage.getItem('krishiSetuLang')
    }));
    check('switching back to English restores English', !hasDevanagari(en.h1), { h1: en.h1.slice(0, 40) });
    check('English preference stored', en.stored === 'en', { stored: en.stored });
    check('zero console errors on home (en+hi)', errs.length === 0, { errs });
    await page.close();
  }

  /* ---------- 2. DYNAMIC PAGES in Hindi ---------- */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(pageUrl('index'), { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 600));
    await setLang(page, 'hi');

    const checks = [
      ['news page cards', 'news', '.news-card h3', true],
      ['news featured', 'news', '.news-feature h3', true],
      ['schemes page cards', 'schemes', '.scheme-card h3 + p', true],
      ['schemes purpose label', 'schemes', '.scheme-card', true],
      ['resources page cards', 'resources', '.resource-card h3', true],
      ['how-it-works steps', 'how-it-works', '#stepsGrid .step-card h3', true],
      ['impact page title', 'impact', '.page-head h1', true],
      ['about page title', 'about', '.page-head h1', true],
      ['contact page title', 'contact', '.page-head h1', true],
      ['article page body', 'news-article', '.article h1', true, '?id=n1']
    ];
    for (const [name, file, sel, wantHi, qs] of checks) {
      await page.goto(pageUrl(file, qs || ''), { waitUntil: 'load', timeout: 60000 });
      await new Promise(r => setTimeout(r, 700));
      const txt = await page.evaluate(s => {
        const el = document.querySelector(s);
        return el ? el.textContent.trim() : '';
      }, sel);
      check(name + ' translates', wantHi ? hasDevanagari(txt) : !hasDevanagari(txt), { t: txt.slice(0, 50) });
    }

    // schemes: check the Purpose label specifically + docs label
    await page.goto(pageUrl('schemes'), { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 700));
    const schemeText = await page.evaluate(() => document.querySelector('.scheme-card').textContent);
    check('schemes show Hindi field labels', schemeText.indexOf('उद्देश्य:') !== -1 && schemeText.indexOf('मुख्य लाभ') !== -1);

    // support FAQs (needs support page)
    await page.goto(pageUrl('support'), { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 700));
    const faq = await page.evaluate(() => document.querySelector('#faqList summary').textContent.trim());
    check('support FAQs translate', hasDevanagari(faq), { q: faq.slice(0, 50) });

    // article title suffix + back link
    await page.goto(pageUrl('news-article', '?id=n1'), { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 700));
    const art = await page.evaluate(() => ({ title: document.title, back: document.querySelector('.article .btn').textContent.trim() }));
    check('article page title is Hindi', hasDevanagari(art.title), { t: art.title.slice(0, 60) });
    check('article back link translates', hasDevanagari(art.back), { b: art.back });
    await page.close();
  }

  /* ---------- 3. SYNC public → dashboard ---------- */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(pageUrl('index'), { waitUntil: 'load', timeout: 60000 });
    await setLang(page, 'hi');
    const stored = await page.evaluate(() => localStorage.getItem('krishiSetuLang'));
    check('public page stored hi', stored === 'hi', { stored });
    await page.goto(DASH, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2500));
    const dashLang = await page.evaluate(() => window.currentLang);
    check('dashboard receives public-site language (hi)', dashLang === 'hi', { dashLang });
    // clean up
    await page.evaluate(() => localStorage.removeItem('krishiSetuLang'));
    await page.close();
  }

  /* ---------- 4. SYNC dashboard → public ---------- */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(DASH, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.evaluate(() => localStorage.setItem('krishiSetuLang', 'hi'));
    await page.goto(pageUrl('index'), { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 800));
    const h1 = await page.evaluate(() => document.querySelector('.home-hero h1').textContent.trim());
    check('public site picks up dashboard language (hi)', hasDevanagari(h1), { h1: h1.slice(0, 40) });
    await page.evaluate(() => localStorage.removeItem('krishiSetuLang'));
    await page.close();
  }

  /* ---------- 5. cross-tab storage event ---------- */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(pageUrl('index'), { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => {
      localStorage.setItem('krishiSetuLang', 'hi');
      window.dispatchEvent(new StorageEvent('storage', { key: 'krishiSetuLang', newValue: 'hi' }));
    });
    await new Promise(r => setTimeout(r, 400));
    const h1 = await page.evaluate(() => document.querySelector('.home-hero h1').textContent.trim());
    check('storage event switches language live', hasDevanagari(h1), { h1: h1.slice(0, 40) });
    await page.evaluate(() => localStorage.removeItem('krishiSetuLang'));
    await page.close();
  }

  /* ---------- 6. other-language fallback (preference preserved) ---------- */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(pageUrl('index'), { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => localStorage.setItem('krishiSetuLang', 'mr'));
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 800));
    const r = await page.evaluate(() => ({
      h1: document.querySelector('.home-hero h1').textContent.trim(),
      stored: localStorage.getItem('krishiSetuLang'),
      lang: document.documentElement.lang
    }));
    check('unsupported-public language falls back to English content', !hasDevanagari(r.h1), { h1: r.h1.slice(0, 40) });
    check('stored preference not clobbered', r.stored === 'mr', { stored: r.stored });
    await page.evaluate(() => localStorage.removeItem('krishiSetuLang'));
    await page.close();
  }

  /* ---------- 7. MOBILE 390: switcher + no overflow ---------- */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(pageUrl('index'), { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 600));
    await setLang(page, 'hi');
    const r = await page.evaluate(() => ({
      h1: document.querySelector('.home-hero h1').textContent.trim(),
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      selVisible: !!document.getElementById('langSelect') && document.getElementById('langSelect').offsetParent !== null
    }));
    check('mobile 390: switcher visible + Hindi applied', r.selVisible && hasDevanagari(r.h1), { h1: r.h1.slice(0, 30) });
    check('mobile 390: no horizontal overflow in Hindi', !r.overflow, { sw: r.overflow });
    await page.evaluate(() => localStorage.removeItem('krishiSetuLang'));
    await page.close();
  }

  /* ---------- 8. AUTH interplay: authed CTA localizes ---------- */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem('sb-lryhcszcmhlrzrbrsces-auth-token',
          JSON.stringify({ access_token: 'stub-access', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'stub-refresh', user: { id: 'u-live', email: 'farmer@demo.in', user_metadata: { full_name: 'Ramesh Patil', role: 'farmer' } } }));
      } catch (e) {}
      const chain = () => ({
        select: chain, eq: chain, order: chain, limit: chain,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        insert: async () => ({ data: null, error: null }),
        update: async () => ({ data: null, error: null }),
        upsert: async () => ({ data: null, error: null }),
        delete: async () => ({ data: null, error: null })
      });
      const stubClient = {
        auth: {
          getSession: async () => ({ data: { session: { user: { id: 'u-live', email: 'farmer@demo.in', user_metadata: { full_name: 'Ramesh Patil', role: 'farmer' } } } } }),
          onAuthStateChange: () => ({ unsubscribe: () => {} }),
          signOut: async () => ({ error: null }),
          signInWithPassword: async () => ({ data: {}, error: { message: 'stub' } }),
          signUp: async () => ({ data: {}, error: { message: 'stub' } })
        },
        from: () => chain(),
        storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ error: null }) }) }
      };
      try {
        Object.defineProperty(window, 'supabase', { configurable: false, enumerable: true, get: () => ({ createClient: () => stubClient }), set: () => {} });
      } catch (e) { window.supabase = { createClient: () => stubClient }; }
    });
    await page.goto(pageUrl('index'), { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2500));
    const labelEn = await page.evaluate(() => document.querySelector('.header-actions .btn-primary').textContent.trim());
    check('authed CTA says Go to Dashboard', labelEn.indexOf('Dashboard') !== -1, { label: labelEn });
    await setLang(page, 'hi');
    const labelHi = await page.evaluate(() => document.querySelector('.header-actions .btn-primary').textContent.trim());
    check('authed CTA localizes to Hindi', hasDevanagari(labelHi), { label: labelHi });
    check('authed interplay: zero page errors', errs.length === 0, { errs });
    await page.evaluate(() => {
      try { localStorage.removeItem('sb-lryhcszcmhlrzrbrsces-auth-token'); } catch (e) {}
      try { localStorage.removeItem('krishiSetuLang'); } catch (e) {}
    });
    await page.close();
  }

  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });