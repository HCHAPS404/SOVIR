package app.sovir.android.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.sovir.android.model.Copy
import app.sovir.android.model.LocalState
import app.sovir.android.model.SourceId
import app.sovir.android.model.ThemeChoice
import app.sovir.android.model.pendingLabel
import app.sovir.android.model.pendingOf
import app.sovir.android.model.sources

@Composable
fun HomePage(state: LocalState, onOpenLink: (SourceId) -> Unit, onOpenPermissions: () -> Unit) {
    Page {
        Kicker(Copy.sessionKicker)
        Spacer(Modifier.height(8.dp))
        PageTitle(Copy.homeTitle)
        Spacer(Modifier.height(12.dp))
        Body(Copy.homeLede, emphasis = true)
        Spacer(Modifier.height(20.dp))
        Fact(Copy.capture, Copy.noPermission, onOpenPermissions)
        Fact(Copy.lastEvent, Copy.none)
        Fact(Copy.links, if (state.pending.isEmpty()) Copy.none else Copy.localNotes)
        Spacer(Modifier.height(28.dp))
        Text(Copy.toConnect, style = MaterialTheme.typography.titleLarge, color = LocalPalette.current.ink)
        Spacer(Modifier.height(8.dp))
        sources.forEach { source ->
            Fact(source.title, pendingLabel(pendingOf(source.id in state.pending))) { onOpenLink(source.id) }
        }
        Spacer(Modifier.height(16.dp))
        Body(Copy.noNetwork)
    }
}

@Composable
fun LinksPage(state: LocalState, onOpenLink: (SourceId) -> Unit, onBack: (() -> Unit)? = null) {
    Page {
        if (onBack != null) {
            androidx.compose.material3.IconButton(onClick = onBack) {
                androidx.compose.material3.Icon(Glyphs.back, contentDescription = Copy.back, tint = LocalPalette.current.ink)
            }
        }
        PageTitle(Copy.connectionsTitle)
        Spacer(Modifier.height(12.dp))
        Body(Copy.connectionsLede, emphasis = true)
        Spacer(Modifier.height(20.dp))
        sources.forEach { source ->
            Fact(source.title, pendingLabel(pendingOf(source.id in state.pending))) { onOpenLink(source.id) }
        }
        Spacer(Modifier.height(16.dp))
        Body(Copy.noNetwork)
    }
}

