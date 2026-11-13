// Cloudflare Worker fuer Finnvelo Programmwelten.
// Zaehler (anonym) UND Kommentare laufen ueber EINE Durable Object "Counter"
// (SQLite). Binding COUNTERS, siehe wrangler.jsonc.
//
//   POST /api/hit     {"key":"views:command-control"}     -> Zaehler +1
//   GET  /api/stats?keys=views:site,...                    -> {counts:{...}}
//
//   GET  /api/comments                                     -> oeffentliche Liste
//   POST /api/comments {name?, text, hp}                   -> neuer Kommentar (OHNE Anmeldung)
//   POST /api/comments/admin   {password}                  -> prueft Admin-Passwort
//   POST /api/comments/remove  {id, reason, password}      -> Kommentar als "entfernt" markieren
//
// Admin-Zugang: Beim ersten Aufruf von /admin werden Passwort, Master-Key und
// vier Sicherheitsfragen selbst vergeben (Weg "einrichten"); sie liegen danach
// als Hash in den Tabellen "zugang" und "zugang_sicherung" (fruehere Zugaenge:
// Passwort + Notfall-PIN). Alternativ kann in Cloudflare ein Secret ADMIN_PASSWORD stehen -
// dann ist die Ersteinrichtung von vornherein gesperrt:
//   Dashboard -> Workers & Pages -> Projekt -> Settings -> Variables and Secrets
// Ein selbst gesetztes Passwort hat immer Vorrang vor dem Secret.
//
//   POST /api/zugang {aktion:"lage"}                        -> Ja/Nein-Auskunft, ohne Passwort
//   POST /api/zugang {aktion:"katalog"}                     -> die 30 Sicherheitsfragen
//   POST /api/zugang {aktion:"einrichten", neu, neu2, master, master2, fragen:[{nr, antwort}]x4}
//                                                           -> nur solange nichts gesetzt ist
//   POST /api/zugang {password, aktion:"sicherheit", ...wie einrichten} -> Paket anlegen/erneuern
//   POST /api/zugang {password, aktion:"aendern", neu, pin?}
//   POST /api/zugang {aktion:"fragen"}                      -> zwei der vier Fragen (15 Min. fest)
//   POST /api/zugang {aktion:"zuruecksetzen-fragen", antworten:[a, b], neu, neu2}
//   POST /api/zugang {aktion:"zuruecksetzen-master", master, neu, neu2}
//   Alt, bis das Paket eingerichtet ist (danach ist die PIN geloescht):
//   POST /api/zugang {password, aktion:"pin", pin}
//   POST /api/zugang {aktion:"zuruecksetzen", pin, neu}     -> ohne altes Passwort

import { DurableObject } from "cloudflare:workers";
import { behandleEinkauf, EinkaufSpeicher } from "./einkauf-modul.js";
import { behandleTourenapi, TourenKanal, TourenKopplung } from "./tourenapi-modul.js";
import { behandleFinanzapi, FinanzKanal, FinanzKopplung } from "./finanzapi-modul.js";
import { behandleVorleserapi, VorleserKopplung, VorleserTreff } from "./vorleserapi-modul.js";

// Durable Objects der beiden zugekauften Dienste weiterreichen - Cloudflare
// findet sie sonst nicht, obwohl sie in der wrangler.jsonc stehen.
export { EinkaufSpeicher, TourenKanal, TourenKopplung, FinanzKanal, FinanzKopplung, VorleserKopplung, VorleserTreff };

const KEY_RE = /^[a-z]+:[a-z0-9-]{1,40}$/;
const ALLOWED_PREFIXES = ["views", "video", "download"];

const MAX_TEXT = 2000;
const MAX_NAME = 60;
const MAX_REASON = 200;
const MAX_KEEP = 500;       // hoechstens so viele Kommentare aufbewahren
const RL_MS = 20000;        // 20s Sperre zwischen Posts pro IP

const MAX_CONTENT = 30000;             // max Laenge eines bearbeiteten Textblocks
const MAX_IMG_BYTES = 2 * 1024 * 1024; // max 2 MB pro hochgeladenem Bild
const MAX_APP = 6 * 1024 * 1024;       // max 6 MB pro hochgeladener HTML-App (z.B. Planer)
const PAGE_RE = /^[a-z0-9-]{1,40}$/;

// Kurznamen, die schon von festen Seiten belegt sind - duerfen nicht
// noch einmal als eigenes Programm angelegt werden.
const RESERVIERT = [
  "index", "programme", "kommentare", "kontakt", "impressum", "datenschutz",
  "admin", "downloads", "tester", "404", "assets", "planer", "tess", "api",
  "mischwald", "mischwaldrechner", "aufgabenplaner", "archivar", "finanzmanager",
  "medienstudio", "command-control", "haus-und-gartenplaner", "finnvelo", "sitemap",
  "robots", "favicon", "koppeln", "planer", "well-known", "serverstatus",
  // Ordner und Dienste, die es als Datei bzw. Weg schon gibt. Ohne diese
  // Eintraege koennte eine angelegte Seite sie verschatten: der Worker
  // liefert eigene Programmseiten VOR dem Rueckgriff auf die Dateien.
  "apps",          // /apps/einkaufsliste/ - die Web-Fassung samt APK
  "tourenapi",     // Kopplungsdienst des Tourenplaners
  "finanzapi",     // Geraeteabgleich des Finanzmanagers (27.09.2026)
  "vorleserapi",   // Kopplung und Treffpunkt des FINNVELO Vorlesers (25.10.2026)
  "installation",  // Hilfeseite zur Installation (05.11.2026)
  "einkaufsliste", // Programmseite der Einkaufsliste
  "tourenplaner",  // Programmseite des Tourenplaners
  "lesezeit",      // Programmseite Lesezeit
  "lesezeit",      // Ordner mit APK und Fassungsdatei
  "klarschiff",    // Programmseite + Ordner mit APK; die Fassungsdatei
                   // kommt vom Worker, im Ordner darf keine liegen
  "lorcana"        // Programmseite; /lorcana/pc.json und /android.json kommen
                   // vom Worker (06.11.2026), im Ordner darf keine liegen
];
const APP_RE = /^[a-z0-9-]{1,40}$/;
// Block-Schluessel: ein Kleinbuchstabe + Zahl. Kategorien u.a.:
//   t=Text  i=Bild  v=Video  s=Status  d=Download-Link  g=Galerie
//   n=Navigation/Fusszeile/Marke (Seite "global")  o=Reihenfolge  x=Zusatztexte
const BLOCK_RE = /^[a-z][0-9]{1,4}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function isValidKey(key) {
  if (typeof key !== "string" || !KEY_RE.test(key)) return false;
  return ALLOWED_PREFIXES.includes(key.split(":")[0]);
}

// Text bereinigen: Steuerzeichen raus (ausser Zeilenumbruch/Tab), trimmen, kuerzen.
// Anzeige im Browser erfolgt ueber textContent -> HTML ist dort wirkungslos (kein XSS).
function clean(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, max);
}

