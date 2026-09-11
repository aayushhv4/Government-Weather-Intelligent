// Krishi Setu — Vercel routing simulator
//
// Emulates Vercel's static-deployment routing for `vercel.json` as faithfully as
// it can, using semantics taken from Vercel's OWN compiler
// (@vercel/routing-utils -> getTransformedRoutes), so this harness can never
// again pass on behaviour that production does not have:
//
//   - order is: redirects -> filesystem -> rewrites -> 404
//     (Vercel emits an explicit `{ "handle": "filesystem" }` phase BEFORE the
//      vercel.json rewrites, so an existing static file wins over a rewrite)
//   - rules are matched IN ORDER, first match wins
//   - a literal source is matched EXACTLY, so a trailing slash is significant:
//     `/platform` does NOT match `/platform/`
//   - `/:name*` compiles to `(?:/([^/]+(?:/[^/]+)*))?`: it matches `/prefix`
//     and `/prefix/a/b`, but NOT `/prefix/` (zero-segment trailing slash)
//   - `redirects` are permanent (308) unless `"permanent": false` is set
//   - query strings are preserved on rewrites; `has`/`missing` query conditions
//     are honoured
//   - unmatched paths fall through to real static files, then 404
//
// HISTORY / WHY THIS FILE CHANGED: an earlier version of this simulator let
// `:path*` match a bare trailing slash (`/platform/`). Vercel does not. That
// false pass hid the real production bug: `/platform/` and
// `/platform/?intent=login` matched NO route at all and returned Vercel's
// `404: NOT_FOUND`, because the only rule matching that path was the
// `?intent=login`-guarded redirect, which is skipped when the query is present.
//
// Usage (standalone):
//   node tests/vercel-sim.js [port]          (default 8141)
//
// Programmatic:
//   const sim = require('./tests/vercel-sim.js');
//   const server = await sim.start(projectRoot, portOr0);
//   const r = sim.createResolver(projectRoot);   // r(pathname, search) -> decision
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Compile one Vercel source pattern, mirroring Vercel's compiled `src` regexes.
// Verified against @vercel/routing-utils getTransformedRoutes() output:
//   "/platform"        -> ^/platform$
//   "/platform/"       -> ^/platform/$
//   "/platform/:path*" -> ^/platform(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))?$
function compileSource(source) {
  if (source.indexOf(':') === -1 && source.indexOf('*') === -1) {
    return { re: new RegExp('^' + escapeRe(source) + '$'), params: [] };
  }
  let i = 0;
  let body = '';
  const params = [];
  while (i < source.length) {
    const ch = source[i];
    if (ch === ':') {
      const m = /^:([A-Za-z_][A-Za-z0-9_]*)(\*?)/.exec(source.slice(i));
      if (!m) { body += escapeRe(':'); i++; continue; }
      const star = m[2] === '*';
      params.push({ name: m[1], star });
      if (star) {
        // Vercel consumes the separator before the wildcard inside the
        // optional group, so the group needs at least one non-empty segment.
        if (body.endsWith('/')) body = body.slice(0, -1);
        body += '(?:/([^/]+(?:/[^/]+)*))?';
      } else {
        body += '([^/]+)';
      }
      i += m[0].length;
    } else if (ch === '*') {
      params.push({ name: '$wild' + params.length, star: true });
      if (body.endsWith('/')) body = body.slice(0, -1);
      body += '(?:/(.*))?';
      i++;
    } else {
      body += escapeRe(ch);
      i++;
    }
  }
  return { re: new RegExp('^' + body + '$'), params };
}

function compileRules(list) {
  return (list || []).map(r => {
    const c = compileSource(r.source);
    return {
      source: r.source,
      destination: r.destination,
      re: c.re,
      params: c.params,
      // Vercel sanitises this: a trailing slash on a redirect source would be
      // stripped, which is exactly the class of route this project needs, so we
      // keep it verbatim.
      permanent: r.permanent !== false, // Vercel default: permanent (308)
      has: r.has || [],
      missing: r.missing || [],
    };
  });
}

function applyDestination(dest, match, params) {
  let out = dest;
  for (let k = 0; k < params.length; k++) {
    const val = match[k + 1] || '';
    const token = ':' + params[k].name + (params[k].star ? '*' : '');
    // split/join avoids `$`-replacement interpretation in String.replace
    out = out.split(token).join(val);
  }
  return out;
}

function loadConfig(projectRoot) {
  const p = path.join(projectRoot, 'vercel.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return {
    rewrites: (raw.rewrites || []).map(r => ({ source: r.source, destination: r.destination })),
    redirects: (raw.redirects || []).map(r => ({
      source: r.source,
      destination: r.destination,
      permanent: r.permanent,
      has: r.has || [],
      missing: r.missing || [],
    })),
  };
}

