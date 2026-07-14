# Finnvelo Programmwelten - Anleitung

Diese Datei erklaert dir, wie du die Webseite **selbst** pflegst und erweiterst -
ohne fremde Hilfe. Sie ist bewusst ausfuehrlich. Fuer den Alltag brauchst du
meist nur **Abschnitt 2 (Bearbeiten-Modus)**.

Inhalt:

1. Aufbau der Webseite (welche Datei macht was)
2. Bearbeiten-Modus: Texte, Bilder, Links, Video, Galerie selbst aendern
3. Download (Windows-Programm) verlinken
4. Den Haus- und Gartenplaner (Web-App) einbinden oder austauschen
5. Ein komplett neues Programm hinzufuegen
6. Aenderungen veroeffentlichen (online stellen)
7. Kurz-Spickzettel

---

## 1. Aufbau der Webseite

Alles liegt flach in einem Ordner. Die wichtigsten Dateien:

| Datei | Wofuer |
|-------|--------|
| `index.html` | Startseite mit der Programm-Kacheluebersicht |
| `programme.html` | Seite "Programme" (Liste aller Programme) |
| `archivar.html`, `finanzmanager.html`, `haus-und-gartenplaner.html`, ... | je EINE Seite pro Programm |
| `_vorlage-programm.html` | **Kopiervorlage** fuer ein neues Programm (siehe Abschnitt 5) |
| `styles.css` | das gesamte Design (Farben, Abstaende, Raster) |
| `stats.js` | Besucherzaehler **und** der versteckte Bearbeiten-Modus |
| `worker.js` | Server-Teil (Zaehler, Kommentare, gespeicherte Bearbeitungen) |
| `assets/images/` | alle Bilder, u.a. die Programm-Plaketten `*-label.png` |
| `planer/haus-und-gartenplaner/` | hier liegt die Planer-Web-App |
| `admin.html` | Anmeldung fuer den Bearbeiten-Modus (Adresse `/admin`) |

Jedes Programm besteht aus **drei** Auftritten:
- einer **Kachel** auf der Startseite (`index.html`),
- einer **Zeile** in der Programmliste (`programme.html`),
- einer **eigenen Seite** (`<name>.html`).

---

## 2. Bearbeiten-Modus (das Wichtigste)

Die Webseite hat einen eingebauten, unsichtbaren Bearbeiten-Modus. Damit
aenderst du Inhalte **direkt auf der fertigen Webseite** - ganz ohne Programm,
ohne Datei-Upload und ohne Veroeffentlichen. Aenderungen sind **sofort fuer alle
Besucher sichtbar**.

### Freischalten
1. Rufe `deine-adresse.de/admin` auf.
2. Passwort eingeben und **Freischalten** klicken.
   (Das Passwort ist in Cloudflare als Secret `ADMIN_PASSWORD` hinterlegt -
   Dashboard -> Workers & Pages -> Projekt -> Settings -> Variables and Secrets.)
3. Du landest wieder auf der Startseite. Oben erscheint ein Balken
   **"Bearbeiten-Modus aktiv"**. Der Modus gilt fuer den ganzen Besuch, bis du
   **Verlassen** klickst (oder den Browser-Tab schliesst).

### Was du im Bearbeiten-Modus aendern kannst
Wechsle einfach auf die jeweilige Seite (z.B. eine Programmseite) - dort gilt der Modus ebenfalls:

- **Texte:** Ueberschriften, Absaetze, Aufzaehlungen und Bildunterschriften
  bekommen einen Rahmen. Anklicken, Text aendern, irgendwo daneben klicken -
  gespeichert (kurzes gruenes Aufblinken = gespeichert).
- **Bilder:** Auf ein Bild klicken und eine neue Datei auswaehlen, **oder** ein
  Bild per Drag & Drop darauf ziehen. Wird automatisch verkleinert und gespeichert.
- **Status-Schilder** (z.B. "In Entwicklung", "Web-App"): wie Texte anklickbar.
- **Download-Link und "Planer oeffnen"-Knopf:** anklicken -> es oeffnet sich ein
  kleines Fenster, in das du das neue Ziel (die vollstaendige `https://`-Adresse)
  einfuegst.
- **Tutorial-Video:** Auf einer Programmseite mit Abschnitt "Tutorial-Video"
  erscheint ein Knopf **"Video (YouTube-Link) setzen / aendern"**. YouTube-Link
  oder Video-ID einfuegen - fertig.
- **Oberflaechen-Galerie:** Im Abschnitt "Oberflaeche" kannst du Bilder
  **hinzufuegen** (+), per Pfeil **sortieren** und mit **x entfernen**.

### Wichtig zu wissen
- Diese Inhalts-Aenderungen werden **auf dem Server** gespeichert, nicht in den
  Dateien. Du musst dafuer **nichts veroeffentlichen** (kein Deploy noetig).
- Sie ueberschreiben nur den angezeigten Inhalt. Der urspruengliche Text bleibt
  in der HTML-Datei stehen und dient als Ausgangspunkt.
- Faellt der Server aus, zeigt die Seite einfach wieder den Originalinhalt aus
  der HTML-Datei - es geht also nichts kaputt.

---

## 3. Download (Windows-Programm) verlinken

So verknuepfst du eine Installationsdatei mit dem Download-Knopf einer
Programmseite (z.B. beim Haus- und Gartenplaner):

1. **Datei bei GitHub bereitstellen:** Lade die `.exe` (oder `.zip`) als
   *Release* in dein Repository hoch
   (`github.com/finnveloprogrammwelten-crypto/finnvelo-programmwelten` ->
   *Releases* -> *Draft a new release* -> Datei anhaengen -> *Publish*).
