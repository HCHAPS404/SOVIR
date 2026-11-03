// NOT_VERIFIED: Android SDK is a deferred toolchain — this file has not
// been compiled. It targets the stable AccessibilityService API only.
package app.sovir.android.observer

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Per-app UI_TREE observer (ADR-0014). The user activates it in system
 * Accessibility settings — the OS gates capture; the SOVIR consent grant
 * gates upload. It emits typed signals + a metadata digest, never node
 * text or field values.
 *
 * window-state changes are throttled per package: a new signal set may
 * emit at most once per DEDUPE_MS to avoid event storms.
 */
class SovirAccessibilityService : AccessibilityService() {

    private val api by lazy { SessionStore.init(applicationContext); ObserverApi() }
    private val executor = Executors.newSingleThreadExecutor()
    private val lastDigestByPackage = mutableMapOf<String, Pair<String, Long>>()

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
            event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
        ) return
        val pkg = event.packageName?.toString() ?: return
        // OS chrome and our own UI are not user content — the clock/status
        // bar and SOVIR screens must never emit signals.
        if (pkg in SKIP_PACKAGES) return
        if (app.sovir.android.BuildConfig.DEBUG) {
            android.util.Log.d("SovirObserver", "event type=${event.eventType} pkg=$pkg")
        }
        val root = rootInActiveWindow ?: return
        val (signals, hint) = SignalExtractor.extractWithHint(root)
        if (signals.isEmpty()) return
        if (app.sovir.android.BuildConfig.DEBUG) {
            android.util.Log.i("SovirObserver", "signals $pkg -> $signals")
        }
        val key = signals.sorted().joinToString(",")
        val now = System.currentTimeMillis()
        val last = lastDigestByPackage[pkg]
        if (last != null && last.first == key && now - last.second < DEDUPE_MS) return
        lastDigestByPackage[pkg] = key to now
        executor.execute {
            runCatching { api.emit(pkg, signals) }
                .onFailure { android.util.Log.w("SovirObserver", "emit failed", it) }
            // Council verdict → local notification. Best-effort: a failed
            // assess never blocks the durable event record above.
            if (hint.isNotBlank()) {
                api.assess(signals, hint)?.let { Notifier.notifyVerdict(this, it) }
            }
        }
    }

    override fun onInterrupt() {
        executor.shutdown()
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    companion object {
        private val DEDUPE_MS = TimeUnit.SECONDS.toMillis(30)
        // OS chrome — never user content, never observed.
        private val SKIP_PACKAGES = setOf(
            "app.sovir.android",
            "com.android.systemui",
            "com.android.settings",
            "android",
        )
    }
}
