package app.sovir.android.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.sovir.android.R
import app.sovir.android.model.DayBucket
import app.sovir.android.model.Tone

// Umbral expression for Compose: separation by 1dp rule, a surface is a
// change of paper (no shadow, no glow), radius 6dp, the symbol is the only
// figure. Status never relies on color alone — every dot sits next to text.

private val PanelShape = RoundedCornerShape(6.dp)
private val ButtonShape = RoundedCornerShape(6.dp)

@Composable
fun Mark(size: Dp = 28.dp) {
    val p = LocalPalette.current
    Image(
        painter = painterResource(if (p.dark) R.drawable.sovir_mark_paper else R.drawable.sovir_mark_ink),
        contentDescription = null,
        modifier = Modifier.size(size),
        contentScale = ContentScale.Fit,
    )
}

@Composable
fun BrandLockup(mark: Dp = 24.dp) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.semantics(mergeDescendants = true) {}) {
        Mark(mark)
        Spacer(Modifier.width(10.dp))
        Text("SOVIR", style = MaterialTheme.typography.titleSmall, color = LocalPalette.current.ink)
    }
}

/** Scrollable page body with the app's gutters. */
@Composable
fun ScreenScroll(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(top = 8.dp, bottom = 32.dp),
        content = content,
    )
}

@Composable
fun PageHeader(title: String, kicker: String? = null, kickerTone: Tone? = null, sub: String? = null) {
    val p = LocalPalette.current
    Column(Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 20.dp)) {
        if (kicker != null) {
            Kicker(kicker, kickerTone)
            Spacer(Modifier.height(8.dp))
        }
        Text(title, style = MaterialTheme.typography.displaySmall, color = p.ink, modifier = Modifier.semantics { heading() })
        if (sub != null) {
            Spacer(Modifier.height(8.dp))
            Text(sub, style = MaterialTheme.typography.bodyLarge, color = p.muted)
        }
    }
}

@Composable
fun Kicker(text: String, tone: Tone? = null) {
    val p = LocalPalette.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (tone != null) {
            Dot(tone)
            Spacer(Modifier.width(8.dp))
        }
        Text(text.uppercase(), style = MaterialTheme.typography.labelSmall, color = p.muted)
    }
}

@Composable
fun Dot(tone: Tone, size: Dp = 8.dp) {
    Box(Modifier.size(size).clip(CircleShape).background(LocalPalette.current.tone(tone)))
}

/** A glyph inside a soft tile — the identity block rows lead with. */
@Composable
fun GlyphTile(icon: ImageVector, tone: Tone = Tone.Unknown, size: Dp = 38.dp) {
    val p = LocalPalette.current
    Box(
        Modifier.size(size).clip(RoundedCornerShape(9.dp)).background(p.surface2),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = p.tone(tone), modifier = Modifier.size(20.dp))
    }
}

/**
 * The app's real icon from PackageManager — recognisability over decor:
 * people pair "the WhatsApp icon" with the app far faster than a label.
 * Fallback is a neutral tile when the package vanished.
 */
@Composable
fun AppIcon(pkg: String, size: Dp = 38.dp) {
    val p = LocalPalette.current
    val ctx = LocalContext.current
    val bmp = remember(pkg) {
        runCatching {
            val d = ctx.packageManager.getApplicationIcon(pkg)
            val b = android.graphics.Bitmap.createBitmap(96, 96, android.graphics.Bitmap.Config.ARGB_8888)
            val c = android.graphics.Canvas(b)
            d.setBounds(0, 0, 96, 96)
            d.draw(c)
            b.asImageBitmap()
        }.getOrNull()
    }
    if (bmp != null) {
        Image(bmp, contentDescription = null, modifier = Modifier.size(size).clip(RoundedCornerShape(9.dp)))
    } else {
        GlyphTile(Glyphs.apps, size = size)
    }
}

