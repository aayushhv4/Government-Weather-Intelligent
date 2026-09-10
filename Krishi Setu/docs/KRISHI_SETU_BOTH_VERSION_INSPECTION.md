# KRISHI SETU — BOTH VERSION INSPECTION REPORT

- Date of inspection: September 8, 2026
- Scope: `Krishi Setu Public/` — `government-version/` (V1) and `premium-version/` (V2)
- Mode: INSPECTION ONLY. No files were modified, fixed, deleted, or reformatted during this inspection.
- Method: static file scan + headless Chromium (Puppeteer) at 360 / 375 / 390 / 412 / 768 / 1024 / 1280 / 1440 px; console, network, a11y, theme, interaction probes on every page of both versions.

Two defects that existed earlier (news grid not rendering at load in V2; scheme/resource filter attribute mismatch in V2) were fixed **before** this inspection and are verified working in the current state. They are noted under each version for completeness, with status "Already resolved (pre-inspection)".

---

# Executive Summary

- **V1 (Government):** Information-complete, structurally sound, fully responsive, zero console/network errors, zero horizontal overflow at any width, clean accessibility baseline. **One genuine gap: there is no dark mode at all** (no toggle button, no dark CSS, system preference ignored). This is a feature gap versus the final QA expectation that dark mode works on both versions, but it does not break any V1 functionality.
- **V2 (Premium):** Information-complete, fully responsive, zero console/network errors, zero horizontal overflow at any width, clean accessibility baseline. Dark/light theme toggle, persistence and system-preference detection all work correctly (verified with corrected measurement). No high or critical issues.
- Both versions carry byte-identical content (`js/data.js`), the same 10-page information architecture, and are fully independent (each ships its own css/js/data; neither references the other).
- **No CRITICAL or HIGH findings in either version. No deployment blockers within the current local setup.**

Findings totals:

| | CRITICAL | HIGH | MEDIUM | LOW |
|---|---|---|---|---|
| Version 1 (Government) | 0 | 0 | 1 | 4 |
| Version 2 (Premium) | 0 | 0 | 0 | 3 |

---

# Version 1 — Government

## Critical
- None.

## High
- None.

## Medium

### V1-M1 — No dark mode exists
- **Page:** All pages (site-wide)
- **Severity:** Medium
- **Problem:** The government version has no dark theme. There is no theme toggle button in any page (`themeBtn` / theme-toggle: zero matches in all 10 pages), `css/styles.css` contains zero `dark` / `prefers-color-scheme` rules, and `js/main.js` contains no theme code. The page background remains `rgb(246, 248, 245)` regardless of the system preference (headless Chromium reports `prefers-color-scheme: dark` on this machine and the site ignores it).
- **Evidence:** `grep` for theme identifiers across V1 pages = 0 matches; `grep -c "dark|prefers-color-scheme" government-version/css/styles.css` = 0; headless probe: `hasBtn=false`, `persistedDark=false`, `bg=rgb(246, 248, 245)` at 360/375/1280 px.
- **Likely cause:** Dark mode was never implemented for V1. The original V1 brief specified an official/light design and did not list dark mode; only the final two-version QA checklist ("Light mode works / Dark mode works") implies it for both versions.
- **Recommended fix (not applied — inspection only):** Add a minimal dark palette via a `.dark` class or `prefers-color-scheme` media query plus a small toggle, mirroring V2's token approach. This is a small, safe addition.
- **Blocks deployment:** No (V1 is fully usable in light mode; it is a polish/parity gap).

## Low

### V1-L1 — Heading hierarchy skips a level (h1 → h3)
- **Page:** how-it-works.html, schemes.html, news.html, news-article.html, resources.html, contact.html (desktop and mobile)
- **Severity:** Low
- **Problem:** On these six pages the hero `h1` is followed directly by `h3` card titles with no `h2` in between (e.g. schemes: h1 "Every scheme, one search away." → h3 "Platform…"). Screen-reader heading navigation jumps from h1 to h3.
- **Evidence:** Heading-sequence probe: `1→3 prev:«Every scheme, one search away» next:«Platform»` (and equivalents on the other five pages, both versions).
- **Likely cause:** Card titles were authored as `h3` and section pages omit an `h2` wrapper heading after the hero.
- **Recommended fix:** Add a visually-light `h2` section heading above each card grid (or demote card titles to match a consistent h1→h2→h3 flow).
- **Blocks deployment:** No.

