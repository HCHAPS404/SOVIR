package app.sovir.android.model

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

enum class Door(val label: String) {
    Google("Google"),
    GitHub("GitHub"),
    Microsoft("Microsoft"),
    Apple("Apple"),
    Email("el correo"),
}

enum class GateKind { SignIn, Register }

data class AttemptResult(
    val door: Door,
    val message: String,
    val accountCreated: Boolean = false,
    val networkCalled: Boolean = false,
    val enteredShell: Boolean = false,
)

fun refuse(kind: GateKind, door: Door): AttemptResult {
    val message = when (kind) {
        GateKind.SignIn -> "Elegiste ${door.label}. No se inició sesión. No se llamó a ningún servicio."
        GateKind.Register -> "Elegiste ${door.label}. No se guardó el registro. No se llamó a ningún servicio."
    }
    return AttemptResult(door = door, message = message)
}

fun emailProblem(value: String): String? {
    val trimmed = value.trim()
    if (trimmed.isEmpty()) return "Falta el correo."
    val at = trimmed.indexOf('@')
    if (at <= 0 || at != trimmed.lastIndexOf('@') || at == trimmed.lastIndex) {
        return "El correo no tiene forma de dirección."
    }
    return null
}

fun secretProblem(value: String): String? {
    if (value.isEmpty()) return "Falta la clave."
    return null
}

enum class SourceId { Phone, Extension, Console, Desktop }

data class Source(
    val id: SourceId,
    val title: String,
    val summary: String,
    val body: String,
)

val sources = listOf(
    Source(
        SourceId.Phone,
        "Este teléfono",
        "El aparato donde se abre esta aplicación.",
        "No está registrado en una cuenta. Marcarlo pendiente solo guarda una nota local.",
    ),
    Source(
        SourceId.Extension,
        "Extensión del navegador",
        "El permiso por sitio vive en la extensión, no aquí.",
        "Esta aplicación no observa páginas ni hereda el permiso de la extensión.",
    ),
    Source(
        SourceId.Console,
        "Consola web",
        "La sesión de la consola no se comparte con este teléfono.",
        "Entrar en la web no enlaza este aparato.",
    ),
    Source(
        SourceId.Desktop,
        "Escritorio",
        "Windows, macOS o Linux.",
        "No hay un instalador publicado ni un enlace con este teléfono.",
    ),
)

enum class Pending { Absent, LocalNote }

fun pendingOf(marked: Boolean): Pending = if (marked) Pending.LocalNote else Pending.Absent

fun pendingLabel(state: Pending): String = when (state) {
    Pending.Absent -> "Sin enlace"
    Pending.LocalNote -> "Pendiente en este teléfono"
}

enum class ThemeChoice {
    System,
    Light,
    Dark,
    ;

    companion object {
        fun fromWire(value: String?): ThemeChoice = entries.firstOrNull { it.name == value } ?: System
    }
}

data class LocalState(
    val ready: Boolean = false,
    val failed: Boolean = false,
    val demo: Boolean = false,
    val theme: ThemeChoice = ThemeChoice.System,
    val pending: Set<SourceId> = emptySet(),
) {
    val accountExists: Boolean = false
}

interface SessionRepository {
    val state: Flow<LocalState>
    suspend fun setDemo(open: Boolean): Boolean
    suspend fun setTheme(choice: ThemeChoice): Boolean
    suspend fun togglePending(id: SourceId): Boolean
}

class MemorySession(initial: LocalState = LocalState(ready = true)) : SessionRepository {
    private val mutable = MutableStateFlow(initial)
    override val state: Flow<LocalState> = mutable.asStateFlow()

    override suspend fun setDemo(open: Boolean): Boolean {
        mutable.update { it.copy(demo = open, failed = false) }
        return true
    }

    override suspend fun setTheme(choice: ThemeChoice): Boolean {
        mutable.update { it.copy(theme = choice) }
        return true
    }

    override suspend fun togglePending(id: SourceId): Boolean {
        mutable.update { current ->
            val next = current.pending.toMutableSet()
            if (!next.add(id)) next.remove(id)
            current.copy(pending = next)
        }
        return true
    }
}

