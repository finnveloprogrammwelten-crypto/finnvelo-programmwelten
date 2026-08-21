# Übergabe an den nächsten Chat — Finnvelo Programmwelten

Stand: 30.07.2026. Dieser Chat ist am Ende seiner Länge; hier steht
alles, was der nächste braucht.

**Mitzugeben:** dieses Dokument, das ZIP
`finnvelo-programmwelten_Webseite_zugang.zip` (kompletter Quellstand)
und bei Serverarbeit zusätzlich `SERVER-STEHT.md`.

---

## 1. Zusammenarbeit

* **Sprache: Deutsch.** Tatorasa diktiert meist per Sprache, daher
  gelegentliche Verschreiber — sinngemäß lesen, bei echter Unklarheit
  nachfragen.
* **Anrede:** Er nennt seinen Claude **„Klaus"**.
* **Nach jeder Lieferung:** kurze Aufzählung der Änderungen, keine Romane.
* **Dateien immer als ZIP** über `present_files`, nie inline.
* **Jedes Paket ist der volle Stand**, kein Zusatzpaket. In einem Ordner
  arbeiten und jedes Mal ganz einpacken.
* **Anti-Regression hat Vorrang.** Vor Änderungen den vorhandenen Code
  lesen. Nichts „ungefähr" nachbauen — bestehende Werte exakt übernehmen.
* **Wirklich testen, nicht nur behaupten.** Er testet sofort und findet
  Fehler zuverlässig. Lieber einmal mehr messen.
* **Bei Fehlern:** klar benennen, wessen Fehler es war, keine Ausflüchte.

---

## 2. Was das Projekt ist

**finnveloprogramme.com** — Hobby-Webseite mit einer Sammlung eigener
Programme. Cloudflare Workers, ein GitHub-Repository
`finnveloprogrammwelten-crypto/finnvelo-programmwelten`. Veröffentlichen
per `git push` (baut automatisch) oder `npx wrangler deploy`.

Aufbau: statische HTML-Seiten, `styles.css`, `stats.js` (der ganze
Bearbeiten-Modus), `worker.js` (Server). Zwei Durable Objects:

| Bindung | Klasse | Wofür |
|---|---|---|
| `COUNTERS` | `Counter` | Inhalte, Bilder, Zähler, Kommentare, Aufsicht |
| `KANAELE` | `Kanal` | **ein Objekt je Kanal** des Aufgabenplaners |

---

## 3. Feste Regeln — bitte einhalten

1. **Der Signaturschlüssel `finnvelo-release.jks` gehört nirgendwo hin
   außer auf Tatorasas Rechner.** Nicht ins Paket, nicht zu GitHub. In
   `.assetsignore` stehen `*.jks`, `*.keystore`, `*.p12`, `*.pem`. Beim
   Packen mit `-x '*.jks' -x 'SCHLUESSEL-WICHTIG.txt'` ausschließen und
   das fertige ZIP gegenprüfen.
2. **Nur HTML auf die Webseite. Alles Herunterladbare (APK, EXE) liegt
   bei GitHub** als Release. Cloudflare erlaubt ohnehin nur 25 MB je Datei.
3. **`mischwald.html` ist seine eigene Datei** — unverändert übernehmen,
   nie hineinschreiben.
4. **Beim Haus- und Gartenplaner immer beide Dateien liefern:** die
   eigenständige HTML *und* das Electron-ZIP.
5. **Klassennamen prüfen, bevor man sie vergibt.** `styles.css` ist groß;
   `.status` war schon vergeben und hat die Statusseite zerlegt. Neue
   Bereiche mit eigenem Kürzel versehen (z. B. `fvs-`).
6. **Reihenfolge im Worker beachten:** Der allgemeine `/api/`-Durchreicher
   muss **hinter** den besonderen Wegen stehen, sonst verschluckt er sie.
7. **Suchen-und-Ersetzen bei CSS-Klassen niemals über die ganze Datei
   laufen lassen.** Beim Umbenennen auf `fvs-` hat es JavaScript miterwischt:
   aus `f.lage` wurde `f.fvs-lage`, was JS als *Subtraktion* liest, und aus
   `getElementById('melde')` wurde `'fvs-melde'` — eine ID, die es nicht gab.
   Die Statusseite blieb dadurch stumm. Immer nur innerhalb von
   Klassen-Zeichenketten ersetzen und danach im Browser messen.
8. **Gemeinsames CSS gegen seiteneigene Regeln:** `admin.html` und
   `serverstatus.html` bringen eigene `<style>`-Blöcke mit Selektoren wie
   `.fv-login button` mit (Klasse + Element). Eine einfache Klasse in
   `styles.css` verliert dagegen — und der `<style>`-Block steht auch noch
   später im Dokument. Deshalb im gemeinsamen CSS **zwei Klassen** schreiben
   (`.fv-pw-huelle > .fv-pw-auge`). Kein `!important` nötig. Sichtbar wurde
   das daran, dass der Augen-Knopf 306 px breit war statt 34.

---

## 3b. Brücke zwischen Ziel-Zeile und App-Aktualisierung

Beide Bereiche liegen in **getrennten IIFEs** in `stats.js` und wissen
nichts voneinander. Verbunden sind sie über ein Ereignis:

```
Ziel gespeichert  ->  document.dispatchEvent('fv:ziel-gesetzt', {url})
                  ->  App-Aktualisierung hört zu und füllt ihre Felder
```

* Der Feldname für die Adresse ist **je App verschieden** (`apk` beim
  Aufgabenplaner, `download` beim Mischwaldrechner). Deshalb wird er über
  `typ === 'url'` aus `cfg.felder` gesucht, nicht fest verdrahtet.
* `versionAusName()` liest die Version aus dem Dateinamen. Bewusst streng:
  verlangt wird `[-_ ]v?ZAHL.ZAHL(.ZAHL…).apk` am Ende. `Mischwald.apk`
  ergibt nichts, `2026-01-30-App.apk` auch nicht — eine falsch geratene
  Version wäre schlimmer als gar keine, weil die App dann ein Update
  meldet, das keines ist.
* Der **Versions-Code wird nie automatisch gesetzt.** Er steht im Manifest
  der App (`versionName 7.31` ↔ `versionCode 101` — kein ableitbarer
  Zusammenhang). Das Feld wird nur gelb markiert.
* Die Automatik **speichert nicht**. Sie füllt nur aus; die `version.json`
  schreibt erst der Speichern-Knopf.

---

## 3c. Verlauf und Fehlerhinweis

**Verlauf** — Tabelle `verlauf`. Bei jedem `/api/content`-POST wandert der
*bisherige* Wert dorthin, bevor überschrieben wird. Wichtige Punkte:

* Nur bei echter Änderung (`alt.value !== value`) — sonst füllt jedes
  Anklicken eines Feldes den Verlauf mit Dubletten.
* Höchstens **10 Stände je (Seite, Block)**, ältere werden gelöscht.
* Werte über 20.000 Zeichen werden übersprungen (eingebettete Bilder).
* Der ganze Block steht in `try/catch`: ein fehlender Verlauf darf das
  Speichern nie verhindern.
* Zurückgeholt wird über den **normalen** `/api/content`-Weg — es gibt
  bewusst keinen eigenen Schreibweg. Deshalb landet der überschriebene
  Stand automatisch selbst im Verlauf.
* `/api/verlauf` gibt nur eine 160-Zeichen-Leseprobe heraus;
  `/api/verlauf/eintrag` liefert den Volltext einzeln.

**Fehlerhinweis** — `/api/fehler/anzahl` ist absichtlich schlank gehalten
(nur `COUNT` und `MAX(zeit)`); `/api/serverstatus` rechnet die ganze
Datenbank durch und wäre für einen Hinweis in der Leiste zu teuer. Gezählt
wird nur `lage >= 400` — Lage 200 sind Zugangs-Spuren, keine Fehler. Der
Zeitpunkt des letzten Hinsehens liegt im `localStorage` des Browsers.

**Beide Routen stehen vor dem catch-all `/api/`** (siehe Regel 6).

**Bereits vorhanden, nicht doppelt bauen:** Hochgeladene Bilder werden schon
seit jeher im Browser verkleinert (`downscale()` in `stats.js`, max. 1600 px,
JPEG-Qualität 0,85). Alle drei Upload-Wege gehen dort durch.

---

## 3a. Zugang: Passwort und Notfall-PIN

Verwaltet wird alles unter **`/admin`** — bewusst dort und nicht auf
`/serverstatus`, damit man auch dann herankommt, wenn die Statusseite klemmt.

| Weg | Verlangt | Wofür |
|---|---|---|
| `{aktion:"lage"}` | nichts | Ja/Nein: schon eingerichtet? |
| `{aktion:"einrichten", neu, pin}` | nichts | **nur** solange nichts gesetzt ist |
| `{password, aktion:"aendern", neu, pin?}` | Passwort | Passwort wechseln |
| `{password, aktion:"pin", pin}` | Passwort | PIN setzen/wechseln |
| `{aktion:"zuruecksetzen", pin, neu}` | PIN | Passwort ohne altes setzen |

**Wichtig:**

* Ein in der Datenbank gesetztes Passwort hat **Vorrang** vor dem Cloudflare-
  Secret `ADMIN_PASSWORD`. Ist das Secret gesetzt, ist die Ersteinrichtung
  von vornherein gesperrt.
* Passwort mind. 8 Zeichen, PIN mind. 6, beide müssen verschieden sein.
* Jeder Zugriff auf den Zugang landet als **Spur mit Lage 200** im Fehlerbuch
  und ist auf `/serverstatus` sichtbar.
* Solange nichts eingerichtet ist, steht die Ersteinrichtung offen — das ist
  Absicht (sonst kommt man nie hinein), aber der Zustand gehört kurz gehalten.

---

## 4. Stand der Webseite — fertig

Tatorasa kann **alles Inhaltliche selbst**, ohne Veröffentlichen:

* Texte, Bilder, Reihenfolgen, Status-Schilder
* eigene Text-, Bild-, Knopf- und Überschriftenfelder in jedem Abschnitt,
  mit Breite (¼ bis voll) und Abschnittswahl
* vorhandene Elemente ausblenden (rotes ✕ beim Zeigen, umkehrbar)
* Abschnitte umsortieren
* **neue Programm- und Info-Seiten anlegen, umbenennen, entfernen** —
  Inhalte ziehen beim Umbenennen mit um
* Web-Apps als HTML hochladen
* Menü „Web-Apps" und Fußzeilen-Links pflegen
* Seitentitel und Google-Beschreibung je Seite
* App-Update-Felder (`version.json`) für beliebige Programmseiten, mit
  Schalter „Aktiv / Nicht aktiv"
* Sicherung aller Inhalte herunterladen und einspielen
* Bilder-Übersicht mit Entfernen ungenutzter Bilder
* **Zugang selbst verwalten** unter `/admin`: Ersteinrichtung, Passwort
  ändern, Notfall-PIN selbst festlegen, Passwort per PIN zurücksetzen

**Nur über den Chat geht noch:** Layout und Design, neue Server-Wege,
das Logo in der Kopfzeile.

**Wichtig:** Die Sicherung ist die einzige Kopie seiner Eingaben — in den
Dateien steht nur der Ursprungstext. Ab und zu daran erinnern.

---

## 5. Stand des Servers — Kanäle und Chat

Gebaut nach `SPEZIFIKATION-Server-Kanaele-und-Chat.md` und vier
Nachträgen. **Der Server sieht nur verschlüsselte Zeichenketten.**

Alle Wege unter `/api/kanal/`:
`neu`, `salz`, `beitreten`, `rettung`, `passwortNeu`, `senden`, `holen`,
`schliessen`, `oeffnen`, `behalten`, `zustand`, `draht` (WebSocket),
`mitglieder`, `mitglieder/rolle`, `listen`, `listen/neu`,
`listen/freigeben`, `listen/sperren`, `listen/rechte`, `listen/senden`,
`listen/holen`, `listen/loeschen`, `einladung`, `einladung/neu`,
`einladung/loeschen`, `einladungen`, `anhang/neu`, `anhang`,
`anhang/liste`.

