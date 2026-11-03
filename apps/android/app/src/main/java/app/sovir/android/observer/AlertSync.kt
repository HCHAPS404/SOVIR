package app.sovir.android.observer

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import app.sovir.android.data.Api
import app.sovir.android.data.Auth
import app.sovir.android.data.PhoneLink
import app.sovir.android.model.Humanize

/**
 * Background alert delivery by periodic poll (decided over FCM: no new SDK,
 * no third-party provider). The OS runs it roughly every 15 minutes when a
 * network is available; alerts already surfaced live by this phone's own
 * observer are skipped so one detection never notifies twice.
 */
class AlertSync : JobService() {
    @Volatile private var worker: Thread? = null

    override fun onStartJob(params: JobParameters): Boolean {
        worker = Thread {
            runCatching { sync(applicationContext) }
            jobFinished(params, false)
        }.also { it.start() }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean {
        worker?.interrupt()
        return true
    }

    companion object {
        private const val JOB_ID = 4201
        private const val PERIOD_MS = 15L * 60 * 1000

        fun schedule(ctx: Context) {
            val js = ctx.getSystemService(JobScheduler::class.java) ?: return
            if (js.getPendingJob(JOB_ID) != null) return
            js.schedule(
                JobInfo.Builder(JOB_ID, ComponentName(ctx, AlertSync::class.java))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPeriodic(PERIOD_MS)
                    .setPersisted(true)
                    .build(),
            )
        }

        fun cancel(ctx: Context) {
            ctx.getSystemService(JobScheduler::class.java)?.cancel(JOB_ID)
        }

        fun sync(ctx: Context) {
            Auth.init(ctx)
            PhoneLink.init(ctx)
            if (!Auth.signedIn.value) return
            val data = Api.data()
            val since = PhoneLink.lastSyncedAlertAt
            val newest = data.interventions.maxOfOrNull { it.createdAtMs } ?: since
            // First run only sets the watermark: no flood of historical alerts.
            if (since < 0) {
                PhoneLink.lastSyncedAlertAt = newest.coerceAtLeast(0)
                return
            }
            val fresh = data.interventions.filter { it.createdAtMs > since && !PhoneLink.wasNotified(it.eventId) }
            Notifier.alerts(
                ctx,
                fresh.map { i ->
                    val e = data.eventFor(i)
                    (e?.signals?.firstOrNull()?.let(Humanize::signal) ?: "Señal de riesgo") +
                        " · " + (e?.let { Humanize.source(it.sourceId) } ?: "origen no disponible")
                },
            )
            if (newest > since) PhoneLink.lastSyncedAlertAt = newest
        }
    }
}
