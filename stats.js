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
      + '.fv-stats-badge--home{top:84px;right:20px;left:auto;}'
      + '.fv-stats-badge--page{top:84px;right:20px;left:auto;}'
      + '.fv-stats-badge b{color:#9ad7ff;font-weight:700;}'
      + '.fv-stats-badge .fv-sep{opacity:.35;}'
      + '.fv-video-facade{position:absolute;inset:0;width:100%;height:100%;border:0;padding:0;margin:0;cursor:pointer;background:#000 center/cover no-repeat;border-radius:inherit;display:block;}'
      + '.fv-video-facade::after{content:"";position:absolute;inset:0;background:rgba(0,0,0,.30);}'
      + '.fv-video-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:72px;height:50px;border-radius:14px;background:rgba(20,20,20,.85);z-index:1;transition:background .15s;}'
      + '.fv-video-play::before{content:"";position:absolute;top:50%;left:54%;transform:translate(-50%,-50%);border-style:solid;border-width:11px 0 11px 19px;border-color:transparent transparent transparent #fff;}'
      + '.fv-video-facade:hover .fv-video-play,.fv-video-facade:focus-visible .fv-video-play{background:#ff0000;}'
      + '@media (max-width:760px){.fv-stats-badge{font-size:11px;padding:5px 9px;gap:6px;top:auto;bottom:12px;right:12px;left:auto;}}';
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
    // Eingebettete Videos werden von der Klick-Vorschau (setupVideoFacades) gezaehlt.
    // Hier nur noch der "Video auf YouTube oeffnen"-Link bzw. data-track="video".
    var video = target.closest('a[href*="youtube.com"], a[href*="youtu.be"], [data-track="video"]');
    if (video) { hit('video:' + key); bump('video:' + key); return; }
    var download = target.closest('a[href$=".exe"], a[href$=".zip"], a[href*="releases/download"], a[download], .download-slot a.button, [data-track="download"]');
    if (download) { hit('download:' + key); bump('download:' + key); }
  }

  // Ersetzt eingebettete YouTube-iframes durch eine Klick-Vorschau (Thumbnail +
  // Play-Knopf). Der Klick darauf ist ein echter Klick -> wird gezaehlt; danach
  // startet das Video sofort (autoplay). Vorteil: Abspielen wird zuverlaessig
  // gezaehlt (Klicks IM fremden iframe sind technisch nicht erfassbar) und es wird
  // erst beim Klick Kontakt zu YouTube aufgenommen.
  function setupVideoFacades() {
    injectStyles();
    var iframes = document.querySelectorAll('.video-embed iframe[src*="youtube"]');
    Array.prototype.forEach.call(iframes, function (iframe) {
      var src = iframe.getAttribute('src') || '';
      var match = src.match(/embed\/([A-Za-z0-9_-]{6,})/);
      if (!match) return;
      var videoId = match[1];
      var host = src.indexOf('nocookie') !== -1 ? 'https://www.youtube-nocookie.com' : 'https://www.youtube.com';
      var title = iframe.getAttribute('title') || 'Video';
      var parent = iframe.parentNode;
      if (!parent) return;

      var facade = document.createElement('button');
      facade.type = 'button';
      facade.className = 'fv-video-facade';
      facade.setAttribute('aria-label', title + ' abspielen');
      facade.style.backgroundImage = "url('https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg')";
      facade.innerHTML = '<span class="fv-video-play" aria-hidden="true"></span>';
      parent.replaceChild(facade, iframe);

      facade.addEventListener('click', function () {
        hit('video:' + key);
        bump('video:' + key);
        var real = document.createElement('iframe');
        real.setAttribute('src', host + '/embed/' + videoId + '?rel=0&autoplay=1');
        real.setAttribute('title', title);
        real.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
        real.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        real.setAttribute('allowfullscreen', '');
        if (facade.parentNode) facade.parentNode.replaceChild(real, facade);
      });
    });
  }

  function start() {
    var pending = [];
    if (!seenOnce('fv_seen_site')) pending.push(hit('views:site'));
    if (!seenOnce('fv_seen_page_' + key)) pending.push(hit('views:' + key));

    document.addEventListener('click', onClick, true);
    setupVideoFacades();

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
