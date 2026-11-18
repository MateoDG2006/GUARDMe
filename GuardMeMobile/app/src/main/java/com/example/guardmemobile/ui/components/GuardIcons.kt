package com.example.guardmemobile.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.unit.dp
import com.example.guardmemobile.ui.theme.GuardColor

enum class Glyph {
    Home, Person, Clock, Cane, History, Team, Bell, Phone, Pencil, Plus, Back,
    Search, Star, Check, Alert, Pill, Cross, Wave, Pin, Ambulance, Close, Chevron,
}

@Composable
fun GuardGlyph(
    kind: Glyph,
    modifier: Modifier = Modifier,
    tint: Color = GuardColor.Navy,
) {
    Canvas(modifier) {
        val stroke = Stroke(width = 2f, cap = StrokeCap.Round, join = StrokeJoin.Round)
        scale(size.width / 24f, size.height / 24f, pivot = Offset.Zero) {
            drawGlyph(kind, tint, stroke)
        }
    }
}

@Composable
fun BatteryGlyph(
    percent: Int,
    modifier: Modifier = Modifier,
    outline: Color = GuardColor.Navy,
    fill: Color = GuardColor.Ok,
) {
    Canvas(modifier) {
        val stroke = Stroke(width = 1.6f, cap = StrokeCap.Round, join = StrokeJoin.Round)
        scale(size.width / 24f, size.height / 24f, pivot = Offset.Zero) {
            drawRoundRect(
                color = outline,
                topLeft = Offset(2f, 7f),
                size = Size(16f, 10f),
                cornerRadius = CornerRadius(2f, 2f),
                style = stroke,
            )
            drawRoundRect(
                color = outline,
                topLeft = Offset(19f, 10f),
                size = Size(2.4f, 4f),
                cornerRadius = CornerRadius(1f, 1f),
            )
            val inner = (12.4f * (percent.coerceIn(0, 100) / 100f)).coerceAtLeast(if (percent > 0) 1.5f else 0f)
            if (inner > 0f) {
                drawRoundRect(
                    color = fill,
                    topLeft = Offset(4f, 9f),
                    size = Size(inner, 6f),
                    cornerRadius = CornerRadius(1f, 1f),
                )
            }
        }
    }
}

@Composable
fun GuardLogo(modifier: Modifier = Modifier) {
    Canvas(Modifier.size(40.dp, 44.dp).then(modifier)) {
        val stroke = Stroke(width = 2.2f, cap = StrokeCap.Round, join = StrokeJoin.Round)
        scale(size.width / 40f, size.height / 44f, pivot = Offset.Zero) {
            val pin = Path().apply {
                moveTo(20f, 4f)
                cubicTo(12f, 4f, 7f, 10f, 7f, 17f)
                cubicTo(7f, 25f, 20f, 36f, 20f, 36f)
                cubicTo(20f, 36f, 33f, 25f, 33f, 17f)
                cubicTo(33f, 10f, 28f, 4f, 20f, 4f)
                close()
            }
            drawPath(pin, GuardColor.Navy, style = stroke)
            drawCircle(GuardColor.MeAccent, radius = 4.2f, center = Offset(20f, 16.5f))
            drawArc(
                color = GuardColor.Caramel,
                startAngle = 200f,
                sweepAngle = 140f,
                useCenter = false,
                topLeft = Offset(8f, 30f),
                size = Size(24f, 12f),
                style = stroke,
            )
        }
    }
}

