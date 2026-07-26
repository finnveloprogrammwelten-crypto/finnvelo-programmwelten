// Cloudflare Worker fuer Finnvelo Programmwelten.
// Zaehler (anonym) UND Kommentare laufen ueber EINE Durable Object "Counter"
// (SQLite). Binding COUNTERS, siehe wrangler.jsonc.
//
//   POST /api/hit     {"key":"views:command-control"}     -> Zaehler +1
//   GET  /api/stats?keys=views:site,...                    -> {counts:{...}}
//
//   GET  /api/comments                                     -> oeffentliche Liste
//   POST /api/comments {name?, text, hp}                   -> neuer Kommentar (OHNE Anmeldung)
//   POST /api/comments/admin   {password}                  -> prueft Admin-Passwort
//   POST /api/comments/remove  {id, reason, password}      -> Kommentar als "entfernt" markieren
//
// Admin-Passwort = Secret ADMIN_PASSWORD (in Cloudflare setzen, NICHT im Code):
//   Dashboard -> Workers & Pages -> Projekt -> Settings -> Variables and Secrets
//   Secret "ADMIN_PASSWORD" anlegen.

import { DurableObject } from "cloudflare:workers";

const KEY_RE = /^[a-z]+:[a-z0-9-]{1,40}$/;
const ALLOWED_PREFIXES = ["views", "video", "download"];

const MAX_TEXT = 2000;
const MAX_NAME = 60;
const MAX_REASON = 200;
const MAX_KEEP = 500;       // hoechstens so viele Kommentare aufbewahren
const RL_MS = 20000;        // 20s Sperre zwischen Posts pro IP

const MAX_CONTENT = 30000;             // max Laenge eines bearbeiteten Textblocks
const MAX_IMG_BYTES = 2 * 1024 * 1024; // max 2 MB pro hochgeladenem Bild
const MAX_APP = 6 * 1024 * 1024;       // max 6 MB pro hochgeladener HTML-App (z.B. Planer)
const PAGE_RE = /^[a-z0-9-]{1,40}$/;

// Kurznamen, die schon von festen Seiten belegt sind - duerfen nicht
// noch einmal als eigenes Programm angelegt werden.
const RESERVIERT = [
  "index", "programme", "kommentare", "kontakt", "impressum", "datenschutz",
  "admin", "downloads", "tester", "404", "assets", "planer", "tess", "api",
  "mischwald", "mischwaldrechner", "aufgabenplaner", "archivar", "finanzmanager",
  "medienstudio", "command-control", "haus-und-gartenplaner", "finnvelo", "sitemap",
  "robots", "favicon"
];
const APP_RE = /^[a-z0-9-]{1,40}$/;
// Block-Schluessel: ein Kleinbuchstabe + Zahl. Kategorien u.a.:
//   t=Text  i=Bild  v=Video  s=Status  d=Download-Link  g=Galerie
//   n=Navigation/Fusszeile/Marke (Seite "global")  o=Reihenfolge  x=Zusatztexte
const BLOCK_RE = /^[a-z][0-9]{1,4}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function isValidKey(key) {
  if (typeof key !== "string" || !KEY_RE.test(key)) return false;
  return ALLOWED_PREFIXES.includes(key.split(":")[0]);
}

// Text bereinigen: Steuerzeichen raus (ausser Zeilenumbruch/Tab), trimmen, kuerzen.
// Anzeige im Browser erfolgt ueber textContent -> HTML ist dort wirkungslos (kein XSS).
function clean(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, max);
}

