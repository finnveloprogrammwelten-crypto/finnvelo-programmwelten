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
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlin.math.abs

/**
 * Bedienungshilfe mit schwebendem "DE"-Knopf.
 *
 * Automatik (Standard): DE antippen schaltet die Uebersetzung fuer die
 * gerade offene App dauerhaft ein (Knopf wird gruen). Danach wird nach jedem
 * Scrollen oder neuen Inhalt neu uebersetzt; die Kaesten lassen alle
 * Beruehrungen zur App durch. Nochmal antippen schaltet sie fuer diese App aus.
 *
 * Ohne Automatik: DE antippen uebersetzt einmal, mit Leiste (Liste,
 * Vorlesen, Kopieren). Gedrueckt halten oeffnet die Einstellungen.
 */
class UebersetzerDienst : AccessibilityService() {

    companion object {
        /** Laufende Bedienungshilfe - fuer Kachel und Hauptbildschirm */
        var instanz: UebersetzerDienst? = null
            private set

        private val BLAU = Color.parseColor("#E61E3A8A")
        private val GRUEN = Color.parseColor("#E62E7D32")
        private val NICHT_APPS = setOf("com.android.systemui", "android")
    }

    private lateinit var fenster: WindowManager
    private lateinit var uebersetzer: Uebersetzer
    private lateinit var vorleser: Vorleser
    private val handler = Handler(Looper.getMainLooper())
    private val texterkenner by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

    private var knopf: TextView? = null
    private val knopfFarbe = GradientDrawable()
    private var knopfRahmen: FrameLayout? = null
    private var ring: ProgressBar? = null
    private var knopfParameter: WindowManager.LayoutParams? = null

    private var ebene: Ebene? = null
    private var arbeitet = false
    private var auftrag = 0
    private var letzteTexte: List<Pair<String, Rect>> = emptyList()
    private var veraendert = false
    private var zweiterDurchlauf = false
    /** Leisten-Ansicht (lange gedrueckt) ist offen - Automatik pausiert solange */
    private var interaktiv = false

    /** Paket der App, die gerade im Vordergrund ist (nicht die eigene) */
    private var vordergrund: String? = null
    private var inEigenerApp = false
    private val auffrischen = Runnable { sicher { frischeAuf() } }

