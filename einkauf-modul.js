/* =====================================================================
   FINNVELO Einkaufsliste – Serverteil für Cloudflare Workers
   ---------------------------------------------------------------------
   Der Server speichert die Listen nur als verschlüsselte Pakete; den
   Schlüssel hat er nie. Lesbar für ihn sind nur die Kanalkennung, der
   Gerätename des zuletzt speichernden Geräts und der Zeitpunkt.

   Einladungen (22.11.2026 überarbeitet):
   - Neuer Weg (App ab 1.5.0): Die App schickt statt des Codes nur eine
     „Kennung“ – einen langsam abgeleiteten Prüfwert des Codes (64 Hex-
     Zeichen). Der Code selbst erreicht den Server nicht mehr.
   - Alter Weg (App bis 1.4.x): Die App schickt den Code. Er wird nur als
     Prüfwert (SHA-256) als Fachname benutzt und nicht gespeichert.
   - Eine laufende Einladung lässt sich nicht überschreiben (409).
   - Öffentliches Löschen von Kanälen und Einladungen gibt es nicht mehr;
     die App hat es nie benutzt. Einen Kanal löscht der Betreiber über
     einkaufKanalLeeren() (Verwaltung im Website-Worker, mit Passwort).

   Einbau in den bestehenden Website-Worker:

     import { behandleEinkauf, EinkaufSpeicher } from "./einkauf-modul.js";
     export { EinkaufSpeicher };

     export default {
       async fetch(request, env, ctx) {
         const url = new URL(request.url);

         // WICHTIG: vor der Sammelroute /api/ einhängen,
         // sonst schluckt die Sammelroute /api/einkauf/ mit.
         if (url.pathname.startsWith("/api/einkauf/")) {
           return behandleEinkauf(request, env, url);
         }

         if (url.pathname.startsWith("/api/")) return alteApiRoute(request, env, url);
         return seitenAusliefern(request, env, url);
       }
     };

   wrangler.toml:

     [[durable_objects.bindings]]
     name = "EINKAUF"
     class_name = "EinkaufSpeicher"

     [[migrations]]
     tag = "v1"
     new_sqlite_classes = ["EinkaufSpeicher"]
   ===================================================================== */

const EINLADUNG_DAUER = 15 * 60 * 1000;   // 15 Minuten
const EINLADUNG_ZUEGE = 5;                // so oft darf ein Code eingelöst werden
// Ein Wert im Durable-Object-Speicher darf höchstens 2 MB groß sein; zum Paket
// kommen noch iv, Gerätename und Zeitstempel - darum etwas Luft (22.11.2026).
const PAKET_GRENZE    = 1900 * 1024;
const KANAL_RUHE      = 180 * 24 * 3600 * 1000; // ungenutzte Kanäle nach 180 Tagen weg
const VERSUCHE_FENSTER = 10 * 60 * 1000;  // Bremse gegen Coderaten
const VERSUCHE_GRENZE  = 25;
const LEGEN_GRENZE     = 20;              // Einladungen je Adresse und Fenster

/* --- Antworten ------------------------------------------------------- */
const KOPFZEILEN = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store"
};

function antwort(inhalt, status = 200) {
  return new Response(inhalt === null ? null : JSON.stringify(inhalt), {
    status,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, KOPFZEILEN)
  });
}
const fehler = (text, status = 400) => antwort({ fehler: text }, status);

/* --- Hilfsmittel ------------------------------------------------------ */
const CODE_ZEICHEN = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function codeGueltig(c) {
  return typeof c === "string" && c.length === 6 && c.split("").every(z => CODE_ZEICHEN.includes(z));
}
function kennungGueltig(k) {
  return typeof k === "string" && /^[0-9a-f]{64}$/.test(k);
}
function kanalGueltig(id) {
  return typeof id === "string" && id.length >= 8 && id.length <= 64 && /^[A-Za-z0-9_-]+$/.test(id);
}
function paketGueltig(p) {
  return p && typeof p.iv === "string" && typeof p.daten === "string" &&
         p.iv.length <= 64 && p.daten.length <= PAKET_GRENZE;
}
async function leseKoerper(request) {
  const laenge = Number(request.headers.get("Content-Length") || 0);
  if (laenge > PAKET_GRENZE + 4096) return null;
  try { return await request.json(); } catch (e) { return null; }
}
async function sha256hex(text) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}
// Fachname einer Einladung: neuer Weg über die Kennung, alter Weg über einen
// Prüfwert des Codes. Beide Räume sind getrennt.
async function einladungsFach(env, art, wert) {
  const name = art === "kennung" ? "kennung:" + wert : "code:" + await sha256hex("finnvelo-einkauf-code:" + wert);
  return fach(env, name);
}
// Bremsen zählen je Adresse; die Adresse selbst wird nur als Prüfwert benutzt.
async function bremsen(env, art, request, grenze) {
  const wer = request.headers.get("CF-Connecting-IP") || "unbekannt";
  const stub = fach(env, art + ":" + await sha256hex("finnvelo-einkauf-ip:" + wer));
  const z = await (await ruf(stub, "zaehlen", { fenster: VERSUCHE_FENSTER, grenze })).json();
  return !!z.erlaubt;
}
function fach(env, name) {
  return env.EINKAUF.get(env.EINKAUF.idFromName(name));
}
function ruf(stub, tat, koerper) {
  return stub.fetch("https://einkauf.intern/" + tat, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(koerper || {})
  });
}

