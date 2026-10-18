package com.finnvelo.uebersetzer

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Rect
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.max

/**
 * Kamera-Modus: Schilder, Speisekarten, Fahrplaene ... ins Kamerabild halten,
 * die deutsche Uebersetzung erscheint direkt darueber. Anhalten friert das
 * Bild ein, damit man in Ruhe lesen, vorlesen oder kopieren kann.
 */
class KameraActivity : ComponentActivity() {

    private lateinit var vorschau: PreviewView
    private lateinit var standbild: ImageView
    private lateinit var kaesten: FrameLayout
    private lateinit var status: TextView
    private lateinit var knopfAnhalten: TextView

    private lateinit var uebersetzer: Uebersetzer
    private lateinit var vorleser: Vorleser
    private val texterkenner by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
    private lateinit var arbeiter: ExecutorService
    private var kamera: Camera? = null

    @Volatile private var beschaeftigt = false
    @Volatile private var angehalten = false
    private var letzteAuswertung = 0L
    private var licht = false
    private var aktuell: List<Pair<Fund, String>> = emptyList()

    private val kameraErlaubnis = registerForActivityResult(ActivityResultContracts.RequestPermission()) { erlaubt ->
        if (erlaubt) {
            starteKamera()
        } else {
            Toast.makeText(this, "Ohne Kamera-Erlaubnis geht der Kamera-Modus nicht", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(R.style.KameraThema)
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_kamera)
        vorschau = findViewById(R.id.vorschau)
        standbild = findViewById(R.id.standbild)
        kaesten = findViewById(R.id.kaesten)
        status = findViewById(R.id.status)
        knopfAnhalten = findViewById(R.id.knopf_anhalten)

        uebersetzer = Uebersetzer()
        uebersetzer.aufwaermen(Einstellungen.quelle(this))
        vorleser = Vorleser(this)
        arbeiter = Executors.newSingleThreadExecutor()

        findViewById<View>(R.id.knopf_zurueck).setOnClickListener { finish() }
        findViewById<View>(R.id.knopf_licht).setOnClickListener {
            licht = !licht
            kamera?.cameraControl?.enableTorch(licht)
        }
        knopfAnhalten.setOnClickListener { setzeAngehalten(!angehalten) }
        findViewById<View>(R.id.knopf_vorlesen).setOnClickListener {
            if (aktuell.isEmpty()) hinweis("Noch nichts übersetzt") else vorleser.sprich(aktuell.joinToString("\n") { it.second })
        }
        findViewById<View>(R.id.knopf_kopieren).setOnClickListener {
            if (aktuell.isEmpty()) hinweis("Noch nichts übersetzt") else kopiere(this, aktuell.joinToString("\n") { it.second })
        }

        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            starteKamera()
        } else {
            kameraErlaubnis.launch(Manifest.permission.CAMERA)
        }
    }

    override fun onDestroy() {
        vorleser.schliessen()
        uebersetzer.schliessen()
        arbeiter.shutdown()
        super.onDestroy()
    }

