package app.sovir.android.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.sovir.android.data.Api
import app.sovir.android.data.AppExclusions
import app.sovir.android.data.PhoneLink
import app.sovir.android.model.ConsentGrant
import app.sovir.android.model.Device
import app.sovir.android.model.GrantSpan
import app.sovir.android.model.Humanize
import app.sovir.android.model.Tone
import app.sovir.android.observer.AlertSync

// The activation flow is an emergent, guided sequence — never a wall of
// toggles. The user presses one button; the app asks only for the step
// that is actually missing (OS toggle → SOVIR grant → battery exemption),
// in plain language, and every step is a system or SOVIR dialog.

private sealed interface Pending {
    data class RevokeGrant(val g: ConsentGrant) : Pending
    data class RevokeDevice(val d: Device) : Pending
    data object Deactivate : Pending
}

private sealed interface Activation {
    data object NeedOs : Activation
    data object Interrupted : Activation
    data object NeedGrant : Activation
}

@Composable
fun ProtectionScreen(model: AppModel, coverage: Coverage, onCoverageChanged: () -> Unit) = DataGate(model) { data ->
    val ctx = LocalContext.current
    val p = LocalPalette.current
    val now = System.currentTimeMillis()
    var busy by remember { mutableStateOf(false) }
    var phoneMsg by remember { mutableStateOf<String?>(null) }
    var listMsg by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf<Pending?>(null) }
    var activation by remember { mutableStateOf<Activation?>(null) }
    var showAppPicker by remember { mutableStateOf(false) }
    var askedNotif by rememberSaveable { mutableStateOf(false) }
    val notifLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        askedNotif = true
        if (granted) AlertSync.schedule(ctx)
        onCoverageChanged()
    }

    ScreenScroll {
        PageHeader(
            "Protección",
            kicker = "Tu escudo",
            sub = "Un botón para activarla, otro para pausarla. Sin ajustes que configurar.",
        )

        // --- hero: one state, one verb -----------------------------------
        Panel {
            val (icon, stateTitle, stateSub, stateTone) = when {
                coverage.observing -> Quad(
                    Glyphs.eye, "Te protegemos",
                    "SOVIR observa tu pantalla buscando señales de estafa. Nada sale del teléfono sin tu permiso.",
                    Tone.Success,
                )
                coverage.observerInterrupted -> Quad(
                    Glyphs.eyeOff, "Se detuvo",
                    "El sistema cerró el observador en segundo plano. Reactívalo para seguir protegido.",
                    Tone.Warning,
                )
                !coverage.observerOs -> Quad(
                    Glyphs.eyeOff, "Protección desactivada",
                    "Nada se observa ahora mismo. Actívala cuando quieras.",
                    Tone.Unknown,
                )
                else -> Quad(
                    Glyphs.eye, "Casi lista",
                    "Solo falta tu permiso para empezar a observar.",
                    Tone.Warning,
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null, tint = p.tone(stateTone), modifier = Modifier.size(40.dp))
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(stateTitle, style = MaterialTheme.typography.titleLarge, color = p.ink)
                    Text(stateSub, style = MaterialTheme.typography.bodyMedium, color = p.muted)
                }
            }
            Gap(16.dp)
            if (coverage.observing) {
                SecondaryButton("Desactivar protección", { confirm = Pending.Deactivate }, tone = Tone.Danger)
            } else {
                PrimaryButton(
                    "Activar protección",
                    {
                        activation = when {
                            coverage.observerInterrupted -> Activation.Interrupted
                            !coverage.observerOs -> Activation.NeedOs
                            else -> Activation.NeedGrant
                        }
                    },
                    tone = Tone.Success,
                    loading = busy,
                )
            }
            Notice(phoneMsg)
        }

        // --- plain-language truth about what observation means ------------
        Gap(14.dp)
        Panel {
            PanelHead("Qué hace", kicker = "Sin letra pequeña")
            Fact("Observa", "El texto visible de tus apps, buscando señales de estafa")
            Fact("Comparte", "Solo los tipos de señal — nunca capturas ni contraseñas")
            Fact("Omite", "Las apps que excluyas abajo y las sensibles por defecto", divider = false)
        }

        // --- privacy exceptions: observed vs not-observed, real icons ------
        Gap(14.dp)
        Panel {
            PanelHead("Qué apps se observan", kicker = "Tus excepciones")
            val pm = ctx.packageManager
            val installedSensitive = remember { AppExclusions.installedSensitive(pm) }
            var included by remember { mutableStateOf(AppExclusions.sensitiveIncluded) }
            var excluded by remember { mutableStateOf(AppExclusions.excludedPackages) }
            val launchable = remember { launchableApps(pm) }
            val observedCount = launchable.count { !AppExclusions.skips(it.second) }
            val sensitivePkgs = installedSensitive.map { it.first }
            val refresh = {
                included = AppExclusions.sensitiveIncluded
                excluded = AppExclusions.excludedPackages
            }
            Text(
                "El observador cubre tus apps salvo las de abajo. Las sensibles están protegidas por defecto: las incluyes una a una, solo si decides.",
                style = MaterialTheme.typography.bodySmall, color = p.muted,
            )
            Gap(12.dp)

            Kicker("Con permiso para observarse")
            Gap(4.dp)
            val includedShown = included.filter { it in sensitivePkgs }.take(3)
            includedShown.forEach { pkg ->
                Line(
                    appLabel(pm, pkg) ?: pkg,
                    "La incluiste — se observa",
                    divider = true,
                    leading = { AppIcon(pkg) },
                    trailing = {
                        QuietAction("Quitar", {
                            AppExclusions.setSensitiveIncluded(pkg, false)
                            refresh()
                        })
                    },
                )
            }
            Line(
                "Todas las demás apps",
                if (observedCount == 0) "Ninguna otra se observa" else "$observedCount se observan",
                divider = false,
                leading = { GlyphTile(Glyphs.apps, Tone.Success) },
            )

            Gap(12.dp)
            Kicker("Sin observar")
            Gap(4.dp)
            val notObserved: List<Triple<String, String, Boolean>> =
                sensitivePkgs.filter { it !in included && it !in excluded }.map { Triple(it, "Protegida por defecto", true) } +
                    excluded.map { Triple(it, "Excluida por ti", AppExclusions.isSensitive(it)) }
            if (notObserved.isEmpty()) {
                Text("Ninguna — todo lo que abres se observa.", style = MaterialTheme.typography.bodyMedium, color = p.muted)
            }
            notObserved.take(3).forEachIndexed { i, (pkg, why, isSensitive) ->
                Line(
                    appLabel(pm, pkg) ?: pkg,
                    why,
                    divider = i < minOf(3, notObserved.size) - 1 || notObserved.size > 3,
                    leading = { AppIcon(pkg) },
                    trailing = {
                        QuietAction("Incluir", {
                            if (pkg in excluded) AppExclusions.setExcluded(excluded - pkg)
                            if (isSensitive && AppExclusions.skips(pkg)) AppExclusions.setSensitiveIncluded(pkg, true)
                            refresh()
                        })
                    },
                )
            }
            if (notObserved.size > 3) {
                Text("y ${notObserved.size - 3} más", style = MaterialTheme.typography.bodySmall, color = p.muted)
            }
            Gap(8.dp)
            SecondaryButton("Explorar apps", { showAppPicker = true })
            Gap(4.dp)
        }

        // --- notifications -------------------------------------------------
        Gap(14.dp)
        Panel {
            PanelHead("Avisos en pantalla") {
                Chip(if (coverage.notifications) "Permitidos" else "Bloqueados", if (coverage.notifications) Tone.Success else Tone.Warning)
            }
            Text(
                "Te avisamos cuando algo parece una estafa — aquí y en tus otros dispositivos.",
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

        // --- all sources' grants: top of the list, full record on tap ------
        Gap(14.dp)
        Panel {
            PanelHead("Permisos de tus fuentes", kicker = "Toda tu cuenta")
            var showAllGrants by rememberSaveable { mutableStateOf(false) }
            val grants = data.grants.sortedWith(compareByDescending<ConsentGrant> { it.activeAt(now) }.thenByDescending { it.issuedAtMs })
            if (grants.isEmpty()) {
                Text("Ninguna fuente tiene permiso todavía.", style = MaterialTheme.typography.bodyMedium, color = p.muted)
            }
            val shown = if (showAllGrants) grants else grants.take(3)
            shown.forEachIndexed { i, g ->
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
                    divider = i < shown.lastIndex || grants.size > shown.size,
                    leading = { GlyphTile(grantIcon(g.sourceId), if (active) Tone.Success else Tone.Muted) },
                    trailing = { if (active) QuietAction("Revocar", { confirm = Pending.RevokeGrant(g) }, Tone.Danger) },
                )
            }
            if (grants.size > 3) {
                QuietAction(
                    if (showAllGrants) "Ver menos" else "Ver todo el registro · ${grants.size}",
                    { showAllGrants = !showAllGrants },
                )
            }
            Notice(listMsg)
        }

        // --- devices: this phone first, compact, icons per platform --------
        Gap(14.dp)
        Panel {
            PanelHead("Dispositivos vinculados")
            var showAllDevices by rememberSaveable { mutableStateOf(false) }
            val devices = data.devices.sortedWith(
                compareByDescending<Device> { it.deviceId == PhoneLink.deviceId }
                    .thenByDescending { it.active }
                    .thenByDescending { it.registeredAtMs },
            )
            if (devices.isEmpty()) {
                Text("No hay dispositivos registrados.", style = MaterialTheme.typography.bodyMedium, color = p.muted)
            }
            val shown = if (showAllDevices) devices else devices.take(3)
            shown.forEachIndexed { i, d ->
                val here = d.deviceId == PhoneLink.deviceId
                Line(
                    if (here) "Este teléfono" else d.label.ifBlank { Humanize.platform(d.platform) },
                    "${Humanize.platform(d.platform)} · " + when {
                        here && d.active -> "vinculado y en uso"
                        d.active -> "desde ${fmtDate(d.registeredAtMs)}"
                        else -> "revocado"
                    },
                    divider = i < shown.lastIndex || devices.size > shown.size,
                    leading = { GlyphTile(deviceIcon(d.platform), if (d.active) Tone.Success else Tone.Muted) },
                    trailing = { if (d.active && !here) QuietAction("Revocar", { confirm = Pending.RevokeDevice(d) }, Tone.Danger) },
                )
            }
            if (devices.size > 3) {
                QuietAction(
                    if (showAllDevices) "Ver menos" else "Ver todos · ${devices.size}",
                    { showAllDevices = !showAllDevices },
                )
            }
        }
    }

    // --- emergent activation dialogs — one step at a time -------------------
    activation?.let { step ->
        when (step) {
            Activation.NeedOs -> ConfirmDialog(
                "Permiso de Android",
                "Android te mostrará su lista de servicios de accesibilidad: busca SOVIR y actívalo. Es el permiso del sistema — solo tú puedes concederlo, y puedes quitarlo igual.",
                "Abrir ajustes",
                danger = false,
                onDismiss = { activation = null },
                onConfirm = {
                    activation = null
                    openAccessibilitySettings(ctx)
                },
            )
            Activation.Interrupted -> AlertDialog(
                onDismissRequest = { activation = null },
                containerColor = p.surface,
                titleContentColor = p.ink,
                textContentColor = p.muted,
                title = { Text("El observador se detuvo", style = MaterialTheme.typography.titleLarge) },
                text = {
                    Column {
                        Text(
                            "Tu teléfono cerró SOVIR en segundo plano para ahorrar batería. Dos pasos para que no vuelva a pasar:",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Gap(14.dp)
                        SecondaryButton("1 · Eximir de ahorro de batería", { requestBatteryExemption(ctx) })
                        Gap(10.dp)
                        SecondaryButton("2 · Reactivar el permiso en ajustes", { openAccessibilitySettings(ctx) })
                    }
                },
                confirmButton = {
                    TextButton(onClick = { activation = null }) {
                        Text("Entendido", style = MaterialTheme.typography.labelLarge, color = p.ink)
                    }
                },
            )
            Activation.NeedGrant -> {
                var span by remember { mutableStateOf(GrantSpan.Week) }
                AlertDialog(
                    onDismissRequest = { activation = null },
                    containerColor = p.surface,
                    titleContentColor = p.ink,
                    textContentColor = p.muted,
                    title = { Text("¿Activar protección?", style = MaterialTheme.typography.titleLarge) },
                    text = {
                        Column {
                            Text(
                                "SOVIR observará tu pantalla hasta la fecha que elijas y nada saldrá del teléfono sin este permiso. Puedes desactivarla cuando quieras.",
                                style = MaterialTheme.typography.bodyMedium,
                            )
                            Gap(14.dp)
                            Segmented(GrantSpan.entries, span, { it.label }) { span = it }
                        }
                    },
                    confirmButton = {
                        TextButton(onClick = {
                            activation = null
                            busy = true
                            phoneMsg = null
                            model.act({ PhoneLink.grant(span.ms) }) { err ->
                                busy = false
                                phoneMsg = err
                                onCoverageChanged()
                            }
                        }) {
                            Text("Activar", style = MaterialTheme.typography.labelLarge, color = p.tone(Tone.Success))
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { activation = null }) {
                            Text("Cancelar", style = MaterialTheme.typography.labelLarge, color = p.muted)
                        }
                    },
                )
            }
        }
    }

    // --- emergent deactivation / revocation ---------------------------------
    confirm?.let { c ->
        val (title, body) = when (c) {
            Pending.Deactivate -> "Desactivar la protección" to
                "El observador dejará de mirar tu pantalla al instante. Puedes activarla cuando quieras."
            is Pending.RevokeGrant -> "Revocar el permiso de ${Humanize.source(c.g.sourceId)}" to
                "Esa fuente no podrá enviar más señales. Lo ya observado se conserva hasta que lo borres."
            is Pending.RevokeDevice -> "Revocar ${c.d.label.ifBlank { Humanize.platform(c.d.platform) }}" to
                "El dispositivo quedará desvinculado de tu cuenta y no podrá volver a usarse sin registrarlo de nuevo."
        }
        ConfirmDialog(title, body, if (c == Pending.Deactivate) "Desactivar" else "Revocar", danger = true, onDismiss = { confirm = null }, onConfirm = {
            confirm = null
            when (c) {
                Pending.Deactivate -> {
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

    // --- app explorer: every installed app, grouped by observation state ---
    if (showAppPicker) {
        val pm = ctx.packageManager
        val apps = remember { launchableApps(pm) }
        var excluded by remember { mutableStateOf(AppExclusions.excludedPackages) }
        var included by remember { mutableStateOf(AppExclusions.sensitiveIncluded) }
        val refresh = {
            excluded = AppExclusions.excludedPackages
            included = AppExclusions.sensitiveIncluded
        }
        val (observed, notObserved) = apps.partition { !AppExclusions.skips(it.second) }
        AlertDialog(
            onDismissRequest = { showAppPicker = false },
            containerColor = p.surface,
            titleContentColor = p.ink,
            title = { Text("Explorar apps", style = MaterialTheme.typography.titleLarge) },
            text = {
                Column {
                    Text(
                        "Toca Incluir o Excluir para mover una app de grupo. Las sensibles siempre empiezan sin observarse.",
                        style = MaterialTheme.typography.bodySmall, color = p.muted,
                    )
                    Gap(10.dp)
                    Column(Modifier.heightIn(max = 400.dp).verticalScroll(rememberScrollState())) {
                        Kicker("Se observan · ${observed.size}")
                        Gap(2.dp)
                        observed.forEach { (label, pkg) ->
                            val sensitive = AppExclusions.isSensitive(pkg)
                            Line(
                                label,
                                if (sensitive) "Sensible · la incluiste" else "Se observa",
                                divider = true,
                                leading = { AppIcon(pkg) },
                                trailing = {
                                    QuietAction("Excluir", {
                                        if (sensitive) AppExclusions.setSensitiveIncluded(pkg, false)
                                        else AppExclusions.setExcluded(excluded + pkg)
                                        refresh()
                                    })
                                },
                            )
                        }
                        if (notObserved.isNotEmpty()) {
                            Gap(14.dp)
                            Kicker("Sin observar · ${notObserved.size}")
                            Gap(2.dp)
                            notObserved.forEach { (label, pkg) ->
                                Line(
                                    label,
                                    if (pkg in excluded) "Excluida por ti" else "Protegida por defecto",
                                    divider = true,
                                    leading = { AppIcon(pkg) },
                                    trailing = {
                                        QuietAction("Incluir", {
                                            if (pkg in excluded) AppExclusions.setExcluded(excluded - pkg)
                                            if (AppExclusions.isSensitive(pkg) && AppExclusions.skips(pkg)) {
                                                AppExclusions.setSensitiveIncluded(pkg, true)
                                            }
                                            refresh()
                                        })
                                    },
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showAppPicker = false }) {
                    Text("Listo", style = MaterialTheme.typography.labelLarge, color = p.ink)
                }
            },
        )
    }
}

private data class Quad<A, B, C, D>(val a: A, val b: B, val c: C, val d: D)

private fun appLabel(pm: PackageManager, pkg: String): String? =
    runCatching { pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString() }.getOrNull()

/** Which glyph identifies a signal source in the grants list. */
private fun grantIcon(sourceId: String) = when {
    "android" in sourceId -> Glyphs.devicePhone
    "ext" in sourceId || "browser" in sourceId -> Glyphs.browser
    else -> Glyphs.key
}

/** Which glyph identifies a linked device by platform. */
private fun deviceIcon(platform: String) = when (platform) {
    "ANDROID", "IOS" -> Glyphs.devicePhone
    "BROWSER_EXTENSION" -> Glyphs.browser
    else -> Glyphs.monitor
}

private fun launchableApps(pm: PackageManager): List<Pair<String, String>> {
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val resolved = if (Build.VERSION.SDK_INT >= 33) {
        pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0))
    } else {
        @Suppress("DEPRECATION")
        pm.queryIntentActivities(intent, 0)
    }
    return resolved
        .mapNotNull { it.activityInfo?.packageName?.let { pkg -> it.loadLabel(pm).toString() to pkg } }
        .filter { it.second != "app.sovir.android" }
        .distinctBy { it.second }
        .sortedBy { it.first.lowercase() }
}
