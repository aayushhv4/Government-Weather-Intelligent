# Krishi Setu — Architecture

## Frontend architecture

The entire application is **one self-contained HTML file** (`frontend/LAST_GOV_API_GRAPHS_FINAL.html`, ~15k lines). It is deliberately monolithic: the app was built as a single deliverable, and splitting it risks breaking the tight coupling between CSS classes, inline `onclick` handlers, i18n keys, and render functions. It runs with **no build step, no framework, and no npm dependencies** in the browser.

The file is organised into these regions (in order):

1. **`<head>`** — meta tags, favicon (inline SVG data URI), Supabase JS CDN, and the full CSS design system.
2. **HTML body** — every workspace as a `<section class="page">`:
   - Farmer pages (`dashboard`, `inventory`, `sell`, `farmerOffers`, `profitCalc`, `market`, `realisationEngine`, `aggregation`, `cropOutlook`, `logisticsCompare`, `instantSell`, `retailChannels`, `payments`, `farmerGuide`, `storage`, `lotPassport`, `whatsapp`, `schemes`, …)
   - Buyer pages (`buyerDashboard`, `buyerMarket`, `buyerRfq`, `buyerOrders`, `buyerPriceIndex`, `buyerContracts`, `buyerSuppliers`, `buyerLogistics`, `buyerFinancing`, `buyerGuide`, …)
   - Supervisor pages (`adminDashboard`, `adminUsers`, `adminSellers`, `adminListings`, `adminPurchases`, `adminPayments`, `adminAnalytics`, `adminRisk`, `adminAlerts`, `adminInvestigations`, `adminAudit`, `adminSettings`, …)
   - Shared (`loginPage`, `notFound`, modals, drawer, mobile menu, toast container)
3. **Main `<script>` block** — application logic in layers:
   - **Data layer** — `state` object (inventory, lots, offers, orders, contracts, notifications, admin registries), `ksEnhancements` (persisted via `localStorage`), mock catalogs (`cropCatalog`, market data) separated from backend calls
   - **Services** — Supabase client bootstrap, auth (`demoLogin`, `performAuth`, `logout`), gov-feed fetch with offline fallback, notification & WhatsApp helpers
   - **Views** — `render*` functions that rebuild page DOM from `state` (e.g. `renderInventory`, `renderFarmerOffers`, `renderCropGuide`, `renderAdminUsers`)
   - **Routing** — `showPage(pageId)` resolves nav targets, enforces role gates, shows the custom 404 for unknown ids, updates `document.title`/meta, and triggers per-page render hooks
   - **i18n** — `I18N` dictionary for 11 Indian languages (436 keys per language) + Google Translate fallback for dynamically inserted text, applied via `updateTranslations()`
   - **Theme & a11y** — `applyTheme`/`toggleTheme` (light/dark, `localStorage['ks_theme']`, system preference), high-contrast mode, font-size cycling, mobile drawer

## Client-side state and data flow

The app is **state-driven on the client**: user actions mutate `state`, then render functions rebuild the relevant DOM. This keeps the farmer journey connected — the same crop batch flows from inventory → publish → offers → profit → logistics → payment because every screen reads the same `state` records.

```
User action → handler mutates state → render*() rebuilds DOM → toast/notification feedback
```

## Authentication & roles

- `demoLogin(role)` provides one-click demo personas: **farmer**, **buyer**, **supervisor**.
- `performAuth` handles the real sign-in form; if Supabase is unreachable or the key is invalid, `DEMO_MODE` is enabled and any valid email + 6-char password falls through to the mock path.
- `showPage` enforces role gates per page group; unauthenticated users are redirected to login. `logout()` clears session and returns to login.

## Backend / Supabase

- The frontend reads `public.gov_mandi_feed_cache` for live government mandi prices and falls back to bundled offline rows.
- `backend/supabase/migrations/001–005` contain the full schema (profiles, listings, offers, orders, payments, admin governance, gov feed cache, demo seed).
- `backend/supabase/functions/refresh-gov-feed` is the server-side cron that fills the feed cache from the official AGMARKNET API — the frontend never calls external APIs directly.
- All backend access is optional: without a valid key the app runs fully in demo mode with clearly separated mock data.

## Main data flows

**Farmer journey:** login → dashboard → crop inventory → analyze (AI doctor / shelf life) → publish produce lot → buyer offers → accept/counter → profit calculator → net realisation comparison → selling channel (mandi / direct / quick-commerce) → logistics → payment.

**Buyer journey:** login → dashboard → marketplace browse → inspect lot → make offer / bid on RFQ → order → logistics → escrow settlement.

**Supervisor journey:** login → governance dashboard → registries → listing/purchase oversight → risk alerts → investigation → audit export → settings.

## Major modules

| Module | Key functions / page ids |
| --- | --- |
| Routing | `showPage`, `showNotFoundPage`, `applyPageTitle` |
| Inventory | `renderInventory`, `openAddInventoryModal`, `saveNewInventoryItem`, `quickPublishFromInventory` |
| Marketplace | `publishNewLot`, `renderFarmerOffers`, `acceptBuyerOffer`, `openCounterOffer`, `inspectLotModal`, `openMakeOfferModal` |
| Finance | `runProfitCalc`, net realisation engine, `renderPayments`, trust dashboard |
| Logistics | `renderLogistics`, `callAssignedDriver`, `openLiveVehicleMap`, storage finder, lot passport/QR |
| Retail channels | `retailChannels` page → opens official Zepto/Blinkit/Instamart partner-onboarding pages in a new tab |
| Admin | `renderAdmin*` per page, `refreshAdminData`, user drawer, audit export |
| i18n | `I18N`, `updateTranslations`, `changeLanguage`, `openMainTranslator` |
| Theme | `applyTheme`, `toggleTheme`, `toggleHighContrast`, `cycleFontSize` |

## Intentional decisions

- **Single file kept** — moving to modules is a pre-submission nice-to-have, not a functional need; see `docs/SETUP.md` for a safe split strategy.
- **No fake integrations** — retail channels open the platforms' real partner pages; logistics GPS is a clearly labelled mock; WhatsApp alerts are a local toggle; no external API is claimed that does not exist.
- **Private app, not SEO-indexed** — `robots noindex`, no sitemap/robots/LocalBusiness schema, because the product is an authenticated platform, not a public marketing site.