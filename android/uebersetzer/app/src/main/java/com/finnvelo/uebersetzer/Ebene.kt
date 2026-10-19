package com.finnvelo.uebersetzer

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Kasten mit der Uebersetzung - genutzt ueber Apps und im Kamera-Modus.
 * Mit Farben aus dem Bildschirmfoto sieht er aus wie die App selbst, sonst
 * wie ein heller Zettel. Die Schrift ist hoechstens so gross wie die des
 * Originals und wird bei laengerem deutschen Text kleiner.
 */
fun uebersetzungsKasten(context: Context, deutsch: String, fund: Fund) = TextView(context).apply {
    val dichte = resources.displayMetrics.density
    text = deutsch
    gravity = Gravity.CENTER_VERTICAL
    includeFontPadding = false
    setLineSpacing(0f, 0.92f)
    val p = (2 * dichte).toInt()
    setPadding(p, 0, p, 0)
    if (fund.hintergrund != null) {
        setTextColor(fund.schrift ?: Color.BLACK)
        background = GradientDrawable().apply {
            setColor(fund.hintergrund)
            cornerRadius = 3 * dichte
        }
    } else {
        setTextColor(Color.parseColor("#14181F"))
        background = GradientDrawable().apply {
            setColor(Color.parseColor("#F7FFFCEB"))
            setStroke(dichte.toInt().coerceAtLeast(1), Color.parseColor("#66C9A227"))
            cornerRadius = 4 * dichte
        }
        elevation = 2 * dichte
    }
    val zeilenHoehe = fund.ort.height().toFloat() / fund.geschaetzteZeilen()
    val groesste = (zeilenHoehe * 0.78f).toInt().coerceIn((9 * dichte).toInt(), (30 * dichte).toInt())
    val kleinste = (8 * dichte).toInt().coerceAtMost(groesste - 1)
    setAutoSizeTextTypeUniformWithConfiguration(kleinste, groesste, 1, TypedValue.COMPLEX_UNIT_PX)
}

/**
 * Durchsichtige Ebene ueber der fremden App. Jede Uebersetzung liegt genau
 * dort, wo der Originaltext steht.
 *
 * Normal: Kasten antippen zeigt ihn unten gross (mit Vorlesen/Kopieren), die
 * Leiste unten bietet Liste, Alles vorlesen, Kopieren und Schliessen, daneben
 * tippen schliesst. Im Live-Modus ist die Ebene nur zum Ansehen (die App
 * darunter bleibt bedienbar) und hat keine Leiste.
 */
