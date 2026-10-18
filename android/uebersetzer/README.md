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
   - einen übersetzten Kasten antippen → ganzer Text + Original unten groß
   - daneben tippen oder **✕** → Übersetzung schließen
   - Knopf **ziehen** → verschieben
   - Knopf **gedrückt halten** → Einstellungen öffnen

## Einstellungen

| Einstellung | Bedeutung |
|---|---|
| Ausgangssprache | „Automatisch erkennen“ reicht meistens. Bei gemischten Seiten (z. B. englische App mit französischen Ortsnamen) die Sprache fest wählen. |
| Bildschirmtext | Liest den Text direkt aus der App. Schnell und genau. Standard. |
| Texterkennung | Macht ein Bildschirmfoto und erkennt den Text darin – findet auch Beschriftungen in **Karten und Bildern**. Ab Android 11. |
| Sprachpaket jetzt laden | Vor einer Reise im WLAN laden, dann klappt es unterwegs offline. |

## Bauen

Voraussetzung: Android SDK (Platform 35), Java 17+.

```
cd android/uebersetzer
echo "sdk.dir=/pfad/zum/android-sdk" > local.properties
./gradlew assembleDebug
# Ergebnis: app/build/outputs/apk/debug/app-debug.apk
```

Für ein Release mit dem Finnvelo-Schlüssel (siehe Abschnitt 9 der Haupt-README)
`./gradlew assembleRelease` und die APK mit `apksigner` signieren. Die APK
kommt wie bei den anderen Apps als GitHub-Release, **nicht** auf die Webseite.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `MainActivity.kt` | Hauptbildschirm: Einschalten, Sprache, App-Liste |
| `UebersetzerDienst.kt` | Bedienungshilfe mit DE-Knopf, sammelt die Texte |
| `Uebersetzer.kt` | Spracherkennung + Übersetzung (ML Kit, offline) |
| `Ebene.kt` | Legt die Übersetzungen über die fremde App |
| `Einstellungen.kt` | Gespeicherte Auswahl |
