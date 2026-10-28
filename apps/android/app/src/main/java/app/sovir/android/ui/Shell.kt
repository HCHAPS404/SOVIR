package app.sovir.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import app.sovir.android.model.Copy
import app.sovir.android.model.LocalState
import app.sovir.android.model.SessionRepository
import app.sovir.android.model.SourceId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

private enum class Tab(val label: String, val icon: ImageVector, val tag: String) {
    Home(Copy.home, Glyphs.home, "tab-home"),
    Work("Operación", Glyphs.list, "tab-work"),
    Org("Organización", Glyphs.org, "tab-org"),
    Account(Copy.account, Glyphs.person, "tab-account"),
}

@Composable
fun ShellScreen(
    state: LocalState,
    wide: Boolean,
    scope: CoroutineScope,
    repo: SessionRepository,
    onOpenLink: (SourceId) -> Unit,
    onOpenSection: (String) -> Unit,
    onOpenPermissions: () -> Unit,
    onClose: () -> Unit,
    notice: String?,
    onSaveFailed: () -> Unit,
) {
    var tabName by rememberSaveable { mutableStateOf(Tab.Home.name) }
    val tab = Tab.entries.firstOrNull { it.name == tabName } ?: Tab.Home
    val palette = LocalPalette.current
    val itemColors = NavigationBarItemDefaults.colors(
        selectedIconColor = palette.ink,
        selectedTextColor = palette.ink,
        unselectedIconColor = palette.muted,
        unselectedTextColor = palette.muted,
        indicatorColor = palette.surface,
    )
    Scaffold(
        containerColor = palette.canvas,
        topBar = {
            Column(Modifier.fillMaxWidth()) {
                Row(
                    Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    BrandLockup(26.dp)
                }
                Hairline()
            }
        },
        bottomBar = {
            if (!wide) {
                Column {
                    Hairline()
                    NavigationBar(containerColor = palette.canvas, tonalElevation = 0.dp) {
                        Tab.entries.forEach { item ->
                            NavigationBarItem(
                                selected = item == tab,
                                onClick = { tabName = item.name },
                                icon = { Icon(item.icon, contentDescription = null) },
                                label = { Text(item.label) },
                                colors = itemColors,
                                modifier = Modifier.testTag(item.tag),
                            )
                        }
                    }
                }
            }
        },
    ) { padding ->
        Row(Modifier.fillMaxSize().padding(padding)) {
            if (wide) {
                NavigationRail(containerColor = palette.canvas, modifier = Modifier.fillMaxHeight().width(132.dp)) {
                    Spacer(Modifier.height(8.dp))
                    Tab.entries.forEach { item ->
                        NavigationRailItem(
                            selected = item == tab,
                            onClick = { tabName = item.name },
                            icon = { Icon(item.icon, contentDescription = null) },
                            label = { Text(item.label) },
                            colors = NavigationRailItemDefaults.colors(
                                selectedIconColor = palette.ink,
                                selectedTextColor = palette.ink,
                                unselectedIconColor = palette.muted,
                                unselectedTextColor = palette.muted,
                                indicatorColor = palette.surface,
                            ),
                            modifier = Modifier.testTag(item.tag),
                        )
                    }
                }
                VerticalDivider(color = palette.line, thickness = 1.dp, modifier = Modifier.fillMaxHeight())
            }
            Box(Modifier.weight(1f).fillMaxHeight()) {
                when (tab) {
                    Tab.Home -> HomePage(state, onOpenLink, onOpenPermissions)
                    Tab.Work -> IndexPage(
                        "Trabajo",
                        "Operación",
                        "Cada fila abre su pantalla. Ninguna observa el teléfono.",
                        listOf(
                            "protecciones" to "Protecciones",
                            "incidentes" to "Incidentes",
                            "investigacion" to "Investigación",
                            "dispositivos" to "Dispositivos",
                            "conexiones" to "Conexiones",
                            "permisos" to "Permisos",
                            "recursos" to "Recursos",
                            "notificaciones" to "Notificaciones",
                            "widgets" to "Widget",
                        ),
                        onOpenSection,
                    )
                    Tab.Org -> IndexPage(
                        "Organización",
                        "Organización",
                        "Sin personas identificadas y sin cifras inventadas.",
                        listOf(
                            "politicas" to "Políticas",
                            "agregados" to "Agregados",
                            "integraciones" to "Integraciones",
                            "auditoria" to "Auditoría",
                            "facturacion" to "Facturación",
                        ),
                        onOpenSection,
                    )
                    Tab.Account -> AccountPage(
                        state = state,
                        notice = notice,
                        onTheme = { choice ->
                            scope.launch {
                                if (!repo.setTheme(choice)) onSaveFailed()
                            }
                        },
                        onPermissions = onOpenPermissions,
                        onClose = onClose,
                        onSettings = { onOpenSection("ajustes") },
                    )
                }
            }
        }
    }
}

@Composable
fun StatusScreen(message: String) {
    val palette = LocalPalette.current
    Page {
        BrandLockup()
        Spacer(Modifier.height(28.dp))
        Text(message, style = androidx.compose.material3.MaterialTheme.typography.bodyLarge, color = palette.ink)
    }
}
