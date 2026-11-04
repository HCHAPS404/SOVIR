package app.sovir.android.data

import app.sovir.android.model.AuditEvent
import app.sovir.android.model.AuditStep
import app.sovir.android.model.Budget
import app.sovir.android.model.ConsentGrant
import app.sovir.android.model.DataExport
import app.sovir.android.model.Device
import app.sovir.android.model.Intervention
import app.sovir.android.model.ObservedEvent
import app.sovir.android.model.Verdict
import app.sovir.android.model.Vote
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

sealed class ApiError : Exception() {
    /** Server unreachable: no network, tunnel down, API stopped. */
    class Offline : ApiError()
    /** No valid session — the user must sign in again. */
    class SignedOut : ApiError()
    class Http(val code: Int, val errorCode: String?) : ApiError()
}

/** Typed client for the SOVIR API — same endpoints the web console reads. */
object Api {
    val base: String get() = Auth.apiBase

    fun data(): DataExport = parseExport(JSONObject(call("GET", "/v1/me/data")))

    fun budget(): Budget = JSONObject(call("GET", "/v1/me/budget")).let {
        Budget(it.optDouble("cap_usd"), it.optDouble("spent_usd"), it.optDouble("remaining_usd"))
    }

    fun version(): String = JSONObject(call("GET", "/v1/version", auth = false)).optString("version")

    fun assess(
        signals: List<String>,
        remoteAllowed: Boolean,
        textHint: String? = null,
        eventId: String? = null,
    ): Verdict {
        val body = JSONObject()
            .put("request_id", "and-assess-${shortId()}")
            .put("signals", JSONArray(signals))
            // Wire values are snake_case (sovir-domain PrivacyMode).
            .put("privacy", if (remoteAllowed) "standard" else "private")
        if (!textHint.isNullOrBlank()) body.put("text_hint", textHint)
        // ADR-0028 writeback linkage — fused council verdicts can inject
        // VISUAL_BRAND_MATCH back into this stored event.
        if (!eventId.isNullOrBlank()) body.put("event_id", eventId)
        return parseVerdict(JSONObject(call("POST", "/v1/inference/assess", body)))
    }

    fun registerDevice(label: String, deviceId: String? = null): Device {
        val body = JSONObject().put("platform", "ANDROID").put("label", label)
        if (deviceId != null) body.put("device_id", deviceId)
        return parseDevice(JSONObject(call("POST", "/v1/devices", body)))
    }

    fun revokeDevice(id: String) { call("POST", "/v1/devices/${enc(id)}/revoke") }

    fun explanation(eventId: String): app.sovir.android.model.Explanation =
        JSONObject(call("GET", "/v1/events/${enc(eventId)}/explanation")).let {
            app.sovir.android.model.Explanation(
                it.optString("text"), it.optString("provenance"), it.optString("model_id"),
            )
        }

    fun grantConsent(grantId: String, sourceId: String, expiresAtMs: Long) {
        call(
            "POST", "/v1/consents",
            JSONObject().put("grant_id", grantId).put("source_id", sourceId).put("expires_at_ms", expiresAtMs),
        )
    }

    fun revokeConsent(id: String) { call("POST", "/v1/consents/${enc(id)}/revoke") }

    fun purgeData() { call("DELETE", "/v1/me/data") }

    fun emitEvent(event: JSONObject) { call("POST", "/v1/events", event) }

