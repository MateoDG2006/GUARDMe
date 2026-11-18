package com.example.guardmemobile.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val LightColors = lightColorScheme(
    primary = GuardColor.Brown,
    onPrimary = GuardColor.White,
    secondary = GuardColor.Caramel,
    onSecondary = GuardColor.Navy,
    tertiary = GuardColor.Ok,
    onTertiary = GuardColor.White,
    background = GuardColor.Cream,
    onBackground = GuardColor.Navy,
    surface = GuardColor.White,
    onSurface = GuardColor.Navy,
    surfaceVariant = GuardColor.Sand,
    onSurfaceVariant = GuardColor.WarmGray,
    error = GuardColor.Emergency,
    onError = GuardColor.White,
    outline = GuardColor.Border,
)

/**
 * Tema claro fijo de GuardMe. No consulta el color dinámico del sistema
 * ni ofrece esquema oscuro.
 */
@Composable
fun GuardMeMobileTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        typography = Typography,
        content = content,
    )
}
