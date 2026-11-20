extends Node
## Der laufende Spielstand: Geld, Zeit, Sonnensystem und Spielerschiff.
##
## Global erreichbar als "Spiel" (Autoload). Die Oberfläche liest hier
## die Werte und ruft Aktionen wie kaufen() oder fliegen_nach() auf.
## Über Signale erfährt sie, wann sie sich neu zeichnen muss.

signal stunde_vergangen                      # jede volle Spielstunde
signal spielstand_geaendert                  # Geld oder Fracht geändert
signal schiff_gestartet(ziel_id: String)
signal schiff_angekommen(objekt_id: String)
signal zeit_einstellung_geaendert            # Pause oder Zeitraffer geändert
signal meldung(text: String)                 # kurze Nachricht an den Spieler

## Größter Zeitschritt pro Bild. Verhindert Sprünge, z. B. nach einem
## Ruckler oder wenn die App aus dem Hintergrund zurückkommt.
const MAX_DELTA := 0.25

var credits: int = 0
var zeit: float = 0.0                 # Spielstunden seit Spielbeginn
var system: Sternensystem
var schiff: Schiff

var zeitraffer: float = 1.0
var pausiert: bool = false

var _naechste_volle_stunde: float = 1.0
var _stunden_pro_sekunde: float = 1.0


func _ready() -> void:
	neues_spiel()


## Setzt alles auf den Anfang laut data/spiel.json
func neues_spiel() -> void:
	var start: Dictionary = Daten.einstellungen.get("start", {})
	var zeit_regeln: Dictionary = Daten.einstellungen.get("zeit", {})
	_stunden_pro_sekunde = float(zeit_regeln.get("spielstunden_pro_sekunde", 1.0))

	credits = int(start.get("credits", 1000))
	zeit = 8.0  # Tag 1, 08:00 Uhr
	_naechste_volle_stunde = floor(zeit) + 1.0
	zeitraffer = 1.0
	pausiert = false

	var system_daten := Daten.lade_json(str(start.get("system", "")))
	system = Sternensystem.new(system_daten, Daten.waren, Daten.einstellungen.get("markt", {}))

	var typ_id := str(start.get("schiff", ""))
	if not Daten.schiffe.has(typ_id):
		push_error("Spiel: Startschiff '%s' fehlt in schiffe.json" % typ_id)
	schiff = Schiff.new(str(start.get("schiff_name", "Frachter")), Daten.schiffe.get(typ_id, {}))
	schiff.standort_id = str(start.get("standort", ""))

	spielstand_geaendert.emit()
	zeit_einstellung_geaendert.emit()


func _process(delta: float) -> void:
	if pausiert:
		return
	vorspulen(minf(delta, MAX_DELTA) * zeitraffer * _stunden_pro_sekunde)


## Lässt Spielzeit vergehen. Das Schiff bewegt sich fließend,
## die Wirtschaft rechnet in ganzen Stunden.
func vorspulen(stunden: float) -> void:
	zeit += stunden
	if schiff.bewege(stunden):
		var ort := str(system.objekt(schiff.standort_id).get("name", "?"))
		meldung.emit("%s ist bei %s angedockt." % [schiff.name, ort])
		schiff_angekommen.emit(schiff.standort_id)
	while zeit >= _naechste_volle_stunde:
		_naechste_volle_stunde += 1.0
		system.simuliere(1.0)
		stunde_vergangen.emit()


# --- Zeitsteuerung -------------------------------------------------------

func zeitraffer_stufen() -> Array:
	return Daten.einstellungen.get("zeit", {}).get("zeitraffer_stufen", [1, 2, 5, 10])


func setze_zeitraffer(faktor: float) -> void:
	zeitraffer = faktor
	pausiert = false
	zeit_einstellung_geaendert.emit()


func setze_pause(an: bool) -> void:
	pausiert = an
	zeit_einstellung_geaendert.emit()


## "Tag 3, 14:05"
func zeit_text() -> String:
	var tag := int(zeit / 24.0) + 1
	var stunde := int(zeit) % 24
	var minute := int((zeit - floor(zeit)) * 60.0)
	return "Tag %d, %02d:%02d" % [tag, stunde, minute]


## Beim Wechsel in den Hintergrund (Android) automatisch pausieren
func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_PAUSED and not pausiert:
		setze_pause(true)


# --- Reisen ---------------------------------------------------------------

func fliegen_nach(objekt_id: String) -> bool:
	if schiff.ist_unterwegs():
		meldung.emit("Das Schiff ist schon unterwegs.")
		return false
	if objekt_id == schiff.standort_id:
		return false
	var obj := system.objekt(objekt_id)
	if obj.is_empty():
		return false
	if str(obj.get("typ", "")) == "sonne":
		meldung.emit("Anfliegen der Sonne ist keine gute Idee.")
		return false
	var von := system.position(schiff.standort_id)
	schiff.starte_flug(objekt_id, von, system.position(objekt_id))
	meldung.emit("Kurs auf %s, Ankunft in %s." % [obj.get("name", "?"), dauer_text(schiff.restzeit())])
	schiff_gestartet.emit(objekt_id)
	return true


