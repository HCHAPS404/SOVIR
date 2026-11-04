package app.sovir.android.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.sovir.android.data.Api
import app.sovir.android.data.PhoneLink
import app.sovir.android.model.ConsentGrant
import app.sovir.android.model.Device
import app.sovir.android.model.GrantSpan
import app.sovir.android.model.Humanize
import app.sovir.android.model.Tone
import app.sovir.android.observer.AlertSync

private sealed interface Pending {
    data class RevokeGrant(val g: ConsentGrant) : Pending
    data class RevokeDevice(val d: Device) : Pending
    data object RevokePhone : Pending
}

@Composable
fun ProtectionScreen(model: AppModel, coverage: Coverage, onCoverageChanged: () -> Unit) = DataGate(model) { data ->
    val ctx = LocalContext.current
    val p = LocalPalette.current
    val now = System.currentTimeMillis()
    var span by rememberSaveable { mutableStateOf(GrantSpan.Week) }
    var busy by remember { mutableStateOf(false) }
    var phoneMsg by remember { mutableStateOf<String?>(null) }
    var listMsg by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf<Pending?>(null) }
    var askedNotif by rememberSaveable { mutableStateOf(false) }
    val notifLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        askedNotif = true
        if (granted) AlertSync.schedule(ctx)
        onCoverageChanged()
    }

    ScreenScroll {
        PageHeader(
            "Protección",
            kicker = "Permisos y fuentes",
            sub = "Qué puede observar SOVIR, quién lo autorizó y cómo retirarlo en cualquier momento.",
        )

        // --- this phone: two independent layers, shown separately ---------
        Panel {
            PanelHead("Observador de este teléfono") {
                Chip(if (coverage.observing) "Observando" else "No observa", if (coverage.observing) Tone.Success else Tone.Unknown)
            }
            Kicker("1 · Permiso de Android")
            Gap(4.dp)
            Fact(
                "Servicio de accesibilidad",
                if (coverage.observerOs) "Activado" else "Desactivado",
                if (coverage.observerOs) Tone.Success else Tone.Unknown,
                divider = false,
            )
            Text(
                "Android decide si SOVIR puede leer la pantalla. Solo tú puedes activarlo, desde los ajustes del sistema.",
                style = MaterialTheme.typography.bodySmall, color = p.muted,
            )
            Gap(10.dp)
            SecondaryButton(
                if (coverage.observerOs) "Desactivar en ajustes de Android" else "Activar en ajustes de Android",
                { openAccessibilitySettings(ctx) },
            )

            Gap(18.dp)
            Rule()
            Gap(14.dp)
            Kicker("2 · Permiso de SOVIR para enviar")
            Gap(4.dp)
            if (coverage.uploadAllowed) {
                Fact("Estado", "Vigente hasta ${fmtDateTime(coverage.grantExpiresAt)}", Tone.Success, divider = false)
                Gap(8.dp)
                SecondaryButton("Revocar ahora", { confirm = Pending.RevokePhone }, tone = Tone.Danger, loading = busy)
            } else {
                Fact("Estado", "Sin conceder", Tone.Unknown, divider = false)
                Text(
                    "Aunque Android lo permita, nada sale del teléfono sin este permiso. Elige cuánto dura:",
                    style = MaterialTheme.typography.bodySmall, color = p.muted,
                )
                Gap(10.dp)
                Segmented(GrantSpan.entries, span, { it.label }) { span = it }
                Gap(10.dp)
                PrimaryButton("Conceder por ${span.label}", {
                    busy = true
                    phoneMsg = null
                    model.act({ PhoneLink.grant(span.ms) }) { err ->
                        busy = false
                        phoneMsg = err
                        onCoverageChanged()
                    }
                }, loading = busy)
            }
            Notice(phoneMsg)

            Gap(18.dp)
            Rule()
            Gap(12.dp)
            Kicker("Qué hace exactamente")
            Gap(6.dp)
            Fact("Lee", "El texto visible de otras apps, para buscar señales de riesgo")
            Fact("Envía", "Los tipos de señal y las frases que coincidieron, solo a tu servidor")
            Fact("Nunca envía", "Capturas, contraseñas ni campos de clave")
            Fact("Ignora", "Barra del sistema, ajustes, la propia app de SOVIR y tus apps exentas", divider = false)
        }

        // --- app exemptions + sensitive shield -----------------------------
        Gap(14.dp)
        Panel {
            PanelHead("Apps que no se observan", kicker = "Privacidad por app")
            val pm = ctx.packageManager
            var sensitiveOn by remember { mutableStateOf(app.sovir.android.data.AppExclusions.sensitiveAllowed) }
            val installedSensitive = remember { app.sovir.android.data.AppExclusions.installedSensitive(pm) }
            Text(
                "Una vez das el permiso, el observador cubre todas tus apps. Aquí pones las excepciones — sin preguntas repetidas.",
                style = MaterialTheme.typography.bodySmall, color = p.muted,
            )
            Gap(10.dp)
            Line(
                "Apps sensibles (social, banca, carteras)",
                if (sensitiveOn) "También observadas" else "Excluidas por defecto",
                tone = if (sensitiveOn) Tone.Warning else Tone.Success,
                divider = installedSensitive.isNotEmpty(),
                trailing = {
                    QuietAction(if (sensitiveOn) "Excluir" else "Incluir", {
                        sensitiveOn = !sensitiveOn
                        app.sovir.android.data.AppExclusions.sensitiveAllowed = sensitiveOn
                    })
                },
            )
            if (installedSensitive.isNotEmpty()) {
                installedSensitive.forEach { (pkg, cat) ->
                    Fact(cat, pkg, divider = true)
                }
            }
            Gap(8.dp)
            var exemptText by remember {
                mutableStateOf(app.sovir.android.data.AppExclusions.excludedPackages.joinToString("\n"))
            }
            OutlinedTextField(
                value = exemptText,
                onValueChange = { exemptText = it },
                label = { Text("Paquetes exentos — uno por línea") },
                supportingText = { Text("Ej: com.mi.banco — nunca se lee su pantalla") },
                colors = serverFieldColors(p),
                modifier = androidx.compose.ui.Modifier.fillMaxWidth(),
                minLines = 2,
            )
            Gap(8.dp)
            SecondaryButton("Guardar exenciones", {
                app.sovir.android.data.AppExclusions.setExcluded(
                    exemptText.split("\n", ",", " ").map { it.trim() }.filter { it.isNotEmpty() }.toSet()
                )
            })
            Gap(4.dp)
        }

        // --- notifications -----------------------------------------------
        Gap(14.dp)
        Panel {
            PanelHead("Avisos en pantalla") {
                Chip(if (coverage.notifications) "Permitidos" else "Bloqueados", if (coverage.notifications) Tone.Success else Tone.Warning)
            }
            Text(
                "Avisos de alertas nuevas de todos tus dispositivos. En segundo plano el teléfono consulta tu servidor " +
                    "cada 15 minutos aproximadamente; lo que detecta este teléfono se avisa al momento.",
                style = MaterialTheme.typography.bodyMedium, color = p.muted,
            )
            if (!coverage.notifications) {
                Gap(12.dp)
                SecondaryButton("Permitir avisos", {
                    if (Build.VERSION.SDK_INT >= 33 && !askedNotif) {
                        notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    } else {
                        openNotificationSettings(ctx)
                    }
                })
            }
            Gap(4.dp)
        }

        // --- all sources' grants ------------------------------------------
        Gap(14.dp)
        Panel {
            PanelHead("Permisos de tus fuentes", kicker = "Toda tu cuenta")
            val grants = data.grants.sortedWith(compareByDescending<ConsentGrant> { it.activeAt(now) }.thenByDescending { it.issuedAtMs }).take(12)
            if (grants.isEmpty()) {
                Text("Ninguna fuente tiene permiso todavía.", style = MaterialTheme.typography.bodyMedium, color = p.muted)
            }
            grants.forEachIndexed { i, g ->
                val active = g.activeAt(now)
                // A phone grant this install did not issue (older build, other
                // install) is real on the server but unused here — say so.
                val foreignPhone = g.sourceId == PhoneLink.SOURCE_ID && g.grantId != PhoneLink.grantId
                Line(
                    Humanize.source(g.sourceId),
                    when {
                        g.revoked -> "Revocado"
                        !active -> "Expiró el ${fmtDate(g.expiresAtMs)}"
                        foreignPhone -> "Vigente hasta ${fmtDate(g.expiresAtMs)} · no lo usa esta instalación"
                        else -> "Vigente hasta ${fmtDate(g.expiresAtMs)}"
                    },
                    tone = if (active) Tone.Success else if (g.revoked) Tone.Danger else Tone.Unknown,
                    divider = i < grants.lastIndex,
                    trailing = { if (active) QuietAction("Revocar", { confirm = Pending.RevokeGrant(g) }, Tone.Danger) },
                )
            }
            Notice(listMsg)
        }

        // --- devices ----------------------------------------------------------
        Gap(14.dp)
        Panel {
            PanelHead("Dispositivos vinculados")
            val devices = data.devices.sortedWith(compareByDescending<Device> { it.active }.thenByDescending { it.registeredAtMs })
            if (devices.isEmpty()) {
                Text("No hay dispositivos registrados.", style = MaterialTheme.typography.bodyMedium, color = p.muted)
            }
            devices.forEachIndexed { i, d ->
                val here = d.deviceId == PhoneLink.deviceId
                Line(
                    d.label.ifBlank { Humanize.platform(d.platform) } + if (here) " · este teléfono" else "",
                    "${Humanize.platform(d.platform)} · " + if (d.active) "desde ${fmtDate(d.registeredAtMs)}" else "revocado",
                    tone = if (d.active) Tone.Success else Tone.Unknown,
                    divider = i < devices.lastIndex,
                    trailing = { if (d.active) QuietAction("Revocar", { confirm = Pending.RevokeDevice(d) }, Tone.Danger) },
                )
            }
        }
    }

    confirm?.let { c ->
        val (title, body) = when (c) {
            Pending.RevokePhone -> "Revocar el permiso de este teléfono" to
                "El observador dejará de enviar señales al instante. Puedes volver a concederlo cuando quieras."
            is Pending.RevokeGrant -> "Revocar el permiso de ${Humanize.source(c.g.sourceId)}" to
                "Esa fuente no podrá enviar más señales. Lo ya observado se conserva hasta que lo borres."
            is Pending.RevokeDevice -> "Revocar ${c.d.label.ifBlank { Humanize.platform(c.d.platform) }}" to
                "El dispositivo quedará desvinculado de tu cuenta y no podrá volver a usarse sin registrarlo de nuevo."
        }
        ConfirmDialog(title, body, "Revocar", danger = true, onDismiss = { confirm = null }, onConfirm = {
            confirm = null
            when (c) {
                Pending.RevokePhone -> {
                    busy = true
                    model.act({ PhoneLink.revoke() }) { err -> busy = false; phoneMsg = err; onCoverageChanged() }
                }
                is Pending.RevokeGrant -> model.act({
                    if (c.g.grantId == PhoneLink.grantId) PhoneLink.revoke() else Api.revokeConsent(c.g.grantId)
                }) { err -> listMsg = err; onCoverageChanged() }
                is Pending.RevokeDevice -> model.act({
                    Api.revokeDevice(c.d.deviceId)
                    if (c.d.deviceId == PhoneLink.deviceId) PhoneLink.forgetDevice()
                }) { err -> listMsg = err; onCoverageChanged() }
            }
        })
    }
}
