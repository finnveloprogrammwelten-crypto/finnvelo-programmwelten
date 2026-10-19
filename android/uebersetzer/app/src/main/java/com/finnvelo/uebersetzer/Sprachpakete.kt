package com.finnvelo.uebersetzer

import android.content.Context
import android.os.SystemClock
import android.widget.Toast
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel

/** Ueberblick ueber geladene und gerade ladende Sprachpakete - fuer App und DE-Knopf gemeinsam. */
object Sprachpakete {
    /** Sprachcode -> Startzeit des Ladens (SystemClock.elapsedRealtime) */
    val laeuft = HashMap<String, Long>()

    private val ladeHelfer by lazy { Uebersetzer() }

    fun ladeStart(code: String) {
        laeuft.putIfAbsent(code, SystemClock.elapsedRealtime())
    }

    fun ladeEnde(code: String) {
        laeuft.remove(code)
    }

    /** Sekunden seit Ladebeginn */
    fun dauer(code: String): Long =
        laeuft[code]?.let { (SystemClock.elapsedRealtime() - it) / 1000 } ?: 0

    /** Liefert die Sprachcodes aller Pakete, die schon auf dem Geraet liegen. */
    fun geladene(fertig: (Set<String>) -> Unit) {
        RemoteModelManager.getInstance().getDownloadedModels(TranslateRemoteModel::class.java)
            .addOnSuccessListener { modelle -> fertig(modelle.map { it.language }.toSet()) }
            .addOnFailureListener { fertig(emptySet()) }
    }

    /** Wartende Pakete - es wird immer nur eines gleichzeitig geladen. */
    val warteschlange = ArrayDeque<String>()

    /** Wird nach jeder Aenderung aufgerufen (z.B. vom Hauptbildschirm zum Neuzeichnen). */
    var beobachter: (() -> Unit)? = null
    private var aktuell: String? = null

    /** Stellt ein Paket hinten an; laeuft gerade keins, startet es sofort. */
    fun einreihen(ctx: Context, code: String) {
        if (code == aktuell || code in warteschlange) return
        warteschlange.addLast(code)
        naechstes(ctx.applicationContext)
        beobachter?.invoke()
    }

    fun abbrechen(code: String) {
        warteschlange.remove(code)
        beobachter?.invoke()
    }

    /** Platz in der Warteschlange, 1 = als naechstes dran */
    fun platz(code: String) = warteschlange.indexOf(code) + 1

    private fun naechstes(app: Context) {
        if (aktuell != null) return
        val code = warteschlange.removeFirstOrNull() ?: return
        aktuell = code
        ladeStart(code)
        ladeHelfer.ladeSprachpaket(code, {}) { fehler ->
            ladeEnde(code)
            aktuell = null
            val name = Einstellungen.SPRACHEN.firstOrNull { it.first == code }?.second ?: code
            val text = if (fehler == null) "$name → Deutsch ist bereit" else "$name: Laden fehlgeschlagen (${fehler.message})"
            Toast.makeText(app, text, Toast.LENGTH_LONG).show()
            naechstes(app)
            beobachter?.invoke()
        }
    }

    fun loesche(code: String, fertig: () -> Unit) {
        val sprache = TranslateLanguage.fromLanguageTag(code) ?: return fertig()
        RemoteModelManager.getInstance()
            .deleteDownloadedModel(TranslateRemoteModel.Builder(sprache).build())
            .addOnCompleteListener { fertig() }
    }
}