async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Vergleich mit fester Laufzeit - verraet nichts ueber Teiltreffer.
function textGleich(a, b) {
  const x = String(a == null ? "" : a), y = String(b == null ? "" : b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

/* --- Passwort und Notfall-PIN nur als Hash ablegen (05.11.2026) ----------
 * Format: "pbkdf2$<runden>$<salz base64>$<hash base64>", PBKDF2-SHA256.
 * 100.000 Runden - mehr laesst Cloudflare fuer PBKDF2 nicht zu.
 * Alte Klartext-Eintraege werden weiter erkannt und bei der naechsten
 * erfolgreichen Anmeldung umgestellt (Counter.passwortStimmt). Ein
 * Klartext-Eintrag aus einer alten Sicherung funktioniert also weiterhin.
 * Die Pruefung des Admin-Passworts selbst: Counter.adminPruefen (mit
 * Anmeldebremse). Die fruehere Funktion checkAdmin ist darin aufgegangen.
 * ------------------------------------------------------------------------ */
const HASH_RUNDEN = 100000;

function bytesB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function pbkdf2(text, salz, runden) {
  const roh = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(String(text)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salz, iterations: runden }, roh, 256);
  return new Uint8Array(bits);
}

function istHash(s) { return typeof s === "string" && s.indexOf("pbkdf2$") === 0; }

async function geheimHashen(text) {
  const salz = crypto.getRandomValues(new Uint8Array(16));
  return "pbkdf2$" + HASH_RUNDEN + "$" + bytesB64(salz) + "$" + bytesB64(await pbkdf2(text, salz, HASH_RUNDEN));
}

async function geheimPasst(eingabe, gespeichert) {
  if (typeof eingabe !== "string" || !eingabe || !gespeichert) return false;
  if (!istHash(gespeichert)) return textGleich(eingabe, gespeichert);   // Altbestand: Klartext
  const t = gespeichert.split("$");
  if (t.length !== 4) return false;
  const runden = Number(t[1]) || 0;
  if (runden < 1 || runden > HASH_RUNDEN) return false;
  return textGleich(bytesB64(await pbkdf2(eingabe, b64ToBytes(t[2]), runden)), t[3]);
}

/* --- Zuruecksetzen nach dem Finnvelo-Standard (05.11.2026) ----------------
 * Passwort und Master-Key je doppelt eingeben, vier von dreissig Fragen
 * waehlen und beantworten. Zum Zuruecksetzen: zwei der vier Fragen werden
 * zufaellig gestellt (beide muessen stimmen) - oder der Master-Key.
 * Danach entsteht im Browser ein PDF-Zertifikat (admin.html).
 * Katalog wortgleich mit dem Finnvelo Finanzmanager (datenspeicher.js).
 * Die Nummer einer Frage ist ihr Platz in dieser Liste - NICHT umsortieren,
 * nur hinten anfuegen, sonst passen gespeicherte Fragen nicht mehr.
 * ------------------------------------------------------------------------ */
const FRAGEN_KATALOG = [
  "Wie hieß dein erstes Haustier?",
  "In welcher Stadt bist du geboren?",
  "Wie lautet der Geburtsname deiner Mutter?",
  "Wie hieß deine erste Schule?",
  "Wie hieß dein bester Freund in der Kindheit?",
  "Was war dein erstes Auto (Marke und Modell)?",
  "In welcher Straße bist du aufgewachsen?",
  "Wie heißt dein Lieblingsbuch?",
  "Wo hast du deinen ersten Urlaub verbracht?",
  "Wie lautete dein erster Spitzname?",
  "Wie hieß deine erste Lehrerin oder dein erster Lehrer?",
  "Was war dein erster Beruf oder Ferienjob?",
  "Wie hieß dein erster Arbeitgeber?",
  "In welcher Stadt haben sich deine Eltern kennengelernt?",
  "Wie heißt der Geburtsort deines Vaters?",
  "Was war dein Lieblingsessen als Kind?",
  "Wie hieß dein erstes Kuscheltier?",
  "Welches Instrument wolltest du als Kind lernen?",
  "Wie hieß deine Lieblingsband als Jugendlicher?",
  "Welchen Film hast du als erstes im Kino gesehen?",
  "Wie hieß der Ort deiner Konfirmation, Kommunion oder Jugendweihe?",
  "Wie lautet der Vorname deines ältesten Cousins oder deiner ältesten Cousine?",
  "Welche Farbe hatte dein erstes Fahrrad?",
  "Wie hieß die Straße deiner ersten eigenen Wohnung?",
  "Was war dein Traumberuf als Kind?",
  "Wie hieß dein Lieblingslehrer oder deine Lieblingslehrerin?",
  "In welchem Krankenhaus bist du geboren?",
  "Wie hieß dein erster Sportverein?",
  "Welches war dein erstes Handy (Marke und Modell)?",
  "Wie lautet der zweite Vorname deines ältesten Geschwisters?"
];
const FRAGE_GUELTIG = 15 * 60 * 1000;   // so lange bleiben die zwei gestellten Fragen dieselben

// Antworten vergleichen wie im Finanzmanager: Gross/klein und Leerraum egal.
function antwortNorm(text) {
  return String(text || "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/* Pruefung der Eingaben fuer das Sicherheitspaket. Liefert { fehler } oder
   { neu, master, fragen: [{ nr, antwort }] }. Doppelte Eingaben prueft auch
   der Server - die Seite koennte veraltet sein. */
function paketPruefen(b) {
  const neu = String(b.neu || ""), neu2 = String(b.neu2 || "");
  const master = String(b.master || "").trim(), master2 = String(b.master2 || "").trim();
  if (neu.length < 8) return { fehler: "Das Passwort braucht mindestens acht Zeichen." };
  if (neu !== neu2) return { fehler: "Die beiden Passwörter sind verschieden." };
  if (master.length < 12) return { fehler: "Der Master-Key braucht mindestens zwölf Zeichen." };
  if (master.length > 200) return { fehler: "Der Master-Key ist zu lang (höchstens 200 Zeichen)." };
  if (master !== master2) return { fehler: "Die beiden Master-Keys sind verschieden." };
  if (textGleich(master, neu)) return { fehler: "Master-Key und Passwort müssen verschieden sein." };
  const roh = Array.isArray(b.fragen) ? b.fragen : [];
  if (roh.length !== 4) return { fehler: "Bitte genau vier Sicherheitsfragen wählen und beantworten." };
  const fragen = [];
  for (const f of roh) {
    const nr = Number(f && f.nr);
    if (!Number.isInteger(nr) || nr < 0 || nr >= FRAGEN_KATALOG.length) return { fehler: "Unbekannte Sicherheitsfrage." };
    if (fragen.some((x) => x.nr === nr)) return { fehler: "Jede Sicherheitsfrage darf nur einmal vorkommen." };
    const antwort = antwortNorm(f.antwort);
    if (antwort.length < 2) return { fehler: "Bitte jede der vier Fragen beantworten (mindestens zwei Zeichen)." };
    if (antwort.length > 200) return { fehler: "Eine Antwort ist zu lang (höchstens 200 Zeichen)." };
    fragen.push({ nr, antwort });
  }
  return { neu, master, fragen };
}

// Anmeldebremse: nach so vielen VERSCHIEDENEN falschen Eingaben einer
// Herkunft ist fuer BREMSE_DAUER Pause. Eine Zaehlung verfaellt nach einer Stunde.
const BREMSE_VERSUCHE = 5;
const BREMSE_DAUER = 10 * 60 * 1000;
const BREMSE_VERFALL = 60 * 60 * 1000;

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* Welche Update-Adresse auf welchen Ablage-Schluessel fuehrt.
   EINE Quelle fuer beide Seiten: der Worker beantwortet damit die
   Anfragen, der Zaehler erkennt damit verwaiste Fassungsangaben.
   Zwei Kopien waeren mit der Zeit auseinandergelaufen. */
const VERSION_ABLAGEN = {
  "/mischwaldrechner/version.json": "mischwald",
  "/finnvelo/aufgabenplaner/version.json": "aufgabenplaner",
  // Der Einkaufsplaner fragt genau diese Adresse ab. Sie MUSS vom Worker
  // kommen - lag hier eine echte Datei im Ordner, lieferte Cloudflare
  // die aus, bevor der Worker ueberhaupt gefragt wurde. Die Update-
  // Kachel im Admin speicherte dann ins Leere: "Gespeichert" gemeldet,
  // ausgeliefert wurde weiter die alte Datei.
  "/einkaufsliste/version.json": "einkaufsliste",
  /* Tourenplaner: zwei getrennte Dateien mit je eigenem Schluessel.
     Kommen vom WORKER, gepflegt ueber die Kacheln - wie beim
     Aufgabenplaner. Im Ordner /tourenplaner/ darf keine gleichnamige
     Datei liegen: eine Datei gewinnt immer, und die Kachel speicherte
     dann still ins Leere. */
  // Aufgabenplaner PC - eigene Datei, damit App und PC-Programm sich
  // nicht mehr gegenseitig ueberschreiben.
  "/finnvelo/aufgabenplaner/pc.json": "aufgabenplaner-pc",
  // Je Fassung eine eigene Datei - sonst ueberschreiben sich App und
  // PC-Programm gegenseitig. Schluessel IMMER klein schreiben!
  "/einkaufsliste/pc.json": "einkaufsliste-pc",
  "/mischwaldrechner/pc.json": "mischwald-pc",
  "/lesezeit/pc.json": "lesezeit-pc",   // klein! der Vergleich nutzt toLowerCase()
  /* Klarschiff: reine Android-App, daher nur eine Datei. Im Ordner
     /klarschiff/ darf KEINE version.json liegen - eine echte Datei
     gewinnt immer, und die Update-Kachel speicherte dann ins Leere. */
  "/klarschiff/version.json": "klarschiff",
  "/tourenplaner/android.json": "tourenplaner-android",
  "/tourenplaner/pc.json": "tourenplaner-pc",
  // Lesezeit: die App fragt /lesezeit/version.json ab.
  "/lesezeit/version.json": "lesezeit",
  /* Lorcana (06.11.2026): PC-Programm und App mit je eigener Datei. Grund-
     adresse in beiden Programmen: https://finnveloprogramme.com/lorcana */
  "/lorcana/pc.json": "lorcana-pc",
  "/lorcana/android.json": "lorcana-android",
  /* Haus- und Gartenplaner (06.11.2026, ab Fassung 1.0.1): Die HTML-Datei fragt genau diese Adresse ab.
     Felder: version, url, notes. */
  "/haus-und-gartenplaner/version.json": "haus-und-gartenplaner"
};

export class Counter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // Eigene Tabellen (eindeutige Namen -> kein Schema-Konflikt mit Altbestand).
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS counter_values (key TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0)"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, name TEXT, body TEXT NOT NULL, created INTEGER NOT NULL, removed INTEGER NOT NULL DEFAULT 0, reason TEXT)"
    );
    // Antworten des Admins auf Kommentare (05.11.2026). Eigene Tabelle statt
    // neuer Spalte in "comments": ein ALTER TABLE muesste bei jedem Aufwachen
    // laufen und wirft, sobald die Spalte da ist (siehe Kanal-Konstruktor).
    // Je Kommentar hoechstens eine Antwort; sie laesst sich bearbeiten.
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS antworten (kommentar TEXT PRIMARY KEY, text TEXT NOT NULL, zeit INTEGER NOT NULL)"
    );
    // Inline-Editor: bearbeitete Texte/Bild-Verweise je Seite + hochgeladene Bilder.
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS content (page TEXT NOT NULL, block TEXT NOT NULL, type TEXT NOT NULL, value TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (page, block))"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, mime TEXT NOT NULL, data TEXT NOT NULL, created INTEGER NOT NULL)"
    );
    // Inline-Editor: hochgeladene HTML-App (z.B. der Haus- und Gartenplaner),
    // die der Startknopf direkt oeffnet. Eine Datei pro slug.
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS apps (slug TEXT PRIMARY KEY, html TEXT NOT NULL, updated INTEGER NOT NULL)"
    );
    // Verzeichnis der Kanaele und Fehlerbuch - nur fuer die Aufsicht.
    // Enthaelt KEINE Inhalte, nur Kennzahlen.
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS kanalliste (code TEXT PRIMARY KEY, angelegt INTEGER NOT NULL)"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS fehler (" +
      "nr INTEGER PRIMARY KEY AUTOINCREMENT, zeit INTEGER NOT NULL, " +
      "weg TEXT NOT NULL, lage INTEGER NOT NULL, text TEXT NOT NULL)"
    );

    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS zugang (eins INTEGER PRIMARY KEY CHECK (eins = 1), " +
      "passwort TEXT, pin TEXT, geaendert INTEGER)"
    );
    // Sicherheitspaket fuer das Zuruecksetzen (05.11.2026): Master-Key und
    // vier Fragen, alles nur als Hash. "fragen" = JSON [{ nr, frage, hash }].
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS zugang_sicherung (eins INTEGER PRIMARY KEY CHECK (eins = 1), " +
      "master TEXT NOT NULL, fragen TEXT NOT NULL, angelegt INTEGER NOT NULL)"
    );
    // Welche zwei der vier Fragen einer Herkunft gerade gestellt sind
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS zugang_frage (herkunft TEXT PRIMARY KEY, auswahl TEXT NOT NULL, bis INTEGER NOT NULL)"
    );
    // Anmeldebremse (05.11.2026). "herkunft" ist ein Hash der IP-Adresse,
    // "letzter" ein Kurzhash der letzten falschen Eingabe - nie die Eingabe selbst.
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS anmeldebremse (herkunft TEXT PRIMARY KEY, " +
      "versuche INTEGER NOT NULL DEFAULT 0, bis INTEGER, letzter TEXT, zeit INTEGER)"
    );

    // Aeltere Faessungen bearbeiteter Bloecke. Vor jedem Ueberschreiben wandert
    // der bisherige Wert hierher - so laesst sich ein Vertipper zuruecknehmen.
    // Pro Block werden nur die letzten VERLAUF_TIEFE Staende behalten.
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS verlauf (" +
      "nr INTEGER PRIMARY KEY AUTOINCREMENT, seite TEXT NOT NULL, block TEXT NOT NULL, " +
      "art TEXT NOT NULL, wert TEXT NOT NULL, zeit INTEGER NOT NULL)"
    );
    this.sql.exec(
      "CREATE INDEX IF NOT EXISTS verlauf_seite ON verlauf (seite, block, nr)"
    );

    this.recentPosts = new Map();
    this.sperrBis = new WeakMap();   // Anfrage -> Sperre bis (Anmeldebremse)   // ipHash -> Zeitstempel (nur im Speicher, fuer Rate-Limit)
  }

  readCount(key) {
    const rows = this.sql.exec("SELECT value FROM counter_values WHERE key = ?", key).toArray();
    return rows.length ? Number(rows[0].value) : 0;
  }

  gesetztesPasswort() {
    try {
      const r = this.sql.exec("SELECT passwort FROM zugang WHERE eins = 1").toArray();
      return (r.length && r[0].passwort) ? r[0].passwort : "";
    } catch (_e) { return ""; }
  }

  /* ---- Admin-Passwort pruefen (mit Anmeldebremse) ---------------------
   * Ersetzt das fruehere checkAdmin an allen Stellen. Ablauf:
   *   1. Ist diese Herkunft gerade gesperrt?  -> nein, ohne zu pruefen
   *   2. Passwort richtig?                    -> ja, Zaehlung loeschen
   *   3. Sonst Fehlversuch zaehlen. Derselbe falsche Wert hintereinander
   *      (eine veraltete Sitzung, die regelmaessig nachfragt) zaehlt nur
   *      einmal - Durchprobieren dagegen jedes Mal.
   * Ohne Passworteingabe wird nichts gezaehlt. */
  async herkunftKennung(request) {
    const ip = (request && request.headers.get("CF-Connecting-IP")) || "unbekannt";
    return (await sha256hex("bremse:" + ip)).slice(0, 32);
  }

  bremseZeile(wer) {
    try {
      return this.sql.exec(
        "SELECT versuche, bis, letzter, zeit FROM anmeldebremse WHERE herkunft = ?", wer
      ).toArray()[0] || null;
    } catch (_e) { return null; }
  }

  async fehlversuch(wer, z, eingabe, request) {
    const jetzt = Date.now();
    const merkmal = (await sha256hex("falsch:" + eingabe)).slice(0, 16);
    if (z && z.letzter === merkmal && z.zeit && jetzt - z.zeit < BREMSE_VERFALL) return;
    let versuche = 1;
    if (z && !(z.bis && z.bis <= jetzt) && z.zeit && jetzt - z.zeit < BREMSE_VERFALL) {
      versuche = (Number(z.versuche) || 0) + 1;
    }
    const sperren = versuche >= BREMSE_VERSUCHE;
    this.sql.exec(
      "INSERT INTO anmeldebremse (herkunft, versuche, bis, letzter, zeit) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(herkunft) DO UPDATE SET versuche = excluded.versuche, bis = excluded.bis, " +
      "letzter = excluded.letzter, zeit = excluded.zeit",
      wer, sperren ? 0 : versuche, sperren ? jetzt + BREMSE_DAUER : null, merkmal, jetzt
    );
    try { this.sql.exec("DELETE FROM anmeldebremse WHERE zeit < ?", jetzt - 24 * 60 * 60 * 1000); } catch (_e) {}
    if (sperren) {
      this.sperrBis.set(request, jetzt + BREMSE_DAUER);
      this.spurLegen("Anmeldung", "Zu viele Fehlversuche - Anmeldung für 10 Minuten gesperrt");
    }
  }

  // Stimmt das Passwort? Stellt einen alten Klartext-Eintrag dabei auf Hash um.
  async passwortStimmt(pw) {
    const gesetzt = this.gesetztesPasswort();
    if (!gesetzt) return !!this.env.ADMIN_PASSWORD && textGleich(pw, this.env.ADMIN_PASSWORD);
    // Zwischenspeicher: PBKDF2 kostet Rechenzeit, und die Admin-Oberflaeche
    // fragt oft nach. Gilt nur, solange der gespeicherte Wert gleich bleibt.
    const merk = (await sha256hex("ok:" + pw)) + "|" + gesetzt;
    if (this.pwBestaetigt === merk) return true;
    if (!(await geheimPasst(pw, gesetzt))) return false;
    if (!istHash(gesetzt)) {
      const h = await geheimHashen(pw);
      this.sql.exec("UPDATE zugang SET passwort = ? WHERE eins = 1", h);
      await this.pinHashen();
      this.spurLegen("Zugang", "Passwort und PIN auf verschlüsselte Ablage umgestellt");
      this.pwBestaetigt = (await sha256hex("ok:" + pw)) + "|" + h;
      return true;
    }
    this.pwBestaetigt = merk;
    return true;
  }

  // Eine noch im Klartext liegende Notfall-PIN auf Hash umstellen.
  async pinHashen() {
    try {
      const r = this.sql.exec("SELECT pin FROM zugang WHERE eins = 1").toArray();
      const pin = (r.length && r[0].pin) ? r[0].pin : "";
      if (pin && !istHash(pin)) {
        this.sql.exec("UPDATE zugang SET pin = ? WHERE eins = 1", await geheimHashen(pin));
      }
    } catch (_e) { /* die PIN bleibt dann vorerst, wie sie ist */ }
  }

  /* Die Anfrage wird ausdruecklich mitgegeben, nicht im Objekt gemerkt:
     waehrend PBKDF2 rechnet, kann das Objekt schon die naechste Anfrage
     annehmen - eine gemerkte Herkunft waere dann die falsche. */
  async adminPruefen(body, request) {
    const pw = (body && typeof body.password === "string") ? body.password : "";
    if (!pw) return false;
    const wer = await this.herkunftKennung(request);
    const z = this.bremseZeile(wer);
    if (z && z.bis && z.bis > Date.now()) { this.sperrBis.set(request, z.bis); return false; }
    if (await this.passwortStimmt(pw)) {
      if (z) { try { this.sql.exec("DELETE FROM anmeldebremse WHERE herkunft = ?", wer); } catch (_e) {} }
      return true;
    }
    await this.fehlversuch(wer, z, pw, request);
    return false;
  }

  // Das hinterlegte Sicherheitspaket oder null.
  sicherung() {
    try {
      const r = this.sql.exec("SELECT master, fragen, angelegt FROM zugang_sicherung WHERE eins = 1").toArray();
      if (!r.length) return null;
      const fragen = JSON.parse(r[0].fragen || "[]");
      return (r[0].master && Array.isArray(fragen) && fragen.length === 4)
        ? { master: r[0].master, fragen: fragen, angelegt: Number(r[0].angelegt) || 0 }
        : null;
    } catch (_e) { return null; }
  }

  /* Passwort, Master-Key und vier Antworten speichern - alles als Hash.
     Die alte Notfall-PIN wird dabei geloescht: der Master-Key loest sie ab.
     Erst alle Hashes rechnen, dann ohne await schreiben - so landet alles
     zusammen oder gar nicht in der Datenbank. */
  async paketSpeichern(p, nurWennLeer) {
    const fragen = [];
    for (const f of p.fragen) {
      fragen.push({ nr: f.nr, frage: FRAGEN_KATALOG[f.nr], hash: await geheimHashen(f.antwort) });
    }
    const master = await geheimHashen(p.master);
    const pw = await geheimHashen(p.neu);
    // Ersteinrichtung: waehrend gerechnet wurde, koennte eine zweite
    // Anfrage schneller gewesen sein - dann nichts ueberschreiben.
    if (nurWennLeer && this.gesetztesPasswort()) return null;
    const jetzt = Date.now();
    this.sql.exec(
      "INSERT INTO zugang (eins, passwort, pin, geaendert) VALUES (1, ?, '', ?) " +
      "ON CONFLICT(eins) DO UPDATE SET passwort = excluded.passwort, pin = '', geaendert = excluded.geaendert",
      pw, jetzt
    );
    this.sql.exec(
      "INSERT INTO zugang_sicherung (eins, master, fragen, angelegt) VALUES (1, ?, ?, ?) " +
      "ON CONFLICT(eins) DO UPDATE SET master = excluded.master, fragen = excluded.fragen, angelegt = excluded.angelegt",
      master, JSON.stringify(fragen), jetzt
    );
    this.sql.exec("DELETE FROM zugang_frage");
    return { angelegt: jetzt, fragen: fragen.map((f) => f.frage) };
  }

  sperrHinweis(request) {
    const bis = this.sperrBis.get(request) || 0;
    return bis
      ? "Zu viele Fehlversuche – die Anmeldung ist bis " +
        new Date(bis).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }) +
        " Uhr gesperrt."
      : "";
  }

  // Eintrag ins Fehlerbuch mit Lage 200 - kein Fehler, sondern eine Spur.
  // So steht auf /serverstatus schwarz auf weiss, wann jemand am Zugang war.
  spurLegen(weg, text) {
    try {
      this.sql.exec(
        "INSERT INTO fehler (zeit, weg, lage, text) VALUES (?, ?, ?, ?)",
        Date.now(), String(weg).slice(0, 120), 200, String(text).slice(0, 400)
      );
      this.sql.exec("DELETE FROM fehler WHERE nr <= (SELECT MAX(nr) - 200 FROM fehler)");
    } catch (_e) { /* eine fehlende Spur darf nie den Zugang blockieren */ }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;
    const env = this.env;
    // Admin-Pruefung mit Anmeldebremse; die Anfrage bestimmt die Herkunft
    const adminOk = (b) => this.adminPruefen(b, request);

    // --- Zaehler ---
    if (method === "GET" && url.pathname === "/api/stats") {
      const keys = (url.searchParams.get("keys") || "")
        .split(",").map((k) => k.trim()).filter(isValidKey).slice(0, 30);
      const counts = {};
      for (const k of keys) {
        /* "download:gesamt" (08.11.2026, Wunsch Tatorasa): kein eigener Zaehler,
           sondern die Summe aller Download-Zaehler aller Seiten - fuer die Anzeige
           "Downloads gesamt" neben "Besucher gesamt". */
        if (k === "download:gesamt") {
          const r = this.sql.exec(
            "SELECT COALESCE(SUM(value), 0) AS s FROM counter_values WHERE key LIKE 'download:%' AND key <> 'download:gesamt'"
          ).toArray();
          counts[k] = r.length ? Number(r[0].s) : 0;
        } else {
          counts[k] = this.readCount(k);
        }
      }
      return json({ counts });
    }

    if (method === "POST" && url.pathname === "/api/hit") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      const key = body && body.key;
      if (!isValidKey(key)) return json({ error: "invalid_key" }, 400);
      // Die Summe wird berechnet, nicht hochgezaehlt
      if (key === "download:gesamt") return json({ error: "invalid_key" }, 400);
      this.sql.exec(
        "INSERT INTO counter_values (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1",
        key
      );
      return json({ key, value: this.readCount(key) });
    }

    // --- Kommentare ---
    if (url.pathname === "/api/comments" && method === "GET") {
      const rows = this.sql.exec(
        "SELECT id, name, body, created, removed, reason FROM comments ORDER BY created DESC LIMIT ?",
        MAX_KEEP
      ).toArray();
      const antworten = {};
      try {
        for (const a of this.sql.exec("SELECT kommentar, text, zeit FROM antworten").toArray()) {
          antworten[a.kommentar] = { text: a.text, zeit: Number(a.zeit) };
        }
      } catch (_e) { /* ohne Antworten gehen die Kommentare trotzdem raus */ }
      // Zu einem entfernten Kommentar wird auch die Antwort nicht gezeigt.
      const pub = rows.map((r) => (r.removed
        ? { id: r.id, name: r.name, created: Number(r.created), removed: true, removeReason: r.reason }
        : { id: r.id, name: r.name, created: Number(r.created), removed: false, text: r.body,
            antwort: antworten[r.id] || null }));
      return json({ comments: pub });
    }

    if (url.pathname === "/api/comments" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (clean(body.hp, 50)) return json({ ok: true });          // Honeypot -> still ignorieren
      const text = clean(body.text, MAX_TEXT);
      const name = clean(body.name, MAX_NAME);
      if (!text) return json({ error: "empty" }, 400);

      // Bremse gegen Massen-Posts (gehashte IP, nur im Speicher, keine dauerhafte Speicherung).
      const ip = request.headers.get("CF-Connecting-IP") || "";
      if (ip) {
        const h = await sha256hex(ip);
        const now = Date.now();
        if (now - (this.recentPosts.get(h) || 0) < RL_MS) return json({ error: "too_fast" }, 429);
        this.recentPosts.set(h, now);
      }

      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      this.sql.exec(
        "INSERT INTO comments (id, name, body, created, removed, reason) VALUES (?, ?, ?, ?, 0, NULL)",
        id, name || null, text, Date.now()
      );
      // auf MAX_KEEP neueste eindampfen
      this.sql.exec(
        "DELETE FROM comments WHERE id NOT IN (SELECT id FROM comments ORDER BY created DESC LIMIT ?)",
        MAX_KEEP
      );
      // Antworten auf eingedampfte Kommentare mitnehmen
      try { this.sql.exec("DELETE FROM antworten WHERE kommentar NOT IN (SELECT id FROM comments)"); }
      catch (_e) {}
      return json({ ok: true });
    }

    if (url.pathname === "/api/comments/admin" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      return json({ ok: await adminOk(body) });
    }

    /* Neue Kommentare fuer die Admin-Leiste (05.11.2026). Wann zuletzt
       hingesehen wurde, liegt auf dem SERVER (Seite "system", Block "k0") -
       nicht im Browser: so gilt es fuer alle Geraete gleich. */
    if ((url.pathname === "/api/comments/neu" || url.pathname === "/api/comments/gelesen") && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!await adminOk(body)) return json({ error: "unauthorized" }, 401);
      let seit = 0;
      try {
        const r = this.sql.exec("SELECT value FROM content WHERE page = 'system' AND block = 'k0'").toArray();
        seit = r.length ? (Number(r[0].value) || 0) : 0;
      } catch (_e) { seit = 0; }
      if (url.pathname === "/api/comments/neu") {
        const n = this.sql.exec(
          "SELECT COUNT(*) AS n FROM comments WHERE removed = 0 AND created > ?", seit
        ).toArray()[0].n;
        return json({ ok: true, anzahl: Number(n) || 0, seit });
      }
      const jetzt = Date.now();
      this.sql.exec(
        "INSERT INTO content (page, block, type, value, updated) VALUES ('system', 'k0', 'text', ?, ?) " +
        "ON CONFLICT(page, block) DO UPDATE SET value = excluded.value, updated = excluded.updated",
        String(jetzt), jetzt
      );
      // "vorher" braucht die Kommentarseite, um die neuen hervorzuheben
      return json({ ok: true, vorher: seit });
    }

    // Auf einen Kommentar antworten, die Antwort aendern oder (leerer Text) loeschen.
    if (url.pathname === "/api/comments/antwort" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!await adminOk(body)) {
        return json({ error: "unauthorized" }, 401);
      }
      const id = clean(body.id, 60);
      if (!id) return json({ error: "bad_request" }, 400);
      const da = this.sql.exec("SELECT removed FROM comments WHERE id = ?", id).toArray();
      if (!da.length) return json({ error: "not_found" }, 404);
      if (da[0].removed) return json({ error: "removed" }, 409);
      const text = clean(body.text, MAX_TEXT);
      if (!text) {
        this.sql.exec("DELETE FROM antworten WHERE kommentar = ?", id);
        return json({ ok: true, geloescht: true });
      }
      this.sql.exec(
        "INSERT INTO antworten (kommentar, text, zeit) VALUES (?, ?, ?) " +
        "ON CONFLICT(kommentar) DO UPDATE SET text = excluded.text, zeit = excluded.zeit",
        id, text, Date.now()
      );
      return json({ ok: true });
    }

    if (url.pathname === "/api/comments/remove" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!await adminOk(body)) {
        return json({ error: "unauthorized" }, 401);
      }
      const id = clean(body.id, 60);
      const reason = clean(body.reason, MAX_REASON);
      if (!id || !reason) return json({ error: "bad_request" }, 400);
      const exists = this.sql.exec("SELECT id FROM comments WHERE id = ?", id).toArray();
      if (!exists.length) return json({ error: "not_found" }, 404);
      this.sql.exec("UPDATE comments SET removed = 1, reason = ? WHERE id = ?", reason, id);
      return json({ ok: true });
    }

    // --- Inline-Editor: Inhalte ---
    if (url.pathname === "/api/content" && method === "GET") {
      const page = url.searchParams.get("page") || "";
      if (!PAGE_RE.test(page)) return json({ items: [] });
      const rows = this.sql.exec("SELECT block, type, value FROM content WHERE page = ?", page).toArray();
      return json({ items: rows.map((r) => ({ block: r.block, type: r.type, value: r.value })) });
    }

    if (url.pathname === "/api/content" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!await adminOk(body)) return json({ error: "unauthorized" }, 401);
      const page = String(body.page || "");
      const block = String(body.block || "");
      const type = String(body.type || "");
      const ALLOWED_TYPES = ["text", "image", "video", "link"];
      if (!PAGE_RE.test(page) || !BLOCK_RE.test(block) || ALLOWED_TYPES.indexOf(type) === -1) {
        return json({ error: "bad_request" }, 400);
      }
      const value = String(body.value == null ? "" : body.value).slice(0, MAX_CONTENT);

      // Bisherigen Stand aufheben, bevor er ueberschrieben wird.
      // Nur wenn sich wirklich etwas aendert - sonst fuellt jedes Anklicken
      // eines Feldes den Verlauf mit lauter gleichen Eintraegen.
      const VERLAUF_TIEFE = 10;
      const VERLAUF_MAX = 20000;     // sehr grosse Werte (Bilder als Datenurl) auslassen
      try {
        const alt = this.sql.exec(
          "SELECT type, value FROM content WHERE page = ? AND block = ?", page, block
        ).toArray();
        if (alt.length && alt[0].value !== value && alt[0].value.length <= VERLAUF_MAX) {
          this.sql.exec(
            "INSERT INTO verlauf (seite, block, art, wert, zeit) VALUES (?, ?, ?, ?, ?)",
            page, block, alt[0].type, alt[0].value, Date.now()
          );
          // Auf die letzten Staende eindampfen
          this.sql.exec(
            "DELETE FROM verlauf WHERE seite = ? AND block = ? AND nr NOT IN " +
            "(SELECT nr FROM verlauf WHERE seite = ? AND block = ? ORDER BY nr DESC LIMIT ?)",
            page, block, page, block, VERLAUF_TIEFE
          );
        }
      } catch (_e) { /* ein fehlender Verlauf darf das Speichern nie verhindern */ }

      this.sql.exec(
        "INSERT INTO content (page, block, type, value, updated) VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(page, block) DO UPDATE SET type = excluded.type, value = excluded.value, updated = excluded.updated",
        page, block, type, value, Date.now()
      );
      return json({ ok: true });
    }

    // --- Inline-Editor: Bild hochladen + ausliefern ---
    if (url.pathname === "/api/image" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!await adminOk(body)) return json({ error: "unauthorized" }, 401);
      const dataUrl = String(body.dataUrl || "");
      const comma = dataUrl.indexOf(",");
      const b64 = (comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl).replace(/\s+/g, "");
      if (!b64 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return json({ error: "bad_image" }, 400);
      if (b64.length * 0.75 > MAX_IMG_BYTES) return json({ error: "too_large" }, 413);
      let mime = String(body.mime || "image/jpeg");
      if (!/^image\/(png|jpeg|webp|gif)$/.test(mime)) mime = "image/jpeg";
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      this.sql.exec("INSERT INTO images (id, mime, data, created) VALUES (?, ?, ?, ?)", id, mime, b64, Date.now());
      return json({ id, url: "/api/image/" + id });
    }

    /* --- Bilder verzeichnen -------------------------------------------
     * Liefert zu jedem Bild seine Kennung, Groesse und WO es benutzt
     * wird. Die Bilddaten selbst bleiben draussen - die Uebersicht waere
     * sonst viele Megabyte gross; die Vorschau holt jedes Bild einzeln
     * ueber /api/image/<id>.
     * Wo benutzt: der Inhalt wird nach /api/image/<id> durchsucht. Das
     * findet auch Bilder in Sammellisten wie der Galerie, wo sie nicht
     * als eigener Eintrag stehen.
     * ------------------------------------------------------------------ */
    /* --- Download-Links pruefen (nur Admin, 05.11.2026) -----------------
     * Der Browser darf Antworten von GitHub nicht lesen (CORS) - deshalb
     * fragt der Server nach. Hoechstens 8 Adressen je Aufruf: jede
     * Weiterleitung (GitHub -> Speicherdienst) zaehlt als eigene Anfrage,
     * und Cloudflare begrenzt die Zahl der Anfragen je Aufruf.
     * Nur https - der Weg ist kein allgemeiner Abrufdienst.
     * ------------------------------------------------------------------ */
    if (url.pathname === "/api/linkpruefung" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!await adminOk(body)) return json({ error: "unauthorized" }, 401);
      const liste = (Array.isArray(body.adressen) ? body.adressen : []).slice(0, 8);
      const kopf = { "user-agent": "FINNVELO-Linkpruefung/1.0" };
      const ergebnisse = [];
      for (const roh of liste) {
        const adresse = String(roh || "");
        if (!/^https:\/\/\S{4,600}$/.test(adresse)) {
          ergebnisse.push({ adresse, status: 0, ok: false, fehler: "keine gültige Adresse" });
          continue;
        }
        const steuer = new AbortController();
        const uhr = setTimeout(() => steuer.abort(), 12000);
        try {
          let a = await fetch(adresse, { method: "HEAD", redirect: "follow", signal: steuer.signal, headers: kopf });
          if (a.status === 403 || a.status === 405) {
            // Manche Dienste kennen HEAD nicht - dann ein einziges Byte holen
            a = await fetch(adresse, { method: "GET", redirect: "follow", signal: steuer.signal,
                                       headers: Object.assign({ range: "bytes=0-0" }, kopf) });
            try { if (a.body) await a.body.cancel(); } catch (_e) {}
          }
          ergebnisse.push({ adresse, status: a.status, ok: a.status >= 200 && a.status < 400 });
        } catch (_e) {
          ergebnisse.push({ adresse, status: 0, ok: false,
                            fehler: steuer.signal.aborted ? "keine Antwort (Zeitüberschreitung)" : "nicht erreichbar" });
        } finally { clearTimeout(uhr); }
      }
      return json({ ok: true, ergebnisse });
    }

    if (url.pathname === "/api/images" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!await adminOk(body)) return json({ error: "unauthorized" }, 401);

      const bilder = this.sql.exec(
        "SELECT id, mime, LENGTH(data) AS n, created FROM images ORDER BY created DESC"
      ).toArray();
      const inhalte = this.sql.exec("SELECT page, block, value FROM content").toArray();

      const benutzt = {};
      for (const z of inhalte) {
        const wert = String(z.value || "");
        if (wert.indexOf("/api/image/") === -1) continue;
        const treffer = wert.match(/\/api\/image\/([A-Za-z0-9]+)/g) || [];
        for (const t of treffer) {
          const id = t.slice("/api/image/".length);
          if (!benutzt[id]) benutzt[id] = [];
          if (!benutzt[id].some((e) => e.page === z.page && e.block === z.block)) {
            benutzt[id].push({ page: z.page, block: z.block });
          }
        }
      }

      return json({
        bilder: bilder.map((b) => ({
          id: b.id,
          mime: b.mime,
          // LENGTH() zaehlt Base64-Zeichen; die echte Groesse ist drei Viertel davon
          groesse: Math.round(Number(b.n) * 0.75),
          created: b.created,
          benutzt: benutzt[b.id] || []
        }))
      });
    }

    /* --- Altlasten suchen ----------------------------------------------
     * Eine Fassungsangabe (Block u0) ist nur dann erreichbar, wenn eine
     * Adresse auf ihren Schluessel zeigt - entweder aus der festen
     * Routentabelle oder aus den selbst angelegten Routen (system/v0).
     * Zeigt nichts darauf, liest sie kein Programm mehr.
     *
     * Bewusst ENG gefasst: nur u0-Bloecke ohne Route. Texte, Bilder und
     * Einstellungen bleiben aussen vor - bei denen kann ich nicht sicher
     * sagen, dass sie niemand mehr braucht, und dann loesche ich lieber
     * gar nichts.
     * ------------------------------------------------------------------ */
    if (url.pathname === "/api/altlasten" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!await adminOk(body)) return json({ error: "unauthorized" }, 401);

      const erreichbar = {};
      for (const p in VERSION_ABLAGEN) erreichbar[VERSION_ABLAGEN[p]] = p;
      const rows = this.sql.exec(
        "SELECT value FROM content WHERE page = 'system' AND block = 'v0'"
      ).toArray();
      if (rows.length && rows[0].value) {
        try {
          const eigene = JSON.parse(rows[0].value) || {};
          for (const p in eigene) {
            if (typeof eigene[p] === "string") erreichbar[eigene[p]] = p;
            // eine eigene Route zeigt auch auf die PC-Fassung desselben Namens
            if (typeof eigene[p] === "string") erreichbar[eigene[p] + "-pc"] = p + " (PC)";
          }
        } catch (_e) {}
      }

      const u0 = this.sql.exec(
        "SELECT page, value, updated FROM content WHERE block = 'u0' ORDER BY page"
      ).toArray();
      const funde = [];
      for (const z of u0) {
        if (erreichbar[z.page]) continue;
        let name = "", nummer = "";
        try {
          const v = JSON.parse(z.value);
          name = String(v.versionName || v.version || "");
          nummer = String(v.versionCode || v.versionsCode || "");
        } catch (_e) {}
        funde.push({
          page: z.page, block: "u0", updated: z.updated,
          versionName: name, versionCode: nummer,
          grund: "Keine Adresse zeigt auf diesen Schl\u00fcssel",
          vorschau: String(z.value || "").slice(0, 400)
        });
      }
      return json({ altlasten: funde, erreichbar: Object.keys(erreichbar).sort() });
    }

    if (url.pathname === "/api/altlasten/entfernen" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!await adminOk(body)) return json({ error: "unauthorized" }, 401);
      const liste = Array.isArray(body.eintraege) ? body.eintraege : [];
      let weg = 0;
      for (const e of liste) {
        const page = String(e && e.page || "");
        const block = String(e && e.block || "");
        if (!PAGE_RE.test(page) || block !== "u0") continue;
        // Der bisherige Stand bleibt im Verlauf - Zuruecknehmen bleibt moeglich.
        const alt = this.sql.exec(
          "SELECT type, value FROM content WHERE page = ? AND block = ?", page, block
        ).toArray();
        if (!alt.length) continue;
        try {
          this.sql.exec(
            "INSERT INTO verlauf (seite, block, art, wert, zeit) VALUES (?, ?, ?, ?, ?)",
            page, block, alt[0].type, alt[0].value, Date.now()
          );
        } catch (_e) { /* Verlauf ist Beiwerk, kein Grund abzubrechen */ }
        this.sql.exec("DELETE FROM content WHERE page = ? AND block = ?", page, block);
        weg++;
      }
      if (weg) this.spurLegen("/api/altlasten/entfernen", weg + " verwaiste Fassungsangabe(n) entfernt");
      return json({ ok: true, entfernt: weg });
    }

    if (url.pathname === "/api/images/entfernen" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!await adminOk(body)) return json({ error: "unauthorized" }, 401);
      const ids = Array.isArray(body.ids) ? body.ids : [];
      let weg = 0;
      for (const roh of ids) {
        const id = String(roh || "");
        if (!/^[A-Za-z0-9]{1,40}$/.test(id)) continue;
        this.sql.exec("DELETE FROM images WHERE id = ?", id);
        weg++;
      }
      if (weg) this.spurLegen("/api/images/entfernen", weg + " Bild(er) entfernt");
      return json({ ok: true, entfernt: weg });
    }

    if (url.pathname.startsWith("/api/image/") && method === "GET") {
      const id = url.pathname.slice("/api/image/".length);
      const rows = this.sql.exec("SELECT mime, data FROM images WHERE id = ?", id).toArray();
      if (!rows.length) return new Response("Not found", { status: 404 });
      return new Response(b64ToBytes(rows[0].data), {
        status: 200,
        headers: { "content-type": rows[0].mime, "cache-control": "public, max-age=31536000, immutable" }
      });
    }

    // --- Kanal eintragen (nur vom Worker aufgerufen) -------------------
    if (url.pathname === "/api/kanalliste" && method === "POST") {
      let b = {};
      try { b = await request.json(); } catch (_e) { b = {}; }
      const code = String(b.code || "");
      if (b.aktion === "merken" && /^FNV-[A-Z0-9]{4}-[A-Z0-9]{2}$/.test(code)) {
        this.sql.exec(
          "INSERT OR IGNORE INTO kanalliste (code, angelegt) VALUES (?, ?)", code, Date.now()
        );
        return json({ ok: true });
      }
      if (b.aktion === "fehler") {
        this.sql.exec(
          "INSERT INTO fehler (zeit, weg, lage, text) VALUES (?, ?, ?, ?)",
          Date.now(), String(b.weg || "").slice(0, 120), Number(b.lage) || 0,
          String(b.text || "").slice(0, 400)
        );
        // Fehlerbuch kurz halten
        this.sql.exec("DELETE FROM fehler WHERE nr <= (SELECT MAX(nr) - 200 FROM fehler)");
        return json({ ok: true });
      }
      if (b.aktion === "marke" && /^[A-Za-z0-9]{6,40}$/.test(String(b.marke || ""))) {
        this.sql.exec(
          "CREATE TABLE IF NOT EXISTS marken (marke TEXT PRIMARY KEY, code TEXT NOT NULL, erstellt INTEGER)"
        );
        this.sql.exec(
          "INSERT OR REPLACE INTO marken (marke, code, erstellt) VALUES (?, ?, ?)",
          String(b.marke), String(b.code || ""), Date.now()
        );
        return json({ ok: true });
      }
      if (b.aktion === "markeSuchen") {
        try {
          const r = this.sql.exec(
            "SELECT code FROM marken WHERE marke = ?", String(b.marke || "")
          ).toArray();
          return json({ code: r.length ? r[0].code : "" });
        } catch (_e) { return json({ code: "" }); }
      }
      if (b.aktion === "liste") {
        const r = this.sql.exec("SELECT code, angelegt FROM kanalliste ORDER BY angelegt").toArray();
        return json({ kanaele: r });
      }
      return json({ error: "bad_request" }, 400);
    }

    // --- Aufsicht: Kennzahlen der Webseite (nur Admin) ------------------
    if (url.pathname === "/api/aufsicht" && method === "POST") {
      let b = {};
      try { b = await request.json(); } catch (_e) { b = {}; }
      if (!await adminOk(b)) return json({ error: "unauthorized" }, 401);

      // Jede Abfrage einzeln abgesichert: eine fehlende Tabelle darf die
      // ganze Uebersicht nicht kippen.
      const zahl = (q) => { try { return this.sql.exec(q).toArray()[0].n || 0; } catch (_e) { return 0; } };
      const liste = (q) => { try { return this.sql.exec(q).toArray(); } catch (_e) { return []; } };

      const zaehler = liste("SELECT key, value FROM counter_values ORDER BY key");
      const fehler = liste("SELECT zeit, weg, lage, text FROM fehler ORDER BY nr DESC LIMIT 40")
        .map((f) => ({
          zeit: new Date(f.zeit).toISOString(), weg: f.weg, lage: f.lage, text: f.text
        }));
      const kanaele = liste("SELECT code, angelegt FROM kanalliste ORDER BY angelegt");

      /* Wie viel Platz insgesamt zur Verfuegung steht, kann der Server nicht
         selbst ermitteln - das haengt am Tarif. Der Wert wird deshalb von
         Hand gepflegt (in MB, Seite "system", Block "q1") und hier
         mitgeliefert. Vorgabe: 1 GB. */
      let grenzeMB = 1024;
      try {
        const g = this.sql.exec(
          "SELECT value FROM content WHERE page = 'system' AND block = 'q1'"
        ).toArray();
        const n = g.length ? parseInt(g[0].value, 10) : 0;
        if (isFinite(n) && n > 0) grenzeMB = n;
      } catch (_e) { /* Vorgabe bleibt */ }

      return json({
        speicherGrenzeMB: grenzeMB,
        // Was dieses Objekt wirklich belegt - massgeblich fuer das Limit.
        dbBytes: echteGroesse(this.sql),
        inhalte: zahl("SELECT COUNT(*) AS n FROM content"),
        inhalteBytes: zahl("SELECT COALESCE(SUM(LENGTH(value)),0) AS n FROM content"),
        bilder: zahl("SELECT COUNT(*) AS n FROM images"),
        bilderBytes: zahl("SELECT COALESCE(SUM(LENGTH(data)),0) AS n FROM images"),
        kommentare: zahl("SELECT COUNT(*) AS n FROM comments"),
        zaehler: zaehler,
        kanaele: kanaele.map((k) => ({ code: k.code, angelegt: new Date(k.angelegt).toISOString() })),
        fehler: fehler
      });
    }

    // --- Verlauf einer Seite abrufen ------------------------------------
    // Liefert die aufgehobenen Staende, neueste zuerst. Zum Wiederherstellen
    // schickt der Client den alten Wert einfach wieder an /api/content -
    // dafuer braucht es keinen eigenen Schreibweg.
    if (url.pathname === "/api/verlauf" && method === "POST") {
      let b = {};
      try { b = await request.json(); } catch (_e) { b = {}; }
      if (!await adminOk(b)) return json({ fehler: "unauthorized" }, 401);
      const seite = String(b.seite || "");
      if (!PAGE_RE.test(seite)) return json({ fehler: "bad_request" }, 400);
      let zeilen = [];
      try {
        zeilen = this.sql.exec(
          "SELECT nr, block, art, wert, zeit FROM verlauf WHERE seite = ? ORDER BY nr DESC LIMIT 60",
          seite
        ).toArray();
      } catch (_e) { zeilen = []; }
      return json({
        ok: true,
        eintraege: zeilen.map((z) => ({
          nr: z.nr, block: z.block, art: z.art, zeit: new Date(z.zeit).toISOString(),
          // Nur eine Leseprobe herausgeben - der ganze Wert waere unnoetig gross.
          probe: String(z.wert).slice(0, 160),
          laenge: String(z.wert).length
        }))
      });
    }

    // Einen einzelnen Stand im Volltext holen (zum Wiederherstellen)
    if (url.pathname === "/api/verlauf/eintrag" && method === "POST") {
      let b = {};
      try { b = await request.json(); } catch (_e) { b = {}; }
      if (!await adminOk(b)) return json({ fehler: "unauthorized" }, 401);
      const nr = Number(b.nr || 0);
      if (!nr) return json({ fehler: "bad_request" }, 400);
      let r = [];
      try {
        r = this.sql.exec("SELECT seite, block, art, wert FROM verlauf WHERE nr = ?", nr).toArray();
      } catch (_e) { r = []; }
      if (!r.length) return json({ fehler: "Diesen Stand gibt es nicht mehr." }, 404);
      return json({ ok: true, seite: r[0].seite, block: r[0].block, art: r[0].art, wert: r[0].wert });
    }

    // --- Fehlerbuch leeren (nur Admin) ----------------------------------
    // Behobene Fehler sollen nicht ewig stehen bleiben und den Blick auf
    // Neues verstellen. Geloescht wird bis zu einem Zeitpunkt - alles, was
    // waehrend des Klickens hereinkommt, bleibt also erhalten.
    if (url.pathname === "/api/fehler/leeren" && method === "POST") {
      let b = {};
      try { b = await request.json(); } catch (_e) { b = {}; }
      if (!await adminOk(b)) return json({ fehler: "unauthorized" }, 401);
      const bis = Number(b.bis || 0) || Date.now();
      let weg = 0;
      try {
        const vor = this.sql.exec("SELECT COUNT(*) AS n FROM fehler").toArray()[0].n;
        this.sql.exec("DELETE FROM fehler WHERE zeit <= ?", bis);
        const nach = this.sql.exec("SELECT COUNT(*) AS n FROM fehler").toArray()[0].n;
        weg = vor - nach;
      } catch (_e) { return json({ fehler: "Das Fehlerbuch liess sich nicht leeren." }, 500); }
      // Das Leeren selbst als Spur festhalten - sonst sieht man spaeter
      // nicht, warum die Liste plotzlich leer war.
      this.spurLegen("/api/fehler/leeren", weg + " Einträge bereinigt");
      return json({ ok: true, geloescht: weg });
    }

    // --- Kurze Fehlerauskunft fuer die Admin-Leiste ----------------------
    // Absichtlich schlank: /api/serverstatus rechnet die ganze Datenbank durch,
    // das waere fuer einen Hinweis in der Leiste zu teuer.
    if (url.pathname === "/api/fehler/anzahl" && method === "POST") {
      let b = {};
      try { b = await request.json(); } catch (_e) { b = {}; }
      if (!await adminOk(b)) return json({ fehler: "unauthorized" }, 401);
      const seit = Number(b.seit || 0);
      let anzahl = 0, letzter = null;
      try {
        // Lage 200 sind Spuren (z. B. Zugang), keine Fehler - nicht mitzaehlen.
        const r = this.sql.exec(
          "SELECT COUNT(*) AS n, MAX(zeit) AS letzte FROM fehler WHERE lage >= 400 AND zeit > ?",
          seit
        ).toArray();
        if (r.length) {
          anzahl = Number(r[0].n || 0);
          letzter = r[0].letzte ? new Date(Number(r[0].letzte)).toISOString() : null;
        }
      } catch (_e) { /* still bleiben */ }
      return json({ ok: true, anzahl: anzahl, letzter: letzter });
    }

    // --- Passwort aendern und Notfall-PIN ------------------------------
    if (url.pathname === "/api/zugang" && method === "POST") {
      let b = {};
      try { b = await request.json(); } catch (_e) { b = {}; }
      const gesetzt = this.gesetztesPasswort();
      const aktion = String(b.aktion || "");
      const hatSecret = !!env.ADMIN_PASSWORD;
      // Solange weder ein eigenes Passwort noch ein Cloudflare-Secret da ist,
      // ist die Ersteinrichtung offen - sonst kaeme man nie hinein.
      const einrichtungOffen = !gesetzt && !hatSecret;

      // Auskunft ueber die Lage - ohne Passwort abrufbar.
      // Gibt nur Ja/Nein heraus, keine Geheimnisse: die Anmeldeseite muss
      // wissen, ob sie ein Passwort abfragen oder eines vergeben lassen soll.
      if (aktion === "lage") {
        return json({
          eingerichtet: !!gesetzt || hatSecret,
          eigenes: !!gesetzt,
          secret: hatSecret,
          pinDa: (() => {
            try {
              const r = this.sql.exec("SELECT pin FROM zugang WHERE eins = 1").toArray();
              return !!(r.length && r[0].pin);
            } catch (_e) { return false; }
          })(),
          sicherungDa: !!this.sicherung(),
          einrichtungOffen: einrichtungOffen
        });
      }

      // Die dreissig Fragen zur Auswahl - kein Geheimnis.
      if (aktion === "katalog") {
        return json({ fragen: FRAGEN_KATALOG });
      }

      // Gesperrt durch die Anmeldebremse? Gilt fuer alle Wege zum Zuruecksetzen.
      const bremseVorab = async () => {
        const wer = await this.herkunftKennung(request);
        const z = this.bremseZeile(wer);
        if (z && z.bis && z.bis > Date.now()) {
          this.sperrBis.set(request, z.bis);
          return { wer, z, antwort: json({ fehler: this.sperrHinweis(request) }, 429) };
        }
        return { wer, z, antwort: null };
      };
      // Neues Passwort beim Zuruecksetzen: zweimal gleich, mindestens acht Zeichen.
      const neuesPwFehler = () => {
        const neu = String(b.neu || "");
        if (neu.length < 8) return "Das neue Passwort braucht mindestens acht Zeichen.";
        if (neu !== String(b.neu2 || "")) return "Die beiden Passwörter sind verschieden.";
        return "";
      };
      const passwortSetzen = async (wer, z) => {
        const h = await geheimHashen(String(b.neu || ""));
        this.sql.exec(
          "INSERT INTO zugang (eins, passwort, pin, geaendert) VALUES (1, ?, '', ?) " +
          "ON CONFLICT(eins) DO UPDATE SET passwort = excluded.passwort, geaendert = excluded.geaendert",
          h, Date.now()
        );
        try {
          this.sql.exec("DELETE FROM zugang_frage WHERE herkunft = ?", wer);
          if (z) this.sql.exec("DELETE FROM anmeldebremse WHERE herkunft = ?", wer);
        } catch (_e) {}
      };

      // Ersteinrichtung: Passwort, Master-Key und vier Sicherheitsfragen in
      // einem Schritt. Geht nur, solange noch nichts eingerichtet ist -
      // danach ist dieser Weg dauerhaft zu.
      if (aktion === "einrichten") {
        if (!einrichtungOffen) {
          return json({ fehler: "Es ist bereits ein Passwort eingerichtet. " +
                                "Bitte über \"Passwort ändern\" gehen." }, 409);
        }
        const p = paketPruefen(b);
        if (p.fehler) return json({ fehler: p.fehler }, 400);
        const erg = await this.paketSpeichern(p, true);
        if (!erg) return json({ fehler: "Es wurde gerade schon ein Passwort eingerichtet." }, 409);
        this.spurLegen("/api/zugang einrichten", "Zugang erstmals eingerichtet (mit Master-Key und Sicherheitsfragen)");
        return json({ ok: true, angelegt: erg.angelegt, fragen: erg.fragen, hinweis: "Zugang eingerichtet." });
      }

      // Zwei der vier Fragen stellen. Dieselbe Herkunft bekommt 15 Minuten
      // lang dieselben zwei - neu laden wuerfelt nicht neu, sonst koennte man
      // so lange laden, bis zwei bekannte Fragen kommen.
      if (aktion === "fragen") {
        const s = this.sicherung();
        if (!s) return json({ fehler: "Es sind keine Sicherheitsfragen hinterlegt." }, 400);
        const v = await bremseVorab();
        if (v.antwort) return v.antwort;
        const jetzt = Date.now();
        let auswahl = null;
        const r = this.sql.exec("SELECT auswahl, bis FROM zugang_frage WHERE herkunft = ?", v.wer).toArray();
        if (r.length && Number(r[0].bis) > jetzt) {
          try { auswahl = JSON.parse(r[0].auswahl); } catch (_e) { auswahl = null; }
        }
        if (!Array.isArray(auswahl) || auswahl.length !== 2) {
          const plaetze = [0, 1, 2, 3];
          const zufall = new Uint32Array(4);
          crypto.getRandomValues(zufall);
          for (let i = 3; i > 0; i--) {
            const j = zufall[i] % (i + 1);
            const t = plaetze[i]; plaetze[i] = plaetze[j]; plaetze[j] = t;
          }
          auswahl = plaetze.slice(0, 2).sort((x, y) => x - y);
          this.sql.exec(
            "INSERT INTO zugang_frage (herkunft, auswahl, bis) VALUES (?, ?, ?) " +
            "ON CONFLICT(herkunft) DO UPDATE SET auswahl = excluded.auswahl, bis = excluded.bis",
            v.wer, JSON.stringify(auswahl), jetzt + FRAGE_GUELTIG
          );
          try { this.sql.exec("DELETE FROM zugang_frage WHERE bis < ?", jetzt); } catch (_e) {}
        }
        return json({ ok: true, fragen: auswahl.map((p) => s.fragen[p].frage) });
      }

      // Zuruecksetzen mit den zwei gestellten Fragen - beide muessen stimmen.
      if (aktion === "zuruecksetzen-fragen") {
        const s = this.sicherung();
        if (!s) return json({ fehler: "Es sind keine Sicherheitsfragen hinterlegt." }, 400);
        const v = await bremseVorab();
        if (v.antwort) return v.antwort;
        const r = this.sql.exec("SELECT auswahl, bis FROM zugang_frage WHERE herkunft = ?", v.wer).toArray();
        let auswahl = null;
        if (r.length && Number(r[0].bis) > Date.now()) {
          try { auswahl = JSON.parse(r[0].auswahl); } catch (_e) { auswahl = null; }
        }
        if (!Array.isArray(auswahl) || auswahl.length !== 2) {
          return json({ fehler: "Die Fragen sind abgelaufen. Bitte neu laden.", abgelaufen: true }, 409);
        }
        const pf = neuesPwFehler();
        if (pf) return json({ fehler: pf }, 400);
        const antworten = (Array.isArray(b.antworten) ? b.antworten : []).slice(0, 2).map(antwortNorm);
        let richtig = antworten.length === 2;
        for (let i = 0; richtig && i < 2; i++) {
          if (!(await geheimPasst(antworten[i], s.fragen[auswahl[i]].hash))) richtig = false;
        }
        if (!richtig) {
          await this.fehlversuch(v.wer, v.z, "fragen:" + antworten.join("|"), request);
          return json({ fehler: this.sperrHinweis(request) || "Mindestens eine Antwort stimmt nicht." }, 401);
        }
        if (await geheimPasst(String(b.neu || ""), s.master)) {
          return json({ fehler: "Das neue Passwort darf nicht der Master-Key sein." }, 400);
        }
        await passwortSetzen(v.wer, v.z);
        this.spurLegen("/api/zugang zuruecksetzen", "Passwort per Sicherheitsfragen zurückgesetzt");
        return json({ ok: true, hinweis: "Passwort zurückgesetzt." });
      }

      // Zuruecksetzen mit dem Master-Key aus dem Zertifikat.
      if (aktion === "zuruecksetzen-master") {
        const s = this.sicherung();
        if (!s) return json({ fehler: "Es ist kein Master-Key hinterlegt." }, 400);
        const v = await bremseVorab();
        if (v.antwort) return v.antwort;
        const pf = neuesPwFehler();
        if (pf) return json({ fehler: pf }, 400);
        const master = String(b.master || "").trim();
        if (!master || !(await geheimPasst(master, s.master))) {
          await this.fehlversuch(v.wer, v.z, "master:" + master, request);
          return json({ fehler: this.sperrHinweis(request) || "Der Master-Key stimmt nicht." }, 401);
        }
        if (textGleich(String(b.neu || ""), master)) {
          return json({ fehler: "Das neue Passwort darf nicht der Master-Key sein." }, 400);
        }
        await passwortSetzen(v.wer, v.z);
        this.spurLegen("/api/zugang zuruecksetzen", "Passwort per Master-Key zurückgesetzt");
        return json({ ok: true, hinweis: "Passwort zurückgesetzt." });
      }

      // Zuruecksetzen mit der Notfall-PIN - ohne das alte Passwort.
      if (aktion === "zuruecksetzen") {
        const r = this.sql.exec("SELECT pin FROM zugang WHERE eins = 1").toArray();
        const pin = (r.length && r[0].pin) ? r[0].pin : "";
        if (!pin) return json({ fehler: "Es ist keine Notfall-PIN hinterlegt." }, 400);
        // Dieselbe Bremse wie beim Passwort - sonst liesse sich die PIN durchprobieren
        const wer = await this.herkunftKennung(request);
        const z = this.bremseZeile(wer);
        if (z && z.bis && z.bis > Date.now()) {
          this.sperrBis.set(request, z.bis);
          return json({ fehler: this.sperrHinweis(request) }, 429);
        }
        if (!(await geheimPasst(String(b.pin || "").trim(), pin))) {
          await this.fehlversuch(wer, z, "pin:" + String(b.pin || ""), request);
          return json({ fehler: this.sperrHinweis(request) || "Die Notfall-PIN stimmt nicht." }, 401);
        }
        const neuesPw = String(b.neu || "");
        if (neuesPw.length < 8) {
          return json({ fehler: "Das neue Passwort muss mindestens acht Zeichen haben." }, 400);
        }
        if (z) { try { this.sql.exec("DELETE FROM anmeldebremse WHERE herkunft = ?", wer); } catch (_e) {} }
        this.sql.exec(
          "INSERT INTO zugang (eins, passwort, pin, geaendert) VALUES (1, ?, ?, ?) " +
          "ON CONFLICT(eins) DO UPDATE SET passwort = excluded.passwort, pin = excluded.pin, " +
          "geaendert = excluded.geaendert",
          await geheimHashen(neuesPw), istHash(pin) ? pin : await geheimHashen(pin), Date.now()
        );
        this.spurLegen("/api/zugang zuruecksetzen", "Passwort per Notfall-PIN zurückgesetzt");
        return json({ ok: true, hinweis: "Passwort zurückgesetzt." });
      }

      // Alles Weitere braucht das gueltige Passwort.
      if (!(await adminOk(b))) return json({ error: "unauthorized", fehler: this.sperrHinweis(request) || undefined }, 401);

      // Sicherheitspaket anlegen oder erneuern: Passwort, Master-Key und
      // vier Fragen. Die Antworten und der Master-Key verlassen den Server
      // nie wieder - das Zertifikat baut die Seite aus ihren Eingaben.
      if (aktion === "sicherheit") {
        const p = paketPruefen(b);
        if (p.fehler) return json({ fehler: p.fehler }, 400);
        const neu = !this.sicherung();
        const erg = await this.paketSpeichern(p, false);
        this.spurLegen("/api/zugang sicherheit", neu
          ? "Master-Key und Sicherheitsfragen eingerichtet, Notfall-PIN gelöscht"
          : "Master-Key und Sicherheitsfragen erneuert");
        return json({ ok: true, angelegt: erg.angelegt, fragen: erg.fragen });
      }

      // Nur die Notfall-PIN setzen oder wechseln - Passwort bleibt.
      if (aktion === "pin") {
        if (this.sicherung()) {
          return json({ fehler: "Die Notfall-PIN ist durch Master-Key und Sicherheitsfragen ersetzt." }, 409);
        }
        const neuePin = String(b.pin || "").trim();
        if (neuePin.length < 6) {
          return json({ fehler: "Die Notfall-PIN muss mindestens sechs Zeichen haben." }, 400);
        }
        if (textGleich(neuePin, String(b.password || ""))) {
          return json({ fehler: "Notfall-PIN und Passwort müssen verschieden sein." }, 400);
        }
        // Es kann sein, dass es noch gar keine Zeile gibt (Anmeldung ueber das
        // Cloudflare-Secret). Dann das geltende Passwort mit uebernehmen,
        // damit der Zugang nicht ins Leere laeuft.
        const bisher = gesetzt || await geheimHashen(String(b.password || ""));
        this.sql.exec(
          "INSERT INTO zugang (eins, passwort, pin, geaendert) VALUES (1, ?, ?, ?) " +
          "ON CONFLICT(eins) DO UPDATE SET pin = excluded.pin, geaendert = excluded.geaendert",
          bisher, await geheimHashen(neuePin), Date.now()
        );
        this.spurLegen("/api/zugang pin", "Notfall-PIN gesetzt");
        return json({ ok: true, hinweis: "Notfall-PIN gespeichert." });
      }

      if (aktion === "aendern") {
        const neuesPw = String(b.neu || "");
        if (neuesPw.length < 8) {
          return json({ fehler: "Das neue Passwort muss mindestens acht Zeichen haben." }, 400);
        }
        // Mit Sicherheitspaket gibt es keine PIN mehr - nur das Passwort wechseln.
        const s = this.sicherung();
        if (s) {
          if (await geheimPasst(neuesPw, s.master)) {
            return json({ fehler: "Das neue Passwort darf nicht der Master-Key sein." }, 400);
          }
          this.sql.exec(
            "INSERT INTO zugang (eins, passwort, pin, geaendert) VALUES (1, ?, '', ?) " +
            "ON CONFLICT(eins) DO UPDATE SET passwort = excluded.passwort, geaendert = excluded.geaendert",
            await geheimHashen(neuesPw), Date.now()
          );
          this.spurLegen("/api/zugang aendern", "Passwort geändert");
          return json({ ok: true, hinweis: "" });
        }
        const r = this.sql.exec("SELECT pin FROM zugang WHERE eins = 1").toArray();
        let pin = (r.length && r[0].pin) ? r[0].pin : "";
        let neuePin = "";          // nur gefuellt, wenn der Server sie wuerfelt
        const wunschPin = String(b.pin || "").trim();

        if (wunschPin) {
          // Selbst gewaehlte PIN hat Vorrang.
          if (wunschPin.length < 6) {
            return json({ fehler: "Die Notfall-PIN muss mindestens sechs Zeichen haben." }, 400);
          }
          if (textGleich(wunschPin, neuesPw)) {
            return json({ fehler: "Notfall-PIN und Passwort müssen verschieden sein." }, 400);
          }
          pin = wunschPin;
        } else if (!pin || b.pinNeu) {
          // Keine PIN gewuenscht und noch keine da: eine wuerfeln und
          // genau einmal zeigen.
          const ZIFFERN = "0123456789";
          const bytes = new Uint8Array(10); crypto.getRandomValues(bytes);
          neuePin = "";
          for (let i = 0; i < 10; i++) neuePin += ZIFFERN[bytes[i] % 10];
          neuePin = neuePin.slice(0, 4) + "-" + neuePin.slice(4, 7) + "-" + neuePin.slice(7);
          pin = neuePin;
        }
        this.sql.exec(
          "INSERT INTO zugang (eins, passwort, pin, geaendert) VALUES (1, ?, ?, ?) " +
          "ON CONFLICT(eins) DO UPDATE SET passwort = excluded.passwort, " +
          "pin = excluded.pin, geaendert = excluded.geaendert",
          await geheimHashen(neuesPw), (!pin || istHash(pin)) ? pin : await geheimHashen(pin), Date.now()
        );
        this.spurLegen("/api/zugang aendern", "Passwort geändert");
        // Eine gewuerfelte PIN wird genau einmal herausgegeben - danach nie wieder.
        return json({ ok: true, pin: neuePin || undefined,
                      hinweis: neuePin ? "Notfall-PIN notieren - sie wird nur dieses eine Mal gezeigt." : "" });
      }

      if (aktion === "zustand") {
        const r = this.sql.exec("SELECT passwort, pin, geaendert FROM zugang WHERE eins = 1").toArray();
        const s = this.sicherung();
        return json({
          eigenes: !!(r.length && r[0].passwort),
          pinDa: !!(r.length && r[0].pin),
          geaendert: (r.length && r[0].geaendert) ? new Date(r[0].geaendert).toISOString() : null,
          sicherungDa: !!s,
          sicherungAngelegt: s && s.angelegt ? new Date(s.angelegt).toISOString() : null,
          sicherungFragen: s ? s.fragen.map((f) => f.frage) : []
        });
      }
      return json({ error: "bad_request" }, 400);
    }

    // --- Bilder: Uebersicht und Entfernen (nur Admin) ------------------
    // --- Sicherung: alle Inhalte ausgeben (nur Admin) ------------------
    // Liefert saemtliche gespeicherten Inhalte als eine Datei. Damit laesst
    // sich alles, was ueber den Bearbeiten-Modus eingetragen wurde, sichern.
    if (url.pathname === "/api/export" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!await adminOk(body)) return json({ error: "unauthorized" }, 401);
      const rows = this.sql.exec(
        "SELECT page, block, type, value, updated FROM content ORDER BY page, block"
      ).toArray();
      /* Bilder liegen in einer EIGENEN Tabelle, nicht im Inhalt. Wer sie
         weglaesst, hat nach dem Zurueckspielen zwar alle Texte, aber nur
         noch tote Bildverweise. Deshalb gehoeren sie dazu.
         Sie koennen gross sein - wer nur die Texte will, schickt
         {bilder:false}. */
      let bilder = [];
      if (body.bilder !== false) {
        bilder = this.sql.exec("SELECT id, mime, data, created FROM images ORDER BY created").toArray();
      }

      /* Vollsicherung: alle uebrigen Tabellen dieses Objekts. Vorher
         enthielt eine Sicherung nur Texte und Bilder - Kommentare,
         Zaehlerstaende, Verlauf und Zugang waeren im Ernstfall verloren
         gewesen.
         "bremse" und "fehler" bleiben draussen: Sperrzeiten und
         Fehlermeldungen sind nach dem Zurueckspielen wertlos.       */
      const tabellen = {};
      const mit = ["counter_values", "comments", "antworten", "apps", "kanalliste", "verlauf", "marken", "zugang", "zugang_sicherung"];
      for (const t of mit) {
        try { tabellen[t] = this.sql.exec("SELECT * FROM " + t).toArray(); }
        catch (_e) { tabellen[t] = []; }
      }

      /* Kanaele liegen in EIGENEN Objekten - der Zaehler kann sie nicht
         direkt lesen, aber ueber die Bindung fragen. Jeder Kanal liefert
         seine Tabellen selbst. Ohne das waeren Chat und Listen weg. */
      const kanaele = [];
      if (body.kanaele !== false && env && env.KANAELE) {
        const liste = tabellen.kanalliste || [];
        for (const k of liste) {
          const code = String(k && k.code || "");
          if (!code) continue;
          try {
            const stub = env.KANAELE.get(env.KANAELE.idFromName(code));
            const a = await stub.fetch("https://kanal/kanal-sicherung");
            if (!a.ok) { kanaele.push({ code: code, fehler: "nicht erreichbar" }); continue; }
            const erg = await a.json();
            kanaele.push({ code: code, angelegt: k.angelegt, tabellen: (erg && erg.tabellen) || {} });
          } catch (_e) {
            kanaele.push({ code: code, fehler: "nicht erreichbar" });
          }
        }
      }

      let zeilen = 0;
      for (const t in tabellen) zeilen += tabellen[t].length;

      return new Response(JSON.stringify({
        art: "finnvelo-sicherung",
        fassung: 3,
        erstellt: new Date().toISOString(),
        anzahl: rows.length,
        anzahlBilder: bilder.length,
        anzahlTabellenzeilen: zeilen,
        anzahlKanaele: kanaele.length,
        inhalte: rows,
        bilder: bilder,
        tabellen: tabellen,
        kanaele: kanaele
      }, null, 2), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }

    // --- Sicherung einspielen (nur Admin) ------------------------------
    if (url.pathname === "/api/import" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!await adminOk(body)) return json({ error: "unauthorized" }, 401);
      const daten = body.daten;
      if (!daten || daten.art !== "finnvelo-sicherung" || !Array.isArray(daten.inhalte)) {
        return json({ error: "keine_sicherung" }, 400);
      }
      const ALLOWED_TYPES = ["text", "image", "video", "link"];
      let uebernommen = 0, uebersprungen = 0;
      for (const z of daten.inhalte) {
        const page = String(z && z.page || "");
        const block = String(z && z.block || "");
        const type = String(z && z.type || "");
        if (!PAGE_RE.test(page) || !BLOCK_RE.test(block) || ALLOWED_TYPES.indexOf(type) === -1) {
          uebersprungen++; continue;
        }
        const value = String(z.value == null ? "" : z.value).slice(0, MAX_CONTENT);
        this.sql.exec(
          "INSERT INTO content (page, block, type, value, updated) VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(page, block) DO UPDATE SET type = excluded.type, value = excluded.value, updated = excluded.updated",
          page, block, type, value, Date.now()
        );
        uebernommen++;
      }
      /* Bilder zurueckspielen (Sicherungen ab Fassung 2). Vorhandene
         bleiben, wie sie sind - eine Kennung wird nie neu vergeben, also
         ist gleiche Kennung auch gleiches Bild. */
      let bilder = 0;
      if (Array.isArray(daten.bilder)) {
        for (const b of daten.bilder) {
          const id = String(b && b.id || "");
          const mime = String(b && b.mime || "");
          const dat = String(b && b.data || "").replace(/\s+/g, "");
          if (!id || !/^[a-z0-9]{1,40}$/i.test(id)) continue;
          if (!/^image\/(png|jpeg|webp|gif)$/.test(mime)) continue;
          if (!dat || !/^[A-Za-z0-9+/=]+$/.test(dat)) continue;
          if (dat.length * 0.75 > MAX_IMG_BYTES) continue;
          const da = this.sql.exec("SELECT id FROM images WHERE id = ?", id).toArray();
          if (da.length) continue;
          this.sql.exec("INSERT INTO images (id, mime, data, created) VALUES (?, ?, ?, ?)",
                        id, mime, dat, Number(b.created) || Date.now());
          bilder++;
        }
      }
      /* Uebrige Tabellen zurueckspielen (Sicherungen ab Fassung 3).
         INSERT OR REPLACE: was in der Sicherung steht, gewinnt; was
         seither dazukam, bleibt stehen. */
      let zeilen = 0;
      const erlaubt = ["counter_values", "comments", "antworten", "apps", "kanalliste", "verlauf", "marken"];
      const tab = (daten && daten.tabellen) || {};
      for (const name of erlaubt) {
        const liste = Array.isArray(tab[name]) ? tab[name] : [];
        for (const z of liste) {
          if (!z || typeof z !== "object") continue;
          const spalten = Object.keys(z).filter((c) => /^[a-z_0-9]{1,30}$/.test(c));
          if (!spalten.length) continue;
          try {
            this.sql.exec(
              "INSERT OR REPLACE INTO " + name + " (" + spalten.join(", ") + ") VALUES (" +
              spalten.map(() => "?").join(", ") + ")",
              ...spalten.map((c) => z[c])
            );
            zeilen++;
          } catch (_e) { /* Spalte kennt diese Fassung nicht - weiter */ }
        }
      }

      /* Zugang: NUR wenn noch keiner eingerichtet ist. Ein altes Passwort
         ueber ein neueres zu schreiben wuerde aussperren, wer es seither
         geaendert hat. Auf einer leeren Datenbank ist es genau das, was
         den Wiederanlauf moeglich macht. */
      let zugang = "unberuehrt";
      const zTeil = Array.isArray(tab.zugang) ? tab.zugang[0] : null;
      if (zTeil && zTeil.passwort && !this.gesetztesPasswort()) {
        try {
          this.sql.exec(
            "INSERT INTO zugang (eins, passwort, pin, geaendert) VALUES (1, ?, ?, ?) " +
            "ON CONFLICT(eins) DO UPDATE SET passwort = excluded.passwort, " +
            "pin = excluded.pin, geaendert = excluded.geaendert",
            String(zTeil.passwort), String(zTeil.pin || ""), Number(zTeil.geaendert) || Date.now()
          );
          zugang = "aus der Sicherung gesetzt";
        } catch (_e) { zugang = "fehlgeschlagen"; }
        // Master-Key und Fragen gehoeren zu diesem Zugang - nur zusammen mit
        // ihm und nur, wenn hier noch keine hinterlegt sind.
        const sTeil = Array.isArray(tab.zugang_sicherung) ? tab.zugang_sicherung[0] : null;
        if (zugang === "aus der Sicherung gesetzt" && sTeil && sTeil.master && sTeil.fragen && !this.sicherung()) {
          try {
            this.sql.exec(
              "INSERT INTO zugang_sicherung (eins, master, fragen, angelegt) VALUES (1, ?, ?, ?)",
              String(sTeil.master), String(sTeil.fragen), Number(sTeil.angelegt) || Date.now()
            );
            zugang += ", mit Master-Key und Sicherheitsfragen";
          } catch (_e) { /* Zugang steht trotzdem */ }
        }
      }

      /* Kanaele: jeder in sein eigenes Objekt zurueck. */
      let kanaele = 0, kanalZeilen = 0;
      if (Array.isArray(daten.kanaele) && env && env.KANAELE) {
        for (const k of daten.kanaele) {
          const code = String(k && k.code || "");
          if (!code || !k.tabellen) continue;
          try {
            const stub = env.KANAELE.get(env.KANAELE.idFromName(code));
            const a = await stub.fetch("https://kanal/kanal-einspielen", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ tabellen: k.tabellen })
            });
            if (a.ok) {
              const erg = await a.json();
              kanaele++; kanalZeilen += Number(erg && erg.zeilen) || 0;
            }
          } catch (_e) { /* Kanal nicht erreichbar - weiter */ }
        }
      }

      return json({ ok: true, uebernommen: uebernommen, uebersprungen: uebersprungen,
                    bilder: bilder, zeilen: zeilen, zugang: zugang,
                    kanaele: kanaele, kanalZeilen: kanalZeilen });
    }

    // --- Verzeichnis der Update-Adressen (oeffentlich) -----------------
    // Ablage: page "system", block "v0" -> { "/pfad/version.json": "ablage" }
    if (url.pathname === "/api/versionsrouten" && method === "GET") {
      const rows = this.sql.exec(
        "SELECT value FROM content WHERE page = 'system' AND block = 'v0'"
      ).toArray();
      let routen = {};
      if (rows.length && rows[0].value) {
        try { const o = JSON.parse(rows[0].value); if (o && typeof o === "object") routen = o; } catch (_e) {}
      }
      return new Response(JSON.stringify({ routen: routen }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      });
    }

    // --- Eigene Programme: Liste lesen (oeffentlich) -------------------
    // Ablage: page "system", block "p0" -> JSON-Liste
    //   [{ slug, name, kurz, stich, bild }]
    if (url.pathname === "/api/programme" && method === "GET") {
      const rows = this.sql.exec(
        "SELECT value FROM content WHERE page = 'system' AND block = 'p0'"
      ).toArray();
      let liste = [];
      if (rows.length && rows[0].value) {
        try { const a = JSON.parse(rows[0].value); if (Array.isArray(a)) liste = a; } catch (_e) {}
      }
      return new Response(JSON.stringify({ programme: liste }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      });
    }

    /* --- Angelegte Seite als Datei herausgeben ------------------------
     * Der Worker kann zur Laufzeit NICHT ins Deployment schreiben - die
     * statischen Dateien liegen unveraenderlich im Paket. Was er kann:
     * die fertige Seite bauen und zum Herunterladen anbieten. Wer sie in
     * den Projektordner legt und veroeffentlicht, hat sie danach als
     * echte Datei - unabhaengig von der Datenbank.
     * ------------------------------------------------------------------ */
    if (url.pathname === "/api/programme/datei" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!await adminOk(body)) return json({ error: "unauthorized" }, 401);
      const slug = String(body.slug || "");
      if (!PAGE_RE.test(slug)) return json({ error: "bad_slug" }, 400);

      const rows = this.sql.exec(
        "SELECT value FROM content WHERE page = 'system' AND block = 'p0'"
      ).toArray();
      let liste = [];
      if (rows.length && rows[0].value) {
        try { const a = JSON.parse(rows[0].value); if (Array.isArray(a)) liste = a; } catch (_e) {}
      }
      const p = liste.filter((x) => x && x.slug === slug)[0];
      if (!p) return json({ error: "unbekannt" }, 404);

      // Genau derselbe Bauplan wie beim Ausliefern - keine zweite Fassung,
      // die auseinanderlaufen koennte.
      const html = (p.art === "info") ? infoSeite(p) : programmSeite(p);

      return new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-disposition": 'attachment; filename="' + slug + '.html"',
          "cache-control": "no-store"
        }
      });
    }

    // --- Eigene Programme: anlegen / entfernen (nur Admin) -------------
    if (url.pathname === "/api/programme" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      if (!await adminOk(body)) return json({ error: "unauthorized" }, 401);

      const rows = this.sql.exec(
        "SELECT value FROM content WHERE page = 'system' AND block = 'p0'"
      ).toArray();
      let liste = [];
      if (rows.length && rows[0].value) {
        try { const a = JSON.parse(rows[0].value); if (Array.isArray(a)) liste = a; } catch (_e) {}
      }

      const aktion = String(body.aktion || "");
      const slug = String(body.slug || "").toLowerCase().trim();

      if (aktion === "anlegen") {
        if (!PAGE_RE.test(slug)) return json({ error: "bad_slug" }, 400);
        if (RESERVIERT.indexOf(slug) !== -1) return json({ error: "slug_belegt" }, 409);
        if (liste.some((p) => p.slug === slug)) return json({ error: "slug_belegt" }, 409);
        if (liste.length >= 40) return json({ error: "zu_viele" }, 400);
        const art = (body.art === "info") ? "info" : "programm";
        liste.push({
          slug: slug,
          art: art,
          name: clean(body.name, 80) || slug,
          kurz: clean(body.kurz, 220) || (art === "info"
            ? "Kurzbeschreibung - im Bearbeiten-Modus aenderbar."
            : "Kurzbeschreibung - im Bearbeiten-Modus aenderbar."),
          stich: clean(body.stich, 80) || (art === "info" ? "Finnvelo Programmwelten" : "Finnvelo Programm"),
          bild: ""
        });
      } else if (aktion === "entfernen") {
        liste = liste.filter((p) => p.slug !== slug);
      } else if (aktion === "umbenennen") {
        // Adresse und/oder Name aendern. Beim Adresswechsel ziehen alle
        // eingetragenen Inhalte mit um - sonst waeren sie verloren.
        const neuSlug = String(body.slugNeu || "").toLowerCase().trim();
        const eintrag = liste.filter((p) => p.slug === slug)[0];
        if (!eintrag) return json({ error: "unbekannt" }, 404);
        if (neuSlug && neuSlug !== slug) {
          if (!PAGE_RE.test(neuSlug)) return json({ error: "bad_slug" }, 400);
          if (RESERVIERT.indexOf(neuSlug) !== -1) return json({ error: "slug_belegt" }, 409);
          if (liste.some((p) => p.slug === neuSlug)) return json({ error: "slug_belegt" }, 409);
          // Inhalte umhaengen (nur wenn am Ziel nichts liegt)
          const vorhanden = this.sql.exec(
            "SELECT COUNT(*) AS n FROM content WHERE page = ?", neuSlug
          ).toArray()[0].n;
          if (!vorhanden) {
            this.sql.exec("UPDATE content SET page = ? WHERE page = ?", neuSlug, slug);
          }
          // Update-Adresse mitziehen
          const vr = this.sql.exec(
            "SELECT value FROM content WHERE page = 'system' AND block = 'v0'"
          ).toArray();
          if (vr.length && vr[0].value) {
            try {
              const routen = JSON.parse(vr[0].value) || {};
              let geaendert = false;
              for (const pf in routen) {
                if (routen[pf] === slug) { routen[pf] = neuSlug; geaendert = true; }
              }
              if (geaendert) {
                this.sql.exec(
                  "UPDATE content SET value = ?, updated = ? WHERE page = 'system' AND block = 'v0'",
                  JSON.stringify(routen), Date.now()
                );
              }
            } catch (_e) {}
          }
          eintrag.slug = neuSlug;
        }
        if (body.name) eintrag.name = clean(body.name, 80);
        if (body.kurz) eintrag.kurz = clean(body.kurz, 220);
      } else {
        return json({ error: "bad_request" }, 400);
      }

      this.sql.exec(
        "INSERT INTO content (page, block, type, value, updated) VALUES ('system', 'p0', 'text', ?, ?) " +
        "ON CONFLICT(page, block) DO UPDATE SET value = excluded.value, updated = excluded.updated",
        JSON.stringify(liste), Date.now()
      );
      return json({ ok: true, programme: liste });
    }

    // --- App-Aktualisierung: version.json fuer die Android-Apps ---
    // Wird im Bearbeiten-Modus gepflegt und liegt in der normalen Inhalts-
    // ablage (Seite = App-Name, Block "u0"). Die Apps fragen ihre Datei ab,
    // um zu erkennen, ob eine neuere Fassung bereitsteht.
    if (url.pathname === "/api/version" && method === "GET") {
      const app = url.searchParams.get("app") || "";
      if (!PAGE_RE.test(app)) return new Response("Not found", { status: 404 });
      const rows = this.sql.exec(
        "SELECT value FROM content WHERE page = ? AND block = 'u0'", app
      ).toArray();
      // Noch nichts hinterlegt: gueltige Antwort mit versionCode 0, damit die
      // App "kein Update" meldet statt einen Fehler zu zeigen. Jede App hat ihr
      // eigenes Feldformat.
      /* Noch nichts hinterlegt: gueltige Antwort mit versionCode 0. Der
         "schluessel" schuetzt davor, dass eine App versehentlich die Datei
         einer anderen liest - ein FALSCHER Schluessel wird abgelehnt, ein
         fehlender geduldet. */
      const leer = {
        aufgabenplaner: { schluessel: "FINNVELO-AUFGABENPLANER", versionCode: 0, versionName: "", apk: "", hinweise: "" },
        einkaufsliste: { schluessel: "FINNVELO-EINKAUFSPLANER", versionCode: 0, versionName: "", apk: "", hinweise: "" },
        klarschiff: { schluessel: "FINNVELO-KLARSCHIFF", versionCode: 0, versionName: "", apk: "", hinweise: "" },
        "aufgabenplaner-pc": { schluessel: "FINNVELO-AUFGABENPLANER-PC", versionCode: 0, versionName: "", apk: "", hinweise: "" },
        "einkaufsliste-pc": { schluessel: "FINNVELO-EINKAUFSPLANER-PC", versionCode: 0, versionName: "", apk: "", hinweise: "" },
        "mischwald-pc": { schluessel: "FINNVELO-MISCHWALD-PC", versionCode: 0, versionName: "", apk: "", hinweise: "" },
        "lesezeit-pc": { schluessel: "FINNVELO-LESEZEIT-PC", versionCode: 0, versionName: "", apk: "", hinweise: "" },
        "tourenplaner-android": { schluessel: "FINNVELO-TOURENPLANER-ANDROID", versionCode: 0, versionName: "", apk: "", hinweise: "" },
        "tourenplaner-pc": { schluessel: "FINNVELO-TOURENPLANER-PC", versionCode: 0, versionName: "", apk: "", hinweise: "" },
        /* Vorbelegt mit der gelieferten Fassung, damit die App sofort etwas
           Sinnvolles bekommt - auch bevor jemand die Kachel angefasst hat.
           Stand 07.11.2026: 1.3 (Code 26004). Vorher stand hier eine 1.5.0, die
           es nie gab (Code 10500 - kleiner als jede ausgelieferte Fassung). */
        lesezeit: { programm: "FINNVELO-LESEZEIT", version: "1.3.0", versionsCode: 26004, versionCode: 26004,
                    adresse: "https://finnveloprogramme.com/lesezeit/",
                    apk: "https://github.com/finnveloprogrammwelten-crypto/finnvelo-programmwelten/releases/download/Lesezeit/FINNVELO-Lesezeit-1.3.apk",
                    datei: "FINNVELO-Lesezeit-1.3.apk",
                    /* Paketname bleibt bewusst "lesetagebuch": Android erkennt eine App
                       an ihm. Wuerde er wechseln, gaebe es kein Update mehr, sondern
                       eine zweite App daneben - mit leeren Daten. Nur der ANZEIGENAME
                       heisst jetzt Lesezeit. */
                    paket: "de.finnvelo.lesetagebuch" },
        /* Lorcana / TCG Sammelmappe: vorbelegt mit der jeweils zuletzt hochgeladenen Fassung (Stand
           13.11.2026: PC 1.3.11, App 1.2.14). Ein in der Kachel "Aktualisierung"
           gespeicherter Eintrag hat Vorrang. */
        "lorcana-pc": { schluessel: "FINNVELO-LORCANA-PC", versionCode: 10311, versionName: "1.3.11",
                        apk: "https://github.com/finnveloprogrammwelten-crypto/finnvelo-programmwelten/releases/download/FinnveloLorcana/FINNVELO-TCG-Sammelmappe-Einrichtung-1.3.11.exe",
                        hinweise: "Karte antippen zeigt sie groß mit allen Angaben. Kartenbilder am Handy deutlich schneller, fehlende Pokémon-Bilder aus einer zweiten Quelle. Kamera: Bildaufbereitung bei dunklem Licht und alten Kameras. Coconut mit allen 24 Karten, neue Sets kommen automatisch zu Core und Infinity. Deck-Generator versteht Madam Mim (zurück auf die Hand, neu ausspielen). Zähler mit Hintergrundbild je Spieler und größeren Knöpfen." },
        "lorcana-android": { schluessel: "FINNVELO-LORCANA-ANDROID", versionCode: 10214, versionName: "1.2.14",
                             apk: "https://github.com/finnveloprogrammwelten-crypto/finnvelo-programmwelten/releases/download/FinnveloLorcana/FINNVELO-TCG-Sammelmappe-1.2.14.apk",
                             hinweise: "Karte antippen zeigt sie groß mit allen Angaben. Kartenbilder am Handy deutlich schneller, fehlende Pokémon-Bilder aus einer zweiten Quelle. Kamera: Bildaufbereitung bei dunklem Licht und alten Kameras. Coconut mit allen 24 Karten, neue Sets kommen automatisch zu Core und Infinity. Deck-Generator versteht Madam Mim (zurück auf die Hand, neu ausspielen). Zähler mit Hintergrundbild je Spieler und größeren Knöpfen." },
        /* Haus- und Gartenplaner: vorbelegt mit Fassung 1.0.1 (Felder wie im Planer: version, url, notes).
           Ein in der Kachel "Aktualisierung" gespeicherter Eintrag hat Vorrang. */
        "haus-und-gartenplaner": { programm: "FINNVELO-HAUS-UND-GARTENPLANER", version: "1.0.1", versionName: "1.0.1",
            url: "https://github.com/finnveloprogrammwelten-crypto/finnvelo-programmwelten/releases/download/Finnvelo-Haus-und-Gartenplaner/FINNVELO-Haus-und-Gartenplaner-1.0.1.html",
            notes: "Dach und Möbel in der Gesamtansicht an der richtigen Stelle, Kamera zeigt das ganze Haus, lesbare Eingabefelder in schmalen Fenstern." },
      };
      const standard = leer[app] || { versionCode: 0, versionName: "", version: "", download: "", hinweis: "" };
      const inhalt = rows.length && rows[0].value ? rows[0].value : JSON.stringify(standard);
      return new Response(inhalt, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store, no-cache, must-revalidate",
          "access-control-allow-origin": "*"
        }
      });
    }

    // --- Inline-Editor: Login-Pruefung (nur Ja/Nein) ---
    // Frueher stand hier eine Sperre auf das Cloudflare-Secret. Die hat auch
    // dann ausgesperrt, wenn laengst ein eigenes Passwort gesetzt war -
    // und ohne Anmeldung liess sich keines setzen. Jetzt entscheidet allein
    // checkAdmin; ist gar nichts eingerichtet, sagt die Antwort das.
    if (url.pathname === "/api/admin/login" && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_e) { body = {}; }
      const gesetzt = this.gesetztesPasswort();
      if (!gesetzt && !env.ADMIN_PASSWORD) {
        return json({ ok: false, einrichtungOffen: true });
      }
      const ok = await adminOk(body);
      if (ok) return json({ ok: true });
      const hinweis = this.sperrHinweis(request);
      return json(hinweis ? { ok: false, gesperrt: true, fehler: hinweis } : { ok: false });
    }

    return json({ error: "not_found" }, 404);
  }
}