Dazu: `/koppeln?k=CODE` (Einladungsseite), `/serverstatus`
(Überwachung), `/.well-known/assetlinks.json` (mit Fingerabdruck).

**Besonderheiten, die niemand „reparieren" sollte:**

* Falscher Code und falscher Prüfwert geben **dieselbe** Antwort — das
  ist Absicht.
* Die **Geräte-Kennung verlässt den Server nie**, auch nicht in der
  Mitgliederliste. Freigaben laufen über die öffentliche Mitgliedsnummer.
* Die Listen-Routen verlangen `kennung` **und** `pruefwert` — strenger
  als die Spezifikation, so gewollt.
* `/senden` vergibt die Standnummer **selbst** (409 bei veraltet).
* Die Sammelansicht `alle` hat kein eigenes Datenpaket.
* **Aufräumen läuft über den Wecker des Kanal-Objekts:** ein Jahr ohne
  Zugriff → Vorwarnung im Feld `warnung`, eine Woche später Löschen.
  Jede Nutzung hebt sie auf, `/behalten` ist der ausdrückliche Weg.

---

## 4a. Anhänge (Bilder an Aufgaben) — Stand App 7.73

Gebaut nach `AUFTRAG-Anhaenge.md`. Drei Wege, drei Tabellen.

**Warum getrennt vom Listenpaket:** ein Listenpaket geht bei *jeder*
Änderung vollständig neu über die Leitung. Läge ein Foto darin, ginge es
bei jedem Häkchen mit.

| Tabelle | Inhalt |
|---|---|
| `anhaenge` | Kennung, Liste, Ersteller, Daten, Größe, Ladezeitpunkt |
| `anhang_geholt` | wer hat welchen Anhang abgeholt |
| `anhang_weg` | bereits aufgeräumt — **nur die Kennung**, keine Daten |

**Fristen** (Konstanten oben in `worker.js`): `ANHANG_AKTIV` 7 Tage,
`ANHANG_NOTFRIST` 14 Tage, `GERAET_VERWAIST` 30 Tage, `MAX_ANHANG` 2 MB,
`MAX_ANHANG_KANAL` 50 MB, `ANHANG_MERK` 90 Tage.

**Punkte, die niemand „vereinfachen" sollte:**

* Die Freigabe wird über **dieselbe** `darfListe()` geprüft wie bei
  `listen/holen` — nicht nachgebaut. Zwei getrennte Prüfungen gehen
  auseinander, und dann liegt das Bild offen, während die Aufgabe
  geschützt ist.
* **Der Server rührt die Daten nicht an.** Kein Umwandeln, kein
  Verkleinern, keine Vorschaubilder — alles kommt fertig verschlüsselt an.
* Die 7-Tage-Frist wird **je Anhang ab dessen Hochladen** gerechnet, nicht
  global. Sonst würde ein Handy in der Schublade dafür sorgen, dass nie
  etwas gelöscht wird.
* Ein aufgeräumter Anhang gibt **410**, kein 404 — die App lässt ihn
  daraufhin vom Ersteller neu hochladen. Auch bei 410 wird die Freigabe
  geprüft: sonst verriete schon die Wahl zwischen 410 und 404, ob es den
  Anhang je gab.
* `409` beim Hochladen ist **kein Fehlerfall** — die App wertet ihn als
  Erfolg. Die vorhandenen Daten bleiben unangetastet.
* Beim Entfernen verwaister Geräte wird **kein Listeninhalt gelöscht.**
  Das Gerät geht, die Aufgaben bleiben. Der Gründer fliegt nie raus.
* Das Aufräumen läuft **im Anfrageweg, gedrosselt** (`AUFRAEUM_TAKT`,
  10 Minuten). Der Wecker des Kanals taugt nicht dafür — der schaut nur
  einmal im Jahr nach.
* `zuletzt` wird bei jedem Weg mit Kennung gestempelt. **Ohne diesen
  Stempel gälte nie ein Gerät als aktiv**, und es würde nie etwas
  aufgeräumt.

---

## 4b. Chatfreigaben und Sofortmeldung — Stand App 7.73

Gebaut nach `AUFTRAG-Chatfreigaben.md` samt Nachtrag.

### Räume

| Raum | Wer liest mit |
|---|---|
| `allgemein` | jedes Mitglied |
| Listen-Kennung | wer für diese Liste freigegeben ist |

`ohne` und `stamm` bekommen keinen Raum. Die Prüfung läuft über
`raumErlaubt()`, das intern `darfListe()` benutzt — **dieselbe** Methode
wie `listen/holen`. Keine zweite Rechteverwaltung.

`nachrichten` hat eine Spalte `raum` (Vorgabe `allgemein`),
`freigaben` eine Spalte `seit`. Beide per `ALTER TABLE` nachgezogen.

### Wichtige Punkte

* **Der Worker reichte die Adressparameter am Draht bisher nicht durch.**
  `stub.fetch(new Request("https://kanal/draht", …))` verwarf sie. Ohne
  diese Zeile kann das Kanal-Objekt weder Raum noch Freigabe erkennen.
* **Verschlüsselung hilft hier nicht** — alle im Kanal haben denselben
  Schlüssel. Der Riegel sitzt beim Ausliefern: `webSocketMessage` schickt
  nur an Leitungen mit demselben `raum` im Attachment.
* **Ohne Freigabe wird ausdrücklich abgelehnt** (Close-Code 4403 plus
  Nachricht mit Grund), nicht stillschweigend ein leerer Raum geliefert.
* **Rückwirkend gilt nicht:** beim Nachholen zählt
  `max(freigabe.seit, seit)`. Eine erneuerte Freigabe überschreibt `seit`
  nicht (`DO UPDATE SET paket = …`, ohne `seit`) — wer schon dabei war,
  verliert seinen Verlauf nicht, nur weil das Schlüsselpaket erneuert wird.
* **Ältere App-Fassungen:** wer ohne `raum` verbindet, landet in
  `allgemein` und erlebt den bisherigen Ablauf. Kennung und Prüfwert sind
  nur für Listenräume Pflicht — solche Räume fragen alte Fassungen nie an.
  Damit ändert sich kein bestehender Weg.

### Sofortmeldung (Nachtrag)

`listen/senden` schickt über die stehende Leitung
`{art:"listen", liste, stand}` — kein Inhalt, nur der Anstoß.

* **Nicht an den Absender** (Kennung aus dem Attachment).
* **Nur an Freigegebene** — sonst verriete schon die Meldung, dass es die
  Liste gibt.
* In `try/catch`: eine misslungene Meldung darf den Upload nie kippen.

---

## 4c. Zwei Befunde vom 03.08.2026

### Der Ersteller sperrte sich aus seiner eigenen Liste aus

Gefunden beim Prüfen von `AUFTRAG-Liste-umbenennen.md`. Ablauf:

1. A legt die Liste „Arbeit" an → `offen = 1`
2. A gibt sie dem Monteur frei → **erste Freigabe setzt `offen = 0`**
3. In `freigaben` steht nur der Monteur — A nicht
4. `darfListe(l, A)` → **false**

Ergebnis: A konnte seine eigene Liste weder lesen noch beschreiben
(403), sie aber weiterhin **löschen** und ihre Rechte ändern — beides
prüft `listen.ersteller`. Diese Inkonsistenz war der Beweis, dass es
sich um ein Versehen handelte und nicht um Absicht.

**Behoben** in `darfListe()`: der Ersteller kommt immer durch. Den
Listenschlüssel hat er ohnehin, er hat ihn erzeugt.

Wirkt auf alles, was `darfListe` benutzt: Aufgaben, Anhänge, Chaträume.
Nach der Änderung liefen alle Prüfungen weiterhin durch.

### `listen/loeschen` ließ Anhänge und Chat zurück

Gelöscht wurden nur `listen` und `freigaben`. Anhänge der Liste blieben
liegen — und das Aufräumen hätte sie **nie** angefasst, weil es über die
Anhänge selbst läuft, nicht über die Liste. Sie hätten dauerhaft Platz
belegt.

Jetzt gehen mit: `anhaenge`, `anhang_geholt`, `anhang_weg` (ein 410
ergäbe ohne Liste keinen Sinn) und die `nachrichten` des Listen-Raums.

**Merke für Tests:** Der erste Prüfdurchlauf meldete „Anhänge sind mit
weg" — grün, obwohl nichts gelöscht wurde. Der Anhang war nie angelegt
worden, weil `anhang/neu` am Ersteller-Fehler oben mit 403 scheiterte.
Ein Test, der das Vorhandensein nicht zuerst nachweist, prüft nichts.

---

## 4d. Der Web-App-Upload war nie erreichbar

Gefunden am 05.08.2026, weil die Web-Apps sich nicht austauschen ließen.

`enableAppUpload()` in `stats.js` suchte den Anker

```js
root.querySelector('.program-launch a.button, .program-launch__btn')
```

**`.program-launch` gibt es auf keiner einzigen Seite des Projekts.** Die
Leiste erschien deshalb nie. Der Server konnte den Upload längst
(`POST /api/app`, `GET /api/app/<slug>`, Tabelle `apps`) — nur kam
niemand dorthin.

Der Upload sitzt jetzt in der **Ziel-Zeile** unter jedem Knopf, also
dort, wo das Ziel ohnehin gepflegt wird. Die tote Funktion ist entfernt.

* Der Slug ist `<seite>-<knopfkennung>`, damit eine Seite mehrere
  Web-Apps tragen kann, ohne dass sie sich überschreiben.
* Nach dem Hochladen wird das Ziel des Knopfes **gleich mitgesetzt** —
  sonst zeigte er weiter auf die alte Adresse.
* Schlägt das Speichern des Ziels fehl, steht die Adresse trotzdem im
  Feld und die Meldung sagt, dass „Ziel speichern" noch fehlt.

## 5I. Lesezeit 1.5.0 (21.08.2026)

Fassung **1.5.0 / 10500**.

**Die APK liegt NICHT im Paket** - sie kommt ueber GitHub Releases, wie
beim Aufgabenplaner. Alle Adressen zeigen auf
`releases/download/Lesezeit/FINNVELO-Lesezeit-1.5.0.apk`. Das spart 3,1 MB
bei jedem Deploy; der Ordner `/lesezeit/` entfaellt damit ganz.

**Berichtigung meiner Umbenennung:** Ich hatte den Paketnamen auf
`de.finnvelo.lesezeit` mitgeaendert. Das gelieferte Paket behaelt
bewusst **`de.finnvelo.lesetagebuch`** - und das ist richtig:

> Android erkennt eine App an ihrem Paketnamen. Wuerde er wechseln, gaebe
> es kein Update mehr, sondern eine **zweite App** daneben, mit leeren
> Daten. Nur der Anzeigename heisst jetzt Lesezeit.

Zurueckgesetzt und im Worker kommentiert, damit es niemand erneut
"aufraeumt".

Umbenannt wurden also: Ordner, Adresse, Programmkennung, Dateiname.
**Nicht** der Paketname.

---

## 5H. Neue Seite: Lesezeit (21.08.2026)

Programmseite `/lesezeit` angelegt - Plakette aus `Lesezeit.png`
(transparent, 960x640), Kachel auf Startseite und in der Uebersicht,
Sitemap, Zaehler, Reservierungen.

**Durchgaengig "Lesezeit":** Das gelieferte Paket hiess ueberall
"Lesetagebuch" (`/lesetagebuch/`, `FINNVELO-LESETAGEBUCH`,
`de.finnvelo.lesetagebuch`). Auf Wunsch alles umgetragen - die App wird
entsprechend angepasst:

