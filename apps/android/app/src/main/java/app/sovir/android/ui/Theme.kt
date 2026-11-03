@file:OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)

package app.sovir.android.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.drawable.ColorDrawable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import app.sovir.android.R
import app.sovir.android.model.ThemeChoice
import app.sovir.android.model.Tone

// Umbral tokens — mirrors packages/ui-web/src/tokens.css (console values).
// Bronze is brand only; success / warning / danger / unknown are their
// own inks and never borrow it.
data class SovPalette(
    val canvas: Color,
    val surface: Color,
    val surface2: Color,
    val ink: Color,
    val muted: Color,
    val line: Color,
    val brand: Color,
    val success: Color,
    val warning: Color,
    val danger: Color,
    val unknown: Color,
    val onInk: Color,
    val dark: Boolean,
) {
    fun tone(t: Tone): Color = when (t) {
        Tone.Success -> success
        Tone.Warning -> warning
        Tone.Danger -> danger
        Tone.Unknown -> unknown
        Tone.Brand -> brand
        Tone.Muted -> muted
    }
}

private val Light = SovPalette(
    canvas = Color(0xFFF4F0E6), surface = Color(0xFFFBF7F0), surface2 = Color(0xFFEFE9DC),
    ink = Color(0xFF1A1714), muted = Color(0xFF5E584E), line = Color(0xFFD8D0C3),
    brand = Color(0xFF7A5B3A), success = Color(0xFF1A6840), warning = Color(0xFF8A5610),
    danger = Color(0xFF8C2E2A), unknown = Color(0xFF4E5964), onInk = Color(0xFFF4F0E6), dark = false,
)

private val Dark = SovPalette(
    canvas = Color(0xFF090908), surface = Color(0xFF141311), surface2 = Color(0xFF1C1A17),
    ink = Color(0xFFF4F0E6), muted = Color(0xFFA89F93), line = Color(0xFF2C2924),
    brand = Color(0xFFD4B48A), success = Color(0xFF7FD1A6), warning = Color(0xFFEAB66A),
    danger = Color(0xFFF09890), unknown = Color(0xFF9FB0BF), onInk = Color(0xFF090908), dark = true,
)

val LocalPalette = staticCompositionLocalOf { Light }

private val Outfit = FontFamily(
    Font(R.font.outfit, weight = FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.weight(500))),
)
private val Newsreader = FontFamily(
    Font(
        R.font.newsreader,
        weight = FontWeight.Medium,
        variationSettings = FontVariation.Settings(FontVariation.weight(520), FontVariation.Setting("opsz", 36f)),
    ),
)
private val SourceSans = FontFamily(
    Font(R.font.source_sans_3, weight = FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
    Font(R.font.source_sans_3, weight = FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.weight(560))),
    Font(R.font.source_sans_3, weight = FontWeight.SemiBold, variationSettings = FontVariation.Settings(FontVariation.weight(640))),
)
private val Plex = FontFamily(Font(R.font.ibm_plex_mono_regular, weight = FontWeight.Normal))

// Mobile scale: Newsreader only for page titles and figures; Source Sans
// for everything operational; Plex Mono only for short evidence labels.
private val SovTypography = Typography(
    displaySmall = TextStyle(fontFamily = Newsreader, fontWeight = FontWeight.Medium, fontSize = 30.sp, lineHeight = 36.sp, letterSpacing = (-0.2).sp),
    headlineSmall = TextStyle(fontFamily = Newsreader, fontWeight = FontWeight.Medium, fontSize = 24.sp, lineHeight = 30.sp),
    titleLarge = TextStyle(fontFamily = Newsreader, fontWeight = FontWeight.Medium, fontSize = 21.sp, lineHeight = 27.sp),
    titleMedium = TextStyle(fontFamily = SourceSans, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp),
    titleSmall = TextStyle(fontFamily = Outfit, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 18.sp, letterSpacing = 2.2.sp),
    bodyLarge = TextStyle(fontFamily = SourceSans, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = SourceSans, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontFamily = SourceSans, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 18.sp),
    labelLarge = TextStyle(fontFamily = SourceSans, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontFamily = SourceSans, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp),
    labelSmall = TextStyle(fontFamily = Plex, fontWeight = FontWeight.Normal, fontSize = 11.sp, lineHeight = 14.sp, letterSpacing = 0.6.sp),
)

@Composable
fun SovTheme(choice: ThemeChoice, content: @Composable () -> Unit) {
    val dark = when (choice) {
        ThemeChoice.Light -> false
        ThemeChoice.Dark -> true
        ThemeChoice.System -> isSystemInDarkTheme()
    }
    val p = if (dark) Dark else Light
    val base = if (dark) darkColorScheme() else lightColorScheme()
    val scheme = base.copy(
        background = p.canvas, onBackground = p.ink,
        surface = p.canvas, onSurface = p.ink,
        surfaceVariant = p.surface2, onSurfaceVariant = p.muted,
        surfaceContainer = p.surface, surfaceContainerHigh = p.surface, surfaceContainerLow = p.surface,
        surfaceContainerHighest = p.surface2,
        primary = p.ink, onPrimary = p.onInk,
        secondaryContainer = p.surface2, onSecondaryContainer = p.ink,
        outline = p.line, outlineVariant = p.line,
        error = p.danger, onError = p.onInk,
    )
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = view.context.findActivity()?.window ?: return@SideEffect
            window.setBackgroundDrawable(ColorDrawable(p.canvas.toArgb()))
            val controller = WindowCompat.getInsetsController(window, view)
            controller.isAppearanceLightStatusBars = !dark
            controller.isAppearanceLightNavigationBars = !dark
        }
    }
    CompositionLocalProvider(LocalPalette provides p) {
        MaterialTheme(colorScheme = scheme, typography = SovTypography, content = content)
    }
}

private fun Context.findActivity(): Activity? {
    var current: Context = this
    while (current is ContextWrapper) {
        if (current is Activity) return current
        current = current.baseContext
    }
    return null
}
