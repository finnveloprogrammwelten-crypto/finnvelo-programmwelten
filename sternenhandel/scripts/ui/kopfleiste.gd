class_name Kopfleiste
extends PanelContainer
## Leiste am oberen Rand: Geld, Datum, Laderaum und Zeitsteuerung.

var _credits: Label
var _zeit: Label
var _fracht: Label
var _pause_knopf: Button
var _raffer_knoepfe: Dictionary = {}   # Faktor -> Button


func _ready() -> void:
	var reihe := HBoxContainer.new()
	reihe.add_theme_constant_override("separation", 18)
	add_child(reihe)

	_credits = _neues_label(reihe, 190)
	_credits.add_theme_color_override("font_color", Color("#ffd84a"))
	_zeit = _neues_label(reihe, 170)
	_fracht = _neues_label(reihe, 170)

	var luecke := Control.new()
	luecke.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	reihe.add_child(luecke)

	_pause_knopf = _neuer_knopf(reihe, "Pause")
	_pause_knopf.pressed.connect(func(): Spiel.setze_pause(not Spiel.pausiert))
	for faktor in Spiel.zeitraffer_stufen():
		var b := _neuer_knopf(reihe, "%dx" % int(faktor))
		b.pressed.connect(Spiel.setze_zeitraffer.bind(float(faktor)))
		_raffer_knoepfe[float(faktor)] = b

	Spiel.spielstand_geaendert.connect(_aktualisiere_werte)
	Spiel.zeit_einstellung_geaendert.connect(_aktualisiere_zeitknoepfe)
	_aktualisiere_werte()
	_aktualisiere_zeitknoepfe()


func _process(_delta: float) -> void:
	# Die Uhr läuft fließend, deshalb jedes Bild neu
	_zeit.text = Spiel.zeit_text()


func _neues_label(eltern: Control, breite: int) -> Label:
	var l := Label.new()
	l.custom_minimum_size = Vector2(breite, 0)
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	eltern.add_child(l)
	return l


func _neuer_knopf(eltern: Control, text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.toggle_mode = true
	b.custom_minimum_size = Vector2(80, 60)
	eltern.add_child(b)
	return b


func _aktualisiere_werte() -> void:
	_credits.text = Spiel.geld_text(Spiel.credits)
	_fracht.text = "Fracht %d/%d" % [Spiel.schiff.belegt(Daten.waren), Spiel.schiff.laderaum()]


func _aktualisiere_zeitknoepfe() -> void:
	_pause_knopf.set_pressed_no_signal(Spiel.pausiert)
	for faktor in _raffer_knoepfe:
		_raffer_knoepfe[faktor].set_pressed_no_signal(
			not Spiel.pausiert and is_equal_approx(faktor, Spiel.zeitraffer))
