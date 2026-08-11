/* =====================================================================
   FINNVELO Einkaufsliste – Serverteil für Cloudflare Workers
   ---------------------------------------------------------------------
   Der Server speichert ausschließlich verschlüsselte Pakete. Schlüssel
   und Klartext verlassen das Gerät nie.

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
const PAKET_GRENZE    = 2 * 1024 * 1024;  // 2 MB je Kanalstand
const KANAL_RUHE      = 180 * 24 * 3600 * 1000; // ungenutzte Kanäle nach 180 Tagen weg
const VERSUCHE_FENSTER = 10 * 60 * 1000;  // Bremse gegen Coderaten
const VERSUCHE_GRENZE  = 25;

/* --- Antworten ------------------------------------------------------- */
const KOPFZEILEN = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
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

/* --- Wegweiser --------------------------------------------------------- */
export async function behandleEinkauf(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: KOPFZEILEN });
  if (!env || !env.EINKAUF) return fehler("Der Server hat keine Bindung EINKAUF.", 500);

  // /api/einkauf/<was>/<rest…>
  const teile = url.pathname.replace(/^\/api\/einkauf\/?/, "").split("/").filter(Boolean);
  const was = teile[0] || "";

  try {
    if (was === "einladung") return await einladung(request, env, teile[1]);
    if (was === "kanal")     return await kanal(request, env, teile[1], teile[2]);
    if (was === "wach")      return antwort({ wach: true, dienst: "FINNVELO Einkaufsliste", stand: 1 });
    return fehler("Unbekannter Weg.", 404);
  } catch (e) {
    return fehler("Serverfehler: " + (e && e.message ? e.message : String(e)), 500);
  }
}

/* --- Einladungen -------------------------------------------------------- */
async function einladung(request, env, code) {
  if (request.method === "POST") {
    const koerper = await leseKoerper(request);
    if (!koerper) return fehler("Der Inhalt ließ sich nicht lesen.");
    if (!codeGueltig(koerper.code)) return fehler("Der Code passt nicht ins Schema.");
    if (typeof koerper.salz !== "string" || koerper.salz.length > 64) return fehler("Das Salz passt nicht.");
    if (!paketGueltig(koerper)) return fehler("Das Paket passt nicht.");

    const stub = fach(env, "code:" + koerper.code);
    const a = await ruf(stub, "einladung-legen", {
      salz: koerper.salz, iv: koerper.iv, daten: koerper.daten,
      verfaellt: Date.now() + EINLADUNG_DAUER, zuege: EINLADUNG_ZUEGE
    });
    if (!a.ok) return fehler("Die Einladung ließ sich nicht ablegen.", 500);
    return antwort({ code: koerper.code, gueltigBis: Date.now() + EINLADUNG_DAUER });
  }

  if (request.method === "GET") {
    if (!codeGueltig(code)) return fehler("Der Code passt nicht ins Schema.");

    // Bremse gegen das Durchprobieren von Codes
    const wer = request.headers.get("CF-Connecting-IP") || "unbekannt";
    const bremse = fach(env, "bremse:" + wer);
    const zaehler = await (await ruf(bremse, "zaehlen", {
      fenster: VERSUCHE_FENSTER, grenze: VERSUCHE_GRENZE
    })).json();
    if (!zaehler.erlaubt) return fehler("Zu viele Versuche. Bitte zehn Minuten warten.", 429);

    const stub = fach(env, "code:" + code);
    const a = await ruf(stub, "einladung-holen", {});
    const inhalt = await a.json();
    if (!inhalt || !inhalt.gefunden) return fehler("Dieser Code ist abgelaufen oder unbekannt.", 404);
    return antwort({ salz: inhalt.salz, iv: inhalt.iv, daten: inhalt.daten });
  }

  if (request.method === "DELETE") {
    if (!codeGueltig(code)) return fehler("Der Code passt nicht ins Schema.");
    await ruf(fach(env, "code:" + code), "leeren", {});
    return antwort({ weg: true });
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

  if (request.method === "DELETE") {
    await ruf(stub, "leeren", {});
    return antwort({ weg: true });
  }

  return fehler("Diese Methode ist hier nicht vorgesehen.", 405);
}

/* =======================================================================
   Durable Object: ein Fach je Kanal, je Code und je Bremse
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

      /* --- Aufräumen --- */
      case "leeren": {
        await s.deleteAll();
        return Response.json({ weg: true });
      }
    }
    return Response.json({ fehler: "unbekannte Tat" }, { status: 400 });
  }

  // Läuft, wenn ein Kanal lange ruht, ein Code verfällt oder ein Zählfenster endet.
  async alarm() {
    const stand = await this.state.storage.get("stand");
    if (stand && Date.now() - stand.aktualisiert < KANAL_RUHE) {
      await this.state.storage.setAlarm(stand.aktualisiert + KANAL_RUHE);
      return;
    }
    await this.state.storage.deleteAll();
  }
}
