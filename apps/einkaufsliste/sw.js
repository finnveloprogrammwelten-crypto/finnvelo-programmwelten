/* =====================================================================
   FINNVELO Einkaufsliste – Dienstarbeiter
   ---------------------------------------------------------------------
   Regeln:
   • Die Seite selbst kommt zuerst aus dem Netz. Nur wenn kein Netz da ist,
     springt der Zwischenspeicher ein. Dadurch sieht man eine neue Fassung
     sofort und hängt nie auf einer alten fest.
   • Zubehör (Symbole, Manifest, Skripte) kommt aus dem Zwischenspeicher und
     wird im Hintergrund erneuert.
   • Alles unter /api/einkauf/ geht immer ans Netz – ein zwischengespeicherter
     Abgleich wäre schlimmer als gar keiner.
   ===================================================================== */

const FASSUNG = "1.3.0";
const LAGER   = "finnvelo-einkauf-" + FASSUNG;
const DABEI   = [
  "./", "./index.html", "./manifest.webmanifest", "./aktualisierung.js",
  "./symbol-192.png", "./symbol-512.png"
];

self.addEventListener("install", ev => {
  ev.waitUntil(
    caches.open(LAGER)
      .then(lager => lager.addAll(DABEI))
      .then(() => self.skipWaiting())          // nicht auf das Schließen aller Fenster warten
  );
});

self.addEventListener("activate", ev => {
  ev.waitUntil(
    caches.keys()
      .then(namen => Promise.all(namen.filter(n => n !== LAGER).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", ev => {
  if (ev.data === "uebernehmen") self.skipWaiting();
  if (ev.data === "fassung" && ev.source) ev.source.postMessage({ fassung: FASSUNG });
});

self.addEventListener("fetch", ev => {
  const anfrage = ev.request;
  if (anfrage.method !== "GET") return;

  const url = new URL(anfrage.url);
  if (url.pathname.includes("/api/einkauf")) return;      // Abgleich nie anfassen
  if (url.origin !== location.origin) return;             // Fremdes durchreichen

  // Die Seite und die Fassungsdatei: erst Netz, dann Zwischenspeicher
  if (anfrage.mode === "navigate" || url.pathname.endsWith(".html") ||
      url.pathname.endsWith("/") || url.pathname.endsWith("version.json")) {
    ev.respondWith(
      fetch(anfrage)
        .then(antwort => {
          if (antwort && antwort.ok) {
            const kopie = antwort.clone();
            caches.open(LAGER).then(lager => lager.put(anfrage, kopie));
          }
          return antwort;
        })
        .catch(() => caches.match(anfrage).then(t => t || caches.match("./index.html")))
    );
    return;
  }

  // Zubehör: erst Zwischenspeicher, im Hintergrund erneuern
  ev.respondWith(
    caches.match(anfrage).then(treffer => {
      const ausDemNetz = fetch(anfrage).then(antwort => {
        if (antwort && antwort.ok) {
          const kopie = antwort.clone();
          caches.open(LAGER).then(lager => lager.put(anfrage, kopie));
        }
        return antwort;
      }).catch(() => treffer);
      return treffer || ausDemNetz;
    })
  );
});
