package com.finnvelo.uebersetzer

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/** Kachel "DE übersetzen" in den Schnelleinstellungen (Leiste von oben herunterziehen). */
class KachelDienst : TileService() {

    override fun onStartListening() {
        qsTile?.apply {
            state = if (UebersetzerDienst.instanz != null) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                subtitle = if (UebersetzerDienst.instanz != null) "Bildschirm" else "erst einschalten"
            }
            updateTile()
        }
    }

    override fun onClick() {
        val dienst = UebersetzerDienst.instanz
        if (dienst != null) return dienst.vonKachel()
        // Bedienungshilfe ist aus: Hauptbildschirm mit der Anleitung oeffnen
        val start = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 0, start, PendingIntent.FLAG_IMMUTABLE))
        } else {
            @Suppress("DEPRECATION")
            @android.annotation.SuppressLint("StartActivityAndCollapseDeprecated")
            startActivityAndCollapse(start)
        }
    }
}
