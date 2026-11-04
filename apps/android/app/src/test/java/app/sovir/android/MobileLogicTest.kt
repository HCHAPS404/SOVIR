package app.sovir.android

import app.sovir.android.model.ConsentGrant
import app.sovir.android.model.DAY_MS
import app.sovir.android.model.DataExport
import app.sovir.android.model.Humanize
import app.sovir.android.model.Intervention
import app.sovir.android.model.ObservedEvent
import app.sovir.android.model.Tone
import app.sovir.android.model.WeekStatus
import app.sovir.android.model.dayBuckets
import app.sovir.android.model.dayHeading
import app.sovir.android.model.secretProblem
import app.sovir.android.model.timeAgo
import app.sovir.android.model.trendDelta
import app.sovir.android.model.userProblem
import app.sovir.android.model.weeklyDigest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.TimeZone

class MobileLogicTest {
    private val now = 1_800_000_000_000L
    private val utc = TimeZone.getTimeZone("UTC")

    private fun event(id: String, at: Long, vararg signals: String, source: String = "screen-observer:android") =
        ObservedEvent(id, source, at, "UI_TREE", "sha256:abc", "g", "PUBLIC", signals.toList())

    private fun alert(eventId: String, at: Long, state: String = "pending") =
        Intervention("i-$eventId", eventId, "warn_banner", state, 0, at, null, emptyList())

    private fun export(events: List<ObservedEvent> = emptyList(), alerts: List<Intervention> = emptyList()) =
        DataExport("p", emptyList(), events, emptyList(), alerts, emptyList())

    @Test
    fun emptyAccountIsNeverReportedAsProtected() {
        val d = weeklyDigest(export(), now)
        assertEquals(WeekStatus.Empty, d.status)
        assertEquals(0, d.signals)
        assertNull(d.lastActivityAt)
    }

    @Test
    fun signalsWithoutAlertsAreQuietNotAlerts() {
        val d = weeklyDigest(export(listOf(event("e1", now - 1000, "URGENT_ACTION"))), now)
        assertEquals(WeekStatus.Quiet, d.status)
        assertEquals(listOf("Presión de urgencia" to 1), d.categories)
    }

    @Test
    fun alertsOnlyCountInsideTheWeekWindow() {
        val d = weeklyDigest(
            export(
                events = listOf(event("e1", now - 1000, "PAYMENT_REQUEST"), event("old", now - 9 * DAY_MS, "PAYMENT_REQUEST")),
                alerts = listOf(alert("e1", now - 500), alert("old", now - 9 * DAY_MS)),
            ),
            now,
        )
        assertEquals(WeekStatus.Alerts, d.status)
        assertEquals(1, d.alerts)
        assertEquals(1, d.prevAlerts)
        assertEquals(now - 500, d.lastAlertAt)
    }

    @Test
    fun trendLabelsAreCountsNotPercentages() {
        assertNull(trendDelta(0, 0))
        assertEquals("nueva actividad" to Tone.Brand, trendDelta(3, 0))
        assertEquals("+2 vs semana pasada" to Tone.Warning, trendDelta(5, 3))
        assertEquals("−2 vs semana pasada" to Tone.Success, trendDelta(1, 3))
        assertFalse(trendDelta(5, 3)!!.first.contains("%"))
    }

    @Test
    fun dayBucketsUseCalendarDaysAndEndToday() {
        val b = dayBuckets(listOf(now, now - DAY_MS, now - DAY_MS, now - 20 * DAY_MS), now, tz = utc)
        assertEquals(7, b.size)
        assertTrue(b.last().isToday)
        assertEquals(1, b.last().count)
        assertEquals(2, b[5].count)
        assertEquals(3, b.sumOf { it.count })
    }

    @Test
    fun headingsAndAgesReadNaturally() {
        assertEquals("Hoy", dayHeading(now - 60_000, now, utc))
        assertEquals("Ayer", dayHeading(now - DAY_MS, now, utc))
        assertEquals("ahora mismo", timeAgo(now, now))
        assertEquals("hace 5 min", timeAgo(now - 5 * 60_000, now))
        assertEquals("hace 1 día", timeAgo(now - DAY_MS, now))
    }

    @Test
    fun humanizeFallsBackWithoutInventing() {
        assertEquals("Petición de frase de recuperación", Humanize.signal("SEED_PHRASE_REQUEST"))
        assertEquals("Brand new signal", Humanize.signal("BRAND_NEW_SIGNAL"))
        assertTrue(Humanize.isBenign(listOf("no_pattern_detected")))
        assertFalse(Humanize.isBenign(listOf("no_pattern_detected", "credential_phishing")))
        assertEquals(Tone.Warning, Humanize.councilOutcome("council:disputed; voters:2").second)
    }

    @Test
    fun alertSummaryComesFromLinkedEvidence() {
        val e = event("e1", now, "GIFT_CARD_PAYMENT", source = "screen-observer:ext")
        assertEquals("Pago con tarjetas regalo · Extensión del navegador", Humanize.interventionSummary(alert("e1", now), e))
        assertEquals("Evidencia no disponible en este dispositivo", Humanize.interventionSummary(alert("x", now), null))
    }

    @Test
    fun grantActivityRespectsRevocationAndExpiry() {
        assertTrue(ConsentGrant("g", "s", 0, now + 1, revoked = false).activeAt(now))
        assertFalse(ConsentGrant("g", "s", 0, now + 1, revoked = true).activeAt(now))
        assertFalse(ConsentGrant("g", "s", 0, now, revoked = false).activeAt(now))
    }

    @Test
    fun signInChecksNeverEchoTheSecret() {
        assertEquals("Escribe tu usuario o correo.", userProblem("  "))
        assertNull(userProblem("ada"))
        assertEquals("Escribe tu contraseña.", secretProblem(""))
        assertNull(secretProblem("secreto-local"))
    }
}

class AppExclusionsTest {
    private val sensitive = app.sovir.android.data.AppExclusions.SENSITIVE_PACKAGES.values.flatten().toSet()

    @Test
    fun sensitivePackagesSkippedByDefault() {
        assertTrue(app.sovir.android.data.AppExclusions.skipsWith("com.whatsapp", emptySet(), sensitiveAllowed = false))
        assertTrue(app.sovir.android.data.AppExclusions.skipsWith("com.bbva.bbvacontigo", emptySet(), sensitiveAllowed = false))
        assertFalse(app.sovir.android.data.AppExclusions.skipsWith("com.chrome.dev", emptySet(), sensitiveAllowed = false))
    }

    @Test
    fun sensitiveOptInObservesThem() {
        assertFalse(app.sovir.android.data.AppExclusions.skipsWith("com.whatsapp", emptySet(), sensitiveAllowed = true))
        // User exemption always wins over the opt-in.
        assertTrue(app.sovir.android.data.AppExclusions.skipsWith("com.whatsapp", setOf("com.whatsapp"), sensitiveAllowed = true))
    }

    @Test
    fun userExemptionsSkipAnyPackage() {
        assertTrue(app.sovir.android.data.AppExclusions.skipsWith("com.mi.banco", setOf("com.mi.banco"), sensitiveAllowed = false))
    }

    @Test
    fun curatedListIsNonEmptyAndDistinct() {
        assertTrue(sensitive.size >= 20)
        assertEquals(sensitive.size, app.sovir.android.data.AppExclusions.SENSITIVE_PACKAGES.values.flatten().size)
    }
}