    override fun onServiceConnected() {
        fenster = getSystemService(WindowManager::class.java)
        sicher {
            uebersetzer = Uebersetzer()
            vorleser = Vorleser(this)
            zeigeKnopf()
            instanz = this
            aktualisiereKnopf()
            uebersetzer.aufwaermen(Einstellungen.quelle(this))
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

    private fun eigeneAppVorne(): Boolean {
        val vorne = windows.firstOrNull { it.isActive } ?: return false
        return vorne.type == AccessibilityWindowInfo.TYPE_APPLICATION && vorne.root?.packageName == packageName
    }

    /** Wird die gerade offene App automatisch uebersetzt? */
    private fun automatikHier() =
        Einstellungen.automatik(this) && vordergrund?.let { it in Einstellungen.autoApps(this) } == true

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val paket = event?.packageName?.toString() ?: return
        val typ = event.eventType

        if (paket == packageName) {
            // Eigener Hauptbildschirm / Kamera: dort keinen Knopf und keine Uebersetzung.
            // Erkannt am aktiven App-Fenster - eigene Einblendungen (Kaesten, Dialog) zaehlen nicht.
            if (typ == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && eigeneAppVorne()) {
                inEigenerApp = true
                vordergrund = null
                entferneEbene()
                aktualisiereKnopf()
            }
            return
        }

        if (typ == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            val tastatur = Settings.Secure.getString(contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
                ?.substringBefore('/')
            if (paket == tastatur || paket in NICHT_APPS) return
            inEigenerApp = false
            if (paket != vordergrund) {
                // Andere App im Vordergrund: alte Uebersetzung weg, ggf. Automatik fuer die neue
                vordergrund = paket
                entferneEbene()
                aktualisiereKnopf()
                if (automatikHier()) plane(250)
                return
            }
        }
        if (paket != vordergrund) return

        if (automatikHier()) {
            if (interaktiv) return
            // Beim Scrollen die Kaesten mitbewegen (oder ausblenden, wenn die App nicht
            // meldet, wie weit), nach kurzer Ruhe neu uebersetzen
            if (typ == AccessibilityEvent.TYPE_VIEW_SCROLLED) folgeScrollen(event)
            plane(300)
        } else if (arbeitet &&
            (typ == AccessibilityEvent.TYPE_VIEW_SCROLLED || typ == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        ) {
            veraendert = true
        }
    }

    private fun folgeScrollen(event: AccessibilityEvent) {
        val sichtbar = ebene ?: return
        val dx = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) event.scrollDeltaX else -1
        val dy = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) event.scrollDeltaY else -1
        val bereich = event.source?.let { Rect().also(it::getBoundsInScreen) }
        if (bereich == null || (dx == -1 && dy == -1) || (dx == 0 && dy == 0)) {
            sichtbar.visibility = View.INVISIBLE
        } else {
            sichtbar.verschiebe(bereich, dx, dy)
        }
    }

    private fun plane(verzoegerung: Long) {
        handler.removeCallbacks(auffrischen)
        handler.postDelayed(auffrischen, verzoegerung)
    }

    /** Automatik: nur dann neu uebersetzen, wenn sich am Bildschirm etwas geaendert hat. */
    private fun frischeAuf() {
        if (!automatikHier() || interaktiv) return
        if (arbeitet) return plane(250)
        val jetzt = sammleBildschirmtext().map { it.text to it.ort }
        if (jetzt == letzteTexte) {
            // Nichts Neues (z.B. nur eine Animation): bisherige Uebersetzung wieder zeigen
            ebene?.visibility = View.VISIBLE
            return
        }
        ebene?.visibility = View.INVISIBLE
        starte(automatik = true)
    }

    /** Knopf zeigen/verstecken und einfaerben (gruen = Automatik an fuer diese App). */
    fun aktualisiereKnopf() {
        knopfRahmen?.visibility =
            if (inEigenerApp || !Einstellungen.knopfZeigen(this)) View.GONE else View.VISIBLE
        knopfFarbe.setColor(if (automatikHier()) GRUEN else BLAU)
    }

    /** Antippen der Schnelleinstellungs-Kachel: Leiste einklappen, dann wie DE antippen. */
    fun vonKachel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            performGlobalAction(GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE)
        } else {
            performGlobalAction(GLOBAL_ACTION_BACK)
        }
        handler.postDelayed({ sicher { knopfGetippt() } }, 600)
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
            background = knopfFarbe.apply {
                shape = GradientDrawable.OVAL
                setColor(BLAU)
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
        val langDruck = Runnable { warLang = true; sicher { langGedrueckt() } }
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

    /** Lange gedrueckt: einmal mit Leiste uebersetzen (Liste, Vorlesen, Korrigieren, Einstellungen). */
    private fun langGedrueckt() {
        entferneEbene()
        interaktiv = true
        zweiterDurchlauf = false
        starte(automatik = false)
    }

    /** Eigene Uebersetzung eintragen - gilt ab sofort immer fuer diesen Text. */
    private fun korrigiere(original: String, bisher: String, fertig: (String) -> Unit) {
        val thema = android.view.ContextThemeWrapper(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
        val feld = android.widget.EditText(thema).apply {
            setText(bisher)
            setSelection(text.length)
        }
        val rahmen = FrameLayout(thema).apply {
            val p = (20 * resources.displayMetrics.density).toInt()
            setPadding(p, 0, p, 0)
            addView(feld)
        }
        val dialog = android.app.AlertDialog.Builder(thema)
            .setTitle("Übersetzung korrigieren")
            .setMessage(original)
            .setView(rahmen)
            .setPositiveButton("Speichern") { _, _ ->
                val neu = feld.text.toString().trim()
                Woerterbuch.speichereKorrektur(this, original, neu)
                if (neu.isNotEmpty()) fertig(neu)
                meldung("Gemerkt – wird ab jetzt immer so übersetzt")
            }
            .setNeutralButton("Zurücksetzen") { _, _ ->
                Woerterbuch.speichereKorrektur(this, original, "")
                meldung("Eigene Korrektur entfernt")
            }
            .setNegativeButton("Abbrechen", null)
            .create()
        dialog.window?.setType(WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY)
        dialog.show()
    }

    private fun knopfGetippt() {
        if (interaktiv) return entferneEbene()
        if (Einstellungen.automatik(this)) {
            val app = vordergrund ?: return meldung("Erst eine App öffnen")
            val an = app !in Einstellungen.autoApps(this)
            Einstellungen.setzeAutoApp(this, app, an)
            entferneEbene()
            aktualisiereKnopf()
            if (an) {
                meldung("Übersetzt jetzt automatisch – DE nochmal tippen zum Ausschalten")
                plane(0)
            } else {
                meldung("Automatik für diese App aus")
            }
            return
        }
        // Einmal uebersetzen (mit Leiste)
        if (ebene != null) return entferneEbene()
        if (arbeitet) return
        zweiterDurchlauf = false
        starte(automatik = false)
    }

    private fun starte(automatik: Boolean) {
        arbeitet = true
        veraendert = false
        ring?.visibility = View.VISIBLE
        val nr = ++auftrag
        sammle(mitFoto = true) { funde -> sicher { if (nr == auftrag) uebersetzeFunde(funde, nr, automatik) } }
    }

    private fun fertig() {
        arbeitet = false
        ring?.visibility = View.GONE
        knopf?.text = if (ebene != null && !automatikHier()) "✕" else "DE"
    }

    // ------------------------------------------------------- Texte finden

    /**
     * Sammelt die Texte. Mit Bildschirmfoto (ab Android 11) kommen die Farben dazu
     * und - bei eingeschalteter Texterkennung - Text in Karten und Bildern, wo die
     * App selbst keinen Text meldet.
     */
    private fun sammle(mitFoto: Boolean, weiter: (List<Fund>) -> Unit) {
        val text = sammleBildschirmtext()
        letzteTexte = text.map { it.text to it.ort }
        if (!mitFoto || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return weiter(text)
        machFoto { bild ->
            if (bild == null) return@machFoto weiter(text)
            if (!Einstellungen.texterkennung(this)) {
                weiter(faerbe(text, bild))
                bild.recycle()
                return@machFoto
            }
            erkenneText(bild) { erkannt ->
                val zusaetzlich = erkannt.filter { neu -> text.none { ueberlappt(it.ort, neu.ort) } }
                weiter(faerbe(text + zusaetzlich, bild))
                bild.recycle()
            }
        }
    }

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

    /** Bildschirmfoto ohne den eigenen Knopf (null, wenn es nicht klappt). */
    private fun machFoto(fertig: (Bitmap?) -> Unit) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return fertig(null)
        knopfRahmen?.visibility = View.INVISIBLE
        handler.postDelayed({
            takeScreenshot(Display.DEFAULT_DISPLAY, mainExecutor, object : TakeScreenshotCallback {
                override fun onSuccess(foto: ScreenshotResult) {
                    aktualisiereKnopf()
                    val hardware = Bitmap.wrapHardwareBuffer(foto.hardwareBuffer, foto.colorSpace)
                    val bild = hardware?.copy(Bitmap.Config.ARGB_8888, false)
                    hardware?.recycle()
                    foto.hardwareBuffer.close()
                    fertig(bild)
                }

                override fun onFailure(fehlercode: Int) {
                    aktualisiereKnopf()
                    fertig(null)
                }
            })
        }, 80)
    }

    /** Texterkennung im Bildschirmfoto - findet auch Beschriftungen in Karten und Bildern. */
    private fun erkenneText(bild: Bitmap, fertig: (List<Fund>) -> Unit) {
        val mindestHoehe = 8 * resources.displayMetrics.density
        texterkenner.process(InputImage.fromBitmap(bild, 0))
            .addOnSuccessListener { ergebnis ->
                fertig(ergebnis.textBlocks.mapNotNull { block ->
                    val text = block.text.replace('\n', ' ').trim()
                    val ort = block.boundingBox ?: return@mapNotNull null
                    // Bruchstuecke und Fehlerkennungen weglassen
                    val sicherheit = block.lines.map { it.confidence }.average()
                    if (text.count { it.isLetter() } < 3 || ort.height() < mindestHoehe || sicherheit < 0.5) null
                    else Fund(text, ort, zeilen = block.lines.size)
                })
            }
            .addOnFailureListener { fertig(emptyList()) }
    }

    // ---------------------------------------------------------- Uebersetzen

    /**
     * Uebersetzt und zeigt die Kaesten nach und nach. Bei [automatik] lassen sie
     * alle Beruehrungen zur App durch und es gibt keine Leiste.
     */
    private fun uebersetzeFunde(alle: List<Fund>, nr: Int, automatik: Boolean) {
        val funde = alle.inLesereihenfolge().filter { !istOrtsname(it.text) }
        if (funde.isEmpty()) {
            if (automatik) entferneEbene(nurAnzeige = true) else meldung("Kein Text gefunden")
            return fertig()
        }
        val neu = Ebene(
            this, funde, List(funde.size) { null }, automatik, vorleser,
            korrigieren = ::korrigiere,
            einstellungen = ::oeffneEinstellungen,
        ) { entferneEbene() }
        zeigeEbene(neu, automatik)

        uebersetzer.uebersetzeAlle(
            this,
            funde.map { it.text },
            Einstellungen.quelle(this),
            { if (!automatik || !neu.hatInhalt()) meldung(it) },
            einzeln = { i, deutsch -> if (nr == auftrag) neu.setze(i, deutsch) },
        ) { fehler ->
            if (nr != auftrag) return@uebersetzeAlle
            sicher {
                if (!neu.hatInhalt()) {
                    if (!automatik) {
                        meldung(fehler?.let { "Übersetzung fehlgeschlagen: ${it.message}" } ?: "Nichts zu übersetzen – schon Deutsch?")
                    }
                    entferneEbene(nurAnzeige = true)
                }
                fertig()
                if (automatik) plane(250) else pruefeVeraltet()
            }
        }
    }

    /**
     * Ohne Automatik: hat sich der Bildschirm waehrend des Uebersetzens bewegt,
     * stimmen die Orte nicht mehr. Dann einmal neu (schnell, Uebersetzungen sind gemerkt).
     */
    private fun pruefeVeraltet() {
        if (zweiterDurchlauf || ebene == null) return
        val jetzt = sammleBildschirmtext().map { it.text to it.ort }
        if (!veraendert && jetzt == letzteTexte) return
        zweiterDurchlauf = true
        entferneEbene(nurAnzeige = true)
        starte(automatik = false)
    }

    private fun zeigeEbene(neu: Ebene, durchlaessig: Boolean) {
        val alt = ebene
        val parameter = overlayParameter(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT)
        // Beruehrungen gehen durch zur App darunter, damit man sie normal bedienen kann
        if (durchlaessig) parameter.flags = parameter.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        fenster.addView(neu, parameter)
        alt?.let { runCatching { fenster.removeView(it) } }
        ebene = neu
        // Knopf wieder nach oben holen, damit er ueber der Ebene liegt
        knopfRahmen?.let { k ->
            fenster.removeView(k)
            fenster.addView(k, knopfParameter)
        }
    }

    /** [nurAnzeige] = nur die Kaesten weg, eine laufende Uebersetzung nicht abbrechen. */
    private fun entferneEbene(nurAnzeige: Boolean = false) {
        ebene?.let { runCatching { fenster.removeView(it) } }
        ebene = null
        if (!nurAnzeige) {
            if (interaktiv) {
                interaktiv = false
                // Zurueck zur Automatik, falls sie fuer diese App an ist
                if (automatikHier()) plane(150)
            }
            handler.removeCallbacks(auffrischen)
            auftrag++
            arbeitet = false
            ring?.visibility = View.GONE
            letzteTexte = emptyList()
            if (::vorleser.isInitialized) vorleser.stopp()
        }
        if (!arbeitet) knopf?.text = "DE"
    }

    private fun meldung(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
}
