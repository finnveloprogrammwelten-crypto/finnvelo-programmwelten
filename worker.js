// Cloudflare Worker fuer Finnvelo Programmwelten.
// Zaehler (anonym) + Kommentare, beides im KV-Namespace COUNTERS.
//
//   POST /api/hit     {"key":"views:command-control"}        -> Zaehler +1
//   GET  /api/stats?keys=views:site,...                       -> {counts:{...}}
//
//   GET  /api/comments                                        -> oeffentliche Liste
//   POST /api/comments {name?, text, hp}                      -> neuer Kommentar (OHNE Anmeldung)
//   POST /api/comments/admin   {password}                     -> prueft Admin-Passwort
//   POST /api/comments/remove  {id, reason, password}         -> Kommentar als "entfernt" markieren
//
// Admin-Passwort ist das Secret ADMIN_PASSWORD (NICHT im Code, in Cloudflare setzen):
//   npx wrangler secret put ADMIN_PASSWORD
// Speicher: KV-Namespace mit Bindung COUNTERS (siehe wrangler.jsonc).

const KEY_RE = /^[a-z]+:[a-z0-9-]{1,40}$/;
const ALLOWED_PREFIXES = ['views', 'video', 'download'];

const COMMENTS_KEY = 'comments';   // ein KV-Schluessel haelt die Kommentar-Liste (JSON)
const MAX_TEXT = 2000;
const MAX_NAME = 60;
const MAX_REASON = 200;
const MAX_KEEP = 500;              // hoechstens so viele Kommentare aufbewahren
const RL_TTL = 60;                 // Sekunden Sperre zwischen Posts pro IP (KV-Minimum)

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function isValidKey(key) {
  if (typeof key !== 'string' || !KEY_RE.test(key)) return false;
  return ALLOWED_PREFIXES.includes(key.split(':')[0]);
}

async function readCount(env, key) {
  const raw = await env.COUNTERS.get(key);
  const value = parseInt(raw || '0', 10);
  return Number.isFinite(value) ? value : 0;
}

// Text bereinigen: Steuerzeichen raus (ausser Zeilenumbruch/Tab), trimmen, kuerzen.
// Anzeige erfolgt im Browser ueber textContent -> HTML ist dort ohnehin wirkungslos.
function clean(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
    .slice(0, max);
}

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getComments(env) {
  const raw = await env.COUNTERS.get(COMMENTS_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_error) {
    return [];
  }
}

async function putComments(env, arr) {
  const trimmed = arr.slice(-MAX_KEEP);
  await env.COUNTERS.put(COMMENTS_KEY, JSON.stringify(trimmed));
}

async function handleComments(request, url, env) {
  // Oeffentliche Liste (neueste zuerst). Entfernte zeigen nur den Grund, nicht den Text.
  if (request.method === 'GET' && url.pathname === '/api/comments') {
    const all = await getComments(env);
    const pub = all.slice().reverse().map((c) => (c.removed
      ? { id: c.id, name: c.name, created: c.created, removed: true, removeReason: c.removeReason }
      : { id: c.id, name: c.name, created: c.created, removed: false, text: c.text }));
    return json({ comments: pub });
  }

  // Neuer Kommentar - ohne Anmeldung.
  if (request.method === 'POST' && url.pathname === '/api/comments') {
    let body = {};
    try { body = await request.json(); } catch (_error) { body = {}; }
    if (clean(body.hp, 50)) return json({ ok: true });        // Honeypot gefuellt -> Bot, still ignorieren
    const text = clean(body.text, MAX_TEXT);
    const name = clean(body.name, MAX_NAME);
    if (!text) return json({ error: 'empty' }, 400);

    // Einfache Bremse gegen Massen-Posts: gehashte IP, kurzlebig, KEINE dauerhafte IP-Speicherung.
    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (ip) {
      const rlKey = 'crl:' + (await sha256hex(ip)).slice(0, 32);
      if (await env.COUNTERS.get(rlKey)) return json({ error: 'too_fast' }, 429);
      await env.COUNTERS.put(rlKey, '1', { expirationTtl: RL_TTL });
    }

    const all = await getComments(env);
    all.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: name || null,
      text,
      created: Date.now(),
      removed: false,
      removeReason: null
    });
    await putComments(env, all);
    return json({ ok: true });
  }

  // Admin-Passwort pruefen (Moderation freischalten).
  if (request.method === 'POST' && url.pathname === '/api/comments/admin') {
    if (!env.ADMIN_PASSWORD) return json({ error: 'admin_not_configured' }, 503);
    let body = {};
    try { body = await request.json(); } catch (_error) { body = {}; }
    const ok = typeof body.password === 'string' && body.password.length > 0 && body.password === env.ADMIN_PASSWORD;
    return json({ ok });
  }

  // Kommentar als "entfernt" markieren (bleibt sichtbar, zeigt nur noch den Grund).
  if (request.method === 'POST' && url.pathname === '/api/comments/remove') {
    if (!env.ADMIN_PASSWORD) return json({ error: 'admin_not_configured' }, 503);
    let body = {};
    try { body = await request.json(); } catch (_error) { body = {}; }
    if (typeof body.password !== 'string' || body.password !== env.ADMIN_PASSWORD) {
      return json({ error: 'unauthorized' }, 401);
    }
    const id = clean(body.id, 60);
    const reason = clean(body.reason, MAX_REASON);
    if (!id || !reason) return json({ error: 'bad_request' }, 400);
    const all = await getComments(env);
    const c = all.find((x) => x.id === id);
    if (!c) return json({ error: 'not_found' }, 404);
    c.removed = true;
    c.removeReason = reason;
    await putComments(env, all);
    return json({ ok: true });
  }

  return null;   // kein Kommentar-Pfad -> weiter unten 404
}

async function handleApi(request, url, env) {
  if (!env || !env.COUNTERS) return json({ error: 'storage_not_configured' }, 503);

  if (request.method === 'GET' && url.pathname === '/api/stats') {
    const keys = (url.searchParams.get('keys') || '')
      .split(',')
      .map((k) => k.trim())
      .filter(isValidKey)
      .slice(0, 30);
    const counts = {};
    await Promise.all(keys.map(async (k) => { counts[k] = await readCount(env, k); }));
    return json({ counts });
  }

  if (request.method === 'POST' && url.pathname === '/api/hit') {
    let body = {};
    try { body = await request.json(); } catch (_error) { body = {}; }
    const key = body && body.key;
    if (!isValidKey(key)) return json({ error: 'invalid_key' }, 400);
    const next = (await readCount(env, key)) + 1;
    await env.COUNTERS.put(key, String(next));
    return json({ key, value: next });
  }

  if (url.pathname === '/api/comments' || url.pathname.startsWith('/api/comments/')) {
    const res = await handleComments(request, url, env);
    if (res) return res;
  }

  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, url, env);
    }
    // Alles andere: statische Datei ausliefern.
    if (env && env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  }
};
