package app.sovir.android.ui

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import app.sovir.android.observer.SovirAccessibilityService

// In-app consent flow for the UI_TREE observer (ADR-0014). Android never
// lets an app grant itself accessibility — the honest pattern is a card
// inside the app that deep-links straight to the SOVIR toggle; the OS
// dialog is the consent moment, and re-check happens on resume.
fun isObserverEnabled(ctx: Context): Boolean {
    val svc = "${ctx.packageName}/${SovirAccessibilityService::class.java.name}"
    val flat = Settings.Secure.getString(
        ctx.contentResolver,
        Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
    ) ?: return false
    return flat.split(':').any { it.equals(svc, ignoreCase = true) }
}

@Composable
fun ObserverPermissionCard() {
    val ctx = LocalContext.current
    var enabled by remember { mutableStateOf(isObserverEnabled(ctx)) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, ev ->
            if (ev == Lifecycle.Event.ON_RESUME) enabled = isObserverEnabled(ctx)
        }
        lifecycle.addObserver(obs)
        onDispose { lifecycle.removeObserver(obs) }
    }
    if (enabled) {
        Fact("Observador de pantalla", "Activo")
        return
    }
    Body(
        "El observador lee señales de riesgo en la pantalla. " +
            "Android pide tu permiso en ajustes — un toque y vuelves aquí.",
    )
    Spacer(Modifier.height(12.dp))
    FilledAction("Activar observador", onClick = {
        ctx.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
    })
    Spacer(Modifier.height(12.dp))
}
