package com.example.guardmemobile.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.example.guardmemobile.R

/**
 * Figtree y Atkinson Hyperlegible, SIL OFL.
 * Licencias en assets/licenses. Subconjunto latino embebido.
 */
val Figtree = FontFamily(
    Font(R.font.figtree_regular, FontWeight.Normal),
    Font(R.font.figtree_bold, FontWeight.Bold),
    Font(R.font.figtree_extrabold, FontWeight.ExtraBold),
)

val Atkinson = FontFamily(
    Font(R.font.atkinson_regular, FontWeight.Normal),
    Font(R.font.atkinson_bold, FontWeight.Bold),
)

val ScreenTitle = TextStyle(
    fontFamily = Figtree,
    fontWeight = FontWeight.ExtraBold,
    fontSize = 26.sp,
    lineHeight = 32.sp,
)

val SectionTitle = TextStyle(
    fontFamily = Figtree,
    fontWeight = FontWeight.Bold,
    fontSize = 20.sp,
    lineHeight = 26.sp,
)

val CrisisTitle = TextStyle(
    fontFamily = Figtree,
    fontWeight = FontWeight.ExtraBold,
    fontSize = 34.sp,
    lineHeight = 40.sp,
)

val Body = TextStyle(
    fontFamily = Atkinson,
    fontWeight = FontWeight.Normal,
    fontSize = 16.sp,
    lineHeight = 22.sp,
)

val BodyStrong = TextStyle(
    fontFamily = Atkinson,
    fontWeight = FontWeight.Bold,
    fontSize = 16.sp,
    lineHeight = 22.sp,
)

val Meta = TextStyle(
    fontFamily = Atkinson,
    fontWeight = FontWeight.Normal,
    fontSize = 15.sp,
    lineHeight = 20.sp,
)

val Caption = TextStyle(
    fontFamily = Atkinson,
    fontWeight = FontWeight.Normal,
    fontSize = 14.sp,
    lineHeight = 18.sp,
)

val ButtonPerson = TextStyle(
    fontFamily = Figtree,
    fontWeight = FontWeight.ExtraBold,
    fontSize = 24.sp,
    lineHeight = 28.sp,
)

val ButtonCare = TextStyle(
    fontFamily = Figtree,
    fontWeight = FontWeight.ExtraBold,
    fontSize = 18.sp,
    lineHeight = 22.sp,
)

val Typography = Typography(
    displayLarge = CrisisTitle,
    headlineLarge = ScreenTitle,
    headlineMedium = ScreenTitle.copy(fontSize = 24.sp),
    titleLarge = SectionTitle.copy(fontFamily = Figtree, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp),
    titleMedium = SectionTitle,
    bodyLarge = Body,
    bodyMedium = Meta,
    bodySmall = Caption,
    labelLarge = ButtonCare,
    labelMedium = Caption.copy(fontWeight = FontWeight.Bold, fontSize = 13.sp),
    labelSmall = Caption.copy(fontSize = 13.sp),
)
