/**
 * FINNVELO Tourenplaner - Abgleichserver, als Modul fuer den Website-Worker.
 *
 * Abweichungen gegenueber der gelieferten Fassung (server/worker.js) - bewusst,
 * nicht versehentlich:
 *
 *  1. Klasse "Kanal" heisst hier "TourenKanal". Im Website-Worker gibt es
 *     bereits eine Klasse "Kanal" (die Kanaele des Aufgabenplaners). Zwei
 *     gleichnamige Klassen in einer Datei wuerden einander ueberschreiben -
 *     im schlimmsten Fall bekaeme der Aufgabenplaner-Kanal Tourendaten.
 *     Entsprechend heissen die Bindungen TOUREN_KANAL und TOUREN_KOPPLUNG.
 *  2. Kein eigener Worker, sondern eingehaengt in den vorhandenen. Zwei Worker
 *     auf derselben Domain streiten sich um die Route - genau die Falle, die
 *     der Auftrag beschreibt (405 von der Dateiauslieferung).
 *  3. Aus "export default { fetch }" wurde "behandleTourenapi(req, env)".
 *
 * Der Rest ist unveraendert.
 */

/**
 * FINNVELO Tourenplaner — Abgleichserver
 *
 * Aufgabe: verschlüsselte Touren zwischen Geräten austauschen.
 * Der Server sieht ausschließlich Chiffrat. Der Schlüssel bleibt auf den Geräten,
 * die Kanalkennung ist ein Hash davon — daraus lässt sich der Schlüssel nicht zurückrechnen.
 *
 * Einrichtung:
 *   wrangler.toml
 *     name = "finnvelo-touren"
 *     main = "worker.js"
 *     compatibility_date = "2026-01-01"
 *     [[durable_objects.bindings]]
 *     name = "KANAL"
 *     class_name = "Kanal"
 *     [[durable_objects.bindings]]
 *     name = "KOPPLUNG"
 *     class_name = "Kopplung"
 *     [[migrations]]
 *     tag = "v1"
 *     new_sqlite_classes = ["Kanal", "Kopplung"]
 *
 *   Route auf finnveloprogramme.com/tourenapi/*
 */

const KOPF = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8"
};
const antwort = (daten, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: KOPF });

export class TourenKanal {
  constructor(state) { this.state = state; }

  async fetch(req) {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (req.method === "GET") {
      const seit = Number(url.searchParams.get("seit") || 0);
      const alle = await this.state.storage.list({ prefix: "t:" });
      const touren = [];
      for (const [, wert] of alle) if (wert.stand > seit) touren.push(wert);
      const geloescht = (await this.state.storage.get("geloescht")) || [];
      return antwort({ touren, geloescht, stand: Date.now() });
    }

    if (req.method === "PUT") {
      const koerper = await req.json();
      if (!Array.isArray(koerper.touren)) return antwort({ fehler: "touren fehlt" }, 400);
      if (koerper.touren.length > 200) return antwort({ fehler: "zu viele" }, 400);
      let zahl = 0;
      for (const t of koerper.touren) {
        if (!t.id || typeof t.blob !== "string") continue;
        if (t.blob.length > 400000) continue;                 // gut 300 KB je Tour reicht
        await this.state.storage.put("t:" + t.id, { id: t.id, blob: t.blob, stand: Date.now() });
        zahl++;
      }
      if (Array.isArray(koerper.geloescht) && koerper.geloescht.length) {
        const bisher = new Set((await this.state.storage.get("geloescht")) || []);
        for (const g of koerper.geloescht.slice(0, 200)) {
          bisher.add(g);
          await this.state.storage.delete("t:" + g);
        }
        await this.state.storage.put("geloescht", [...bisher].slice(-500));
      }
      return antwort({ ok: true, gespeichert: zahl, stand: Date.now() });
    }

    if (req.method === "DELETE" && id) {
      await this.state.storage.delete("t:" + id);
      const bisher = new Set((await this.state.storage.get("geloescht")) || []);
      bisher.add(id);
      await this.state.storage.put("geloescht", [...bisher].slice(-500));
      return antwort({ ok: true });
    }

    return antwort({ fehler: "unbekannt" }, 404);
  }
}

/**
 * Kurzzeit-Ablage für die Kopplung. Hier liegt der lange Schlüssel, verpackt mit
 * einem aus dem kurzen Code abgeleiteten Wrapper. Einmalig abrufbar, 20 Minuten gültig,
 * höchstens 10 Fehlversuche — damit ist ein kurzer Code vertretbar.
 */
export class TourenKopplung {
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

export async function behandleTourenapi(req, env) {
  {
    if (req.method === "OPTIONS") return new Response(null, { headers: KOPF });

    const url = new URL(req.url);
    const teile = url.pathname.split("/").filter(Boolean);

    // .../tourenapi/paar/<kennung> — kurzlebige Kopplung
    const p = teile.indexOf("paar");
    if (p >= 0 && teile[p + 1]) {
      const kennung = teile[p + 1];
      if (!/^[a-f0-9]{16,64}$/.test(kennung)) return antwort({ fehler: "Kennung ungültig" }, 400);
      const objekt = env.TOUREN_KOPPLUNG.get(env.TOUREN_KOPPLUNG.idFromName(kennung));
      return objekt.fetch(new Request(url.toString(), req));
    }

    // .../tourenapi/kanal/<kennung> — dauerhafter Abgleich
    const i = teile.indexOf("kanal");
    if (i < 0 || !teile[i + 1]) return antwort({ fehler: "Kanalkennung fehlt" }, 400);
    const kennung = teile[i + 1];
    if (!/^[a-f0-9]{24,64}$/.test(kennung)) return antwort({ fehler: "Kennung ungültig" }, 400);

    const objekt = env.TOUREN_KANAL.get(env.TOUREN_KANAL.idFromName(kennung));
    return objekt.fetch(new Request(url.toString(), req));
  }
}
