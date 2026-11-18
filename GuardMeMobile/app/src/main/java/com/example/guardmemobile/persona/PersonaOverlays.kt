package com.example.guardmemobile.persona

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.dialog
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.guardmemobile.R
import com.example.guardmemobile.ui.a11y.rememberReducedMotion
import com.example.guardmemobile.ui.components.FillKind
import com.example.guardmemobile.ui.components.Glyph
import com.example.guardmemobile.ui.components.GuardCard
import com.example.guardmemobile.ui.components.GuardGlyph
import com.example.guardmemobile.ui.components.GuardOutlineButton
import com.example.guardmemobile.ui.components.GuardPrimaryButton
import com.example.guardmemobile.ui.components.GuardSheet
import com.example.guardmemobile.ui.components.GuardTextAction
import com.example.guardmemobile.ui.theme.Body
import com.example.guardmemobile.ui.theme.ButtonPerson
import com.example.guardmemobile.ui.theme.Figtree
import com.example.guardmemobile.ui.theme.GuardColor
import com.example.guardmemobile.ui.theme.Meta

@Composable
fun PersonaOverlayHost(state: PersonaState, onEvent: (PersonaEvent) -> Unit) {
    val reduced = rememberReducedMotion()
    when (val overlay = state.overlay) {
        PersonaOverlay.None -> Unit
        is PersonaOverlay.Countdown911 -> Countdown911(state, overlay, onEvent)
        is PersonaOverlay.Calling911 -> Calling911(state, overlay, onEvent)
        is PersonaOverlay.CallingFamily -> CallingFamily(state, overlay, onEvent)
        is PersonaOverlay.FamilyNoAnswer -> FamilyMissed(state, overlay, onEvent)
        is PersonaOverlay.Fall -> FallOverlay(state, overlay, onEvent)
        PersonaOverlay.Escalation -> EscalationOverlay(state, onEvent)
        PersonaOverlay.Auto911Notice -> AutoNotice(state)
        is PersonaOverlay.HelpOnTheWay -> HelpOverlay(state, overlay.automatic, onEvent)
        is PersonaOverlay.FamilyAnswered -> AnsweredOverlay(state, overlay, onEvent)
        is PersonaOverlay.DialerUnavailable -> DialerUnavailableOverlay(state, overlay, onEvent)
        is PersonaOverlay.CallPlanExhausted -> CallPlanExhaustedOverlay(overlay, onEvent)
        PersonaOverlay.CaneRinging -> CaneRinging(reduced, onEvent)
        PersonaOverlay.PillTime -> PillOverlay(state, onEvent)
    }
}

@Composable
private fun OverlayFrame(
    title: String,
    background: Color = GuardColor.Cream,
    focus: FocusRequester?,
    content: @Composable ColumnScope.() -> Unit,
    actions: @Composable ColumnScope.() -> Unit,
) {
    LaunchedEffect(title) {
        if (focus != null) runCatching { focus.requestFocus() }
    }
    Box(
        Modifier
            .fillMaxSize()
            .background(background)
            .semantics {
                dialog()
                paneTitle = title
            },
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .padding(horizontal = 22.dp),
        ) {
            Column(
                Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
                content = content,
            )
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                content = actions,
            )
        }
    }
}

@Composable
private fun rememberFocus(): FocusRequester = remember { FocusRequester() }