// --- Web-Apps: Oeffnungen mitzaehlen -----------------------------------
// Wird serverseitig gezaehlt, damit es auch zaehlt, wenn jemand die App
// direkt aufruft (z.B. ueber einen Link oder aus der Google-Suche).
// --- Eigene Programme: Seite, Kachel und Listenzeile erzeugen ----------
// Diese Seiten stehen NICHT als Datei auf dem Server - sie werden hier aus
// der Liste erzeugt. Alle Texte/Bilder darin sind danach ganz normal im
// Bearbeiten-Modus aenderbar (sie werden unter page = <slug> gespeichert).

function esc(t) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Kopfzeile fuer selbst angelegte Programmseiten.
   Das Ausklappmenue "Web-Apps" stand hier bis zum 07.09.2026 mit zwei
   fest eingebauten Eintraegen: /planer/haus-und-gartenplaner/ und
   /mischwald. Beide Web-Fassungen wurden am 13.08.2026 entfernt, die
   Links blieben stehen und liefen ins Leere.
   Nebeneffekt des Ausbaus: Diese Kopfzeile hatte einen Nav-Eintrag mehr
   als die der festen HTML-Seiten (den Knopf "Web-Apps"). Da die
   n-Schluessel in Dokumentreihenfolge vergeben werden, sassen
   "Kommentare" und "Kontakt" auf generierten Seiten um eins verschoben.
   Jetzt stimmen beide Kopfzeilen ueberein. */
