/**
 * FINNVELO Finanzmanager - Geraeteabgleich, als Modul fuer den Website-Worker.
 * Angelegt am 27.09.2026 nach dem Vorbild von tourenapi-modul.js.
 *
 * Aufgabe: den gesamten Datenbestand zwischen den PCs eines Nutzers
 * austauschen (Laptop unterwegs, PC zuhause) und eine Sicherung vorhalten,
 * falls eine Festplatte ausfaellt.
 *
 * Der Server sieht ausschliesslich Chiffrat. Der Schluessel bleibt auf den
 * Geraeten (und auf dem ausgedruckten Sicherheitszertifikat); die
 * Kanalkennung ist ein Hash davon - daraus laesst sich der Schluessel nicht
 * zurueckrechnen.
 *
 * Aufbau eines Kanals:
 *   Blobs   - je eine Datei des Programms, verschluesselt, in Teilen zu
 *             hoechstens 1,5 Mio. Zeichen (Grenze eines Eintrags: 2 MB).
 *             Unveraenderte Dateien (Belege, Fotos) liegen nur einmal da.
 *   Staende - fortlaufend nummeriert. Ein Stand ist eine verschluesselte
 *             Liste "welche Datei in welchem Blob". Die Blob-Kennungen
 *             stehen zusaetzlich im Klartext daneben - nur so weiss der
 *             Server, was er aufraeumen darf. Sie sind Zufallszahlen und
 *             verraten nichts.
 *             Aufgehoben werden die letzten 10 Staende und fuer die letzten
 *             30 Tage der letzte Stand jedes Tages (Empfehlung an Tatorasa).
 *   Anwesend - jedes laufende Programm meldet sich etwa minuetlich. Sind
 *             zwei gleichzeitig offen, warnen beide und gleichen erst ab,
 *             wenn eines geschlossen ist (Wunsch Tatorasa, 27.09.2026).
 *
 * Wege (alle unter /finanzapi/):
 *   PUT|GET|DELETE  paar/<kennung>                 Kopplungscode, 20 min
 *   GET    kanal/<k>/stand                         neuester Stand (Kopf)
 *   GET    kanal/<k>/stand/<nr>                    ein Stand mit Liste
 *   GET    kanal/<k>/staende                       alle aufgehobenen Staende
 *   PUT    kanal/<k>/blob/<id>/<teil>?teile=<n>    Teil eines Blobs
 *   GET    kanal/<k>/blob/<id>/<teil>
 *   POST   kanal/<k>/stand                         neuer Stand {basis, ...}
 *   POST   kanal/<k>/anwesend                      Lebenszeichen
 *   DELETE kanal/<k>/anwesend/<geraet>             abmelden beim Beenden
 *   DELETE kanal/<k>                               Kanal ganz loeschen
 */

const KOPF = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};
const antwort = (daten, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: KOPF });

const KENNUNG_RE = /^[A-Za-z0-9_-]{20,86}$/;
const BLOB_RE = /^[a-f0-9]{32}$/;
const GERAET_RE = /^[a-f0-9]{16,32}$/;
const TEIL_MAX = 1500000;              // Zeichen je Teil (Base64)
const LISTE_MAX = 1500000;             // verschluesselte Liste eines Stands
const KANAL_MAX = 3 * 1024 * 1024 * 1024;   // 3 GB je Kanal
const ANWESEND_MS = 150 * 1000;        // wer 2,5 min nichts sagt, ist weg
const BEHALTEN_LETZTE = 10;
const BEHALTEN_TAGE = 30;

const nrSchluessel = nr => "s:" + String(nr).padStart(10, "0");

export class FinanzKanal {
  constructor(state) { this.state = state; this.storage = state.storage; }

  async kopf() {
    return (await this.storage.get("kopf")) || { nr: 0, zeit: 0, geraet: "" };
  }

  async anwesende(ohne) {
    const jetzt = Date.now();
    const liste = [];
    const alle = await this.storage.list({ prefix: "a:" });
    for (const [schluessel, wert] of alle) {
      if (!wert || jetzt - wert.zuletzt > ANWESEND_MS) { await this.storage.delete(schluessel); continue; }
      if (wert.geraet !== ohne) liste.push(wert);
    }
    return liste;
  }

