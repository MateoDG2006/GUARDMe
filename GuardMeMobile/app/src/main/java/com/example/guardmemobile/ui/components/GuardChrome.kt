package com.example.guardmemobile.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.dialog
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.guardmemobile.ui.a11y.rememberReducedMotion
import com.example.guardmemobile.ui.theme.Atkinson
import com.example.guardmemobile.ui.theme.Body
import com.example.guardmemobile.ui.theme.Figtree
import com.example.guardmemobile.ui.theme.GuardColor
import com.example.guardmemobile.ui.theme.batteryFill

data class GuardTab(
    val label: String,
    val icon: Glyph,
    val selected: Boolean,
    val onClick: () -> Unit,
)

@Composable
fun GuardWordmark(modifier: Modifier = Modifier, size: androidx.compose.ui.unit.TextUnit = 26.sp) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = "Guard",
            color = GuardColor.Navy,
            fontFamily = Figtree,
            fontWeight = FontWeight.ExtraBold,
            fontSize = size,
        )
        Text(
            text = "Me",
            color = GuardColor.MeAccent,
            fontFamily = Figtree,
            fontWeight = FontWeight.ExtraBold,
            fontSize = size,
        )
    }
}

@Composable
fun BatteryChip(percent: Int, description: String, modifier: Modifier = Modifier) {
    Row(
        modifier
            .semantics { contentDescription = description }
            .background(GuardColor.White, RoundedCornerShape(20.dp))
            .drawBehind {
                drawRoundRect(
                    color = GuardColor.Border,
                    style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.dp.toPx()),
                    cornerRadius = CornerRadius(20.dp.toPx(), 20.dp.toPx()),
                )
            }
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        BatteryGlyph(
            percent = percent,
            fill = batteryFill(percent),
            modifier = Modifier.size(width = 22.dp, height = 14.dp),
        )
        Text(
            text = "$percent %",
            color = GuardColor.Navy,
            fontFamily = Atkinson,
            fontWeight = FontWeight.Bold,
            fontSize = 15.sp,
        )
    }
}