const KOPFZEILE = `  <header class="site-header">
    <a class="brand" href="/" aria-label="Finnvelo Programmwelten Startseite">
      <img class="brand-logo" src="/assets/images/finnvelo-plakette.webp" alt="Finnvelo Plakette">
      <span class="brand-text"><strong>Finnvelo</strong><small>Programmwelten</small></span>
    </a>
    <nav aria-label="Hauptnavigation">
      <a href="/">Start</a>
      <a href="/programme">Programme</a>
      <a href="/kommentare">Kommentare</a>
      <a href="/kontakt">Kontakt</a>
    </nav>
  </header>`;

const FUSSZEILE = `  <footer>
    <span>&copy; 2026 Finnvelo Programmwelten</span>
    <a href="/impressum">Impressum</a>
    <a href="/datenschutz">Datenschutz</a>
  </footer>`;

function programmSeite(p) {
  const name = esc(p.name), kurz = esc(p.kurz), stich = esc(p.stich || "Finnvelo Programm");
  const bild = p.bild ? esc(p.bild) : "/assets/images/programmwelten-label.webp";
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${kurz}">
  <title>${name} &middot; Finnvelo Programmwelten</title>
  <link rel="canonical" href="https://finnveloprogramme.com/${esc(p.slug)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Finnvelo Programmwelten">
  <meta property="og:locale" content="de_DE">
  <meta property="og:title" content="${name} &middot; Finnvelo Programmwelten">
  <meta property="og:description" content="${kurz}">
  <meta property="og:url" content="https://finnveloprogramme.com/${esc(p.slug)}">
  <meta property="og:image" content="https://finnveloprogramme.com/assets/images/programmwelten-cover.jpg">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" href="/assets/images/favicon.png">
  <link rel="apple-touch-icon" href="/assets/images/apple-touch-icon.png">
  <link rel="stylesheet" href="/styles.css">
  <script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "${name}",
  "url": "https://finnveloprogramme.com/${esc(p.slug)}",
  "applicationCategory": "UtilitiesApplication",
  "operatingSystem": "Windows, Android, Browser",
  "inLanguage": "de-DE",
  "description": "${kurz}",
  "isAccessibleForFree": true,
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "EUR" },
  "author": { "@type": "Person", "name": "Tatorasa" }
}
  </script>
  <script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {"@type":"ListItem","position":1,"name":"Start","item":"https://finnveloprogramme.com/"},
    {"@type":"ListItem","position":2,"name":"Programme","item":"https://finnveloprogramme.com/programme"},
    {"@type":"ListItem","position":3,"name":"${name}","item":"https://finnveloprogramme.com/${esc(p.slug)}"}
  ]
}
  </script>
