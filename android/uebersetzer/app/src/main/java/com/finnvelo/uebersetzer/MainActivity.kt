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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        findViewById<Button>(R.id.knopf_einschalten).setOnClickListener { oeffneBedienungshilfe() }
        findViewById<Button>(R.id.knopf_app_info).setOnClickListener {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        }

        val sprache = findViewById<Spinner>(R.id.sprache)
        sprache.adapter = ArrayAdapter(
            this, android.R.layout.simple_spinner_dropdown_item, Einstellungen.SPRACHEN.map { it.second },
        )
        sprache.setSelection(Einstellungen.SPRACHEN.indexOfFirst { it.first == Einstellungen.quelle(this) }.coerceAtLeast(0))
        sprache.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) =
                Einstellungen.setzeQuelle(this@MainActivity, Einstellungen.SPRACHEN[pos].first)

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

        findViewById<Button>(R.id.knopf_vorladen).setOnClickListener { ladeSprachpaket() }

        appRaster = findViewById(R.id.apps)

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
    }

    /** Springt ab Android 11 direkt zur Seite dieser App, sonst zur Liste der Bedienungshilfen. */
    private fun oeffneBedienungshilfe() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            val direkt = Intent("android.settings.ACCESSIBILITY_DETAILS_SETTINGS")
                .putExtra(Intent.EXTRA_COMPONENT_NAME, ComponentName(this, UebersetzerDienst::class.java).flattenToString())
            try {
                return startActivity(direkt)
            } catch (_: android.content.ActivityNotFoundException) {
            }
        }
        startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
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
        Toast.makeText(this, "Tippe auf den „DE“-Knopf, um ${app.name} zu übersetzen", Toast.LENGTH_LONG).show()
        startActivity(start)
    }

    private fun ladeSprachpaket() {
        val code = Einstellungen.quelle(this).let { if (it == "auto") "en" else it }
        val name = Einstellungen.SPRACHEN.first { it.first == code }.second
        val knopf = findViewById<Button>(R.id.knopf_vorladen)
        knopf.isEnabled = false
        knopf.text = "$name wird geladen …"
        val uebersetzer = Uebersetzer()
        uebersetzer.ladeSprachpaket(code, {}) { fehler ->
            knopf.isEnabled = true
            knopf.setText(R.string.knopf_vorladen)
            val text = if (fehler == null) "Sprachpaket $name → Deutsch ist bereit" else "Laden fehlgeschlagen: ${fehler.message}"
            Toast.makeText(this, text, Toast.LENGTH_LONG).show()
            uebersetzer.schliessen()
        }
    }

    private companion object {
        const val SPALTEN = 4
    }
}