## Flugzeit vom aktuellen Standort zu einem Objekt (Spielstunden)
func flugzeit_nach(objekt_id: String) -> float:
	var von := system.position(schiff.standort_id)
	if schiff.ist_unterwegs():
		von = schiff.flug_position()
	return schiff.flugzeit(von, system.position(objekt_id))


## "3 h 20 min"
func dauer_text(stunden: float) -> String:
	var minuten := int(round(stunden * 60.0))
	if minuten < 60:
		return "%d min" % minuten
	return "%d h %02d min" % [minuten / 60, minuten % 60]


# --- Handel ---------------------------------------------------------------

## Markt, an dem das Schiff gerade angedockt ist (oder null)
func markt_am_standort() -> Markt:
	if schiff.ist_unterwegs():
		return null
	return system.markt(schiff.standort_id)


## Größte Menge, die der Spieler jetzt kaufen kann (Lager, Laderaum, Geld)
func max_kaufbar(ware_id: String) -> int:
	var m := markt_am_standort()
	if m == null or not m.handelt(ware_id):
		return 0
	var volumen := maxi(1, int(Daten.ware(ware_id).get("volumen", 1)))
	var obergrenze := mini(m.lager(ware_id), schiff.frei(Daten.waren) / volumen)
	# Binäre Suche: die größte Menge, deren Gesamtpreis noch bezahlbar ist
	var unten := 0
	var oben := obergrenze
	while unten < oben:
		var mitte := (unten + oben + 1) / 2
		if m.kosten_kauf(ware_id, mitte) <= credits:
			unten = mitte
		else:
			oben = mitte - 1
	return unten


## Größte Menge, die der Spieler jetzt verkaufen kann (Fracht, Marktlager)
func max_verkaufbar(ware_id: String) -> int:
	var m := markt_am_standort()
	if m == null or not m.handelt(ware_id):
		return 0
	return mini(schiff.menge(ware_id), m.freier_platz(ware_id))


func kaufen(ware_id: String, menge: int) -> bool:
	var m := markt_am_standort()
	if m == null:
		meldung.emit("Zum Handeln musst du angedockt sein.")
		return false
	if menge <= 0:
		return false
	if menge > max_kaufbar(ware_id):
		meldung.emit(_grund_kauf_unmoeglich(m, ware_id, menge))
		return false
	var kosten := m.kosten_kauf(ware_id, menge)
	m.entnehmen(ware_id, menge)
	schiff.zuladen(ware_id, menge)
	credits -= kosten
	meldung.emit("%d × %s gekauft für %s." % [menge, Daten.ware_name(ware_id), geld_text(kosten)])
	spielstand_geaendert.emit()
	return true


func verkaufen(ware_id: String, menge: int) -> bool:
	var m := markt_am_standort()
	if m == null:
		meldung.emit("Zum Handeln musst du angedockt sein.")
		return false
	if menge <= 0:
		return false
	if not m.handelt(ware_id):
		meldung.emit("Hier wird %s nicht gehandelt." % Daten.ware_name(ware_id))
		return false
	if menge > max_verkaufbar(ware_id):
		meldung.emit("So viel kannst du hier nicht verkaufen.")
		return false
	var erloes := m.erloes_verkauf(ware_id, menge)
	m.einlagern(ware_id, menge)
	schiff.abladen(ware_id, menge)
	credits += erloes
	meldung.emit("%d × %s verkauft für %s." % [menge, Daten.ware_name(ware_id), geld_text(erloes)])
	spielstand_geaendert.emit()
	return true


func _grund_kauf_unmoeglich(m: Markt, ware_id: String, menge: int) -> String:
	if not m.handelt(ware_id):
		return "Hier wird %s nicht gehandelt." % Daten.ware_name(ware_id)
	if m.lager(ware_id) < menge:
		return "Der Markt hat nicht genug %s." % Daten.ware_name(ware_id)
	var volumen := maxi(1, int(Daten.ware(ware_id).get("volumen", 1)))
	if schiff.frei(Daten.waren) < menge * volumen:
		return "Nicht genug Laderaum."
	return "Nicht genug Credits."


## "12.345 Cr"
func geld_text(betrag: int) -> String:
	return "%s Cr" % zahl_text(betrag)


## Zahl mit Tausenderpunkten: 1234567 -> "1.234.567"
func zahl_text(zahl: int) -> String:
	var s := str(absi(zahl))
	var ergebnis := ""
	while s.length() > 3:
		ergebnis = "." + s.substr(s.length() - 3) + ergebnis
		s = s.substr(0, s.length() - 3)
	return ("-" if zahl < 0 else "") + s + ergebnis
