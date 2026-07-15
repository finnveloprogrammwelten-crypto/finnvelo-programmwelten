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

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (!env || !env.COUNTERS) return json({ error: "storage_not_configured" }, 503);
      const id = env.COUNTERS.idFromName("global");
      const stub = env.COUNTERS.get(id);
      return stub.fetch(request);
    }
    // Alles andere: statische Datei ausliefern.
    if (env && env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  }
};
