#!/usr/bin/env node
/**
 * IndexNow – meldet geaenderte Seiten an Bing, Yandex & Co.
 *
 * WICHTIG: Google nutzt IndexNow NICHT. Fuer Google bleibt es bei
 * "Indexierung beantragen" in der Search Console.
 *
 * Aufruf (im Projektordner):
 *     node tools/indexnow.js
 *
 * Meldet automatisch alle Adressen aus sitemap.xml.
 * Sinnvoll nach jedem Veroeffentlichen, aber hoechstens ein paar Mal pro Tag.
 */
const fs = require("fs");
const path = require("path");

const SCHLUESSEL = "105b724f185a55d66cb7ccaa97b7dd88";
const HOST = "finnveloprogramme.com";

const sitemap = fs.readFileSync(path.join(__dirname, "..", "sitemap.xml"), "utf8");
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].trim());

if (!urls.length) {
  console.error("Keine Adressen in sitemap.xml gefunden.");
  process.exit(1);
}

const daten = JSON.stringify({
  host: HOST,
  key: SCHLUESSEL,
  keyLocation: `https://${HOST}/${SCHLUESSEL}.txt`,
  urlList: urls,
});

console.log(`Melde ${urls.length} Adressen an IndexNow ...`);
fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: daten,
})
  .then(r => {
    if (r.status === 200 || r.status === 202) console.log("OK – die Adressen wurden angenommen.");
    else if (r.status === 403) console.error("Fehler 403: Die Schluesseldatei wurde nicht gefunden. Ist die Seite schon veroeffentlicht?");
    else console.error("Antwort vom Dienst:", r.status, r.statusText);
  })
  .catch(e => console.error("Verbindung fehlgeschlagen:", e.message));
