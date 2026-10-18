package com.finnvelo.uebersetzer

import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.languageid.LanguageIdentification
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions

/**
 * Uebersetzt Texte ins Deutsche - komplett auf dem Geraet.
 * Das Sprachpaket (ca. 30 MB je Sprache) wird beim ersten Mal geladen.
 */
class Uebersetzer {
    private val uebersetzer = HashMap<String, Translator>()
    private val spracherkennung = LanguageIdentification.getClient()

    // Bereits uebersetzte Texte merken, damit wiederholtes Antippen schnell geht
    private val zwischenspeicher = object : LinkedHashMap<String, String>(256, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?) = size > 2000
    }

    /** Liefert den Sprachcode (z.B. "en") oder null, wenn unklar. */
    fun erkenneSprache(text: String, fertig: (String?) -> Unit) {
        spracherkennung.identifyLanguage(text)
            .addOnSuccessListener { code -> fertig(if (code == "und") null else code) }
            .addOnFailureListener { fertig(null) }
    }

    fun istUnterstuetzt(code: String) = TranslateLanguage.fromLanguageTag(code) != null

    /** Laedt das Sprachpaket, falls es noch fehlt. */
    fun ladeSprachpaket(code: String, status: (String) -> Unit, fertig: (Exception?) -> Unit) {
        val quelle = TranslateLanguage.fromLanguageTag(code)
            ?: return fertig(IllegalArgumentException("Sprache „$code“ wird nicht unterstützt"))
        val modell = TranslateRemoteModel.Builder(quelle).build()
        RemoteModelManager.getInstance().isModelDownloaded(modell).addOnSuccessListener { vorhanden ->
            if (!vorhanden) status("Sprachpaket wird geladen (einmalig, ca. 30 MB) …")
        }
        holeUebersetzer(quelle).downloadModelIfNeeded(DownloadConditions.Builder().build())
            .addOnSuccessListener { fertig(null) }
            .addOnFailureListener { fertig(it) }
    }

    /** Uebersetzt alle Texte; misslingt einer, bleibt dort das Original stehen. */
    fun uebersetze(
        code: String,
        texte: List<String>,
        status: (String) -> Unit,
        fertig: (Result<List<String>>) -> Unit,
    ) {
        ladeSprachpaket(code, status) { fehler ->
            if (fehler != null) return@ladeSprachpaket fertig(Result.failure(fehler))
            val quelle = TranslateLanguage.fromLanguageTag(code)!!
            val translator = holeUebersetzer(quelle)
            val aufgaben: List<Task<String>> = texte.map { text ->
                val schluessel = "$quelle|$text"
                zwischenspeicher[schluessel]?.let { Tasks.forResult(it) }
                    ?: translator.translate(text).addOnSuccessListener { zwischenspeicher[schluessel] = it }
            }
            Tasks.whenAllComplete(aufgaben).addOnCompleteListener {
                fertig(Result.success(aufgaben.mapIndexed { i, t -> if (t.isSuccessful) t.result else texte[i] }))
            }
        }
    }

    private fun holeUebersetzer(quelle: String) = uebersetzer.getOrPut(quelle) {
        Translation.getClient(
            TranslatorOptions.Builder()
                .setSourceLanguage(quelle)
                .setTargetLanguage(TranslateLanguage.GERMAN)
                .build()
        )
    }

    fun schliessen() {
        uebersetzer.values.forEach { it.close() }
        uebersetzer.clear()
        spracherkennung.close()
    }
}
