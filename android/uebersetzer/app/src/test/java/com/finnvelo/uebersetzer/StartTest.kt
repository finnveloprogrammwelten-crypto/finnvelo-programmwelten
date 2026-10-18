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

    @Test
    fun ortsnamenWerdenErkannt() {
        org.junit.Assert.assertTrue(istOrtsname("Rue de Bicêtre"))
        org.junit.Assert.assertTrue(istOrtsname("Place de la Concorde"))
        org.junit.Assert.assertTrue(istOrtsname("Boulevard Saint-Germain"))
        org.junit.Assert.assertFalse(istOrtsname("Where are you going?"))
        org.junit.Assert.assertFalse(istOrtsname("Place your order"))
        org.junit.Assert.assertFalse(istOrtsname("Route"))
    }

    @Test
    fun farbenKommenAusDemFoto() {
        val bild = android.graphics.Bitmap.createBitmap(200, 100, android.graphics.Bitmap.Config.ARGB_8888)
        bild.eraseColor(android.graphics.Color.rgb(20, 30, 140))
        for (x in 60..140) for (y in 40..60) bild.setPixel(x, y, android.graphics.Color.WHITE)
        val fund = faerbe(listOf(Fund("Hallo", android.graphics.Rect(10, 10, 190, 90))), bild).single()
        org.junit.Assert.assertEquals(android.graphics.Color.rgb(20, 30, 140), fund.hintergrund)
        org.junit.Assert.assertEquals(android.graphics.Color.WHITE, fund.schrift)
    }

    @Test
    fun ebeneMitLeisteBautSichAuf() {
        val ctx = RuntimeEnvironment.getApplication()
        val funde = listOf(Fund("Where are you going?", android.graphics.Rect(40, 800, 900, 900)))
        for (live in listOf(false, true)) {
            val ebene = Ebene(ctx, funde, listOf("Wohin gehst du?"), live, Vorleser(ctx)) {}
            ebene.setze(0, "Wohin gehst du?")
            ebene.measure(
                android.view.View.MeasureSpec.makeMeasureSpec(1080, android.view.View.MeasureSpec.EXACTLY),
                android.view.View.MeasureSpec.makeMeasureSpec(2400, android.view.View.MeasureSpec.EXACTLY),
            )
            ebene.layout(0, 0, 1080, 2400)
        }
    }
}