@SuppressLint("ViewConstructor")
class Ebene(
    context: Context,
    private val funde: List<Fund>,
    uebersetzungen: List<String?>,
    live: Boolean,
    private val vorleser: Vorleser,
    /** Eigene Uebersetzung eintragen: (Original, bisher, neu uebernehmen) */
    private val korrigieren: ((String, String, (String) -> Unit) -> Unit)? = null,
    einstellungen: (() -> Unit)? = null,
    schliessen: () -> Unit,
) : ViewGroup(context) {

    private val dichte = resources.displayMetrics.density
    private val tafelTitel = TextView(context)
    private val tafelText = TextView(context)
    private var tafelInhalt = ""
    private var tafelNummer = -1
    private lateinit var stift: TextView
    /** Kaesten etwas groesser als das Original, damit keine Reste durchschauen */
    private val rand = dp(2)
    private val verschoben = IntArray(funde.size * 2)
    private val tafel: LinearLayout
    private val leiste: LinearLayout?
    private val deutsch = uebersetzungen.toTypedArray()

    init {
        setBackgroundColor(Color.parseColor(if (live) "#00000000" else "#22000000"))
        if (!live) setOnClickListener { schliessen() }
        funde.forEachIndexed { i, fund ->
            addView(uebersetzungsKasten(context, "", fund).apply {
                if (!live) setOnClickListener {
                    val d = deutsch[i] ?: return@setOnClickListener
                    zeigeTafel("Übersetzung", "$d\n\nOriginal:\n${fund.text}", d, i)
                }
            })
            setze(i, deutsch[i])
        }

        tafel = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            background = runde("#F2162B66", 20f)
            val p = dp(16)
            setPadding(p, dp(10), p, p)
            visibility = GONE
            isClickable = true
            addView(LinearLayout(context).apply {
                gravity = Gravity.CENTER_VERTICAL
                addView(tafelTitel.apply {
                    setTextColor(Color.parseColor("#C7D2FE"))
                    textSize = 13f
                }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                stift = symbolKnopf("✏️") { korrigiereTafel() }
                addView(stift)
                addView(symbolKnopf("🔊") { vorleser.sprich(tafelInhalt) })
                addView(symbolKnopf("📋") { kopiere(context, tafelInhalt) })
                addView(symbolKnopf("✕") { vorleser.stopp(); visibility = GONE })
            })
            addView(ScrollView(context).apply {
                addView(tafelText.apply {
                    setTextColor(Color.WHITE)
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
                    setLineSpacing(0f, 1.15f)
                })
            })
        }
        addView(tafel)

        leiste = if (live) null else LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            background = runde("#F21E3A8A", 28f)
            elevation = 8 * dichte
            isClickable = true
            setPadding(dp(6), 0, dp(6), 0)
            addView(leistenKnopf("☰  Liste") { zeigeListe() })
            addView(leistenKnopf("🔊  Vorlesen") { vorleser.sprich(alles()) })
            addView(leistenKnopf("📋") { kopiere(context, alles()) })
            einstellungen?.let { e -> addView(leistenKnopf("⚙") { schliessen(); e() }) }
            addView(leistenKnopf("✕") { vorleser.stopp(); schliessen() })
        }
        leiste?.let { addView(it) }
    }

    /** Zeigt die fertige Uebersetzung eines Kastens (null oder unveraendert = Original sichtbar lassen). */
    fun setze(i: Int, uebersetzung: String?) {
        val sinnvoll = uebersetzung?.trim()?.takeIf { it.isNotEmpty() && !it.equals(funde[i].text.trim(), ignoreCase = true) }
        deutsch[i] = sinnvoll
        (getChildAt(i) as TextView).apply {
            text = sinnvoll ?: ""
            visibility = if (sinnvoll == null) GONE else VISIBLE
        }
    }

    /** Gibt es mindestens eine sichtbare Uebersetzung? */
    fun hatInhalt() = deutsch.any { it != null }

    private fun paare() = funde.indices.mapNotNull { i -> deutsch[i]?.let { funde[i] to it } }

    private fun alles() = paare().joinToString("\n") { it.second }

    private fun zeigeListe() {
        val paare = paare()
        val liste = paare.joinToString("\n\n") { (f, d) -> "$d\n   ↳ ${f.text}" }
        zeigeTafel("Alle Übersetzungen (${paare.size})", liste, alles())
    }

    private fun korrigiereTafel() {
        val i = tafelNummer.takeIf { it >= 0 } ?: return
        val original = funde[i].text
        korrigieren?.invoke(original, deutsch[i] ?: "") { neu ->
            // Gleicher Text kann mehrmals auf dem Bildschirm stehen
            funde.indices.filter { funde[it].text == original }.forEach { setze(it, neu) }
            zeigeTafel("Übersetzung", "$neu\n\nOriginal:\n$original", neu, i)
        }
    }

    /**
     * Beim Scrollen die Kaesten im gescrollten Bereich mitbewegen, damit sie auf
     * ihrem Text bleiben. Was dabei aus dem Bereich rutscht, wird ausgeblendet.
     */
    fun verschiebe(bereich: Rect, dx: Int, dy: Int) {
        funde.forEachIndexed { i, fund ->
            if (!Rect.intersects(bereich, fund.ort)) return@forEachIndexed
            verschoben[2 * i] -= dx
            verschoben[2 * i + 1] -= dy
            val kasten = getChildAt(i)
            kasten.translationX = verschoben[2 * i].toFloat()
            kasten.translationY = verschoben[2 * i + 1].toFloat()
            val jetzt = Rect(fund.ort).apply { offset(verschoben[2 * i], verschoben[2 * i + 1]) }
            if (deutsch[i] != null) kasten.visibility = if (bereich.contains(jetzt)) VISIBLE else INVISIBLE
        }
    }

    private fun zeigeTafel(titel: String, anzeige: String, inhalt: String, nummer: Int = -1) {
        tafelNummer = nummer
        stift.visibility = if (nummer >= 0 && korrigieren != null) VISIBLE else GONE
        tafelTitel.text = titel
        tafelText.text = anzeige
        tafelInhalt = inhalt
        tafel.visibility = VISIBLE
        requestLayout()
    }

    private fun runde(farbe: String, radius: Float) = GradientDrawable().apply {
        setColor(Color.parseColor(farbe))
        cornerRadius = radius * dichte
    }

    private fun symbolKnopf(zeichen: String, aktion: () -> Unit) = TextView(context).apply {
        text = zeichen
        textSize = 20f
        setTextColor(Color.WHITE)
        setPadding(dp(10), dp(6), dp(10), dp(6))
        setOnClickListener { aktion() }
    }

    private fun leistenKnopf(beschriftung: String, aktion: () -> Unit) = TextView(context).apply {
        text = beschriftung
        textSize = 15f
        setTextColor(Color.WHITE)
        gravity = Gravity.CENTER
        setPadding(dp(14), 0, dp(14), 0)
        minHeight = dp(52)
        setOnClickListener { aktion() }
    }

    private fun dp(wert: Int) = (wert * dichte).toInt()

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val breite = MeasureSpec.getSize(widthMeasureSpec)
        val hoehe = MeasureSpec.getSize(heightMeasureSpec)
        setMeasuredDimension(breite, hoehe)
        funde.forEachIndexed { i, fund ->
            getChildAt(i).measure(
                MeasureSpec.makeMeasureSpec(fund.ort.width() + 2 * rand, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(fund.ort.height() + 2 * rand, MeasureSpec.EXACTLY),
            )
        }
        tafel.measure(
            MeasureSpec.makeMeasureSpec(breite - dp(24), MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec((hoehe * 0.45).toInt(), MeasureSpec.AT_MOST),
        )
        leiste?.measure(
            MeasureSpec.makeMeasureSpec(breite - dp(24), MeasureSpec.AT_MOST),
            MeasureSpec.makeMeasureSpec(dp(52), MeasureSpec.EXACTLY),
        )
    }

    private val position = IntArray(2)

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        // Bildschirm-Koordinaten in Koordinaten dieser Ebene umrechnen
        getLocationOnScreen(position)
        funde.forEachIndexed { i, fund ->
            val o = fund.ort
            getChildAt(i).layout(
                o.left - rand - position[0], o.top - rand - position[1],
                o.right + rand - position[0], o.bottom + rand - position[1],
            )
        }
        val breite = r - l
        var unten = b - t - dp(56)
        leiste?.let {
            val links = (breite - it.measuredWidth) / 2
            it.layout(links, unten - it.measuredHeight, links + it.measuredWidth, unten)
            unten -= it.measuredHeight + dp(10)
        }
        tafel.layout(dp(12), unten - tafel.measuredHeight, dp(12) + tafel.measuredWidth, unten)
    }
}
