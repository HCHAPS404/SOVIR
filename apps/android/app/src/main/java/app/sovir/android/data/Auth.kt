package app.sovir.android.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import app.sovir.android.BuildConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * OIDC session against the configured Keycloak realm.
 *
 * The password is sent once to the identity server and never stored: the
 * phone keeps only the access + refresh tokens in private app storage
 * (allowBackup=false). Registration uses Keycloak's own hosted form in the
 * browser with PKCE, so the app never handles admin credentials.
 */
object Auth {
    const val CLIENT_ID = "sovir-extension"
    const val REDIRECT_URI = "app.sovir.android://oauth"

    private lateinit var prefs: SharedPreferences
    private val _signedIn = MutableStateFlow(false)
    val signedIn: StateFlow<Boolean> = _signedIn

    val tokenUrl: String get() = BuildConfig.SOVIR_OIDC_TOKEN_URL
    val issuer: String get() = tokenUrl.removeSuffix("/protocol/openid-connect/token")

    fun init(context: Context) {
        if (::prefs.isInitialized) return
        prefs = context.applicationContext.getSharedPreferences("sovir_auth", Context.MODE_PRIVATE)
        _signedIn.value = prefs.contains(K_REFRESH)
    }

    sealed interface Result {
        data object Ok : Result
        data object BadCredentials : Result
        data object Unreachable : Result
        data class Failed(val code: Int) : Result
    }

    fun signIn(user: String, password: String): Result = tokenRequest(
        "grant_type=password&client_id=$CLIENT_ID&scope=openid" +
            "&username=${enc(user.trim())}&password=${enc(password)}",
    )

    /** Completes the browser registration/sign-in round trip (PKCE). */
    fun exchangeCode(code: String): Result {
        val verifier = prefs.getString(K_VERIFIER, null) ?: return Result.Failed(0)
        prefs.edit().remove(K_VERIFIER).apply()
        return tokenRequest(
            "grant_type=authorization_code&client_id=$CLIENT_ID&code=${enc(code)}" +
                "&redirect_uri=${enc(REDIRECT_URI)}&code_verifier=${enc(verifier)}",
        )
    }

    /** Keycloak's hosted registration form, bound to a fresh PKCE verifier. */
    fun registrationUrl(): String {
        val bytes = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val verifier = b64url(bytes)
        prefs.edit().putString(K_VERIFIER, verifier).apply()
        val challenge = b64url(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))
        return "$issuer/protocol/openid-connect/registrations?client_id=$CLIENT_ID" +
            "&response_type=code&scope=openid&redirect_uri=${enc(REDIRECT_URI)}" +
            "&code_challenge=$challenge&code_challenge_method=S256"
    }

    /** Valid access token, refreshing when it is about to expire. Null = signed out. */
    @Synchronized
    fun accessToken(): String? {
        if (!::prefs.isInitialized) return null
        val access = prefs.getString(K_ACCESS, null)
        if (access != null && System.currentTimeMillis() < prefs.getLong(K_EXPIRES, 0) - 30_000) return access
        val refresh = prefs.getString(K_REFRESH, null) ?: return null
        return when (tokenRequest("grant_type=refresh_token&client_id=$CLIENT_ID&refresh_token=${enc(refresh)}")) {
            Result.Ok -> prefs.getString(K_ACCESS, null)
            Result.Unreachable -> null // keep the session; we are offline
            else -> {
                clear()
                null
            }
        }
    }

    /** Forces the next call to refresh (after a 401 from the API). */
    @Synchronized
    fun invalidateAccess() {
        prefs.edit().remove(K_ACCESS).putLong(K_EXPIRES, 0).apply()
    }

    fun signOut() {
        val refresh = prefs.getString(K_REFRESH, null)
        clear()
        if (refresh != null) {
            runCatching {
                post("$issuer/protocol/openid-connect/logout", "client_id=$CLIENT_ID&refresh_token=${enc(refresh)}")
            }
        }
    }

    fun displayName(): String? = claims()?.optString("preferred_username")?.takeIf { it.isNotBlank() }
    fun email(): String? = claims()?.optString("email")?.takeIf { it.isNotBlank() }

    private fun claims(): JSONObject? {
        val token = if (::prefs.isInitialized) prefs.getString(K_ACCESS, null) else null
        val part = token?.split('.')?.getOrNull(1) ?: return null
        return runCatching {
            JSONObject(String(Base64.decode(part, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)))
        }.getOrNull()
    }

    private fun clear() {
        prefs.edit().remove(K_ACCESS).remove(K_REFRESH).remove(K_EXPIRES).apply()
        _signedIn.value = false
    }

    private fun tokenRequest(form: String): Result {
        val (code, body) = try {
            post(tokenUrl, form)
        } catch (e: IOException) {
            return Result.Unreachable
        }
        if (code in 200..299) {
            val json = JSONObject(body)
            prefs.edit()
                .putString(K_ACCESS, json.getString("access_token"))
                .putString(K_REFRESH, json.optString("refresh_token", prefs.getString(K_REFRESH, "") ?: ""))
                .putLong(K_EXPIRES, System.currentTimeMillis() + json.optLong("expires_in", 60) * 1000)
                .apply()
            _signedIn.value = true
            return Result.Ok
        }
        return if (code == 400 || code == 401) Result.BadCredentials else Result.Failed(code)
    }

    private fun post(url: String, form: String): Pair<Int, String> {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("content-type", "application/x-www-form-urlencoded")
            doOutput = true
            connectTimeout = 8_000
            readTimeout = 8_000
        }
        conn.outputStream.use { it.write(form.toByteArray()) }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        return code to (stream?.bufferedReader()?.use { it.readText() } ?: "")
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
    private fun b64url(b: ByteArray) = Base64.encodeToString(b, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

    private const val K_ACCESS = "access_token"
    private const val K_REFRESH = "refresh_token"
    private const val K_EXPIRES = "access_expires_at"
    private const val K_VERIFIER = "pkce_verifier"
}
