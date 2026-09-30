# Panchayat Weather Intelligence — website

Localized agro-meteorological decision support: a coarse Block-level weather signal is turned into
Panchayat-level temperature estimates, heat risk and crop advisories, with an interactive geographic
map, published validation and an assistant that explains — but never invents — the numbers.

This folder is the complete, self-contained, fully static product. It has no build step, no
framework and no serverless functions — plain HTML, CSS and JavaScript. (A serverless function
cannot be used from this repository: Vercel derives function names from the repo path, and
`Krishi Setu/…` contains a space, which the platform rejects at build time.)

---

## Structure

```

├── index.html                 Public home page (what it is, why, how it works, live preview, FAQ)
├── app.html                   Weather intelligence workspace (analytics + map + advisory + assistant)
├── login.html                 Optional sign-in / account page
├── 404.html                   Custom not-found page
├── robots.txt                 Crawler policy
├── favicon.svg                Site icon
├── sitemap.xml                Static sitemap (root-relative <loc> entries)
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
│   └── weather-bundle.js      Committed offline snapshot (no build step on deploy)      Bundled deterministic snapshot (pilot block, 11 Panchayats, 3 lead days)
└── assets/
    └── hero-farmer-field.jpg  Social preview image (illustrative photograph)
```

---

## Running locally

Any static file server works. From this folder:

```bash
cd website
python -m http.server 8000
```

Then open <http://localhost:8000/>.

The site is fully usable offline: it loads the bundled snapshot from `data/weather-bundle.js` and
labels the data status as *staged illustrative data*. Two local-only notes:

* The assistant tries `window.PWI_CONFIG.AI_ENDPOINT` if you configure one; with no endpoint set
  it uses its deterministic local interpreter immediately. The panel never hangs either way.
* The extension-less routes (`/app`, `/map`, `/about`, …) are Vercel rewrites. Locally use
  `app.html` and the in-page links, which are identical on both.

To run the scientific service as well, start it from the backend folder (it is already complete):

```bash
cd "Krishi Setu/backend/weather"
../.venv-weather/Scripts/uvicorn ksweather.app:app --host 0.0.0.0 --port 8088 --workers 1
```

The workspace probes `/health` only when it is served from port 8088, so the static site never
depends on the service being up.

---

## Deploying to Vercel

Two configurations are committed so the deployment works whichever root directory you choose.
Pick **option A** unless you have a reason not to.

### Option A — Root Directory = `website` (recommended, simplest)

1. Import the repository in Vercel.
2. Project Settings → **Root Directory** → `website`.
3. Framework Preset: **Other**. Build Command: *(empty)*. Output Directory: *(empty)*.
4. Deploy. The `vercel.json` in this folder is picked up automatically.

`/` serves `index.html`, `/app` serves `app.html`, `/login` serves `login.html`, `404.html` is the
custom not-found page, and `sitemap.xml` + `robots.txt` are served as static files.

### Option B — Root Directory = `Krishi Setu`

1. Project Settings → **Root Directory** → `Krishi Setu`.
2. Deploy. `Krishi Setu/vercel.json` rewrites every public route into
   `website/`. `Krishi Setu/404.html` is the custom not-found page.

> Prefer Option A. The repository path `Krishi Setu/…` contains a space, and Vercel derives
> serverless-function names from the repository path — with Option B any function inside the
> project fails the build with "invalid Serverless Function name". This site ships no functions,
> so it deploys cleanly either way, but Option A keeps the production path space-free.

Both configurations set `charset=utf-8` explicitly on HTML/CSS/JS responses and add baseline
security headers (`nosniff`, `SAMEORIGIN`, referrer policy, a restrictive permissions policy).

### Environment variables (all optional)

No environment variable is required for this deployment: the site is fully static, and the
Agro-Meteorological Assistant runs on its built-in deterministic interpreter. Because a serverless
function cannot ship from this repository (see the note at the top), a live AI provider would need
a proxy hosted elsewhere; set `window.PWI_CONFIG.AI_ENDPOINT` to that proxy's URL in `index.html`
and `app.html` if you run one. Without it the assistant stays local — no key is ever needed to load
the site, and no key is ever sent to the browser.

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