    private fun starteKamera() {
        val anbieterZukunft = ProcessCameraProvider.getInstance(this)
        anbieterZukunft.addListener({
            try {
                val anbieter = anbieterZukunft.get()
                val bild = Preview.Builder().build().also { it.surfaceProvider = vorschau.surfaceProvider }
                val analyse = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                analyse.setAnalyzer(arbeiter, ::werteAus)
                anbieter.unbindAll()
                kamera = anbieter.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, bild, analyse)
            } catch (fehler: Exception) {
                Absturzbericht.speichere(this, fehler)
                hinweis("Kamera konnte nicht gestartet werden")
                finish()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    /** Laeuft fuer jedes Kamerabild - ausgewertet wird hoechstens alle 0,7 Sekunden. */
    @androidx.annotation.OptIn(androidx.camera.core.ExperimentalGetImage::class)
    private fun werteAus(bildchen: ImageProxy) {
        val jetzt = SystemClock.elapsedRealtime()
        val medium = bildchen.image
        if (angehalten || beschaeftigt || jetzt - letzteAuswertung < 700 || medium == null) {
            bildchen.close()
            return
        }
        beschaeftigt = true
        letzteAuswertung = jetzt
        val drehung = bildchen.imageInfo.rotationDegrees
        // Masse des aufrecht gedrehten Bildes - in diesen Koordinaten liefert ML Kit die Kaesten
        val breite = if (drehung % 180 == 0) bildchen.width else bildchen.height
        val hoehe = if (drehung % 180 == 0) bildchen.height else bildchen.width
        texterkenner.process(InputImage.fromMediaImage(medium, drehung))
            .addOnSuccessListener(ContextCompat.getMainExecutor(this)) { ergebnis ->
                val funde = ergebnis.textBlocks.mapNotNull { block ->
                    val text = block.text.replace('\n', ' ').trim()
                    val ort = block.boundingBox
                    if (ort != null && text.count { it.isLetter() } >= 3) {
                        Fund(text, umrechnen(ort, breite, hoehe), zeilen = block.lines.size)
                    } else {
                        null
                    }
                }
                uebersetze(funde)
            }
            .addOnFailureListener(ContextCompat.getMainExecutor(this)) { beschaeftigt = false }
            .addOnCompleteListener { bildchen.close() }
    }

    /** Kamerabild-Koordinaten auf die Vorschau umrechnen (die fuellt den Bildschirm und schneidet ab). */
    private fun umrechnen(ort: Rect, breite: Int, hoehe: Int): Rect {
        val faktor = max(vorschau.width / breite.toFloat(), vorschau.height / hoehe.toFloat())
        val dx = (vorschau.width - breite * faktor) / 2
        val dy = (vorschau.height - hoehe * faktor) / 2
        return Rect(
            (ort.left * faktor + dx).toInt(), (ort.top * faktor + dy).toInt(),
            (ort.right * faktor + dx).toInt(), (ort.bottom * faktor + dy).toInt(),
        )
    }

    private fun uebersetze(alle: List<Fund>) {
        if (angehalten) return run { beschaeftigt = false }
        val funde = alle.inLesereihenfolge().filter { !istOrtsname(it.text) }
        if (funde.isEmpty()) {
            zeige(emptyList())
            status.setText(R.string.kamera_suche)
            beschaeftigt = false
            return
        }
        val deutsch = arrayOfNulls<String>(funde.size)
        uebersetzer.uebersetzeAlle(
            funde.map { it.text },
            Einstellungen.quelle(this),
            { status.text = it },
            einzeln = { i, d -> deutsch[i] = d },
        ) { fehler ->
            if (!angehalten) {
                val paare = funde.indices.mapNotNull { i ->
                    deutsch[i]?.takeIf { !it.trim().equals(funde[i].text.trim(), true) }?.let { funde[i] to it }
                }
                zeige(paare)
                status.text = when {
                    paare.isNotEmpty() -> "→ Deutsch"
                    fehler != null -> fehler.message ?: "Übersetzung fehlgeschlagen"
                    else -> "Schon Deutsch?"
                }
            }
            beschaeftigt = false
        }
    }

    private fun zeige(eintraege: List<Pair<Fund, String>>) {
        aktuell = eintraege
        kaesten.removeAllViews()
        eintraege.forEach { (fund, deutsch) ->
            val o = fund.ort
            kaesten.addView(uebersetzungsKasten(this, deutsch, fund).apply {
                translationX = o.left.toFloat()
                translationY = o.top.toFloat()
                setOnClickListener { vorleser.sprich(deutsch) }
            }, FrameLayout.LayoutParams(o.width(), max(o.height(), 1)))
        }
    }

    private fun setzeAngehalten(an: Boolean) {
        angehalten = an
        knopfAnhalten.text = if (an) "▶" else "⏸"
        if (an) {
            // Aktuelles Bild festhalten, damit Kaesten und Bild zusammenpassen
            standbild.setImageBitmap(vorschau.bitmap)
            standbild.visibility = View.VISIBLE
            status.text = "Angehalten – Kasten antippen zum Vorlesen"
        } else {
            standbild.visibility = View.GONE
            standbild.setImageDrawable(null)
            status.setText(R.string.kamera_suche)
        }
    }

    private fun hinweis(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
}