object Copy {
    const val brand = "SOVIR"
    const val welcomeLine = "En el dispositivo, con una política, en tus manos."
    const val welcomeNote = "Esta aplicación no observa la pantalla."
    const val enter = "Entrar"
    const val create = "Crear cuenta"
    const val noAccountTitle = "Ninguna cuenta se abre desde aquí."
    const val signInLede = "Simulación de acceso. No hay cuenta ni clave guardada."
    const val registerLede = "Simulación de alta. No se crea un usuario ni se conserva la clave."
    const val continueEmail = "Continuar con el correo"
    const val otherOptions = "Otras opciones"
    const val email = "Correo"
    const val secret = "Clave"
    const val emailPlaceholder = "nombre@correo.com"
    const val developer = "Perfil de desarrollador"
    const val developerNote = "Entra sin cuenta. La sesión queda solo en este teléfono y no concede ningún permiso."
    const val termsNote = "Al continuar no se abre una cuenta y no se envía el correo. Esta pantalla no llama a ningún servicio."
    const val haveEntry = "Ir a entrar"
    const val sessionKicker = "Sesión de demostración"
    const val homeTitle = "Sin cobertura que afirmar"
    const val homeLede = "No hay sensores conectados. Vacío no significa protegido."
    const val capture = "Captura"
    const val noPermission = "Sin permiso"
    const val lastEvent = "Último evento"
    const val none = "Ninguno"
    const val localNotes = "Notas locales"
    const val links = "Enlaces"
    const val toConnect = "Por conectar"
    const val connectionsTitle = "Conexiones"
    const val connectionsLede = "Fuentes que podrían enlazarse más adelante. Ninguna está enlazada con una cuenta."
    const val noNetwork = "Esta aplicación no consulta la red."
    const val markPending = "Dejar pendiente en este teléfono"
    const val clearPending = "Quitar la nota"
    const val pendingExplain = "La nota queda en este teléfono. No crea una cuenta, no enlaza un servicio y no pide un permiso del sistema."
    const val activity = "Actividad"
    const val incidents = "Incidentes"
    const val investigation = "Investigación"
    const val incidentsEmpty = "No hay observaciones. Eso no significa protección activa."
    const val investigationEmpty = "No hay una investigación en curso. El costo remoto de esta demostración es cero."
    const val investigationSteps = "Los pasos previstos son evento, hipótesis y verificación. La verificación externa no se ejecuta aquí."
    const val showFixture = "Ver un fixture sintético"
    const val hideFixture = "Ocultar el fixture"
    const val fixtureBanner = "Fixture sintético"
    const val fixtureObserved = "Observado"
    const val fixtureObservedBody = "Una página de prueba pide un código de un solo uso y un cambio de cuenta."
    const val fixtureInferred = "Inferido, no verificado"
    const val fixtureInferredBody = "Podría ser una suplantación. No hay fuente independiente en este fixture."
    const val fixtureUnknown = "Desconocido"
    const val fixtureUnknownBody = "La identidad del remitente no está corroborada."
    const val account = "Cuenta"
    const val developerProfile = "Perfil de desarrollador"
    const val noIdentity = "No hay correo ni nombre guardados."
    const val theme = "Tema"
    const val system = "Sistema"
    const val light = "Claro"
    const val dark = "Oscuro"
    const val permissions = "Permisos"
    const val closeSession = "Cerrar sesión"
    const val closeNote = "Cierra la sesión de demostración en este teléfono. No hay una cuenta que borrar."
    const val permissionsTitle = "Permisos"
    const val permissionsLede = "No hay un permiso de captura. Esta aplicación no lo puede conceder."
    const val permissionsBody = "No se declara proyección de pantalla, ni el selector de iOS, ni un portal de escritorio. El diálogo del sistema no está dibujado. No se leen otras aplicaciones."
    const val pause = "Pausa"
    const val pauseValue = "No hay un sensor que pausar"
    const val revoke = "Revocación"
    const val revokeValue = "No hay una concesión que revocar"
    const val loading = "Leyendo la sesión local."
    const val loadFailed = "No se pudo leer la sesión local."
    const val home = "Inicio"
    const val saveFailed = "No se pudo guardar la sesión local."
    const val noteFailed = "No se pudo guardar la nota en este teléfono."
    const val backLinks = "Volver a conexiones"
    const val back = "Volver"
}
