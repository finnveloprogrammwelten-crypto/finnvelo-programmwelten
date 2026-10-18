package com.finnvelo.uebersetzer

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Rect
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Gefundener Text, wo er steht und - wenn ein Bildschirmfoto da war - in
 * welchen Farben. [zeilen] = Zeilenzahl des Originals (0 = unbekannt).
 */
data class Fund(
    val text: String,
    val ort: Rect,
    val zeilen: Int = 0,
    val hintergrund: Int? = null,
    val schrift: Int? = null,
)

/** Zeile fuer Zeile, links nach rechts. */
fun List<Fund>.inLesereihenfolge() = sortedWith(compareBy({ it.ort.top / 24 }, { it.ort.left }))

/** Wie viele Zeilen hatte das Original vermutlich? (Fuer die passende Schriftgroesse.) */
fun Fund.geschaetzteZeilen(): Int {
    if (zeilen > 0) return zeilen
    val breite = ort.width().toFloat()
    val hoehe = ort.height().toFloat()
    for (n in 1..12) {
        val zeichenProZeile = breite / (hoehe / n * 0.42f)
        if (n * zeichenProZeile >= text.length) return n
    }
    return max(1, ceil(sqrt(text.length * hoehe * 0.42f / breite)).toInt())
}

private val STRASSE = setOf(
    "rue", "avenue", "boulevard", "bd", "quai", "impasse", "allée", "allee", "parvis", "chaussée",
    "piazza", "viale", "calle", "carrer", "straat", "gracht", "plein",
)
private val ORT_MIT_PARTIKEL = setOf("place", "pont", "porte", "square", "cours", "passage", "gare", "via", "plaza", "paseo", "chemin")
private val PARTIKEL = setOf("de", "du", "des", "d", "la", "le", "l", "di", "del", "della", "dei", "van", "der", "of", "saint", "st")

/**
 * Strassen- und Ortsnamen ("Rue de Bicêtre", "Place de la Concorde") werden nicht
 * uebersetzt - sonst kommt Unsinn heraus und man findet die Strasse nicht mehr.
 */
fun istOrtsname(text: String): Boolean {
    val woerter = text.trim().lowercase().split(' ', '\'', '’', '.', '-').filter { it.isNotEmpty() }
    if (woerter.size < 2 || woerter.size > 7) return false
    val erstes = woerter[0]
    return erstes in STRASSE || (erstes in ORT_MIT_PARTIKEL && woerter[1] in PARTIKEL)
}

/** Ueberdecken sich zwei Flaechen zu einem guten Teil? */
fun ueberlappt(a: Rect, b: Rect): Boolean {
    val schnitt = Rect()
    if (!schnitt.setIntersect(a, b)) return false
    val kleinere = min(a.width() * a.height(), b.width() * b.height()).coerceAtLeast(1)
    return schnitt.width() * schnitt.height() > kleinere * 0.3
}

/**
 * Liest aus dem Bildschirmfoto Hintergrund- und Schriftfarbe je Text, damit die
 * Uebersetzung aussieht wie die App selbst (statt gelber Zettel).
 */
fun faerbe(funde: List<Fund>, bild: Bitmap): List<Fund> = funde.map { fund ->
    val o = Rect(fund.ort)
    if (!o.intersect(0, 0, bild.width, bild.height) || o.width() < 4 || o.height() < 4) return@map fund

    // Hintergrund: haeufigste Farbe am Rand des Kastens
    val rand = ArrayList<Int>()
    val schritte = 24
    for (s in 0..schritte) {
        val x = o.left + (o.width() - 1) * s / schritte
        val y = o.top + (o.height() - 1) * s / schritte
        rand += bild.getPixel(x, o.top + 1)
        rand += bild.getPixel(x, o.bottom - 2)
        rand += bild.getPixel(o.left + 1, y)
        rand += bild.getPixel(o.right - 2, y)
    }
    val hintergrund = rand.groupingBy { it and 0xF0F0F0 }.eachCount().maxByOrNull { it.value }!!.key
        .let { gruppe -> rand.first { (it and 0xF0F0F0) == gruppe } } or 0xFF000000.toInt()

    // Schrift: der Bildpunkt im Inneren, der sich am staerksten vom Hintergrund abhebt
    var schrift = hintergrund
    var abstand = 0
    for (yi in 1..7) for (xi in 1..23) {
        val p = bild.getPixel(o.left + o.width() * xi / 24, o.top + o.height() * yi / 8)
        val d = farbabstand(p, hintergrund)
        if (d > abstand) { abstand = d; schrift = p }
    }
    if (kontrast(schrift, hintergrund) < 3.0) {
        schrift = if (helligkeit(hintergrund) > 0.45) Color.parseColor("#111111") else Color.WHITE
    }
    fund.copy(hintergrund = hintergrund, schrift = schrift or 0xFF000000.toInt())
}

private fun farbabstand(a: Int, b: Int) =
    abs(Color.red(a) - Color.red(b)) + abs(Color.green(a) - Color.green(b)) + abs(Color.blue(a) - Color.blue(b))

private fun helligkeit(farbe: Int): Double {
    fun kanal(c: Int) = (c / 255.0).let { if (it <= 0.03928) it / 12.92 else Math.pow((it + 0.055) / 1.055, 2.4) }
    return 0.2126 * kanal(Color.red(farbe)) + 0.7152 * kanal(Color.green(farbe)) + 0.0722 * kanal(Color.blue(farbe))
}

private fun kontrast(a: Int, b: Int): Double {
    val ha = helligkeit(a)
    val hb = helligkeit(b)
    return (max(ha, hb) + 0.05) / (min(ha, hb) + 0.05)
}
