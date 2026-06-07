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
