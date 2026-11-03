package app.sovir.android.observer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.sovir.android.MainActivity
import app.sovir.android.R
import app.sovir.android.model.Humanize
import app.sovir.android.model.Verdict

/**
 * Two channels, so the person can silence one without the other:
 *  - alerts: policy decisions (interventions) from any device;
 *  - council: live inferences about what THIS phone just observed.
 * Notifications carry typed labels only — never observed text.
 */
object Notifier {
    private const val ALERTS = "sovir_alerts"
    private const val COUNCIL = "sovir_council"
    const val EXTRA_OPEN = "sovir.open"

    fun ensureChannels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(ALERTS, "Alertas de SOVIR", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Alertas que la política de SOVIR emitió en cualquiera de tus dispositivos."
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(COUNCIL, "Análisis de este teléfono", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Hipótesis del concilio sobre lo que este teléfono acaba de observar."
            },
        )
    }

    private fun open(ctx: Context, target: String, req: Int) = PendingIntent.getActivity(
        ctx, req,
        Intent(ctx, MainActivity::class.java).putExtra(EXTRA_OPEN, target)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun post(ctx: Context, id: Int, b: NotificationCompat.Builder) {
        val nm = NotificationManagerCompat.from(ctx)
        if (!nm.areNotificationsEnabled()) return
        try {
            nm.notify(id, b.build())
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS revoked between the check and the post — stay silent.
        }
    }

    fun alerts(ctx: Context, titles: List<String>) {
        if (titles.isEmpty()) return
        ensureChannels(ctx)
        val title = if (titles.size == 1) "Nueva alerta de SOVIR" else "${titles.size} alertas nuevas de SOVIR"
        val b = NotificationCompat.Builder(ctx, ALERTS)
            .setSmallIcon(R.drawable.ic_stat_sovir)
            .setContentTitle(title)
            .setContentText(titles.first())
            .setStyle(NotificationCompat.InboxStyle().also { s -> titles.take(5).forEach(s::addLine) })
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(open(ctx, "alerts", 1))
            .setAutoCancel(true)
        post(ctx, 1001, b)
    }

    /** Council verdict on this phone's own observation. Benign = silent. */
    fun verdict(ctx: Context, v: Verdict, eventId: String) {
        if (Humanize.isBenign(v.hypotheses)) return
        ensureChannels(ctx)
        val what = v.hypotheses.filter { it != "no_pattern_detected" }
            .joinToString(", ") { Humanize.hypothesis(it) }
            .replaceFirstChar { it.uppercase() }
        val b = NotificationCompat.Builder(ctx, COUNCIL)
            .setSmallIcon(R.drawable.ic_stat_sovir)
            .setContentTitle("Posible riesgo en pantalla")
            .setContentText("$what · inferido, revisa la evidencia")
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .setContentIntent(open(ctx, "event:$eventId", eventId.hashCode()))
            .setAutoCancel(true)
        post(ctx, 2000 + (eventId.hashCode() and 0xfff), b)
    }
}
