// Cloudflare Worker + Durable Object fuer Finnvelo Programmwelten.
// Anonyme Zaehler (keine Cookies, keine IP-Speicherung, nur Zahlen):
//   POST /api/hit    Body {"key":"views:command-control"}  -> Zaehler +1, liefert {key,value}
//   GET  /api/stats?keys=views:site,video:archivar,...     -> {counts:{...}}
//
// Speicher: Durable Object "Counter" mit SQLite. Wird beim Deploy AUTOMATISCH
// angelegt - es ist KEIN separater KV-Namespace und KEINE ID noetig.
// Erlaubte Schluessel: <prefix>:<name>, prefix aus ALLOWED_PREFIXES.

const KEY_RE = /^[a-z]+:[a-z0-9-]{1,40}$/;
const ALLOWED_PREFIXES = ['views', 'video', 'download'];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function isValidKey(key) {
  if (typeof key !== 'string' || !KEY_RE.test(key)) return false;
  return ALLOWED_PREFIXES.includes(key.split(':')[0]);
}

// --- Durable Object: haelt alle Zaehler in einer kleinen SQLite-Tabelle ---
export class Counter {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      this.state.storage.sql.exec(
        'CREATE TABLE IF NOT EXISTS counters (k TEXT PRIMARY KEY, v INTEGER NOT NULL DEFAULT 0)'
      );
    });
  }

  read(key) {
    const rows = this.state.storage.sql.exec('SELECT v FROM counters WHERE k = ?', key).toArray();
    return rows.length ? Number(rows[0].v) : 0;
  }

  increment(key) {
    // Atomar: ein einziger SQL-Befehl, daher keine verlorenen Zaehlungen.
    this.state.storage.sql.exec(
      'INSERT INTO counters (k, v) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET v = v + 1',
      key
    );
    return this.read(key);
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/api/stats') {
      const keys = (url.searchParams.get('keys') || '')
        .split(',').map((k) => k.trim()).filter(isValidKey).slice(0, 30);
      const counts = {};
      for (const k of keys) counts[k] = this.read(k);
      return json({ counts });
    }

    if (request.method === 'POST' && url.pathname === '/api/hit') {
      let body = {};
      try { body = await request.json(); } catch (_error) { body = {}; }
      const key = body && body.key;
      if (!isValidKey(key)) return json({ error: 'invalid_key' }, 400);
      return json({ key, value: this.increment(key) });
    }

    return json({ error: 'not_found' }, 404);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (!env || !env.COUNTERS) return json({ error: 'storage_not_configured' }, 503);
      const id = env.COUNTERS.idFromName('global');   // eine gemeinsame Instanz fuer alle Zaehler
      return env.COUNTERS.get(id).fetch(request);
    }
    if (env && env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  }
};