| | vorher | jetzt |
|---|---|---|
| Ordner | `/lesetagebuch/` | `/lesezeit/` |
| Fassungsdatei | `/lesetagebuch/version.json` | `/lesezeit/version.json` |
| Programmkennung | `FINNVELO-LESETAGEBUCH` | `FINNVELO-LESEZEIT` |
| Paketname | `de.finnvelo.lesetagebuch` | `de.finnvelo.lesezeit` |
| APK | `FINNVELO-Lesetagebuch-1.3.1.apk` | `FINNVELO-Lesezeit-1.3.1.apk` |

**Eigenes Fassungsformat:** Das Lesezeit-Paket nutzt
`programm / version / versionsCode / adresse / apk / datei / paket`
statt `schluessel / versionName / versionCode / apk / hinweise`. Die
Update-Kachel hat deshalb eigene Felder; die uebrigen Apps bleiben
unberuehrt.

Der Worker liefert die Datei, vorbelegt mit 1.3.1 / 10301 - so bekommt
die App auch dann etwas Sinnvolles, wenn die Kachel noch nie angefasst
wurde.

**Wie bei /einkaufsliste:** `/lesezeit` ist die Programmseite,
`/lesezeit/` der Ordner. Beides laeuft nebeneinander, im Pruefstand
belegt.

---

## 5G. Gruene Statusschilder vereinheitlicht (21.08.2026)

Haus- und Gartenplaner, Mischwaldrechner und Aufgabenplaner trugen im
HTML die Klasse `--live` bzw. `--download`:

```css
.status--download, .status--live { background: rgba(45,204,112,.16); color:#d9ffe8; }
```

Das faerbt gruen, waehrend alle uebrigen blau sind. Die Klassen sind aus
allen Seiten entfernt - jetzt einheitlich blau. Die CSS-Regel bleibt
stehen, falls spaeter jemand bewusst gruen setzen will.

Gemessen: 9 Schilder, **eine** Farbe.

**Nicht gefunden:** das "sehr grosse Feld" beim Aufgabenplaner. Gemessen
ist sein Statuszeichen 103 px breit - **schmaler** als das des
Tourenplaners (116 px). Was der Nutzer sieht, muss also aus der Datenbank
kommen (haendisch eingetragener Inhalt), nicht aus dem HTML.

---

## 5F. Hochgeladene Bilder verloren ihre Transparenz (20.08.2026)

**Die Wurzel der schwarzen Plaketten-Rahmen.** Gefunden, nachdem der
Nutzer die Grafikadresse geschickt hat: `/api/image/mt1wmfav0n6tjd` - es
war also das hochgeladene Bild, nicht die Datei aus dem Paket.

**Ursache in `downscale()`:**

```js
var mime = (file.type === 'image/png' && w * h < 360000) ? 'image/png' : 'image/jpeg';
```

Ein PNG wurde nur unter **360000 Bildpunkten** als PNG behalten. Die
Plaketten haben 1536 x 1024 = **1572864** - sie gingen als **JPEG** raus.
JPEG kennt keine Transparenz, der durchsichtige Rand wurde schwarz.

**Jetzt entscheidet nicht die Groesse, sondern der Inhalt:** Das Bild
wird abgetastet (jeder 40. Punkt), und sobald es durchsichtige Stellen
hat, wird **WebP** gewaehlt - klein und mit Alphakanal. Kann der Browser
kein WebP, faellt er auf PNG zurueck. Ohne Transparenz bleibt es bei
JPEG, das ist fuer Fotos deutlich sparsamer.

Gemessen: `Tourenplaner.png` (1536x1024, transparent) hochgeladen ->
`image/webp`, 220 KB, Transparenz erhalten.

**Merke:** Wer ein Format nach Dateigroesse waehlt statt nach Inhalt,
verliert Eigenschaften, die am Inhalt haengen.

---

## 5E. Bildtausch war blockiert (20.08.2026)

**Gemeldet:** "Wenn ich Bilder tauschen will, kommt kein Dateiauswahl-
fenster."

**Ursache - meine Regel gegen das Ziehen (4z):**

```css
.fv-edit-on .fv-sortable-item img { -webkit-user-drag: none; pointer-events: none; }
```

`pointer-events: none` nahm nicht nur das Ziehen, sondern auch den
**Klick**. In den Kacheln liess sich damit kein Bild mehr tauschen. Auf
Programmseiten ging es weiter - die Plakette dort ist kein
`fv-sortable-item`, deshalb fiel es nicht sofort auf.

**Behoben:** `pointer-events` raus, `-webkit-user-drag: none` bleibt.
Ziehen weiter unterbunden (`draggable="false"` und `dragstart`
abgefangen), Klicken wieder moeglich. Beides gemessen.

**Merke:** `pointer-events: none` ist ein grober Hebel - er nimmt jede
Maus-Interaktion, nicht nur die unerwuenschte. Fuer Ziehen genuegen
`draggable` und `-webkit-user-drag`.

---

## 5D. Tourenplaner auf 2.0 / 1020000 (20.08.2026)

Neue Zaehlung nach einem Rueckschritt: Fassung **2.0**, Code **1020000**.

**Achtung, eigene Formel:** Der Tourenplaner rechnet **mit Versatz**:

```
1000000 + major x 10000 + minor x 100 + patch
```

2.0 ergibt damit 1020000 - nicht 20000. Die Beschriftung im Feld nennt
jetzt diese Formel; bei Aufgabenplaner und Einkaufsplaner gilt weiterhin
die einfache ohne Versatz.

**Berichtigung meiner Warnung:** Ich hatte 20000 eingetragen und gewarnt,
die Zahl sei kleiner als die bisherige 80900 - Apps wuerden kein Update
mehr anbieten. Mit **1020000** ist das gegenstandslos: Die Zahl ist
groesser, die Aktualisierung laeuft normal.

Aus einer Sprachnachricht ("zehn zwanzigtausend") war das nicht sicher zu
lesen; ein Bildschirmfoto der Kachel hat es geklaert. Bei Zahlen in
Sprachform lieber nachfragen.

---

## 5C. Draht-Zeitgrenze und Tourenapi (20.08.2026)

Nach `AUFTRAG-Chat-Durable-Object.md` und `AUFTRAG-Tourenapi.md`.

### Die Leitung brach beim Verbinden ab

Im Fehlerbuch am 12., 13., 14., 15., 16. und 20. August:
`storage operation exceeded timeout which caused object to be reset`.

**Ursache, wie im Auftrag vermutet:** Beim Verbinden wurden erst bis zu
50 Nachrichten gelesen und gesendet - und **danach** die 101-Antwort
geschickt. Bei einem gewachsenen Kanal reichte das fuer die Zeitgrenze.

**Jetzt:** Die Antwort geht sofort raus, die Nachzustellung laeuft
danach ueber `waitUntil`.

**Stolperstein, nur durch Messen gefunden:** Die Auslagerung allein
genuegte nicht. `nachreichen()` hatte keinen Haltepunkt und lief deshalb
synchron durch - gemessen gingen weiter **50 Nachrichten vor der
Antwort** raus. Erst ein `await new Promise(f => setTimeout(f, 0))` am
Anfang gibt die Antwort wirklich frei. Gemessen mit 300 Nachrichten im
Kanal: Antwort nach 1 ms, **0** Nachrichten davor.

**Aufraeumen nach Alter** ergaenzt: Nachrichten aelter als 90 Tage fallen
weg - beim **Schreiben**, hoechstens stuendlich, nie beim Verbinden.

### Tourenapi: Kennungen wurden abgewiesen

Der Dienst verlangte Hex (`[a-f0-9]`). Die App bildet den Abdruck aber
als **base64url** (`A-Z a-z 0-9 - _`) - jede echte Kennung wurde mit 400
abgewiesen.

Jetzt `[A-Za-z0-9_-]{4,86}`: base64url und Hex, ab 4 Zeichen, damit auch
die Abnahmepruefung mit `PROBE` durchgeht.

**Zur KV-Anregung des Auftrags:** Nicht umgesetzt. Der Dienst laeuft auf
Durable Objects und tut es zuverlaessig; ein Umbau waere ein eigener
Schritt mit eigenem Risiko. Sollten dort Zeitgrenzen auftreten, ist KV
der naechste Griff - der Auftrag beschreibt ihn vollstaendig.

---

## 5B. Tourenplaner auf das bewaehrte Muster (13.08.2026)

Die App meldete "alles aktuell - 8.7", obwohl 8.8 vorlag: `android.json`
kam vom Worker mit dem gespeicherten Stand 6.4, im Ordner lag 8.8.

**Entschieden: wie Aufgabenplaner und Einkaufsplaner.** Der Worker
erzeugt die Dateien, gepflegt wird ueber die Kacheln im Bearbeiten-Modus.

| Adresse | Schluessel | Kachel |
|---|---|---|
| `/tourenplaner/android.json` | `FINNVELO-TOURENPLANER-ANDROID` | Tourenplaner (Android) |
| `/tourenplaner/pc.json` | `FINNVELO-TOURENPLANER-PC` | Tourenplaner (PC) |

Vorgabe steht auf 80800 / 8.8.

**Aus dem Ordner entfernt:** `android.json`, `pc.json`, `version.json`
sowie die Weboberflaeche (`index.html`, `sw.js`, `manifest.webmanifest`,
Symbole, Hintergruende) - konsequent zur Entscheidung, keine Web-Apps
mehr anzubieten. Der Ordner `/tourenplaner/` bleibt als Ablage fuer APK
und Installer.

**Stolperstein:** `VERSION_ROUTEN` steht **zweimal** im worker.js - einmal
im Kanal-Zweig, einmal im Auslieferungszweig. Meine erste Aenderung traf
die falsche Liste, die Wege gaben weiter 404. Beim Ergaenzen also pruefen,
welche Liste tatsaechlich gelesen wird (die bei `versionPfad.endsWith`).

---


Nach `AUFTRAG-Aktualisierung-Webseite.md`. Die App meldete "alles
aktuell - 8.7", obwohl 8.8 vorlag.

**Ursache:** `android.json` und `pc.json` kamen vom **Worker** aus
gespeicherten Werten (6.4), waehrend im Ordner die Fassung 8.8 lag. Zwei
Wahrheiten, und die Datei verlor - genau der umgekehrte Fall wie beim
Einkaufsplaner, wo die Datei den Worker verdeckte.

**Geaendert:** Die Worker-Routen fuer `/tourenplaner/android.json` und
`/pc.json` sind **entfernt**. Die Dateien kommen jetzt aus dem Paket -
so, wie der Entwickler sie liefert. Damit gibt es nur noch eine Quelle.

Die beiden Kacheln "Tourenplaner (Android)" und "(PC)" sind ebenfalls
raus: Sie haetten weiter in die Datenbank geschrieben, ohne dass es
irgendetwas bewirkt - schlimmer als keine Kachel.

**Kuenftiger Ablauf:** Paket hochladen, fertig. Kein Eintragen mehr.

**Kopfzeilen geschaerft** auf `no-store, no-cache, must-revalidate` -
ohne das liefert der Zwischenspeicher die alte Fassung weiter. Dazu
`manifest.webmanifest` mit richtigem Typ.

**Die Regel, jetzt in beide Richtungen belegt:** Fuer eine Fassungsdatei
gilt *entweder* Admin-Kachel *oder* Datei im Ordner - nie beides. Wer
gewinnt, haengt davon ab, ob eine Worker-Route existiert; erkennbar an
`cache-control: no-store` (Worker) gegen `etag` (Datei).

**Offen:** `FINNVELO-Tourenplaner-8.8.apk` und die Windows-Einrichtungs-
datei sind **nicht im Paket**. Beide JSONs verweisen darauf, die Adressen
laufen ins Leere. Punkt 2 der Abnahmepruefung bleibt daher rot.

---

## 5A. Zaehlerleiste verschiebbar (13.08.2026)

