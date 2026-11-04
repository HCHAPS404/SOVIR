@file:OptIn(ExperimentalMaterial3Api::class)

package app.sovir.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.sovir.android.data.PhoneLink
import app.sovir.android.model.ThemeChoice
import app.sovir.android.model.Tone
import app.sovir.android.model.timeAgo

enum class Tab(val label: String, val icon: ImageVector, val tag: String) {
    Home("Resumen", Glyphs.home, "tab-home"),
    Alerts("Alertas", Glyphs.bell, "tab-alerts"),
    Activity("Actividad", Glyphs.pulse, "tab-activity"),
    Protection("Protección", Glyphs.shield, "tab-protection"),
    Account("Cuenta", Glyphs.person, "tab-account"),
}

/** What this phone can actually observe right now — read from the OS + grant. */
data class Coverage(
    val observerOs: Boolean,
    val observerAlive: Boolean,
    val uploadAllowed: Boolean,
    val grantExpiresAt: Long,
    val notifications: Boolean,
) {
    /** Toggle enabled but the service is dead (OEM killed it) — needs re-activation. */
    val observerInterrupted get() = observerOs && !observerAlive
    val observing get() = observerOs && observerAlive && uploadAllowed
}

@Composable
fun currentCoverage(@Suppress("UNUSED_PARAMETER") tick: Int = 0): Coverage {
    val ctx = LocalContext.current
    resumeTick() // re-read after returning from system settings
    return Coverage(
        observerOs = isObserverEnabled(ctx),
        observerAlive = PhoneLink.observerAlive(),
        uploadAllowed = PhoneLink.uploadAllowed(),
        grantExpiresAt = PhoneLink.grantExpiresAt,
        notifications = notificationsAllowed(ctx),
    )
}

@Composable
fun ShellScreen(
    model: AppModel,
    requestedTab: Tab?,
    theme: ThemeChoice,
    onTheme: (ThemeChoice) -> Unit,
    onOpenAlert: (String) -> Unit,
    onOpenEvent: (String) -> Unit,
    onSignedOut: () -> Unit,
) {
    var tabName by rememberSaveable { mutableStateOf((requestedTab ?: Tab.Home).name) }
    LaunchedEffect(requestedTab) { requestedTab?.let { tabName = it.name } }
    val tab = Tab.valueOf(tabName)
    val p = LocalPalette.current
    // Bumped after grant/revoke so PhoneLink is re-read in this composition.
    var coverageTick by rememberSaveable { mutableStateOf(0) }
    val coverage = currentCoverage(coverageTick)
    val pending = model.data?.interventions?.count { it.state == "pending" } ?: 0

    Scaffold(
        containerColor = p.canvas,
        topBar = {
            Column(Modifier.fillMaxWidth().background(p.canvas).statusBarsPadding()) {
                Row(
                    Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 20.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    BrandLockup(22.dp)
                    Spacer(Modifier.weight(1f))
                    SyncChip(model)
                }
                AlertBar(model, coverage, pending) { tabName = it.name }
                Rule()
            }
        },
        bottomBar = {
            NavigationBar(containerColor = p.canvas, tonalElevation = 0.dp) {
                Tab.entries.forEach { t ->
                    NavigationBarItem(
                        selected = t == tab,
                        onClick = { tabName = t.name },
                        modifier = Modifier.testTag(t.tag),
                        icon = {
                            if (t == Tab.Alerts && pending > 0) {
                                BadgedBox(badge = { Badge(containerColor = p.warning, contentColor = p.onInk) { Text(pending.toString()) } }) {
                                    Icon(t.icon, contentDescription = null)
                                }
                            } else {
                                Icon(t.icon, contentDescription = null)
                            }
                        },
                        label = { Text(t.label, style = MaterialTheme.typography.labelMedium, maxLines = 1) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = p.ink, selectedTextColor = p.ink,
                            unselectedIconColor = p.muted, unselectedTextColor = p.muted,
                            indicatorColor = p.surface2,
                        ),
                    )
                }
            }
        },
    ) { inner ->
        PullToRefreshBox(
            isRefreshing = model.refreshing && model.data != null,
            onRefresh = model::refresh,
            modifier = Modifier.fillMaxSize().padding(inner),
        ) {
            when (tab) {
                Tab.Home -> HomeScreen(model, coverage, onTab = { tabName = it.name }, onOpenAlert, onOpenEvent)
                Tab.Alerts -> AlertsScreen(model, onOpenAlert)
                Tab.Activity -> ActivityScreen(model, onOpenEvent)
                Tab.Protection -> ProtectionScreen(model, coverage) { coverageTick++ }
                Tab.Account -> AccountScreen(model, theme, onTheme, onSignedOut)
            }
        }
    }
}

