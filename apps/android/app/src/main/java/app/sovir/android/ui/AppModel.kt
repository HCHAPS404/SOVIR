package app.sovir.android.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.sovir.android.data.Api
import app.sovir.android.data.ApiError
import app.sovir.android.data.Auth
import app.sovir.android.data.PhoneLink
import app.sovir.android.model.Budget
import app.sovir.android.model.DataExport
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class Sync { Loading, Ready, Offline, SignedOut, Error }

/**
 * Screen state for the signed-in app. Holds the last good snapshot so an
 * offline refresh keeps showing real (stale, labelled) data instead of
 * blanking the screen or inventing any.
 */
class AppModel(private val scope: CoroutineScope) {
    var data by mutableStateOf<DataExport?>(null)
        private set
    var budget by mutableStateOf<Budget?>(null)
        private set
    var sync by mutableStateOf(Sync.Loading)
        private set
    var updatedAt by mutableStateOf<Long?>(null)
        private set
    var refreshing by mutableStateOf(false)
        private set

    fun refresh() {
        if (refreshing) return
        refreshing = true
        if (data == null) sync = Sync.Loading
        scope.launch {
            val outcome = withContext(Dispatchers.IO) {
                runCatching {
                    val d = Api.data()
                    val b = runCatching { Api.budget() }.getOrNull()
                    d to b
                }
            }
            outcome.onSuccess { (d, b) ->
                data = d
                budget = b
                updatedAt = System.currentTimeMillis()
                sync = Sync.Ready
                PhoneLink.reconcile(d.grants.filter { it.activeAt(System.currentTimeMillis()) }.map { it.grantId }.toSet())
            }.onFailure { e ->
                sync = when (e) {
                    is ApiError.Offline -> Sync.Offline
                    is ApiError.SignedOut -> Sync.SignedOut
                    else -> Sync.Error
                }
            }
            refreshing = false
        }
    }

    /** Runs a mutation off the main thread, then reloads. Returns an error message or null. */
    fun act(block: () -> Unit, done: (String?) -> Unit) {
        scope.launch {
            val err = withContext(Dispatchers.IO) { runCatching(block).exceptionOrNull() }
            done(err?.let(::describeError))
            refresh()
        }
    }

    fun signOut(after: () -> Unit) {
        scope.launch {
            withContext(Dispatchers.IO) { Auth.signOut() }
            data = null
            budget = null
            sync = Sync.SignedOut
            after()
        }
    }
}

fun describeError(e: Throwable): String = when (e) {
    is ApiError.Offline -> "No pudimos contactar tu servidor SOVIR. Revisa la conexión e inténtalo de nuevo."
    is ApiError.SignedOut -> "Tu sesión terminó. Inicia sesión otra vez."
    is ApiError.Http -> when (e.code) {
        403 -> "Tu cuenta no tiene permiso para esta acción."
        404 -> "Ese elemento ya no existe en el servidor."
        409 -> "Ya existía: no se cambió nada."
        429 -> "Límite de presupuesto o de uso alcanzado."
        else -> "El servidor respondió con un error (${e.code}${e.errorCode?.let { " · $it" } ?: ""})."
    }
    else -> "Algo falló: ${e.message ?: e.javaClass.simpleName}"
}
