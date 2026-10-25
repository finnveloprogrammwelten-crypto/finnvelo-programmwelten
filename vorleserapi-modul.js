/**
 * FINNVELO Vorleser – Kopplungsdienst, als Modul für den Website-Worker (Stand 24.10.2026).
 * Vorbild: tourenapi-modul.js (gleicher Aufbau, eigene Klassen- und Bindungsnamen).
 *
 * Aufgabe: Handy und PC finden sich über den Server, gleichen ihre Daten dann DIREKT im Heimnetz ab.
 * Über den Server gehen nur zwei kleine, verschlüsselte Dinge – der Server sieht ausschließlich Chiffrat:
 *
 *   /vorleserapi/paar/<kennung>          Kopplungspaket: der lange Schlüssel, verpackt mit dem kurzen Code
 *                                         aus dem PC-Programm. 20 Minuten gültig, höchstens 10 Abrufe.
 *   /vorleserapi/treff/<kanal>[/<gerät>]  Treffpunkt: wo der PC im Heimnetz erreichbar ist (Adressen, Port).
 *
 * <kennung> und <kanal> sind Hashwerte (base64url) – daraus lassen sich weder Code noch Schlüssel zurückrechnen.
 *
 * Einbau in worker.js (wie /tourenapi/, VOR allen anderen Routen):
 *   import { behandleVorleserapi, VorleserKopplung, VorleserTreff } from "./vorleserapi-modul.js";
 *   export { …, VorleserKopplung, VorleserTreff };
 *   if (url.pathname === "/vorleserapi" || url.pathname.startsWith("/vorleserapi/")) {
 *     if (!env || !env.VORLESER_KOPPLUNG || !env.VORLESER_TREFF)
 *       return json({ fehler: "Der Vorleser-Dienst ist nicht eingerichtet (Bindungen VORLESER_KOPPLUNG und VORLESER_TREFF fehlen)." }, 503);
 *     return behandleVorleserapi(request, env);
 *   }
 *   RESERVIERT um "vorleserapi" ergänzen.
 * wrangler.jsonc:
 *   durable_objects.bindings += { "name": "VORLESER_KOPPLUNG", "class_name": "VorleserKopplung" },
 *                               { "name": "VORLESER_TREFF",    "class_name": "VorleserTreff" }
 *   migrations += { "tag": "v6", "new_sqlite_classes": ["VorleserKopplung", "VorleserTreff"] }
 */

const KOPF = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};
const antwort = (daten, status = 200) => new Response(JSON.stringify(daten), { status, headers: KOPF });
const KENNUNG = /^[A-Za-z0-9_-]{4,86}$/;

/** Kurzzeit-Ablage für die Kopplung – wie TourenKopplung. */
export class VorleserKopplung {
  constructor(state) { this.state = state; }
  async fetch(req) {
    const jetzt = Date.now();
    if (req.method === "PUT") {
      let k;
      try { k = await req.json(); } catch (_e) { return antwort({ fehler: "ungültig" }, 400); }
      if (typeof k.blob !== "string" || k.blob.length > 4000) return antwort({ fehler: "ungültig" }, 400);
      await this.state.storage.put("paket", { blob: k.blob, ablauf: jetzt + 20 * 60 * 1000, versuche: 0 });
      return antwort({ ok: true, ablauf: jetzt + 20 * 60 * 1000 });
    }
    if (req.method === "GET") {
      const p = await this.state.storage.get("paket");
      if (!p) return antwort({ fehler: "Code unbekannt oder schon benutzt" }, 404);
      if (p.ablauf < jetzt) { await this.state.storage.deleteAll(); return antwort({ fehler: "Code abgelaufen" }, 410); }
      if (p.versuche >= 10) { await this.state.storage.deleteAll(); return antwort({ fehler: "zu viele Versuche" }, 429); }
      p.versuche++;
      await this.state.storage.put("paket", p);
      return antwort({ blob: p.blob });
    }
    if (req.method === "DELETE") { await this.state.storage.deleteAll(); return antwort({ ok: true }); }
    return antwort({ fehler: "unbekannt" }, 404);
  }
}

/** Treffpunkt eines Kanals: je Gerät ein verschlüsselter Eintrag (höchstens 20, älter als 60 Tage fällt weg). */
export class VorleserTreff {
  constructor(state) { this.state = state; }
  async fetch(req) {
    const url = new URL(req.url);
    const geraet = url.searchParams.get("geraet") || "";
    const jetzt = Date.now();
    const GRENZE = 60 * 24 * 3600 * 1000;

    if (req.method === "GET") {
      const alle = await this.state.storage.list({ prefix: "g:" });
      const eintraege = [];
      for (const [schluessel, wert] of alle) {
        if (wert.zeit < jetzt - GRENZE) { await this.state.storage.delete(schluessel); continue; }
        eintraege.push({ geraet: schluessel.slice(2), blob: wert.blob, zeit: wert.zeit });
      }
      return antwort({ eintraege });
    }
    if (!KENNUNG.test(geraet)) return antwort({ fehler: "Gerätekennung ungültig" }, 400);
    if (req.method === "PUT") {
      let k;
      try { k = await req.json(); } catch (_e) { return antwort({ fehler: "ungültig" }, 400); }
      if (typeof k.blob !== "string" || k.blob.length > 4000) return antwort({ fehler: "ungültig" }, 400);
      await this.state.storage.put("g:" + geraet, { blob: k.blob, zeit: jetzt });
      const alle = [...(await this.state.storage.list({ prefix: "g:" }))].sort((a, b) => b[1].zeit - a[1].zeit);
      for (const [schluessel] of alle.slice(20)) await this.state.storage.delete(schluessel);
      return antwort({ ok: true, zeit: jetzt });
    }
    if (req.method === "DELETE") { await this.state.storage.delete("g:" + geraet); return antwort({ ok: true }); }
    return antwort({ fehler: "unbekannt" }, 404);
  }
}

export async function behandleVorleserapi(req, env) {
  if (req.method === "OPTIONS") return new Response(null, { headers: KOPF });
  const url = new URL(req.url);
  const teile = url.pathname.split("/").filter(Boolean);   // ["vorleserapi", "paar"|"treff", kennung, gerät?]

  if (teile[1] === "paar" && teile[2]) {
    if (!KENNUNG.test(teile[2])) return antwort({ fehler: "Kennung ungültig" }, 400);
    const objekt = env.VORLESER_KOPPLUNG.get(env.VORLESER_KOPPLUNG.idFromName(teile[2]));
    return objekt.fetch(new Request(url.toString(), req));
  }
  if (teile[1] === "treff" && teile[2]) {
    if (!KENNUNG.test(teile[2])) return antwort({ fehler: "Kanalkennung ungültig" }, 400);
    const ziel = new URL(url.toString());
    if (teile[3]) ziel.searchParams.set("geraet", teile[3]);
    const objekt = env.VORLESER_TREFF.get(env.VORLESER_TREFF.idFromName(teile[2]));
    return objekt.fetch(new Request(ziel.toString(), req));
  }
  return antwort({ fehler: "Diese Auskunft gibt es nicht." }, 404);
}
