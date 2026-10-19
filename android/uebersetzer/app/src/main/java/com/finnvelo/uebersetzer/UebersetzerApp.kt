package com.finnvelo.uebersetzer

import android.app.Application
import android.content.Context
import android.os.Build
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Merkt sich Abstuerze, damit der Hauptbildschirm sie beim naechsten Start anzeigen kann. */
class UebersetzerApp : Application() {

    override fun onCreate() {
        super.onCreate()
        val vorher = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, fehler ->
            runCatching { Absturzbericht.speichere(this, fehler) }
            vorher?.uncaughtException(thread, fehler)
        }
    }
}

object Absturzbericht {
    private fun datei(ctx: Context) = File(ctx.filesDir, "absturz.txt")

    fun speichere(ctx: Context, fehler: Throwable) {
        val zeit = SimpleDateFormat("dd.MM.yyyy HH:mm:ss", Locale.GERMANY).format(Date())
        val version = ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName
        datei(ctx).writeText(
            "Finnvelo Übersetzer $version · Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}) · " +
                "${Build.MANUFACTURER} ${Build.MODEL}\n$zeit\n\n${fehler.stackTraceToString()}"
        )
    }

    fun lies(ctx: Context): String? = datei(ctx).takeIf { it.exists() }?.readText()

    fun loesche(ctx: Context) {
        datei(ctx).delete()
    }
}