/* --- Verwaltung (nur aus dem Website-Worker, nach Passwortprüfung) -------- */
export async function einkaufKanalLeeren(env, kanalId) {
  if (!env || !env.EINKAUF) return { ok: false, fehler: "Keine Bindung EINKAUF." };
  if (!kanalGueltig(kanalId)) return { ok: false, fehler: "Die Kanalkennung passt nicht ins Schema." };
  await ruf(fach(env, "kanal:" + kanalId), "leeren", {});
  return { ok: true };
}

/* --- Wegweiser --------------------------------------------------------- */
export async function behandleEinkauf(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: KOPFZEILEN });
  if (!env || !env.EINKAUF) return fehler("Der Dienst ist gerade nicht eingerichtet.", 503);

  // /api/einkauf/<was>/<rest…>
  const teile = url.pathname.replace(/^\/api\/einkauf\/?/, "").split("/").filter(Boolean);
  const was = teile[0] || "";

  try {
    if (was === "einladung") return await einladung(request, env, teile[1], teile[2]);
    if (was === "kanal")     return await kanal(request, env, teile[1], teile[2]);
    if (was === "wach")      return antwort({ wach: true, dienst: "FINNVELO Einkaufsliste", stand: 2 });
    return fehler("Unbekannter Weg.", 404);
  } catch (e) {
    // Keine internen Fehlermeldungen nach außen (22.11.2026)
    console.error("einkauf:", e && e.stack ? e.stack : e);
    return fehler("Serverfehler. Bitte später noch einmal versuchen.", 500);
  }
}

/* --- Einladungen -------------------------------------------------------- */
// POST /einladung            {kennung | code, salz, iv, daten}
// GET  /einladung/k/<KENNUNG> (neu)   GET /einladung/<CODE> (alt)
async function einladung(request, env, teil1, teil2) {
  if (request.method === "POST") {
    if (teil1) return fehler("Unbekannter Weg.", 404);
    const koerper = await leseKoerper(request);
    if (!koerper) return fehler("Der Inhalt ließ sich nicht lesen.");
    let art, wert;
    if (koerper.kennung !== undefined) {
      if (!kennungGueltig(koerper.kennung)) return fehler("Die Kennung passt nicht ins Schema.");
      art = "kennung"; wert = koerper.kennung;
    } else {
      if (!codeGueltig(koerper.code)) return fehler("Der Code passt nicht ins Schema.");
      art = "code"; wert = koerper.code;
    }
    if (typeof koerper.salz !== "string" || koerper.salz.length > 64) return fehler("Das Salz passt nicht.");
    if (!paketGueltig(koerper)) return fehler("Das Paket passt nicht.");
    if (!await bremsen(env, "bremse-legen", request, LEGEN_GRENZE)) return fehler("Zu viele Einladungen. Bitte zehn Minuten warten.", 429);

    const gueltigBis = Date.now() + EINLADUNG_DAUER;
    const a = await ruf(await einladungsFach(env, art, wert), "einladung-legen", {
      salz: koerper.salz, iv: koerper.iv, daten: koerper.daten,
      verfaellt: gueltigBis, zuege: EINLADUNG_ZUEGE
    });
    const inhalt = await a.json();
    if (inhalt.belegt) return fehler("Dieser Code ist gerade vergeben. Bitte einen neuen erzeugen.", 409);
    if (!a.ok || !inhalt.gelegt) return fehler("Die Einladung ließ sich nicht ablegen.", 500);
    return antwort(art === "code" ? { code: wert, gueltigBis } : { gueltigBis });
  }

  if (request.method === "GET") {
    let art, wert;
    if (teil1 === "k") {
      if (!kennungGueltig(teil2)) return fehler("Die Kennung passt nicht ins Schema.");
      art = "kennung"; wert = teil2;
    } else {
      if (teil2 || !codeGueltig(teil1)) return fehler("Der Code passt nicht ins Schema.");
      art = "code"; wert = teil1;
    }
    // Bremse gegen das Durchprobieren von Codes
    if (!await bremsen(env, "bremse", request, VERSUCHE_GRENZE)) return fehler("Zu viele Versuche. Bitte zehn Minuten warten.", 429);

    const a = await ruf(await einladungsFach(env, art, wert), "einladung-holen", {});
    const inhalt = await a.json();
    if (!inhalt || !inhalt.gefunden) return fehler("Dieser Code ist abgelaufen oder unbekannt.", 404);
    return antwort({ salz: inhalt.salz, iv: inhalt.iv, daten: inhalt.daten });
  }

  return fehler("Diese Methode ist hier nicht vorgesehen.", 405);
}

