package com.example.guardmemobile.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.guardmemobile.persona.AvatarKind
import com.example.guardmemobile.ui.theme.Atkinson
import com.example.guardmemobile.ui.theme.Body
import com.example.guardmemobile.ui.theme.Caption
import com.example.guardmemobile.ui.theme.Figtree
import com.example.guardmemobile.ui.theme.GuardColor
import com.example.guardmemobile.ui.theme.Meta
import com.example.guardmemobile.ui.theme.ScreenTitle
import com.example.guardmemobile.ui.theme.SectionTitle

enum class ChipKind { Taken, Pending, Info, Family, Doctor }

@Composable
fun GuardCard(
    modifier: Modifier = Modifier,
    container: Color = GuardColor.White,
    bordered: Boolean = true,
    padding: Dp = 16.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier
            .fillMaxWidth()
            .background(container, RoundedCornerShape(22.dp))
            .then(
                if (bordered) {
                    Modifier.border(1.dp, GuardColor.Border, RoundedCornerShape(22.dp))
                } else {
                    Modifier
                },
            )
            .padding(padding),
        content = content,
    )
}

@Composable
fun GuardChip(text: String, kind: ChipKind, modifier: Modifier = Modifier) {
    val (background, foreground) = when (kind) {
        ChipKind.Taken -> GuardColor.AvatarGreen to GuardColor.ChipTakenFg
        ChipKind.Pending -> GuardColor.ChipPendingBg to GuardColor.ChipPendingFg
        ChipKind.Info -> GuardColor.AvatarBlue to GuardColor.Meds
        ChipKind.Family -> GuardColor.Sand to GuardColor.BrownDark
        ChipKind.Doctor -> GuardColor.AvatarBlue to GuardColor.Meds
    }
    Text(
        text = text,
        color = foreground,
        fontFamily = Atkinson,
        fontWeight = FontWeight.Bold,
        fontSize = 13.sp,
        modifier = modifier
            .background(background, RoundedCornerShape(13.dp))
            .padding(horizontal = 11.dp, vertical = 5.dp),
    )
}

@Composable
fun GuardAvatar(
    initial: String,
    kind: AvatarKind,
    modifier: Modifier = Modifier,
    size: Dp = 56.dp,
) {
    val background = when (kind) {
        AvatarKind.Warm -> GuardColor.AvatarWarm
        AvatarKind.Blue -> GuardColor.AvatarBlue
        AvatarKind.Green -> GuardColor.AvatarGreen
    }
    val fontSize = if (size >= 80.dp) 36.sp else if (size >= 56.dp) 24.sp else 19.sp
    Box(
        modifier
            .size(size)
            .clip(CircleShape)
            .background(background),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initial,
            color = GuardColor.Navy,
            fontFamily = Figtree,
            fontWeight = FontWeight.ExtraBold,
            fontSize = fontSize,
        )
    }
}

@Composable
fun MetricCell(value: String, unit: String, modifier: Modifier = Modifier) {
    Column(
        modifier
            .background(GuardColor.Sand, RoundedCornerShape(18.dp))
            .padding(horizontal = 12.dp, vertical = 14.dp),
    ) {
        Text(
            text = value,
            color = GuardColor.Navy,
            fontFamily = Figtree,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 26.sp,
            maxLines = 1,
        )
        Text(text = unit, color = GuardColor.WarmGray, style = Meta)
    }
}

@Composable
fun GuardScreenTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        color = GuardColor.Navy,
        style = ScreenTitle,
        modifier = modifier.semantics { heading() },
    )
}

@Composable
fun GuardSectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        color = GuardColor.Navy,
        style = SectionTitle,
        modifier = modifier.semantics { heading() },
    )
}

