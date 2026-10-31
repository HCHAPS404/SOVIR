package app.sovir.android.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.sovir.android.R

@Composable
fun Mark(size: Dp = 28.dp) {
    val palette = LocalPalette.current
    Image(
        painter = painterResource(if (palette.dark) R.drawable.sovir_mark_paper else R.drawable.sovir_mark_ink),
        contentDescription = null,
        modifier = Modifier.size(size),
        contentScale = ContentScale.Fit,
    )
}

@Composable
fun BrandLockup(mark: Dp = 28.dp) {
    val palette = LocalPalette.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        Mark(mark)
        Spacer(Modifier.width(10.dp))
        Text(app.sovir.android.model.Copy.brand, style = MaterialTheme.typography.labelLarge, color = palette.ink)
    }
}

@Composable
fun Page(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp),
        content = content,
    )
}

@Composable
fun PageTitle(text: String) {
    val palette = LocalPalette.current
    Text(
        text,
        style = MaterialTheme.typography.headlineSmall,
        color = palette.ink,
        modifier = Modifier.semantics { heading() },
    )
}

@Composable
fun Kicker(text: String) {
    val palette = LocalPalette.current
    Text(text.uppercase(), style = MaterialTheme.typography.labelSmall, color = palette.muted)
}

@Composable
fun Body(text: String, emphasis: Boolean = false) {
    val palette = LocalPalette.current
    Text(
        text,
        style = MaterialTheme.typography.bodyLarge,
        color = if (emphasis) palette.ink else palette.muted,
        fontWeight = if (emphasis) FontWeight.Medium else FontWeight.Normal,
    )
}

@Composable
fun FilledAction(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    Button(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().heightIn(min = 48.dp),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
        colors = ButtonDefaults.buttonColors(containerColor = palette.ink, contentColor = palette.onInk),
    ) {
        Text(text, style = MaterialTheme.typography.bodyMedium, textAlign = androidx.compose.ui.text.style.TextAlign.Center, maxLines = 2)
    }
}

@Composable
fun LineAction(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().heightIn(min = 48.dp),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = palette.ink),
        border = androidx.compose.foundation.BorderStroke(1.dp, palette.line),
    ) {
        Text(text, style = MaterialTheme.typography.bodyMedium, textAlign = androidx.compose.ui.text.style.TextAlign.Center, maxLines = 2)
    }
}

@Composable
fun Fact(label: String, value: String, onClick: (() -> Unit)? = null) {
    val palette = LocalPalette.current
    val modifier = Modifier
        .fillMaxWidth()
        .heightIn(min = 52.dp)
        .clip(RectangleShape)
        .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
        .semantics(mergeDescendants = true) {}
        .padding(vertical = 8.dp)
    Column(Modifier.fillMaxWidth()) {
        Row(
            modifier,
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(label, style = MaterialTheme.typography.bodyLarge, color = palette.ink)
            Spacer(Modifier.width(16.dp))
            Text(value, style = MaterialTheme.typography.bodyMedium, color = palette.muted)
        }
        HorizontalDivider(color = palette.line, thickness = 1.dp)
    }
}

@Composable
fun Hairline() {
    HorizontalDivider(color = LocalPalette.current.line, thickness = 1.dp)
}
