package app.sovir.android.data

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.provider.Settings
import java.security.MessageDigest

/**
 * This phone's link to the account: its registered device id and the
 * SOVIR consent grant the person explicitly gave the observer.
 *
 * Nothing here is granted automatically. Without an active grant the
 * observer does not upload, even if Android's accessibility toggle is on —
 * the OS gates capture, this grant gates upload (ADR-0014).
 */
object PhoneLink {
    const val SOURCE_ID = "screen-observer:android"

    private lateinit var prefs: SharedPreferences
    private lateinit var appContext: Context

    fun init(context: Context) {
        appContext = context.applicationContext
        if (!::prefs.isInitialized) {
            prefs = appContext.getSharedPreferences("sovir_phone_link", Context.MODE_PRIVATE)
        }
    }

    val deviceId: String? get() = prefs.getString("device_id", null)
    val grantId: String? get() = prefs.getString("grant_id", null)
    val grantExpiresAt: Long get() = prefs.getLong("grant_expires_at", 0)

    // Observer liveness. `enabled_accessibility_services` only says the OS
    // toggle is on — it does NOT say the service is bound: when the system
    // (e.g. MIUI battery) kills our process, Android parks the service in
    // "crashed" and it never observes again until re-toggled. The service
    // stamps its own pid on bind; a flag written by a dead process cannot
    // equal this process's pid, so a stale flag can never fake aliveness.
    fun markObserverBound() {
        prefs.edit()
            .putBoolean("observer_bound", true)
            .putInt("observer_pid", android.os.Process.myPid())
            .apply()
    }

    fun markObserverUnbound() {
        prefs.edit().putBoolean("observer_bound", false).apply()
    }

    /** OS toggle on AND the service is actually bound in this live process. */
    fun observerAlive(): Boolean =
        ::prefs.isInitialized &&
            prefs.getBoolean("observer_bound", false) &&
            prefs.getInt("observer_pid", -1) == android.os.Process.myPid()

    fun uploadAllowed(now: Long = System.currentTimeMillis()) =
        ::prefs.isInitialized && grantId != null && grantExpiresAt > now && Auth.signedIn.value

    /** Registers the phone once, then issues a fresh, time-bound grant. */
    fun grant(spanMs: Long) {
        if (deviceId == null) {
            // Stable id: ANDROID_ID survives reinstalls (per device + signing
            // key), so a wiped app re-announces the SAME device row instead of
            // piling up stale registrations. Hashed before it leaves the phone.
            val device = Api.registerDevice("Android · ${Build.MODEL}", stableDeviceId())
            prefs.edit().putString("device_id", device.deviceId).apply()
        }
        val id = "and-grant-${Api.shortId()}"
        val expires = System.currentTimeMillis() + spanMs
        Api.grantConsent(id, SOURCE_ID, expires)
        prefs.edit().putString("grant_id", id).putLong("grant_expires_at", expires).apply()
    }

    fun revoke() {
        grantId?.let { runCatching { Api.revokeConsent(it) }.getOrThrow() }
        prefs.edit().remove("grant_id").remove("grant_expires_at").apply()
    }

    /** Server state wins: a grant revoked elsewhere (console) stops uploads here too. */
    fun reconcile(activeGrantIds: Set<String>) {
        val id = grantId ?: return
        if (id !in activeGrantIds) prefs.edit().remove("grant_id").remove("grant_expires_at").apply()
    }

    fun forgetDevice() {
        prefs.edit().clear().apply()
    }

    private fun stableDeviceId(): String {
        val androidId = Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ANDROID_ID)
        if (!androidId.isNullOrBlank()) return "and-" + sha256(androidId).take(24)
        // Rare fallback (emulators): a generated install id — stable until
        // app data is cleared.
        var id = prefs.getString("install_id", null)
        if (id == null) {
            id = "and-" + Api.shortId() + Api.shortId()
            prefs.edit().putString("install_id", id).apply()
        }
        return id
    }

    private fun sha256(s: String) =
        MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }

    // Events already surfaced by a live council notification — background
    // sync skips their alerts so one detection never notifies twice.
    fun markNotified(eventId: String) {
        val set = (prefs.getStringSet("notified", emptySet()) ?: emptySet()).toMutableList()
        set.add(eventId)
        prefs.edit().putStringSet("notified", set.takeLast(64).toSet()).apply()
    }

    fun wasNotified(eventId: String) = prefs.getStringSet("notified", emptySet())?.contains(eventId) == true

    var lastSyncedAlertAt: Long
        get() = prefs.getLong("last_alert_at", -1)
        set(v) { prefs.edit().putLong("last_alert_at", v).apply() }
}