/* --- Kanäle -------------------------------------------------------------- */
async function kanal(request, env, id, unterweg) {
  if (!kanalGueltig(id)) return fehler("Die Kanalkennung passt nicht ins Schema.");
  const stub = fach(env, "kanal:" + id);

  if (unterweg === "stand" && request.method === "GET") {
    const a = await ruf(stub, "stand", {});
    return antwort(await a.json());
  }
  if (unterweg) return fehler("Unbekannter Weg.", 404);

  if (request.method === "GET") {
    const a = await ruf(stub, "lesen", {});
    const inhalt = await a.json();
    if (!inhalt.daten) return new Response(null, { status: 204, headers: KOPFZEILEN });
    return antwort(inhalt);
  }

  if (request.method === "PUT") {
    const koerper = await leseKoerper(request);
    if (!koerper) return fehler("Der Inhalt ließ sich nicht lesen.");
    if (!paketGueltig(koerper)) return fehler("Das Paket passt nicht.");
    const a = await ruf(stub, "schreiben", {
      basis: Number(koerper.basis) || 0,
      iv: koerper.iv, daten: koerper.daten,
      von: String(koerper.von || "").slice(0, 40)
    });
    const inhalt = await a.json();
    if (inhalt.konflikt) return antwort({ fehler: "Der Kanal hat sich zwischenzeitlich geändert.", version: inhalt.version }, 409);
    return antwort({ version: inhalt.version, aktualisiert: inhalt.aktualisiert });
  }

  return fehler("Diese Methode ist hier nicht vorgesehen.", 405);
}

/* =======================================================================
   Durable Object: ein Fach je Kanal, je Einladung und je Bremse
   ======================================================================= */
export class EinkaufSpeicher {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const tat = new URL(request.url).pathname.slice(1);
    let koerper = {};
    try { koerper = await request.json(); } catch (e) {}
    const s = this.state.storage;

    switch (tat) {

      /* --- Kanal --- */
      case "lesen": {
        const stand = await s.get("stand");
        if (!stand) return Response.json({ version: 0, daten: null });
        return Response.json(stand);
      }
      case "stand": {
        const stand = await s.get("stand");
        return Response.json({ version: stand ? stand.version : 0, aktualisiert: stand ? stand.aktualisiert : 0 });
      }
      case "schreiben": {
        const alt = await s.get("stand");
        const version = alt ? alt.version : 0;
        if ((koerper.basis || 0) !== version) {
          return Response.json({ konflikt: true, version });
        }
        const neu = {
          version: version + 1,
          iv: koerper.iv,
          daten: koerper.daten,
          von: koerper.von || "",
          aktualisiert: Date.now()
        };
        await s.put("stand", neu);
        await this.state.storage.setAlarm(Date.now() + KANAL_RUHE);
        return Response.json({ version: neu.version, aktualisiert: neu.aktualisiert });
      }

      /* --- Einladung --- */
      case "einladung-legen": {
        // Eine laufende Einladung wird nicht überschrieben (22.11.2026)
        const alt = await s.get("einladung");
        if (alt && Date.now() <= alt.verfaellt) return Response.json({ belegt: true });
        await s.put("einladung", {
          salz: koerper.salz, iv: koerper.iv, daten: koerper.daten,
          verfaellt: koerper.verfaellt, zuege: koerper.zuege
        });
        await this.state.storage.setAlarm(koerper.verfaellt + 1000);
        return Response.json({ gelegt: true });
      }
      case "einladung-holen": {
        const e = await s.get("einladung");
        if (!e || Date.now() > e.verfaellt) { await s.deleteAll(); return Response.json({ gefunden: false }); }
        e.zuege -= 1;
        if (e.zuege <= 0) await s.deleteAll();
        else await s.put("einladung", e);
        return Response.json({ gefunden: true, salz: e.salz, iv: e.iv, daten: e.daten });
      }

      /* --- Bremse --- */
      case "zaehlen": {
        const jetzt = Date.now();
        let z = await s.get("zaehler");
        if (!z || jetzt - z.start > koerper.fenster) z = { start: jetzt, zahl: 0 };
        z.zahl += 1;
        await s.put("zaehler", z);
        await this.state.storage.setAlarm(z.start + koerper.fenster + 1000);
        return Response.json({ erlaubt: z.zahl <= koerper.grenze, zahl: z.zahl });
      }

      /* --- Aufräumen (nur über einkaufKanalLeeren) --- */
      case "leeren": {
        await s.deleteAll();
        return Response.json({ weg: true });
      }
    }
    return Response.json({ fehler: "unbekannte Tat" }, { status: 400 });
  }

  // Läuft, wenn ein Kanal lange ruht, eine Einladung verfällt oder ein Zählfenster endet.
  async alarm() {
    const stand = await this.state.storage.get("stand");
    if (stand && Date.now() - stand.aktualisiert < KANAL_RUHE) {
      await this.state.storage.setAlarm(stand.aktualisiert + KANAL_RUHE);
      return;
    }
    await this.state.storage.deleteAll();
  }
}
