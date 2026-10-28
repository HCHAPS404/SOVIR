package app.sovir.android.ui

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import app.sovir.android.model.Copy
import app.sovir.android.model.Door
import app.sovir.android.model.GateKind
import app.sovir.android.model.emailProblem
import app.sovir.android.model.refuse
import app.sovir.android.model.secretProblem

@Composable
fun WelcomeScreen(onSignIn: () -> Unit, onRegister: () -> Unit) {
    val palette = LocalPalette.current
    Page {
        BrandLockup(36.dp)
        Spacer(Modifier.height(36.dp))
        PageTitle(Copy.welcomeLine)
        Spacer(Modifier.height(12.dp))
        Body(Copy.welcomeNote)
        Spacer(Modifier.height(32.dp))
        FilledAction(Copy.enter, onSignIn, Modifier.testTag("enter"))
        Spacer(Modifier.height(10.dp))
        LineAction(Copy.create, onRegister, Modifier.testTag("register"))
        Spacer(Modifier.height(28.dp))
        Text(Copy.noNetwork, style = MaterialTheme.typography.bodyMedium, color = palette.muted)
    }
}

@Composable
fun AccessScreen(
    kind: GateKind,
    notice: String? = null,
    onOther: () -> Unit,
    onDeveloper: (() -> Unit)? = null,
) {
    // El correo y la clave no se guardan: ni en disco, ni al rotar la pantalla.
    var email by remember { mutableStateOf("") }
    var secret by remember { mutableStateOf("") }
    var showMail by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    var result by remember { mutableStateOf<String?>(null) }
    val palette = LocalPalette.current

    fun finish(door: Door) {
        email = ""
        secret = ""
        problem = null
        result = refuse(kind, door).message
        showMail = false
    }

    Page {
        BrandLockup()
        Spacer(Modifier.height(28.dp))
        PageTitle(Copy.noAccountTitle)
        Spacer(Modifier.height(12.dp))
        Body(if (kind == GateKind.SignIn) Copy.signInLede else Copy.registerLede)
        Spacer(Modifier.height(24.dp))
        if (result != null) {
            Text(result.orEmpty(), style = MaterialTheme.typography.bodyLarge, color = palette.ink)
            Spacer(Modifier.height(16.dp))
            LineAction(Copy.otherOptions, {
                result = null
                problem = null
            })
        } else if (showMail) {
            val colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = palette.ink,
                unfocusedBorderColor = palette.line,
                cursorColor = palette.ink,
                focusedLabelColor = palette.muted,
                unfocusedLabelColor = palette.muted,
                focusedTextColor = palette.ink,
                unfocusedTextColor = palette.ink,
            )
            OutlinedTextField(
                value = email,
                onValueChange = { email = it; problem = null },
                modifier = Modifier.fillMaxWidth(),
                label = { Text(Copy.email) },
                placeholder = { Text(Copy.emailPlaceholder) },
                singleLine = true,
                shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
                colors = colors,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = secret,
                onValueChange = { secret = it; problem = null },
                modifier = Modifier.fillMaxWidth(),
                label = { Text(Copy.secret) },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
                colors = colors,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = {
                    val issue = emailProblem(email) ?: secretProblem(secret)
                    if (issue != null) problem = issue else finish(Door.Email)
                }),
            )
            if (problem != null) {
                Spacer(Modifier.height(8.dp))
                Text(problem.orEmpty(), color = palette.danger, style = MaterialTheme.typography.bodyMedium)
            }
            Spacer(Modifier.height(14.dp))
            FilledAction(Copy.continueEmail, onClick = {
                val issue = emailProblem(email) ?: secretProblem(secret)
                if (issue != null) problem = issue else finish(Door.Email)
            })
            Spacer(Modifier.height(10.dp))
            LineAction(Copy.otherOptions, onClick = {
                email = ""
                secret = ""
                problem = null
                showMail = false
            })
        } else {
            Door.entries.filter { it != Door.Email }.forEach { door ->
                LineAction("Continuar con ${door.label}", onClick = { finish(door) })
                Spacer(Modifier.height(10.dp))
            }
            FilledAction(Copy.continueEmail, onClick = { showMail = true })
        }
        Spacer(Modifier.height(18.dp))
        Text(Copy.termsNote, style = MaterialTheme.typography.bodyMedium, color = palette.muted)
        Spacer(Modifier.height(8.dp))
        LineAction(if (kind == GateKind.SignIn) Copy.create else Copy.haveEntry, onOther)
        if (onDeveloper != null) {
            Spacer(Modifier.height(28.dp))
            Hairline()
            Spacer(Modifier.height(20.dp))
            FilledAction(Copy.developer, onDeveloper, Modifier.testTag("developer-profile"))
            Spacer(Modifier.height(10.dp))
            Body(Copy.developerNote)
        }
        if (notice != null) {
            Spacer(Modifier.height(12.dp))
            Text(notice, color = palette.danger, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
