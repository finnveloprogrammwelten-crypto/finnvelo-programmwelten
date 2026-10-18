class_name Sternensystem
extends RefCounted
## Ein Sonnensystem: Himmelskörper, Stationen und deren Märkte.
##
## Wird aus einer Systemdatei (z. B. data/systeme/startsystem.json) gebaut.
## Positionen werden aus Umlaufbahn (orbit_radius) und Winkel berechnet.
## Monde kreisen um ihr "eltern"-Objekt.

var id: String
var name: String
var beschreibung: String

var objekte: Dictionary = {}       # objekt_id -> Objektdaten
var reihenfolge: Array[String] = [] # Objekt-IDs in Dateireihenfolge
var maerkte: Dictionary = {}       # objekt_id -> Markt

var _positionen: Dictionary = {}   # objekt_id -> Vector2 (zwischengespeichert)


func _init(definition: Dictionary, waren: Dictionary, marktregeln: Dictionary) -> void:
	id = str(definition.get("id", ""))
	name = str(definition.get("name", "Unbekannt"))
	beschreibung = str(definition.get("beschreibung", ""))

	for obj in definition.get("objekte", []):
		var oid := str(obj["id"])
		objekte[oid] = obj
		reihenfolge.append(oid)
		if obj.has("markt"):
			maerkte[oid] = Markt.new(obj["markt"], waren, marktregeln)


func objekt(objekt_id: String) -> Dictionary:
	return objekte.get(objekt_id, {})


func hat_markt(objekt_id: String) -> bool:
	return maerkte.has(objekt_id)


func markt(objekt_id: String) -> Markt:
	return maerkte.get(objekt_id)


## Position eines Objekts in System-Koordinaten (Sonne in der Mitte)
func position(objekt_id: String) -> Vector2:
	if _positionen.has(objekt_id):
		return _positionen[objekt_id]
	var obj := objekt(objekt_id)
	if obj.is_empty():
		return Vector2.ZERO
	var mitte := Vector2.ZERO
	var eltern := str(obj.get("eltern", ""))
	if eltern != "":
		mitte = position(eltern)
	var winkel := deg_to_rad(float(obj.get("winkel", 0)))
	var pos := mitte + Vector2.from_angle(winkel) * float(obj.get("orbit_radius", 0))
	_positionen[objekt_id] = pos
	return pos


## Mittelpunkt der Umlaufbahn (Sonne oder Elternplanet)
func orbit_mitte(objekt_id: String) -> Vector2:
	var eltern := str(objekt(objekt_id).get("eltern", ""))
	return position(eltern) if eltern != "" else Vector2.ZERO


## Größte Entfernung eines Objekts von der Mitte (für den Kartenmaßstab)
func ausdehnung() -> float:
	var r := 1.0
	for oid in reihenfolge:
		r = maxf(r, position(oid).length() + float(objekt(oid).get("groesse", 0)))
	return r


## Lässt die Wirtschaft aller Märkte 'stunden' Spielstunden weiterlaufen
func simuliere(stunden: float) -> void:
	for m in maerkte.values():
		m.simuliere(stunden)