@Composable
private fun SyncChip(model: AppModel) {
    val (label, tone) = when (model.sync) {
        Sync.Ready -> "En línea" to Tone.Success
        Sync.Loading -> "Conectando" to Tone.Unknown
        Sync.Offline -> "Sin conexión" to Tone.Warning
        Sync.SignedOut -> "Sesión cerrada" to Tone.Warning
        Sync.Error -> "Error del servidor" to Tone.Danger
    }
    Box(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) { Chip(label, tone) }
}

/**
 * One line, highest priority first. Never a "you are protected" banner:
 * the bar only speaks when something needs attention or is not covered.
 */
@Composable
private fun AlertBar(model: AppModel, coverage: Coverage, pending: Int, onTab: (Tab) -> Unit) {
    val now = System.currentTimeMillis()
    val item: Triple<String, String, () -> Unit>? = when {
        model.sync == Sync.SignedOut -> Triple("Tu sesión terminó", "Entrar", model::refresh)
        model.sync == Sync.Offline -> Triple(
            model.updatedAt?.let { "Sin conexión · datos de ${timeAgo(it, now)}" } ?: "Sin conexión con tu servidor",
            "Reintentar",
            model::refresh,
        )
        model.sync == Sync.Error -> Triple("El servidor respondió con un error", "Reintentar", model::refresh)
        pending > 0 -> Triple(plural(pending, "aviso pendiente", "avisos pendientes"), "Ver") { onTab(Tab.Alerts) }
        !coverage.observing -> Triple("La protección de este teléfono está en pausa", "Revisar") { onTab(Tab.Protection) }
        !coverage.notifications -> Triple("Avisos bloqueados", "Revisar") { onTab(Tab.Protection) }
        else -> null
    }
    if (item == null) return
    val tone = when {
        model.sync == Sync.Error -> Tone.Danger
        model.sync == Sync.Offline || pending > 0 -> Tone.Warning
        else -> Tone.Unknown
    }
    val p = LocalPalette.current
    Row(
        Modifier
            .fillMaxWidth()
            .background(p.surface)
            .clickable(role = Role.Button, onClick = item.third)
            .heightIn(min = 44.dp)
            .padding(horizontal = 20.dp, vertical = 10.dp)
            .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite }
            .testTag("alert-bar"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Dot(tone)
        Spacer(Modifier.width(10.dp))
        Text(item.first, style = MaterialTheme.typography.bodyMedium, color = p.ink, modifier = Modifier.weight(1f), maxLines = 1)
        Text(item.second, style = MaterialTheme.typography.labelLarge, color = p.tone(tone))
    }
}

/** Shared top bar for detail routes. */
@Composable
fun DetailFrame(title: String, onBack: () -> Unit, content: @Composable () -> Unit) {
    val p = LocalPalette.current
    Column(Modifier.fillMaxSize().background(p.canvas).statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            androidx.compose.material3.IconButton(onClick = onBack) {
                Icon(Glyphs.back, contentDescription = "Volver", tint = p.ink)
            }
            Text(title, style = MaterialTheme.typography.titleMedium, color = p.ink, maxLines = 1)
        }
        Rule()
        Box(Modifier.fillMaxSize()) { content() }
    }
}