</head>
<body>
${KOPFZEILE}
  <main class="main-canvas program-detail-page">
    <article class="program-detail" aria-labelledby="program-title">
      <div class="program-detail__top">
        <div class="program-detail__label">
          <img src="${bild}" alt="${name}">
        </div>
        <div class="program-detail__summary">
          <p class="section-kicker">${stich}</p>
          <h1 id="program-title">${name}</h1>
          <span class="status">In Entwicklung</span>
          <p class="lead">${kurz}</p>
        </div>
      </div>

      <section class="program-launch" aria-labelledby="launch-title">
        <div class="program-launch__text">
          <p class="section-kicker">Direkt im Browser</p>
          <h2 id="launch-title">Sofort starten</h2>
          <p>L&auml;uft direkt hier auf der Webseite &ndash; ohne Installation.</p>
        </div>
        <div class="program-launch__action">
          <a class="button program-launch__btn" href="/programme">Jetzt &ouml;ffnen</a>
          <span class="program-launch__note">L&auml;uft im Browser &ndash; keine Installation n&ouml;tig</span>
        </div>
      </section>

      <div class="program-detail__body program-detail__body--archivar">
        <section class="program-info-block program-info-block--wide" aria-labelledby="description-title">
          <h2 id="description-title">Beschreibung</h2>
          <p>Hier steht die ausf&uuml;hrliche Beschreibung. Im Bearbeiten-Modus anklicken und &auml;ndern.</p>
        </section>

        <section class="program-info-block program-info-block--wide" aria-labelledby="surface-title" data-fv-gallery-section>
          <h2 id="surface-title">Oberfl&auml;che</h2>
          <p>Bildschirmfotos werden hier erg&auml;nzt.</p>
          <div class="fv-gallery" data-fv-gallery></div>
        </section>

        <section class="program-info-block program-info-block--wide" aria-labelledby="tutorial-title">
          <h2 id="tutorial-title">Tutorial-Video</h2>
          <p>Ein Video kann hier sp&auml;ter erg&auml;nzt werden.</p>
        </section>

        <section class="program-info-block" aria-labelledby="advantages-title">
          <h2 id="advantages-title">Besondere Vorteile</h2>
          <ul class="feature-list">
            <li>Vorteil 1 &ndash; hier anklicken und &auml;ndern.</li>
            <li>Vorteil 2</li>
            <li>Vorteil 3</li>
          </ul>
        </section>

        <section class="program-info-block" aria-labelledby="target-title">
          <h2 id="target-title">Zielgruppe</h2>
          <p>F&uuml;r wen ist das Programm gedacht?</p>
        </section>

        <section class="program-info-block program-download-block" aria-labelledby="download-title">
          <h2 id="download-title">Download (Android-App)</h2>
          <div class="download-slot">
            <h3>Hauptdatei</h3>
            <p>Sobald es eine Datei gibt, hier den Knopf anklicken und die Adresse eintragen.</p>
            <a class="button" href="https://github.com/finnveloprogrammwelten-crypto/finnvelo-programmwelten/releases" target="_blank" rel="noopener">Download starten</a>
          </div>
          <div class="download-slot download-slot--muted">
            <h3>Weitere Versionen und Patches</h3>
            <p>Platzhalter f&uuml;r sp&auml;tere Updates, Patchdateien und &auml;ltere Versionen.</p>
          </div>
        </section>

        <section class="program-info-block program-download-block program-download-block--pc" aria-labelledby="download-pc-title">
          <h2 id="download-pc-title">Download (PC-Version)</h2>
          <div class="download-slot">
            <h3>Programm herunterladen</h3>
            <p>Die Fassung f&uuml;r Windows. Sie l&auml;uft eigenst&auml;ndig, eine Installation ist nicht n&ouml;tig.</p>
            <a class="button" href="https://github.com/finnveloprogrammwelten-crypto/finnvelo-programmwelten/releases" target="_blank" rel="noopener">PC-Version herunterladen</a>
          </div>
          <div class="download-slot download-slot--muted">
            <h3>Hinweis</h3>
            <p>Windows meldet bei unbekannten Programmen einen Warnhinweis. &Uuml;ber &bdquo;Weitere Informationen&ldquo; &rarr; &bdquo;Trotzdem ausf&uuml;hren&ldquo; l&auml;sst sich der Start fortsetzen.</p>
          </div>
        </section>
      </div>
    </article>
  </main>
${FUSSZEILE}
  <script src="/stats.js" defer></script>
</body>
</html>`;
}

function infoSeite(p) {
  const name = esc(p.name), kurz = esc(p.kurz), stich = esc(p.stich || "Finnvelo Programmwelten");
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${kurz}">
  <title>${name} &middot; Finnvelo Programmwelten</title>
  <link rel="canonical" href="https://finnveloprogramme.com/${esc(p.slug)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Finnvelo Programmwelten">
  <meta property="og:locale" content="de_DE">
  <meta property="og:title" content="${name} &middot; Finnvelo Programmwelten">
  <meta property="og:description" content="${kurz}">
  <meta property="og:url" content="https://finnveloprogramme.com/${esc(p.slug)}">
  <meta property="og:image" content="https://finnveloprogramme.com/assets/images/programmwelten-cover.jpg">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" href="/assets/images/favicon.png">
  <link rel="apple-touch-icon" href="/assets/images/apple-touch-icon.png">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
${KOPFZEILE}
  <main class="main-canvas info-page">
    <article class="info-seite" aria-labelledby="info-title">
      <p class="section-kicker">${stich}</p>
      <h1 id="info-title">${name}</h1>
      <p class="lead">${kurz}</p>

      <section class="program-info-block program-info-block--wide" aria-labelledby="info-1">
        <h2 id="info-1">Abschnitt</h2>
        <p>Hier steht der Text. Im Bearbeiten-Modus anklicken und &auml;ndern.
           Mit den Kn&ouml;pfen darunter lassen sich weitere Felder, Bilder,
           &Uuml;berschriften und Kn&ouml;pfe erg&auml;nzen.</p>
      </section>
    </article>
  </main>
${FUSSZEILE}
  <script src="/stats.js" defer></script>
</body>
</html>`;
}

function programmKachel(p) {
  const bild = p.bild ? esc(p.bild) : "/assets/images/programmwelten-label.webp";
  return `          <a class="program-button" href="/${esc(p.slug)}" aria-label="${esc(p.name)} oeffnen" data-fv-text-extra>
            <span class="program-button__status" data-fv-added hidden></span>
            <img src="${bild}" alt="${esc(p.name)}">
            <span class="program-button__description">${esc(p.kurz)}</span>
          </a>`;
}

function programmZeile(p) {
  const bild = p.bild ? esc(p.bild) : "/assets/images/programmwelten-label.webp";
  return `        <a class="program-row" href="/${esc(p.slug)}" aria-label="${esc(p.name)} oeffnen" data-fv-text-extra>
          <span class="program-row__image"><img src="${bild}" alt="${esc(p.name)}"></span>
          <span class="program-row__content">
            <span class="status" data-fv-added hidden></span>
            <strong>${esc(p.name)}</strong>
            <span>${esc(p.kurz)}</span>
          </span>
        </a>`;
}

async function seitenKopf(env, slug) {
  try {
    if (!env || !env.COUNTERS || !PAGE_RE.test(slug)) return null;
    const stub = env.COUNTERS.get(env.COUNTERS.idFromName("global"));
    const r = await stub.fetch(new Request(
      "https://zaehler/api/content?page=" + encodeURIComponent(slug), { method: "GET" }));
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || !Array.isArray(d.items)) return null;
    let titel = "", besch = "";
    for (const it of d.items) {
      if (it.block === "m1" && it.type === "text") titel = String(it.value || "").trim();
      if (it.block === "m2" && it.type === "text") besch = String(it.value || "").trim();
    }
    if (!titel && !besch) return null;
    return { titel: titel, besch: besch };
  } catch (_e) { return null; }
}

// Titel und Beschreibung in einer fertigen HTML-Seite austauschen.
function kopfErsetzen(html, kopf) {
  if (!kopf) return html;
  if (kopf.titel) {
    const t = esc(kopf.titel);
    html = html.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + t + "</title>");
    html = html.replace(/(<meta property="og:title" content=")[^"]*(")/i, "$1" + t + "$2");
    html = html.replace(/(<meta name="twitter:title" content=")[^"]*(")/i, "$1" + t + "$2");
  }
  if (kopf.besch) {
    const b = esc(kopf.besch);
    html = html.replace(/(<meta name="description" content=")[^"]*(")/i, "$1" + b + "$2");
    html = html.replace(/(<meta property="og:description" content=")[^"]*(")/i, "$1" + b + "$2");
    html = html.replace(/(<meta name="twitter:description" content=")[^"]*(")/i, "$1" + b + "$2");
  }
  return html;
}

async function versionsRouten(env) {
  try {
    if (!env || !env.COUNTERS) return {};
    const stub = env.COUNTERS.get(env.COUNTERS.idFromName("global"));
    const r = await stub.fetch(new Request("https://zaehler/api/versionsrouten", { method: "GET" }));
    if (!r.ok) return {};
    const d = await r.json();
    return (d && d.routen && typeof d.routen === "object") ? d.routen : {};
  } catch (_e) { return {}; }
}

async function eigeneProgramme(env) {
  try {
    if (!env || !env.COUNTERS) return [];
    const stub = env.COUNTERS.get(env.COUNTERS.idFromName("global"));
    const r = await stub.fetch(new Request("https://zaehler/api/programme", { method: "GET" }));
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d.programme) ? d.programme : [];
  } catch (_e) { return []; }
}

/* webAppKey() ist am 07.09.2026 entfallen. Die Funktion ordnete
   /mischwald und /planer/haus-und-gartenplaner einem Zaehlerschluessel
   zu ("open:mischwald", "open:planer"). Beide Web-Fassungen gibt es seit
   dem 13.08.2026 nicht mehr, und beide Adressen werden jetzt weiter oben
   in bearbeiten() mit 301 beantwortet - sie erreichten diese Stelle
   ohnehin nie wieder. Die bereits gezaehlten Werte bleiben unangetastet
   in der Datenbank stehen. */

// Nur echte Seitenaufrufe zaehlen - keine Bilder, Suchmaschinen oder Messdienste.
function isEchterAufruf(request) {
  if ((request.method || "GET") !== "GET") return false;
  const h = request.headers;
  const accept = (h.get("accept") || "").toLowerCase();
  if (accept && !accept.includes("text/html")) return false;
  const modus = (h.get("sec-fetch-mode") || "").toLowerCase();
  if (modus && modus !== "navigate") return false;
  const ua = (h.get("user-agent") || "").toLowerCase();
  if (!ua) return false;
  if (/bot|crawl|spider|slurp|preview|monitor|curl|wget|python-requests|headless|lighthouse|pingdom|uptime|facebookexternalhit|whatsapp|telegram/.test(ua)) return false;
  return true;
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await this.bearbeiten(request, env, ctx);
    } catch (fehler) {
      // Abstuerze ins Fehlerbuch schreiben, damit sie auf /serverstatus
      // sichtbar sind - ohne Cloudflare-Oberflaeche.
      try {
        const u = new URL(request.url);
        const g = env.COUNTERS.get(env.COUNTERS.idFromName("global"));
        const melden = g.fetch(new Request("https://zaehler/api/kanalliste", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            aktion: "fehler", weg: u.pathname, lage: 500,
            text: String((fehler && fehler.message) || fehler || "Unbekannter Fehler")
                  + " | " + String((fehler && fehler.stack) || "").split("\n")
          })
        }));
        if (ctx && ctx.waitUntil) ctx.waitUntil(melden); else await melden;
      } catch (_e) { /* Melden darf nie selbst scheitern */ }
      return json({ error: "server_error", fehler: "Auf dem Server ist ein Fehler aufgetreten." }, 500);
    }
  },

  async bearbeiten(request, env, ctx) {
    const url = new URL(request.url);

    /* =================================================================
     * DAUERHAFTE WEITERLEITUNGEN (301)
     * -----------------------------------------------------------------
     * Warum ueberhaupt: Die Asset-Auslieferung von Cloudflare leitet
     * /kontakt.html von sich aus auf /kontakt um - aber mit 307, also
     * "voruebergehend". Google behaelt eine solche Adresse dann im
     * Bestand und uebertraegt ihre Wertung NICHT auf das Ziel. Im
     * Indexierungsbericht steht sie dauerhaft unter "Seite mit
     * Weiterleitung"; die Validierung schlaegt zwangslaeufig fehl.
     * Gemessen am 07.09.2026: /index.html und /kontakt.html, beide 307,
     * Validierung "Fehlgeschlagen", seit dem 13.06.2026 unveraendert.
     * Der SEO-Umbau vom 11.08. konnte daran nichts aendern - die
     * Weiterleitung kommt gar nicht aus dem Projekt.
     * Ein 301 sagt "endgueltig". Erst damit raeumt Google auf.
     *
     * Bewusst eng gefasst - jede Erweiterung braucht einen Befund:
     *   - nur GET/HEAD; Schnittstellenwege bleiben unberuehrt
     *   - nur .html direkt in der Wurzel. Unterordner bleiben aussen
     *     vor: /FinnVelo/Aufgabenplaner/index.html leitet Cloudflare
     *     auf den Ordner MIT Schraegstrich um, und diese Adresse kennt
     *     keine Suchmaschine.
     *   - der Schraegstrich am Ende wird NICHT angefasst. Dazu gibt es
     *     keinen Befund, und /FinnVelo/Aufgabenplaner/ muss so bleiben.
     * ================================================================= */
    if (request.method === "GET" || request.method === "HEAD") {
      const p = url.pathname;
      const dauerhaft = (nach) => new Response(null, {
        status: 301,
        headers: { location: nach + url.search, "cache-control": "no-store" }
      });

      /* Abgeraeumte Web-Fassungen. Entfernt am 13.08.2026 (Commit
         9123644) - das war Absicht. Die Adressen stehen aber weiter in
         fremden Verzeichnissen und in Lesezeichen; Google hat sie am
         03./04.09.2026 noch angefragt. Statt der Fehlerseite jetzt der
         Verweis auf die jeweilige Programmseite. */
      const ABGERAEUMT = {
        "/mischwald": "/mischwaldrechner",
        "/mischwald.html": "/mischwaldrechner",
        "/planer/haus-und-gartenplaner": "/haus-und-gartenplaner",
        "/planer/haus-und-gartenplaner/index.html": "/haus-und-gartenplaner",
        "/apps/einkaufsliste": "/einkaufsliste"
      };
      const ohneStrich = p.length > 1 ? p.replace(/\/+$/, "") : p;
      if (ABGERAEUMT[ohneStrich]) return dauerhaft(ABGERAEUMT[ohneStrich]);

      // /kontakt.html -> /kontakt , /index.html -> /
      if (/^\/[a-z0-9][a-z0-9.\-]*\.html$/i.test(p)) {
        const rein = p.replace(/\.html$/i, "");
        return dauerhaft(rein === "/index" ? "/" : rein);
      }
    }

    /* =================================================================
     * ZUERST die beiden eigenstaendigen Dienste - noch VOR allem anderen.
     *
     * Reihenfolge ist hier keine Geschmacksfrage: steht /api/einkauf/
     * hinter der Sammelroute /api/, verschluckt die Sammelroute jeden
     * Aufruf und die Kopplung antwortet 404. Bei /tourenapi/ gilt
     * dasselbe gegenueber der Dateiauslieferung, die auf PUT mit 405
     * antwortet. Beides ist laut Auftrag schon passiert.
     *
     * Fehlt die Bindung, sagt der Dienst das im Klartext, statt still
     * einen Fehler zu werfen - sonst sucht man an der falschen Stelle.
     * ================================================================= */
    if (url.pathname.startsWith("/api/einkauf/")) {
      if (!env || !env.EINKAUF) {
        return json({ fehler: "Der Einkaufsdienst ist nicht eingerichtet " +
                              "(Bindung EINKAUF fehlt in der wrangler.jsonc)." }, 503);
      }
      return behandleEinkauf(request, env, url);
    }

    if (url.pathname === "/tourenapi" || url.pathname.startsWith("/tourenapi/")) {
      if (!env || !env.TOUREN_KANAL || !env.TOUREN_KOPPLUNG) {
        return json({ fehler: "Der Tourendienst ist nicht eingerichtet " +
                              "(Bindungen TOUREN_KANAL und TOUREN_KOPPLUNG fehlen)." }, 503);
      }
      return behandleTourenapi(request, env);
    }

    /* Geraeteabgleich des Finanzmanagers (27.09.2026) - aus demselben Grund
       wie /tourenapi/ vor allem anderen: Die Dateiauslieferung antwortet auf
       PUT und POST mit 405. */
    if (url.pathname === "/finanzapi" || url.pathname.startsWith("/finanzapi/")) {
      if (!env || !env.FINANZ_KANAL || !env.FINANZ_KOPPLUNG) {
        return json({ fehler: "Der Abgleichdienst ist nicht eingerichtet " +
                              "(Bindungen FINANZ_KANAL und FINANZ_KOPPLUNG fehlen)." }, 503);
      }
      return behandleFinanzapi(request, env);
    }

    /* Kopplung und Treffpunkt des FINNVELO Vorlesers (25.10.2026) - aus demselben Grund wie
       /tourenapi/ vor allem anderen (die Dateiauslieferung antwortet auf PUT mit 405). Ueber den
       Server gehen nur kleine, verschluesselte Pakete; Buecher und Ton gehen direkt im Heimnetz. */
    if (url.pathname === "/vorleserapi" || url.pathname.startsWith("/vorleserapi/")) {
      if (!env || !env.VORLESER_KOPPLUNG || !env.VORLESER_TREFF) {
        return json({ fehler: "Der Vorleser-Dienst ist nicht eingerichtet " +
                              "(Bindungen VORLESER_KOPPLUNG und VORLESER_TREFF fehlen)." }, 503);
      }
      return behandleVorleserapi(request, env);
    }

    /* =================================================================
     * Gerätekopplung: alles unter /api/kanal/ ...
     * Jeder Kanal hat ein eigenes Durable Object. Der Worker sucht anhand
     * des Codes das richtige heraus und reicht die Anfrage weiter.
     * Ohne Anmeldung erreichbar - der Zugang haengt an Code und Pruefwert.
     * ================================================================= */
    if (url.pathname === "/api/kanal" || url.pathname.startsWith("/api/kanal/")) {
      if (!env || !env.KANAELE) return json({ fehler: "Der Dienst ist nicht eingerichtet." }, 503);

      const weg = url.pathname.slice("/api/kanal/".length).replace(/\/+$/, "");
      const CODE_RE = /^FNV-[A-Z0-9]{4}-[A-Z0-9]{2}$/;

      let rumpf = "";
      let koerper = {};
      if (request.method === "POST") {
        try { rumpf = await request.text(); } catch (_e) { rumpf = ""; }
        try { koerper = rumpf ? JSON.parse(rumpf) : {}; } catch (_e) { koerper = {}; }
      }

      /* --- Anlegen: freien Code suchen ------------------------------ */
      if (weg === "neu" && request.method === "POST") {
        const ZEICHEN = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // ohne I O 0 1
        const wuerfel = (n) => {
          const b = new Uint8Array(n); crypto.getRandomValues(b);
          let o = ""; for (let i = 0; i < n; i++) o += ZEICHEN[b[i] % ZEICHEN.length];
          return o;
        };
        for (let versuch = 0; versuch < 8; versuch++) {
          const code = "FNV-" + wuerfel(4) + "-" + wuerfel(2);
          const stub = env.KANAELE.get(env.KANAELE.idFromName(code));
          const antwort = await stub.fetch(new Request("https://kanal/dv?weg=neu", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(Object.assign({}, koerper, { code: code }))
          }));
          if (antwort.status !== 409) {
            // Fuer die Aufsicht merken (nur der Code, keine Inhalte)
            if (antwort.ok) {
              try {
                const g = env.COUNTERS.get(env.COUNTERS.idFromName("global"));
                ctx.waitUntil(g.fetch(new Request("https://zaehler/api/kanalliste", {
                  method: "POST", headers: { "content-type": "application/json" },
                  body: JSON.stringify({ aktion: "merken", code: code })
                })));
              } catch (_e) {}
            }
            return antwort;
          }   // 409 = Code schon belegt
        }
        return json({ fehler: "Es ließ sich kein freier Code finden. Bitte noch einmal versuchen." }, 503);
      }

      /* --- Alle anderen Wege brauchen einen gueltigen Code ----------- */
      // Bekannte Wege - alles andere ist ein Tippfehler und wird als solcher
      // gemeldet, nicht als fehlender Kanal. Sonst sucht man an der falschen Stelle.
      const WEGE = [
        "salz", "beitreten", "rettung", "passwortNeu", "senden", "holen",
        "schliessen", "oeffnen", "behalten", "zustand", "draht",   // draht wird oben mit 410 beantwortet
        "mitglieder", "mitglieder/rolle",
        "listen", "listen/neu", "listen/freigeben", "listen/sperren",
        "listen/rechte", "listen/senden", "listen/holen", "listen/loeschen",
        "einladung", "einladung/neu", "einladung/loeschen", "einladungen"
      ];
      if (WEGE.indexOf(weg) === -1) {
        return json({ fehler: "Diese Auskunft gibt es nicht." }, 404);
      }

      // Einladungen kommen ohne Kanalcode - die Marke fuehrt zum Kanal.
      let kanalCode = String(
        (request.method === "POST" && koerper.code) || url.searchParams.get("code") || ""
      ).toUpperCase();
      const marke = String(
        (request.method === "POST" && koerper.marke) || url.searchParams.get("marke") || ""
      );
      if (!CODE_RE.test(kanalCode) && marke && (weg === "einladung" || weg === "beitreten")) {
        try {
          const g = env.COUNTERS.get(env.COUNTERS.idFromName("global"));
          const r = await g.fetch(new Request("https://zaehler/api/kanalliste", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ aktion: "markeSuchen", marke: marke })
          }));
          if (r.ok) {
            const d = await r.json();
            if (d && CODE_RE.test(String(d.code || ""))) kanalCode = String(d.code);
          }
        } catch (_e) { /* dann greift die Pruefung unten */ }
      }
      if (!CODE_RE.test(kanalCode) && marke) {
        return json({ fehler: "Diese Einladung gibt es nicht." }, 404);
      }
      if (!CODE_RE.test(kanalCode)) {
        return json({ fehler: "Diesen Kanal gibt es nicht." }, 404);
      }
      const stub = env.KANAELE.get(env.KANAELE.idFromName(kanalCode));

      /* --- Die offene Leitung fuer den Chat -------------------------- */
      if (weg === "draht") {
        /* Der Chat ist ausgebaut (25.08.2026). Die Anfrage wird hier
           beantwortet und NICHT mehr an den Kanal durchgereicht - damit
           weckt eine alte App-Fassung kein Durable Object mehr auf.
           Genau das war die Entlastung, um die es ging.
           410 statt 404: "gab es, gibt es nicht mehr" - eine alte App
           bekommt eine eindeutige Auskunft statt "Kanal unbekannt". */
        return json({
          fehler: "Der Chat wurde eingestellt.",
          hinweis: "Listen und Aufgaben laufen unveraendert weiter."
        }, 410);
      }

      /* --- Alles Uebrige an das Kanal-Objekt weiterreichen ----------- */
      const ziel = new URL("https://kanal/dv");
      for (const [n, v] of url.searchParams) ziel.searchParams.set(n, v);
      ziel.searchParams.set("weg", weg);
      const antwort = await stub.fetch(new Request(ziel.toString(), {
        method: request.method,
        headers: new Headers(request.headers),
        body: request.method === "POST" ? rumpf : undefined
      }));

      // Frisch gepraegte Marke merken, damit sie ohne Kanalcode auffindbar ist
      if (weg === "einladung/neu" && antwort.ok) {
        try {
          const kopie = antwort.clone();
          const g = env.COUNTERS.get(env.COUNTERS.idFromName("global"));
          ctx.waitUntil(kopie.json().then((d) => {
            if (!d || !d.marke) return;
            return g.fetch(new Request("https://zaehler/api/kanalliste", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ aktion: "marke", marke: d.marke, code: kanalCode })
            }));
          }).catch(() => {}));
        } catch (_e) {}
      }
      // Nur Fehlerlagen ins Buch - ohne Inhalte, ohne Code des Kanals
      if (antwort.status >= 400) {
        try {
          const kopie = antwort.clone();
          const g = env.COUNTERS.get(env.COUNTERS.idFromName("global"));
          ctx.waitUntil(kopie.json().then((d) =>
            g.fetch(new Request("https://zaehler/api/kanalliste", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ aktion: "fehler", weg: weg, lage: antwort.status,
                                     text: String((d && d.fehler) || "") })
            }))
          ).catch(() => {}));
        } catch (_e) {}
      }
      return antwort;
    }

    // --- Aufsicht: Kennzahlen einsammeln (nur Admin) ------------------
    if (url.pathname === "/api/serverstatus" && request.method === "POST") {
      if (!env || !env.COUNTERS) return json({ error: "storage_not_configured" }, 503);
      let b = {};
      try { b = await request.json(); } catch (_e) { b = {}; }
      const g = env.COUNTERS.get(env.COUNTERS.idFromName("global"));
      const grund = await g.fetch(new Request("https://zaehler/api/aufsicht", {
        // Herkunft mitgeben - sonst teilen sich alle Aufrufe hier eine
        // Anmeldebremse, und ein Angreifer sperrte den Admin gleich mit aus.
        method: "POST", headers: { "content-type": "application/json",
                                   "CF-Connecting-IP": request.headers.get("CF-Connecting-IP") || "" },
        body: JSON.stringify(b)
      }));
      if (!grund.ok) return grund;
      const daten = await grund.json();

      // Je Kanal die Kennzahlen holen - hoechstens 60, damit es zuegig bleibt
      const kanaele = [];
      if (env.KANAELE) {
        for (const k of (daten.kanaele || []).slice(0, 60)) {
          try {
            const stub = env.KANAELE.get(env.KANAELE.idFromName(k.code));
            const r = await stub.fetch(new Request("https://kanal/aufsicht"));
            if (r.ok) {
              const z = await r.json();
              if (z && z.da) kanaele.push(z);
            }
          } catch (_e) { /* einzelner Kanal darf die Uebersicht nicht kippen */ }
        }
      }
      daten.kanaele = kanaele;
      daten.zeit = new Date().toISOString();
      return json(daten);
    }

    // Alle uebrigen Schnittstellen laufen ueber das gemeinsame Objekt.
    // WICHTIG: Dieser Durchreicher muss NACH den besonderen Wegen stehen
    // (/api/kanal/... und /api/serverstatus), sonst verschluckt er sie.
    if (url.pathname.startsWith("/api/")) {
      if (!env || !env.COUNTERS) return json({ error: "storage_not_configured" }, 503);
      const id = env.COUNTERS.idFromName("global");
      const stub = env.COUNTERS.get(id);
      return stub.fetch(request);
    }

    // Fingerabdruck-Datei fuer den Android-App-Link: muss als JSON kommen
    if (url.pathname === "/.well-known/assetlinks.json" && env && env.ASSETS) {
      const a = await env.ASSETS.fetch(request);
      if (!a.ok) return a;
      return new Response(await a.text(), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600" }
      });
    }

    // Versionsdateien der Android-Apps (feste Adressen, die in den Apps stecken).
    const versionPfad = url.pathname.toLowerCase().replace(/\/+$/, "");
    // Fest eingebaute Update-Adressen (bleiben immer erreichbar)
    const VERSION_ROUTEN = VERSION_ABLAGEN;
    if (versionPfad.endsWith("/version.json") || versionPfad.endsWith("/android.json")
        || versionPfad.endsWith("/pc.json")) {
      let ablage = VERSION_ROUTEN[versionPfad];
      if (!ablage) {
        // Selbst angelegte Adressen aus dem Verzeichnis
        const routen = await versionsRouten(env);
        const treffer = routen[versionPfad];
        if (typeof treffer === "string" && PAGE_RE.test(treffer)) ablage = treffer;
      }
      if (ablage) {
        if (!env || !env.COUNTERS) return new Response("Not found", { status: 404 });
        const stub = env.COUNTERS.get(env.COUNTERS.idFromName("global"));
        return stub.fetch(new Request("https://zaehler/api/version?app=" + ablage, { method: "GET" }));
      }
    }

    // --- Sitemap: selbst angelegte Programme ergaenzen -----------------
    // Ohne das waeren neu angelegte Programmseiten fuer Suchmaschinen unsichtbar.
    if (url.pathname === "/sitemap.xml" && env && env.ASSETS) {
      const liste = await eigeneProgramme(env);
      const antwort = await env.ASSETS.fetch(request);
      if (!antwort.ok || !liste.length) return antwort;
      let xml = await antwort.text();
      if (xml.indexOf("</urlset>") !== -1) {
        const heute = new Date().toISOString().slice(0, 10);
        const zusatz = liste.map((p) =>
          "  <url><loc>https://finnveloprogramme.com/" + esc(p.slug) +
          "</loc><lastmod>" + heute + "</lastmod></url>"
        ).join("\n");
        xml = xml.replace("</urlset>", zusatz + "\n</urlset>");
      }
      return new Response(xml, {
        status: 200,
        headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-cache" }
      });
    }

    // --- Eigene Programme: Seite erzeugen oder Kacheln einsetzen -------
    const pfad = url.pathname.replace(/\/+$/, "") || "/";
    const istUebersicht = (pfad === "/" || pfad === "/index.html" ||
                           pfad === "/programme" || pfad === "/programme.html");
    const moeglicherSlug = pfad.replace(/^\//, "").replace(/\.html$/, "");
    const koennteProgramm = PAGE_RE.test(moeglicherSlug) &&
                            RESERVIERT.indexOf(moeglicherSlug) === -1;

    if (istUebersicht || koennteProgramm) {
      const liste = await eigeneProgramme(env);

      // a) Eigene Programmseite ausliefern
      if (koennteProgramm) {
        const treffer = liste.filter((p) => p && p.slug === moeglicherSlug)[0];
        if (treffer) {
          const kopf = await seitenKopf(env, moeglicherSlug);
          const bauplan = (treffer.art === "info") ? infoSeite(treffer) : programmSeite(treffer);
          return new Response(kopfErsetzen(bauplan, kopf), {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-cache"
            }
          });
        }
      }

      // b) Kacheln/Zeilen in Startseite und Programmliste einsetzen
      if (istUebersicht && liste.some((p) => p && p.art !== "info") && env && env.ASSETS) {
        const antwort = await env.ASSETS.fetch(request);
        const typ = antwort.headers.get("content-type") || "";
        if (antwort.ok && typ.indexOf("text/html") !== -1) {
          let html = await antwort.text();
          if (html.indexOf("<!--FV-PROGRAMME-->") !== -1) {
            const istListe = (pfad === "/programme" || pfad === "/programme.html");
            const nurProgramme = liste.filter((p) => p && p.art !== "info");
            const teile = nurProgramme.map((p) => istListe ? programmZeile(p) : programmKachel(p)).join("\n");
            html = html.replace("<!--FV-PROGRAMME-->", teile);
            const slugU = (pfad === "/" || pfad === "/index.html") ? "start" : "programme";
            html = kopfErsetzen(html, await seitenKopf(env, slugU));
            const kopf = new Headers(antwort.headers);
            kopf.delete("content-length");
            kopf.set("cache-control", "no-cache");
            return new Response(html, { status: antwort.status, headers: kopf });
          }
          return new Response(html, { status: antwort.status, headers: antwort.headers });
        }
        return antwort;
      }
    }

    // Alles andere: statische Datei ausliefern.
    if (env && env.ASSETS) {
      const antwort = await env.ASSETS.fetch(request);
      // Bei HTML-Seiten koennen Titel und Beschreibung aus dem Bearbeiten-Modus
      // stammen. Klappt das nicht, wird einfach die Originalseite ausgeliefert.
      const typ = antwort.headers.get("content-type") || "";
      if (antwort.ok && typ.indexOf("text/html") !== -1) {
        // HTML nie zwischenspeichern - sonst zeigt der Browser tagelang alte Seiten.
        const frisch = new Headers(antwort.headers);
        frisch.set("cache-control", "no-cache, must-revalidate");
        const slug = (pfad === "/" ? "start" : pfad.replace(/^\//, "").replace(/\.html$/, ""));
        if (PAGE_RE.test(slug)) {
          const kopf = await seitenKopf(env, slug);
          if (kopf) {
            const html = kopfErsetzen(await antwort.text(), kopf);
            frisch.delete("content-length");
            return new Response(html, { status: antwort.status, headers: frisch });
          }
        }
        const roh = await antwort.text();
        frisch.delete("content-length");
        return new Response(roh, { status: antwort.status, headers: frisch });
      }
      return antwort;
    }
    return new Response("Not found", { status: 404 });
  }
};

