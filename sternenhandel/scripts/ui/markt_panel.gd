class_name MarktPanel
extends VBoxContainer
## Warentabelle eines Marktes und die Handelsleiste zum Kaufen/Verkaufen.
##
## Die Preise sind immer sichtbar (Fernabfrage). Handeln geht nur,
## wenn das Spielerschiff an diesem Objekt angedockt ist.

## Spaltenbreiten der Tabelle in Pixeln (0 = füllt den Rest)
const SPALTEN := [["Ware", 0], ["Kauf", 82], ["Verkauf", 92], ["Lager", 72], ["Fracht", 72]]
const ZEILENHOEHE := 52

var objekt_id: String = ""
var gewaehlte_ware: String = ""
var menge: int = 1

var _hinweis: Label
var _zeilen_box: VBoxContainer
var _zeilen: Dictionary = {}        # ware_id -> { knopf, labels: [..] }
var _ware_label: Label
var _menge_label: Label
var _kauf_knopf: Button
var _verkauf_knopf: Button
var _handelsleiste: VBoxContainer


func _ready() -> void:
	add_theme_constant_override("separation", 6)

	var titel := Label.new()
	titel.text = "Markt"
	titel.add_theme_font_size_override("font_size", 26)
	add_child(titel)

	_hinweis = Label.new()
	_hinweis.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_hinweis.modulate = Color(0.7, 0.8, 0.95)
	add_child(_hinweis)

	add_child(_neue_zeile(SPALTEN.map(func(s): return s[0]), true))

	_zeilen_box = VBoxContainer.new()
	_zeilen_box.add_theme_constant_override("separation", 4)
	add_child(_zeilen_box)

	_baue_handelsleiste()

	Spiel.stunde_vergangen.connect(aktualisiere_werte)
	Spiel.spielstand_geaendert.connect(aktualisiere_werte)
	Spiel.schiff_gestartet.connect(func(_id): aktualisiere_werte())
	Spiel.schiff_angekommen.connect(func(_id): aktualisiere_werte())


## Zeigt den Markt eines Objekts (oder blendet sich aus, wenn es keinen gibt)
func zeige(neue_id: String) -> void:
	objekt_id = neue_id
	var m := Spiel.system.markt(objekt_id)
	visible = m != null
	if m == null:
		return
	if not m.handelt(gewaehlte_ware):
		gewaehlte_ware = ""
	_baue_zeilen(m)
	aktualisiere_werte()


func _ist_angedockt() -> bool:
	return Spiel.markt_am_standort() != null and Spiel.schiff.standort_id == objekt_id


# --- Aufbau ---------------------------------------------------------------

## Eine Tabellenzeile aus Labels. Bei kopf = true nur Text, sonst ein
## antippbarer Knopf, der die Labels enthält.
func _neue_zeile(texte: Array, kopf: bool) -> Control:
	var huelle: Control
	if kopf:
		huelle = Control.new()
		huelle.custom_minimum_size = Vector2(0, 30)
	else:
		var knopf := Button.new()
		knopf.toggle_mode = true
		knopf.custom_minimum_size = Vector2(0, ZEILENHOEHE)
		huelle = knopf
	var reihe := HBoxContainer.new()
	reihe.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	reihe.offset_left = 10
	reihe.offset_right = -10
	reihe.mouse_filter = Control.MOUSE_FILTER_IGNORE
	huelle.add_child(reihe)
	for i in SPALTEN.size():
		var label := Label.new()
		label.text = str(texte[i]) if i < texte.size() else ""
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		label.size_flags_vertical = Control.SIZE_EXPAND_FILL
		label.clip_text = true
		var breite: int = SPALTEN[i][1]
		if breite == 0:
			label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		else:
			label.custom_minimum_size = Vector2(breite, 0)
			label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		if kopf:
			label.modulate = Color(0.7, 0.8, 0.95)
		reihe.add_child(label)
	return huelle


func _baue_zeilen(m: Markt) -> void:
	for kind in _zeilen_box.get_children():
		_zeilen_box.remove_child(kind)
		kind.queue_free()
	_zeilen.clear()
	for ware_id in Daten.waren_reihenfolge:
		if not m.handelt(ware_id):
			continue
		var ware := Daten.ware(ware_id)
		var anzeige := str(ware.get("name", ware_id))
		if ware.get("illegal", false):
			anzeige += " (illegal)"
		var zeile := _neue_zeile([anzeige], false) as Button
		zeile.pressed.connect(_waehle_ware.bind(ware_id))
		_zeilen_box.add_child(zeile)
		_zeilen[ware_id] = {
			"knopf": zeile,
			"labels": zeile.get_child(0).get_children(),
		}


