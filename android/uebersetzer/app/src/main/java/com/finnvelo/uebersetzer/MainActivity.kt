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
import android.widget.BaseAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.RadioGroup
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast

/** Hauptbildschirm: Knopf einschalten, Sprache waehlen, App zum Uebersetzen oeffnen. */
class MainActivity : Activity() {

    private data class App(val name: String, val paket: String, val symbol: Drawable)

    private var alleApps = emptyList<App>()
    private var sichtbareApps = emptyList<App>()
    private lateinit var appListe: AppAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        findViewById<Button>(R.id.knopf_einschalten).setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }
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

        appListe = AppAdapter()
        val liste = findViewById<ListView>(R.id.apps)
        liste.adapter = appListe
        liste.setOnItemClickListener { _, _, pos, _ -> oeffneApp(sichtbareApps[pos]) }

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
        findViewById<TextView>(R.id.status).apply {
            setText(if (an) R.string.status_an else R.string.status_aus)
            setBackgroundColor(if (an) 0xFFE6F4EA.toInt() else 0xFFFFF4E5.toInt())
        }
        findViewById<View>(R.id.einschalten_bereich).visibility = if (an) View.GONE else View.VISIBLE
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

    private fun filtere(suche: String) {
        sichtbareApps = if (suche.isBlank()) alleApps else alleApps.filter { it.name.contains(suche.trim(), ignoreCase = true) }
        appListe.notifyDataSetChanged()
    }

    private fun oeffneApp(app: App) {
        val start = packageManager.getLaunchIntentForPackage(app.paket) ?: return
        if (!dienstAktiv()) {
            AlertDialog.Builder(this)
                .setTitle("„DE“-Knopf ist noch aus")
                .setMessage("Ohne den Knopf kann nichts übersetzt werden. Jetzt in den Bedienungshilfen einschalten?")
                .setPositiveButton("Einschalten") { _, _ -> startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
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

    private inner class AppAdapter : BaseAdapter() {
        private val dichte = resources.displayMetrics.density

        override fun getCount() = sichtbareApps.size
        override fun getItem(position: Int) = sichtbareApps[position]
        override fun getItemId(position: Int) = position.toLong()

        override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
            val zeile = convertView as? LinearLayout ?: LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                val p = (8 * dichte).toInt()
                setPadding(p, p, p, p)
                addView(ImageView(context), LinearLayout.LayoutParams((40 * dichte).toInt(), (40 * dichte).toInt()))
                addView(TextView(context).apply {
                    textSize = 17f
                    setPadding((12 * dichte).toInt(), 0, 0, 0)
                })
            }
            val app = sichtbareApps[position]
            (zeile.getChildAt(0) as ImageView).setImageDrawable(app.symbol)
            (zeile.getChildAt(1) as TextView).text = app.name
            return zeile
        }
    }
}
