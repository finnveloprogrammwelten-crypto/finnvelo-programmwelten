# Finnvelo Programmwelten - Anleitung

Diese Datei erklaert dir, wie du die Webseite **selbst** pflegst und erweiterst -
ohne fremde Hilfe. Sie ist bewusst ausfuehrlich. Fuer den Alltag brauchst du
meist nur **Abschnitt 2 (Bearbeiten-Modus)**.

Inhalt:

0. **Was kann ich selbst? Was braucht Veroeffentlichen?** (Uebersicht)
1. Aufbau der Webseite (welche Datei macht was)
2. Bearbeiten-Modus: Texte, Bilder, Links, Video, Galerie selbst aendern
3. Download (Windows-Programm) verlinken
4. Den Haus- und Gartenplaner (Web-App) einbinden oder austauschen
5. **Android-Apps: neue Version veroeffentlichen (Update-Feld)**
6. Ein komplett neues Programm hinzufuegen
7. Aenderungen veroeffentlichen (online stellen)
8. Kurz-Spickzettel
9. **Sicherheit: der Signaturschluessel**

---

## 0. Was kann ich selbst? Was braucht Veroeffentlichen?

Es gibt genau **zwei Sorten** von Aenderungen. Das ist der wichtigste
Unterschied auf dieser Seite:

**A) Inhalte - sofort live, ohne Veroeffentlichen**
Diese Dinge liegen in der Datenbank. Du aenderst sie im Bearbeiten-Modus
direkt auf der fertigen Webseite. Sie sind **sofort fuer alle sichtbar**:

- alle Texte: Ueberschriften, Absaetze, Aufzaehlungen, Bildunterschriften
- Kachel-Namen und Kachel-Beschreibungen
- Navigation oben, Markenname, Fusszeile (gilt auf allen Seiten)
- Status-Schilder ("In Entwicklung", "Web-App", ...) - auch entfernen
- Reihenfolge der Kacheln (per Ziehen am Griff)
- eigene Textfelder hinzufuegen ("+ Textfeld hinzufuegen")
- Bilder austauschen (anklicken oder darauf ziehen)
- Screenshots im Abschnitt "Oberflaeche" (hinzufuegen, sortieren, entfernen)
- Tutorial-Video setzen (YouTube-Link)
- **Ziel** von Download- und Oeffnen-Knoepfen
- **App-Updates: Versionsnummer, Versions-Code, APK-Adresse, Hinweise**
  (Abschnitt 5)
- **komplett neue Programme anlegen** - mit eigener Seite, Kachel und
  Listenzeile (Abschnitt 6)
- **Web-Apps hochladen** (eine in sich geschlossene HTML-Datei) und starten
- **Menü "Web-Apps"** erweitern, umsortieren, Eintraege entfernen
- **Seitentitel und Google-Beschreibung** je Seite
- **Abschnitte umsortieren** und eigene Überschriften anlegen
- **Sicherung** aller Inhalte herunterladen und wieder einspielen
- **Programme umbenennen** (Adresse und Name) - Inhalte ziehen mit um
- **reine Info-Seiten** anlegen (ohne Wappen und Download)
- **Fußzeilen-Links** ergänzen und entfernen
- **hochgeladene Bilder** ansehen und ungenutzte entfernen

**B) Struktur - braucht einmal Veroeffentlichen**
Diese Dinge stehen in Dateien. Nach der Aenderung einmal `git push` bzw.
`npx wrangler deploy` (Abschnitt 7):

- eine **neue App** an die Update-Adresse anschliessen (die feste Adresse
  `/.../version.json` muss der Server kennen - in `worker.js`)
- **Layout und Design** (`styles.css`), z.B. Raster, Abstaende, Farben
- **Beschriftung** von Knoepfen (z.B. "Android-App herunterladen (11 MB)") -
  bearbeitbar ist bisher nur das *Ziel* eines Knopfes, nicht sein Text
