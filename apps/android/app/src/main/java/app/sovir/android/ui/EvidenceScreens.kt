package app.sovir.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import app.sovir.android.data.Api
import app.sovir.android.model.DataExport
import app.sovir.android.model.Humanize
import app.sovir.android.model.Intervention
import app.sovir.android.model.ObservedEvent
import app.sovir.android.model.Tone
import app.sovir.android.model.Verdict
import app.sovir.android.model.dayHeading
import app.sovir.android.model.timeAgo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private enum class AlertFilter(val label: String) { All("Todas"), Pending("Pendientes"), Shown("Mostradas") }

@Composable
fun AlertsScreen(model: AppModel, onOpen: (String) -> Unit) = DataGate(model) { data ->
    var filter by rememberSaveable { mutableStateOf(AlertFilter.All) }
    val now = System.currentTimeMillis()
    val list = data.interventions.filter {
        when (filter) {
            AlertFilter.All -> true
            AlertFilter.Pending -> it.state == "pending"
            AlertFilter.Shown -> it.state == "delivered"
        }
    }
    DayGroupedList(
        header = {
            PageHeader(
                "Alertas",
                kicker = "Decisiones de la política",
                sub = "Cuando lo observado cruza las reglas, la política de SOVIR emite una alerta. Cada una enlaza la evidencia que la causó.",
            )
            Segmented(AlertFilter.entries, filter, { f ->
                val n = when (f) {
                    AlertFilter.All -> data.interventions.size
                    AlertFilter.Pending -> data.interventions.count { it.state == "pending" }
                    AlertFilter.Shown -> data.interventions.count { it.state == "delivered" }
                }
                "${f.label} · $n"
            }) { filter = it }
            Gap(8.dp)
            if (list.isEmpty()) {
                StateBlock(
                    StateKind.Empty,
                    if (filter == AlertFilter.All) "Sin alertas" else "Nada en este filtro",
                    "Ninguna observación cruzó las reglas de alerta. Eso no garantiza que todo sea seguro: " +
                        "SOVIR solo ve lo que tus fuentes activas observan.",
                )
            }
        },
        items = list,
        at = { it.createdAtMs },
        now = now,
    ) { i, last ->
        val event = data.eventFor(i)
        val state = Humanize.interventionState(i.state)
        Line(
            title = event?.signals?.firstOrNull()?.let(Humanize::signal) ?: "Alerta de protección",
            sub = "${event?.let { Humanize.source(it.sourceId) } ?: "Origen no disponible"} · ${timeAgo(i.createdAtMs, now)}",
            tone = state.tone,
            divider = !last,
            onClick = { onOpen(i.interventionId) },
            trailing = { Chip(state.label, state.tone, dot = false) },
        )
    }
}

private enum class SourceFilter(val label: String) { All("Todas"), Phone("Teléfono"), Browser("Navegador"), Other("Otras") }

@Composable
fun ActivityScreen(model: AppModel, onOpen: (String) -> Unit) = DataGate(model) { data ->
    var filter by rememberSaveable { mutableStateOf(SourceFilter.All) }
    val now = System.currentTimeMillis()
    val list = data.events.filter {
        when (filter) {
            SourceFilter.All -> true
            SourceFilter.Phone -> it.sourceId == "screen-observer:android"
            SourceFilter.Browser -> it.sourceId == "screen-observer:ext"
            SourceFilter.Other -> it.sourceId != "screen-observer:android" && it.sourceId != "screen-observer:ext"
        }
    }
    val alerted = data.interventions.map { it.eventId }.toSet()
    DayGroupedList(
        header = {
            PageHeader(
                "Actividad",
                kicker = "Lo observado",
                sub = "Señales que registraron tus dispositivos. SOVIR guarda el tipo de señal y una huella; nunca el texto ni capturas.",
            )
            Segmented(SourceFilter.entries, filter, { it.label }) { filter = it }
            Gap(8.dp)
            if (list.isEmpty()) {
                StateBlock(
                    StateKind.Empty,
                    "Todavía no hay observaciones",
                    "Activa el observador de este teléfono en Protección, o la extensión del navegador en tu ordenador.",
                )
            }
        },
        items = list,
        at = { it.observedAtMs },
        now = now,
    ) { e, last ->
        val labels = e.signals.map(Humanize::signal)
        val badge: (@Composable RowScope.() -> Unit)? =
            if (e.eventId in alerted) ({ Chip("Alerta", Tone.Warning, dot = false) }) else null
        Line(
            title = labels.take(2).joinToString(" · ").ifEmpty { "Sin señales de riesgo" } +
                if (labels.size > 2) " +${labels.size - 2}" else "",
            sub = "${Humanize.source(e.sourceId)} · ${Humanize.modality(e.modality)}",
            meta = fmtTime(e.observedAtMs),
            tone = if (e.eventId in alerted) Tone.Warning else Tone.Muted,
            divider = !last,
            onClick = { onOpen(e.eventId) },
            trailing = badge,
        )
    }
}

