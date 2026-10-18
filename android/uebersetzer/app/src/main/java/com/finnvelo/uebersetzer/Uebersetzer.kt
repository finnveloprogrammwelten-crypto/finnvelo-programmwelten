package com.finnvelo.uebersetzer

import android.content.Context
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
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?) = size > 3000
    }

    fun istUnterstuetzt(code: String) = TranslateLanguage.fromLanguageTag(code) != null

    /** Laedt das Sprachpaket, falls es noch fehlt. */
    fun ladeSprachpaket(code: String, status: (String) -> Unit, fertig: (Exception?) -> Unit) {
        val quelle = TranslateLanguage.fromLanguageTag(code)
            ?: return fertig(IllegalArgumentException("Sprache „$code“ wird nicht unterstützt"))
        val modell = TranslateRemoteModel.Builder(quelle).build()
        RemoteModelManager.getInstance().isModelDownloaded(modell).addOnSuccessListener { vorhanden ->
            if (!vorhanden) {
                Sprachpakete.ladeStart(code)
                status("Sprachpaket wird geladen (einmalig, ca. 30 MB) …")
            }
        }
        holeUebersetzer(quelle).downloadModelIfNeeded(DownloadConditions.Builder().build())
            .addOnSuccessListener { Sprachpakete.ladeEnde(code); fertig(null) }
            .addOnFailureListener { Sprachpakete.ladeEnde(code); fertig(it) }
    }

    /**
     * Laedt ein vorhandenes Sprachpaket schon mal in den Speicher, damit die
     * erste echte Uebersetzung nicht so lange dauert.
     */
    fun aufwaermen(code: String) {
        val quelle = TranslateLanguage.fromLanguageTag(if (code == "auto") "en" else code) ?: return
        RemoteModelManager.getInstance().isModelDownloaded(TranslateRemoteModel.Builder(quelle).build())
            .addOnSuccessListener { vorhanden -> if (vorhanden) holeUebersetzer(quelle).translate("Hello") }
    }

    /**
     * Uebersetzt Texte, auch wenn auf einem Bildschirm mehrere Sprachen stehen
     * (z.B. englische App mit franzoesischen Ortsnamen):
     *  - jeder laengere Text bekommt seine eigene Sprache erkannt,
     *  - kurze oder unklare Texte nehmen die [bevorzugt]e bzw. haeufigste Sprache,
     *  - eine erkannte Nebensprache wird nur genutzt, wenn ihr Paket schon geladen ist
     *    (sonst wuerde eine Fehlerkennung 30 MB Download ausloesen).
     * [einzeln] meldet jede fertige Uebersetzung sofort (null = Original lassen),
     * damit die Kaesten nach und nach erscheinen.
     *
     * Vorher: feste Begriffe und eigene Korrekturen aus dem [Woerterbuch], und -
     * wenn eingeschaltet - DeepL online. Klappt DeepL nicht (kein Netz ...),
     * uebernimmt ML Kit offline.
     */
    fun uebersetzeAlle(
        ctx: Context,
        texte: List<String>,
        bevorzugt: String,
        status: (String) -> Unit,
        einzeln: (Int, String?) -> Unit,
        fertig: (Exception?) -> Unit,
    ) {
        val offen = ArrayList<Int>()
        texte.forEachIndexed { i, text ->
            val fest = Woerterbuch.nachschlagen(ctx, text)
            if (fest != null) einzeln(i, fest) else offen += i
        }
        if (offen.isEmpty()) return fertig(null)
        val weiterOffline = { liste: List<Int> ->
            offline(liste.map { texte[it] }, bevorzugt, status, { j, d -> einzeln(liste[j], d) }, fertig)
        }

        val schluessel = Einstellungen.deeplSchluessel(ctx)
        if (!Einstellungen.online(ctx) || schluessel.isBlank()) return weiterOffline(offen)
        val unbekannt = offen.filter { zwischenspeicher["deepl|${texte[it]}"] == null }
        offen.filter { it !in unbekannt }.forEach { einzeln(it, zwischenspeicher["deepl|${texte[it]}"]) }
        if (unbekannt.isEmpty()) return fertig(null)
        DeepL.uebersetze(schluessel, unbekannt.map { texte[it] }) { ergebnis ->
            ergebnis.onSuccess { deutsch ->
                unbekannt.forEachIndexed { j, i ->
                    zwischenspeicher["deepl|${texte[i]}"] = deutsch[j]
                    einzeln(i, deutsch[j])
                }
                fertig(null)
            }.onFailure {
                status("${it.message} – übersetze offline")
                weiterOffline(unbekannt)
            }
        }
    }

    private fun offline(
        texte: List<String>,
        bevorzugt: String,
        status: (String) -> Unit,
        einzeln: (Int, String?) -> Unit,
        fertig: (Exception?) -> Unit,
    ) {
        val erkennung: List<Task<String?>> = texte.map { text ->
            if (text.count { it.isLetter() } < 12) {
                Tasks.forResult(null)
            } else {
                spracherkennung.identifyPossibleLanguages(text).continueWith { aufgabe ->
                    aufgabe.result?.firstOrNull { it.confidence >= 0.6f && it.languageTag != "und" }?.languageTag
                }
            }
        }
        val geladen = RemoteModelManager.getInstance().getDownloadedModels(TranslateRemoteModel::class.java)
        Tasks.whenAllComplete(erkennung + geladen).addOnCompleteListener {
            val erkannt = erkennung.map { if (it.isSuccessful) it.result else null }
            val vorhanden = if (geladen.isSuccessful) geladen.result.map { it.language }.toSet() else emptySet()
            val haeufigste = erkannt.filterNotNull().filter { it != "de" && istUnterstuetzt(it) }
                .groupingBy { it }.eachCount().maxByOrNull { it.value }?.key
            val weiter = { standard: String? ->
                verteile(texte, erkannt, standard, vorhanden, status, einzeln, fertig)
            }
            when {
                bevorzugt != "auto" -> weiter(bevorzugt)
                haeufigste != null -> weiter(haeufigste)
                // Nur kurze Texte: die Sprache am ganzen Bildschirm erkennen
                else -> spracherkennung.identifyLanguage(texte.joinToString("\n").take(3000))
                    .addOnSuccessListener { code -> weiter(code.takeIf { it != "und" }) }
                    .addOnFailureListener { weiter(null) }
            }
        }
    }

    private fun verteile(
        texte: List<String>,
        erkannt: List<String?>,
        standard: String?,
        vorhanden: Set<String>,
        status: (String) -> Unit,
        einzeln: (Int, String?) -> Unit,
        fertig: (Exception?) -> Unit,
    ) {
        // Sprache je Text festlegen; null = nicht uebersetzen (Deutsch, unbekannt, nicht unterstuetzt)
        val sprache = texte.indices.map { i ->
            val eigene = erkannt[i]
            val code = when {
                eigene == "de" -> "de"
                eigene != null && eigene != standard && eigene in vorhanden && istUnterstuetzt(eigene) -> eigene
                else -> standard
            }
            code?.takeIf { it != "de" && istUnterstuetzt(it) }
        }
        texte.indices.filter { sprache[it] == null }.forEach { einzeln(it, null) }
        val gruppen = texte.indices.filter { sprache[it] != null }.groupBy { sprache[it]!! }
        if (gruppen.isEmpty()) {
            return fertig(if (standard == null) IllegalStateException("Sprache nicht erkannt") else null)
        }

        var offen = gruppen.values.sumOf { it.size }
        var ersterFehler: Exception? = null
        val einerFertig = { i: Int, ergebnis: String? ->
            einzeln(i, ergebnis)
            offen--
            if (offen == 0) fertig(ersterFehler)
        }
        // Haeufigste Sprache zuerst; innerhalb in Lesereihenfolge
        gruppen.entries.sortedByDescending { it.value.size }.forEach { (code, nummern) ->
            ladeSprachpaket(code, status) { fehler ->
                if (fehler != null) {
                    ersterFehler = ersterFehler ?: fehler
                    return@ladeSprachpaket nummern.forEach { einerFertig(it, null) }
                }
                val quelle = TranslateLanguage.fromLanguageTag(code)!!
                val translator = holeUebersetzer(quelle)
                nummern.forEach { i ->
                    val schluessel = "$quelle|${texte[i]}"
                    val gemerkt = zwischenspeicher[schluessel]
                    if (gemerkt != null) {
                        einerFertig(i, gemerkt)
                    } else {
                        translator.translate(texte[i])
                            .addOnSuccessListener { zwischenspeicher[schluessel] = it; einerFertig(i, it) }
                            .addOnFailureListener { einerFertig(i, null) }
                    }
                }
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
