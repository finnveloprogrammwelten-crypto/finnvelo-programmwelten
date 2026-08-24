/* Finnvelo Programmwelten - anonyme Besucher-/Ereignisanzeige.
 * Zaehlt Besucher (einmal pro Browser), Video-Klicks und Download-Klicks und
 * zeigt sie als dezentes Eck-Badge an:
 *   Startseite  -> oben links: Besucher gesamt
 *   Programmseite -> oben rechts: Besucher / Video-Klicks / Downloads
 * Keine Cookies, kein Tracking - es werden nur Zahlen gezaehlt. Der lokale
 * "schon gezaehlt"-Merker liegt anonym im localStorage des Browsers.
 * Faellt die Server-Komponente aus, bricht nichts - es wird nur "-" angezeigt.
 */
/* =====================================================================
 * Handy-Vorschau: Besuchersicht erzwingen
 * ---------------------------------------------------------------------
 * Die Vorschau laedt die Seite in einem schmalen Rahmen. Nur so greifen
 * die Media Queries wirklich - eine schmal gerechnete Seite wuerde sie
 * NICHT ausloesen, weil sie an der Fensterbreite haengen.
 *
 * Der Rahmen liegt auf derselben Herkunft und teilt sich deshalb den
 * sessionStorage - er saehe also das Admin-Passwort und wuerde die
 * Werkzeugleiste zeigen. Zehn Bausteine fragen unabhaengig voneinander
 * danach. Statt zehn Stellen zu aendern (und die elfte zu vergessen),
 * werden die beiden Schluessel im Vorschau-Rahmen an EINER Stelle
 * verdeckt. Gilt nur im Rahmen; das echte Fenster ist unberuehrt.
 * ===================================================================== */
(function () {
  'use strict';
  try {
    if (!/[?&]fv-vorschau=1(&|$)/.test(location.search || '')) return;
    /* NICHT sessionStorage.getItem = ... schreiben: bei Storage-Objekten
       legt eine Zuweisung einen EINTRAG namens "getItem" an, statt die
       Methode zu ersetzen. Der Weg geht ueber den Prototyp - und nur
       fuer sessionStorage, damit localStorage unberuehrt bleibt. */
    var proto = (window.Storage && window.Storage.prototype) || null;
    if (!proto || typeof proto.getItem !== 'function') return;
    var echt = proto.getItem;
    proto.getItem = function (k) {
      if (this === window.sessionStorage && (k === 'fv_admin_pw' || k === 'fv_edit')) return null;
      return echt.call(this, k);
    };
  } catch (e) {}
})();

