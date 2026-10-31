package app.sovir.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.sovir.android.data.DataStoreSession
import app.sovir.android.model.Copy
import app.sovir.android.model.GateKind
import app.sovir.android.model.LocalState
import app.sovir.android.model.SessionRepository
import app.sovir.android.model.SourceId
import app.sovir.android.ui.AccessScreen
import app.sovir.android.ui.IndexPage
import app.sovir.android.ui.LinksPage
import app.sovir.android.ui.NoticesPage
import app.sovir.android.ui.SheetPage
import app.sovir.android.ui.WidgetPage
import app.sovir.android.model.Sheets
import app.sovir.android.ui.LinkDetailPage
import app.sovir.android.ui.PermissionsPage
import app.sovir.android.ui.ShellScreen
import app.sovir.android.ui.SovTheme
import app.sovir.android.ui.StatusScreen
import app.sovir.android.ui.WelcomeScreen
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val context = LocalContext.current
            val repo = remember { DataStoreSession(context.applicationContext) }
            SovRoot(repo)
        }
    }
}

private object Routes {
    const val Welcome = "welcome"
    const val SignIn = "sign-in"
    const val Register = "register"
    const val Shell = "shell"
    const val Link = "link/{id}"
    const val Permissions = "permissions"
    const val Section = "section/{id}"
    const val Connections = "connections"
    fun link(id: SourceId) = "link/${id.name}"
    fun section(id: String) = "section/$id"
}

@Composable
private fun SovRoot(repo: SessionRepository) {
    val state by repo.state.collectAsStateWithLifecycle(LocalState())
    SovTheme(state.theme) {
        when {
            !state.ready -> StatusScreen(Copy.loading)
            state.failed -> StatusScreen(Copy.loadFailed)
            else -> AppNav(repo, state.demo)
        }
    }
}

@Composable
private fun AppNav(repo: SessionRepository, demo: Boolean) {
    val nav = rememberNavController()
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val state by repo.state.collectAsStateWithLifecycle(LocalState(ready = true))
    var noteFailed by remember { mutableStateOf(false) }
    var sessionFailed by remember { mutableStateOf(false) }
    val wide = LocalConfiguration.current.screenWidthDp >= 600

    NavHost(
        navController = nav,
        startDestination = if (demo) Routes.Shell else Routes.Welcome,
        modifier = Modifier.fillMaxSize(),
    ) {
        composable(Routes.Welcome) {
            WelcomeScreen(
                onSignIn = { nav.navigate(Routes.SignIn) },
                onRegister = { nav.navigate(Routes.Register) },
            )
        }
        composable(Routes.SignIn) {
            AccessScreen(
                kind = GateKind.SignIn,
                notice = if (sessionFailed) Copy.saveFailed else null,
                onOther = { nav.navigate(Routes.Register) },
                onDeveloper = {
                    scope.launch {
                        sessionFailed = false
                        if (repo.setDemo(true)) {
                            nav.navigate(Routes.Shell) {
                                popUpTo(Routes.Welcome) { inclusive = true }
                                launchSingleTop = true
                            }
                        } else {
                            sessionFailed = true
                        }
                    }
                },
            )
        }
        composable(Routes.Register) {
            AccessScreen(
                kind = GateKind.Register,
                onOther = {
                    nav.navigate(Routes.SignIn) {
                        popUpTo(Routes.Welcome)
                        launchSingleTop = true
                    }
                },
            )
        }
        composable(Routes.Shell) {
            ShellScreen(
                state = state,
                wide = wide,
                scope = scope,
                repo = repo,
                onOpenLink = { nav.navigate(Routes.link(it)) },
                onOpenSection = { id ->
                    when (id) {
                        "inicio" -> Unit
                        "conexiones" -> nav.navigate(Routes.Connections)
                        else -> nav.navigate(Routes.section(id))
                    }
                },
                onOpenPermissions = { nav.navigate(Routes.Permissions) },
                onClose = {
                    scope.launch {
                        sessionFailed = false
                        if (repo.setDemo(false)) {
                            nav.navigate(Routes.Welcome) {
                                popUpTo(Routes.Shell) { inclusive = true }
                                launchSingleTop = true
                            }
                        } else {
                            sessionFailed = true
                        }
                    }
                },
                notice = if (sessionFailed) Copy.saveFailed else null,
                onSaveFailed = { sessionFailed = true },
            )
        }
        composable(
            route = Routes.Link,
            arguments = listOf(navArgument("id") { type = NavType.StringType }),
        ) { entry ->
            val id = entry.arguments?.getString("id")?.let { runCatching { SourceId.valueOf(it) }.getOrNull() }
            if (id == null) {
                StatusScreen(Copy.loadFailed)
            } else {
                LinkDetailPage(
                    id = id,
                    marked = id in state.pending,
                    noteFailed = noteFailed,
                    onToggle = {
                        scope.launch { noteFailed = !repo.togglePending(id) }
                    },
                    onBack = { nav.popBackStack() },
                )
            }
        }
        composable(Routes.Permissions) {
            PermissionsPage(onBack = { nav.popBackStack() })
        }
        composable(Routes.Connections) {
            LinksPage(state, onOpenLink = { nav.navigate(Routes.link(it)) }, onBack = { nav.popBackStack() })
        }
        composable(
            route = Routes.Section,
            arguments = listOf(navArgument("id") { type = NavType.StringType }),
        ) { entry ->
            val id = entry.arguments?.getString("id").orEmpty()
            when (id) {
                "notificaciones" -> NoticesPage()
                "widgets" -> WidgetPage()
                else -> {
                    val sheet = Sheets.find(id, "Este teléfono")
                    if (sheet == null) StatusScreen(Copy.loadFailed)
                    else SheetPage(sheet) { next ->
                        when (next) {
                            "inicio" -> nav.popBackStack(Routes.Shell, false)
                            "conexiones" -> nav.navigate(Routes.Connections)
                            else -> nav.navigate(Routes.section(next))
                        }
                    }
                }
            }
        }
    }
}
