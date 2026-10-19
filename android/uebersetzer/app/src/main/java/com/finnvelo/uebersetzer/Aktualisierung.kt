package com.finnvelo.uebersetzer

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Fragt auf finnveloprogramme.com nach, ob es eine neuere Version gibt.
 * Die Datei pflegt man auf der Programmseite im Feld "App-Aktualisierung"
 * (Adresse /uebersetzer/version.json). Beide Aufbauten der Webseite werden
 * verstanden: download/hinweis (wie Mischwaldrechner) und apk/hinweise.
 */
object Aktualisierung {
    const val ADRESSE = "https://finnveloprogramme.com/uebersetzer/version.json"

    data class Neu(val versionName: String, val download: String, val hinweis: String)

    fun pruefe(ctx: Context, fertig: (Neu?) -> Unit) {
        val eigene = ctx.packageManager.getPackageInfo(ctx.packageName, 0).let {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) it.longVersionCode else @Suppress("DEPRECATION") it.versionCode.toLong()
        }
        val zurueck = Handler(Looper.getMainLooper())
        Thread {
            val ergebnis = runCatching {
                val verbindung = URL(ADRESSE).openConnection() as HttpURLConnection
                verbindung.connectTimeout = 5000
                verbindung.readTimeout = 5000
                try {
                    if (verbindung.responseCode != 200) return@runCatching null
                    val json = JSONObject(verbindung.inputStream.bufferedReader().readText())
                    val code = json.optString("versionCode").toLongOrNull() ?: 0
                    val download = json.optString("download").ifBlank { json.optString("apk") }
                    if (code <= eigene || download.isBlank()) null
                    else Neu(
                        json.optString("versionName"),
                        download,
                        json.optString("hinweis").ifBlank { json.optString("hinweise") },
                    )
                } finally {
                    verbindung.disconnect()
                }
            }.getOrNull()
            zurueck.post { fertig(ergebnis) }
        }.start()
    }
}
