package com.finnvelo.uebersetzer

import android.os.Build
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Prueft, dass App und DE-Knopf ohne Absturz starten. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.UPSIDE_DOWN_CAKE])
class StartTest {

    @Test
    fun hauptbildschirmStartet() {
        Robolectric.buildActivity(MainActivity::class.java).setup()
    }

    @Test
    fun dienstStartet() {
        // Auf dem Geraet erledigt das der MlKitInitProvider, Robolectric startet keine Provider
        com.google.mlkit.common.MlKit.initialize(org.robolectric.RuntimeEnvironment.getApplication())
        val dienst = Robolectric.buildService(UebersetzerDienst::class.java).create().get()
        val verbinden = android.accessibilityservice.AccessibilityService::class.java
            .getDeclaredMethod("onServiceConnected")
        verbinden.isAccessible = true
        verbinden.invoke(dienst)
    }
}
