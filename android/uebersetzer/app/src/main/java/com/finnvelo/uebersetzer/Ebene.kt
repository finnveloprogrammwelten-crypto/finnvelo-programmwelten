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

/** Ein gefundener Text und wo er auf dem Bildschirm steht. */
data class Fund(val text: String, val ort: Rect)

/** Gelber Kasten mit der Uebersetzung - genutzt ueber Apps und im Kamera-Modus. */
fun uebersetzungsKasten(context: Context, deutsch: String) = TextView(context).apply {
    val dichte = resources.displayMetrics.density
    text = deutsch
    setTextColor(Color.parseColor("#111111"))
    gravity = Gravity.CENTER_VERTICAL
    val p = (2 * dichte).toInt()
    setPadding(p, 0, p, 0)
    background = GradientDrawable().apply {
        setColor(Color.parseColor("#F5FFFDE7"))
        setStroke((1 * dichte).toInt(), Color.parseColor("#C9A227"))
        cornerRadius = 4 * dichte
    }
    setAutoSizeTextTypeUniformWithConfiguration(6, 28, 1, TypedValue.COMPLEX_UNIT_SP)
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
    private val uebersetzungen: List<String>,
    live: Boolean,
    private val vorleser: Vorleser,
    schliessen: () -> Unit,
) : ViewGroup(context) {

    private val dichte = resources.displayMetrics.density
    private val tafelTitel = TextView(context)
    private val tafelText = TextView(context)
    private var tafelInhalt = ""
    private val tafel: LinearLayout
    private val leiste: LinearLayout?

    init {
        setBackgroundColor(Color.parseColor(if (live) "#00000000" else "#22000000"))
        if (!live) setOnClickListener { schliessen() }
        funde.forEachIndexed { i, fund ->
            addView(uebersetzungsKasten(context, uebersetzungen[i]).apply {
                if (!live) setOnClickListener {
                    zeigeTafel("Übersetzung", "${uebersetzungen[i]}\n\nOriginal:\n${fund.text}", uebersetzungen[i])
                }
            })
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
            addView(leistenKnopf("✕") { vorleser.stopp(); schliessen() })
        }
        leiste?.let { addView(it) }
    }

    private fun alles() = lesereihenfolge(funde, uebersetzungen).joinToString("\n") { it.second }

    private fun zeigeListe() {
        val liste = lesereihenfolge(funde, uebersetzungen).joinToString("\n\n") { (f, d) -> "$d\n   ↳ ${f.text}" }
        zeigeTafel("Alle Übersetzungen (${funde.size})", liste, alles())
    }

    private fun zeigeTafel(titel: String, anzeige: String, inhalt: String) {
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
                MeasureSpec.makeMeasureSpec(fund.ort.width(), MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(fund.ort.height(), MeasureSpec.EXACTLY),
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
            getChildAt(i).layout(o.left - position[0], o.top - position[1], o.right - position[0], o.bottom - position[1])
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
