package app.sovir.android.ui

import android.Manifest
import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.sovir.android.data.PhoneLink
import app.sovir.android.model.GrantSpan
import app.sovir.android.model.Tone

/**
 * One-time activation, pushed once after sign-in when something is missing.
 * The three steps are the whole permission model, in the order a person
 * understands them: what Android controls, what SOVIR asks, what is optional.
 * Skipping is allowed — Protection keeps the same controls, so nothing here
 * is forced and nothing is asked twice (the flag below survives sign-out,
 * because permissions belong to the phone, not the account).
 */
object SetupPrefs {
    private lateinit var prefs: SharedPreferences

    fun init(context: Context) {
        if (!::prefs.isInitialized) {
            prefs = context.applicationContext.getSharedPreferences("sovir_setup", Context.MODE_PRIVATE)
        }
    }

    fun done(): Boolean = ::prefs.isInitialized && prefs.getBoolean("done", false)
    fun markDone() {
        if (::prefs.isInitialized) prefs.edit().putBoolean("done", true).apply()
    }

    /** Setup only opens when something real is missing — never as a formality. */
    fun needed(ctx: Context): Boolean =
        !isObserverEnabled(ctx) || !PhoneLink.uploadAllowed() || !notificationsAllowed(ctx)
}

@Composable
fun SetupScreen(model: AppModel, onDone: () -> Unit) {
    val ctx = LocalContext.current
    val p = LocalPalette.current
    var coverageTick by rememberSaveable { mutableStateOf(0) }
    val coverage = currentCoverage(coverageTick)
    var span by rememberSaveable { mutableStateOf(GrantSpan.Week) }
    var busy by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<String?>(null) }
    var askedNotif by rememberSaveable { mutableStateOf(false) }
    val notifLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        askedNotif = true
    }
    // Leaving by Back counts as "later" too — the screen never re-asks.
    BackHandler { onDone() }

    // The OS dialog appears right as this screen opens — the one permission
    // Android lets apps ask for directly. Asked once per composition.
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33 && !notificationsAllowed(ctx) && !askedNotif) {
            notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    ScreenScroll {
        PageHeader(
            "Activa tu protección",
            kicker = "Primera vez",
            sub = "Tres pasos, una sola vez. SOVIR observa lo que ves para avisarte de riesgos a tiempo — nada sale del teléfono sin tu permiso.",
        )

        Panel {
            PanelHead("1 · Observador de pantalla") {
                Chip(if (coverage.observerOs) "Activado" else "Pendiente", if (coverage.observerOs) Tone.Success else Tone.Unknown)
            }
            Text(
                "Lee el texto visible de las apps para detectar señales de riesgo. Android controla este permiso en sus ajustes: se abre la pantalla del sistema y activas SOVIR ahí.",
                style = MaterialTheme.typography.bodyMedium, color = p.muted,
            )
            if (!coverage.observerOs) {
                Gap(12.dp)
                PrimaryButton("Abrir ajustes de Android", { openAccessibilitySettings(ctx) })
            }
            Gap(4.dp)
        }

        Gap(14.dp)
        Panel {
            PanelHead("2 · Permiso de SOVIR para enviar") {
                Chip(if (coverage.uploadAllowed) "Vigente" else "Pendiente", if (coverage.uploadAllowed) Tone.Success else Tone.Unknown)
            }
            Text(
                "Aunque Android lo permita, nada sale del teléfono sin este permiso. Elige cuánto dura — puedes revocarlo cuando quieras.",
                style = MaterialTheme.typography.bodyMedium, color = p.muted,
            )
            if (!coverage.uploadAllowed) {
                Gap(12.dp)
                Segmented(GrantSpan.entries, span, { it.label }) { span = it }
                Gap(10.dp)
                PrimaryButton("Conceder por ${span.label}", {
                    busy = true
                    msg = null
                    model.act({ PhoneLink.grant(span.ms) }) { err ->
                        busy = false
                        msg = err
                        coverageTick++
                    }
                }, loading = busy)
            }
            Notice(msg)
            Gap(4.dp)
        }

        Gap(14.dp)
        Panel {
            PanelHead("3 · Notificaciones") {
                Chip(if (coverage.notifications) "Permitidas" else "Pendiente", if (coverage.notifications) Tone.Success else Tone.Unknown)
            }
            Text(
                "Avisos al momento cuando algo parece un riesgo. Opcionales — la protección funciona igual sin ellas.",
                style = MaterialTheme.typography.bodyMedium, color = p.muted,
            )
            if (!coverage.notifications && askedNotif) {
                Gap(12.dp)
                SecondaryButton("Permitir desde ajustes", { openNotificationSettings(ctx) })
            }
            Gap(4.dp)
        }

        Gap(20.dp)
        PrimaryButton(if (coverage.observing) "Empezar a protegerme" else "Continuar", { onDone() })
        Gap(8.dp)
        SecondaryButton("Ahora no — lo hago después en Protección", { onDone() })
        Gap(16.dp)
    }
}