Die Leiste "Besucher gesamt" lag fest bei `top:84px; right:20px` - je
nach Fensterbreite mitten ueber "Kommentare" und "Kontakt".

Jetzt: Im **Bearbeiten-Modus** anfassen und an eine freie Stelle ziehen.
Fuer Besucher bleibt sie unberuehrbar (`pointer-events:none`), damit sie
niemandem im Weg ist.

* Die Lage merkt sich der **Browser** (`localStorage`, Schluessel
  `fv_zaehler_lage`) - reine Ansichtssache, deshalb je Geraet und nicht
  auf dem Server.
* Beim Laden wird sie in den sichtbaren Bereich gezwungen: ein Fenster
  kann seit dem Ablegen kleiner geworden sein, sonst waere die Leiste
  unerreichbar.
* **Doppelklick** setzt sie an den Ausgangsplatz zurueck.

---

## 4z. Die WURZEL: natives Ziehen der Kacheln (13.08.2026)

**Gemeldet:** "Wenn ich ziehen moechte, um was zu markieren, verschiebt
er es. Das bitte blockieren."

Damit war endlich klar, wie das HTML in die Felder kam.

**Die Kacheln sind `<a>`-Elemente - und Links sind im Browser von Haus
aus ziehbar.** Wer Text markieren will und dabei etwas zu weit zieht,
startet unversehens einen nativen Ziehvorgang. Laesst er ueber einem
`contenteditable` los, fuegt der Browser die **komplette Kachel** dort
als HTML ein:

```
W<a class="program-button" href=".../aufgabenplaner" style="...">
```

Genau der Eintrag aus dem Verlauf. Alles davor - mehrfache Kacheln,
verstreute Statuszeichen, Ueberlagerungen - war Folge davon.

**Behoben an drei Stellen:**

1. `draggable="false"` auf Kacheln und ihren Bildern, dazu `dragstart`
   abgefangen. Verschieben geht weiter, aber **nur ueber den Griff**
   rechts oben.
2. In bearbeitbaren Feldern: `drop` und `dragover` verhindert - dort
   laesst sich gar nichts mehr fallen.
3. `paste` fuegt nur noch **reinen Text** ein (`insertText`), kein HTML
   aus der Zwischenablage.

Dazu im CSS `-webkit-user-drag: none`, waehrend `user-select: text`
das Markieren ausdruecklich erlaubt.

**Damit sind es drei Schichten:** Ziehen unterbunden (4z), Einfuegen
gefiltert (4x), und Altlasten aufraeumbar (4y).

---

## 4y. Knopf "Felder saeubern" (13.08.2026)

Die Reinigung beim Bearbeiten (4x) wirkt nur auf Felder, die man anfasst.
Was frueher schon verdorben gespeichert wurde, blieb liegen - und richtete
weiter Unheil an, auch nach dem Einspielen des neuen Standes.

Neuer Knopf in der Admin-Leiste: **"Felder saeubern"**. Er geht alle
Textfelder der Seite (und der globalen Ablage) durch, schickt sie durch
`sauberesHtml` und schreibt geaenderte zurueck.

* Uebersprungen werden Listen und Einstellungen (Werte, die mit `[` oder
  `{` beginnen) sowie Felder ganz ohne `<`.
* Jedes geaenderte Feld wandert normal in den **Verlauf** - nichts geht
  unwiederbringlich verloren.
* Danach laedt die Seite neu.

**Stolperstein beim Bauen:** `fetchContent(seite)` liefert eine
**Zuordnung** `{ block: eintrag }`, kein `items`-Feld. Ich hatte
`d.items.forEach` geschrieben - die Schleife lief ins Leere, der Knopf
meldete Erfolg und tat nichts. Nur der Prueflauf hat das gefunden.

---

## 4x. HTML geriet in bearbeitete Felder (13.08.2026)

**Im Verlauf nachgewiesen** - Block `s3` der Startseite:

```
13.08. 16:24  Web-App in Entwicklung<br>Desktopapp in Entwicklung
13.08. 19:13  W<a class="program-button fv-sortable-item"
              href=".../aufgabenplaner" style="font-size: cl...
```

In einem **Statuszeichen** steckte eine komplette Kachel. Daher die
mehrfachen Aufgabenplaner-Kacheln und die Ueberlagerungen - kein Fehler
in der Anzeige, sondern der Inhalt der Datenbank.

**Ursache:** `editableText` und `enableStatus` speicherten `el.innerHTML`
ungefiltert. Ein `contenteditable` **innerhalb eines `<a>`** ist heikel:
markiert man den Text und tippt darueber, zieht der Browser mitunter das
umgebende Element mit hinein. Das passierte wiederholt, auch nach dem
Zuruecksetzen ueber den Verlauf.

**Behoben** durch `sauberesHtml(el)` vor jedem Speichern:

* Erlaubt bleiben `b, strong, i, em, u, br, span` - alles fuer kurze
  Auszeichnungen Noetige.
* Alles andere wird durch seinen **Text** ersetzt; der Inhalt bleibt, die
  Struktur verschwindet.
* Auch bei erlaubten Elementen fallen alle Attribute weg (`style`,
  `class`, `href`).
* Weicht das Ergebnis vom Angezeigten ab, wird auch die Anzeige
  berichtigt - sonst steht auf dem Schirm etwas anderes als gespeichert.

Geprueft mit genau dem HTML aus dem Verlauf: Kachel raus, Text bleibt.
Fett, kursiv und Umbruch ueberstehen die Reinigung.

---

## 4w. Mehrfache Statuszeichen in einer Kachel (13.08.2026)

**Gemeldet:** "Der Aufgabenplaner ist dutzendfach ueberlagert."

Es waren nicht mehrere Programme, sondern **mehrere Statuszeichen in
DERSELBEN Kachel**: "Web-App in Entwicklung" + "Desktopapp in
Entwicklung" + weitere.

**Ursache - und die liegt bei mir:** Solange
`.program-button__status` `position: absolute` hatte, lagen alle exakt
uebereinander; man sah immer nur das oberste, doppelte Eintraege fielen
nie auf. Seit sie im Raster stehen (`grid-row: 3`, Abschnitt 4g), reihen
sie sich **nebeneinander** - und auf schmalen Schirmen schieben sie sich
ineinander.

Die doppelten Eintraege waren also schon lange in der Datenbank, nur
unsichtbar. Meine Aenderung hat sie ans Licht geholt.

**Behoben** ueber zwei CSS-Regeln:

```css
.program-button__status ~ .program-button__status { display: none !important; }
.program-button__description ~ .program-button__description { display: none !important; }
```

Nur das erste Element wird gezeigt - unabhaengig davon, wie viele in der
Datenbank stehen. **Geloescht wird nichts**, die Eintraege bleiben
erhalten und lassen sich ueber den Verlauf zurueckholen.

Gemessen bei 330, 400 und 1500 px: drei Zeichen vorhanden, eines
sichtbar, nichts laeuft ueber den Rand.

**Merke:** Beim Umstellen von `absolute` auf Rasterfluss vorher pruefen,
ob das Element mehrfach vorkommen kann. Was uebereinander lag, steht
danach nebeneinander.

---

## 4v. Verwaistes Kommentarende und graue Plaketten (13.08.2026)

### Das sichtbare "-->"

Beim Web-Ausbau habe ich in `tourenplaner.html` einen auskommentierten
Block entfernt - der Anfang `<!--` ging mit, das `-->` blieb stehen und
war als Text auf der Seite zu sehen.

**Pruefung dafuer:** Kommentare paarweise per Regex entfernen; was an
`<!--` oder `-->` uebrig bleibt, ist verwaist. Alle 22 Seiten geprueft,
eine betroffen.

Nach jedem Entfernen ganzer HTML-Bloecke diese Pruefung laufen lassen -
`node --check` findet so etwas nicht, es ist ja gueltiges HTML.

### Der graue Kasten um das Wappen

`finnvelo-plakette.webp` ist **RGB ohne Alpha** (200x212, Ecke grau 71).
In der Kopfzeile faellt das nicht auf, als grosse Plakette schon: ein
grauer Kasten um das Wappen.

Alle echten Plaketten sind **RGBA mit Transparenz**, 960x640.

Neu erzeugt: `tourenplaner-label.webp` und `einkaufsliste-label.webp` -
das Wappen mit weicher runder Maske auf transparentem Grund, im selben
Format wie die uebrigen. Umgestellt auf beiden Programmseiten **und** in
den Kacheln auf Start- und Programmseite (dort stand derselbe Fehler).

**Fuer eigene Plaketten:** einfach die Datei unter demselben Namen
ersetzen - 960x640, WebP mit Alphakanal.

---

## 4u. Die "schwarzen Streifen" (13.08.2026)

**Gemeldet** als "Ueberschattung, Ueberlagerung, Schwarzausbrueche" -
ich hatte das zunaechst als Web-App-Reste gedeutet. Es war etwas anderes.

**Ursache:** Meine Regel fuer die "ein Fenster"-Optik im Bearbeiten-Modus:

```css
.fv-edit-on .program-download-block { background: rgba(120,170,255,.035); }
```

Der flaechige Hintergrund legt sich ueber das Wappen im Seitenhintergrund
(`opacity .20`, `brightness 1.65`) und erzeugt dunkle Bahnen genau dort,
wo Bereiche liegen.

**Nachgewiesen** durch Vergleich zweier Bildschirmfotos derselben Stelle:
in der Besucheransicht ruhig, im Bearbeiten-Modus die Streifen. Damit war
klar, dass es nicht am Hintergrundbild liegt.

**Behoben:** Hintergrund entfernt, der Rahmen bleibt. Er zeigt die
Zusammengehoerigkeit von Link und Aktualisierung deutlich genug.

**Merke:** Flaechige Hintergruende sind auf dieser Webseite heikel - der
Seitenhintergrund ist ein halbtransparentes Bild. Was auf einfarbigem
Grund unauffaellig waere, wird hier als Streifen sichtbar. Im Zweifel
Rahmen statt Flaeche.

---

## 4t. Web-Ausbau abgeschlossen + 500er am Draht (13.08.2026)

### Nachgezogen beim Web-Ausbau

Der erste Durchgang hatte Reste gelassen, die erst am Bildschirmfoto
auffielen:

* **Web-Kasten INNERHALB des App-Bereichs** ("Direkt im Browser" mit
  Knopf "Auswertung jetzt oeffnen"). Er stand als `download-slot`
  *innerhalb* von `program-download-block`, nicht als eigener Abschnitt -
  deshalb griff das Entfernen des `--web`-Bereichs nicht.
* **Hinweiskaesten** `webapp-note` auf Start- und Programmseite, die auf
  das entfernte Menue verwiesen.
* **Texte** wie "Web-App · zusaetzlich als Android-App", "Zwei Wege zur
  Nutzung", Suchmaschinen-Beschreibungen.
* **Tote CSS-Regeln** (`.webapp-note`, `.nav-apps`, `.program-launch`) und
  `uploadApp()` in `stats.js`.

**Ueberschriften vereinheitlicht:** Der erste Bereich heisst jetzt auf
*jeder* Seite `Download (Android-App)`, der zweite `Download (PC-Version)`.
Vorher stand dort mal "Download", mal "Nutzen und herunterladen", mal
"Download (Windows-Programm)".

### Die 500er bei /api/kanal/draht

Fuenf am 13.08. im Abstand von rund zwei Minuten, Wortlaut
`internal error; reference = ...`. Die Meldung kommt von Cloudflare und
sagt nichts ueber die Ursache.

**Gefunden:** Der Draht wurde **ohne try/catch** an das Kanal-Objekt
weitergereicht. Jeder Fehler dort landete als nacktes "internal error" im
Fehlerbuch.

**Geaendert:**

* Weiterleitung abgesichert. Scheitert sie, steht jetzt im Fehlerbuch,
  **welcher Raum** betroffen war und was genau schiefging - und der Client
  bekommt 503 mit verstaendlichem Text statt 500.
