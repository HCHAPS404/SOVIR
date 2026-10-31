package app.sovir.android.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import app.sovir.android.model.LocalState
import app.sovir.android.model.SessionRepository
import app.sovir.android.model.SourceId
import app.sovir.android.model.ThemeChoice
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map

private val Context.sessionStore by preferencesDataStore(name = "sovir_session")

class DataStoreSession(private val context: Context) : SessionRepository {
    override val state: Flow<LocalState> = context.sessionStore.data
        .map { prefs ->
            LocalState(
                ready = true,
                failed = false,
                demo = prefs[Keys.demo] ?: false,
                theme = ThemeChoice.fromWire(prefs[Keys.theme]),
                pending = (prefs[Keys.pending] ?: emptySet()).mapNotNull { name ->
                    runCatching { SourceId.valueOf(name) }.getOrNull()
                }.toSet(),
            )
        }
        .catch { error ->
            if (error is CancellationException) throw error
            emit(LocalState(ready = true, failed = true))
        }

    override suspend fun setDemo(open: Boolean): Boolean = edit { it[Keys.demo] = open }

    override suspend fun setTheme(choice: ThemeChoice): Boolean = edit { it[Keys.theme] = choice.name }

    override suspend fun togglePending(id: SourceId): Boolean = edit { prefs ->
        val current = prefs[Keys.pending] ?: emptySet()
        prefs[Keys.pending] = if (id.name in current) current - id.name else current + id.name
    }

    private suspend fun edit(block: (androidx.datastore.preferences.core.MutablePreferences) -> Unit): Boolean =
        try {
            context.sessionStore.edit(block)
            true
        } catch (error: IOException) {
            false
        }
}

private object Keys {
    val demo = booleanPreferencesKey("demo")
    val theme = stringPreferencesKey("theme")
    val pending = stringSetPreferencesKey("pending")
}
