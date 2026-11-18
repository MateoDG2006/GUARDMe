package com.example.guardmemobile.persona

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.guardmemobile.R
import com.example.guardmemobile.ui.components.BatteryChip
import com.example.guardmemobile.ui.components.ChipKind
import com.example.guardmemobile.ui.components.FillKind
import com.example.guardmemobile.ui.components.Glyph
import com.example.guardmemobile.ui.components.GuardAvatar
import com.example.guardmemobile.ui.components.GuardCard
import com.example.guardmemobile.ui.components.GuardChip
import com.example.guardmemobile.ui.components.GuardDashedButton
import com.example.guardmemobile.ui.components.GuardGlyph
import com.example.guardmemobile.ui.components.GuardLogo
import com.example.guardmemobile.ui.components.GuardOutlineButton
import com.example.guardmemobile.ui.components.GuardPrimaryButton
import com.example.guardmemobile.ui.components.GuardScreenTitle
import com.example.guardmemobile.ui.components.GuardSearchField
import com.example.guardmemobile.ui.components.GuardSectionTitle
import com.example.guardmemobile.ui.components.GuardSegment
import com.example.guardmemobile.ui.components.GuardTextAction
import com.example.guardmemobile.ui.components.GuardTextField
import com.example.guardmemobile.ui.components.GuardToggleRow
import com.example.guardmemobile.ui.components.GuardWordmark
import com.example.guardmemobile.ui.components.MetricCell
import com.example.guardmemobile.ui.components.StatusKind
import com.example.guardmemobile.ui.components.StatusOrb
import com.example.guardmemobile.ui.theme.Body
import com.example.guardmemobile.ui.theme.BodyStrong
import com.example.guardmemobile.ui.theme.ButtonPerson
import com.example.guardmemobile.ui.theme.Caption
import com.example.guardmemobile.ui.theme.Figtree
import com.example.guardmemobile.ui.theme.GuardColor
import com.example.guardmemobile.ui.theme.Meta
import com.example.guardmemobile.ui.theme.SectionTitle