### V1-L2 — Small touch targets on mobile (text links < 34 px)
- **Page:** All pages at ≤412 px (footer links, language links "English/हिन्दी", "Read more →", "Official portal ↗", nav text links)
- **Severity:** Low
- **Problem:** 12–23 interactive targets per page measure under 34 px tall at 390 px (typical text links ~25 px). This meets the WCAG 2.5.8 minimum target size (24 px) but is below the 44 px comfortable-touch recommendation.
- **Evidence:** a11y probe: `government-version/index.html @390px: smallTargets(18)=["English","हिन्दी","Read more →","Read more →"]` etc.; main menu button is 44 px (fine).
- **Likely cause:** Inline text links in footer/nav/body use default text line-height without padding.
- **Recommended fix:** Add padding/line-height to standalone footer & language links on mobile (44 px targets).
- **Blocks deployment:** No.

### V1-L3 — No `prefers-reduced-motion` handling
- **Page:** Site-wide (CSS + JS)
- **Severity:** Low
- **Problem:** `styles.css` has no `prefers-reduced-motion` rule (V1 has little animation: `scroll-behavior:smooth` on `html` only). The smooth-scroll anchor behavior is not disabled for users requesting reduced motion.
- **Evidence:** CSS scan: `reduced-motion rules=0`, `focus rules=2`, `focus-visible rules=1`.
- **Likely cause:** Minimal-motion design was implemented without an explicit reduced-motion guard.
- **Recommended fix:** Wrap `html{scroll-behavior:smooth}` in a `@media (prefers-reduced-motion: no-preference)` query.
- **Blocks deployment:** No.

### V1-L4 — SEO extras absent (canonical, Open Graph, robots, sitemap)
- **Page:** All pages (site-wide)
- **Severity:** Low
- **Problem:** Both versions have per-page `<title>` and `<meta name="description">` and an inline SVG favicon, but no `rel="canonical"`, no Open Graph tags, no robots meta, and no `robots.txt` / `sitemap.xml` files exist.
- **Evidence:** Head scan on V1 index: `meta desc: true`, `canonical: false`, `favicon: true`, `og tags: 0`, `robots: false`; no robots.txt/sitemap.xml in either folder.
- **Likely cause:** Sites are demo/static and were built without a deployment-stage SEO pass.
- **Recommended fix:** Add canonical + OG tags at launch; publish robots.txt + sitemap.xml when the final domain is chosen.
- **Blocks deployment:** No (recommended before public launch only).

---

# Version 2 — Premium

## Critical
- None.

## High
- None.

## Medium
- None.

## Low

### V2-L1 — Heading hierarchy skips a level (h1 → h3)
- **Page:** how-it-works.html, schemes.html, news.html, news-article.html, resources.html, contact.html (desktop and mobile)
- **Severity:** Low
- **Problem:** Same h1→h3 skip as V1 (e.g. news: h1 "Fresh from the field." → h3 "Krishi Setu connects Nas…"). Card titles render as `h3` with no `h2` between hero and grid.
- **Evidence:** Heading-sequence probe: `1→3 prev:«Fresh from the field.» next:«Krishi Setu connects Nas…»` on news.html @390 and @1280.
- **Likely cause:** Same authorship pattern as V1 (card `h3` titles, no section `h2`).
- **Recommended fix:** Add section `h2` headings above grids or re-level card titles.
- **Blocks deployment:** No.

