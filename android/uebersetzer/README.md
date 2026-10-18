# Finnvelo Übersetzer (Android)

Öffnet eine andere App und übersetzt deren Bildschirminhalt ins Deutsche.
Die Übersetzung läuft **auf dem Handy** (Google ML Kit) – es werden keine
Texte an einen Server geschickt. Nur das Sprachpaket (ca. 30 MB je Sprache)
wird einmalig geladen, danach geht es auch ohne Internet.

## So wird sie benutzt

1. APK installieren und **Finnvelo Übersetzer** öffnen.
2. Den DE-Knopf einschalten (die App zeigt die Schritte auch an):
   1. **Bedienungshilfen öffnen** → „Finnvelo Übersetzer“ antippen.
   2. Kommt „App wurde Zugriff verweigert“ → **Schließen**.
   3. **App-Info öffnen** → ⋮ oben rechts → **„Eingeschränkte Einstellungen zulassen“**.
   4. Schritt 1 wiederholen – jetzt lässt sich der Schalter einschalten.

   Android verlangt das ab Version 13 bei Apps, die nicht aus dem Play Store
   kommen. Der Menüpunkt unter ⋮ erscheint erst, **nachdem** man einmal
   versucht hat, den Schalter einzuschalten.
3. Unten in der Liste die gewünschte App antippen (z. B. *Bonjour RATP*).
4. Am Rand schwebt ein runder **DE**-Knopf:
   - **antippen** → Text wird übersetzt und genau über das Original gelegt
     (gelber Ring = arbeitet gerade)
   - unten erscheint eine Leiste: **☰ Liste** (alle Übersetzungen untereinander),
     **🔊 Vorlesen**, **📋 Kopieren**, **✕**
   - einen Kasten antippen → ganzer Text + Original groß, mit Vorlesen/Kopieren
   - daneben tippen oder **✕** → Übersetzung schließen
   - Knopf **ziehen** → verschieben, **gedrückt halten** → Einstellungen

### Kamera-Übersetzer

Große blaue Karte oben im Hauptbildschirm. Kamera auf Schild, Speisekarte oder
Fahrplan halten – die Übersetzung erscheint direkt im Bild.
**⏸** friert das Bild ein, dann einen Kasten antippen zum Vorlesen.
**🔊** liest alles vor, **📋** kopiert, **🔦** schaltet die Taschenlampe.

### Kachel „DE übersetzen“

Statt (oder zusätzlich zum) schwebenden Knopf: Leiste von oben herunterziehen →
Kachel antippen. Hinzufügen über „Kachel hinzufügen“ im Hauptbildschirm.
Wer den Knopf nicht mag, schaltet „Schwebenden Knopf zeigen“ aus.

### Automatisch übersetzen (Standard)

Eine App aus der Liste öffnen **oder** in der App einmal auf **DE** tippen:
der Knopf wird **grün** und die App wird ab jetzt automatisch übersetzt.
Man kann sie ganz normal bedienen – die Kästen lassen alle Berührungen durch.
Beim Scrollen verschwinden sie kurz und kommen, sobald der Bildschirm ruht,
neu übersetzt wieder. Die Einstellung merkt sich die App auch nach dem
Schließen. Grünen Knopf antippen = für diese App wieder aus.

Wer lieber von Hand übersetzt (mit Leiste Liste/Vorlesen/Kopieren), schaltet
„Automatisch übersetzen“ in den Einstellungen aus.

## Einstellungen

| Einstellung | Bedeutung |
|---|---|
| Ausgangssprache | „Automatisch erkennen“ reicht meistens. Bei gemischten Seiten (z. B. englische App mit französischen Ortsnamen) die Sprache fest wählen. |
| Bildschirmtext | Liest den Text direkt aus der App. Schnell und genau. Standard. |
| Texterkennung | Macht ein Bildschirmfoto und erkennt den Text darin – findet auch Beschriftungen in **Karten und Bildern**. Ab Android 11. |
| Sprachpakete | Je Sprache „Laden“ – mehrere werden nacheinander geladen (Warteschlange). Vor einer Reise im WLAN laden, dann klappt es unterwegs offline. Gedrückt halten löscht ein Paket. |

## Update-Prüfung über die Webseite

Die App fragt beim Start `https://finnveloprogramme.com/uebersetzer/version.json` ab
(siehe Abschnitt 5 der Haupt-README). Einrichten:

1. Programmseite `/uebersetzer` anlegen → **Bearbeiten: AN** → Feld
   **„App-Aktualisierung“** auf **Aktiv**
