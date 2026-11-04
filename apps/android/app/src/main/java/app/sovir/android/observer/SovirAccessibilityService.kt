package app.sovir.android.observer

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import app.sovir.android.data.Api
import app.sovir.android.data.AppExclusions
import app.sovir.android.data.Auth
import app.sovir.android.data.PhoneLink
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Per-app UI_TREE observer (ADR-0014). Two gates, both required:
 *  1. Android: the person enables the service in Accessibility settings;
 *  2. SOVIR: the person grants upload in the app (PhoneLink), time-bound.
 * Without (2) the service reads nothing out of the phone. It emits typed
 * signals + a metadata digest; the matched snippet (text_hint) goes only to
 * the local council assess call and is never part of the stored event.
 *
 * Window changes are throttled per package: the same signal set emits at
 * most once per DEDUPE_MS to avoid event storms.
 */
class SovirAccessibilityService : AccessibilityService() {

    private val executor = Executors.newSingleThreadExecutor()
    private val lastByPackage = mutableMapOf<String, Pair<String, Long>>()

    override fun onServiceConnected() {
        super.onServiceConnected()
        Auth.init(applicationContext)
        PhoneLink.init(applicationContext)
        AppExclusions.init(applicationContext)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
            event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
        ) return
        val pkg = event.packageName?.toString() ?: return
        // OS chrome and our own UI are not user content.
        if (pkg in SKIP_PACKAGES) return
        // User exemptions + the default sensitive-app shield (social,
        // banking) — editable in the app's Protection screen.
        if (AppExclusions.skips(pkg)) return
        // Upload gate: no explicit SOVIR grant → nothing leaves the phone.
        if (!PhoneLink.uploadAllowed()) return
        val root = rootInActiveWindow ?: return
        val (signals, hint) = SignalExtractor.extractWithHint(root)
        if (signals.isEmpty()) return
        val key = signals.sorted().joinToString(",")
        val now = System.currentTimeMillis()
        val last = lastByPackage[pkg]
        if (last != null && last.first == key && now - last.second < DEDUPE_MS) return
        lastByPackage[pkg] = key to now
        if (app.sovir.android.BuildConfig.DEBUG) {
            android.util.Log.i("SovirObserver", "signals $pkg -> $signals")
        }
        executor.execute { upload(pkg, signals, hint) }
    }

    private fun upload(pkg: String, signals: Set<String>, hint: String) {
        val grant = PhoneLink.grantId ?: return
        val eventId = "and-${Api.shortId()}"
        val event = JSONObject()
            .put("event_id", eventId)
            .put("source_id", PhoneLink.SOURCE_ID)
            .put("observed_at_ms", System.currentTimeMillis())
            .put("modality", "UI_TREE")
            .put("content_digest", "sha256:${sha256("$pkg|${signals.sorted().joinToString(",")}")}")
            .put("consent_grant_id", grant)
            .put("sensitive_data_class", "PUBLIC")
            .put("signals", JSONArray(signals.toList()))
        runCatching { Api.emitEvent(event) }.onFailure {
            android.util.Log.w("SovirObserver", "emit failed: ${it.javaClass.simpleName}")
            return
        }
        // Local council only (PRIVATE): the hint never reaches a remote model.
        if (hint.isNotBlank()) {
            runCatching { Api.assess(signals.toList(), remoteAllowed = false, textHint = hint) }
                .onSuccess {
                    PhoneLink.markNotified(eventId)
                    Notifier.verdict(this, it, eventId)
                }
        }
    }

    private fun sha256(s: String): String =
        MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    companion object {
        private val DEDUPE_MS = TimeUnit.SECONDS.toMillis(30)
        private val SKIP_PACKAGES = setOf(
            "app.sovir.android",
            "com.android.systemui",
            "com.android.settings",
            "android",
        )
    }
}