async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function checkAdmin(body, env) {
  return !!env.ADMIN_PASSWORD && typeof body.password === "string" && body.password === env.ADMIN_PASSWORD;
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class Counter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // Eigene Tabellen (eindeutige Namen -> kein Schema-Konflikt mit Altbestand).
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS counter_values (key TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0)"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, name TEXT, body TEXT NOT NULL, created INTEGER NOT NULL, removed INTEGER NOT NULL DEFAULT 0, reason TEXT)"
    );
    // Inline-Editor: bearbeitete Texte/Bild-Verweise je Seite + hochgeladene Bilder.
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS content (page TEXT NOT NULL, block TEXT NOT NULL, type TEXT NOT NULL, value TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (page, block))"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, mime TEXT NOT NULL, data TEXT NOT NULL, created INTEGER NOT NULL)"
    );
    // Inline-Editor: hochgeladene HTML-App (z.B. der Haus- und Gartenplaner),
    // die der Startknopf direkt oeffnet. Eine Datei pro slug.
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS apps (slug TEXT PRIMARY KEY, html TEXT NOT NULL, updated INTEGER NOT NULL)"
    );
    this.recentPosts = new Map();   // ipHash -> Zeitstempel (nur im Speicher, fuer Rate-Limit)
  }

  readCount(key) {
    const rows = this.sql.exec("SELECT value FROM counter_values WHERE key = ?", key).toArray();
    return rows.length ? Number(rows[0].value) : 0;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;
    const env = this.env;

    // --- Zaehler ---
    if (method === "GET" && url.pathname === "/api/stats") {
      const keys = (url.searchParams.get("keys") || "")
        .split(",").map((k) => k.trim()).filter(isValidKey).slice(0, 30);
      const counts = {};
      for (const k of keys) counts[k] = this.readCount(k);
      return json({ counts });
    }

    if (method === "POST" && url.pathname === "/api/hit") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      const key = body && body.key;
      if (!isValidKey(key)) return json({ error: "invalid_key" }, 400);
      this.sql.exec(
        "INSERT INTO counter_values (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1",
        key
      );
      return json({ key, value: this.readCount(key) });
    }

    // --- Kommentare ---
    if (url.pathname === "/api/comments" && method === "GET") {
      const rows = this.sql.exec(
        "SELECT id, name, body, created, removed, reason FROM comments ORDER BY created DESC LIMIT ?",
        MAX_KEEP
      ).toArray();
      const pub = rows.map((r) => (r.removed
        ? { id: r.id, name: r.name, created: Number(r.created), removed: true, removeReason: r.reason }
        : { id: r.id, name: r.name, created: Number(r.created), removed: false, text: r.body }));
      return json({ comments: pub });
    }

    if (url.pathname === "/api/comments" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (clean(body.hp, 50)) return json({ ok: true });          // Honeypot -> still ignorieren
      const text = clean(body.text, MAX_TEXT);
      const name = clean(body.name, MAX_NAME);
      if (!text) return json({ error: "empty" }, 400);

      // Bremse gegen Massen-Posts (gehashte IP, nur im Speicher, keine dauerhafte Speicherung).
      const ip = request.headers.get("CF-Connecting-IP") || "";
      if (ip) {
        const h = await sha256hex(ip);
        const now = Date.now();
        if (now - (this.recentPosts.get(h) || 0) < RL_MS) return json({ error: "too_fast" }, 429);
        this.recentPosts.set(h, now);
      }

      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      this.sql.exec(
        "INSERT INTO comments (id, name, body, created, removed, reason) VALUES (?, ?, ?, ?, 0, NULL)",
        id, name || null, text, Date.now()
      );
      // auf MAX_KEEP neueste eindampfen
      this.sql.exec(
        "DELETE FROM comments WHERE id NOT IN (SELECT id FROM comments ORDER BY created DESC LIMIT ?)",
        MAX_KEEP
      );
      return json({ ok: true });
    }

    if (url.pathname === "/api/comments/admin" && method === "POST") {
      if (!env.ADMIN_PASSWORD) return json({ error: "admin_not_configured" }, 503);
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      const ok = typeof body.password === "string" && body.password.length > 0 && body.password === env.ADMIN_PASSWORD;
      return json({ ok });
    }

    if (url.pathname === "/api/comments/remove" && method === "POST") {
      if (!env.ADMIN_PASSWORD) return json({ error: "admin_not_configured" }, 503);
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (typeof body.password !== "string" || body.password !== env.ADMIN_PASSWORD) {
        return json({ error: "unauthorized" }, 401);
      }
      const id = clean(body.id, 60);
      const reason = clean(body.reason, MAX_REASON);
      if (!id || !reason) return json({ error: "bad_request" }, 400);
      const exists = this.sql.exec("SELECT id FROM comments WHERE id = ?", id).toArray();
      if (!exists.length) return json({ error: "not_found" }, 404);
      this.sql.exec("UPDATE comments SET removed = 1, reason = ? WHERE id = ?", reason, id);
      return json({ ok: true });
    }

    // --- Inline-Editor: Inhalte ---
    if (url.pathname === "/api/content" && method === "GET") {
      const page = url.searchParams.get("page") || "";
      if (!PAGE_RE.test(page)) return json({ items: [] });
      const rows = this.sql.exec("SELECT block, type, value FROM content WHERE page = ?", page).toArray();
      return json({ items: rows.map((r) => ({ block: r.block, type: r.type, value: r.value })) });
    }

    if (url.pathname === "/api/content" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!checkAdmin(body, env)) return json({ error: "unauthorized" }, 401);
      const page = String(body.page || "");
      const block = String(body.block || "");
      const type = String(body.type || "");
      const ALLOWED_TYPES = ["text", "image", "video", "link"];
      if (!PAGE_RE.test(page) || !BLOCK_RE.test(block) || ALLOWED_TYPES.indexOf(type) === -1) {
        return json({ error: "bad_request" }, 400);
      }
      const value = String(body.value == null ? "" : body.value).slice(0, MAX_CONTENT);
      this.sql.exec(
        "INSERT INTO content (page, block, type, value, updated) VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(page, block) DO UPDATE SET type = excluded.type, value = excluded.value, updated = excluded.updated",
        page, block, type, value, Date.now()
      );
      return json({ ok: true });
    }

    // --- Inline-Editor: Bild hochladen + ausliefern ---
    if (url.pathname === "/api/image" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!checkAdmin(body, env)) return json({ error: "unauthorized" }, 401);
      const dataUrl = String(body.dataUrl || "");
      const comma = dataUrl.indexOf(",");
      const b64 = (comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl).replace(/\s+/g, "");
      if (!b64 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return json({ error: "bad_image" }, 400);
      if (b64.length * 0.75 > MAX_IMG_BYTES) return json({ error: "too_large" }, 413);
      let mime = String(body.mime || "image/jpeg");
      if (!/^image\/(png|jpeg|webp|gif)$/.test(mime)) mime = "image/jpeg";
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      this.sql.exec("INSERT INTO images (id, mime, data, created) VALUES (?, ?, ?, ?)", id, mime, b64, Date.now());
      return json({ id, url: "/api/image/" + id });
    }

    if (url.pathname.startsWith("/api/image/") && method === "GET") {
      const id = url.pathname.slice("/api/image/".length);
      const rows = this.sql.exec("SELECT mime, data FROM images WHERE id = ?", id).toArray();
      if (!rows.length) return new Response("Not found", { status: 404 });
      return new Response(b64ToBytes(rows[0].data), {
        status: 200,
        headers: { "content-type": rows[0].mime, "cache-control": "public, max-age=31536000, immutable" }
      });
    }

    // --- Sicherung: alle Inhalte ausgeben (nur Admin) ------------------
    // Liefert saemtliche gespeicherten Inhalte als eine Datei. Damit laesst
    // sich alles, was ueber den Bearbeiten-Modus eingetragen wurde, sichern.
    if (url.pathname === "/api/export" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!checkAdmin(body, env)) return json({ error: "unauthorized" }, 401);
      const rows = this.sql.exec(
        "SELECT page, block, type, value, updated FROM content ORDER BY page, block"
      ).toArray();
      return new Response(JSON.stringify({
        art: "finnvelo-sicherung",
        fassung: 1,
        erstellt: new Date().toISOString(),
        anzahl: rows.length,
        inhalte: rows
      }, null, 2), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }

    // --- Sicherung einspielen (nur Admin) ------------------------------
    if (url.pathname === "/api/import" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!checkAdmin(body, env)) return json({ error: "unauthorized" }, 401);
      const daten = body.daten;
      if (!daten || daten.art !== "finnvelo-sicherung" || !Array.isArray(daten.inhalte)) {
        return json({ error: "keine_sicherung" }, 400);
      }
      const ALLOWED_TYPES = ["text", "image", "video", "link"];
      let uebernommen = 0, uebersprungen = 0;
      for (const z of daten.inhalte) {
        const page = String(z && z.page || "");
        const block = String(z && z.block || "");
        const type = String(z && z.type || "");
        if (!PAGE_RE.test(page) || !BLOCK_RE.test(block) || ALLOWED_TYPES.indexOf(type) === -1) {
          uebersprungen++; continue;
        }
        const value = String(z.value == null ? "" : z.value).slice(0, MAX_CONTENT);
        this.sql.exec(
          "INSERT INTO content (page, block, type, value, updated) VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(page, block) DO UPDATE SET type = excluded.type, value = excluded.value, updated = excluded.updated",
          page, block, type, value, Date.now()
        );
        uebernommen++;
      }
      return json({ ok: true, uebernommen: uebernommen, uebersprungen: uebersprungen });
    }

    // --- Verzeichnis der Update-Adressen (oeffentlich) -----------------
    // Ablage: page "system", block "v0" -> { "/pfad/version.json": "ablage" }
    if (url.pathname === "/api/versionsrouten" && method === "GET") {
      const rows = this.sql.exec(
        "SELECT value FROM content WHERE page = 'system' AND block = 'v0'"
      ).toArray();
      let routen = {};
      if (rows.length && rows[0].value) {
        try { const o = JSON.parse(rows[0].value); if (o && typeof o === "object") routen = o; } catch (_e) {}
      }
      return new Response(JSON.stringify({ routen: routen }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      });
    }

    // --- Eigene Programme: Liste lesen (oeffentlich) -------------------
    // Ablage: page "system", block "p0" -> JSON-Liste
    //   [{ slug, name, kurz, stich, bild }]
    if (url.pathname === "/api/programme" && method === "GET") {
      const rows = this.sql.exec(
        "SELECT value FROM content WHERE page = 'system' AND block = 'p0'"
      ).toArray();
      let liste = [];
      if (rows.length && rows[0].value) {
        try { const a = JSON.parse(rows[0].value); if (Array.isArray(a)) liste = a; } catch (_e) {}
      }
      return new Response(JSON.stringify({ programme: liste }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      });
    }

    // --- Eigene Programme: anlegen / entfernen (nur Admin) -------------
    if (url.pathname === "/api/programme" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!checkAdmin(body, env)) return json({ error: "unauthorized" }, 401);

      const rows = this.sql.exec(
        "SELECT value FROM content WHERE page = 'system' AND block = 'p0'"
      ).toArray();
      let liste = [];
      if (rows.length && rows[0].value) {
        try { const a = JSON.parse(rows[0].value); if (Array.isArray(a)) liste = a; } catch (_e) {}
      }

      const aktion = String(body.aktion || "");
      const slug = String(body.slug || "").toLowerCase().trim();

      if (aktion === "anlegen") {
        if (!PAGE_RE.test(slug)) return json({ error: "bad_slug" }, 400);
        if (RESERVIERT.indexOf(slug) !== -1) return json({ error: "slug_belegt" }, 409);
        if (liste.some((p) => p.slug === slug)) return json({ error: "slug_belegt" }, 409);
        if (liste.length >= 40) return json({ error: "zu_viele" }, 400);
        liste.push({
          slug: slug,
          name: clean(body.name, 80) || slug,
          kurz: clean(body.kurz, 220) || "Kurzbeschreibung - im Bearbeiten-Modus aenderbar.",
          stich: clean(body.stich, 80) || "Finnvelo Programm",
          bild: ""
        });
      } else if (aktion === "entfernen") {
        liste = liste.filter((p) => p.slug !== slug);
      } else {
        return json({ error: "bad_request" }, 400);
      }

      this.sql.exec(
        "INSERT INTO content (page, block, type, value, updated) VALUES ('system', 'p0', 'text', ?, ?) " +
        "ON CONFLICT(page, block) DO UPDATE SET value = excluded.value, updated = excluded.updated",
        JSON.stringify(liste), Date.now()
      );
      return json({ ok: true, programme: liste });
    }

    // --- App-Aktualisierung: version.json fuer die Android-Apps ---
    // Wird im Bearbeiten-Modus gepflegt und liegt in der normalen Inhalts-
    // ablage (Seite = App-Name, Block "u0"). Die Apps fragen ihre Datei ab,
    // um zu erkennen, ob eine neuere Fassung bereitsteht.
    if (url.pathname === "/api/version" && method === "GET") {
      const app = url.searchParams.get("app") || "";
      if (!PAGE_RE.test(app)) return new Response("Not found", { status: 404 });
      const rows = this.sql.exec(
        "SELECT value FROM content WHERE page = ? AND block = 'u0'", app
      ).toArray();
      // Noch nichts hinterlegt: gueltige Antwort mit versionCode 0, damit die
      // App "kein Update" meldet statt einen Fehler zu zeigen. Jede App hat ihr
      // eigenes Feldformat.
      const leer = {
        aufgabenplaner: { schluessel: "FINNVELO-AUFGABENPLANER", versionCode: 0, versionName: "", apk: "", hinweise: "" }
      };
      const standard = leer[app] || { versionCode: 0, versionName: "", version: "", download: "", hinweis: "" };
      const inhalt = rows.length && rows[0].value ? rows[0].value : JSON.stringify(standard);
      return new Response(inhalt, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store, no-cache, must-revalidate",
          "access-control-allow-origin": "*"
        }
      });
    }

    // --- Inline-Editor: HTML-App (Planer) hochladen + ausliefern ---
    if (url.pathname === "/api/app" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!checkAdmin(body, env)) return json({ error: "unauthorized" }, 401);
      const slug = String(body.slug || "");
      const html = String(body.html == null ? "" : body.html);
      if (!APP_RE.test(slug)) return json({ error: "bad_slug" }, 400);
      if (!html) return json({ error: "empty" }, 400);
      if (html.length > MAX_APP) return json({ error: "too_large" }, 413);
      this.sql.exec(
        "INSERT INTO apps (slug, html, updated) VALUES (?, ?, ?) " +
        "ON CONFLICT(slug) DO UPDATE SET html = excluded.html, updated = excluded.updated",
        slug, html, Date.now()
      );
      return json({ ok: true, url: "/api/app/" + slug });
    }

    if (url.pathname.startsWith("/api/app/") && method === "GET") {
      const slug = url.pathname.slice("/api/app/".length);
      const rows = this.sql.exec("SELECT html FROM apps WHERE slug = ?", slug).toArray();
      if (!rows.length) return new Response("Not found", { status: 404 });
      return new Response(rows[0].html, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
      });
    }

    // --- Inline-Editor: Login-Pruefung (nur Ja/Nein) ---
    if (url.pathname === "/api/admin/login" && method === "POST") {
      if (!env.ADMIN_PASSWORD) return json({ error: "admin_not_configured" }, 503);
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      return json({ ok: checkAdmin(body, env) });
    }

    return json({ error: "not_found" }, 404);
  }
}