(function () {
  'use strict';

  var API = '/api';
  var PROGRAM_PAGES = ['command-control', 'archivar', 'aufgabenplaner', 'finanzmanager', 'medienstudio', 'haus-und-gartenplaner', 'mischwaldrechner', 'tourenplaner', 'einkaufsliste', 'lesezeit', 'tester'];

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
        + '.fv-edit-on .fv-stats-badge{pointer-events:auto;cursor:grab;}'
        + '.fv-edit-on .fv-stats-badge:hover{border-color:rgba(120,170,255,.7);}'
        + '.fv-stats-badge.fv-zieht{cursor:grabbing;opacity:.85;}'
      + '.fv-stats-badge--home{top:calc(84px + var(--fv-admin-hoehe, 0px));right:20px;left:auto;}'
      + '.fv-stats-badge--page{top:calc(84px + var(--fv-admin-hoehe, 0px));right:20px;left:auto;}'
      + '.fv-stats-badge b{color:#9ad7ff;font-weight:700;}'
      + '.fv-stats-badge .fv-sep{opacity:.35;}'
      + '.fv-video-facade{position:absolute;inset:0;width:100%;height:100%;border:0;padding:0;margin:0;cursor:pointer;background:#000 center/cover no-repeat;border-radius:inherit;display:block;}'
      + '.fv-video-facade::after{content:"";position:absolute;inset:0;background:rgba(0,0,0,.30);}'
      + '.fv-video-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:72px;height:50px;border-radius:14px;background:rgba(20,20,20,.85);z-index:1;transition:background .15s;}'
      + '.fv-video-play::before{content:"";position:absolute;top:50%;left:54%;transform:translate(-50%,-50%);border-style:solid;border-width:11px 0 11px 19px;border-color:transparent transparent transparent #fff;}'
      + '.fv-video-facade:hover .fv-video-play,.fv-video-facade:focus-visible .fv-video-play{background:#ff0000;}'
      + '@media (max-width:760px){.fv-stats-badge{font-size:11px;padding:5px 9px;gap:5px;top:auto;bottom:12px;right:12px;left:12px;flex-wrap:wrap;justify-content:center;white-space:normal;border-radius:14px;}}';
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
    lageAnwenden(el);
    verschiebbarMachen(el);
    return el;
  }

  /* Die Zaehlerleiste lag fest oben rechts - und damit je nach Fensterbreite
     mitten im Menue. Sie laesst sich jetzt im Bearbeiten-Modus an eine freie
     Stelle ziehen. Die Lage merkt sich der Browser (localStorage, also je
     Geraet): es ist reine Ansichtssache, Besucher sollen davon nichts
     mitbekommen, und der Server bleibt aussen vor. */
  var LAGE_SCHLUESSEL = 'fv_zaehler_lage';

  function lageAnwenden(el) {
    try {
      var roh = localStorage.getItem(LAGE_SCHLUESSEL);
      if (!roh) return;
      var l = JSON.parse(roh);
      if (typeof l.oben !== 'number' || typeof l.links !== 'number') return;
      // Im sichtbaren Bereich halten - das Fenster kann seit dem Ablegen
      // kleiner geworden sein, sonst waere die Leiste unerreichbar.
      var maxL = Math.max(0, window.innerWidth - 140);
      var maxO = Math.max(0, window.innerHeight - 40);
      el.style.top = Math.min(l.oben, maxO) + 'px';
      el.style.left = Math.min(l.links, maxL) + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    } catch (_e) { /* dann bleibt die Vorgabe */ }
  }

  function verschiebbarMachen(el) {
    var zieht = false, dx = 0, dy = 0;

    el.addEventListener('pointerdown', function (e) {
      if (!document.body.classList.contains('fv-edit-on')) return;
      zieht = true;
      var r = el.getBoundingClientRect();
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
      el.classList.add('fv-zieht');
      try { el.setPointerCapture(e.pointerId); } catch (_e) {}
      e.preventDefault();
    });

    el.addEventListener('pointermove', function (e) {
      if (!zieht) return;
      var links = Math.max(4, Math.min(window.innerWidth - el.offsetWidth - 4, e.clientX - dx));
      var oben = Math.max(4, Math.min(window.innerHeight - el.offsetHeight - 4, e.clientY - dy));
      el.style.left = links + 'px';
      el.style.top = oben + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    });

    function ende() {
      if (!zieht) return;
      zieht = false;
      el.classList.remove('fv-zieht');
      try {
        localStorage.setItem(LAGE_SCHLUESSEL, JSON.stringify({
          oben: parseInt(el.style.top, 10) || 0,
          links: parseInt(el.style.left, 10) || 0
        }));
      } catch (_e) {}
    }
    el.addEventListener('pointerup', ende);
    el.addEventListener('pointercancel', ende);

    // Doppelklick setzt sie an ihren Ausgangsplatz zurueck.
    el.addEventListener('dblclick', function () {
      if (!document.body.classList.contains('fv-edit-on')) return;
      try { localStorage.removeItem(LAGE_SCHLUESSEL); } catch (_e) {}
      el.style.removeProperty('top');
      el.style.removeProperty('left');
      el.style.removeProperty('right');
      el.style.removeProperty('bottom');
    });
  }

  var key = pageKey();
  var isHome = (key === 'start');
  // Programmseite erkennen: entweder aus der festen Liste oder daran, dass die
  // Seite den Aufbau einer Programmseite hat (gilt auch fuer selbst angelegte).
  var isProgram = PROGRAM_PAGES.indexOf(key) !== -1
    || !!document.querySelector('article.program-detail');
  var counts = {};
  var badgeEl = null;

  function renderBadge() {
    if (!badgeEl) return;
    if (isHome) {
      /* Nur noch die Besucherzahl. "Planer" und "Mischwald" zaehlten Aufrufe
         der Web-Fassungen - die gibt es nicht mehr, sie standen dauerhaft auf
         "-". Die Zaehler bleiben im Server erhalten, nur die Anzeige ist fort. */
      badgeEl.innerHTML =
        '<span>\uD83D\uDC41\uFE0F Besucher gesamt: <b>' + fmt(counts['views:site']) + '</b></span>';
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
      // Nur noch der eine Zaehler wird angezeigt - die anderen nicht mehr holen.
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

/* =====================================================================
 * Finnvelo Inline-Editor  (versteckter Admin-Modus)  v2
 * - Fuer ALLE Besucher: gespeicherte Texte, Bilder, Status-Schilder,
 *   Navigation/Fusszeile, Reihenfolge der Kacheln und Zusatztexte werden
 *   angewendet.
 * - Nur mit Passwort (ueber /admin freigeschaltet) UND eingeschaltetem
 *   Bearbeiten-Modus: alles direkt auf der Seite bearbeitbar, Kacheln per
 *   Ziehen sortierbar, Status-Schilder und Zusatztexte pflegbar.
 * - Umschalter (Bearbeiten AN/AUS): als Admin gefahrlos navigieren, ohne
 *   aus Versehen etwas zu aendern.
 * Komplett fail-safe gekapselt: bei Fehlern bleibt die Seite normal.
 * ===================================================================== */
(function () {
  'use strict';
  try {
    var API = '/api';
    var PW_KEY = 'fv_admin_pw';
    var EDIT_KEY = 'fv_edit';
    var GLOBAL = 'global';   // seiten-uebergreifende Inhalte (Navigation, Fusszeile, Marke)

    function adminPw() { try { return sessionStorage.getItem(PW_KEY) || ''; } catch (e) { return ''; } }
    function editOn() { try { return sessionStorage.getItem(EDIT_KEY) === '1'; } catch (e) { return false; } }
    /* Handy-Vorschau: die Seite laeuft in einem Rahmen und soll dort
       aussehen wie fuer Besucher. Ohne das saehe man im Rahmen die
       eigene Werkzeugleiste und die Bearbeiten-Kaesten - also alles
       ausser dem, was man pruefen wollte. */
    var VORSCHAU = /[?&]fv-vorschau=1(&|$)/.test(location.search || '');
    var ADMIN = !VORSCHAU && !!adminPw();
    var EDITING = ADMIN && editOn();

    function slug() {
      var path = (location.pathname || '').toLowerCase();
      var file = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
      var name = file.replace(/\.html?$/, '').replace(/[^a-z0-9-]/g, '');
      return (!name || name === 'index') ? 'start' : name;
    }
    var SLUG = slug();

    var TEXT_SEL = 'h1,h2,h3,h4,p,li,blockquote,figcaption';
    var EXTRA_TEXT_SEL = '.program-button__description, .program-row__content > strong, .program-row__content > span';
    var NAV_TEXT_SEL = '.site-header .brand-text strong, .site-header .brand-text small, .site-header nav a, footer span, footer a';
    var STATUS_SEL = '.program-button__status, .status';
    var LINK_SEL = '.program-launch a.button[href], .program-download-block a.button[href], .download-slot a.button[href]';
    var SORTABLE_SEL = '.program-button-grid, .program-row-list';
    var CARD_SEL = '.program-button, .program-row';

    var galleryUrls = [];    // Bild-URLs der Oberflaechen-Galerie (Block g0)
    var customBlocks = [];   // [{id, html}] Zusatz-Textfelder (Block x0)

    function editRoot() { return document.querySelector('main'); }
    function qsa(root, sel) { return root ? Array.prototype.slice.call(root.querySelectorAll(sel)) : []; }

    /* ---- Element-Sammler ---------------------------------------------- */
    function textEls() {
      var root = editRoot(); if (!root) return [];
      var base = [], spaet = [];
      qsa(root, TEXT_SEL).forEach(function (el) {
        if (el.closest('.fv-gallery')) return;
        if (el.closest('.fv-extra-zone')) return;               // Zusatztexte -> eigene Logik (x0)
        /* Ueberschrift eines selbst angelegten Abschnitts: gehoert dem
           Abschnitt selbst (Block y0), nicht der t-Nummerierung. Sonst
           haetten neu angelegte Abschnitte alle Nummern dahinter
           verschoben - und jeder gespeicherte Text saesse falsch. */
        if (el.matches('h2') && el.parentNode && el.parentNode.hasAttribute
            && el.parentNode.hasAttribute('data-fv-sektion')) return;
        if (el.querySelector(TEXT_SEL)) return;                 // Container -> ueberspringen
        if (el.querySelector('img')) return;                    // enthaelt Bild -> separat
        if (!el.textContent || !el.textContent.trim()) return;  // leer
        if (el.closest('[data-fv-text-extra]')) spaet.push(el); // nachtraeglich ergaenzt -> ans Ende
        else base.push(el);
      });
      var extra = [];
      qsa(root, EXTRA_TEXT_SEL).forEach(function (el) {
        if (el.closest('.fv-gallery')) return;
        if (el.matches('.status') || el.closest('.status')) return;   // Status -> eigene Kategorie (s)
        if (el.querySelector('img') || el.querySelector(TEXT_SEL)) return;
        if (!el.textContent || !el.textContent.trim()) return;
        // Nachtraeglich eingesetzte Kacheln (eigene Programme) ans Ende, damit
        // bereits gespeicherte Texte auf ihren Feldern bleiben.
        if (el.closest('[data-fv-text-extra]')) spaet.push(el);
        else extra.push(el);
      });
      // Reihenfolge fest: Basistexte, dann Kachel-Beschreibungen, dann spaeter
      // ergaenzte Bloecke -> bereits gespeicherte t-Indizes bleiben unveraendert.
      return base.concat(extra).concat(spaet);
    }
    function navEls() {
      var base = [], extra = [];
      qsa(document, NAV_TEXT_SEL).forEach(function (el) {
        if (!el.textContent || !el.textContent.trim()) return;
        if (el.hasAttribute('data-fv-nav-dyn')) return;   // Menü: aus der Liste gepflegt
        if (el.hasAttribute('data-fv-fuss-dyn')) return;  // Fußzeile: aus der Liste gepflegt
        if (el.hasAttribute('data-fv-nav-extra')) extra.push(el);
        else base.push(el);
      });
      // Spaeter ergaenzte Eintraege (z.B. Schnellauswahl "Web-Apps") IMMER hinten
      // anhaengen -> bereits gespeicherte n-Indizes bleiben unveraendert.
      return base.concat(extra);
    }
    function imgEls() {
      var root = editRoot(); if (!root) return [];
      var alle = qsa(root, 'img').filter(function (el) {
        return !el.closest('.fv-gallery') && !el.closest('.fv-extra-zone');
      });
      // Nachtraeglich eingesetzte Bilder (eigene Programme) ans Ende ->
      // bereits gespeicherte Bilder bleiben auf ihren Plaetzen.
      var pre = alle.filter(function (el) { return !el.closest('[data-fv-text-extra]'); });
      var spaet = alle.filter(function (el) { return !!el.closest('[data-fv-text-extra]'); });
      return pre.concat(spaet);
    }
    // Status-Schilder ("In Entwicklung" usw.) - eigene Kategorie. Bereits vorhandene
    // zuerst, spaeter ergaenzte (data-fv-added) danach -> alte Speicherstaende bleiben
    // auf den richtigen Schildern.
    function statusEls() {
      var root = editRoot(); if (!root) return [];
      var all = qsa(root, STATUS_SEL);
      var pre = all.filter(function (el) { return !el.hasAttribute('data-fv-added'); });
      var add = all.filter(function (el) { return el.hasAttribute('data-fv-added'); });
      return pre.concat(add);
    }
    function linkEls() {
      var root = editRoot(); if (!root) return [];
      return qsa(root, LINK_SEL);
    }
    function sortableConts() { return qsa(editRoot(), SORTABLE_SEL); }
    function cardsOf(cont) {
      return Array.prototype.slice.call(cont.children).filter(function (c) {
        return c.nodeType === 1 && c.matches && c.matches(CARD_SEL);
      });
    }

    function keyed() {
      var t = textEls(), i = imgEls(), s = statusEls(), d = linkEls(), n = navEls();
      // Knopf-Beschriftung: eigener Schluessel am selben Element (b0, b1 ...),
      // damit Text UND Ziel getrennt gespeichert werden koennen.
      d.forEach(function (el, idx) { el.setAttribute('data-fvkb', 'b' + idx); });
      t.forEach(function (el, idx) { el.setAttribute('data-fvk', 't' + idx); });
      i.forEach(function (el, idx) { el.setAttribute('data-fvk', 'i' + idx); });
      s.forEach(function (el, idx) { el.setAttribute('data-fvk', 's' + idx); });
      d.forEach(function (el, idx) { el.setAttribute('data-fvk', 'd' + idx); });
      n.forEach(function (el, idx) { el.setAttribute('data-fvk', 'n' + idx); });
      return { t: t, i: i, s: s, d: d, n: n };
    }

    /* ---- Speichern / Laden -------------------------------------------- */
    function save(block, type, value, page) {
      return fetch(API + '/content', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: page || SLUG, block: block, type: type, value: value, password: adminPw() })
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    }
    function fetchContent(page) {
      return fetch(API + '/content?page=' + encodeURIComponent(page), { method: 'GET' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) {
          var map = {};
          if (res && res.items) res.items.forEach(function (it) { map[it.block] = it; });
          return map;
        })
        .catch(function () { return {}; });
    }

    // Leeres Status-Schild: fuer Besucher ausblenden; im Bearbeiten-Modus als
    // Platzhalter sichtbar lassen (zum Befuellen).
    function applyStatus(el) {
      el.removeAttribute('hidden');   // ab jetzt steuert JS die Sichtbarkeit
      var txt = (el.textContent || '').trim();
      if (!txt) {
        if (EDITING) { el.style.display = ''; el.classList.add('fv-status-empty'); }
        else { el.style.display = 'none'; }
      } else {
        el.classList.remove('fv-status-empty');
        el.style.display = '';
      }
    }

    function applyOrder(map) {
      sortableConts().forEach(function (cont, idx) {
        var o = map['o' + idx];
        if (!o || o.type !== 'text' || !o.value) return;
        var order;
        try { order = JSON.parse(o.value); } catch (e) { return; }
        if (!Array.isArray(order)) return;
        var cards = cardsOf(cont);
        var byHref = {};
        cards.forEach(function (c) { byHref[c.getAttribute('href')] = c; });
        order.forEach(function (href) {
          var c = byHref[href];
          if (c) { cont.appendChild(c); delete byHref[href]; }
        });
        // uebrig gebliebene (neue) Karten bleiben am Ende in bisheriger Reihenfolge
      });
    }

    /* ---- Vorhandene Elemente ausblenden (Block h0) ---------------------
       Gespeichert wird eine Liste von Schluesseln, z.B. ["t7","i3"].
       Besucher sehen diese Elemente gar nicht. Im Bearbeiten-Modus bleiben
       sie blass sichtbar, damit du sie wieder einblenden kannst. */
    var versteckt = [];
    function parseHidden(item) {
      versteckt = [];
      if (item && item.type === 'text' && item.value) {
        try {
          var a = JSON.parse(item.value);
          if (Array.isArray(a)) versteckt = a.filter(function (x) { return typeof x === 'string'; });
        } catch (e) {}
      }
    }
    function saveHidden() { return save('h0', 'text', JSON.stringify(versteckt)); }
    function istVersteckt(key) { return versteckt.indexOf(key) !== -1; }

    function applyHidden(k) {
      var alle = [].concat(k.t, k.i, k.s, k.d);
      alle.forEach(function (el) {
        var key = el.getAttribute('data-fvk');
        if (!key) return;
        el.classList.remove('fv-verborgen');
        var alt = el.parentNode && el.parentNode.querySelector
          ? el.parentNode.querySelector('.fv-zurueck[data-fuer="' + key + '"]') : null;
        if (alt) alt.parentNode.removeChild(alt);

        if (!istVersteckt(key)) { el.style.removeProperty('display'); return; }

        if (!EDITING) { el.style.display = 'none'; return; }

        // Bearbeiten-Modus: blass zeigen + Knopf zum Wiedereinblenden
        el.style.removeProperty('display');
        el.classList.add('fv-verborgen');
        var zurueck = document.createElement('button');
        zurueck.type = 'button';
        zurueck.className = 'fv-zurueck';
        zurueck.setAttribute('data-fuer', key);
        zurueck.textContent = '\u21BA wieder einblenden';
        zurueck.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          var i = versteckt.indexOf(key);
          if (i !== -1) versteckt.splice(i, 1);
          saveHidden().then(function () { applyHidden(k); });
        });
        if (el.parentNode) el.parentNode.insertBefore(zurueck, el.nextSibling);
      });
    }

    /* Schwebender Knopf zum Ausblenden - erscheint beim Zeigen auf ein Element */
    function hideButton(k) {
      if (!EDITING || document.querySelector('.fv-weg-btn')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fv-weg-btn';
      btn.innerHTML = '\u2715';
      btn.setAttribute('title', 'Dieses Feld entfernen (l\u00e4sst sich \u00fcber \u21BA wieder einblenden)');
      btn.style.display = 'none';
      document.body.appendChild(btn);

      var ziel = null, weg = null;
      function zeigen(el) {
        if (!el || el.classList.contains('fv-verborgen')) { verstecken(); return; }
        ziel = el;
        var r = el.getBoundingClientRect();
        if (r.width < 12 || r.height < 12) { verstecken(); return; }
        btn.style.display = 'block';
        btn.style.top = Math.max(4, r.top + window.scrollY - 10) + 'px';
        btn.style.left = Math.max(4, r.right + window.scrollX - 12) + 'px';
      }
      function verstecken() { clearTimeout(weg); weg = setTimeout(function () { btn.style.display = 'none'; ziel = null; }, 260); }

      document.addEventListener('mouseover', function (e) {
        if (!e.target || !e.target.closest) return;
        if (e.target.closest('.fv-weg-btn') || e.target.closest('.fv-admin-bar')) { clearTimeout(weg); return; }
        /* Frueher waren Kopf- und Fusszeile ausgenommen. Damit liess sich ein
           leeres Feld dort nicht mehr entfernen - genau der Fall, in dem sich
           zwei Rahmen im Kopf ueberlagert haben. Jetzt gilt der Knopf ueberall. */
        var el = e.target.closest('[data-fvk]');
        if (el) { clearTimeout(weg); zeigen(el); }
        else verstecken();
      });
      btn.addEventListener('mouseenter', function () { clearTimeout(weg); });
      btn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (!ziel) return;
        var key = ziel.getAttribute('data-fvk');
        if (!key || istVersteckt(key)) return;
        /* Rueckfrage, damit ein Fehlklick nichts wegnimmt. Der Text nennt,
           WAS verschwindet - sonst weiss man beim Bestaetigen nicht, was
           gemeint war. */
        var probe = (ziel.textContent || '').replace(/\s+/g, ' ').trim();
        if (!probe) probe = ziel.tagName.toLowerCase() === 'img' ? 'ein Bild' : 'ein leeres Feld';
        else if (probe.length > 60) probe = probe.slice(0, 57) + '\u2026';
        if (!window.confirm('Dieses Feld wirklich entfernen?\n\n' + probe
            + '\n\nDu kannst es \u00fcber \u201e\u21BA wieder einblenden\u201c zur\u00fcckholen.')) return;
        versteckt.push(key);
        btn.style.display = 'none';
        saveHidden().then(function () { applyHidden(k); });
      });
    }

    /* ---- Abschnitte umsortieren (Block q0) -----------------------------
       Gespeichert wird die Reihenfolge der Abschnitts-Kennungen. Abschnitte,
       die nicht in der Liste stehen, bleiben am Ende in bisheriger Folge. */
    function abschnitte() {
      var root = editRoot(); if (!root) return [];
      var traeger = root.querySelector('.program-detail__body');
      if (!traeger) return [];
      return qsa(traeger, ':scope > section[aria-labelledby]');
    }
    function applySectionOrder(map) {
      var liste = abschnitte(); if (!liste.length) return;
      var traeger = liste[0].parentNode;
      var o = map['q0'];
      if (o && o.type === 'text' && o.value) {
        var reihe;
        try { reihe = JSON.parse(o.value); } catch (e) { reihe = null; }
        if (Array.isArray(reihe)) {
          var nach = {};
          liste.forEach(function (sec) { nach[sec.getAttribute('aria-labelledby')] = sec; });
          reihe.forEach(function (id) {
            if (nach[id]) { traeger.appendChild(nach[id]); delete nach[id]; }
          });
        }
      }
      if (!EDITING) return;

      // Pfeile zum Verschieben einsetzen
      abschnitte().forEach(function (sec) {
        if (sec.querySelector(':scope > .fv-sec-leiste')) return;
        var leiste = document.createElement('div');
        leiste.className = 'fv-sec-leiste';
        function knopf(z, titel, richtung) {
          var b = document.createElement('button');
          b.type = 'button'; b.className = 'fv-sec-k'; b.innerHTML = z;
          b.setAttribute('title', titel);
          b.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            var alle = abschnitte();
            var i = alle.indexOf(sec);
            var j = i + richtung;
            if (j < 0 || j >= alle.length) return;
            if (richtung < 0) sec.parentNode.insertBefore(sec, alle[j]);
            else sec.parentNode.insertBefore(alle[j], sec);
            var neueReihe = abschnitte().map(function (x) { return x.getAttribute('aria-labelledby'); });
            save('q0', 'text', JSON.stringify(neueReihe));
          });
          leiste.appendChild(b);
        }
        knopf('\u2191', 'Abschnitt nach oben', -1);
        knopf('\u2193', 'Abschnitt nach unten', 1);
        sec.appendChild(leiste);
      });
    }

    function applyOverrides(k) {
      return Promise.all([fetchContent(SLUG), fetchContent(GLOBAL)]).then(function (res) {
        var map = res[0] || {}, gmap = res[1] || {};
        k.t.forEach(function (el) { var o = map[el.getAttribute('data-fvk')]; if (o && o.type === 'text') el.innerHTML = o.value; });
        k.i.forEach(function (el) { var o = map[el.getAttribute('data-fvk')]; if (o && o.type === 'image' && o.value) el.src = o.value; });
        k.d.forEach(function (el) {
          var o = map[el.getAttribute('data-fvk')];
          if (o && o.type === 'link' && /^(https?:\/\/|\/)/i.test(o.value)) el.setAttribute('href', o.value);
          var b = map[el.getAttribute('data-fvkb')];
          if (b && b.type === 'text' && b.value) el.textContent = b.value;
        });
        k.s.forEach(function (el) { var o = map[el.getAttribute('data-fvk')]; if (o && o.type === 'text') el.innerHTML = o.value; applyStatus(el); });
        k.n.forEach(function (el) { var o = gmap[el.getAttribute('data-fvk')]; if (o && o.type === 'text') el.innerHTML = o.value; });
        var vo = map['v0']; if (vo && vo.type === 'video' && vo.value) renderVideo(vo.value);
        parseGallery(map['g0']); renderGallery();
        applyOrder(map);
        parseCustom(map['x0']); renderCustom();
        parseHidden(map['h0']); applyHidden(k); hideButton(k);
        applySectionOrder(map);
        // Web-Apps im Menue: global gespeichert, damit sie auf JEDER Seite
        // gleich aussehen. Muss auch fuer Besucher laufen, nicht nur im
        // Bearbeiten-Modus - sonst sehen sie noch die alten Eintraege.
        // Download-Bereiche ein-/ausblenden. Muss auch fuer Besucher laufen -
        // sonst sehen sie einen Bereich, den der Admin abgeschaltet hat.
        parseBereiche(map['y0']); renderBereiche();
        // Statuszeichen aus der gemeinsamen Ablage - auch fuer Besucher.
        parseStatusListe(gmap['z0']); renderStatusListe();
      }).catch(function () {});
    }

    function flash(el, ok) {
      el.classList.remove('fv-saving');
      el.classList.add(ok ? 'fv-saved' : 'fv-error');
      setTimeout(function () { el.classList.remove('fv-saved', 'fv-error'); }, 1200);
    }

    /* ---- Texte bearbeiten (Body + Navigation) ------------------------- */
    /* Beim Bearbeiten hineingeratenes HTML herausfiltern.
     * ----------------------------------------------------------------
     * Ein contenteditable-Element innerhalb eines <a> ist heikel: markiert
     * man den Text und tippt darueber, zieht der Browser mitunter das
     * umgebende Element mit hinein. Beobachtet am Statuszeichen der
     * Kacheln - dort landete eine komplette Kachel im Feld:
     *     W<a class="program-button" href="/aufgabenplaner" ...>
     * Danach erschien der Aufgabenplaner mehrfach und alles verrutschte.
     *
     * Erlaubt bleiben nur die Auszeichnungen, die hier Sinn ergeben:
     * fett, kursiv, Zeilenumbruch. Alles andere wird auf seinen Text
     * zurueckgefuehrt - der Inhalt bleibt, die Struktur verschwindet. */
    var ERLAUBT = { B: 1, STRONG: 1, I: 1, EM: 1, BR: 1, U: 1, SPAN: 1 };

    function sauberesHtml(el) {
      var hilfe = document.createElement('div');
      hilfe.innerHTML = el.innerHTML;
      // Von innen nach aussen: was nicht erlaubt ist, durch seinen Text ersetzen
      var gefunden = true, runden = 0;
      while (gefunden && runden < 20) {
        gefunden = false; runden++;
        var alle = hilfe.querySelectorAll('*');
        for (var i = alle.length - 1; i >= 0; i--) {
          var k = alle[i];
          if (!ERLAUBT[k.tagName]) {
            k.parentNode.replaceChild(document.createTextNode(k.textContent || ''), k);
            gefunden = true;
          } else {
            // Auch bei erlaubten Elementen: Attribute wegwerfen (style, class, href)
            while (k.attributes.length) k.removeAttribute(k.attributes[0].name);
          }
        }
      }
      return hilfe.innerHTML;
    }

    function editableText(el, page) {
      el.setAttribute('contenteditable', 'true');
      el.classList.add('fv-editable');
      el.setAttribute('spellcheck', 'false');
      // Sitzt der Text in einem Link (Kachel, Navigation), darf der Klick zum
      // Bearbeiten die Seite NICHT oeffnen.
      if (el.matches('a') || el.closest('a')) {
        el.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); });
      }
      /* Fallenlassen ganz verbieten und Einfuegen nur als reinen Text.
         Beides sind die Wege, auf denen fremdes HTML in ein Feld gelangt. */
      el.addEventListener('drop', function (e) { e.preventDefault(); e.stopPropagation(); });
      el.addEventListener('dragover', function (e) { e.preventDefault(); });
      el.addEventListener('paste', function (e) {
        try {
          e.preventDefault();
          var t = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
          document.execCommand('insertText', false, t);
        } catch (_e) { /* aeltere Browser: dann eben ungefiltert, blur raeumt auf */ }
      });

      var orig = el.innerHTML;
      el.addEventListener('blur', function () {
        var v = sauberesHtml(el);
        // Wurde etwas herausgefiltert, auch die Anzeige berichtigen -
        // sonst steht auf dem Schirm etwas anderes als in der Datenbank.
        if (v !== el.innerHTML) el.innerHTML = v;
        if (v === orig) return;
        orig = v; el.classList.add('fv-saving');
        save(el.getAttribute('data-fvk'), 'text', v, page).then(function (ok) { flash(el, ok); });
      });
    }
    function enableText(els, page) { els.forEach(function (el) { editableText(el, page); }); }
    function enableNav(els) { els.forEach(function (el) { editableText(el, GLOBAL); }); }

    /* ---- Status-Schilder bearbeiten (leer = ausgeblendet) ------------- */
    function enableStatus(els) {
      els.forEach(function (el) {
        el.setAttribute('contenteditable', 'true');
        el.classList.add('fv-editable');
        el.setAttribute('spellcheck', 'false');
        el.style.display = '';
        if (el.closest('a')) {
          el.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); });
        }
        el.addEventListener('drop', function (e) { e.preventDefault(); e.stopPropagation(); });
        el.addEventListener('dragover', function (e) { e.preventDefault(); });
        el.addEventListener('paste', function (e) {
          try {
            e.preventDefault();
            var t = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
            document.execCommand('insertText', false, t);
          } catch (_e) {}
        });

        var orig = el.innerHTML;
        el.addEventListener('focus', function () { el.classList.remove('fv-status-empty'); });
        el.addEventListener('blur', function () {
          var v = sauberesHtml(el);
          if (v !== el.innerHTML) el.innerHTML = v;
          if (v === orig) { applyStatus(el); return; }
          orig = v;
          var store = el.textContent && el.textContent.trim() ? v : '';   // leer -> ausgeblendet
          el.classList.add('fv-saving');
          save(el.getAttribute('data-fvk'), 'text', store).then(function (ok) { flash(el, ok); applyStatus(el); });
        });
      });
    }

    /* ---- Bilder tauschen ---------------------------------------------- */
    function downscale(file, cb) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1600, w = img.width, h = img.height;
        if (w > max || h > max) { if (w > h) { h = Math.round(h * max / w); w = max; } else { w = Math.round(w * max / h); h = max; } }
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
          /* Bildformat waehlen - hier hakte es:
             Frueher wurde ein PNG nur bei unter 360000 Bildpunkten als PNG
             behalten, alles Groessere ging als JPEG raus. JPEG kennt keine
             Transparenz, also wurde der durchsichtige Rand SCHWARZ. Genau
             so bekamen die Plaketten ihren Kasten (1536x1024 = 1572864).

             Jetzt entscheidet nicht die Groesse, sondern ob das Bild
             ueberhaupt durchsichtige Stellen hat. */
          var durchsichtig = false;
          try {
            var pk = c.getContext('2d').getImageData(0, 0, w, h).data;
            // Jeden 40. Bildpunkt pruefen - ein durchsichtiger Rand faellt
            // dabei sicher auf, und es bleibt zuegig.
            for (var pi = 3; pi < pk.length; pi += 160) {
              if (pk[pi] < 250) { durchsichtig = true; break; }
            }
          } catch (_e) {
            durchsichtig = /png|webp|gif/.test(file.type || '');
          }
          var mime = 'image/jpeg';
          if (durchsichtig) {
            // WebP kann Alpha und ist viel kleiner als PNG.
            mime = 'image/webp';
            try {
              if (c.toDataURL('image/webp').indexOf('data:image/webp') !== 0) mime = 'image/png';
            } catch (_e) { mime = 'image/png'; }
          }
          try { cb(c.toDataURL(mime, 0.9), mime); } catch (e) { cb(null); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
      img.src = url;
    }
    function uploadImage(dataUrl, mime) {
      return fetch(API + '/image', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: adminPw(), mime: mime, dataUrl: dataUrl })
      }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }
    function enableImages(els) {
      els.forEach(function (el) {
        el.classList.add('fv-editable-img');
        function handle(file) {
          if (!file || !/^image\//.test(file.type)) return;
          el.classList.add('fv-saving');
          downscale(file, function (dataUrl, mime) {
            if (!dataUrl) { flash(el, false); return; }
            uploadImage(dataUrl, mime).then(function (res) {
              if (res && res.url) {
                el.src = res.url;
                save(el.getAttribute('data-fvk'), 'image', res.url).then(function (ok) { flash(el, ok); });
              } else { flash(el, false); }
            });
          });
        }
        el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('fv-drop'); });
        el.addEventListener('dragleave', function () { el.classList.remove('fv-drop'); });
        el.addEventListener('drop', function (e) {
          e.preventDefault(); el.classList.remove('fv-drop');
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]);
        });
        el.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
          inp.onchange = function () { if (inp.files && inp.files[0]) handle(inp.files[0]); };
          inp.click();
        });
      });
    }

    /* ---- Video setzen -------------------------------------------------- */
    function ytId(u) {
      u = String(u || '').trim();
      if (!u) return '';
      if (/^[A-Za-z0-9_-]{6,}$/.test(u)) return u;
      var q = u.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
      if (q) return q[1];
      var p = u.match(/(?:youtu\.be\/|\/(?:embed|shorts|v|live)\/)([A-Za-z0-9_-]{6,})/i);
      if (p) return p[1];
      return '';
    }
    function videoSection() {
      var h = document.getElementById('tutorial-title');
      return h ? (h.closest('section') || h.parentNode) : null;
    }
    function renderVideo(id) {
      var h = document.getElementById('tutorial-title');
      if (!h || !id) return;
      var sec = videoSection();
      var box = sec ? sec.querySelector('.video-embed.fv-video-box') : null;
      if (!box) {
        box = document.createElement('div');
        box.className = 'video-embed fv-video-box';
        var p = h.nextElementSibling;
        while (p && p.tagName !== 'P') p = p.nextElementSibling;
        if (p) p.style.display = 'none';
        h.parentNode.insertBefore(box, h.nextSibling);
      }
      var host = 'https://www.youtube-nocookie.com';
      box.innerHTML = '';
      var facade = document.createElement('button');
      facade.type = 'button';
      facade.className = 'fv-video-facade';
      facade.setAttribute('aria-label', 'Video abspielen');
      facade.style.backgroundImage = "url('https://i.ytimg.com/vi/" + id + "/hqdefault.jpg')";
      facade.innerHTML = '<span class="fv-video-play" aria-hidden="true"></span>';
      facade.addEventListener('click', function () {
        try {
          fetch(API + '/hit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'video:' + SLUG }), keepalive: true });
        } catch (e) {}
        var fr = document.createElement('iframe');
        fr.setAttribute('src', host + '/embed/' + id + '?rel=0&autoplay=1');
        fr.setAttribute('title', 'Video');
        fr.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
        fr.setAttribute('allowfullscreen', '');
        box.innerHTML = '';
        box.appendChild(fr);
      });
      box.appendChild(facade);
    }
    function enableVideo() {
      var h = document.getElementById('tutorial-title');
      if (!h || document.querySelector('.fv-vid-edit')) return;
      var bar = document.createElement('div');
      bar.className = 'fv-vid-edit';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fv-vid-btn';
      btn.textContent = '\u25B6 Video (YouTube-Link) setzen / \u00e4ndern';
      btn.addEventListener('click', function () {
        var u = window.prompt('YouTube-Link oder Video-ID einf\u00fcgen:');
        if (u === null) return;
        var id = ytId(u);
        if (!id) { window.alert('Konnte keine YouTube-Video-ID erkennen.'); return; }
        save('v0', 'video', id).then(function (ok) {
          if (ok) renderVideo(id); else window.alert('Speichern fehlgeschlagen.');
        });
      });
      bar.appendChild(btn);
      h.parentNode.insertBefore(bar, h.nextSibling);
    }

    /* ---- Download-/Aktions-Links (Ziel-URL) ---------------------------
     * Knoepfe: Beschriftung direkt im Knopf bearbeiten, das Ziel in einer
     * Zeile darunter. Die Zeile steht im Bearbeiten-Modus DAUERHAFT offen -
     * kein Ketten-Knopf, kein Aufklappen, kein Popup. Ein Pfad laesst sich
     * so direkt hineinkopieren.
     *
     * Wird ein Ziel gespeichert, meldet die Zeile das per Ereignis
     * "fv:ziel-gesetzt" an das Dokument. Die App-Aktualisierung weiter unten
     * hoert mit und traegt Adresse und Versionsnummer gleich bei sich ein.
     * Beide Bereiche bleiben dadurch unabhaengig voneinander.
     * ------------------------------------------------------------------- */
    function zielPruefen(u) {
      if (!u) return '';
      if (!/^(https?:\/\/|\/)/i.test(u)) {
        return 'Bitte eine vollst\u00e4ndige Adresse mit https:// \u2013 oder einen Pfad '
             + 'dieser Seite, der mit / beginnt.';
      }
      return '';
    }

    // Eindeutiger Bezug zwischen Knopf und seiner Zeile.
    function zielId(el) {
      return el.getAttribute('data-fvk') || el.getAttribute('data-fvx') || 'x';
    }

    /* Sagt Bescheid, dass ein Ziel gesetzt wurde. Wer will, hoert zu.
     *
     * "art" sagt, um welche Fassung es geht:
     *   ''     - vom Knopf "Ziel speichern": gilt fuer den gerade offenen Reiter
     *   'web'  - vom Web-App-Upload: gehoert IMMER in die Web-Fassung
     *
     * Ohne diese Unterscheidung passierte Folgendes: Wer eine Web-App hochlud,
     * waehrend der Reiter "Android-App" offen war, bekam die Adresse der
     * Web-App in das APK-Feld geschrieben - die Download-Adresse der
     * Android-App war damit weg. */
    function zielMelden(url, art, knopf) {
      try {
        document.dispatchEvent(new CustomEvent('fv:ziel-gesetzt',
          { detail: { url: url, art: art || '', knopf: knopf || null } }));
      } catch (_e) { /* aeltere Browser: dann eben ohne Automatik */ }
    }

    /* Baut die Ziel-Zeile unter einen Knopf.
     * el     = der Knopf, dessen Ziel gepflegt wird
     * key    = Blockschluessel zum Speichern (oder null bei eigenen Feldern)
     * fertig = eigener Speicherweg (selbst angelegte Knopf-Felder) */
    function zielZeileBauen(el, key, fertig) {
      if (!el || !el.parentNode) return null;
      var id = zielId(el);
      if (el.parentNode.querySelector('.fv-zielzeile[data-fuer="' + id + '"]')) return null;

      var zeile = document.createElement('div');
      zeile.className = 'fv-zielzeile';
      zeile.setAttribute('data-fuer', id);
      zeile.innerHTML =
        '<label class="fv-zielzeile__feld">Ziel des Knopfes'
      + '  <input type="text" spellcheck="false" autocomplete="off"'
      + '    placeholder="/FinnVelo/Aufgabenplaner/App-7.41.apk oder https://\u2026">'
      + '</label>'
      + '<div class="fv-zielzeile__leiste">'
      + '  <button type="button" class="fv-zielzeile__speichern">Ziel speichern</button>'
      + '  <span class="fv-zielzeile__melde"></span>'
      + '</div>'
      + '<p class="fv-zielzeile__hilfe">Vollst\u00e4ndige Adresse (https://\u2026) oder ein Pfad '
      + 'auf dieser Seite, der mit / beginnt. Leer lassen entfernt das Ziel.</p>';

      var feld  = zeile.querySelector('input');
      var melde = zeile.querySelector('.fv-zielzeile__melde');
      feld.value = el.getAttribute('href') || '';

      function sagen(text, art) {
        melde.textContent = text || '';
        melde.className = 'fv-zielzeile__melde' + (art ? ' ' + art : '');
      }
      function speichern() {
        var u = String(feld.value || '').trim();
        var meckern = zielPruefen(u);
        if (meckern) { sagen('\u2717 ' + meckern, 'schlecht'); feld.focus(); return; }
        sagen('Wird gespeichert \u2026');
        el.classList.add('fv-saving');
        if (typeof fertig === 'function') {
          fertig(u, el);
          sagen('\u2713 Gespeichert.', 'gut');
          zielMelden(u, '', el);
          setTimeout(function () { sagen(''); }, 3000);
          return;
        }
        save(key, 'link', u).then(function (ok) {
          if (ok && u) el.setAttribute('href', u);
          flash(el, ok);
          if (ok) {
            sagen('\u2713 Gespeichert.', 'gut');
            zielMelden(u, '', el);
            setTimeout(function () { sagen(''); }, 3000);
          } else {
            sagen('\u2717 Speichern fehlgeschlagen.', 'schlecht');
          }
        });
      }

      zeile.querySelector('.fv-zielzeile__speichern').addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation(); speichern();
      });

      /* Web-App hochladen. Frueher hing das an einem Knopf ".program-launch",
       * den es auf keiner Seite gab - die Moeglichkeit war dadurch nie
       * erreichbar. Jetzt sitzt sie dort, wo das Ziel des Knopfes ohnehin
       * gepflegt wird.
       * Der Slug ist die Seite plus die Kennung des Knopfes: so kann eine
       * Seite mehrere Web-Apps tragen, ohne dass sie sich gegenseitig
       * ueberschreiben. */
      feld.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); speichern(); }
      });
      // Klicks in der Zeile duerfen nicht als "Knopf bearbeiten" durchschlagen
      zeile.addEventListener('click', function (e) { e.stopPropagation(); });

      el.parentNode.insertBefore(zeile, el.nextSibling);
      return zeile;
    }

    function enableLinks(els) {
      els.forEach(function (el) {
        el.classList.add('fv-editable-link');
        el.setAttribute('title', 'Beschriftung anklicken zum \u00c4ndern \u2013 Ziel in der Zeile darunter');

        // a) Beschriftung bearbeiten
        el.setAttribute('contenteditable', 'true');
        el.setAttribute('spellcheck', 'false');
        el.classList.add('fv-editable');
        el.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); });
        (function (knopf) {
          var orig = knopf.textContent;
          knopf.addEventListener('blur', function () {
            var neu = (knopf.textContent || '').trim();
            if (neu === (orig || '').trim()) return;
            orig = neu;
            knopf.classList.add('fv-saving');
            save(knopf.getAttribute('data-fvkb'), 'text', neu).then(function (ok) { flash(knopf, ok); });
          });
        })(el);

        // b) Ziel: Zeile steht dauerhaft darunter
        zielZeileBauen(el, el.getAttribute('data-fvk'), null);
      });
    }

    /* ---- Planer/HTML-App hochladen (Startknopf oeffnet die Datei) ------
     * Der Admin laedt EINE in sich geschlossene HTML-Datei hoch. Sie wird auf
     * dem Server gespeichert (/api/app/<slug>) und der Startknopf zeigt darauf.
     * Fuer ALLE Besucher oeffnet der Knopf dann diese Datei.
     * ------------------------------------------------------------------- */
    /* enableAppUpload() ist entfallen. Sie suchte einen Knopf
     * ".program-launch a.button" - den es auf KEINER Seite des Projekts gibt.
     * Die Leiste erschien deshalb nie, und der Web-App-Upload war fuer den
     * Admin unerreichbar, obwohl der Server ihn laengst konnte.
     * Der Upload sitzt jetzt in der Ziel-Zeile unter jedem Knopf
     * (siehe zielZeileBauen), wo das Ziel ohnehin gepflegt wird.
     * ------------------------------------------------------------------- */

    /* ---- Oberflaechen-Galerie (Block g0) ------------------------------ */
    function galleryConts() {
      var root = editRoot(); if (!root) return [];
      return qsa(root, '[data-fv-gallery]');
    }
    function parseGallery(item) {
      galleryUrls = [];
      if (item && item.type === 'text' && item.value) {
        try {
          var arr = JSON.parse(item.value);
          if (Array.isArray(arr)) {
            galleryUrls = arr.filter(function (u) { return typeof u === 'string' && /^\/api\/image\//.test(u); });
          }
        } catch (e) {}
      }
    }
    function saveGallery() { return save('g0', 'text', JSON.stringify(galleryUrls)); }
    function moveImg(idx, dir) {
      var j = idx + dir;
      if (j < 0 || j >= galleryUrls.length) return;
      var t = galleryUrls[idx]; galleryUrls[idx] = galleryUrls[j]; galleryUrls[j] = t;
      renderGallery(); saveGallery();
    }
    function removeImg(idx) {
      if (idx < 0 || idx >= galleryUrls.length) return;
      if (!window.confirm('Dieses Bild aus der Galerie entfernen?')) return;
      galleryUrls.splice(idx, 1);
      renderGallery(); saveGallery();
    }
    function addFiles(files) {
      files = Array.prototype.slice.call(files || []).filter(function (f) { return f && /^image\//.test(f.type); });
      if (!files.length) return;
      var conts = galleryConts();
      conts.forEach(function (c) { c.classList.add('fv-saving'); });
      var queue = files.slice();
      (function next() {
        if (!queue.length) {
          conts.forEach(function (c) { c.classList.remove('fv-saving'); });
          renderGallery(); saveGallery();
          return;
        }
        downscale(queue.shift(), function (dataUrl, mime) {
          if (!dataUrl) { next(); return; }
          uploadImage(dataUrl, mime).then(function (res) {
            if (res && res.url) galleryUrls.push(res.url);
            next();
          });
        });
      })();
    }
    function pickImages() {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
      inp.onchange = function () { addFiles(inp.files); };
      inp.click();
    }
    function renderGallery() {
      galleryConts().forEach(function (cont) {
        cont.innerHTML = '';
        galleryUrls.forEach(function (url, idx) {
          var fig = document.createElement('figure');
          fig.className = 'program-media-card fv-gallery__item';
          var img = document.createElement('img');
          img.src = url; img.alt = 'Programmoberfl\u00e4che'; img.loading = 'lazy';
          fig.appendChild(img);
          if (EDITING) {
            var ctr = document.createElement('div');
            ctr.className = 'fv-gallery__ctrls';
            ctr.innerHTML =
              '<button type="button" class="fv-gallery__btn" data-a="l" title="Nach vorne">\u2190</button>'
            + '<button type="button" class="fv-gallery__btn" data-a="r" title="Nach hinten">\u2192</button>'
            + '<button type="button" class="fv-gallery__btn fv-gallery__btn--del" data-a="x" title="Entfernen">\u2715</button>';
            ctr.querySelector('[data-a="l"]').addEventListener('click', function () { moveImg(idx, -1); });
            ctr.querySelector('[data-a="r"]').addEventListener('click', function () { moveImg(idx, 1); });
            ctr.querySelector('[data-a="x"]').addEventListener('click', function () { removeImg(idx); });
            fig.appendChild(ctr);
          }
          cont.appendChild(fig);
        });
        if (EDITING) {
          var add = document.createElement('button');
          add.type = 'button';
          add.className = 'fv-gallery__add';
          add.innerHTML = '<span class="fv-gallery__plus" aria-hidden="true">+</span><span>Bild hinzuf\u00fcgen</span>';
          add.addEventListener('click', pickImages);
          cont.appendChild(add);
          if (!cont.getAttribute('data-fv-drop')) {
            cont.setAttribute('data-fv-drop', '1');
            cont.addEventListener('dragover', function (e) { e.preventDefault(); cont.classList.add('fv-gallery--drop'); });
            cont.addEventListener('dragleave', function () { cont.classList.remove('fv-gallery--drop'); });
            cont.addEventListener('drop', function (e) {
              e.preventDefault(); cont.classList.remove('fv-gallery--drop');
              if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
            });
          }
        }
        var sec = cont.closest('[data-fv-gallery-section]');
        if (sec) sec.style.display = (!galleryUrls.length && !EDITING) ? 'none' : '';
      });
    }

    /* ---- Kacheln sortieren (Ziehen, Block o0/o1/...) ------------------ */
    function saveOrder(cont, idx) {
      var hrefs = cardsOf(cont).map(function (c) { return c.getAttribute('href'); });
      return save('o' + idx, 'text', JSON.stringify(hrefs));
    }
    var drag = null;
    function onDragMove(e) {
      if (!drag) return;
      e.preventDefault();
      var under = document.elementFromPoint(e.clientX, e.clientY);
      var target = under && under.closest ? under.closest(CARD_SEL) : null;
      if (!target || target === drag.card || target.parentNode !== drag.cont) return;
      var r = target.getBoundingClientRect();
      var horizontal = drag.cont.classList.contains('program-button-grid');
      var before = horizontal ? (e.clientX < r.left + r.width / 2) : (e.clientY < r.top + r.height / 2);
      drag.cont.insertBefore(drag.card, before ? target : target.nextSibling);
    }
    function onDragEnd() {
      if (!drag) return;
      var d = drag; drag = null;
      d.card.classList.remove('fv-dragging');
      d.card.style.pointerEvents = '';
      document.removeEventListener('pointermove', onDragMove, true);
      document.removeEventListener('pointerup', onDragEnd, true);
      document.removeEventListener('pointercancel', onDragEnd, true);
      saveOrder(d.cont, d.idx);
      flash(d.card, true);
    }
    function startDrag(e, cont, card, idx, handle) {
      e.preventDefault(); e.stopPropagation();
      drag = { cont: cont, card: card, idx: idx };
      card.classList.add('fv-dragging');
      card.style.pointerEvents = 'none';   // damit elementFromPoint die Ziel-Karte findet
      try { handle.setPointerCapture(e.pointerId); } catch (_e) {}
      document.addEventListener('pointermove', onDragMove, true);
      document.addEventListener('pointerup', onDragEnd, true);
      document.addEventListener('pointercancel', onDragEnd, true);
    }
    function enableSortable() {
      sortableConts().forEach(function (cont, idx) {
        cont.classList.add('fv-sortable');
        cardsOf(cont).forEach(function (card) {
          if (card.querySelector(':scope > .fv-drag-handle')) return;
          card.classList.add('fv-sortable-item');
          // Im Bearbeiten-Modus nicht zur Programmseite navigieren (nur bearbeiten/ziehen).
          card.addEventListener('click', function (e) { e.preventDefault(); }, true);
          /* Das native Ziehen des Browsers unterbinden.
             Kacheln sind <a>-Elemente, und die sind von Haus aus ziehbar.
             Wer Text markieren will und dabei etwas zu weit zieht, startet
             unversehens einen Ziehvorgang - laesst er ueber einem
             bearbeitbaren Feld los, fuegt der Browser die KOMPLETTE KACHEL
             dort als HTML ein. Genau so geriet eine Kachel in ein
             Statuszeichen. Verschieben geht weiterhin, aber nur ueber den
             Griff rechts oben. */
          card.setAttribute('draggable', 'false');
          card.addEventListener('dragstart', function (e) {
            e.preventDefault(); e.stopPropagation();
          });
          Array.prototype.forEach.call(card.querySelectorAll('img'), function (b) {
            b.setAttribute('draggable', 'false');
          });
          var h = document.createElement('div');
          h.className = 'fv-drag-handle';
          h.setAttribute('title', 'Ziehen zum Verschieben');
          h.innerHTML = '\u2630';
          card.appendChild(h);
          h.addEventListener('pointerdown', function (e) { startDrag(e, cont, card, idx, h); });
        });
      });
    }

    /* ---- Zusatz-Bloecke: Text + Bild (Block x0) ------------------------
       Ein Block sieht so aus:
         { id, typ:'text'|'bild', html, url, alt, breite, ziel }
       breite: 'viertel' | 'drittel' | 'halb' | 'voll'
       ziel:   id des Abschnitts, in dem der Block sitzt ('' = Seitenende)
       Alte Bloecke (nur id+html) werden automatisch ergaenzt.
       ------------------------------------------------------------------ */
    function normBlock(b) {
      if (!b || typeof b.id !== 'string') return null;
      return {
        id: b.id,
        typ: ['bild', 'knopf', 'ueberschrift'].indexOf(b.typ) !== -1 ? b.typ : 'text',
        html: typeof b.html === 'string' ? b.html : '',
        url: typeof b.url === 'string' ? b.url : '',
        alt: typeof b.alt === 'string' ? b.alt : '',
        breite: ['viertel', 'drittel', 'halb', 'voll'].indexOf(b.breite) !== -1 ? b.breite : 'voll',
        ziel: typeof b.ziel === 'string' ? b.ziel : '',
        /* Freie Position: "anker" ist der Schluessel eines vorhandenen
           Elements (data-fvk), "wo" sagt davor oder danach. Ohne Anker
           landet das Feld wie bisher am Abschnittsende. */
        anker: typeof b.anker === 'string' ? b.anker : '',
        wo: b.wo === 'vor' ? 'vor' : 'nach',
        /* Startspalte im Zwoelfer-Raster. 0 heisst: von selbst einordnen
           (so verhalten sich alle Felder, die es vor dem Raster gab). */
        spalte: (function (v) {
          var n = parseInt(v, 10);
          return (isFinite(n) && n >= 1 && n <= 12) ? n : 0;
        })(b.spalte)
      };
    }
    function parseCustom(item) {
      customBlocks = [];
      if (item && item.type === 'text' && item.value) {
        try {
          var arr = JSON.parse(item.value);
          if (Array.isArray(arr)) {
            arr.forEach(function (b) { var n = normBlock(b); if (n) customBlocks.push(n); });
          }
        } catch (e) {}
      }
    }
    function saveCustom() { return save('x0', 'text', JSON.stringify(customBlocks)); }

    /* Moegliche Ablagestellen: jeder Abschnitt mit Ueberschrift + Seitenende */
    function zielListe() {
      var root = editRoot(); if (!root) return [];
      var out = [];
      qsa(root, 'section[aria-labelledby], article[aria-labelledby]').forEach(function (sec) {
        var id = sec.getAttribute('aria-labelledby');
        var h = id ? document.getElementById(id) : null;
        if (!h) return;
        var name = (h.textContent || '').trim();
        if (!name) return;
        if (out.length > 24) return;
        out.push({ id: id, name: name.length > 34 ? name.slice(0, 33) + '\u2026' : name, el: sec });
      });
      out.push({ id: '', name: 'Seitenende', el: root });
      return out;
    }
    /* Alle Stellen, an die ein Zusatzfeld in diesem Abschnitt kann.
       Das sind die vorhandenen Felder mit data-fvk - davor oder danach. */
    function ankerListe(sekEl) {
      var out = [];
      if (!sekEl) return out;
      qsa(sekEl, '[data-fvk]').forEach(function (el) {
        if (el.closest('.fv-extra')) return;          // eigene Felder nicht
        var k = el.getAttribute('data-fvk');
        if (!k) return;
        var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!t) t = (el.tagName.toLowerCase() === 'img') ? 'Bild' : 'leeres Feld';
        if (t.length > 30) t = t.slice(0, 29) + '\u2026';
        out.push({ key: k, name: t, el: el });
        if (out.length > 40) return;
      });
      return out;
    }
    function ankerElement(sekEl, key) {
      if (!sekEl || !key) return null;
      var treffer = null;
      qsa(sekEl, '[data-fvk]').forEach(function (el) {
        if (treffer || el.closest('.fv-extra')) return;
        if (el.getAttribute('data-fvk') === key) treffer = el;
      });
      return treffer;
    }

    /* ---- Felder mit der Maus ans Raster ziehen -------------------------
       Waagerecht bestimmt die Startspalte (Einrasten auf zwoelf Spalten),
       senkrecht die Reihenfolge in der Zone. Man kann auch in die Zone
       eines anderen Abschnitts ziehen.

       Bewusst KEINE festen Pixelpositionen: die Seite waechst mit, und
       auf einem Handy liegt bei festen Werten alles uebereinander. Im
       Raster faellt dort einfach alles auf volle Breite zusammen. */
    function ziehenAnbinden(griff, blockId) {
      var zieht = null;

      function zonenListe() {
        return alleZonen().filter(function (z) { return z.offsetParent !== null || true; });
      }
      function zoneUnter(x, y) {
        var treffer = null;
        zonenListe().forEach(function (z) {
          var r = z.getBoundingClientRect();
          // etwas Rand, damit man eine leere Zone auch treffen kann
          if (x >= r.left - 24 && x <= r.right + 24 && y >= r.top - 24 && y <= r.bottom + 24) treffer = z;
        });
        return treffer;
      }
      function spalteAus(zone, x) {
        var r = zone.getBoundingClientRect();
        if (r.width < 24) return 0;
        var breit = r.width / 12;
        var n = Math.floor((x - r.left) / breit) + 1;
        return Math.min(12, Math.max(1, n));
      }

      function anfang(x, y) {
        var i = -1;
        customBlocks.forEach(function (b, k) { if (b.id === blockId) i = k; });
        if (i === -1) return;
        var wrap = document.querySelector('[data-fv-block="' + blockId + '"]');
        if (!wrap) return;
        zieht = { idx: i, wrap: wrap, platz: document.createElement('div'), zone: null, spalte: 0 };
        zieht.platz.className = 'fv-extra fv-extra-platz';
        wrap.classList.add('fv-extra--zieht');
        document.body.classList.add('fv-zieht');
        bewegen(x, y);
      }

      function bewegen(x, y) {
        if (!zieht) return;
        var zone = zoneUnter(x, y);
        if (!zone) return;
        if (zieht.zone !== zone) {
          if (zieht.zone) zieht.zone.classList.remove('fv-zone-ziel');
          zone.classList.add('fv-zone-ziel');
          zieht.zone = zone;
        }
        zieht.spalte = spalteAus(zone, x);
        var sp = spanneVon(customBlocks[zieht.idx]);
        if (zieht.spalte + sp - 1 > 12) zieht.spalte = Math.max(1, 13 - sp);
        zieht.platz.style.gridColumn = zieht.spalte + ' / span ' + sp;

        /* Einfuegestelle: vor dem ersten Feld, dessen Mitte unter dem
           Zeiger liegt. So bleibt die Reihenfolge nachvollziehbar. */
        var kinder = Array.prototype.slice.call(zone.children).filter(function (c) {
          return c !== zieht.wrap && c !== zieht.platz && c.classList
              && c.classList.contains('fv-extra');
        });
        var vor = null;
        kinder.forEach(function (c) {
          if (vor) return;
          var r = c.getBoundingClientRect();
          if (y < r.top + r.height / 2) vor = c;
        });
        if (vor) zone.insertBefore(zieht.platz, vor);
        else zone.appendChild(zieht.platz);
      }

      function ende() {
        if (!zieht) return;
        var z = zieht;
        zieht = null;
        document.body.classList.remove('fv-zieht');
        if (z.wrap) z.wrap.classList.remove('fv-extra--zieht');
        if (z.zone) z.zone.classList.remove('fv-zone-ziel');
        if (!z.zone || !z.platz.parentNode) { renderCustom(); return; }

        var b = customBlocks[z.idx];
        if (!b) { renderCustom(); return; }
        b.spalte = z.spalte;
        b.anker = '';                                  // Raster schlaegt Anker
        b.ziel = z.zone.getAttribute('data-fv-zone') || '';

        /* Neue Stelle im Feld bestimmen: vor welchem eigenen Block liegt
           der Platzhalter? Dessen Position im Gesamtfeld ist das Ziel. */
        var nachher = z.platz.nextElementSibling;
        var nachId = null;
        while (nachher && !nachId) {
          if (nachher.getAttribute && nachher.getAttribute('data-fv-block')) {
            nachId = nachher.getAttribute('data-fv-block');
          }
          nachher = nachher.nextElementSibling;
        }
        if (z.platz.parentNode) z.platz.parentNode.removeChild(z.platz);

        customBlocks.splice(z.idx, 1);
        var einfuegen = customBlocks.length;
        if (nachId) {
          customBlocks.forEach(function (o, k) {
            if (o.id === nachId && einfuegen === customBlocks.length) einfuegen = k;
          });
        }
        customBlocks.splice(einfuegen, 0, b);
        saveCustom().then(renderCustom);
      }

      griff.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        anfang(e.clientX, e.clientY);
        function mv(ev) { ev.preventDefault(); bewegen(ev.clientX, ev.clientY); }
        function up() {
          document.removeEventListener('mousemove', mv);
          document.removeEventListener('mouseup', up);
          ende();
        }
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
      });
      griff.addEventListener('touchstart', function (e) {
        if (!e.touches || !e.touches[0]) return;
        e.preventDefault();
        anfang(e.touches[0].clientX, e.touches[0].clientY);
        function mv(ev) {
          if (!ev.touches || !ev.touches[0]) return;
          ev.preventDefault();
          bewegen(ev.touches[0].clientX, ev.touches[0].clientY);
        }
        function up() {
          griff.removeEventListener('touchmove', mv);
          griff.removeEventListener('touchend', up);
          ende();
        }
        griff.addEventListener('touchmove', mv, { passive: false });
        griff.addEventListener('touchend', up);
      }, { passive: false });
    }

    var SPANNE = { voll: 12, halb: 6, drittel: 4, viertel: 3 };
    function spanneVon(b) { return SPANNE[b.breite] || 12; }
    /* Legt ein Feld ins Raster. Ohne Startspalte bleibt es im Fluss -
       dann ordnet CSS es selbst ein, genau wie vor dem Umbau. */
    function rasterLage(wrap, b) {
      var sp = spanneVon(b);
      if (b.spalte >= 1 && b.spalte + sp - 1 <= 12) {
        wrap.style.gridColumn = b.spalte + ' / span ' + sp;
      } else {
        wrap.style.gridColumn = 'span ' + sp;
      }
    }

    function zoneIn(container, zielId) {
      var z = container.querySelector(':scope > .fv-extra-zone');
      if (!z) {
        z = document.createElement('div');
        z.className = 'fv-extra-zone';
        z.setAttribute('data-fv-zone', zielId);
        container.appendChild(z);
      }
      return z;
    }
    function alleZonen() {
      var root = editRoot(); if (!root) return [];
      return qsa(root, '.fv-extra-zone');
    }

    function renderCustom() {
      var root = editRoot(); if (!root) return;
      var ziele = zielListe();
      // alle Zonen leeren
      alleZonen().forEach(function (z) { z.innerHTML = ''; z.style.display = 'none'; });
      // frei gesetzte Felder abraeumen - sie haengen nicht in einer Zone
      qsa(root, '.fv-extra--frei').forEach(function (el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });

      ziele.forEach(function (ziel) {
        var eigene = [];
        customBlocks.forEach(function (b, i) {
          var zz = b.ziel;
          // unbekanntes Ziel -> ans Seitenende
          var bekannt = false;
          ziele.forEach(function (t) { if (t.id === zz) bekannt = true; });
          if (!bekannt) zz = '';
          if (zz === ziel.id) eigene.push({ b: b, i: i });
        });
        if (!eigene.length && !EDITING) return;

        var z = zoneIn(ziel.el, ziel.id);
        z.style.display = '';

        eigene.forEach(function (paar, pos) {
          var b = paar.b, idx = paar.i;
          var wrap = document.createElement('div');
          wrap.className = 'fv-extra fv-extra--' + b.breite + (b.typ === 'bild' ? ' fv-extra--bild' : '');
          wrap.setAttribute('data-fv-block', b.id);
          rasterLage(wrap, b);

          if (b.typ === 'bild') {
            var fig = document.createElement('figure');
            fig.className = 'fv-extra__figur';
            var img = document.createElement('img');
            img.className = 'fv-extra__img';
            img.setAttribute('data-fvx', b.id);
            img.src = b.url || 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">' +
              '<rect width="600" height="400" fill="%23151b28"/>' +
              '<text x="300" y="205" fill="%237b8ba6" font-family="sans-serif" font-size="26" text-anchor="middle">Bild w\u00e4hlen</text></svg>');
            img.alt = b.alt || '';
            img.loading = 'lazy';
            fig.appendChild(img);
            var cap = document.createElement('figcaption');
            cap.className = 'fv-extra__bu';
            cap.setAttribute('data-fvx', b.id + '-bu');
            cap.innerHTML = b.html || '';
            if (!EDITING && !b.html) cap.style.display = 'none';
            fig.appendChild(cap);
            wrap.appendChild(fig);

            if (EDITING) {
              img.classList.add('fv-editable-img');
              (function (bild, nr) {
                function nimm(file) {
                  if (!file || !/^image\//.test(file.type)) return;
                  bild.classList.add('fv-saving');
                  downscale(file, function (dataUrl, mime) {
                    if (!dataUrl) { flash(bild, false); return; }
                    uploadImage(dataUrl, mime).then(function (res) {
                      if (res && res.url) {
                        bild.src = res.url; customBlocks[nr].url = res.url;
                        saveCustom().then(function (ok) { flash(bild, ok); });
                      } else { flash(bild, false); }
                    });
                  });
                }
                bild.addEventListener('click', function (e) {
                  e.preventDefault(); e.stopPropagation();
                  var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
                  inp.onchange = function () { if (inp.files && inp.files[0]) nimm(inp.files[0]); };
                  inp.click();
                });
                bild.addEventListener('dragover', function (e) { e.preventDefault(); bild.classList.add('fv-drop'); });
                bild.addEventListener('dragleave', function () { bild.classList.remove('fv-drop'); });
                bild.addEventListener('drop', function (e) {
                  e.preventDefault(); bild.classList.remove('fv-drop');
                  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) nimm(e.dataTransfer.files[0]);
                });
              })(img, idx);

              cap.setAttribute('contenteditable', 'true');
              cap.setAttribute('spellcheck', 'false');
              cap.classList.add('fv-editable');
              cap.setAttribute('data-platzhalter', 'Bildunterschrift (darf leer bleiben)');
              (function (feld, nr) {
                var orig = feld.innerHTML;
                feld.addEventListener('blur', function () {
                  if (feld.innerHTML === orig) return;
                  orig = feld.innerHTML; customBlocks[nr].html = feld.innerHTML;
                  feld.classList.add('fv-saving');
                  saveCustom().then(function (ok) { flash(feld, ok); });
                });
              })(cap, idx);
            }
          } else if (b.typ === 'ueberschrift') {
            var h = document.createElement('h2');
            h.className = 'fv-extra__ueberschrift';
            h.setAttribute('data-fvx', b.id);
            h.innerHTML = b.html || 'Neue \u00dcberschrift';
            wrap.appendChild(h);
            if (EDITING) {
              h.setAttribute('contenteditable', 'true');
              h.setAttribute('spellcheck', 'false');
              h.classList.add('fv-editable');
              (function (feld, nr) {
                var orig = feld.innerHTML;
                feld.addEventListener('blur', function () {
                  if (feld.innerHTML === orig) return;
                  orig = feld.innerHTML; customBlocks[nr].html = feld.innerHTML;
                  feld.classList.add('fv-saving');
                  saveCustom().then(function (ok) { flash(feld, ok); });
                });
              })(h, idx);
            }
          } else if (b.typ === 'knopf') {
            var a = document.createElement('a');
            a.className = 'button fv-extra__knopf';
            a.setAttribute('data-fvx', b.id);
            a.setAttribute('href', b.url || '#');
            if (/^https?:/i.test(b.url || '')) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); }
            a.textContent = b.html || 'Neuer Knopf';
            wrap.appendChild(a);

            if (EDITING) {
              a.setAttribute('contenteditable', 'true');
              a.setAttribute('spellcheck', 'false');
              a.classList.add('fv-editable');
              a.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); });
              (function (knopf, nr) {
                var orig = knopf.textContent;
                knopf.addEventListener('blur', function () {
                  var t = (knopf.textContent || '').trim();
                  if (t === (orig || '').trim()) return;
                  orig = t; customBlocks[nr].html = t;
                  knopf.classList.add('fv-saving');
                  saveCustom().then(function (ok) { flash(knopf, ok); });
                });
              })(a, idx);

              // Ziel-Zeile steht auch hier dauerhaft unter dem Knopf.
              // renderCustom() zeichnet den Bereich neu und wuerde die Zeile
              // dabei verlieren - deshalb erst nach dem Neuzeichnen melden.
              (function (knopf, nr) {
                zielZeileBauen(knopf, null, function (u) {
                  customBlocks[nr].url = u;
                  saveCustom().then(function (ok) { flash(knopf, ok); renderCustom(); });
                });
              })(a, idx);
            }
          } else {
            var p = document.createElement('div');
            p.className = 'fv-extra__text';
            p.setAttribute('data-fvx', b.id);
            p.innerHTML = b.html;
            wrap.appendChild(p);
            if (EDITING) {
              p.setAttribute('contenteditable', 'true');
              p.setAttribute('spellcheck', 'false');
              p.classList.add('fv-editable');
              (function (feld, nr) {
                var orig = feld.innerHTML;
                feld.addEventListener('blur', function () {
                  if (feld.innerHTML === orig) return;
                  orig = feld.innerHTML; customBlocks[nr].html = feld.innerHTML;
                  feld.classList.add('fv-saving');
                  saveCustom().then(function (ok) { flash(feld, ok); });
                });
              })(p, idx);
            }
          }

          if (EDITING) {
            var leiste = document.createElement('div');
            leiste.className = 'fv-extra__leiste';

            function knopf(zeichen, titel, fn, aus) {
              var k = document.createElement('button');
              k.type = 'button'; k.className = 'fv-extra__k'; k.innerHTML = zeichen;
              k.setAttribute('title', titel);
              if (aus) { k.disabled = true; k.classList.add('fv-extra__k--aus'); }
              else k.addEventListener('click', fn);
              leiste.appendChild(k);
              return k;
            }

            // Reihenfolge innerhalb desselben Abschnitts
            /* Ziehgriff: fasst das Feld an und legt es aufs Raster.
               Die Pfeile bleiben - mit der Tastatur oder auf kleinen
               Bildschirmen ist Ziehen unhandlich. */
            var griff = document.createElement('button');
            griff.type = 'button';
            griff.className = 'fv-extra__k fv-zieh-griff';
            griff.innerHTML = '\u2807\u2807';
            griff.setAttribute('title', 'Ziehen, um das Feld am Raster auszurichten');
            griff.setAttribute('aria-label', 'Feld verschieben');
            leiste.appendChild(griff);
            ziehenAnbinden(griff, b.id);

            knopf('\u2191', 'Nach oben schieben', function () {
              var vorher = null;
              for (var i = idx - 1; i >= 0; i--) {
                if ((customBlocks[i].ziel || '') === (b.ziel || '')) { vorher = i; break; }
              }
              if (vorher === null) return;
              var tmp = customBlocks[vorher]; customBlocks[vorher] = customBlocks[idx]; customBlocks[idx] = tmp;
              saveCustom().then(renderCustom);
            }, pos === 0);

            knopf('\u2193', 'Nach unten schieben', function () {
              var nach = null;
              for (var i = idx + 1; i < customBlocks.length; i++) {
                if ((customBlocks[i].ziel || '') === (b.ziel || '')) { nach = i; break; }
              }
              if (nach === null) return;
              var tmp = customBlocks[nach]; customBlocks[nach] = customBlocks[idx]; customBlocks[idx] = tmp;
              saveCustom().then(renderCustom);
            }, pos === eigene.length - 1);

            // Breite
            var brSel = document.createElement('select');
            brSel.className = 'fv-extra__sel';
            brSel.setAttribute('title', 'Breite des Feldes');
            [['viertel', '\u00bc Breite'], ['drittel', '\u2153 Breite'], ['halb', '\u00bd Breite'], ['voll', 'Volle Breite']]
              .forEach(function (o) {
                var op = document.createElement('option');
                op.value = o[0]; op.textContent = o[1];
                if (b.breite === o[0]) op.selected = true;
                brSel.appendChild(op);
              });
            brSel.addEventListener('change', function () {
              customBlocks[idx].breite = brSel.value;
              // Breiter geworden? Startspalte zurueckziehen, damit das Feld
              // nicht ueber Spalte 12 hinausragt und stumm umbricht.
              var sp = spanneVon(customBlocks[idx]);
              if (customBlocks[idx].spalte && customBlocks[idx].spalte + sp - 1 > 12) {
                customBlocks[idx].spalte = Math.max(1, 13 - sp);
              }
              saveCustom().then(renderCustom);
            });
            leiste.appendChild(brSel);

            // Abschnitt (wohin gehoert der Block?)
            var zSel = document.createElement('select');
            zSel.className = 'fv-extra__sel fv-extra__sel--ziel';
            zSel.setAttribute('title', 'In welchen Abschnitt soll das Feld?');
            ziele.forEach(function (t) {
              var op = document.createElement('option');
              op.value = t.id; op.textContent = t.name;
              if ((b.ziel || '') === t.id) op.selected = true;
              zSel.appendChild(op);
            });
            zSel.addEventListener('change', function () {
              customBlocks[idx].ziel = zSel.value;
              customBlocks[idx].anker = '';        // neuer Abschnitt, alter Anker gilt nicht
              saveCustom().then(renderCustom);
            });
            leiste.appendChild(zSel);

            /* Position innerhalb des Abschnitts. Vorher landete jedes
               Zusatzfeld immer am Ende - man konnte es nicht zwischen
               vorhandene Felder setzen. */
            var pSel = document.createElement('select');
            pSel.className = 'fv-extra__sel fv-extra__sel--pos';
            pSel.setAttribute('title', 'Wohin im Abschnitt?');
            var opEnde = document.createElement('option');
            opEnde.value = '';
            opEnde.textContent = b.spalte
              ? ('im Raster, Spalte ' + b.spalte + '\u2013' + (b.spalte + spanneVon(b) - 1))
              : 'am Abschnittsende';
            if (!b.anker) opEnde.selected = true;
            pSel.appendChild(opEnde);

            // Zuruecksetzen: wieder von selbst einordnen lassen
            if (b.spalte) {
              var opFrei = document.createElement('option');
              opFrei.value = 'raster-aus';
              opFrei.textContent = '\u21BA Spalte aufheben';
              pSel.appendChild(opFrei);
            }
            ankerListe(ziel.el).forEach(function (a) {
              [['vor', '\u2191 vor: '], ['nach', '\u2193 nach: ']].forEach(function (r) {
                var op = document.createElement('option');
                op.value = r[0] + '|' + a.key;
                op.textContent = r[1] + a.name;
                if (b.anker === a.key && b.wo === r[0]) op.selected = true;
                pSel.appendChild(op);
              });
            });
            pSel.addEventListener('change', function () {
              var v = pSel.value;
              if (v === 'raster-aus') { customBlocks[idx].spalte = 0; customBlocks[idx].anker = ''; }
              else if (!v) { customBlocks[idx].anker = ''; }
              else {
                customBlocks[idx].spalte = 0;   // Anker und Raster schliessen sich aus
                var teil = v.split('|');
                customBlocks[idx].wo = teil[0];
                customBlocks[idx].anker = teil[1];
              }
              saveCustom().then(renderCustom);
            });
            leiste.appendChild(pSel);

            knopf('\u2715', 'Feld entfernen', function () {
              if (!window.confirm('Dieses Feld wirklich entfernen?')) return;
              customBlocks.splice(idx, 1);
              saveCustom().then(renderCustom);
            });
            leiste.querySelector('.fv-extra__k:last-child').classList.add('fv-extra__k--weg');

            wrap.appendChild(leiste);
          }

          /* Einhaengen: mit Anker direkt neben das gewaehlte Feld,
             sonst wie bisher in die Zone am Abschnittsende. */
          var ank = b.anker ? ankerElement(ziel.el, b.anker) : null;
          if (ank && ank.parentNode) {
            wrap.classList.add('fv-extra--frei');
            if (b.wo === 'vor') ank.parentNode.insertBefore(wrap, ank);
            else ank.parentNode.insertBefore(wrap, ank.nextSibling);
          } else {
            z.appendChild(wrap);
          }
        });

        if (EDITING) {
          var box = document.createElement('div');
          box.className = 'fv-extra-add-box';

          function anlegen(typ) {
            var id = 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            var vorgabeText = 'Neuer Text \u2013 hier klicken und bearbeiten.';
            if (typ === 'bild') vorgabeText = '';
            if (typ === 'knopf') vorgabeText = 'Herunterladen';
            if (typ === 'ueberschrift') vorgabeText = 'Neue \u00dcberschrift';
            customBlocks.push(normBlock({
              id: id, typ: typ, ziel: ziel.id,
              breite: (typ === 'bild') ? 'halb' : (typ === 'knopf' ? 'drittel' : 'voll'),
              html: vorgabeText,
              url: typ === 'knopf' ? 'https://github.com/finnveloprogrammwelten-crypto/finnvelo-programmwelten/releases' : ''
            }));
            saveCustom().then(renderCustom);
          }
          var bT = document.createElement('button');
          bT.type = 'button'; bT.className = 'fv-extra-add';
          bT.innerHTML = '<span aria-hidden="true">+</span> Textfeld';
          bT.addEventListener('click', function () { anlegen('text'); });
          var bB = document.createElement('button');
          bB.type = 'button'; bB.className = 'fv-extra-add';
          bB.innerHTML = '<span aria-hidden="true">+</span> Bildfeld';
          bB.addEventListener('click', function () { anlegen('bild'); });
          var bK = document.createElement('button');
          bK.type = 'button'; bK.className = 'fv-extra-add';
          bK.innerHTML = '<span aria-hidden="true">+</span> Knopf';
          bK.addEventListener('click', function () { anlegen('knopf'); });
          var bU = document.createElement('button');
          bU.type = 'button'; bU.className = 'fv-extra-add';
          bU.innerHTML = '<span aria-hidden="true">+</span> \u00dcberschrift';
          bU.addEventListener('click', function () { anlegen('ueberschrift'); });
          box.appendChild(bU); box.appendChild(bT); box.appendChild(bB); box.appendChild(bK);

          var wo = document.createElement('span');
          wo.className = 'fv-extra-add__wo';
          wo.textContent = ziel.id ? ('in \u201e' + ziel.name + '\u201c') : 'am Seitenende';
          box.appendChild(wo);

          z.appendChild(box);
        }
      });
    }

    /* ---- Raster: Schilder mit dem Schluessel an jedes Feld ------------- */
    function rasterSchilderWeg() {
      qsa(document, '.fv-raster-schild').forEach(function (el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    }
    function rasterSchilder() {
      rasterSchilderWeg();
      var gesehen = {};
      qsa(document, '[data-fvk], [data-fvx]').forEach(function (el) {
        var k = el.getAttribute('data-fvk') || el.getAttribute('data-fvx');
        if (!k) return;
        var r = el.getBoundingClientRect();
        if (r.width < 6 && r.height < 6) return;
        var schild = document.createElement('span');
        schild.className = 'fv-raster-schild';
        var leer = !((el.textContent || '').trim()) && el.tagName.toLowerCase() !== 'img';
        schild.textContent = k + (leer ? ' \u00b7 leer' : '');
        if (leer) schild.classList.add('fv-raster-schild--leer');
        if (gesehen[k]) schild.classList.add('fv-raster-schild--doppelt');
        gesehen[k] = true;
        schild.style.top = (r.top + window.scrollY) + 'px';
        schild.style.left = (r.left + window.scrollX) + 'px';
        document.body.appendChild(schild);
      });
    }
    var rasterTakt = null;
    window.addEventListener('resize', function () {
      if (!document.body.classList.contains('fv-raster-an')) return;
      clearTimeout(rasterTakt);
      rasterTakt = setTimeout(rasterSchilder, 180);
    });

    /* ---- Platz fuer die Admin-Leiste schaffen --------------------------
       Die Leiste liegt fest oben (position: fixed) und verdeckte bisher
       den oberen Rand der Seite: die klebende Kopfzeile sitzt bei top: 0,
       das Besucher-Abzeichen bei top: 84px - beide wussten nichts von
       ihr. Also wird die ECHTE Hoehe gemessen (sie bricht auf schmalen
       Bildschirmen um, ein fester Wert waere dort falsch) und als
       --fv-admin-hoehe hinterlegt. Das CSS schiebt damit die ganze Seite
       nach unten. */
    var hoehenTakt = null;
    function leistenHoeheMessen() {
      var bar = document.querySelector('.fv-admin-bar');
      var h = bar ? Math.round(bar.getBoundingClientRect().height) : 0;
      document.documentElement.style.setProperty('--fv-admin-hoehe', h + 'px');
      document.body.classList.toggle('fv-admin-an', h > 0);
    }
    function hoeheBeobachten() {
      leistenHoeheMessen();
      // ein zweites Mal nach dem ersten Zeichnen - Schriften und Umbruch
      // aendern die Hoehe noch
      setTimeout(leistenHoeheMessen, 60);
      setTimeout(leistenHoeheMessen, 400);
      window.addEventListener('resize', function () {
        clearTimeout(hoehenTakt);
        hoehenTakt = setTimeout(leistenHoeheMessen, 120);
      });
      if (window.ResizeObserver) {
        try {
          var bar = document.querySelector('.fv-admin-bar');
          if (bar) new ResizeObserver(leistenHoeheMessen).observe(bar);
        } catch (e) {}
      }
    }

    /* ---- Admin-Werkzeugleiste (mit Umschalter) ------------------------ */
    function toolbar() {
      if (document.querySelector('.fv-admin-bar')) return;
      var bar = document.createElement('div');
      bar.className = 'fv-admin-bar' + (EDITING ? ' fv-admin-bar--edit' : '');
      var pageLabel = SLUG === 'start' ? 'Startseite' : SLUG;
      var left = '<span class="fv-admin-title">\u2699\uFE0F Finnvelo-Admin</span>'
               + '<span class="fv-admin-page">Seite: ' + pageLabel + '</span>';
      var toggle = EDITING
        ? '<button type="button" class="fv-tgl fv-tgl--on">\u270E Bearbeiten: AN</button>'
        : '<button type="button" class="fv-tgl fv-tgl--off">\u270E Bearbeiten: AUS</button>';
      var hint = EDITING
        ? '<span class="fv-admin-hint">Texte anklicken \u00b7 Bilder klicken/ziehen \u00b7 Kacheln am Griff ziehen</span>'
        : '<span class="fv-admin-hint">Zum \u00c4ndern einschalten \u2013 sonst normal navigieren</span>';
      var right = '<span class="fv-admin-fehler" hidden></span>'
                + '<button type="button" class="fv-admin-btn fv-admin-putzen">\uD83E\uDDF9 Felder s\u00e4ubern</button>'
                + '<button type="button" class="fv-admin-btn fv-admin-werkzeuge" '
                + 'title="Alle Verwaltungs-K\u00e4sten \u2013 sie liegen auf der Programme-Seite">'
                + '\uD83E\uDDF0 Werkzeuge</button>'
                + '<button type="button" class="fv-admin-btn fv-admin-zurueck" '
                + 'title="Alle verschobenen Felder dieser Seite wieder an ihren Platz stellen">'
                + '\u21BA Verschiebungen</button>'
                + '<button type="button" class="fv-admin-btn fv-admin-vorschau" '
                + 'title="Die Seite in Handy- oder Tabletbreite ansehen">'
                + '\uD83D\uDCF1 Vorschau</button>'
                + '<button type="button" class="fv-admin-btn fv-admin-raster" '
                + 'title="Raster und Feldrahmen einblenden \u2013 zeigt, wo Felder sitzen und was sich \u00fcberlagert">'
                + '\u25A6 Raster</button>'
                + '<button type="button" class="fv-admin-btn fv-admin-sichern" '
                + 'title="Den gesamten Datenbestand als ZIP herunterladen">\uD83D\uDCBE Sicherung</button>'
                + '<button type="button" class="fv-admin-btn fv-admin-seiten">+ Seite</button>'
                + '<button type="button" class="fv-admin-btn fv-admin-verlauf">\u21BA Verlauf</button>'
                + '<button type="button" class="fv-admin-btn fv-admin-logout">Abmelden</button>';
      bar.innerHTML = '<div class="fv-admin-left">' + left + '</div>'
                    + '<div class="fv-admin-mid">' + toggle + hint + '</div>'
                    + '<div class="fv-admin-right">' + right + '</div>';
      document.body.appendChild(bar);
      document.body.classList.add('fv-admin-on');
      if (EDITING) document.body.classList.add('fv-edit-on');
      bar.querySelector('.fv-tgl').addEventListener('click', function () {
        try {
          if (EDITING) sessionStorage.removeItem(EDIT_KEY);
          else sessionStorage.setItem(EDIT_KEY, '1');
        } catch (e) {}
        location.reload();
      });
      bar.querySelector('.fv-admin-logout').addEventListener('click', function () {
        try { sessionStorage.removeItem(PW_KEY); sessionStorage.removeItem(EDIT_KEY); } catch (e) {}
        location.reload();
      });
      bar.querySelector('.fv-admin-verlauf').addEventListener('click', verlaufZeigen);
      hoeheBeobachten();

      bar.querySelector('.fv-admin-putzen').addEventListener('click', felderSaeubern);

      /* Raster: legt ein Gitter ueber die Seite und rahmt JEDES Feld ein -
         mit seinem Schluessel. Ueberlagerungen und leere Felder fallen
         damit sofort auf; ohne das sucht man sie mit dem Mauszeiger. */
      /* Werkzeug-Menue.
         Die neun Verwaltungs-Kaesten liegen alle auf /programme und nur
         im Bearbeiten-Modus. Das stand nirgends - man musste es wissen.
         Hier stehen sie beisammen, und ein Klick bringt einen hin. */
      var WERKZEUGE = [
        { klasse: 'fv-gest-box',     name: '\uD83C\uDFA8 Gestaltung',        was: 'Farben und Schrift' },
        { klasse: 'fv-bild-box',     name: '\uD83D\uDDBC\uFE0F Bilder',      was: 'ansehen und entfernen' },
        { klasse: 'fv-menue2-box',   name: '\uD83E\uDDED Hauptmen\u00fc',    was: 'Eintr\u00e4ge der Kopfzeile' },
        { klasse: 'fv-progverw-box', name: '\u2699\uFE0F Programme',          was: 'Seiten anlegen und verwalten' },
        { klasse: 'fv-menue-box',    name: '\u2699\uFE0F Men\u00fc Web-Apps', was: 'die Klappliste' },
        { klasse: 'fv-fuss-box',     name: '\u2699\uFE0F Fu\u00dfzeile',      was: 'Links unten' },
        { klasse: 'fv-kopf-box',     name: '\u2699\uFE0F Google-Eintrag',     was: 'Titel und Beschreibung' },
        { klasse: 'fv-sich-box',     name: '\uD83D\uDCBE Sicherung',          was: 'herunterladen und einspielen' },
        { klasse: 'fv-alt-box',      name: '\uD83E\uDDF9 Altlasten',          was: 'verwaiste Angaben' }
      ];
      var werkzeugKnopf = bar.querySelector('.fv-admin-werkzeuge');
      if (werkzeugKnopf) werkzeugKnopf.addEventListener('click', function (e) {
        e.stopPropagation();
        var alt2 = document.querySelector('.fv-werkzeug-menue');
        if (alt2) { alt2.parentNode.removeChild(alt2); return; }

        var menue = document.createElement('div');
        menue.className = 'fv-werkzeug-menue';
        var kopf = '<p class="fv-werkzeug-hinweis">Diese K\u00e4sten liegen auf der Seite '
                 + '<strong>Programme</strong> und brauchen <strong>Bearbeiten: AN</strong>.'
                 + (EDITING ? '' : ' Ein Klick schaltet beides f\u00fcr dich.') + '</p>';
        var liste = '';
        WERKZEUGE.forEach(function (t) {
          liste += '<button type="button" class="fv-werkzeug-eintrag" data-klasse="' + t.klasse + '">'
                +  '<span class="fv-werkzeug-name">' + t.name + '</span>'
                +  '<span class="fv-werkzeug-was">' + t.was + '</span></button>';
        });
        menue.innerHTML = kopf + '<div class="fv-werkzeug-liste">' + liste + '</div>';
        document.body.appendChild(menue);
        var r = werkzeugKnopf.getBoundingClientRect();
        menue.style.top = (r.bottom + window.scrollY + 6) + 'px';
        menue.style.right = Math.max(8, window.innerWidth - r.right) + 'px';

        menue.addEventListener('click', function (ev) {
          var k = ev.target.closest && ev.target.closest('.fv-werkzeug-eintrag');
          if (!k) return;
          var klasse = k.getAttribute('data-klasse');
          /* Bearbeiten einschalten ist hier KEIN heimlicher Eingriff:
             der Klick auf ein Werkzeug ist genau diese Absicht, und der
             Hinweis oben im Menue sagt es vorher. */
          try { sessionStorage.setItem(EDIT_KEY, '1'); } catch (_e) {}
          var hier = (location.pathname || '').toLowerCase().replace(/\.html?$/, '').replace(/\/+$/, '');
          if (hier === '/programme') {
            location.hash = 'werkzeug=' + klasse;
            location.reload();
          } else {
            location.href = '/programme#werkzeug=' + klasse;
          }
        });
        setTimeout(function () {
          document.addEventListener('click', function zu(ev) {
            if (menue.contains(ev.target)) return;
            if (menue.parentNode) menue.parentNode.removeChild(menue);
            document.removeEventListener('click', zu);
          });
        }, 0);
      });

      var zurueckKnopf = bar.querySelector('.fv-admin-zurueck');
      if (zurueckKnopf) zurueckKnopf.addEventListener('click', function () {
        document.dispatchEvent(new CustomEvent('fv:zuege-zuruecksetzen'));
      });

      var vorschauKnopf = bar.querySelector('.fv-admin-vorschau');
      if (vorschauKnopf) vorschauKnopf.addEventListener('click', function () {
        document.dispatchEvent(new CustomEvent('fv:vorschau-oeffnen'));
      });

      var rasterKnopf = bar.querySelector('.fv-admin-raster');
      if (rasterKnopf) rasterKnopf.addEventListener('click', function () {
        var an = document.body.classList.toggle('fv-raster-an');
        rasterKnopf.classList.toggle('an', an);
        try { sessionStorage.setItem('fv_raster', an ? '1' : '0'); } catch (e) {}
        if (an) rasterSchilder(); else rasterSchilderWeg();
      });
      // Die Sicherung liegt in einem eigenen Block - per Ereignis rufen.
      bar.querySelector('.fv-admin-sichern').addEventListener('click', function () {
        document.dispatchEvent(new CustomEvent('fv:sicherung-laden'));
      });
      // Die Seitenverwaltung liegt in einem eigenen Block - per Ereignis rufen.
      bar.querySelector('.fv-admin-seiten').addEventListener('click', function () {
        document.dispatchEvent(new CustomEvent('fv:seiten-oeffnen'));
      });
      fehlerHinweisHolen(bar);
    }

    /* ---- Hinweis auf neue Fehler --------------------------------------
     * Holt nur eine Zahl, nicht den ganzen Serverstatus. Der Zeitpunkt des
     * letzten Hinsehens liegt im Browser - so zeigt der Hinweis wirklich
     * nur, was seitdem dazugekommen ist. */
    var GESEHEN_KEY = 'fv_fehler_gesehen';

    function fehlerHinweisHolen(bar) {
      var seit = 0;
      try { seit = Number(localStorage.getItem(GESEHEN_KEY) || 0) || 0; } catch (e) { seit = 0; }
      fetch(API + '/fehler/anzahl', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: adminPw(), seit: seit })
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.anzahl) return;
          var feld = bar.querySelector('.fv-admin-fehler');
          if (!feld) return;
          feld.hidden = false;
          feld.innerHTML = '<button type="button" class="fv-admin-btn fv-admin-btn--warn">'
            + '\u26A0 ' + d.anzahl + (d.anzahl === 1 ? ' neuer Fehler' : ' neue Fehler') + '</button>';
          feld.querySelector('button').addEventListener('click', function () {
            // Ab jetzt gelten die bisherigen als gesehen.
            try { localStorage.setItem(GESEHEN_KEY, String(Date.now())); } catch (e) {}
            window.open('/serverstatus', '_blank', 'noopener');
            feld.hidden = true;
          });
        })
        .catch(function () { /* der Hinweis ist Beiwerk - nie stoeren */ });
    }

    /* ================================================================
     * Statuszeichen je Programm - einmal setzen, ueberall wirksam
     * ----------------------------------------------------------------
     * Dasselbe Zeichen ("Vollversion", "In Entwicklung" ...) steht an drei
     * Stellen: auf der Programmseite, in der Kachel der Startseite und in
     * der Zeile der Uebersicht. Bisher musste es dreimal einzeln gepflegt
     * werden - und lief regelmaessig auseinander.
     *
     * Jetzt liegt es EINMAL in der globalen Ablage (Block "z0"), als
     * Zuordnung { programm: zeichen }. Alle drei Stellen lesen daraus,
     * auch fuer Besucher.
     * ================================================================ */
    var STATUS_VORSCHLAEGE = ['In Entwicklung', 'Vollversion', 'Vollversion Weiterentwicklung'];
    var statusListe = {};

    function parseStatusListe(item) {
      statusListe = {};
      if (item && item.type === 'text' && item.value) {
        try {
          var o = JSON.parse(item.value);
          if (o && typeof o === 'object') statusListe = o;
        } catch (e) { statusListe = {}; }
      }
    }

    /* Zu welchem Programm gehoert dieses Statusfeld?
       - Auf einer Programmseite: die Seite selbst.
       - In einer Kachel oder Zeile: das Ziel des umgebenden Links. */
    function programmVonStatus(el) {
      var a = el.closest && el.closest('a[href^="/"]');
      if (a) {
        var z = (a.getAttribute('href') || '').replace(/^\/+|\/+$/g, '');
        if (z && z.indexOf('/') === -1) return z;
      }
      if (document.querySelector('article.program-detail')) return SLUG;
      return null;
    }

    function alleStatusFelder() {
      return Array.prototype.slice.call(
        document.querySelectorAll('.program-button__status, .program-detail__summary .status, .program-row .status'));
    }

    function renderStatusListe() {
      alleStatusFelder().forEach(function (el) {
        var p = programmVonStatus(el);
        if (!p) return;
        var wert = statusListe[p];
        if (typeof wert === 'string' && wert !== '' && el.innerHTML !== wert) {
          el.innerHTML = wert;
        }
      });
    }

    function statusSetzen(programm, wert) {
      if (!programm) return Promise.resolve(false);
      statusListe[programm] = wert;
      renderStatusListe();
      return save('z0', 'text', JSON.stringify(statusListe), GLOBAL);
    }

    /* Auswahlliste an ein Statusfeld haengen - kleiner Pfeil rechts.
       Der Text bleibt frei beschreibbar; die Liste ist nur eine Abkuerzung. */
    function statusAuswahl(el) {
      if (!EDITING) return;
      var programm = programmVonStatus(el);
      if (!programm) return;
      if (el.parentNode && el.parentNode.querySelector(':scope > .fv-status-pfeil')) return;

      var pfeil = document.createElement('button');
      pfeil.type = 'button';
      pfeil.className = 'fv-status-pfeil';
      pfeil.title = 'Aus der Liste waehlen';
      pfeil.textContent = '\u25BE';
      if (el.parentNode) el.parentNode.insertBefore(pfeil, el.nextSibling);

      pfeil.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var offen = document.querySelector('.fv-status-liste');
        if (offen) { offen.parentNode.removeChild(offen); return; }

        var liste = document.createElement('div');
        liste.className = 'fv-status-liste';
        STATUS_VORSCHLAEGE.forEach(function (t) {
          var k = document.createElement('button');
          k.type = 'button';
          k.className = 'fv-status-wahl' + (el.textContent.trim() === t ? ' an' : '');
          k.textContent = t;
          k.addEventListener('click', function () {
            liste.parentNode.removeChild(liste);
            statusSetzen(programm, t).then(function (gut) {
              flash(el, gut !== false);
            });
          });
          liste.appendChild(k);
        });
        /* Direkt UNTER dem Zeichen aufklappen, linksbuendig dazu - nicht
           versetzt ueber die Plakette daneben. Passt die Liste nach unten
           nicht mehr aufs Bild, klappt sie nach oben auf. */
        var r = el.getBoundingClientRect();
        liste.style.left = (window.scrollX + r.left) + 'px';
        liste.style.top = (window.scrollY + r.bottom + 6) + 'px';
        document.body.appendChild(liste);
        var lh = liste.getBoundingClientRect().height;
        if (r.bottom + 6 + lh > window.innerHeight && r.top - lh - 6 > 0) {
          liste.style.top = (window.scrollY + r.top - lh - 6) + 'px';
        }
        // Nicht ueber den rechten Rand hinaus
        var lb = liste.getBoundingClientRect();
        if (lb.right > window.innerWidth - 8) {
          liste.style.left = Math.max(8, window.scrollX + window.innerWidth - lb.width - 8) + 'px';
        }

        setTimeout(function () {
          document.addEventListener('click', function zu(ev) {
            if (liste.contains(ev.target) || ev.target === pfeil) return;
            if (liste.parentNode) liste.parentNode.removeChild(liste);
            document.removeEventListener('click', zu);
          });
        }, 0);
      });

      /* Auch das freie Tippen wandert in die gemeinsame Ablage - sonst
         waere der Wert nur auf dieser einen Seite geaendert. */
      el.addEventListener('blur', function () {
        var wert = sauberesHtml(el);
        if (wert !== el.innerHTML) el.innerHTML = wert;
        if (statusListe[programm] === wert) return;
        statusSetzen(programm, wert);
      });
    }

    /* ================================================================
     * Download-Bereiche ein- und ausblenden
     * ----------------------------------------------------------------
     * Jede Programmseite hat zwei vollstaendige Bereiche: einen fuer die
     * App, einen fuer die PC-Fassung. Wer nur eines von beiden anbietet,
     * blendet den anderen als GANZES aus - samt Ueberschrift, Texten und
     * Knoepfen. Gespeichert je Seite in Block "y0".
     * ================================================================ */
    var BEREICHE = [
      { kennung: 'app',
        wahl: '.program-download-block:not(.program-download-block--pc)',
        titel: 'App-Download' },
      { kennung: 'pc', wahl: '.program-download-block--pc', titel: 'PC-Download' }
    ];
    var bereichAus = {};       // { app: true } = ausgeblendet

    function parseBereiche(item) {
      bereichAus = {};
      if (item && item.type === 'text' && item.value) {
        try {
          var o = JSON.parse(item.value);
          if (o && typeof o === 'object') {
            BEREICHE.forEach(function (b) { if (o[b.kennung] === true) bereichAus[b.kennung] = true; });
          }
        } catch (e) { bereichAus = {}; }
      }
    }

    function renderBereiche() {
      BEREICHE.forEach(function (b) {
        var alle = document.querySelectorAll(b.wahl);
        var aus = bereichAus[b.kennung] === true;
        Array.prototype.forEach.call(alle, function (el) {
          if (EDITING) {
            // Im Bearbeiten-Modus gedaempft sichtbar - sonst kaeme man
            // nicht mehr an den Schalter, um ihn wieder einzuschalten.
            el.hidden = false;
            el.classList.toggle('fv-bereich-aus', aus);
          } else {
            el.hidden = aus;
            el.classList.remove('fv-bereich-aus');
          }
        });
      });
    }

    function speichereBereiche() {
      return save('y0', 'text', JSON.stringify(bereichAus));
    }

    function bereichSchalter() {
      if (!EDITING) return;
      BEREICHE.forEach(function (b) {
        var alle = document.querySelectorAll(b.wahl);
        if (!alle.length) return;
        var schonDa = false;
        Array.prototype.forEach.call(alle, function (x) {
          if (x.querySelector('.fv-bereich-schalter')) schonDa = true;
        });
        if (schonDa) return;
        var el = alle[0];
        var leiste = document.createElement('div');
        leiste.className = 'fv-bereich-leiste';
        var aus = bereichAus[b.kennung] === true;
        leiste.innerHTML =
          '<button type="button" class="fv-bereich-schalter' + (aus ? '' : ' an') + '">'
        + '  <span class="fv-bereich-schalter__punkt"></span>'
        + '  <span class="fv-bereich-schalter__text">'
        + (aus ? 'Bereich ausgeblendet' : 'Bereich wird gezeigt') + '</span>'
        + '</button>'
        + '<span class="fv-bereich-name">' + b.titel + '</span>'
        + '<span class="fv-bereich-melde"></span>';
        el.insertBefore(leiste, el.firstChild);

        var knopf = leiste.querySelector('.fv-bereich-schalter');
        var melde = leiste.querySelector('.fv-bereich-melde');
        knopf.addEventListener('click', function () {
          var jetztAus = !(bereichAus[b.kennung] === true);
          if (jetztAus) bereichAus[b.kennung] = true; else delete bereichAus[b.kennung];
          knopf.classList.toggle('an', !jetztAus);
          knopf.querySelector('.fv-bereich-schalter__text').textContent =
            jetztAus ? 'Bereich ausgeblendet' : 'Bereich wird gezeigt';
          renderBereiche();
          melde.textContent = 'Wird gespeichert \u2026';
          speichereBereiche().then(function (gut) {
            melde.textContent = gut
              ? (jetztAus ? '\u2713 Für Besucher unsichtbar' : '\u2713 Für Besucher sichtbar')
              : '\u2717 Speichern fehlgeschlagen';
            melde.className = 'fv-bereich-melde ' + (gut ? 'gut' : 'schlecht');
            setTimeout(function () { melde.textContent = ''; }, 3500);
          });
        });
      });
    }

    /* Alle gespeicherten Felder dieser Seite auf einmal saeubern.
     * ----------------------------------------------------------------
     * Die Reinigung beim Bearbeiten (sauberesHtml) wirkt nur auf Felder,
     * die man anfasst. Was frueher schon verdorben gespeichert wurde -
     * etwa eine ganze Kachel in einem Statuszeichen - bleibt liegen und
     * richtet weiter Unheil an. Dieser Knopf geht alle Felder der Seite
     * durch und schreibt die gesaeuberte Fassung zurueck.
     *
     * Jedes geaenderte Feld wandert dabei normal in den Verlauf - es geht
     * also nichts unwiederbringlich verloren. */
    function felderSaeubern() {
      var seiten = [SLUG, GLOBAL];
      var geaendert = 0, geprueft = 0;

      function melden(text) {
        var bar = document.querySelector('.fv-admin-bar');
        if (!bar) return;
        var m = bar.querySelector('.fv-putz-melde');
        if (!m) {
          m = document.createElement('span');
          m.className = 'fv-putz-melde';
          bar.appendChild(m);
        }
        m.textContent = text;
      }

      if (!window.confirm('Alle Textfelder dieser Seite auf eingeschlepptes HTML pruefen '
          + 'und bereinigen?\n\nGefunden wird zum Beispiel eine ganze Kachel, die beim '
          + 'Bearbeiten versehentlich in ein Feld geraten ist. Der bisherige Stand bleibt '
          + 'im Verlauf erhalten.')) return;

      melden('Wird gepr\u00fcft \u2026');

      var reihe = Promise.resolve();
      seiten.forEach(function (seite) {
        reihe = reihe.then(function () {
          /* fetchContent liefert eine ZUORDNUNG { block: eintrag }, kein
             items-Feld - das hatte ich zuerst falsch angenommen, und die
             Schleife lief ins Leere. */
          return fetchContent(seite).then(function (d) {
            if (!d || typeof d !== 'object') return;
            var kette = Promise.resolve();
            Object.keys(d).forEach(function (schluessel) {
              var it = d[schluessel];
              if (it && !it.block) it.block = schluessel;
              if (!it || it.type !== 'text' || typeof it.value !== 'string') return;
              // Nur echte Textfelder - Listen und Einstellungen in Ruhe lassen
              if (/^[a-z]\d*$/.test(it.block) === false) return;
              if (it.value.charAt(0) === '[' || it.value.charAt(0) === '{') return;
              if (it.value.indexOf('<') === -1) return;      // kein HTML drin
              geprueft++;
              var hilfe = document.createElement('div');
              hilfe.innerHTML = it.value;
              var sauber = sauberesHtml(hilfe);
              if (sauber === it.value) return;
              geaendert++;
              kette = kette.then(function () {
                return save(it.block, 'text', sauber, seite);
              });
            });
            return kette;
          });
        });
      });

      reihe.then(function () {
        if (!geaendert) {
          melden('\u2713 Nichts zu s\u00e4ubern \u2013 alle ' + geprueft + ' Felder sind in Ordnung.');
          return;
        }
        melden('\u2713 ' + geaendert + ' Feld(er) bereinigt \u2013 Seite wird neu geladen \u2026');
        setTimeout(function () { location.reload(); }, 1400);
      }).catch(function () {
        melden('\u2717 Beim S\u00e4ubern ging etwas schief.');
      });
    }

    /* ---- Verlauf: frühere Fassungen ansehen und zurückholen ------------ */
    function verlaufZeigen() {
      var alt = document.querySelector('.fv-verlauf-huelle');
      if (alt) { alt.parentNode.removeChild(alt); return; }

      var huelle = document.createElement('div');
      huelle.className = 'fv-verlauf-huelle';
      huelle.innerHTML =
        '<div class="fv-verlauf" role="dialog" aria-label="Fr\u00fchere Fassungen">'
      + '  <div class="fv-verlauf__kopf">'
      + '    <h2>Fr\u00fchere Fassungen \u2013 Seite "' + (SLUG === 'start' ? 'Startseite' : SLUG) + '"</h2>'
      + '    <button type="button" class="fv-verlauf__zu" aria-label="Schlie\u00dfen">\u2715</button>'
      + '  </div>'
      + '  <p class="fv-verlauf__hilfe">Vor jeder \u00c4nderung wird der bisherige Stand aufgehoben \u2013 '
      + '    die letzten zehn je Feld. Ein Klick auf <strong>Zur\u00fcckholen</strong> setzt ihn wieder ein. '
      + '    Der aktuelle Stand wandert dabei selbst in den Verlauf, es geht also nichts verloren.</p>'
      + '  <div class="fv-verlauf__liste">Wird geladen \u2026</div>'
      + '</div>';
      document.body.appendChild(huelle);

      function schliessen() {
        if (huelle.parentNode) huelle.parentNode.removeChild(huelle);
      }
      huelle.querySelector('.fv-verlauf__zu').addEventListener('click', schliessen);
      huelle.addEventListener('click', function (e) { if (e.target === huelle) schliessen(); });
      document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { schliessen(); document.removeEventListener('keydown', esc); }
      });

      var liste = huelle.querySelector('.fv-verlauf__liste');

      function zeit(iso) {
        try {
          var d = new Date(iso);
          return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric',
                                             hour: '2-digit', minute: '2-digit' });
        } catch (e) { return iso; }
      }
      function sicher(t) {
        return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                                         .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      fetch(API + '/verlauf', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: adminPw(), seite: SLUG })
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.eintraege) { liste.textContent = 'Konnte nicht geladen werden.'; return; }
          if (!d.eintraege.length) {
            liste.innerHTML = '<p class="fv-verlauf__leer">Noch nichts aufgehoben \u2013 '
              + 'auf dieser Seite wurde noch nichts ge\u00e4ndert.</p>';
            return;
          }
          var html = '';
          d.eintraege.forEach(function (e) {
            var probe = sicher(e.probe).replace(/\s+/g, ' ').trim();
            if (!probe) probe = '(leer)';
            if (e.laenge > e.probe.length) probe += ' \u2026';
            html += '<div class="fv-verlauf__zeile" data-nr="' + e.nr + '">'
                 +  '  <div class="fv-verlauf__wann">' + zeit(e.zeit)
                 +  '    <span class="fv-verlauf__block">' + sicher(e.block) + '</span></div>'
                 +  '  <div class="fv-verlauf__probe">' + probe + '</div>'
                 +  '  <button type="button" class="fv-verlauf__holen">Zur\u00fcckholen</button>'
                 +  '</div>';
          });
          liste.innerHTML = html;

          Array.prototype.forEach.call(liste.querySelectorAll('.fv-verlauf__holen'), function (k) {
            k.addEventListener('click', function () {
              var zeile = k.closest('.fv-verlauf__zeile');
              var nr = zeile.getAttribute('data-nr');
              k.disabled = true; k.textContent = 'Wird geholt \u2026';
              fetch(API + '/verlauf/eintrag', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ password: adminPw(), nr: Number(nr) })
              })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (st) {
                  if (!st || !st.ok) throw new Error('weg');
                  return save(st.block, st.art, st.wert, st.seite);
                })
                .then(function (ok) {
                  if (!ok) throw new Error('speichern');
                  k.textContent = '\u2713 Zur\u00fcckgeholt';
                  zeile.classList.add('fv-verlauf__zeile--fertig');
                  setTimeout(function () { location.reload(); }, 900);
                })
                .catch(function () {
                  k.disabled = false; k.textContent = 'Ging nicht \u2013 nochmal?';
                });
            });
          });
        })
        .catch(function () { liste.textContent = 'Konnte nicht geladen werden.'; });
    }

    /* ---- Selbst angelegte Programme in die Listen einreihen -------------
       Die Kacheln auf der Startseite und die Zeilen auf /programme stehen
       fest in den HTML-Dateien. Eine ueber "+ Seite" angelegte Seite kam
       darin nicht vor - sie existierte, aber nichts fuehrte hin.

       Die neuen Kacheln bekommen data-fv-text-extra. Das ist wichtig:
       die Nummerierung (t0, i0, s0 ...) folgt der Reihenfolge im Dokument.
       Ohne die Kennzeichnung wuerden eingeschobene Kacheln alle Nummern
       dahinter verschieben - und jeder gespeicherte Text saesse danach
       auf dem falschen Feld. Mit ihr landen sie am ENDE der Nummerierung,
       und der Altbestand bleibt, wo er ist. */
    function eigeneEinreihen() {
      var gitter = document.querySelector('.program-button-grid');
      var liste = document.querySelector('.program-row-list');
      var ziel = gitter || liste;
      if (!ziel) return Promise.resolve();

      return fetch('/api/programme', { method: 'GET' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) {
          var progs = (res && res.programme) || [];
          if (!progs.length) return;
          progs.forEach(function (p) {
            if (!p || !p.slug) return;
            if (p.art === 'info') return;                 // Infoseiten nicht als Programm
            var pfad = '/' + p.slug;
            if (ziel.querySelector('a[href="' + pfad + '"]')) return;   // steht schon drin

            var a = document.createElement('a');
            a.setAttribute('href', pfad);
            a.setAttribute('aria-label', (p.name || p.slug) + ' \u00f6ffnen');
            a.setAttribute('data-fv-text-extra', '');
            a.setAttribute('data-fv-prog', p.slug);

            if (gitter) {
              a.className = 'program-button';
              a.innerHTML =
                '<span class="program-button__status" data-fv-added hidden></span>'
              + (p.bild
                  ? '<img src="' + p.bild + '" alt="' + (p.name || p.slug) + '">'
                  : '<span class="program-button__name">' + (p.name || p.slug) + '</span>')
              + '<span class="program-button__description">'
              + (p.kurz || 'Kurzbeschreibung \u2013 im Bearbeiten-Modus \u00e4nderbar.')
              + '</span>';
            } else {
              a.className = 'program-row';
              a.innerHTML =
                '<span class="program-row__image">'
              + (p.bild ? '<img src="' + p.bild + '" alt="' + (p.name || p.slug) + '">' : '')
              + '</span>'
              + '<span class="program-row__content">'
              + '<strong>' + (p.name || p.slug) + '</strong>'
              + '<span>' + (p.kurz || 'Kurzbeschreibung \u2013 im Bearbeiten-Modus \u00e4nderbar.') + '</span>'
              + '</span>';
            }
            ziel.appendChild(a);
          });
        })
        .catch(function () { /* ohne Verzeichnis bleibt alles wie bisher */ });
    }

    /* ---- Ablauf -------------------------------------------------------- */
    function run() {
      var k = keyed();
      applyOverrides(k).then(function () {
        /* Die Schluessel stehen jetzt fest. Ab hier darf umgestellt
           werden, ohne dass sich etwas verschiebt - das Verschieben von
           Feldern haengt sich hier ein. */
        try { document.dispatchEvent(new CustomEvent('fv:felder-bereit')); } catch (_e) {}
        if (ADMIN) toolbar();
        if (EDITING) {
          enableText(k.t, SLUG);
          enableNav(k.n);
          enableImages(k.i);
          enableStatus(k.s);
          enableLinks(k.d);   // bringt die Ziel-Zeile samt Web-App-Upload mit
          bereichSchalter();  // Ein-/Ausblenden der beiden Download-Bereiche
          alleStatusFelder().forEach(statusAuswahl);   // Auswahlliste am Statuszeichen
          enableVideo();
          enableSortable();
          // renderCustom() lief bereits in applyOverrides (inkl. Bearbeiten-Affordances)
        }
      });
    }

    function los() { eigeneEinreihen().then(run, run); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', los);
    else los();
  } catch (e) { /* niemals die Seite blockieren */ }
})();

