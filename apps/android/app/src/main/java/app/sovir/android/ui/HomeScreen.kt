package app.sovir.android.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
                "No hay datos guardados en el teléfono para mostrar. Comprueba que el servidor y el túnel estén encendidos.",
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

    ScreenScroll {
        PageHeader(
            title = "Hola, $name",
            kicker = digest.lastActivityAt?.let { "Última actividad ${timeAgo(it, now)}" } ?: "Sin actividad registrada",
            kickerTone = if (digest.lastActivityAt != null) Tone.Success else Tone.Unknown,
            sub = "Lo que tus dispositivos observaron en los últimos 7 días.",
        )

        Panel {
            Row(verticalAlignment = Alignment.CenterVertically) {
                when (digest.status) {
                    WeekStatus.Alerts -> Chip("Hubo alertas", Tone.Warning)
                    WeekStatus.Quiet -> Chip("Semana sin alertas", Tone.Success)
                    WeekStatus.Empty -> Chip("Sin observaciones", Tone.Unknown)
                }
                Spacer(Modifier.weight(1f))
                if (trend != null) Text(trend.first, style = MaterialTheme.typography.labelMedium, color = p.tone(trend.second))
            }
            Gap(14.dp)
            Text(
                when (digest.status) {
                    WeekStatus.Alerts -> plural(digest.alerts, "alerta esta semana", "alertas esta semana")
                    WeekStatus.Quiet -> "Ninguna alerta esta semana"
                    WeekStatus.Empty -> "Aún no hay observaciones"
                },
                style = MaterialTheme.typography.headlineSmall,
                color = p.ink,
            )
            Gap(6.dp)
            Text(
                when (digest.status) {
                    WeekStatus.Alerts -> plural(digest.signals, "señal observada", "señales observadas") +
                        (digest.lastAlertAt?.let { "; la última alerta fue ${timeAgo(it, now)}." } ?: ".")
                    WeekStatus.Quiet -> "${plural(digest.signals, "señal observada", "señales observadas")}, ninguna cruzó las reglas de alerta."
                    WeekStatus.Empty -> "Sin observaciones no hay nada que evaluar. Activa el observador o la extensión."
                },
                style = MaterialTheme.typography.bodyMedium,
                color = p.muted,
            )
            Gap(18.dp)
            WeekChart(buckets, "Actividad por día en los últimos 7 días: " + buckets.joinToString { "${it.label} ${it.count}" })
            if (digest.status == WeekStatus.Alerts) {
                Gap(14.dp)
                SecondaryButton("Ver alertas", { onTab(Tab.Alerts) })
            }
            Gap(4.dp)
        }

        Gap(14.dp)
        Panel {
            PanelHead("Cobertura de este teléfono", kicker = "Estado leído del sistema") {
                Chip(if (coverage.observing) "Observando" else "No observa", if (coverage.observing) Tone.Success else Tone.Unknown)
            }
            Fact("Observador (Android)", if (coverage.observerOs) "Activado" else "Desactivado", if (coverage.observerOs) Tone.Success else Tone.Unknown)
            Fact(
                "Permiso de envío",
                if (coverage.uploadAllowed) "Vigente hasta ${fmtDate(coverage.grantExpiresAt)}" else "Sin conceder",
                if (coverage.uploadAllowed) Tone.Success else Tone.Unknown,
            )
            Fact("Notificaciones", if (coverage.notifications) "Permitidas" else "Bloqueadas", if (coverage.notifications) Tone.Success else Tone.Warning)
            Fact("Otros dispositivos", if (otherDevices == 0) "Ninguno vinculado" else plural(otherDevices, "vinculado", "vinculados"), divider = false)
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
            PanelHead("Qué detectamos", kicker = "Últimos 7 días")
            if (digest.categories.isEmpty()) {
                Text("No hubo señales de riesgo en este periodo.", style = MaterialTheme.typography.bodyMedium, color = p.muted)
            } else {
                CategoryBars(digest.categories.take(5))
            }
            Gap(10.dp)
        }

        Gap(14.dp)
        Panel {
            PanelHead("Actividad reciente")
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
                    FeedItem.Alert(it.interventionId, it.createdAtMs, "Alerta", Humanize.interventionSummary(it, null))
                }
                ).sortedByDescending { it.at }.take(5)
            if (feed.isEmpty()) {
                Text("Todavía no hay nada registrado.", style = MaterialTheme.typography.bodyMedium, color = p.muted)
            }
            val alertChip: @Composable RowScope.() -> Unit = { Chip("Alerta", Tone.Warning, dot = false) }
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

        model.budget?.let { b ->
            Gap(18.dp)
            Row(Modifier.fillMaxWidth().padding(horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Kicker("Análisis remoto")
                Spacer(Modifier.width(10.dp))
                Text("${fmtUsd(b.spentUsd)} de ${fmtUsd(b.capUsd)} usados", style = MaterialTheme.typography.bodySmall, color = p.muted)
            }
        }
    }
}