    private fun call(method: String, path: String, body: JSONObject? = null, auth: Boolean = true): String {
        repeat(2) { attempt ->
            val token = if (auth) Auth.accessToken() ?: throw ApiError.SignedOut() else null
            val conn = try {
                (URL("$base$path").openConnection() as HttpURLConnection).apply {
                    requestMethod = method
                    connectTimeout = 8_000
                    readTimeout = 15_000
                    setRequestProperty("content-type", "application/json")
                    if (method != "GET") setRequestProperty("idempotency-key", "and-${shortId()}")
                    token?.let { setRequestProperty("authorization", "Bearer $it") }
                    // Binds the OIDC session to this phone's registered device
                    // row: server uses it for last_seen/event bookkeeping only.
                    PhoneLink.deviceId?.let { setRequestProperty("x-sovir-device", it) }
                    if (body != null) {
                        doOutput = true
                        outputStream.use { it.write(body.toString().toByteArray()) }
                    }
                }
            } catch (e: IOException) {
                throw ApiError.Offline()
            }
            val code = try { conn.responseCode } catch (e: IOException) { throw ApiError.Offline() }
            if (code == 401 && auth && attempt == 0) {
                Auth.invalidateAccess()
                return@repeat
            }
            if (code == 401) throw ApiError.SignedOut()
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code !in 200..299) {
                val err = runCatching { JSONObject(text).getJSONObject("error").optString("code") }.getOrNull()
                throw ApiError.Http(code, err)
            }
            return text.ifEmpty { "{}" }
        }
        throw ApiError.SignedOut()
    }

    // --- parsing (contract: packages/contracts, apps/console/lib/api.ts) ---

    private fun parseExport(j: JSONObject) = DataExport(
        principalId = j.optString("principal_id"),
        grants = j.optJSONArray("grants").map {
            ConsentGrant(
                it.optString("grant_id"), it.optString("source_id"), it.optLong("issued_at_ms"),
                it.optLong("expires_at_ms"), it.optBoolean("revoked"),
            )
        },
        events = j.optJSONArray("events").map {
            ObservedEvent(
                eventId = it.optString("event_id"),
                sourceId = it.optString("source_id"),
                observedAtMs = it.optLong("observed_at_ms"),
                modality = it.optString("modality"),
                contentDigest = it.optString("content_digest"),
                consentGrantId = it.optString("consent_grant_id"),
                sensitiveDataClass = it.optString("sensitive_data_class"),
                signals = it.optJSONArray("signals").strings(),
            )
        }.sortedByDescending { it.observedAtMs },
        devices = j.optJSONArray("devices").map(::parseDevice),
        interventions = j.optJSONArray("interventions").map {
            Intervention(
                interventionId = it.optString("intervention_id"),
                eventId = it.optString("event_id"),
                kind = it.optString("kind"),
                state = it.optString("state"),
                attempts = it.optInt("attempts"),
                createdAtMs = it.optLong("created_at_ms"),
                lastError = it.optString("last_error").takeIf { s -> s.isNotEmpty() && s != "null" },
                audit = it.optJSONArray("audit").map { a ->
                    AuditStep(a.optString("from"), a.optString("to"), a.optString("detail"))
                },
            )
        }.sortedByDescending { it.createdAtMs },
        audit = j.optJSONArray("audit_events").map {
            AuditEvent(it.optString("audit_id"), it.optString("action"), it.optString("detail"), it.optLong("at_ms"))
        }.sortedByDescending { it.atMs },
    )

    private fun parseDevice(it: JSONObject) = Device(
        deviceId = it.optString("device_id"),
        platform = it.optString("platform"),
        label = it.optString("label"),
        registeredAtMs = it.optLong("registered_at_ms"),
        lastSeenAtMs = it.optLongOrNull("last_seen_at_ms"),
        revokedAtMs = it.optLongOrNull("revoked_at_ms"),
    )

    private fun parseVerdict(j: JSONObject) = Verdict(
        modelId = j.optString("model_id"),
        hypotheses = j.optJSONArray("hypotheses").strings(),
        confidenceBp = j.optInt("confidence_bp"),
        provenance = j.optString("provenance"),
        costMicroUsd = j.optJSONObject("usage")?.optLongOrNull("cost_micro_usd"),
        votes = j.optJSONArray("votes").map {
            Vote(
                it.optString("voter"), it.optString("model_id"), it.optJSONArray("hypotheses").strings(),
                it.optInt("confidence_bp"), it.optString("provenance"),
                it.optJSONObject("usage")?.optLongOrNull("cost_micro_usd"),
            )
        },
    )

    private inline fun <T> JSONArray?.map(f: (JSONObject) -> T): List<T> =
        if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it)?.let(f) }

    private fun JSONArray?.strings(): List<String> =
        if (this == null) emptyList() else (0 until length()).map { getString(it) }

    private fun JSONObject.optLongOrNull(key: String): Long? = if (isNull(key) || !has(key)) null else optLong(key)

    private fun enc(s: String) = java.net.URLEncoder.encode(s, "UTF-8")
    fun shortId() = UUID.randomUUID().toString().replace("-", "").take(12)
}