/* =====================================================================
 * Schnellauswahl "Web-Apps" in der Hauptnavigation
 * Klick auf "Web-Apps" klappt die Liste der Browser-Programme auf.
 * Im Bearbeiten-Modus bleibt die Liste dauerhaft offen, damit die
 * Eintraege angeklickt und umbenannt werden koennen.
 * Eigenstaendig gekapselt: faellt aus, ohne die Seite zu stoeren.
 * ===================================================================== */
(function () {
  'use strict';
  try {
    var EDIT = false;
    try {
      EDIT = !!sessionStorage.getItem('fv_admin_pw') && sessionStorage.getItem('fv_edit') === '1';
    } catch (e) { EDIT = false; }

    function init() {
      var wraps = document.querySelectorAll('.nav-apps');
      Array.prototype.forEach.call(wraps, function (wrap) {
        var btn = wrap.querySelector('.nav-apps__btn');
        var menu = wrap.querySelector('.nav-apps__menu');
        if (!btn || !menu) return;

        function open() {
          menu.hidden = false;
          wrap.classList.add('nav-apps--open');
          btn.setAttribute('aria-expanded', 'true');
        }
        function close() {
          menu.hidden = true;
          wrap.classList.remove('nav-apps--open');
          btn.setAttribute('aria-expanded', 'false');
        }

        if (EDIT) { open(); return; }   // Bearbeiten-Modus: offen lassen

        btn.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          if (menu.hidden) open(); else close();
        });
        menu.addEventListener('click', function (e) {
          if (e.target && e.target.closest && e.target.closest('a')) close();
        });
        document.addEventListener('click', function (e) {
          if (!wrap.contains(e.target)) close();
        });
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape' || e.keyCode === 27) close();
        });
      });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  } catch (e) { /* niemals die Seite blockieren */ }
})();