@Composable
fun GuardTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    error: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(text = label, color = GuardColor.Navy, style = Meta)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            textStyle = Body.copy(color = GuardColor.Navy),
            singleLine = true,
            cursorBrush = SolidColor(GuardColor.Brown),
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .background(GuardColor.White, RoundedCornerShape(16.dp))
                .border(
                    1.dp,
                    if (error != null) GuardColor.Emergency else GuardColor.Border,
                    RoundedCornerShape(16.dp),
                )
                .padding(horizontal = 14.dp, vertical = 14.dp),
            decorationBox = { inner ->
                Box {
                    if (value.isEmpty() && placeholder.isNotEmpty()) {
                        Text(text = placeholder, color = GuardColor.WarmGray, style = Body)
                    }
                    inner()
                }
            },
        )
        if (error != null) {
            Text(text = error, color = GuardColor.DangerText, style = Caption)
        }
    }
}

@Composable
fun GuardSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .background(GuardColor.White, RoundedCornerShape(18.dp))
            .border(1.dp, GuardColor.Border, RoundedCornerShape(18.dp))
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        GuardGlyph(Glyph.Search, tint = GuardColor.WarmGray, modifier = Modifier.size(22.dp))
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = Body.copy(color = GuardColor.Navy),
            cursorBrush = SolidColor(GuardColor.Brown),
            modifier = Modifier.weight(1f),
            decorationBox = { inner ->
                Box {
                    if (value.isEmpty()) {
                        Text(text = placeholder, color = GuardColor.WarmGray, style = Body)
                    }
                    inner()
                }
            },
        )
    }
}

@Composable
fun GuardToggleRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    supporting: String? = null,
    yesLabel: String,
    noLabel: String,
) {
    Row(
        modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(text = title, color = GuardColor.Navy, style = Body)
            if (supporting != null) {
                Text(text = supporting, color = GuardColor.WarmGray, style = Caption)
            }
        }
        Text(
            text = if (checked) yesLabel else noLabel,
            color = GuardColor.BrownDark,
            fontFamily = Atkinson,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp,
        )
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedTrackColor = GuardColor.Brown,
                checkedThumbColor = GuardColor.White,
                uncheckedTrackColor = GuardColor.Border,
                uncheckedThumbColor = GuardColor.White,
                uncheckedBorderColor = GuardColor.Caramel,
            ),
        )
    }
}

@Composable
fun GuardSegment(
    labels: List<String>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier
            .fillMaxWidth()
            .background(GuardColor.White, RoundedCornerShape(16.dp))
            .border(1.dp, GuardColor.Border, RoundedCornerShape(16.dp))
            .padding(4.dp),
    ) {
        labels.forEachIndexed { index, label ->
            val selected = index == selectedIndex
            Box(
                Modifier
                    .weight(1f)
                    .heightIn(min = 44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (selected) GuardColor.Brown else Color.Transparent)
                    .clickable(role = Role.Tab) { onSelect(index) }
                    .semantics { this.selected = selected }
                    .padding(vertical = 10.dp, horizontal = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = label,
                    color = if (selected) GuardColor.White else GuardColor.Navy,
                    fontFamily = Atkinson,
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                    fontSize = 16.sp,
                )
            }
        }
    }
}

@Composable
fun StatusOrb(kind: StatusKind, modifier: Modifier = Modifier, size: Dp = 60.dp) {
    val color = when (kind) {
        StatusKind.Ok -> GuardColor.Ok
        StatusKind.Attention -> GuardColor.Attention
        StatusKind.Emergency -> GuardColor.Emergency
    }
    val glyph = when (kind) {
        StatusKind.Ok -> Glyph.Check
        StatusKind.Attention -> Glyph.Alert
        StatusKind.Emergency -> Glyph.Alert
    }
    Box(
        modifier
            .size(size)
            .clip(CircleShape)
            .background(color),
        contentAlignment = Alignment.Center,
    ) {
        GuardGlyph(glyph, tint = GuardColor.White, modifier = Modifier.size(size * 0.48f))
    }
}

enum class StatusKind { Ok, Attention, Emergency }
