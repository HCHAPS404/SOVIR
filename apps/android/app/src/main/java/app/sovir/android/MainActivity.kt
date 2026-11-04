package app.sovir.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.sovir.android.data.Auth
import app.sovir.android.data.PhoneLink
import app.sovir.android.data.UiPreferences
import app.sovir.android.model.ThemeChoice
import app.sovir.android.observer.AlertSync
import app.sovir.android.observer.Notifier
import app.sovir.android.ui.AlertDetailScreen
import app.sovir.android.ui.AppModel
import app.sovir.android.ui.CenterStatus
import app.sovir.android.ui.EventDetailScreen
import app.sovir.android.ui.RegisterScreen
import app.sovir.android.ui.ShellScreen
import app.sovir.android.ui.SignInScreen
import app.sovir.android.ui.SovTheme
import app.sovir.android.ui.Sync
import app.sovir.android.ui.Tab
import app.sovir.android.ui.WelcomeScreen
import app.sovir.android.ui.resumeTick
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    /** Where a notification asked us to go ("alerts" | "event:<id>"). */
    private var openTarget by mutableStateOf<String?>(null)
    /** Authorization code returned by the browser registration flow. */
    private var oauthCode by mutableStateOf<String?>(null)
    private var oauthError by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Auth.init(this)
        PhoneLink.init(this)
        app.sovir.android.data.AppExclusions.init(this)
        app.sovir.android.ui.SetupPrefs.init(this)
        Notifier.ensureChannels(this)
        enableEdgeToEdge()
        readIntent(intent)
        val prefs = UiPreferences(applicationContext)
        setContent {
            val theme by prefs.theme.collectAsStateWithLifecycle(ThemeChoice.System)
            val scope = rememberCoroutineScope()
            SovTheme(theme) {
                SovRoot(theme, onTheme = { scope.launch { prefs.setTheme(it) } })
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        readIntent(intent)
    }

    private fun readIntent(i: Intent?) {
        i?.getStringExtra(Notifier.EXTRA_OPEN)?.let { openTarget = it }
        val data = i?.data
        if (data?.scheme == "app.sovir.android" && data.host == "oauth") {
            val code = data.getQueryParameter("code")
            if (code != null) oauthCode = code
            else oauthError = data.getQueryParameter("error_description") ?: "El registro no se completó."
        }
    }

    private object Routes {
        const val Welcome = "welcome"
        const val SignIn = "sign-in"
        const val Register = "register"
        const val Completing = "completing"
        const val App = "app"
        const val Setup = "setup"
        const val Alert = "alert/{id}"
        const val Event = "event/{id}"
        fun alert(id: String) = "alert/$id"
        fun event(id: String) = "event/$id"
    }

    @Composable
    private fun SovRoot(theme: ThemeChoice, onTheme: (ThemeChoice) -> Unit) {
        val nav = rememberNavController()
        val scope = rememberCoroutineScope()
        val signedIn by Auth.signedIn.collectAsStateWithLifecycle()
        val model = remember { AppModel(scope) }

        fun enterApp() = nav.navigate(Routes.App) {
            popUpTo(0) { inclusive = true }
            launchSingleTop = true
        }

        // Browser registration round trip → exchange the code for a session.
        LaunchedEffect(oauthCode) {
            val code = oauthCode ?: return@LaunchedEffect
            oauthCode = null
            nav.navigate(Routes.Completing) { launchSingleTop = true }
            val r = withContext(Dispatchers.IO) { Auth.exchangeCode(code) }
            if (r == Auth.Result.Ok) {
                enterApp()
            } else {
                oauthError = "No pudimos completar el inicio de sesión tras el registro. Inicia sesión con tu nueva cuenta."
                nav.navigate(Routes.SignIn) { popUpTo(Routes.Welcome) }
            }
        }

        LaunchedEffect(signedIn) {
            if (signedIn) AlertSync.schedule(applicationContext)
        }

        // Session died server-side (refresh rejected) → back to the door.
        LaunchedEffect(model.sync, signedIn) {
            if (model.sync == Sync.SignedOut && !signedIn) {
                nav.navigate(Routes.Welcome) { popUpTo(0) { inclusive = true } }
            }
        }

        NavHost(
            navController = nav,
            startDestination = if (signedIn) Routes.App else Routes.Welcome,
            modifier = Modifier.fillMaxSize(),
        ) {
            composable(Routes.Welcome) {
                WelcomeScreen(onSignIn = { nav.navigate(Routes.SignIn) }, onRegister = { nav.navigate(Routes.Register) })
            }
            composable(Routes.SignIn) {
                SignInScreen(
                    onBack = { nav.popBackStack() },
                    onRegister = { nav.navigate(Routes.Register) { popUpTo(Routes.Welcome) } },
                    onSignedIn = ::enterApp,
                )
            }
            composable(Routes.Register) {
                RegisterScreen(
                    onBack = { nav.popBackStack() },
                    onHaveAccount = { nav.navigate(Routes.SignIn) { popUpTo(Routes.Welcome) } },
                    pendingError = oauthError,
                )
            }
            composable(Routes.Completing) {
                CenterStatus("Completando el registro", "Creando tu sesión con el servidor de identidad.")
            }
            composable(Routes.App) {
                val tick = resumeTick()
                LaunchedEffect(tick) { model.refresh() }
                // First sign-in on this phone: walk the permissions once, then never again.
                LaunchedEffect(Unit) {
                    if (!app.sovir.android.ui.SetupPrefs.done()) {
                        if (app.sovir.android.ui.SetupPrefs.needed(applicationContext)) {
                            nav.navigate(Routes.Setup) { launchSingleTop = true }
                        } else {
                            app.sovir.android.ui.SetupPrefs.markDone()
                        }
                    }
                }
                RouteFromNotification(nav)
                ShellScreen(
                    model = model,
                    requestedTab = if (openTarget == "alerts") Tab.Alerts else null,
                    theme = theme,
                    onTheme = onTheme,
                    onOpenAlert = { nav.navigate(Routes.alert(it)) },
                    onOpenEvent = { nav.navigate(Routes.event(it)) },
                    onSignedOut = {
                        PhoneLink.forgetDevice()
                        nav.navigate(Routes.Welcome) { popUpTo(0) { inclusive = true } }
                    },
                )
            }
            composable(Routes.Setup) {
                app.sovir.android.ui.SetupScreen(
                    model,
                    onDone = {
                        app.sovir.android.ui.SetupPrefs.markDone()
                        nav.popBackStack()
                    },
                )
            }
            composable(Routes.Alert, arguments = listOf(navArgument("id") { type = NavType.StringType })) { e ->
                AlertDetailScreen(
                    model, e.arguments?.getString("id").orEmpty(),
                    onBack = { nav.popBackStack() },
                    onOpenEvent = { nav.navigate(Routes.event(it)) },
                )
            }
            composable(Routes.Event, arguments = listOf(navArgument("id") { type = NavType.StringType })) { e ->
                EventDetailScreen(
                    model, e.arguments?.getString("id").orEmpty(),
                    onBack = { nav.popBackStack() },
                    onOpenAlert = { nav.navigate(Routes.alert(it)) },
                )
            }
        }
    }

    @Composable
    private fun RouteFromNotification(nav: NavHostController) {
        LaunchedEffect(openTarget) {
            val t = openTarget ?: return@LaunchedEffect
            if (t.startsWith("event:")) {
                openTarget = null
                nav.navigate(Routes.event(t.removePrefix("event:")))
            } else if (t == "alerts") {
                // ShellScreen picked it up as the initial tab; clear for next time.
                openTarget = null
            }
        }
    }
}