/* =====================================================================
 * Aktualisierung pflegen - EINE KACHEL JE FASSUNG, EINE DATEI JE KACHEL
 * ---------------------------------------------------------------------
 * Android-App und PC-Programm sind zwei eigenstaendige Programme. Sie
 * teilen sich nichts: nicht die Datei, nicht die Felder, nicht das
 * Objekt im Speicher. Jede Kachel kennt genau EINE Definition aus APPS
 * und schreibt genau EINE Ablage. Die andere Fassung kann sie gar nicht
 * beruehren - nicht weil etwas abgefangen wird, sondern weil sie sie
 * nicht kennt.
 *
 * Frueher gab es eine Kachel mit Reitern und ein gemeinsames Objekt.
 * Beim Speichern wurde es aufgeteilt, beim Laden wieder zusammengefuehrt.
 * Ergebnis: Eintraege im PC-Reiter landeten in der App-Datei, und
 * PC-Werte verschwanden wieder. Reiter, Zusammenfuehrung und Aufteilung
 * sind ersatzlos entfallen.
 *
 * Der Standard fuer PC-Fassungen (ANWEISUNG-PC-Aktualisierung.md):
 *   { schluessel: "...-PC", versionCode, versionName, apk, hinweise }
 * "apk" heisst auch beim PC so - dieselbe Eingabemaske fuer beide.
 * ===================================================================== */
(function () {
  'use strict';
  try {

    /* Die vier Felder jeder PC-Fassung. Ueberall gleich - genau das ist
       der Sinn des Standards. "rechenweg" steht nur im Beschriftungstext,
       weil der Tourenplaner mit einem Versatz von 1 000 000 zaehlt. */
    function pcFelder(rechenweg, beispielCode, beispielDatei) {
      return [
        { key: 'versionName', label: 'Versionsnummer', typ: 'text', ph: 'z. B. 3.0' },
        { key: 'versionCode', label: 'Versions-Code (' + rechenweg + ')',
          typ: 'zahl', ph: 'z. B. ' + beispielCode },
        { key: 'apk', label: 'Download-Adresse des Installers (EXE oder ZIP)',
          typ: 'url', ph: beispielDatei },
        { key: 'hinweise', label: 'Was ist neu (kurzer Hinweis)', typ: 'text', ph: '' }
      ];
    }

    var GH = 'https://github.com/finnveloprogrammwelten-crypto/finnvelo-programmwelten/releases/download/';

    var HINWEIS_APP = 'Diese Felder liest die Android-App. Das PC-Programm hat eine '
                    + 'eigene Kachel mit einer eigenen Datei - hier ist es nicht zu finden.';
    var HINWEIS_PC  = 'Diese Felder liest das PC-Programm. Sie stehen in einer eigenen '
                    + 'Datei; mit der App-Fassung haben sie nichts zu tun.';

    /* Je Fassung eine Definition:
         seite      - kommt im Pfad der Programmseite vor
         art        - 'app' oder 'pc' (bestimmt, in welchen Bereich die Kachel kommt)
         ablage     - Schluessel in der Datenbank, Block u0
         appAblage  - nur bei art 'pc': woher ein alter "pc"-Block uebernommen wird
         pruef      - Adresse, die das Programm abfragt
         felder     - Eingabefelder dieser Fassung
         fest       - Werte, die immer mitgeschrieben werden (Erkennungsmerkmal)
         vorgabe    - Stand, solange nichts gespeichert ist                        */
    var APPS = [
      /* ---- Einkaufsplaner ------------------------------------------- */
      {
        seite: 'einkaufsliste', art: 'app', sauber: true,
        ablage: 'einkaufsliste',
        pruef: '/einkaufsliste/version.json',
        titel: 'Android-App', hinweis: HINWEIS_APP,
        felder: [
          { key: 'versionName', label: 'Versionsnummer (muss zum APK-Namen passen)', typ: 'text', ph: 'z. B. 2.11.0' },
          { key: 'versionCode', label: 'Versions-Code (major x 10000 + minor x 100 + patch)', typ: 'zahl', ph: 'z. B. 21100' },
          { key: 'apk', label: 'Download-Adresse der APK', typ: 'url',
            ph: 'https://github.com/.../FINNVELO-Einkaufsplaner-2.11.0.apk' },
          { key: 'hinweise', label: 'Was ist neu (kurzer Hinweis)', typ: 'text', ph: '' }
        ],
        fest: { schluessel: 'FINNVELO-EINKAUFSPLANER' },
        vorgabe: { schluessel: 'FINNVELO-EINKAUFSPLANER', versionCode: 21100, versionName: '2.11.0',
                   apk: GH + 'Einkaufsplaner/FINNVELO-Einkaufsplaner-2.11.0.apk', hinweise: '' }
      },
      {
        seite: 'einkaufsliste', art: 'pc',
        ablage: 'einkaufsliste-pc', appAblage: 'einkaufsliste',
        pruef: '/einkaufsliste/pc.json',
        titel: 'PC-Version', hinweis: HINWEIS_PC,
        felder: pcFelder('major x 10000 + minor x 100 + patch', '10000',
                         'https://github.com/.../FINNVELO-Einkaufsplaner-Setup-1.0.exe'),
        fest: { schluessel: 'FINNVELO-EINKAUFSPLANER-PC' },
        vorgabe: { schluessel: 'FINNVELO-EINKAUFSPLANER-PC', versionCode: 0, versionName: '', apk: '', hinweise: '' }
      },

      /* ---- Mischwaldrechner ----------------------------------------- */
      {
        seite: 'mischwaldrechner', art: 'app',
        ablage: 'mischwald',
        pruef: '/mischwaldrechner/version.json',
        titel: 'Android-App', hinweis: HINWEIS_APP,
        felder: [
          { key: 'versionName', label: 'Versionsnummer', typ: 'text', ph: 'z. B. 1.8', auch: ['version'] },
          { key: 'versionCode', label: 'Versions-Code (Zahl)', typ: 'zahl', ph: 'z. B. 2' },
          { key: 'download', label: 'Download-Adresse der APK', typ: 'url', ph: 'https://github.com/.../Mischwald.apk' },
          { key: 'hinweis', label: 'Was ist neu (kurzer Hinweis)', typ: 'text', ph: '' }
        ],
        fest: {},
        vorgabe: { versionCode: 1, versionName: '1.0.0', version: '1.0.0',
                   download: GH + 'FinnveloMischwaldrechner/Mischwald.apk', hinweis: '' }
      },
      {
        seite: 'mischwaldrechner', art: 'pc',
        ablage: 'mischwald-pc', appAblage: 'mischwald',
        pruef: '/mischwaldrechner/pc.json',
        titel: 'PC-Version', hinweis: HINWEIS_PC,
        felder: pcFelder('major x 10000 + minor x 100 + patch', '10000',
                         'https://github.com/.../FINNVELO-Mischwaldrechner-Setup-1.0.exe'),
        fest: { schluessel: 'FINNVELO-MISCHWALD-PC' },
        vorgabe: { schluessel: 'FINNVELO-MISCHWALD-PC', versionCode: 0, versionName: '', apk: '', hinweise: '' }
      },

      /* ---- Aufgabenplaner ------------------------------------------- */
      {
        seite: 'aufgabenplaner', art: 'app',
        ablage: 'aufgabenplaner',
        pruef: '/FinnVelo/Aufgabenplaner/version.json',
        titel: 'Android-App', hinweis: HINWEIS_APP,
        felder: [
          { key: 'versionName', label: 'Versionsnummer (muss zum APK-Namen passen)', typ: 'text', ph: 'z. B. 8.28' },
          { key: 'versionCode', label: 'Versions-Code (Zahl)', typ: 'zahl', ph: 'z. B. 198' },
          { key: 'apk', label: 'Download-Adresse der APK (GitHub)', typ: 'url',
            ph: 'https://github.com/.../FINNVELO-Aufgabenplaner-8.28.apk' },
          { key: 'hinweise', label: 'Was ist neu (kurzer Hinweis)', typ: 'text', ph: '' }
        ],
        fest: { schluessel: 'FINNVELO-AUFGABENPLANER' },
        vorgabe: { schluessel: 'FINNVELO-AUFGABENPLANER', versionCode: 198, versionName: '8.28',
                   apk: GH + 'FinnveloAufgabenplaner/FINNVELO-Aufgabenplaner-8.28.apk', hinweise: '' }
      },
      {
        /* Das PC-Programm liest /FinnVelo/Aufgabenplaner/pc.json und
           verlangt schluessel FINNVELO-AUFGABENPLANER-PC. Geprueft am
           Quelltext (quelle/aktualisierung.js). */
        seite: 'aufgabenplaner', art: 'pc',
        ablage: 'aufgabenplaner-pc', appAblage: 'aufgabenplaner',
        pruef: '/FinnVelo/Aufgabenplaner/pc.json',
        titel: 'PC-Version', hinweis: HINWEIS_PC,
        felder: pcFelder('major x 10000 + minor x 100 + patch', '30000',
                         'https://github.com/.../FINNVELO-Aufgabenplaner-Setup-3.0.exe'),
        fest: { schluessel: 'FINNVELO-AUFGABENPLANER-PC' },
        vorgabe: { schluessel: 'FINNVELO-AUFGABENPLANER-PC', versionCode: 30000, versionName: '3.0',
                   apk: GH + 'FinnveloAufgabenplaner/FINNVELO.Aufgabenplaner.Setup.3.0.0.exe',
                   hinweise: 'Beim Anmelden starten, Logo in der Kopfzeile, Wetterzeichen passt zum Regenrisiko.' }
      },

      /* ---- Lesezeit -------------------------------------------------- */
      {
        /* ACHTUNG: eigenes Format der App - "programm", "version",
           "versionsCode" statt schluessel/versionName/versionCode. */
        seite: 'lesezeit', art: 'app', sauber: true,
        ablage: 'lesezeit',
        pruef: '/lesezeit/version.json',
        titel: 'Android-App', hinweis: HINWEIS_APP,
        felder: [
          { key: 'version', label: 'Versionsnummer (muss zum APK-Namen passen)', typ: 'text', ph: 'z. B. 2.9.1' },
          { key: 'versionsCode', label: 'Versions-Code (major x 10000 + minor x 100 + patch)',
            typ: 'zahl', ph: 'z. B. 20901' },
          { key: 'apk', label: 'Download-Adresse der APK', typ: 'url',
            ph: 'https://github.com/.../FINNVELO-Lesezeit-2.9.1.apk' },
          { key: 'datei', label: 'Dateiname der APK', typ: 'text', ph: 'FINNVELO-Lesezeit-2.9.1.apk' }
        ],
        fest: { programm: 'FINNVELO-LESEZEIT', paket: 'de.finnvelo.lesetagebuch',
                adresse: 'https://finnveloprogramme.com/lesezeit/' },
        vorgabe: { programm: 'FINNVELO-LESEZEIT', version: '2.9.1', versionsCode: 20901,
                   adresse: 'https://finnveloprogramme.com/lesezeit/',
                   apk: GH + 'Lesezeit/FINNVELO-Lesezeit-2.9.1.apk',
                   datei: 'FINNVELO-Lesezeit-2.9.1.apk', paket: 'de.finnvelo.lesetagebuch' }
      },
      {
        seite: 'lesezeit', art: 'pc',
        ablage: 'lesezeit-pc', appAblage: 'lesezeit',
        pruef: '/lesezeit/pc.json',
        titel: 'PC-Version', hinweis: HINWEIS_PC,
        felder: pcFelder('major x 10000 + minor x 100 + patch', '10000',
                         'https://github.com/.../FINNVELO-Lesezeit-Setup-1.0.exe'),
        fest: { schluessel: 'FINNVELO-LESEZEIT-PC' },
        vorgabe: { schluessel: 'FINNVELO-LESEZEIT-PC', versionCode: 0, versionName: '', apk: '', hinweise: '' }
      },

      /* ---- Tourenplaner --------------------------------------------- */
      {
        seite: 'tourenplaner', art: 'app',
        ablage: 'tourenplaner-android',
        pruef: '/tourenplaner/android.json',
        titel: 'Android-App', hinweis: HINWEIS_APP,
        felder: [
          { key: 'versionName', label: 'Versionsnummer (muss zum APK-Namen passen)', typ: 'text', ph: 'z. B. 3.1' },
          { key: 'versionCode', label: 'Versions-Code (1000000 + major x 10000 + minor x 100 + patch)',
            typ: 'zahl', ph: 'z. B. 1030100' },
          { key: 'apk', label: 'Download-Adresse der APK', typ: 'url',
            ph: 'https://github.com/.../FINNVELO-Tourenplaner-3.1.apk' },
          { key: 'hinweise', label: 'Was ist neu (kurzer Hinweis)', typ: 'text', ph: '' }
        ],
        fest: { schluessel: 'FINNVELO-TOURENPLANER-ANDROID' },
        vorgabe: { schluessel: 'FINNVELO-TOURENPLANER-ANDROID', versionCode: 1030100, versionName: '3.1',
                   apk: GH + 'Tourenplaner/FINNVELO-Tourenplaner-3.1.apk', hinweise: '' }
      },
      {
        /* Das PC-Programm liest /tourenplaner/pc.json, verlangt
           schluessel FINNVELO-TOURENPLANER-PC und nimmt die Adresse aus
           "apk" (ersatzweise "datei"). Geprueft am Quelltext
           (pc/haupt.js). Eigene Fassung dort: 1.4 / 1010400. */
        seite: 'tourenplaner', art: 'pc',
        ablage: 'tourenplaner-pc', appAblage: 'tourenplaner-android',
        pruef: '/tourenplaner/pc.json',
        titel: 'PC-Version', hinweis: HINWEIS_PC,
        felder: pcFelder('1000000 + major x 10000 + minor x 100 + patch', '1020500',
                         'https://github.com/.../FINNVELO-Tourenplaner-Einrichtung-2.5.0.exe'),
        fest: { schluessel: 'FINNVELO-TOURENPLANER-PC' },
        vorgabe: { schluessel: 'FINNVELO-TOURENPLANER-PC', versionCode: 0, versionName: '', apk: '', hinweise: '' }
      }
    ];

    var pw = '';
    try { pw = sessionStorage.getItem('fv_admin_pw') || ''; } catch (e) {}
    var editAn = false;
    try { editAn = sessionStorage.getItem('fv_edit') === '1'; } catch (e) {}
    if (!pw || !editAn) return;

    var pfad = (location.pathname || '').toLowerCase().replace(/\.html?$/, '').replace(/\/+$/, '');
    var slug = pfad.replace(/^\//, '') || 'start';

    /* ALLE passenden Definitionen sammeln, nicht nur die erste. Frueher
       stand hier ein "break" - dadurch bekam eine Seite immer nur eine
       Kachel, und welche das war, hing an der Reihenfolge im Feld. Bei
       Lesezeit fragte die Android-Kachel deshalb einmal die PC-Datei ab. */
    var cfgs = [];
    for (var i = 0; i < APPS.length; i++) {
      if (pfad.indexOf(APPS[i].seite) !== -1) cfgs.push(APPS[i]);
    }
    var festeApp = cfgs.length > 0;

    /* Bauplaene fuer selbst angelegte Seiten: welche Feldnamen die eigene
       App liest, haengt davon ab, wie sie gebaut wurde. */
    var BAUPLAENE = {
      mischwald: {
        name: 'Wie Mischwaldrechner',
        felder: [
          { key: 'versionName', label: 'Versionsnummer', typ: 'text', ph: 'z. B. 1.0.2', auch: ['version'] },
          { key: 'versionCode', label: 'Versions-Code (Zahl)', typ: 'zahl', ph: 'z. B. 2' },
          { key: 'download', label: 'Download-Adresse (GitHub)', typ: 'url', ph: 'https://github.com/.../App.apk' },
          { key: 'hinweis', label: 'Was ist neu', typ: 'text', ph: 'kurzer Hinweis' }
        ],
        fest: {},
        vorgabe: { versionCode: 1, versionName: '1.0.0', version: '1.0.0', download: '', hinweis: '' }
      },
      finnvelo: {
        name: 'Wie Aufgabenplaner (mit Erkennungsmerkmal)',
        felder: [
          { key: 'versionName', label: 'Versionsnummer (muss zum APK-Namen passen)', typ: 'text', ph: 'z. B. 1.1' },
          { key: 'versionCode', label: 'Versions-Code (Zahl)', typ: 'zahl', ph: 'z. B. 11' },
          { key: 'apk', label: 'Download-Adresse der APK (GitHub)', typ: 'url', ph: 'https://github.com/.../App-1.1.apk' },
          { key: 'hinweise', label: 'Was ist neu', typ: 'text', ph: 'kurzer Hinweis' }
        ],
        fest: {},
        vorgabe: { versionCode: 1, versionName: '1.0', apk: '', hinweise: '' }
      }
    };

    /* Selbst angelegte Programmseite: auch sie bekommt BEIDE Fassungen -
       eine App-Kachel und eine PC-Kachel, jede einzeln scharfzuschalten.
       Damit ist jede Produktseite gleich aufgebaut. */
    if (!festeApp) {
      if (!document.querySelector('.program-download-block')) return;
      cfgs = [
        { seite: slug, art: 'app', frei: true,
          ablage: slug, pruef: '/' + slug + '/version.json',
          titel: 'Android-App', hinweis: HINWEIS_APP,
          felder: BAUPLAENE.mischwald.felder, fest: {}, vorgabe: BAUPLAENE.mischwald.vorgabe },
        { seite: slug, art: 'pc', frei: true,
          ablage: slug + '-pc', appAblage: slug, pruef: '/' + slug + '/pc.json',
          titel: 'PC-Version', hinweis: HINWEIS_PC,
          felder: pcFelder('major x 10000 + minor x 100 + patch', '10000',
                           'https://github.com/.../Setup-1.0.exe'),
          fest: {}, vorgabe: { versionCode: 0, versionName: '', apk: '', hinweise: '' } }
      ];
    }

    function copy(o) { var r = {}; for (var k in o) if (o.hasOwnProperty(k)) r[k] = o[k]; return r; }

    /* Liest die Versionsnummer aus dem Dateinamen einer Adresse.
       Bewusst streng: lieber nichts erkennen als eine falsche Nummer. */
    function versionAusName(adresse) {
      if (!adresse) return '';
      var s = String(adresse).split('#')[0].split('?')[0];
      var name = s.substring(s.lastIndexOf('/') + 1);
      var treffer = /[-_ .]v?(\d+(?:\.\d+)+)\.(apk|exe|zip)$/i.exec(name);
      return treffer ? treffer[1] : '';
    }

    /* ---- Datenbank: genau ein Block je Ablage ---------------------- */
    function holen(ablage) {
      return fetch('/api/content?page=' + encodeURIComponent(ablage), { method: 'GET' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) {
          var roh = '';
          if (res && res.items) res.items.forEach(function (it) { if (it.block === 'u0') roh = it.value || ''; });
          if (!roh) return null;
          try { return JSON.parse(roh); } catch (e) { return null; }
        }).catch(function () { return null; });
    }
    function legen(ablage, wert) {
      return fetch('/api/content', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: ablage, block: 'u0', type: 'text',
                               value: JSON.stringify(wert, null, 2), password: pw })
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    }

    /* ---- Einstellungen selbst angelegter Fassungen (Block u1) ------- */
    function ladeEinstellung(c) {
      c.einst = { aktiv: false, pfad: c.pruef, bauplan: 'mischwald', merkmal: '' };
      if (!c.frei) return Promise.resolve();
      return fetch('/api/content?page=' + encodeURIComponent(c.ablage), { method: 'GET' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) {
          if (res && res.items) res.items.forEach(function (it) {
            if (it.block !== 'u1' || !it.value) return;
            try {
              var e = JSON.parse(it.value);
              if (e && typeof e === 'object') {
                c.einst.aktiv = !!e.aktiv;
                if (e.pfad) c.einst.pfad = e.pfad;
                if (e.bauplan && BAUPLAENE[e.bauplan]) c.einst.bauplan = e.bauplan;
                if (typeof e.merkmal === 'string') c.einst.merkmal = e.merkmal;
              }
            } catch (er) {}
          });
          c.pruef = c.einst.pfad;
          if (c.art === 'app') {
            var bp = BAUPLAENE[c.einst.bauplan];
            c.felder = bp.felder; c.vorgabe = bp.vorgabe;
          }
          c.fest = c.einst.merkmal ? { schluessel: c.einst.merkmal } : {};
        }).catch(function () {});
    }
    function speichereEinstellung(c) {
      return fetch('/api/content', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: c.ablage, block: 'u1', type: 'text',
                               value: JSON.stringify(c.einst), password: pw })
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    }
    function verzeichnisPflegen(c, anlegen) {
      return fetch('/api/content?page=system', { method: 'GET' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) {
          var routen = {};
          if (res && res.items) res.items.forEach(function (it) {
            if (it.block === 'v0' && it.value) { try { routen = JSON.parse(it.value) || {}; } catch (e) {} }
          });
          for (var p in routen) {
            if (routen.hasOwnProperty(p) && routen[p] === c.ablage) delete routen[p];
          }
          if (anlegen) routen[c.einst.pfad.toLowerCase()] = c.ablage;
          return fetch('/api/content', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ page: 'system', block: 'v0', type: 'text',
                                   value: JSON.stringify(routen), password: pw })
          }).then(function (r) { return r.ok; });
        }).catch(function () { return false; });
    }

    /* ---- Altbestand uebernehmen ------------------------------------
       Eine PC-Fassung lag frueher als Block "pc" IN der App-Datei, und
       die Feldnamen hiessen dort "url"/"hinweis". Beides wird einmalig
       geradegezogen:
         - ist die eigene Datei leer, aber in der App-Datei steht ein
           "pc"-Block, wird er uebernommen und dort entfernt
         - "url" wird zu "apk", "hinweis" zu "hinweise"
       Danach kennt die PC-Kachel nur noch ihre eigene Datei.          */
    function normieren(c, o) {
      var r = {};
      var f = c.fest || {};
      for (var fk in f) if (f.hasOwnProperty(fk)) r[fk] = f[fk];
      o = o || {};
      r.versionCode = parseInt(o.versionCode || o.versionsCode || 0, 10) || 0;
      r.versionName = String(o.versionName || o.version || '');
      r.apk = String(o.apk || o.url || o.download || '');
      r.hinweise = String(o.hinweise || o.hinweis || '');
      return r;
    }
    function gleich(a, b) {
      try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
    }
    /* @return {stand, umgezogen} */
    function pcStandHolen(c) {
      return holen(c.ablage).then(function (eigen) {
        var hatEigen = eigen && (parseInt(eigen.versionCode, 10) > 0 || eigen.apk || eigen.url);
        if (hatEigen) {
          var sauber = normieren(c, eigen);
          if (gleich(sauber, eigen)) return { stand: sauber, umgezogen: false };
          return legen(c.ablage, sauber).then(function () {
            return { stand: sauber, umgezogen: 'Feldnamen auf den Standard gebracht' };
          });
        }
        if (!c.appAblage) return { stand: eigen || copy(c.vorgabe), umgezogen: false };
        return holen(c.appAblage).then(function (app) {
          if (!app || !app.pc || typeof app.pc !== 'object') {
            return { stand: eigen || copy(c.vorgabe), umgezogen: false };
          }
          var uebernommen = normieren(c, app.pc);
          var ohne = {};
          for (var k in app) if (app.hasOwnProperty(k) && k !== 'pc') ohne[k] = app[k];
          return legen(c.ablage, uebernommen)
            .then(function () { return legen(c.appAblage, ohne); })
            .then(function () {
              return { stand: uebernommen,
                       umgezogen: 'Alte PC-Angaben aus der App-Datei übernommen' };
            });
        });
      });
    }

    /* ---- App-Datei entrümpeln --------------------------------------
       Manche App-Dateien tragen noch Felder aus früheren Bauformen mit
       sich herum - beim Einkaufsplaner "url" (2.2.0) neben "apk"
       (2.11.0), bei Lesezeit ein "versionCode" neben "versionsCode".
       Gelesen wird jeweils nur das Erste; das Zweite ist Altlast, die
       beim Nachsehen in die Irre führt.

       Nur Definitionen mit sauber:true werden entrümpelt - dort ist der
       vollständige Aufbau der Datei bekannt und am Quelltext der App
       geprüft. Wo das nicht der Fall ist, bleibt jedes Feld stehen. */
    function appSauber(c, o) {
      var r = {};
      var f = c.fest || {};
      for (var fk in f) if (f.hasOwnProperty(fk)) r[fk] = f[fk];
      c.felder.forEach(function (fd) {
        var w = o[fd.key];
        if (w === undefined || w === null || w === '') {
          // Ersatzquellen für umbenannte Felder - nichts geht verloren
          if (fd.key === 'apk') w = o.url || o.download || '';
          else if (fd.key === 'hinweise') w = o.hinweis || '';
          else if (fd.key === 'versionsCode') w = o.versionCode || 0;
          else if (fd.key === 'versionName') w = o.version || '';
          else w = (fd.typ === 'zahl') ? 0 : '';
        }
        if (fd.typ === 'zahl') w = parseInt(w, 10) || 0;
        r[fd.key] = w;
        if (fd.auch) fd.auch.forEach(function (k2) { r[k2] = w; });
      });
      return r;
    }
    function appStandHolen(c) {
      return holen(c.ablage).then(function (o) {
        if (!o) return { stand: copy(c.vorgabe), umgezogen: false };
        if (!c.sauber) return { stand: o, umgezogen: false };
        var sauber = appSauber(c, o);
        if (gleich(sauber, o)) return { stand: sauber, umgezogen: false };
        var weg = [];
        for (var k in o) if (o.hasOwnProperty(k) && !(k in sauber)) weg.push(k);
        return legen(c.ablage, sauber).then(function () {
          return { stand: sauber,
                   umgezogen: weg.length ? ('Veraltete Felder entfernt: ' + weg.join(', ')) : 'Datei aufgeräumt' };
        });
      });
    }

    /* Alle Kacheln speichern NACHEINANDER - sonst schreibt die zuletzt
       klickende ihren alten Stand ueber die frischen der anderen. */
    var speicherReihe = Promise.resolve();
    function anstellen(tat) {
      speicherReihe = speicherReihe.then(tat, tat);
      return speicherReihe;
    }

    /* =================================================================
     * Eine Kachel fuer GENAU EINE Fassung
     * ================================================================= */
    function bauen(c, daten, ziel, umzugsmeldung) {
      if (!ziel) return;
      if (ziel.querySelector('.fv-update-box')) return;

      var stand = daten || copy(c.vorgabe);

      var box = document.createElement('div');
      box.className = 'fv-update-box fv-update-box--' + c.art;

      var felderHtml = '<p class="fv-update-pfhinweis">' + c.hinweis + '</p>';
      c.felder.forEach(function (f) {
        var inTyp = (f.typ === 'zahl') ? 'number' : 'text';
        var extra = (f.typ === 'zahl') ? ' min="0" step="1"' : '';
        felderHtml += '<label>' + f.label + '<input type="' + inTyp + '"' + extra
                    + ' data-key="' + f.key + '" placeholder="' + f.ph + '"></label>';
      });

      var einstellHtml = '';
      if (c.frei) {
        var planOpt = '';
        if (c.art === 'app') {
          for (var bp in BAUPLAENE) {
            if (!BAUPLAENE.hasOwnProperty(bp)) continue;
            planOpt += '<option value="' + bp + '"' + (c.einst.bauplan === bp ? ' selected' : '') + '>'
                     + BAUPLAENE[bp].name + '</option>';
          }
        }
        einstellHtml =
          '<div class="fv-update-schalter">'
        + '  <button type="button" class="fv-schalter' + (c.einst.aktiv ? ' an' : '') + '" data-a="schalter">'
        + '    <span class="fv-schalter__punkt"></span>'
        + '    <span class="fv-schalter__text">' + (c.einst.aktiv ? 'Aktiv' : 'Nicht aktiv') + '</span>'
        + '  </button>'
        + '  <span class="fv-schalter__hinweis">Erst wenn dies aktiv ist, beantwortet die Webseite '
        + 'die Update-Anfragen dieser Fassung.</span>'
        + '</div>'
        + '<div class="fv-update-einstell" data-a="einstell"' + (c.einst.aktiv ? '' : ' hidden') + '>'
        + '  <label>Adresse, die dieses Programm abfragt'
        + '    <input type="text" data-a="pfad" value="' + c.einst.pfad + '" placeholder="'
        + (c.art === 'pc' ? '/meinprogramm/pc.json' : '/meineapp/version.json') + '"></label>'
        + (c.art === 'app'
            ? '  <label>Aufbau der Versionsdatei<select data-a="bauplan">' + planOpt + '</select></label>'
            : '')
        + '  <label>Erkennungsmerkmal (nur falls das Programm eines pr\u00fcft \u2013 sonst leer lassen)'
        + '    <input type="text" data-a="merkmal" value="' + (c.einst.merkmal || '') + '" placeholder="z. B. FINNVELO-MEINPROGRAMM-PC"></label>'
        + '</div>';
      }

      box.innerHTML =
        '<h3 class="fv-update-titel">\u2699\uFE0F Aktualisierung \u2013 ' + c.titel
      + ' <span>(nur f\u00fcr dich sichtbar)</span></h3>'
      + '<p class="fv-update-hilfe">' + (c.frei
          ? ('Damit kann ein eigenes Programm auf dieser Webseite nach Updates suchen. '
             + 'Du legst die Adresse fest, das Programm fragt sie ab. ')
          : ((c.art === 'pc' ? 'Das PC-Programm' : 'Die App') + ' fragt beim Start '
             + '<code class="fv-update-adresse">' + c.pruef + '</code> ab. '))
      + 'Trage hier die neue Fassung ein \u2013 sie wird dann angeboten. '
      + 'Die Webseite muss daf\u00fcr <strong>nicht</strong> neu ver\u00f6ffentlicht werden.</p>'
      + einstellHtml
      + '<div class="fv-update-felder"' + ((c.frei && !c.einst.aktiv) ? ' hidden' : '')
      + ' data-a="felderbox">' + felderHtml + '</div>'
      + '<div class="fv-update-zeile">'
      + '  <button type="button" class="fv-update-btn" data-a="save">Speichern</button>'
      + '  <a class="fv-update-link" href="' + c.pruef + '" target="_blank" rel="noopener">Datei ansehen</a>'
      + '  <button type="button" class="fv-update-mehr" data-a="mehr">JSON direkt bearbeiten</button>'
      + '  <span class="fv-update-melde" data-a="melde"></span>'
      + '</div>'
      + '<textarea class="fv-update-roh" data-a="roh" spellcheck="false" hidden></textarea>'
      + '<p class="fv-update-warn">Wichtig: Der <strong>Versions-Code</strong> muss bei jeder neuen '
      + 'Fassung gr\u00f6\u00dfer sein als vorher \u2013 daran allein erkennt das Programm, dass es '
      + 'etwas Neues gibt.</p>';
      ziel.appendChild(box);

      var roh = box.querySelector('[data-a="roh"]');
      var melde = box.querySelector('[data-a="melde"]');

      function sagen(text, gut) {
        melde.textContent = text;
        melde.className = 'fv-update-melde ' + (gut ? 'gut' : 'schlecht');
        setTimeout(function () { melde.textContent = ''; melde.className = 'fv-update-melde'; }, 6000);
      }

      /* ---- Felder <-> Datei ---------------------------------------- */
      function ausFeldern() {
        /* PC-Fassung: die Datei hat einen festen, kleinen Aufbau - sie
           wird sauber neu gebaut. App-Fassung: auf dem geladenen Stand
           aufsetzen, damit Felder erhalten bleiben, die nur die App
           kennt (bei Lesezeit z. B. "paket"). Ein alter "pc"-Block
           faellt dabei immer weg. */
        var o = (c.art === 'pc') ? {} : copy(stand || {});
        delete o.pc;
        var f = c.fest || {};
        for (var fk in f) if (f.hasOwnProperty(fk)) o[fk] = f[fk];
        c.felder.forEach(function (fd) {
          var el = box.querySelector('[data-key="' + fd.key + '"]');
          if (!el) return;
          var v = (el.value || '').trim();
          if (fd.typ === 'zahl') v = parseInt(v, 10) || 0;
          o[fd.key] = v;
          if (fd.auch) fd.auch.forEach(function (k2) { o[k2] = v; });
        });
        return o;
      }
      function inFelder(o) {
        c.felder.forEach(function (fd) {
          var el = box.querySelector('[data-key="' + fd.key + '"]');
          if (!el) return;
          var w = o ? o[fd.key] : '';
          el.value = (w === undefined || w === null) ? '' : w;
        });
        roh.value = JSON.stringify(ausFeldern(), null, 2);
      }
      inFelder(stand);
      if (umzugsmeldung) sagen('\u2713 ' + umzugsmeldung + '.', true);

      /* ---- Ziel des Download-Knopfes uebernehmen -------------------
         Frueher stand hier eine Variable "vorsatz", die nirgends
         deklariert war. Unter 'use strict' warf das jedes Mal einen
         Fehler, den ein catch verschluckt hat - die Automatik lief
         also nie. Jetzt ohne Vorsatz: jede Kachel hat eigene Felder. */
      function urlFeldName() {
        for (var i = 0; i < c.felder.length; i++) {
          if (c.felder[i].typ === 'url') return c.felder[i].key;
        }
        return null;
      }
      function versionFeldName() {
        for (var i = 0; i < c.felder.length; i++) {
          if (/^version(Name)?$/i.test(c.felder[i].key)) return c.felder[i].key;
        }
        return null;
      }
      function codeFeldName() {
        for (var i = 0; i < c.felder.length; i++) {
          if (/^versions?Code$/i.test(c.felder[i].key)) return c.felder[i].key;
        }
        return 'versionCode';
      }
      function codePlusAnbieten(cFeld) {
        var label = cFeld.parentNode;
        if (!label || label.querySelector('.fv-code-plus')) return;
        var jetzt = parseInt(cFeld.value, 10);
        if (!isFinite(jetzt)) return;
        var knopf = document.createElement('button');
        knopf.type = 'button';
        knopf.className = 'fv-code-plus';
        knopf.textContent = 'auf ' + (jetzt + 1) + ' setzen';
        knopf.title = 'Z\u00e4hlt den Versions-Code um eins hoch \u2013 pr\u00fcfe, ob das passt';
        knopf.addEventListener('click', function (e) {
          e.preventDefault();
          var n = parseInt(cFeld.value, 10);
          if (!isFinite(n)) return;
          cFeld.value = String(n + 1);
          cFeld.classList.remove('fv-pruefen');
          cFeld.classList.add('fv-uebernommen');
          if (knopf.parentNode) knopf.parentNode.removeChild(knopf);
        });
        label.appendChild(knopf);
      }
      function uebernehmen(url) {
        if (!url) return;
        var geaendert = [];
        var uKey = urlFeldName();
        if (uKey) {
          var uFeld = box.querySelector('[data-key="' + uKey + '"]');
          if (uFeld && uFeld.value !== url) {
            uFeld.value = url;
            uFeld.classList.add('fv-uebernommen');
            geaendert.push('Adresse');
          }
        }
        var ver = versionAusName(url);
        var streit = '';
        var vKey = versionFeldName();
        if (ver && vKey) {
          var vFeld = box.querySelector('[data-key="' + vKey + '"]');
          if (vFeld) {
            var drin = (vFeld.value || '').trim();
            if (!drin) {
              vFeld.value = ver;
              vFeld.classList.add('fv-uebernommen');
              geaendert.push('Version ' + ver);
            } else if (drin !== ver) {
              streit = ' \u26A0 Im Dateinamen steht ' + ver + ', im Feld steht ' + drin
                     + ' \u2013 das Feld bleibt, wie du es gesetzt hast.';
              vFeld.classList.add('fv-pruefen');
            }
          }
        }
        if (!geaendert.length) {
          if (streit) { melde.textContent = streit.replace(/^\s*/, ''); melde.className = 'fv-update-melde'; }
          return;
        }
        var cFeld = box.querySelector('[data-key="' + codeFeldName() + '"]');
        if (cFeld) { cFeld.classList.add('fv-pruefen'); codePlusAnbieten(cFeld); }
        melde.textContent = '\u2713 \u00dcbernommen: ' + geaendert.join(', ')
                          + (ver ? '' : ' \u2013 Version nicht im Dateinamen gefunden')
                          + '. Versions-Code pr\u00fcfen, dann Speichern.' + streit;
        melde.className = 'fv-update-melde gut';
      }
      document.addEventListener('fv:ziel-gesetzt', function (e) {
        try {
          var d = (e && e.detail) || {};
          if (d.art === 'web') return;          // Web-Fassung hat keine Nummer
          if (d.knopf) {
            var bereich = d.knopf.closest && d.knopf.closest('.program-download-block');
            var meiner = box.closest && box.closest('.program-download-block');
            if (bereich && meiner && bereich !== meiner) return;
          }
          uebernehmen(d.url || '');
        } catch (_x) {}
      });

      box.addEventListener('input', function (e) {
        if (e.target && e.target.classList) {
          e.target.classList.remove('fv-uebernommen');
          e.target.classList.remove('fv-pruefen');
        }
      });

      /* ---- Schalter selbst angelegter Fassungen -------------------- */
      if (c.frei) {
        var schalter = box.querySelector('[data-a="schalter"]');
        var einstellBox = box.querySelector('[data-a="einstell"]');
        var felderBox = box.querySelector('[data-a="felderbox"]');
        var zeileBox = box.querySelector('.fv-update-zeile');
        var ansichtSetzen = function () {
          schalter.classList.toggle('an', c.einst.aktiv);
          schalter.querySelector('.fv-schalter__text').textContent = c.einst.aktiv ? 'Aktiv' : 'Nicht aktiv';
          einstellBox.hidden = !c.einst.aktiv;
          felderBox.hidden = !c.einst.aktiv;
          if (zeileBox) zeileBox.hidden = !c.einst.aktiv;
        };
        ansichtSetzen();
        schalter.addEventListener('click', function () {
          c.einst.aktiv = !c.einst.aktiv;
          ansichtSetzen();
          Promise.all([speichereEinstellung(c), verzeichnisPflegen(c, c.einst.aktiv)]).then(function () {
            sagen(c.einst.aktiv ? '\u2713 Scharfgeschaltet \u2013 die Adresse antwortet jetzt.'
                                : '\u2713 Abgeschaltet \u2013 die Adresse antwortet nicht mehr.', true);
          });
        });
        box.querySelector('[data-a="pfad"]').addEventListener('change', function (e) {
          var v = (e.target.value || '').trim().toLowerCase();
          if (!/^\/[a-z0-9\/_-]*(version|pc|android)\.json$/.test(v)) {
            sagen('\u2717 Die Adresse muss mit / beginnen und auf version.json, pc.json oder android.json enden.', false);
            e.target.value = c.einst.pfad;
            return;
          }
          c.einst.pfad = v; c.pruef = v;
          var link = box.querySelector('.fv-update-link');
          if (link) link.setAttribute('href', v);
          Promise.all([speichereEinstellung(c), verzeichnisPflegen(c, c.einst.aktiv)]).then(function () {
            sagen('\u2713 Adresse gespeichert.', true);
          });
        });
        var bauplanWahl = box.querySelector('[data-a="bauplan"]');
        if (bauplanWahl) bauplanWahl.addEventListener('change', function (e) {
          c.einst.bauplan = e.target.value;
          speichereEinstellung(c).then(function () { location.reload(); });
        });
        box.querySelector('[data-a="merkmal"]').addEventListener('change', function (e) {
          c.einst.merkmal = (e.target.value || '').trim();
          c.fest = c.einst.merkmal ? { schluessel: c.einst.merkmal } : {};
          speichereEinstellung(c).then(function () { sagen('\u2713 Erkennungsmerkmal gespeichert.', true); });
        });
      }

      /* ---- Rohansicht: zeigt GENAU die eigene Datei ---------------- */
      box.querySelector('[data-a="mehr"]').addEventListener('click', function () {
        if (roh.hidden) { roh.value = JSON.stringify(ausFeldern(), null, 2); roh.hidden = false; }
        else { roh.hidden = true; }
      });

      /* ---- Speichern ---------------------------------------------- */
      box.querySelector('[data-a="save"]').addEventListener('click', function () {
        anstellen(function () {
          return holen(c.ablage)
            .then(function (frisch) { if (frisch && typeof frisch === 'object') stand = frisch; })
            .catch(function () {})
            .then(pruefenUndSpeichern);
        });
      });

      function pruefenUndSpeichern() {
        var obj;
        if (!roh.hidden) {
          try { obj = JSON.parse(roh.value); }
          catch (e) { sagen('\u2717 Das ist kein g\u00fcltiges JSON.', false); return; }
          var f = c.fest || {};
          for (var fk in f) if (f.hasOwnProperty(fk)) obj[fk] = f[fk];
          delete obj.pc;
        } else {
          obj = ausFeldern();
        }
        var codeFeld = codeFeldName();
        var code = parseInt(obj[codeFeld], 10) || 0;
        var uKey = urlFeldName();
        var adresse = uKey ? String(obj[uKey] || '') : '';

        /* Eine noch nicht gepflegte PC-Fassung darf leer bleiben - der
           Server liefert dann versionCode 0, und das Programm meldet
           schlicht "alles aktuell". Erst wenn etwas drinsteht, muss es
           stimmen. */
        var leer = !code && !adresse;
        if (!leer) {
          if (code < 1) { sagen('\u2717 Versions-Code fehlt.', false); return; }
          if (adresse && !/^https?:\/\//i.test(adresse)) {
            sagen('\u2717 Die Download-Adresse muss mit https:// beginnen.', false); return;
          }
        }
        return legen(c.ablage, obj).then(function (ok) {
          if (!ok) { sagen('\u2717 Speichern fehlgeschlagen.', false); return; }
          stand = obj;
          inFelder(obj);
          sagen('\u2713 Gespeichert in ' + c.pruef + ' \u2013 sofort wirksam.', true);
        });
      }
    }

    /* =================================================================
     * Start: je Definition eine Kachel im passenden Bereich
     * ================================================================= */
    function zielFuer(art) {
      if (art === 'pc') return document.querySelector('.program-download-block--pc');
      return document.querySelector(
        '.program-download-block:not(.program-download-block--pc):not(.program-download-block--web)');
    }

    function start() {
      var haupt = document.querySelector('main');
      var reihe = Promise.resolve();
      cfgs.forEach(function (c) {
        reihe = reihe.then(function () {
          return ladeEinstellung(c).then(function () {
            if (c.art === 'pc') return pcStandHolen(c);
            return appStandHolen(c);
          }).then(function (erg) {
            var ziel = zielFuer(c.art);
            /* Seite ohne eigene Download-Bereiche: alle Kacheln unter
               den Hauptteil, damit nichts unsichtbar bleibt. */
            if (!ziel && !document.querySelector('.program-download-block')) ziel = haupt;
            bauen(c, erg.stand, ziel, erg.umgezogen);
          });
        }).catch(function () {});
      });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  } catch (e) { /* niemals die Seite blockieren */ }
})();

