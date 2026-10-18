class_name SystemAnsicht
extends Control
## Zeichnet das Sonnensystem von oben: Umlaufbahnen, Himmelskörper,
## Stationen und das Spielerschiff. Antippen wählt ein Objekt aus.

signal objekt_gewaehlt(objekt_id: String)

## Besondere ID für das Spielerschiff
const SCHIFF_ID := "schiff"
const SCHIFF_BILD := "res://assets/platzhalter/frachter.png"
## Mindestradius (Pixel), in dem ein Antippen ein Objekt trifft
const TREFFER_RADIUS := 34.0
## Die Platzhalterbilder zeigen die Kugel mit 80 % der Bildbreite
const BILD_FAKTOR := 1.25

var gewaehlt: String = ""

var _sterne: Array[Vector2] = []   # Hintergrundsterne (0..1)
var _bilder: Dictionary = {}       # Pfad -> Texture2D (oder null)


func _ready() -> void:
	clip_contents = true
	mouse_filter = Control.MOUSE_FILTER_STOP
	var zufall := RandomNumberGenerator.new()
	zufall.seed = 4242
	for _i in 160:
		_sterne.append(Vector2(zufall.randf(), zufall.randf()))
	Spiel.schiff_gestartet.connect(func(_id): queue_redraw())
	Spiel.schiff_angekommen.connect(func(_id): queue_redraw())
	resized.connect(queue_redraw)


func _process(_delta: float) -> void:
	# Nur während eines Flugs bewegt sich etwas
	if Spiel.schiff.ist_unterwegs():
		queue_redraw()


func waehle(objekt_id: String) -> void:
	gewaehlt = objekt_id
	queue_redraw()
	objekt_gewaehlt.emit(objekt_id)


# --- Umrechnung System-Koordinaten -> Bildschirm ------------------------

func _massstab() -> float:
	return minf(size.x, size.y) * 0.45 / Spiel.system.ausdehnung()


func _auf_bildschirm(p: Vector2) -> Vector2:
	return size / 2.0 + p * _massstab()


func _radius(objekt_id: String) -> float:
	return maxf(6.0, float(Spiel.system.objekt(objekt_id).get("groesse", 10)))


## Bildschirmposition des Spielerschiffs
func _schiff_position() -> Vector2:
	var s := Spiel.schiff
	if s.ist_unterwegs():
		return _auf_bildschirm(s.flug_position())
	# Angedockt: etwas neben dem Objekt
	var r := _radius(s.standort_id)
	return _auf_bildschirm(Spiel.system.position(s.standort_id)) + Vector2(r + 14.0, -r - 8.0)


func _bild(pfad: String) -> Texture2D:
	if not _bilder.has(pfad):
		_bilder[pfad] = load(pfad) if pfad != "" and ResourceLoader.exists(pfad) else null
	return _bilder[pfad]


# --- Zeichnen ---------------------------------------------------------------

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color("#05070d"))
	for p in _sterne:
		draw_circle(p * size, 1.0, Color(1, 1, 1, 0.35))

	var system := Spiel.system
	var font := ThemeDB.fallback_font

	# Umlaufbahnen
	for oid in system.reihenfolge:
		var orbit := float(system.objekt(oid).get("orbit_radius", 0))
		if orbit > 0.0:
			draw_arc(_auf_bildschirm(system.orbit_mitte(oid)), orbit * _massstab(),
				0.0, TAU, 128, Color(1, 1, 1, 0.10), 1.0, true)

	# Flugroute
	var s := Spiel.schiff
	if s.ist_unterwegs():
		draw_dashed_line(_schiff_position(), _auf_bildschirm(s.flug_ziel()),
			Color(0.5, 0.9, 1.0, 0.7), 2.0, 8.0)

	# Himmelskörper und Stationen
	for oid in system.reihenfolge:
		var obj := system.objekt(oid)
		var mitte := _auf_bildschirm(system.position(oid))
		var r := _radius(oid)
		var bild := _bild(str(obj.get("bild", "")))
		if bild:
			var halb := r * BILD_FAKTOR
			draw_texture_rect(bild, Rect2(mitte - Vector2(halb, halb), Vector2(halb, halb) * 2.0), false)
		else:
			draw_circle(mitte, r, Color(str(obj.get("farbe", "#ffffff"))))
		draw_string(font, mitte + Vector2(-80, r + 20), str(obj.get("name", oid)),
			HORIZONTAL_ALIGNMENT_CENTER, 160, 15, Color(0.85, 0.9, 1.0, 0.9))
		if oid == gewaehlt:
			draw_arc(mitte, r + 7.0, 0.0, TAU, 48, Color("#ffd84a"), 2.5, true)

	# Spielerschiff
	var sp := _schiff_position()
	var richtung := 0.0
	if s.ist_unterwegs():
		richtung = (s.flug_ziel() - s.flug_start()).angle()
	var schiff_bild := _bild(SCHIFF_BILD)
	if schiff_bild:
		draw_set_transform(sp, richtung)
		draw_texture_rect(schiff_bild, Rect2(Vector2(-16, -16), Vector2(32, 32)), false)
		draw_set_transform(Vector2.ZERO)
	else:
		draw_circle(sp, 7.0, Color.WHITE)
	if gewaehlt == SCHIFF_ID:
		draw_arc(sp, 20.0, 0.0, TAU, 32, Color("#ffd84a"), 2.5, true)


# --- Antippen -----------------------------------------------------------

func _gui_input(event: InputEvent) -> void:
	# Auf dem Handy erzeugt Godot aus Berührungen automatisch Mausklicks
	var klick := event as InputEventMouseButton
	if klick and klick.pressed and klick.button_index == MOUSE_BUTTON_LEFT:
		var treffer := _objekt_bei(klick.position)
		if treffer != "":
			waehle(treffer)
			accept_event()


## Liefert das Objekt an einer Bildschirmposition ("" wenn nichts)
func _objekt_bei(pos: Vector2) -> String:
	if pos.distance_to(_schiff_position()) <= TREFFER_RADIUS * 0.8:
		return SCHIFF_ID
	var bestes := ""
	var beste_entfernung := INF
	for oid in Spiel.system.reihenfolge:
		var entfernung := pos.distance_to(_auf_bildschirm(Spiel.system.position(oid)))
		var reichweite := maxf(_radius(oid) + 10.0, TREFFER_RADIUS)
		if entfernung <= reichweite and entfernung < beste_entfernung:
			bestes = oid
			beste_entfernung = entfernung
	return bestes
