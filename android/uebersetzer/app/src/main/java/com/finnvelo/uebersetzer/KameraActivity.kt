package com.finnvelo.uebersetzer

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.graphics.Rect
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.provider.MediaStore
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
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
import kotlin.math.min

/**
 * Kamera-Uebersetzer.
 *
 * Foto (Standard): Ausloeser antippen -> das Bild steht, der Text darin wird
 * erkannt und uebersetzt - Wackeln stoert nicht mehr. Nochmal antippen = neues
 * Foto. Auch Bilder aus der Galerie (z.B. Screenshots) lassen sich uebersetzen.
 *
 * Live: laufend uebersetzen, Ausloeser haelt an / laeuft weiter.
 */
class KameraActivity : ComponentActivity() {

    private lateinit var vorschau: PreviewView
    private lateinit var standbild: ImageView
    private lateinit var kaesten: FrameLayout
    private lateinit var status: TextView
    private lateinit var ausloeser: TextView
    private lateinit var knopfModus: TextView

    private lateinit var uebersetzer: Uebersetzer
    private lateinit var vorleser: Vorleser
    private val texterkenner by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
    private lateinit var arbeiter: ExecutorService
    private var anbieter: ProcessCameraProvider? = null
    private var kamera: Camera? = null
    private val foto = ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build()

    private var live = false
    @Volatile private var beschaeftigt = false
    @Volatile private var angehalten = false
    private var letzteAuswertung = 0L
    private var licht = false
    private var auftrag = 0
    private var aktuell: List<Pair<Fund, String>> = emptyList()

    private val kameraErlaubnis = registerForActivityResult(ActivityResultContracts.RequestPermission()) { erlaubt ->
        if (erlaubt) {
            starteKamera()
        } else {
            Toast.makeText(this, "Ohne Kamera-Erlaubnis geht nur „Bild aus der Galerie“", Toast.LENGTH_LONG).show()
        }
    }

