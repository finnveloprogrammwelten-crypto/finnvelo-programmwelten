class_name Schiff
extends RefCounted
## Ein Schiff mit Laderaum und einfacher Flugbewegung.
##
## Position und Flug werden in System-Koordinaten (wie in der Systemdatei)
## gerechnet. Ein Schiff ist entweder angedockt (standort_id gesetzt)
## oder unterwegs (ziel_id gesetzt).

var name: String
var typ: Dictionary          # Schiffsdaten aus schiffe.json
var fracht: Dictionary = {}  # ware_id -> Menge (int)

var standort_id: String = ""
var ziel_id: String = ""

var _start_pos := Vector2.ZERO
var _ziel_pos := Vector2.ZERO
var _flugdauer := 0.0        # Spielstunden
var _vergangen := 0.0        # Spielstunden


func _init(schiffs_name: String, schiffs_typ: Dictionary) -> void:
	name = schiffs_name
	typ = schiffs_typ


func laderaum() -> int:
	return int(typ.get("laderaum", 0))


func geschwindigkeit() -> float:
	return float(typ.get("geschwindigkeit", 1))


## Belegter Laderaum. Braucht die Warendaten wegen des Volumens.
func belegt(waren: Dictionary) -> int:
	var summe := 0
	for ware_id in fracht:
		summe += int(fracht[ware_id]) * int(waren[ware_id].get("volumen", 1))
	return summe


func frei(waren: Dictionary) -> int:
	return laderaum() - belegt(waren)


func menge(ware_id: String) -> int:
	return int(fracht.get(ware_id, 0))


func zuladen(ware_id: String, anzahl: int) -> void:
	fracht[ware_id] = menge(ware_id) + anzahl


func abladen(ware_id: String, anzahl: int) -> void:
	var rest := menge(ware_id) - anzahl
	if rest > 0:
		fracht[ware_id] = rest
	else:
		fracht.erase(ware_id)


func ist_unterwegs() -> bool:
	return ziel_id != ""


## Flugzeit in Spielstunden zwischen zwei Punkten
func flugzeit(von: Vector2, nach: Vector2) -> float:
	return von.distance_to(nach) / maxf(geschwindigkeit(), 0.01)


func starte_flug(ziel: String, von: Vector2, nach: Vector2) -> void:
	standort_id = ""
	ziel_id = ziel
	_start_pos = von
	_ziel_pos = nach
	_flugdauer = maxf(flugzeit(von, nach), 0.01)
	_vergangen = 0.0


## Bewegt das Schiff um 'stunden' weiter. Gibt true zurück, wenn es gerade
## angekommen ist.
func bewege(stunden: float) -> bool:
	if not ist_unterwegs():
		return false
	_vergangen += stunden
	if _vergangen >= _flugdauer:
		standort_id = ziel_id
		ziel_id = ""
		return true
	return false


## Restliche Flugzeit in Spielstunden
func restzeit() -> float:
	return maxf(_flugdauer - _vergangen, 0.0)


## Position während des Flugs (für die Anzeige)
func flug_position() -> Vector2:
	if _flugdauer <= 0.0:
		return _ziel_pos
	return _start_pos.lerp(_ziel_pos, clampf(_vergangen / _flugdauer, 0.0, 1.0))


func flug_start() -> Vector2:
	return _start_pos


func flug_ziel() -> Vector2:
	return _ziel_pos
