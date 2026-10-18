plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.finnvelo.uebersetzer"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.finnvelo.uebersetzer"
        minSdk = 26
        targetSdk = 34
        versionCode = 2
        versionName = "1.1"
        // Nur Handy-Prozessoren - spart rund die Haelfte der App-Groesse
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // Uebersetzung laeuft komplett auf dem Geraet (ML Kit), nur das
    // Sprachpaket wird einmalig heruntergeladen.
    implementation("androidx.annotation:annotation:1.8.2")
    implementation("com.google.mlkit:translate:17.0.3")
    implementation("com.google.mlkit:language-id:17.0.6")
    // Texterkennung ueber Google-Play-Dienste: das Modell wird nicht in die App gepackt
    implementation("com.google.android.gms:play-services-mlkit-text-recognition:19.0.1")
}
