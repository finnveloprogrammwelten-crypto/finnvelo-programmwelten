package com.finnvelo.uebersetzer

import android.app.Activity
import android.app.AlertDialog
import android.content.res.ColorStateList
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast

/**
 * Karte "Sprachpakete": zeigt je Sprache, ob sie bereit ist, gerade laedt
 * (mit mitlaufender Zeit) oder noch geladen werden kann.
 */
class SprachpaketListe(private val activity: Activity, private val liste: LinearLayout) {

    private val handler = Handler(Looper.getMainLooper())
    private var geladen = emptySet<String>()
    private var alleZeigen = false
    private var aktiv = false
    private val dichte = activity.resources.displayMetrics.density

    private val ticker = object : Runnable {
        override fun run() {
            if (!aktiv) return
            zeichne()
            if (Sprachpakete.laeuft.isNotEmpty()) handler.postDelayed(this, 1000)
        }
    }

    fun start() {
        aktiv = true
        Sprachpakete.beobachter = { aktualisiere() }
        aktualisiere()
    }

    fun stopp() {
        aktiv = false
        Sprachpakete.beobachter = null
        handler.removeCallbacks(ticker)
    }

    /** Fragt den Stand beim Geraet ab und zeichnet neu. */
    fun aktualisiere() {
        Sprachpakete.geladene { codes ->
            geladen = codes
            zeichne()
            handler.removeCallbacks(ticker)
            if (Sprachpakete.laeuft.isNotEmpty()) handler.postDelayed(ticker, 1000)
        }
    }

    private fun zeichne() {
        if (!aktiv) return
        liste.removeAllViews()
        val gewaehlt = Einstellungen.quelle(activity)
        val sprachen = Einstellungen.SPRACHEN.filter { it.first != "auto" }
        val sichtbar = if (alleZeigen) sprachen else sprachen.filter { (code, _) ->
            code == gewaehlt || code in geladen || code in Sprachpakete.laeuft ||
                code in Sprachpakete.warteschlange ||
                (gewaehlt == "auto" && code == "en")
        }
        sichtbar.forEach { (code, name) -> liste.addView(zeile(code, name, code == gewaehlt)) }

        liste.addView(TextView(activity).apply {
            text = if (alleZeigen) "▴  Weniger anzeigen" else "▾  Alle Sprachen anzeigen"
            setTextColor(activity.getColor(R.color.primaer))
            textSize = 15f
            setPadding(0, dp(12), 0, dp(4))
            setOnClickListener { alleZeigen = !alleZeigen; zeichne() }
        })
    }

    private fun zeile(code: String, name: String, gewaehlt: Boolean) = LinearLayout(activity).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        minimumHeight = dp(52)

        addView(TextView(activity).apply {
            text = if (gewaehlt) "$name  ·  gewählt" else name
            textSize = 16f
            setTextColor(activity.getColor(R.color.text))
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

        when {
            code in Sprachpakete.laeuft -> {
                addView(ProgressBar(activity).apply {
                    isIndeterminate = true
                    indeterminateTintList = ColorStateList.valueOf(activity.getColor(R.color.primaer))
                }, LinearLayout.LayoutParams(dp(22), dp(22)))
                addView(TextView(activity).apply {
                    val s = Sprachpakete.dauer(code)
                    text = "lädt …  %d:%02d".format(s / 60, s % 60)
                    textSize = 14f
                    setTextColor(activity.getColor(R.color.text_leise))
                    setPadding(dp(8), 0, 0, 0)
                })
            }
            code in Sprachpakete.warteschlange -> {
                addView(TextView(activity).apply {
                    text = "⏳ wartet (Nr. ${Sprachpakete.platz(code)})  ✕"
                    textSize = 14f
                    setTextColor(activity.getColor(R.color.text_leise))
                    setPadding(dp(8), dp(8), 0, dp(8))
                    setOnClickListener { Sprachpakete.abbrechen(code) }
                })
            }
            code in geladen -> {
                addView(TextView(activity).apply {
                    text = "✓ Bereit"
                    textSize = 14f
                    setTextColor(activity.getColor(R.color.gruen))
                })
                setOnLongClickListener { frageLoeschen(code, name); true }
            }
            else -> addView(Button(activity).apply {
                text = "Laden"
                isAllCaps = false
                textSize = 14f
                setTextColor(activity.getColor(R.color.primaer))
                background = activity.getDrawable(R.drawable.knopf_umriss)
                stateListAnimator = null
                setPadding(dp(18), 0, dp(18), 0)
                setOnClickListener { Sprachpakete.einreihen(activity, code) }
            }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(38)))
        }
    }

    private fun frageLoeschen(code: String, name: String) {
        AlertDialog.Builder(activity)
            .setTitle("Sprachpaket löschen?")
            .setMessage("$name gibt etwa 30 MB Speicher frei. Bei Bedarf wird es wieder geladen.")
            .setPositiveButton("Löschen") { _, _ -> Sprachpakete.loesche(code) { aktualisiere() } }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun dp(wert: Int) = (wert * dichte).toInt()
}
