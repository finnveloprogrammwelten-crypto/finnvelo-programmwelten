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
  var PROGRAM_PAGES = ['command-control', 'archivar', 'aufgabenplaner', 'finanzmanager', 'medienstudio', 'haus-und-gartenplaner', 'tester'];

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
      var base = [];
      qsa(root, TEXT_SEL).forEach(function (el) {
        if (el.closest('.fv-gallery')) return;
        if (el.closest('.fv-extra-zone')) return;               // Zusatztexte -> eigene Logik (x0)
        if (el.querySelector(TEXT_SEL)) return;                 // Container -> ueberspringen
        if (el.querySelector('img')) return;                    // enthaelt Bild -> separat
        if (!el.textContent || !el.textContent.trim()) return;  // leer
        base.push(el);
      });
      var extra = [];
      qsa(root, EXTRA_TEXT_SEL).forEach(function (el) {
        if (el.closest('.fv-gallery')) return;
        if (el.matches('.status') || el.closest('.status')) return;   // Status -> eigene Kategorie (s)
        if (el.querySelector('img') || el.querySelector(TEXT_SEL)) return;
        if (!el.textContent || !el.textContent.trim()) return;
        extra.push(el);
      });
      return base.concat(extra);   // Zusatz-Spans IMMER nach den Basistexten -> stabile t-Indizes
    }
    function navEls() {
      var out = [];
      qsa(document, NAV_TEXT_SEL).forEach(function (el) {
        if (!el.textContent || !el.textContent.trim()) return;
        out.push(el);
      });
      return out;
    }
    function imgEls() {
      var root = editRoot(); if (!root) return [];
      return qsa(root, 'img').filter(function (el) { return !el.closest('.fv-gallery'); });
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

    function applyOverrides(k) {
      return Promise.all([fetchContent(SLUG), fetchContent(GLOBAL)]).then(function (res) {
        var map = res[0] || {}, gmap = res[1] || {};
        k.t.forEach(function (el) { var o = map[el.getAttribute('data-fvk')]; if (o && o.type === 'text') el.innerHTML = o.value; });
        k.i.forEach(function (el) { var o = map[el.getAttribute('data-fvk')]; if (o && o.type === 'image' && o.value) el.src = o.value; });
        k.d.forEach(function (el) { var o = map[el.getAttribute('data-fvk')]; if (o && o.type === 'link' && /^https?:\/\//i.test(o.value)) el.setAttribute('href', o.value); });
        k.s.forEach(function (el) { var o = map[el.getAttribute('data-fvk')]; if (o && o.type === 'text') el.innerHTML = o.value; applyStatus(el); });
        k.n.forEach(function (el) { var o = gmap[el.getAttribute('data-fvk')]; if (o && o.type === 'text') el.innerHTML = o.value; });
        var vo = map['v0']; if (vo && vo.type === 'video' && vo.value) renderVideo(vo.value);
        parseGallery(map['g0']); renderGallery();
        applyOrder(map);
        parseCustom(map['x0']); renderCustom();
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
    function enableLinks(els) {
      els.forEach(function (el) {
        el.classList.add('fv-editable-link');
        el.setAttribute('title', 'Admin: Klicken, um das Ziel (Link) zu \u00e4ndern');
        el.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          var cur = el.getAttribute('href') || '';
          var u = window.prompt('Link/Ziel (vollst\u00e4ndige URL, z.B. GitHub-Release) einf\u00fcgen:', cur);
          if (u === null) return;
          u = String(u).trim();
          if (u && !/^https?:\/\//i.test(u)) { window.alert('Bitte eine vollst\u00e4ndige URL mit https:// eingeben.'); return; }
          el.classList.add('fv-saving');
          save(el.getAttribute('data-fvk'), 'link', u).then(function (ok) {
            if (ok && u) el.setAttribute('href', u);
            flash(el, ok);
          });
        });
      });
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

    /* ---- Zusatz-Textfelder (Block x0) --------------------------------- */
    function parseCustom(item) {
      customBlocks = [];
      if (item && item.type === 'text' && item.value) {
        try {
          var arr = JSON.parse(item.value);
          if (Array.isArray(arr)) {
            customBlocks = arr.filter(function (b) { return b && typeof b.id === 'string' && typeof b.html === 'string'; });
          }
        } catch (e) {}
      }
    }
    function saveCustom() { return save('x0', 'text', JSON.stringify(customBlocks)); }
    function extraZone() {
      var root = editRoot(); if (!root) return null;
      var z = root.querySelector('.fv-extra-zone');
      if (!z) { z = document.createElement('div'); z.className = 'fv-extra-zone'; root.appendChild(z); }
      return z;
    }
    function renderCustom() {
      var z = extraZone(); if (!z) return;
      z.innerHTML = '';
      if (!customBlocks.length && !EDITING) { z.style.display = 'none'; return; }
      z.style.display = '';
      customBlocks.forEach(function (b, idx) {
        var wrap = document.createElement('div');
        wrap.className = 'fv-extra';
        var p = document.createElement('p');
        p.className = 'fv-extra__text';
        p.setAttribute('data-fvx', b.id);
        p.innerHTML = b.html;
        wrap.appendChild(p);
        if (EDITING) {
          p.setAttribute('contenteditable', 'true');
          p.setAttribute('spellcheck', 'false');
          p.classList.add('fv-editable');
          var orig = p.innerHTML;
          p.addEventListener('blur', function () {
            if (p.innerHTML === orig) return;
            orig = p.innerHTML; customBlocks[idx].html = p.innerHTML;
            p.classList.add('fv-saving');
            saveCustom().then(function (ok) { flash(p, ok); });
          });
          var del = document.createElement('button');
          del.type = 'button'; del.className = 'fv-extra__del'; del.textContent = '\u2715';
          del.setAttribute('title', 'Textfeld entfernen');
          del.addEventListener('click', function () {
            if (!window.confirm('Dieses Textfeld entfernen?')) return;
            customBlocks.splice(idx, 1); saveCustom().then(function () { renderCustom(); });
          });
          wrap.appendChild(del);
        }
        z.appendChild(wrap);
      });
      if (EDITING) {
        var add = document.createElement('button');
        add.type = 'button'; add.className = 'fv-extra-add';
        add.innerHTML = '<span aria-hidden="true">+</span> Textfeld hinzuf\u00fcgen';
        add.addEventListener('click', function () {
          var id = 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          customBlocks.push({ id: id, html: 'Neuer Text \u2013 hier klicken und bearbeiten.' });
          saveCustom().then(function () {
            renderCustom();
            var last = z.querySelector('.fv-extra:last-of-type .fv-extra__text');
            if (last) last.focus();
          });
        });
        z.appendChild(add);
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
