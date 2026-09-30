/**
 * Responsive data tables
 *
 * Several tables in the workspace carry 5 to 9 columns. On a phone that is either a
 * horizontal scroll or clipped content, and a sideways-scrolling table loses the
 * association between a value and its column header.
 *
 * This helper copies each column header onto its cells as a data-label and marks the
 * table .table-stack, so the CSS in site.css can reflow every row into a labelled
 * block below 640px. Behaviour is unchanged on wider screens — the rules live inside
 * the narrow media query, so no viewport state has to be tracked in JavaScript.
 *
 * It re-labels after dynamic renders (the downscale, validation and advisory tables are
 * populated by JavaScript), so it works for both static and generated tables.
 */
(function () {
  'use strict';

  var STACK_CLASS = 'table-stack';

  function labelTable(table) {
    var heads = table.querySelectorAll('thead th');
    if (!heads.length) return false;

    var labels = [];
    for (var i = 0; i < heads.length; i++) {
      labels.push((heads[i].textContent || '').replace(/\s+/g, ' ').trim());
    }

    table.classList.add(STACK_CLASS);

    var rows = table.querySelectorAll('tbody tr');
    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r].children;
      for (var c = 0; c < cells.length; c++) {
        // A row spanning every column is a message (empty / error state) — leave it as text.
        if (cells[c].hasAttribute('colspan') && cells.length === 1) continue;
        var label = labels[c] || '';
        if (label) cells[c].setAttribute('data-label', label);
      }
    }
    return true;
  }

  function labelAll(root) {
    var tables = (root || document).querySelectorAll('.table-wrap table');
    for (var i = 0; i < tables.length; i++) labelTable(tables[i]);
  }

  function watch(table) {
    var bodies = table.querySelectorAll('tbody');
    if (!bodies.length || typeof MutationObserver === 'undefined') return;
    var pending = false;
    var observer = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      // Coalesce the childList mutations of one render pass into a single re-label.
      (window.requestAnimationFrame || window.setTimeout)(function () {
        pending = false;
        labelTable(table);
      });
    });
    for (var i = 0; i < bodies.length; i++) {
      observer.observe(bodies[i], { childList: true });
    }
  }

  function init() {
    labelAll(document);
    var tables = document.querySelectorAll('.table-wrap table');
    for (var i = 0; i < tables.length; i++) watch(tables[i]);
  }

  function start() {
    init();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
