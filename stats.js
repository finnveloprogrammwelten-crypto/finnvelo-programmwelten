/* Finnvelo Programmwelten - anonyme Besucher-/Ereignisanzeige.
 * Zaehlt Besucher (einmal pro Browser), Video-Klicks und Download-Klicks und
 * zeigt sie als dezentes Eck-Badge an:
 *   Startseite  -> oben links: Besucher gesamt
 *   Programmseite -> oben rechts: Besucher / Video-Klicks / Downloads
 * Keine Cookies, kein Tracking - es werden nur Zahlen gezaehlt. Der lokale
 * "schon gezaehlt"-Merker liegt anonym im localStorage des Browsers.
 * Faellt die Server-Komponente aus, bricht nichts - es wird nur "-" angezeigt.
 */
(function () {
  'use strict';

  var API = '/api';
  var PROGRAM_PAGES = ['command-control', 'archivar', 'aufgabenplaner', 'finanzmanager', 'medienstudio', 'tester'];

  function pageKey() {
    var path = (location.pathname || '').toLowerCase();
    var file = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    var name = file.replace(/\.html?$/, '').replace(/[^a-z0-9-]/g, '');
    if (!name || name === 'index') return 'start';
    return name;
  }

  function hit(key) {
    try {
      return fetch(API + '/hit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: key }),
        keepalive: true
      }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  function getStats(keys) {
    return fetch(API + '/stats?keys=' + encodeURIComponent(keys.join(',')), { method: 'GET' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function seenOnce(flag) {
    try {
      if (localStorage.getItem(flag)) return true;
      localStorage.setItem(flag, '1');
      return false;
    } catch (e) { return false; }
  }

  function fmt(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '–';
    return n.toLocaleString('de-DE');
  }

  function injectStyles() {
    if (document.getElementById('fv-stats-style')) return;
    var css = '.fv-stats-badge{position:fixed;z-index:9999;font:12px/1.3 system-ui,"Segoe UI",Arial,sans-serif;'
      + 'background:rgba(15,22,38,.85);color:#e8eef5;border:1px solid rgba(255,255,255,.16);'
      + 'border-radius:999px;padding:6px 12px;box-shadow:0 6px 18px rgba(0,0,0,.3);'
      + 'pointer-events:none;user-select:none;display:flex;gap:8px;align-items:center;white-space:nowrap;'
      + '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);}'
      + '.fv-stats-badge--home{top:12px;left:14px;}'
      + '.fv-stats-badge--page{top:12px;right:14px;}'
      + '.fv-stats-badge b{color:#9ad7ff;font-weight:700;}'
      + '.fv-stats-badge .fv-sep{opacity:.35;}'
      + '@media (max-width:760px){.fv-stats-badge{font-size:11px;padding:5px 9px;gap:6px;}}';
    var style = document.createElement('style');
    style.id = 'fv-stats-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function makeBadge(kind) {
    injectStyles();
    var el = document.createElement('div');
    el.className = 'fv-stats-badge fv-stats-badge--' + kind;
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  var key = pageKey();
  var isHome = (key === 'start');
  var isProgram = PROGRAM_PAGES.indexOf(key) !== -1;
  var counts = {};
  var badgeEl = null;

  function renderBadge() {
    if (!badgeEl) return;
    if (isHome) {
      badgeEl.innerHTML = '<span>\uD83D\uDC41\uFE0F Besucher gesamt: <b>' + fmt(counts['views:site']) + '</b></span>';
    } else if (isProgram) {
      badgeEl.innerHTML =
        '<span>\uD83D\uDC41\uFE0F Besucher: <b>' + fmt(counts['views:' + key]) + '</b></span>'
        + '<span class="fv-sep">·</span>'
        + '<span>\u25B6 Video-Klicks: <b>' + fmt(counts['video:' + key]) + '</b></span>'
        + '<span class="fv-sep">·</span>'
        + '<span>\u2B07 Downloads: <b>' + fmt(counts['download:' + key]) + '</b></span>';
    }
  }

  function bump(metricKey) {
    counts[metricKey] = (typeof counts[metricKey] === 'number' ? counts[metricKey] : 0) + 1;
    renderBadge();
  }

  function onClick(event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var video = target.closest('a[href*="youtube.com"], a[href*="youtu.be"], .video-link a, .video-embed, [data-track="video"]');
    if (video) { hit('video:' + key); bump('video:' + key); return; }
    var download = target.closest('a[href$=".exe"], a[href$=".zip"], a[href*="releases/download"], a[download], .download-slot a.button, [data-track="download"]');
    if (download) { hit('download:' + key); bump('download:' + key); }
  }

  function start() {
    var pending = [];
    if (!seenOnce('fv_seen_site')) pending.push(hit('views:site'));
    if (!seenOnce('fv_seen_page_' + key)) pending.push(hit('views:' + key));

    document.addEventListener('click', onClick, true);

    var keysToShow = null;
    if (isHome) {
      badgeEl = makeBadge('home');
      badgeEl.innerHTML = '<span>\uD83D\uDC41\uFE0F Besucher gesamt: <b>…</b></span>';
      keysToShow = ['views:site'];
    } else if (isProgram) {
      badgeEl = makeBadge('page');
      badgeEl.innerHTML = '<span>Lädt…</span>';
      keysToShow = ['views:' + key, 'video:' + key, 'download:' + key];
    }

    if (keysToShow) {
      var refresh = function () {
        getStats(keysToShow).then(function (res) {
          if (res && res.counts) counts = res.counts;
          renderBadge();
        });
      };
      if (pending.length) { Promise.all(pending).then(refresh); } else { refresh(); }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