// --- Web-Apps: Oeffnungen mitzaehlen -----------------------------------
// Wird serverseitig gezaehlt, damit es auch zaehlt, wenn jemand die App
// direkt aufruft (z.B. ueber einen Link oder aus der Google-Suche).
// --- Eigene Programme: Seite, Kachel und Listenzeile erzeugen ----------
// Diese Seiten stehen NICHT als Datei auf dem Server - sie werden hier aus
// der Liste erzeugt. Alle Texte/Bilder darin sind danach ganz normal im
// Bearbeiten-Modus aenderbar (sie werden unter page = <slug> gespeichert).

function esc(t) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const KOPFZEILE = `  <header class="site-header">
    <a class="brand" href="/" aria-label="Finnvelo Programmwelten Startseite">
      <img class="brand-logo" src="/assets/images/finnvelo-plakette.webp" alt="Finnvelo Plakette">
      <span class="brand-text"><strong>Finnvelo</strong><small>Programmwelten</small></span>
    </a>
    <nav aria-label="Hauptnavigation">
      <a href="/">Start</a>
      <a href="/programme">Programme</a>
      <span class="nav-apps">
        <a class="nav-apps__btn" href="/planer/haus-und-gartenplaner/" target="_blank" rel="noopener" aria-haspopup="true" aria-expanded="false">Web-Apps</a>
        <span class="nav-apps__menu" hidden>
          <a href="/planer/haus-und-gartenplaner/" target="_blank" rel="noopener" data-fv-nav-extra>Haus- und Gartenplaner</a>
          <a href="/mischwald" target="_blank" rel="noopener" data-fv-nav-extra>Mischwaldrechner</a>
        </span>
      </span>
      <a href="/kommentare">Kommentare</a>
      <a href="/kontakt">Kontakt</a>
    </nav>
  </header>`;

