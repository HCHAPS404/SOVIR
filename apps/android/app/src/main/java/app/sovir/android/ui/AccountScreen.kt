package app.sovir.android.ui

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.sovir.android.BuildConfig
import app.sovir.android.data.Api
import app.sovir.android.data.Auth
import app.sovir.android.data.PhoneLink
import app.sovir.android.model.Humanize
import app.sovir.android.model.ThemeChoice
import app.sovir.android.model.Tone
import app.sovir.android.model.timeAgo
import app.sovir.android.observer.AlertSync
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private enum class AccountConfirm { SignOut, Purge }

private const val PURGED = "Datos borrados del servidor."

// Audit actions that mean something to a client — ingestion noise and
// internal calls stay in the console's technical view.
private val CLIENT_AUDIT_ACTIONS = setOf(
    "session_issued", "session_revoked", "consent_granted", "consent_revoked",
    "device_registered", "device_revoked", "intervention_dispatched",
    "data_exported", "data_purged",
)

@Composable
fun AccountScreen(model: AppModel, theme: ThemeChoice, onTheme: (ThemeChoice) -> Unit, onSignedOut: () -> Unit) {
    val ctx = LocalContext.current
    val p = LocalPalette.current
    val now = System.currentTimeMillis()
    var confirm by remember { mutableStateOf<AccountConfirm?>(null) }
    var purging by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<String?>(null) }
    var serverEdit by remember { mutableStateOf(false) }
    var apiField by remember { mutableStateOf("") }
    var oidcField by remember { mutableStateOf("") }
    val name = Auth.displayName() ?: "Tu cuenta"
    val devices = model.data?.devices.orEmpty().filter { it.active }

    ScreenScroll {
        PageHeader(name, kicker = "Tu cuenta", sub = Auth.email() ?: "Sesión iniciada en este teléfono")

        Panel {
            PanelHead("Tus dispositivos", kicker = "Qué te protege") {
                Chip(plural(devices.size, "vinculado", "vinculados"), Tone.Brand)
            }
            if (devices.isEmpty()) {
                Text("Ningún dispositivo vinculado todavía.", style = MaterialTheme.typography.bodyMedium, color = p.muted)
            }
            devices.forEachIndexed { i, d ->
                Line(
                    d.label.ifBlank { Humanize.platform(d.platform) },
                    Humanize.platform(d.platform) +
                        (d.lastSeenAtMs?.let { " · visto ${timeAgo(it, now)}" } ?: " · aún no visto"),
                    tone = Tone.Success,
                    divider = i < devices.lastIndex,
                )
            }
            Gap(4.dp)
            Text(
                "Cada uno observa solo lo que tú le permites en su propia configuración.",
                style = MaterialTheme.typography.bodySmall, color = p.muted,
            )
        }

        Gap(14.dp)
        Panel {
            PanelHead("Apariencia")
            Segmented(ThemeChoice.entries, theme, { it.label }, onTheme)
            Gap(4.dp)
        }

        Gap(14.dp)
        Panel {
            PanelHead("Saldo de análisis")
            val b = model.budget
            if (b == null) {
                Text("El servidor no informó saldo.", style = MaterialTheme.typography.bodyMedium, color = p.muted)
            } else {
                Fact("Disponible", fmtUsd(b.remainingUsd), Tone.Success)
                Fact("Usado este periodo", fmtUsd(b.spentUsd), divider = false)
                Gap(8.dp)
                val frac = if (b.capUsd > 0) (b.spentUsd / b.capUsd).toFloat().coerceIn(0f, 1f) else 0f
                Box(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(p.surface2)) {
                    Box(Modifier.fillMaxWidth(frac).fillMaxHeight().background(if (frac > 0.8f) p.warning else p.brand))
                }
                Gap(10.dp)
                Text(
                    "Solo se gasta cuando pides el análisis remoto en un aviso. El análisis normal no consume nada.",
                    style = MaterialTheme.typography.bodySmall, color = p.muted,
                )
            }
            Gap(4.dp)
        }

        Gap(14.dp)
        Panel {
            PanelHead("Historial de tu cuenta")
            val items = (model.data?.audit ?: emptyList()).filter { it.action in CLIENT_AUDIT_ACTIONS }.take(8)
            if (items.isEmpty()) {
                Text("Aún no hay movimientos en tu cuenta.", style = MaterialTheme.typography.bodyMedium, color = p.muted)
            }
            items.forEachIndexed { n, a ->
                // The raw audit detail carries ids/tokens meant for the
                // console's technical view — a client sees the action + when.
                Line(
                    Humanize.auditAction(a.action),
                    null,
                    meta = timeAgo(a.atMs, now),
                    tone = Humanize.auditTone(a.action),
                    divider = n < items.lastIndex,
                )
            }
        }

        Gap(14.dp)
        Panel {
            PanelHead("Tus datos", kicker = "Derecho de borrado")
            Text(
                "Borra del servidor todo lo observado, los avisos, los permisos y los dispositivos de tu cuenta. No se puede deshacer.",
                style = MaterialTheme.typography.bodyMedium, color = p.muted,
            )
            Gap(12.dp)
            SecondaryButton("Borrar todos mis datos", { confirm = AccountConfirm.Purge }, tone = Tone.Danger, loading = purging)
            Notice(msg, if (msg == PURGED) Tone.Success else Tone.Danger)
            Gap(4.dp)
        }

        // Server repointing exists for rotating tunnels and lab setups —
        // a client almost never needs it, so it lives behind one tap.
        Gap(14.dp)
        Panel {
            PanelHead("Avanzado", kicker = "Solo si cambias de servidor")
            Text(
                "Tu información llega a ${Uri.parse(Api.base).host ?: "tu servidor"}. Si tu servidor cambia de dirección puedes repuntarla aquí; la sesión se reinicia.",
                style = MaterialTheme.typography.bodyMedium, color = p.muted,
            )
            if (serverEdit) {
                Gap(10.dp)
                OutlinedTextField(
                    value = apiField,
                    onValueChange = { apiField = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Dirección del servidor (API)") },
                    singleLine = true,
                    shape = RoundedCornerShape(6.dp),
                    colors = serverFieldColors(p),
                )
                Gap(8.dp)
                OutlinedTextField(
                    value = oidcField,
                    onValueChange = { oidcField = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Dirección de identidad (token)") },
                    singleLine = true,
                    shape = RoundedCornerShape(6.dp),
                    colors = serverFieldColors(p),
                )
                Gap(8.dp)
                Text(
                    "Al usar otro servidor se cierra tu sesión: vuelves a entrar con tu cuenta.",
                    style = MaterialTheme.typography.bodySmall, color = p.muted,
                )
                Gap(10.dp)
                PrimaryButton("Usar este servidor", {
                    Auth.setEndpoints(apiField, oidcField)
                    serverEdit = false
                    onSignedOut()
                }, enabled = apiField.isNotBlank() && oidcField.isNotBlank())
                Gap(8.dp)
                SecondaryButton("Cancelar", { serverEdit = false })
            } else {
                Gap(10.dp)
                SecondaryButton(if (Auth.endpointsCustom) "Servidor personalizado · cambiar" else "Cambiar de servidor", {
                    apiField = Api.base
                    oidcField = Auth.tokenUrl
                    serverEdit = true
                })
                if (Auth.endpointsCustom) {
                    Gap(8.dp)
                    SecondaryButton("Restablecer servidor", {
                        Auth.setEndpoints(null, null)
                        onSignedOut()
                    }, tone = Tone.Danger)
                }
            }
            Gap(2.dp)
        }

        Gap(20.dp)
        SecondaryButton("Cerrar sesión", { confirm = AccountConfirm.SignOut })
        Gap(18.dp)
        Text(
            "SOVIR Android ${BuildConfig.VERSION_NAME} · Todas las cifras vienen de tu servidor; ninguna es de ejemplo.",
            style = MaterialTheme.typography.bodySmall,
            color = p.muted,
        )
    }

    when (confirm) {
        AccountConfirm.SignOut -> ConfirmDialog(
            "Cerrar sesión",
            "El observador dejará de enviar y no recibirás avisos hasta que vuelvas a entrar. Tus datos siguen en el servidor.",
            "Cerrar sesión", danger = false,
            onDismiss = { confirm = null },
            onConfirm = {
                confirm = null
                AlertSync.cancel(ctx)
                model.signOut(onSignedOut)
            },
        )
        AccountConfirm.Purge -> ConfirmDialog(
            "Borrar todos tus datos",
            "Se eliminarán del servidor todo lo observado, los avisos, los permisos y los dispositivos de tu cuenta. Esta acción no se puede deshacer.",
            "Borrar definitivamente", danger = true,
            onDismiss = { confirm = null },
            onConfirm = {
                confirm = null
                purging = true
                msg = null
                model.act({
                    Api.purgeData()
                    PhoneLink.forgetDevice()
                }) { err ->
                    purging = false
                    msg = err ?: PURGED
                }
            },
        )
        null -> Unit
    }
}