/* =====================================================================
 * Kanal - ein Durable Object je Kanal
 * ---------------------------------------------------------------------
 * Haelt Aufgaben, Listen, Mitglieder und den Chat eines einzelnen Kanals.
 * Der Server sieht ausschliesslich verschluesselte Zeichenketten: Er
 * vergibt Nummern, reicht Pakete weiter und entscheidet ueber die
 * Herausgabe - oeffnen kann er nichts.
 *
 * Aufraeumen laeuft ueber den eingebauten Wecker (alarm):
 *   ein Jahr ohne Zugriff -> Vorwarnung, eine Woche spaeter loeschen.
 * ===================================================================== */

const JAHR = 365 * 24 * 60 * 60 * 1000;
const WOCHE = 7 * 24 * 60 * 60 * 1000;
const SPERRE = 10 * 60 * 1000;
const MAX_DATEN = 2 * 1024 * 1024;      // 2 MB Aufgabenbestand je Kanal

/* --- Anhaenge: Grenzen und Fristen (Auftrag "Anhaenge", Abschnitt 5/6) --- */
const MAX_ANHANG = 2 * 1024 * 1024;     // 2 MB je Anhang, nach dem Verschluesseln
const MAX_ANHANG_KANAL = 50 * 1024 * 1024;  // 50 MB Anhaenge je Kanal
const ANHANG_AKTIV = 7 * 24 * 60 * 60 * 1000;      // Geraet zaehlt mit: Meldung binnen 7 Tagen
const ANHANG_NOTFRIST = 14 * 24 * 60 * 60 * 1000;  // spaetestens nach 14 Tagen weg
const ANHANG_MERK = 90 * 24 * 60 * 60 * 1000;      // so lange gibt es 410 statt 404
/* Die tatsaechliche Groesse einer Durable-Object-Datenbank.
   LENGTH(...) aufzusummieren unterschaetzt: Indizes, Verwaltungsdaten und
   der Verschnitt in halb gefuellten Seiten fehlen dabei. page_count mal
   page_size ist das, was Cloudflare wirklich abrechnet und begrenzt. */
function echteGroesse(sql) {
  try {
    const c = sql.exec("PRAGMA page_count").toArray()[0];
    const g = sql.exec("PRAGMA page_size").toArray()[0];
    const anz = Number(c.page_count || Object.values(c)[0] || 0);
    const gr = Number(g.page_size || Object.values(g)[0] || 0);
    return anz * gr;
  } catch (_e) { return 0; }
}

const KANAL_STAND = 1;   // bei jeder Aenderung an tabellenAnlegen() erhoehen
/* Der Chat wurde am 25.08.2026 ausgebaut. Die Tabelle "nachrichten"
   wird nicht mehr angelegt, nicht mehr beschrieben und nicht mehr
   gelesen. Bei bestehenden Kanaelen BLEIBT sie stehen - sie wird nur
   nicht mehr angefasst. Loeschen waere unumkehrbar; wer die alten
   Nachrichten noch braucht, findet sie in einer Sicherung. */
const STEMPEL_TAKT = 60 * 60 * 1000;               // Aktivitaetsstempel hoechstens stuendlich
const AUFRAEUM_TAKT = 10 * 60 * 1000;              // hoechstens alle 10 Minuten aufraeumen
const GERAET_VERWAIST = 30 * 24 * 60 * 60 * 1000;  // ein Monat ohne Abgleich
const MAX_NACHRICHT = 4 * 1024;         // 4 KB je Chatnachricht
/* Beim Verbinden mitgeschickte Nachrichten. Frueher 200 - das bedeutet bei
   JEDEM Verbindungsaufbau 200 Datenbankzeilen lesen und einzeln senden.
   Bei einem Handy, das unterwegs staendig neu verbindet, ist das genau die
   Last, die das Objekt in die Zeitueberschreitung treibt. 50 reicht fuer
   den Rueckblick im Chat voellig; wer mehr braucht, holt sie ueber "seit". */
const NACHHOLEN = 50;
const MAX_FEHLER = 5;                   // dann zehn Minuten Sperre
const ANFRAGEN_MINUTE = 60;             // HTTP-Anfragen je Kanal und Minute

function jsonAntwort(daten, code) {
  return new Response(JSON.stringify(daten), {
    status: code || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    }
  });
}

