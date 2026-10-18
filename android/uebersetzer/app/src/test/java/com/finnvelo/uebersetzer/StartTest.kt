package com.finnvelo.uebersetzer

import android.os.Build
import com.google.mlkit.common.MlKit
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/** Prueft, dass App und DE-Knopf ohne Absturz starten. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.UPSIDE_DOWN_CAKE])
class StartTest {

    // Auf dem Geraet erledigt das der MlKitInitProvider, Robolectric startet keine Provider
    @Before
    fun mlKitStarten() {
        runCatching { MlKit.initialize(RuntimeEnvironment.getApplication()) }
    }

    @Test
    fun hauptbildschirmStartet() {
        Robolectric.buildActivity(MainActivity::class.java).setup()
    }

    @Test
    fun dienstStartet() {
        val dienst = Robolectric.buildService(UebersetzerDienst::class.java).create().get()
        val verbinden = android.accessibilityservice.AccessibilityService::class.java
            .getDeclaredMethod("onServiceConnected")
        verbinden.isAccessible = true
        verbinden.invoke(dienst)
    }
}