  /* Staende ausduennen, danach Blobs wegraeumen, auf die kein Stand mehr
     zeigt. Blobs, die juenger als eine Stunde sind, bleiben: Sie koennen zu
     einem Stand gehoeren, der gerade hochgeladen wird. */
  async aufraeumen() {
    const staende = [...(await this.storage.list({ prefix: "s:" })).values()].sort((a, b) => b.nr - a.nr);
    const behalten = new Set(staende.slice(0, BEHALTEN_LETZTE).map(s => s.nr));
    const grenze = Date.now() - BEHALTEN_TAGE * 24 * 60 * 60 * 1000;
    const tage = new Set();
    for (const s of staende) {
      if (s.zeit < grenze) continue;
      const tag = new Date(s.zeit).toISOString().slice(0, 10);
      if (!tage.has(tag)) { tage.add(tag); behalten.add(s.nr); }
    }
    const benutzt = new Set();
    for (const s of staende) {
      if (behalten.has(s.nr)) (s.blobs || []).forEach(id => benutzt.add(id));
      else await this.storage.delete(nrSchluessel(s.nr));
    }
    const jetzt = Date.now();
    let summe = 0;
    const infos = await this.storage.list({ prefix: "bi:" });
    for (const [schluessel, info] of infos) {
      const id = schluessel.slice(3);
      if (benutzt.has(id) || jetzt - info.zeit < 60 * 60 * 1000) { summe += info.groesse || 0; continue; }
      for (let t = 0; t < info.teile; t++) await this.storage.delete("b:" + id + ":" + t);
      await this.storage.delete(schluessel);
    }
    await this.storage.put("summe", summe);
  }

  async fetch(req) {
    const url = new URL(req.url);
    const teile = url.pathname.split("/").filter(Boolean);
    const k = teile.indexOf("kanal");
    const weg = teile.slice(k + 2);           // nach kanal/<kennung>/
    const m = req.method;

    if (m === "DELETE" && weg.length === 0) {
      await this.storage.deleteAll();
      return antwort({ ok: true });
    }

    if (weg[0] === "stand" && m === "GET" && weg.length === 1) {
      return antwort(await this.kopf());
    }
    if (weg[0] === "stand" && m === "GET" && weg.length === 2) {
      const s = await this.storage.get(nrSchluessel(Number(weg[1]) || 0));
      if (!s) return antwort({ fehler: "Diesen Stand gibt es nicht (mehr)." }, 404);
      return antwort(s);
    }
    if (weg[0] === "staende" && m === "GET") {
      const alle = [...(await this.storage.list({ prefix: "s:" })).values()]
        .map(s => ({ nr: s.nr, zeit: s.zeit, geraet: s.geraet, info: s.info || "" }))
        .sort((a, b) => b.nr - a.nr);
      return antwort({ staende: alle });
    }

    if (weg[0] === "blob" && weg.length === 3) {
      const id = weg[1];
      const teil = Number(weg[2]);
      if (!BLOB_RE.test(id) || !Number.isInteger(teil) || teil < 0 || teil > 9999) {
        return antwort({ fehler: "Blob-Angabe ungültig" }, 400);
      }
      if (m === "GET") {
        const daten = await this.storage.get("b:" + id + ":" + teil);
        if (typeof daten !== "string") return antwort({ fehler: "Blob fehlt" }, 404);
        return new Response(daten, { status: 200, headers: { ...KOPF, "Content-Type": "text/plain; charset=utf-8" } });
      }
      if (m === "PUT") {
        const anzahl = Number(url.searchParams.get("teile"));
        if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > 10000 || teil >= anzahl) {
          return antwort({ fehler: "Teilezahl ungültig" }, 400);
        }
        const daten = await req.text();
        if (!daten || daten.length > TEIL_MAX) return antwort({ fehler: "Teil zu groß" }, 400);
        const summe = (await this.storage.get("summe")) || 0;
        if (summe + daten.length > KANAL_MAX) return antwort({ fehler: "Der Kanal ist voll." }, 507);
        await this.storage.put("b:" + id + ":" + teil, daten);
        const info = (await this.storage.get("bi:" + id)) || { teile: anzahl, groesse: 0, da: [], zeit: Date.now() };
        if (!info.da.includes(teil)) { info.da.push(teil); info.groesse += daten.length; }
        info.teile = anzahl;
        info.zeit = Date.now();
        await this.storage.put("bi:" + id, info);
        await this.storage.put("summe", summe + daten.length);
        return antwort({ ok: true, vollstaendig: info.da.length === anzahl });
      }
    }

