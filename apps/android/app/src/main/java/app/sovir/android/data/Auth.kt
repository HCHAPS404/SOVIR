package app.sovir.android.data

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import app.sovir.android.BuildConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

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

    /** AES-256/GCM vault backed by AndroidKeyStore: token material rests as
     *  ciphertext in SharedPreferences and the key never leaves the
     *  TEE/StrongBox. Values written before the vault existed are read as
     *  plaintext and re-sealed at init (one transparent migration). A value
     *  that cannot be decrypted opens as absent — the session is dropped
     *  rather than guessed. */
    private object Vault {
        private const val ALIAS = "sovir_token_vault"
        private const val PREFIX = "enc:gcm:"
        private const val IV_LEN = 12

        private fun key(): SecretKey {
            val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            (ks.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let {
                return it.secretKey
            }
            val gen = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                "AndroidKeyStore",
            )
            gen.init(
                KeyGenParameterSpec.Builder(
                    ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build(),
            )
            return gen.generateKey()
        }

        fun seal(plain: String): String {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key())
            val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
            return PREFIX + Base64.encodeToString(cipher.iv + ct, Base64.NO_WRAP)
        }

        fun open(value: String?): String? {
            if (value == null) return null
            if (!value.startsWith(PREFIX)) return value // legacy plaintext
            return runCatching {
                val raw = Base64.decode(value.removePrefix(PREFIX), Base64.DEFAULT)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(
                    Cipher.DECRYPT_MODE,
                    key(),
                    GCMParameterSpec(128, raw.copyOfRange(0, IV_LEN)),
                )
                String(cipher.doFinal(raw.copyOfRange(IV_LEN, raw.size)), Charsets.UTF_8)
            }.getOrNull()
        }

        fun sealed(value: String?) = value?.startsWith(PREFIX) == true
    }

    private lateinit var prefs: SharedPreferences
    private val _signedIn = MutableStateFlow(false)
    val signedIn: StateFlow<Boolean> = _signedIn

    // Endpoint overrides: quick-tunnel URLs rotate when cloudflared
    // restarts, so the user can repoint the app from Account without a
    // rebuild. Absent → the build-time values baked into BuildConfig.
    val apiBase: String
        get() = prefsOrNull()?.getString(K_API_BASE, null)?.takeIf { it.isNotBlank() }
            ?: BuildConfig.SOVIR_API_BASE
    val tokenUrl: String
        get() = prefsOrNull()?.getString(K_TOKEN_URL, null)?.takeIf { it.isNotBlank() }
            ?: BuildConfig.SOVIR_OIDC_TOKEN_URL
    val issuer: String get() = tokenUrl.removeSuffix("/protocol/openid-connect/token")
    val endpointsCustom: Boolean
        get() = prefsOrNull()?.contains(K_API_BASE) == true

    private fun prefsOrNull() = if (::prefs.isInitialized) prefs else null

    /** Repoints the app at another server. Tokens belong to the old
     *  issuer, so the session is dropped — the user signs in again. */
    fun setEndpoints(apiBase: String?, oidcTokenUrl: String?) {
        val api = apiBase?.trim().orEmpty()
        val oidc = oidcTokenUrl?.trim().orEmpty()
        prefs.edit().apply {
            if (api.isEmpty()) remove(K_API_BASE) else putString(K_API_BASE, api.trimEnd('/'))
            if (oidc.isEmpty()) remove(K_TOKEN_URL) else putString(K_TOKEN_URL, oidc)
        }.apply()
        clear()
    }

    fun init(context: Context) {
        if (::prefs.isInitialized) return
        prefs = context.applicationContext.getSharedPreferences("sovir_auth", Context.MODE_PRIVATE)
        migrateSecrets()
        _signedIn.value = prefs.contains(K_REFRESH)
    }

    private fun migrateSecrets() {
        val editor = prefs.edit()
        for (key in arrayOf(K_ACCESS, K_REFRESH, K_VERIFIER)) {
            val raw = prefs.getString(key, null)
            if (raw != null && !Vault.sealed(raw)) editor.putString(key, Vault.seal(raw))
        }
        editor.apply()
    }

    private fun getSecret(key: String): String? = Vault.open(prefs.getString(key, null))

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
        val verifier = getSecret(K_VERIFIER) ?: return Result.Failed(0)
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
        prefs.edit().putString(K_VERIFIER, Vault.seal(verifier)).apply()
        val challenge = b64url(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))
        return "$issuer/protocol/openid-connect/registrations?client_id=$CLIENT_ID" +
            "&response_type=code&scope=openid&redirect_uri=${enc(REDIRECT_URI)}" +
            "&code_challenge=$challenge&code_challenge_method=S256"
    }

    /** Valid access token, refreshing when it is about to expire. Null = signed out. */
    @Synchronized
    fun accessToken(): String? {
        if (!::prefs.isInitialized) return null
        val access = getSecret(K_ACCESS)
        if (access != null && System.currentTimeMillis() < prefs.getLong(K_EXPIRES, 0) - 30_000) return access
        val refresh = getSecret(K_REFRESH) ?: return null
        return when (tokenRequest("grant_type=refresh_token&client_id=$CLIENT_ID&refresh_token=${enc(refresh)}")) {
            Result.Ok -> getSecret(K_ACCESS)
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
        val refresh = getSecret(K_REFRESH)
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
        val token = if (::prefs.isInitialized) getSecret(K_ACCESS) else null
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
                .putString(K_ACCESS, Vault.seal(json.getString("access_token")))
                .putString(K_REFRESH, Vault.seal(json.optString("refresh_token", getSecret(K_REFRESH) ?: "")))
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
    private const val K_API_BASE = "endpoint_api_base"
    private const val K_TOKEN_URL = "endpoint_oidc_token_url"
}