@Composable
private fun Countdown911(
    state: PersonaState,
    overlay: PersonaOverlay.Countdown911,
    onEvent: (PersonaEvent) -> Unit,
) {
    val focus = rememberFocus()
    val family = state.preferred()?.name
    val title = stringResource(R.string.calling_911_title)
    OverlayFrame(
        title = title,
        focus = focus,
        content = {
            val secondsLabel = stringResource(R.string.seconds_left, overlay.secondsLeft)
            Text(
                text = overlay.secondsLeft.toString(),
                color = GuardColor.Emergency,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 96.sp,
                lineHeight = 100.sp,
                modifier = Modifier.semantics {
                    liveRegion = LiveRegionMode.Polite
                    contentDescription = secondsLabel
                },
            )
            Text(
                text = title,
                color = GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 32.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = if (family != null) {
                    stringResource(R.string.countdown_note, family)
                } else {
                    stringResource(R.string.countdown_note_no_family)
                },
                color = GuardColor.WarmGray,
                style = Body.copy(fontSize = 18.sp, lineHeight = 24.sp),
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp),
            )
        },
        actions = {
            GuardOutlineButton(
                text = stringResource(R.string.cancel),
                onClick = { onEvent(PersonaEvent.Cancel911) },
                height = 64.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus)
                    .testTag("persona_cancel_911"),
            )
        },
    )
}

@Composable
private fun Calling911(
    state: PersonaState,
    overlay: PersonaOverlay.Calling911,
    onEvent: (PersonaEvent) -> Unit,
) {
    val focus = rememberFocus()
    val family = state.preferred()?.name
    OverlayFrame(
        title = stringResource(R.string.calling),
        background = GuardColor.Emergency,
        focus = focus,
        content = {
            Text(stringResource(R.string.calling), color = GuardColor.White, style = Body.copy(fontSize = 18.sp))
            Text(
                text = "911",
                color = GuardColor.White,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 64.sp,
                modifier = Modifier.semantics { heading() },
            )
            if (overlay.automatic && family != null) {
                Text(
                    text = family,
                    color = GuardColor.White,
                    style = Body.copy(fontSize = 18.sp, lineHeight = 24.sp),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        },
        actions = {
            GuardPrimaryButton(
                text = stringResource(R.string.hangup),
                onClick = { onEvent(PersonaEvent.HangUp911) },
                height = 64.dp,
                containerColor = GuardColor.White,
                contentColor = GuardColor.Emergency,
                textStyle = ButtonPerson.copy(fontSize = 22.sp),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus),
            )
        },
    )
}

@Composable
private fun CallingFamily(
    state: PersonaState,
    overlay: PersonaOverlay.CallingFamily,
    onEvent: (PersonaEvent) -> Unit,
) {
    val focus = rememberFocus()
    val contact = state.contact(overlay.contactId)
    val name = contact?.name ?: stringResource(R.string.pill_fallback_name)
    OverlayFrame(
        title = stringResource(R.string.calling),
        background = GuardColor.Brown,
        focus = focus,
        content = {
            if (overlay.inEpisode) {
                val attemptLabel = stringResource(R.string.call_plan_attempt, overlay.slot, overlay.attempt)
                Text(
                    text = stringResource(R.string.call_plan_attempt, overlay.slot, overlay.attempt),
                    color = GuardColor.White,
                    fontFamily = Figtree,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 26.sp,
                    lineHeight = 32.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.semantics {
                        liveRegion = LiveRegionMode.Polite
                        contentDescription = attemptLabel
                    },
                )
            } else {
                Text(stringResource(R.string.calling), color = GuardColor.White, style = Body.copy(fontSize = 18.sp))
            }
            Text(
                text = name,
                color = GuardColor.White,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 40.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = if (overlay.inEpisode) {
                    stringResource(R.string.episode_note)
                } else {
                    stringResource(R.string.home_call_note)
                },
                color = GuardColor.White,
                style = Body.copy(fontSize = 18.sp, lineHeight = 24.sp),
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp),
            )
            Text(
                text = stringResource(R.string.ring_remaining, overlay.secondsLeft),
                color = GuardColor.White,
                style = Meta,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp),
            )
        },
        actions = {
            GuardPrimaryButton(
                text = stringResource(R.string.answered),
                onClick = { onEvent(PersonaEvent.FamilyAnswered) },
                kind = FillKind.Navy,
                height = 64.dp,
                textStyle = ButtonPerson.copy(fontSize = 22.sp),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus)
                    .testTag("persona_family_answered"),
            )
            if (overlay.inEpisode) {
                GuardOutlineButton(
                    text = stringResource(R.string.call_911),
                    onClick = { onEvent(PersonaEvent.Manual911) },
                    height = 60.dp,
                    background = GuardColor.Emergency,
                    borderColor = GuardColor.Emergency,
                    textColor = GuardColor.White,
                    modifier = Modifier.fillMaxWidth(),
                )
                GuardOutlineButton(
                    text = stringResource(R.string.im_fine),
                    onClick = { onEvent(PersonaEvent.ImFine) },
                    height = 56.dp,
                    borderColor = GuardColor.White,
                    textColor = GuardColor.White,
                    background = Color.Transparent,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("persona_im_fine"),
                )
            } else {
                GuardOutlineButton(
                    text = stringResource(R.string.hangup),
                    onClick = { onEvent(PersonaEvent.HangUpFamily) },
                    height = 56.dp,
                    borderColor = GuardColor.White,
                    textColor = GuardColor.White,
                    background = Color.Transparent,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
    )
}

@Composable
private fun FamilyMissed(
    state: PersonaState,
    overlay: PersonaOverlay.FamilyNoAnswer,
    onEvent: (PersonaEvent) -> Unit,
) {
    val focus = rememberFocus()
    val name = state.contact(overlay.contactId)?.name ?: stringResource(R.string.pill_fallback_name)
    OverlayFrame(
        title = stringResource(R.string.missed_line, name),
        focus = focus,
        content = {
            val missedLabel = stringResource(R.string.missed_cd, overlay.completedAttempt, name)
            Text(
                text = stringResource(R.string.missed_line, name),
                color = GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 30.sp,
                lineHeight = 36.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics {
                    heading()
                    liveRegion = LiveRegionMode.Polite
                    contentDescription = missedLabel
                },
            )
        },
        actions = {
            GuardOutlineButton(
                text = stringResource(R.string.im_fine),
                onClick = { onEvent(PersonaEvent.ImFine) },
                height = 64.dp,
                borderColor = GuardColor.Ok,
                textColor = GuardColor.Ok,
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus),
            )
        },
    )
}

