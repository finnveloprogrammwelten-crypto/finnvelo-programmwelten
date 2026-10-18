package com.finnvelo.uebersetzer

import android.accessibilityservice.AccessibilityService
import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Display
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import android.content.res.ColorStateList
import android.provider.Settings
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.annotation.RequiresApi
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlin.math.abs

/**
 * Bedienungshilfe mit schwebendem "DE"-Knopf. Antippen liest den Text der
 * gerade sichtbaren App, uebersetzt ihn und legt die Uebersetzung darueber.
 * Gedrueckt halten oeffnet die Einstellungen. Im Live-Modus laeuft die
 * Uebersetzung beim Scrollen mit.
 */
class UebersetzerDienst : AccessibilityService() {

    companion object {
        /** Laufende Bedienungshilfe - fuer Kachel und Hauptbildschirm */
        var instanz: UebersetzerDienst? = null
            private set
    }

    private lateinit var fenster: WindowManager
    private lateinit var uebersetzer: Uebersetzer
    private val handler = Handler(Looper.getMainLooper())
    private val texterkenner by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

    private var knopf: TextView? = null
    private var knopfRahmen: FrameLayout? = null
    private var ring: ProgressBar? = null
    private var knopfParameter: WindowManager.LayoutParams? = null
    private var ebene: View? = null
    private var arbeitet = false
    private var liveAktiv = false
    private var letzteFunde: List<Fund> = emptyList()
    private var inEigenerApp = false
    private lateinit var vorleser: Vorleser
    private val liveAuffrischen = Runnable { sicher { frischeLiveAuf() } }

    override fun onServiceConnected() {
        fenster = getSystemService(WindowManager::class.java)
        sicher {
            uebersetzer = Uebersetzer()
            vorleser = Vorleser(this)
            zeigeKnopf()
            instanz = this
            aktualisiereKnopf()
        }
    }

