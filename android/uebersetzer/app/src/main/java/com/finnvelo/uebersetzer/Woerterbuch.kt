package com.finnvelo.uebersetzer

import android.content.Context
import org.json.JSONObject

/**
 * Feste Uebersetzungen fuer kurze App- und Verkehrsbegriffe, bei denen die
 * Offline-Uebersetzung ohne Zusammenhang oft daneben liegt ("Lines" ->
 * "Zeilen" statt "Linien"), plus eigene Korrekturen der Nutzerin / des Nutzers.
 * Gilt nur fuer den GANZEN Text eines Kastens, nie fuer Teile davon.
 */
object Woerterbuch {
    private const val DATEI = "korrekturen"

    private val EINGEBAUT: Map<String, String> = mapOf(
        // Englisch
        "route" to "Route", "routes" to "Routen", "schedules" to "Fahrpläne", "schedule" to "Fahrplan",
        "timetable" to "Fahrplan", "timetables" to "Fahrpläne", "maps" to "Karten", "map" to "Karte",
        "traffic" to "Verkehrslage", "tickets" to "Tickets", "ticket" to "Ticket", "home" to "Zuhause",
        "work" to "Arbeit", "lines" to "Linien", "line" to "Linie", "all lines" to "Alle Linien",
        "which line" to "Welche Linie", "which line?" to "Welche Linie?", "my alerts" to "Meine Meldungen",
        "alerts" to "Meldungen", "alert" to "Meldung", "create a new alert" to "Neue Meldung einrichten",
        "news" to "Neuigkeiten", "metro" to "Metro", "tram" to "Tram", "bus" to "Bus", "train" to "Zug",
        "stop" to "Haltestelle", "stops" to "Haltestellen", "station" to "Station", "stations" to "Stationen",
        "platform" to "Bahnsteig", "departure" to "Abfahrt", "departures" to "Abfahrten", "arrival" to "Ankunft",
        "arrivals" to "Ankünfte", "next departures" to "Nächste Abfahrten", "disruption" to "Störung",
        "disruptions" to "Störungen", "delay" to "Verspätung", "delays" to "Verspätungen",
        "works" to "Bauarbeiten", "normal traffic" to "Normaler Betrieb", "disrupted traffic" to "Gestörter Betrieb",
        "interrupted traffic" to "Unterbrochen", "where are you going?" to "Wohin möchtest du?",
        "where to?" to "Wohin?", "from" to "Von", "to" to "Nach", "now" to "Jetzt", "leave now" to "Jetzt losfahren",
        "depart at" to "Abfahrt um", "arrive by" to "Ankunft bis", "search" to "Suchen", "favorites" to "Favoriten",
        "favourites" to "Favoriten", "settings" to "Einstellungen", "profile" to "Profil", "log in" to "Anmelden",
        "sign in" to "Anmelden", "learn more" to "Mehr erfahren", "see more" to "Mehr anzeigen", "close" to "Schließen",
        "cancel" to "Abbrechen", "ok" to "OK", "buy" to "Kaufen", "buy a ticket" to "Ticket kaufen",
        "validate" to "Entwerten", "transfer" to "Umsteigen", "walk" to "Zu Fuß", "exit" to "Ausgang",
        "entrance" to "Eingang", "elevator" to "Aufzug", "lift" to "Aufzug", "tutorial video" to "Video-Anleitung",
        // Franzoesisch
        "itinéraire" to "Route", "itinéraires" to "Routen", "horaires" to "Fahrpläne", "plans" to "Karten",
        "plan" to "Karte", "trafic" to "Verkehrslage", "titres" to "Tickets", "billets" to "Tickets",
        "domicile" to "Zuhause", "maison" to "Zuhause", "travail" to "Arbeit", "lignes" to "Linien",
        "ligne" to "Linie", "toutes les lignes" to "Alle Linien", "quelle ligne ?" to "Welche Linie?",
        "mes alertes" to "Meine Meldungen", "alertes" to "Meldungen", "actualités" to "Neuigkeiten",
        "arrêt" to "Haltestelle", "arrêts" to "Haltestellen", "gare" to "Bahnhof", "quai" to "Bahnsteig",
        "départ" to "Abfahrt", "départs" to "Abfahrten", "arrivée" to "Ankunft", "prochains départs" to "Nächste Abfahrten",
        "perturbation" to "Störung", "perturbations" to "Störungen", "retard" to "Verspätung", "travaux" to "Bauarbeiten",
        "trafic normal" to "Normaler Betrieb", "trafic perturbé" to "Gestörter Betrieb", "trafic interrompu" to "Unterbrochen",
        "où allez-vous ?" to "Wohin möchtest du?", "rechercher" to "Suchen", "favoris" to "Favoriten",
        "paramètres" to "Einstellungen", "se connecter" to "Anmelden", "en savoir plus" to "Mehr erfahren",
        "fermer" to "Schließen", "annuler" to "Abbrechen", "acheter" to "Kaufen", "valider" to "Entwerten",
        "correspondance" to "Umsteigen", "à pied" to "Zu Fuß", "sortie" to "Ausgang", "entrée" to "Eingang",
        "ascenseur" to "Aufzug", "métro" to "Metro", "train" to "Zug",
    )

    private fun schluessel(text: String) = text.trim().lowercase().replace(Regex("\\s+"), " ")

    /** Feste oder eigene Uebersetzung fuer genau diesen Text - oder null. */
    fun nachschlagen(ctx: Context, text: String): String? {
        val k = schluessel(text)
        korrekturen(ctx)[k]?.let { return it }
        EINGEBAUT[k]?.let { return it }
        // Gleicher Begriff mit Satzzeichen am Ende ("Lines:" / "Which line?")
        val ohne = k.trimEnd(':', '?', '!', '.', ' ')
        return if (ohne != k) EINGEBAUT[ohne]?.let { it + k.substring(ohne.length).trim() } else null
    }

    fun korrekturen(ctx: Context): Map<String, String> {
        val json = ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE).getString("liste", null) ?: return emptyMap()
        return runCatching {
            val o = JSONObject(json)
            o.keys().asSequence().associateWith { o.getString(it) }
        }.getOrDefault(emptyMap())
    }

    fun speichereKorrektur(ctx: Context, original: String, deutsch: String) {
        val neu = korrekturen(ctx).toMutableMap()
        if (deutsch.isBlank()) neu.remove(schluessel(original)) else neu[schluessel(original)] = deutsch.trim()
        ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE).edit()
            .putString("liste", JSONObject(neu as Map<*, *>).toString()).apply()
    }

    fun loescheKorrekturen(ctx: Context) =
        ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE).edit().clear().apply()
}