@Composable
private fun FallOverlay(
    state: PersonaState,
    overlay: PersonaOverlay.Fall,
    onEvent: (PersonaEvent) -> Unit,
) {
    val focus = rememberFocus()
    val family = state.preferred()?.name
    val title = stringResource(R.string.fall_title)
    OverlayFrame(
        title = title,
        focus = focus,
        content = {
            Text(
                text = title,
                color = GuardColor.Navy,
                style = androidx.compose.ui.text.TextStyle(
                    fontFamily = Figtree,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 36.sp,
                    lineHeight = 42.sp,
                ),
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = stringResource(R.string.fall_sub),
                color = GuardColor.WarmGray,
                style = Body.copy(fontSize = 18.sp),
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp),
            )
            val secondsLabel = stringResource(R.string.seconds_left, overlay.secondsLeft)
            Text(
                text = overlay.secondsLeft.toString(),
                color = GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 72.sp,
                modifier = Modifier.semantics {
                    liveRegion = LiveRegionMode.Polite
                    contentDescription = secondsLabel
                },
            )
            Text(
                text = if (family != null) {
                    stringResource(R.string.fall_help, family)
                } else {
                    stringResource(R.string.fall_help_no_family)
                },
                color = GuardColor.WarmGray,
                style = Body,
                textAlign = TextAlign.Center,
            )
        },
        actions = {
            GuardPrimaryButton(
                text = stringResource(R.string.im_ok_fall),
                onClick = { onEvent(PersonaEvent.ImFine) },
                kind = FillKind.Ok,
                height = 84.dp,
                radius = 26.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus)
                    .testTag("persona_im_fine"),
            )
            GuardPrimaryButton(
                text = stringResource(R.string.need_help),
                onClick = { onEvent(PersonaEvent.NeedHelp) },
                kind = FillKind.Care,
                height = 72.dp,
                textStyle = ButtonPerson.copy(fontSize = 24.sp),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("persona_need_help"),
            )
        },
    )
}