* `NACHHOLEN` von **200 auf 50** gesenkt. Bei jedem Verbindungsaufbau
  wurden bis zu 200 Zeilen gelesen und einzeln gesendet; bei einem Handy,
  das unterwegs staendig neu verbindet, ist das genau die Last, die in die
  Zeitueberschreitung fuehrt.

**Ehrlich:** Ob das die 500er beseitigt, ist von hier aus nicht
beweisbar. Sicher ist nur, dass die naechste Meldung brauchbar sein wird.
Der Zwei-Minuten-Takt deutet auf ein Geraet, das nach jedem Fehlschlag
neu verbindet.

---

## 4s. Web-Apps vollstaendig ausgebaut (13.08.2026)

Auf ausdrueckliche Entscheidung: **die Webseite bietet nur noch Android-
Apps und PC-Programme an**, keine im Browser laufenden Fassungen.

**Entfernt:**

| Was | Umfang |
|---|---|
| Weboberflaechen | `/tourenplaner/`, `/planer/`, `mischwald.html`, `/einkaufsliste/` |
| Menue "Web-Apps" | aus allen 21 Seiten |
| Web-Download-Bereich | aus 10 Programmseiten |
| "Sofort starten"-Kaesten | aus 3 Seiten |
| Web-App-Upload | Knopf, `uploadApp`, Verwaltungsfenster, Block `w0` |
| Worker-Wege | `POST /api/app`, `GET /api/app/<slug>` |

Rund **12 MB** weniger im Deployment.

**Was bewusst BLEIBT** - und das ist der Punkt, an dem ein blindes
Loeschen Schaden angerichtet haette:

* `tourenplaner/android.json` und `tourenplaner/pc.json` - die Programme
  fragen genau diese Adressen ab. Sie kommen ohnehin vom **Worker**, der
  Ordner ist nur Ablage. Vor dem Loeschen gemessen: beide antworten auch
  ohne Weboberflaeche korrekt.
* Der Ordner `/tourenplaner/` bleibt als **Ablage fuer APK und EXE** -
  die Download-Adressen in `android.json` zeigen dorthin.

**Offen:** APK und Installer liegen noch nicht im Ordner. Die Adressen
in den Fassungsdateien zeigen auf
`finnveloprogramme.com/tourenplaner/FINNVELO-Tourenplaner-6.4.apk` -
solange dort nichts liegt, laeuft der Download ins Leere.

**Stolperstein beim Ausbau:** Beim Herausschneiden des Web-Apps-Blocks
ging `BEREICHE`/`bereichSchalter()` mit verloren - die Datei blieb
syntaktisch gueltig, aber die Schalter erschienen nicht mehr
("bereichSchalter is not defined"). Nur der Browsertest hat das gefunden.
Nach jedem Herausschneiden groesserer Bloecke also nicht nur
`node --check`, sondern auch im Browser nachsehen.

---

## 4r. Tourenplaner 6.4 eingebunden (13.08.2026)

Nach `server/AUFTRAG-Aktualisierung.md`. **Zwei getrennte Dateien**, je
eigener Schlüssel - die App liest die eine, das Windows-Programm die
andere:

| Adresse | Schlüssel | Kachel |
|---|---|---|
| `/tourenplaner/android.json` | `FINNVELO-TOURENPLANER-ANDROID` | Tourenplaner (Android) |
| `/tourenplaner/pc.json` | `FINNVELO-TOURENPLANER-PC` | Tourenplaner (PC) |

Beide kommen vom **Worker**, nicht als Datei - sonst derselbe Fehler wie
bei der Einkaufsliste. `VERSION_ROUTEN` und die `endsWith`-Prüfung
mussten dafür um `/android.json` und `/pc.json` erweitert werden; vorher
kannte der Weg nur `/version.json`.

**Nicht verwechseln:** `/tourenplaner/version.json` beschreibt die
**Weboberfläche** und hat einen ganz anderen Aufbau
(`version`/`datum`/`titel`/`hinweis`/`pflicht`). Sie bleibt **statisch**
und darf **nicht** in `VERSION_ROUTEN` - sonst überschreibt die
Fassungskachel sie mit dem falschen Format. Der Prüfstand kontrolliert
das ausdrücklich.

Das Feld heißt bei beiden `apk`, auch beim PC-Installer - so passt
dasselbe Formular. `versionCode` muss eine **Zahl** sein, kein Text.

Kopfzeilen für `/tourenplaner/*` ergänzt: `no-store` für die JSON-Dateien,
`attachment` für `.apk` und `.exe`, `Service-Worker-Allowed` für `sw.js`.

---

## 4q. Web-App-Knopf zeigte ins Leere (11.08.2026)

**Gemeldet:** "Der Knopf lädt herunter, statt die Web-App zu öffnen."

**Ursache:** Der Knopf "Web-Version öffnen" zeigte auf `/apps/` - diesen
Ordner haben wir beim Bereinigen entfernt. Das Ziel gab also 404. Auf
zehn Seiten stand dasselbe tote Ziel, weil der Block per Skript in alle
Programmseiten eingefügt worden war.

* `einkaufsliste.html` zeigt jetzt auf **`/einkaufsliste/`** - dort liegt
  die Web-Fassung wirklich.
* Auf den neun anderen Seiten wurde das tote Ziel auf `#` gesetzt; das
  richtige lässt sich im Bearbeiten-Modus über die Ziel-Zeile eintragen.

**Zum Download-Verhalten geprüft:** `Content-Disposition: attachment`
steht in `_headers` nur bei `*.apk` - dort gehört es hin. Für
`/einkaufsliste/` und `index.html` wird `text/html` ohne `disposition`
ausgeliefert; die Seite öffnet also im Browser. Am Prüfstand gemessen.

Die Regeln für `/apps/einkaufsliste/*` sind entfernt - der Ordner
existiert nicht mehr, die Regeln waren wirkungslos.

---

## 4p. Die Übertragung nach Cloudflare (11.08.2026)

**Verlauf, damit der nächste es nicht wieder falsch herum aufrollt:**

1. Push kam an, Webseite blieb alt, nirgends ein Fehler.
2. Es gab keinen `.github/workflows/`-Ordner - neu angelegt.
3. Der Workflow **läuft** seitdem, scheitert aber:
   `Der Prozess '.../npx' ist mit dem Exit-Code 1 fehlgeschlagen`.
   Das ist `wrangler deploy` ohne Zugangsdaten.

**Nötig sind zwei Geheimnisse** im GitHub-Projekt unter
*Settings → Secrets and variables → Actions*:

| Name | Woher |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens, Vorlage „Edit Cloudflare Workers" |
| `CLOUDFLARE_ACCOUNT_ID` | rechts in der Cloudflare-Übersicht |

**Heißen sie im Projekt anders** (z. B. `CF_API_TOKEN`), muss der Name in
`deploy.yml` angepasst werden - GitHub gibt kein Geheimnis heraus, dessen
Name nicht exakt stimmt, und wrangler bricht dann wortlos ab.

Der Workflow prüft das jetzt **vorher** und schreibt im Klartext hin, was
fehlt, statt mit Exit-Code 1 abzubrechen. Node steht auf 24 (20 wird von
GitHub nicht mehr unterstützt).

**Zweiter möglicher Weg:** Im Cloudflare-Dashboard zeigt der
Versionsverlauf Einträge mit Git-Symbol und Branch `main` - das Muster
von *Workers Builds*, bei dem Cloudflare selbst aus GitHub zieht. Ist das
aktiv (Einstellungen → Builds), braucht es gar keinen Workflow. Dann
`deploy.yml` löschen, damit nicht zwei Wege parallel laufen.

---

**Symptom:** Push nach GitHub lief durch, die Webseite blieb trotzdem auf
dem alten Stand - ohne Fehlermeldung irgendwo.

**Ursache:** Es gab keinen `.github/workflows/`-Ordner. Weder im
Arbeitsordner noch im Repo (`git ls-tree -r HEAD` geprüft). Ohne diese
Datei überträgt niemand von GitHub nach Cloudflare.

Neu angelegt: `.github/workflows/deploy.yml`. Läuft bei jedem Push auf
`main`, lässt sich unter *Actions* auch von Hand auslösen.

**Einmalig nötig** - zwei Geheimnisse im GitHub-Projekt unter
*Settings → Secrets and variables → Actions*:

| Name | Woher |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens, Vorlage „Edit Cloudflare Workers" |
| `CLOUDFLARE_ACCOUNT_ID` | steht rechts in der Cloudflare-Übersicht |

`.github` steht jetzt in `.assetsignore` - der Workflow gehört ins Repo,
aber nicht ins öffentliche Hosting.

**Zum Merken:** Fehlt der Workflow, ist das Ausbleiben der Wirkung das
einzige Anzeichen. Bei „ich habe gepusht, aber nichts ändert sich" also
zuerst im GitHub-Projekt unter *Actions* nachsehen: steht dort gar kein
Lauf, fehlt die Datei.

---

## 4o. version.json kam nie vom Worker (11.08.2026)

Nach `ARBEITSANWEISUNG-Webseite.md`. **Der Kern des Problems:**

> Cloudflare liefert statische Dateien aus, **bevor** der Worker gefragt
> wird. Solange unter `/einkaufsliste/version.json` eine echte Datei lag,
> lief die Update-Kachel ins Leere: sie speicherte, meldete "Gespeichert" -
> ausgeliefert wurde weiter die alte Datei.

**Zwei Ursachen, beide behoben:**

1. **Statische Dateien im Weg** - entfernt:
   `einkaufsliste/version.json`, `einkaufsliste/FINNVELO-Einkaufsliste-1.6.0.apk`,
   `einkaufsliste/FINNVELO-Einkaufsliste-1.4.1.apk`, Ordner `apps/einkaufsliste/`.
2. **Die Route fehlte im Worker.** `VERSION_ROUTEN` kannte nur
   Mischwaldrechner und Aufgabenplaner. Selbst nach dem Löschen hätte es
   404 gegeben. Ergänzt: `/einkaufsliste/version.json`,
   `/tourenplaner/version.json`, `/finnvelo/tourenplaner/version.json`.

**Erkennungsmerkmal** (aus der Anweisung, im Prüfstand nachgestellt):

| | vom Worker | statische Datei |
|---|---|---|
| `cache-control` | `no-store, no-cache, must-revalidate` | — |
| `etag` | **keiner** | vorhanden |

Erscheint wieder ein `etag`, liegt erneut eine Datei im Weg.

**Feldnamen angeglichen.** Die Einkaufsplaner-Kachel nutzte `url`/`hinweis`,
die App erwartet `apk`/`hinweise` - jetzt wie beim Aufgabenplaner. Dazu
`fest: { schluessel: 'FINNVELO-EINKAUFSPLANER' }`; ein *falscher*
Schlüssel wird von der App abgelehnt, ein *fehlender* geduldet.

**Tourenplaner nach demselben Muster** vorbereitet, mit `versionCode: 0` -
die App meldet dann "kein Update" statt eines Fehlers.

**Die eine Regel:** Für die Fassungsangabe gilt *entweder* Admin-Kachel
*oder* Datei im Ordner - nie beides. Die Datei gewinnt immer, still und
ohne Fehlermeldung.

**Merke für Tests:** `t/server.mjs` reichte nur `content-type` durch.
`cache-control: no-store` fiel unter den Tisch, und der Test konnte das
entscheidende Merkmal gar nicht prüfen. Jetzt gehen alle Kopfzeilen durch.

---

## 4n. Fehlerbuch bereinigen (11.08.2026)

`POST /api/fehler/leeren` (nur Admin) loescht Eintraege **bis zu einem
Zeitpunkt** - nicht pauschal alles. Was waehrend des Klickens
hereinkommt, bleibt dadurch erhalten.

