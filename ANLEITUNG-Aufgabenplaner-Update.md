# FINNVELO Aufgabenplaner – Einrichtung der Update-Funktion auf der Webseite

Diese Anleitung beschreibt, wie du auf deiner Webseite alles ablegst, damit
die App unter *Einstellungen → Nach Updates suchen* neue Versionen findet und
herunterlädt.

---

## 1. Wie das Update funktioniert (kurz)

1. In der App tippt man auf **„Nach Updates suchen"**.
2. Die App lädt die Datei **`version.json`** von deiner Webseite.
3. Sie prüft den **Schlüssel** (Erkennungsmerkmal) und vergleicht den
   **versionCode** mit der installierten Fassung.
4. Ist die Zahl auf der Webseite **größer**, lädt die App die APK über die
   Android-Downloadverwaltung in den Ordner **„Downloads"**.
5. Der Nutzer tippt die geladene Datei an und installiert sie.

Die App installiert **nicht** selbst – das ist bewusst so, damit Google Play
Protect nicht blockiert.

---

## 2. Der Ablageort

Die App erwartet die Dateien standardmäßig unter dieser Adresse:

```
https://finnveloprogramme.com/FinnVelo/Aufgabenplaner/
```

Dort müssen liegen:

| Datei | Zweck |
|---|---|
| `version.json` | Die Versionsauskunft (Pflicht, exakt dieser Name) |
| `FINNVELO-Aufgabenplaner-2.1.apk` | Die App-Datei zum Herunterladen |

**Beispiel-Adressen, die dann funktionieren müssen:**
- `https://finnveloprogramme.com/FinnVelo/Aufgabenplaner/version.json`
- `https://finnveloprogramme.com/FinnVelo/Aufgabenplaner/FINNVELO-Aufgabenplaner-2.1.apk`

> **Andere Adresse gewünscht?** Kein Problem. Trägt man in der App unter
> *Einstellungen* eine andere Adresse ein, hat diese Vorrang. Die
> voreingestellte Adresse oben ist nur die Vorgabe.

---

## 3. Die Datei `version.json`

Genau dieser Aufbau, die Feldnamen müssen **exakt** so heißen:

```json
{
  "schluessel": "FINNVELO-AUFGABENPLANER",
  "versionCode": 21,
  "versionName": "2.1",
  "apk": "https://finnveloprogramme.com/FinnVelo/Aufgabenplaner/FINNVELO-Aufgabenplaner-2.1.apk",
  "hinweise": "Erinnerung mit fester Uhrzeit wird automatisch in Vorlauf umgerechnet"
}
```

### Die Felder im Einzelnen

| Feld | Bedeutung | Wichtig |
|---|---|---|
| `schluessel` | Erkennungsmerkmal | Muss **immer genau** `FINNVELO-AUFGABENPLANER` sein, sonst lehnt die App die Datei ab |
| `versionCode` | Fortlaufende Zahl | Muss bei jeder neuen Version **größer** werden (21 → 22 → 23 …). Nur so erkennt die App ein Update |
| `versionName` | Angezeigte Version | Frei wählbar (z. B. „2.1"). **Muss zum Dateinamen der APK passen** (siehe unten) |
| `apk` | Voller Link zur APK | Die vollständige `https://…`-Adresse der APK-Datei |
| `hinweise` | Kurzbeschreibung | Wird dem Nutzer als „Das ist neu" angezeigt. Frei wählbar |

### Der wichtige Zusammenhang: versionName ↔ APK-Dateiname

Beim Herunterladen bildet die App den Dateinamen selbst nach diesem Muster:

```
FINNVELO-Aufgabenplaner-{versionName}.apk
```

Bei `"versionName": "2.1"` erwartet sie also **`FINNVELO-Aufgabenplaner-2.1.apk`**.
Der Link im Feld `apk` sollte auf genau diese Datei zeigen. Am einfachsten
benennst du die hochgeladene APK entsprechend – dann passt alles zusammen.

---

## 4. Wichtig: der richtige MIME-Typ auf dem Server

Der Webserver muss die JSON-Datei als Text ausliefern und die APK als
Android-Paket. Bei Cloudflare (deinem Setup) klappt das meist automatisch.
Falls die App die Datei nicht lesen kann, prüfe/setze diese Kopfzeilen:

| Datei | Content-Type |
|---|---|
| `version.json` | `application/json` |
| `*.apk` | `application/vnd.android.package-archive` |

> Bei Cloudflare Workers/Pages kannst du den Content-Type in der Antwort
> setzen. Für statische Ablage reicht meist die Dateiendung.

---

## 5. So veröffentlichst du eine neue Version (Ablauf für später)

Jedes Mal, wenn ich dir eine neue APK gebe:

1. **APK hochladen** in den Ordner `FinnVelo/Aufgabenplaner/`
   (Dateiname z. B. `FINNVELO-Aufgabenplaner-2.2.apk`).
2. **`version.json` anpassen:**
   - `versionCode` um eins erhöhen (21 → 22)
   - `versionName` auf die neue Version (z. B. „2.2")
   - `apk` auf den neuen Dateinamen zeigen lassen
   - `hinweise` kurz beschreiben, was neu ist
3. **`version.json` hochladen** (die alte überschreiben).
4. Fertig. Beim nächsten „Nach Updates suchen" bietet die App das Update an.

Die `versionCode`-Werte, die ich in den bisherigen Versionen vergeben habe,
findest du in der Tabelle unten – so weißt du, wo es weitergeht.

| App-Version | versionCode |
|---|---|
| 2.1 (aktuell) | 21 |
| 2.2 (nächste) | 22 |

---

## 6. Prüfen, ob alles sitzt

Nach dem Hochladen im Browser diese zwei Adressen öffnen:

1. `https://finnveloprogramme.com/FinnVelo/Aufgabenplaner/version.json`
   → Es muss der JSON-Text erscheinen (nicht „404 – nicht gefunden").
2. `https://finnveloprogramme.com/FinnVelo/Aufgabenplaner/FINNVELO-Aufgabenplaner-2.1.apk`
   → Der Download der APK muss starten.

Klappen beide, funktioniert die Update-Suche in der App.

---

## 7. Der Signaturschlüssel – nicht auf die Webseite!

Die Datei **`finnvelo-release.jks`** (dein Signaturschlüssel) gehört **nicht**
auf die Webseite. Sie ist nur zum Bauen neuer Versionen nötig und muss geheim
bleiben. Bewahre sie sicher auf und lade sie mir bei der nächsten Sitzung
wieder hoch, damit die nächste Version denselben Schlüssel bekommt.

Wäre der Schlüssel öffentlich, könnten Fremde APKs bauen, die dein Handy als
echtes Update annimmt.