/* =====================================================================
 * Eigene Programme anlegen und entfernen (nur Admin, Bearbeiten AN)
 * Erscheint auf der Seite "Programme". Angelegte Programme bekommen
 * automatisch eine eigene Seite, eine Kachel auf der Startseite und
 * eine Zeile in der Programmliste - ohne Veroeffentlichen.
 * ===================================================================== */
(function () {
  'use strict';
  try {
    var pw = '';
    try { pw = sessionStorage.getItem('fv_admin_pw') || ''; } catch (e) {}
    var editAn = false;
    try { editAn = sessionStorage.getItem('fv_edit') === '1'; } catch (e) {}
    if (!pw || !editAn) return;

    var pfad = (location.pathname || '').toLowerCase().replace(/\.html?$/, '').replace(/\/+$/, '');
    // Frueher stand hier "if (pfad !== '/programme') return;" - die Verwaltung
    // gab es also NUR auf der Programme-Seite, und dort ganz unten. Wer sie
    // nicht kannte, fand sie nicht. Jetzt laeuft der Block ueberall: auf
    // /programme wie bisher als Kasten am Seitenende, sonst (und zusaetzlich)
    // als Fenster ueber den Knopf in der Admin-Leiste.
    var aufProgrammseite = (pfad === '/programme');

    function kurzname(text) {
      return String(text || '')
        .toLowerCase()
        .replace(/\u00e4/g, 'ae').replace(/\u00f6/g, 'oe').replace(/\u00fc/g, 'ue').replace(/\u00df/g, 'ss')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    }

    function laden() {
      return fetch('/api/programme', { method: 'GET' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { return (d && Array.isArray(d.programme)) ? d.programme : []; })
        .catch(function () { return []; });
    }

    function senden(daten) {
      daten.password = pw;
      return fetch('/api/programme', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(daten)
      }).then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, daten: d }; });
      }).catch(function () { return { ok: false, daten: {} }; });
    }

    function bauen(liste, wohin) {
      var ziel = wohin || document.querySelector('main');
      // Doppelung nur INNERHALB des Ziels pruefen - sonst blockiert der
      // Kasten am Seitenende das Fenster (und umgekehrt).
      if (!ziel || ziel.querySelector('.fv-progverw-box')) return;

      var box = document.createElement('section');
      box.className = 'fv-prog-box fv-progverw-box';
      box.innerHTML =
        '<h3 class="fv-prog-titel">\u2699\uFE0F Programme verwalten <span>(nur f\u00fcr dich sichtbar)</span></h3>'
      + '<p class="fv-prog-hilfe">Hier legst du ein neues Programm an. Es bekommt sofort eine eigene Seite, '
      + 'eine Kachel auf der Startseite und eine Zeile in dieser Liste \u2013 <strong>ohne Ver\u00f6ffentlichen</strong>. '
      + 'Texte, Bilder und Download-Knopf danach ganz normal im Bearbeiten-Modus \u00e4ndern.</p>'
      + '<div class="fv-prog-felder">'
      + '  <label>Was soll entstehen?'
      + '    <select id="fvPArt">'
      + '      <option value="programm">Programmseite (mit Wappen, Download, Update-Feld)</option>'
      + '      <option value="info">Info-Seite (schlicht, nur Text und Bilder)</option>'
      + '    </select></label>'
      + '  <label>Name der Seite<input type="text" id="fvPName" placeholder="z. B. Finnvelo Notizbuch"></label>'
      + '  <label>Adresse (wird automatisch gebildet)<input type="text" id="fvPSlug" placeholder="finnvelo-notizbuch"></label>'
      + '  <label>Kurzbeschreibung (steht auf der Kachel)<input type="text" id="fvPKurz" placeholder="Wof\u00fcr ist das Programm da?"></label>'
      + '</div>'
      + '<div class="fv-prog-zeile">'
      + '  <button type="button" class="fv-prog-btn" id="fvPNeu">Programm anlegen</button>'
      + '  <span class="fv-prog-melde" id="fvPMelde"></span>'
      + '</div>'
      + '<div class="fv-prog-liste" id="fvPListe"></div>';
      ziel.appendChild(box);

      var nName = box.querySelector('#fvPName');
      var nSlug = box.querySelector('#fvPSlug');
      var nKurz = box.querySelector('#fvPKurz');
      var melde = box.querySelector('#fvPMelde');
      var listeEl = box.querySelector('#fvPListe');
      var slugManuell = false;

      nSlug.addEventListener('input', function () { slugManuell = true; });
      nName.addEventListener('input', function () {
        if (!slugManuell) nSlug.value = kurzname(nName.value);
      });

      function sagen(text, gut) {
        melde.textContent = text;
        melde.className = 'fv-prog-melde ' + (gut ? 'gut' : 'schlecht');
        if (gut) setTimeout(function () { melde.textContent = ''; melde.className = 'fv-prog-melde'; }, 6000);
      }

      function listeZeigen(arr) {
        listeEl.innerHTML = '';
        if (!arr.length) {
          listeEl.innerHTML = '<p class="fv-prog-leer">Noch keine eigenen Programme angelegt.</p>';
          return;
        }
        var kopf = document.createElement('p');
        kopf.className = 'fv-prog-kopf';
        kopf.textContent = 'Selbst angelegte Programme (' + arr.length + ')';
        listeEl.appendChild(kopf);
        arr.forEach(function (p) {
          var z = document.createElement('div');
          z.className = 'fv-prog-eintrag';
          z.innerHTML = '<strong>' + p.name + '</strong>'
                      + '<a href="/' + p.slug + '" target="_blank" rel="noopener">/' + p.slug + '</a>'
                      + '<span class="fv-prog-art">' + (p.art === 'info' ? 'Info-Seite' : 'Programm') + '</span>';
          var um = document.createElement('button');
          um.type = 'button'; um.className = 'fv-prog-weg'; um.textContent = 'umbenennen';
          um.addEventListener('click', function () {
            var nameNeu = window.prompt('Neuer Name:', p.name);
            if (nameNeu === null) return;
            var slugNeu = window.prompt(
              'Neue Adresse (nur Kleinbuchstaben, Zahlen, Bindestriche).\n\n'
              + 'Achtung: Alte Links auf diese Seite funktionieren danach nicht mehr.\n'
              + 'Alle eingetragenen Texte und Bilder ziehen automatisch mit um.',
              p.slug);
            if (slugNeu === null) return;
            senden({ aktion: 'umbenennen', slug: p.slug,
                     slugNeu: kurzname(slugNeu), name: (nameNeu || '').trim() })
              .then(function (a) {
                if (a.ok) { listeZeigen(a.daten.programme || []); sagen('\u2713 Ge\u00e4ndert. Seite neu laden.', true); }
                else if (a.daten && a.daten.error === 'slug_belegt') sagen('\u2717 Diese Adresse ist schon vergeben.', false);
                else if (a.daten && a.daten.error === 'bad_slug') sagen('\u2717 Ung\u00fcltige Adresse.', false);
                else sagen('\u2717 \u00c4ndern fehlgeschlagen.', false);
              });
          });
          z.appendChild(um);

          /* Als Datei herunterladen. Der Worker kann nicht selbst ins
             Deployment schreiben - die statischen Dateien liegen fest im
             Paket. Er baut die Seite aber fertig und gibt sie heraus:
             in den Projektordner legen, veroeffentlichen, fertig. Danach
             haengt die Seite nicht mehr allein an der Datenbank. */
          var dat = document.createElement('button');
          dat.type = 'button'; dat.className = 'fv-prog-datei'; dat.textContent = 'Datei';
          dat.title = 'Diese Seite als ' + p.slug + '.html herunterladen';
          dat.addEventListener('click', function () {
            dat.disabled = true;
            var altText = dat.textContent;
            dat.textContent = '\u2026';
            fetch('/api/programme/datei', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ password: pw, slug: p.slug })
            })
              .then(function (r) {
                if (!r.ok) throw new Error('weg');
                return r.blob();
              })
              .then(function (blob) {
                var a = document.createElement('a');
                var url = URL.createObjectURL(blob);
                a.href = url; a.download = p.slug + '.html';
                document.body.appendChild(a); a.click();
                document.body.removeChild(a);
                setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
                dat.disabled = false; dat.textContent = altText;
                sagen('\u2713 ' + p.slug + '.html heruntergeladen \u2013 in den Projektordner '
                    + 'legen und ver\u00f6ffentlichen. Danach h\u00e4ngt die Seite nicht mehr '
                    + 'allein an der Datenbank.', true);
              })
              .catch(function () {
                dat.disabled = false; dat.textContent = altText;
                sagen('\u2717 Datei konnte nicht erzeugt werden.', false);
              });
          });
          z.appendChild(dat);

          var weg = document.createElement('button');
          weg.type = 'button'; weg.className = 'fv-prog-weg'; weg.textContent = 'entfernen';
          weg.addEventListener('click', function () {
            if (!window.confirm('\u201e' + p.name + '\u201c wirklich entfernen?\n\n'
              + 'Die Seite und die Kachel verschwinden. Bereits eingetragene Texte und Bilder '
              + 'dieser Seite bleiben gespeichert und w\u00e4ren bei gleichem Kurznamen wieder da.')) return;
            senden({ aktion: 'entfernen', slug: p.slug }).then(function (a) {
              if (a.ok) { listeZeigen(a.daten.programme || []); sagen('\u2713 Entfernt. Seite neu laden, um die Liste zu aktualisieren.', true); }
              else sagen('\u2717 Entfernen fehlgeschlagen.', false);
            });
          });
          z.appendChild(weg);
          listeEl.appendChild(z);
        });
      }
      listeZeigen(liste);

      box.querySelector('#fvPNeu').addEventListener('click', function () {
        var name = (nName.value || '').trim();
        var slug = kurzname(nSlug.value || nName.value);
        if (!name) { sagen('\u2717 Bitte einen Namen eintragen.', false); return; }
        if (!slug) { sagen('\u2717 Die Adresse ist leer \u2013 bitte Namen pr\u00fcfen.', false); return; }
        var art = (box.querySelector('#fvPArt') || {}).value || 'programm';
        senden({ aktion: 'anlegen', slug: slug, name: name, art: art, kurz: (nKurz.value || '').trim() })
          .then(function (a) {
            if (a.ok) {
              listeZeigen(a.daten.programme || []);
              nName.value = ''; nSlug.value = ''; nKurz.value = ''; slugManuell = false;
              sagen('\u2713 Angelegt! Die Seite ist unter /' + slug + ' erreichbar.'
                + (art === 'info'
                    ? ' Info-Seiten erscheinen bewusst nicht in der Programm\u00fcbersicht \u2013 verlinke sie \u00fcber die Fu\u00dfzeile oder das Web-Apps-Men\u00fc.'
                    : ' Seite neu laden, damit die Kachel erscheint.')
                + ' Tipp: unten in der Liste mit \u201eDatei\u201c die '
                + slug + '.html herunterladen und ins Projekt legen \u2013 dann '
                + '\u00fcberlebt die Seite auch einen Datenbankverlust.', true);
            } else if (a.daten && a.daten.error === 'slug_belegt') {
              sagen('\u2717 Diese Adresse ist schon vergeben \u2013 bitte eine andere w\u00e4hlen.', false);
            } else if (a.daten && a.daten.error === 'bad_slug') {
              sagen('\u2717 Ung\u00fcltige Adresse (nur Kleinbuchstaben, Zahlen, Bindestriche).', false);
            } else if (a.daten && a.daten.error === 'zu_viele') {
              sagen('\u2717 Es sind schon sehr viele Programme angelegt.', false);
            } else {
              sagen('\u2717 Anlegen fehlgeschlagen.', false);
            }
          });
      });
    }

    /* Fenster - von jeder Seite aus erreichbar ueber die Admin-Leiste.
       Nutzt dieselbe Huelle wie Verlauf und Web-Apps, damit es sich
       gleich anfuehlt. */
    function fensterOeffnen() {
      var offen = document.querySelector('.fv-prog-huelle');
      if (offen) { offen.parentNode.removeChild(offen); return; }
      var huelle = document.createElement('div');
      huelle.className = 'fv-verlauf-huelle fv-prog-huelle';
      huelle.innerHTML =
        '<div class="fv-verlauf fv-prog-fenster" role="dialog" aria-label="Seiten anlegen">'
      + '  <div class="fv-verlauf__kopf">'
      + '    <h2>Seiten anlegen und verwalten</h2>'
      + '    <button type="button" class="fv-verlauf__zu" aria-label="Schliessen">\u2715</button>'
      + '  </div>'
      + '  <div class="fv-prog-ziel"></div>'
      + '</div>';
      document.body.appendChild(huelle);
      function zu() { if (huelle.parentNode) huelle.parentNode.removeChild(huelle); }
      huelle.querySelector('.fv-verlauf__zu').addEventListener('click', zu);
      huelle.addEventListener('click', function (e) { if (e.target === huelle) zu(); });
      laden().then(function (liste) {
        bauen(liste, huelle.querySelector('.fv-prog-ziel'));
      });
    }

    // Die Admin-Leiste liegt in einem anderen Block - Verbindung ueber ein
    // Ereignis, damit beide voneinander unabhaengig bleiben.
    document.addEventListener('fv:seiten-oeffnen', fensterOeffnen);

    function start() {
      // Kasten am Seitenende: nur auf der Programme-Seite, wie gehabt.
      if (aufProgrammseite) laden().then(function (l) { bauen(l); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  } catch (e) { /* niemals die Seite blockieren */ }
})();

/* =====================================================================
 * Web-Apps-Menue aus der Datenbank
 * Die zwei fest eingebauten Eintraege bleiben, wie sie sind. Zusaetzliche
 * Eintraege werden hier ergaenzt - fuer alle Besucher, ohne Veroeffentlichen.
 * Ablage: Seite "system", Block "m0".
 * ===================================================================== */