    private val galerie = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { adresse ->
        adresse?.let { ladeAusGalerie(it) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(R.style.KameraThema)
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_kamera)
        vorschau = findViewById(R.id.vorschau)
        standbild = findViewById(R.id.standbild)
        kaesten = findViewById(R.id.kaesten)
        status = findViewById(R.id.status)
        ausloeser = findViewById(R.id.knopf_ausloeser)
        knopfModus = findViewById(R.id.knopf_modus)

        uebersetzer = Uebersetzer()
        uebersetzer.aufwaermen(Einstellungen.quelle(this))
        vorleser = Vorleser(this)
        arbeiter = Executors.newSingleThreadExecutor()
        live = Einstellungen.kameraLive(this)

        findViewById<View>(R.id.knopf_zurueck).setOnClickListener { finish() }
        findViewById<View>(R.id.knopf_licht).setOnClickListener {
            licht = !licht
            kamera?.cameraControl?.enableTorch(licht)
        }
        ausloeser.setOnClickListener { ausloeserGetippt() }
        knopfModus.setOnClickListener { setzeLive(!live) }
        findViewById<View>(R.id.knopf_galerie).setOnClickListener {
            galerie.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        }
        findViewById<View>(R.id.knopf_vorlesen).setOnClickListener {
            if (aktuell.isEmpty()) hinweis("Noch nichts übersetzt") else vorleser.sprich(aktuell.joinToString("\n") { it.second })
        }
        findViewById<View>(R.id.knopf_kopieren).setOnClickListener {
            if (aktuell.isEmpty()) hinweis("Noch nichts übersetzt") else kopiere(this, aktuell.joinToString("\n") { it.second })
        }
        zeigeModus()

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

    // ------------------------------------------------------------ Kamera

    private fun starteKamera() {
        val zukunft = ProcessCameraProvider.getInstance(this)
        zukunft.addListener({
            try {
                anbieter = zukunft.get()
                verbinde()
            } catch (fehler: Exception) {
                Absturzbericht.speichere(this, fehler)
                hinweis("Kamera konnte nicht gestartet werden")
            }
        }, ContextCompat.getMainExecutor(this))
    }

    /** Foto braucht Vorschau + Aufnahme, Live braucht Vorschau + Bildauswertung. */
    private fun verbinde() {
        val a = anbieter ?: return
        val bild = Preview.Builder().build().also { it.surfaceProvider = vorschau.surfaceProvider }
        a.unbindAll()
        kamera = if (live) {
            val analyse = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analyse.setAnalyzer(arbeiter, ::werteAus)
            a.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, bild, analyse)
        } else {
            a.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, bild, foto)
        }
        if (licht) kamera?.cameraControl?.enableTorch(true)
    }

    private fun setzeLive(an: Boolean) {
        live = an
        Einstellungen.setzeKameraLive(this, an)
        zurueckZurVorschau()
        zeigeModus()
        verbinde()
    }

    private fun zeigeModus() {
        knopfModus.text = if (live) "FOTO" else "LIVE"
        ausloeser.text = if (live) "⏸" else "📷"
        status.text = if (live) getString(R.string.kamera_suche) else "Text anpeilen und auf 📷 tippen"
    }

    private fun ausloeserGetippt() {
        when {
            live -> setzeAngehalten(!angehalten)
            standbild.visibility == View.VISIBLE -> zurueckZurVorschau()
            else -> fotografiere()
        }
    }

    private fun zurueckZurVorschau() {
        auftrag++
        angehalten = false
        beschaeftigt = false
        standbild.visibility = View.GONE
        standbild.setImageDrawable(null)
        zeige(emptyList())
        if (!live) {
            ausloeser.text = "📷"
            status.text = "Text anpeilen und auf 📷 tippen"
        }
    }

    // ------------------------------------------------------- Foto-Modus

    private fun fotografiere() {
        // Sofort das Vorschaubild einfrieren, damit es sich wie ein Foto anfuehlt
        vorschau.bitmap?.let { standbild.setImageBitmap(it) }
        standbild.visibility = View.VISIBLE
        ausloeser.text = "↺"
        status.text = "Text wird erkannt …"
        foto.takePicture(ContextCompat.getMainExecutor(this), object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(aufnahme: ImageProxy) {
                val drehung = aufnahme.imageInfo.rotationDegrees
                val roh = aufnahme.toBitmap()
                aufnahme.close()
                werteFotoAus(aufrecht(roh, drehung))
            }

            override fun onError(fehler: ImageCaptureException) {
                status.text = "Foto fehlgeschlagen – nochmal versuchen"
                ausloeser.text = "📷"
                standbild.visibility = View.GONE
            }
        })
    }

    private fun ladeAusGalerie(adresse: Uri) {
        runCatching {
            val bild = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                ImageDecoder.decodeBitmap(ImageDecoder.createSource(contentResolver, adresse)) { decoder, _, _ ->
                    decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                }
            } else {
                @Suppress("DEPRECATION")
                MediaStore.Images.Media.getBitmap(contentResolver, adresse)
            }
            ausloeser.text = if (live) "⏸" else "↺"
            if (live) angehalten = true
            werteFotoAus(bild)
        }.onFailure { hinweis("Bild konnte nicht geöffnet werden") }
    }

    /** Erkennt den Text im Foto, nimmt die Farben daraus und uebersetzt - Kaesten erscheinen nach und nach. */
    private fun werteFotoAus(roh: Bitmap) {
        val bild = verkleinert(roh, 2200)
        standbild.setImageBitmap(bild)
        standbild.visibility = View.VISIBLE
        status.text = "Text wird erkannt …"
        val nr = ++auftrag
        texterkenner.process(InputImage.fromBitmap(bild, 0))
            .addOnSuccessListener(ContextCompat.getMainExecutor(this)) { ergebnis ->
                if (nr != auftrag) return@addOnSuccessListener
                val funde = ergebnis.textBlocks.mapNotNull { block ->
                    val text = block.text.replace('\n', ' ').trim()
                    val ort = block.boundingBox
                    if (ort != null && text.count { it.isLetter() } >= 3) Fund(text, ort, zeilen = block.lines.size) else null
                }
                if (funde.isEmpty()) {
                    status.text = "Kein Text gefunden – näher ran oder mehr Licht (🔦)"
                    return@addOnSuccessListener
                }
                // Farben im Foto (Bildkoordinaten) bestimmen, dann auf den Bildschirm umrechnen
                val aufBildschirm = faerbe(funde, bild).map { it.copy(ort = aufAnzeige(it.ort, bild.width, bild.height)) }
                uebersetze(aufBildschirm, nr, fortlaufend = true)
            }
            .addOnFailureListener(ContextCompat.getMainExecutor(this)) { status.text = "Texterkennung fehlgeschlagen" }
    }

    private fun aufrecht(bild: Bitmap, drehung: Int): Bitmap {
        if (drehung == 0) return bild
        val m = Matrix().apply { postRotate(drehung.toFloat()) }
        return Bitmap.createBitmap(bild, 0, 0, bild.width, bild.height, m, true)
    }

    private fun verkleinert(bild: Bitmap, laengsteSeite: Int): Bitmap {
        val faktor = laengsteSeite.toFloat() / max(bild.width, bild.height)
        if (faktor >= 1f) return bild
        return Bitmap.createScaledBitmap(bild, (bild.width * faktor).toInt(), (bild.height * faktor).toInt(), true)
    }

    /** Bild wird ganz gezeigt (fitCenter) - Kaesten entsprechend umrechnen. */
    private fun aufAnzeige(ort: Rect, breite: Int, hoehe: Int): Rect {
        val faktor = min(standbild.width / breite.toFloat(), standbild.height / hoehe.toFloat())
        val dx = (standbild.width - breite * faktor) / 2
        val dy = (standbild.height - hoehe * faktor) / 2
        return Rect(
            (ort.left * faktor + dx).toInt(), (ort.top * faktor + dy).toInt(),
            (ort.right * faktor + dx).toInt(), (ort.bottom * faktor + dy).toInt(),
        )
    }

    // ------------------------------------------------------- Live-Modus

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
        val nr = auftrag
        texterkenner.process(InputImage.fromMediaImage(medium, drehung))
            .addOnSuccessListener(ContextCompat.getMainExecutor(this)) { ergebnis ->
                val funde = ergebnis.textBlocks.mapNotNull { block ->
                    val text = block.text.replace('\n', ' ').trim()
                    val ort = block.boundingBox
                    if (ort != null && text.count { it.isLetter() } >= 3) {
                        Fund(text, aufVorschau(ort, breite, hoehe), zeilen = block.lines.size)
                    } else {
                        null
                    }
                }
                if (nr == auftrag && !angehalten) uebersetze(funde, nr, fortlaufend = false) else beschaeftigt = false
            }
            .addOnFailureListener(ContextCompat.getMainExecutor(this)) { beschaeftigt = false }
            .addOnCompleteListener { bildchen.close() }
    }

    /** Kamerabild-Koordinaten auf die Vorschau umrechnen (die fuellt den Bildschirm und schneidet ab). */
    private fun aufVorschau(ort: Rect, breite: Int, hoehe: Int): Rect {
        val faktor = max(vorschau.width / breite.toFloat(), vorschau.height / hoehe.toFloat())
        val dx = (vorschau.width - breite * faktor) / 2
        val dy = (vorschau.height - hoehe * faktor) / 2
        return Rect(
            (ort.left * faktor + dx).toInt(), (ort.top * faktor + dy).toInt(),
            (ort.right * faktor + dx).toInt(), (ort.bottom * faktor + dy).toInt(),
        )
    }

    private fun setzeAngehalten(an: Boolean) {
        angehalten = an
        ausloeser.text = if (an) "▶" else "⏸"
        if (an) {
            // Aktuelles Bild festhalten, damit Kaesten und Bild zusammenpassen
            standbild.setImageBitmap(vorschau.bitmap)
            standbild.visibility = View.VISIBLE
            status.text = "Angehalten – Kasten antippen zum Vorlesen"
        } else {
            zurueckZurVorschau()
            status.setText(R.string.kamera_suche)
        }
    }

    // ---------------------------------------------------------- Uebersetzen

    /** [fortlaufend] = Kaesten einzeln zeigen, sobald sie fertig sind (Foto); sonst alle zusammen (Live). */
    private fun uebersetze(alle: List<Fund>, nr: Int, fortlaufend: Boolean) {
        val funde = alle.inLesereihenfolge().filter { !istOrtsname(it.text) }
        if (funde.isEmpty()) {
            if (!fortlaufend) zeige(emptyList())
            if (live) status.setText(R.string.kamera_suche)
            beschaeftigt = false
            return
        }
        val deutsch = arrayOfNulls<String>(funde.size)
        val paare = {
            funde.indices.mapNotNull { i ->
                deutsch[i]?.takeIf { !it.trim().equals(funde[i].text.trim(), true) }?.let { funde[i] to it }
            }
        }
        if (fortlaufend) status.text = "Wird übersetzt …"
        uebersetzer.uebersetzeAlle(
            this,
            funde.map { it.text },
            Einstellungen.quelle(this),
            { status.text = it },
            einzeln = { i, d ->
                deutsch[i] = d
                if (fortlaufend && nr == auftrag) zeige(paare())
            },
        ) { fehler ->
            if (nr == auftrag && (!live || !angehalten)) {
                val fertig = paare()
                zeige(fertig)
                status.text = when {
                    fertig.isNotEmpty() && !live -> "Fertig – Kasten antippen zum Vorlesen, ↺ für neues Foto"
                    fertig.isNotEmpty() -> "→ Deutsch"
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

    private fun hinweis(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
}
