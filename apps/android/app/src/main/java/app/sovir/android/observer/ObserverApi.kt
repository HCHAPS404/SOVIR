// NOT_VERIFIED: Android SDK is a deferred toolchain — this file has not
// been compiled. Plain HttpURLConnection only: no new dependency.
package app.sovir.android.observer

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.UUID

/**
 * Minimal loopback-API client for the observer path (ADR-0014):
 * dev-session -> device register -> consent grant -> POST /v1/events.
 * Dev-only: talks cleartext to SOVIR_API_BASE on the local network.
 */
class ObserverApi(
    // Build-time reachable base (ADR-0023): defaults to adb-reverse
    // loopback; a WiFi/overlay build passes -PSOVIR_API_BASE/-PSOVIR_OIDC_TOKEN_URL.
    private val base: String = app.sovir.android.BuildConfig.SOVIR_API_BASE,
    private val oidcTokenUrl: String = app.sovir.android.BuildConfig.SOVIR_OIDC_TOKEN_URL,
    private val oidcClientId: String = "sovir-extension",
    private val sourceId: String = "screen-observer:android",
    private val grantId: String = "android-observer-grant",
    private val deviceId: String = "android-device",
) {
    private var token: String? = null

    /** Real OIDC login (private-overlay deploy disables dev-session). */
    fun connectOidc() {
        val form = "grant_type=password&client_id=$oidcClientId" +
            "&username=${SessionStore.user()}&password=${SessionStore.pass()}"
        val conn = (URL(oidcTokenUrl).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("content-type", "application/x-www-form-urlencoded")
            doOutput = true
            connectTimeout = 5_000
            readTimeout = 5_000
        }
        conn.outputStream.use { it.write(form.toByteArray()) }
        if (conn.responseCode !in 200..299) throw java.io.IOException("oidc_http_${conn.responseCode}")
        token = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
            .getString("access_token")
        // 409s/duplicates mean "already exists" — idempotent by design.
        runCatching {
            post("/v1/devices", JSONObject().put("platform", "ANDROID").put("label", "Observador Android"))
        }
        runCatching {
            post(
                "/v1/consents",
                JSONObject()
                    .put("grant_id", grantId)
                    .put("source_id", sourceId)
                    .put("expires_at_ms", System.currentTimeMillis() + 86_400_000L),
            )
        }
    }

    fun connect() {
        runCatching { connectOidc() }.onSuccess { return }
        // Local dev-session path — only when the API runs in local/test mode.
        val session = JSONObject(
            post(
                "/v1/auth/dev-session",
                JSONObject()
                    .put("principal_id", "android-observer")
                    .put("device_id", deviceId)
                    .put("tenant_id", "dev"),
                token = null,
            ),
        )
        token = session.getString("token")
        // 409s/duplicates mean "already exists" — idempotent by design.
        runCatching {
            post(
                "/v1/devices",
                JSONObject().put("platform", "ANDROID").put("label", "Observador Android"),
            )
        }
        runCatching {
            post(
                "/v1/consents",
                JSONObject()
                    .put("grant_id", grantId)
                    .put("source_id", sourceId)
                    .put("expires_at_ms", System.currentTimeMillis() + 86_400_000L),
            )
        }
    }

    fun emit(packageName: String, signals: Set<String>) {
        if (signals.isEmpty()) return
        if (token == null) connect()
        val digest = sha256("$packageName|${signals.sorted().joinToString(",")}")
        val event = JSONObject()
            .put("event_id", "and-${shortId()}")
            .put("source_id", sourceId)
            .put("observed_at_ms", System.currentTimeMillis())
            .put("modality", "UI_TREE")
            .put("content_digest", "sha256:$digest")
            .put("consent_grant_id", grantId)
            .put("sensitive_data_class", "PUBLIC")
            .put("signals", org.json.JSONArray(signals.toList()))
        post("/v1/events", event)
    }

    /**
     * Council assess with the ephemeral text_hint (ADR-0025): the onnx-text
     * voter scores the matched span on the LOCAL api. STANDARD privacy is
     * safe — the remote envelope never carries text_hint (adapter-tested).
     * Returns the raw verdict JSON, or null on any failure (assess is
     * best-effort; the event emit above is the durable record).
     */
    fun assess(signals: Set<String>, textHint: String): JSONObject? {
        if (signals.isEmpty() || textHint.isBlank()) return null
        if (token == null) connect()
        val body = JSONObject()
            .put("request_id", "and-assess-${shortId()}")
            .put("signals", org.json.JSONArray(signals.toList()))
            .put("privacy", "STANDARD")
            .put("text_hint", textHint)
        return runCatching { JSONObject(post("/v1/inference/assess", body)) }.getOrNull()
    }

    private fun post(path: String, body: JSONObject, token: String? = this.token): String {
        val conn = (URL("$base$path").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("content-type", "application/json")
            setRequestProperty("idempotency-key", "and-${shortId()}")
            token?.let { setRequestProperty("authorization", "Bearer $it") }
            doOutput = true
            connectTimeout = 5_000
            readTimeout = 5_000
        }
        conn.outputStream.use { it.write(body.toString().toByteArray()) }
        val code = conn.responseCode
        if (code !in 200..299) throw java.io.IOException("http_$code")
        return conn.inputStream.bufferedReader().use { it.readText() }
    }

    private fun sha256(s: String): String {
        val d = MessageDigest.getInstance("SHA-256").digest(s.toByteArray())
        return d.joinToString("") { "%02x".format(it) }
    }

    private fun shortId() = UUID.randomUUID().toString().replace("-", "").take(12)
}