- neue Dateien wie eine Web-App im Ordner `planer/`

> Merksatz: **Inhalt = sofort. Neue Seiten und Server-Adressen = veroeffentlichen.**

### Grundregel fuer Dateien

**Auf die Webseite kommen nur HTML-Seiten (und was sie zum Anzeigen braucht:
Bilder, `styles.css`, `stats.js`).**
**Alles Herunterladbare - APK, EXE, ZIP - liegt bei GitHub** als *Release*.

Warum: Downloads blaehen jedes Veroeffentlichen auf, und Cloudflare erlaubt
ohnehin nur 25 MB pro Datei. Bei GitHub tauschst du eine Datei aus, ohne die
Webseite anzufassen - der Link auf der Seite bleibt derselbe.

---

## 1. Aufbau der Webseite

Alles liegt flach in einem Ordner. Die wichtigsten Dateien:

| Datei | Wofuer |
|-------|--------|
| `index.html` | Startseite mit der Programm-Kacheluebersicht |
| `programme.html` | Seite "Programme" (Liste aller Programme) |
| `archivar.html`, `finanzmanager.html`, `haus-und-gartenplaner.html`, ... | je EINE Seite pro Programm |
| `_vorlage-programm.html` | **Kopiervorlage** fuer ein neues Programm (siehe Abschnitt 6) |
| `styles.css` | das gesamte Design (Farben, Abstaende, Raster) |
| `stats.js` | Besucherzaehler **und** der versteckte Bearbeiten-Modus |
| `worker.js` | Server-Teil (Zaehler, Kommentare, gespeicherte Bearbeitungen) |
| `assets/images/` | alle Bilder, u.a. die Programm-Plaketten `*-label.webp` |
| `planer/haus-und-gartenplaner/` | hier liegt die Planer-Web-App |
| `mischwald.html` | Mischwald-Auswertung (Web-App, unveraendert uebernommen) |
| `tess/` | Texterkennung fuer die Mischwald-Auswertung (nicht anfassen) |
| `FinnVelo/Aufgabenplaner/` | Download-Seite des Aufgabenplaners |
| `admin.html` | Anmeldung fuer den Bearbeiten-Modus (Adresse `/admin`) |
| `.assetsignore` | legt fest, was **nicht** ausgeliefert wird (u.a. Schluessel) |

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
2. **Beim allerersten Mal** steht dort "Zugang einrichten": Passwort (mind. 8
   Zeichen) und eine selbst gewaehlte **Notfall-PIN** (mind. 6 Zeichen)
   vergeben. Danach ist dieser Weg dauerhaft zu.
3. Danach: Passwort eingeben und **Freischalten** klicken.
4. Du landest in der Zugangsverwaltung - dort lassen sich Passwort und
   Notfall-PIN jederzeit aendern. Ueber "Weiter zur Webseite" geht es zur
   Startseite; oben erscheint die **Admin-Leiste**.

**Passwort vergessen?** Auf `/admin` den Knopf "Passwort vergessen" -
mit der Notfall-PIN laesst sich ein neues setzen. Die PIN bleibt dabei gleich.

**Hinweis zur Ersteinrichtung:** Solange kein Passwort gesetzt ist, koennte
jeder, der die Adresse kennt, den Zugang belegen. Wer das Fenster gar nicht
erst aufmachen will, hinterlegt vorher in Cloudflare das Secret
`ADMIN_PASSWORD` (Dashboard -> Workers & Pages -> Projekt -> Settings ->
Variables and Secrets). Dann ist die Ersteinrichtung von vornherein gesperrt
und man meldet sich mit dem Secret an. Ein spaeter in der Verwaltung
gesetztes eigenes Passwort hat Vorrang vor dem Secret.

Jeder Zugriff auf den Zugang - Einrichten, Aendern, PIN setzen,
Zuruecksetzen - wird auf `/serverstatus` in der Fehlerliste mit Lage 200
vermerkt. Dort steht also, wann jemand am Passwort war.