@Composable
fun GuardTabBar(tabs: List<GuardTab>, modifier: Modifier = Modifier) {
    val labelSize = if (tabs.size >= 5) 13.sp else 14.sp
    Row(
        modifier
            .fillMaxWidth()
            .background(GuardColor.White)
            .drawBehind {
                drawLine(
                    color = GuardColor.Border,
                    start = Offset(0f, 0f),
                    end = Offset(size.width, 0f),
                    strokeWidth = 1.dp.toPx(),
                )
            }
            .navigationBarsPadding()
            .padding(top = 6.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        tabs.forEach { tab ->
            Column(
                Modifier
                    .weight(1f)
                    .heightIn(min = 52.dp)
                    .clickable(role = Role.Tab, onClick = tab.onClick)
                    .semantics { selected = tab.selected }
                    .padding(vertical = 4.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Box(
                    Modifier
                        .width(26.dp)
                        .height(3.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(if (tab.selected) GuardColor.Brown else androidx.compose.ui.graphics.Color.Transparent),
                )
                GuardGlyph(
                    kind = tab.icon,
                    tint = if (tab.selected) GuardColor.Brown else GuardColor.Navy,
                    modifier = Modifier
                        .padding(top = 4.dp)
                        .size(24.dp),
                )
                Text(
                    text = tab.label,
                    color = if (tab.selected) GuardColor.BrownDark else GuardColor.WarmGray,
                    fontFamily = Atkinson,
                    fontWeight = if (tab.selected) FontWeight.Bold else FontWeight.Normal,
                    fontSize = labelSize,
                    lineHeight = 15.sp,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp, start = 2.dp, end = 2.dp),
                )
            }
        }
    }
}

@Composable
fun GuardToastHost(
    text: String?,
    modifier: Modifier = Modifier,
    isError: Boolean = false,
) {
    val reduced = rememberReducedMotion()
    var last by remember { mutableStateOf(text) }
    var lastIsError by remember { mutableStateOf(isError) }
    LaunchedEffect(text, isError) {
        if (text != null) {
            last = text
            lastIsError = isError
        }
    }
    Box(modifier.fillMaxWidth(), contentAlignment = Alignment.BottomCenter) {
        AnimatedVisibility(
            visible = text != null,
            enter = if (reduced) fadeIn(tween(0)) else fadeIn(tween(200)) + slideInVertically(tween(200)) { it / 2 },
            exit = if (reduced) fadeOut(tween(0)) else fadeOut(tween(200)),
        ) {
            last?.let { message ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 18.dp)
                        .semantics {
                            liveRegion = if (lastIsError) LiveRegionMode.Assertive else LiveRegionMode.Polite
                        }
                        .background(GuardColor.Navy, RoundedCornerShape(18.dp))
                        .padding(horizontal = 18.dp, vertical = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    GuardGlyph(
                        if (lastIsError) Glyph.Close else Glyph.Check,
                        tint = if (lastIsError) GuardColor.DangerSoft else GuardColor.SuccessSoft,
                        modifier = Modifier.size(22.dp),
                    )
                    Text(text = message, color = GuardColor.White, style = Body.copy(fontSize = 18.sp, lineHeight = 24.sp))
                }
            }
        }
    }
}

@Composable
fun GuardSheet(
    title: String,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Box(
        Modifier
            .fillMaxSize()
            .background(GuardColor.Scrim)
            .clickable(
                interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                indication = null,
                onClick = onDismiss,
            )
            .semantics {
                dialog()
                paneTitle = title
            },
    ) {
        Column(
            modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .clickable(
                    interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                    indication = null,
                    onClick = {},
                )
                .background(
                    GuardColor.Cream,
                    RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
                )
                .navigationBarsPadding()
                .padding(start = 22.dp, end = 22.dp, top = 14.dp, bottom = 30.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                Modifier
                    .width(44.dp)
                    .height(5.dp)
                    .clip(RoundedCornerShape(50))
                    .background(GuardColor.Handle)
                    .semantics { hideFromAccessibility() },
            )
            Text(
                text = title,
                color = GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 30.sp,
                lineHeight = 36.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp, bottom = 16.dp)
                    .semantics { heading() },
            )
            content()
        }
    }
}

@Composable
fun IllustratedMap(modifier: Modifier = Modifier) {
    Canvas(
        modifier.semantics { hideFromAccessibility() },
    ) {
        drawRoundRect(
            color = GuardColor.MapBase,
            cornerRadius = CornerRadius(18.dp.toPx(), 18.dp.toPx()),
        )
        drawOval(
            color = GuardColor.MapWater,
            topLeft = Offset(size.width * 0.58f, size.height * 0.12f),
            size = Size(size.width * 0.36f, size.height * 0.42f),
        )
        drawRoundRect(
            color = GuardColor.MapPark,
            topLeft = Offset(size.width * 0.08f, size.height * 0.55f),
            size = Size(size.width * 0.34f, size.height * 0.28f),
            cornerRadius = CornerRadius(16.dp.toPx(), 16.dp.toPx()),
        )
        val street = GuardColor.White.copy(alpha = 0.85f)
        drawLine(street, Offset(0f, size.height * 0.42f), Offset(size.width, size.height * 0.42f), 8.dp.toPx())
        drawLine(street, Offset(size.width * 0.46f, 0f), Offset(size.width * 0.46f, size.height), 8.dp.toPx())
        val pin = Path().apply {
            val cx = size.width * 0.48f
            val cy = size.height * 0.40f
            moveTo(cx, cy + 28f)
            cubicTo(cx - 22f, cy + 4f, cx - 16f, cy - 18f, cx, cy - 18f)
            cubicTo(cx + 16f, cy - 18f, cx + 22f, cy + 4f, cx, cy + 28f)
            close()
        }
        drawPath(pin, GuardColor.Emergency)
        drawCircle(GuardColor.White, 5.dp.toPx(), Offset(size.width * 0.48f, size.height * 0.36f))
    }
}
