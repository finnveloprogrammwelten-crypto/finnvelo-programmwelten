package com.finnvelo.uebersetzer

import android.content.Context

/** Gespeicherte Auswahl aus dem Hauptbildschirm. */
object Einstellungen {
    private const val DATEI = "einstellungen"

    /** Ausgangssprachen: Code fuer ML Kit und Anzeigename. "auto" = selbst erkennen. */
    val SPRACHEN = listOf(
        "auto" to "Automatisch erkennen",
        "en" to "Englisch",
        "fr" to "Französisch",
        "es" to "Spanisch",
        "it" to "Italienisch",
        "nl" to "Niederländisch",
        "pt" to "Portugiesisch",
        "pl" to "Polnisch",
        "cs" to "Tschechisch",
        "da" to "Dänisch",
        "sv" to "Schwedisch",
        "no" to "Norwegisch",
        "hr" to "Kroatisch",
        "hu" to "Ungarisch",
        "tr" to "Türkisch",
    )

    fun quelle(ctx: Context): String =
        ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE).getString("quelle", "auto") ?: "auto"

    fun setzeQuelle(ctx: Context, code: String) =
        ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE).edit().putString("quelle", code).apply()

    fun texterkennung(ctx: Context): Boolean =
        ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE).getBoolean("ocr", false)

    fun setzeTexterkennung(ctx: Context, an: Boolean) =
        ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE).edit().putBoolean("ocr", an).apply()

    /** Live-Modus: Uebersetzung laeuft beim Scrollen mit, die App darunter bleibt bedienbar. */
    fun live(ctx: Context): Boolean =
        ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE).getBoolean("live", false)

    fun setzeLive(ctx: Context, an: Boolean) =
        ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE).edit().putBoolean("live", an).apply()

    /** Schwebenden DE-Knopf zeigen (sonst nur ueber die Schnelleinstellungs-Kachel). */
    fun knopfZeigen(ctx: Context): Boolean =
        ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE).getBoolean("knopf", true)

    fun setzeKnopfZeigen(ctx: Context, an: Boolean) =
        ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE).edit().putBoolean("knopf", an).apply()
}
