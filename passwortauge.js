/* ===================================================================
 * FINNVELO - Sichtbarkeitsauge fuer Passwortfelder
 * -------------------------------------------------------------------
 * Haengt an jedes <input type="password"> einen kleinen Augen-Knopf.
 * Ein Klick zeigt das Eingetippte im Klartext, der naechste verbirgt es
 * wieder. Voreingestellt ist immer VERBORGEN - wer mitliest, soll nichts
 * geschenkt bekommen.
 *
 * Wird von admin.html und serverstatus.html eingebunden. Beide Seiten
 * bauen ihre Felder erst zur Laufzeit zusammen, deshalb schaut ein
 * MutationObserver zu und ruestet auch spaeter erzeugte Felder nach.
 * So muss keine Seite daran denken, die Funktion selbst aufzurufen.
 * =================================================================== */
(function () {
  'use strict';

  /* Als SVG gezeichnet, nicht als Emoji: nimmt die Schriftfarbe an und sieht
     auf Tablet, Handy und Rechner gleich aus. Emoji wuerden je nach Geraet
     anders (und bunt) erscheinen. */
  var RAHMEN = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" '
             + 'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" '
             + 'stroke-linejoin="round" aria-hidden="true" focusable="false">';

  // Offenes Auge - der Inhalt ist gerade sichtbar
  var AUGE_AUF = RAHMEN
    + '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/>'
    + '<circle cx="12" cy="12" r="2.7"/></svg>';

  // Durchgestrichenes Auge - der Inhalt ist verborgen
  var AUGE_ZU = RAHMEN
    + '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/>'
    + '<circle cx="12" cy="12" r="2.7"/>'
    + '<line x1="4" y1="20" x2="20" y2="4"/></svg>';

  function istGeeignet(feld) {
    if (!feld || feld.tagName !== 'INPUT') return false;
    if (feld.getAttribute('data-auge') === 'nein') return false;   // Notausgang
    if (feld.parentNode && feld.parentNode.classList
        && feld.parentNode.classList.contains('fv-pw-huelle')) return false;  // schon fertig
    return feld.type === 'password';
  }

  function auge(feld) {
    if (!istGeeignet(feld)) return;

    // Huelle um das Feld, damit der Knopf darin sitzen kann.
    var huelle = document.createElement('span');
    huelle.className = 'fv-pw-huelle';
    feld.parentNode.insertBefore(huelle, feld);
    huelle.appendChild(feld);
    // Eigene Klasse aufs Feld: nur so kommt das CSS gegen die Regeln der
    // jeweiligen Seite an (siehe Hinweis zur Spezifitaet in styles.css).
    feld.classList.add('fv-pw-feld');

    var knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'fv-pw-auge';
    knopf.tabIndex = -1;                 // stoert das Durchtabben nicht
    knopf.innerHTML = AUGE_ZU;
    knopf.setAttribute('aria-pressed', 'false');
    knopf.setAttribute('aria-label', 'Passwort anzeigen');
    knopf.setAttribute('title', 'Anzeigen, was hier steht');

    knopf.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var zeigen = feld.type === 'password';

      // Cursorstelle merken - sonst springt sie beim Umschalten ans Ende.
      var von = feld.selectionStart, bis = feld.selectionEnd;
      var hatteFokus = (document.activeElement === feld);

      feld.type = zeigen ? 'text' : 'password';
      knopf.innerHTML = zeigen ? AUGE_AUF : AUGE_ZU;
      knopf.setAttribute('aria-pressed', zeigen ? 'true' : 'false');
      knopf.setAttribute('aria-label', zeigen ? 'Passwort verbergen' : 'Passwort anzeigen');
      knopf.setAttribute('title', zeigen ? 'Wieder verbergen' : 'Anzeigen, was hier steht');
      knopf.classList.toggle('an', zeigen);

      if (hatteFokus) {
        feld.focus();
        try { feld.setSelectionRange(von, bis); } catch (_e) { /* manche Browser mucken */ }
      }
    });

    huelle.appendChild(knopf);
  }

  function alleAbklappern(wurzel) {
    var wo = wurzel || document;
    if (!wo.querySelectorAll) return;
    // Kopie anlegen: auge() haengt Knoten um, das wuerde eine Live-Liste stoeren.
    var felder = [].slice.call(wo.querySelectorAll('input[type="password"]'));
    felder.forEach(auge);
  }

  function los() {
    alleAbklappern(document);

    // Beide Seiten schreiben ihren Inhalt zur Laufzeit neu. Der Beobachter
    // ruestet nach, ohne dass die Seiten etwas davon wissen muessen.
    if (typeof MutationObserver !== 'function' || !document.body) return;
    new MutationObserver(function (eintraege) {
      for (var i = 0; i < eintraege.length; i++) {
        var neue = eintraege[i].addedNodes;
        for (var j = 0; j < neue.length; j++) {
          var k = neue[j];
          if (k.nodeType !== 1) continue;
          if (k.tagName === 'INPUT') auge(k);
          else alleAbklappern(k);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', los);
  } else {
    los();
  }
})();
