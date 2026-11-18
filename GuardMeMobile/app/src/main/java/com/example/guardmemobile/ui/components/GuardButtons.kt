package com.example.guardmemobile.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.guardmemobile.ui.a11y.rememberReducedMotion
import com.example.guardmemobile.ui.theme.Atkinson
import com.example.guardmemobile.ui.theme.Body
import com.example.guardmemobile.ui.theme.ButtonPerson
import com.example.guardmemobile.ui.theme.GuardColor
import com.example.guardmemobile.ui.theme.GuardMeMobileTheme
import com.example.guardmemobile.ui.theme.darken

enum class FillKind { Care, Emergency, Ok, Navy }

@Composable
fun GuardPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    kind: FillKind = FillKind.Care,
    height: Dp = 64.dp,
    radius: Dp = 24.dp,
    textStyle: TextStyle = ButtonPerson,
    subtitle: String? = null,
    icon: (@Composable () -> Unit)? = null,
    stacked: Boolean = false,
    enabled: Boolean = true,
    loading: Boolean = false,
    loadingLabel: String = "Llamando…",
    containerColor: Color? = null,
    contentColor: Color = GuardColor.White,
    contentDescription: String? = null,
) {
    val background = containerColor ?: when (kind) {
        FillKind.Care -> GuardColor.Brown
        FillKind.Emergency -> GuardColor.Emergency
        FillKind.Ok -> GuardColor.Ok
        FillKind.Navy -> GuardColor.Navy
    }
    val label = if (loading) loadingLabel else text
    PressableSurface(
        onClick = onClick,
        modifier = modifier.heightIn(min = height),
        background = background,
        radius = radius,
        enabled = enabled && !loading,
        contentDescription = contentDescription,
    ) {
        if (loading) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(
                    modifier = Modifier.size(22.dp),
                    color = contentColor,
                    strokeWidth = 2.dp,
                )
                Spacer(Modifier.width(10.dp))
                ButtonLabel(label, textStyle, contentColor)
            }
        } else if (stacked) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                icon?.invoke()
                if (icon != null) Spacer(Modifier.size(8.dp))
                ButtonLabel(label, textStyle, contentColor)
                if (subtitle != null) {
                    androidx.compose.material3.Text(
                        text = subtitle,
                        color = GuardColor.White,
                        style = Body,
                        textAlign = TextAlign.Center,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                icon?.invoke()
                if (icon != null) Spacer(Modifier.width(8.dp))
                ButtonLabel(label, textStyle, contentColor)
            }
        }
    }
}

@Composable
fun GuardOutlineButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    height: Dp = 64.dp,
    borderColor: Color = GuardColor.Caramel,
    textColor: Color = GuardColor.Navy,
    background: Color = GuardColor.White,
    icon: (@Composable () -> Unit)? = null,
    textStyle: TextStyle = Body.copy(fontFamily = com.example.guardmemobile.ui.theme.Figtree, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, fontSize = 19.sp),
    enabled: Boolean = true,
    contentDescription: String? = null,
) {
    PressableSurface(
        onClick = onClick,
        modifier = modifier.heightIn(min = height),
        background = background,
        radius = 20.dp,
        enabled = enabled,
        borderColor = borderColor,
        borderWidth = 2.dp,
        contentDescription = contentDescription,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            icon?.invoke()
            if (icon != null) Spacer(Modifier.width(8.dp))
            ButtonLabel(text, textStyle, textColor)
        }
    }
}

@Composable
fun GuardDashedButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    height: Dp = 56.dp,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val reduced = rememberReducedMotion()
    val scale by animateFloatAsState(
        targetValue = if (pressed && !reduced) 0.98f else 1f,
        animationSpec = tween(if (reduced) 0 else 120),
        label = "dashed-press",
    )
    val shape = RoundedCornerShape(20.dp)
    Box(
        modifier
            .fillMaxWidth()
            .heightIn(min = height)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .clip(shape)
            .drawBehind {
                val stroke = Stroke(
                    width = 2.dp.toPx(),
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(14f, 10f)),
                )
                drawRoundRect(
                    color = GuardColor.Caramel,
                    style = stroke,
                    cornerRadius = CornerRadius(20.dp.toPx(), 20.dp.toPx()),
                    topLeft = Offset(1.dp.toPx(), 1.dp.toPx()),
                    size = Size(size.width - 2.dp.toPx(), size.height - 2.dp.toPx()),
                )
            }
            .clickable(
                interactionSource = interaction,
                indication = ripple(color = GuardColor.Brown.copy(alpha = 0.12f)),
                onClick = onClick,
            )
            .padding(horizontal = 16.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        ButtonLabel(text, Body.copy(color = GuardColor.BrownDark, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), GuardColor.BrownDark)
    }
}

@Composable
fun GuardTextAction(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    color: Color = GuardColor.DangerText,
) {
    androidx.compose.material3.Text(
        text = text,
        color = color,
        style = Body,
        textAlign = TextAlign.Center,
        textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline,
        modifier = modifier
            .clickable(role = Role.Button, onClick = onClick)
            .padding(vertical = 12.dp),
    )
}

@Composable
private fun PressableSurface(
    onClick: () -> Unit,
    modifier: Modifier,
    background: Color,
    radius: Dp,
    enabled: Boolean,
    borderColor: Color? = null,
    borderWidth: Dp = 0.dp,
    contentDescription: String? = null,
    content: @Composable () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val reduced = rememberReducedMotion()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled && !reduced) 0.98f else 1f,
        animationSpec = tween(if (reduced) 0 else 120),
        label = "press",
    )
    val fill = if (pressed && enabled) background.darken() else background
    val shape = RoundedCornerShape(radius)
    Box(
        modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                alpha = if (enabled) 1f else 0.4f
            }
            .clip(shape)
            .background(fill)
            .then(
                if (borderColor != null) Modifier.border(borderWidth, borderColor, shape) else Modifier,
            )
            .clickable(
                interactionSource = interaction,
                indication = ripple(color = Color.White.copy(alpha = 0.28f)),
                enabled = enabled,
                onClick = onClick,
            )
            .semantics {
                role = Role.Button
                if (contentDescription != null) this.contentDescription = contentDescription
            }
            .padding(horizontal = 16.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        content()
    }
}

@Composable
private fun ButtonLabel(text: String, style: TextStyle, color: Color) {
    androidx.compose.material3.Text(
        text = text,
        color = color,
        style = style,
        textAlign = TextAlign.Center,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
    )
}

@Preview(showBackground = true)
@Composable
private fun GuardPrimaryButtonPreview() {
    GuardMeMobileTheme {
        GuardPrimaryButton(
            text = "Botón Principal",
            onClick = {},
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun GuardOutlineButtonPreview() {
    GuardMeMobileTheme {
        GuardOutlineButton(
            text = "Botón Secundario",
            onClick = {},
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun GuardDashedButtonPreview() {
    GuardMeMobileTheme {
        GuardDashedButton(
            text = "Botón Punteado",
            onClick = {},
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun GuardTextActionPreview() {
    GuardMeMobileTheme {
        GuardTextAction(
            text = "Acción de texto",
            onClick = {},
        )
    }
}
