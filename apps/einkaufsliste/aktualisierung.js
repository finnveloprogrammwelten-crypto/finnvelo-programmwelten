/* =====================================================================
   FINNVELO Einkaufsliste – Aktualisierung der Web-Fassung
   ---------------------------------------------------------------------
   Nur für die Fassung auf der Website. In der Android-App übernimmt das
   die App selbst, darum hält sich diese Datei dort komplett heraus.

   Zwei Wege führen zum Hinweis:
   1. Der Dienstarbeiter meldet, dass eine neue Fassung bereitliegt.
   2. version.json nennt eine höhere Aufbaunummer als die eingebaute.
   ===================================================================== */
(function () {
  "use strict";
  if (window.FINNVELO_ANDROID) return;
  if (!("serviceWorker" in navigator)) return;

  var ABSTAND = 30 * 60 * 1000;      // alle halbe Stunde nachsehen
  var schonGemeldet = false;
  var wartender = null;

  function hinweisZeigen(text) {
    if (schonGemeldet) return;
    schonGemeldet = true;
    var sagen = (typeof melde === "function")
      ? melde
      : function (t) { console.info(t); };
    sagen(text || "Neue Fassung ist da.", "gut", "Neu laden", function () {
      if (wartender) { wartender.postMessage("uebernehmen"); }
      setTimeout(function () { location.reload(); }, 150);
    });
  }

  /* --- 1 Dienstarbeiter anmelden und beobachten ---------------------- */
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").then(function (anmeldung) {

      if (anmeldung.waiting && navigator.serviceWorker.controller) {
        wartender = anmeldung.waiting;
        hinweisZeigen("Neue Fassung ist da.");
      }

      anmeldung.addEventListener("updatefound", function () {
        var neuer = anmeldung.installing;
        if (!neuer) return;
        neuer.addEventListener("statechange", function () {
          // controller gesetzt heißt: es lief schon eine Fassung, das hier ist ein Nachfolger
          if (neuer.state === "installed" && navigator.serviceWorker.controller) {
            wartender = neuer;
            hinweisZeigen("Neue Fassung ist da.");
          }
        });
      });

      // Beim Zurückkommen auf den Tellerrand schauen
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") anmeldung.update().catch(function () {});
      });
      setInterval(function () { anmeldung.update().catch(function () {}); }, ABSTAND);

    }).catch(function () { /* ohne Dienstarbeiter läuft die Seite trotzdem */ });
  });

  /* --- 2 Fassungsdatei abfragen --------------------------------------- */
  function fassungPruefen() {
    if (schonGemeldet || document.visibilityState !== "visible") return;
    fetch("version.json", { cache: "no-store" })
      .then(function (a) { return a.ok ? a.json() : null; })
      .then(function (o) {
        if (!o) return;
        var eingebaut = (typeof APP === "object" && APP) ? APP.versionCode : 0;
        if ((o.versionCode || 0) > eingebaut) {
          hinweisZeigen("Fassung " + (o.versionName || "") + " ist da.");
        }
      })
      .catch(function () { /* kein Netz, später nochmal */ });
  }

  window.addEventListener("load", function () { setTimeout(fassungPruefen, 4000); });
  setInterval(fassungPruefen, ABSTAND);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") setTimeout(fassungPruefen, 800);
  });
})();
