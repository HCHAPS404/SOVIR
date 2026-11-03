package app.sovir.android.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

// Line glyphs at 1.6 stroke, same weight as the console rail icons.
// Navigation and affordance only — never decorative.
object Glyphs {
    val home = stroke("M4,11.2 L12,4.5 L20,11.2 V20 H4 Z")
    val bell = stroke("M6.5,16.5 V11 C6.5,7.9 8.9,5.5 12,5.5 C15.1,5.5 17.5,7.9 17.5,11 V16.5 L19,18 H5 Z M10,20.2 C10.5,21 11.2,21.3 12,21.3 C12.8,21.3 13.5,21 14,20.2")
    val pulse = stroke("M3.5,12.5 H7.5 L9.5,7 L13,18 L15.5,10.5 L17,12.5 H20.5")
    val sliders = stroke("M5,7 H13 M17,7 H19 M15,5 V9 M5,17 H7 M11,17 H19 M9,15 V19 M5,12 H19")
    val person = stroke(
        "M12,4.8 C14.4,4.8 16.2,6.6 16.2,9 C16.2,11.4 14.4,13.2 12,13.2 C9.6,13.2 7.8,11.4 7.8,9 C7.8,6.6 9.6,4.8 12,4.8 Z " +
            "M6.2,19.2 C6.6,16.2 9,14.6 12,14.6 C15,14.6 17.4,16.2 17.8,19.2",
    )
    val back = stroke("M15,6 L9,12 L15,18")
    val chevron = stroke("M10,7 L15,12 L10,17")
    val external = stroke("M13.5,5.5 H18.5 V10.5 M18.5,5.5 L11,13 M16.5,14 V18.5 H5.5 V7.5 H10")
    val eye = stroke("M3,12 C5.2,8 8.4,6 12,6 C15.6,6 18.8,8 21,12 C18.8,16 15.6,18 12,18 C8.4,18 5.2,16 3,12 Z M12,9.5 C13.4,9.5 14.5,10.6 14.5,12 C14.5,13.4 13.4,14.5 12,14.5 C10.6,14.5 9.5,13.4 9.5,12 C9.5,10.6 10.6,9.5 12,9.5 Z")
    val eyeOff = stroke("M4,4 L20,20 M10.6,6.1 C11.1,6 11.5,6 12,6 C15.6,6 18.8,8 21,12 C20.3,13.3 19.4,14.4 18.4,15.3 M14.1,14.2 C13.6,14.7 12.8,15 12,15 C10.3,15 9,13.7 9,12 C9,11.2 9.3,10.4 9.8,9.9 M6.4,7.7 C5,8.7 3.9,10.2 3,12 C5.2,16 8.4,18 12,18 C13.6,18 15.1,17.6 16.4,16.9")

    private fun stroke(path: String): ImageVector {
        val nodes = PathParser().parsePathString(path).toNodes()
        return ImageVector.Builder(
            name = "glyph",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply {
            addPath(
                pathData = nodes,
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 1.6f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }.build()
    }
}
