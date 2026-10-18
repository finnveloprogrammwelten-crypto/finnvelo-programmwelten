package com.finnvelo.uebersetzer

import android.app.Activity
import android.app.AlertDialog
import android.content.ComponentName
import android.content.Intent
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.content.res.ColorStateList
import android.widget.LinearLayout
import android.widget.RadioGroup
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast

/** Hauptbildschirm: Knopf einschalten, Sprache waehlen, App zum Uebersetzen oeffnen. */
class MainActivity : Activity() {

    private data class App(val name: String, val paket: String, val symbol: Drawable)

    private var alleApps = emptyList<App>()
    private lateinit var appRaster: LinearLayout
    private lateinit var sprachpakete: SprachpaketListe

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        findViewById<Button>(R.id.knopf_einschalten).setOnClickListener { oeffneBedienungshilfe() }
        findViewById<Button>(R.id.knopf_app_info).setOnClickListener {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        }

        sprachpakete = SprachpaketListe(this, findViewById(R.id.sprachpakete))

        val sprache = findViewById<Spinner>(R.id.sprache)
        sprache.adapter = ArrayAdapter(
            this, android.R.layout.simple_spinner_dropdown_item, Einstellungen.SPRACHEN.map { it.second },
        )
        sprache.setSelection(Einstellungen.SPRACHEN.indexOfFirst { it.first == Einstellungen.quelle(this) }.coerceAtLeast(0))
        sprache.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) {
                Einstellungen.setzeQuelle(this@MainActivity, Einstellungen.SPRACHEN[pos].first)
                sprachpakete.aktualisiere()
            }

            override fun onNothingSelected(p: AdapterView<*>?) = Unit
        }

        val modus = findViewById<RadioGroup>(R.id.modus)
        modus.check(if (Einstellungen.texterkennung(this)) R.id.modus_ocr else R.id.modus_text)
        modus.setOnCheckedChangeListener { _, id ->
            if (id == R.id.modus_ocr && android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.R) {
                Toast.makeText(this, "Texterkennung braucht Android 11 oder neuer", Toast.LENGTH_LONG).show()
                modus.check(R.id.modus_text)
            } else {
                Einstellungen.setzeTexterkennung(this, id == R.id.modus_ocr)
            }
        }

        appRaster = findViewById(R.id.apps)

        findViewById<View>(R.id.karte_kamera).setOnClickListener {
            startActivity(Intent(this, KameraActivity::class.java))
        }

        findViewById<android.widget.Switch>(R.id.schalter_live).apply {
            isChecked = Einstellungen.automatik(this@MainActivity)
            setOnCheckedChangeListener { _, an ->
                Einstellungen.setzeAutomatik(this@MainActivity, an)
                UebersetzerDienst.instanz?.aktualisiereKnopf()
            }
        }
        val knopfModi = mapOf(R.id.knopf_immer to "immer", R.id.knopf_auto to "auto", R.id.knopf_aus to "aus")
        findViewById<RadioGroup>(R.id.knopf_modus).apply {
            val jetzt = Einstellungen.knopfModus(this@MainActivity)
            check(knopfModi.entries.first { it.value == jetzt }.key)
            setOnCheckedChangeListener { _, id ->
                val modus = knopfModi[id] ?: "immer"
                Einstellungen.setzeKnopfModus(this@MainActivity, modus)
                UebersetzerDienst.instanz?.aktualisiereKnopf()
                if (modus == "aus") Toast.makeText(this@MainActivity, "Übersetzen dann über die Kachel „DE übersetzen“", Toast.LENGTH_LONG).show()
            }
        }
        findViewById<Button>(R.id.knopf_ganz_aus).setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("DE-Knopf ganz ausschalten?")
                .setMessage("Die Bedienungshilfe wird beendet – nichts wird mehr gelesen oder übersetzt. Wieder einschalten über „Bedienungshilfen öffnen“.")
                .setPositiveButton("Ausschalten") { _, _ ->
                    UebersetzerDienst.instanz?.ganzAus()
                    findViewById<View>(R.id.status_titel).postDelayed({ onResume() }, 400)
                }
                .setNegativeButton("Abbrechen", null)
                .show()
        }
        findViewById<Button>(R.id.knopf_kachel).setOnClickListener { kachelHinzufuegen() }

        val deeplBereich = findViewById<View>(R.id.bereich_deepl)
        val mymemoryBereich = findViewById<View>(R.id.bereich_mymemory)
        val dienste = mapOf(R.id.dienst_offline to "offline", R.id.dienst_mymemory to "mymemory", R.id.dienst_deepl to "deepl")
        val zeigeDienst = { dienst: String ->
            deeplBereich.visibility = if (dienst == "deepl") View.VISIBLE else View.GONE
            mymemoryBereich.visibility = if (dienst == "mymemory") View.VISIBLE else View.GONE
        }
        findViewById<RadioGroup>(R.id.dienst).apply {
            val jetzt = Einstellungen.dienst(this@MainActivity)
            check(dienste.entries.first { it.value == jetzt }.key)
            zeigeDienst(jetzt)
            setOnCheckedChangeListener { _, id ->
                val dienst = dienste[id] ?: "offline"
                Einstellungen.setzeDienst(this@MainActivity, dienst)
                zeigeDienst(dienst)
            }
        }
        findViewById<EditText>(R.id.mymemory_email).apply {
            setText(Einstellungen.mymemoryEmail(this@MainActivity))
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = Unit
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = Unit
                override fun afterTextChanged(s: Editable?) =
                    Einstellungen.setzeMymemoryEmail(this@MainActivity, s.toString())
            })
        }
        findViewById<EditText>(R.id.deepl_schluessel).apply {
            setText(Einstellungen.deeplSchluessel(this@MainActivity))
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = Unit
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = Unit
                override fun afterTextChanged(s: Editable?) =
                    Einstellungen.setzeDeeplSchluessel(this@MainActivity, s.toString())
            })
        }
        findViewById<Button>(R.id.knopf_korrekturen).setOnClickListener {
            Woerterbuch.loescheKorrekturen(this)
            zeigeKorrekturen()
        }

        Aktualisierung.pruefe(this) { neu ->
            if (neu == null || isDestroyed) return@pruefe
            findViewById<View>(R.id.karte_update).visibility = View.VISIBLE
            findViewById<TextView>(R.id.update_titel).text = "⬆️  Version ${neu.versionName} ist da"
            findViewById<TextView>(R.id.update_text).text = neu.hinweis.ifBlank { "Eine neue Version des Übersetzers steht bereit." }
            findViewById<Button>(R.id.knopf_update).setOnClickListener {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(neu.download)))
            }
        }

        findViewById<EditText>(R.id.suche).addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = Unit
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = filtere(s.toString())
            override fun afterTextChanged(s: Editable?) = Unit
        })

        ladeApps()
    }

    override fun onResume() {
        super.onResume()
        val an = dienstAktiv()
        findViewById<TextView>(R.id.status_titel).setText(if (an) R.string.status_an_titel else R.string.status_aus_titel)
        findViewById<TextView>(R.id.status_text).setText(if (an) R.string.status_an else R.string.status_aus)
        findViewById<View>(R.id.karte_status).backgroundTintList =
            ColorStateList.valueOf(getColor(if (an) R.color.status_an else R.color.status_aus))
        findViewById<View>(R.id.einschalten_bereich).visibility = if (an) View.GONE else View.VISIBLE
        findViewById<View>(R.id.knopf_ganz_aus).visibility = if (an) View.VISIBLE else View.GONE
        // Wurde der Knopf weggezogen, Auswahl auf den aktuellen Stand bringen
        findViewById<RadioGroup>(R.id.knopf_modus).check(
            when (Einstellungen.knopfModus(this)) {
                "auto" -> R.id.knopf_auto
                "aus" -> R.id.knopf_aus
                else -> R.id.knopf_immer
            }
        )
        zeigeAbsturz()
        sprachpakete.start()
        zeigeKorrekturen()
    }

    override fun onPause() {
        sprachpakete.stopp()
        super.onPause()
    }

    private fun zeigeKorrekturen() {
        val anzahl = Woerterbuch.korrekturen(this).size
        findViewById<TextView>(R.id.korrekturen_text).text = if (anzahl == 0) {
            "Falsche Übersetzung? DE-Knopf gedrückt halten → Kasten antippen → ✏️. Das merkt sich die App."
        } else {
            "$anzahl eigene Korrektur${if (anzahl == 1) "" else "en"} gespeichert."
        }
        findViewById<View>(R.id.knopf_korrekturen).visibility = if (anzahl == 0) View.GONE else View.VISIBLE
    }

    private fun zeigeAbsturz() {
        val bericht = Absturzbericht.lies(this)
        findViewById<View>(R.id.karte_absturz).visibility = if (bericht == null) View.GONE else View.VISIBLE
        if (bericht == null) return
        findViewById<TextView>(R.id.absturz_bericht).text = bericht
        findViewById<Button>(R.id.knopf_absturz_teilen).setOnClickListener {
            val senden = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, bericht)
            startActivity(Intent.createChooser(senden, getString(R.string.absturz_teilen)))
        }
        findViewById<Button>(R.id.knopf_absturz_weg).setOnClickListener {
            Absturzbericht.loesche(this)
            zeigeAbsturz()
        }
    }

    /**
     * Oeffnet die Liste der Bedienungshilfen. Die Detailseite einer einzelnen App darf
     * nur das System oeffnen (OPEN_ACCESSIBILITY_DETAILS_SETTINGS) - das stuerzte unter
     * Android 15 ab. Der Zusatz markiert unseren Eintrag in der Liste, wo das unterstuetzt wird.
     */
    private fun oeffneBedienungshilfe() {
        val eintrag = ComponentName(this, UebersetzerDienst::class.java).flattenToString()
        val liste = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            .putExtra(":settings:fragment_args_key", eintrag)
            .putExtra(":settings:show_fragment_args", Bundle().apply { putString(":settings:fragment_args_key", eintrag) })
        try {
            startActivity(liste)
        } catch (_: RuntimeException) {
            startActivity(Intent(Settings.ACTION_SETTINGS))
        }
    }

    /** Ab Android 13 kann die App selbst fragen, ob die Kachel hinzugefuegt werden soll. */
    private fun kachelHinzufuegen() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            getSystemService(android.app.StatusBarManager::class.java).requestAddTileService(
                ComponentName(this, KachelDienst::class.java),
                getString(R.string.kachel_name),
                android.graphics.drawable.Icon.createWithResource(this, R.drawable.ic_kachel),
                mainExecutor,
            ) { }
        } else {
            AlertDialog.Builder(this)
                .setTitle("Kachel hinzufügen")
                .setMessage("Leiste oben zweimal herunterziehen → Stift-Symbol (Bearbeiten) → „DE übersetzen“ in die Kacheln ziehen.")
                .setPositiveButton("OK", null)
                .show()
        }
    }

    private fun dienstAktiv(): Boolean {
        val eigener = ComponentName(this, UebersetzerDienst::class.java)
        val aktive = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        return aktive.split(':').any { ComponentName.unflattenFromString(it) == eigener }
    }

    private fun ladeApps() {
        Thread {
            val pm = packageManager
            val start = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            val apps = pm.queryIntentActivities(start, 0)
                .filter { it.activityInfo.packageName != packageName }
                .distinctBy { it.activityInfo.packageName }
                .map { App(it.loadLabel(pm).toString(), it.activityInfo.packageName, it.loadIcon(pm)) }
                .sortedBy { it.name.lowercase() }
            runOnUiThread {
                alleApps = apps
                filtere(findViewById<EditText>(R.id.suche).text.toString())
            }
        }.start()
    }

    /** Zeigt die Apps als Raster mit 4 Spalten - wie auf dem Startbildschirm. */
    private fun filtere(suche: String) {
        val treffer = if (suche.isBlank()) alleApps else alleApps.filter { it.name.contains(suche.trim(), ignoreCase = true) }
        appRaster.removeAllViews()
        if (treffer.isEmpty() && alleApps.isNotEmpty()) {
            appRaster.addView(TextView(this).apply {
                text = "Keine App gefunden"
                setTextColor(getColor(R.color.text_leise))
                setPadding(0, dp(16), 0, dp(16))
            })
            return
        }
        treffer.chunked(SPALTEN).forEach { reihe ->
            val zeile = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            reihe.forEach { zeile.addView(appKachel(it), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)) }
            repeat(SPALTEN - reihe.size) { zeile.addView(View(this), LinearLayout.LayoutParams(0, 0, 1f)) }
            appRaster.addView(zeile)
        }
    }

    private fun appKachel(app: App) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER_HORIZONTAL
        setPadding(dp(4), dp(12), dp(4), dp(8))
        val welle = obtainStyledAttributes(intArrayOf(android.R.attr.selectableItemBackground))
        background = welle.getDrawable(0)
        welle.recycle()
        addView(ImageView(context).apply { setImageDrawable(app.symbol) }, LinearLayout.LayoutParams(dp(52), dp(52)))
        addView(TextView(context).apply {
            text = app.name
            textSize = 12f
            gravity = Gravity.CENTER
            maxLines = 2
            ellipsize = android.text.TextUtils.TruncateAt.END
            setTextColor(getColor(R.color.text))
            setPadding(0, dp(6), 0, 0)
        })
        setOnClickListener { oeffneApp(app) }
    }

    private fun dp(wert: Int) = (wert * resources.displayMetrics.density).toInt()

    private fun oeffneApp(app: App) {
        val start = packageManager.getLaunchIntentForPackage(app.paket) ?: return
        if (!dienstAktiv()) {
            AlertDialog.Builder(this)
                .setTitle("„DE“-Knopf ist noch aus")
                .setMessage("Ohne den Knopf kann nichts übersetzt werden. Jetzt in den Bedienungshilfen einschalten?")
                .setPositiveButton("Einschalten") { _, _ -> oeffneBedienungshilfe() }
                .setNegativeButton("Trotzdem öffnen") { _, _ -> startActivity(start) }
                .show()
            return
        }
        if (Einstellungen.automatik(this)) {
            // Aus der Liste geoeffnet = soll uebersetzt werden: Automatik gleich an
            Einstellungen.setzeAutoApp(this, app.paket, true)
            Toast.makeText(this, "${app.name} wird automatisch übersetzt – grünen DE-Knopf tippen zum Ausschalten", Toast.LENGTH_LONG).show()
        } else {
            Toast.makeText(this, "Tippe auf den „DE“-Knopf, um ${app.name} zu übersetzen", Toast.LENGTH_LONG).show()
        }
        startActivity(start)
    }

    private companion object {
        const val SPALTEN = 4
    }
}