/** Lazy list grouped by calendar day with a shared header. */
@Composable
private fun <T> DayGroupedList(
    header: @Composable () -> Unit,
    items: List<T>,
    at: (T) -> Long,
    now: Long,
    row: @Composable (T, Boolean) -> Unit,
) {
    val groups = items.groupBy { dayHeading(at(it), now) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 32.dp)) {
        item { header() }
        groups.forEach { (day, rows) ->
            item(key = "h-$day") {
                Gap(14.dp)
                Kicker(day)
                Gap(2.dp)
            }
            items(rows) { r -> row(r, r === rows.last()) }
        }
    }
}

// --- detail routes --------------------------------------------------------

@Composable
fun AlertDetailScreen(model: AppModel, id: String, onBack: () -> Unit, onOpenEvent: (String) -> Unit) {
    DetailFrame("Alerta", onBack) {
        DataGate(model) { data ->
            val i = data.interventions.firstOrNull { it.interventionId == id }
            if (i == null) {
                ScreenScroll { StateBlock(StateKind.Empty, "Esta alerta ya no existe", "Puede haberse borrado del servidor.") }
                return@DataGate
            }
            val event = data.eventFor(i)
            val state = Humanize.interventionState(i.state)
            ScreenScroll {
                PageHeader(
                    event?.signals?.firstOrNull()?.let(Humanize::signal) ?: "Alerta de protección",
                    kicker = "Alerta · ${state.label}",
                    kickerTone = state.tone,
                    sub = fmtDateTime(i.createdAtMs),
                )
                if (event != null) {
                    EvidencePanel(event, data)
                    Gap(8.dp)
                    QuietAction("Abrir el evento completo", { onOpenEvent(event.eventId) })
                } else {
                    Panel { StateBlock(StateKind.Empty, "Evidencia no disponible", "El evento que causó esta alerta no está en tus datos.") }
                }
                Gap(14.dp)
                DecisionPanel(i)
                if (event != null && event.signals.isNotEmpty()) {
                    Gap(14.dp)
                    CouncilPanel(model, event.signals)
                }
                Gap(18.dp)
                Text(
                    "Las alertas las decide la política de SOVIR con reglas auditables. Los modelos solo aportan hipótesis.",
                    style = MaterialTheme.typography.bodySmall,
                    color = LocalPalette.current.muted,
                )
            }
        }
    }
}

@Composable
fun EventDetailScreen(model: AppModel, id: String, onBack: () -> Unit, onOpenAlert: (String) -> Unit) {
    DetailFrame("Evento observado", onBack) {
        DataGate(model) { data ->
            val e = data.events.firstOrNull { it.eventId == id }
            if (e == null) {
                ScreenScroll { StateBlock(StateKind.Empty, "Este evento ya no existe", "Puede haberse borrado por retención o a petición tuya.") }
                return@DataGate
            }
            val alerts = data.interventionsFor(e)
            ScreenScroll {
                PageHeader(
                    Humanize.source(e.sourceId),
                    kicker = Humanize.modality(e.modality),
                    sub = fmtDateTime(e.observedAtMs),
                )
                EvidencePanel(e, data)
                Gap(14.dp)
                Panel {
                    PanelHead("Alertas emitidas", kicker = "Política")
                    if (alerts.isEmpty()) {
                        Text(
                            "Ninguna. Las señales se registraron pero no cruzaron las reglas de alerta.",
                            style = MaterialTheme.typography.bodyMedium, color = LocalPalette.current.muted,
                        )
                        Gap(6.dp)
                    }
                    alerts.forEachIndexed { n, a ->
                        val s = Humanize.interventionState(a.state)
                        Line("Alerta · ${s.label}", fmtDateTime(a.createdAtMs), tone = s.tone, divider = n < alerts.lastIndex, onClick = { onOpenAlert(a.interventionId) })
                    }
                }
                if (e.signals.isNotEmpty()) {
                    Gap(14.dp)
                    CouncilPanel(model, e.signals)
                }
            }
        }
    }
}

@Composable
private fun EvidencePanel(e: ObservedEvent, data: DataExport) {
    val grant = data.grants.firstOrNull { it.grantId == e.consentGrantId }
    Panel {
        PanelHead("Qué se observó", trailing = { EvidenceTag("Observado") })
        if (e.signals.isEmpty()) {
            Text("Actividad registrada sin señales de riesgo.", style = MaterialTheme.typography.bodyMedium, color = LocalPalette.current.muted)
        }
        e.signals.forEach { s -> Line(Humanize.signal(s), s, tone = Tone.Muted) }
        Gap(4.dp)
        Fact("Fuente", Humanize.source(e.sourceId))
        Fact("Tipo", Humanize.modality(e.modality))
        Fact("Clase de dato", Humanize.dataClass(e.sensitiveDataClass))
        Fact("Permiso", grant?.let { if (it.revoked) "Revocado después" else "Vigente al observar" } ?: e.consentGrantId)
        Fact("Huella", shortDigest(e.contentDigest), mono = true, divider = false)
    }
}

