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

private val CanvasLight = Color(0xFFF4F0E6)
private val SurfaceLight = Color(0xFFFBF7F0)
private val InkLight = Color(0xFF1A1714)
private val MutedLight = Color(0xFF5E584E)
private val LineLight = Color(0xFFD8D0C3)
private val BrandLight = Color(0xFF7A5B3A)
private val DangerLight = Color(0xFF8C2E2A)

private val CanvasDark = Color(0xFF000000)
private val SurfaceDark = Color(0xFF1E1C19)
private val InkDark = Color(0xFFF4F0E6)
private val MutedDark = Color(0xFFC4BBAE)
private val LineDark = Color(0xFF3C3832)
private val BrandDark = Color(0xFFD4B48A)
private val DangerDark = Color(0xFFF0B2AC)

data class SovPalette(
    val canvas: Color,
    val surface: Color,
    val ink: Color,
    val muted: Color,
    val line: Color,
    val brand: Color,
    val danger: Color,
    val onInk: Color,
    val dark: Boolean,
)

private val LightPalette = SovPalette(CanvasLight, SurfaceLight, InkLight, MutedLight, LineLight, BrandLight, DangerLight, CanvasLight, false)
private val DarkPalette = SovPalette(CanvasDark, SurfaceDark, InkDark, MutedDark, LineDark, BrandDark, DangerDark, CanvasDark, true)

val LocalPalette = staticCompositionLocalOf { LightPalette }

private val Outfit = FontFamily(
    Font(R.font.outfit, weight = FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.weight(500))),
)
private val Newsreader = FontFamily(
    Font(
        R.font.newsreader,
        weight = FontWeight.Normal,
        variationSettings = FontVariation.Settings(FontVariation.weight(460), FontVariation.Setting("opsz", 32f)),
    ),
    Font(
        R.font.newsreader,
        weight = FontWeight.Medium,
        variationSettings = FontVariation.Settings(FontVariation.weight(560), FontVariation.Setting("opsz", 36f)),
    ),
)
private val SourceSans = FontFamily(
    Font(R.font.source_sans_3, weight = FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
    Font(R.font.source_sans_3, weight = FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.weight(560))),
)
private val Plex = FontFamily(Font(R.font.ibm_plex_mono_regular, weight = FontWeight.Normal))

private val SovTypography = Typography(
    displaySmall = TextStyle(fontFamily = Newsreader, fontWeight = FontWeight.Medium, fontSize = 34.sp, lineHeight = 40.sp),
    headlineSmall = TextStyle(fontFamily = Newsreader, fontWeight = FontWeight.Medium, fontSize = 28.sp, lineHeight = 34.sp),
    titleLarge = TextStyle(fontFamily = Newsreader, fontWeight = FontWeight.Medium, fontSize = 22.sp, lineHeight = 28.sp),
    bodyLarge = TextStyle(fontFamily = SourceSans, fontWeight = FontWeight.Normal, fontSize = 17.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = SourceSans, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 22.sp),
    labelLarge = TextStyle(fontFamily = Outfit, fontWeight = FontWeight.Medium, fontSize = 16.sp, lineHeight = 20.sp),
    labelSmall = TextStyle(fontFamily = Plex, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = 0.6.sp),
)

@Composable
fun SovTheme(choice: ThemeChoice, content: @Composable () -> Unit) {
    val dark = when (choice) {
        ThemeChoice.Light -> false
        ThemeChoice.Dark -> true
        ThemeChoice.System -> isSystemInDarkTheme()
    }
    val palette = if (dark) DarkPalette else LightPalette
    val scheme = if (dark) {
        darkColorScheme(
            background = palette.canvas,
            surface = palette.surface,
            onBackground = palette.ink,
            onSurface = palette.ink,
            primary = palette.ink,
            onPrimary = palette.onInk,
            outline = palette.line,
            error = palette.danger,
        )
    } else {
        lightColorScheme(
            background = palette.canvas,
            surface = palette.surface,
            onBackground = palette.ink,
            onSurface = palette.ink,
            primary = palette.ink,
            onPrimary = palette.onInk,
            outline = palette.line,
            error = palette.danger,
        )
    }
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = view.context.findActivity()?.window ?: return@SideEffect
            window.setBackgroundDrawable(ColorDrawable(palette.canvas.toArgb()))
            val controller = WindowCompat.getInsetsController(window, view)
            controller.isAppearanceLightStatusBars = !dark
            controller.isAppearanceLightNavigationBars = !dark
        }
    }
    CompositionLocalProvider(LocalPalette provides palette) {
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
