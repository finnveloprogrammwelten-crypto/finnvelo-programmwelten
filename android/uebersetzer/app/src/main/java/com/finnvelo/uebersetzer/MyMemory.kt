package com.finnvelo.uebersetzer

import android.os.Handler
import android.os.Looper
import android.text.Html
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.Executors

/**
 * Online-Uebersetzung mit MyMemory - kostenlos und ohne Schluessel.
 * Frei sind 5.000 Zeichen am Tag, mit (freiwilliger) E-Mail-Adresse 50.000.
 * Ist das Tageskontingent aufgebraucht, wird bis Mitternacht nicht mehr
 * gefragt und offline uebersetzt.
 */
object MyMemory {
    private val zurueck = Handler(Looper.getMainLooper())
    private val arbeiter = Executors.newFixedThreadPool(4)

    /** Tag (yyyyMMdd), an dem das Kontingent leer war */
    @Volatile private var leerAm: String? = null

    private fun heute() = java.text.SimpleDateFormat("yyyyMMdd", java.util.Locale.ROOT).format(java.util.Date())

    fun verfuegbar() = leerAm != heute()

    fun uebersetze(text: String, sprache: String, email: String, fertig: (Result<String>) -> Unit) {
        // MyMemory nimmt hoechstens 500 Bytes je Text
        if (text.toByteArray().size > 480 || !verfuegbar()) {
            return fertig(Result.failure(IllegalStateException("MyMemory nicht möglich")))
        }
        arbeiter.execute {
            val ergebnis = runCatching { anfrage(text, sprache, email) }
            zurueck.post { fertig(ergebnis) }
        }
    }

    private fun anfrage(text: String, sprache: String, email: String): String {
        var adresse = "https://api.mymemory.translated.net/get?q=" + URLEncoder.encode(text, "UTF-8") +
            "&langpair=" + URLEncoder.encode("$sprache|de", "UTF-8")
        if (email.isNotBlank()) adresse += "&de=" + URLEncoder.encode(email.trim(), "UTF-8")
        val verbindung = URL(adresse).openConnection() as HttpURLConnection
        try {
            verbindung.connectTimeout = 5000
            verbindung.readTimeout = 8000
            if (verbindung.responseCode == 429) {
                leerAm = heute()
                error("MyMemory-Tageskontingent aufgebraucht")
            }
            val json = JSONObject(verbindung.inputStream.bufferedReader().readText())
            val antwort = json.optJSONObject("responseData")?.optString("translatedText").orEmpty()
            if (json.optInt("responseStatus") == 429 || antwort.startsWith("MYMEMORY WARNING")) {
                leerAm = heute()
                error("MyMemory-Tageskontingent aufgebraucht")
            }
            if (json.optInt("responseStatus") != 200 || antwort.isBlank()) error("MyMemory: keine Übersetzung")
            // Antwort kommt teils mit HTML-Zeichen (&#39; ...)
            return Html.fromHtml(antwort, Html.FROM_HTML_MODE_LEGACY).toString().trim()
        } finally {
            verbindung.disconnect()
        }
    }
}