@Composable
fun PersonaHome(state: PersonaState, onEvent: (PersonaEvent) -> Unit) {
    val preferred = state.preferred()
    val next = state.nextDose()
    val connected = state.caneConnected
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier
                .statusBarsPadding()
                .padding(horizontal = 18.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            GuardLogo(Modifier.size(40.dp, 44.dp))
            Column(
                Modifier
                    .weight(1f)
                    .padding(horizontal = 10.dp),
            ) {
                GuardWordmark()
                Text(
                    text = stringResource(R.string.hello_name, state.firstName),
                    color = GuardColor.WarmGray,
                    style = Meta,
                )
            }
            BatteryChip(
                percent = state.batteryPercent,
                description = stringResource(R.string.battery_cd, state.batteryPercent),
            )
        }
        Column(
            Modifier
                .verticalScroll(rememberScrollState())
                .padding(start = 18.dp, end = 18.dp, top = 8.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            GuardCard {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    StatusOrb(if (connected) StatusKind.Ok else StatusKind.Attention)
                    Column {
                        Text(
                            text = stringResource(if (connected) R.string.status_ok else R.string.status_attention),
                            color = GuardColor.Navy,
                            fontFamily = Figtree,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 28.sp,
                            lineHeight = 32.sp,
                        )
                        Text(
                            text = stringResource(if (connected) R.string.status_ok_sub else R.string.status_attention_sub),
                            color = GuardColor.WarmGray,
                            style = Body,
                        )
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                GuardPrimaryButton(
                    text = stringResource(R.string.emergency_title),
                    subtitle = stringResource(R.string.emergency_sub),
                    onClick = { onEvent(PersonaEvent.Tap911) },
                    kind = FillKind.Emergency,
                    height = 150.dp,
                    radius = 24.dp,
                    stacked = true,
                    textStyle = ButtonPerson.copy(fontSize = 30.sp, lineHeight = 34.sp),
                    icon = { GuardGlyph(Glyph.Cross, tint = GuardColor.White, modifier = Modifier.size(40.dp)) },
                    modifier = Modifier
                        .weight(1f)
                        .height(150.dp)
                        .testTag("persona_911"),
                )
                GuardPrimaryButton(
                    text = if (preferred != null) {
                        stringResource(R.string.call_name, preferred.name)
                    } else {
                        stringResource(R.string.no_preferred_title)
                    },
                    subtitle = preferred?.homeRelation(),
                    onClick = { preferred?.let { onEvent(PersonaEvent.CallContact(it.id)) } },
                    kind = FillKind.Care,
                    height = 150.dp,
                    radius = 24.dp,
                    stacked = true,
                    enabled = preferred != null,
                    icon = { GuardGlyph(Glyph.Phone, tint = GuardColor.White, modifier = Modifier.size(40.dp)) },
                    modifier = Modifier
                        .weight(1f)
                        .height(150.dp)
                        .testTag("persona_call_family"),
                )
            }
            if (preferred == null) {
                Text(
                    text = stringResource(R.string.no_preferred_help),
                    color = GuardColor.WarmGray,
                    style = Body,
                )
            }
            GuardOutlineButton(
                text = stringResource(R.string.find_cane),
                onClick = { onEvent(PersonaEvent.FindCane) },
                height = 64.dp,
                icon = { GuardGlyph(Glyph.Wave, tint = GuardColor.Navy, modifier = Modifier.size(26.dp)) },
                modifier = Modifier.fillMaxWidth(),
            )
            GuardCard {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(GuardColor.AvatarBlue),
                        contentAlignment = Alignment.Center,
                    ) {
                        GuardGlyph(Glyph.Pill, tint = GuardColor.Meds, modifier = Modifier.size(26.dp))
                    }
                    Column {
                        Text(
                            text = stringResource(R.string.next_reminder),
                            color = GuardColor.WarmGray,
                            style = Meta,
                        )
                        Text(
                            text = if (next != null) {
                                stringResource(R.string.next_reminder_value, next.time, next.name)
                            } else {
                                stringResource(R.string.no_reminder_today)
                            },
                            color = GuardColor.Navy,
                            fontFamily = Figtree,
                            fontWeight = FontWeight.Bold,
                            fontSize = 21.sp,
                            lineHeight = 26.sp,
                        )
                    }
                }
            }
            Text(
                text = stringResource(R.string.activity_title),
                color = GuardColor.Navy,
                style = SectionTitle,
                modifier = Modifier.semantics { heading() },
            )
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MetricCell(state.steps.toString(), stringResource(R.string.unit_steps), Modifier.weight(1f))
                MetricCell(state.kilometersLabel, stringResource(R.string.unit_km), Modifier.weight(1f))
                MetricCell(state.calories.toString(), stringResource(R.string.unit_calories), Modifier.weight(1f))
            }
        }
    }
}

