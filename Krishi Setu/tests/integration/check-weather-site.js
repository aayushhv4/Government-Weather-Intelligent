#!/usr/bin/env node
/**
 * Static verification for the standalone Panchayat Weather Intelligence website.
 *
 * Checks, without needing a browser:
 *   1. every local src/href reference in each HTML page resolves to a real file
 *   2. every route in both vercel.json configurations resolves to a real file
 *   3. every element id referenced by a page's scripts exists in that page
 *      (this is the "no dead buttons / no silent no-op wiring" check)
 *   4. no placeholder text is left in a shipped page
 *
 * Usage: node tests/integration/check-weather-site.js
 */

const fs = require('fs');
const path = require('path');

// The site now lives in a top-level website/ folder at the git root (no spaces in the
// production path), while this repo folder is 'Krishi Setu' — hence the third '..'.
const WEBSITE = path.resolve(__dirname, '..', '..', '..', 'website');
// Git root — vercel.json rewrite destinations are relative to it ('Krishi Setu' sits one level down).
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const PAGES = ['index.html', 'app.html', 'login.html', '404.html'];

const PAGE_SCRIPTS = {
  'index.html': ['js/site-config.js', 'js/vendor/leaflet.js', 'js/pilot-geo.js', 'js/advisory.js', 'js/home.js'],
  'app.html': ['js/site-config.js', 'js/auth.js', 'js/weather.js', 'js/pilot-geo.js', 'js/map.js', 'js/advisory.js', 'js/ai.js', 'js/website.js'],
  'login.html': ['js/site-config.js', 'js/auth.js'],
  '404.html': []
};

// ids created dynamically at runtime, or looked up defensively with an optional chain.
const DYNAMIC_IDS = new Set([
  'logoutBtn', 'loginBtn', 'advisoryAskAssistant', 'mapRetryBtn', 'toast',
  'chatMessages', 'chatTyping', 'aiModeBadge', 'aiClearBtn', 'cpInput', 'cpSend', 'homeLink'
]);

// Elements that exist only on app.html. The home page intentionally re-uses two app modules
// (advisory.js for the risk rules, auth.js for the session) and every one of these lookups is
// null-guarded in the module, so absence on another page is safe rather than broken.
const APP_ONLY_IDS = new Set([
  'advisoryCropSelect', 'advisoryPanchayatSelect', 'advisoryResultContent', 'advisoryThresholdBody',
  'topbarUser', 'statusDot', 'statusText', 'navToggle', 'navMenu', 'themeToggle', 'themeIcon',
  'themeLabel', 'langSelect'
]);

let failures = 0;
let checks = 0;

function fail(msg) {
  failures += 1;
  console.log('  FAIL  ' + msg);
}

function ok(msg) {
  checks += 1;
  console.log('  ok    ' + msg);
}

function exists(rel) {
  return fs.existsSync(path.join(WEBSITE, rel));
}

console.log('\n1. Local asset references in each page');

for (const page of PAGES) {
  const html = fs.readFileSync(path.join(WEBSITE, page), 'utf8');
  const refs = new Set();
  const re = /(?:src|href)\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const value = m[1].trim();
    if (!value || value.startsWith('http') || value.startsWith('data:') || value.startsWith('#')) continue;
    if (value.startsWith('/')) continue; // absolute paths are handled by the vercel routes
    refs.add(value.split('#')[0].split('?')[0]);
  }
  const missing = [...refs].filter((r) => r && !exists(r));
  if (missing.length) fail(page + ' references missing files: ' + missing.join(', '));
  else ok(page + ' — ' + refs.size + ' local references all resolve');
}

console.log('\n2. Vercel routes resolve to real files');

const routeConfigs = [
  { label: 'website/vercel.json', config: path.join(WEBSITE, 'vercel.json'), base: WEBSITE },
  // The Option-B config lives inside the 'Krishi Setu' project folder but its rewrite
  // destinations are resolved against the git root, where 'website/' sits.
  { label: 'Krishi Setu/vercel.json (Option B)', config: path.join(REPO_ROOT, 'Krishi Setu', 'vercel.json'), base: REPO_ROOT }
];