Knopf "Liste bereinigen" neben der Ueberschrift "Letzte
Fehlermeldungen", nur sichtbar, wenn es etwas zu bereinigen gibt.
Mit Rueckfrage, weil es sich nicht rueckgaengig machen laesst.

* Das Leeren selbst wird als **Spur mit Lage 200** vermerkt - sonst
  wundert man sich spaeter, warum die Liste ploetzlich leer war.
* Danach wird `fv_fehler_gesehen` im localStorage neu gesetzt, damit auch
  der Hinweis "N neue Fehler" in der Admin-Leiste zurueckgeht.

**Stolperstein:** `zeichnen()` leert das Meldefeld. Eine Erfolgsmeldung
*vor* dem Neuabruf ist sofort wieder weg. Deshalb: erst neu zeichnen,
dann melden.

**Die Route steht vor dem catch-all `/api/`** (Regel 6).

---

## 4m. Echte Fuellanzeige je Datenbank (11.08.2026)

**Der Verbrauch wird jetzt gemessen, nicht geschaetzt.** `echteGroesse()`
nutzt `PRAGMA page_count * page_size` - das ist, was Cloudflare wirklich
begrenzt und abrechnet. Die bisherige Summe aus `LENGTH(...)`
unterschaetzt: Indizes, Verwaltungsdaten und der Verschnitt in halb
gefuellten Seiten fehlen darin (gemessen: 244 KB geschaetzt gegen 260 KB
tatsaechlich).

**Neuer Abschnitt "Speicher je Datenbank"** mit einem Balken je Objekt.
Grund: Cloudflare begrenzt **jede Datenbank einzeln**, nicht die Summe.
Ein Gesamtwert wuerde verschleiern, welches Objekt an seine Grenze kommt.
Aufgefuehrt werden das Webseiten-Objekt und jeder Kanal.

**Das Limit bleibt einstellbar - und das laesst sich nicht aendern.**
Cloudflare bietet keine Schnittstelle, ueber die ein Worker sein eigenes
Speicherlimit oder den Tarif erfragen koennte. Statt einer MB-Eingabe
gibt es jetzt eine Auswahl:

| Eingabe | Bedeutung |
|---|---|
| `1` | Workers Free - 1 GB je Datenbank |
| `2` | Workers Paid - 10 GB je Datenbank |
| Zahl | eigener Wert in MB |

Gespeichert weiterhin als Seite `system`, Block `q1`.

---

## 4l. Speicheranzeige mit Grenzwert (11.08.2026)

Statt nur "5,4 MB" zeigt die Kachel jetzt **"5,4 MB von 1 GB"** samt
Balken und Prozentwert. Farbe: grün bis 70 %, neutral bis 90 %, gelb
darüber.

**Der Grenzwert lässt sich nicht ermitteln** - wie viel Platz zur
Verfügung steht, hängt am Cloudflare-Tarif, und dafür gibt es keine
Schnittstelle. Er wird deshalb von Hand gepflegt: Knopf "ändern" in der
Kachel, Eingabe in MB. Gespeichert als Seite `system`, Block `q1`.
Vorgabe 1024 MB, falls nichts gesetzt ist.

**Drei Stolpersteine beim Bauen, alle vom Prüfstand gefunden:**

1. Der Klick-Handler war *vor* `ziel.innerHTML = html` angebunden - da
   gab es die Kachel noch gar nicht. Muss danach stehen.
2. `letzterStand` fehlte, weil eine frühere Ersetzung nicht griff.
3. `melden()` gibt es auf dieser Seite nicht (das ist `admin.html`) -
   ersetzt durch ein eigenes `sagWas()`.

Merke: Nach jeder Einfügung in `serverstatus.html` den Skriptblock
extrahieren und mit `node --check` prüfen - stille Ausfälle sind hier
besonders teuer, weil die Seite dann einfach nichts tut.

---

## 4k. Zwei gemeldete Fehler (11.08.2026)

### Die Versionsnummer wurde stillschweigend ueberschrieben

**Gemeldet:** "Ich trage 1.9 ein, er macht 1.7 daraus. Ich muss es dann
manuell in der JSON aendern."

**Ursache:** `uebernehmen()` in `stats.js` schrieb die aus dem Dateinamen
gelesene Version **immer** ins Feld - auch wenn dort schon etwas stand.
Wer 1.9 eintrug und danach ein Ziel speicherte, das noch auf
`...-1.7.0.apk` zeigte, bekam wieder 1.7.

**Jetzt:** Ein gefuelltes Versionsfeld bleibt unangetastet. Bei einer
Unstimmigkeit wird es gelb markiert, und die Meldung nennt beides: was im
Dateinamen steht und was im Feld. Nur ein **leeres** Feld wird gefuellt.

Grundsatz: Was der Mensch selbst eingetragen hat, hat Vorrang vor dem,
was die Automatik erraten kann.

### "storage operation exceeded timeout" am Draht

Im Fehlerbuch dreimal 500 bei `/api/kanal/draht`, zweimal bei
`/api/kanal/listen`.

**Wahrscheinlichste Ursache:** Bei *jedem* Verbindungsaufbau und *jeder*
Anfrage mit Kennung wurde `UPDATE mitglieder SET zuletzt` geschrieben.
Ein Handy, das unterwegs staendig neu verbindet, erzeugt hunderte
Schreibvorgaenge am Tag; jeder haelt das Objekt kurz auf.

**Jetzt:** `stempelWennNoetig()` schreibt hoechstens **einmal pro Stunde**
(`STEMPEL_TAKT`). Gemessen: 50 Anfragen -> 1 Schreibvorgang statt 50.
An dem Stempel haengen nur Fristen von 7 und 30 Tagen.

**Ehrlich dazu:** Ob das die Zeitueberschreitungen ganz beseitigt, laesst
sich von hier aus nicht beweisen. Es ist die naheliegendste Last, die
sich ohne Risiko senken liess. Falls die 500er bleiben, waere der
naechste Verdacht das Nachholen von bis zu 200 Nachrichten beim
Verbinden.

---

## 4j. „Sofort starten" hängt am Web-Schalter (10.08.2026)

