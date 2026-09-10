// Krishi Setu — Vercel rewrite simulator
//
// Emulates Vercel static-deployment semantics for `vercel.json` `rewrites`:
//   - rules are matched IN ORDER, first match wins
//   - `:path*` matches zero or more segments (including a bare trailing slash)
//   - query strings are preserved on rewrites (no redirect happens)
//   - unmatched paths fall back to real static files, then 404
//
// Usage (standalone):
//   node tests/vercel-sim.js [port]          (default 8141)
//
// Programmatic:
//   const sim = require('./tests/vercel-sim.js');
//   const server = sim.start(projectRoot, portOr0);   // returns http.Server
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

// Compile one Vercel rewrite source pattern into a RegExp + param list.
// Supported: literal segments, `:name*` (zero or more segments), `:name` (one segment), `*`.
function compileSource(source) {
  if (source.indexOf(':') === -1 && source.indexOf('*') === -1) {
    return { re: new RegExp('^' + escapeRe(source) + '$'), params: [] };
  }
  let i = 0;
  let body = '';
  const params = [];
  while (i < source.length) {
    const ch = source[i];
    if (ch === '*') {
      params.push({ name: '$wild' + params.length, star: false });
      body += '(.*)';
      i++;
    } else if (ch === ':') {
      const m = /^:([A-Za-z_][A-Za-z0-9_]*)(\*?)/.exec(source.slice(i));
      if (!m) { body += escapeRe(':'); i++; continue; }
      const star = m[2] === '*';
      params.push({ name: m[1], star });
      // Vercel: `:path*` at the end of a segment also matches zero segments,
      // i.e. `/platform/:path*` matches `/platform/` (empty capture).
      const atSegmentEnd = i + m[0].length === source.length;
      if (star) body += atSegmentEnd ? '([^/]*.*)?' : '(.*)';
      else body += '([^/]+)';
      i += m[0].length;
    } else {
      body += escapeRe(ch);
      i++;
    }
  }
  return { re: new RegExp('^' + body + '$'), params };
}

function compileRules(rewrites) {
  return rewrites.map(r => {
    const c = compileSource(r.source);
    return { source: r.source, destination: r.destination, re: c.re, params: c.params };
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
      permanent: !!r.permanent,
    })),
  };
}

function start(projectRoot, port = 0) {
  const cfg = loadConfig(projectRoot);
  const redirectRules = compileRules(cfg.redirects);
  const rules = compileRules(cfg.rewrites);

  // Vercel static-file lookup: a directory resolves to its index.html
  function resolveFile(p) {
    if (!p.startsWith(projectRoot)) return null;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      const idx = path.join(p, 'index.html');
      if (fs.existsSync(idx) && fs.statSync(idx).isFile()) return idx;
    }
    return null;
  }

  const server = http.createServer((req, res) => {
    const rawUrl = req.url || '/';
    const qIdx = rawUrl.indexOf('?');
    const pathname = decodeURIComponent(qIdx === -1 ? rawUrl : rawUrl.slice(0, qIdx)) || '/';
    const query = qIdx === -1 ? '' : rawUrl.slice(qIdx); // keep exact query string

    // 1) Redirects — matched before rewrites (Vercel order: headers → redirects → rewrites → filesystem)
    for (const rule of redirectRules) {
      const m = rule.re.exec(pathname);
      if (m) {
        const dest = applyDestination(rule.destination, m, rule.params);
        res.writeHead(rule.permanent ? 308 : 307, {
          Location: dest + query,
          'Content-Type': 'text/plain; charset=utf-8',
        });
        res.end('Redirecting to ' + dest + query);
        return;
      }
    }

    // 2) Rewrites — first match wins
    let matched = null;
    for (const rule of rules) {
      const m = rule.re.exec(pathname);
      if (m) {
        matched = { rule, match: m };
        break;
      }
    }

    let filePath = null;
    if (matched) {
      const dest = applyDestination(matched.rule.destination, matched.match, matched.rule.params);
      filePath = resolveFile(path.normalize(path.join(projectRoot, dest)));
      if (!filePath) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
    } else {
      // 3) Static file fallback (direct file access, directory → index.html)
      filePath = resolveFile(path.normalize(path.join(projectRoot, pathname)));
    }

    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'X-Sim-Rewrite': matched ? matched.rule.source : '(static)',
      'X-Sim-Dest': matched ? matched.rule.destination : pathname,
    });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise(resolve => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { start, compileSource, applyDestination, loadConfig };

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