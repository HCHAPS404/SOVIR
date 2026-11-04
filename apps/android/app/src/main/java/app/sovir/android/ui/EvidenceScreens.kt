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

private enum class AlertFilter(val label: String) { All("Todas"), Pending("Nuevas"), Shown("Vistas") }

@Composable
fun AlertsScreen(model: AppModel, onOpen: (String) -> Unit) = DataGate(model) { data ->
    var filter by rememberSaveable { mutableStateOf(AlertFilter.All) }
    var showAll by rememberSaveable { mutableStateOf(false) }
    val now = System.currentTimeMillis()
    val list = data.interventions.filter {
        when (filter) {
            AlertFilter.All -> true
            AlertFilter.Pending -> it.state == "pending"
            AlertFilter.Shown -> it.state == "delivered"
        }
    }
    val shown = if (showAll) list else list.take(5)
    DayGroupedList(
        header = {
            PageHeader(
                "Avisos",
                kicker = "Cuando algo parece riesgo",
                sub = "SOVIR te avisa cuando lo observado cruza sus reglas de riesgo. Toca un aviso para ver qué lo causó.",
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
                    if (filter == AlertFilter.All) "Sin avisos" else "Nada en este filtro",
                    "Nada observado cruzó el nivel de aviso. Ten en cuenta que SOVIR solo ve lo que tus dispositivos activos observan.",
                )
            }
        },
        items = shown,
        at = { it.createdAtMs },
        now = now,
        footer = if (list.size > 5) ({
            Gap(10.dp)
            SecondaryButton(
                if (showAll) "Ver menos" else "Ver más · ${list.size - shown.size} restantes",
                { showAll = !showAll },
            )
        }) else null,
    ) { i, last ->
        val event = data.eventFor(i)
        val state = Humanize.interventionState(i.state)
        Line(
            title = event?.signals?.let(Humanize::dominantSignal)?.let(Humanize::signal) ?: "Aviso de protección",
            sub = "${event?.let { Humanize.source(it.sourceId) } ?: "Origen no disponible"} · ${timeAgo(i.createdAtMs, now)}",
            divider = !last,
            leading = { GlyphTile(event?.let { sourceIcon(it.sourceId) } ?: Glyphs.bell, state.tone) },
            onClick = { onOpen(i.interventionId) },
            trailing = { Chip(state.label, state.tone, dot = false) },
        )
    }
}

private enum class SourceFilter(val label: String) { All("Todas"), Phone("Este teléfono"), Browser("Navegador"), Other("Otras") }

@Composable
fun ActivityScreen(model: AppModel, onOpen: (String) -> Unit) = DataGate(model) { data ->
    var filter by rememberSaveable { mutableStateOf(SourceFilter.All) }
    var showAll by rememberSaveable { mutableStateOf(false) }
    val now = System.currentTimeMillis()
    val list = data.events.filter {
        when (filter) {
            SourceFilter.All -> true
            SourceFilter.Phone -> it.sourceId == "screen-observer:android"
            SourceFilter.Browser -> it.sourceId == "screen-observer:ext"
            SourceFilter.Other -> it.sourceId != "screen-observer:android" && it.sourceId != "screen-observer:ext"
        }
    }
    val shown = if (showAll) list else list.take(8)
    val alerted = data.interventions.map { it.eventId }.toSet()
    DayGroupedList(
        header = {
            PageHeader(
                "Actividad",
                kicker = "Lo observado",
                sub = "Señales que detectaron tus dispositivos. SOVIR guarda el tipo de señal y una huella; nunca el texto ni capturas.",
            )
            Segmented(SourceFilter.entries, filter, { it.label }) { filter = it }
            Gap(8.dp)
            if (list.isEmpty()) {
                StateBlock(
                    StateKind.Empty,
                    "Todavía no hay observaciones",
                    "Activa la protección de este teléfono en Protección, o la extensión del navegador en tu ordenador.",
                )
            }
        },
        items = shown,
        at = { it.observedAtMs },
        now = now,
        footer = if (list.size > 8) ({
            Gap(10.dp)
            SecondaryButton(
                if (showAll) "Ver menos" else "Ver más · ${list.size - shown.size} restantes",
                { showAll = !showAll },
            )
        }) else null,
    ) { e, last ->
        // The row is named by the most alarming signal — not whichever was
        // stored first — and the rest collapse into a "+N señales" suffix.
        val dominant = Humanize.dominantSignal(e.signals)
        val rest = e.signals.size - 1
        val badge: (@Composable RowScope.() -> Unit)? =
            if (e.eventId in alerted) ({ Chip("Aviso", Tone.Warning, dot = false) }) else null
        Line(
            title = dominant?.let(Humanize::signal) ?: "Actividad sin señales de riesgo",
            sub = buildString {
                append(Humanize.source(e.sourceId))
                append(" · ")
                append(Humanize.modality(e.modality))
                if (rest > 0) append(" · +$rest señales")
            },
            meta = fmtTime(e.observedAtMs),
            divider = !last,
            leading = { GlyphTile(sourceIcon(e.sourceId), if (e.eventId in alerted) Tone.Warning else Tone.Muted) },
            onClick = { onOpen(e.eventId) },
            trailing = badge,
        )
    }
}

