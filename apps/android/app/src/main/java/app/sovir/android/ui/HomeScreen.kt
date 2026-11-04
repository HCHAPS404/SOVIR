package app.sovir.android.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.sovir.android.data.Auth
import app.sovir.android.model.DataExport
import app.sovir.android.model.Humanize
import app.sovir.android.model.Tone
import app.sovir.android.model.WeekStatus
import app.sovir.android.model.dayBuckets
import app.sovir.android.model.timeAgo
import app.sovir.android.model.trendDelta
import app.sovir.android.model.weeklyDigest

/**
 * Renders the right state when there is no snapshot yet; once a snapshot
 * exists it is shown even when stale (the top bar says so).
 */
@Composable
fun DataGate(model: AppModel, content: @Composable (DataExport) -> Unit) {
    val d = model.data
    if (d != null) {
        content(d)
        return
    }
    ScreenScroll {
        when (model.sync) {
            Sync.Loading, Sync.Ready -> StateBlock(StateKind.Loading, "Cargando", "Pidiendo tus datos al servidor SOVIR.")
            Sync.Offline -> StateBlock(
                StateKind.Offline, "Sin conexión con tu servidor",
                "No hay datos guardados en el teléfono para mostrar. Comprueba que el servidor esté encendido.",
                "Reintentar", model::refresh,
            )
            Sync.SignedOut -> StateBlock(StateKind.SignedOut, "Tu sesión terminó", "Inicia sesión otra vez para ver tus datos.")
            Sync.Error -> StateBlock(
                StateKind.Error, "El servidor respondió con un error",
                "No se pudo leer tu información. Reintenta en un momento.", "Reintentar", model::refresh,
            )
        }
    }
}

private sealed interface FeedItem {
    val at: Long
    data class Alert(val id: String, override val at: Long, val title: String, val sub: String) : FeedItem
    data class Signal(val id: String, override val at: Long, val title: String, val sub: String) : FeedItem
}

