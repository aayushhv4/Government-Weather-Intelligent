// Krishi Setu — WhatsApp Beta Demo verification
// Walks every guided flow at mobile + desktop, light + dark,
// and checks the dashboard entry point.
// Usage: node whatsapp-demo.js
const puppeteer = require('puppeteer-core');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const DEMO = pathToFileURL(path.join(ROOT, 'frontend', 'whatsapp-beta', 'index.html')).href;
const DASH = pathToFileURL(path.join(ROOT, 'frontend', 'LAST_GOV_API_GRAPHS_FINAL.html')).href + '?app=1';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + JSON.stringify(extra) : ''));
  if (!ok) failures++;
}

async function clickByText(page, text) {
  const ok = await page.evaluate((t) => {
    const btns = [...document.querySelectorAll('#chat [data-act]')];
    // prefer the most recent matching action (conversation context)
    const b = btns.reverse().find(x => x.textContent.replace(/\s+/g, ' ').trim().includes(t));
    if (b) { b.click(); return true; }
    return false;
  }, text);
  return ok;
}
async function waitTyping(page) {
  await page.waitForFunction(() => !document.querySelector('.wa-typing'), { timeout: 8000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 150));
}
async function submitForm(page, field, value) {
  const ok = await page.evaluate(([f, v]) => {
    const forms = document.querySelectorAll('#chat form[data-act]');
    const form = forms[forms.length - 1]; // the latest active form
    if (!form) return false;
    const el = form.querySelector('[name="' + f + '"]');
    if (!el) return false;
    el.value = v;
    form.querySelector('button[type="submit"]').click();
    return true;
  }, [field, value]);
  await waitTyping(page);
  return ok;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });

  for (const w of [390, 1280]) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: 900 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    await page.goto(DEMO, { waitUntil: 'load', timeout: 30000 });
    await waitTyping(page);

    // shell + labels
    const shell = await page.evaluate(() => ({
      title: document.title,
      badge: !![...document.querySelectorAll('.wa-badge')].find(x => /BETA DEMO/.test(x.textContent)),
      disclaimer: /Prototype interface for SIH demonstration/.test(document.querySelector('.wa-disclaimer').textContent),
      wide: document.documentElement.scrollWidth > window.innerWidth + 1,
      menuBtns: document.querySelectorAll('#chat [data-act="menu"]').length,
      dashHref: document.querySelector('.wa-footer a[href*="LAST_GOV_API_GRAPHS_FINAL.html"]').getAttribute('href')
    }));
    check(`shell@${w} title/badge/disclaimer`, shell.title.indexOf('WhatsApp') !== -1 && shell.badge && shell.disclaimer);
    check(`shell@${w} no horizontal overflow`, !shell.wide);
    check(`shell@${w} main menu has 8 actions`, shell.menuBtns === 8, { n: shell.menuBtns });
    check(`shell@${w} dashboard link targets app file`, shell.dashHref === '../LAST_GOV_API_GRAPHS_FINAL.html', { href: shell.dashHref });

    // theme toggle (assert the class actually flips, whichever direction)
    const before = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    await page.click('#themeBtn');
    await new Promise(r => setTimeout(r, 150));
    const after = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    check(`theme@${w} toggle flips`, before !== after, { before, after });

    // SELL MY CROP flow
    await clickByText(page, 'Sell My Crop'); await waitTyping(page);
    await clickByText(page, 'Onion'); await waitTyping(page);
    await submitForm(page, 'qty', '500');
    await clickByText(page, 'Use saved location'); await waitTyping(page);
    const sellCard = await page.evaluate(() => document.body.textContent.includes('READY TO PUBLISH') && document.body.textContent.includes('₹14,750'));
    check(`sell@${w} confirmation shows value ₹14,750`, sellCard);
    await clickByText(page, 'Publish Lot'); await waitTyping(page);
    const sellOk = await page.evaluate(() => /published successfully/.test(document.body.textContent) && /demo only/.test(document.body.textContent));
    check(`sell@${w} publish success + demo note`, sellOk);

    // back to menu, MANDI PRICES
    await clickByText(page, 'Main Menu'); await waitTyping(page);
    await clickByText(page, 'Mandi Prices'); await waitTyping(page);
    await clickByText(page, 'Tomato'); await waitTyping(page);
    const priceOk = await page.evaluate(() => document.body.textContent.includes('₹2,150') && document.body.textContent.includes('Nashik APMC'));
    check(`prices@${w} tomato card`, priceOk);

    // BUYER OFFERS — accept
    await clickByText(page, 'Main Menu'); await waitTyping(page);
    await clickByText(page, 'Buyer Offers'); await waitTyping(page);
    await clickByText(page, 'Accept'); await waitTyping(page);
    const offerOk = await page.evaluate(() => /Offer accepted/.test(document.body.textContent) && document.body.textContent.includes('OFF-901'));
    check(`offers@${w} accept flow`, offerOk);

    // PROFIT — 500 kg @ 30, transport 1200, other 500 → net ₹13,000
    await clickByText(page, 'Main Menu'); await waitTyping(page);
    await clickByText(page, 'Calculate Earnings'); await waitTyping(page);
    await submitForm(page, 'qty', '500');
    await submitForm(page, 'price', '30');
    await submitForm(page, 'cost', '1200');
    await submitForm(page, 'cost', '500');
    const net = await page.evaluate(() => {
      const el = document.querySelector('.wa-result b');
      return el ? el.textContent : null;
    });
    check(`profit@${w} net realisation ₹13,000`, net === '₹13,000', { net });

    // LOGISTICS — arrange
    await clickByText(page, 'Main Menu'); await waitTyping(page);
    await clickByText(page, 'Logistics'); await waitTyping(page);
    await clickByText(page, 'Arrange Transport'); await waitTyping(page);
    const logiOk = await page.evaluate(() => /Transport arranged/.test(document.body.textContent));
    check(`logistics@${w} arrange flow`, logiOk);

    // PAYMENTS
    await clickByText(page, 'Main Menu'); await waitTyping(page);
    await clickByText(page, 'Payments'); await waitTyping(page);
    const payOk = await page.evaluate(() => document.body.textContent.includes('₹59,000') && document.body.textContent.includes('Completed'));
    check(`payments@${w} transactions listed`, payOk);

    // SCHEMES — view PM-KISAN
    await clickByText(page, 'Main Menu'); await waitTyping(page);
    await clickByText(page, 'Government Schemes'); await waitTyping(page);
    await clickByText(page, 'PM-KISAN'); await waitTyping(page);
    const schemeOk = await page.evaluate(() => /Samman Nidhi/.test(document.body.textContent) && !!document.querySelector('a[href*="pmkisan.gov.in"]'));
    check(`schemes@${w} detail card`, schemeOk);

    // HELP
    await clickByText(page, 'Main Menu'); await waitTyping(page);
    await clickByText(page, 'Help'); await waitTyping(page);
    const helpOk = await page.evaluate(() => /guided assistant/.test(document.body.textContent) && document.querySelectorAll('#chat [data-act="menu"]').length >= 6);
    check(`help@${w} guided menu`, helpOk);

    check(`console@${w} zero page errors`, errs.length === 0, { errs });
    await page.close();
  }

  // Role-aware beta: buyer experience (mobile width)
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 900 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    await page.goto(DEMO + '?role=buyer', { waitUntil: 'load', timeout: 30000 });
    await waitTyping(page);
    const buyerMenu = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('#chat [data-act="menu"]')];
      return {
        n: btns.length,
        labels: btns.map(x => x.textContent.replace(/\s+/g, ' ').trim()),
        sub: (document.querySelector('.wa-sub') || {}).textContent || ''
      };
    });
    check('buyer beta: buyer menu with 7 actions', buyerMenu.n === 7 && buyerMenu.labels.some(t => t.indexOf('Browse Farmer Lots') !== -1) && buyerMenu.labels.some(t => t.indexOf('Payments & Escrow') !== -1) && buyerMenu.labels.every(t => t.indexOf('Sell My Crop') === -1), { n: buyerMenu.n });
    check('buyer beta: subtitle reads Buyer Assistant', buyerMenu.sub === 'Buyer Assistant', { sub: buyerMenu.sub });
    // browse lots -> make offer -> confirm
    await clickByText(page, 'Browse Farmer Lots'); await waitTyping(page);
    await clickByText(page, 'Onion'); await waitTyping(page);
    await clickByText(page, 'Make Offer'); await waitTyping(page);
    await page.evaluate(() => {
      const forms = document.querySelectorAll('#chat form[data-act="buyer-offer-qty"]');
      const form = forms[forms.length - 1];
      form.querySelector('[name="qty"]').value = '500';
      form.querySelector('[name="price"]').value = '27';
      form.querySelector('button[type="submit"]').click();
    });
    await waitTyping(page);
    const offerPreview = await page.evaluate(() => document.body.textContent.indexOf('OFFER PREVIEW') !== -1 && document.body.textContent.indexOf('₹13,500') !== -1);
    check('buyer beta: offer preview ₹13,500', offerPreview);
    await clickByText(page, 'Submit Offer'); await waitTyping(page);
    const offerOk = await page.evaluate(() => /Offer submitted to seller/.test(document.body.textContent) && /demo only/.test(document.body.textContent));
    check('buyer beta: offer submitted + demo note', offerOk);
    // landed cost check
    await clickByText(page, 'Main Menu'); await waitTyping(page);
    await clickByText(page, 'Landed Cost Check'); await waitTyping(page);
    await page.evaluate(() => {
      const forms = document.querySelectorAll('#chat form[data-act="landed-calc"]');
      const form = forms[forms.length - 1];
      form.querySelector('[name="farmgate"]').value = '2950';
      form.querySelector('[name="mandi"]').value = '3180';
      form.querySelector('[name="freight"]').value = '120';
      form.querySelector('button[type="submit"]').click();
    });
    await waitTyping(page);
    const landed = await page.evaluate(() => {
      const el = document.querySelector('.wa-result b');
      return el ? el.textContent : null;
    });
    check('buyer beta: landed saving ₹55,000 on 50MT', landed === '₹55,000', { landed });
    check('buyer beta: zero page errors', errs.length === 0, { errs });
    await page.close();
  }

  // Role-aware beta: supervisor denied direct access
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(DEMO + '?role=supervisor', { waitUntil: 'load', timeout: 30000 });
    await waitTyping(page);
    const denied = await page.evaluate(() => ({
      hasDenial: /access restricted/.test(document.body.textContent),
      menuBtns: document.querySelectorAll('#chat [data-act="menu"]').length,
      dashBtn: !!document.querySelector('#chat [data-act="open-dash"]')
    }));
    check('supervisor beta: access denied, no menu, dashboard link only', denied.hasDenial && denied.menuBtns === 0 && denied.dashBtn, denied);
    await page.close();
  }

  // Dashboard entry point exists and opens in a new tab
  async function dashProbe(page, w) {
    return page.evaluate(() => {
      const a = document.querySelector('.nav-whatsapp');
      const card = document.querySelector('.ks-wa.farmer-only');
      const cta = document.querySelector('.ks-wa.farmer-only .ks-wa-cta');
      const label = document.querySelector('.ks-wa.farmer-only');
      return {
        link: a ? { href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'), text: a.textContent.replace(/\s+/g, ' ').trim() } : null,
        cardVisible: !!card && getComputedStyle(card).display !== 'none',
        cta: cta ? { href: cta.getAttribute('href'), target: cta.getAttribute('target'), rel: cta.getAttribute('rel'), text: cta.textContent.replace(/\s+/g, ' ').trim(), h: cta.getBoundingClientRect().height } : null,
        betaLabel: !!label && /BETA DEMO/.test(label.textContent),
        disclaimer: !!label && /Prototype interface for SIH demonstration/.test(label.textContent),
        chips: label ? label.querySelectorAll('.ks-wa-chips span').length : 0,
        wide: document.documentElement.scrollWidth > window.innerWidth + 1
      };
    });
  }
  async function openDashboard(page, w) {
    await page.setViewport({ width: w, height: 900 });
    await page.goto(DASH, { waitUntil: 'networkidle2', timeout: 90000 });
    await page.evaluate(() => { try { window.demoLogin('farmer'); } catch (e) {} });
    await page.waitForFunction(() => {
      const d = document.getElementById('dashboard');
      return d && getComputedStyle(d).display !== 'none';
    }, { timeout: 45000 });
    await new Promise(r => setTimeout(r, 800));
  }
  {
    const page = await browser.newPage();
    await openDashboard(page, 1280);
    const r = await dashProbe(page, 1280);
    check('dashboard header CTA present (farmer role)', !!r.link && r.link.href === 'whatsapp-beta/index.html?role=farmer' && r.link.target === '_blank' && /noopener/.test(r.link.rel || ''), r.link);
    check('farmer card visible on farmer dashboard', r.cardVisible);
    check('farmer card CTA targets farmer beta + new tab', !!r.cta && r.cta.href === 'whatsapp-beta/index.html?role=farmer' && r.cta.target === '_blank' && /noopener/.test(r.cta.rel || ''), r.cta);
    check('farmer card beta label + disclaimer', r.betaLabel && r.disclaimer);
    check('farmer card shows 4 capability chips', r.chips === 4, { chips: r.chips });
    const demoExists = await page.evaluate(async () => {
      try {
        const res = await fetch('whatsapp-beta/index.html');
        return res.status < 400;
      } catch (e) { return false; }
    });
    check('dashboard CTA target file exists', demoExists);
    await page.close();
  }
  {
    const page = await browser.newPage();
    await openDashboard(page, 390);
    const r = await dashProbe(page, 390);
    check('farmer card mobile: visible + no page overflow', r.cardVisible && !r.wide, { wide: r.wide });
    check('farmer card mobile: CTA tappable + new tab', !!r.cta && r.cta.h >= 42 && r.cta.target === '_blank', { h: r.cta && r.cta.h });
    await page.close();
  }

  // Dashboard role behavior: buyer — buyer card + role-aware pill
  {
    const page = await browser.newPage();
    await openDashboard(page, 1280);
    await page.evaluate(() => { try { window.demoLogin('buyer'); } catch (e) {} });
    await page.waitForFunction(() => {
      const d = document.getElementById('buyerDashboard');
      return d && getComputedStyle(d).display !== 'none';
    }, { timeout: 45000 });
    await new Promise(r => setTimeout(r, 800));
    const r = await page.evaluate(() => {
      const card = document.querySelector('.ks-wa.buyer-only');
      const pill = document.querySelector('.nav-whatsapp');
      const farmerCard = document.querySelector('.ks-wa.farmer-only');
      return {
        cardVisible: !!card && getComputedStyle(card).display !== 'none',
        ctaHref: card ? (card.querySelector('.ks-wa-cta') || {}).getAttribute('href') : null,
        pillVisible: !!pill && getComputedStyle(pill).display !== 'none',
        pillHref: pill ? pill.getAttribute('href') : null,
        farmerCardHidden: !farmerCard || getComputedStyle(farmerCard).display === 'none',
        wide: document.documentElement.scrollWidth > window.innerWidth + 1
      };
    });
    check('buyer dashboard: buyer card visible + role=buyer CTA', r.cardVisible && r.ctaHref === 'whatsapp-beta/index.html?role=buyer', r);
    check('buyer dashboard: pill visible + role=buyer href', r.pillVisible && r.pillHref === 'whatsapp-beta/index.html?role=buyer', r);
    check('buyer dashboard: farmer card hidden', r.farmerCardHidden);
    check('buyer dashboard: no horizontal overflow', !r.wide);
    await page.close();
  }

  // Dashboard role behavior: supervisor — no WhatsApp beta anywhere
  {
    const page = await browser.newPage();
    await openDashboard(page, 1280);
    await page.evaluate(() => { try { window.demoLogin('supervisor'); } catch (e) {} });
    await page.waitForFunction(() => {
      const d = document.getElementById('adminDashboard');
      return d && getComputedStyle(d).display !== 'none';
    }, { timeout: 45000 });
    await new Promise(r => setTimeout(r, 800));
    const r = await page.evaluate(() => {
      const pill = document.querySelector('.nav-whatsapp');
      const cards = [...document.querySelectorAll('.ks-wa')];
      return {
        pillVisible: !!pill && getComputedStyle(pill).display !== 'none',
        pillH: pill ? pill.getBoundingClientRect().height : 0,
        visibleCards: cards.filter(c => getComputedStyle(c).display !== 'none').length
      };
    });
    check('supervisor dashboard: pill hidden', !r.pillVisible && r.pillH === 0, r);
    check('supervisor dashboard: no WhatsApp card visible', r.visibleCards === 0, { visibleCards: r.visibleCards });
    await page.close();
  }

  await browser.close();
  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });