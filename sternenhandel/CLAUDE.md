# Sternenhandel – Projektnotizen für Claude

Android-Handyspiel: Weltraum-Handels- und Eroberungssimulation, vereinfacht
und tabellenbasiert (Vorbild X4). Vollständiges Konzept: `docs/design.md`.

Der Entwickler ist **kein Profi**. Erkläre kurz, was du tust, frag bei offenen
Designentscheidungen nach und sag nach jedem Schritt, was in Godot zu testen ist.
Halte diese Datei nach jedem Arbeitsschritt aktuell (Abschnitt „Stand“).

## Technik

- Godot 4 (aktuelle stabile Version, Projekt angelegt für 4.5), GDScript
- Renderer „GL Compatibility“ (läuft auf möglichst vielen Android-Geräten)
- Querformat, Basisauflösung 1280×720, Stretch-Modus `canvas_items`/`expand`
- Das Projekt liegt im Unterordner `sternenhandel/` des Webseiten-Repos
  `finnvelo-programmwelten`. In Godot **diesen Ordner** öffnen
  (dort liegt `project.godot`).
- Der Ordner ist in der `.assetsignore` des Repos eingetragen, damit er nicht
  als Teil der Webseite ausgeliefert wird.

## Ordnerstruktur

```
sternenhandel/
  project.godot          Projekteinstellungen, Autoloads
  data/                  ALLE Spieldaten als JSON (nie im Code!)
    waren.json           Waren und Warenkategorien
    schiffe.json         Schiffstypen
    spiel.json           Startwerte, Zeit- und Marktregeln
    systeme/             Sonnensysteme (bis Phase 4 von Hand, danach Generator)
  scenes/                .tscn-Szenen (bewusst schlank, UI wird im Code gebaut)
  scripts/
    autoload/            global erreichbar: Daten (lädt JSON), Spiel (Spielstand)
    wirtschaft/          Markt (Preise, Lager, Produktion)
    welt/                Sternensystem (Objekte, Positionen, Märkte)
    schiff/              Schiff (Fracht, Flug)
    ui/                  Oberfläche
  assets/platzhalter/    Platzhalterbilder (PNG, 256×256)
  tests/                 Selbsttests ohne Oberfläche
  docs/design.md         Spieldesign-Dokument
```

## Konventionen

- **Deutsch**: Kommentare, Bezeichner (Variablen, Funktionen, Dateien),
  Texte im Spiel. Umlaute in Bezeichnern ausschreiben (`groesse`, `fuer`).
  In Texten und Kommentaren echte Umlaute.
- Einrückung mit **Tabs** (Godot-Standard). Dateinamen `klein_mit_unterstrich`.
- Kleine Skripte mit einer klaren Aufgabe. Jede Datei beginnt mit einem
  `##`-Kommentar, der sagt, wofür sie da ist.
- **Datengetrieben**: Neue Waren, Schiffe, Gebäude, Rezepte und Forschung
  kommen in `data/*.json`. Code liest sie über das Autoload `Daten`.
- **Logik ohne Oberfläche**: Klassen in `wirtschaft/`, `welt/`, `schiff/`
  erben von `RefCounted`, greifen *nicht* auf Autoloads zu und bekommen ihre
  Daten übergeben. So bleiben sie testbar (`tests/`).
- Die Oberfläche ruft Aktionen auf `Spiel` auf (z. B. `Spiel.kaufen()`) und
  reagiert auf dessen Signale (`stunde_vergangen`, `spielstand_geaendert`,
  `schiff_angekommen`, `meldung` …). Sie ändert den Spielstand nie direkt.
- Geld ist ganzzahlig (`int`, Credits „Cr“). Lagerbestände sind intern `float`
  (für Bruchteile bei Produktion), gehandelt werden ganze Einheiten.
- Zeit wird in **Spielstunden** gerechnet (`float`).
- Touch: Knöpfe mindestens 60 px hoch, Schrift mindestens 20 px.

## Prüfen ohne Godot

In der Cloud-Umgebung gibt es kein Godot. Dort prüfen:

```
pip install gdtoolkit==4.*
gdparse $(find . -name "*.gd")   # Syntax
gdlint  $(find . -name "*.gd")   # Stil
```

Mit Godot (lokal): `godot --headless --script res://tests/test_wirtschaft.gd`
(Projekt vorher einmal im Editor öffnen, damit Godot die Klassen kennt.)

## Android-Export (Hinweise für später)

- Im Export-Dialog unter „Ressourcen“ bei „Filter für Nicht-Ressourcen-Dateien“
  `*.json` eintragen, falls die Daten in der APK fehlen.
- Signaturschlüssel (`*.keystore`, `*.jks`) niemals einchecken.

## Stand

**Phase 1 – Prototyp: umgesetzt, wartet auf Test in Godot.**

Fertig:
- Projektstruktur, `project.godot`, Autoloads `Daten` und `Spiel`
- 15 Waren in 7 Kategorien, 1 Schiffstyp, Startsystem „Helios“ mit Sonne,
  4 Planeten, 1 Mond und 3 Stationen; 8 Objekte haben einen Markt
- Markt mit dynamischen Preisen (Formel in `docs/design.md`), Handelsspanne,
  stückweise Preisberechnung, Produktion/Verbrauch pro Spielstunde
- Frachter fliegt zwischen Objekten (Flugzeit = Entfernung / Geschwindigkeit)
- Oberfläche: Systemkarte (antippen), Info-Panel mit Bild/Text/Statistik,
  Markt-Panel mit Kaufen/Verkaufen, Kopfleiste mit Geld, Uhr, Laderaum,
  Pause und Zeitraffer (1x/2x/5x/10x), Meldungszeile
- Automatische Pause, wenn die App in den Hintergrund geht

Offen / Ideen für Phase 2:
- Rezepte (Produktion verbraucht Eingangswaren), ca. 50 Waren
- Speichern/Laden und Autosave (nur Änderungen gegenüber den Startdaten)
- NPC-Händler, die Preise ausgleichen
- Planeten bewegen sich noch nicht auf ihren Bahnen (bewusst statisch)

Offene Designfragen: siehe Ende von `docs/design.md`.
