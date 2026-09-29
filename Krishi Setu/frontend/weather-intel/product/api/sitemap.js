/**
 * /sitemap.xml — generated from the real request host.
 *
 * The sitemap is produced at request time so its <loc> URLs always match the host the site is
 * actually deployed on. No placeholder domain is ever written into the repository.
 */

const PAGES = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/app', priority: '0.9', changefreq: 'weekly' },
  { path: '/login', priority: '0.3', changefreq: 'yearly' },
  { path: '/about', priority: '0.6', changefreq: 'monthly' },
  { path: '/how-it-works', priority: '0.7', changefreq: 'monthly' },
  { path: '/map', priority: '0.8', changefreq: 'weekly' },
  { path: '/advisory', priority: '0.8', changefreq: 'weekly' },
  { path: '/methodology', priority: '0.6', changefreq: 'monthly' },
  { path: '/data', priority: '0.6', changefreq: 'monthly' }
];

module.exports = (req, res) => {
  const forwardedHost = (req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || req.headers.host || '';
  const forwardedProto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || 'https';
  const origin = host ? `${proto}://${host}` : '';
  const lastmod = new Date().toISOString().slice(0, 10);

  const body = origin
    ? '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      PAGES.map(
        (p) =>
          `  <url>\n` +
          `    <loc>${origin}${p.path}</loc>\n` +
          `    <lastmod>${lastmod}</lastmod>\n` +
          `    <changefreq>${p.changefreq}</changefreq>\n` +
          `    <priority>${p.priority}</priority>\n` +
          `  </url>`
      ).join('\n') +
      '\n</urlset>\n'
    : '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n';

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
  res.status(200).send(body);
};
