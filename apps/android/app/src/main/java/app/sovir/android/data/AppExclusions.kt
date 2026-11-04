package app.sovir.android.data

import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager

/**
 * Which installed packages the observer never reads (ADR-0014 companion).
 *
 * Two layers, both user-controlled and editable in the Protection screen:
 *  - `excluded_packages`: the person's own exempt list (any package name).
 *  - Sensitive categories (social/messaging, banking, wallets): excluded
 *    BY DEFAULT even when the accessibility service is on. The person can
 *    opt IN per app (`sensitive_included`) or flip the whole shield
 *    (`sensitive_allowed`) — consent is requested per surface.
 * Nothing is asked per-app; one consent at grant time, exemptions after.
 */
object AppExclusions {
    private const val K_EXCLUDED = "excluded_packages"
    private const val K_SENSITIVE = "sensitive_allowed"
    private const val K_SENSITIVE_INCLUDED = "sensitive_included"

    private lateinit var prefs: SharedPreferences

    fun init(context: Context) {
        if (!::prefs.isInitialized) {
            prefs = context.applicationContext.getSharedPreferences("sovir_app_exclusions", Context.MODE_PRIVATE)
        }
    }

    /** Known sensitive packages — social/messaging and finance. */
    val SENSITIVE_PACKAGES = mapOf(
        "Social y mensajería" to setOf(
            "com.whatsapp", "com.whatsapp.w4b", "com.instagram.android",
            "com.facebook.katana", "com.facebook.orca", "org.telegram.messenger",
            "com.zhiliaoapp.musically", "com.twitter.android", "com.snapchat.android",
            "org.thoughtcrime.securesms",
        ),
        "Banca y finanzas" to setOf(
            "com.bbva.bbvacontigo", "es.bancosantander.apps", "es.caixabank.MobilePhone",
            "com.bancsabadell.BSApp", "com.ingdirect.b2c",
            "com.revolut.revolut", "de.number26.android", "com.transferwise.android",
            "com.paypal.android.p2pmobile", "com.mercadopago.wallet",
            "com.binance.dev", "com.coinbase.android", "com.kraken.invest",
        ),
    )
    private val SENSITIVE_FLAT = SENSITIVE_PACKAGES.values.flatten().toSet()

    val excludedPackages: Set<String>
        get() = if (::prefs.isInitialized) prefs.getStringSet(K_EXCLUDED, emptySet()) ?: emptySet() else emptySet()

    var sensitiveAllowed: Boolean
        get() = ::prefs.isInitialized && prefs.getBoolean(K_SENSITIVE, false)
        set(v) = prefs.edit().putBoolean(K_SENSITIVE, v).apply()

    fun setExcluded(pkgs: Set<String>) =
        prefs.edit().putStringSet(K_EXCLUDED, pkgs.map { it.trim() }.filter { it.isNotEmpty() }.toSet()).apply()

    fun isSensitive(pkg: String) = pkg in SENSITIVE_FLAT

    /** Sensitive packages the person individually opted IN — per-app consent,
     *  not a blanket switch. Each is a deliberate exception to the shield. */
    val sensitiveIncluded: Set<String>
        get() = if (::prefs.isInitialized) prefs.getStringSet(K_SENSITIVE_INCLUDED, emptySet()) ?: emptySet() else emptySet()

    fun setSensitiveIncluded(pkg: String, included: Boolean) {
        val cur = sensitiveIncluded
        setSensitiveIncluded(if (included) cur + pkg else cur - pkg)
    }

    fun setSensitiveIncluded(pkgs: Set<String>) =
        prefs.edit().putStringSet(K_SENSITIVE_INCLUDED, pkgs.filter { it in SENSITIVE_FLAT }.toSet()).apply()

    /** The single gate the accessibility service consults per package. */
    fun skips(pkg: String): Boolean = skipsWith(pkg, excludedPackages, sensitiveAllowed, sensitiveIncluded)

    /** Pure form, unit-testable without SharedPreferences. */
    fun skipsWith(
        pkg: String,
        excluded: Set<String>,
        sensitiveAllowed: Boolean,
        sensitiveIncluded: Set<String> = emptySet(),
    ): Boolean {
        if (pkg in excluded) return true
        if (pkg !in SENSITIVE_FLAT) return false
        return !sensitiveAllowed && pkg !in sensitiveIncluded
    }

    /** Sensitive packages actually installed here — for the settings UI. */
    fun installedSensitive(pm: PackageManager): List<Pair<String, String>> {
        val installed = try {
            pm.getInstalledPackages(0).map { it.packageName }.toSet()
        } catch (_: Exception) {
            return emptyList()
        }
        return SENSITIVE_PACKAGES.flatMap { (cat, pkgs) -> pkgs.filter { it in installed }.map { it to cat } }
    }
}
