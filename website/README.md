# Panchayat Weather Intelligence — website

Localized agro-meteorological decision support: a coarse Block-level weather signal is turned into
Panchayat-level temperature estimates, heat risk and crop advisories, with an interactive geographic
map, published validation and an assistant that explains — but never invents — the numbers.

This folder is the complete, self-contained, fully static frontend application. It has no build step,
no framework and no serverless function requirement — plain HTML5, Vanilla CSS and modern JavaScript.

---

## Structure

```
website/
├── index.html                 Public home page (what it is, why, how it works, live preview, FAQ)
├── app.html                   Weather intelligence workspace (analytics + map + advisory + assistant)
├── login.html                 Optional sign-in / account page
├── 404.html                   Custom not-found page
├── robots.txt                 Crawler policy
├── favicon.svg                Site icon
├── sitemap.xml                Static sitemap (root-relative <loc> entries)
├── vercel.json                Vercel deployment configuration, security headers & routing rewrites
├── README.md                  This file
├── css/
│   ├── website.css            Base design system: tokens, dual themes, components
│   ├── site.css               Production layer: responsive navigation, map chrome, home page, 404
│   └── vendor/leaflet.css     Vendored mapping library styles (Leaflet 1.9.4)
├── js/
│   ├── site-config.js         Optional origin configuration (canonical / social URLs)
│   ├── home.js                Home page behaviour + live product preview
│   ├── website.js             Workspace coordinator: routing, theme, i18n, alerts, KPIs
│   ├── weather.js             Weather + downscaling state and bundle fallback
│   ├── pilot-geo.js           Illustrative Panchayat tessellation and the shared colour scales
│   ├── map.js                 Geographic Leaflet map: layers, baselines, legend, detail panel
│   ├── advisory.js            Authoritative crop heat-stress rules + Weather → Action chain
│   ├── ai.js                  Agro-Meteorological Assistant client + deterministic fallback
│   ├── table-stack.js         Copies column headers onto cells so wide tables reflow on phones
│   ├── auth.js                Optional local accounts and guest session
│   └── vendor/leaflet.js      Vendored mapping library (Leaflet 1.9.4)
├── data/
│   └── weather-bundle.js      Committed offline snapshot (pilot block, 11 Panchayats, 3 lead days)
└── assets/
    └── hero-farmer-field.jpg  Social preview image (illustrative photograph)
```

---

## Running locally

Any static file server works. From the repository root:

```bash
cd website
python -m http.server 8000
```

Then open <http://localhost:8000/>.

The site is fully usable offline: it loads the bundled snapshot from `data/weather-bundle.js` and
labels the data status as *staged illustrative data*. Two local-only notes:

* The assistant queries `window.PWI_CONFIG.AI_ENDPOINT` if you configure one; with no endpoint set
  it uses its deterministic local interpreter immediately. The panel never hangs either way.
* The extension-less routes (`/app`, `/map`, `/about`, …) are Vercel rewrites. Locally use
  `app.html` and the in-page links, which are identical on both.

To run the scientific downscaling service as well, start it from the backend folder:

```bash
cd backend/weather
python -m uvicorn ksweather.app:app --host 0.0.0.0 --port 8088 --workers 1
```

The workspace probes `/health` when served or configured, but the static site never
depends on the backend service being up.

---

## Deploying to Vercel

The production site is deployed as a standalone static web application from `website/`.

### Deployment Steps

1. Import the repository in Vercel.
2. In Project Settings → **Root Directory**, set to: `website`.
3. Framework Preset: **Other**. Build Command: *(leave empty)*. Output Directory: *(leave empty)*.
4. Deploy. The `vercel.json` inside `website/` is applied automatically.

Routes served:
- `/` serves `index.html`
- `/app` serves `app.html` (along with sub-routes `/map`, `/weather`, `/advisory`, `/validation`, `/alerts`, `/provenance`, `/methodology`)
- `/login` serves `login.html`
- `404.html` is the custom not-found page
- `sitemap.xml` and `robots.txt` are served as static files
- Baseline security headers (`nosniff`, `SAMEORIGIN`, referrer policy, restrictive permissions policy) and UTF-8 charsets are set on all responses.

### Environment variables (all optional)

No environment variable is required for this deployment: the site is fully static, and the
Agro-Meteorological Assistant runs on its built-in deterministic interpreter. To connect a live
remote AI proxy, set `window.PWI_CONFIG.AI_ENDPOINT` to that proxy's URL in `index.html`
and `app.html`. Without it the assistant operates deterministically locally — no API key is
needed to load the site, and no secret is ever sent to the browser.

### Social preview and canonical URLs

Set the deployment origin in one place to publish canonical links and absolute social URLs:

```html
<script>window.PWI_CONFIG = { SITE_URL: 'https://your-deployment-host' };</script>
```

With no origin configured the site emits **no** canonical tag and **no** `og:url`, so it never
advertises a URL that does not exist. `sitemap.xml` is a static file with root-relative `<loc>`
entries, which search engines resolve against whichever host serves it.

---

## Routes

| Route | Page |
| --- | --- |
| `/` | Public home page |
| `/about`, `/how-it-works`, `/faq` | Home page, scrolled to the matching section |
| `/app` | Weather intelligence workspace (default view: Overview) |
| `/weather`, `/weather-downscaling` | Workspace, Weather Downscaling |
| `/map` | Workspace, Geographic Panchayat Map |
| `/validation` | Workspace, Validation |
| `/advisory` | Workspace, Advisory |
| `/alerts` | Workspace, Alert centre |
| `/provenance`, `/data` | Workspace, Data & Provenance |
| `/methodology` | Workspace, Methodology |
| `/login` | Optional sign-in page |
| `/sitemap.xml` | Static sitemap |
| anything else | Custom 404 page |

Every one of these works on a hard refresh — the workspace routes are client-side views of
`app.html`, and the map and assistant are re-initialised on load.

---

## Access model

**Everything scientific is public.** The workspace, all seven views, the geographic map, the
assistant, the advisory and the alerts work with no account. `auth.js` never gates a core page and
`requireAuth()` is available only for genuinely account-only pages that do not exist yet.

Signing in is optional and, in this build, entirely local: an account is stored in the browser with
a SHA-256 password hash, or you can start a clearly labelled guest session. No authentication
server is configured, so no account data leaves the device. An external identity provider
(Supabase) is wired in `auth.js` and activates only when `PWI_CONFIG.SUPABASE_URL` and
`PWI_CONFIG.SUPABASE_ANON_KEY` are set.

---

## Data honesty rules enforced in the UI

* Boundary geometry is an **illustrative tessellation** of the published pilot block envelope.
  Every map surface carries *"Illustrative boundaries — not official Gram Panchayat boundaries."*
* Weather values are **staged illustrative data** unless a live service responds; the data-status
  chip states which one is in use, and the map shows a labelled fallback if tiles are unreachable.
* Validation figures are read from the model artefact — **never hard-coded**. They are labelled
  *reanalysis hindcast validation — not operational forecast skill*.
* Uncertainty ranges are labelled *indicative — uncalibrated*.
* Technical identifiers (`t_max_c`, `rf-residual-temp-v0.3`, `source_type`, …) live inside
  expandable "technical detail" blocks or in Data & Provenance, never as primary UI labels.
