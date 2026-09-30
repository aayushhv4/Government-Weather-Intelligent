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
| Git repository   | The git root (`Desktop\krishisetu`)        |
| Root Directory   | **`Krishi Setu`** — this is the Vercel project root. `vercel.json` lives inside it, and every rewrite path (`/frontend/...`, `/public-site/...`) is relative to it. Leaving this at `.` makes every rewrite 404. |
| Build Command    | None                                       |
| Output Directory | None (static — leave default)              |
| Install Command  | None                                       |
| Framework Preset | **Other**                                  |

Verified: `tests/integration/rewrite-qa.js` compiles `vercel.json` with Vercel's own
`@vercel/routing-utils` compiler and resolves all 38 routes against the simulator.

A `vercel.json` **is** included (`Krishi Setu/vercel.json`):

- `/` is rewritten to `/frontend/public-site/government-version/index.html` — the
  Government public homepage is the default entry point.
- `/platform` and `/platform/*` are rewritten to
  `/frontend/LAST_GOV_API_GRAPHS_FINAL.html` — the authenticated dashboard.

---

## 1b. Panchayat Weather Intelligence — the standalone website

The final product is the self-contained website in
**`website/`** (see `website/README.md`). It has no build step
and no framework. Two configurations work; **Option A is recommended** because it needs no path
rewriting at all.

### Option A (recommended) — Root Directory = `website`

| Setting | Value |
| --- | --- |
| Root Directory | `website` |
| Framework Preset | **Other** |
| Build / Output / Install Command | None |

The `vercel.json` inside that folder is used. `/` opens the public home page directly, `/app`
opens the weather workspace, `/login` opens the optional sign-in page, `404.html` is the custom
404, and `sitemap.xml` + `robots.txt` are served as static files.

> The product has no serverless functions and cannot gain one from this repository: Vercel derives
> function names from the repository path, and `Krishi Setu/…` contains a space, which the platform
> rejects with "A Serverless Function has an invalid name". Keep the deployment fully static.
> (The former `api/sitemap.js` and `api/assistant.js` were removed on that basis; the sitemap is
> now a static file and the assistant uses its deterministic local interpreter.)

### Option B — Root Directory = `Krishi Setu`

| Setting | Value |
| --- | --- |
| Root Directory | `Krishi Setu` |
| Framework Preset | **Other** |

`Krishi Setu/vercel.json` rewrites every public route into
`website/`, and `Krishi Setu/404.html` is the custom 404.

> Note: the small `index.html` / `login.html` redirect stubs that used to sit in `Krishi Setu/`
> have been removed. Vercel resolves static files before rewrites, so those stubs would have
> shadowed the `/` and `/login.html` rewrites and served a redirect page instead of the home page.

### Environment variables (all optional)

None are required for the static deployment. The assistant runs on its deterministic local
interpreter. (The previous `GEMINI_API_KEY` / `AI_API_KEY` variables belonged to the removed
serverless proxy; a live AI provider would now need a proxy hosted outside this repository, set
via `window.PWI_CONFIG.AI_ENDPOINT`.)

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

## 6. Panchayat Weather Intelligence service (SIH26074)

A second, **separate** deployment. The static Vercel setup above is unchanged:
no new route, root directory, framework, build command or output directory.

| Setting | Value |
| --- | --- |
| Source | `backend/weather/` |
| Runtime | Docker (`backend/weather/Dockerfile`, base `python:3.11-slim`) |
| Port | `8088` |
| Health check | `GET /health` |
| Start command | `uvicorn ksweather.app:app --host 0.0.0.0 --port 8088 --workers 1` |
| Required env | `WEATHER_CORS_ORIGINS=https://YOUR-DOMAIN` |
| Optional env | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-side only) |

Model artifacts are built inside the image (`RUN python scripts/train_model.py`),
so start-up is instant. Apply
`backend/supabase/migrations/006_weather_intelligence.sql` for the five weather
tables.

Then point the dashboard at the service — either a Vercel rewrite
(`/weather-api/:path*` → `https://<service-host>/:path*`) or a global in the
dashboard `<head>`:

```html
<script>window.KS_WEATHER_API_BASE = 'https://<service-host>';</script>
```

If the service is unreachable the module falls back to the bundled snapshot and
labels itself as offline — the demo does not break.

Full detail: `docs/WEATHER_INTELLIGENCE.md`.

---

## 7. Deploy checklist (after Vercel + Supabase are connected)

1. `cd Desktop\krishisetu` (the git root) → `git init`, add, commit, push to GitHub.
2. Import the repo in Vercel, set **Root Directory = `Krishi Setu`** (section 1), leave build/output/install commands empty.
3. Set Supabase Auth Site URL + Redirect URL (section 2).
4. Add the `GOV_API_KEY` secret (optional — the demo data pipeline works without it).
5. Deploy and test `https://YOUR-DOMAIN/` — expect the Government public homepage.
6. Test the full journey: public → Open Platform → login → dashboard → logo → public → Open Platform (no second login) → logout → public.
7. Test email confirmation end-to-end from the live domain.
8. (Optional) deploy `backend/weather` (section 6) and set `KS_WEATHER_API_BASE`; then open **WEATHER INTELLIGENCE → Panchayat Weather** and confirm the banner reads "live downscaling service connected".
9. Run `cd tests && npm run routing && npm run weather && npm run bridge` against the deployed domain and confirm no regressions.