### Umschalter: "Bearbeiten AN / AUS"  (NEU)
In der Admin-Leiste gibt es einen Knopf **"Bearbeiten: AN / AUS"**:

- **AUS (blaue Leiste):** Du bist als Admin angemeldet, kannst aber **ganz normal
  auf der Seite navigieren** (Links, Menue, Kacheln funktionieren wie immer).
  Nichts ist bearbeitbar - so aenderst du **nichts aus Versehen**.
- **AN (gruene Leiste):** Jetzt ist alles bearbeitbar (siehe unten). Solange
  Bearbeiten AN ist, oeffnen Klicks auf Links/Kacheln **nicht** die Zielseite -
  sie dienen zum Bearbeiten. **Zum Seitenwechsel: kurz auf AUS schalten,
  navigieren, wieder AN schalten.**

Der Zustand gilt fuer den ganzen Besuch (bis Browser-Tab zu). **Abmelden** beendet
den Admin-Modus ganz.

### Was du im Bearbeiten-Modus (AN) aendern kannst
Der Modus gilt auf **jeder** Seite - auch Navigation und Fusszeile.

- **Alle Texte:** Ueberschriften, Absaetze, Aufzaehlungen, **Kachel-Beschreibungen
  und Kachel-Namen** bekommen einen Rahmen. Anklicken, aendern, daneben klicken -
  gespeichert (kurzes gruenes Aufblinken).
- **Navigation, Marke und Fusszeile (NEU):** Auch "Start", "Programme",
  "Finnvelo/Programmwelten" oben und "Impressum/Datenschutz" unten sind
  anklickbar. Diese Aenderungen gelten **auf allen Seiten gleichzeitig**
  (seitenuebergreifend).
- **Bilder:** Auf ein Bild klicken und Datei auswaehlen, **oder** per Drag & Drop
  darauf ziehen. Wird automatisch verkleinert und gespeichert.
- **Status-Schilder** (z.B. "In Entwicklung", "Web-App"): anklickbar. **NEU: Ist
  das Feld leer, wird gar kein Schild angezeigt.** So blendest du ein Schild aus
  (Text loeschen) oder gibst einer Kachel ohne Schild eins (jede Kachel hat im
  Bearbeiten-Modus einen Platzhalter **"+ Status"**).
- **Kacheln sortieren (NEU):** Jede Kachel/Zeile hat oben rechts einen **Griff
  (Symbol mit drei Strichen)**. Damit ziehst du die Kachel an eine andere Stelle -
  die neue Reihenfolge wird gespeichert und gilt fuer alle Besucher.
- **Eigene Text- und Bildfelder (NEU, erweitert):** In **jedem** Abschnitt einer
  Seite stehen im Bearbeiten-Modus zwei Knoepfe: **"+ Textfeld"** und
  **"+ Bildfeld"**. Darunter steht jeweils, wohin das Feld kommt
  (z.B. *in "Besondere Vorteile"*). Jedes angelegte Feld hat oben rechts eine
  kleine Leiste:

  | Bedienelement | Wirkung |
  |---|---|
  | Pfeil hoch / runter | Feld innerhalb des Abschnitts verschieben |
  | Erstes Auswahlfeld | Breite: 1/4, 1/3, 1/2 oder volle Breite |
  | Zweites Auswahlfeld | in welchen **Abschnitt** das Feld gehoert |
  | x | Feld entfernen |

  Bildfelder: auf das Bild klicken (oder eine Datei darauf ziehen) und
  auswaehlen; darunter laesst sich eine Bildunterschrift eintippen - sie darf
  auch leer bleiben. Alles wird sofort gespeichert.
