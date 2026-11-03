// Local council verdict notifications (ADR-0025): the phone surfaces
// what the server council decided — hypotheses + confidence + provenance.
// No server data beyond the typed verdict is shown.
package app.sovir.android.observer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import org.json.JSONObject

object Notifier {
    private const val CHANNEL = "sovir_council"

    fun notifyVerdict(context: Context, verdict: JSONObject) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "SOVIR concilio", NotificationManager.IMPORTANCE_HIGH),
        )
        val hyps = verdict.optJSONArray("hypotheses")?.let { arr ->
            (0 until arr.length()).joinToString(", ") { arr.getString(it) }
        } ?: "?"
        // Benign verdicts do not interrupt — only risk hypotheses notify.
        if (hyps == "no_pattern_detected") return
        val bp = verdict.optInt("confidence_bp", 0)
        val n = android.app.Notification.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("SOVIR: ${hyps.take(40)}")
            .setContentText("confianza ${bp / 100}% — ${verdict.optString("provenance").take(60)}")
            .setAutoCancel(true)
            .build()
        nm.notify((System.currentTimeMillis() % 100_000).toInt(), n)
    }
}