function makeFileResolver(projectRoot) {
  // Vercel static-file lookup: exact file, or a directory's index.html
  return function resolveFile(p) {
    if (!p.startsWith(projectRoot)) return null;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      const idx = path.join(p, 'index.html');
      if (fs.existsSync(idx) && fs.statSync(idx).isFile()) return idx;
    }
    return null;
  };
}

function conditionsOk(conds, wantPresent, params) {
  for (const c of (conds || [])) {
    if (c.type !== 'query') continue;
    const present = params.has(c.key) && (c.value === undefined || params.get(c.key) === c.value);
    if (present !== wantPresent) return false;
  }
  return true;
}

// Resolve a request the way Vercel would.
//   resolve(pathname, search) ->
//     { kind: 'redirect', status, location, source }
//     { kind: 'file',     filePath, source, dest }
//     { kind: '404',      source? }
function createResolver(projectRoot) {
  const cfg = loadConfig(projectRoot);
  const redirectRules = compileRules(cfg.redirects);
  const rewriteRules = compileRules(cfg.rewrites);
  const resolveFile = makeFileResolver(projectRoot);

  return function resolve(pathname, search) {
    const query = search || '';
    const params = new URLSearchParams(query);

    // 1) redirects
    for (const rule of redirectRules) {
      const m = rule.re.exec(pathname);
      if (!m) continue;
      if (!conditionsOk(rule.missing, false, params)) continue;
      if (!conditionsOk(rule.has, true, params)) continue;
      const dest = applyDestination(rule.destination, m, rule.params);
      // Vercel: a query string in the destination wins; otherwise the original
      // query string is carried over.
      const location = dest.indexOf('?') !== -1 ? dest : dest + query;
      return { kind: 'redirect', status: rule.permanent ? 308 : 307, location, source: rule.source };
    }

    // 2) filesystem — Vercel's `{ handle: "filesystem" }` phase sits BEFORE the
    //    vercel.json rewrites, so a real static file beats a rewrite.
    const direct = resolveFile(path.normalize(path.join(projectRoot, pathname)));
    if (direct) return { kind: 'file', filePath: direct, source: '(static)' };

    // 3) rewrites — first match wins
    for (const rule of rewriteRules) {
      const m = rule.re.exec(pathname);
      if (!m) continue;
      const dest = applyDestination(rule.destination, m, rule.params);
      // Vercel appends `?path=$1` to wildcard destinations; the query never
      // affects static file lookup, so strip it before resolving.
      const destPath = dest.split('?')[0];
      const filePath = resolveFile(path.normalize(path.join(projectRoot, destPath)));
      if (!filePath) return { kind: '404', source: rule.source, missingDest: destPath };
      return { kind: 'rewrite', filePath, source: rule.source, dest: destPath };
    }

    return { kind: '404' };
  };
}

function start(projectRoot, port = 0) {
  const resolve = createResolver(projectRoot);

  const server = http.createServer((req, res) => {
    const rawUrl = req.url || '/';
    const qIdx = rawUrl.indexOf('?');
    const pathname = decodeURIComponent(qIdx === -1 ? rawUrl : rawUrl.slice(0, qIdx)) || '/';
    const search = qIdx === -1 ? '' : rawUrl.slice(qIdx); // keep exact query string

    let r;
    try {
      r = resolve(pathname, search);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Simulator error: ' + e.message);
      return;
    }

    if (r.kind === 'redirect') {
      res.writeHead(r.status, {
        Location: r.location,
        'Content-Type': 'text/plain; charset=utf-8',
      });
      res.end('Redirecting to ' + r.location);
      return;
    }

    if (r.kind === '404') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    // r.kind === 'file' (static hit) or 'rewrite' — both stream from disk

    const ext = path.extname(r.filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'X-Sim-Rewrite': r.source,
      'X-Sim-Dest': r.dest || pathname,
    });
    fs.createReadStream(r.filePath).pipe(res);
  });

  return new Promise(resolvePromise => {
    server.listen(port, '127.0.0.1', () => resolvePromise(server));
  });
}

module.exports = { start, createResolver, compileSource, applyDestination, loadConfig, MIME };

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const port = parseInt(process.argv[2], 10) || 8141;
  start(root, port).then(server => {
    const addr = server.address();
    console.log('Vercel-sim serving project root ' + root + ' at http://127.0.0.1:' + addr.port + '/');
    const cfg = loadConfig(root);
    console.log('Redirects loaded: ' + cfg.redirects.length + ', rewrites loaded: ' + cfg.rewrites.length);
  });
}