/** Glyph that identifies where an observation came from. */
private fun sourceIcon(sourceId: String) = when {
    "android" in sourceId -> Glyphs.devicePhone
    "ext" in sourceId || "browser" in sourceId -> Glyphs.browser
    else -> Glyphs.key
}

/** Lazy list grouped by calendar day with a shared header and optional footer. */
@Composable
private fun <T> DayGroupedList(
    header: @Composable () -> Unit,
    items: List<T>,
    at: (T) -> Long,
    now: Long,
    footer: (@Composable () -> Unit)? = null,
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
        if (footer != null) item { footer() }
    }
}

// --- detail routes --------------------------------------------------------

@Composable
fun AlertDetailScreen(model: AppModel, id: String, onBack: () -> Unit, onOpenEvent: (String) -> Unit) {
    DetailFrame("Aviso", onBack) {
        DataGate(model) { data ->
            val i = data.interventions.firstOrNull { it.interventionId == id }
            if (i == null) {
                ScreenScroll { StateBlock(StateKind.Empty, "Este aviso ya no existe", "Puede haberse borrado del servidor.") }
                return@DataGate
            }
            val event = data.eventFor(i)
            val state = Humanize.interventionState(i.state)
            ScreenScroll {
                PageHeader(
                    event?.signals?.firstOrNull()?.let(Humanize::signal) ?: "Aviso de protección",
                    kicker = "Aviso · ${state.label}",
                    kickerTone = state.tone,
                    sub = fmtDateTime(i.createdAtMs),
                )
                if (event != null) {
                    EvidencePanel(event, data)
                    Gap(8.dp)
                    QuietAction("Ver la observación completa", { onOpenEvent(event.eventId) })
                } else {
                    Panel { StateBlock(StateKind.Empty, "Evidencia no disponible", "La observación que causó este aviso no está en tus datos.") }
                }
                Gap(14.dp)
                ActionPanel(i)
                if (event != null && event.signals.isNotEmpty()) {
                    Gap(14.dp)
                    CouncilPanel(model, event.signals, event.eventId)
                }
                Gap(18.dp)
                Text(
                    "Ningún aviso lo inventa un modelo: SOVIR aplica reglas fijas y auditables sobre lo observado.",
                    style = MaterialTheme.typography.bodySmall,
                    color = LocalPalette.current.muted,
                )
            }
        }
    }
}