    if (weg[0] === "stand" && m === "POST" && weg.length === 1) {
      let k2;
      try { k2 = await req.json(); } catch { return antwort({ fehler: "Kein JSON" }, 400); }
      const kopf = await this.kopf();
      /* Nur auf dem Stand aufsetzen, den das Geraet zuletzt kannte. Hat
         inzwischen ein anderes hochgeladen, muss es erst abgleichen. */
      if (Number(k2.basis) !== kopf.nr) return antwort({ fehler: "Stand veraltet", nr: kopf.nr }, 409);
      if (!GERAET_RE.test(String(k2.geraet || ""))) return antwort({ fehler: "Gerät ungültig" }, 400);
      if (typeof k2.liste !== "string" || k2.liste.length > LISTE_MAX) return antwort({ fehler: "Liste ungültig" }, 400);
      const blobs = Array.isArray(k2.blobs) ? k2.blobs.filter(id => BLOB_RE.test(String(id))) : [];
      if (blobs.length > 50000) return antwort({ fehler: "Zu viele Dateien" }, 400);
      const fehlend = [];
      for (const id of new Set(blobs)) {
        const info = await this.storage.get("bi:" + id);
        if (!info || info.da.length !== info.teile) fehlend.push(id);
      }
      if (fehlend.length) return antwort({ fehler: "Blobs fehlen", fehlend: fehlend.slice(0, 50) }, 400);
      const nr = kopf.nr + 1;
      const zeit = Date.now();
      const info = typeof k2.info === "string" ? k2.info.slice(0, 2000) : "";
      await this.storage.put(nrSchluessel(nr), { nr, zeit, geraet: k2.geraet, info, liste: k2.liste, blobs: [...new Set(blobs)] });
      await this.storage.put("kopf", { nr, zeit, geraet: k2.geraet });
      await this.aufraeumen();
      return antwort({ ok: true, nr, zeit });
    }

    if (weg[0] === "anwesend" && m === "POST") {
      let k2;
      try { k2 = await req.json(); } catch { return antwort({ fehler: "Kein JSON" }, 400); }
      const geraet = String(k2.geraet || "");
      if (!GERAET_RE.test(geraet)) return antwort({ fehler: "Gerät ungültig" }, 400);
      await this.storage.put("a:" + geraet, {
        geraet,
        info: typeof k2.info === "string" ? k2.info.slice(0, 2000) : "",
        aenderung: Number(k2.aenderung) || 0,
        zuletzt: Date.now()
      });
      return antwort({ andere: await this.anwesende(geraet), stand: await this.kopf() });
    }
    if (weg[0] === "anwesend" && m === "DELETE" && weg[1]) {
      if (!GERAET_RE.test(weg[1])) return antwort({ fehler: "Gerät ungültig" }, 400);
      await this.storage.delete("a:" + weg[1]);
      return antwort({ ok: true });
    }

    return antwort({ fehler: "unbekannt" }, 404);
  }
}

/**
 * Kurzzeit-Ablage fuer die Kopplung - wie beim Tourenplaner. Hier liegt der
 * Kanalschluessel, verpackt mit einem aus dem kurzen Code abgeleiteten
 * Schluessel. 20 Minuten gueltig, hoechstens 10 Abrufe; das neue Geraet
 * loescht ihn nach dem Entpacken.
 */
export class FinanzKopplung {
  constructor(state) { this.state = state; }
  async fetch(req) {
    const jetzt = Date.now();
    if (req.method === "PUT") {
      const k = await req.json();
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

export async function behandleFinanzapi(req, env) {
  if (req.method === "OPTIONS") return new Response(null, { headers: KOPF });
  const url = new URL(req.url);
  const teile = url.pathname.split("/").filter(Boolean);

  const p = teile.indexOf("paar");
  if (p >= 0 && teile[p + 1]) {
    const kennung = teile[p + 1];
    if (!KENNUNG_RE.test(kennung)) return antwort({ fehler: "Kennung ungültig" }, 400);
    const objekt = env.FINANZ_KOPPLUNG.get(env.FINANZ_KOPPLUNG.idFromName(kennung));
    return objekt.fetch(new Request(url.toString(), req));
  }

  const i = teile.indexOf("kanal");
  if (i < 0 || !teile[i + 1]) return antwort({ fehler: "Kanalkennung fehlt" }, 400);
  const kennung = teile[i + 1];
  if (!KENNUNG_RE.test(kennung)) return antwort({ fehler: "Kennung ungültig" }, 400);
  const objekt = env.FINANZ_KANAL.get(env.FINANZ_KANAL.idFromName(kennung));
  return objekt.fetch(new Request(url.toString(), req));
}