/** The one number a client reads first. */
@Composable
private fun StatTile(count: Int, label: String, modifier: Modifier = Modifier, tone: Tone? = null) {
    val p = LocalPalette.current
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            count.toString(),
            style = MaterialTheme.typography.headlineMedium,
            color = tone?.let(p::tone) ?: p.ink,
        )
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = p.muted,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
fun HomeScreen(
    model: AppModel,
    coverage: Coverage,
    onTab: (Tab) -> Unit,
    onOpenAlert: (String) -> Unit,
    onOpenEvent: (String) -> Unit,
) = DataGate(model) { data ->
    val p = LocalPalette.current
    val now = System.currentTimeMillis()
    val digest = weeklyDigest(data, now)
    val name = Auth.displayName() ?: "de nuevo"
    val trend = trendDelta(digest.alerts + digest.signals, digest.prevAlerts + digest.prevSignals)
    val buckets = dayBuckets(data.events.map { it.observedAtMs } + data.interventions.map { it.createdAtMs }, now)
    val otherDevices = data.devices.count { it.active && it.platform != "ANDROID" }

    // What the client answers at a glance: "¿me están protegiendo ahora?"
    val (heroChip, heroTone, heroLine) = when {
        model.sync == Sync.Offline -> Triple("Sin conexión", Tone.Warning, "No podemos hablar con tu servidor ahora mismo.")
        !coverage.observing && otherDevices > 0 -> Triple(
            "Protegido desde otros dispositivos", Tone.Brand,
            "Este teléfono está en pausa; tu extensión y demás dispositivos siguen observando.",
        )
        !coverage.observing -> Triple(
            "Este teléfono está en pausa", Tone.Warning,
            "Activa su protección en la pestaña Protección — son tres pasos.",
        )
        else -> Triple("Te estamos protegiendo", Tone.Success, "Este teléfono observa lo que miras y avisa si algo parece un engaño.")
    }

    ScreenScroll {
        PageHeader(
            title = "Hola, $name",
            sub = "Así va tu protección.",
        )

        // --- hero: protection state + real counters ----------------------
        Panel {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Chip(heroChip, heroTone)
                Spacer(Modifier.weight(1f))
                trend?.let { Text(it.first, style = MaterialTheme.typography.labelMedium, color = p.tone(it.second)) }
            }
            Gap(8.dp)
            Text(heroLine, style = MaterialTheme.typography.bodyMedium, color = p.muted)
            Gap(18.dp)
            Row(Modifier.fillMaxWidth()) {
                StatTile(digest.signals, "pantallas\nrevisadas", Modifier.weight(1f))
                StatTile(digest.categories.sumOf { it.second }, "señales\nvistas", Modifier.weight(1f))
                StatTile(digest.alerts, "avisos\nemitidos", Modifier.weight(1f), if (digest.alerts > 0) Tone.Warning else null)
            }
            Gap(18.dp)
            when (digest.status) {
                WeekStatus.Alerts -> Text(
                    "La última fue ${digest.lastAlertAt?.let { timeAgo(it, now) }}. Tócala para ver qué la causó.",
                    style = MaterialTheme.typography.bodyMedium, color = p.muted,
                )
                WeekStatus.Quiet -> Text(
                    "Nada cruzó el nivel de aviso esta semana — las señales quedaron registradas.",
                    style = MaterialTheme.typography.bodyMedium, color = p.muted,
                )
                WeekStatus.Empty -> Text(
                    "Cuando observes pantallas con riesgo aparecerán aquí.",
                    style = MaterialTheme.typography.bodyMedium, color = p.muted,
                )
            }
            Gap(16.dp)
            WeekChart(buckets, "Actividad por día en los últimos 7 días: " + buckets.joinToString { "${it.label} ${it.count}" })
            if (digest.status == WeekStatus.Alerts) {
                Gap(14.dp)
                PrimaryButton("Ver avisos", { onTab(Tab.Alerts) })
            }
            Gap(4.dp)
        }

        Gap(14.dp)
        Panel {
            PanelHead("Este teléfono") {
                Chip(if (coverage.observing) "Observando" else "En pausa", if (coverage.observing) Tone.Success else Tone.Unknown)
            }
            Fact("Observador de pantalla", if (coverage.observerOs) "Activado" else "Desactivado", if (coverage.observerOs) Tone.Success else Tone.Unknown)
            Fact(
                "Permiso para enviar señales",
                if (coverage.uploadAllowed) "Vigente hasta ${fmtDate(coverage.grantExpiresAt)}" else "Sin conceder",
                if (coverage.uploadAllowed) Tone.Success else Tone.Unknown,
            )
            Fact("Avisos en pantalla", if (coverage.notifications) "Permitidos" else "Bloqueados", if (coverage.notifications) Tone.Success else Tone.Warning)
            Fact(
                "Otros dispositivos tuyos",
                if (otherDevices == 0) "Ninguno vinculado" else plural(otherDevices, "vinculado", "vinculados"),
                divider = false,
            )
            if (!coverage.observing) {
                Gap(6.dp)
                Text(
                    "Mientras el observador no esté activo y autorizado, SOVIR no ve nada en este teléfono.",
                    style = MaterialTheme.typography.bodySmall,
                    color = p.muted,
                )
            }
            QuietAction("Gestionar protección", { onTab(Tab.Protection) })
        }

        Gap(14.dp)
        Panel {
            PanelHead("Qué hemos detectado", kicker = "Últimos 7 días")
            if (digest.categories.isEmpty()) {
                Text("No aparecieron señales de riesgo en este periodo.", style = MaterialTheme.typography.bodyMedium, color = p.muted)
            } else {
                CategoryBars(digest.categories.take(5))
            }
            Gap(10.dp)
        }

        Gap(14.dp)
        Panel {
            PanelHead("Últimas observaciones")
            // One row per observation; an alert rides on its event instead of
            // repeating it. Alerts whose event is gone still get their own row.
            val alerted = data.interventions.map { it.eventId }.toSet()
            val eventIds = data.events.map { it.eventId }.toSet()
            val feed = (
                data.events.map { e ->
                    FeedItem.Signal(
                        e.eventId, e.observedAtMs,
                        e.signals.take(2).joinToString(" · ") { Humanize.signal(it) }.ifEmpty { "Actividad sin señales de riesgo" },
                        Humanize.source(e.sourceId),
                    )
                } + data.interventions.filter { it.eventId !in eventIds }.map {
                    FeedItem.Alert(it.interventionId, it.createdAtMs, "Aviso de SOVIR", Humanize.interventionSummary(it, null))
                }
                ).sortedByDescending { it.at }.take(5)
            if (feed.isEmpty()) {
                Text("Todavía no hay nada registrado.", style = MaterialTheme.typography.bodyMedium, color = p.muted)
            }
            val alertChip: @Composable RowScope.() -> Unit = { Chip("Aviso", Tone.Warning, dot = false) }
            feed.forEachIndexed { i, f ->
                when (f) {
                    is FeedItem.Alert -> Line(
                        f.title, f.sub, timeAgo(f.at, now), Tone.Warning,
                        divider = i < feed.lastIndex, onClick = { onOpenAlert(f.id) },
                    )
                    is FeedItem.Signal -> {
                        val hit = f.id in alerted
                        Line(
                            f.title, "${f.sub} · ${timeAgo(f.at, now)}", null, if (hit) Tone.Warning else Tone.Muted,
                            divider = i < feed.lastIndex, onClick = { onOpenEvent(f.id) },
                            trailing = if (hit) alertChip else null,
                        )
                    }
                }
            }
            QuietAction("Ver toda la actividad", { onTab(Tab.Activity) })
        }
    }
}
