// Cloudflare Worker fuer Finnvelo Programmwelten.
// Stellt anonyme Zaehler bereit (keine Cookies, keine IP-Speicherung, nur Zahlen):
//   POST /api/hit    Body {"key":"views:command-control"}  -> Zaehler +1, liefert {key,value}
//   GET  /api/stats?keys=views:site,video:archivar,...     -> {counts:{...}}
// Alle anderen Pfade werden als statische Datei ausgeliefert (env.ASSETS).
//
// Speicher: KV-Namespace mit Bindung COUNTERS (siehe wrangler.jsonc).
// Erlaubte Schluessel: <prefix>:<name>, prefix aus ALLOWED_PREFIXES,
// name = Kleinbuchstaben/Ziffern/Bindestrich (1-40 Zeichen).

const KEY_RE = /^[a-z]+:[a-z0-9-]{1,40}$/;
const ALLOWED_PREFIXES = ['views', 'video', 'download'];

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