(function () {
  'use strict';
  try {
    var pw = '';
    try { pw = sessionStorage.getItem('fv_admin_pw') || ''; } catch (e) {}
    var editAn = false;
    try { editAn = sessionStorage.getItem('fv_edit') === '1'; } catch (e) {}

    var eintraege = [];

    function laden() {
      return fetch('/api/content?page=system', { method: 'GET' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) {
          var roh = '';
          if (res && res.items) res.items.forEach(function (it) { if (it.block === 'm0') roh = it.value || ''; });
          if (!roh) return [];
          try {
            var a = JSON.parse(roh);
            return Array.isArray(a) ? a.filter(function (e) { return e && e.name && e.url; }) : [];
          } catch (e) { return []; }
        }).catch(function () { return []; });
    }

    function speichern() {
      return fetch('/api/content', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: 'system', block: 'm0', type: 'text',
                               value: JSON.stringify(eintraege), password: pw })
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    }

    function menueFuellen() {
      var menue = document.querySelector('.nav-apps__menu');
      if (!menue) return;
      // alte dynamische Eintraege entfernen
      Array.prototype.slice.call(menue.querySelectorAll('[data-fv-nav-dyn]'))
        .forEach(function (a) { a.parentNode.removeChild(a); });
      eintraege.forEach(function (e) {
        var a = document.createElement('a');
        a.setAttribute('href', e.url);
        a.setAttribute('data-fv-nav-dyn', '');
        if (/^https?:/i.test(e.url)) { a.setAttribute('rel', 'noopener'); }
        a.setAttribute('target', '_blank');
        a.textContent = e.name;
        menue.appendChild(a);
      });
    }

    function verwaltung() {
      if (!pw || !editAn) return;
      var pfad = (location.pathname || '').toLowerCase().replace(/\.html?$/, '').replace(/\/+$/, '');
      if (pfad !== '/programme') return;
      var ziel = document.querySelector('main');
      if (!ziel || document.querySelector('.fv-menue-box')) return;

      var box = document.createElement('section');
      box.className = 'fv-prog-box fv-menue-box';
      box.innerHTML =
        '<h3 class="fv-prog-titel">\u2699\uFE0F Men\u00fc "Web-Apps" verwalten <span>(nur f\u00fcr dich sichtbar)</span></h3>'
      + '<p class="fv-prog-hilfe">Hier erg\u00e4nzt du Eintr\u00e4ge im Ausklappmen\u00fc oben. '
      + 'Die beiden festen Eintr\u00e4ge (Haus- und Gartenplaner, Mischwaldrechner) bleiben unber\u00fchrt \u2013 '
      + 'ihre Beschriftung \u00e4nderst du wie gewohnt durch Anklicken im Men\u00fc.</p>'
      + '<div class="fv-prog-felder">'
      + '  <label>Beschriftung<input type="text" id="fvMName" placeholder="z. B. Notizbuch"></label>'
      + '  <label>Adresse<input type="text" id="fvMUrl" placeholder="/notizbuch oder https://\u2026"></label>'
      + '</div>'
      + '<div class="fv-prog-zeile">'
      + '  <button type="button" class="fv-prog-btn" id="fvMNeu">Eintrag hinzuf\u00fcgen</button>'
      + '  <span class="fv-prog-melde" id="fvMMelde"></span>'
      + '</div>'
      + '<div class="fv-prog-liste" id="fvMListe"></div>';
      ziel.appendChild(box);

      var nName = box.querySelector('#fvMName'), nUrl = box.querySelector('#fvMUrl');
      var melde = box.querySelector('#fvMMelde'), listeEl = box.querySelector('#fvMListe');

      function sagen(t, gut) {
        melde.textContent = t;
        melde.className = 'fv-prog-melde ' + (gut ? 'gut' : 'schlecht');
        if (gut) setTimeout(function () { melde.textContent = ''; }, 5000);
      }
      function zeigen() {
        listeEl.innerHTML = '';
        if (!eintraege.length) {
          listeEl.innerHTML = '<p class="fv-prog-leer">Keine zus\u00e4tzlichen Men\u00fceintr\u00e4ge.</p>'; return;
        }
        eintraege.forEach(function (e, i) {
          var z = document.createElement('div');
          z.className = 'fv-prog-eintrag';
          z.innerHTML = '<strong>' + e.name + '</strong><a href="' + e.url + '">' + e.url + '</a>';
          var hoch = document.createElement('button');
          hoch.type = 'button'; hoch.className = 'fv-prog-weg'; hoch.textContent = '\u2191';
          hoch.addEventListener('click', function () {
            if (i === 0) return;
            var t = eintraege[i - 1]; eintraege[i - 1] = eintraege[i]; eintraege[i] = t;
            speichern().then(function () { zeigen(); menueFuellen(); });
          });
          var weg = document.createElement('button');
          weg.type = 'button'; weg.className = 'fv-prog-weg'; weg.textContent = 'entfernen';
          weg.addEventListener('click', function () {
            if (!window.confirm('Eintrag \u201e' + e.name + '\u201c aus dem Men\u00fc entfernen?')) return;
            eintraege.splice(i, 1);
            speichern().then(function () { zeigen(); menueFuellen(); sagen('\u2713 Entfernt.', true); });
          });
          z.appendChild(hoch); z.appendChild(weg);
          listeEl.appendChild(z);
        });
      }
      zeigen();

      box.querySelector('#fvMNeu').addEventListener('click', function () {
        var name = (nName.value || '').trim();
        var url = (nUrl.value || '').trim();
        if (!name) { sagen('\u2717 Bitte eine Beschriftung eintragen.', false); return; }
        if (!/^(https?:\/\/|\/)/i.test(url)) {
          sagen('\u2717 Die Adresse muss mit https:// oder mit / beginnen.', false); return;
        }
        if (eintraege.length >= 12) { sagen('\u2717 Das Men\u00fc w\u00e4re zu lang.', false); return; }
        eintraege.push({ name: name, url: url });
        speichern().then(function (ok) {
          if (ok) { nName.value = ''; nUrl.value = ''; zeigen(); menueFuellen(); sagen('\u2713 Hinzugef\u00fcgt.', true); }
          else sagen('\u2717 Speichern fehlgeschlagen.', false);
        });
      });
    }

    function start() {
      laden().then(function (a) { eintraege = a; menueFuellen(); verwaltung(); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  } catch (e) { /* niemals die Seite blockieren */ }
})();

/* =====================================================================
 * Seitentitel und Suchmaschinen-Beschreibung bearbeiten
 * Das sind die beiden Texte, die Google im Suchergebnis anzeigt.
 * Ablage: Block m1 (Titel) und m2 (Beschreibung) der jeweiligen Seite.
 * Der Server setzt sie beim Ausliefern ein - also auch fuer Suchmaschinen.
 * ===================================================================== */
(function () {
  'use strict';
  try {
    var pw = '';
    try { pw = sessionStorage.getItem('fv_admin_pw') || ''; } catch (e) {}
    var editAn = false;
    try { editAn = sessionStorage.getItem('fv_edit') === '1'; } catch (e) {}
    if (!pw || !editAn) return;

    function seite() {
      var p = (location.pathname || '').toLowerCase();
      var f = p.substring(p.lastIndexOf('/') + 1) || 'index.html';
      var n = f.replace(/\.html?$/, '').replace(/[^a-z0-9-]/g, '');
      if (!n || n === 'index') return 'start';
      return n;
    }
    var SEITE = seite();

    function sichern(block, wert) {
      return fetch('/api/content', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: SEITE, block: block, type: 'text', value: wert, password: pw })
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    }

    function bauen(titel, besch) {
      var ziel = document.querySelector('main');
      if (!ziel || document.querySelector('.fv-kopf-box')) return;
      var jetztTitel = (document.title || '').trim();
      var mb = document.querySelector('meta[name="description"]');
      var jetztBesch = mb ? (mb.getAttribute('content') || '') : '';

      var box = document.createElement('section');
      box.className = 'fv-prog-box fv-kopf-box';
      box.innerHTML =
        '<h3 class="fv-prog-titel">\u2699\uFE0F Google-Eintrag dieser Seite <span>(nur f\u00fcr dich sichtbar)</span></h3>'
      + '<p class="fv-prog-hilfe">Diese zwei Texte zeigt Google im Suchergebnis. '
      + 'Guter Richtwert: Titel 50\u201360 Zeichen, Beschreibung 120\u2013160 Zeichen. '
      + 'Leer lassen = der urspr\u00fcngliche Text aus der Datei bleibt.</p>'
      + '<div class="fv-prog-felder">'
      + '  <label>Seitentitel <span class="fv-zaehl" id="fvKT"></span>'
      + '    <input type="text" id="fvKTitel" maxlength="120"></label>'
      + '  <label>Beschreibung <span class="fv-zaehl" id="fvKB"></span>'
      + '    <input type="text" id="fvKBesch" maxlength="300"></label>'
      + '</div>'
      + '<div class="fv-prog-zeile">'
      + '  <button type="button" class="fv-prog-btn" id="fvKSave">Speichern</button>'
      + '  <span class="fv-prog-melde" id="fvKMelde"></span>'
      + '</div>';
      ziel.appendChild(box);

      var iT = box.querySelector('#fvKTitel'), iB = box.querySelector('#fvKBesch');
      var zT = box.querySelector('#fvKT'), zB = box.querySelector('#fvKB');
      var melde = box.querySelector('#fvKMelde');
      iT.value = titel || jetztTitel;
      iB.value = besch || jetztBesch;

      function zaehlen() {
        var t = iT.value.length, b = iB.value.length;
        zT.textContent = t + ' Zeichen' + (t > 65 ? ' \u2013 etwas lang' : '');
        zT.className = 'fv-zaehl' + (t > 65 ? ' warn' : '');
        zB.textContent = b + ' Zeichen' + (b > 170 ? ' \u2013 etwas lang' : (b && b < 70 ? ' \u2013 etwas kurz' : ''));
        zB.className = 'fv-zaehl' + (b > 170 ? ' warn' : '');
      }
      iT.addEventListener('input', zaehlen);
      iB.addEventListener('input', zaehlen);
      zaehlen();

      box.querySelector('#fvKSave').addEventListener('click', function () {
        Promise.all([sichern('m1', iT.value.trim()), sichern('m2', iB.value.trim())])
          .then(function (r) {
            var ok = r[0] && r[1];
            melde.textContent = ok
              ? '\u2713 Gespeichert \u2013 beim n\u00e4chsten Aufruf der Seite ist es aktiv.'
              : '\u2717 Speichern fehlgeschlagen.';
            melde.className = 'fv-prog-melde ' + (ok ? 'gut' : 'schlecht');
            if (ok) { document.title = iT.value.trim() || document.title; }
            setTimeout(function () { melde.textContent = ''; }, 6000);
          });
      });
    }

    fetch('/api/content?page=' + encodeURIComponent(SEITE), { method: 'GET' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (res) {
        var t = '', b = '';
        if (res && res.items) res.items.forEach(function (it) {
          if (it.block === 'm1') t = it.value || '';
          if (it.block === 'm2') b = it.value || '';
        });
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', function () { bauen(t, b); });
        } else bauen(t, b);
      }).catch(function () {});
  } catch (e) { /* niemals die Seite blockieren */ }
})();

/* =====================================================================
 * Sicherung: alles herunterladen (als ZIP) und wieder einspielen
 * ---------------------------------------------------------------------
 * Alles, was im Bearbeiten-Modus eingetragen wird, steht NUR in der
 * Datenbank auf dem Server - in den Dateien steht der Ursprungstext.
 * Ohne Sicherung gibt es davon keine zweite Kopie.
 *
 * Das ZIP hat zwei Gesichter:
 *   sicherung.json  - fuer die Maschine. Genau das, was "einspielen"
 *                     wieder annimmt. Nicht von Hand aendern.
 *   seiten/*.md     - fuer Menschen. Je Seite eine Liste: welcher Block,
 *                     welche Art, welcher Text. Damit laesst sich ohne
 *                     Werkzeug nachlesen, welche Texte geaendert wurden.
 *   bilder/*        - die hochgeladenen Bilder als echte Dateien.
 *   LIESMICH.md     - was drin ist und wie man es zurueckspielt.
 *
 * Der Knopf sitzt in der Admin-Leiste und wirkt auf JEDER Seite.
 * ===================================================================== */
(function () {
  'use strict';
  try {
    var pw = '';
    try { pw = sessionStorage.getItem('fv_admin_pw') || ''; } catch (e) {}
    if (!pw) return;

    /* ---- ZIP schreiben, ohne fremde Bibliothek --------------------
       Gespeichert wird ohne Verdichtung ("store"). Bilder sind ohnehin
       schon verdichtet, und Text faellt kaum ins Gewicht - dafuer ist
       der Schreiber kurz genug, um ihn zu ueberblicken. */
    var crcTabelle = (function () {
      var t = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
      }
      return t;
    })();
    function crc32(bytes) {
      var c = 0xFFFFFFFF;
      for (var i = 0; i < bytes.length; i++) c = crcTabelle[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
      return (c ^ 0xFFFFFFFF) >>> 0;
    }
    function textBytes(s) {
      if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
      var aus = [];
      for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        if (c < 128) aus.push(c);
        else if (c < 2048) aus.push(192 | (c >> 6), 128 | (c & 63));
        else aus.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
      }
      return new Uint8Array(aus);
    }
    function b64Bytes(b64) {
      var roh = atob(String(b64).replace(/\s+/g, ''));
      var a = new Uint8Array(roh.length);
      for (var i = 0; i < roh.length; i++) a[i] = roh.charCodeAt(i);
      return a;
    }
    function zipBauen(dateien) {
      var stuecke = [], verzeichnis = [], versatz = 0, jetzt = new Date();
      var zeit = ((jetzt.getHours() << 11) | (jetzt.getMinutes() << 5) | (jetzt.getSeconds() >> 1)) & 0xFFFF;
      var datum = (((jetzt.getFullYear() - 1980) << 9) | ((jetzt.getMonth() + 1) << 5) | jetzt.getDate()) & 0xFFFF;

      function schreibe(ziel, p, wert, breite) {
        for (var i = 0; i < breite; i++) ziel[p + i] = (wert >>> (i * 8)) & 0xFF;
      }

      dateien.forEach(function (d) {
        var name = textBytes(d.name);
        var inhalt = (d.daten instanceof Uint8Array) ? d.daten : textBytes(String(d.daten));
        var pruef = crc32(inhalt);

        var kopf = new Uint8Array(30 + name.length);
        schreibe(kopf, 0, 0x04034b50, 4);
        schreibe(kopf, 4, 20, 2);
        schreibe(kopf, 6, 0x0800, 2);     // Namen sind UTF-8
        schreibe(kopf, 8, 0, 2);          // ohne Verdichtung
        schreibe(kopf, 10, zeit, 2);
        schreibe(kopf, 12, datum, 2);
        schreibe(kopf, 14, pruef, 4);
        schreibe(kopf, 18, inhalt.length, 4);
        schreibe(kopf, 22, inhalt.length, 4);
        schreibe(kopf, 26, name.length, 2);
        schreibe(kopf, 28, 0, 2);
        kopf.set(name, 30);
        stuecke.push(kopf, inhalt);

        var eintrag = new Uint8Array(46 + name.length);
        schreibe(eintrag, 0, 0x02014b50, 4);
        schreibe(eintrag, 4, 20, 2);
        schreibe(eintrag, 6, 20, 2);
        schreibe(eintrag, 8, 0x0800, 2);
        schreibe(eintrag, 10, 0, 2);
        schreibe(eintrag, 12, zeit, 2);
        schreibe(eintrag, 14, datum, 2);
        schreibe(eintrag, 16, pruef, 4);
        schreibe(eintrag, 20, inhalt.length, 4);
        schreibe(eintrag, 24, inhalt.length, 4);
        schreibe(eintrag, 28, name.length, 2);
        schreibe(eintrag, 42, versatz, 4);
        eintrag.set(name, 46);
        verzeichnis.push(eintrag);

        versatz += kopf.length + inhalt.length;
      });

      var vLaenge = 0;
      verzeichnis.forEach(function (e) { vLaenge += e.length; });
      var schluss = new Uint8Array(22);
      schreibe(schluss, 0, 0x06054b50, 4);
      schreibe(schluss, 8, dateien.length, 2);
      schreibe(schluss, 10, dateien.length, 2);
      schreibe(schluss, 12, vLaenge, 4);
      schreibe(schluss, 16, versatz, 4);

      var gesamt = versatz + vLaenge + 22;
      var aus = new Uint8Array(gesamt), p = 0;
      stuecke.forEach(function (s) { aus.set(s, p); p += s.length; });
      verzeichnis.forEach(function (s) { aus.set(s, p); p += s.length; });
      aus.set(schluss, p);
      return aus;
    }

    /* ---- Lesbare Fassung je Seite ------------------------------- */
    function sicherName(s) { return String(s).replace(/[^a-z0-9_-]/gi, '_') || 'ohne-namen'; }
    function zeitText(ms) {
      var n = Number(ms);
      if (!isFinite(n) || n <= 0) return '';
      try { return new Date(n).toISOString().slice(0, 16).replace('T', ' '); } catch (e) { return ''; }
    }
    function seitenBlatt(seite, eintraege) {
      var t = '# Seite: ' + seite + '\n\n'
            + eintraege.length + ' Eintr' + (eintraege.length === 1 ? 'ag' : 'äge') + '.\n\n'
            + 'Jeder Abschnitt ist ein Feld auf der Seite. `block` ist seine Kennung,\n'
            + '`art` sagt, was es ist. Der Inhalt steht darunter, unverändert.\n';
      eintraege.forEach(function (e) {
        var wann = zeitText(e.updated);
        t += '\n---\n\n## ' + e.block + '  (' + (e.type || 'text') + ')'
           + (wann ? '  ·  zuletzt ' + wann : '') + '\n\n';
        var wert = String(e.value == null ? '' : e.value);
        if (e.type === 'image' || e.type === 'link') t += wert + '\n';
        else t += '```\n' + wert.replace(/```/g, '` ` `') + '\n```\n';
      });
      return t;
    }
    /* Lesbare Blaetter fuer die uebrigen Tabellen. Nicht alles ist zum
       Lesen gedacht - Nachrichten und Listen sind verschluesselt. Dann
       steht hier nur, WIE VIEL da ist, damit man erkennt, ob eine
       Sicherung vollstaendig aussieht. */
    function tabellenBlatt(tab) {
      var t = '# Weitere Tabellen\n\nNeben den Seiteninhalten gesichert:\n\n'
            + '| Tabelle | Zeilen | Was es ist |\n|---|---|---|\n';
      var erklaerung = {
        counter_values: 'Zählerstände der Seitenaufrufe',
        comments: 'Kommentare der Besucher',
        apps: 'hinterlegte Seiten-Bauplaene',
        kanalliste: 'welche Kanäle es gibt',
        verlauf: 'Änderungshistorie hinter „↺ Verlauf"',
        marken: 'Einladungsmarken',
        zugang: 'Passwort und Notfall-PIN — steht im Klartext in sicherung.json'
      };
      var namen = Object.keys(erklaerung);
      namen.forEach(function (n) {
        var z = (tab && tab[n]) || [];
        t += '| `' + n + '` | ' + z.length + ' | ' + erklaerung[n] + ' |\n';
      });

      var k = (tab && tab.comments) || [];
      if (k.length) {
        t += '\n---\n\n## Kommentare\n';
        k.forEach(function (c) {
          t += '\n**' + (c.name || 'ohne Namen') + '**'
             + (c.created ? '  ·  ' + zeitText(c.created) : '')
             + (Number(c.removed) ? '  ·  ENTFERNT' + (c.reason ? ' (' + c.reason + ')' : '') : '')
             + '\n\n```\n' + String(c.body || '').replace(/```/g, '` ` `') + '\n```\n';
        });
      }
      var v = (tab && tab.counter_values) || [];
      if (v.length) {
        t += '\n---\n\n## Zählerstände\n\n| Schlüssel | Stand |\n|---|---|\n';
        v.forEach(function (z) { t += '| `' + z.key + '` | ' + z.value + ' |\n'; });
      }
      return t;
    }
    function kanalBlatt(kanaele) {
      var t = '# Kanäle\n\n' + kanaele.length + ' Kanal/Kanäle gesichert.\n\n'
            + 'Nachrichten, Listen und Anhänge sind **verschlüsselt** — sie stehen in der\n'
            + 'Sicherung, lassen sich hier aber nicht lesen. Die Zahlen zeigen, dass sie da sind.\n';
      kanaele.forEach(function (k) {
        t += '\n---\n\n## Kanal `' + k.code + '`\n\n';
        if (k.fehler) { t += 'NICHT ERREICHBAR: ' + k.fehler + '\n'; return; }
        var tb = k.tabellen || {};
        t += '| Tabelle | Zeilen |\n|---|---|\n';
        Object.keys(tb).forEach(function (n) {
          t += '| `' + n + '` | ' + ((tb[n] && tb[n].length) || 0) + ' |\n';
        });
      });
      return t;
    }

    function endung(mime) {
      if (/png/.test(mime)) return 'png';
      if (/webp/.test(mime)) return 'webp';
      if (/gif/.test(mime)) return 'gif';
      return 'jpg';
    }

    function melden(text, gut) {
      var bar = document.querySelector('.fv-admin-bar');
      var ziel = document.querySelector('.fv-sich-melde');
      if (!ziel && bar) {
        ziel = document.createElement('span');
        ziel.className = 'fv-sich-melde';
        bar.querySelector('.fv-admin-right').appendChild(ziel);
      }
      var kasten = document.querySelector('#fvSMelde');
      [ziel, kasten].forEach(function (m) {
        if (!m) return;
        m.textContent = text;
        m.className = (m === kasten ? 'fv-prog-melde ' : 'fv-sich-melde ') + (gut ? 'gut' : 'schlecht');
      });
      if (gut) setTimeout(function () {
        [ziel, kasten].forEach(function (m) { if (m) m.textContent = ''; });
      }, 12000);
    }

    var laeuft = false;
    function sicherungLaden() {
      if (laeuft) return;
      laeuft = true;
      melden('Sicherung wird erstellt \u2026', true);
      fetch('/api/export', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pw })
      }).then(function (r) { return r.ok ? r.text() : null; })
        .then(function (txt) {
          if (!txt) throw new Error('leer');
          var daten = JSON.parse(txt);
          var inhalte = daten.inhalte || [];
          var bilder = daten.bilder || [];
          var kanaele = daten.kanaele || [];
          var tabZeilen = 0;
          if (daten.tabellen) {
            for (var tn in daten.tabellen) {
              if (daten.tabellen.hasOwnProperty(tn)) tabZeilen += (daten.tabellen[tn] || []).length;
            }
          }

          /* nach Seiten ordnen */
          var nachSeite = {}, reihenfolge = [];
          inhalte.forEach(function (e) {
            var s = String(e.page || 'ohne-seite');
            if (!nachSeite[s]) { nachSeite[s] = []; reihenfolge.push(s); }
            nachSeite[s].push(e);
          });
          reihenfolge.sort();

          var d = new Date();
          var stempel = d.getFullYear() + '-'
                      + String(d.getMonth() + 1).padStart(2, '0') + '-'
                      + String(d.getDate()).padStart(2, '0');

          var liesmich =
            '# FINNVELO Programmwelten \u2013 Sicherung\n\n'
          + 'Erstellt: ' + (daten.erstellt || d.toISOString()) + '\n\n'
          + '- Seiteneintr\u00e4ge: ' + inhalte.length + ' auf ' + reihenfolge.length + ' Seiten\n'
          + '- Bilder: ' + bilder.length + '\n'
          + '- Zeilen in weiteren Tabellen: ' + tabZeilen + '\n'
          + '- Kan\u00e4le: ' + kanaele.length + '\n\n'
          + '> **Diese Sicherung enth\u00e4lt dein Admin-Passwort und die Notfall-PIN im\n'
          + '> Klartext** (in `sicherung.json`, Abschnitt `tabellen.zugang`). Ohne sie w\u00e4re\n'
          + '> ein Wiederanlauf auf einer leeren Datenbank nicht m\u00f6glich. Bewahre die\n'
          + '> Datei entsprechend auf und lege sie nicht offen ab.\n\n'
          + '## Was hier drin ist\n\n'
          + '| Datei | Wof\u00fcr |\n|---|---|\n'
          + '| `sicherung.json` | Die Sicherung selbst. Genau diese Datei nimmt '
          + '\u201eSicherung einspielen\u201c wieder an. Nicht von Hand \u00e4ndern. |\n'
          + '| `seiten/*.md` | Die Seiteninhalte zum Lesen \u2013 je Seite ein Blatt. |\n'
          + '| `tabellen.md` | Kommentare, Z\u00e4hlerst\u00e4nde, Verlauf, Zugang \u2013 zum Lesen. |\n'
          + '| `kanaele.md` | Umfang der Kan\u00e4le. Inhalte sind verschl\u00fcsselt. |\n'
          + '| `bilder/*` | Die hochgeladenen Bilder als echte Dateien. |\n\n'
          + '## Zur\u00fcckspielen\n\n'
          + 'Auf `/programme` anmelden, **Bearbeiten: AN**, Kasten \u201eSicherung\u201c \u2192 '
          + '**Sicherung einspielen** \u2192 `sicherung.json` w\u00e4hlen.\n\n'
          + 'Was dabei passiert:\n\n'
          + '- Seitentexte werden **\u00fcberschrieben**.\n'
          + '- Bilder: vorhandene bleiben, fehlende werden erg\u00e4nzt.\n'
          + '- Kommentare, Z\u00e4hlerst\u00e4nde, Verlauf, Marken: eingespielt; was seither\n'
          + '  dazukam, bleibt stehen.\n'
          + '- Kan\u00e4le: jeder in sein eigenes Objekt zur\u00fcck.\n'
          + '- **Zugang: nur wenn noch keiner eingerichtet ist.** Ein bestehendes Passwort\n'
          + '  wird nie \u00fcberschrieben \u2013 sonst k\u00f6nnte eine alte Sicherung dich aussperren.\n\n'
          + '## Was NICHT drin ist\n\n'
          + 'Sperrzeiten (`bremse`) und das Fehlerbuch (`fehler`). Beides ist nach einem\n'
          + 'Wiederanlauf wertlos. Ebenso die Dateien des Projekts selbst \u2013 die liegen\n'
          + 'in deinem Quellordner, nicht in der Datenbank.\n\n'
          + '## Wozu die Blätter unter `seiten/`\n\n'
          + 'In den HTML-Dateien des Projekts steht nur der Ursprungstext. Alles, was '
          + '\u00fcber den Bearbeiten-Modus ge\u00e4ndert wurde, liegt in der Datenbank \u2013 '
          + 'und damit hier. Wer wissen will, welche Texte von Hand ge\u00e4ndert wurden, '
          + 'vergleicht das Blatt der Seite mit der zugeh\u00f6rigen HTML-Datei.\n\n'
          + '## Seiten in dieser Sicherung\n\n'
          + reihenfolge.map(function (s) {
              return '- `' + s + '` \u2013 ' + nachSeite[s].length + ' Eintr\u00e4ge';
            }).join('\n') + '\n';

          var dateien = [
            { name: 'LIESMICH.md', daten: liesmich },
            { name: 'sicherung.json', daten: txt }
          ];
          reihenfolge.forEach(function (s) {
            dateien.push({ name: 'seiten/' + sicherName(s) + '.md',
                           daten: seitenBlatt(s, nachSeite[s]) });
          });
          if (daten.tabellen) dateien.push({ name: 'tabellen.md', daten: tabellenBlatt(daten.tabellen) });
          if (kanaele.length) dateien.push({ name: 'kanaele.md', daten: kanalBlatt(kanaele) });
          bilder.forEach(function (b) {
            try {
              dateien.push({ name: 'bilder/' + sicherName(b.id) + '.' + endung(b.mime || ''),
                             daten: b64Bytes(b.data) });
            } catch (e) {}
          });

          var roh = zipBauen(dateien);
          var blob = new Blob([roh], { type: 'application/zip' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'finnvelo-sicherung-' + stempel + '.zip';
          document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
          melden('\u2713 ' + a.download + ' \u2013 ' + inhalte.length + ' Eintr\u00e4ge, '
               + reihenfolge.length + ' Seiten, ' + bilder.length + ' Bilder, '
               + tabZeilen + ' Tabellenzeilen, ' + kanaele.length + ' Kan\u00e4le.', true);
        })
        .catch(function () { melden('\u2717 Sicherung fehlgeschlagen.', false); })
        .then(function () { laeuft = false; });
    }

    function sicherungEinspielen() {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        var leser = new FileReader();
        leser.onload = function () {
          var daten;
          try { daten = JSON.parse(String(leser.result)); }
          catch (e) { melden('\u2717 Das ist keine g\u00fcltige Sicherungsdatei.', false); return; }
          if (!daten || daten.art !== 'finnvelo-sicherung') {
            melden('\u2717 Das ist keine Finnvelo-Sicherung.', false); return;
          }
          if (!window.confirm('Sicherung vom ' + (daten.erstellt || '?').slice(0, 10)
              + ' einspielen?\n\nAlle Texte werden mit dem Stand aus der Datei \u00fcberschrieben.')) return;
          melden('Wird eingespielt \u2026', true);
          fetch('/api/import', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: pw, daten: daten })
          }).then(function (r) { return r.ok ? r.json() : null; })
            .then(function (a) {
              if (!a || !a.ok) { melden('\u2717 Einspielen fehlgeschlagen.', false); return; }
              melden('\u2713 ' + a.uebernommen + ' Eintr\u00e4ge'
                   + (a.bilder ? ', ' + a.bilder + ' Bilder' : '')
                   + (a.zeilen ? ', ' + a.zeilen + ' Tabellenzeilen' : '')
                   + (a.kanaele ? ', ' + a.kanaele + ' Kan\u00e4le' : '')
                   + ' eingespielt. Zugang: ' + (a.zugang || '?')
                   + '. Seite neu laden.', true);
            })
            .catch(function () { melden('\u2717 Einspielen fehlgeschlagen.', false); });
        };
        leser.readAsText(f);
      };
      inp.click();
    }

    /* Der Knopf in der Admin-Leiste meldet sich hierher. */
    document.addEventListener('fv:sicherung-laden', sicherungLaden);

    /* Zusaetzlich der ausfuehrliche Kasten auf /programme - dort steht
       auch das Einspielen, das man selten und bewusst braucht. */
    function kastenBauen() {
      var ziel = document.querySelector('main');
      if (!ziel || document.querySelector('.fv-sich-box')) return;
      var editAn = false;
      try { editAn = sessionStorage.getItem('fv_edit') === '1'; } catch (e) {}
      if (!editAn) return;
      var pfad = (location.pathname || '').toLowerCase().replace(/\.html?$/, '').replace(/\/+$/, '');
      if (pfad !== '/programme') return;

      var box = document.createElement('section');
      box.className = 'fv-prog-box fv-sich-box';
      box.innerHTML =
        '<h3 class="fv-prog-titel">\uD83D\uDCBE Sicherung <span>(nur f\u00fcr dich sichtbar)</span></h3>'
      + '<p class="fv-prog-hilfe">Alles, was du im Bearbeiten-Modus eintr\u00e4gst \u2013 Texte, Bilder, '
      + 'Zusatzfelder, ausgeblendete Elemente, Fassungsangaben, angelegte Programme \u2013 liegt nur in der '
      + 'Datenbank auf dem Server. In den Dateien steht nur der Ursprungstext. '
      + '<strong>Lade dir ab und zu eine Sicherung herunter</strong>, am besten nach gr\u00f6\u00dferen '
      + '\u00c4nderungen. Du bekommst ein ZIP: die Sicherung selbst, dieselben Inhalte zum Lesen '
      + 'je Seite, und alle Bilder als Dateien.</p>'
      + '<div class="fv-prog-zeile">'
      + '  <button type="button" class="fv-prog-btn" id="fvSDown">Sicherung herunterladen</button>'
      + '  <button type="button" class="fv-prog-weg" id="fvSUp" style="margin-left:0">Sicherung einspielen</button>'
      + '  <span class="fv-prog-melde" id="fvSMelde"></span>'
      + '</div>';
      ziel.appendChild(box);
      box.querySelector('#fvSDown').addEventListener('click', sicherungLaden);
      box.querySelector('#fvSUp').addEventListener('click', sicherungEinspielen);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kastenBauen);
    else kastenBauen();
  } catch (e) { /* niemals die Seite blockieren */ }
})();

/* =====================================================================
 * Fusszeilen-Links aus der Datenbank
 * Die festen Links (Impressum, Datenschutz) bleiben unberuehrt;
 * zusaetzliche werden hier ergaenzt. Ablage: Seite "system", Block "f0".
 * ===================================================================== */
(function () {
  'use strict';
  try {
    var pw = '';
    try { pw = sessionStorage.getItem('fv_admin_pw') || ''; } catch (e) {}
    var editAn = false;
    try { editAn = sessionStorage.getItem('fv_edit') === '1'; } catch (e) {}
    var eintraege = [];

    function laden() {
      return fetch('/api/content?page=system', { method: 'GET' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) {
          var roh = '';
          if (res && res.items) res.items.forEach(function (it) { if (it.block === 'f0') roh = it.value || ''; });
          if (!roh) return [];
          try { var a = JSON.parse(roh); return Array.isArray(a) ? a.filter(function (e) { return e && e.name && e.url; }) : []; }
          catch (e) { return []; }
        }).catch(function () { return []; });
    }
    function speichern() {
      return fetch('/api/content', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: 'system', block: 'f0', type: 'text',
                               value: JSON.stringify(eintraege), password: pw })
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    }
    function fuellen() {
      var fuss = document.querySelector('footer');
      if (!fuss) return;
      Array.prototype.slice.call(fuss.querySelectorAll('[data-fv-fuss-dyn]'))
        .forEach(function (a) { a.parentNode.removeChild(a); });
      eintraege.forEach(function (e) {
        var a = document.createElement('a');
        a.setAttribute('href', e.url);
        a.setAttribute('data-fv-fuss-dyn', '');
        if (/^https?:/i.test(e.url)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); }
        a.textContent = e.name;
        fuss.appendChild(a);
      });
    }
    function verwaltung() {
      if (!pw || !editAn) return;
      var pfad = (location.pathname || '').toLowerCase().replace(/\.html?$/, '').replace(/\/+$/, '');
      if (pfad !== '/programme') return;
      var ziel = document.querySelector('main');
      if (!ziel || document.querySelector('.fv-fuss-box')) return;

      var box = document.createElement('section');
      box.className = 'fv-prog-box fv-fuss-box';
      box.innerHTML =
        '<h3 class="fv-prog-titel">\u2699\uFE0F Fu\u00dfzeile verwalten <span>(nur f\u00fcr dich sichtbar)</span></h3>'
      + '<p class="fv-prog-hilfe">Zus\u00e4tzliche Links in der Fu\u00dfzeile, auf allen Seiten. '
      + 'Impressum und Datenschutz bleiben fest \u2013 ihre Beschriftung \u00e4nderst du durch Anklicken.</p>'
      + '<div class="fv-prog-felder">'
      + '  <label>Beschriftung<input type="text" id="fvFName" placeholder="z. B. \u00dcber mich"></label>'
      + '  <label>Adresse<input type="text" id="fvFUrl" placeholder="/ueber-mich oder https://\u2026"></label>'
      + '</div>'
      + '<div class="fv-prog-zeile">'
      + '  <button type="button" class="fv-prog-btn" id="fvFNeu">Link hinzuf\u00fcgen</button>'
      + '  <span class="fv-prog-melde" id="fvFMelde"></span>'
      + '</div>'
      + '<div class="fv-prog-liste" id="fvFListe"></div>';
      ziel.appendChild(box);

      var nName = box.querySelector('#fvFName'), nUrl = box.querySelector('#fvFUrl');
      var melde = box.querySelector('#fvFMelde'), listeEl = box.querySelector('#fvFListe');
      function sagen(t, gut) {
        melde.textContent = t;
        melde.className = 'fv-prog-melde ' + (gut ? 'gut' : 'schlecht');
        if (gut) setTimeout(function () { melde.textContent = ''; }, 5000);
      }
      function zeigen() {
        listeEl.innerHTML = '';
        if (!eintraege.length) { listeEl.innerHTML = '<p class="fv-prog-leer">Keine zus\u00e4tzlichen Links.</p>'; return; }
        eintraege.forEach(function (e, i) {
          var z = document.createElement('div');
          z.className = 'fv-prog-eintrag';
          z.innerHTML = '<strong>' + e.name + '</strong><a href="' + e.url + '">' + e.url + '</a>';
          var weg = document.createElement('button');
          weg.type = 'button'; weg.className = 'fv-prog-weg'; weg.textContent = 'entfernen';
          weg.addEventListener('click', function () {
            if (!window.confirm('Link \u201e' + e.name + '\u201c entfernen?')) return;
            eintraege.splice(i, 1);
            speichern().then(function () { zeigen(); fuellen(); sagen('\u2713 Entfernt.', true); });
          });
          z.appendChild(weg);
          listeEl.appendChild(z);
        });
      }
      zeigen();
      box.querySelector('#fvFNeu').addEventListener('click', function () {
        var name = (nName.value || '').trim(), url = (nUrl.value || '').trim();
        if (!name) { sagen('\u2717 Bitte eine Beschriftung eintragen.', false); return; }
        if (!/^(https?:\/\/|\/)/i.test(url)) { sagen('\u2717 Adresse muss mit https:// oder / beginnen.', false); return; }
        if (eintraege.length >= 8) { sagen('\u2717 Die Fu\u00dfzeile w\u00e4re zu voll.', false); return; }
        eintraege.push({ name: name, url: url });
        speichern().then(function (ok) {
          if (ok) { nName.value = ''; nUrl.value = ''; zeigen(); fuellen(); sagen('\u2713 Hinzugef\u00fcgt.', true); }
          else sagen('\u2717 Speichern fehlgeschlagen.', false);
        });
      });
    }
    function start() { laden().then(function (a) { eintraege = a; fuellen(); verwaltung(); }); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  } catch (e) { /* niemals die Seite blockieren */ }
})();



/* =====================================================================
 * Hauptmenue verwalten
 * ---------------------------------------------------------------------
 * Start / Programme / Kommentare / Kontakt standen fest in jeder
 * HTML-Datei. Beschriften liess sich ein Eintrag, mehr nicht - kein
 * Hinzufuegen, kein Entfernen, kein Umsortieren, kein anderes Ziel.
 * Eine selbst angelegte Seite tauchte deshalb nie im Menue auf.
 *
 * Jetzt liegt die Menuefolge in der Datenbank (system / Block h2).
 * Solange dort nichts steht, bleibt das Menue aus der HTML-Datei
 * unveraendert stehen - eine leere Datenbank aendert also nichts.
 *
 * WICHTIG fuer die Nummerierung: Die Eintraege des Hauptmenues sind
 * Teil der n-Reihe (NAV_TEXT_SEL). Wer hier Eintraege einfuegt oder
 * entfernt, verschiebt gespeicherte Beschriftungen. Deshalb wird die
 * Beschriftung NICHT mehr ueber n-Schluessel gefuehrt, sondern steht
 * im Menueeintrag selbst - genau dort, wo sie hingehoert.
 * ===================================================================== */
(function () {
  'use strict';
  try {
    var pw = '';
    try { pw = sessionStorage.getItem('fv_admin_pw') || ''; } catch (e) {}
    var editAn = false;
    try { editAn = sessionStorage.getItem('fv_edit') === '1'; } catch (e) {}

    var nav = document.querySelector('.site-header nav[aria-label="Hauptnavigation"]')
           || document.querySelector('.site-header nav');
    if (!nav) return;

    var eintraege = [];

    function ausHtml() {
      return Array.prototype.slice.call(nav.querySelectorAll('a')).map(function (a) {
        return { name: (a.textContent || '').trim(), url: a.getAttribute('href') || '/' };
      }).filter(function (e) { return e.name; });
    }

    function laden() {
      return fetch('/api/content?page=system', { method: 'GET' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) {
          var roh = '';
          if (res && res.items) res.items.forEach(function (it) {
            if (it.block === 'h2') roh = it.value || '';
          });
          if (!roh) return null;
          try {
            var a = JSON.parse(roh);
            if (!Array.isArray(a)) return null;
            return a.filter(function (e) { return e && e.name && e.url; });
          } catch (e) { return null; }
        }).catch(function () { return null; });
    }
    function speichern() {
      return fetch('/api/content', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: 'system', block: 'h2', type: 'text',
                               value: JSON.stringify(eintraege), password: pw })
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    }

    /* Menue neu zeichnen. Der aktuelle Pfad bekommt aria-current, damit
       die Hervorhebung stimmt wie vorher aus der HTML-Datei. */
    function zeichnen() {
      var hier = (location.pathname || '/').replace(/\.html?$/, '').replace(/\/+$/, '') || '/';
      nav.innerHTML = '';
      eintraege.forEach(function (e) {
        var a = document.createElement('a');
        a.setAttribute('href', e.url);
        a.textContent = e.name;
        var ziel = String(e.url).replace(/\/+$/, '') || '/';
        if (ziel === hier) a.setAttribute('aria-current', 'page');
        if (/^https?:/i.test(e.url)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); }
        nav.appendChild(a);
      });
    }

    function sagen(box, text, gut) {
      var m = box.querySelector('.fv-prog-melde');
      if (!m) return;
      m.textContent = text;
      m.className = 'fv-prog-melde ' + (gut ? 'gut' : 'schlecht');
      if (gut) setTimeout(function () { m.textContent = ''; m.className = 'fv-prog-melde'; }, 6000);
    }

    function verwaltung() {
      if (!pw || !editAn) return;
      var pfad = (location.pathname || '').toLowerCase().replace(/\.html?$/, '').replace(/\/+$/, '');
      if (pfad !== '/programme') return;              // ein Ort reicht
      var ziel = document.querySelector('main');
      if (!ziel || document.querySelector('.fv-menue2-box')) return;

      var box = document.createElement('section');
      box.className = 'fv-prog-box fv-menue2-box';
      box.innerHTML =
        '<h3 class="fv-prog-titel">\uD83E\uDDED Hauptmen\u00fc <span>(nur f\u00fcr dich sichtbar)</span></h3>'
      + '<p class="fv-prog-hilfe">Die Eintr\u00e4ge oben in der Kopfzeile. Reihenfolge, Beschriftung und '
      + 'Ziel bestimmst du hier. Adressen der eigenen Seiten beginnen mit einem Schr\u00e4gstrich, '
      + 'z.\u00a0B. <code>/mischwaldrechner</code>. Volle Adressen mit <code>https://</code> \u00f6ffnen '
      + 'in einem neuen Fenster.</p>'
      + '<div class="fv-menue2-liste"></div>'
      + '<div class="fv-prog-zeile">'
      + '  <input type="text" class="fv-prog-feld" id="fvM2Name" placeholder="Beschriftung" maxlength="40">'
      + '  <input type="text" class="fv-prog-feld" id="fvM2Url" placeholder="/adresse" maxlength="200">'
      + '  <button type="button" class="fv-prog-btn" id="fvM2Neu">Hinzuf\u00fcgen</button>'
      + '  <button type="button" class="fv-prog-weg" id="fvM2Reset">Auf Ursprung zur\u00fccksetzen</button>'
      + '  <span class="fv-prog-melde"></span>'
      + '</div>';
      ziel.appendChild(box);

      var listeEl = box.querySelector('.fv-menue2-liste');

      function zeigen() {
        listeEl.innerHTML = '';
        eintraege.forEach(function (e, i) {
          var zeile = document.createElement('div');
          zeile.className = 'fv-menue2-zeile';

          var nEl = document.createElement('input');
          nEl.type = 'text'; nEl.className = 'fv-prog-feld'; nEl.value = e.name; nEl.maxLength = 40;
          nEl.addEventListener('change', function () {
            var v = (nEl.value || '').trim();
            if (!v) { nEl.value = e.name; return; }
            eintraege[i].name = v;
            speichern().then(function () { zeichnen(); sagen(box, '\u2713 Gespeichert.', true); });
          });

          var uEl = document.createElement('input');
          uEl.type = 'text'; uEl.className = 'fv-prog-feld'; uEl.value = e.url; uEl.maxLength = 200;
          uEl.addEventListener('change', function () {
            var v = (uEl.value || '').trim();
            if (!/^(\/|https?:\/\/)/.test(v)) {
              uEl.value = e.url;
              sagen(box, '\u2717 Die Adresse muss mit / oder https:// beginnen.', false);
              return;
            }
            eintraege[i].url = v;
            speichern().then(function () { zeichnen(); sagen(box, '\u2713 Gespeichert.', true); });
          });

          function knopf(zeichen, titel, tun, aus) {
            var k = document.createElement('button');
            k.type = 'button'; k.className = 'fv-menue2-k';
            k.innerHTML = zeichen; k.setAttribute('title', titel);
            if (aus) k.disabled = true;
            k.addEventListener('click', tun);
            zeile.appendChild(k);
            return k;
          }

          zeile.appendChild(nEl);
          zeile.appendChild(uEl);
          knopf('\u2191', 'Nach vorn', function () {
            var t = eintraege[i - 1]; eintraege[i - 1] = eintraege[i]; eintraege[i] = t;
            speichern().then(function () { zeigen(); zeichnen(); });
          }, i === 0);
          knopf('\u2193', 'Nach hinten', function () {
            var t = eintraege[i + 1]; eintraege[i + 1] = eintraege[i]; eintraege[i] = t;
            speichern().then(function () { zeigen(); zeichnen(); });
          }, i === eintraege.length - 1);
          var weg = knopf('\u2715', 'Eintrag entfernen', function () {
            if (!window.confirm('Men\u00fceintrag wirklich entfernen?\n\n' + e.name)) return;
            eintraege.splice(i, 1);
            speichern().then(function () { zeigen(); zeichnen(); sagen(box, '\u2713 Entfernt.', true); });
          });
          weg.classList.add('fv-menue2-k--weg');

          listeEl.appendChild(zeile);
        });
      }

      box.querySelector('#fvM2Neu').addEventListener('click', function () {
        var n = (box.querySelector('#fvM2Name').value || '').trim();
        var u = (box.querySelector('#fvM2Url').value || '').trim();
        if (!n) { sagen(box, '\u2717 Beschriftung fehlt.', false); return; }
        if (!/^(\/|https?:\/\/)/.test(u)) {
          sagen(box, '\u2717 Die Adresse muss mit / oder https:// beginnen.', false); return;
        }
        if (eintraege.length >= 12) { sagen(box, '\u2717 Mehr als zw\u00f6lf passen nicht in die Kopfzeile.', false); return; }
        eintraege.push({ name: n, url: u });
        speichern().then(function (ok) {
          if (!ok) { sagen(box, '\u2717 Speichern fehlgeschlagen.', false); return; }
          box.querySelector('#fvM2Name').value = '';
          box.querySelector('#fvM2Url').value = '';
          zeigen(); zeichnen(); sagen(box, '\u2713 Hinzugef\u00fcgt.', true);
        });
      });

      box.querySelector('#fvM2Reset').addEventListener('click', function () {
        if (!window.confirm('Men\u00fc auf den Ursprung der HTML-Datei zur\u00fccksetzen?\n\n'
            + 'Deine \u00c4nderungen am Men\u00fc gehen dabei verloren.')) return;
        eintraege = ausHtml();
        speichern().then(function () { zeigen(); zeichnen(); sagen(box, '\u2713 Zur\u00fcckgesetzt.', true); });
      });

      zeigen();
    }

    /* Beim Start: was in der Datenbank steht, gewinnt. Steht dort nichts,
       bleibt das Menue der HTML-Datei stehen - und dient zugleich als
       Ausgangsstand fuer die Verwaltung. */
    function start() {
      var ausgang = ausHtml();
      laden().then(function (gespeichert) {
        eintraege = (gespeichert && gespeichert.length) ? gespeichert : ausgang;
        if (gespeichert && gespeichert.length) zeichnen();
        verwaltung();
      });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  } catch (e) { /* niemals die Seite blockieren */ }
})();

