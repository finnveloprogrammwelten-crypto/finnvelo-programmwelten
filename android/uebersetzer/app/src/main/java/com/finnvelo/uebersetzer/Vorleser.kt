package com.finnvelo.uebersetzer

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.speech.tts.TextToSpeech
import android.widget.Toast
import java.util.Locale

/** Liest deutschen Text mit der Sprachausgabe des Handys vor. */
class Vorleser(context: Context) : TextToSpeech.OnInitListener {
    private val app = context.applicationContext
    private val sprache = TextToSpeech(app, this)
    private var bereit = false
    private var wartet: String? = null

    override fun onInit(status: Int) {
        if (status != TextToSpeech.SUCCESS) return
        val ergebnis = sprache.setLanguage(Locale.GERMAN)
        bereit = ergebnis != TextToSpeech.LANG_MISSING_DATA && ergebnis != TextToSpeech.LANG_NOT_SUPPORTED
        if (!bereit) Toast.makeText(app, "Keine deutsche Stimme installiert (Einstellungen → Sprachausgabe)", Toast.LENGTH_LONG).show()
        wartet?.let { sprich(it) }
        wartet = null
    }

    fun sprich(text: String) {
        if (!bereit) {
            wartet = text
            return
        }
        sprache.speak(text.take(TextToSpeech.getMaxSpeechInputLength()), TextToSpeech.QUEUE_FLUSH, null, "finnvelo")
    }

    fun stopp() {
        if (bereit) sprache.stop()
    }

    fun schliessen() = sprache.shutdown()
}

fun kopiere(context: Context, text: String) {
    context.getSystemService(ClipboardManager::class.java)
        .setPrimaryClip(ClipData.newPlainText("Übersetzung", text))
    Toast.makeText(context, "Kopiert", Toast.LENGTH_SHORT).show()
}

/** Bringt Texte grob in Lesereihenfolge: Zeile fuer Zeile, links nach rechts. */
fun lesereihenfolge(funde: List<Fund>, uebersetzungen: List<String>): List<Pair<Fund, String>> =
    funde.zip(uebersetzungen).sortedWith(compareBy({ it.first.ort.top / 24 }, { it.first.ort.left }))