- **Vorhandene Elemente ausblenden (NEU):** Zeigst du im Bearbeiten-Modus auf
  einen Text, ein Bild oder ein Schild, erscheint oben rechts ein **rotes x**.
  Ein Klick blendet das Element aus - Besucher sehen es dann nicht mehr.
  Fuer dich bleibt es blass sichtbar, mit dem Knopf **"wieder einblenden"**
  darunter. So laesst sich nichts versehentlich unwiederbringlich loeschen.

  > **Warum keine freie Platzierung per Maus?** Die Seite passt sich der
  > Bildschirmbreite an (7 Kacheln nebeneinander am Rechner, 1 auf dem Handy).
  > Feste Pixel-Positionen wuerden auf dem Handy uebereinanderliegen oder aus
  > dem Bild laufen. Deshalb: Abschnitt + Breite waehlen - das sieht auf jedem
  > Geraet richtig aus. Auf schmalen Bildschirmen steht automatisch jedes Feld
  > fuer sich.
- **Knoepfe: Beschriftung UND Ziel (NEU):** Bei jedem Knopf (Download,
  "Jetzt oeffnen" usw.) laesst sich beides getrennt aendern:
  - **Beschriftung:** direkt auf den Knopftext klicken und tippen
    (z.B. "Aufgabenplaner herunterladen (17 MB)" -> "Version 3.2 laden").
  - **Ziel:** daneben steht ein Knopf **"🔗 Ziel"**. Anklicken - darunter
    klappt eine **Zeile mit Eingabefeld** auf, in die sich der Pfad bequem
    hineinkopieren laesst (genau wie in der App-Aktualisierung weiter unten).
    Das bisherige Ziel steht schon drin und ist markiert, du kannst also
    direkt ueberschreiben.
    - Vollstaendige Adresse (`https://...`) **oder** ein Pfad dieser Seite,
      der mit `/` beginnt - z.B. `/FinnVelo/Aufgabenplaner/app.apk`.
    - **Enter** speichert, **Esc** schliesst. Passt etwas nicht, steht der
      Hinweis in der Zeile selbst - kein Popup-Fenster mehr.
    - Leeres Feld speichern entfernt das Ziel.
- **Neue Knoepfe anlegen (NEU):** In jedem Abschnitt gibt es neben
  "+ Textfeld" und "+ Bildfeld" jetzt auch **"+ Knopf"**. Damit legst du
  beliebig viele weitere Download- oder Weiter-Knoepfe an - Beschriftung und
  Ziel wie oben.
- **Tutorial-Video:** Auf einer Programmseite mit Abschnitt "Tutorial-Video"
  erscheint **"Video (YouTube-Link) setzen / aendern"**. Link oder Video-ID
  einfuegen - fertig.
- **Oberflaechen-Galerie:** Im Abschnitt "Oberflaeche" Bilder **hinzufuegen** (+),
  per Pfeil **sortieren**, mit **x entfernen**.
- **Web-App hochladen (NEU):** Jede Programmseite mit Start-Block hat im
  Bearbeiten-Modus den Knopf **"Web-App (HTML-Datei) hochladen"**. Eine in
  sich geschlossene `.html` bis 6 MB auswaehlen - der Startknopf oeffnet sie
  danach fuer alle Besucher. Selbst angelegte Programme haben diesen Block
  automatisch.
- **Menü "Web-Apps" (NEU):** Auf der Seite *Programme* gibt es das Feld
  **"Menü Web-Apps verwalten"**: Eintraege hinzufuegen, hochschieben,
  entfernen. Die zwei festen Eintraege bleiben unberuehrt.
- **Google-Eintrag (NEU):** Auf jeder Seite unten das Feld
  **"Google-Eintrag dieser Seite"** - Titel und Beschreibung, die in der
  Suche erscheinen, mit Zeichenzaehler. Der Server setzt sie beim Ausliefern
  ein, Suchmaschinen sehen sie also auch.
- **Abschnitte umsortieren (NEU):** Jeder Abschnitt hat oben rechts Pfeile
  hoch/runter. Und mit **"+ Überschrift"** legst du eigene Zwischen-
  ueberschriften an.