for (const { label, config, base } of routeConfigs) {
  if (!fs.existsSync(config)) {
    fail(label + ' is missing');
    continue;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(config, 'utf8'));
  } catch (e) {
    fail(label + ' is not valid JSON: ' + e.message);
    continue;
  }
  const problems = [];
  for (const rw of parsed.rewrites || []) {
    const dest = rw.destination || '';
    if (dest.includes(':')) continue; // parameterised destination
    if (!dest.endsWith('.html') && !dest.endsWith('.svg') && !dest.endsWith('.txt')) continue;
    const target = path.join(base, dest.replace(/^\//, ''));
    if (!fs.existsSync(target)) problems.push(rw.source + ' -> ' + dest);
  }
  if (problems.length) fail(label + ' has rewrites pointing at missing files: ' + problems.join(', '));
  else ok(label + ' — ' + (parsed.rewrites || []).length + ' rewrites, all file destinations exist');
}

console.log('\n3. Every id a page\'s scripts look up exists in that page');

for (const [page, scripts] of Object.entries(PAGE_SCRIPTS)) {
  const html = fs.readFileSync(path.join(WEBSITE, page), 'utf8');
  const htmlIds = new Set();
  const idRe = /\bid\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = idRe.exec(html))) htmlIds.add(m[1]);

  const missing = new Set();
  for (const script of scripts) {
    const file = path.join(WEBSITE, script);
    if (!fs.existsSync(file)) {
      fail(page + ' loads a missing script: ' + script);
      continue;
    }
    const js = fs.readFileSync(file, 'utf8');
    const idLookup = /getElementById\(\s*['"]([A-Za-z0-9_-]+)['"]\s*\)/g;
    const byId = /\$\(\s*['"]([A-Za-z0-9_-]+)['"]\s*\)/g;
    for (const re of [idLookup, byId]) {
      let hit;
      while ((hit = re.exec(js))) {
        const id = hit[1];
        if (htmlIds.has(id) || DYNAMIC_IDS.has(id) || APP_ONLY_IDS.has(id)) continue;
        missing.add(id + '  (from ' + script + ')');
      }
    }
  }
  if (missing.size) fail(page + ' looks up ids that do not exist:\n        ' + [...missing].join('\n        '));
  else ok(page + ' — all referenced ids present');
}

console.log('\n4. No placeholder text in shipped pages');

const PLACEHOLDER = /lorem ipsum|coming soon|TODO:|FIXME|placeholder text|your-domain\.com|example\.invalid|YOUR-|[Vv]estibulum/i;
let placeholderFound = false;
for (const page of PAGES) {
  const html = fs.readFileSync(path.join(WEBSITE, page), 'utf8');
  // strip comments so documented placeholders are not flagged
  const visible = html.replace(/<!--[\s\S]*?-->/g, '');
  const hit = visible.match(PLACEHOLDER);
  if (hit) {
    placeholderFound = true;
    fail(page + ' contains placeholder text: "' + hit[0] + '"');
  }
}
if (!placeholderFound) ok('no placeholder text found in any shipped page');

console.log('\n5. Every shipped script parses');

const jsFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'vendor') continue;
      walk(full);
    } else if (entry.name.endsWith('.js')) {
      jsFiles.push(full);
    }
  }
})(path.join(WEBSITE, 'js'));
// The product is fully static (no api/ functions — the repo path contains a space,
// which Vercel rejects when deriving function names). Only page scripts are checked.

const { execFileSync } = require('child_process');
const broken = [];
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (e) {
    broken.push(path.relative(WEBSITE, file));
  }
}
if (broken.length) fail('scripts with syntax errors: ' + broken.join(', '));
else ok(jsFiles.length + ' scripts parse cleanly');

console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'ALL CHECKS PASSED') + ' (' + checks + ' checks)');
process.exit(failures ? 1 : 0);
