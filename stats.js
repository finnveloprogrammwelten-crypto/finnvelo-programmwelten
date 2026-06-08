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

/* =====================================================================
 * Finnvelo Inline-Editor  (versteckter Admin-Modus)
 * - Fuer ALLE Besucher: bearbeitete Texte/Bilder werden angewendet.
 * - Nur mit Passwort (ueber /admin freigeschaltet, in sessionStorage):
 *   Texte direkt anklickbar/aenderbar, Bilder per Drag&Drop/Klick tauschbar.
 * Komplett fail-safe gekapselt: bei Fehlern bleibt die Seite normal.
 * ===================================================================== */
(function () {
  'use strict';
  try {
    var API = '/api';
    var PW_KEY = 'fv_admin_pw';

    function adminPw() { try { return sessionStorage.getItem(PW_KEY) || ''; } catch (e) { return ''; } }
    var ADMIN = !!adminPw();

    function slug() {
      var path = (location.pathname || '').toLowerCase();
      var file = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
      var name = file.replace(/\.html?$/, '').replace(/[^a-z0-9-]/g, '');
      return (!name || name === 'index') ? 'start' : name;
    }
    var SLUG = slug();
    var TEXT_SEL = 'h1,h2,h3,h4,p,li,blockquote,figcaption';

    function editRoot() { return document.querySelector('main'); }

    function textEls() {
      var root = editRoot(); if (!root) return [];
      var out = [];
      Array.prototype.forEach.call(root.querySelectorAll(TEXT_SEL), function (el) {
        if (el.querySelector(TEXT_SEL)) return;                 // Container -> ueberspringen
        if (el.querySelector('img')) return;                    // enthaelt Bild -> separat
        if (!el.textContent || !el.textContent.trim()) return;  // leer
        out.push(el);
      });
      return out;
    }
    function imgEls() {
      var root = editRoot(); if (!root) return [];
      return Array.prototype.slice.call(root.querySelectorAll('img'));
    }

    function keyed() {
      var t = textEls(), i = imgEls();
      t.forEach(function (el, idx) { el.setAttribute('data-fvk', 't' + idx); });
      i.forEach(function (el, idx) { el.setAttribute('data-fvk', 'i' + idx); });
      return { t: t, i: i };
    }

    function applyOverrides(k) {
      return fetch(API + '/content?page=' + encodeURIComponent(SLUG), { method: 'GET' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) {
          if (!res || !res.items) return;
          var map = {}; res.items.forEach(function (it) { map[it.block] = it; });
          k.t.forEach(function (el) { var o = map[el.getAttribute('data-fvk')]; if (o && o.type === 'text') el.innerHTML = o.value; });
          k.i.forEach(function (el) { var o = map[el.getAttribute('data-fvk')]; if (o && o.type === 'image' && o.value) el.src = o.value; });
          var vo = map['v0']; if (vo && vo.type === 'video' && vo.value) renderVideo(vo.value);
        })
        .catch(function () {});
    }

    function save(block, type, value) {
      return fetch(API + '/content', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: SLUG, block: block, type: type, value: value, password: adminPw() })
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    }

    function flash(el, ok) {
      el.classList.remove('fv-saving');
      el.classList.add(ok ? 'fv-saved' : 'fv-error');
      setTimeout(function () { el.classList.remove('fv-saved', 'fv-error'); }, 1200);
    }

    function enableText(els) {
      els.forEach(function (el) {
        el.setAttribute('contenteditable', 'true');
        el.classList.add('fv-editable');
        el.setAttribute('spellcheck', 'false');
        var orig = el.innerHTML;
        el.addEventListener('blur', function () {
          var v = el.innerHTML;
          if (v === orig) return;
          orig = v; el.classList.add('fv-saving');
          save(el.getAttribute('data-fvk'), 'text', v).then(function (ok) { flash(el, ok); });
        });
      });
    }

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
          e.preventDefault();
          var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
          inp.onchange = function () { if (inp.files && inp.files[0]) handle(inp.files[0]); };
          inp.click();
        });
      });
    }

    function ytId(u) {
      u = String(u || '').trim();
      var m = u.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{6,})/);
      if (m) return m[1];
      if (/^[A-Za-z0-9_-]{6,}$/.test(u)) return u;
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

    function banner() {
      if (document.querySelector('.fv-admin-bar')) return;
      var b = document.createElement('div');
      b.className = 'fv-admin-bar';
      b.innerHTML = '<span>\u270E Bearbeiten-Modus aktiv \u2013 Texte anklicken, Bilder per Drag&amp;Drop tauschen</span>'
        + '<button type="button" class="fv-admin-exit">Verlassen</button>';
      document.body.appendChild(b);
      document.body.classList.add('fv-admin-on');
      b.querySelector('.fv-admin-exit').addEventListener('click', function () {
        try { sessionStorage.removeItem(PW_KEY); } catch (e) {}
        location.reload();
      });
    }

    function run() {
      var k = keyed();
      applyOverrides(k).then(function () {
        if (ADMIN) { banner(); enableText(k.t); enableImages(k.i); enableVideo(); }
      });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
  } catch (e) { /* niemals die Seite blockieren */ }
})();
