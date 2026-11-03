// Credential store for the real OIDC login path: user/pass the person
// typed in the sign-in screen, kept in private app storage. Dev defaults
// remain for loopback builds that never sign in.
package app.sovir.android.observer

import android.content.Context

object SessionStore {
    private const val PREFS = "sovir_session"
    private const val KEY_USER = "oidc_user"
    private const val KEY_PASS = "oidc_pass"
    private var prefs: android.content.SharedPreferences? = null

    fun init(context: Context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    }

    fun save(user: String, pass: String) {
        prefs?.edit()?.putString(KEY_USER, user)?.putString(KEY_PASS, pass)?.apply()
    }

    fun clear() {
        prefs?.edit()?.clear()?.apply()
    }

    fun user(): String = prefs?.getString(KEY_USER, null) ?: "jesui"
    fun pass(): String = prefs?.getString(KEY_PASS, null) ?: "local_only"
}
