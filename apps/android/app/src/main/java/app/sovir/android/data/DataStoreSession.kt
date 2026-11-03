package app.sovir.android.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import app.sovir.android.model.ThemeChoice
import java.io.IOException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map

private val Context.uiPrefs by preferencesDataStore(name = "sovir_ui")

/** Local-only UI preferences. Nothing here is account or risk state. */
class UiPreferences(private val context: Context) {
    val theme: Flow<ThemeChoice> = context.uiPrefs.data
        .map { ThemeChoice.fromWire(it[THEME]) }
        .catch { emit(ThemeChoice.System) }

    suspend fun setTheme(choice: ThemeChoice): Boolean = try {
        context.uiPrefs.edit { it[THEME] = choice.name }
        true
    } catch (e: IOException) {
        false
    }

    private companion object {
        val THEME = stringPreferencesKey("theme")
    }
}
