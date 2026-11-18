package com.example.guardmemobile.ui.theme

import androidx.compose.ui.graphics.Color

object GuardColor {
    val Brown = Color(0xFF8A5A35)
    val Caramel = Color(0xFFC08A5B)
    val Sand = Color(0xFFF1E6D8)
    val Cream = Color(0xFFF8F4EE)
    val Navy = Color(0xFF1E2A38)
    val WarmGray = Color(0xFF5C5650)
    val MeAccent = Color(0xFFB07A4C)
    val White = Color(0xFFFFFFFF)
    val Border = Color(0xFFE6DCCF)
    val DividerSoft = Color(0xFFEFE6DA)
    val BrownDark = Color(0xFF6B4426)
    val BrownDeep = Color(0xFF4A3A2C)

    val Ok = Color(0xFF2E7D4F)
    val Emergency = Color(0xFFB3261E)
    val Attention = Color(0xFFA8620A)
    val Meds = Color(0xFF2C4A6E)
    val DangerText = Color(0xFF8C1D17)

    val AvatarWarm = Color(0xFFE9D3BC)
    val AvatarBlue = Color(0xFFDCE6F2)
    val AvatarGreen = Color(0xFFDDEBDF)
    val ChipPendingBg = Color(0xFFF6E3C8)
    val ChipPendingFg = Color(0xFF7A4708)
    val ChipTakenFg = Color(0xFF1F5C39)
    val SuccessSoft = Color(0xFF9FD6B0)
    val DangerSoft = Color(0xFFF2A49E)
    val Handle = Color(0xFFD8CBBB)
    val Scrim = Color(0x731E2A38)
    val MapBase = Color(0xFFECE5DA)
    val MapWater = Color(0xFFC9DCEC)
    val MapPark = Color(0xFFDFE6D3)
}

fun Color.darken(amount: Float = 0.08f): Color = copy(
    red = (red * (1f - amount)).coerceIn(0f, 1f),
    green = (green * (1f - amount)).coerceIn(0f, 1f),
    blue = (blue * (1f - amount)).coerceIn(0f, 1f),
)

fun batteryFill(percent: Int): Color = when {
    percent < 20 -> GuardColor.Emergency
    percent < 50 -> GuardColor.Attention
    else -> GuardColor.Ok
}
