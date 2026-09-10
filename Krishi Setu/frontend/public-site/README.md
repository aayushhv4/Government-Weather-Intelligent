# Krishi Setu Public Website — Two Design Directions

Two independent websites for the same Krishi Setu product and the same
public information, so you can compare two visual directions without
risking the content architecture.

```
frontend/public-site/     (inside the Krishi Setu project)
├── government-version/   ← V1: official / information / trust
│   ├── index.html        Home
│   ├── about.html        About Krishi Setu
│   ├── how-it-works.html The farmer journey
│   ├── schemes.html      Government scheme directory
│   ├── news.html         News & updates (sample stories)
│   ├── news-article.html Article detail (?id=)
│   ├── resources.html    Resource library
│   ├── impact.html       Impact overview (demo figures)
│   ├── support.html      FAQ + support channels
│   ├── contact.html      Demo contact form
│   ├── css/styles.css
│   ├── js/data.js        Shared content layer (duplicated per version on purpose)
│   ├── js/main.js        Restrained interactions
│   └── assets/           (reserved for images)
│
├── premium-version/      ← V2: premium / animated / interactive
│   ├── (same 10 pages)
│   ├── css/styles.css    Light/Dark theme + motion system
│   ├── js/data.js        Identical content to V1
│   └── js/main.js        Theme, reveals, counters, filters, menu
│
└── README.md
```

## How they differ

| | V1 Government | V2 Premium |
|---|---|---|
| Feel | Official, structured, accessible | Editorial, cinematic, interactive |
| Layout | Flat bordered cards, plain hero | Full-bleed hero, scroll-story sections |
| Motion | Hover/focus only, smooth anchors | Scroll reveals, counters, marquee, float |
| Theme | Single light theme (high contrast) | Light + Dark with toggle, persisted |
| Nav | Utility bar + underline nav | Sticky glass nav + overlay mobile menu |
| News | Structured cards + featured | Featured editorial + animated cards |
| Schemes | Static cards + filter | Expandable cards + filter + search |

## Content parity (identical in both)

- Same brand, tagline, hero message, what-is copy
- Same 6-step farmer journey
- Same government scheme directory (10 schemes, real schemes, official links)
- Same 6 sample news stories (clearly labelled "sample")
- Same 12-entry resource library
- Same 6 support FAQs
- Same demo impact statistics (asterisk-labelled)
- Same platform CTA → opens the real Krishi Setu application

## Opening the platform

Every public → platform link uses the **single** `KS.platformUrl` value in
`js/data.js` (`../../LAST_GOV_API_GRAPHS_FINAL.html`), which resolves to the
main application at `frontend/LAST_GOV_API_GRAPHS_FINAL.html` (this folder
lives at `frontend/public-site/` inside the project). `js/auth.js` (V1
government site) rewrites every platform CTA from that one config — there
are no hardcoded paths elsewhere. If you deploy the public site separately,
update `KS.platformUrl` in one place.

## Integration with the application (one product)

The **government version is the public front door** of the Krishi Setu
product — and the **default entry point**. It shares the existing
authentication with the application — no second auth system, no duplicated
sessions:

- Opening the product starts on the public homepage: a root `index.html`
  (one folder above this one) redirects there, and the application itself
  routes unauthenticated visitors who open it directly to this homepage
  instead of parking them on the login screen. The login screen is shown
  only when the app is opened with an explicit login intent.
- **No login flash:** the app's `<head>` contains a tiny synchronous
  pre-paint routing script (PUBLIC-FIRST PRE-PAINT ROUTING) that runs
  before the first frame. Public initial entry (no login intent, no stored
  session) redirects to this homepage before anything is painted; a stored
  session/demo login hides the login screen pre-paint and boots neutral
  until the session restores — so the login page is never the first
  visible frame in either direction.

- `js/auth.js` loads the same Supabase client the application uses and
  **reads** the existing session. A guest sees "Open Platform"; a logged-in
  user sees "Go to Dashboard" and jumps straight into the app — no second
  login (the app's own boot restores its session).
- The Supabase project URL + anon key live at the top of `js/auth.js`
  (public anon key, safe to embed — it must match the application's
  `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`).
- The application side: the sidebar logo opens this public homepage
  (`KRISHISETU_PUBLIC_HOME_URL` in the app config, default
  `public-site/government-version/index.html`), and **Logout**
  returns here with the session cleared — "Open Platform" then asks for
  login again.
- Every "Open Platform" CTA carries `?intent=login` (added automatically
  by `js/auth.js`): guests land on the existing login screen, while
  authenticated users skip it and go straight to the dashboard. The app
  also honours `?app=1` for tooling/embedded use.

For session sharing to work, serve both from the **same origin** — e.g.
host the whole `krishisetu/` workspace under one domain/path, or run a
local server from `Desktop/krishisetu/` (`python -m http.server`). When
both are on the same origin, the Supabase session and preferences are
shared automatically. Opened directly via `file://`, links still work, but
session sharing depends on the browser's file:// storage rules.

## Languages (government version)

The Government site has a **real language switcher** (🌐 dropdown in the
utility bar) backed by `js/i18n.js`:

- It reads and writes the **same `krishiSetuLang` preference the dashboard
  uses**, so public ⇄ dashboard stay synchronized in both directions
  (Hindi on the public home → the dashboard opens in Hindi, and vice
  versa; a `storage` listener also syncs open tabs live).
- The dropdown offers all 11 dashboard language codes. **English** and
  **Hindi** have full dictionaries (chrome, page headings, and the dynamic
  news/schemes/resources/steps/FAQ/article content). The other languages
  are recognized and preserved, and display English content until their
  public dictionaries are added — the stored preference is never
  clobbered or mixed.
- Static text uses `data-i18n` attributes; dynamic sections re-render via
  `window.KS_RENDER` after the shared `KS` content layer is swapped, so
  nothing is left half-translated.
- Changing language never touches the session, theme or auth state.

The premium version keeps its original single-language presentation.

## Independence

The versions are fully independent. Delete `premium-version/` and V1 keeps
every page and all content; delete `government-version/` and V2 keeps
everything. Each carries its own copy of the content data — duplication is
intentional so neither depends on the other.

## Content honesty

Nothing on these sites claims official status or real results:

- News stories are labelled **sample**
- Statistics are labelled **demo** (asterisk)
- Scheme summaries are *guidance only* and link to official portals
- The contact form and helpline are demo-only

## Run / deploy

Both versions are plain static HTML — open `index.html` in a browser or
host the folder on any static server. No build step, no dependencies,
no external assets (fonts/images are system + inline SVG), so they work
fully offline.

## QA baseline

Both versions were verified headless in Chrome at 390/768/1280 px:

- every page loads, no horizontal overflow, no console errors
- all nav links, CTAs, filters and search work
- V2: light/dark toggle persists, counters animate, reveals fire,
  `prefers-reduced-motion` disables animation