@Composable
private fun EscalationOverlay(state: PersonaState, onEvent: (PersonaEvent) -> Unit) {
    val focus = rememberFocus()
    val family = state.preferred()
    val title = when {
        family == null -> stringResource(R.string.escalation_no_family)
        state.attemptsClosed -> stringResource(R.string.escalation_after, family.name)
        else -> stringResource(R.string.escalation_title, family.name)
    }
    val body = when {
        family == null -> stringResource(R.string.escalation_no_family)
        state.attemptsClosed -> stringResource(R.string.escalation_after, family.name)
        else -> stringResource(R.string.escalation_body)
    }
    OverlayFrame(
        title = if (family != null && !state.attemptsClosed) {
            stringResource(R.string.escalation_title, family.name)
        } else {
            title
        },
        focus = focus,
        content = {
            Box(
                Modifier
                    .size(96.dp)
                    .clip(CircleShape)
                    .background(GuardColor.Brown),
                contentAlignment = Alignment.Center,
            ) {
                GuardGlyph(Glyph.Check, tint = GuardColor.White, modifier = Modifier.size(48.dp))
            }
            Spacer(Modifier.height(16.dp))
            Text(
                text = title,
                color = GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 30.sp,
                lineHeight = 36.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() },
            )
            if (family != null && !state.attemptsClosed) {
                Text(
                    text = body,
                    color = GuardColor.WarmGray,
                    style = Body.copy(fontSize = 18.sp, lineHeight = 24.sp),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        },
        actions = {
            GuardPrimaryButton(
                text = stringResource(R.string.call_911),
                onClick = { onEvent(PersonaEvent.Manual911) },
                kind = FillKind.Emergency,
                height = 72.dp,
                textStyle = ButtonPerson.copy(fontSize = 22.sp),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus),
            )
            GuardOutlineButton(
                text = stringResource(R.string.im_fine),
                onClick = { onEvent(PersonaEvent.ImFine) },
                height = 64.dp,
                borderColor = GuardColor.Ok,
                textColor = GuardColor.Ok,
                modifier = Modifier.fillMaxWidth(),
            )
        },
    )
}

@Composable
private fun AutoNotice(state: PersonaState) {
    val family = state.preferred()?.name ?: stringResource(R.string.pill_fallback_name)
    val title = stringResource(R.string.auto_title, family)
    OverlayFrame(
        title = title,
        focus = null,
        content = {
            Text(
                text = title,
                color = GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 32.sp,
                lineHeight = 38.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = stringResource(R.string.call_plan_exhausted),
                color = GuardColor.Navy,
                style = Body.copy(fontSize = 18.sp, lineHeight = 24.sp),
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 12.dp),
            )
            Text(
                text = stringResource(R.string.auto_wait),
                color = GuardColor.WarmGray,
                style = Meta,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 12.dp),
            )
        },
        actions = {},
    )
}

@Composable
private fun HelpOverlay(state: PersonaState, automatic: Boolean, onEvent: (PersonaEvent) -> Unit) {
    val focus = rememberFocus()
    val title = stringResource(R.string.help_title)
    OverlayFrame(
        title = title,
        background = GuardColor.Emergency,
        focus = focus,
        content = {
            Box(
                Modifier
                    .size(104.dp)
                    .clip(CircleShape)
                    .background(GuardColor.White.copy(alpha = 0.18f)),
                contentAlignment = Alignment.Center,
            ) {
                GuardGlyph(Glyph.Ambulance, tint = GuardColor.White, modifier = Modifier.size(54.dp))
            }
            Spacer(Modifier.height(16.dp))
            Text(
                text = title,
                color = GuardColor.White,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 36.sp,
                lineHeight = 42.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = stringResource(R.string.call_plan_exhausted),
                color = GuardColor.White,
                style = Body.copy(fontSize = 20.sp, lineHeight = 26.sp),
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 10.dp),
            )
        },
        actions = {
            GuardPrimaryButton(
                text = stringResource(R.string.understood),
                onClick = { onEvent(PersonaEvent.DismissHelp) },
                height = 76.dp,
                radius = 38.dp,
                containerColor = GuardColor.White,
                contentColor = GuardColor.Emergency,
                textStyle = ButtonPerson.copy(fontSize = 24.sp),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus),
            )
        },
    )
}

