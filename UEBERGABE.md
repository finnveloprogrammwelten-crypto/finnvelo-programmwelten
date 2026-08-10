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
