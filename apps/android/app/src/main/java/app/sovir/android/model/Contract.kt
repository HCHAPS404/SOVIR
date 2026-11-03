package app.sovir.android.model

// Typed mirror of the API contract the console reads (apps/console/lib/api.ts,
// packages/contracts). Pure Kotlin: parsing lives in data/Api.kt so these
// stay unit-testable on the JVM.

data class Device(
    val deviceId: String,
    val platform: String,
    val label: String,
    val registeredAtMs: Long,
    val lastSeenAtMs: Long?,
    val revokedAtMs: Long?,
) {
    val active get() = revokedAtMs == null
}

data class AuditStep(val from: String, val to: String, val detail: String)

data class Intervention(
    val interventionId: String,
    val eventId: String,
    val kind: String,
    val state: String,
    val attempts: Int,
    val createdAtMs: Long,
    val lastError: String?,
    val audit: List<AuditStep>,
)

data class ConsentGrant(
    val grantId: String,
    val sourceId: String,
    val issuedAtMs: Long,
    val expiresAtMs: Long,
    val revoked: Boolean,
) {
    fun activeAt(now: Long) = !revoked && expiresAtMs > now
}

data class ObservedEvent(
    val eventId: String,
    val sourceId: String,
    val observedAtMs: Long,
    val modality: String,
    val contentDigest: String,
    val consentGrantId: String,
    val sensitiveDataClass: String,
    val signals: List<String>,
)

data class AuditEvent(val auditId: String, val action: String, val detail: String, val atMs: Long)

data class DataExport(
    val principalId: String,
    val grants: List<ConsentGrant>,
    val events: List<ObservedEvent>,
    val devices: List<Device>,
    val interventions: List<Intervention>,
    val audit: List<AuditEvent>,
) {
    fun eventFor(i: Intervention) = events.firstOrNull { it.eventId == i.eventId }
    fun interventionsFor(e: ObservedEvent) = interventions.filter { it.eventId == e.eventId }
}

data class Budget(val capUsd: Double, val spentUsd: Double, val remainingUsd: Double)

data class Vote(
    val voter: String,
    val modelId: String,
    val hypotheses: List<String>,
    val confidenceBp: Int,
    val provenance: String,
    val costMicroUsd: Long?,
)

data class Verdict(
    val modelId: String,
    val hypotheses: List<String>,
    val confidenceBp: Int,
    val provenance: String,
    val costMicroUsd: Long?,
    val votes: List<Vote>,
)
