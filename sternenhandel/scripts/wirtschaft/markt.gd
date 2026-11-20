class_name Markt
extends RefCounted
## Ein Markt eines Planeten oder einer Station.
##
## Führt für jede gehandelte Ware ein Lager und berechnet daraus den Preis.
## Kennt keine anderen Spielteile: Warendaten und Marktregeln werden beim
## Anlegen übergeben. Dadurch lässt sich der Markt auch allein testen.

## ware_id -> { lager, ziel, max, produktion, verbrauch } (alles float)
var eintraege: Dictionary = {}

var _waren: Dictionary        # ware_id -> Warendaten aus waren.json
var _elastizitaet: float
var _min_faktor: float
var _max_faktor: float
var _spanne: float


## definition: der "markt"-Block eines Objekts aus der Systemdatei
## waren:      Daten.waren (ware_id -> Warendaten)
## regeln:     der "markt"-Block aus spiel.json
func _init(definition: Dictionary, waren: Dictionary, regeln: Dictionary) -> void:
	_waren = waren
	_elastizitaet = float(regeln.get("elastizitaet", 0.8))
	_min_faktor = float(regeln.get("preis_min_faktor", 0.3))
	_max_faktor = float(regeln.get("preis_max_faktor", 3.0))
	_spanne = float(regeln.get("handelsspanne", 0.08))
	var max_standard := float(regeln.get("max_faktor_standard", 3.0))

	for ware_id in definition:
		if not waren.has(ware_id):
			push_error("Markt: unbekannte Ware '%s'" % ware_id)
			continue
		var d: Dictionary = definition[ware_id]
		var ziel := maxf(1.0, float(d.get("ziel", 100)))
		eintraege[ware_id] = {
			"lager": float(d.get("lager", ziel)),
			"ziel": ziel,
			"max": float(d.get("max", ziel * max_standard)),
			"produktion": float(d.get("produktion", 0)),
			"verbrauch": float(d.get("verbrauch", 0)),
		}


func handelt(ware_id: String) -> bool:
	return eintraege.has(ware_id)


## Ganze Einheiten im Lager (nur die kann man kaufen)
func lager(ware_id: String) -> int:
	if not handelt(ware_id):
		return 0
	return int(floor(eintraege[ware_id]["lager"]))


## Wie viele Einheiten der Markt noch aufnehmen kann
func freier_platz(ware_id: String) -> int:
	if not handelt(ware_id):
		return 0
	var e: Dictionary = eintraege[ware_id]
	return maxi(0, int(floor(e["max"] - e["lager"])))


## Mittelpreis einer Einheit bei einem bestimmten Lagerbestand
func _preis_bei_lager(ware_id: String, bestand: float) -> float:
	var e: Dictionary = eintraege[ware_id]
	var basis := float(_waren[ware_id]["basispreis"])
	var faktor := pow(e["ziel"] / maxf(bestand, 1.0), _elastizitaet)
	return basis * clampf(faktor, _min_faktor, _max_faktor)


## Aktueller Mittelpreis (ohne Handelsspanne)
func preis(ware_id: String) -> float:
	if not handelt(ware_id):
		return 0.0
	return _preis_bei_lager(ware_id, eintraege[ware_id]["lager"])


## Preis, den der Spieler für die nächste Einheit zahlt
func kaufpreis(ware_id: String) -> int:
	return kosten_kauf(ware_id, 1)


## Preis, den der Spieler für die nächste Einheit erhält
func verkaufspreis(ware_id: String) -> int:
	return erloes_verkauf(ware_id, 1)


## Gesamtkosten für 'menge' Einheiten. Jede Einheit wird einzeln berechnet,
## weil das Lager mit jedem Stück schrumpft und der Preis steigt.
func kosten_kauf(ware_id: String, menge: int) -> int:
	if not handelt(ware_id) or menge <= 0:
		return 0
	var bestand: float = eintraege[ware_id]["lager"]
	var summe := 0.0
	for i in menge:
		summe += _preis_bei_lager(ware_id, bestand - i) * (1.0 + _spanne / 2.0)
	return int(ceil(summe))


## Gesamterlös für 'menge' verkaufte Einheiten (Preis sinkt mit jedem Stück)
func erloes_verkauf(ware_id: String, menge: int) -> int:
	if not handelt(ware_id) or menge <= 0:
		return 0
	var bestand: float = eintraege[ware_id]["lager"]
	var summe := 0.0
	for i in menge:
		summe += _preis_bei_lager(ware_id, bestand + i) * (1.0 - _spanne / 2.0)
	return int(floor(summe))


## Nimmt Ware aus dem Lager. Prüft nur das Lager, nicht das Geld.
func entnehmen(ware_id: String, menge: int) -> bool:
	if menge <= 0 or lager(ware_id) < menge:
		return false
	eintraege[ware_id]["lager"] -= menge
	return true


## Legt Ware ins Lager. Prüft nur den Platz.
func einlagern(ware_id: String, menge: int) -> bool:
	if menge <= 0 or freier_platz(ware_id) < menge:
		return false
	eintraege[ware_id]["lager"] += menge
	return true


## Lässt 'stunden' Spielstunden vergehen: Produktion und Verbrauch
func simuliere(stunden: float) -> void:
	for ware_id in eintraege:
		var e: Dictionary = eintraege[ware_id]
		var neu: float = e["lager"] + (e["produktion"] - e["verbrauch"]) * stunden
		e["lager"] = clampf(neu, 0.0, e["max"])