2. Adresse `/uebersetzer/version.json`, Aufbau *Wie Mischwaldrechner*
3. Versions-Code muss größer sein als `versionCode` in `app/build.gradle.kts`,
   Download-Adresse = GitHub-Release der APK

Solange die Seite nicht aktiv ist, zeigt die App einfach keine Update-Karte.

## Bauen

Voraussetzung: Android SDK (Platform 35), Java 17+.

```
cd android/uebersetzer
echo "sdk.dir=/pfad/zum/android-sdk" > local.properties
./gradlew assembleDebug
# Ergebnis: app/build/outputs/apk/debug/app-debug.apk
```

## Signieren mit dem Finnvelo-Schlüssel

Die signierte APK baut GitHub automatisch (Workflow `.github/workflows/uebersetzer-apk.yml`).
Der Schlüssel `finnvelo-release.jks` kommt dabei **nicht** ins Repository, sondern
verschlüsselt in die GitHub-Secrets. Nur Workflows dieses Repositorys können sie
lesen, niemand kann sie dort wieder anzeigen.

### Einmalig: Secrets eintragen

1. Den Schlüssel in Text umwandeln. Am Windows-PC in **PowerShell** im Ordner
   mit der Datei:

   ```
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("finnvelo-release.jks")) | Set-Clipboard
   ```

   Jetzt steht ein langer Text in der Zwischenablage.
2. GitHub → Repository **finnvelo-programmwelten** → **Settings** →
   **Secrets and variables** → **Actions** → **New repository secret**.
   Vier Einträge anlegen:

   | Name | Inhalt |
   |---|---|
   | `FINNVELO_KEYSTORE_BASE64` | der Text aus Schritt 1 (einfügen) |
   | `FINNVELO_KEYSTORE_PASSWORT` | Passwort der Schlüsseldatei |
   | `FINNVELO_KEY_ALIAS` | Name (Alias) des Schlüssels |
   | `FINNVELO_KEY_PASSWORT` | Passwort des Schlüssels (oft dasselbe; dann trotzdem eintragen) |

   Passwörter und Alias stehen in `SCHLUESSEL-WICHTIG.txt`.

### Neue Version veröffentlichen

1. GitHub → **Actions** → **Übersetzer-APK** → **Run workflow** →
   Haken bei **veroeffentlichen** → **Run workflow**.
2. Nach ca. 5 Minuten liegt die APK im Release **FinnveloUebersetzer**:
   `https://github.com/finnveloprogrammwelten-crypto/finnvelo-programmwelten/releases/download/FinnveloUebersetzer/FinnveloUebersetzer.apk`
   Die Adresse bleibt bei jeder Version gleich (die alte Datei wird ersetzt).
3. Diese Adresse ist die **Download-Adresse** im Feld „App-Aktualisierung“
   (siehe oben); dort den **Versions-Code** erhöhen.

Ohne Haken baut der Workflow nur und legt die APK unter **Artifacts** des Laufs ab.
Er läuft außerdem bei jeder Änderung unter `android/uebersetzer` und prüft
Lint und Tests.

> **Wichtig beim Umstieg:** Die bisherigen Test-APKs sind mit einem
> Entwicklungsschlüssel signiert. Die erste signierte Version lässt sich
> nicht darüber installieren: Testversion **deinstallieren**, signierte
> installieren, „Eingeschränkte Einstellungen zulassen“ einmal wiederholen.
> Danach klappen alle weiteren Updates direkt.

Lokal geht es auch: Umgebungsvariablen `FINNVELO_KEYSTORE` (Pfad zur .jks),
`FINNVELO_KEYSTORE_PASSWORT`, `FINNVELO_KEY_ALIAS`, `FINNVELO_KEY_PASSWORT`
setzen und `./gradlew assembleRelease` ausführen.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `MainActivity.kt` | Hauptbildschirm: Einschalten, Sprache, App-Liste |
| `UebersetzerDienst.kt` | Bedienungshilfe mit DE-Knopf, sammelt die Texte |
| `Uebersetzer.kt` | Spracherkennung + Übersetzung (ML Kit, offline) |
| `Ebene.kt` | Legt die Übersetzungen über die fremde App (mit Leiste) |
| `KameraActivity.kt` | Kamera-Übersetzer |
| `KachelDienst.kt` | Kachel „DE übersetzen“ in den Schnelleinstellungen |
| `Vorleser.kt` | Vorlesen und Kopieren |
| `Sprachpakete.kt`, `SprachpaketListe.kt` | Ladestatus und Warteschlange |
| `Aktualisierung.kt` | Update-Prüfung über finnveloprogramme.com |
| `UebersetzerApp.kt` | Fehlerbericht nach Absturz |
| `Einstellungen.kt` | Gespeicherte Auswahl |