func _baue_handelsleiste() -> void:
	_handelsleiste = VBoxContainer.new()
	_handelsleiste.add_theme_constant_override("separation", 6)
	add_child(_handelsleiste)

	_ware_label = Label.new()
	_ware_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_handelsleiste.add_child(_ware_label)

	var mengen_reihe := HBoxContainer.new()
	_handelsleiste.add_child(mengen_reihe)
	for schritt in [-10, -1]:
		mengen_reihe.add_child(_knopf("%d" % schritt, _aendere_menge.bind(schritt)))
	_menge_label = Label.new()
	_menge_label.custom_minimum_size = Vector2(80, 0)
	_menge_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_menge_label.add_theme_font_size_override("font_size", 26)
	_menge_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mengen_reihe.add_child(_menge_label)
	for schritt in [1, 10]:
		mengen_reihe.add_child(_knopf("+%d" % schritt, _aendere_menge.bind(schritt)))

	var max_reihe := HBoxContainer.new()
	_handelsleiste.add_child(max_reihe)
	max_reihe.add_child(_knopf("Max. kaufbar", _setze_max_kauf, true))
	max_reihe.add_child(_knopf("Ganze Fracht", _setze_max_verkauf, true))

	var aktion_reihe := HBoxContainer.new()
	_handelsleiste.add_child(aktion_reihe)
	_kauf_knopf = _knopf("Kaufen", _on_kaufen, true)
	_kauf_knopf.custom_minimum_size.y = 72
	aktion_reihe.add_child(_kauf_knopf)
	_verkauf_knopf = _knopf("Verkaufen", _on_verkaufen, true)
	_verkauf_knopf.custom_minimum_size.y = 72
	aktion_reihe.add_child(_verkauf_knopf)


func _knopf(text: String, aktion: Callable, breit := false) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(72, 60)
	if breit:
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.pressed.connect(aktion)
	return b


# --- Anzeige aktualisieren -------------------------------------------------

func aktualisiere_werte() -> void:
	var m := Spiel.system.markt(objekt_id)
	if m == null or not visible:
		return
	var angedockt := _ist_angedockt()
	if angedockt:
		_hinweis.text = "Angedockt: Tippe eine Ware an, um zu handeln."
	else:
		_hinweis.text = "Fernabfrage der Preise. Zum Handeln musst du hier andocken."

	for ware_id in _zeilen:
		var labels: Array = _zeilen[ware_id]["labels"]
		labels[1].text = str(m.kaufpreis(ware_id)) if m.lager(ware_id) > 0 else "–"
		labels[2].text = str(m.verkaufspreis(ware_id))
		labels[3].text = str(m.lager(ware_id))
		var fracht := Spiel.schiff.menge(ware_id)
		labels[4].text = str(fracht) if fracht > 0 else ""
		_zeilen[ware_id]["knopf"].button_pressed = ware_id == gewaehlte_ware

	_aktualisiere_handelsleiste(m, angedockt)


func _aktualisiere_handelsleiste(m: Markt, angedockt: bool) -> void:
	_handelsleiste.visible = angedockt
	if not angedockt:
		return
	if gewaehlte_ware == "":
		_ware_label.text = "Keine Ware gewählt."
		_menge_label.text = "–"
		_kauf_knopf.disabled = true
		_verkauf_knopf.disabled = true
		_kauf_knopf.text = "Kaufen"
		_verkauf_knopf.text = "Verkaufen"
		return

	var ware := Daten.ware(gewaehlte_ware)
	var max_kauf := Spiel.max_kaufbar(gewaehlte_ware)
	var max_verkauf := Spiel.max_verkaufbar(gewaehlte_ware)
	_ware_label.text = "%s (%s, Basispreis %d Cr, Volumen %d)" % [
		ware.get("name", gewaehlte_ware),
		Daten.kategorie_name(str(ware.get("kategorie", ""))),
		int(ware.get("basispreis", 0)),
		int(ware.get("volumen", 1)),
	]
	_menge_label.text = str(menge)

	_kauf_knopf.text = "Kaufen\n%s" % Spiel.geld_text(m.kosten_kauf(gewaehlte_ware, menge))
	_kauf_knopf.disabled = menge > max_kauf
	_verkauf_knopf.text = "Verkaufen\n%s" % Spiel.geld_text(m.erloes_verkauf(gewaehlte_ware, menge))
	_verkauf_knopf.disabled = menge > max_verkauf


# --- Bedienung ------------------------------------------------------------

func _waehle_ware(ware_id: String) -> void:
	gewaehlte_ware = ware_id
	menge = 1
	aktualisiere_werte()


func _aendere_menge(schritt: int) -> void:
	menge = maxi(1, menge + schritt)
	aktualisiere_werte()


func _setze_max_kauf() -> void:
	if gewaehlte_ware != "":
		menge = maxi(1, Spiel.max_kaufbar(gewaehlte_ware))
		aktualisiere_werte()


func _setze_max_verkauf() -> void:
	if gewaehlte_ware != "":
		menge = maxi(1, Spiel.max_verkaufbar(gewaehlte_ware))
		aktualisiere_werte()


func _on_kaufen() -> void:
	if gewaehlte_ware != "":
		Spiel.kaufen(gewaehlte_ware, menge)


func _on_verkaufen() -> void:
	if gewaehlte_ware != "":
		Spiel.verkaufen(gewaehlte_ware, menge)