2. **Direkten Datei-Link kopieren:** Rechtsklick auf die hochgeladene Datei im
   Release -> Link kopieren. Er sieht ungefaehr so aus:
   `https://github.com/.../releases/download/<version>/<Programm>.exe`
3. **Auf der Programmseite einsetzen:** Bearbeiten-Modus einschalten, auf den
   Download-Knopf klicken, den kopierten Link einfuegen, bestaetigen.

Danach laedt ein Klick auf den Knopf direkt die Datei herunter (und wird im
Download-Zaehler mitgezaehlt).

---

## 4. Den Haus- und Gartenplaner (Web-App) einbinden oder austauschen

Der Knopf **"Planer jetzt oeffnen"** auf der Seite `haus-und-gartenplaner.html`
oeffnet den Ordner `planer/haus-und-gartenplaner/`. Dort liegt aktuell nur ein
Platzhalter. So kommt dein echter Planer rein:

- **Planer ist eine einzelne HTML-Datei:** benenne sie in `index.html` um und
  lege sie in `planer/haus-und-gartenplaner/` (ersetzt den Platzhalter).
- **Planer besteht aus mehreren Dateien:** kopiere **alle** Dateien in diesen
  Ordner; die Startdatei muss `index.html` heissen.

Am Knopf selbst musst du **nichts** aendern - er zeigt immer auf diesen Ordner.
Danach einmal veroeffentlichen (Abschnitt 6), weil es eine Datei-Aenderung ist.

---

## 5. Ein komplett neues Programm hinzufuegen

Beispiel: neues Programm mit Kurzname (Slug) `mein-tool`. Der Slug darf nur
Kleinbuchstaben, Zahlen und Bindestriche enthalten.

**Schritt 1 - Plakette (Label-Bild):**
Lege das Plaketten-Bild als `assets/images/mein-tool-label.png` ab
(Format 3:2, also z.B. 1536 x 1024 - so wie die anderen `*-label.png`).

**Schritt 2 - Eigene Seite:**
Kopiere `_vorlage-programm.html` und benenne die Kopie in `mein-tool.html`.
Oeffne sie und ersetze alle mit `HIER:` markierten Platzhalter (Slug, Titel,
Beschreibung, Bildname). Feinschliff am Text geht spaeter bequem im
Bearbeiten-Modus.

**Schritt 3 - Kachel auf der Startseite:**
In `index.html` einen der bestehenden `<a class="program-button" ...>`-Bloecke
kopieren, direkt darunter einfuegen und anpassen (Link `/mein-tool`, Bildname,
Beschreibung). Wenn "In Entwicklung" stehen soll, das `program-button__status`-
Schild drinlassen; wenn nicht, die Zeile loeschen.

**Schritt 4 - Zeile in der Programmliste:**
In `programme.html` genauso einen `<a class="program-row" ...>`-Block kopieren,
einfuegen und anpassen.

**Schritt 5 - Zaehler aktivieren:**
In `stats.js` den Slug in die Liste `PROGRAM_PAGES` aufnehmen, damit die Seite
Besucher-, Video- und Download-Zahlen bekommt:

```js
var PROGRAM_PAGES = ['command-control', 'archivar', ... , 'mein-tool', 'tester'];
```

**Schritt 6 - Veroeffentlichen** (Abschnitt 6).

Tipp: Am schnellsten geht es, wenn du dir die bestehende Seite
`haus-und-gartenplaner.html` als Vorbild danebenlegst und Block fuer Block
vergleichst.

---

## 6. Aenderungen veroeffentlichen (online stellen)

Es gibt **zwei Arten** von Aenderungen:

- **Inhalts-Aenderungen im Bearbeiten-Modus** (Texte, Bilder, Links, Video,
  Galerie): sind **sofort online**. Hier ist **nichts** weiter zu tun.
- **Datei-Aenderungen** (neues Programm, neue Planer-HTML, Aenderungen an
  `styles.css` / `stats.js` / HTML-Dateien): muessen einmal veroeffentlicht
  werden.

Datei-Aenderungen veroeffentlichen (eine der beiden Varianten):

- **Ueber GitHub:** geaenderte Dateien committen und pushen. Wenn das Projekt in
  Cloudflare mit dem GitHub-Repo verbunden ist, wird automatisch neu gebaut.
- **Direkt mit Wrangler:** im Projektordner
  ```
  npx wrangler deploy
  ```
  ausfuehren. (Cloudflare-Konto muss angemeldet sein.)

Nach dem Veroeffentlichen ggf. die Seite mit **Strg + F5** neu laden, damit der
Browser nicht die alte Version aus dem Zwischenspeicher zeigt.

---

## 7. Kurz-Spickzettel

- **Text/Bild/Link schnell aendern:** `/admin` -> Passwort -> Seite oeffnen ->
  anklicken -> aendern. Kein Deploy noetig.
- **Windows-Download setzen:** Datei als GitHub-Release hochladen -> Link
  kopieren -> im Bearbeiten-Modus auf den Download-Knopf klicken -> einfuegen.
- **Planer einbinden:** Planer-Datei als `index.html` nach
  `planer/haus-und-gartenplaner/` -> veroeffentlichen.
- **Neues Programm:** Label-Bild ablegen -> `_vorlage-programm.html` kopieren ->
  Kachel in `index.html` + Zeile in `programme.html` einfuegen -> Slug in
  `stats.js` -> veroeffentlichen.