@Composable
fun LinkDetailPage(
    id: SourceId,
    marked: Boolean,
    noteFailed: Boolean,
    onToggle: () -> Unit,
    onBack: () -> Unit,
) {
    val source = sources.first { it.id == id }
    val palette = LocalPalette.current
    Page {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Glyphs.back, contentDescription = Copy.backLinks, tint = palette.ink)
            }
            Text(Copy.connectionsTitle, style = MaterialTheme.typography.bodyLarge, color = palette.muted)
        }
        Spacer(Modifier.height(12.dp))
        PageTitle(source.title)
        Spacer(Modifier.height(8.dp))
        Kicker(pendingLabel(pendingOf(marked)))
        Spacer(Modifier.height(16.dp))
        Body(source.summary, emphasis = true)
        Spacer(Modifier.height(8.dp))
        Body(source.body)
        Spacer(Modifier.height(8.dp))
        Body(Copy.pendingExplain)
        Spacer(Modifier.height(24.dp))
        if (marked) LineAction(Copy.clearPending, onToggle) else FilledAction(Copy.markPending, onToggle)
        if (noteFailed) {
            Spacer(Modifier.height(12.dp))
            Text(Copy.noteFailed, color = palette.danger, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun ActivityPage() {
    var incidents by remember { mutableStateOf(true) }
    var fixture by remember { mutableStateOf(false) }
    val palette = LocalPalette.current
    Page {
        PageTitle(Copy.activity)
        Spacer(Modifier.height(16.dp))
        Row(Modifier.fillMaxWidth()) {
            val incidentMod = Modifier.weight(1f)
            if (incidents) FilledAction(Copy.incidents, { incidents = true }, incidentMod)
            else LineAction(Copy.incidents, { incidents = true }, incidentMod)
            Spacer(Modifier.width(8.dp))
            val other = Modifier.weight(1f)
            if (!incidents) FilledAction(Copy.investigation, { incidents = false }, other)
            else LineAction(Copy.investigation, { incidents = false }, other)
        }
        Spacer(Modifier.height(20.dp))
        if (incidents) {
            Body(Copy.incidentsEmpty, emphasis = true)
            Spacer(Modifier.height(16.dp))
            if (fixture) {
                Text(Copy.fixtureBanner.uppercase(), style = MaterialTheme.typography.labelSmall, color = palette.brand)
                Spacer(Modifier.height(12.dp))
                Text(Copy.fixtureObserved, style = MaterialTheme.typography.titleLarge, color = palette.ink)
                Spacer(Modifier.height(6.dp))
                Body(Copy.fixtureObservedBody, emphasis = true)
                Spacer(Modifier.height(14.dp))
                Text(Copy.fixtureInferred, style = MaterialTheme.typography.titleLarge, color = palette.ink)
                Spacer(Modifier.height(6.dp))
                Body(Copy.fixtureInferredBody, emphasis = true)
                Spacer(Modifier.height(14.dp))
                Text(Copy.fixtureUnknown, style = MaterialTheme.typography.titleLarge, color = palette.ink)
                Spacer(Modifier.height(6.dp))
                Body(Copy.fixtureUnknownBody, emphasis = true)
                Spacer(Modifier.height(16.dp))
                LineAction(Copy.hideFixture, onClick = { fixture = false })
            } else {
                LineAction(Copy.showFixture, onClick = { fixture = true })
            }
        } else {
            Body(Copy.investigationEmpty, emphasis = true)
            Spacer(Modifier.height(8.dp))
            Body(Copy.investigationSteps)
        }
    }
}

@Composable
fun AccountPage(
    state: LocalState,
    notice: String?,
    onTheme: (ThemeChoice) -> Unit,
    onPermissions: () -> Unit,
    onClose: () -> Unit,
    onSettings: () -> Unit,
) {
    Page {
        Kicker(Copy.sessionKicker)
        Spacer(Modifier.height(8.dp))
        PageTitle(Copy.account)
        Spacer(Modifier.height(12.dp))
        Body(Copy.developerProfile, emphasis = true)
        Spacer(Modifier.height(4.dp))
        Body(Copy.noIdentity)
        Spacer(Modifier.height(24.dp))
        Text(Copy.theme, style = MaterialTheme.typography.titleLarge, color = LocalPalette.current.ink)
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth()) {
            ThemeChoice.entries.forEachIndexed { index, choice ->
                val label = when (choice) {
                    ThemeChoice.System -> Copy.system
                    ThemeChoice.Light -> Copy.light
                    ThemeChoice.Dark -> Copy.dark
                }
                val modifier = Modifier.weight(1f)
                if (state.theme == choice) FilledAction(label, { onTheme(choice) }, modifier)
                else LineAction(label, { onTheme(choice) }, modifier)
                if (index != ThemeChoice.entries.lastIndex) Spacer(Modifier.width(8.dp))
            }
        }
        Spacer(Modifier.height(24.dp))
        Fact("Ajustes", "Solo en este teléfono", onSettings)
        Fact(Copy.permissions, Copy.noPermission, onPermissions)
        Spacer(Modifier.height(24.dp))
        LineAction(Copy.closeSession, onClose)
        Spacer(Modifier.height(10.dp))
        Body(Copy.closeNote)
        if (notice != null) {
            Spacer(Modifier.height(12.dp))
            Text(notice, color = LocalPalette.current.danger, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun PermissionsPage(onBack: () -> Unit) {
    val palette = LocalPalette.current
    Page {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Glyphs.back, contentDescription = Copy.back, tint = palette.ink)
            }
        }
        PageTitle(Copy.permissionsTitle)
        Spacer(Modifier.height(12.dp))
        Body(Copy.permissionsLede, emphasis = true)
        Spacer(Modifier.height(12.dp))
        Body(Copy.permissionsBody)
        Spacer(Modifier.height(20.dp))
        Fact(Copy.capture, Copy.noPermission)
        Fact(Copy.pause, Copy.pauseValue)
        Fact(Copy.revoke, Copy.revokeValue)
    }
}
