class_name ObjektInfo
extends VBoxContainer
## Zeigt Bild, Beschreibung und Statistiktabelle des gewählten Objekts.
## Für Himmelskörper und Stationen gibt es zusätzlich den Knopf "Hierher fliegen".

const TYP_NAMEN := {
	"sonne": "Stern",
	"planet": "Planet",
	"mond": "Mond",
	"station": "Raumstation",
}

var objekt_id: String = ""

var _bild: TextureRect
var _titel: Label
var _untertitel: Label
var _text: Label
var _tabelle: GridContainer
var _flug_knopf: Button


func _ready() -> void:
	add_theme_constant_override("separation", 8)

	var kopf := HBoxContainer.new()
	kopf.add_theme_constant_override("separation", 12)
	add_child(kopf)

	_bild = TextureRect.new()
	_bild.custom_minimum_size = Vector2(110, 110)
	_bild.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_bild.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	kopf.add_child(_bild)

	var namen := VBoxContainer.new()
	namen.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	namen.alignment = BoxContainer.ALIGNMENT_CENTER
	kopf.add_child(namen)
	_titel = Label.new()
	_titel.add_theme_font_size_override("font_size", 28)
	namen.add_child(_titel)
	_untertitel = Label.new()
	_untertitel.modulate = Color(0.7, 0.8, 0.95)
	namen.add_child(_untertitel)

	_text = Label.new()
	_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(_text)

	_tabelle = GridContainer.new()
	_tabelle.columns = 2
	_tabelle.add_theme_constant_override("h_separation", 20)
	add_child(_tabelle)

	_flug_knopf = Button.new()
	_flug_knopf.custom_minimum_size = Vector2(0, 64)
	_flug_knopf.pressed.connect(_on_flug_knopf)
	add_child(_flug_knopf)

	Spiel.spielstand_geaendert.connect(aktualisiere)
	Spiel.schiff_gestartet.connect(func(_id): aktualisiere())
	Spiel.schiff_angekommen.connect(func(_id): aktualisiere())


func zeige(neue_id: String) -> void:
	objekt_id = neue_id
	aktualisiere()


func aktualisiere() -> void:
	if objekt_id == SystemAnsicht.SCHIFF_ID:
		_zeige_schiff()
	else:
		_zeige_objekt()


## Wird regelmäßig aufgerufen, damit Restflugzeit und Entfernungen stimmen
func aktualisiere_zeiten() -> void:
	if objekt_id != "":
		aktualisiere()


func _zeige_objekt() -> void:
	var obj := Spiel.system.objekt(objekt_id)
	if obj.is_empty():
		visible = false
		return
	visible = true
	_setze_bild(str(obj.get("bild", "")))
	_titel.text = str(obj.get("name", objekt_id))
	var typ := str(obj.get("typ", ""))
	_untertitel.text = TYP_NAMEN.get(typ, typ)
	var eltern := str(obj.get("eltern", ""))
	if eltern != "":
		_untertitel.text += " von " + str(Spiel.system.objekt(eltern).get("name", eltern))
	_text.text = str(obj.get("beschreibung", ""))

	var zeilen: Array = []
	var statistik: Dictionary = obj.get("statistik", {})
	for schluessel in statistik:
		zeilen.append([schluessel, str(statistik[schluessel])])
	zeilen.append(["Markt", "ja" if Spiel.system.hat_markt(objekt_id) else "nein"])
	if typ != "sonne" and objekt_id != Spiel.schiff.standort_id:
		zeilen.append(["Flugzeit", Spiel.dauer_text(Spiel.flugzeit_nach(objekt_id))])
	_fuelle_tabelle(zeilen)

	# Flug-Knopf
	_flug_knopf.visible = typ != "sonne"
	var s := Spiel.schiff
	if s.standort_id == objekt_id:
		_flug_knopf.text = "%s ist hier angedockt" % s.name
		_flug_knopf.disabled = true
	elif s.ist_unterwegs():
		_flug_knopf.text = "Schiff ist unterwegs (noch %s)" % Spiel.dauer_text(s.restzeit())
		_flug_knopf.disabled = true
	else:
		_flug_knopf.text = "Hierher fliegen"
		_flug_knopf.disabled = false


func _zeige_schiff() -> void:
	visible = true
	var s := Spiel.schiff
	_setze_bild(str(s.typ.get("bild", "")))
	_titel.text = s.name
	_untertitel.text = str(s.typ.get("name", "Schiff"))
	_text.text = str(s.typ.get("beschreibung", ""))

	var status := ""
	if s.ist_unterwegs():
		status = "Flug nach %s (noch %s)" % [
			Spiel.system.objekt(s.ziel_id).get("name", "?"), Spiel.dauer_text(s.restzeit())]
	else:
		status = "Angedockt bei " + str(Spiel.system.objekt(s.standort_id).get("name", "?"))

	var zeilen: Array = [
		["Status", status],
		["Klasse", str(s.typ.get("klasse", "?"))],
		["Laderaum", "%d / %d" % [s.belegt(Daten.waren), s.laderaum()]],
		["Geschwindigkeit", "%s Einheiten/h" % str(s.typ.get("geschwindigkeit", "?"))],
		["Hyperraum", "ja" if s.typ.get("hyperraum", false) else "nein"],
		["Hülle", str(s.typ.get("huelle", "?"))],
		["Unterhalt", "%s / Tag" % Spiel.geld_text(int(s.typ.get("unterhalt_pro_tag", 0)))],
	]
	if s.fracht.is_empty():
		zeilen.append(["Fracht", "leer"])
	for ware_id in Daten.waren_reihenfolge:
		if s.menge(ware_id) > 0:
			zeilen.append(["  " + Daten.ware_name(ware_id), str(s.menge(ware_id))])
	_fuelle_tabelle(zeilen)
	_flug_knopf.visible = false


func _setze_bild(pfad: String) -> void:
	_bild.texture = load(pfad) if pfad != "" and ResourceLoader.exists(pfad) else null


## zeilen: Liste aus [Bezeichnung, Wert]
func _fuelle_tabelle(zeilen: Array) -> void:
	# Sofort entfernen (nicht queue_free), sonst flackert die Tabelle kurz
	for kind in _tabelle.get_children():
		_tabelle.remove_child(kind)
		kind.free()
	for zeile in zeilen:
		var links := Label.new()
		links.text = str(zeile[0])
		links.modulate = Color(0.7, 0.8, 0.95)
		_tabelle.add_child(links)
		var rechts := Label.new()
		rechts.text = str(zeile[1])
		rechts.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		rechts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_tabelle.add_child(rechts)


func _on_flug_knopf() -> void:
	Spiel.fliegen_nach(objekt_id)