@Composable
fun Chip(text: String, tone: Tone, dot: Boolean = true) {
    val c = LocalPalette.current.tone(tone)
    Row(
        Modifier
            .border(1.dp, c, RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (dot) {
            Dot(tone, 6.dp)
            Spacer(Modifier.width(6.dp))
        }
        Text(text, style = MaterialTheme.typography.labelMedium, color = c, maxLines = 1)
    }
}

/** Epistemic label: observado / inferido / verificado / desconocido. */
@Composable
fun EvidenceTag(text: String, tone: Tone = Tone.Muted) {
    val p = LocalPalette.current
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = p.tone(tone),
        modifier = Modifier
            .border(1.dp, p.line, RoundedCornerShape(3.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

@Composable
fun Panel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val p = LocalPalette.current
    Column(
        modifier
            .fillMaxWidth()
            .clip(PanelShape)
            .background(p.surface)
            .border(1.dp, p.line, PanelShape)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        content = content,
    )
}

@Composable
fun PanelHead(title: String, kicker: String? = null, trailing: (@Composable () -> Unit)? = null) {
    val p = LocalPalette.current
    Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            if (kicker != null) {
                Kicker(kicker)
                Spacer(Modifier.height(4.dp))
            }
            Text(title, style = MaterialTheme.typography.titleMedium, color = p.ink, modifier = Modifier.semantics { heading() })
        }
        if (trailing != null) {
            Spacer(Modifier.width(12.dp))
            trailing()
        }
    }
}

@Composable
fun Gap(h: Dp = 12.dp) = Spacer(Modifier.height(h))

@Composable
fun Rule() = HorizontalDivider(color = LocalPalette.current.line, thickness = 1.dp)

/**
 * A list line: optional leading visual (glyph tile or real app icon — takes
 * precedence over the tone dot), title, sub, trailing meta. Tappable when
 * [onClick] is set.
 */
@Composable
fun Line(
    title: String,
    sub: String? = null,
    meta: String? = null,
    tone: Tone? = null,
    divider: Boolean = true,
    onClick: (() -> Unit)? = null,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    val p = LocalPalette.current
    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier)
                .semantics(mergeDescendants = true) {}
                .padding(vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (leading != null) {
                Box(Modifier.size(38.dp), contentAlignment = Alignment.Center) { leading() }
                Spacer(Modifier.width(12.dp))
            } else if (tone != null) {
                Dot(tone)
                Spacer(Modifier.width(12.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.bodyLarge, color = p.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (sub != null) {
                    Text(sub, style = MaterialTheme.typography.bodyMedium, color = p.muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
            if (meta != null) {
                Spacer(Modifier.width(12.dp))
                Text(meta, style = MaterialTheme.typography.bodySmall, color = p.muted, maxLines = 1)
            }
            if (trailing != null) {
                Spacer(Modifier.width(8.dp))
                trailing()
            }
            if (onClick != null) {
                Spacer(Modifier.width(4.dp))
                Icon(Glyphs.chevron, contentDescription = null, tint = p.muted, modifier = Modifier.size(18.dp))
            }
        }
        if (divider) Rule()
    }
}

/** Key / value fact row. */
@Composable
fun Fact(label: String, value: String, valueTone: Tone? = null, mono: Boolean = false, divider: Boolean = true) {
    val p = LocalPalette.current
    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 44.dp).padding(vertical = 8.dp).semantics(mergeDescendants = true) {},
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(label, style = MaterialTheme.typography.bodyMedium, color = p.muted, modifier = Modifier.weight(0.42f))
            Spacer(Modifier.width(12.dp))
            Text(
                value,
                style = if (mono) MaterialTheme.typography.labelSmall else MaterialTheme.typography.bodyMedium,
                color = valueTone?.let(p::tone) ?: p.ink,
                modifier = Modifier.weight(0.58f),
            )
        }
        if (divider) Rule()
    }
}

@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tone: Tone? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val p = LocalPalette.current
    val container = tone?.let(p::tone) ?: p.ink
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.fillMaxWidth().heightIn(min = 50.dp),
        shape = ButtonShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = container, contentColor = if (tone != null) Color.White else p.onInk,
            disabledContainerColor = p.surface2, disabledContentColor = p.muted,
        ),
    ) {
        if (loading) {
            CircularProgressIndicator(Modifier.size(16.dp), color = p.muted, strokeWidth = 2.dp)
            Spacer(Modifier.width(10.dp))
        }
        Text(text, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tone: Tone? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val p = LocalPalette.current
    val c = tone?.let(p::tone) ?: p.ink
    OutlinedButton(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.fillMaxWidth().heightIn(min = 50.dp),
        shape = ButtonShape,
        colors = ButtonDefaults.outlinedButtonColors(contentColor = c, disabledContentColor = p.muted),
        border = BorderStroke(1.dp, if (tone != null) c else p.line),
    ) {
        if (loading) {
            CircularProgressIndicator(Modifier.size(16.dp), color = p.muted, strokeWidth = 2.dp)
            Spacer(Modifier.width(10.dp))
        }
        Text(text, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
fun QuietAction(text: String, onClick: () -> Unit, tone: Tone? = null) {
    val p = LocalPalette.current
    TextButton(onClick = onClick, modifier = Modifier.heightIn(min = 48.dp)) {
        Text(text, style = MaterialTheme.typography.labelLarge, color = tone?.let(p::tone) ?: p.ink)
    }
}

enum class StateKind { Loading, Empty, Offline, Error, SignedOut }

/** Loading / empty / offline / error states — every screen uses one of these. */
@Composable
fun StateBlock(kind: StateKind, title: String, body: String, action: String? = null, onAction: (() -> Unit)? = null) {
    val p = LocalPalette.current
    val tone = when (kind) {
        StateKind.Loading, StateKind.Empty -> Tone.Unknown
        StateKind.Offline, StateKind.SignedOut -> Tone.Warning
        StateKind.Error -> Tone.Danger
    }
    Column(Modifier.fillMaxWidth().padding(vertical = 28.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (kind == StateKind.Loading) {
                CircularProgressIndicator(Modifier.size(14.dp), color = p.muted, strokeWidth = 2.dp)
            } else {
                Dot(tone)
            }
            Spacer(Modifier.width(10.dp))
            Text(title, style = MaterialTheme.typography.titleMedium, color = p.ink)
        }
        Gap(8.dp)
        Text(body, style = MaterialTheme.typography.bodyMedium, color = p.muted)
        if (action != null && onAction != null) {
            Gap(16.dp)
            SecondaryButton(action, onAction, Modifier.widthIn(max = 280.dp))
        }
    }
}

/** Horizontal bars with real counts, labelled — weight per threat class. */
@Composable
fun CategoryBars(items: List<Pair<String, Int>>) {
    val p = LocalPalette.current
    val max = (items.maxOfOrNull { it.second } ?: 1).coerceAtLeast(1)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items.forEach { (label, count) ->
            Column(Modifier.semantics(mergeDescendants = true) {}) {
                Row(Modifier.fillMaxWidth()) {
                    Text(label, style = MaterialTheme.typography.bodyMedium, color = p.ink, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.width(12.dp))
                    Text(count.toString(), style = MaterialTheme.typography.labelSmall, color = p.muted)
                }
                Gap(6.dp)
                Box(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(p.surface2)) {
                    Box(Modifier.fillMaxWidth(count / max.toFloat()).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(p.brand))
                }
            }
        }
    }
}

/** 7-day activity columns, today emphasised; zero days drawn as a stub. */
@Composable
fun WeekChart(buckets: List<DayBucket>, description: String) {
    val p = LocalPalette.current
    val max = (buckets.maxOfOrNull { it.count } ?: 1).coerceAtLeast(1)
    Row(
        Modifier.fillMaxWidth().height(112.dp).semantics(mergeDescendants = true) {
            this.contentDescription = description
        },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        buckets.forEach { b ->
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(if (b.count > 0) b.count.toString() else "", style = MaterialTheme.typography.labelSmall, color = p.muted)
                Gap(4.dp)
                val frac = if (b.count == 0) 0.06f else (0.18f + 0.82f * b.count / max)
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height((64 * frac).dp.coerceAtLeast(3.dp))
                        .clip(RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp))
                        .background(if (b.isToday) p.brand else if (b.count == 0) p.line else p.muted.copy(alpha = 0.55f)),
                )
                Gap(6.dp)
                Text(b.label, style = MaterialTheme.typography.labelMedium, color = if (b.isToday) p.ink else p.muted)
            }
        }
    }
}

