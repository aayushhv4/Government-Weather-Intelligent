/**
 * Site configuration
 *
 * Set the deployment origin in ONE place — either
 *   window.PWI_CONFIG.SITE_URL = 'https://your-deployment-host'   (before this file loads), or
 *   the SITE_URL environment-driven value injected by your host.
 *
 * When the origin is unknown this script emits NOTHING: no canonical link and no og:url.
 * That is deliberate — the product must never advertise a URL that does not exist.
 */

(function () {
  'use strict';

  window.PWI_CONFIG = window.PWI_CONFIG || {};
  var siteUrl = window.PWI_CONFIG.SITE_URL || window.PWI_SITE_URL || '';
  window.PWI_SITE_URL = siteUrl;

  var base = String(siteUrl || '').replace(/\/+$/, '');
  if (!base || !/^https?:\/\//i.test(base)) return;

  function upsertMeta(attr, key, value) {
    var el = document.querySelector('meta[' + attr + '="' + key + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', value);
  }

  function absolute(path) {
    if (!path) return base + '/';
    if (/^https?:\/\//i.test(path)) return path;
    return base + '/' + String(path).replace(/^\/+/, '');
  }

  function apply() {
    var path = window.location.pathname.replace(/\/+$/, '') || '/';
    var url = base + (path === '/' ? '/' : path);

    var link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', url);

    upsertMeta('property', 'og:url', url);

    var ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) ogImage.setAttribute('content', absolute(ogImage.getAttribute('content')));

    var twImage = document.querySelector('meta[name="twitter:image"]');
    if (twImage) twImage.setAttribute('content', absolute(twImage.getAttribute('content')));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