### V2-L2 — Small touch targets on mobile (text links < 34 px)
- **Page:** All pages at ≤412 px (footer links "Home / How It Works / Impact / Open the Platform", "Official portal ↗" scheme links)
- **Severity:** Low
- **Problem:** 10–20 interactive targets per page measure under 34 px tall at 390 px (typical ~25 px text links). Meets the 24 px WCAG minimum, below the 44 px recommendation. Main nav burger is 44 px (fine).
- **Evidence:** a11y probe: `premium-version/index.html @390px: smallTargets(10)=["Home","How It Works","Impact","Open the Platform"]`; `premium-version/schemes.html @390px: smallTargets(20)=["Official portal ↗",…]`; nav heights probe: brand 59 px, burger 44 px.
- **Likely cause:** Inline text links without padding in footer and scheme cards.
- **Recommended fix:** Add padding/line-height to standalone links on mobile.
- **Blocks deployment:** No.

### V2-L3 — SEO extras absent (canonical, Open Graph, robots, sitemap)
- **Page:** All pages (site-wide)
- **Severity:** Low
- **Problem:** Same as V1-L4: titles, descriptions and favicon present; canonical, OG, robots meta, robots.txt and sitemap.xml absent.
- **Evidence:** Head scan on V2 index: `canonical: false`, `og tags: 0`, `robots: false`.
- **Likely cause:** Demo/static build without a deployment SEO pass.
- **Recommended fix:** Add canonical + OG tags at launch; publish robots.txt + sitemap.xml at final domain.
- **Blocks deployment:** No.

---

# Shared Problems

### S-1 — Platform CTA is a relative filesystem path
- **Page:** All pages, both versions ("Open Platform" / "Open the Platform" links; also `data.js → platformUrl`)
- **Severity:** Medium
- **Problem:** The primary CTA points to `../../Krishi Setu/frontend/LAST_GOV_API_GRAPHS_FINAL.html`. This resolves correctly only when the site is opened inside the current `Desktop\krishisetu\` tree. If either version is deployed standalone (GitHub Pages, Netlify, Vercel, any static host), every platform CTA and footer link 404s.
- **Evidence:** `grep` of index.html (both versions): `href="../../Krishi Setu/frontend/LAST_GOV_API_GRAPHS_FINAL.html"`; headless link-integrity check passed only because it resolves against the local tree.
- **Likely cause:** The public site was built to point at the app in the same workspace; no deployment-time path strategy exists.
- **Recommended fix (deployment stage):** Make the platform URL a single configurable value (it already exists as `KS.platformUrl` in data.js) and set it to the deployed app URL before launch. No code change required to keep current local behavior.
- **Blocks deployment:** No for local use; **yes, if deployed standalone without adjusting the path** — record as a deployment checklist item, not an application defect.

### S-2 — Demo content is clearly labelled (expected, not a defect)
- **Severity:** Info / Expected
- **Problem:** None. All news stories, statistics and the helpline are labelled "Sample" / "demo" / "Demo" consistently; the phone mask `1800-XXX-XXXX` is intentional; the contact-page map is an SVG explicitly labelled "Sample location map placeholder". No lorem ipsum, TODO, fixme or developer notes found in any file.
- **Evidence:** Content-hygiene scan across all HTML/JS/CSS: only the intentional demo mask and labelled placeholder matched.

### S-3 — External "Official portal ↗" links are real government URLs
- **Severity:** Info
- **Problem:** None in code — links open in a new tab with `rel="noopener noreferrer"` and are clearly labelled. Live reachability cannot be verified from this environment (offline sandbox).
- **Evidence:** scheme entries use `https://pmkisan.gov.in/`, `https://pmfby.gov.in/`, `https://enam.gov.in/`, etc.

---

# Version-Specific Problems

