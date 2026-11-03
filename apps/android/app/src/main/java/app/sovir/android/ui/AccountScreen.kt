package app.sovir.android.ui

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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

@Composable
fun AccountScreen(model: AppModel, theme: ThemeChoice, onTheme: (ThemeChoice) -> Unit, onSignedOut: () -> Unit) {
    val ctx = LocalContext.current
    val p = LocalPalette.current
    val now = System.currentTimeMillis()
    var confirm by remember { mutableStateOf<AccountConfirm?>(null) }
    var purging by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<String?>(null) }
    var apiVersion by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        apiVersion = withContext(Dispatchers.IO) { runCatching { Api.version() }.getOrNull() }
    }
    val name = Auth.displayName() ?: "Tu cuenta"

    ScreenScroll {
        PageHeader(name, kicker = "Cuenta", sub = Auth.email() ?: model.data?.principalId)

        Panel {
            PanelHead("Servidor SOVIR", kicker = "Dónde viven tus datos")
            Fact("API", Uri.parse(Api.base).host ?: Api.base, mono = true)
            Fact("Identidad", Uri.parse(Auth.issuer).host ?: Auth.issuer, mono = true)
            Fact(
                "Estado",
                when (model.sync) {
                    Sync.Ready -> "En línea"
                    Sync.Loading -> "Conectando"
                    Sync.Offline -> "Sin conexión"
                    Sync.SignedOut -> "Sesión cerrada"
                    Sync.Error -> "Error del servidor"
                },
                when (model.sync) {
                    Sync.Ready -> Tone.Success
                    Sync.Error -> Tone.Danger
                    Sync.Loading -> Tone.Unknown
                    else -> Tone.Warning
                },
            )
            Fact("Versión del API", apiVersion ?: "desconocida", mono = apiVersion != null)
            Fact("Última sincronización", model.updatedAt?.let { timeAgo(it, now) } ?: "nunca", divider = false)
        }

        Gap(14.dp)
        Panel {
            PanelHead("Análisis remoto", kicker = "Presupuesto")
            val b = model.budget
            if (b == null) {
                Text("El servidor no informó presupuesto.", style = MaterialTheme.typography.bodyMedium, color = p.muted)
            } else {
                Fact("Usado", "${fmtUsd(b.spentUsd)} de ${fmtUsd(b.capUsd)}")
                Fact("Disponible", fmtUsd(b.remainingUsd), divider = false)
                Gap(8.dp)
                val frac = if (b.capUsd > 0) (b.spentUsd / b.capUsd).toFloat().coerceIn(0f, 1f) else 0f
                Box(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(p.surface2)) {
                    Box(Modifier.fillMaxWidth(frac).fillMaxHeight().background(if (frac > 0.8f) p.warning else p.brand))
                }
                Gap(10.dp)
                Text(
                    "Solo se gasta cuando permites el modelo remoto en un análisis. El análisis local no consume nada.",
                    style = MaterialTheme.typography.bodySmall, color = p.muted,
                )
            }
            Gap(4.dp)
        }

        Gap(14.dp)
        Panel {
            PanelHead("Apariencia")
            Segmented(ThemeChoice.entries, theme, { it.label }, onTheme)
            Gap(4.dp)
        }

        Gap(14.dp)
        Panel {
            PanelHead("Tus datos", kicker = "Derecho de borrado")
            Text(
                "Borra del servidor tus eventos, alertas, permisos y dispositivos. No se puede deshacer.",
                style = MaterialTheme.typography.bodyMedium, color = p.muted,
            )
            Gap(12.dp)
            SecondaryButton("Borrar todos mis datos", { confirm = AccountConfirm.Purge }, tone = Tone.Danger, loading = purging)
            Notice(msg, if (msg == PURGED) Tone.Success else Tone.Danger)
            Gap(4.dp)
        }

        Gap(14.dp)
        Panel {
            PanelHead("Registro de auditoría", kicker = "Lo que el servidor anotó")
            val items = (model.data?.audit ?: emptyList()).take(8)
            if (items.isEmpty()) {
                Text("El servidor aún no anotó acciones de tu cuenta.", style = MaterialTheme.typography.bodyMedium, color = p.muted)
            }
            items.forEachIndexed { n, a ->
                Line(
                    Humanize.auditAction(a.action),
                    a.detail.ifBlank { null },
                    meta = timeAgo(a.atMs, now),
                    tone = Humanize.auditTone(a.action),
                    divider = n < items.lastIndex,
                )
            }
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
            "Se eliminarán del servidor todos tus eventos, alertas, permisos y dispositivos. Esta acción no se puede deshacer.",
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
