extends SceneTree
## Einfache Selbsttests für Markt und Schiff, ohne Oberfläche.
##
## Starten (im Projektordner, Godot einmal im Editor geöffnet):
##   godot --headless --script res://tests/test_wirtschaft.gd
## Ausgabe: "OK"-Zeilen oder "FEHLER"-Zeilen, am Ende eine Zusammenfassung.

const MarktKlasse := preload("res://scripts/wirtschaft/markt.gd")
const SchiffKlasse := preload("res://scripts/schiff/schiff.gd")

const WAREN := {
	"erz": { "id": "erz", "name": "Erz", "basispreis": 10, "volumen": 1 },
	"teile": { "id": "teile", "name": "Teile", "basispreis": 100, "volumen": 2 },
}
const REGELN := {
	"elastizitaet": 1.0, "preis_min_faktor": 0.5, "preis_max_faktor": 2.0,
	"handelsspanne": 0.1, "max_faktor_standard": 3.0,
}

var _fehler := 0


func _init() -> void:
	teste_markt()
	teste_schiff()
	print("--- %s ---" % ("ALLE TESTS OK" if _fehler == 0 else "%d FEHLER" % _fehler))
	quit(1 if _fehler > 0 else 0)


func pruefe(bedingung: bool, beschreibung: String) -> void:
	if bedingung:
		print("OK      ", beschreibung)
	else:
		_fehler += 1
		print("FEHLER  ", beschreibung)


func teste_markt() -> void:
	var m = MarktKlasse.new({
		"erz": { "lager": 100, "ziel": 100, "produktion": 5 },
		"teile": { "lager": 10, "ziel": 20, "verbrauch": 2 },
	}, WAREN, REGELN)

	pruefe(is_equal_approx(m.preis("erz"), 10.0), "Bei Lager = Ziel gilt der Basispreis")
	pruefe(m.preis("teile") > 100.0, "Knappe Ware ist teurer als ihr Basispreis")
	pruefe(m.kaufpreis("erz") > m.verkaufspreis("erz"), "Kaufpreis liegt über Verkaufspreis")
	pruefe(m.kosten_kauf("erz", 50) > 50 * m.kaufpreis("erz") - 1,
		"Große Einkäufe werden pro Stück teurer")

	var vorher: float = m.preis("erz")
	m.entnehmen("erz", 50)
	pruefe(m.preis("erz") > vorher, "Kaufen leert das Lager und hebt den Preis")
	pruefe(not m.entnehmen("erz", 1000), "Man kann nicht mehr kaufen als im Lager ist")

	m.simuliere(10.0)
	pruefe(m.lager("erz") == 100, "Produktion füllt das Lager (50 + 10 h × 5)")
	m.simuliere(10.0)
	pruefe(m.lager("teile") == 0, "Verbrauch leert das Lager, aber nie unter 0")
	pruefe(is_equal_approx(m.preis("teile"), 200.0), "Preis ist nach oben begrenzt (max_faktor)")
	m.simuliere(1000.0)
	pruefe(m.lager("erz") == 300, "Lager wächst nicht über das Maximum (3 × Ziel)")
	pruefe(is_equal_approx(m.preis("erz"), 5.0), "Preis ist nach unten begrenzt (min_faktor)")
	pruefe(not m.handelt("gold"), "Nicht geführte Ware wird nicht gehandelt")


func teste_schiff() -> void:
	var s = SchiffKlasse.new("Test", { "laderaum": 50, "geschwindigkeit": 10 })
	s.zuladen("teile", 10)
	s.zuladen("erz", 5)
	pruefe(s.belegt(WAREN) == 25, "Laderaum zählt das Volumen (10 × 2 + 5 × 1)")
	s.abladen("erz", 5)
	pruefe(not s.fracht.has("erz"), "Leere Frachtposten verschwinden")

	s.standort_id = "a"
	s.starte_flug("b", Vector2.ZERO, Vector2(100, 0))
	pruefe(is_equal_approx(s.restzeit(), 10.0), "Flugzeit = Entfernung / Geschwindigkeit")
	pruefe(not s.bewege(5.0), "Nach 5 h noch unterwegs")
	pruefe(s.flug_position().is_equal_approx(Vector2(50, 0)), "Nach halber Zeit auf halber Strecke")
	pruefe(s.bewege(5.0) and s.standort_id == "b", "Nach 10 h angekommen")