@Composable
fun EventDetailScreen(model: AppModel, id: String, onBack: () -> Unit, onOpenAlert: (String) -> Unit) {
    DetailFrame("Observación", onBack) {
        DataGate(model) { data ->
            val e = data.events.firstOrNull { it.eventId == id }
            if (e == null) {
                ScreenScroll { StateBlock(StateKind.Empty, "Esta observación ya no existe", "Puede haberse borrado por retención o a petición tuya.") }
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
                if (e.signals.isNotEmpty()) {
                    Gap(14.dp)
                    ExplainPanel(e.eventId)
                }
                Gap(14.dp)
                Panel {
                    PanelHead("Avisos que generó")
                    if (alerts.isEmpty()) {
                        Text(
                            "Ninguno. Las señales quedaron registradas pero no cruzaron el nivel de aviso.",
                            style = MaterialTheme.typography.bodyMedium, color = LocalPalette.current.muted,
                        )
                        Gap(6.dp)
                    }
                    alerts.forEachIndexed { n, a ->
                        val s = Humanize.interventionState(a.state)
                        Line("Aviso · ${s.label}", fmtDateTime(a.createdAtMs), tone = s.tone, divider = n < alerts.lastIndex, onClick = { onOpenAlert(a.interventionId) })
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
        Fact("Dónde", Humanize.source(e.sourceId))
        Fact("Qué", Humanize.modality(e.modality))
        Fact("Cuándo", fmtDateTime(e.observedAtMs))
        Fact(
            "Tu permiso",
            grant?.let { if (it.revoked) "Lo revocaste después" else "Vigente cuando se observó" } ?: "Ya no está en tus datos",
            divider = false,
        )
    }
}

/**
 * A1 — "why" in human language. Fetches the server explanation for this
 * event's typed signals (remote Meta → Baseten → local template chain);
 * only typed signals ever leave the server. Provenance is shown honestly
 * so the user knows whether an AI or a template wrote the text.
 */
@Composable
private fun ExplainPanel(eventId: String) {
    val p = LocalPalette.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var exp by remember { mutableStateOf<app.sovir.android.model.Explanation?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    Panel {
        PanelHead("Por qué te lo decimos", trailing = { EvidenceTag("Explicado") })
        if (exp == null) {
            Text(
                "Las señales detectadas explicadas en palabras sencillas.",
                style = MaterialTheme.typography.bodyMedium, color = p.muted,
            )
            Gap(10.dp)
        }
        exp?.let { x ->
            Text(x.text, style = MaterialTheme.typography.bodyLarge, color = p.ink)
            Gap(8.dp)
            val (who, tone) = when {
                x.provenance.startsWith("explain/primary") -> "Explicado por Meta" to Tone.Brand
                x.provenance.startsWith("explain/fallback") -> "Explicado por Baseten" to Tone.Brand
                x.provenance.startsWith("explain/") -> "Explicado por IA remota" to Tone.Brand
                else -> "Explicado por reglas locales" to Tone.Muted
            }
            Chip(who, tone)
            Gap(10.dp)
        }
        PrimaryButton(if (busy) "Explicando…" else if (exp == null) "Explicar" else "Explicar de nuevo", {
            busy = true
            error = null
            scope.launch {
                runCatching { withContext(Dispatchers.IO) { Api.explanation(eventId) } }
                    .onSuccess { exp = it }
                    .onFailure { error = describeError(it) }
                busy = false
            }
        }, loading = busy)
        Notice(error)
        Gap(4.dp)
    }
}

@Composable
private fun ActionPanel(i: Intervention) {
    Panel {
        PanelHead("Qué hizo SOVIR")
        Fact("Acción", if (i.kind == "warn_banner") "Te mostró un aviso" else i.kind)
        Fact("Estado", Humanize.interventionState(i.state).label, Humanize.interventionState(i.state).tone, divider = i.lastError != null)
        i.lastError?.let { Fact("Último error", it, Tone.Danger, divider = false) }
        Gap(4.dp)
    }
}

/**
 * On-demand council run over the event's typed signals. The server never
 * stored the observed text, so text voters abstain here. Remote is OFF by
 * default — it spends budget — and only ever sees typed signals.
 */
@Composable
fun CouncilPanel(model: AppModel, signals: List<String>, eventId: String? = null) {
    val p = LocalPalette.current
    val scope = rememberCoroutineScope()
    var remote by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var verdict by remember { mutableStateOf<Verdict?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    Panel {
        PanelHead("Análisis detallado", trailing = { EvidenceTag("Inferido") })
        Text(
            "Varios análisis votan sobre las señales de esta observación y un árbitro combina los votos. " +
                "Ninguno ve el texto original: SOVIR no lo guarda.",
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
                Text("Usar análisis remoto", style = MaterialTheme.typography.bodyLarge, color = p.ink)
                Text(
                    model.budget?.let { "Gasta saldo · disponible ${fmtUsd(it.remainingUsd)}" } ?: "Gasta saldo de análisis",
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
                runCatching { withContext(Dispatchers.IO) { Api.assess(signals, remote, eventId = eventId) } }
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
        "Nivel de evidencia ${fmtPct(v.confidenceBp)} — orientativo, no una probabilidad exacta",
        style = MaterialTheme.typography.bodySmall,
        color = p.muted,
    )
    if (v.votes.isNotEmpty()) {
        Gap(12.dp)
        Kicker("Votos del análisis")
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
        Fact("Costo de este análisis", fmtMicroUsd(it), divider = false)
    }
}