- **Fußzeile (NEU):** Auf der Seite *Programme* das Feld
  **"Fußzeile verwalten"** - zusätzliche Links für alle Seiten.
  Impressum und Datenschutz bleiben fest.
- **Bilder-Übersicht (NEU):** Ebenfalls dort: alle hochgeladenen Bilder mit
  Größe. Bilder mit dem Vermerk **ungenutzt** werden auf keiner Seite mehr
  verwendet und lassen sich gefahrlos entfernen.
- **App-Aktualisierung (NEU):** Auf den Seiten `/mischwaldrechner` und
  `/aufgabenplaner` erscheint unten das Feld **"App-Aktualisierung"**. Damit
  meldest du deinen Android-Apps eine neue Version - siehe Abschnitt 5.

### Wichtig zu wissen
- Diese Inhalts-Aenderungen werden **auf dem Server** gespeichert, nicht in den
  Dateien. Du musst dafuer **nichts veroeffentlichen** (kein Deploy noetig).
- Sie ueberschreiben nur den angezeigten Inhalt. Der urspruengliche Text bleibt
  in der HTML-Datei stehen und dient als Ausgangspunkt.
- Faellt der Server aus, zeigt die Seite einfach wieder den Originalinhalt aus
  der HTML-Datei - es geht also nichts kaputt.

> **Einmalig noetig:** Diese Erweiterung braucht die **neue `worker.js`** auf dem
> Server. Deshalb muss der Worker **einmal neu veroeffentlicht** werden (siehe
> Abschnitt 7): `git push` bzw.
> `npx wrangler deploy`. Danach funktionieren Navigation-, Reihenfolge- und
> Zusatzfeld-Speichern. (Texte/Bilder/Status wie bisher liefen auch vorher schon.)

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

Es gibt jetzt **zwei Wege**. Weg A ist der bequemste (ohne Datei-Push).

### Weg A - HTML direkt hochladen (NEU, empfohlen bei EINER Datei)
Voraussetzung: dein Planer ist **eine einzige, in sich geschlossene HTML-Datei**
(alles Noetige steckt drin bzw. wird aus dem Internet/CDN geladen - keine
separaten JS-/Bild-Dateien daneben).

1. `/admin` -> Passwort -> auf der Planer-Seite **Bearbeiten: AN** schalten.
2. Im gruenen Start-Kasten erscheint unter dem Knopf **"Planer-HTML-Datei
   hochladen"**. Anklicken, deine `.html` auswaehlen.
3. Fertig - der Knopf **"Planer jetzt oeffnen"** oeffnet ab sofort deinen Planer
   (fuer alle Besucher). Nichts zu veroeffentlichen. Max. 6 MB pro Datei.

Zum Aktualisieren einfach eine neue Datei hochladen (ueberschreibt die alte).

### Weg B - Ordner + veroeffentlichen (bei MEHREREN Dateien)
Wenn der Planer aus mehreren Dateien besteht (HTML + eigene JS-/Bild-Dateien):

- Kopiere **alle** Dateien in den Ordner `planer/haus-und-gartenplaner/`;
  die Startdatei muss `index.html` heissen.
- Einmal veroeffentlichen (Abschnitt 7), weil es eine Datei-Aenderung ist.

Standardmaessig zeigt der Knopf auf diesen Ordner. (Falls du vorher Weg A benutzt
hast und wieder auf den Ordner willst: im Bearbeiten-Modus den Knopf anklicken und
als Ziel `/planer/haus-und-gartenplaner/` eintragen.)

---

## 5. Android-Apps: neue Version veroeffentlichen

### Fuer eine neue eigene App einrichten (NEU)

Die Update-Pruefung laesst sich auf **jeder** Programmseite einschalten -
auch auf selbst angelegten:

