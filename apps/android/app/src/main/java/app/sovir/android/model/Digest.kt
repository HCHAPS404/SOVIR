package app.sovir.android.model

import java.util.Calendar
import java.util.TimeZone

// Port of apps/console/lib/digest.ts — computed from real exported data,
// never synthetic. Window = last 7 days.

const val DAY_MS = 24L * 60 * 60 * 1000
const val WEEK_MS = 7 * DAY_MS

enum class WeekStatus { Alerts, Quiet, Empty }

data class WeeklyDigest(
    val alerts: Int,
    val signals: Int,
    val prevAlerts: Int,
    val prevSignals: Int,
    val categories: List<Pair<String, Int>>,
    val lastAlertAt: Long?,
    val lastActivityAt: Long?,
    val status: WeekStatus,
)

fun weeklyDigest(data: DataExport, now: Long): WeeklyDigest {
    val since = now - WEEK_MS
    val prevSince = since - WEEK_MS
    val weekEvents = data.events.filter { it.observedAtMs >= since }
    val weekAlerts = data.interventions.filter { it.createdAtMs >= since }
    val prevEvents = data.events.count { it.observedAtMs in prevSince until since }
    val prevAlerts = data.interventions.count { it.createdAtMs in prevSince until since }
    val counts = linkedMapOf<String, Int>()
    for (e in weekEvents) {
        if (e.signals.isEmpty()) counts.merge("Otras señales", 1, Int::plus)
        for (s in e.signals) counts.merge(Humanize.signal(s), 1, Int::plus)
    }
    val times = data.events.map { it.observedAtMs } + data.interventions.map { it.createdAtMs }
    return WeeklyDigest(
        alerts = weekAlerts.size,
        signals = weekEvents.size,
        prevAlerts = prevAlerts,
        prevSignals = prevEvents,
        categories = counts.entries.map { it.key to it.value }.sortedByDescending { it.second },
        lastAlertAt = weekAlerts.maxOfOrNull { it.createdAtMs },
        lastActivityAt = times.maxOrNull(),
        status = when {
            weekAlerts.isNotEmpty() -> WeekStatus.Alerts
            weekEvents.isNotEmpty() -> WeekStatus.Quiet
            else -> WeekStatus.Empty
        },
    )
}

/** Week-over-week delta — honest labels, no percentages. Null = nothing to say. */
fun trendDelta(cur: Int, prev: Int): Pair<String, Tone>? = when {
    cur == prev -> if (cur == 0) null else "igual que la semana pasada" to Tone.Muted
    prev == 0 -> "nueva actividad" to Tone.Brand
    cur > prev -> "+${cur - prev} vs semana pasada" to Tone.Warning
    else -> "−${prev - cur} vs semana pasada" to Tone.Success
}

data class DayBucket(val label: String, val count: Int, val isToday: Boolean)

private val SHORT_DAYS = listOf("Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb")

/** Calendar days in the device time zone, oldest first; empty days are zero. */
fun dayBuckets(timestamps: List<Long>, now: Long, days: Int = 7, tz: TimeZone = TimeZone.getDefault()): List<DayBucket> {
    fun dayIndex(ms: Long) = Math.floorDiv(ms + tz.getOffset(ms), DAY_MS)
    val today = dayIndex(now)
    val counts = IntArray(days)
    for (ts in timestamps) {
        val idx = (dayIndex(ts) - (today - (days - 1))).toInt()
        if (idx in 0 until days) counts[idx]++
    }
    val cal = Calendar.getInstance(tz)
    return (0 until days).map { i ->
        cal.timeInMillis = now - (days - 1 - i) * DAY_MS
        DayBucket(SHORT_DAYS[cal.get(Calendar.DAY_OF_WEEK) - 1], counts[i], i == days - 1)
    }
}

fun timeAgo(ms: Long, now: Long): String {
    val mins = Math.round((now - ms) / 60_000.0)
    if (mins < 1) return "ahora mismo"
    if (mins < 60) return "hace $mins min"
    val hours = Math.round(mins / 60.0)
    if (hours < 24) return "hace $hours h"
    val d = Math.round(hours / 24.0)
    return if (d == 1L) "hace 1 día" else "hace $d días"
}

/** "Hoy" / "Ayer" / weekday + date, for grouping lists by calendar day. */
fun dayHeading(ms: Long, now: Long, tz: TimeZone = TimeZone.getDefault()): String {
    fun dayIndex(t: Long) = Math.floorDiv(t + tz.getOffset(t), DAY_MS)
    return when (dayIndex(now) - dayIndex(ms)) {
        0L -> "Hoy"
        1L -> "Ayer"
        else -> {
            val c = Calendar.getInstance(tz).apply { timeInMillis = ms }
            "${SHORT_DAYS[c.get(Calendar.DAY_OF_WEEK) - 1]} ${c.get(Calendar.DAY_OF_MONTH)}/${c.get(Calendar.MONTH) + 1}"
        }
    }
}