@Composable
private fun AnsweredOverlay(
    state: PersonaState,
    overlay: PersonaOverlay.FamilyAnswered,
    onEvent: (PersonaEvent) -> Unit,
) {
    val focus = rememberFocus()
    val name = state.contact(overlay.contactId)?.name ?: stringResource(R.string.pill_fallback_name)
    val title = stringResource(R.string.family_online, name)
    OverlayFrame(
        title = title,
        focus = focus,
        content = {
            Box(
                Modifier
                    .size(96.dp)
                    .clip(CircleShape)
                    .background(GuardColor.Ok),
                contentAlignment = Alignment.Center,
            ) {
                GuardGlyph(Glyph.Check, tint = GuardColor.White, modifier = Modifier.size(48.dp))
            }
            Spacer(Modifier.height(16.dp))
            val attemptLabel = stringResource(R.string.attempt_cd, overlay.attempt)
            Text(
                text = title,
                color = GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 32.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = attemptLabel
                },
            )
            if (overlay.stoppedEscalation) {
                Text(
                    text = stringResource(R.string.call_plan_answered),
                    color = GuardColor.WarmGray,
                    style = Body.copy(fontSize = 18.sp),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        },
        actions = {
            GuardPrimaryButton(
                text = stringResource(R.string.understood),
                onClick = { onEvent(PersonaEvent.DismissFamilyAnswered) },
                height = 72.dp,
                textStyle = ButtonPerson.copy(fontSize = 22.sp),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus),
            )
        },
    )
}

@Composable
private fun DialerUnavailableOverlay(
    state: PersonaState,
    overlay: PersonaOverlay.DialerUnavailable,
    onEvent: (PersonaEvent) -> Unit,
) {
    val focus = rememberFocus()
    val name = overlay.contactId?.let { state.contact(it)?.name }
    val title = stringResource(R.string.dialer_not_integrated)
    OverlayFrame(
        title = title,
        focus = focus,
        content = {
            Text(
                text = title,
                color = GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 32.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() },
            )
            if (name != null) {
                Text(
                    text = name,
                    color = GuardColor.WarmGray,
                    style = Body.copy(fontSize = 18.sp),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        },
        actions = {
            GuardPrimaryButton(
                text = stringResource(R.string.understood),
                onClick = { onEvent(PersonaEvent.Cancel911) },
                height = 72.dp,
                textStyle = ButtonPerson.copy(fontSize = 22.sp),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus),
            )
        },
    )
}

@Composable
private fun CallPlanExhaustedOverlay(
    overlay: PersonaOverlay.CallPlanExhausted,
    onEvent: (PersonaEvent) -> Unit,
) {
    val focus = rememberFocus()
    val title = stringResource(
        if (overlay.outcome == EpisodeCallOutcome.NoPriorityContacts) {
            R.string.call_plan_empty
        } else {
            R.string.call_plan_exhausted
        },
    )
    OverlayFrame(
        title = title,
        focus = focus,
        content = {
            Text(
                text = title,
                color = GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 28.sp,
                lineHeight = 34.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() },
            )
        },
        actions = {
            GuardPrimaryButton(
                text = stringResource(R.string.im_fine),
                onClick = { onEvent(PersonaEvent.ImFine) },
                height = 72.dp,
                textStyle = ButtonPerson.copy(fontSize = 22.sp),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus),
            )
        },
    )
}

