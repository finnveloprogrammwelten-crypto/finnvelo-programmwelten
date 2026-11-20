# Sternenhandel – Spieldesign-Dokument

> Arbeitstitel. Dieses Dokument beschreibt, *was* das Spiel werden soll.
> Den technischen Stand findest du in `../CLAUDE.md`.

## 1. Idee in einem Satz

Eine Weltraum-Handels- und Eroberungssimulation im Stil von X4, aber stark
vereinfacht und tabellenbasiert, in 2D/2,5D, für Android-Handys im Querformat.

## 2. Darstellung

- Minimale Grafik: Sonnen, Planeten, Monde, Schiffe und Gebäude sind einfache
  Bilder (zunächst Platzhalter).
- Antippen eines Objekts zeigt **Bild, Beschreibung und eine Statistiktabelle**.
- Der Großteil des Spiels läuft über Tabellen und Listen.

## 3. Spielablauf

### 3.1 Start
- Der Spieler beginnt als Händler mit einem kleinen, **nicht
  hyperraumfähigen Frachter** im Startsystem.

### 3.2 Handel
- Sehr viele Waren (Ziel: 100+), in Stufen:
  1. Rohstoffe
  2. raffinierte Güter
  3. Komponenten
  4. High-Tech
  - dazu Konsum-, Luxus- und Schmuggelwaren.
- **Dynamische Preise** nach Angebot und Nachfrage.
- Planeten und Stationen **produzieren und verbrauchen nach Rezepten**.

### 3.3 Forschung
- Forschungspunkte (EP) für einen Forschungsbaum mit den Zweigen
  Antriebe, Hyperraum, Waffen, Schilde, Wirtschaft, Bau.
- Forschung schaltet neue Schiffstypen, Gebäude und Waffen frei.

### 3.4 Galaxie
- Hyperraumtechnik erlaubt Sprünge zwischen Sonnensystemen.
- Ziel: **Hunderte prozedural generierte Systeme** aus einem Seed.

### 3.5 Planeten und Gebäude
- Gebäude: Lagerhaus, Raumdock, Werft, Fabriken, Labore, Verteidigung.
- Schiffe und Gebäude kosten **Unterhalt**.
- Planeten haben Bevölkerung, Bedürfnisse, Zufriedenheit und Steuern.

### 3.6 Später
- Kriegsschiffe und Flottenbildung
- anheuerbare Kapitäne mit Eigenschaften
- automatische Handelsrouten
- Piraterie
- mehrere KI-Fraktionen mit Ruf und Diplomatie
- Eroberung von Systemen

### 3.7 Kampf
- Automatische, **rundenbasierte Auflösung** mit Kampfbericht.
- Stein-Schere-Papier der Waffen:
  - Laser: stark gegen Schilde
  - kinetische Waffen: stark gegen Panzerung
  - Raketen: stark gegen große Schiffe

### 3.8 Mobile-Komfort
- Pause und Zeitraffer
- Autosave
- große Touch-Flächen
- Querformat

## 4. Technik (Kurzfassung)

- Godot 4 (aktuelle stabile Version), GDScript, Export für Android.
- Streng datengetrieben: Waren, Schiffe, Gebäude, Forschung und Rezepte
  liegen als JSON unter `data/`, nicht im Code.
- Galaxie aus einem Seed; gespeichert werden nur Änderungen.
- Simulation mit Detailstufen: das System des Spielers genau, ferne Systeme
  seltener und vereinfacht.

## 5. Entwicklungsphasen

1. **Prototyp:** ein System, ein Frachter, ca. 15 Waren, Kaufen/Verkaufen,
   dynamische Preise
2. **Wirtschaftskern:** Produktionsketten, ca. 50 Waren, Speichern/Laden
3. **Forschung und Schiffskauf**, Unterhalt
4. **Galaxie-Generator**, Sternenkarte, Hyperraumsprünge
5. **Planetenverwaltung** und Gebäude
6. **Kapitäne** und automatische Handelsrouten
7. **Fraktionen** und Piraten
8. **Militär**, Flotten, Kampf, Eroberung
9. **Balancing**, Tutorial, Release

## 6. Regeln der Wirtschaft (Stand Phase 1)

### Zeit
- Die Simulation läuft in **Spielstunden**. Bei 1-facher Geschwindigkeit
  vergeht eine Spielstunde pro echter Sekunde (einstellbar in
  `data/spiel.json`).
- Zeitraffer: Pause, 1x, 2x, 5x, 10x.

### Markt
Jeder Markt (Planet oder Station) führt für jede gehandelte Ware:

| Feld | Bedeutung |
|------|-----------|
| `lager` | aktueller Bestand |
| `ziel` | „normaler“ Bestand. Bei diesem Bestand kostet die Ware genau ihren Basispreis |
| `max` | Höchstbestand (Standard: 3 × ziel) |
| `produktion` | Einheiten, die pro Spielstunde dazukommen |
| `verbrauch` | Einheiten, die pro Spielstunde verschwinden |

**Preisformel** (Mittelpreis einer Einheit):

```
preis = basispreis × (ziel / lager) ^ elastizität
```

begrenzt auf `preis_min_faktor … preis_max_faktor` × Basispreis.
Wenig Lager → teuer, viel Lager → billig.

Der Händler kauft etwas über und verkauft etwas unter dem Mittelpreis
(`handelsspanne`). Jede gekaufte Einheit senkt das Lager. Große Einkäufe
werden deshalb Stück für Stück teurer, so wie auf einem echten Markt.

### Reisen
- Flugzeit = Entfernung ÷ Geschwindigkeit des Schiffs (in Spielstunden).
- Während des Flugs kann nicht gehandelt werden.

## 7. Offene Designfragen

- Endgültiger Name des Spiels („Sternenhandel“ ist nur Arbeitstitel)
- Sollen Planeten auf ihren Bahnen kreisen? (Flugzeiten würden sich ändern)
- Treibstoff als Kostenfaktor beim Fliegen?
- Wie streng wird Schmuggel bestraft (Kontrollen, Ruf, Beschlagnahme)?