/* =====================================================================
 * Gestaltung: Farben und Schrift
 * ---------------------------------------------------------------------
 * Das Aussehen haengt an Variablen in :root (styles.css). Abweichungen
 * liegen in der Datenbank (system / Block c0) und werden als <style> in
 * den Kopf gelegt.
 *
 * JEDE Farbe hat einen eigenen Waehler mit Farbflaeche, Farbton-Regler
 * und Durchsichtigkeit. Frueher gab es fuer Flaechen und Linien nur
 * einen gemeinsamen Staerke-Regler - damit liessen sich die Farben
 * selbst nicht anfassen.
 *
 * Gespeichert wird als #rrggbbaa (acht Stellen, letzte zwei sind die
 * Deckkraft). Ein einziges, leicht pruefbares Format - und CSS versteht
 * es direkt.
 *
 * Laeuft fuer ALLE Besucher, nicht nur im Bearbeiten-Modus.
 * ===================================================================== */
(function () {
  'use strict';
  try {
    var SPEICHER = 'fv_gestaltung';

    /* key = CSS-Variable ohne die zwei Striche */
    var FARBEN = [
      { key: 'blue',         name: 'Akzent (Kn\u00f6pfe, Links)', vorgabe: '#317cffff' },
      { key: 'blue-light',   name: 'Akzent hell',                 vorgabe: '#bdd7ffff' },
      { key: 'knopf-text',   name: 'Schrift auf Kn\u00f6pfen',    vorgabe: '#ffffffff' },
      { key: 'bg',           name: 'Hintergrund',                 vorgabe: '#03050aff' },
      { key: 'bg-soft',      name: 'Hintergrund der Fl\u00e4chen', vorgabe: '#070b13ff' },
      { key: 'kopf-bg',      name: 'Kopfzeile',                   vorgabe: '#060910e0' },
      { key: 'panel',        name: 'Fl\u00e4chen',                vorgabe: '#ffffff0e' },
      { key: 'panel-strong', name: 'Fl\u00e4chen (kr\u00e4ftig)', vorgabe: '#ffffff18' },
      { key: 'line',         name: 'Linien und R\u00e4nder',      vorgabe: '#ffffff1b' },
      { key: 'text',         name: 'Text',                        vorgabe: '#f4f7fbff' },
      { key: 'muted',        name: 'Nebentext',                   vorgabe: '#c7d3e7ff' },
      { key: 'soft',         name: 'Schwacher Text',              vorgabe: '#95a6bfff' },
      { key: 'red',          name: 'Warnfarbe',                   vorgabe: '#ff4964ff' }
    ];

    var SCHRIFTEN = [
      { id: 'arial',     name: 'Arial (Vorgabe)',  wert: 'Arial, Helvetica, sans-serif' },
      { id: 'system',    name: 'System-Schrift',   wert: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
      { id: 'verdana',   name: 'Verdana',          wert: 'Verdana, Geneva, sans-serif' },
      { id: 'trebuchet', name: 'Trebuchet',        wert: '"Trebuchet MS", Tahoma, sans-serif' },
      { id: 'georgia',   name: 'Georgia (Serife)', wert: 'Georgia, "Times New Roman", serif' },
      { id: 'mono',      name: 'Schreibmaschine',  wert: 'ui-monospace, "Courier New", monospace' }
    ];

    /* ---- Farbe umrechnen ------------------------------------------- */
    function zwei(n) { var s = Math.round(n).toString(16); return s.length < 2 ? '0' + s : s; }
    function hsvNachHex(h, s, v, a) {
      h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); v = Math.max(0, Math.min(1, v));
      var c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
      var r = 0, g = 0, b = 0;
      if (h < 60) { r = c; g = x; }
      else if (h < 120) { r = x; g = c; }
      else if (h < 180) { g = c; b = x; }
      else if (h < 240) { g = x; b = c; }
      else if (h < 300) { r = x; b = c; }
      else { r = c; b = x; }
      return '#' + zwei((r + m) * 255) + zwei((g + m) * 255) + zwei((b + m) * 255)
           + zwei(Math.max(0, Math.min(1, a)) * 255);
    }
    function hexNachHsv(hex) {
      var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(hex || '');
      if (!m) return { h: 0, s: 0, v: 0, a: 1 };
      var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
      var a = m[4] === undefined ? 1 : parseInt(m[4], 16) / 255;
      var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      var h = 0;
      if (d) {
        if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
      }
      if (h < 0) h += 360;
      return { h: h, s: max ? d / max : 0, v: max, a: a };
    }
    function istFarbe(w) { return typeof w === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(w); }
    function achtStellig(w) {
      w = String(w).toLowerCase();
      return w.length === 7 ? w + 'ff' : w;
    }

    function vorgabeStand() {
      var f = {};
      FARBEN.forEach(function (x) { f[x.key] = x.vorgabe; });
      return { farben: f, schrift: 'arial', groesse: 100 };
    }
    function norm(s) {
      var v = vorgabeStand();
      if (!s || typeof s !== 'object') return v;
      if (s.farben && typeof s.farben === 'object') {
        FARBEN.forEach(function (x) {
          var w = s.farben[x.key];
          if (istFarbe(w)) v.farben[x.key] = achtStellig(w);
        });
      }
      /* Alter Stand: ein gemeinsamer Regler "staerke" statt eigener
         Farben fuer Flaechen und Linien. Wird einmalig umgerechnet,
         damit nichts verlorengeht. */
      var st = parseInt(s.staerke, 10);
      if (isFinite(st) && st >= 20 && st <= 260) {
        [['panel', 0.055], ['panel-strong', 0.095], ['line', 0.105]].forEach(function (p) {
          if (s.farben && istFarbe(s.farben[p[0]])) return;   // schon eigene Farbe
          v.farben[p[0]] = '#ffffff' + zwei(Math.min(255, p[1] * (st / 100) * 255));
        });
      }
      var gefunden = false;
      SCHRIFTEN.forEach(function (x) { if (x.id === s.schrift) gefunden = true; });
      if (gefunden) v.schrift = s.schrift;
      var gr = parseInt(s.groesse, 10);
      if (isFinite(gr) && gr >= 85 && gr <= 130) v.groesse = gr;
      return v;
    }
    function schriftWert(id) {
      var w = SCHRIFTEN[0].wert;
      SCHRIFTEN.forEach(function (x) { if (x.id === id) w = x.wert; });
      return w;
    }

    function bauStil(s) {
      var z = [];
      FARBEN.forEach(function (x) { z.push('  --' + x.key + ': ' + s.farben[x.key] + ';'); });
      z.push('  font-family: ' + schriftWert(s.schrift) + ';');
      var stil = ':root {\n' + z.join('\n') + '\n}\n';
      stil += 'body { font-family: ' + schriftWert(s.schrift) + '; }\n';
      if (s.groesse !== 100) stil += 'html { font-size: ' + (16 * s.groesse / 100).toFixed(2) + 'px; }\n';
      return stil;
    }
    function anwenden(s) {
      var el = document.getElementById('fv-gestaltung');
      if (!el) {
        el = document.createElement('style');
        el.id = 'fv-gestaltung';
        (document.head || document.documentElement).appendChild(el);
      }
      el.textContent = bauStil(s);
    }

    var stand = vorgabeStand();
    try {
      var roh = sessionStorage.getItem(SPEICHER);
      if (roh) { stand = norm(JSON.parse(roh)); anwenden(stand); }
    } catch (e) {}

    function laden() {
      return fetch('/api/content?page=system', { method: 'GET' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) {
          var w = '';
          if (res && res.items) res.items.forEach(function (it) { if (it.block === 'c0') w = it.value || ''; });
          if (!w) return null;
          try { return norm(JSON.parse(w)); } catch (e) { return null; }
        }).catch(function () { return null; });
    }
    function speichern(pw) {
      try { sessionStorage.setItem(SPEICHER, JSON.stringify(stand)); } catch (e) {}
      return fetch('/api/content', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: 'system', block: 'c0', type: 'text',
                               value: JSON.stringify(stand), password: pw })
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    }

    /* ---- Farbwaehler ------------------------------------------------
       Farbflaeche (S/V), Farbton-Regler, Durchsichtigkeit, Hex-Feld.
       Alles vier haengt am selben Wert und schreibt zurueck ueber den
       Rueckruf. */
    function farbwaehlerBauen(startHex, aendern) {
      var f = hexNachHsv(startHex);

      var wurzel = document.createElement('div');
      wurzel.className = 'fv-cp';
      wurzel.innerHTML =
        '<div class="fv-cp__flaeche" data-a="flaeche"><span class="fv-cp__punkt" data-a="punkt"></span></div>'
      + '<div class="fv-cp__regler">'
      + '  <input type="range" min="0" max="360" step="1" class="fv-cp__ton" data-a="ton" aria-label="Farbton">'
      + '  <div class="fv-cp__klarbahn" data-a="klarbahn">'
      + '    <input type="range" min="0" max="100" step="1" class="fv-cp__klar" data-a="klar" aria-label="Deckkraft">'
      + '  </div>'
      + '</div>'
      + '<div class="fv-cp__fuss">'
      + '  <span class="fv-cp__probe" data-a="probe"></span>'
      + '  <input type="text" class="fv-cp__hex" data-a="hex" maxlength="9" spellcheck="false">'
      + '  <span class="fv-cp__deck" data-a="deck"></span>'
      + '</div>';

      var flaeche = wurzel.querySelector('[data-a="flaeche"]');
      var punkt = wurzel.querySelector('[data-a="punkt"]');
      var ton = wurzel.querySelector('[data-a="ton"]');
      var klar = wurzel.querySelector('[data-a="klar"]');
      var klarbahn = wurzel.querySelector('[data-a="klarbahn"]');
      var probe = wurzel.querySelector('[data-a="probe"]');
      var hexFeld = wurzel.querySelector('[data-a="hex"]');
      var deck = wurzel.querySelector('[data-a="deck"]');

      function jetzt() { return hsvNachHex(f.h, f.s, f.v, f.a); }
      function zeichnen(auchHex) {
        var voll = hsvNachHex(f.h, 1, 1, 1).slice(0, 7);
        flaeche.style.background =
          'linear-gradient(to top, #000, rgba(0,0,0,0)), '
        + 'linear-gradient(to right, #fff, ' + voll + ')';
        punkt.style.left = (f.s * 100) + '%';
        punkt.style.top = ((1 - f.v) * 100) + '%';
        punkt.style.background = jetzt().slice(0, 7);
        ton.value = String(Math.round(f.h));
        klar.value = String(Math.round(f.a * 100));
        klarbahn.style.background =
          'linear-gradient(to right, rgba(0,0,0,0), ' + jetzt().slice(0, 7) + ')';
        probe.style.background = jetzt();
        deck.textContent = Math.round(f.a * 100) + '\u2009%';
        if (auchHex !== false) hexFeld.value = jetzt();
      }
      function melden() { zeichnen(); aendern(jetzt()); }

      function ausFlaeche(x, y) {
        var r = flaeche.getBoundingClientRect();
        if (!r.width || !r.height) return;
        f.s = Math.max(0, Math.min(1, (x - r.left) / r.width));
        f.v = Math.max(0, Math.min(1, 1 - (y - r.top) / r.height));
        melden();
      }
      function ziehen(startX, startY) {
        ausFlaeche(startX, startY);
        function mv(ev) {
          ev.preventDefault();
          var p = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
          ausFlaeche(p.clientX, p.clientY);
        }
        function up() {
          document.removeEventListener('mousemove', mv);
          document.removeEventListener('mouseup', up);
          document.removeEventListener('touchmove', mv);
          document.removeEventListener('touchend', up);
        }
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
        document.addEventListener('touchmove', mv, { passive: false });
        document.addEventListener('touchend', up);
      }
      flaeche.addEventListener('mousedown', function (e) { e.preventDefault(); ziehen(e.clientX, e.clientY); });
      flaeche.addEventListener('touchstart', function (e) {
        if (!e.touches || !e.touches[0]) return;
        e.preventDefault(); ziehen(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: false });

      ton.addEventListener('input', function () { f.h = parseInt(ton.value, 10) || 0; melden(); });
      klar.addEventListener('input', function () { f.a = (parseInt(klar.value, 10) || 0) / 100; melden(); });
      hexFeld.addEventListener('change', function () {
        var w = (hexFeld.value || '').trim();
        if (w && w.charAt(0) !== '#') w = '#' + w;
        if (!istFarbe(w)) { zeichnen(); return; }      // Unsinn -> zurueck auf den Wert
        f = hexNachHsv(achtStellig(w));
        melden();
      });

      zeichnen();
      return { el: wurzel, setzen: function (hex) { f = hexNachHsv(achtStellig(hex)); zeichnen(); } };
    }

    function verwaltung() {
      var pw = '';
      try { pw = sessionStorage.getItem('fv_admin_pw') || ''; } catch (e) {}
      var editAn = false;
      try { editAn = sessionStorage.getItem('fv_edit') === '1'; } catch (e) {}
      if (!pw || !editAn) return;
      var pfad = (location.pathname || '').toLowerCase().replace(/\.html?$/, '').replace(/\/+$/, '');
      if (pfad !== '/programme') return;
      var ziel = document.querySelector('main');
      if (!ziel || document.querySelector('.fv-gest-box')) return;

      var box = document.createElement('section');
      box.className = 'fv-prog-box fv-gest-box';
      var schriftHtml = '';
      SCHRIFTEN.forEach(function (x) {
        schriftHtml += '<option value="' + x.id + '"' + (stand.schrift === x.id ? ' selected' : '') + '>'
                    + x.name + '</option>';
      });
      box.innerHTML =
        '<h3 class="fv-prog-titel">\uD83C\uDFA8 Gestaltung <span>(nur f\u00fcr dich sichtbar)</span></h3>'
      + '<p class="fv-prog-hilfe">Jede Farbe der Webseite mit eigenem W\u00e4hler: Farbfl\u00e4che f\u00fcr '
      + 'S\u00e4ttigung und Helligkeit, Regler f\u00fcr den Farbton, und darunter die Deckkraft. '
      + '\u00c4nderungen siehst du <strong>sofort</strong>, gespeichert werden sie erst mit '
      + '\u201eSpeichern\u201c \u2013 bis dahin kannst du gefahrlos ausprobieren.</p>'
      + '<div class="fv-gest-netz"></div>'
      + '<div class="fv-gest-regler">'
      + '  <label>Schriftart<select data-a="schrift">' + schriftHtml + '</select></label>'
      + '  <label>Schriftgr\u00f6\u00dfe <b data-a="groesseWert">' + stand.groesse + '\u2009%</b>'
      + '    <input type="range" min="85" max="130" step="5" value="' + stand.groesse + '" data-a="groesse"></label>'
      + '</div>'
      + '<div class="fv-prog-zeile">'
      + '  <button type="button" class="fv-prog-btn" data-a="save">Speichern</button>'
      + '  <button type="button" class="fv-prog-weg" data-a="undo" style="margin-left:0">Verwerfen</button>'
      + '  <button type="button" class="fv-prog-weg" data-a="reset" style="margin-left:0">Auf Vorgabe zur\u00fccksetzen</button>'
      + '  <span class="fv-prog-melde"></span>'
      + '</div>';
      ziel.appendChild(box);

      var netz = box.querySelector('.fv-gest-netz');
      var waehler = {};
      FARBEN.forEach(function (x) {
        var karte = document.createElement('div');
        karte.className = 'fv-gest-karte';
        karte.setAttribute('data-farbe', x.key);
        var titel = document.createElement('div');
        titel.className = 'fv-gest-karte__name';
        titel.textContent = x.name;
        karte.appendChild(titel);
        var w = farbwaehlerBauen(stand.farben[x.key], function (hex) {
          stand.farben[x.key] = hex;
          anwenden(stand);
        });
        waehler[x.key] = w;
        karte.appendChild(w.el);
        netz.appendChild(karte);
      });

      var gespeichert = JSON.parse(JSON.stringify(stand));
      function sagen(t, gut) {
        var m = box.querySelector('.fv-prog-melde');
        m.textContent = t;
        m.className = 'fv-prog-melde ' + (gut ? 'gut' : 'schlecht');
        if (gut) setTimeout(function () { m.textContent = ''; m.className = 'fv-prog-melde'; }, 6000);
      }
      function felderSetzen() {
        FARBEN.forEach(function (x) { waehler[x.key].setzen(stand.farben[x.key]); });
        box.querySelector('[data-a="schrift"]').value = stand.schrift;
        box.querySelector('[data-a="groesse"]').value = stand.groesse;
        box.querySelector('[data-a="groesseWert"]').textContent = stand.groesse + '\u2009%';
      }

      box.querySelector('[data-a="groesse"]').addEventListener('input', function (e) {
        stand.groesse = parseInt(e.target.value, 10) || 100;
        box.querySelector('[data-a="groesseWert"]').textContent = stand.groesse + '\u2009%';
        anwenden(stand);
      });
      box.querySelector('[data-a="schrift"]').addEventListener('change', function (e) {
        stand.schrift = e.target.value;
        anwenden(stand);
      });
      box.querySelector('[data-a="save"]').addEventListener('click', function () {
        speichern(pw).then(function (ok) {
          if (!ok) { sagen('\u2717 Speichern fehlgeschlagen.', false); return; }
          gespeichert = JSON.parse(JSON.stringify(stand));
          sagen('\u2713 Gespeichert \u2013 gilt ab sofort f\u00fcr alle Besucher.', true);
        });
      });
      box.querySelector('[data-a="undo"]').addEventListener('click', function () {
        stand = norm(JSON.parse(JSON.stringify(gespeichert)));
        anwenden(stand); felderSetzen();
        sagen('\u2713 Verworfen \u2013 zur\u00fcck auf den gespeicherten Stand.', true);
      });
      box.querySelector('[data-a="reset"]').addEventListener('click', function () {
        if (!window.confirm('Farben und Schrift auf die Vorgabe zur\u00fccksetzen?\n\n'
            + 'Das wirkt sofort f\u00fcr alle Besucher.')) return;
        stand = vorgabeStand();
        anwenden(stand); felderSetzen();
        speichern(pw).then(function () { sagen('\u2713 Auf Vorgabe zur\u00fcckgesetzt.', true); });
      });
    }

    function start() {
      laden().then(function (s) {
        if (s) {
          stand = s; anwenden(stand);
          try { sessionStorage.setItem(SPEICHER, JSON.stringify(stand)); } catch (e) {}
        }
        verwaltung();
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  } catch (e) { /* niemals die Seite blockieren */ }
})();

/* =====================================================================
 * Bilder verwalten
 * ---------------------------------------------------------------------
 * Hochgeladene Bilder liegen in einer eigenen Tabelle und waren bisher
 * nirgends sichtbar. Man konnte weder nachsehen, was da liegt, noch
 * etwas entfernen - unbenutzte Bilder sammelten sich still an.
 *
 * Welches Bild wo benutzt wird, sagt der Server (/api/images). Er sucht
 * dafuer im gesamten Inhalt nach /api/image/<kennung> und findet damit
 * auch Bilder in Sammellisten wie der Galerie.
 * ===================================================================== */
(function () {
  'use strict';
  try {
    var pw = '';
    try { pw = sessionStorage.getItem('fv_admin_pw') || ''; } catch (e) {}
    var editAn = false;
    try { editAn = sessionStorage.getItem('fv_edit') === '1'; } catch (e) {}
    if (!pw || !editAn) return;
    var pfad = (location.pathname || '').toLowerCase().replace(/\.html?$/, '').replace(/\/+$/, '');
    if (pfad !== '/programme') return;

    var bilder = [];
    var nurFreie = false;

    function kb(n) {
      if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
      return Math.round(n / 1024) + ' KB';
    }
    function datum(ms) {
      var d = new Date(Number(ms) || 0);
      if (!isFinite(d.getTime()) || !ms) return '';
      return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
    }

    function laden() {
      return fetch('/api/images', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pw })
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (a) { return (a && a.bilder) || []; })
        .catch(function () { return []; });
    }

    function bauen() {
      var ziel = document.querySelector('main');
      if (!ziel || document.querySelector('.fv-bild-box')) return;

      var box = document.createElement('section');
      box.className = 'fv-prog-box fv-bild-box';
      box.innerHTML =
        '<h3 class="fv-prog-titel">\uD83D\uDDBC\uFE0F Bilder <span>(nur f\u00fcr dich sichtbar)</span></h3>'
      + '<p class="fv-prog-hilfe">Alle hochgeladenen Bilder. Unter jedem steht, auf welcher Seite '
      + 'und in welchem Feld es benutzt wird. Bilder ohne Verwendung stehen nur noch in der '
      + 'Datenbank und vergr\u00f6\u00dfern jede Sicherung.</p>'
      + '<div class="fv-prog-zeile">'
      + '  <button type="button" class="fv-prog-btn" data-a="neu">Neu laden</button>'
      + '  <label class="fv-bild-filter"><input type="checkbox" data-a="filter"> nur unbenutzte zeigen</label>'
      + '  <span class="fv-bild-summe" data-a="summe"></span>'
      + '  <span class="fv-prog-melde"></span>'
      + '</div>'
      + '<div class="fv-bild-netz" data-a="netz"></div>';
      ziel.appendChild(box);

      var netz = box.querySelector('[data-a="netz"]');
      function sagen(t, gut) {
        var m = box.querySelector('.fv-prog-melde');
        m.textContent = t;
        m.className = 'fv-prog-melde ' + (gut ? 'gut' : 'schlecht');
        if (gut) setTimeout(function () { m.textContent = ''; m.className = 'fv-prog-melde'; }, 8000);
      }

      function zeigen() {
        var zeigeListe = nurFreie
          ? bilder.filter(function (b) { return !b.benutzt.length; })
          : bilder;
        var frei = bilder.filter(function (b) { return !b.benutzt.length; });
        var freiByte = 0;
        frei.forEach(function (b) { freiByte += b.groesse; });
        var alleByte = 0;
        bilder.forEach(function (b) { alleByte += b.groesse; });
        box.querySelector('[data-a="summe"]').textContent =
          bilder.length + ' Bilder, ' + kb(alleByte) + ' \u2013 davon ' + frei.length
          + ' unbenutzt (' + kb(freiByte) + ')';

        netz.innerHTML = '';
        if (!zeigeListe.length) {
          netz.innerHTML = '<p class="fv-prog-hilfe">Keine Bilder in dieser Ansicht.</p>';
          return;
        }
        zeigeListe.forEach(function (b) {
          var karte = document.createElement('figure');
          karte.className = 'fv-bild-karte' + (b.benutzt.length ? '' : ' fv-bild-karte--frei');
          karte.setAttribute('data-bild', b.id);

          var wo = b.benutzt.length
            ? b.benutzt.map(function (v) { return v.page + ' / ' + v.block; }).join('<br>')
            : 'wird nirgends verwendet';

          karte.innerHTML =
            '<div class="fv-bild-vorschau"><img src="/api/image/' + b.id + '" alt="" loading="lazy"></div>'
          + '<figcaption>'
          + '  <code>' + b.id + '</code>'
          + '  <div class="fv-bild-fakt">' + kb(b.groesse) + ' \u00b7 ' + b.mime.split('/')[1]
          + (datum(b.created) ? ' \u00b7 ' + datum(b.created) : '') + '</div>'
          + '  <div class="fv-bild-wo' + (b.benutzt.length ? '' : ' frei') + '">' + wo + '</div>'
          + '  <button type="button" class="fv-bild-weg" data-a="weg">Entfernen</button>'
          + '</figcaption>';

          karte.querySelector('[data-a="weg"]').addEventListener('click', function () {
            /* Zwei verschiedene Rueckfragen: ein unbenutztes Bild
               wegzunehmen ist harmlos, ein benutztes reisst ein Loch in
               die Seite. Das muss man vorher wissen. */
            var frage = b.benutzt.length
              ? ('Dieses Bild wird noch BENUTZT:\n\n'
                 + b.benutzt.map(function (v) { return '\u2022 ' + v.page + ' / ' + v.block; }).join('\n')
                 + '\n\nWird es entfernt, bleiben dort leere Stellen.\nTrotzdem entfernen?')
              : ('Dieses Bild wirklich entfernen?\n\n' + b.id + ' \u00b7 ' + kb(b.groesse)
                 + '\n\nEs wird nirgends verwendet. Zur\u00fcckholen l\u00e4sst es sich nur\n'
                 + 'aus einer Sicherung, die es noch enth\u00e4lt.');
            if (!window.confirm(frage)) return;
            fetch('/api/images/entfernen', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ password: pw, ids: [b.id] })
            }).then(function (r) { return r.ok ? r.json() : null; })
              .then(function (a) {
                if (!a || !a.ok) { sagen('\u2717 Entfernen fehlgeschlagen.', false); return; }
                bilder = bilder.filter(function (x) { return x.id !== b.id; });
                zeigen();
                sagen('\u2713 Entfernt.', true);
              })
              .catch(function () { sagen('\u2717 Entfernen fehlgeschlagen.', false); });
          });

          netz.appendChild(karte);
        });
      }

      box.querySelector('[data-a="filter"]').addEventListener('change', function (e) {
        nurFreie = !!e.target.checked;
        zeigen();
      });
      box.querySelector('[data-a="neu"]').addEventListener('click', function () {
        laden().then(function (a) { bilder = a; zeigen(); sagen('\u2713 Neu geladen.', true); });
      });

      laden().then(function (a) { bilder = a; zeigen(); });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bauen);
    else bauen();
  } catch (e) { /* niemals die Seite blockieren */ }
})();

/* =====================================================================
 * Handy-Vorschau
 * ---------------------------------------------------------------------
 * Zeigt die aktuelle Seite in einem schmalen Rahmen. Wichtig: ein
 * RAHMEN, keine schmal gerechnete Seite. Media Queries haengen an der
 * Fensterbreite - eine per CSS verkleinerte Seite wuerde sie NICHT
 * ausloesen, und die Vorschau zeigte etwas, das es so nie gibt.
 *
 * Im Rahmen laeuft die Seite als Besuchersicht (siehe Sperre ganz oben
 * in dieser Datei), sonst saehe man die eigene Werkzeugleiste.
 * ===================================================================== */
(function () {
  'use strict';
  try {
    var pw = '';
    try { pw = sessionStorage.getItem('fv_admin_pw') || ''; } catch (e) {}
    if (!pw) return;
    if (/[?&]fv-vorschau=1(&|$)/.test(location.search || '')) return;   // nie im Rahmen selbst

    var BREITEN = [
      { id: 'handy',  name: '\uD83D\uDCF1 Handy',  breit: 390,  hoch: 760 },
      { id: 'tablet', name: '\uD83D\uDCDF Tablet', breit: 768,  hoch: 900 },
      { id: 'klein',  name: '\uD83D\uDDA5\uFE0F Schmal', breit: 1024, hoch: 760 }
    ];

    function adresse() {
      var p = location.pathname + (location.search || '');
      return p + (location.search ? '&' : '?') + 'fv-vorschau=1';
    }

    function oeffnen() {
      if (document.querySelector('.fv-vorschau')) return;
      var huelle = document.createElement('div');
      huelle.className = 'fv-vorschau';

      var knoepfe = '';
      BREITEN.forEach(function (b, i) {
        knoepfe += '<button type="button" class="fv-vorschau__mass' + (i === 0 ? ' an' : '') + '" '
                +  'data-breit="' + b.breit + '" data-hoch="' + b.hoch + '">' + b.name + '</button>';
      });

      huelle.innerHTML =
        '<div class="fv-vorschau__kasten">'
      + '  <div class="fv-vorschau__kopf">'
      + '    <span class="fv-vorschau__titel">Vorschau</span>'
      + knoepfe
      + '    <span class="fv-vorschau__mass-anzeige" data-a="anzeige"></span>'
      + '    <button type="button" class="fv-vorschau__zu" data-a="zu" aria-label="Schlie\u00dfen">\u2715</button>'
      + '  </div>'
      + '  <div class="fv-vorschau__buehne">'
      + '    <iframe class="fv-vorschau__rahmen" data-a="rahmen" title="Vorschau"></iframe>'
      + '  </div>'
      + '  <p class="fv-vorschau__hinweis">So sehen Besucher die Seite bei dieser Breite. '
      + 'Deine Werkzeuge sind hier bewusst ausgeblendet.</p>'
      + '</div>';
      document.body.appendChild(huelle);
      /* Abzeichen und schwebende Knoepfe der Seite liegen hoeher als die
         Vorschau und wuerden ueber ihr kleben. Solange sie offen ist,
         bleiben sie weg. */
      document.body.classList.add('fv-vorschau-an');

      var rahmen = huelle.querySelector('[data-a="rahmen"]');
      var anzeige = huelle.querySelector('[data-a="anzeige"]');
      rahmen.setAttribute('src', adresse());

      function setzen(breit, hoch) {
        rahmen.style.width = breit + 'px';
        rahmen.style.height = hoch + 'px';
        anzeige.textContent = breit + ' \u00d7 ' + hoch + ' px';
      }
      setzen(BREITEN[0].breit, BREITEN[0].hoch);

      huelle.querySelectorAll('.fv-vorschau__mass').forEach(function (k) {
        k.addEventListener('click', function () {
          huelle.querySelectorAll('.fv-vorschau__mass').forEach(function (x) { x.classList.remove('an'); });
          k.classList.add('an');
          setzen(parseInt(k.getAttribute('data-breit'), 10), parseInt(k.getAttribute('data-hoch'), 10));
        });
      });

      function zu() {
        if (huelle.parentNode) huelle.parentNode.removeChild(huelle);
        document.body.classList.remove('fv-vorschau-an');
        document.removeEventListener('keydown', beiTaste);
      }
      function beiTaste(e) { if (e.key === 'Escape') zu(); }
      huelle.querySelector('[data-a="zu"]').addEventListener('click', zu);
      huelle.addEventListener('click', function (e) { if (e.target === huelle) zu(); });
      document.addEventListener('keydown', beiTaste);
    }

    document.addEventListener('fv:vorschau-oeffnen', oeffnen);
  } catch (e) { /* niemals die Seite blockieren */ }
})();

/* =====================================================================
 * Abschnitte: eigene anlegen und ganze ausblenden
 * ---------------------------------------------------------------------
 * Bisher liess sich nur IN vorhandene Abschnitte etwas einsetzen, und
 * ausblenden ging nur Feld fuer Feld. Ein Bereich mit eigener
 * Ueberschrift war ohne Aenderung der HTML-Datei nicht moeglich.
 *
 *   Block y0 (je Seite)  eigene Abschnitte  [{id, titel}]
 *   Block h1 (je Seite)  ausgeblendete Abschnitte  ["kennung", ...]
 *
 * Die Ueberschrift eines eigenen Abschnitts wird NICHT ueber die
 * t-Nummerierung gefuehrt, sondern liegt im Abschnitt selbst. Sonst
 * haette jeder neue Abschnitt alle Textnummern dahinter verschoben und
 * gespeicherte Texte waeren auf falsche Felder gerutscht.
 * ===================================================================== */