@Composable
fun PersonaContacts(state: PersonaState, onEvent: (PersonaEvent) -> Unit) {
    val query = state.query.trim()
    val visible = state.contacts.filter { contact ->
        query.isEmpty() ||
            contact.name.contains(query, ignoreCase = true) ||
            contact.relation.contains(query, ignoreCase = true)
    }
    val preferred = state.preferred()
    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(start = 18.dp, end = 18.dp, top = 20.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        GuardScreenTitle(stringResource(R.string.contacts_title))
        GuardSearchField(
            value = state.query,
            onValueChange = { onEvent(PersonaEvent.Search(it)) },
            placeholder = stringResource(R.string.search_contact),
        )
        if (state.contacts.isEmpty()) {
            Text(
                text = stringResource(R.string.empty_contacts),
                color = GuardColor.Navy,
                style = Body,
            )
        } else if (visible.isEmpty()) {
            Text(
                text = stringResource(R.string.search_empty, state.query.trim()),
                color = GuardColor.Navy,
                style = Body,
            )
        } else {
            if (preferred != null && query.isEmpty()) {
                GuardSectionTitle(stringResource(R.string.preferred_section))
                GuardCard(container = GuardColor.Sand, bordered = false) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        GuardAvatar(preferred.initial(), preferred.avatar)
                        Column {
                            Text(preferred.name, color = GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                            Text(
                                stringResource(R.string.role_phone, preferred.relation, preferred.phone),
                                color = GuardColor.WarmGray,
                                style = Meta,
                            )
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    GuardPrimaryButton(
                        text = stringResource(R.string.call_name, preferred.name),
                        onClick = { onEvent(PersonaEvent.CallContact(preferred.id)) },
                        height = 60.dp,
                        textStyle = ButtonPerson.copy(fontSize = 20.sp),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            GuardSectionTitle(stringResource(R.string.all_contacts))
            visible.forEach { contact ->
                ContactLine(contact, onEvent)
            }
        }
        GuardDashedButton(
            text = stringResource(R.string.add_contact),
            onClick = { onEvent(PersonaEvent.OpenEditor(null)) },
        )
        Text(
            text = stringResource(R.string.preferred_note),
            color = GuardColor.WarmGray,
            style = Meta,
        )
    }
}

@Composable
private fun ContactLine(contact: Contact, onEvent: (PersonaEvent) -> Unit) {
    Row(
        Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        GuardAvatar(contact.initial(), contact.avatar, size = 56.dp)
        Column(Modifier.weight(1f)) {
            Text(
                text = when (contact.priority) {
                    1 -> "${contact.name} · 1"
                    2 -> "${contact.name} · 2"
                    else -> contact.name
                },
                color = GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.Bold,
                fontSize = 20.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = contact.relation,
                color = GuardColor.WarmGray,
                style = Meta,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        CircleAction(
            glyph = Glyph.Pencil,
            description = stringResource(R.string.edit_contact_cd),
            size = 48.dp,
            filled = false,
            onClick = { onEvent(PersonaEvent.OpenEditor(contact.id)) },
        )
        CircleAction(
            glyph = Glyph.Phone,
            description = stringResource(R.string.call_cd_name, contact.name),
            size = 56.dp,
            filled = true,
            onClick = { onEvent(PersonaEvent.CallContact(contact.id)) },
        )
    }
}

@Composable
private fun CircleAction(
    glyph: Glyph,
    description: String,
    size: Dp,
    filled: Boolean,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(size)
            .clip(CircleShape)
            .background(if (filled) GuardColor.Brown else GuardColor.White)
            .border(if (filled) 0.dp else 1.dp, GuardColor.Border, CircleShape)
            .clickable(role = Role.Button, onClickLabel = description, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        GuardGlyph(
            glyph,
            tint = if (filled) GuardColor.White else GuardColor.Navy,
            modifier = Modifier.size(if (filled) 26.dp else 22.dp),
        )
    }
}

@Composable
fun PersonaEditor(state: PersonaState, onEvent: (PersonaEvent) -> Unit, modifier: Modifier = Modifier) {
    val draft = state.editor ?: return
    Column(
        modifier
            .fillMaxSize()
            .background(GuardColor.Cream)
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            CircleAction(
                glyph = Glyph.Back,
                description = stringResource(R.string.back),
                size = 48.dp,
                filled = false,
                onClick = { onEvent(PersonaEvent.CloseEditor) },
            )
            Text(
                text = stringResource(if (draft.id == null) R.string.new_contact else R.string.edit_contact),
                color = GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 26.sp,
                modifier = Modifier
                    .padding(start = 12.dp)
                    .semantics { heading() },
            )
        }
        Column(
            Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            GuardAvatar(
                initial = draft.name.ifBlank { "?" }.trim().first().uppercaseChar().toString(),
                kind = draft.avatar,
                size = 96.dp,
            )
            GuardOutlineButton(
                text = stringResource(R.string.change_photo),
                onClick = { onEvent(PersonaEvent.PhotoTapped) },
                height = 52.dp,
            )
        }
        GuardTextField(
            label = stringResource(R.string.field_name),
            value = draft.name,
            onValueChange = { onEvent(PersonaEvent.UpdateDraft(draft.copy(name = it))) },
            error = if (state.editorError == FieldError.Name) stringResource(R.string.error_name) else null,
        )
        GuardTextField(
            label = stringResource(R.string.field_relation),
            value = draft.relation,
            onValueChange = { onEvent(PersonaEvent.UpdateDraft(draft.copy(relation = it))) },
            placeholder = "hija",
        )
        GuardTextField(
            label = stringResource(R.string.field_phone),
            value = draft.phone,
            onValueChange = { onEvent(PersonaEvent.UpdateDraft(draft.copy(phone = it))) },
            error = if (state.editorError == FieldError.Phone) stringResource(R.string.error_phone) else null,
            keyboardType = androidx.compose.ui.text.input.KeyboardType.Phone,
        )
        listOf(
            1 to R.string.priority_1,
            2 to R.string.priority_2,
            null to R.string.priority_none,
        ).forEach { (value, label) ->
            GuardOutlineButton(
                text = stringResource(label) + if (draft.priority == value) " ✓" else "",
                onClick = { onEvent(PersonaEvent.UpdateDraft(draft.copy(priority = value))) },
                height = 52.dp,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        GuardPrimaryButton(
            text = stringResource(R.string.save_changes),
            onClick = { onEvent(PersonaEvent.SaveContact) },
            height = 60.dp,
            textStyle = ButtonPerson.copy(fontSize = 20.sp),
            modifier = Modifier.fillMaxWidth(),
        )
        if (draft.id != null) {
            GuardTextAction(
                text = stringResource(R.string.delete_contact),
                onClick = { onEvent(PersonaEvent.AskDelete) },
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                text = stringResource(R.string.delete_note),
                color = GuardColor.WarmGray,
                style = Caption,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
fun PersonaReminders(state: PersonaState, onEvent: (PersonaEvent) -> Unit) {
    val today = state.doses.filter { it.bucket == DayBucket.Today }
    val visible = when (state.segment) {
        ReminderSegment.Today -> today
        ReminderSegment.Week -> state.doses
    }
    val allTaken = today.isNotEmpty() && today.all { it.taken }
    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(start = 18.dp, end = 18.dp, top = 20.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        GuardScreenTitle(stringResource(R.string.tab_reminders))
        GuardSegment(
            labels = listOf(
                stringResource(R.string.segment_today),
                stringResource(R.string.segment_week),
            ),
            selectedIndex = if (state.segment == ReminderSegment.Today) 0 else 1,
            onSelect = { index ->
                onEvent(
                    PersonaEvent.SelectSegment(
                        if (index == 0) ReminderSegment.Today else ReminderSegment.Week,
                    ),
                )
            },
        )
        Text(stringResource(R.string.hint_today), color = GuardColor.WarmGray, style = Meta)
        if (state.segment == ReminderSegment.Today && today.isEmpty()) {
            Text(stringResource(R.string.empty_today), color = GuardColor.Navy, style = Body)
        } else if (state.segment == ReminderSegment.Today && allTaken) {
            GuardCard(container = GuardColor.Sand, bordered = false) {
                Text(stringResource(R.string.all_taken_title), color = GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp)
                Text(
                    stringResource(R.string.all_taken_sub, state.tomorrowTime),
                    color = GuardColor.BrownDark,
                    style = Body,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
        if (state.segment == ReminderSegment.Week) {
            DayBucket.entries.forEach { bucket ->
                val rows = visible.filter { it.bucket == bucket }
                if (rows.isNotEmpty()) {
                    GuardSectionTitle(bucketLabel(bucket))
                    rows.forEach { dose -> DoseRow(dose) { onEvent(PersonaEvent.OpenDose(dose.id)) } }
                }
            }
        } else {
            visible.forEach { dose -> DoseRow(dose) { onEvent(PersonaEvent.OpenDose(dose.id)) } }
        }
        if (state.appointments.isNotEmpty()) {
            GuardSectionTitle(stringResource(R.string.upcoming_title))
            state.appointments.forEach { appointment ->
                GuardCard {
                    Text(appointment.dayLabel, color = GuardColor.WarmGray, style = Meta)
                    Text(appointment.title, color = GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Text(
                        "${appointment.time} · ${appointment.place}",
                        color = GuardColor.WarmGray,
                        style = Meta,
                    )
                    Spacer(Modifier.height(8.dp))
                    GuardChip(stringResource(R.string.chip_visit), ChipKind.Info)
                }
            }
        }
    }
}

@Composable
private fun bucketLabel(bucket: DayBucket): String = when (bucket) {
    DayBucket.Today -> stringResource(R.string.bucket_today)
    DayBucket.Tomorrow -> stringResource(R.string.bucket_tomorrow)
    DayBucket.Later -> stringResource(R.string.bucket_later)
}

@Composable
private fun DoseRow(dose: Dose, onClick: () -> Unit) {
    val borderColor = if (dose.taken) GuardColor.Border else GuardColor.Caramel
    val borderWidth = if (dose.taken) 1.dp else 2.dp
    Row(
        Modifier
            .fillMaxWidth()
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(20.dp))
            .background(GuardColor.White)
            .border(borderWidth, borderColor, androidx.compose.foundation.shape.RoundedCornerShape(20.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = dose.time,
            color = GuardColor.Navy,
            fontFamily = Figtree,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 24.sp,
            modifier = Modifier.width(74.dp),
        )
        Column(
            Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(dose.name, color = GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Text(dose.indication, color = GuardColor.WarmGray, style = Meta)
            GuardChip(
                text = stringResource(if (dose.taken) R.string.chip_taken else R.string.chip_pending),
                kind = if (dose.taken) ChipKind.Taken else ChipKind.Pending,
            )
        }
    }
}

@Composable
fun PersonaCane(
    state: PersonaState,
    onEvent: (PersonaEvent) -> Unit,
    onLogout: () -> Unit = {},
) {
    val low = state.batteryPercent < 20
    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(start = 18.dp, end = 18.dp, top = 20.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        GuardScreenTitle(stringResource(R.string.cane_title))
        GuardCard {
            Text(
                text = "${state.batteryPercent} %",
                color = if (low) GuardColor.Emergency else GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 56.sp,
                lineHeight = 60.sp,
            )
            Text(stringResource(R.string.battery_word), color = GuardColor.WarmGray, style = Body)
            Text(
                text = when {
                    low -> stringResource(R.string.cane_low)
                    state.caneConnected -> stringResource(R.string.cane_ok)
                    else -> stringResource(R.string.disconnected)
                },
                color = GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.Bold,
                fontSize = 20.sp,
                modifier = Modifier.padding(top = 8.dp),
            )
            if (!low && state.caneConnected) {
                Text(stringResource(R.string.cane_days), color = GuardColor.WarmGray, style = Body)
            }
        }
        GuardCard {
            CaneFact(
                stringResource(R.string.row_connection),
                stringResource(if (state.caneConnected) R.string.connected else R.string.disconnected),
                if (state.caneConnected) GuardColor.Ok else GuardColor.Attention,
            )
            Spacer(Modifier.height(10.dp))
            CaneFact(
                stringResource(R.string.row_sensors),
                stringResource(if (state.sensorsOk) R.string.sensors_ok else R.string.sensors_review),
                if (state.sensorsOk) GuardColor.Ok else GuardColor.Attention,
            )
            Spacer(Modifier.height(10.dp))
            CaneFact(stringResource(R.string.row_last_use), state.lastUse, GuardColor.Navy)
        }
        if (!state.caneConnected) {
            Text(stringResource(R.string.disconnected_help), color = GuardColor.WarmGray, style = Body)
            GuardPrimaryButton(
                text = stringResource(R.string.cane_setup_action),
                subtitle = stringResource(R.string.cane_setup_action_hint),
                onClick = { onEvent(PersonaEvent.OpenCaneSetup) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        GuardOutlineButton(
            text = stringResource(R.string.ring_cane),
            onClick = { onEvent(PersonaEvent.FindCane) },
            modifier = Modifier.fillMaxWidth(),
            icon = { GuardGlyph(Glyph.Wave, tint = GuardColor.Navy, modifier = Modifier.size(26.dp)) },
        )
        GuardCard(container = GuardColor.Sand, bordered = false) {
            Text(
                stringResource(R.string.button_guide_title),
                color = GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 22.sp,
            )
            GuideStep("1", stringResource(R.string.guide_1))
            GuideStep("2", stringResource(R.string.guide_2))
            GuideStep("3", stringResource(R.string.guide_3))
        }
        GuardOutlineButton(
            text = stringResource(R.string.logout),
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun CaneFact(label: String, value: String, valueColor: androidx.compose.ui.graphics.Color) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = GuardColor.WarmGray, style = Meta)
        Text(value, color = valueColor, style = BodyStrong, textAlign = TextAlign.End)
    }
}

@Composable
private fun GuideStep(number: String, text: String) {
    Row(
        Modifier.padding(top = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(GuardColor.White),
            contentAlignment = Alignment.Center,
        ) {
            Text(number, color = GuardColor.BrownDark, fontFamily = Figtree, fontWeight = FontWeight.ExtraBold)
        }
        Text(text, color = GuardColor.BrownDeep, style = Body, modifier = Modifier.weight(1f))
    }
}
