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
import android.widget.TextView

/** Ein gefundener Text und wo er auf dem Bildschirm steht. */
data class Fund(val text: String, val ort: Rect)

/**
 * Durchsichtige Ebene ueber der fremden App. Jede Uebersetzung liegt genau
 * dort, wo der Originaltext steht. Antippen eines Kastens zeigt unten den
 * ganzen Text, Antippen daneben schliesst die Ebene.
 */
@SuppressLint("ViewConstructor")
class Ebene(
    context: Context,
    private val funde: List<Fund>,
    uebersetzungen: List<String>,
    schliessen: () -> Unit,
) : ViewGroup(context) {

    private val dichte = resources.displayMetrics.density
    private val detail = TextView(context).apply {
        setBackgroundColor(Color.parseColor("#F01E3A8A"))
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        val p = (16 * dichte).toInt()
        setPadding(p, p, p, p)
        visibility = GONE
        setOnClickListener { visibility = GONE }
    }

    init {
        setBackgroundColor(Color.parseColor("#22000000"))
        setOnClickListener { schliessen() }
        funde.forEachIndexed { i, fund ->
            addView(kasten(fund.text, uebersetzungen[i]))
        }
        addView(detail)
    }

    private fun kasten(original: String, deutsch: String) = TextView(context).apply {
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
        setOnClickListener {
            detail.text = "$deutsch\n\nOriginal:\n$original"
            detail.visibility = VISIBLE
        }
    }

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
        detail.measure(
            MeasureSpec.makeMeasureSpec(breite, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(hoehe / 2, MeasureSpec.AT_MOST),
        )
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        // Bildschirm-Koordinaten in Koordinaten dieser Ebene umrechnen
        val pos = IntArray(2)
        getLocationOnScreen(pos)
        funde.forEachIndexed { i, fund ->
            val o = fund.ort
            getChildAt(i).layout(o.left - pos[0], o.top - pos[1], o.right - pos[0], o.bottom - pos[1])
        }
        val unten = b - t - (48 * dichte).toInt()
        detail.layout(0, unten - detail.measuredHeight, r - l, unten)
    }
}