private fun DrawScope.drawGlyph(kind: Glyph, tint: Color, stroke: Stroke) {
    when (kind) {
        Glyph.Home -> {
            val roof = Path().apply {
                moveTo(4f, 11f)
                lineTo(12f, 4.5f)
                lineTo(20f, 11f)
                lineTo(20f, 20f)
                lineTo(4f, 20f)
                close()
            }
            drawPath(roof, tint, style = stroke)
            drawLine(tint, Offset(10f, 20f), Offset(10f, 14.5f), stroke.width, StrokeCap.Round)
            drawLine(tint, Offset(10f, 14.5f), Offset(14f, 14.5f), stroke.width, StrokeCap.Round)
            drawLine(tint, Offset(14f, 14.5f), Offset(14f, 20f), stroke.width, StrokeCap.Round)
        }
        Glyph.Person -> {
            drawCircle(tint, radius = 3.2f, center = Offset(12f, 7.5f), style = stroke)
            val body = Path().apply {
                moveTo(5.5f, 20f)
                cubicTo(5.5f, 15f, 8f, 13.2f, 12f, 13.2f)
                cubicTo(16f, 13.2f, 18.5f, 15f, 18.5f, 20f)
            }
            drawPath(body, tint, style = stroke)
        }
        Glyph.Clock -> {
            drawCircle(tint, radius = 8f, center = Offset(12f, 12f), style = stroke)
            drawLine(tint, Offset(12f, 12f), Offset(12f, 7.2f), stroke.width, StrokeCap.Round)
            drawLine(tint, Offset(12f, 12f), Offset(15.6f, 14.2f), stroke.width, StrokeCap.Round)
        }
        Glyph.Cane -> {
            drawLine(tint, Offset(15f, 8f), Offset(15f, 21f), stroke.width, StrokeCap.Round)
            val handle = Path().apply {
                moveTo(15f, 8.2f)
                cubicTo(15f, 3.5f, 6.5f, 3.5f, 6.5f, 8.4f)
            }
            drawPath(handle, tint, style = stroke)
        }
        Glyph.History -> {
            listOf(7f, 12f, 17f).forEach { y ->
                drawCircle(tint, radius = 1.3f, center = Offset(5f, y))
                drawLine(tint, Offset(9f, y), Offset(20f, y), stroke.width, StrokeCap.Round)
            }
        }
        Glyph.Team -> {
            drawCircle(tint, 2.4f, Offset(9f, 8f), style = stroke)
            drawCircle(tint, 2.4f, Offset(16f, 9f), style = stroke)
            drawArc(tint, 200f, 140f, false, Offset(3.5f, 12f), Size(11f, 9f), style = stroke)
            drawArc(tint, 200f, 140f, false, Offset(11f, 13f), Size(10f, 8f), style = stroke)
        }
        Glyph.Bell -> {
            val bell = Path().apply {
                moveTo(6f, 16f)
                lineTo(6f, 11f)
                cubicTo(6f, 6.5f, 9f, 4f, 12f, 4f)
                cubicTo(15f, 4f, 18f, 6.5f, 18f, 11f)
                lineTo(18f, 16f)
            }
            drawPath(bell, tint, style = stroke)
            drawLine(tint, Offset(4.5f, 16f), Offset(19.5f, 16f), stroke.width, StrokeCap.Round)
            drawCircle(tint, 1.6f, Offset(12f, 19f))
        }
        Glyph.Phone -> {
            rotate(-38f, Offset(12f, 12f)) {
                drawRoundRect(
                    color = tint,
                    topLeft = Offset(8.2f, 3.2f),
                    size = Size(7.6f, 17.6f),
                    cornerRadius = CornerRadius(3.2f, 3.2f),
                    style = stroke,
                )
            }
        }
        Glyph.Pencil -> {
            val body = Path().apply {
                moveTo(14f, 4f)
                lineTo(20f, 10f)
                lineTo(9f, 21f)
                lineTo(3.2f, 21f)
                lineTo(3.2f, 15.2f)
                close()
            }
            drawPath(body, tint, style = stroke)
            drawLine(tint, Offset(12.2f, 6.2f), Offset(17.8f, 11.8f), stroke.width, StrokeCap.Round)
        }
        Glyph.Plus -> {
            drawLine(tint, Offset(12f, 5f), Offset(12f, 19f), stroke.width, StrokeCap.Round)
            drawLine(tint, Offset(5f, 12f), Offset(19f, 12f), stroke.width, StrokeCap.Round)
        }
        Glyph.Back -> {
            drawLine(tint, Offset(15f, 5f), Offset(8f, 12f), stroke.width, StrokeCap.Round)
            drawLine(tint, Offset(8f, 12f), Offset(15f, 19f), stroke.width, StrokeCap.Round)
        }
        Glyph.Chevron -> {
            drawLine(tint, Offset(9f, 5f), Offset(16f, 12f), stroke.width, StrokeCap.Round)
            drawLine(tint, Offset(16f, 12f), Offset(9f, 19f), stroke.width, StrokeCap.Round)
        }
        Glyph.Search -> {
            drawCircle(tint, 6f, Offset(11f, 11f), style = stroke)
            drawLine(tint, Offset(15.5f, 15.5f), Offset(20f, 20f), stroke.width, StrokeCap.Round)
        }
        Glyph.Star -> {
            val star = Path().apply {
                moveTo(12f, 3.2f)
                lineTo(14.4f, 8.8f)
                lineTo(20.4f, 9.2f)
                lineTo(15.6f, 13.2f)
                lineTo(17.2f, 19f)
                lineTo(12f, 15.8f)
                lineTo(6.8f, 19f)
                lineTo(8.4f, 13.2f)
                lineTo(3.6f, 9.2f)
                lineTo(9.6f, 8.8f)
                close()
            }
            drawPath(star, tint, style = stroke)
        }
        Glyph.Check -> {
            drawLine(tint, Offset(5f, 12.5f), Offset(10f, 17.5f), 2.4f, StrokeCap.Round)
            drawLine(tint, Offset(10f, 17.5f), Offset(19f, 7f), 2.4f, StrokeCap.Round)
        }
        Glyph.Alert -> {
            val triangle = Path().apply {
                moveTo(12f, 3.2f)
                lineTo(21.5f, 20f)
                lineTo(2.5f, 20f)
                close()
            }
            drawPath(triangle, tint, style = stroke)
            drawLine(tint, Offset(12f, 9f), Offset(12f, 14f), stroke.width, StrokeCap.Round)
            drawCircle(tint, 1.1f, Offset(12f, 17f))
        }
        Glyph.Pill -> {
            rotate(-35f, Offset(12f, 12f)) {
                drawRoundRect(
                    color = tint,
                    topLeft = Offset(4f, 8f),
                    size = Size(16f, 8f),
                    cornerRadius = CornerRadius(4f, 4f),
                    style = stroke,
                )
                drawLine(tint, Offset(12f, 8f), Offset(12f, 16f), stroke.width, StrokeCap.Round)
            }
        }
        Glyph.Cross -> {
            drawLine(tint, Offset(12f, 4f), Offset(12f, 20f), 2.4f, StrokeCap.Round)
            drawLine(tint, Offset(4f, 12f), Offset(20f, 12f), 2.4f, StrokeCap.Round)
        }
        Glyph.Wave -> {
            drawArc(tint, 200f, 140f, false, Offset(7f, 8f), Size(10f, 10f), style = stroke)
            drawArc(tint, 200f, 140f, false, Offset(4f, 5f), Size(16f, 16f), style = stroke)
            drawArc(tint, 200f, 140f, false, Offset(1.2f, 2f), Size(21.6f, 21.6f), style = stroke)
        }
        Glyph.Pin -> {
            drawCircle(tint, 6f, Offset(12f, 9f), style = stroke)
            drawCircle(tint, 2f, Offset(12f, 9f))
            drawLine(tint, Offset(12f, 15f), Offset(12f, 21f), stroke.width, StrokeCap.Round)
        }
        Glyph.Ambulance -> {
            drawRoundRect(tint, Offset(1.5f, 8f), Size(15f, 8f), CornerRadius(2f, 2f), style = stroke)
            drawCircle(tint, 1.7f, Offset(6f, 18f), style = stroke)
            drawCircle(tint, 1.7f, Offset(13f, 18f), style = stroke)
            drawLine(tint, Offset(16.5f, 10f), Offset(21.5f, 12f), stroke.width, StrokeCap.Round)
            drawLine(tint, Offset(21.5f, 12f), Offset(16.5f, 14f), stroke.width, StrokeCap.Round)
            drawLine(tint, Offset(8f, 10f), Offset(8f, 14f), stroke.width, StrokeCap.Round)
            drawLine(tint, Offset(6f, 12f), Offset(10f, 12f), stroke.width, StrokeCap.Round)
        }
        Glyph.Close -> {
            drawLine(tint, Offset(6f, 6f), Offset(18f, 18f), stroke.width, StrokeCap.Round)
            drawLine(tint, Offset(18f, 6f), Offset(6f, 18f), stroke.width, StrokeCap.Round)
        }
    }
}
