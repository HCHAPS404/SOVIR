package app.sovir.android.data

import android.content.Context
import android.content.SharedPreferences
import android.os.Build

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

    fun init(context: Context) {
        if (!::prefs.isInitialized) {
            prefs = context.applicationContext.getSharedPreferences("sovir_phone_link", Context.MODE_PRIVATE)
        }
    }

    val deviceId: String? get() = prefs.getString("device_id", null)
    val grantId: String? get() = prefs.getString("grant_id", null)
    val grantExpiresAt: Long get() = prefs.getLong("grant_expires_at", 0)

    fun uploadAllowed(now: Long = System.currentTimeMillis()) =
        ::prefs.isInitialized && grantId != null && grantExpiresAt > now && Auth.signedIn.value

    /** Registers the phone once, then issues a fresh, time-bound grant. */
    fun grant(spanMs: Long) {
        if (deviceId == null) {
            val device = Api.registerDevice("Android · ${Build.MODEL}")
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