1. Programmseite oeffnen -> **Bearbeiten: AN**
2. Unten im Feld **"App-Aktualisierung"** steht ein Schalter
   **"Nicht aktiv"**. Einmal anklicken -> **"Aktiv"**.
3. Jetzt erscheinen die Einstellungen:

| Einstellung | Bedeutung |
|---|---|
| Adresse | Was deine App abfragt, z.B. `/meinapp/version.json`. Vorgeschlagen wird `/<seitenname>/version.json`. Muss mit `/` beginnen und auf `version.json` enden |
| Aufbau der Versionsdatei | *Wie Mischwaldrechner* (Felder `versionCode`, `versionName`, `download`, `hinweis`) oder *Wie Aufgabenplaner* (Felder `versionCode`, `versionName`, `apk`, `hinweise`) |
| Erkennungsmerkmal | Nur ausfuellen, wenn deine App eines prueft (der Aufgabenplaner tut das). Sonst leer lassen |

4. Darunter die Versionsdaten eintragen und **Speichern**.
5. Zum Pruefen die Adresse im Browser oeffnen - dort muss der JSON-Text stehen.

**Der Schalter ist der Hauptschalter:** Steht er auf *Nicht aktiv*, antwortet
die Adresse nicht (die Seite zeigt dann eine normale Fehlermeldung). Das ist
praktisch, solange du eine App noch baust.

> Beim Bauen der App musst du genau diese Adresse eintragen und einen der
> beiden Aufbauten verwenden - sonst versteht die App die Antwort nicht.

### Die zwei fest eingebauten Apps

Diese haben feste Adressen und brauchen keinen Schalter:

| App | Programmseite | Adresse, die die App abfragt |
|---|---|---|
| Mischwaldrechner | `/mischwaldrechner` | `/mischwaldrechner/version.json` |
| Aufgabenplaner | `/aufgabenplaner` | `/FinnVelo/Aufgabenplaner/version.json` |

Diese Adressen liefert der Server **aus der Datenbank** - du pflegst sie also
im Bearbeiten-Modus, **ohne zu veroeffentlichen**.

### Ablauf bei einer neuen App-Version

**Schritt 1 - APK bei GitHub ablegen.**
APK-Dateien kommen grundsaetzlich **nicht** auf die Webseite, sondern immer
als *Release* zu GitHub (siehe Grundregel in Abschnitt 0):

- Mischwaldrechner: Release `FinnveloMischwaldrechner`
- Aufgabenplaner: Release `FinnveloAufgabenplaner`

Neue Datei hochladen. **Wichtig:** die alte Datei im Release vorher loeschen,
sonst benennt GitHub die neue in `...1.apk` um.

**Schritt 2 - Versionsauskunft aendern (auf der Webseite).**
1. `/admin` -> Passwort -> auf die Programmseite der App gehen
2. **Bearbeiten: AN**
3. Unten erscheint das Feld **"App-Aktualisierung"** (nur du siehst es)
4. Eintragen und **Speichern**:

| Feld | Was hinein muss |
|---|---|
| Versionsnummer | z.B. `2.3` |
| Versions-Code | eine **Zahl, die groesser ist als vorher** (21 -> 22 -> 23) |
| Download-Adresse | die **vollstaendige GitHub-Adresse** der neuen APK |
| Was ist neu | kurzer Satz, den die App dem Nutzer anzeigt |

**Schritt 3 - Pruefen.**
Die Adresse aus der Tabelle oben im Browser oeffnen - dort muss der
JSON-Text erscheinen. Danach in der App "Nach Updates suchen" antippen.

### Die zwei haeufigsten Fehler

1. **Versions-Code nicht erhoeht.** Die App vergleicht nur diese Zahl. Ist sie
   gleich oder kleiner, meldet die App "kein Update" - egal was sonst drinsteht.
