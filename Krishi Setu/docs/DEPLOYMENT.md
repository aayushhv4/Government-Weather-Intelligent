# Krishi Setu — Deployment Guide (Vercel + Supabase)

This project is a **static, no-build website**. There is no framework, no
server, and no build step. The repo root contains `index.html` (the product
entry point, which redirects to the public Government homepage) and the
`Krishi Setu/` project folder. All links between the public site, the
dashboard and the WhatsApp Beta are **relative paths**, so the same structure
works locally and when hosted — no URL rewriting is required.

---

## 1. Vercel settings (exact)

| Setting          | Value                                      |
| ---------------- | ------------------------------------------ |
| Git repository   | Initialize git in the **workspace root** (`Desktop\krishisetu`, the folder containing `index.html` and `Krishi Setu/`) |
| Root Directory   | `.` (repo root — leave default)            |
| Build Command    | None                                       |
| Output Directory | None (static — leave default)              |
| Install Command  | None                                       |
| Framework Preset | **Other**                                  |

A `vercel.json` **is** now included (`Krishi Setu/vercel.json`):

- `/` is rewritten to `/frontend/public-site/government-version/index.html` — the
  Government public homepage is the default entry point.
- `/platform` and `/platform/*` are rewritten to
  `/frontend/LAST_GOV_API_GRAPHS_FINAL.html` — the authenticated dashboard.

The Vercel root directory is still `.` on the repo root (the folder containing
`index.html` and `Krishi Setu/`).

---

## 2. Supabase settings (exact)

### Project URL / keys (browser-safe, already inline in the code)

The frontend uses the **anon / publishable** key only (correct usage):

- `frontend/LAST_GOV_API_GRAPHS_FINAL.html` → `SUPABASE_URL`,
  `SUPABASE_PUBLISHABLE_KEY`
- `frontend/public-site/government-version/js/auth.js` (and premium) →
  `CONFIG.supabaseUrl`, `CONFIG.supabaseAnonKey` (same values)

These are intentionally inline because the deployment is static and
no-build. The anon key is safe to expose. **Never** put the service-role key
in frontend code — it is only used inside the Edge Function
(`backend/supabase/functions/refresh-gov-feed`), where Supabase injects it.

### Authentication settings (Auth → URL Configuration)

| Setting      | Value                                                                 |
| ------------ | --------------------------------------------------------------------- |
| **Site URL** | `https://YOUR-VERCEL-DOMAIN/` (the deployed root — this is where the root `index.html` lives) |

The app's email-confirmation redirect is generated at runtime as the app's
own URL (`window.location.origin + window.location.pathname`), which after
deployment is:

**Redirect URL** (add exactly, in Auth → URL Configuration → Redirect URLs):

```
https://YOUR-VERCEL-DOMAIN/Krishi%20Setu/frontend/LAST_GOV_API_GRAPHS_FINAL.html
```

That is the precise URL the app passes as `emailRedirectTo` on signup
(`frontend/LAST_GOV_API_GRAPHS_FINAL.html`, `getAuthRedirectUrl()`). Keep
the `%20` encoding exactly as shown (it matches what the browser generates).
If you ever restructure the repo so the app lives at a different path,
update this entry to match. For extra flexibility the app also accepts a
`window.KRISHISETU_APP_URL` override before its scripts run.

Flow after configuration: create account → Supabase email confirmation →
link lands on the app file → session restored → dashboard. No second login.

### Edge Function secrets (Edge Functions → refresh-gov-feed → Secrets)

| Secret             | Purpose                                          |
| ------------------ | ------------------------------------------------ |
| `GOV_API_KEY`      | data.gov.in API key for the government mandi-feed refresh |
| `SUPABASE_URL`     | auto-injected by Supabase (do not set manually)  |
| `SUPABASE_SERVICE_ROLE_KEY` | auto-injected by Supabase (do not set manually)  |

The `refresh-gov-feed` function is optional at deploy time: the app works
fully offline with its labeled demo mandi data.

---

## 3. Central configuration points (edit at deploy time if the structure changes)

| Concern                | Location                                                                 |
| ---------------------- | ------------------------------------------------------------------------ |
| Public → platform URL  | `frontend/public-site/*/js/data.js` → `KS.platformUrl` (`'../../LAST_GOV_API_GRAPHS_FINAL.html'`) |
| Dashboard → public home| `frontend/LAST_GOV_API_GRAPHS_FINAL.html` head pre-paint script → `window.KRISHISETU_PUBLIC_HOME` |
| Email redirect URL     | `frontend/LAST_GOV_API_GRAPHS_FINAL.html` → `KRISHISETU_APP_URL` / `getAuthRedirectUrl()` |
| WhatsApp Beta links    | dashboard cards + sidebar pill → `whatsapp-beta/index.html?role=...`      |

## 3b. Handled automatically by the front-door fix in this pass

- Public → platform URL is now `/platform/` (set once in `data.js`; `auth.js` appends `?intent=login` for guests).
- Platform-side navigation (dashboard logo, sidebar pill, WhatsApp cards) remains the existing relative path to the app file.

---

## 4. MapTiler

The project does **not** use MapTiler, Leaflet or any map tile service. The
only geospatial call is an HTTPS Nominatim (OpenStreetMap) reverse-geocode
fetch inside the dashboard — public API, production-safe, no key required.
Nothing to configure.

---

## 5. WhatsApp Beta

`frontend/whatsapp-beta/` — an isolated SIH prototype, clearly labeled
BETA DEMO with a "production WhatsApp Business API is not connected"
disclaimer. Role-aware: farmer menu, buyer menu (`?role=buyer`), supervisor
access denied. Entry points: dashboard farmer/buyer cards and the sidebar
pill. It is a static page — deploys as-is with the rest of the site.

---

## 6. Deploy checklist (after Vercel + Supabase are connected)

1. `cd Desktop\krishisetu` (the folder with `index.html`) → `git init`, add, commit, push to GitHub.
2. Import the repo in Vercel (settings from section 1 — defaults are correct).
3. Set Supabase Auth Site URL + Redirect URL (section 2).
4. Add the `GOV_API_KEY` secret (optional — the demo data pipeline works without it).
5. Deploy and test `https://YOUR-DOMAIN/` — expect the Government public homepage.
6. Test the full journey: public → Open Platform → login → dashboard → logo → public → Open Platform (no second login) → logout → public.
7. Test email confirmation end-to-end from the live domain.