// Vergleich mit fester Laufzeit - verraet nichts ueber Teiltreffer.
function gleich(a, b) {
  const x = String(a == null ? "" : a), y = String(b == null ? "" : b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

function zufall(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/=+$/, "");
}

export class Kanal extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;

    /* Tabellen NUR anlegen, wenn noetig.
       ------------------------------------------------------------------
       Frueher liefen hier bei JEDEM Aufwachen 16 Anweisungen - elf
       CREATE TABLE, zwei CREATE INDEX und drei ALTER TABLE. Die drei
       ALTER warfen dabei jedes Mal eine Ausnahme, die verschluckt wurde:
       die Spalten gibt es laengst.

       Ein Durable Object wird nicht dauerhaft gehalten. Nach jeder
       Ruhephase lief das alles erneut, bevor die eigentliche Anfrage
       ueberhaupt begann - und trieb den Speicher in die Zeitgrenze
       ("Internal error in Durable Object storage", zuletzt 22.8. 16:36
       genau an dieser Stelle).

       PRAGMA user_version merkt sich, was schon angelegt ist. Ein
       Aufwachen kostet jetzt eine einzige Abfrage. */
    let stand = 0;
    try {
      const r = this.sql.exec("PRAGMA user_version").toArray()[0];
      stand = Number(r && (r.user_version !== undefined ? r.user_version : Object.values(r)[0])) || 0;
    } catch (_e) { stand = 0; }

    if (stand < KANAL_STAND) {
      this.tabellenAnlegen();
      try { this.sql.exec("PRAGMA user_version = " + KANAL_STAND); } catch (_e) {}
    }
  }

  /* Einmalige Einrichtung. Laeuft nur, wenn user_version zurueckliegt -
     also beim allerersten Mal und nach einer Erweiterung. Bei einer
     Aenderung hier KANAL_STAND erhoehen, sonst greift sie nie. */
  tabellenAnlegen() {

    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS kanal (" +
      "eins INTEGER PRIMARY KEY CHECK (eins = 1), " +
      "code TEXT NOT NULL, name TEXT NOT NULL, pruefwert TEXT NOT NULL, " +
      "salz_p TEXT NOT NULL, paket_p TEXT NOT NULL, " +
      "salz_r TEXT NOT NULL, paket_r TEXT NOT NULL, " +
      "daten TEXT, stand INTEGER DEFAULT 0, offen INTEGER DEFAULT 1, " +
      "gruender TEXT DEFAULT '', naechste_nummer INTEGER DEFAULT 1, " +
      "angelegt INTEGER NOT NULL, letzter_zugriff INTEGER NOT NULL, warnung_ab INTEGER)"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS mitglieder (" +
      "kennung TEXT PRIMARY KEY, nummer INTEGER NOT NULL, " +
      "geraet TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', " +
      "rolle TEXT NOT NULL DEFAULT 'schreiben', zuletzt INTEGER NOT NULL, " +
      "oeffentlich TEXT NOT NULL DEFAULT '')"
    );
    // Nachtraeglich ergaenzte Spalte - bei alten Kanaelen fehlt sie sonst.
    try { this.sql.exec("ALTER TABLE mitglieder ADD COLUMN oeffentlich TEXT NOT NULL DEFAULT ''"); }
    catch (_e) { /* gibt es schon */ }
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS bremse (" +
      "herkunft TEXT PRIMARY KEY, versuche INTEGER DEFAULT 0, bis INTEGER)"
    );
    /* Tabelle "nachrichten" entfaellt - der Chat ist ausgebaut. */
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS listen (" +
      "liste TEXT PRIMARY KEY, ersteller TEXT NOT NULL, name TEXT NOT NULL, " +
      "offen INTEGER DEFAULT 1, daten TEXT, stand INTEGER DEFAULT 0, " +
      "sicht TEXT NOT NULL DEFAULT 'alle', zugang TEXT NOT NULL DEFAULT 'alle', " +
      "salz_l TEXT, paket_l TEXT, pruef_l TEXT)"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS freigaben (" +
      "liste TEXT NOT NULL, kennung TEXT NOT NULL, paket TEXT NOT NULL, " +
      "PRIMARY KEY (liste, kennung))"
    );
    // Ab wann gilt die Freigabe? Wer neu dazukommt, liest im Chat nur ab
    // diesem Zeitpunkt - nicht rueckwirkend den ganzen Verlauf.
    // 0 bei Altbestand: dann gilt sie wie bisher von Anfang an.
    try { this.sql.exec("ALTER TABLE freigaben ADD COLUMN seit INTEGER NOT NULL DEFAULT 0"); }
    catch (_e) { /* gibt es schon */ }
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS einladungen (" +
      "marke TEXT PRIMARY KEY, salz_e TEXT NOT NULL, " +
      "pruef1 TEXT, pruef2 TEXT, pruef3 TEXT, haupt_pruef TEXT NOT NULL, " +
      "ablauf INTEGER NOT NULL, einmalig INTEGER NOT NULL DEFAULT 1, " +
      "benutzt INTEGER NOT NULL DEFAULT 0, versuche INTEGER DEFAULT 0, " +
      "bremse_bis INTEGER, erstellt INTEGER NOT NULL)"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS takt (" +
      "eins INTEGER PRIMARY KEY CHECK (eins = 1), fenster INTEGER, anzahl INTEGER)"
    );

    /* --- Anhaenge (Bilder an Aufgaben) --------------------------------
     * Getrennt vom Listenpaket: ein Listenpaket geht bei JEDER Aenderung
     * vollstaendig neu ueber die Leitung - laege ein Foto darin, ginge es
     * bei jedem Haekchen mit.
     * Die Daten kommen fertig verschluesselt an. Der Server speichert und
     * liefert aus, mehr nicht: kein Umwandeln, kein Verkleinern, keine
     * Vorschaubilder. Jeder Eingriff macht sie unlesbar. */
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS anhaenge (" +
      "anhang TEXT PRIMARY KEY, liste TEXT NOT NULL, ersteller TEXT NOT NULL, " +
      "daten TEXT NOT NULL, groesse INTEGER NOT NULL, geladen INTEGER NOT NULL)"
    );
    this.sql.exec(
      "CREATE INDEX IF NOT EXISTS anhaenge_liste ON anhaenge (liste)"
    );
    // Wer hat welchen Anhang schon geholt? Ein Eintrag je erfolgreichem GET.
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS anhang_geholt (" +
      "anhang TEXT NOT NULL, kennung TEXT NOT NULL, zeit INTEGER NOT NULL, " +
      "PRIMARY KEY (anhang, kennung))"
    );
    // Bereits aufgeraeumte Anhaenge. Nur die Kennung, keine Daten - damit
    // eine spaetere Anfrage 410 (war da, ist weg) statt 404 bekommt. Die App
    // laesst den Anhang daraufhin vom Ersteller neu hochladen.
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS anhang_weg (" +
      "anhang TEXT PRIMARY KEY, liste TEXT NOT NULL, zeit INTEGER NOT NULL)"
    );
  }

  /* ---------- Hilfen ------------------------------------------------ */

  kanalZeile() {
    const r = this.sql.exec("SELECT * FROM kanal WHERE eins = 1").toArray();
    return r.length ? r[0] : null;
  }

  zugriffMerken() {
    const jetzt = Date.now();
    this.sql.exec(
      "UPDATE kanal SET letzter_zugriff = ?, warnung_ab = NULL WHERE eins = 1", jetzt
    );
    // Wecker neu stellen: in einem Jahr nachsehen
    try { this.ctx.storage.setAlarm(jetzt + JAHR); } catch (_e) {}
  }

  warnungBlock(k) {
    if (!k || !k.warnung_ab) return null;
    const loeschenAm = k.warnung_ab + WOCHE;
    return {
      grund: "ein Jahr ohne Nutzung",
      loeschenAm: new Date(loeschenAm).toISOString(),
      tageRest: Math.max(0, Math.ceil((loeschenAm - Date.now()) / (24 * 60 * 60 * 1000))),
      hinweis: "Dieser Kanal wird gelöscht. Jede Nutzung hält ihn am Leben. " +
               "Sichere die Aufgaben vorher auf dem Gerät."
    };
  }

  // 60 Anfragen je Minute und Kanal
  taktUeberschritten() {
    const jetzt = Date.now();
    const fenster = Math.floor(jetzt / 60000);
    const r = this.sql.exec("SELECT fenster, anzahl FROM takt WHERE eins = 1").toArray();
    let anzahl = 1;
    if (r.length && r[0].fenster === fenster) anzahl = (r[0].anzahl || 0) + 1;
    this.sql.exec(
      "INSERT INTO takt (eins, fenster, anzahl) VALUES (1, ?, ?) " +
      "ON CONFLICT(eins) DO UPDATE SET fenster = excluded.fenster, anzahl = excluded.anzahl",
      fenster, anzahl
    );
    if (anzahl > ANFRAGEN_MINUTE) {
      return new Date((fenster + 1) * 60000).toISOString();
    }
    return null;
  }

  gesperrt(herkunft) {
    const r = this.sql.exec(
      "SELECT versuche, bis FROM bremse WHERE herkunft = ?", herkunft
    ).toArray();
    if (r.length && r[0].bis && r[0].bis > Date.now()) return new Date(r[0].bis).toISOString();
    return null;
  }

  fehlversuch(herkunft) {
    const jetzt = Date.now();
    const r = this.sql.exec(
      "SELECT versuche FROM bremse WHERE herkunft = ?", herkunft
    ).toArray();
    const n = (r.length ? r[0].versuche : 0) + 1;
    this.sql.exec(
      "INSERT INTO bremse (herkunft, versuche, bis) VALUES (?, ?, ?) " +
      "ON CONFLICT(herkunft) DO UPDATE SET versuche = excluded.versuche, bis = excluded.bis",
      herkunft, n, n >= MAX_FEHLER ? jetzt + SPERRE : null
    );
  }

  bremseLoesen(herkunft) {
    this.sql.exec("DELETE FROM bremse WHERE herkunft = ?", herkunft);
  }

  mitglied(kennung) {
    if (!kennung) return null;
    const r = this.sql.exec("SELECT * FROM mitglieder WHERE kennung = ?", kennung).toArray();
    return r.length ? r[0] : null;
  }

  /* Aktivitaetsstempel, aber sparsam: hoechstens einmal je STEMPEL_TAKT.
     Daran haengen nur Fristen von 7 und 30 Tagen - auf die Minute genau
     muss das nicht sein, und jeder Schreibvorgang kostet. */
  stempelWennNoetig(kennung) {
    if (!kennung) return;
    try {
      const jetzt = Date.now();
      const r = this.sql.exec(
        "SELECT zuletzt FROM mitglieder WHERE kennung = ?", kennung
      ).toArray();
      if (!r.length) return;
      if (jetzt - (Number(r[0].zuletzt) || 0) < STEMPEL_TAKT) return;
      this.sql.exec("UPDATE mitglieder SET zuletzt = ? WHERE kennung = ?", jetzt, kennung);
    } catch (_e) { /* ein fehlender Stempel darf nie einen Weg blockieren */ }
  }

  // Darf diese Kennung die Liste sehen bzw. oeffnen?
  darfListe(liste, kennung) {
    if (!liste) return false;
    if (liste.offen) return true;
    // Der Ersteller kommt immer an seine eigene Liste. Ohne diese Zeile
    // sperrt er sich selbst aus, sobald er sie an jemanden freigibt:
    // die erste Freigabe setzt offen = 0, und in "freigaben" steht nur der
    // Beschenkte. Er duerfte die Liste dann noch loeschen und ihre Rechte
    // aendern (beides prueft "listen.ersteller"), aber weder lesen noch
    // schreiben. Den Listenschluessel hat er ohnehin - er hat ihn erzeugt.
    if (kennung && gleich(liste.ersteller, kennung)) return true;
    const r = this.sql.exec(
      "SELECT 1 AS ja FROM freigaben WHERE liste = ? AND kennung = ?", liste.liste, kennung
    ).toArray();
    return r.length > 0;
  }

  /* ---------- Anhaenge: Aufraeumen ------------------------------------
   * Der Server ist Durchgangsstation, kein Archiv. Die Wahrheit liegt auf
   * den Geraeten; der Server bringt sie nur von einem zum anderen.
   * Weil das hochladende Geraet seinen Anhang dauerhaft behaelt, darf hier
   * grosszuegig geloescht werden - fehlt spaeter etwas, laedt der Ersteller
   * es erneut hoch (siehe 410 in anhangHolen).
   * -------------------------------------------------------------------- */

  // Geraete, auf die ein Anhang wartet: die zum Zeitpunkt des Hochladens
  // aktiven. Bewusst JE ANHANG ab dessen Hochladen gerechnet, nicht global -
  // ein Anhang von heute wartet auf die zuletzt aktiven Geraete, einer von
  // naechster Woche auf die dann aktiven.
  mitzaehlende(geladen, ersteller) {
    const grenze = geladen - ANHANG_AKTIV;
    return this.sql.exec(
      "SELECT kennung FROM mitglieder WHERE zuletzt >= ? AND kennung <> ?", grenze, ersteller
    ).toArray().map((m) => m.kennung);
  }

  // Kann dieser Anhang weg? Entweder haben ihn alle mitzaehlenden Geraete
  // geholt - oder die Notfrist ist abgelaufen.
  anhangFertig(a, jetzt) {
    if (jetzt - a.geladen >= ANHANG_NOTFRIST) return true;   // Notausgang
    const warten = this.mitzaehlende(a.geladen, a.ersteller);
    if (!warten.length) return false;   // niemand sonst aktiv: liegen lassen
    const geholt = this.sql.exec(
      "SELECT kennung FROM anhang_geholt WHERE anhang = ?", a.anhang
    ).toArray().map((g) => g.kennung);
    return warten.every((k) => geholt.indexOf(k) !== -1);
  }

  anhangLoeschen(a) {
    this.sql.exec(
      "INSERT INTO anhang_weg (anhang, liste, zeit) VALUES (?, ?, ?) " +
      "ON CONFLICT(anhang) DO NOTHING",
      a.anhang, a.liste, Date.now()
    );
    this.sql.exec("DELETE FROM anhaenge WHERE anhang = ?", a.anhang);
    this.sql.exec("DELETE FROM anhang_geholt WHERE anhang = ?", a.anhang);
  }

  // Wird bei jedem Anhang-Zugriff mitgelaufen. Bewusst gedrosselt: laeuft im
  // Anfrageweg und darf nicht bei jedem Aufruf die ganze Tabelle durchgehen.
  // Der Wecker des Kanals taugt dafuer nicht - der schaut nur einmal im Jahr
  // nach, weil er fuer das Loeschen ungenutzter Kanaele da ist.
  anhaengeAufraeumen(sofort) {
    const jetzt = Date.now();
    if (!sofort && this.letztesAufraeumen && jetzt - this.letztesAufraeumen < AUFRAEUM_TAKT) {
      return;
    }
    this.letztesAufraeumen = jetzt;

    // Zuerst die verwaisten Geraete: sonst halten sie Anhaenge auf, obwohl
    // sie ohnehin nicht mehr dazugehoeren.
    try { this.verwaisteGeraete(jetzt); } catch (_e) {}

    let alle = [];
    try {
      alle = this.sql.exec(
        "SELECT anhang, liste, ersteller, groesse, geladen FROM anhaenge"
      ).toArray();
    } catch (_e) { return; }
    for (const a of alle) {
      try { if (this.anhangFertig(a, jetzt)) this.anhangLoeschen(a); }
      catch (_e) { /* ein Anhang darf den Rest nicht aufhalten */ }
    }
    // Merkzettel der geloeschten nicht endlos wachsen lassen. Nach dieser
    // Frist gibt es 404 statt 410 - dann ist die Aufgabe ohnehin lange weg.
    try {
      this.sql.exec("DELETE FROM anhang_weg WHERE zeit < ?", jetzt - ANHANG_MERK);
    } catch (_e) {}
  }

  // Geraete, die sich einen Monat nicht gemeldet haben, verlassen den Kanal.
  // WICHTIG: nur das Geraet geht - Listen, Aufgaben und Anhaenge bleiben.
  // Es kann jederzeit mit Code und Passwort neu beitreten.
  verwaisteGeraete(jetzt) {
    const grenze = jetzt - GERAET_VERWAIST;
    let raus = [];
    try {
      const k = this.kanalZeile();
      raus = this.sql.exec(
        "SELECT kennung FROM mitglieder WHERE zuletzt < ? AND kennung <> ?",
        grenze, k ? (k.gruender || "") : ""
      ).toArray();
    } catch (_e) { return 0; }
    for (const m of raus) {
      try {
        // Nur die Zugehoerigkeit loesen. KEIN Listeninhalt anfassen.
        this.sql.exec("DELETE FROM mitglieder WHERE kennung = ?", m.kennung);
        this.sql.exec("DELETE FROM freigaben WHERE kennung = ?", m.kennung);
        this.sql.exec("DELETE FROM anhang_geholt WHERE kennung = ?", m.kennung);
      } catch (_e) {}
    }
    return raus.length;
  }

  /* ---------- Wecker: Vorwarnung und Loeschen ------------------------ */

  async alarm() {
    const k = this.kanalZeile();
    if (!k) return;
    const jetzt = Date.now();
    if (jetzt - k.letzter_zugriff < JAHR) {
      // zwischenzeitlich benutzt - neuen Wecker stellen
      this.ctx.storage.setAlarm(k.letzter_zugriff + JAHR);
      return;
    }
    if (!k.warnung_ab) {
      // Vorwarnung setzen, in einer Woche noch einmal nachsehen
      this.sql.exec("UPDATE kanal SET warnung_ab = ? WHERE eins = 1", jetzt);
      this.ctx.storage.setAlarm(jetzt + WOCHE);
      return;
    }
    if (jetzt - k.warnung_ab >= WOCHE) {
      // Woche abgelaufen - alles loeschen
      await this.ctx.storage.deleteAll();
    }
  }

  /* ---------- HTTP ---------------------------------------------------- */

  /* Einstiegspunkt des Kanal-Objekts.
     Dieser Methodenkopf ist beim Chat-Ausbau am 30.08.2026 (Commit
     7ec266d) versehentlich mit entfernt worden - zusammen mit den drei
     Leitungs-Rueckrufen, die direkt darueber standen. Ohne ihn stand
     alles ab "/kanal-sicherung" lose im Klassenrumpf; der Erbauer las
     "if (...)" als Methodennamen und brach ab ("Expected ')' but found
     '.'"). Der Commit liess sich deshalb nie veroeffentlichen - genau
     das war die Luecke zwischen dem eingesetzten Stand vom 25.08. und
     GitHub.
     Wiederhergestellt am 07.09.2026, ohne die Chat-Zeile, die den Weg
     "/draht" an eine eigene Methode weiterreichte. Die gehoerte zum
     ausgebauten Chat und bleibt weg. */
  async fetch(request) {
    const url = new URL(request.url);

    /* Sicherung eines Kanals. Erreichbar nur ueber diesen Pfad, den der
       Zaehler ausschliesslich nach Admin-Pruefung setzt - oeffentliche
       Anfragen landen auf /dv und koennen ihn nicht treffen. */
    if (url.pathname === "/kanal-sicherung") {
      const tabellen = ["kanal", "mitglieder", "listen", "freigaben",
                        "einladungen", "takt", "anhaenge", "anhang_geholt", "marken"];
      const aus = {};
      for (const t of tabellen) {
        try { aus[t] = this.sql.exec("SELECT * FROM " + t).toArray(); }
        catch (_e) { aus[t] = []; }   // Tabelle gibt es in diesem Kanal nicht
      }
      // "bremse" bleibt bewusst draussen: reine Sperrzeiten, nach dem
      // Zurueckspielen falsch und ohne Wert.
      return jsonAntwort({ ok: true, tabellen: aus });
    }

    if (url.pathname === "/kanal-einspielen") {
      let rumpf = {};
      try { rumpf = await request.json(); } catch (_e) { rumpf = {}; }
      const tab = (rumpf && rumpf.tabellen) || {};
      let zeilen = 0;
      for (const name of Object.keys(tab)) {
        if (!/^[a-z_]{3,20}$/.test(name)) continue;
        const liste = Array.isArray(tab[name]) ? tab[name] : [];
        for (const z of liste) {
          if (!z || typeof z !== "object") continue;
          const spalten = Object.keys(z).filter((s) => /^[a-z_0-9]{1,30}$/.test(s));
          if (!spalten.length) continue;
          const platz = spalten.map(() => "?").join(", ");
          try {
            this.sql.exec(
              "INSERT OR REPLACE INTO " + name + " (" + spalten.join(", ") + ") VALUES (" + platz + ")",
              ...spalten.map((s) => z[s])
            );
            zeilen++;
          } catch (_e) { /* Spalte kennt diese Fassung nicht - weiter */ }
        }
      }
      return jsonAntwort({ ok: true, zeilen: zeilen });
    }
    // Kennzahlen fuer die Aufsicht. Erreichbar nur ueber diesen Pfad, den der
    // Worker ausschliesslich nach Admin-Pruefung setzt - oeffentliche Anfragen
    // landen immer auf /dv und koennen ihn nicht treffen.
    if (url.pathname === "/aufsicht") {
      const k = this.kanalZeile();
      if (!k) return jsonAntwort({ da: false });
      const m = this.sql.exec("SELECT COUNT(*) AS n FROM mitglieder").toArray()[0].n;
      const l = this.sql.exec("SELECT COUNT(*) AS n FROM listen").toArray()[0].n;
      const lb = this.sql.exec("SELECT COALESCE(SUM(LENGTH(daten)),0) AS n FROM listen").toArray()[0].n;
      // Anhaenge mitzaehlen - sonst zeigt der Serverstatus zu wenig Platzbedarf.
      let ah = 0, ahb = 0;
      try {
        const z = this.sql.exec(
          "SELECT COUNT(*) AS n, COALESCE(SUM(groesse),0) AS b FROM anhaenge"
        ).toArray()[0];
        ah = z.n; ahb = z.b;
      } catch (_e) { /* alte Kanaele ohne Tabelle */ }
      return jsonAntwort({
        da: true, code: k.code, offen: !!k.offen, stand: k.stand,
        mitglieder: m, nachrichten: 0, listen: l,
        anhaenge: ah, anhaengeBytes: ahb,
        dbBytes: echteGroesse(this.sql),
        bytes: (k.daten || "").length + lb + ahb,
        leitungen: 0,
        angelegt: new Date(k.angelegt).toISOString(),
        letzterZugriff: new Date(k.letzter_zugriff).toISOString(),
        warnung: !!k.warnung_ab
      });
    }
    const method = request.method.toUpperCase();
    const teil = url.searchParams.get("weg") || "";
    const herkunft = (request.headers.get("cf-connecting-ip") || "unbekannt").slice(0, 64);

    let daten = {};
    if (method === "POST") { try { daten = await request.json(); } catch (_e) { daten = {}; } }
    const feld = (name, max) => {
      const v = (method === "POST" && daten[name] != null) ? daten[name] : url.searchParams.get(name);
      return String(v == null ? "" : v).slice(0, max || 8192);
    };

    const unbekannt = () => jsonAntwort({ fehler: "Diesen Kanal gibt es nicht." }, 404);
    const falsch = () => jsonAntwort({ fehler: "Passwort stimmt nicht." }, 401);

    /* --- Anlegen: nur wenn dieses Objekt noch leer ist --------------- */
    if (teil === "neu" && method === "POST") {
      if (this.kanalZeile()) return jsonAntwort({ fehler: "belegt" }, 409);
      for (const f of ["code", "pruefwert", "salzP", "paketP", "salzR", "paketR"]) {
        if (!daten[f]) return jsonAntwort({ fehler: "Es fehlen Angaben zum Anlegen des Kanals." }, 400);
      }
      const jetzt = Date.now();
      this.sql.exec(
        "INSERT INTO kanal (eins, code, name, pruefwert, salz_p, paket_p, salz_r, paket_r, " +
        "daten, stand, offen, gruender, naechste_nummer, angelegt, letzter_zugriff, warnung_ab) " +
        "VALUES (1, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 1, '', 1, ?, ?, NULL)",
        String(daten.code), String(daten.name || "Kanal").slice(0, 60), String(daten.pruefwert),
        String(daten.salzP), String(daten.paketP), String(daten.salzR), String(daten.paketR),
        jetzt, jetzt
      );
      // Sammelansicht "alle" gibt es einfach - sie wird nicht angelegt.
      this.sql.exec(
        "INSERT OR IGNORE INTO listen (liste, ersteller, name, offen, daten, stand) " +
        "VALUES ('alle', '', '', 1, NULL, 0)"
      );
      this.ctx.storage.setAlarm(jetzt + JAHR);
      return jsonAntwort({ code: String(daten.code) });
    }

    const k = this.kanalZeile();
    if (!k) return unbekannt();

    /* --- Bremse je Kanal -------------------------------------------- */
    const wartenBis = this.taktUeberschritten();
    if (wartenBis) {
      return jsonAntwort({ fehler: "Zu viele Anfragen. Bitte kurz warten.", wartenBis: wartenBis }, 429);
    }

    /* --- Rettungspaket: ohne Pruefwert, dafuer streng begrenzt ------- */
    if (teil === "rettung" && method === "POST") {
      const r = this.sql.exec("SELECT versuche, bis FROM bremse WHERE herkunft = 'rettung'").toArray();
      const jetzt = Date.now();
      const offen = (r.length && r[0].bis && r[0].bis > jetzt) ? r[0].versuche : 0;
      if (offen >= 3) {
        return jsonAntwort({
          fehler: "Zu viele Wiederherstellungs-Anfragen. Bitte in einer Stunde erneut versuchen.",
          wartenBis: new Date(jetzt + 60 * 60 * 1000).toISOString()
        }, 429);
      }
      this.sql.exec(
        "INSERT INTO bremse (herkunft, versuche, bis) VALUES ('rettung', ?, ?) " +
        "ON CONFLICT(herkunft) DO UPDATE SET versuche = excluded.versuche, bis = excluded.bis",
        offen + 1, jetzt + 60 * 60 * 1000
      );
      return jsonAntwort({ salzR: k.salz_r, paketR: k.paket_r });
    }

    /* --- Salzauskunft: ohne Nachweis, dafuer streng begrenzt ---------
       Ein Salz ist kein Geheimnis - ohne Passwort ist es wertlos. Ohne
       diese Auskunft koennte niemand einem Kanal beitreten: Der Pruefwert
       entsteht erst aus Passwort UND Salz. */
    if (teil === "salz" && method === "GET") {
      const jetzt = Date.now();
      const r = this.sql.exec("SELECT versuche, bis FROM bremse WHERE herkunft = 'salz'").toArray();
      const offen = (r.length && r[0].bis && r[0].bis > jetzt) ? r[0].versuche : 0;
      if (offen >= 10) {
        return jsonAntwort({
          fehler: "Zu viele Anfragen zu diesem Kanal. Bitte in einer Stunde erneut versuchen.",
          wartenBis: new Date(jetzt + 60 * 60 * 1000).toISOString()
        }, 429);
      }
      this.sql.exec(
        "INSERT INTO bremse (herkunft, versuche, bis) VALUES ('salz', ?, ?) " +
        "ON CONFLICT(herkunft) DO UPDATE SET versuche = excluded.versuche, bis = excluded.bis",
        offen + 1, jetzt + 60 * 60 * 1000
      );
      if (!k.offen) return jsonAntwort({ fehler: "Der Kanal nimmt niemanden mehr auf." }, 403);
      // Nur diese drei Felder - niemals paketP, salzR, paketR oder Kennungen.
      return jsonAntwort({ name: k.name, salzP: k.salz_p, offen: true });
    }

    /* --- Passwort neu setzen ---------------------------------------- */
    if (teil === "passwortNeu" && method === "POST") {
      const sperre = this.gesperrt(herkunft);
      if (sperre) return jsonAntwort({ fehler: "Zu viele Fehlversuche. Bitte zehn Minuten warten.", wartenBis: sperre }, 429);
      const nachweis = feld("nachweis");
      if (!gleich(nachweis, k.pruefwert) && !gleich(nachweis, k.paket_r)) {
        this.fehlversuch(herkunft); return falsch();
      }
      for (const f of ["pruefwertNeu", "salzPNeu", "paketPNeu"]) {
        if (!daten[f]) return jsonAntwort({ fehler: "Es fehlen Angaben für das neue Passwort." }, 400);
      }
      this.bremseLoesen(herkunft);
      this.sql.exec(
        "UPDATE kanal SET pruefwert = ?, salz_p = ?, paket_p = ? WHERE eins = 1",
        String(daten.pruefwertNeu), String(daten.salzPNeu), String(daten.paketPNeu)
      );
      this.zugriffMerken();
      return jsonAntwort({ ok: true });
    }

    /* --- Einladung ansehen: ohne jeden Nachweis, aber ohne Kanalcode -- */
    if (teil === "einladung" && method === "GET") {
      const marke = feld("marke", 40);
      const e = this.sql.exec("SELECT * FROM einladungen WHERE marke = ?", marke).toArray()[0];
      if (!e) return jsonAntwort({ fehler: "Diese Einladung gibt es nicht." }, 404);
      if (e.ablauf < Date.now() || (e.einmalig && e.benutzt)) {
        return jsonAntwort({ fehler: "Diese Einladung ist abgelaufen." }, 410);
      }
      // Der Kanalcode wird bewusst NICHT herausgegeben.
      return jsonAntwort({
        name: k.name, salzE: e.salz_e,
        brauchtPasswort: !!(e.pruef1 || e.pruef2 || e.pruef3),
        offen: !!k.offen
      });
    }

    /* --- Beitreten mit Einladung: statt Code und Kanalpasswort -------- */
    if (teil === "beitreten" && method === "POST" && daten.marke) {
      const marke = String(daten.marke).slice(0, 40);
      const e = this.sql.exec("SELECT * FROM einladungen WHERE marke = ?", marke).toArray()[0];
      if (!e) return jsonAntwort({ fehler: "Diese Einladung gibt es nicht." }, 404);
      const jetzt = Date.now();
      if (e.ablauf < jetzt || (e.einmalig && e.benutzt)) {
        return jsonAntwort({ fehler: "Diese Einladung ist abgelaufen." }, 410);
      }
      if (e.bremse_bis && e.bremse_bis > jetzt && e.versuche >= 10) {
        return jsonAntwort({
          fehler: "Zu viele Versuche mit dieser Einladung. Bitte in einer Stunde erneut versuchen.",
          wartenBis: new Date(e.bremse_bis).toISOString()
        }, 429);
      }
      const nachweis = String(daten.pruefE || "");
      const brauchtPasswort = !!(e.pruef1 || e.pruef2 || e.pruef3);
      let passt = !brauchtPasswort;
      // Gegen die bis zu drei Passwoerter und den Hauptschluessel pruefen
      for (const p of [e.pruef1, e.pruef2, e.pruef3, e.haupt_pruef]) {
        if (p && gleich(nachweis, p)) { passt = true; break; }
      }
      if (!passt) {
        const neu = (e.versuche || 0) + 1;
        this.sql.exec("UPDATE einladungen SET versuche = ?, bremse_bis = ? WHERE marke = ?",
                      neu, jetzt + 60 * 60 * 1000, marke);
        return jsonAntwort({ fehler: "Passwort stimmt nicht." }, 401);
      }
      if (!k.offen) return jsonAntwort({ fehler: "Der Kanal nimmt niemanden mehr auf." }, 403);

      const geraet = String(daten.geraet || "").trim().slice(0, 60) || "Gerät";
      let kennung = String(daten.kennung || "").slice(0, 200);
      let m = kennung ? this.mitglied(kennung) : null;
      if (!m) {
        kennung = zufall(32);
        const nummer = k.naechste_nummer || 1;
        const erster = this.sql.exec("SELECT COUNT(*) AS n FROM mitglieder").toArray()[0].n === 0;
        this.sql.exec(
          "INSERT INTO mitglieder (kennung, nummer, geraet, name, rolle, zuletzt, oeffentlich) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?)",
          kennung, nummer, geraet, geraet, erster ? "ersteller" : "schreiben", jetzt,
          String(daten.oeffentlich || "").slice(0, 4096)
        );
        this.sql.exec("UPDATE kanal SET naechste_nummer = ? WHERE eins = 1", nummer + 1);
        if (erster) this.sql.exec("UPDATE kanal SET gruender = ? WHERE eins = 1", kennung);
        m = this.mitglied(kennung);
      }
      if (e.einmalig) this.sql.exec("UPDATE einladungen SET benutzt = 1 WHERE marke = ?", marke);
      this.sql.exec("UPDATE einladungen SET versuche = 0, bremse_bis = NULL WHERE marke = ?", marke);
      this.zugriffMerken();
      const anzahl = this.sql.exec("SELECT COUNT(*) AS n FROM mitglieder").toArray()[0].n;
      // Kein paketP - den Schluessel hat der Eingeladene aus dem Fragment des Links.
      return jsonAntwort({
        code: k.code, name: k.name, kennung: kennung,
        nummer: m.nummer, rolle: m.rolle, mitglieder: anzahl
      });
    }

    /* --- Ab hier ist der Pruefwert noetig ---------------------------- */
    const sperre = this.gesperrt(herkunft);
    if (sperre) return jsonAntwort({ fehler: "Zu viele Fehlversuche. Bitte zehn Minuten warten.", wartenBis: sperre }, 429);
    const pruefwert = feld("pruefwert");
    if (!gleich(pruefwert, k.pruefwert)) { this.fehlversuch(herkunft); return falsch(); }
    this.bremseLoesen(herkunft);

    const warnung = this.warnungBlock(k);
    this.zugriffMerken();

    /* --- Einladung praegen: nur wer den Kanal kennt ------------------- */
    if (teil === "einladung/neu" && method === "POST") {
      // Abgelaufene beim Vorbeikommen wegraeumen - kein eigener Lauf noetig.
      this.sql.exec("DELETE FROM einladungen WHERE ablauf < ?", Date.now());
      const anzahl = this.sql.exec("SELECT COUNT(*) AS n FROM einladungen").toArray()[0].n;
      if (anzahl >= 50) {
        return jsonAntwort({ fehler: "Es sind schon sehr viele Einladungen offen." }, 429);
      }
      const pruefE = Array.isArray(daten.pruefE) ? daten.pruefE.slice(0, 3) : [];
      const salzE = String(daten.salzE || "");
      if (!salzE) return jsonAntwort({ fehler: "Es fehlt das Salz für die Einladung." }, 400);
      let minuten = Number(daten.gueltigMinuten);
      if (!Number.isFinite(minuten) || minuten <= 0) minuten = 60;
      if (minuten > 10080) minuten = 10080;               // hoechstens sieben Tage
      const marke = zufall(18).replace(/[^A-Za-z0-9]/g, "").slice(0, 22);
      // Hauptschluessel: der Server wuerfelt ihn und zeigt ihn genau einmal.
      const hauptWort = zufall(12).replace(/[^A-Za-z0-9]/g, "").slice(0, 14);
      const hauptPruef = String(daten.hauptPruef || hauptWort);
      const ablauf = Date.now() + minuten * 60000;
      this.sql.exec(
        "INSERT INTO einladungen (marke, salz_e, pruef1, pruef2, pruef3, haupt_pruef, " +
        "ablauf, einmalig, benutzt, versuche, bremse_bis, erstellt) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?)",
        marke, salzE,
        pruefE[0] ? String(pruefE[0]) : null,
        pruefE[1] ? String(pruefE[1]) : null,
        pruefE[2] ? String(pruefE[2]) : null,
        hauptPruef, ablauf, daten.einmalig === false ? 0 : 1, Date.now()
      );
      return jsonAntwort({
        marke: marke, hauptPruef: hauptPruef, hauptWort: hauptWort,
        ablauf: new Date(ablauf).toISOString()
      });
    }

    /* --- Einladungen auflisten und loeschen --------------------------- */
    if (teil === "einladungen" && method === "GET") {
      // Mitglied hier selbst nachschlagen - die gemeinsame Pruefung kommt erst weiter unten.
      if (!this.mitglied(feld("kennung", 200))) {
        return jsonAntwort({ fehler: "Dieses Gerät gehört nicht zum Kanal." }, 403);
      }
      const alle = this.sql.exec(
        "SELECT marke, ablauf, einmalig, benutzt, pruef1, pruef2, pruef3 FROM einladungen ORDER BY erstellt DESC"
      ).toArray();
      return jsonAntwort({ einladungen: alle.map((e) => ({
        marke: e.marke, ablauf: new Date(e.ablauf).toISOString(),
        einmalig: !!e.einmalig, benutzt: !!e.benutzt,
        anzahlPasswoerter: [e.pruef1, e.pruef2, e.pruef3].filter(Boolean).length
      })) });
    }
    if (teil === "einladung/loeschen" && method === "POST") {
      if (!this.mitglied(feld("kennung", 200))) {
        return jsonAntwort({ fehler: "Dieses Gerät gehört nicht zum Kanal." }, 403);
      }
      this.sql.exec("DELETE FROM einladungen WHERE marke = ?", String(daten.marke || ""));
      return jsonAntwort({ ok: true });
    }

    /* --- Beitreten --------------------------------------------------- */
    if (teil === "beitreten" && method === "POST") {
      const geraet = feld("geraet", 60).trim() || "Gerät";
      let kennung = feld("kennung", 200);
      let m = kennung ? this.mitglied(kennung) : null;
      if (!m) {
        if (!k.offen) {
          return jsonAntwort({ fehler: "Der Kanal nimmt niemanden mehr auf." }, 403);
        }
        kennung = zufall(32);
        const nummer = k.naechste_nummer || 1;
        const erster = this.sql.exec("SELECT COUNT(*) AS n FROM mitglieder").toArray()[0].n === 0;
        this.sql.exec(
          "INSERT INTO mitglieder (kennung, nummer, geraet, name, rolle, zuletzt, oeffentlich) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?)",
          kennung, nummer, geraet, geraet, erster ? "ersteller" : "schreiben", Date.now(),
          String(daten.oeffentlich || "").slice(0, 4096)
        );
        this.sql.exec("UPDATE kanal SET naechste_nummer = ? WHERE eins = 1", nummer + 1);
        if (erster) {
          this.sql.exec("UPDATE kanal SET gruender = ? WHERE eins = 1", kennung);
          this.sql.exec("UPDATE listen SET ersteller = ? WHERE liste = 'alle'", kennung);
        }
        m = this.mitglied(kennung);
      } else {
        this.sql.exec("UPDATE mitglieder SET geraet = ?, zuletzt = ? WHERE kennung = ?",
                      geraet, Date.now(), kennung);
        // Neuer oeffentlicher Schluessel ueberschreibt den alten. Bestehende
        // Freigaben werden dadurch fuer dieses Geraet unlesbar - der Ersteller
        // muss dann neu freigeben.
        if (daten.oeffentlich) {
          this.sql.exec("UPDATE mitglieder SET oeffentlich = ? WHERE kennung = ?",
                        String(daten.oeffentlich).slice(0, 4096), kennung);
        }
      }
      const anzahl = this.sql.exec("SELECT COUNT(*) AS n FROM mitglieder").toArray()[0].n;
      return jsonAntwort({
        name: k.name, salzP: k.salz_p, paketP: k.paket_p,
        mitglieder: anzahl, kennung: kennung, nummer: m.nummer, rolle: m.rolle,
        warnung: warnung
      });
    }

    /* --- Aufgaben senden --------------------------------------------- */
    if (teil === "senden" && method === "POST") {
      const inhalt = String(daten.daten == null ? "" : daten.daten);
      if (inhalt.length > MAX_DATEN) {
        return jsonAntwort({ fehler: "Der Aufgabenbestand ist zu groß (höchstens 2 MB)." }, 413);
      }
      const stand = Number(daten.stand);
      if (!Number.isFinite(stand) || stand < 0) {
        return jsonAntwort({ fehler: "Es fehlt die Standnummer." }, 400);
      }
      if (stand < k.stand) return jsonAntwort({ stand: k.stand }, 409);
      const neu = k.stand + 1;
      this.sql.exec("UPDATE kanal SET daten = ?, stand = ? WHERE eins = 1", inhalt, neu);
      return jsonAntwort({ stand: neu, warnung: warnung });
    }

    /* --- Aufgaben holen ---------------------------------------------- */
    if (teil === "holen" && method === "GET") {
      const seit = Number(url.searchParams.get("seit") || 0);
      if (Number.isFinite(seit) && seit >= k.stand) {
        return jsonAntwort({ stand: k.stand, warnung: warnung });
      }
      return jsonAntwort({ stand: k.stand, daten: k.daten || "", warnung: warnung });
    }

    /* --- Schliessen / Oeffnen / Behalten / Zustand -------------------- */
    if ((teil === "schliessen" || teil === "oeffnen") && method === "POST") {
      this.sql.exec("UPDATE kanal SET offen = ? WHERE eins = 1", teil === "oeffnen" ? 1 : 0);
      return jsonAntwort({ ok: true, offen: teil === "oeffnen", warnung: warnung });
    }
    if (teil === "behalten" && method === "POST") {
      return jsonAntwort({ ok: true, hinweis: "Kanal bleibt erhalten." });
    }
    if (teil === "zustand" && method === "GET") {
      const anzahl = this.sql.exec("SELECT COUNT(*) AS n FROM mitglieder").toArray()[0].n;
      return jsonAntwort({
        name: k.name, offen: !!k.offen, stand: k.stand, mitglieder: anzahl,
        nachrichten: 0, groesse: (k.daten || "").length, warnung: warnung
      });
    }

    /* ================================================================
     * Ab hier: Wege, die zusaetzlich die Geraete-Kennung verlangen
     * ================================================================ */
    const kennung = feld("kennung", 200);
    const ich = this.mitglied(kennung);
    const brauchtKennung = (teil === "mitglieder" || teil === "mitglieder/rolle" ||
      teil.indexOf("listen") === 0 || teil.indexOf("anhang") === 0);
    if (brauchtKennung && !ich) {
      return jsonAntwort({ fehler: "Dieses Gerät gehört nicht zum Kanal." }, 403);
    }

    /* Meldung des Geraets festhalten. Daran haengt, wer beim Aufraeumen der
     * Anhaenge mitzaehlt (7 Tage) und wer nach einem Monat aus dem Kanal
     * faellt. Ohne diesen Stempel wuerde nie jemand als aktiv gelten. */
    if (ich) this.stempelWennNoetig(kennung);

    /* --- Mitglieder ansehen ------------------------------------------ */
    if (teil === "mitglieder" && method === "GET") {
      // Nie die Kennung herausgeben - nur Nummer, Anzeigename und Rolle.
      const alle = this.sql.exec(
        "SELECT nummer, name, rolle, oeffentlich FROM mitglieder ORDER BY nummer"
      ).toArray();
      return jsonAntwort({ mitglieder: alle.map((m) => ({
        nummer: m.nummer, name: m.name, rolle: m.rolle,
        oeffentlich: m.oeffentlich || ""
      })) });
    }

    /* --- Rolle setzen: nur der Kanalgruender -------------------------- */
    if (teil === "mitglieder/rolle" && method === "POST") {
      if (!gleich(kennung, k.gruender)) {
        return jsonAntwort({ fehler: "Das darf nur, wer den Kanal angelegt hat." }, 403);
      }
      const fuer = Number(daten.fuer);
      const rolle = String(daten.rolle || "");
      if (["ersteller", "schreiben", "ansehen"].indexOf(rolle) === -1) {
        return jsonAntwort({ fehler: "Unbekannte Rolle." }, 400);
      }
      const ziel = this.sql.exec("SELECT kennung FROM mitglieder WHERE nummer = ?", fuer).toArray();
      if (!ziel.length) return jsonAntwort({ fehler: "Dieses Mitglied gibt es nicht." }, 404);
      if (gleich(ziel[0].kennung, k.gruender)) {
        return jsonAntwort({ fehler: "Die Rolle des Kanalgründers lässt sich nicht ändern." }, 403);
      }
      this.sql.exec("UPDATE mitglieder SET rolle = ? WHERE nummer = ?", rolle, fuer);
      return jsonAntwort({ ok: true });
    }

    /* --- Listen anlegen ---------------------------------------------- */
    if (teil === "listen/neu" && method === "POST") {
      if (ich.rolle === "ansehen") {
        return jsonAntwort({ fehler: "Zum Anlegen einer Liste fehlt die Berechtigung." }, 403);
      }
      const liste = feld("liste", 120);
      if (!liste) return jsonAntwort({ fehler: "Es fehlt die Kennung der Liste." }, 400);
      const da = this.sql.exec("SELECT 1 AS ja FROM listen WHERE liste = ?", liste).toArray();
      if (da.length) return jsonAntwort({ fehler: "Diese Liste gibt es schon." }, 409);
      this.sql.exec(
        "INSERT INTO listen (liste, ersteller, name, offen, daten, stand) VALUES (?, ?, ?, ?, NULL, 0)",
        liste, kennung, String(daten.name || ""), daten.offen === 0 ? 0 : 1
      );
      return jsonAntwort({ ok: true, liste: liste });
    }

    /* --- Liste freigeben / sperren / Rechte: nur ihr Ersteller -------- */
    if ((teil === "listen/freigeben" || teil === "listen/sperren" || teil === "listen/rechte")
        && method === "POST") {
      const liste = feld("liste", 120);
      const l = this.sql.exec("SELECT * FROM listen WHERE liste = ?", liste).toArray()[0];
      if (!l) return jsonAntwort({ fehler: "Diese Liste gibt es nicht." }, 404);
      if (!gleich(l.ersteller, kennung)) {
        return jsonAntwort({ fehler: "Das darf nur, wer die Liste angelegt hat." }, 403);
      }

      if (teil === "listen/rechte") {
        const sicht = String(daten.sicht || "alle");
        const zugang = String(daten.zugang || "alle");
        if (["alle", "berechtigte"].indexOf(sicht) === -1) {
          return jsonAntwort({ fehler: "Unbekannte Einstellung für die Sichtbarkeit." }, 400);
        }
        if (["alle", "berechtigte", "berechtigte_oder_passwort", "passwort"].indexOf(zugang) === -1) {
          return jsonAntwort({ fehler: "Unbekannte Einstellung für den Zugang." }, 400);
        }
        // Name mitaendern, falls dabei - er ist verschluesselt, der Server prueft ihn nicht.
        if (typeof daten.name === "string" && daten.name !== "") {
          this.sql.exec("UPDATE listen SET name = ? WHERE liste = ?",
                        String(daten.name).slice(0, 2048), liste);
        }
        this.sql.exec(
          "UPDATE listen SET sicht = ?, zugang = ?, salz_l = ?, paket_l = ?, pruef_l = ?, offen = ? WHERE liste = ?",
          sicht, zugang,
          daten.salzL == null ? null : String(daten.salzL),
          daten.paketL == null ? null : String(daten.paketL),
          daten.pruefL == null ? null : String(daten.pruefL),
          (sicht === "alle" && zugang === "alle") ? 1 : 0,
          liste
        );
        return jsonAntwort({ ok: true });
      }

      // In "fuer" steht die oeffentliche Mitgliedsnummer, nicht die Kennung.
      const fuer = Number(daten.fuer);
      const ziel = this.sql.exec("SELECT kennung FROM mitglieder WHERE nummer = ?", fuer).toArray();
      if (!ziel.length) return jsonAntwort({ fehler: "Dieses Mitglied gibt es nicht." }, 404);

      if (teil === "listen/freigeben") {
        const paket = String(daten.paket || "");
        if (!paket) return jsonAntwort({ fehler: "Es fehlt das Schlüsselpaket für die Freigabe." }, 400);
        this.sql.exec(
          "INSERT INTO freigaben (liste, kennung, paket, seit) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(liste, kennung) DO UPDATE SET paket = excluded.paket",
          liste, ziel[0].kennung, paket, Date.now()
        );
        // Erste Freigabe schliesst die Liste fuer alle anderen
        this.sql.exec("UPDATE listen SET offen = 0 WHERE liste = ?", liste);
      } else {
        this.sql.exec("DELETE FROM freigaben WHERE liste = ? AND kennung = ?", liste, ziel[0].kennung);
      }
      return jsonAntwort({ ok: true });
    }

    /* --- Listen ansehen ---------------------------------------------- */
    if (teil === "listen" && method === "GET") {
      /* Zwei Dinge machten diesen Weg teuer - er ist der meistgerufene
         ueberhaupt (im Fehlerbuch 22 Aufrufe in 8 Sekunden):
         1. "SELECT *" holte auch die Spalte "daten" mit - die
            verschluesselten Listeninhalte, teils sehr gross, hier aber gar
            nicht gebraucht.
         2. Fuer JEDE Liste folgte eine eigene Freigabe-Abfrage. Bei 20
            Listen also 21 Abfragen. Jetzt eine einzige vorab.
         Genau diese Last hat das Objekt in die Zeitgrenze getrieben. */
      const alle = this.sql.exec(
        "SELECT liste, name, sicht, zugang, stand, offen, ersteller, salz_l, paket_l FROM listen"
      ).toArray();
      const meineFreigaben = {};
      try {
        for (const f of this.sql.exec(
          "SELECT liste, paket FROM freigaben WHERE kennung = ?", kennung
        ).toArray()) meineFreigaben[f.liste] = f.paket;
      } catch (_e) { /* ohne Freigaben gilt nur "offen" */ }

      const raus = [];
      for (const l of alle) {
        const meinPaket = meineFreigaben[l.liste];
        const berechtigt = !!l.offen || meinPaket !== undefined;
        // Unsichtbare Listen tauchen gar nicht erst auf
        if (l.sicht === "berechtigte" && !berechtigt) continue;
        const eintrag = {
          liste: l.liste, name: l.name, sicht: l.sicht, zugang: l.zugang,
          stand: l.stand, offen: !!l.offen,
          meins: gleich(l.ersteller, kennung)
        };
        if (berechtigt && meinPaket !== undefined) eintrag.paket = meinPaket;
        if (!berechtigt && (l.zugang === "berechtigte_oder_passwort" || l.zugang === "passwort")) {
          // Zugang ueber das Listenpasswort moeglich - Salz und Paket mitgeben
          if (l.salz_l) { eintrag.salzL = l.salz_l; eintrag.paketL = l.paket_l; }
        }
        eintrag.gesperrt = !berechtigt && !eintrag.salzL;
        raus.push(eintrag);
      }
      return jsonAntwort({ listen: raus });
    }

    /* --- Liste loeschen: nur ihr Ersteller ---------------------------- */
    if (teil === "listen/loeschen" && method === "POST") {
      const liste = feld("liste", 120);
      if (liste === "alle") {
        return jsonAntwort({ fehler: "Die Sammelansicht lässt sich nicht löschen." }, 400);
      }
      const l = this.sql.exec("SELECT * FROM listen WHERE liste = ?", liste).toArray()[0];
      if (!l) return jsonAntwort({ fehler: "Diese Liste gibt es nicht." }, 404);
      if (!gleich(l.ersteller, kennung)) {
        return jsonAntwort({ fehler: "Das darf nur, wer die Liste angelegt hat." }, 403);
      }
      this.sql.exec("DELETE FROM freigaben WHERE liste = ?", liste);
      // Anhaenge gehen mit. Sonst blieben Bilder liegen, deren Liste es nicht
      // mehr gibt: das Aufraeumen wuerde sie nie anfassen, und sie belegten
      // dauerhaft Platz im Kanal.
      try {
        const raus = this.sql.exec("SELECT anhang FROM anhaenge WHERE liste = ?", liste).toArray();
        for (const a of raus) {
          this.sql.exec("DELETE FROM anhang_geholt WHERE anhang = ?", a.anhang);
        }
        this.sql.exec("DELETE FROM anhaenge WHERE liste = ?", liste);
        // Auch die Merkzettel: die Liste ist weg, ein 410 ergaebe keinen Sinn
        // mehr - die App soll den Anhang nicht neu hochladen.
        this.sql.exec("DELETE FROM anhang_weg WHERE liste = ?", liste);
      } catch (_e) { /* Kanal von vor den Anhaengen */ }
      this.sql.exec("DELETE FROM listen WHERE liste = ?", liste);
      return jsonAntwort({ ok: true });
    }

    /* --- Listendaten senden ------------------------------------------ */
    if (teil === "listen/senden" && method === "POST") {
      if (ich.rolle === "ansehen") {
        return jsonAntwort({ fehler: "Zum Ändern fehlt die Berechtigung." }, 403);
      }
      const liste = feld("liste", 120);
      const l = this.sql.exec("SELECT * FROM listen WHERE liste = ?", liste).toArray()[0];
      if (!l) return jsonAntwort({ fehler: "Diese Liste gibt es nicht." }, 404);
      if (liste === "alle") {
        return jsonAntwort({ fehler: "Die Sammelansicht speichert keine eigenen Daten." }, 400);
      }
      if (!this.darfListe(l, kennung)) {
        return jsonAntwort({ fehler: "Für diese Liste fehlt die Freigabe." }, 403);
      }
      const inhalt = String(daten.daten == null ? "" : daten.daten);
      if (inhalt.length > MAX_DATEN) {
        return jsonAntwort({ fehler: "Die Liste ist zu groß (höchstens 2 MB)." }, 413);
      }
      const stand = Number(daten.stand);
      if (!Number.isFinite(stand) || stand < 0) {
        return jsonAntwort({ fehler: "Es fehlt die Standnummer." }, 400);
      }
      if (stand < l.stand) return jsonAntwort({ stand: l.stand }, 409);
      const neu = l.stand + 1;
      this.sql.exec("UPDATE listen SET daten = ?, stand = ? WHERE liste = ?", inhalt, neu, liste);
      // Die anderen Geraete sofort anstossen, statt sie warten zu lassen.
      try { this.listenMeldung(liste, neu, kennung); } catch (_e) { /* nie den Upload kippen */ }
      return jsonAntwort({ stand: neu });
    }

    /* --- Listendaten holen ------------------------------------------- */
    if (teil === "listen/holen" && method === "GET") {
      const liste = feld("liste", 120);
      const l = this.sql.exec("SELECT * FROM listen WHERE liste = ?", liste).toArray()[0];
      if (!l) return jsonAntwort({ fehler: "Diese Liste gibt es nicht." }, 404);
      // Bedingung noch einmal pruefen - nie allein auf GET /listen verlassen
      if (!this.darfListe(l, kennung)) {
        return jsonAntwort({ fehler: "Für diese Liste fehlt die Freigabe." }, 403);
      }
      const seit = Number(url.searchParams.get("seit") || 0);
      if (Number.isFinite(seit) && seit >= l.stand) return jsonAntwort({ stand: l.stand });
      return jsonAntwort({ stand: l.stand, daten: l.daten || "" });
    }

    /* --- Anhang hochladen -------------------------------------------- */
    if (teil === "anhang/neu" && method === "POST") {
      if (ich.rolle === "ansehen") {
        return jsonAntwort({ fehler: "Zum Ändern fehlt die Berechtigung." }, 403);
      }
      const liste = feld("liste", 120);
      const anhang = feld("anhang", 200);
      if (!anhang) return jsonAntwort({ fehler: "Es fehlt die Kennung des Anhangs." }, 400);
      const l = this.sql.exec("SELECT * FROM listen WHERE liste = ?", liste).toArray()[0];
      if (!l) return jsonAntwort({ fehler: "Diese Liste gibt es nicht." }, 404);
      // Dieselbe Pruefung wie bei listen/holen - bewusst dieselbe Methode,
      // nicht nachgebaut. Zwei getrennte Pruefungen gehen auseinander.
      if (!this.darfListe(l, kennung)) {
        return jsonAntwort({ fehler: "Für diese Liste fehlt die Freigabe." }, 403);
      }

      // Gibt es die Kennung schon? Kein Fehlerfall - die App wertet das als
      // Erfolg und schickt nicht noch einmal.
      const da = this.sql.exec(
        "SELECT anhang, groesse FROM anhaenge WHERE anhang = ?", anhang
      ).toArray();
      if (da.length) return jsonAntwort({ anhang: anhang, groesse: da[0].groesse }, 409);

      const inhalt = String(daten.daten == null ? "" : daten.daten);
      if (!inhalt) return jsonAntwort({ fehler: "Der Anhang ist leer." }, 400);
      if (inhalt.length > MAX_ANHANG) {
        return jsonAntwort({
          fehler: "Der Anhang ist zu groß (höchstens 2 MB). Bitte ein kleineres Bild wählen."
        }, 413);
      }

      // Vor der Platzpruefung aufraeumen - sonst blockiert Altbestand,
      // der ohnehin faellig ist. Hier ohne Drosselung: es geht um die Frage,
      // ob dieser Upload Platz hat.
      this.anhaengeAufraeumen(true);
      const belegt = this.sql.exec(
        "SELECT COALESCE(SUM(groesse), 0) AS n FROM anhaenge"
      ).toArray()[0].n;
      if (belegt + inhalt.length > MAX_ANHANG_KANAL) {
        return jsonAntwort({
          fehler: "Der Kanal hat keinen Platz mehr für Anhänge (50 MB). " +
                  "Sobald alle Geräte die vorhandenen Bilder geholt haben, wird wieder Platz frei."
        }, 413);
      }

      this.sql.exec(
        "INSERT INTO anhaenge (anhang, liste, ersteller, daten, groesse, geladen) " +
        "VALUES (?, ?, ?, ?, ?, ?)",
        anhang, liste, kennung, inhalt, inhalt.length, Date.now()
      );
      // Wird der Anhang neu hochgeladen, gilt er nicht mehr als aufgeraeumt.
      this.sql.exec("DELETE FROM anhang_weg WHERE anhang = ?", anhang);
      return jsonAntwort({ anhang: anhang, groesse: inhalt.length });
    }

    /* --- Anhang holen -------------------------------------------------- */
    if (teil === "anhang" && method === "GET") {
      const anhang = feld("anhang", 200);
      if (!anhang) return jsonAntwort({ fehler: "Es fehlt die Kennung des Anhangs." }, 400);
      const a = this.sql.exec(
        "SELECT * FROM anhaenge WHERE anhang = ?", anhang
      ).toArray()[0];

      if (!a) {
        // War er schon einmal da? Dann 410 statt 404 - die App laesst ihn
        // daraufhin beim Ersteller neu anfordern.
        const weg = this.sql.exec(
          "SELECT liste FROM anhang_weg WHERE anhang = ?", anhang
        ).toArray()[0];
        if (weg) {
          // Auch hier die Freigabe pruefen: sonst verraet schon die Wahl
          // zwischen 410 und 404, ob es den Anhang je gab.
          const lw = this.sql.exec("SELECT * FROM listen WHERE liste = ?", weg.liste).toArray()[0];
          if (lw && !this.darfListe(lw, kennung)) {
            return jsonAntwort({ fehler: "Für diese Liste fehlt die Freigabe." }, 403);
          }
          return jsonAntwort({
            fehler: "Dieser Anhang wurde aufgeräumt. Er wird beim nächsten Abgleich neu geholt."
          }, 410);
        }
        return jsonAntwort({ fehler: "Diesen Anhang gibt es nicht." }, 404);
      }

      const l = this.sql.exec("SELECT * FROM listen WHERE liste = ?", a.liste).toArray()[0];
      if (!l) return jsonAntwort({ fehler: "Diese Liste gibt es nicht." }, 404);
      if (!this.darfListe(l, kennung)) {
        return jsonAntwort({ fehler: "Für diese Liste fehlt die Freigabe." }, 403);
      }

      const antwort = jsonAntwort({ anhang: a.anhang, daten: a.daten });

      // Abholung vermerken, dann nachsehen, ob der Anhang damit erledigt ist.
      // Reihenfolge wichtig: die Antwort steht schon, das Loeschen kann ihr
      // nichts mehr anhaben.
      this.sql.exec(
        "INSERT INTO anhang_geholt (anhang, kennung, zeit) VALUES (?, ?, ?) " +
        "ON CONFLICT(anhang, kennung) DO UPDATE SET zeit = excluded.zeit",
        anhang, kennung, Date.now()
      );
      try {
        const frisch = this.sql.exec(
          "SELECT anhang, liste, ersteller, groesse, geladen FROM anhaenge WHERE anhang = ?", anhang
        ).toArray()[0];
        if (frisch && this.anhangFertig(frisch, Date.now())) this.anhangLoeschen(frisch);
      } catch (_e) {}
      return antwort;
    }

    /* --- Anhänge einer Liste auflisten --------------------------------- */
    if (teil === "anhang/liste" && method === "GET") {
      const liste = feld("liste", 120);
      const l = this.sql.exec("SELECT * FROM listen WHERE liste = ?", liste).toArray()[0];
      if (!l) return jsonAntwort({ fehler: "Diese Liste gibt es nicht." }, 404);
      if (!this.darfListe(l, kennung)) {
        return jsonAntwort({ fehler: "Für diese Liste fehlt die Freigabe." }, 403);
      }
      const alle = this.sql.exec(
        "SELECT anhang, groesse, geladen FROM anhaenge WHERE liste = ? ORDER BY geladen", liste
      ).toArray();
      return jsonAntwort({
        liste: liste,
        anhaenge: alle.map((a) => ({
          anhang: a.anhang, groesse: a.groesse,
          geladen: new Date(a.geladen).toISOString()
        }))
      });
    }

    return jsonAntwort({ fehler: "Diese Auskunft gibt es nicht." }, 404);
  }
}