2. **Download-Adresse zeigt auf finnveloprogramme.com.** Dort liegen keine
   APK-Dateien - die Adresse muss immer auf **GitHub** zeigen. Sonst meldet
   die App zwar ein Update, findet die Datei aber nicht.

> Der Aufgabenplaner prueft zusaetzlich ein festes Erkennungsmerkmal
> (`FINNVELO-AUFGABENPLANER`). Das traegt das Feld automatisch ein - du musst
> nichts tun, aber im JSON-Direktmodus bitte nicht aendern.

---

## 6. Ein neues Programm anlegen

### Der einfache Weg (empfohlen) - direkt auf der Webseite

1. `/admin` -> Passwort -> auf die Seite **Programme** gehen
2. **Bearbeiten: AN**
3. Ganz unten erscheint das Feld **"Programme verwalten"** (nur du siehst es)
4. Eintragen:

| Feld | Bedeutung |
|---|---|
| Was soll entstehen? | **Programmseite** (Wappen, Download, Update-Feld) oder **Info-Seite** (schlicht, nur Text und Bilder) |
| Name der Seite | z.B. *Finnvelo Notizbuch* |
| Adresse | wird automatisch gebildet (`finnvelo-notizbuch`), kann geaendert werden |
| Kurzbeschreibung | der Text, der auf der Kachel steht |

5. **"Programm anlegen"** klicken. Fertig.

Sofort danach gibt es:
- eine eigene Seite unter `/<adresse>` mit allen Abschnitten
  (Beschreibung, Oberflaeche, Tutorial-Video, Vorteile, Zielgruppe, Download)
- eine **Kachel** auf der Startseite
- eine **Zeile** in der Programmliste

**Kein Veroeffentlichen noetig.** Seite einmal neu laden, damit die Kachel
erscheint. Alles Weitere - Texte, Plakette, Bildschirmfotos, Download-Knopf,
Status-Schild - aenderst du danach ganz normal im Bearbeiten-Modus.

**Info-Seiten** erscheinen bewusst **nicht** in der Programmübersicht - sie
sind für Dinge wie *Über mich*, eine Anleitung oder einen Änderungsverlauf
gedacht. Verlinke sie über die **Fußzeile** oder das **Web-Apps-Menü**.

**Umbenennen:** in der Liste steht bei jedem Eintrag **umbenennen**. Damit
lässt sich Name und Adresse ändern; alle eingetragenen Texte und Bilder
ziehen automatisch mit um. Achtung: Alte Links auf die Seite funktionieren
danach nicht mehr.

**Entfernen:** im selben Feld steht die Liste der selbst angelegten Programme,
jeweils mit **entfernen**. Die eingetragenen Texte und Bilder bleiben dabei
gespeichert - legst du dasselbe Programm mit derselben Adresse noch einmal an,
sind sie wieder da.

**Was nicht geht:** Adressen, die schon belegt sind (z.B. `programme`,
`kontakt`, `mischwald`, `admin`) - die Meldung sagt es dir. Erlaubt sind nur
Kleinbuchstaben, Zahlen und Bindestriche; Umlaute werden automatisch
umgeschrieben (ae, oe, ue).

### Der Datei-Weg (nur noch selten noetig)

Wenn du eine Seite mit eigenem Aufbau brauchst, die sich stark von den anderen
unterscheidet, gibt es weiter die Kopiervorlage `_vorlage-programm.html`:

1. Datei kopieren, in `<adresse>.html` umbenennen
2. alle mit `HIER:` markierten Stellen ersetzen
   (dabei die `noindex`-Zeile im Kopf loeschen)
3. Plakette als `assets/images/<adresse>-label.webp` ablegen
4. Kachel in `index.html` und Zeile in `programme.html` einfuegen
5. Adresse in `stats.js` bei `PROGRAM_PAGES` eintragen (fuer die Zaehler)
6. Veroeffentlichen (Abschnitt 7)

---

## 6b. Sicherung deiner Inhalte (wichtig!)

