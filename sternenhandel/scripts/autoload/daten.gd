extends Node
## Lädt alle Spieldaten aus den JSON-Dateien unter res://data/.
##
## Global erreichbar als "Daten" (Autoload). Die Daten werden nur gelesen,
## nie verändert. Veränderliche Werte (Lager, Geld ...) liegen im Spielstand.

const PFAD_WAREN := "res://data/waren.json"
const PFAD_SCHIFFE := "res://data/schiffe.json"
const PFAD_SPIEL := "res://data/spiel.json"

var kategorien: Dictionary = {}       # kategorie_id -> { name, stufe }
var waren: Dictionary = {}            # ware_id -> Warendaten
var waren_reihenfolge: Array[String] = []
var schiffe: Dictionary = {}          # schiffstyp_id -> Schiffsdaten
var einstellungen: Dictionary = {}    # Inhalt von spiel.json


func _init() -> void:
	_lade_alles()


func _lade_alles() -> void:
	var w := lade_json(PFAD_WAREN)
	kategorien = w.get("kategorien", {})
	for ware in w.get("waren", []):
		var wid := str(ware["id"])
		if waren.has(wid):
			push_error("Daten: Ware '%s' ist doppelt" % wid)
		if not kategorien.has(ware.get("kategorie", "")):
			push_error("Daten: Ware '%s' hat unbekannte Kategorie" % wid)
		waren[wid] = ware
		waren_reihenfolge.append(wid)

	for schiff in lade_json(PFAD_SCHIFFE).get("schiffe", []):
		schiffe[str(schiff["id"])] = schiff

	einstellungen = lade_json(PFAD_SPIEL)
	print("Daten geladen: %d Waren, %d Schiffstypen" % [waren.size(), schiffe.size()])


## Liest eine JSON-Datei und gibt ein Dictionary zurück (leer bei Fehler)
func lade_json(pfad: String) -> Dictionary:
	if not FileAccess.file_exists(pfad):
		push_error("Daten: Datei fehlt: " + pfad)
		return {}
	var text := FileAccess.get_file_as_string(pfad)
	var json := JSON.new()
	if json.parse(text) != OK:
		push_error("Daten: Fehler in %s, Zeile %d: %s"
			% [pfad, json.get_error_line(), json.get_error_message()])
		return {}
	if typeof(json.data) != TYPE_DICTIONARY:
		push_error("Daten: %s enthält kein Objekt { ... }" % pfad)
		return {}
	return json.data


func ware(ware_id: String) -> Dictionary:
	return waren.get(ware_id, {})


func ware_name(ware_id: String) -> String:
	return str(ware(ware_id).get("name", ware_id))


func kategorie_name(kategorie_id: String) -> String:
	return str(kategorien.get(kategorie_id, {}).get("name", kategorie_id))