@Composable
private fun CaneRinging(reduced: Boolean, onEvent: (PersonaEvent) -> Unit) {
    val focus = rememberFocus()
    val title = stringResource(R.string.cane_ringing_title)
    OverlayFrame(
        title = title,
        focus = focus,
        content = {
            CaneWaves(reduced)
            Spacer(Modifier.height(18.dp))
            Text(
                text = title,
                color = GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 32.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = stringResource(R.string.cane_ringing_sub),
                color = GuardColor.WarmGray,
                style = Body.copy(fontSize = 18.sp),
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp),
            )
            Text(
                text = stringResource(R.string.cane_ringing_note),
                color = GuardColor.WarmGray,
                style = Meta,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp),
            )
        },
        actions = {
            GuardPrimaryButton(
                text = stringResource(R.string.found_it),
                onClick = { onEvent(PersonaEvent.FoundCane) },
                kind = FillKind.Ok,
                height = 76.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus),
            )
        },
    )
}

@Composable
private fun CaneWaves(reduced: Boolean) {
    val pulse = if (reduced) {
        1f
    } else {
        val transition = rememberInfiniteTransition(label = "cane-waves")
        val animated by transition.animateFloat(
            initialValue = 0.82f,
            targetValue = 1.12f,
            animationSpec = infiniteRepeatable(tween(1700), RepeatMode.Restart),
            label = "cane-wave",
        )
        animated
    }
    Box(
        Modifier
            .size(200.dp)
            .semantics { hideFromAccessibility() },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(168.dp)
                .graphicsLayer {
                    scaleX = pulse
                    scaleY = pulse
                    alpha = if (reduced) 1f else 0.45f
                }
                .border(2.dp, GuardColor.Caramel, CircleShape),
        )
        if (!reduced) {
            Box(
                Modifier
                    .size(136.dp)
                    .graphicsLayer {
                        scaleX = 2f - pulse
                        scaleY = 2f - pulse
                    }
                    .border(2.dp, GuardColor.Caramel.copy(alpha = 0.7f), CircleShape),
            )
        }
        Box(
            Modifier
                .size(112.dp)
                .clip(CircleShape)
                .background(GuardColor.Brown),
            contentAlignment = Alignment.Center,
        ) {
            GuardGlyph(Glyph.Cane, tint = GuardColor.White, modifier = Modifier.size(48.dp))
        }
    }
}

@Composable
private fun PillOverlay(state: PersonaState, onEvent: (PersonaEvent) -> Unit) {
    val focus = rememberFocus()
    val dose = state.nextDose()
    val family = state.preferred()?.name ?: stringResource(R.string.pill_fallback_name)
    val title = stringResource(R.string.pill_title)
    OverlayFrame(
        title = title,
        focus = focus,
        content = {
            Text(
                text = title,
                color = GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 34.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = stringResource(R.string.pill_sub, dose?.time ?: state.tomorrowTime, family),
                color = GuardColor.WarmGray,
                style = Body.copy(fontSize = 19.sp),
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp, bottom = 16.dp),
            )
            GuardCard {
                Column(
                    Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(
                        Modifier
                            .size(88.dp)
                            .clip(CircleShape)
                            .background(GuardColor.AvatarBlue),
                        contentAlignment = Alignment.Center,
                    ) {
                        GuardGlyph(Glyph.Pill, tint = GuardColor.Meds, modifier = Modifier.size(40.dp))
                    }
                    Text(
                        text = dose?.name ?: stringResource(R.string.no_reminder_today),
                        color = GuardColor.Navy,
                        fontFamily = Figtree,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 30.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                    if (dose != null) {
                        Text(dose.indication, color = GuardColor.WarmGray, style = Body.copy(fontSize = 18.sp), textAlign = TextAlign.Center)
                    }
                }
            }
        },
        actions = {
            GuardPrimaryButton(
                text = stringResource(R.string.took_it),
                onClick = { onEvent(PersonaEvent.TookPillOverlay) },
                kind = FillKind.Ok,
                height = 84.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus),
            )
            GuardOutlineButton(
                text = stringResource(R.string.snooze),
                onClick = { onEvent(PersonaEvent.SnoozePill) },
                height = 60.dp,
                modifier = Modifier.fillMaxWidth(),
            )
        },
    )
}