Alles, was du im Bearbeiten-Modus eintraegst, liegt **nur in der Datenbank auf
dem Server** - in den HTML-Dateien steht weiterhin nur der Ursprungstext.
Betroffen sind: Texte, hochgeladene Bilder, Zusatzfelder, ausgeblendete
Elemente, Reihenfolgen, App-Versionen, angelegte Programme, Menueeintraege,
Seitentitel.

**Deshalb: ab und zu eine Sicherung herunterladen.**

1. `/admin` -> Passwort -> Seite **Programme** -> **Bearbeiten: AN**
2. Feld **"Sicherung"** -> **"Sicherung herunterladen"**
3. Die Datei heisst z.B. `finnvelo-sicherung-2026-07-26.json`.
   Am besten neben den Signaturschluessel legen.

**Wiederherstellen:** im selben Feld auf **"Sicherung einspielen"**, Datei
auswaehlen, bestaetigen. Felder mit gleichem Namen werden ueberschrieben,
alles andere bleibt.

> Gute Zeitpunkte: nach groesseren Textarbeiten, nach dem Anlegen neuer
> Programme, vor groesseren Umbauten.

---

## 7. Aenderungen veroeffentlichen (online stellen)

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

## 8. Kurz-Spickzettel

- **Text/Bild/Link schnell aendern:** `/admin` -> Passwort -> Seite oeffnen ->
  anklicken -> aendern. Kein Deploy noetig.
- **Windows-Download setzen:** Datei als GitHub-Release hochladen -> Link
  kopieren -> im Bearbeiten-Modus auf den Download-Knopf klicken -> einfuegen.
- **Planer einbinden:** Planer-Datei als `index.html` nach
  `planer/haus-und-gartenplaner/` -> veroeffentlichen.
- **Neues Programm:** Label-Bild ablegen -> `_vorlage-programm.html` kopieren ->
  Kachel in `index.html` + Zeile in `programme.html` einfuegen -> Slug in
  `stats.js` -> veroeffentlichen.
- **Neue App-Version melden:** APK ins GitHub-Release -> Programmseite ->
  Bearbeiten: AN -> Feld "App-Aktualisierung" -> Versions-Code **erhoehen** ->
  Speichern. Kein Deploy noetig.
- **Faustregel:** Text, Bild, Link, App-Version = sofort. Neue Seite,
  neues Design, neue Server-Adresse = veroeffentlichen.

---

## 9. Sicherheit: der Signaturschluessel

Zu den Android-Apps gehoert die Schluesseldatei **`finnvelo-release.jks`**
(mit `SCHLUESSEL-WICHTIG.txt`). Diese Datei gehoert **niemals** auf die
Webseite und **niemals** in ein oeffentliches GitHub-Repository.

**Warum das wichtig ist:**

1. **Wer den Schluessel hat, kann gefaelschte Updates bauen.** Ein Fremder
   koennte eine manipulierte App erzeugen, die dein Handy als echtes Update
   deiner App annimmt.
2. **Geht der Schluessel verloren, kannst du deine Apps nie wieder
   aktualisieren.** Android akzeptiert Updates nur mit demselben Schluessel.
   Dann muessten alle Nutzer die App loeschen und neu installieren - inklusive
   Datenverlust.

**Was zu tun ist:**

- Die Datei nur lokal aufbewahren, zusaetzlich eine private Sicherung
  (z.B. verschluesselt oder auf einem Datentraeger im Schrank).
- Nicht in den Webseiten-Ordner legen. Zur Sicherheit steht in `.assetsignore`,
  dass `*.jks`, `*.keystore`, `*.p12` und `*.pem` **nie** ausgeliefert werden.
- Sollte die Datei versehentlich schon in GitHub liegen: dort entfernen.
  Achtung - im Git-Verlauf bleibt sie sonst trotzdem auffindbar, das braucht
  einen zusaetzlichen Schritt.
