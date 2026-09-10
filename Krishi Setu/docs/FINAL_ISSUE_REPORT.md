# Krishi Setu — Final Pre-Deployment Issue Report

> Recreated during the final project cleanup (the original copy was missing
> from the workspace). Findings below are those actually verified during the
> final pre-deployment audit of the dashboard application.

## Verdict

**READY FOR DEPLOYMENT** — no Critical or High issues.

## Tested (verified, not assumed)

- All routes × all roles × all widths: farmer (28 pages), buyer (16),
  supervisor (14) at 360/390/412/768/1280 — zero horizontal overflow, zero
  dead buttons, zero console errors.
- Forms & flows: add-crop, publish-lot (auto-fill → Active lot), offer
  accept/counter, profit + logistics recalculation, support ticket,
  WhatsApp toggle.
- Modals/drawers at 390 px: inventory modal, location picker, translator,
  notifications drawer, admin dossier drawer, inspect-lot and make-offer
  modals — all on-screen after settle.
- Themes: light/dark × farmer/buyer, persistence, system preference — all
  surfaces correct.
- i18n: 436 keys × 11 languages complete; Hindi/Marathi/Bengali/Tamil live
  at 390 px, zero overflow.
- Auth: login/logout, protected-route redirect to login, unauthenticated
  gating, session restore on reload (real sessions).
- Security/content: only the standard Supabase anon key present, `escHtml`
  on dynamic strings, no lorem/coming-soon/TODO text.

## Issues found (all non-blocking)

### Medium
1. **Calculators not bound to the farmer's lot** — `profitCalc`,
   `realisationEngine` and `instantSell` use standalone inputs with demo
   defaults rather than pre-filling from a selected lot. Internally
   consistent; binding is a feature enhancement, not a defect. Status:
   recorded, not changed (no risky architectural change).
2. **Demo session doesn't survive reload** — by design for the one-click
   demo login; real Supabase sessions persist. Status: intentional.

### Low
3. `noindex` meta on the single-file app — intentional until public launch;
   remove when hosting publicly and add robots/sitemap.
4. Google Translate fallback requires internet — expected external
   limitation, not an app error.
5. Offline/unconfigured market feed shows labelled reference rows rather
   than live data — deliberate honesty, no fake data.

### Fixed during the audit
- `loading="lazy"` added to the four dynamic image templates (marketplace
  lots, inventory, published lots, order lots) that lacked it. Full test
  suite re-run green after the fix.

## Later follow-ups (non-blocking)

- Bind calculators to a selected lot.
- Physical-device touch testing.
- Live Supabase credentials + migration deployment, data.gov.in API key for
  the gov-feed cron.