- **Only V1:** Dark mode absent (V1-M1). Reduced-motion guard absent (V1-L3). Demo-only language links (see below).
- **Only V2:** None (V2's theme system verified working end-to-end).

### V1-INFO-1 — Language links are demo placeholders
- **Page:** V1 header ("English / हिन्दी")
- **Severity:** Info / Expected (labelled demo)
- **Problem:** Clicking a language link shows a "demo" notice (`#langDemoNote`) instead of switching language. The site is not actually multilingual (the V1 brief asked for "multilingual-ready structure", which it has via `data-lang` hooks).
- **Evidence:** `js/main.js` binds `[data-lang="demo"]` links to reveal a note; no translation engine exists in V1.
- **Blocks deployment:** No.

---

# Not Verifiable

- **Live reachability of official scheme portals** (pmkisan.gov.in, pmfby.gov.in, enam.gov.in, soilhealth.dac.gov.in, pmksy.gov.in, agriinfra.dac.gov.in, pmaasha.gov.in, midh.gov.in, nfsm.gov.in, nabard.org) — external network unavailable in the inspection environment.
- **Production deployment behaviour** (DNS, hosting, HTTPS, the platform-CTA path under a deployed origin) — requires a real deployment.
- **Physical-device testing** (touch feel, real keyboard, mobile Safari/Chrome specifics) — requires hardware.
- **Cross-browser rendering beyond Chromium** (Firefox/Safari) — not available here.
- **Real user-data correctness** — none exists; all content is intentional demo/sample.

---

# Recommended Fix Order

1. **Critical** — none.
2. **High** — none.
3. **Medium**
   - S-1: Resolve the platform-CTA path strategy before any standalone deployment (single config point already exists: `KS.platformUrl`).
   - V1-M1: Add a minimal dark mode to the government version to satisfy the both-versions dark-mode QA expectation.
4. **Low**
   - V1-L1 / V2-L1: Add h2 section headings (or re-level card titles) on the six flagged pages.
   - V1-L2 / V2-L2: Increase touch-target padding on footer/language/scheme links at ≤412 px.
   - V1-L3: Guard `scroll-behavior:smooth` with `prefers-reduced-motion: no-preference`.
   - V1-L4 / V2-L3: Add canonical + OG tags; publish robots.txt + sitemap.xml at launch.

---

# Verification Matrix (all executed this inspection, no fixes applied)

| Check | V1 (Government) | V2 (Premium) |
|---|---|---|
| Pages load (10/10 per version) | PASS | PASS |
| Horizontal overflow @360–1440 (10 pages × 8 widths) | PASS (0 findings) | PASS (0 findings) |
| Elements off-screen / clipped @360–1440 | PASS (0 findings) | PASS (0 findings) |
| Console errors / page errors (all pages × widths) | PASS (0 findings) | PASS (0 findings) |
| Failed network requests | PASS (0 findings) | PASS (0 findings) |
| News renders at load (6 cards) + filter (→2) | PASS | PASS |
| Schemes render (10) + filter (Income Support → 1, correct) | PASS | PASS |
| Resources render (12) | PASS | PASS |
| Article detail page (news-article.html?id=n1) | PASS | PASS |
| Contact form success state | PASS | PASS |
| Mobile menu opens | PASS | PASS |
| Theme toggle works visually | N/A (no theme system — see V1-M1) | PASS (bg flips `rgb(243,241,232)` ↔ `rgb(10,16,11)`) |
| Theme persists across reload | N/A | PASS |
| System-preference detection | N/A | PASS |
| Unnamed buttons / missing alt / unlabeled inputs | PASS (0 findings) | PASS (0 findings) |
| h1 present per page | PASS | PASS |
| Heading-level skip (h1→h3) | 6 pages (V1-L1) | 6 pages (V2-L1) |
| Touch targets ≥34 px @mobile | Footer/nav text links (V1-L2) | Footer/scheme links (V2-L2) |
| Content parity between versions | data.js byte-identical (16,496 bytes both) | data.js byte-identical |
| Version independence | Own css/js/data; no cross-version refs | Own css/js/data; no cross-version refs |

---

# Summary

**VERSION 1 STATUS:**
CRITICAL: 0
HIGH: 0
MEDIUM: 1
LOW: 4

**VERSION 2 STATUS:**
CRITICAL: 0
HIGH: 0
MEDIUM: 0
LOW: 3

**DEPLOYMENT BLOCKERS:**
- None for local/workspace use.
- If either version is deployed standalone, the platform CTA path (`../../Krishi Setu/frontend/…`) must be re-pointed (S-1) — a one-line config change (`KS.platformUrl`), not a code defect.

**NOT VERIFIABLE:**
- External official scheme portals (offline environment).
- Production deployment/DNS/HTTPS behaviour.
- Physical-device and cross-browser (Firefox/Safari) testing.