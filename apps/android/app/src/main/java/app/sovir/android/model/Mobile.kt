package app.sovir.android.model

enum class ThemeChoice(val label: String) {
    System("Sistema"),
    Light("Claro"),
    Dark("Oscuro");

    companion object {
        fun fromWire(value: String?): ThemeChoice = entries.firstOrNull { it.name == value } ?: System
    }
}

/** Sign-in form checks — judge the value, never echo it back. */
fun userProblem(value: String): String? = if (value.isBlank()) "Escribe tu usuario o correo." else null

fun secretProblem(value: String): String? = if (value.isEmpty()) "Escribe tu contraseña." else null

/** Consent duration choices for this phone's observer grant. */
enum class GrantSpan(val label: String, val ms: Long) {
    Day("24 horas", DAY_MS),
    Week("7 días", 7 * DAY_MS),
    Month("30 días", 30 * DAY_MS),
}
