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

    /**
     * Automatik: DE einmal antippen (oder App aus der Liste oeffnen), dann wird
     * diese App immer weiter uebersetzt - auch beim Scrollen und Tippen.
     */
    fun automatik(ctx: Context): Boolean =
        ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE).getBoolean("automatik", true)

    fun setzeAutomatik(ctx: Context, an: Boolean) =
        ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE).edit().putBoolean("automatik", an).apply()

    /** Apps (Paketnamen), die automatisch uebersetzt werden */
    fun autoApps(ctx: Context): Set<String> =
        ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE).getStringSet("autoApps", emptySet())!!.toSet()

    fun setzeAutoApp(ctx: Context, paket: String, an: Boolean) {
        val neu = if (an) autoApps(ctx) + paket else autoApps(ctx) - paket
        ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE).edit().putStringSet("autoApps", neu).apply()
    }

    /** Schwebenden DE-Knopf zeigen (sonst nur ueber die Schnelleinstellungs-Kachel). */
    fun knopfZeigen(ctx: Context): Boolean =
        ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE).getBoolean("knopf", true)

    fun setzeKnopfZeigen(ctx: Context, an: Boolean) =
        ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE).edit().putBoolean("knopf", an).apply()
}