const FUSSZEILE = `  <footer>
    <span>&copy; 2026 Finnvelo Programmwelten</span>
    <a href="/impressum">Impressum</a>
    <a href="/datenschutz">Datenschutz</a>
  </footer>`;

function programmSeite(p) {
  const name = esc(p.name), kurz = esc(p.kurz), stich = esc(p.stich || "Finnvelo Programm");
  const bild = p.bild ? esc(p.bild) : "/assets/images/programmwelten-label.webp";
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${kurz}">
  <title>${name} &middot; Finnvelo Programmwelten</title>
  <link rel="canonical" href="https://finnveloprogramme.com/${esc(p.slug)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Finnvelo Programmwelten">
  <meta property="og:locale" content="de_DE">
  <meta property="og:title" content="${name} &middot; Finnvelo Programmwelten">
  <meta property="og:description" content="${kurz}">
  <meta property="og:url" content="https://finnveloprogramme.com/${esc(p.slug)}">
  <meta property="og:image" content="https://finnveloprogramme.com/assets/images/programmwelten-cover.jpg">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" href="/assets/images/favicon.png">
  <link rel="apple-touch-icon" href="/assets/images/apple-touch-icon.png">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
${KOPFZEILE}
  <main class="main-canvas program-detail-page">
    <article class="program-detail" aria-labelledby="program-title">
      <div class="program-detail__top">
        <div class="program-detail__label">
          <img src="${bild}" alt="${name}">
        </div>
        <div class="program-detail__summary">
          <p class="section-kicker">${stich}</p>
          <h1 id="program-title">${name}</h1>
          <span class="status">In Entwicklung</span>
          <p class="lead">${kurz}</p>
        </div>
      </div>

      <section class="program-launch" aria-labelledby="launch-title">
        <div class="program-launch__text">
          <p class="section-kicker">Direkt im Browser</p>
          <h2 id="launch-title">Sofort starten</h2>
          <p>L&auml;uft direkt hier auf der Webseite &ndash; ohne Installation.</p>
        </div>
        <div class="program-launch__action">
          <a class="button program-launch__btn" href="/programme">Jetzt &ouml;ffnen</a>
          <span class="program-launch__note">L&auml;uft im Browser &ndash; keine Installation n&ouml;tig</span>
        </div>
      </section>

      <div class="program-detail__body program-detail__body--archivar">
        <section class="program-info-block program-info-block--wide" aria-labelledby="description-title">
          <h2 id="description-title">Beschreibung</h2>
          <p>Hier steht die ausf&uuml;hrliche Beschreibung. Im Bearbeiten-Modus anklicken und &auml;ndern.</p>
        </section>

        <section class="program-info-block program-info-block--wide" aria-labelledby="surface-title">
          <h2 id="surface-title">Oberfl&auml;che</h2>
          <p>Bildschirmfotos werden hier erg&auml;nzt.</p>
          <div class="fv-gallery" data-fv-gallery></div>
        </section>

        <section class="program-info-block program-info-block--wide" aria-labelledby="tutorial-title">
          <h2 id="tutorial-title">Tutorial-Video</h2>
          <p>Ein Video kann hier sp&auml;ter erg&auml;nzt werden.</p>
        </section>

        <section class="program-info-block" aria-labelledby="advantages-title">
          <h2 id="advantages-title">Besondere Vorteile</h2>
          <ul class="feature-list">
            <li>Vorteil 1 &ndash; hier anklicken und &auml;ndern.</li>
            <li>Vorteil 2</li>
            <li>Vorteil 3</li>
          </ul>
        </section>

        <section class="program-info-block" aria-labelledby="target-title">
          <h2 id="target-title">Zielgruppe</h2>
          <p>F&uuml;r wen ist das Programm gedacht?</p>
        </section>

        <section class="program-info-block program-download-block" aria-labelledby="download-title">
          <h2 id="download-title">Download</h2>
          <div class="download-slot">
            <h3>Hauptdatei</h3>
            <p>Sobald es eine Datei gibt, hier den Knopf anklicken und die GitHub-Adresse eintragen.</p>
            <a class="button" href="https://github.com/finnveloprogrammwelten-crypto/finnvelo-programmwelten/releases" target="_blank" rel="noopener">Download starten</a>
          </div>
        </section>
      </div>
    </article>
  </main>
${FUSSZEILE}
  <script src="/stats.js" defer></script>
</body>
</html>`;
}

function programmKachel(p) {
  const bild = p.bild ? esc(p.bild) : "/assets/images/programmwelten-label.webp";
  return `          <a class="program-button" href="/${esc(p.slug)}" aria-label="${esc(p.name)} oeffnen" data-fv-text-extra>
            <span class="program-button__status" data-fv-added hidden></span>
            <img src="${bild}" alt="${esc(p.name)}">
            <span class="program-button__description">${esc(p.kurz)}</span>
          </a>`;
}

function programmZeile(p) {
  const bild = p.bild ? esc(p.bild) : "/assets/images/programmwelten-label.webp";
  return `        <a class="program-row" href="/${esc(p.slug)}" aria-label="${esc(p.name)} oeffnen" data-fv-text-extra>
          <span class="program-row__image"><img src="${bild}" alt="${esc(p.name)}"></span>
          <span class="program-row__content">
            <span class="status" data-fv-added hidden></span>
            <strong>${esc(p.name)}</strong>
            <span>${esc(p.kurz)}</span>
          </span>
        </a>`;
}

async function seitenKopf(env, slug) {
  try {
    if (!env || !env.COUNTERS || !PAGE_RE.test(slug)) return null;
    const stub = env.COUNTERS.get(env.COUNTERS.idFromName("global"));
    const r = await stub.fetch(new Request(
      "https://zaehler/api/content?page=" + encodeURIComponent(slug), { method: "GET" }));
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || !Array.isArray(d.items)) return null;
    let titel = "", besch = "";
    for (const it of d.items) {
      if (it.block === "m1" && it.type === "text") titel = String(it.value || "").trim();
      if (it.block === "m2" && it.type === "text") besch = String(it.value || "").trim();
    }
    if (!titel && !besch) return null;
    return { titel: titel, besch: besch };
  } catch (_e) { return null; }
}

// Titel und Beschreibung in einer fertigen HTML-Seite austauschen.
function kopfErsetzen(html, kopf) {
  if (!kopf) return html;
  if (kopf.titel) {
    const t = esc(kopf.titel);
    html = html.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + t + "</title>");
    html = html.replace(/(<meta property="og:title" content=")[^"]*(")/i, "$1" + t + "$2");
    html = html.replace(/(<meta name="twitter:title" content=")[^"]*(")/i, "$1" + t + "$2");
  }
  if (kopf.besch) {
    const b = esc(kopf.besch);
    html = html.replace(/(<meta name="description" content=")[^"]*(")/i, "$1" + b + "$2");
    html = html.replace(/(<meta property="og:description" content=")[^"]*(")/i, "$1" + b + "$2");
    html = html.replace(/(<meta name="twitter:description" content=")[^"]*(")/i, "$1" + b + "$2");
  }
  return html;
}

async function versionsRouten(env) {
  try {
    if (!env || !env.COUNTERS) return {};
    const stub = env.COUNTERS.get(env.COUNTERS.idFromName("global"));
    const r = await stub.fetch(new Request("https://zaehler/api/versionsrouten", { method: "GET" }));
    if (!r.ok) return {};
    const d = await r.json();
    return (d && d.routen && typeof d.routen === "object") ? d.routen : {};
  } catch (_e) { return {}; }
}

async function eigeneProgramme(env) {
  try {
    if (!env || !env.COUNTERS) return [];
    const stub = env.COUNTERS.get(env.COUNTERS.idFromName("global"));
    const r = await stub.fetch(new Request("https://zaehler/api/programme", { method: "GET" }));
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d.programme) ? d.programme : [];
  } catch (_e) { return []; }
}

function webAppKey(pathname) {
  const p = String(pathname || "").toLowerCase().replace(/\/+$/, "");
  if (p === "/mischwald" || p === "/mischwald.html") return "open:mischwald";
  if (p === "/planer/haus-und-gartenplaner" || p === "/planer/haus-und-gartenplaner/index.html") return "open:planer";
  return "";
}

// Nur echte Seitenaufrufe zaehlen - keine Bilder, Suchmaschinen oder Messdienste.
function isEchterAufruf(request) {
  if ((request.method || "GET") !== "GET") return false;
  const h = request.headers;
  const accept = (h.get("accept") || "").toLowerCase();
  if (accept && !accept.includes("text/html")) return false;
  const modus = (h.get("sec-fetch-mode") || "").toLowerCase();
  if (modus && modus !== "navigate") return false;
  const ua = (h.get("user-agent") || "").toLowerCase();
  if (!ua) return false;
  if (/bot|crawl|spider|slurp|preview|monitor|curl|wget|python-requests|headless|lighthouse|pingdom|uptime|facebookexternalhit|whatsapp|telegram/.test(ua)) return false;
  return true;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (!env || !env.COUNTERS) return json({ error: "storage_not_configured" }, 503);
      const id = env.COUNTERS.idFromName("global");
      const stub = env.COUNTERS.get(id);
      return stub.fetch(request);
    }

    // Versionsdateien der Android-Apps (feste Adressen, die in den Apps stecken).
    const versionPfad = url.pathname.toLowerCase().replace(/\/+$/, "");
    // Fest eingebaute Update-Adressen (bleiben immer erreichbar)
    const VERSION_ROUTEN = {
      "/mischwaldrechner/version.json": "mischwald",
      "/finnvelo/aufgabenplaner/version.json": "aufgabenplaner"
    };
    if (versionPfad.endsWith("/version.json")) {
      let ablage = VERSION_ROUTEN[versionPfad];
      if (!ablage) {
        // Selbst angelegte Adressen aus dem Verzeichnis
        const routen = await versionsRouten(env);
        const treffer = routen[versionPfad];
        if (typeof treffer === "string" && PAGE_RE.test(treffer)) ablage = treffer;
      }
      if (ablage) {
        if (!env || !env.COUNTERS) return new Response("Not found", { status: 404 });
        const stub = env.COUNTERS.get(env.COUNTERS.idFromName("global"));
        return stub.fetch(new Request("https://zaehler/api/version?app=" + ablage, { method: "GET" }));
      }
    }

    // --- Sitemap: selbst angelegte Programme ergaenzen -----------------
    // Ohne das waeren neu angelegte Programmseiten fuer Suchmaschinen unsichtbar.
    if (url.pathname === "/sitemap.xml" && env && env.ASSETS) {
      const liste = await eigeneProgramme(env);
      const antwort = await env.ASSETS.fetch(request);
      if (!antwort.ok || !liste.length) return antwort;
      let xml = await antwort.text();
      if (xml.indexOf("</urlset>") !== -1) {
        const heute = new Date().toISOString().slice(0, 10);
        const zusatz = liste.map((p) =>
          "  <url><loc>https://finnveloprogramme.com/" + esc(p.slug) +
          "</loc><lastmod>" + heute + "</lastmod></url>"
        ).join("\n");
        xml = xml.replace("</urlset>", zusatz + "\n</urlset>");
      }
      return new Response(xml, {
        status: 200,
        headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-cache" }
      });
    }

    // --- Eigene Programme: Seite erzeugen oder Kacheln einsetzen -------
    const pfad = url.pathname.replace(/\/+$/, "") || "/";
    const istUebersicht = (pfad === "/" || pfad === "/index.html" ||
                           pfad === "/programme" || pfad === "/programme.html");
    const moeglicherSlug = pfad.replace(/^\//, "").replace(/\.html$/, "");
    const koennteProgramm = PAGE_RE.test(moeglicherSlug) &&
                            RESERVIERT.indexOf(moeglicherSlug) === -1;

    if (istUebersicht || koennteProgramm) {
      const liste = await eigeneProgramme(env);

      // a) Eigene Programmseite ausliefern
      if (koennteProgramm) {
        const treffer = liste.filter((p) => p && p.slug === moeglicherSlug)[0];
        if (treffer) {
          const kopf = await seitenKopf(env, moeglicherSlug);
          return new Response(kopfErsetzen(programmSeite(treffer), kopf), {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-cache"
            }
          });
        }
      }

      // b) Kacheln/Zeilen in Startseite und Programmliste einsetzen
      if (istUebersicht && liste.length && env && env.ASSETS) {
        const antwort = await env.ASSETS.fetch(request);
        const typ = antwort.headers.get("content-type") || "";
        if (antwort.ok && typ.indexOf("text/html") !== -1) {
          let html = await antwort.text();
          if (html.indexOf("<!--FV-PROGRAMME-->") !== -1) {
            const istListe = (pfad === "/programme" || pfad === "/programme.html");
            const teile = liste.map((p) => istListe ? programmZeile(p) : programmKachel(p)).join("\n");
            html = html.replace("<!--FV-PROGRAMME-->", teile);
            const slugU = (pfad === "/" || pfad === "/index.html") ? "start" : "programme";
            html = kopfErsetzen(html, await seitenKopf(env, slugU));
            const kopf = new Headers(antwort.headers);
            kopf.delete("content-length");
            kopf.set("cache-control", "no-cache");
            return new Response(html, { status: antwort.status, headers: kopf });
          }
          return new Response(html, { status: antwort.status, headers: antwort.headers });
        }
        return antwort;
      }
    }

    // Wurde eine Web-App geoeffnet? Dann leise mitzaehlen (blockiert nichts).
    const appKey = webAppKey(url.pathname);
    if (appKey && env && env.COUNTERS && isEchterAufruf(request)) {
      try {
        const stub = env.COUNTERS.get(env.COUNTERS.idFromName("global"));
        const zaehlen = stub.fetch(new Request("https://zaehler/api/hit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: appKey })
        }));
        if (ctx && ctx.waitUntil) ctx.waitUntil(zaehlen);
      } catch (_e) { /* Zaehlen darf die Seite nie stoeren */ }
    }

    // Alles andere: statische Datei ausliefern.
    if (env && env.ASSETS) {
      const antwort = await env.ASSETS.fetch(request);
      // Bei HTML-Seiten koennen Titel und Beschreibung aus dem Bearbeiten-Modus
      // stammen. Klappt das nicht, wird einfach die Originalseite ausgeliefert.
      const typ = antwort.headers.get("content-type") || "";
      if (antwort.ok && typ.indexOf("text/html") !== -1) {
        const slug = (pfad === "/" ? "start" : pfad.replace(/^\//, "").replace(/\.html$/, ""));
        if (PAGE_RE.test(slug)) {
          const kopf = await seitenKopf(env, slug);
          if (kopf) {
            const html = kopfErsetzen(await antwort.text(), kopf);
            const kopfzeilen = new Headers(antwort.headers);
            kopfzeilen.delete("content-length");
            return new Response(html, { status: antwort.status, headers: kopfzeilen });
          }
        }
      }
      return antwort;
    }
    return new Response("Not found", { status: 404 });
  }
};