    /** Ein Fehler soll nur gemeldet werden und nicht die Bedienungshilfe in eine Absturzschleife schicken. */
    private fun sicher(aktion: () -> Unit) {
        try {
            aktion()
        } catch (fehler: Exception) {
            Absturzbericht.speichere(this, fehler)
            arbeitet = false
            runCatching { knopf?.text = "!" }
            meldung("Fehler im Übersetzer – Details in der App")
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val paket = event?.packageName?.toString() ?: return
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            // Im eigenen Hauptbildschirm stoert der Knopf nur - dort ausblenden
            val tastatur = Settings.Secure.getString(contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
                ?.substringBefore('/')
            val eigeneSeiten = setOf(MainActivity::class.java.name, KameraActivity::class.java.name)
            if (paket == packageName && event.className?.toString() in eigeneSeiten) {
                inEigenerApp = true
                entferneEbene()
            } else if (paket != packageName && paket != tastatur) {
                inEigenerApp = false
            }
            aktualisiereKnopf()
        }
        // Live-Modus: nach Scrollen oder neuem Inhalt kurz warten, dann neu uebersetzen
        if (liveAktiv && ebene != null && paket != packageName) {
            handler.removeCallbacks(liveAuffrischen)
            handler.postDelayed(liveAuffrischen, 700)
        }
    }

    /** Knopf zeigen oder verstecken - je nach Einstellung und ob gerade die eigene App offen ist. */
    fun aktualisiereKnopf() {
        knopfRahmen?.visibility =
            if (inEigenerApp || !Einstellungen.knopfZeigen(this)) View.GONE else View.VISIBLE
    }

    /** Antippen der Schnelleinstellungs-Kachel: Leiste einklappen, dann uebersetzen. */
    fun vonKachel() {
        if (ebene != null) return entferneEbene()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            performGlobalAction(GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE)
        } else {
            performGlobalAction(GLOBAL_ACTION_BACK)
        }
        handler.postDelayed({ sicher { if (ebene == null) knopfGetippt() } }, 600)
    }

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        instanz = null
        handler.removeCallbacksAndMessages(null)
        runCatching { entferneEbene() }
        knopfRahmen?.let { k -> runCatching { fenster.removeView(k) } }
        knopf = null
        if (::uebersetzer.isInitialized) uebersetzer.schliessen()
        if (::vorleser.isInitialized) vorleser.schliessen()
        super.onDestroy()
    }

    // ---------------------------------------------------------------- Knopf

    @SuppressLint("ClickableViewAccessibility")
    private fun zeigeKnopf() {
        val dichte = resources.displayMetrics.density
        val groesse = (52 * dichte).toInt()
        val ansicht = TextView(this).apply {
            text = "DE"
            textSize = 16f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            paint.isFakeBoldText = true
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#E61E3A8A"))
                setStroke((2 * dichte).toInt(), Color.parseColor("#FFCC00"))
            }
            elevation = 6 * dichte
        }
        // Drehender Ring um den Knopf, solange gelesen, geladen oder uebersetzt wird
        val ladering = ProgressBar(this).apply {
            isIndeterminate = true
            indeterminateTintList = ColorStateList.valueOf(Color.parseColor("#FFCC00"))
            visibility = View.GONE
        }
        val rahmen = FrameLayout(this).apply {
            addView(ansicht, FrameLayout.LayoutParams(groesse - (8 * dichte).toInt(), groesse - (8 * dichte).toInt(), Gravity.CENTER))
            addView(ladering, FrameLayout.LayoutParams(groesse, groesse))
        }
        val parameter = overlayParameter(groesse, groesse).apply {
            gravity = Gravity.TOP or Gravity.START
            x = resources.displayMetrics.widthPixels - groesse - (8 * dichte).toInt()
            y = (resources.displayMetrics.heightPixels * 0.35).toInt()
        }

        // Ziehen verschiebt den Knopf, kurzes Tippen uebersetzt, langes Druecken oeffnet die App
        val schwelle = ViewConfiguration.get(this).scaledTouchSlop
        var warLang = false
        val langDruck = Runnable { warLang = true; sicher { oeffneEinstellungen() } }
        var startX = 0f
        var startY = 0f
        var knopfX = 0
        var knopfY = 0
        var gezogen = false
        rahmen.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = e.rawX; startY = e.rawY
                    knopfX = parameter.x; knopfY = parameter.y
                    gezogen = false
                    warLang = false
                    handler.postDelayed(langDruck, ViewConfiguration.getLongPressTimeout().toLong())
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - startX
                    val dy = e.rawY - startY
                    if (gezogen || abs(dx) > schwelle || abs(dy) > schwelle) {
                        gezogen = true
                        handler.removeCallbacks(langDruck)
                        parameter.x = knopfX + dx.toInt()
                        parameter.y = knopfY + dy.toInt()
                        sicher { fenster.updateViewLayout(rahmen, parameter) }
                    }
                }
                MotionEvent.ACTION_UP -> {
                    handler.removeCallbacks(langDruck)
                    if (!gezogen && !warLang) sicher { knopfGetippt() }
                }
                MotionEvent.ACTION_CANCEL -> handler.removeCallbacks(langDruck)
            }
            true
        }
        fenster.addView(rahmen, parameter)
        knopf = ansicht
        knopfRahmen = rahmen
        ring = ladering
        knopfParameter = parameter
    }

    private fun overlayParameter(breite: Int, hoehe: Int) = WindowManager.LayoutParams(
        breite, hoehe,
        WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
        PixelFormat.TRANSLUCENT,
    ).apply {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
    }

    private fun oeffneEinstellungen() {
        entferneEbene()
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    private fun knopfGetippt() {
        if (ebene != null) return entferneEbene()
        if (arbeitet) return
        arbeitet = true
        ring?.visibility = View.VISIBLE
        // Live laeuft immer mit Bildschirmtext - ein Bildschirmfoto wuerde die eigene Ebene mitfotografieren
        liveAktiv = Einstellungen.live(this)
        if (!liveAktiv && Einstellungen.texterkennung(this) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            sammleMitTexterkennung { funde -> sicher { uebersetzeFunde(funde) } }
        } else {
            uebersetzeFunde(sammleBildschirmtext())
        }
    }

    private fun fertig() {
        arbeitet = false
        ring?.visibility = View.GONE
        knopf?.text = when {
            ebene == null -> "DE"
            liveAktiv -> "● ✕"
            else -> "✕"
        }
        knopf?.textSize = if (ebene != null && liveAktiv) 12f else 16f
    }

    /** Live-Modus: neu lesen und nur dann neu uebersetzen, wenn sich etwas geaendert hat. */
    private fun frischeLiveAuf() {
        if (!liveAktiv || ebene == null || arbeitet) return
        val funde = sammleBildschirmtext()
        if (funde == letzteFunde) return
        arbeitet = true
        ring?.visibility = View.VISIBLE
        uebersetzeFunde(funde, still = true)
    }

    // ------------------------------------------------------- Texte finden

    /** Liest die Texte direkt aus der App (wie es auch Vorlese-Programme tun). */
    private fun sammleBildschirmtext(): List<Fund> {
        val wurzeln = windows
            .filter { it.type == AccessibilityWindowInfo.TYPE_APPLICATION }
            .mapNotNull { it.root }
            .ifEmpty { listOfNotNull(rootInActiveWindow) }
            .filter { it.packageName != packageName }

        val funde = LinkedHashMap<String, Fund>()
        val stapel = ArrayDeque(wurzeln)
        while (stapel.isNotEmpty() && funde.size < 200) {
            val knoten = stapel.removeLast()
            if (!knoten.isVisibleToUser) continue
            textVon(knoten)?.let { text ->
                val ort = Rect().also { knoten.getBoundsInScreen(it) }
                if (ort.width() > 4 && ort.height() > 4) funde.getOrPut("$ort|$text") { Fund(text, ort) }
            }
            for (i in knoten.childCount - 1 downTo 0) knoten.getChild(i)?.let(stapel::addLast)
        }
        return funde.values.toList()
    }

    private fun textVon(knoten: AccessibilityNodeInfo): String? {
        var text = knoten.text?.toString()?.trim()
        if (text.isNullOrEmpty() && knoten.isShowingHintText) text = knoten.hintText?.toString()?.trim()
        return text?.takeIf { t -> t.any { it.isLetter() } }
    }

    /** Macht ein Bildschirmfoto und sucht darin Text - findet auch Text in Karten und Bildern. */
    @RequiresApi(Build.VERSION_CODES.R)
    private fun sammleMitTexterkennung(weiter: (List<Fund>) -> Unit) {
        knopfRahmen?.visibility = View.INVISIBLE
        handler.postDelayed({
            takeScreenshot(Display.DEFAULT_DISPLAY, mainExecutor, object : TakeScreenshotCallback {
                override fun onSuccess(foto: ScreenshotResult) {
                    knopfRahmen?.visibility = View.VISIBLE
                    val hardware = Bitmap.wrapHardwareBuffer(foto.hardwareBuffer, foto.colorSpace)
                    val bild = hardware?.copy(Bitmap.Config.ARGB_8888, false)
                    hardware?.recycle()
                    foto.hardwareBuffer.close()
                    if (bild == null) return weiter(emptyList())
                    texterkenner.process(InputImage.fromBitmap(bild, 0))
                        .addOnSuccessListener { ergebnis ->
                            weiter(ergebnis.textBlocks.mapNotNull { block ->
                                val text = block.text.replace('\n', ' ').trim()
                                val ort = block.boundingBox
                                if (ort != null && text.any { it.isLetter() }) Fund(text, ort) else null
                            })
                        }
                        .addOnFailureListener { weiter(emptyList()) }
                        .addOnCompleteListener { bild.recycle() }
                }

                override fun onFailure(fehlercode: Int) {
                    knopfRahmen?.visibility = View.VISIBLE
                    meldung("Bildschirmfoto nicht möglich (Fehler $fehlercode)")
                    weiter(emptyList())
                }
            })
        }, 150)
    }

    // ---------------------------------------------------------- Uebersetzen

    /** [still] = im Live-Modus keine Meldungen bei jedem Scrollen */
    private fun uebersetzeFunde(funde: List<Fund>, still: Boolean = false) {
        letzteFunde = funde
        val meldung: (String) -> Unit = { if (!still) meldung(it) }
        if (funde.isEmpty()) {
            meldung("Kein Text gefunden")
            if (still) zeigeEbene(emptyList(), emptyList(), still = true)
            return fertig()
        }
        val los = { code: String ->
            when {
                code == "de" -> { meldung("Der Text ist schon auf Deutsch"); fertig() }
                !uebersetzer.istUnterstuetzt(code) -> { meldung("Sprache „$code“ wird nicht unterstützt"); fertig() }
                else -> uebersetzer.uebersetze(code, funde.map { it.text }, meldung) { ergebnis ->
                    ergebnis
                        .onSuccess { sicher { zeigeEbene(funde, it, still) } }
                        .onFailure { meldung("Übersetzung fehlgeschlagen: ${it.message}") }
                    fertig()
                }
            }
        }
        val quelle = Einstellungen.quelle(this)
        if (quelle != "auto") return los(quelle)
        uebersetzer.erkenneSprache(funde.joinToString("\n") { it.text }.take(3000)) { code ->
            if (code == null) {
                meldung("Sprache nicht erkannt – bitte in der App die Ausgangssprache wählen")
                fertig()
            } else {
                sicher { los(code) }
            }
        }
    }

    private fun zeigeEbene(funde: List<Fund>, uebersetzungen: List<String>, still: Boolean = false) {
        // Unveraenderte Texte (Namen, Zahlen ...) weglassen, damit das Original sichtbar bleibt
        val paare = funde.zip(uebersetzungen).filter { (f, d) -> !f.text.equals(d.trim(), ignoreCase = true) }
        if (paare.isEmpty() && !liveAktiv) return meldung("Nichts zu übersetzen")
        val alt = ebene
        val neu = Ebene(this, paare.map { it.first }, paare.map { it.second }, liveAktiv, vorleser, ::entferneEbene)
        val parameter = overlayParameter(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT)
        // Live: Beruehrungen gehen durch zur App darunter, damit man weiter scrollen kann
        if (liveAktiv) parameter.flags = parameter.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        fenster.addView(neu, parameter)
        alt?.let { runCatching { fenster.removeView(it) } }
        ebene = neu
        // Knopf wieder nach oben holen, damit er ueber der Ebene liegt
        knopfRahmen?.let { k ->
            fenster.removeView(k)
            fenster.addView(k, knopfParameter)
        }
    }

    private fun entferneEbene() {
        handler.removeCallbacks(liveAuffrischen)
        ebene?.let { runCatching { fenster.removeView(it) } }
        ebene = null
        liveAktiv = false
        letzteFunde = emptyList()
        if (::vorleser.isInitialized) vorleser.stopp()
        if (!arbeitet) {
            knopf?.text = "DE"
            knopf?.textSize = 16f
        }
    }

    private fun meldung(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
}