(function () {
  'use strict';
  try {
    var pw = '';
    try { pw = sessionStorage.getItem('fv_admin_pw') || ''; } catch (e) {}
    var editAn = false;
    try { editAn = sessionStorage.getItem('fv_edit') === '1'; } catch (e) {}

    function seite() {
      var p = (location.pathname || '').toLowerCase();
      var datei = p.substring(p.lastIndexOf('/') + 1) || 'index.html';
      var name = datei.replace(/\.html?$/, '');
      if (!name || name === 'index') name = 'start';
      return name;
    }
    var SLUG = seite();

    /* Wo die Abschnitte haengen: auf Programmseiten im eigenen Traeger,
       sonst direkt im Hauptteil. */
    function traeger() {
      var haupt = document.querySelector('main');
      if (!haupt) return null;
      return haupt.querySelector('.program-detail__body') || haupt;
    }
    function alleAbschnitte() {
      var t = traeger(); if (!t) return [];
      return Array.prototype.slice.call(t.children).filter(function (el) {
        return el.nodeType === 1 && el.matches && el.matches('section[aria-labelledby]');
      });
    }
    function kennung(sec) {
      var eigen = sec.getAttribute('data-fv-sektion');
      return eigen ? ('eigen:' + eigen) : (sec.getAttribute('aria-labelledby') || '');
    }
    function titelVon(sec) {
      var id = sec.getAttribute('aria-labelledby');
      var h = id ? document.getElementById(id) : null;
      return h ? (h.textContent || '').replace(/\s+/g, ' ').trim() : '';
    }

    var eigene = [], verborgen = [];

    function holen(block) {
      return fetch('/api/content?page=' + encodeURIComponent(SLUG), { method: 'GET' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) {
          var w = '';
          if (res && res.items) res.items.forEach(function (it) { if (it.block === block) w = it.value || ''; });
          if (!w) return [];
          try { var a = JSON.parse(w); return Array.isArray(a) ? a : []; } catch (e) { return []; }
        }).catch(function () { return []; });
    }
    function legen(block, wert) {
      return fetch('/api/content', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: SLUG, block: block, type: 'text',
                               value: JSON.stringify(wert), password: pw })
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    }

    /* ---- Eigene Abschnitte in die Seite setzen --------------------- */
    function eigeneBauen() {
      var t = traeger(); if (!t) return;
      eigene.forEach(function (e) {
        if (!e || !e.id) return;
        if (t.querySelector('[data-fv-sektion="' + e.id + '"]')) return;
        var sec = document.createElement('section');
        sec.className = 'program-info-block fv-sektion-eigen';
        sec.setAttribute('data-fv-sektion', e.id);
        sec.setAttribute('data-fv-text-extra', '');
        var hid = 'fvsek-' + e.id;
        sec.setAttribute('aria-labelledby', hid);
        var h = document.createElement('h2');
        h.id = hid;
        h.textContent = e.titel || 'Neuer Abschnitt';
        sec.appendChild(h);
        t.appendChild(sec);
      });
    }

    /* ---- Ausblenden ------------------------------------------------ */
    function istWeg(k) { return verborgen.indexOf(k) !== -1; }
    function ausblendenAnwenden() {
      alleAbschnitte().forEach(function (sec) {
        var k = kennung(sec);
        var weg = istWeg(k);
        sec.classList.toggle('fv-sektion-weg', weg && editAn);
        if (weg && !editAn) sec.style.display = 'none';
        else sec.style.display = '';
      });
    }

    /* ---- Bedienung im Bearbeiten-Modus ----------------------------- */
    function werkzeugBauen() {
      alleAbschnitte().forEach(function (sec) {
        if (sec.querySelector(':scope > .fv-sek-leiste')) return;
        var k = kennung(sec);
        var eigen = !!sec.getAttribute('data-fv-sektion');

        var leiste = document.createElement('div');
        leiste.className = 'fv-sek-leiste';

        function knopf(zeichen, titel, tun, klasse) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'fv-sek-k' + (klasse ? ' ' + klasse : '');
          b.innerHTML = zeichen;
          b.setAttribute('title', titel);
          b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); tun(); });
          leiste.appendChild(b);
          return b;
        }

        if (istWeg(k)) {
          knopf('\u21BA wieder einblenden', 'Diesen Abschnitt wieder zeigen', function () {
            verborgen = verborgen.filter(function (x) { return x !== k; });
            legen('h1', verborgen).then(function () { ausblendenAnwenden(); werkzeugNeu(); });
          }, 'fv-sek-k--zurueck');
        } else {
          knopf('\u2715 Abschnitt ausblenden', 'Den ganzen Abschnitt f\u00fcr Besucher verbergen', function () {
            var name = titelVon(sec) || 'dieser Abschnitt';
            if (!window.confirm('Ganzen Abschnitt ausblenden?\n\n' + name
                + '\n\nBesucher sehen ihn dann nicht mehr. Du kannst ihn hier\n'
                + 'jederzeit wieder einblenden.')) return;
            verborgen.push(k);
            legen('h1', verborgen).then(function () { ausblendenAnwenden(); werkzeugNeu(); });
          });
        }

        if (eigen) {
          knopf('\u2715 Abschnitt l\u00f6schen', 'Diesen selbst angelegten Abschnitt entfernen', function () {
            var id = sec.getAttribute('data-fv-sektion');
            var name = titelVon(sec) || 'dieser Abschnitt';
            if (!window.confirm('Selbst angelegten Abschnitt l\u00f6schen?\n\n' + name
                + '\n\nDas l\u00e4sst sich nicht \u00fcber \u201ewieder einblenden\u201c zur\u00fcckholen.\n'
                + 'Felder, die darin liegen, wandern ans Seitenende.')) return;
            eigene = eigene.filter(function (x) { return x.id !== id; });
            legen('y0', eigene).then(function () { location.reload(); });
          }, 'fv-sek-k--weg');
        }

        sec.insertBefore(leiste, sec.firstChild);

        /* Ueberschrift eigener Abschnitte bearbeitbar machen - der Text
           landet im Abschnitt selbst, nicht in der t-Nummerierung. */
        if (eigen) {
          var h = sec.querySelector(':scope > h2');
          if (h && !h.hasAttribute('contenteditable')) {
            h.setAttribute('contenteditable', 'true');
            h.setAttribute('spellcheck', 'false');
            h.classList.add('fv-editable');
            var alt = h.textContent;
            h.addEventListener('blur', function () {
              var neu = (h.textContent || '').replace(/\s+/g, ' ').trim();
              if (!neu) { h.textContent = alt; return; }
              if (neu === alt) return;
              alt = neu;
              var id = sec.getAttribute('data-fv-sektion');
              eigene.forEach(function (x) { if (x.id === id) x.titel = neu; });
              legen('y0', eigene);
            });
          }
        }
      });
    }
    function werkzeugNeu() {
      Array.prototype.slice.call(document.querySelectorAll('.fv-sek-leiste'))
        .forEach(function (l) { if (l.parentNode) l.parentNode.removeChild(l); });
      werkzeugBauen();
    }

    function anlegenKnopf() {
      var t = traeger(); if (!t) return;
      if (document.querySelector('.fv-sek-neu')) return;
      var box = document.createElement('div');
      box.className = 'fv-sek-neu';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'fv-extra-add';
      b.innerHTML = '<span aria-hidden="true">+</span> Abschnitt';
      b.setAttribute('title', 'Einen neuen Bereich mit eigener \u00dcberschrift anlegen');
      b.addEventListener('click', function () {
        var titel = window.prompt('\u00dcberschrift des neuen Abschnitts:', 'Neuer Abschnitt');
        if (titel === null) return;
        titel = String(titel).replace(/\s+/g, ' ').trim();
        if (!titel) return;
        if (eigene.length >= 20) { window.alert('Mehr als zwanzig eigene Abschnitte sind zu viel.'); return; }
        eigene.push({ id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                      titel: titel });
        legen('y0', eigene).then(function () { location.reload(); });
      });
      box.appendChild(b);
      var hinweis = document.createElement('span');
      hinweis.className = 'fv-extra-add__wo';
      hinweis.textContent = 'am Seitenende \u2013 danach l\u00e4sst sich alles hineinsetzen';
      box.appendChild(hinweis);
      t.appendChild(box);
    }

    function start() {
      Promise.all([holen('y0'), holen('h1')]).then(function (a) {
        eigene = a[0].filter(function (x) { return x && typeof x.id === 'string'; });
        verborgen = a[1].filter(function (x) { return typeof x === 'string'; });
        eigeneBauen();
        ausblendenAnwenden();
        if (pw && editAn) { werkzeugBauen(); anlegenKnopf(); }
      });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  } catch (e) { /* niemals die Seite blockieren */ }
})();

/* =====================================================================
 * Vorhandene Felder verschieben
 * ---------------------------------------------------------------------
 * Bisher liessen sich nur selbst angelegte Felder bewegen. Die Felder
 * aus der HTML-Datei standen fest.
 *
 * WARUM DAS HEIKEL IST: Die Schluessel (t0, i0, s0 ...) werden nach der
 * Reihenfolge im Dokument vergeben. Wuerde man ein Feld verschieben und
 * DANACH nummerieren, bekaemen alle Felder dahinter neue Nummern - und
 * jeder gespeicherte Text saesse auf einem fremden Feld.
 *
 * DER AUSWEG: Die HTML-Datei aendert sich nie. Also erst nummerieren,
 * dann umstellen. Dieses Modul wartet auf "fv:felder-bereit" - das
 * Zeichen, dass alle Schluessel vergeben und alle Texte eingesetzt
 * sind. Was danach passiert, kann die Nummerierung nicht mehr stoeren.
 *
 * Gespeichert wird je Seite in Block z0:
 *   [{ feld: "t5", anker: "t9", wo: "vor" }, ...]
 * "anker" ist der Schluessel des Feldes, neben das es soll. Also keine
 * Pixel und keine Indizes, sondern eine Beziehung - die haelt auch,
 * wenn sich sonst etwas aendert.
 *
 * Die Umstellung gilt fuer ALLE Besucher, nicht nur im Bearbeiten-Modus.
 * ===================================================================== */
(function () {
  'use strict';
  try {
    var pw = '';
    try { pw = sessionStorage.getItem('fv_admin_pw') || ''; } catch (e) {}
    var editAn = false;
    try { editAn = sessionStorage.getItem('fv_edit') === '1'; } catch (e) {}

    function seite() {
      var p = (location.pathname || '').toLowerCase();
      var datei = p.substring(p.lastIndexOf('/') + 1) || 'index.html';
      var name = datei.replace(/\.html?$/, '');
      if (!name || name === 'index') name = 'start';
      return name;
    }
    var SLUG = seite();
    var zuege = [];

    function haupt() { return document.querySelector('main'); }
    function feldVon(k) {
      var h = haupt(); if (!h || !k) return null;
      return h.querySelector('[data-fvk="' + k + '"]');
    }

    function holen() {
      return fetch('/api/content?page=' + encodeURIComponent(SLUG), { method: 'GET' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) {
          var w = '';
          if (res && res.items) res.items.forEach(function (it) { if (it.block === 'z0') w = it.value || ''; });
          if (!w) return [];
          try { var a = JSON.parse(w); return Array.isArray(a) ? a : []; } catch (e) { return []; }
        }).catch(function () { return []; });
    }
    function legen() {
      return fetch('/api/content', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: SLUG, block: 'z0', type: 'text',
                               value: JSON.stringify(zuege), password: pw })
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    }

    /* Umstellen. Reihenfolge der Eintraege wird eingehalten - so lassen
       sich auch mehrere Felder hintereinander an dieselbe Stelle legen. */
    function anwenden() {
      zuege.forEach(function (z) {
        if (!z || !z.feld || !z.anker) return;
        var el = feldVon(z.feld), an = feldVon(z.anker);
        if (!el || !an || el === an) return;
        if (el.contains(an)) return;               // sich selbst nicht verschlucken
        if (!an.parentNode) return;
        el.setAttribute('data-fv-verschoben', '');
        if (z.wo === 'vor') an.parentNode.insertBefore(el, an);
        else an.parentNode.insertBefore(el, an.nextSibling);
      });
    }

    /* ---- Bedienung -------------------------------------------------- */
    function bedienung() {
      if (!pw || !editAn) return;
      var h = haupt(); if (!h) return;
      if (document.querySelector('.fv-zieh-feld')) return;

      var griff = document.createElement('button');
      griff.type = 'button';
      griff.className = 'fv-zieh-feld';
      griff.innerHTML = '\u2807\u2807';
      griff.setAttribute('title', 'Dieses Feld an eine andere Stelle ziehen');
      griff.style.display = 'none';
      document.body.appendChild(griff);

      var linie = document.createElement('div');
      linie.className = 'fv-zieh-linie';
      linie.style.display = 'none';
      document.body.appendChild(linie);

      var ziel = null, weg = null, zieht = null;

      function zeigen(el) {
        if (!el) { verstecken(); return; }
        var r = el.getBoundingClientRect();
        if (r.width < 12 || r.height < 10) { verstecken(); return; }
        ziel = el;
        griff.style.display = 'block';
        griff.style.top = (r.top + window.scrollY - 10) + 'px';
        griff.style.left = Math.max(4, r.left + window.scrollX - 26) + 'px';
      }
      function verstecken() {
        clearTimeout(weg);
        weg = setTimeout(function () {
          if (!zieht) { griff.style.display = 'none'; ziel = null; }
        }, 260);
      }
      document.addEventListener('mouseover', function (e) {
        if (zieht) return;
        if (!e.target || !e.target.closest) return;
        if (e.target.closest('.fv-zieh-feld') || e.target.closest('.fv-admin-bar')
            || e.target.closest('.fv-weg-btn')) { clearTimeout(weg); return; }
        var el = e.target.closest('[data-fvk]');
        if (el && haupt() && haupt().contains(el)) { clearTimeout(weg); zeigen(el); }
        else verstecken();
      });
      griff.addEventListener('mouseenter', function () { clearTimeout(weg); });

      /* Naechste Einfuegestelle zum Zeiger suchen: das Feld, dessen Mitte
         am dichtesten liegt, davor oder dahinter. */
      function stelleSuchen(x, y) {
        var h2 = haupt(); if (!h2) return null;
        var beste = null, abstand = Infinity;
        Array.prototype.slice.call(h2.querySelectorAll('[data-fvk]')).forEach(function (el) {
          if (el === zieht.el || zieht.el.contains(el)) return;
          if (el.closest('.fv-extra')) return;
          var r = el.getBoundingClientRect();
          if (r.width < 8 || r.height < 6) return;
          [['vor', r.top], ['nach', r.bottom]].forEach(function (p) {
            var d = Math.abs(y - p[1]) + Math.abs(x - (r.left + r.width / 2)) * 0.12;
            if (d < abstand) { abstand = d; beste = { el: el, wo: p[0], y: p[1], r: r }; }
          });
        });
        return beste;
      }
      function linieZeigen(s) {
        if (!s) { linie.style.display = 'none'; return; }
        linie.style.display = 'block';
        linie.style.top = (s.y + window.scrollY - 1) + 'px';
        linie.style.left = (s.r.left + window.scrollX) + 'px';
        linie.style.width = s.r.width + 'px';
      }

      function anfang(x, y) {
        if (!ziel) return;
        var k = ziel.getAttribute('data-fvk');
        if (!k) return;
        zieht = { el: ziel, key: k, stelle: null };
        ziel.classList.add('fv-feld-zieht');
        document.body.classList.add('fv-zieht');
        bewegen(x, y);
      }
      function bewegen(x, y) {
        if (!zieht) return;
        zieht.stelle = stelleSuchen(x, y);
        linieZeigen(zieht.stelle);
      }
      function ende() {
        if (!zieht) return;
        var z = zieht; zieht = null;
        linie.style.display = 'none';
        document.body.classList.remove('fv-zieht');
        if (z.el) z.el.classList.remove('fv-feld-zieht');
        if (!z.stelle) return;
        var ankerKey = z.stelle.el.getAttribute('data-fvk');
        if (!ankerKey || ankerKey === z.key) return;

        zuege = zuege.filter(function (e) { return e.feld !== z.key; });
        zuege.push({ feld: z.key, anker: ankerKey, wo: z.stelle.wo });
        if (z.stelle.wo === 'vor') z.stelle.el.parentNode.insertBefore(z.el, z.stelle.el);
        else z.stelle.el.parentNode.insertBefore(z.el, z.stelle.el.nextSibling);
        z.el.setAttribute('data-fv-verschoben', '');
        legen();
      }

      griff.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        anfang(e.clientX, e.clientY);
        function mv(ev) { ev.preventDefault(); bewegen(ev.clientX, ev.clientY); }
        function up() {
          document.removeEventListener('mousemove', mv);
          document.removeEventListener('mouseup', up);
          ende();
        }
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
      });
      griff.addEventListener('touchstart', function (e) {
        if (!e.touches || !e.touches[0]) return;
        e.preventDefault();
        anfang(e.touches[0].clientX, e.touches[0].clientY);
        function mv(ev) {
          if (!ev.touches || !ev.touches[0]) return;
          ev.preventDefault();
          bewegen(ev.touches[0].clientX, ev.touches[0].clientY);
        }
        function up() {
          griff.removeEventListener('touchmove', mv);
          griff.removeEventListener('touchend', up);
          ende();
        }
        griff.addEventListener('touchmove', mv, { passive: false });
        griff.addEventListener('touchend', up);
      }, { passive: false });

      /* Zuruecksetzen - ohne das waere ein verrutschtes Feld nur ueber
         die Datenbank zu retten. */
      document.addEventListener('fv:zuege-zuruecksetzen', function () {
        if (!zuege.length) { window.alert('Auf dieser Seite wurde nichts verschoben.'); return; }
        if (!window.confirm('Alle ' + zuege.length + ' Verschiebungen auf dieser Seite zur\u00fccksetzen?\n\n'
            + 'Die Felder stehen danach wieder dort, wo sie in der Datei stehen.')) return;
        zuege = [];
        legen().then(function () { location.reload(); });
      });
    }

    function start() {
      holen().then(function (a) {
        zuege = a.filter(function (z) { return z && typeof z.feld === 'string' && typeof z.anker === 'string'; });
        anwenden();
        bedienung();
      });
    }

    document.addEventListener('fv:felder-bereit', start);
  } catch (e) { /* niemals die Seite blockieren */ }
})();

/* =====================================================================
 * Altlasten: verwaiste Fassungsangaben
 * ---------------------------------------------------------------------
 * Eine Fassungsangabe ist nur erreichbar, wenn eine Adresse auf ihren
 * Schluessel zeigt. Zeigt nichts darauf, liest sie kein Programm mehr -
 * sie steht nur noch im Weg und taucht in jeder Sicherung auf.
 *
 * Der Server entscheidet, was verwaist ist (/api/altlasten), nicht diese
 * Seite: nur er kennt die feste Routentabelle UND die selbst angelegten
 * Routen. Geraten wird hier nichts.
 *
 * Bewusst ENG: nur Fassungsangaben ohne Route. Texte und Bilder bleiben
 * aussen vor - bei denen laesst sich nicht sicher sagen, dass sie
 * niemand mehr braucht.
 *
 * Der bisherige Stand wandert beim Entfernen in den Verlauf.
 * ===================================================================== */
(function () {
  'use strict';
  try {
    var pw = '';
    try { pw = sessionStorage.getItem('fv_admin_pw') || ''; } catch (e) {}
    var editAn = false;
    try { editAn = sessionStorage.getItem('fv_edit') === '1'; } catch (e) {}
    if (!pw || !editAn) return;
    var pfad = (location.pathname || '').toLowerCase().replace(/\.html?$/, '').replace(/\/+$/, '');
    if (pfad !== '/programme') return;

    var funde = [], erreichbar = [];

    function laden() {
      return fetch('/api/altlasten', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pw })
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (a) {
          funde = (a && a.altlasten) || [];
          erreichbar = (a && a.erreichbar) || [];
        })
        .catch(function () { funde = []; erreichbar = []; });
    }

    function bauen() {
      var ziel = document.querySelector('main');
      if (!ziel || document.querySelector('.fv-alt-box')) return;

      var box = document.createElement('section');
      box.className = 'fv-prog-box fv-alt-box';
      box.innerHTML =
        '<h3 class="fv-prog-titel">\uD83E\uDDF9 Altlasten <span>(nur f\u00fcr dich sichtbar)</span></h3>'
      + '<p class="fv-prog-hilfe">Fassungsangaben, auf die <strong>keine Adresse mehr zeigt</strong>. '
      + 'Kein Programm kann sie abfragen \u2013 sie stehen nur noch in der Datenbank und in jeder '
      + 'Sicherung. Beim Entfernen wandert der bisherige Stand in den Verlauf, du kannst ihn also '
      + 'nachlesen.</p>'
      + '<div class="fv-prog-zeile">'
      + '  <button type="button" class="fv-prog-btn" data-a="neu">Erneut suchen</button>'
      + '  <span class="fv-prog-melde"></span>'
      + '</div>'
      + '<div data-a="liste"></div>'
      + '<details class="fv-alt-details"><summary>Welche Schl\u00fcssel sind erreichbar?</summary>'
      + '<div class="fv-alt-erreichbar" data-a="erreichbar"></div></details>';
      ziel.appendChild(box);

      var liste = box.querySelector('[data-a="liste"]');
      function sagen(t, gut) {
        var m = box.querySelector('.fv-prog-melde');
        m.textContent = t;
        m.className = 'fv-prog-melde ' + (gut ? 'gut' : 'schlecht');
        if (gut) setTimeout(function () { m.textContent = ''; m.className = 'fv-prog-melde'; }, 8000);
      }

      function zeigen() {
        box.querySelector('[data-a="erreichbar"]').textContent = erreichbar.join(' \u00b7 ');
        liste.innerHTML = '';
        if (!funde.length) {
          liste.innerHTML = '<p class="fv-prog-hilfe">\u2713 Keine verwaisten Fassungsangaben. '
                          + 'Alles, was gespeichert ist, wird auch abgefragt.</p>';
          return;
        }
        funde.forEach(function (f) {
          var karte = document.createElement('div');
          karte.className = 'fv-alt-karte';
          karte.setAttribute('data-alt', f.page);
          karte.innerHTML =
            '<div class="fv-alt-kopf"><code>' + f.page + '</code>'
          + (f.versionName ? '<span class="fv-alt-fassung">Fassung ' + f.versionName
             + (f.versionCode ? ' \u00b7 ' + f.versionCode : '') + '</span>' : '')
          + '</div>'
          + '<div class="fv-alt-grund">' + f.grund + '</div>'
          + '<pre class="fv-alt-inhalt">' + String(f.vorschau || '')
              .replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>'
          + '<button type="button" class="fv-bild-weg" data-a="weg">Entfernen</button>';

          karte.querySelector('[data-a="weg"]').addEventListener('click', function () {
            if (!window.confirm('Diese verwaiste Fassungsangabe entfernen?\n\n'
                + f.page + (f.versionName ? '  \u2013  Fassung ' + f.versionName : '')
                + '\n\nAuf diesen Schl\u00fcssel zeigt keine Adresse; kein Programm fragt ihn ab.\n'
                + 'Der bisherige Stand bleibt im Verlauf nachlesbar.')) return;
            fetch('/api/altlasten/entfernen', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ password: pw, eintraege: [{ page: f.page, block: f.block }] })
            }).then(function (r) { return r.ok ? r.json() : null; })
              .then(function (a) {
                if (!a || !a.ok || !a.entfernt) { sagen('\u2717 Entfernen fehlgeschlagen.', false); return; }
                funde = funde.filter(function (x) { return x.page !== f.page; });
                zeigen();
                sagen('\u2713 ' + f.page + ' entfernt.', true);
              })
              .catch(function () { sagen('\u2717 Entfernen fehlgeschlagen.', false); });
          });

          liste.appendChild(karte);
        });
      }

      box.querySelector('[data-a="neu"]').addEventListener('click', function () {
        laden().then(function () { zeigen(); sagen('\u2713 Erneut gesucht.', true); });
      });

      laden().then(zeigen);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bauen);
    else bauen();
  } catch (e) { /* niemals die Seite blockieren */ }
})();

/* =====================================================================
 * Datenschutzseite - ERZEUGT, NICHT GESCHRIEBEN
 * ---------------------------------------------------------------------
 * Nach der FINNVELO-Vorlage vom 24.08.2026.
 *
 * Der Grundsatz: Ein von Hand getippter Datenschutztext ist am Tag der
 * Auslieferung richtig und danach nie wieder. Der bisherige Text auf
 * dieser Seite war dafuer das Muster - er stammte vom 27.05.2026 und
 * behauptete "keine Benutzerkonten, kein Kontaktformular", waehrend es
 * laengst Kommentare, einen Admin-Zugang und 25 Kanaele gab.
 *
 * Deshalb steht hier EINE Tabelle aller Stellen, an die etwas
 * hinausgeht oder wo etwas liegen bleibt. Der Text wird daraus gebaut.
 * Kommt etwas dazu, wird es hier eingetragen - und die Seite stimmt im
 * selben Moment wieder.
 *
 * Jede Zeile unten wurde am Quelltext geprueft, nicht angenommen. Wo es
 * herkommt, steht als Fundstelle dabei.
 * ===================================================================== */
(function () {
  'use strict';
  try {
    var FASSUNG = '24.08.2026';

    /* ---- Empfaenger: wohin etwas hinausgeht --------------------------
       an:  ist es gerade eingeschaltet? Abgeschaltetes bleibt STEHEN und
            wird als abgeschaltet gekennzeichnet - wegzulassen waere
            falsch, der Mensch soll sehen was es gibt und was ruht.
       ohneZutun: geschieht es ohne bewusste Handlung?                 */
    var EMPFAENGER = [
      {
        id: 'cloudflare',
        name: 'Cloudflare',
        traeger: 'Cloudflare, Inc.',
        adresse: 'finnveloprogramme.com',
        wo: 'USA (Server weltweit verteilt)',
        sendet: 'IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browserkennung',
        wann: 'bei JEDEM Aufruf dieser Seite',
        ohneZutun: true,
        an: true,
        fund: 'Die Webseite laeuft als Cloudflare Worker; jede Anfrage geht durch deren Netz.'
      },
      {
        id: 'ytimg',
        name: 'YouTube-Vorschaubild',
        traeger: 'Google LLC',
        adresse: 'i.ytimg.com',
        wo: 'USA',
        sendet: 'IP-Adresse, Kennung des Videos',
        wann: 'beim Laden einer Seite MIT Video \u2013 ohne dass du klickst',
        ohneZutun: true,
        an: true,
        fund: 'stats.js: das Standbild wird als Hintergrund gesetzt, sobald die Seite aufbaut.'
      },
      {
        id: 'youtube',
        name: 'YouTube',
        traeger: 'Google LLC',
        adresse: 'www.youtube-nocookie.com',
        wo: 'USA',
        sendet: 'IP-Adresse, Kennung des Videos, Browserkennung',
        wann: 'erst wenn du auf das Video klickst',
        ohneZutun: false,
        an: true,
        fund: 'stats.js: der Rahmen wird erst beim Klick eingesetzt (\u201eZwei-Klick-L\u00f6sung\u201c).'
      },
      {
        id: 'github',
        name: 'GitHub',
        traeger: 'GitHub, Inc. (Microsoft)',
        adresse: 'github.com',
        wo: 'USA',
        sendet: 'IP-Adresse, welche Datei du herunterl\u00e4dst',
        wann: 'erst wenn du einen Download anklickst',
        ohneZutun: false,
        an: true,
        fund: 'Alle Programmdateien liegen dort; die Webseite verlinkt nur.'
      },
      {
        id: 'paypal',
        name: 'PayPal',
        traeger: 'PayPal (Europe) S.\u00e0 r.l. et Cie, S.C.A.',
        adresse: 'www.paypal.me',
        wo: 'Luxemburg',
        sendet: 'IP-Adresse; alles Weitere geschieht dort, nicht hier',
        wann: 'erst wenn du auf den Spendenknopf klickst',
        ohneZutun: false,
        an: true,
        fund: 'Spendenknopf auf einzelnen Programmseiten.'
      }
    ];

    /* ---- Was auf dem Gerät bleibt ---------------------------------- */
    var LOKAL = [
      { was: 'Merker \u201eschon gez\u00e4hlt\u201c', wo: 'localStorage',
        zweck: 'damit derselbe Browser nicht mehrfach als Besucher z\u00e4hlt',
        inhalt: 'nur eine 1 \u2013 keine Kennung, kein Zeitpunkt' },
      { was: 'Lage des Besucher-Schilds', wo: 'localStorage',
        zweck: 'merkt sich, wohin du das Schild geschoben hast',
        inhalt: 'zwei Zahlen' },
      { was: 'Zeitpunkt zuletzt gesehener Kommentare', wo: 'localStorage',
        zweck: 'zeigt an, was seit deinem letzten Besuch neu ist',
        inhalt: 'ein Zeitstempel' },
      { was: 'Admin-Passwort', wo: 'sessionStorage',
        zweck: 'nur f\u00fcr den Betreiber; wird beim Schlie\u00dfen des Fensters gel\u00f6scht',
        inhalt: 'nur beim Betreiber vorhanden, nie bei Besuchern' }
    ];

    /* ---- Was auf dem Server liegt ---------------------------------- */
    var SERVER = [
      { was: 'Z\u00e4hlerst\u00e4nde', inhalt: 'nur Zahlen je Seite \u2013 keine Zuordnung zu Personen',
        dauer: 'dauerhaft' },
      { was: 'Kommentare', inhalt: 'der Text und der Name, den du selbst eintr\u00e4gst (darf leer bleiben)',
        dauer: 'bis sie entfernt werden' },
      { was: 'Seiteninhalte', inhalt: 'Texte und Bilder, die der Betreiber eintr\u00e4gt',
        dauer: 'dauerhaft' },
      { was: 'Kan\u00e4le (Listen und Chat)', inhalt: 'VERSCHL\u00dcSSELTE Pakete \u2013 der Server kann sie nicht lesen',
        dauer: 'bis der Kanal gel\u00f6scht wird' },
      { was: 'Fehlversuche bei der Kanal-Anmeldung',
        inhalt: 'die IP-ADRESSE im Klartext, als Sperre gegen Durchprobieren',
        dauer: 'bis zur n\u00e4chsten erfolgreichen Anmeldung' }
    ];

    /* ---- Was nie \u00fcbertragen wird -------------------------------- */
    var NIEMALS = [
      'Der Inhalt deiner Listen und Nachrichten \u2013 der ist verschl\u00fcsselt, bevor er den Server erreicht.',
      'Deine E-Mail-Adresse \u2013 es gibt kein Anmeldeformular und keinen Newsletter.',
      'Dein Name, au\u00dfer du schreibst ihn selbst in einen Kommentar.',
      'Dein Verhalten auf der Seite \u2013 es gibt keine Analysewerkzeuge, keine Werbung, keine Z\u00e4hlpixel.',
      'Dein Standort \u2013 er wird nicht abgefragt.'
    ];

    /* ---- Was du selbst in der Hand hast ---------------------------- */
    var SCHALTER = [
      { was: 'Videos', wie: 'Das Video l\u00e4dt erst, wenn du es anklickst. Das Standbild kommt allerdings '
             + 'schon vorher von Google \u2013 wenn du das nicht willst, blockiere <code>i.ytimg.com</code> '
             + 'in deinem Browser.' },
      { was: 'Besucherz\u00e4hlung', wie: 'L\u00f6sche die Daten dieser Webseite in deinem Browser, dann ist '
             + 'der Merker weg. Ohne JavaScript wird gar nicht gez\u00e4hlt.' },
      { was: 'Kommentare', wie: 'Den Namen kannst du weglassen. Zum Entfernen eines Kommentars gen\u00fcgt '
             + 'eine kurze Nachricht \u00fcber die Kontaktseite.' },
      { was: 'Downloads', wie: 'Sie f\u00fchren zu GitHub. Wer das vermeiden will, l\u00e4dt dort nicht herunter.' }
    ];

    /* ================================================================= */
    function sicher(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function zeile(was, wert) {
      return '<div class="ds-zeile"><div class="ds-was">' + was
           + '</div><div class="ds-wert">' + wert + '</div></div>';
    }
    function gruppe(titel, innen) {
      return '<section class="ds-gruppe"><h2>' + sicher(titel) + '</h2>' + innen + '</section>';
    }
    function absatz(t) { return '<p class="ds-text">' + t + '</p>'; }

    function malen() {
      var ziel = document.querySelector('[data-fv-datenschutz]');
      if (!ziel) return;

      var aktive = EMPFAENGER.filter(function (e) { return e.an; });
      var draussen = aktive.filter(function (e) { return e.wo.indexOf('Deutschland') === -1; });
      var ohneZutun = EMPFAENGER.filter(function (e) { return e.an && e.ohneZutun; });
      var aufKlick = EMPFAENGER.filter(function (e) { return e.an && !e.ohneZutun; });

      var h = '';

      /* 1 - Kurz gesagt */
      h += gruppe('1 \u00b7 Kurz gesagt',
          absatz('Diese Webseite setzt <strong>keine Cookies</strong>, benutzt keine Analysewerkzeuge, '
               + 'zeigt keine Werbung und verlangt von dir keine Anmeldung. Gez\u00e4hlt wird nur, '
               + '<em>wie viele</em> Besucher da waren \u2013 nicht, wer.')
        + absatz('Es gibt aber sehr wohl einen <strong>Server</strong>: Die Seite l\u00e4uft bei Cloudflare, '
               + 'und dort liegen die Seiteninhalte, die Kommentare, die Z\u00e4hlerst\u00e4nde und die '
               + 'verschl\u00fcsselten Daten der Listen- und Chat-Kan\u00e4le. Bei jedem Aufruf geht deine '
               + 'IP-Adresse dorthin \u2013 das l\u00e4sst sich technisch nicht vermeiden.')
        + absatz('Wenn du eine Seite mit Video \u00f6ffnest, l\u00e4dt <strong>ohne dein Zutun</strong> ein '
               + 'Vorschaubild von Google. Das Video selbst startet erst auf Klick.'));

      /* 2 - Was auf dem Ger\u00e4t bleibt */
      var l = absatz('Diese Seite legt vier Dinge im Speicher deines Browsers ab. Alle vier lassen sich '
                   + 'l\u00f6schen, indem du die Daten dieser Webseite im Browser entfernst.');
      LOKAL.forEach(function (x) {
        l += zeile(sicher(x.was) + '<br><span class="ds-klein">' + sicher(x.wo) + '</span>',
                   sicher(x.zweck) + '<br><span class="ds-klein">Inhalt: ' + sicher(x.inhalt) + '</span>');
      });
      h += gruppe('2 \u00b7 Was auf dem Ger\u00e4t bleibt', l);

      /* 3 - Was das Ger\u00e4t verl\u00e4sst */
      var e = absatz('Je Empf\u00e4nger eine Zeile. \u00dcbertragen wird immer auch \u2013 wie bei jedem Aufruf '
                   + 'im Netz \u2013 deine <strong>IP-Adresse</strong>. Empf\u00e4nger au\u00dferhalb Deutschlands '
                   + 'sind ausdr\u00fccklich als solche genannt.');
      EMPFAENGER.forEach(function (x) {
        e += zeile(sicher(x.name) + (x.an ? '' : ' <span class="ds-aus">(abgeschaltet)</span>')
                 + '<br><span class="ds-klein">' + sicher(x.traeger) + '</span>',
                   sicher(x.sendet) + '<br><span class="ds-klein">'
                 + sicher(x.adresse) + ' \u00b7 ' + sicher(x.wo) + ' \u00b7 ' + sicher(x.wann)
                 + '</span>');
      });
      h += gruppe('3 \u00b7 Was das Ger\u00e4t verl\u00e4sst', e);

      /* 4 - Auch ohne dein Zutun */
      var o = absatz('Das Heikelste und am h\u00e4ufigsten Vergessene: Was passiert, <strong>ohne</strong> '
                   + 'dass du etwas anklickst.');
      ohneZutun.forEach(function (x) {
        o += zeile(sicher(x.name), sicher(x.wann) + '<br><span class="ds-klein">'
                 + sicher(x.adresse) + ' \u00b7 ' + sicher(x.wo) + '</span>');
      });
      o += absatz('Zum Vergleich \u2013 diese Stellen werden <strong>erst auf Klick</strong> angesprochen: '
                + aufKlick.map(function (x) { return sicher(x.name); }).join(', ') + '.');
      h += gruppe('4 \u00b7 Auch ohne dein Zutun', o);

      /* 5 - Was auf dem Server liegt */
      var s = absatz('Was in der Datenbank bei Cloudflare gespeichert wird.');
      SERVER.forEach(function (x) {
        s += zeile(sicher(x.was), sicher(x.inhalt) + '<br><span class="ds-klein">Bleibt: '
                 + sicher(x.dauer) + '</span>');
      });
      s += absatz('<strong>Zur letzten Zeile:</strong> Wer sich bei einem Kanal mit falschem Kennwort '
                + 'anmeldet, dessen IP-Adresse wird im Klartext vermerkt, damit ein Durchprobieren '
                + 'gebremst werden kann. Nach der n\u00e4chsten richtigen Anmeldung wird der Eintrag '
                + 'gel\u00f6scht. Bei Kommentaren ist es anders geregelt: dort wird die IP-Adresse '
                + '<em>gehasht</em> und nur im Arbeitsspeicher gehalten, nicht gespeichert.');
      h += gruppe('5 \u00b7 Was auf dem Server liegt', s);

      /* 6 - Was nie \u00fcbertragen wird */
      var n = '<ul class="ds-liste">';
      NIEMALS.forEach(function (x) { n += '<li>' + x + '</li>'; });
      n += '</ul>';
      h += gruppe('6 \u00b7 Was nie \u00fcbertragen wird', n);

      /* 7 - Was du selbst in der Hand hast */
      var w = '';
      SCHALTER.forEach(function (x) { w += zeile(sicher(x.was), x.wie); });
      h += gruppe('7 \u00b7 Was du selbst in der Hand hast', w);

      /* 8 - Stand */
      h += gruppe('8 \u00b7 Stand',
          absatz('Fassung ' + FASSUNG + ' \u00b7 <strong>' + aktive.length + ' von '
               + EMPFAENGER.length + '</strong> Empf\u00e4ngern angeschaltet, davon <strong>'
               + draussen.length + '</strong> au\u00dferhalb Deutschlands, davon <strong>'
               + ohneZutun.length + '</strong> ohne dein Zutun.')
        + absatz('Diese Seite wird aus dem Verzeichnis der Empf\u00e4nger <strong>erzeugt</strong>, nicht '
               + 'von Hand geschrieben. Kommt eine Stelle dazu oder f\u00e4llt eine weg, steht es hier '
               + 'sofort richtig \u2013 genau darum wird der Text nicht gepflegt, sondern gebaut.')
        + absatz('<strong>Das ist eine ehrliche Auskunft, keine Datenschutzerkl\u00e4rung im Rechtssinn.</strong> '
               + 'F\u00fcr eine solche fehlen Rechtsgrundlagen je Verarbeitung, Speicherdauern, '
               + 'Betroffenenrechte, das Beschwerderecht bei der Aufsichtsbeh\u00f6rde und Angaben zur '
               + '\u00dcbermittlung in Drittl\u00e4nder. Verantwortlicher und ladungsf\u00e4hige Anschrift '
               + 'stehen im <a href="/impressum">Impressum</a>.'));

      ziel.innerHTML = h;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', malen);
    else malen();
  } catch (e) { /* niemals die Seite blockieren */ }
})();

/* =====================================================================
 * Werkzeug ansteuern
 * ---------------------------------------------------------------------
 * Das Werkzeug-Menue schickt einen mit #werkzeug=<klasse> auf die
 * Programme-Seite. Die Kaesten werden erst nachtraeglich gebaut - also
 * warten, bis der gesuchte da ist, dann hinrollen und kurz hervorheben.
 * Ohne das Hervorheben landet man mitten in neun aehnlichen Kaesten und
 * sucht weiter.
 * ===================================================================== */
(function () {
  'use strict';
  try {
    var treffer = /(?:^|[#&])werkzeug=([a-z0-9-]+)/.exec(location.hash || '');
    if (!treffer) return;
    var klasse = treffer[1];
    var versuche = 0;

    function suchen() {
      var el = document.querySelector('.' + klasse);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('fv-werkzeug-treffer');
        setTimeout(function () { el.classList.remove('fv-werkzeug-treffer'); }, 2600);
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
        return;
      }
      if (++versuche > 40) return;            // nach ~8 Sekunden aufgeben
      setTimeout(suchen, 200);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', suchen);
    else suchen();
  } catch (e) { /* niemals die Seite blockieren */ }
})();
