package app.sovir.android.ui

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.sovir.android.model.Sheet
import app.sovir.android.model.Sheets

@Composable
fun IndexPage(kicker: String, title: String, lede: String, rows: List<Pair<String, String>>, onOpen: (String) -> Unit) {
    Page {
        Kicker(kicker)
        Spacer(Modifier.height(8.dp))
        PageTitle(title)
        Spacer(Modifier.height(12.dp))
        Body(lede, emphasis = true)
        Spacer(Modifier.height(16.dp))
        rows.forEach { (id, label) ->
            val value = rowsValue(id)
            Fact(label, value) { onOpen(id) }
        }
    }
}

private fun rowsValue(id: String) = when (id) {
    "protecciones", "permisos" -> "Sin permiso"
    "incidentes", "investigacion", "notificaciones" -> "Vacío"
    "dispositivos", "conexiones" -> "Sin enlace"
    "recursos", "facturacion" -> "Cero"
    "widgets" -> "No anclado"
    "politicas", "agregados", "integraciones", "auditoria" -> "Sin datos"
    else -> "Abrir"
}

@Composable
fun SheetPage(sheet: Sheet, onOpen: (String) -> Unit) {
    var fixture by rememberSaveable { mutableStateOf(false) }
    var pause by rememberSaveable { mutableStateOf(false) }
    val shown = if (sheet.id == "incidentes" && fixture) Sheets.incidentsReview else sheet
    Page {
        Kicker(if (fixture && sheet.id == "incidentes") "Fixture sintético" else "Sesión de demostración")
        Spacer(Modifier.height(8.dp))
        PageTitle(shown.title)
        Spacer(Modifier.height(12.dp))
        Body(shown.lede, emphasis = true)
        Spacer(Modifier.height(16.dp))
        shown.rows.forEach { (name, value) -> Fact(name, value) }
        shown.blocks.forEach { block ->
            Spacer(Modifier.height(18.dp))
            Text(block.heading, style = MaterialTheme.typography.titleLarge, color = LocalPalette.current.ink)
            Spacer(Modifier.height(6.dp))
            Body(block.body, emphasis = true)
        }
        Spacer(Modifier.height(14.dp))
        Body(shown.note)
        if (sheet.id == "incidentes") {
            Spacer(Modifier.height(16.dp))
            if (fixture) LineAction("Ocultar el fixture", onClick = { fixture = false })
            else LineAction("Ver un fixture sintético", onClick = { fixture = true })
        }
        if (sheet.id == "permisos") {
            Spacer(Modifier.height(16.dp))
            if (pause) {
                Body("La pausa está dibujada en este teléfono. El sistema no recibió nada.", emphasis = true)
                Spacer(Modifier.height(10.dp))
                LineAction("Quitar la pausa dibujada", onClick = { pause = false })
            } else {
                FilledAction("Dibujar la pausa", onClick = { pause = true })
            }
        }
        if (shown.actionLabel != null && shown.actionId != null) {
            Spacer(Modifier.height(16.dp))
            FilledAction(shown.actionLabel, onClick = { onOpen(shown.actionId) })
        }
    }
}

@Composable
fun NoticesPage() {
    var open by rememberSaveable { mutableStateOf(false) }
    val palette = LocalPalette.current
    Page {
        Kicker("Trabajo")
        Spacer(Modifier.height(8.dp))
        PageTitle("Notificaciones")
        Spacer(Modifier.height(12.dp))
        Body("El centro está vacío. Vacío no significa protegido.", emphasis = true)
        Spacer(Modifier.height(16.dp))
        if (open) {
            Text("FIXTURE SINTÉTICO", style = MaterialTheme.typography.labelSmall, color = palette.brand)
            Spacer(Modifier.height(8.dp))
            Text("Una página de prueba pide un código", style = MaterialTheme.typography.titleLarge, color = palette.ink)
            Spacer(Modifier.height(6.dp))
            Body("Inferido, no verificado. Este aviso no salió a la barra del sistema.")
            Spacer(Modifier.height(12.dp))
            LineAction("Cerrar el aviso", onClick = { open = false })
        } else {
            Body("Ningún aviso en este teléfono.")
            Spacer(Modifier.height(12.dp))
            FilledAction("Ver un aviso sintético", onClick = { open = true })
        }
        Spacer(Modifier.height(16.dp))
        Fact("Barra del sistema", "Sin aviso")
        Fact("Push", "No hay")
    }
}

@Composable
fun WidgetPage() {
    var medium by rememberSaveable { mutableStateOf(false) }
    Page {
        Kicker("Este teléfono")
        Spacer(Modifier.height(8.dp))
        PageTitle("Widget")
        Spacer(Modifier.height(12.dp))
        Body("No está en la pantalla de inicio. Esto es su forma.", emphasis = true)
        Spacer(Modifier.height(16.dp))
        if (medium) LineAction("Ver tamaño pequeño", onClick = { medium = false }) else FilledAction("Ver tamaño mediano", onClick = { medium = true })
        Spacer(Modifier.height(16.dp))
        Text("Sin cobertura que afirmar", style = MaterialTheme.typography.titleLarge, color = LocalPalette.current.ink)
        Spacer(Modifier.height(6.dp))
        Body(if (medium) "Tamaño mediano. Sigue sin anclarse y sin leer la pantalla." else "Tamaño pequeño. Sigue sin anclarse y sin leer la pantalla.")
        Spacer(Modifier.height(16.dp))
        Fact("Anclado", "No")
        Fact("Captura", "Sin permiso")
    }
}