Zur Web-Fassung gehören **zwei** Stellen auf der Seite: der
`.program-launch`-Kasten weiter oben („Sofort starten") und der
Download-Bereich `--web`. Ein Schalter für beide — wer keine Web-App hat,
will nicht an zwei Stellen daran denken.

`BEREICHE[web].wahl` ist deshalb ein **Komma-Selektor**:
`.program-download-block--web, .program-launch`.

**Zwei Fallen dabei, beide vom Prüfstand gefunden:**

1. **Komma-Selektor plus String-Verkettung ergibt Unsinn.** Aus
   `b.wahl + ' .fv-bereich-schalter'` wurde `„a" ODER
   „b .fv-bereich-schalter"` — der erste Teil traf den Bereich selbst,
   also galt der Schalter als schon vorhanden und wurde nie gebaut. Jetzt
   wird über `querySelectorAll` gegangen statt Zeichenketten zu kleben.
2. **`display: grid` schlägt `hidden`.** Ein abgeschalteter
   `.program-launch` blieb für Besucher sichtbar, obwohl `hidden` gesetzt
   war. Am Ende von `styles.css` steht jetzt
   `.program-launch[hidden] { display: none !important; }` — bewusst
   ganz unten, damit es nicht seinerseits überschrieben wird.

3. **Die Schalterleiste zerlegte das Raster.** `.program-launch` ist ein
   Grid mit zwei Spalten. Die eingefügte Leiste besetzte die erste Spalte,
   dadurch rutschte der Text nach rechts und der Knopf nach unten — genau
   das, was auf dem Bildschirmfoto zu sehen war. `.fv-bereich-leiste` hat
   jetzt `grid-column: 1 / -1` und bekommt eine eigene volle Zeile. Bei
   Bereichen ohne Raster hat die Zeile keine Wirkung.

`.program-launch` gibt es auf `einkaufsliste.html`, `tourenplaner.html`
und in der Vorlage. Auf Seiten ohne den Kasten greift der Schalter
einfach nur auf den Download-Bereich.

---

## 4i. Drei getrennte Fenster (10.08.2026)

Reihenfolge auf jeder Programmseite: **Web-Version → App → PC**.
Jedes Fenster kennt **nur seine eigene Fassung** — keine Reiter, kein
Umschalten.

| Fenster | Klasse | Kachel zeigt |
|---|---|---|
| Web-Version | `--web` | nur `web.url` |
| App | (keine) | `versionName`, `versionCode`, `apk`, `hinweise` |
| PC | `--pc` | `pc.*` |

**Achtung beim App-Selektor:** er muss *beide* Sonderformen ausschließen
(`:not(--pc):not(--web)`), sonst greift er auf alle drei zu.

Link und Aktualisierung sind optisch **ein** Fenster (Rahmen um
`.program-download-block` im Bearbeiten-Modus).

Alle drei einzeln ein-/ausblendbar, Zustand weiter in Block `y0`.

### Der Wettlauf beim Speichern

Drei Kacheln schreiben in dieselbe `version.json`. Zwei Vorkehrungen:

1. Vor dem Zusammenbauen wird der **frische** Stand geladen.
2. Alle Speichervorgänge laufen über eine gemeinsame **Warteschlange**
   (`anstellen()`), also nacheinander statt gleichzeitig.

**Offen und ehrlich:** Werden alle drei Knöpfe im selben Augenblick
gedrückt (per Skript möglich, von Hand kaum), kann eine Fassung
verlorengehen. Einzeln gespeichert — die reale Bedienung — bleibt alles
erhalten; das ist einzeln nachgemessen. Wirklich dicht wäre erst ein
serverseitiges Zusammenführen (PATCH statt PUT).

---

## 4h. Eine Aktualisierung je Download-Bereich (10.08.2026)

Statt einer Kachel mit drei Reitern gibt es jetzt **zwei Kacheln**:

| Kachel hängt unter | zeigt |
|---|---|
| `program-download-block` (App) | Android-App + Web-Version |
| `program-download-block--pc` | PC-Version |

`bauen(daten, welche, wohin)` nimmt die Fassungen und den Zielabschnitt
entgegen. Die Web-Fassung sitzt bei der App-Kachel, weil sie keinen
eigenen Download-Bereich hat — sie wird ja nicht geladen, sondern im
Browser geöffnet.

**Zwei Fallen, beide vom Prüfstand gefunden:**

1. **Die eine Kachel hätte die andere totgeschrieben.** `ausFeldern()`
   baute das Objekt aus den eigenen Feldern — die PC-Felder kennt die
   App-Kachel gar nicht, also wäre `pc` beim Speichern verschwunden.
   Jetzt setzt jede Kachel auf `grundstand` auf (dem zuletzt geladenen
   Stand) und überschreibt nur ihre eigenen Fassungen. Nach dem Speichern
   meldet sie `fv:version-gespeichert`, damit die andere nachzieht statt
   mit veralteten Daten weiterzuarbeiten.

2. **Jede Kachel übernahm jedes Ziel.** `uebernehmen()` schrieb in den
   eigenen aktiven Reiter — bei zwei Kacheln also in beide. Ein
   PC-Download überschrieb dabei die Android-Version. Das Ereignis
   `fv:ziel-gesetzt` trägt jetzt den Knopf mit; zuständig ist die Kachel,
   in deren `program-download-block` er steht. Eine Web-Meldung nimmt nur
   die Kachel an, die die Web-Fassung führt.

**Verhaltensänderung, die man kennen muss:** Früher galt der offene
Reiter. Jetzt gilt der **Bereich, in dem der Knopf steht** — ein Ziel im
App-Bereich landet in der App-Fassung, egal was in der PC-Kachel offen
ist. Das ist der Sinn der Trennung, aber `t/pruef_fassungen.py` musste
dafür angepasst werden.

---

## 4g. Zwei Download-Bereiche + Statuszeichen (10.08.2026)

**Zwei Bereiche je Programmseite.** `program-download-block` (App) und
neu `program-download-block--pc`. In alle 10 Seiten mit Download-Bereich
eingefügt, per Skript, damit keine vergessen wird — **und in
`programmSeite()` im Worker**, damit auch über „+ Seite" angelegte
Programme beide Bereiche bekommen.

`infoSeite()` bleibt bewusst ohne Download-Bereich: Info-Seiten sind für
Texte gedacht, nicht für Programme.

Schalter je Bereich, Zustand in Block **`y0`** je Seite
(`{"pc": true}` = ausgeblendet). Läuft in `applyOverrides`, also **auch
für Besucher** — sonst sähen sie einen abgeschalteten Bereich.

Im Bearbeiten-Modus wird ein abgeschalteter Bereich nur *gedämpft*
(`.fv-bereich-aus`, `opacity: .42`), nicht versteckt — sonst gäbe es
keinen Weg zurück.

**Statuszeichen der Kacheln.** Lag `position: absolute` über der
Plakette. Bei „Web-App in Entwicklung, Desktopapp in Entwicklung" wuchs
es über drei Zeilen und verdeckte sie vollständig (vom Nutzer per
Bildschirmfoto belegt). Jetzt `position: static`, `grid-row: 3` — unter
der Beschreibung.

Bewusst über **CSS**, nicht über geänderten HTML-Aufbau: so wirkt es auch
für Kacheln, die erst zur Laufzeit entstehen (angelegte Programme). Die
Mindestbreite `min-width` auf schmalen Schirmen wurde auf 0 gesetzt, sonst
brach der Text mitten im Wort um.

Geprüft mit genau dem langen Text aus dem Bildschirmfoto, auf 1500 und
390 px, für alle 9 Kacheln: keine Überdeckung mehr.

---

## 4f. Der Web-App-Upload zerstörte die APK-Adresse (10.08.2026)

**Gemeldet, bestätigt, behoben.** Ablauf des Fehlers:

1. Reiter „Android-App" ist offen (Vorgabe)
2. Web-App hochladen → `zielMelden(res.url)`
3. `uebernehmen()` schrieb in den **gerade offenen** Reiter
4. Die Adresse der Web-App landete im APK-Feld — **die
   Download-Adresse der Android-App war weg**

Das Ereignis `fv:ziel-gesetzt` trägt jetzt ein `art`-Feld:

| Auslöser | `art` | Zielt auf |
|---|---|---|
| Knopf „Ziel speichern" | `''` | den offenen Reiter |
| Web-App-Upload | `'web'` | **immer** die Web-Fassung |

Bei `art === 'web'` wird nur `web.url` gesetzt, der Web-Reiter geöffnet
und gemeldet — Versionsnummer und Code gibt es dort nicht.

Geprüft wird ausdrücklich der gefährliche Fall: Upload bei offenem
Android-Reiter, danach Vergleich der APK-Adresse mit dem Wert davor.
Zusätzlich derselbe Fall bei offenem PC-Reiter.

---

## 4e. Mehrere Fassungen je Programm (10.08.2026)

`PLATTFORMEN` in `stats.js`: Android (Schlüssel `''`), PC (`pc`), Web
(`web`, nur Adresse). Reiter in der Update-Kachel, Feldkennungen tragen
den Schlüssel als Vorsatz (`pc.versionName`).

**Die eine Entscheidung, die alles trägt:** Die Android-Felder bleiben
auf der **obersten Ebene** der `version.json`. Verteilte Apps lesen genau
`versionCode`, `versionName` und `apk`/`url`. Kämen sie in einen eigenen
Block, würde **keine App auf einem Gerät je wieder ein Update bemerken** —
und man merkte es erst, wenn sich Wochen später niemand aktualisiert hat.
Weitere Fassungen liegen deshalb als Unterblock daneben.

* Leere Fassungen werden mit `delete o[schluessel]` entfernt, statt leere
  Blöcke zu schreiben.
* Die Web-Fassung erlaubt auch einen Pfad (`/apps/...`), die anderen
  verlangen `https://` — ein Download muss absolut sein.
* Die Übernahme aus der Ziel-Zeile schreibt in den **gerade offenen**
  Reiter (`.fv-update-reiter__k.an`).

**Merke für Tests:** Die Ablage heißt je App verschieden (`aufgabenplaner`,
`mischwald`, `einkaufsliste`) — nicht wie die Seite. Wer die falsche liest,
bekommt `{}` und hält ein funktionierendes Speichern für kaputt.

---

## 5c. Einkaufsliste 1.6.0 (10.08.2026)

Wieder reines Fassungsupdate: `einkauf-modul.js` **byte-gleich**, nur
`index.html`, `laden.html`, `sw.js`, `version.json` und die neue APK.
Damit ist es das dritte Paket in Folge ohne Änderung am Dienst.

**Faustregel für künftige Pakete:** zuerst
`diff einkauf-modul.js <paket>/worker/einkauf-modul.js`. Kommt nichts
zurück, ist es ein Fassungsupdate — dann reichen die fünf Dateien und
das Nachziehen der Vorgabewerte in `APPS` (`stats.js`). Der Worker, die
Bindungen und `wrangler.jsonc` bleiben unangetastet.

Ältere APKs bleiben liegen (1.4.1 am neuen Ort, 1.3.0/1.4.0 unter
`/apps/einkaufsliste/`).

---

## 5c. Einkaufsliste 1.6.0 (10.08.2026)

Wieder reines Fassungsupdate: `einkauf-modul.js` **byte-gleich**, nur
`index.html`, `laden.html`, `sw.js`, `version.json` und die neue APK.
Vorgabe in `APPS` auf 10600/1.6.0 gesetzt. APK 1.4.1 bleibt liegen.

---

## 5b. Einkaufsliste 1.4.1 — neuer Ort (10.08.2026)

Das Paket legt die Web-Fassung nach **`/einkaufsliste/`** statt
`/apps/einkaufsliste/`. `einkauf-modul.js` ist wieder byte-gleich.

**Die Kollision, die das Paket nicht kennen konnte:** `/einkaufsliste`
ist bereits die **Programmseite** (`einkaufsliste.html`). Gemessen im
Prüfstand: beides läuft nebeneinander —

| Adresse | liefert |
|---|---|
| `/einkaufsliste` | Programmseite |
| `/einkaufsliste/` | Web-App |

Die Web-Fassung trägt dafür `<base href="/einkaufsliste/">`.
**Das ist am Prüfstand belegt, nicht live.** Cloudflare könnte
`/einkaufsliste/` auf `/einkaufsliste` normalisieren — nach dem
Veröffentlichen als Erstes prüfen.

**`_headers` lag im Unterordner und war damit wirkungslos.** Cloudflare
liest die Datei nur im Wurzelverzeichnis. Jetzt liegt sie dort, mit
Regeln für beide Orte. Das erklärt womöglich, warum Fassungswechsel
früher zäh ankamen: ohne `no-store` liefert der Zwischenspeicher die
alte `version.json`.

Der alte Ordner `/apps/einkaufsliste/` **bleibt liegen** (alte Links,
APK 1.3.0 und 1.4.0). Der Menü-Eintrag auf allen 21 Seiten zeigt jetzt
auf `/einkaufsliste/`.

---

## 5a. Einkaufsliste 1.4.0 (10.08.2026)

Reines Fassungsupdate — **`einkauf-modul.js` ist byte-gleich**, am
Kopplungsdienst hat sich nichts geändert. Ausgetauscht wurden nur
`index.html`, `laden.html`, `sw.js`, `version.json` und die neue APK.

**Die alte APK 1.3.0 bleibt liegen.** Der Dateiname trägt die Fassung,
sie kostet 1,1 MB und stört niemanden — aber ein Link, den jemand noch
irgendwo hat, läuft sonst ins Leere. Wenn sich zu viele ansammeln, kann
man die ältesten von Hand entfernen; wiederherstellen ginge nicht.

Nachgezogen: die Vorgabewerte der Einkaufsliste in `APPS` (`stats.js`)
von 10300/1.3.0 auf 10400/1.4.0. Die Programmseite selbst verweist nur
auf `/apps/einkaufsliste/laden.html`, enthält also keine feste
Versionsnummer — dort war nichts zu ändern.

---

## 5. Zugekaufte Dienste: Einkaufsliste und Tourenplaner (10.08.2026)

Beide kamen als fertige Module. Eingebaut in **denselben** Worker, nicht
als eigene Worker — zwei Worker auf einer Domain streiten sich um die
Route, und genau daran ist der Tourendienst schon einmal gescheitert
(405 von der Dateiauslieferung).

| Datei | Inhalt |
|---|---|
| `einkauf-modul.js` | unverändert übernommen |
| `tourenapi-modul.js` | aus `server/worker.js`, **mit Änderungen** (siehe unten) |
| `apps/einkaufsliste/` | Web-Fassung, APK, Hintergründe, `_headers` |

### Programmseiten (10.08.2026)

`einkaufsliste.html` neu, aus `_vorlage-programm.html`. Eingebunden in
Kachel, Programmliste, `PROGRAM_PAGES`, Sitemap und **in alle 21
Web-Apps-Menüs**. In `APPS` (stats.js) steht ein Eintrag, der auf
`/apps/einkaufsliste/version.json` zeigt — dieselbe Datei, die auch die
Android-App abfragt.

**Falle in der Vorlage:** Der Abschnitt `program-launch` („Sofort
starten") steckt dort in einem **HTML-Kommentar**. Wer nur den `href`
ersetzt, hat einen Knopf, der im Rohtext steht und im Browser fehlt —
ohne Fehlermeldung. Beim Prüfen fiel auf: auch ohne JavaScript war der
Abschnitt nicht im DOM. Erst das verriet den Kommentar.

**Nachgebessert am Tourenplaner:** Dort zeigte der Startknopf auf
`/planer/tourenplaner/` — ein Ordner, den es nicht gibt. Ein Knopf, der
ins Leere führt, ist schlimmer als keiner: er verspricht etwas und
liefert die 404-Seite. Der Abschnitt ist jetzt sauber auskommentiert, bis
die Web-Fassung wirklich da ist.

### Der Namenskonflikt, der Daten gekostet hätte

Der gelieferte Tourendienst bringt `export class Kanal` mit — **diesen
Namen gibt es im Website-Worker bereits** (die Kanäle des
Aufgabenplaners). Zwei gleichnamige Klassen in einer Datei überschreiben
einander; im schlimmsten Fall hätte der Aufgabenplaner-Kanal Tourendaten
verwaltet.

Umbenannt zu **`TourenKanal`** und **`TourenKopplung`**, Bindungen
entsprechend `TOUREN_KANAL` / `TOUREN_KOPPLUNG`. Der Rest ist unverändert;
die Abweichungen stehen als Kommentar oben in `tourenapi-modul.js`.

### Reihenfolge (wieder einmal)

```
/api/einkauf/   →  Einkaufsdienst      ─┐
/tourenapi/     →  Tourendienst         │ ganz oben in bearbeiten()
/api/kanal/     →  Aufgabenplaner       │
/api/           →  Sammelroute         ─┘ zuletzt
```

Steht `/api/einkauf/` hinter der Sammelroute, verschluckt sie jeden
Aufruf → 404. Bei `/tourenapi/` gilt dasselbe gegenüber der
Dateiauslieferung → 405 auf PUT.

### `RESERVIERT` ergänzt

`apps`, `tourenapi`, `einkaufsliste`, `tourenplaner`. Ohne diese Einträge
könnte eine über „+ Seite" angelegte Seite den Ordner `/apps/` oder den
Dienst verschatten — angelegte Seiten werden **vor** dem Rückgriff auf
die Dateien ausgeliefert.

### Was beim Prüfen auffiel

* Der Codevorrat der Einkaufsliste ist `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
  — ohne `0`, `1`, `I`, `L`, `O`. Ein Code wie „123456" ist ungültig.
* Pakete haben die Form `{iv, daten}`, nicht `{paket}`.
* **Cloudflare-Stubs nehmen `(url, init)` genauso wie einen fertigen
  Request.** Ein Nachbau, der nur Requests annimmt, scheitert mit
  „Invalid URL" — das sieht nach einem Serverfehler aus, ist aber keiner.
  `t/server.mjs` und die Prüfskripte bilden das jetzt nach.
* Die Prüfskripte legen ihre Worker-Kopie in `site/`, nicht in `t/`:
  `worker.js` importiert die Module relativ zu sich selbst.

### APK im Paket — Ausnahme von Regel 1

`apps/einkaufsliste/FINNVELO-Einkaufsliste-1.3.0.apk` (1,1 MB) **gehört
ins Paket**: sie wird ausgeliefert, damit man die App laden kann. Regel 1
(keine APKs) zielt auf versehentlich eingepackte Bauartefakte. Alles
unter `apps/` ist Auslieferung. Schlüsseldateien bleiben ausnahmslos
draußen.

---

### Nachtrag 07.08.2026 (2): angelegte Seiten als Datei sichern

`POST /api/programme/datei` liefert die fertige Seite mit
`content-disposition: attachment`. In der Verwaltungsliste steht dafür
je Eintrag der Knopf **„Datei"**.

**Die Grenze, die man kennen muss:** Der Worker kann **nicht** ins
Deployment schreiben — die statischen Dateien liegen unveränderlich im
veröffentlichten Paket. „Beim Anlegen eine Datei erzeugen" heißt deshalb:
bauen und herausgeben, ablegen muss der Mensch.

* Gebaut wird mit **denselben** Funktionen wie beim Ausliefern
  (`programmSeite` / `infoSeite`) — keine zweite Fassung, die
  auseinanderlaufen könnte.
* Liegt die Datei später im Projekt **und** der Eintrag ist noch da,
  gewinnt der Eintrag (die dynamische Auslieferung steht vor dem
  ASSETS-Rückfall). Beide sind inhaltsgleich, das stört nicht.
* Wird der Eintrag entfernt, übernimmt die Datei — nachgewiesen im Test:
  Datei ablegen, Eintrag löschen, Seite lädt weiter und bleibt
  bearbeitbar. Nur Kachel und Zeile verschwinden dann, weil die aus der
  Liste kommen.

**Eigener Fehler, der beinahe stehengeblieben wäre:** Ich hatte einen
Kommentar geschrieben, der Bauplan trage `noindex`, samt einer Zeile, die
es entfernen sollte. Der Bauplan trägt gar kein `noindex` — die Zeile war
wirkungslos und der Kommentar falsch. Beides entfernt.

### Nachtrag 07.08.2026: Seiten anlegen war nur schwer zu finden

Die Verwaltung („Programme verwalten") gab es längst — aber der Block
begann mit

```js
if (pfad !== '/programme') return;
```

Sie erschien also **nur auf der Programme-Seite, ganz unten**. Wer den
README-Abschnitt nicht kannte, fand sie nicht. Das ist derselbe Fehlertyp
wie beim Web-App-Upload: die Funktion war da, der Weg dorthin nicht.

Jetzt: Knopf **„+ Seite"** in der Admin-Leiste, erreichbar von jeder
Seite. Er öffnet dieselbe Verwaltung im Fenster (Hülle wie Verlauf und
Web-Apps). Auf `/programme` bleibt der Kasten am Seitenende zusätzlich
stehen — bestehendes Verhalten unangetastet.

* Verbindung über das Ereignis `fv:seiten-oeffnen`, weil Admin-Leiste und
  Verwaltung in getrennten IIFEs liegen.
* `bauen(liste, wohin)` nimmt jetzt ein Ziel. Die Doppelprüfung läuft
  gegen **das Ziel**, nicht gegen das ganze Dokument — sonst blockierte
  der Kasten am Seitenende das Fenster.
* Achtung: `if (pfad !== '/programme') return;` steht noch **fünf weitere
  Male** in `stats.js` (Sicherung, Web-Apps-Menü, Seitentitel …). Beim
  Ändern zeilengenau arbeiten, nicht global ersetzen.

**Merke für Tests:** `t/server.mjs` bediente statische Pfade selbst und
gab nur `/api/` an den Worker. Eine neu angelegte Programmseite gab
dadurch 404, obwohl sie live läuft — der Worker **erzeugt** solche Seiten
dynamisch. Jetzt geht *alles* durch `mod.default.fetch`, und der
ASSETS-Nachbau löst saubere Adressen auf (`/kontakt` → `kontakt.html`,
`/ordner/` → `ordner/index.html`).

### Nachtrag 06.08.2026: Seite „Tourenplaner" angelegt

Über den **Datei-Weg** (README Abschnitt 6), nicht über „Programme
verwalten" — so steht die Seite dauerhaft in den Quellen und geht bei
einem Datenbankverlust nicht mit verloren.

Angefasst wurden: `tourenplaner.html` (neu, aus `_vorlage-programm.html`),
Kachel in `index.html`, Zeile in `programme.html`, `PROGRAM_PAGES` in
`stats.js`, Eintrag in `sitemap.xml`.

**Zwei Entscheidungen, die nicht offensichtlich sind:**

* **Der Download-Knopf steht schon jetzt sichtbar da**, obwohl es noch
  keine Datei gibt (Vorlage hätte ihn auskommentiert gelassen). Grund:
  Die Zeile „Ziel des Knopfes" — und damit auch „Web-App hochladen" —
  hängt an einem *sichtbaren* Knopf. Ohne ihn ließe sich auf der neuen
  Seite nichts einhängen.
* **Als Plakette steht vorläufig das Finnvelo-Wappen** statt eines
  fehlenden `tourenplaner-label.webp`. Ein fehlendes Bild hinterlässt
  sonst ein kaputtes Symbol auf Seite, Kachel und Programmliste.
  Austauschen geht im Bearbeiten-Modus.

**Merke für Tests:** `t/server.mjs` löste saubere Adressen ohne `.html`
nicht auf — nur `/serverstatus` und `/admin` waren von Hand gemappt.
Jede neue Programmseite wäre im Test durchgefallen, obwohl sie live
einwandfrei liefe (der echte Worker macht das über ASSETS). Jetzt wird
`<pfad>.html` allgemein probiert.

### Nachtrag 05.08.2026: das Menü selbst verwalten

Der Upload an den Programmseiten war nur die halbe Antwort — gesucht
wurden die Web-Apps dort, wo sie stehen: **im Menü**. Dort ließ sich
bisher nur der *Text* ändern (`enableNav` → `editableText`), nicht das
Ziel, und neue anlegen ging gar nicht.

Jetzt steht die Liste als JSON im Block **`w0`** auf der Seite
`global`, und das Menü wird daraus gezeichnet — auch für Besucher
(in `applyOverrides`, nicht nur im Bearbeiten-Modus).

* Ist `w0` leer, bleibt das HTML stehen. Der Ausgangsbestand wird beim
  ersten Öffnen des Fensters aus dem DOM gelesen — **nach**
  `applyOverrides`, damit bereits umbenannte Namen erhalten bleiben.
* Verwaltet wird in einem eigenen Fenster (Knopf in der Admin-Leiste).
  Direkt im Dropdown ginge nicht: es klappt bei jeder Mausbewegung zu
  und ist zu schmal für Eingabefelder.

**Stolperstein, der Zeit gekostet hat:** `BLOCK_RE` im Worker lautet
`/^[a-z][0-9]{1,4}$/` — **ein** Buchstabe, dann Ziffern. Der zuerst
gewählte Schlüssel `wa0` wurde stillschweigend mit 400 abgewiesen; das
Fenster meldete nur „Speichern fehlgeschlagen". Neue Blöcke also immer
einbuchstabig benennen. Vergeben sind: `t i d s n b o g0 h0 q0 v0 x0`
und jetzt `w0`.

**Merke für Tests:** Der Prüfstand (`t/server.mjs`) setzte auf alle
`/api/`-Antworten pauschal `content-type: application/json`. Eine
hochgeladene Web-App kam dadurch als JSON beim Browser an — der Test
hätte etwas geprüft, das es in Wirklichkeit nie gibt. Jetzt wird der
Kopf der echten Antwort übernommen.

---

## 6. Was noch offen ist

**`/planer` — die Weboberfläche für den Rechner.** Laut Spezifikation
bewusst zuletzt: eine PWA, die im Browser dieselbe Verschlüsselung
rechnet wie die App. Erst angehen, wenn App und Server sicher
zusammenspielen.

Alles andere aus den bisherigen Aufträgen ist erledigt.

---

## 7. Wie getestet wurde

Es gibt **keine Testdateien im Paket** — sie lagen außerhalb und sind
mit dem Chat weg. Der nächste Chat sollte sie bei Bedarf neu anlegen.
Bewährt hat sich:

**Server-Logik** — `worker.js` laden, `cloudflare:workers` ersetzen,
Durable Object mit `node:sqlite` nachbauen, Routen einzeln aufrufen:

```js
src = src.replace(/import .* from ["']cloudflare:workers["'];?/,
                  'const DurableObject = class { constructor(){} };');
```

Der Konstruktor muss von Hand ausgeführt werden (`super()` greift dort
nicht). `WebSocketPair` und Status 101 gibt es in Node nicht — beides
ersetzen bzw. um den Aufruf herum abfangen.

**Seiten** — kleiner `http.server` plus Playwright/Chromium. Immer
messen, nicht nur im Quelltext nachsehen: Sichtbarkeit, Ladelast,
kaputte Bilder, JS-Fehler, und **jede Seite bei 1500 px und 390 px**.

**Vor jeder Auslieferung:** `node --check` für `worker.js` und
`stats.js`, geschweifte Klammern in `styles.css` zählen, `sitemap.xml`
als XML prüfen, ZIP auf Schlüsseldateien gegenprüfen.

In diesem Chat liefen zuletzt **132 Prüfungen** durch.

---

## 8. Wenn etwas nicht geht — die Reihenfolge, die sich bewährt hat

1. **Hat er das neueste Paket veröffentlicht?** Zwei Fehlersuchen gingen
   daneben, weil noch ein älterer Stand lief.
2. **Browser-Zwischenspeicher.** Strg+F5. (HTML wird inzwischen nicht
   mehr zwischengespeichert.)
3. **`/serverstatus` aufrufen** — dort stehen die letzten 40 Fehler mit
   Weg und Ursache. Abstürze des Workers landen dort automatisch.
4. **Live mitlesen:** `npx wrangler tail` im Projektordner.
5. **404 bei `/api/kanal/…`:** „Diese Auskunft gibt es nicht" bedeutet
   Tippfehler im Pfad, „Diesen Kanal gibt es nicht" einen fehlenden Kanal.

---

## 9. Prüfung nach dem Veröffentlichen

```bash
# 1. Versionsdatei der App
curl -A "Test/1.0" https://finnveloprogramme.com/FinnVelo/Aufgabenplaner/version.json

# 2. Kanal anlegen
curl -A "Test/1.0" -X POST https://finnveloprogramme.com/api/kanal/neu \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","pruefwert":"PW","salzP":"a","paketP":"b","salzR":"c","paketR":"d"}'

# 3. Salzauskunft (der Weg, der den Beitritt entsperrt)
curl -A "Test/1.0" "https://finnveloprogramme.com/api/kanal/salz?code=<Code aus 2>"
```

Cloudflare weist `Python-urllib` mit Fehler 1010 ab — immer mit `-A`
arbeiten.

Danach `/serverstatus` öffnen: Der Testkanal muss in der Tabelle stehen.

---

## 10. Zum Schluss

Tatorasa baut das als ernsthaftes Hobby mit hohem Anspruch an
Sorgfalt. Er merkt sofort, wenn etwas nur behauptet statt geprüft ist.
Umgekehrt nimmt er ehrliche Rückmeldung gut auf — auch „das würde ich
anders bauen, und zwar aus diesem Grund".
