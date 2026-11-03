package app.sovir.android.ui

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import app.sovir.android.data.Api
import app.sovir.android.data.Auth
import app.sovir.android.model.Tone
import app.sovir.android.model.secretProblem
import app.sovir.android.model.userProblem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private fun serverHost(): String = runCatching { Uri.parse(Api.base).host }.getOrNull() ?: Api.base

@Composable
fun WelcomeScreen(onSignIn: () -> Unit, onRegister: () -> Unit) {
    val p = LocalPalette.current
    Column(
        Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 24.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        BrandLockup()
        Column {
            Mark(56.dp)
            Gap(28.dp)
            Text("Ver lo que influye.\nElegir lo que importa.", style = MaterialTheme.typography.displaySmall, color = p.ink)
            Gap(14.dp)
            Text(
                "SOVIR observa señales de riesgo solo con tu permiso, te muestra la evidencia y te deja decidir. " +
                    "Tus datos viven en tu propio servidor.",
                style = MaterialTheme.typography.bodyLarge,
                color = p.muted,
            )
        }
        Column {
            PrimaryButton("Iniciar sesión", onSignIn, Modifier.testTag("sign-in"))
            Gap(10.dp)
            SecondaryButton("Crear cuenta", onRegister, Modifier.testTag("register"))
            Gap(18.dp)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Kicker("Servidor")
                Spacer(Modifier.size(8.dp))
                Text(serverHost(), style = MaterialTheme.typography.labelSmall, color = p.muted, maxLines = 1)
            }
        }
    }
}

@Composable
private fun AuthFrame(title: String, sub: String, onBack: () -> Unit, content: @Composable () -> Unit) {
    val p = LocalPalette.current
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Glyphs.back, contentDescription = "Volver", tint = p.ink) }
            Spacer(Modifier.size(4.dp))
            BrandLockup(20.dp)
        }
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp)) {
            PageHeader(title, sub = sub)
            content()
            Gap(32.dp)
        }
    }
}

@Composable
private fun fieldColors() = LocalPalette.current.let { p ->
    OutlinedTextFieldDefaults.colors(
        focusedBorderColor = p.ink, unfocusedBorderColor = p.line, cursorColor = p.ink,
        focusedLabelColor = p.ink, unfocusedLabelColor = p.muted,
        focusedTextColor = p.ink, unfocusedTextColor = p.ink,
        focusedContainerColor = p.surface, unfocusedContainerColor = p.surface,
        errorBorderColor = p.danger, errorLabelColor = p.danger, errorCursorColor = p.danger,
    )
}

@Composable
fun SignInScreen(onBack: () -> Unit, onRegister: () -> Unit, onSignedIn: () -> Unit) {
    // Field values live only in this composition: never persisted, wiped on success.
    var user by remember { mutableStateOf("") }
    var secret by remember { mutableStateOf("") }
    var reveal by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val focus = LocalFocusManager.current
    val p = LocalPalette.current

    fun submit() {
        problem = userProblem(user) ?: secretProblem(secret)
        if (problem != null || busy) return
        focus.clearFocus()
        busy = true
        scope.launch {
            val r = withContext(Dispatchers.IO) { Auth.signIn(user, secret) }
            busy = false
            when (r) {
                Auth.Result.Ok -> {
                    secret = ""
                    onSignedIn()
                }
                Auth.Result.BadCredentials -> problem = "Usuario o contraseña incorrectos."
                Auth.Result.Unreachable -> problem = "No pudimos contactar tu servidor de identidad. Revisa la conexión."
                is Auth.Result.Failed -> problem = "El servidor de identidad respondió con un error (${r.code})."
            }
        }
    }

    AuthFrame("Iniciar sesión", "Con tu cuenta de SOVIR.", onBack) {
        OutlinedTextField(
            value = user,
            onValueChange = { user = it; problem = null },
            modifier = Modifier.fillMaxWidth().testTag("user"),
            label = { Text("Usuario o correo") },
            singleLine = true,
            enabled = !busy,
            shape = RoundedCornerShape(6.dp),
            colors = fieldColors(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next, autoCorrectEnabled = false),
        )
        Gap(12.dp)
        OutlinedTextField(
            value = secret,
            onValueChange = { secret = it; problem = null },
            modifier = Modifier.fillMaxWidth().testTag("secret"),
            label = { Text("Contraseña") },
            singleLine = true,
            enabled = !busy,
            visualTransformation = if (reveal) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
                IconButton(onClick = { reveal = !reveal }) {
                    Icon(
                        if (reveal) Glyphs.eyeOff else Glyphs.eye,
                        contentDescription = if (reveal) "Ocultar contraseña" else "Mostrar contraseña",
                        tint = p.muted,
                    )
                }
            },
            shape = RoundedCornerShape(6.dp),
            colors = fieldColors(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { submit() }),
        )
        Notice(problem)
        Gap(20.dp)
        PrimaryButton(if (busy) "Entrando…" else "Entrar", ::submit, Modifier.testTag("submit"), loading = busy)
        Gap(6.dp)
        QuietAction("No tengo cuenta: crear una", onRegister)
        Gap(16.dp)
        Text(
            "Tu contraseña va directa a tu servidor de identidad y no se guarda en el teléfono. " +
                "La app conserva solo un token de sesión que puedes cerrar desde Cuenta.",
            style = MaterialTheme.typography.bodySmall,
            color = p.muted,
        )
    }
}

@Composable
fun RegisterScreen(onBack: () -> Unit, onHaveAccount: () -> Unit, pendingError: String?) {
    val ctx = LocalContext.current
    val p = LocalPalette.current
    var opened by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }

    fun open() {
        problem = null
        try {
            ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Auth.registrationUrl())))
            opened = true
        } catch (e: ActivityNotFoundException) {
            problem = "No hay un navegador disponible para abrir el registro."
        }
    }

    AuthFrame("Crear cuenta", "El registro lo gestiona tu servidor de identidad, no la app.", onBack) {
        Panel {
            Fact("Dónde", "Formulario seguro de tu servidor, en el navegador")
            Fact("Qué pide", "Usuario, correo y contraseña")
            Fact("Después", "Vuelves aquí con la sesión iniciada", divider = false)
        }
        Gap(20.dp)
        if (opened) {
            Kicker("Esperando el registro", Tone.Unknown)
            Gap(6.dp)
            Text(
                "Completa el formulario en el navegador. Si no vuelves automáticamente, abre la app e inicia sesión.",
                style = MaterialTheme.typography.bodyMedium,
                color = p.muted,
            )
            Gap(16.dp)
        }
        Notice(problem ?: pendingError)
        PrimaryButton(if (opened) "Abrir el registro otra vez" else "Abrir el registro", ::open, Modifier.testTag("open-register"))
        Gap(6.dp)
        QuietAction("Ya tengo cuenta", onHaveAccount)
    }
}

@Composable
fun CenterStatus(title: String, body: String) {
    Column(
        Modifier.fillMaxSize().statusBarsPadding().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        BrandLockup()
        StateBlock(StateKind.Loading, title, body)
    }
}