@Composable
private fun DecisionPanel(i: Intervention) {
    val p = LocalPalette.current
    Panel {
        PanelHead("Decisión", kicker = "Política")
        Fact("Acción", if (i.kind == "warn_banner") "Aviso en pantalla" else i.kind)
        Fact("Estado", Humanize.interventionState(i.state).label, Humanize.interventionState(i.state).tone)
        Fact("Intentos de entrega", i.attempts.toString(), divider = i.lastError != null || i.audit.isNotEmpty())
        i.lastError?.let { Fact("Último error", it, Tone.Danger, divider = i.audit.isNotEmpty()) }
        if (i.audit.isNotEmpty()) {
            Gap(10.dp)
            Kicker("Historial")
            Gap(4.dp)
            i.audit.forEachIndexed { n, a ->
                Line("${Humanize.interventionState(a.from).label} → ${Humanize.interventionState(a.to).label}", a.detail.ifBlank { null }, divider = n < i.audit.lastIndex)
            }
        }
        Gap(4.dp)
    }
}

/**
 * On-demand council run over the event's typed signals. The server never
 * stored the observed text, so text voters abstain here. Remote is OFF by
 * default — it spends budget — and only ever sees typed signals.
 */
@Composable
fun CouncilPanel(model: AppModel, signals: List<String>) {
    val p = LocalPalette.current
    val scope = rememberCoroutineScope()
    var remote by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var verdict by remember { mutableStateOf<Verdict?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    Panel {
        PanelHead("Análisis del concilio", trailing = { EvidenceTag("Inferido") })
        Text(
            "Varios modelos votan sobre las señales de este evento y un árbitro determinista combina los votos. " +
                "Ninguno ve el texto original: el servidor no lo guarda.",
            style = MaterialTheme.typography.bodyMedium,
            color = p.muted,
        )
        Gap(10.dp)
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .toggleable(value = remote, role = Role.Switch, enabled = !busy, onValueChange = { remote = it }),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("Permitir modelo remoto", style = MaterialTheme.typography.bodyLarge, color = p.ink)
                Text(
                    model.budget?.let { "Consume presupuesto · disponible ${fmtUsd(it.remainingUsd)}" } ?: "Consume presupuesto de análisis",
                    style = MaterialTheme.typography.bodySmall,
                    color = p.muted,
                )
            }
            Spacer(Modifier.width(12.dp))
            Switch(
                checked = remote,
                onCheckedChange = null,
                colors = SwitchDefaults.colors(
                    checkedTrackColor = p.ink, checkedThumbColor = p.onInk,
                    uncheckedTrackColor = p.surface2, uncheckedThumbColor = p.muted, uncheckedBorderColor = p.line,
                ),
            )
        }
        Gap(8.dp)
        PrimaryButton(if (busy) "Analizando…" else if (verdict == null) "Analizar" else "Analizar de nuevo", {
            busy = true
            error = null
            scope.launch {
                runCatching { withContext(Dispatchers.IO) { Api.assess(signals, remote) } }
                    .onSuccess { verdict = it }
                    .onFailure { error = describeError(it) }
                busy = false
            }
        }, loading = busy)
        Notice(error)
        verdict?.let { v -> VerdictView(v) }
        Gap(4.dp)
    }
}

@Composable
private fun VerdictView(v: Verdict) {
    val p = LocalPalette.current
    val (outcome, tone) = Humanize.councilOutcome(v.provenance)
    Gap(18.dp)
    Rule()
    Gap(14.dp)
    Chip(outcome, tone)
    Gap(10.dp)
    Text(
        if (Humanize.isBenign(v.hypotheses)) "Sin patrón de riesgo" else v.hypotheses.joinToString(", ") { Humanize.hypothesis(it) }
            .replaceFirstChar { it.uppercase() },
        style = MaterialTheme.typography.titleLarge,
        color = p.ink,
    )
    Gap(4.dp)
    Text(
        "Puntuación de evidencia ${fmtPct(v.confidenceBp)} · no es una probabilidad calibrada",
        style = MaterialTheme.typography.bodySmall,
        color = p.muted,
    )
    if (v.votes.isNotEmpty()) {
        Gap(12.dp)
        Kicker("Votos")
        Gap(2.dp)
        Column(verticalArrangement = Arrangement.spacedBy(0.dp)) {
            v.votes.forEachIndexed { n, vote ->
                Line(
                    Humanize.voter(vote.voter),
                    vote.hypotheses.joinToString(", ") { Humanize.hypothesis(it) }.ifEmpty { "sin hipótesis" },
                    meta = fmtPct(vote.confidenceBp),
                    tone = if (Humanize.isBenign(vote.hypotheses)) Tone.Success else Tone.Warning,
                    divider = n < v.votes.lastIndex,
                )
            }
        }
    }
    v.costMicroUsd?.takeIf { it > 0 }?.let {
        Gap(8.dp)
        Fact("Costo del análisis", fmtMicroUsd(it), divider = false)
    }
    Gap(8.dp)
    Text("Modelo: ${v.modelId}", style = MaterialTheme.typography.labelSmall, color = p.muted, modifier = Modifier.padding(top = 2.dp))
}
