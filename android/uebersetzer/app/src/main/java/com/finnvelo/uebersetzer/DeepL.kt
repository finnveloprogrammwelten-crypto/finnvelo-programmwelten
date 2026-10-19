package com.finnvelo.uebersetzer

import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Online-Uebersetzung mit DeepL (deutlich bessere Qualitaet als offline).
 * Braucht einen eigenen, kostenlosen DeepL-API-Schluessel (500.000 Zeichen im
 * Monat frei). Die Texte gehen dabei an DeepL. Schluessel mit ":fx" am Ende
 * sind kostenlose Schluessel und laufen ueber api-free.deepl.com.
 */
object DeepL {
    private val zurueck = Handler(Looper.getMainLooper())

    fun uebersetze(schluessel: String, texte: List<String>, fertig: (Result<List<String>>) -> Unit) {
        val adresse = if (schluessel.trim().endsWith(":fx")) "https://api-free.deepl.com/v2/translate"
        else "https://api.deepl.com/v2/translate"
        Thread {
            val ergebnis = runCatching {
                // DeepL nimmt hoechstens 50 Texte je Anfrage
                texte.chunked(50).flatMap { teil -> anfrage(adresse, schluessel.trim(), teil) }
            }
            zurueck.post { fertig(ergebnis) }
        }.start()
    }

    private fun anfrage(adresse: String, schluessel: String, texte: List<String>): List<String> {
        val verbindung = URL(adresse).openConnection() as HttpURLConnection
        try {
            verbindung.requestMethod = "POST"
            verbindung.connectTimeout = 6000
            verbindung.readTimeout = 10000
            verbindung.doOutput = true
            verbindung.setRequestProperty("Authorization", "DeepL-Auth-Key $schluessel")
            verbindung.setRequestProperty("Content-Type", "application/json")
            val koerper = JSONObject()
                .put("text", JSONArray(texte))
                .put("target_lang", "DE")
                // Kurze Texte sind meist Knoepfe und Menues einer App
                .put("context", "Benutzeroberfläche einer App für öffentliche Verkehrsmittel")
            verbindung.outputStream.use { it.write(koerper.toString().toByteArray()) }
            when (verbindung.responseCode) {
                200 -> Unit
                403 -> error("DeepL-Schlüssel ungültig")
                456 -> error("DeepL-Monatskontingent aufgebraucht")
                else -> error("DeepL antwortet mit Fehler ${verbindung.responseCode}")
            }
            val antwort = JSONObject(verbindung.inputStream.bufferedReader().readText()).getJSONArray("translations")
            return List(antwort.length()) { antwort.getJSONObject(it).getString("text") }
        } finally {
            verbindung.disconnect()
        }
    }
}
