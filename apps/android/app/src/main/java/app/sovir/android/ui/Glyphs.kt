package app.sovir.android.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

object Glyphs {
    val home = stroke("M4,11.2 L12,4.5 L20,11.2 V20 H4 Z")
    val link = stroke("M8,12 H16 M9,8.5 L5.5,12 L9,15.5 M15,8.5 L18.5,12 L15,15.5")
    val list = stroke("M7,5.5 H17 V18.5 H7 Z M9.5,9.5 H14.5 M9.5,12.5 H14.5 M9.5,15.5 H12.5")
    val org = stroke("M4,4 H11 V11 H4 Z M13,4 H20 V11 H13 Z M4,13 H11 V20 H4 Z M13,13 H20 V20 H13 Z")
    val person = stroke(
        "M12,4.8 C14.4,4.8 16.2,6.6 16.2,9 C16.2,11.4 14.4,13.2 12,13.2 C9.6,13.2 7.8,11.4 7.8,9 C7.8,6.6 9.6,4.8 12,4.8 Z " +
            "M6.2,19.2 C6.6,16.2 9,14.6 12,14.6 C15,14.6 17.4,16.2 17.8,19.2",
    )
    val back = stroke("M15,6 L9,12 L15,18")

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
