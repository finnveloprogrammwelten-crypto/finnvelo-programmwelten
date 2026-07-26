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
  var PROGRAM_PAGES = ['command-control', 'archivar', 'aufgabenplaner', 'finanzmanager', 'medienstudio', 'haus-und-gartenplaner', 'mischwaldrechner', 'tester'];

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
      badgeEl.innerHTML =
        '<span>\uD83D\uDC41\uFE0F Besucher gesamt: <b>' + fmt(counts['views:site']) + '</b></span>'
        + '<span class="fv-sep">\u00b7</span>'
        + '<span>\uD83C\uDFE1 Planer: <b>' + fmt(counts['open:planer']) + '</b></span>'
        + '<span class="fv-sep">\u00b7</span>'
        + '<span>\uD83C\uDF32 Mischwald: <b>' + fmt(counts['open:mischwald']) + '</b></span>';
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
      keysToShow = ['views:site', 'open:planer', 'open:mischwald'];
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
    var ADMIN = !!adminPw();
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
        if (el.hasAttribute('data-fv-nav-dyn')) return;   // aus der Liste gepflegt
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
      btn.setAttribute('title', 'Dieses Element ausblenden');
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
        var el = e.target.closest('[data-fvk]');
        if (el && !el.closest('.site-header') && !el.closest('footer')) { clearTimeout(weg); zeigen(el); }
        else verstecken();
      });
      btn.addEventListener('mouseenter', function () { clearTimeout(weg); });
      btn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (!ziel) return;
        var key = ziel.getAttribute('data-fvk');
        if (!key || istVersteckt(key)) return;
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
      }).catch(function () {});
    }

    function flash(el, ok) {
      el.classList.remove('fv-saving');
      el.classList.add(ok ? 'fv-saved' : 'fv-error');
      setTimeout(function () { el.classList.remove('fv-saved', 'fv-error'); }, 1200);
    }

    /* ---- Texte bearbeiten (Body + Navigation) ------------------------- */
    function editableText(el, page) {
      el.setAttribute('contenteditable', 'true');
      el.classList.add('fv-editable');
      el.setAttribute('spellcheck', 'false');
      // Sitzt der Text in einem Link (Kachel, Navigation), darf der Klick zum
      // Bearbeiten die Seite NICHT oeffnen.
      if (el.matches('a') || el.closest('a')) {
        el.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); });
      }
      var orig = el.innerHTML;
      el.addEventListener('blur', function () {
        var v = el.innerHTML;
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
        var orig = el.innerHTML;
        el.addEventListener('focus', function () { el.classList.remove('fv-status-empty'); });
        el.addEventListener('blur', function () {
          var v = el.innerHTML;
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
        var mime = (file.type === 'image/png' && w * h < 360000) ? 'image/png' : 'image/jpeg';
        try { cb(c.toDataURL(mime, 0.85), mime); } catch (e) { cb(null); }
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

    /* ---- Download-/Aktions-Links (Ziel-URL) --------------------------- */
    /* Knoepfe: Beschriftung direkt bearbeiten, Ziel ueber das Ketten-Symbol.
       So laesst sich beides getrennt aendern, ohne sich in die Quere zu kommen. */
    function zielAendern(el, key, fertig) {
      var cur = el.getAttribute('href') || '';
      var u = window.prompt('Wohin soll der Knopf f\u00fchren?\n\n'
        + 'Vollst\u00e4ndige Adresse (https://\u2026) oder ein Pfad auf dieser Seite (/programme):', cur);
      if (u === null) return;
      u = String(u).trim();
      if (u && !/^(https?:\/\/|\/)/i.test(u)) {
        window.alert('Bitte eine vollst\u00e4ndige Adresse mit https:// eingeben \u2013 '
          + 'oder einen Pfad dieser Seite, der mit / beginnt.');
        return;
      }
      el.classList.add('fv-saving');
      if (typeof fertig === 'function') { fertig(u, el); return; }
      save(key, 'link', u).then(function (ok) {
        if (ok && u) el.setAttribute('href', u);
        flash(el, ok);
      });
    }

    function enableLinks(els) {
      els.forEach(function (el) {
        el.classList.add('fv-editable-link');
        el.setAttribute('title', 'Beschriftung anklicken zum \u00c4ndern \u2013 Kettensymbol f\u00fcr das Ziel');

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

        // b) Ziel aendern
        if (!el.parentNode || el.parentNode.querySelector('.fv-ziel-btn[data-fuer="' + el.getAttribute('data-fvk') + '"]')) return;
        var zb = document.createElement('button');
        zb.type = 'button';
        zb.className = 'fv-ziel-btn';
        zb.setAttribute('data-fuer', el.getAttribute('data-fvk'));
        zb.innerHTML = '\uD83D\uDD17 Ziel';
        zb.setAttribute('title', 'Wohin der Knopf f\u00fchrt');
        zb.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          zielAendern(el, el.getAttribute('data-fvk'));
        });
        el.parentNode.insertBefore(zb, el.nextSibling);
      });
    }

    /* ---- Planer/HTML-App hochladen (Startknopf oeffnet die Datei) ------
     * Der Admin laedt EINE in sich geschlossene HTML-Datei hoch. Sie wird auf
     * dem Server gespeichert (/api/app/<slug>) und der Startknopf zeigt darauf.
     * Fuer ALLE Besucher oeffnet der Knopf dann diese Datei.
     * ------------------------------------------------------------------- */
    function uploadApp(appSlug, html) {
      return fetch(API + '/app', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: adminPw(), slug: appSlug, html: html })
      }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }
    function enableAppUpload() {
      var root = editRoot(); if (!root) return;
      var btn = root.querySelector('.program-launch a.button, .program-launch__btn');
      if (!btn || document.querySelector('.fv-app-edit')) return;
      var action = btn.closest('.program-launch__action') || btn.parentNode;
      var bar = document.createElement('div');
      bar.className = 'fv-app-edit';
      var up = document.createElement('button');
      up.type = 'button'; up.className = 'fv-app-btn';
      up.innerHTML = '\uD83C\uDF10 Web-App (HTML-Datei) hochladen';
      var status = document.createElement('span');
      status.className = 'fv-app-status';
      status.textContent = 'Eine in sich geschlossene .html-Datei \u2013 der Knopf oeffnet sie danach.';
      up.addEventListener('click', function () {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.html,.htm,text/html';
        inp.onchange = function () {
          var f = inp.files && inp.files[0]; if (!f) return;
          if (f.size > 6 * 1024 * 1024) {
            window.alert('Die Datei ist gr\u00f6\u00dfer als 6 MB. Bitte eine kleinere, in sich geschlossene HTML-Datei verwenden \u2013 oder die Ordner-Methode (Datei in planer/haus-und-gartenplaner/ ablegen und ver\u00f6ffentlichen).');
            return;
          }
          var reader = new FileReader();
          reader.onload = function () {
            var html = String(reader.result || '');
            status.textContent = 'Wird hochgeladen \u2026';
            btn.classList.add('fv-saving');
            uploadApp(SLUG, html).then(function (res) {
              btn.classList.remove('fv-saving');
              if (res && res.url) {
                btn.setAttribute('href', res.url);
                var fvk = btn.getAttribute('data-fvk');
                if (fvk) save(fvk, 'link', res.url);
                status.textContent = '\u2713 Hochgeladen \u2013 der Knopf \u00f6ffnet jetzt deine Web-App.';
                flash(btn, true);
              } else {
                status.textContent = '\u2717 Fehlgeschlagen (zu gro\u00df, oder Server noch nicht aktualisiert?).';
                flash(btn, false);
              }
            });
          };
          reader.onerror = function () { status.textContent = '\u2717 Datei konnte nicht gelesen werden.'; };
          reader.readAsText(f);
        };
        inp.click();
      });
      bar.appendChild(up); bar.appendChild(status);
      action.appendChild(bar);
    }

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
        ziel: typeof b.ziel === 'string' ? b.ziel : ''
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

              var zb = document.createElement('button');
              zb.type = 'button';
              zb.className = 'fv-ziel-btn';
              zb.innerHTML = '\uD83D\uDD17 Ziel';
              zb.setAttribute('title', 'Wohin der Knopf f\u00fchrt');
              (function (knopf, nr) {
                zb.addEventListener('click', function (e) {
                  e.preventDefault(); e.stopPropagation();
                  zielAendern(knopf, null, function (u) {
                    customBlocks[nr].url = u;
                    saveCustom().then(function (ok) { flash(knopf, ok); renderCustom(); });
                  });
                });
              })(a, idx);
              wrap.appendChild(zb);
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
              saveCustom().then(renderCustom);
            });
            leiste.appendChild(zSel);

            knopf('\u2715', 'Feld entfernen', function () {
              if (!window.confirm('Dieses Feld wirklich entfernen?')) return;
              customBlocks.splice(idx, 1);
              saveCustom().then(renderCustom);
            });
            leiste.querySelector('.fv-extra__k:last-child').classList.add('fv-extra__k--weg');

            wrap.appendChild(leiste);
          }

          z.appendChild(wrap);
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
      var right = '<button type="button" class="fv-admin-btn fv-admin-logout">Abmelden</button>';
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
    }

    /* ---- Ablauf -------------------------------------------------------- */
    function run() {
      var k = keyed();
      applyOverrides(k).then(function () {
        if (ADMIN) toolbar();
        if (EDITING) {
          enableText(k.t, SLUG);
          enableNav(k.n);
          enableImages(k.i);
          enableStatus(k.s);
          enableLinks(k.d);
          enableAppUpload();
          enableVideo();
          enableSortable();
          // renderCustom() lief bereits in applyOverrides (inkl. Bearbeiten-Affordances)
        }
      });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
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
 * App-Aktualisierung im Bearbeiten-Modus pflegen (mehrere Apps)
 * Die Android-Apps fragen beim Start ihre version.json ab. Dieses Feld
 * schreibt genau diese Datei - ohne die Webseite neu zu veroeffentlichen.
 * Erscheint nur als Admin mit Bearbeiten: AN, auf der jeweiligen
 * Programmseite. Eigenstaendig gekapselt: faellt aus, ohne die Seite zu
 * stoeren.
 * ===================================================================== */
(function () {
  'use strict';
  try {
    // Pro App: wo das Feld erscheint (seite), wo gespeichert wird (ablage),
    // welche Adresse die App abfragt (pruef), welche Felder es gibt und welche
    // festen Werte immer mitgeschrieben werden (fest).
    var APPS = [
      {
        seite: 'mischwaldrechner',
        ablage: 'mischwald',
        pruef: '/mischwaldrechner/version.json',
        titel: 'Mischwaldrechner',
        felder: [
          { key: 'versionName', label: 'Versionsnummer', typ: 'text', ph: 'z. B. 1.0.2', auch: ['version'] },
          { key: 'versionCode', label: 'Versions-Code (Zahl)', typ: 'zahl', ph: 'z. B. 2' },
          { key: 'download', label: 'Download-Adresse der APK', typ: 'url', ph: 'https://github.com/.../Mischwald.apk' },
          { key: 'hinweis', label: 'Was ist neu (kurzer Hinweis)', typ: 'text', ph: 'z. B. Kartenerkennung verbessert' }
        ],
        fest: {},
        vorgabe: { versionCode: 1, versionName: '1.0.0', version: '1.0.0', download: 'https://github.com/finnveloprogrammwelten-crypto/finnvelo-programmwelten/releases/download/FinnveloMischwaldrechner/Mischwald.apk', hinweis: '' }
      },
      {
        seite: 'aufgabenplaner',
        ablage: 'aufgabenplaner',
        pruef: '/FinnVelo/Aufgabenplaner/version.json',
        titel: 'Aufgabenplaner',
        felder: [
          { key: 'versionName', label: 'Versionsnummer (muss zum APK-Namen passen)', typ: 'text', ph: 'z. B. 3.2' },
          { key: 'versionCode', label: 'Versions-Code (Zahl)', typ: 'zahl', ph: 'z. B. 32' },
          { key: 'apk', label: 'Download-Adresse der APK (GitHub)', typ: 'url', ph: 'https://github.com/.../FINNVELO-Aufgabenplaner-3.2.apk' },
          { key: 'hinweise', label: 'Was ist neu (kurzer Hinweis)', typ: 'text', ph: 'z. B. Erinnerungen verbessert' }
        ],
        fest: { schluessel: 'FINNVELO-AUFGABENPLANER' },
        vorgabe: {
          schluessel: 'FINNVELO-AUFGABENPLANER', versionCode: 32, versionName: '3.2',
          apk: 'https://github.com/finnveloprogrammwelten-crypto/finnvelo-programmwelten/releases/download/FinnveloAufgabenplaner/FINNVELO-Aufgabenplaner-3.2.apk',
          hinweise: 'Bearbeitungsmaske repariert und mit Klappbereichen: Titel, Notiz, Stand offen - Wann, Prioritaet, Erinnerungen und Co als Dropdown mit Zusammenfassung'
        }
      }
    ];

    var pw = '';
    try { pw = sessionStorage.getItem('fv_admin_pw') || ''; } catch (e) {}
    var editAn = false;
    try { editAn = sessionStorage.getItem('fv_edit') === '1'; } catch (e) {}
    if (!pw || !editAn) return;

    var pfad = (location.pathname || '').toLowerCase().replace(/\.html?$/, '').replace(/\/+$/, '');
    var cfg = null;
    for (var i = 0; i < APPS.length; i++) {
      if (pfad.indexOf(APPS[i].seite) !== -1) { cfg = APPS[i]; break; }
    }
    if (!cfg) return;

    function laden() {
      return fetch('/api/content?page=' + encodeURIComponent(cfg.ablage), { method: 'GET' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) {
          var roh = '';
          if (res && res.items) res.items.forEach(function (it) { if (it.block === 'u0') roh = it.value || ''; });
          if (!roh) return copy(cfg.vorgabe);
          try { return JSON.parse(roh); } catch (e) { return copy(cfg.vorgabe); }
        })
        .catch(function () { return copy(cfg.vorgabe); });
    }
    function copy(o) { var r = {}; for (var k in o) if (o.hasOwnProperty(k)) r[k] = o[k]; return r; }

    function speichern(obj) {
      return fetch('/api/content', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: cfg.ablage, block: 'u0', type: 'text', value: JSON.stringify(obj, null, 2), password: pw })
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    }

    function bauen(daten) {
      var ziel = document.querySelector('.program-download-block') || document.querySelector('main');
      if (!ziel || document.querySelector('.fv-update-box')) return;

      var box = document.createElement('div');
      box.className = 'fv-update-box';
      var felderHtml = '';
      cfg.felder.forEach(function (f) {
        var inTyp = (f.typ === 'zahl') ? 'number' : 'text';
        var extra = (f.typ === 'zahl') ? ' min="1" step="1"' : '';
        felderHtml += '<label>' + f.label + '<input type="' + inTyp + '"' + extra
                    + ' data-key="' + f.key + '" placeholder="' + f.ph + '"></label>';
      });

      box.innerHTML =
        '<h3 class="fv-update-titel">\u2699\uFE0F App-Aktualisierung \u2013 ' + cfg.titel + ' <span>(nur f\u00fcr dich sichtbar)</span></h3>'
      + '<p class="fv-update-hilfe">Die App fragt beim Start <code>' + cfg.pruef + '</code> ab. '
      + 'Trage hier die neue Fassung ein \u2013 die App bietet das Update dann an. '
      + 'Die Webseite muss daf\u00fcr <strong>nicht</strong> neu ver\u00f6ffentlicht werden.</p>'
      + '<div class="fv-update-felder">' + felderHtml + '</div>'
      + '<div class="fv-update-zeile">'
      + '  <button type="button" class="fv-update-btn" data-a="save">Speichern</button>'
      + '  <a class="fv-update-link" href="' + cfg.pruef + '" target="_blank" rel="noopener">Datei ansehen</a>'
      + '  <button type="button" class="fv-update-mehr" data-a="mehr">JSON direkt bearbeiten</button>'
      + '  <span class="fv-update-melde" data-a="melde"></span>'
      + '</div>'
      + '<textarea class="fv-update-roh" data-a="roh" spellcheck="false" hidden></textarea>'
      + '<p class="fv-update-warn">Wichtig: Der <strong>Versions-Code</strong> muss bei jeder neuen Fassung '
      + 'gr\u00f6\u00dfer sein als vorher \u2013 daran erkennt die App, dass es etwas Neues gibt.</p>';
      ziel.appendChild(box);

      var roh = box.querySelector('[data-a="roh"]');
      var melde = box.querySelector('[data-a="melde"]');

      function ausFeldern() {
        var o = copy(cfg.fest);
        cfg.felder.forEach(function (f) {
          var el = box.querySelector('[data-key="' + f.key + '"]');
          var v = (el.value || '').trim();
          if (f.typ === 'zahl') v = parseInt(v, 10) || 0;
          o[f.key] = v;
          if (f.auch) f.auch.forEach(function (k2) { o[k2] = v; });
        });
        return o;
      }
      function inFelder(o) {
        cfg.felder.forEach(function (f) {
          var el = box.querySelector('[data-key="' + f.key + '"]');
          el.value = (o[f.key] === undefined || o[f.key] === null) ? '' : o[f.key];
        });
        roh.value = JSON.stringify(mischKomplett(o), null, 2);
      }
      function mischKomplett(o) {
        // sichert, dass feste Felder immer enthalten sind
        var r = copy(cfg.fest);
        for (var k in o) if (o.hasOwnProperty(k)) r[k] = o[k];
        return r;
      }
      inFelder(daten);

      function sagen(text, gut) {
        melde.textContent = text;
        melde.className = 'fv-update-melde ' + (gut ? 'gut' : 'schlecht');
        setTimeout(function () { melde.textContent = ''; melde.className = 'fv-update-melde'; }, 4500);
      }

      box.querySelector('[data-a="mehr"]').addEventListener('click', function () {
        if (roh.hidden) { roh.value = JSON.stringify(ausFeldern(), null, 2); roh.hidden = false; }
        else { roh.hidden = true; }
      });

      box.querySelector('[data-a="save"]').addEventListener('click', function () {
        var obj;
        if (!roh.hidden) {
          try { obj = JSON.parse(roh.value); }
          catch (e) { sagen('\u2717 Das ist kein g\u00fcltiges JSON.', false); return; }
          obj = mischKomplett(obj);
        } else {
          obj = ausFeldern();
        }
        if (!obj.versionCode || obj.versionCode < 1) { sagen('\u2717 Versions-Code fehlt.', false); return; }
        var urlWert = obj.apk || obj.download || '';
        if (urlWert && !/^https?:\/\//i.test(urlWert)) {
          sagen('\u2717 Die Download-Adresse muss mit https:// beginnen.', false); return;
        }
        speichern(obj).then(function (ok) {
          if (ok) { inFelder(obj); sagen('\u2713 Gespeichert \u2013 die App sieht die neue Fassung sofort.', true); }
          else { sagen('\u2717 Speichern fehlgeschlagen.', false); }
        });
      });
    }

    function start() { laden().then(bauen); }
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
    if (pfad !== '/programme') return;

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

    function bauen(liste) {
      var ziel = document.querySelector('main');
      if (!ziel || document.querySelector('.fv-prog-box')) return;

      var box = document.createElement('section');
      box.className = 'fv-prog-box';
      box.innerHTML =
        '<h3 class="fv-prog-titel">\u2699\uFE0F Programme verwalten <span>(nur f\u00fcr dich sichtbar)</span></h3>'
      + '<p class="fv-prog-hilfe">Hier legst du ein neues Programm an. Es bekommt sofort eine eigene Seite, '
      + 'eine Kachel auf der Startseite und eine Zeile in dieser Liste \u2013 <strong>ohne Ver\u00f6ffentlichen</strong>. '
      + 'Texte, Bilder und Download-Knopf danach ganz normal im Bearbeiten-Modus \u00e4ndern.</p>'
      + '<div class="fv-prog-felder">'
      + '  <label>Name des Programms<input type="text" id="fvPName" placeholder="z. B. Finnvelo Notizbuch"></label>'
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
                      + '<a href="/' + p.slug + '" target="_blank" rel="noopener">/' + p.slug + '</a>';
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
        senden({ aktion: 'anlegen', slug: slug, name: name, kurz: (nKurz.value || '').trim() })
          .then(function (a) {
            if (a.ok) {
              listeZeigen(a.daten.programme || []);
              nName.value = ''; nSlug.value = ''; nKurz.value = ''; slugManuell = false;
              sagen('\u2713 Angelegt! Die Seite ist unter /' + slug + ' erreichbar. Seite neu laden, damit die Kachel erscheint.', true);
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

    function start() { laden().then(bauen); }
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
 * Sicherung: alle Inhalte herunterladen und wieder einspielen
 * Schuetzt alles, was ueber den Bearbeiten-Modus eingetragen wurde -
 * das steht sonst nur in der Datenbank und nirgends sonst.
 * ===================================================================== */
(function () {
  'use strict';
  try {
    var pw = '';
    try { pw = sessionStorage.getItem('fv_admin_pw') || ''; } catch (e) {}
    if (!pw) return;

    function bauen() {
      var ziel = document.querySelector('main');
      if (!ziel || document.querySelector('.fv-sich-box')) return;
      var editAn = false;
      try { editAn = sessionStorage.getItem('fv_edit') === '1'; } catch (e) {}
      if (!editAn) return;
      var pfad = (location.pathname || '').toLowerCase().replace(/\.html?$/, '').replace(/\/+$/, '');
      if (pfad !== '/programme') return;   // ein fester Ort genuegt

      var box = document.createElement('section');
      box.className = 'fv-prog-box fv-sich-box';
      box.innerHTML =
        '<h3 class="fv-prog-titel">\uD83D\uDCBE Sicherung <span>(nur f\u00fcr dich sichtbar)</span></h3>'
      + '<p class="fv-prog-hilfe">Alles, was du im Bearbeiten-Modus eintr\u00e4gst \u2013 Texte, Bilder, '
      + 'Zusatzfelder, ausgeblendete Elemente, App-Versionen, angelegte Programme \u2013 liegt nur in der '
      + 'Datenbank auf dem Server. In den Dateien steht nur der Ursprungstext. '
      + '<strong>Lade dir ab und zu eine Sicherung herunter</strong>, am besten nach gr\u00f6\u00dferen \u00c4nderungen.</p>'
      + '<div class="fv-prog-zeile">'
      + '  <button type="button" class="fv-prog-btn" id="fvSDown">Sicherung herunterladen</button>'
      + '  <button type="button" class="fv-prog-weg" id="fvSUp" style="margin-left:0">Sicherung einspielen</button>'
      + '  <span class="fv-prog-melde" id="fvSMelde"></span>'
      + '</div>';
      ziel.appendChild(box);

      var melde = box.querySelector('#fvSMelde');
      function sagen(t, gut) {
        melde.textContent = t;
        melde.className = 'fv-prog-melde ' + (gut ? 'gut' : 'schlecht');
        if (gut) setTimeout(function () { melde.textContent = ''; }, 8000);
      }

      box.querySelector('#fvSDown').addEventListener('click', function () {
        sagen('Wird erstellt \u2026', true);
        fetch('/api/export', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password: pw })
        }).then(function (r) { return r.ok ? r.text() : null; })
          .then(function (txt) {
            if (!txt) { sagen('\u2717 Sicherung fehlgeschlagen.', false); return; }
            var d = new Date();
            var name = 'finnvelo-sicherung-'
              + d.getFullYear() + '-'
              + String(d.getMonth() + 1).padStart(2, '0') + '-'
              + String(d.getDate()).padStart(2, '0') + '.json';
            var blob = new Blob([txt], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            document.body.appendChild(a); a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
            var anzahl = 0;
            try { anzahl = (JSON.parse(txt).anzahl) || 0; } catch (e) {}
            sagen('\u2713 Heruntergeladen: ' + name + ' (' + anzahl + ' Eintr\u00e4ge)', true);
          }).catch(function () { sagen('\u2717 Sicherung fehlgeschlagen.', false); });
      });

      box.querySelector('#fvSUp').addEventListener('click', function () {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = function () {
          var f = inp.files && inp.files[0]; if (!f) return;
          var leser = new FileReader();
          leser.onload = function () {
            var daten;
            try { daten = JSON.parse(String(leser.result || '')); }
            catch (e) { sagen('\u2717 Das ist keine g\u00fcltige Sicherungsdatei.', false); return; }
            if (!daten || daten.art !== 'finnvelo-sicherung') {
              sagen('\u2717 Das ist keine Finnvelo-Sicherung.', false); return;
            }
            if (!window.confirm('Sicherung vom ' + (daten.erstellt || '?').slice(0, 10)
              + ' mit ' + (daten.anzahl || 0) + ' Eintr\u00e4gen einspielen?\n\n'
              + 'Vorhandene Inhalte mit denselben Feldern werden dabei \u00fcberschrieben.')) return;
            sagen('Wird eingespielt \u2026', true);
            fetch('/api/import', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ password: pw, daten: daten })
            }).then(function (r) { return r.ok ? r.json() : null; })
              .then(function (res) {
                if (res && res.ok) {
                  sagen('\u2713 ' + res.uebernommen + ' Eintr\u00e4ge eingespielt. Seite neu laden.', true);
                } else sagen('\u2717 Einspielen fehlgeschlagen.', false);
              }).catch(function () { sagen('\u2717 Einspielen fehlgeschlagen.', false); });
          };
          leser.readAsText(f);
        };
        inp.click();
      });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bauen);
    else bauen();
  } catch (e) { /* niemals die Seite blockieren */ }
})();
