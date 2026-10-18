extends Control
## Der Hauptbildschirm: baut die Oberfläche zusammen.
##
## Aufbau (Querformat):
##   +-------------------- Kopfleiste ---------------------+
##   |                              |                      |
##   |       Systemkarte            |   Seitenleiste:      |
##   |   (antippen = auswählen)     |   Objekt-Info        |
##   |                              |   Markt              |
##   |  [Meldungszeile]             |                      |
##   +------------------------------+----------------------+

const SEITENLEISTE_BREITE := 600
const MELDUNG_DAUER := 4.0       # Sekunden

var _karte: SystemAnsicht
var _info: ObjektInfo
var _markt: MarktPanel
var _meldung: Label
var _meldung_timer: Timer


func _ready() -> void:
	theme = _erzeuge_theme()

	var hintergrund := ColorRect.new()
	hintergrund.color = Color("#0b0f1a")
	hintergrund.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(hintergrund)

	var spalte := VBoxContainer.new()
	spalte.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	spalte.add_theme_constant_override("separation", 0)
	add_child(spalte)

	spalte.add_child(Kopfleiste.new())

	var mitte := HBoxContainer.new()
	mitte.size_flags_vertical = Control.SIZE_EXPAND_FILL
	mitte.add_theme_constant_override("separation", 0)
	spalte.add_child(mitte)

	_karte = SystemAnsicht.new()
	_karte.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mitte.add_child(_karte)
	_baue_meldungszeile()

	mitte.add_child(_baue_seitenleiste())

	_karte.objekt_gewaehlt.connect(_on_objekt_gewaehlt)
	Spiel.meldung.connect(_zeige_meldung)
	Spiel.stunde_vergangen.connect(_info.aktualisiere_zeiten)
	Spiel.schiff_angekommen.connect(_on_schiff_angekommen)

	# Zu Beginn den Ort zeigen, an dem das Schiff angedockt ist
	_karte.waehle(Spiel.schiff.standort_id)
	_zeige_meldung("Willkommen, Händler! Kaufe billig, verkaufe teuer.")


func _baue_seitenleiste() -> Control:
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(SEITENLEISTE_BREITE, 0)

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	panel.add_child(scroll)

	var rand := MarginContainer.new()
	rand.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for seite in ["left", "right", "top", "bottom"]:
		rand.add_theme_constant_override("margin_" + seite, 12)
	scroll.add_child(rand)

	var inhalt := VBoxContainer.new()
	inhalt.add_theme_constant_override("separation", 20)
	rand.add_child(inhalt)

	_info = ObjektInfo.new()
	inhalt.add_child(_info)
	_markt = MarktPanel.new()
	inhalt.add_child(_markt)
	return panel


func _baue_meldungszeile() -> void:
	_meldung = Label.new()
	_meldung.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	_meldung.offset_top = -48
	_meldung.offset_left = 12
	_meldung.offset_right = -12
	_meldung.offset_bottom = -8
	_meldung.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_meldung.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_meldung.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var stil := StyleBoxFlat.new()
	stil.bg_color = Color(0, 0, 0, 0.6)
	stil.set_corner_radius_all(8)
	_meldung.add_theme_stylebox_override("normal", stil)
	_karte.add_child(_meldung)

	_meldung_timer = Timer.new()
	_meldung_timer.one_shot = true
	_meldung_timer.timeout.connect(func(): _meldung.visible = false)
	add_child(_meldung_timer)


func _zeige_meldung(text: String) -> void:
	_meldung.text = text
	_meldung.visible = true
	_meldung_timer.start(MELDUNG_DAUER)


func _on_objekt_gewaehlt(objekt_id: String) -> void:
	_info.zeige(objekt_id)
	if objekt_id == SystemAnsicht.SCHIFF_ID:
		# Beim Schiff den Markt seines Standorts zeigen (falls angedockt)
		_markt.zeige(Spiel.schiff.standort_id)
	else:
		_markt.zeige(objekt_id)


func _on_schiff_angekommen(objekt_id: String) -> void:
	# Nach der Ankunft direkt den Markt des Zielorts öffnen
	_karte.waehle(objekt_id)


## Größere Schrift und Knöpfe für Touch-Bedienung
func _erzeuge_theme() -> Theme:
	var t := Theme.new()
	t.default_font_size = 20
	var knopf := StyleBoxFlat.new()
	knopf.bg_color = Color("#1d2740")
	knopf.set_corner_radius_all(8)
	knopf.set_content_margin_all(8)
	var knopf_hover := knopf.duplicate() as StyleBoxFlat
	knopf_hover.bg_color = Color("#27365a")
	var knopf_gedrueckt := knopf.duplicate() as StyleBoxFlat
	knopf_gedrueckt.bg_color = Color("#3b5bab")
	var knopf_aus := knopf.duplicate() as StyleBoxFlat
	knopf_aus.bg_color = Color("#141a28")
	t.set_stylebox("normal", "Button", knopf)
	t.set_stylebox("hover", "Button", knopf_hover)
	t.set_stylebox("pressed", "Button", knopf_gedrueckt)
	t.set_stylebox("hover_pressed", "Button", knopf_gedrueckt)
	t.set_stylebox("disabled", "Button", knopf_aus)
	t.set_color("font_disabled_color", "Button", Color(1, 1, 1, 0.35))

	var panel := StyleBoxFlat.new()
	panel.bg_color = Color("#101626")
	panel.set_content_margin_all(6)
	t.set_stylebox("panel", "PanelContainer", panel)
	return t