/** Segmented single choice (theme, grant span, filters). */
@Composable
fun <T> Segmented(options: List<T>, selected: T, label: (T) -> String, onSelect: (T) -> Unit) {
    val p = LocalPalette.current
    Row(
        Modifier.fillMaxWidth().clip(ButtonShape).border(1.dp, p.line, ButtonShape).selectableGroup(),
    ) {
        options.forEachIndexed { i, o ->
            val on = o == selected
            Box(
                Modifier
                    .weight(1f)
                    .heightIn(min = 44.dp)
                    .background(if (on) p.surface2 else Color.Transparent)
                    .selectable(selected = on, role = Role.RadioButton, onClick = { onSelect(o) }),
                contentAlignment = Alignment.Center,
            ) {
                Text(label(o), style = MaterialTheme.typography.labelLarge, color = if (on) p.ink else p.muted, maxLines = 1)
            }
            if (i < options.lastIndex) Box(Modifier.width(1.dp).height(44.dp).background(p.line))
        }
    }
}

@Composable
fun ConfirmDialog(
    title: String,
    body: String,
    confirm: String,
    danger: Boolean,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val p = LocalPalette.current
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = p.surface,
        titleContentColor = p.ink,
        textContentColor = p.muted,
        shape = PanelShape,
        title = { Text(title, style = MaterialTheme.typography.titleLarge) },
        text = { Text(body, style = MaterialTheme.typography.bodyMedium) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(confirm, style = MaterialTheme.typography.labelLarge, color = if (danger) p.danger else p.ink)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancelar", style = MaterialTheme.typography.labelLarge, color = p.muted) }
        },
    )
}

/** Inline result line after an action (error in danger ink, success muted). */
@Composable
fun Notice(text: String?, tone: Tone = Tone.Danger) {
    if (text == null) return
    val p = LocalPalette.current
    Gap(10.dp)
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        color = p.tone(tone),
        // Polite live region: TalkBack announces the result without
        // interrupting — a form error that only paints is silent to AT.
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
    )
}

@Composable
fun serverFieldColors(p: SovPalette) = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
    focusedBorderColor = p.ink, unfocusedBorderColor = p.line, cursorColor = p.ink,
    focusedLabelColor = p.ink, unfocusedLabelColor = p.muted,
    focusedTextColor = p.ink, unfocusedTextColor = p.ink,
    focusedContainerColor = p.surface, unfocusedContainerColor = p.surface,
)