@Composable
fun DoseSheet(state: PersonaState, doseId: String, onEvent: (PersonaEvent) -> Unit) {
    val dose = state.doses.firstOrNull { it.id == doseId } ?: return
    val title = stringResource(if (dose.taken) R.string.sheet_taken_title else R.string.sheet_pending_title)
    val focus = rememberFocus()
    LaunchedEffect(doseId) { runCatching { focus.requestFocus() } }
    GuardSheet(title = title, onDismiss = { onEvent(PersonaEvent.DismissDose) }) {
        GuardCard {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(GuardColor.AvatarBlue),
                    contentAlignment = Alignment.Center,
                ) {
                    GuardGlyph(Glyph.Pill, tint = GuardColor.Meds, modifier = Modifier.size(24.dp))
                }
                Column {
                    Text(dose.name, color = GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Text(
                        stringResource(R.string.dose_when, dose.time, dose.indication),
                        color = GuardColor.WarmGray,
                        style = Meta,
                    )
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        if (dose.taken) {
            GuardPrimaryButton(
                text = stringResource(R.string.understood),
                onClick = { onEvent(PersonaEvent.DismissDose) },
                height = 72.dp,
                textStyle = ButtonPerson.copy(fontSize = 22.sp),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus),
            )
            GuardTextAction(
                text = stringResource(R.string.undo_taken),
                onClick = { onEvent(PersonaEvent.UndoDose) },
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            GuardPrimaryButton(
                text = stringResource(R.string.yes_taken),
                onClick = { onEvent(PersonaEvent.ConfirmDose) },
                kind = FillKind.Ok,
                height = 80.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus),
            )
            Spacer(Modifier.height(10.dp))
            GuardOutlineButton(
                text = stringResource(R.string.not_yet),
                onClick = { onEvent(PersonaEvent.DismissDose) },
                height = 64.dp,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
fun DeleteContactDialog(state: PersonaState, onEvent: (PersonaEvent) -> Unit) {
    val draft = state.editor ?: return
    val name = draft.name.ifBlank { stringResource(R.string.field_name) }
    val dialogTitle = stringResource(R.string.delete_title, name)
    Box(
        Modifier
            .fillMaxSize()
            .background(GuardColor.Scrim)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = { onEvent(PersonaEvent.CancelDelete) },
            )
            .semantics {
                dialog()
                paneTitle = dialogTitle
            },
    ) {
        GuardCard(
            Modifier
                .padding(24.dp)
                .align(Alignment.Center)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = {},
                ),
        ) {
            Text(
                text = stringResource(R.string.delete_title, name),
                color = GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 24.sp,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = stringResource(R.string.delete_body),
                color = GuardColor.WarmGray,
                style = Body,
                modifier = Modifier.padding(top = 8.dp),
            )
            if (draft.priority != null) {
                Text(
                    text = stringResource(R.string.delete_preferred_warning),
                    color = GuardColor.BrownDark,
                    style = Body,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                GuardOutlineButton(
                    text = stringResource(R.string.cancel),
                    onClick = { onEvent(PersonaEvent.CancelDelete) },
                    height = 56.dp,
                    modifier = Modifier.weight(1f),
                )
                GuardPrimaryButton(
                    text = stringResource(R.string.delete_confirm),
                    onClick = { onEvent(PersonaEvent.ConfirmDelete) },
                    kind = FillKind.Emergency,
                    height = 56.dp,
                    textStyle = ButtonPerson.copy(fontSize = 18.sp),
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}
