package com.example.guardmemobile.cuidador

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.guardmemobile.R
import com.example.guardmemobile.persona.AvatarKind
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
import com.example.guardmemobile.ui.components.GuardSectionTitle
import com.example.guardmemobile.ui.components.GuardTextField
import com.example.guardmemobile.ui.components.GuardToggleRow
import com.example.guardmemobile.ui.components.GuardWordmark
import com.example.guardmemobile.ui.components.GuardLocationMap
import com.example.guardmemobile.ui.components.MetricCell
import com.example.guardmemobile.ui.components.StatusKind
import com.example.guardmemobile.ui.components.StatusOrb
import com.example.guardmemobile.ui.theme.Body
import com.example.guardmemobile.ui.theme.ButtonCare
import com.example.guardmemobile.ui.theme.Caption
import com.example.guardmemobile.ui.theme.Figtree
import com.example.guardmemobile.ui.theme.GuardColor
import com.example.guardmemobile.ui.theme.Meta

@Composable
fun CuidadorHome(state: CuidadorState, viewModel: CuidadorViewModel) {
    CareScroll {
        Row(verticalAlignment = Alignment.CenterVertically) {
            GuardLogo(Modifier.size(40.dp, 44.dp))
            Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                GuardWordmark()
                Text(stringResource(R.string.tagline), color = GuardColor.WarmGray, style = Meta)
            }
            val notificationsLabel = stringResource(R.string.notif_cd, state.unread)
            Box(
                Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(GuardColor.White)
                    .border(1.dp, GuardColor.Border, CircleShape)
                    .clickable(role = Role.Button, onClick = { viewModel.open(CareScreen.Notifications) })
                    .semantics { contentDescription = notificationsLabel },
                contentAlignment = Alignment.Center,
            ) {
                GuardGlyph(Glyph.Bell, modifier = Modifier.size(24.dp))
                if (state.unread > 0) {
                    Box(
                        Modifier
                            .align(Alignment.TopEnd)
                            .padding(8.dp)
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(GuardColor.Emergency),
                    )
                }
            }
        }
        if (state.alert != null) {
            GuardCard(modifier = Modifier.clickable { viewModel.open(CareScreen.Alert) }) {
                Text(stringResource(R.string.alert_banner_title, state.firstName), color = GuardColor.Emergency, fontFamily = Figtree, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
                Text(stringResource(R.string.alert_banner_meta), color = GuardColor.WarmGray, style = Meta, modifier = Modifier.padding(top = 4.dp, bottom = 12.dp))
                GuardPrimaryButton(
                    text = stringResource(R.string.call_911),
                    onClick = { viewModel.startCall(CareCall.Emergency) },
                    kind = FillKind.Emergency,
                    height = 56.dp,
                    textStyle = ButtonCare,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                GuardPrimaryButton(
                    text = stringResource(R.string.call_name, state.firstName),
                    onClick = { viewModel.startCall(CareCall.Person) },
                    height = 56.dp,
                    textStyle = ButtonCare,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        GuardCard {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                GuardAvatar("R", AvatarKind.Warm, size = 56.dp)
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(
                            R.string.person_line,
                            state.profile.fullName,
                            stringResource(if (state.alert != null) R.string.needs_attention else R.string.status_ok),
                        ),
                        color = GuardColor.Navy,
                        fontFamily = Figtree,
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                    )
                    Text(state.locationLabel, color = GuardColor.WarmGray, style = Meta)
                    Text(
                        stringResource(R.string.live_link),
                        color = GuardColor.BrownDark,
                        fontFamily = Figtree,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        modifier = Modifier
                            .padding(top = 4.dp)
                            .clickable { viewModel.open(CareScreen.Live) },
                    )
                }
                StatusOrb(if (state.alert != null) StatusKind.Attention else StatusKind.Ok, size = 44.dp)
            }
        }
        GuardSectionTitle(stringResource(R.string.today_label))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricCell(state.steps.toString(), stringResource(R.string.unit_steps), Modifier.weight(1f))
            MetricCell(state.kilometersLabel, stringResource(R.string.unit_km), Modifier.weight(1f))
            MetricCell(state.pillsLabel, stringResource(R.string.pills_unit), Modifier.weight(1f))
        }
        GuardCard(container = GuardColor.Sand, bordered = false) {
            Text(stringResource(R.string.adherence_title), color = GuardColor.BrownDark, style = Meta)
            Text("${state.adherence} %", color = GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.ExtraBold, fontSize = 28.sp)
            Text(stringResource(R.string.adherence_detail, state.takenWeek, state.missedWeek), color = GuardColor.BrownDeep, style = Body)
            Text(
                stringResource(R.string.history_link),
                color = GuardColor.BrownDark,
                fontFamily = Figtree,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .padding(top = 8.dp)
                    .clickable { viewModel.selectTab(CareTab.History) },
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            GuardSectionTitle(stringResource(R.string.reminders_short))
            Text(
                stringResource(R.string.new_short),
                color = GuardColor.BrownDark,
                fontFamily = Figtree,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable { viewModel.open(CareScreen.NewReminder) },
            )
        }
        state.reminders.take(2).forEach { reminder ->
            Text("${reminder.time} · ${reminder.title}", color = GuardColor.Navy, style = Body)
        }
        GuardSectionTitle(stringResource(R.string.cane_of, state.firstName))
        GuardCard {
            Text(state.caneSerial, color = GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Column {
                    Text(
                        if (state.batteryPercent > 0) "${state.batteryPercent} %" else "—",
                        color = GuardColor.Navy,
                        fontFamily = Figtree,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 28.sp,
                    )
                    Text(
                        stringResource(if (state.caneConnected) R.string.connected else R.string.disconnected),
                        color = if (state.caneConnected) GuardColor.Ok else GuardColor.Attention,
                        style = Body,
                    )
                    Text(
                        when (state.caneSensorStatus) {
                            "ok" -> stringResource(R.string.sensors_ok)
                            "fault" -> stringResource(R.string.sensors_review)
                            else -> stringResource(R.string.sensor_unknown)
                        },
                        color = if (state.caneSensorStatus == "fault") GuardColor.Attention else GuardColor.WarmGray,
                        style = Caption,
                    )
                }
                BatteryChip(state.batteryPercent, stringResource(R.string.battery_cd, state.batteryPercent))
            }
            GuardOutlineButton(
                text = stringResource(R.string.ring_cane),
                onClick = { viewModel.caneAction(CareToast.Ringing) },
                height = 52.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            GuardSectionTitle(stringResource(R.string.team_preview))
            Text(
                stringResource(R.string.invite_short),
                color = GuardColor.BrownDark,
                fontFamily = Figtree,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable { viewModel.open(CareScreen.Invite) },
            )
        }
        state.members.take(3).forEach { member -> MemberRow(member) }
        Text(stringResource(R.string.role_note), color = GuardColor.WarmGray, style = Caption)
    }
}

@Composable
fun CuidadorAlert(state: CuidadorState, viewModel: CuidadorViewModel) {
    val auto = state.alert == AlertMode.Auto911
    val family = state.members.firstOrNull { it.isYou }?.name ?: "Ana"
    Column(Modifier.fillMaxSize().background(GuardColor.Cream)) {
        Column(Modifier.fillMaxWidth().background(GuardColor.Emergency).statusBarsPadding().padding(18.dp)) {
            Text(
                text = if (auto) stringResource(R.string.alert_auto_eyebrow) else stringResource(R.string.alert_eyebrow, "2 MIN"),
                color = GuardColor.White,
                fontFamily = Figtree,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
                letterSpacing = 0.5.sp,
            )
            Text(
                text = stringResource(R.string.alert_title, state.firstName),
                color = GuardColor.White,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 28.sp,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = if (auto) stringResource(R.string.alert_auto_sub, family) else stringResource(R.string.alert_sub, "14:02"),
                color = GuardColor.White,
                style = Body,
            )
        }
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            GuardLocationMap(
                lat = state.locationLat,
                lng = state.locationLng,
                modifier = Modifier.fillMaxWidth().height(170.dp),
                placeholder = state.locationLabel,
            )
            Text(state.locationLabel, color = GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.Bold, fontSize = 17.sp)
            Text(
                stringResource(
                    R.string.city_line,
                    locationAgeLabel(state.locationAgeSeconds),
                    locationAccuracyLabel(state.locationAccuracyM),
                ),
                color = GuardColor.WarmGray,
                style = Meta,
            )
            GuardOutlineButton(stringResource(R.string.how_to_get), viewModel::openDirections, Modifier.fillMaxWidth(), height = 48.dp)
            if (auto) {
                GuardCard(container = GuardColor.Sand, bordered = false) {
                    Text(stringResource(R.string.auto_status), color = GuardColor.Emergency, fontFamily = Figtree, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
                    Text(stringResource(R.string.auto_banner, state.firstName, family), color = GuardColor.Navy, style = Body, modifier = Modifier.padding(top = 4.dp))
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (!auto) {
                    GuardPrimaryButton(stringResource(R.string.call_911), { viewModel.startCall(CareCall.Emergency) }, Modifier.weight(1f).height(60.dp), FillKind.Emergency, height = 60.dp, textStyle = ButtonCare.copy(fontSize = 16.sp))
                }
                GuardPrimaryButton(stringResource(R.string.call_name, state.firstName), { viewModel.startCall(CareCall.Person) }, Modifier.weight(1f).height(60.dp), height = 60.dp, textStyle = ButtonCare.copy(fontSize = 16.sp))
            }
            GuardOutlineButton(stringResource(R.string.ring_their), { viewModel.caneAction(CareToast.Ringing) }, Modifier.fillMaxWidth(), height = 52.dp)
            GuardCard(container = GuardColor.Sand, bordered = false) {
                if (state.handlerName == null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        GuardAvatar("L", AvatarKind.Warm, size = 46.dp)
                        Text(stringResource(R.string.coord_waiting, "Luis"), color = GuardColor.Navy, style = Body, modifier = Modifier.weight(1f))
                    }
                    Spacer(Modifier.height(10.dp))
                    GuardPrimaryButton(stringResource(R.string.i_handle), viewModel::acceptResponsibility, Modifier.fillMaxWidth(), FillKind.Navy, height = 44.dp, radius = 20.dp, textStyle = ButtonCare)
                } else {
                    Text(stringResource(R.string.coord_handling, state.handlerName), color = GuardColor.Navy, style = Body)
                }
            }
            GuardSectionTitle(stringResource(R.string.tab_history))
            timeline(auto).forEach { line ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.padding(top = 6.dp).size(10.dp).clip(CircleShape).background(if (line.startsWith("GuardMe")) GuardColor.Emergency else GuardColor.Brown))
                    Text(line, color = GuardColor.Navy, style = Body, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

private fun timeline(auto: Boolean): List<String> {
    val base = listOf(
        "14:02 · El bastón detectó un golpe con giro",
        "14:02 · Rosa vio «¿Está bien?» en su celular",
        "14:03 · Sin respuesta: te avisamos a ti y a Luis",
    )
    if (!auto) return base
    return base + listOf(
        "14:03 · Llamada a Ana · intento 1 · sin respuesta",
        "14:04 · Llamada a Ana · intento 2 · sin respuesta",
        "14:04 · Terminaron los intentos. La llamada automática al 911 está pendiente.",
    )
}

@Composable
fun CuidadorLive(state: CuidadorState, viewModel: CuidadorViewModel) {
    val ageLabel = locationAgeLabel(state.locationAgeSeconds)
    val accuracyLabel = locationAccuracyLabel(state.locationAccuracyM)
    CarePage(stringResource(R.string.live_header), viewModel::back) {
        GuardCard {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                GuardAvatar("R", AvatarKind.Warm)
                Column {
                    Text(stringResource(R.string.live_walking, state.firstName), color = GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Text(state.locationLabel, color = GuardColor.WarmGray, style = Meta)
                    Text(ageLabel, color = GuardColor.WarmGray, style = Caption)
                }
            }
        }
        GuardLocationMap(
            lat = state.locationLat,
            lng = state.locationLng,
            modifier = Modifier.fillMaxWidth().height(180.dp),
            placeholder = state.locationLabel,
        )
        Text(
            stringResource(R.string.city_line, ageLabel, accuracyLabel),
            color = GuardColor.Navy,
            style = Body,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricCell("—", stringResource(R.string.km_from_home), Modifier.weight(1f))
            MetricCell(
                state.locationAgeSeconds?.let { (it / 60).coerceAtLeast(0).toString() } ?: "—",
                stringResource(R.string.min_out),
                Modifier.weight(1f),
            )
            MetricCell(accuracyLabel, stringResource(R.string.accuracy_label), Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GuardOutlineButton(stringResource(R.string.how_to_get), viewModel::openDirections, Modifier.weight(1f), height = 52.dp)
            GuardPrimaryButton(stringResource(R.string.call_name, state.firstName), { viewModel.startCall(CareCall.Person) }, Modifier.weight(1f), height = 52.dp, textStyle = ButtonCare)
        }
        // shortcut: backend only stores latest point, not a trail; replace when location history exists
        GuardSectionTitle(stringResource(R.string.route_today))
        if (state.locationLat == null || state.locationLng == null) {
            Text(stringResource(R.string.route_empty), color = GuardColor.WarmGray, style = Body)
        } else {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    stringResource(R.string.route_last_known),
                    color = GuardColor.Navy,
                    style = Body,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    state.locationTimeLabel.ifBlank { ageLabel },
                    color = GuardColor.WarmGray,
                    style = Meta,
                )
            }
            Text(state.locationLabel, color = GuardColor.WarmGray, style = Caption)
        }
    }
}

@Composable
private fun locationAgeLabel(ageSeconds: Int?): String = when {
    ageSeconds == null -> stringResource(R.string.location_age_unknown)
    ageSeconds < 60 -> stringResource(R.string.seconds_ago, ageSeconds)
    else -> stringResource(R.string.minutes_ago, ageSeconds / 60)
}

@Composable
private fun locationAccuracyLabel(accuracyM: Double?): String =
    if (accuracyM == null) stringResource(R.string.accuracy_unknown)
    else stringResource(R.string.accuracy_value, accuracyM)

@Composable
fun CuidadorNotifications(state: CuidadorState, viewModel: CuidadorViewModel) {
    val visible = state.notices.filter { state.visibleToRole(it) }.filter {
        state.notifFilter == NotifFilter.All || it.urgent
    }
    CarePage(stringResource(R.string.notif_title), viewModel::back) {
        Text(
            stringResource(R.string.mark_read),
            color = GuardColor.BrownDark,
            fontFamily = Figtree,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.clickable(onClick = viewModel::markAllRead),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(stringResource(R.string.filter_all), state.notifFilter == NotifFilter.All) { viewModel.setNotifFilter(NotifFilter.All) }
            FilterChip(stringResource(R.string.filter_urgent), state.notifFilter == NotifFilter.Urgent) { viewModel.setNotifFilter(NotifFilter.Urgent) }
        }
        if (visible.isEmpty()) {
            Text(stringResource(R.string.notif_empty), color = GuardColor.Navy, style = Body)
        } else {
            listOf(stringResource(R.string.day_today), stringResource(R.string.day_yesterday)).forEach { day ->
                val rows = visible.filter { it.day == day }
                if (rows.isNotEmpty()) {
                    GuardSectionTitle(day)
                    rows.forEach { notice ->
                        GuardCard(
                            modifier = Modifier.clickable { viewModel.openNotice(notice.id) },
                            container = if (notice.read) GuardColor.White else GuardColor.Sand,
                        ) {
                            Text(notice.title, color = if (notice.urgent) GuardColor.Emergency else GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            Text(notice.body, color = GuardColor.Navy, style = Body, modifier = Modifier.padding(top = 4.dp))
                            Text(notice.time, color = GuardColor.WarmGray, style = Caption, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }
            }
        }
        Text(
            stringResource(R.string.prefs_link),
            color = GuardColor.BrownDark,
            style = Body,
            textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline,
            modifier = Modifier.clickable { viewModel.show(CareToast.Preferences) },
        )
    }
}

@Composable
fun CuidadorHistory(state: CuidadorState, viewModel: CuidadorViewModel) {
    val filtered = state.history.filter { event ->
        when (state.historyFilter) {
            HistoryFilter.All -> true
            HistoryFilter.Falls -> event.kind == HistoryKind.Fall
            HistoryFilter.Meds -> event.kind == HistoryKind.Medication
            HistoryFilter.Activity -> event.kind == HistoryKind.Activity
        }
    }
    CareScroll {
        GuardScreenTitle(stringResource(R.string.history_title, state.firstName))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(stringResource(R.string.filter_everything), state.historyFilter == HistoryFilter.All) { viewModel.setHistoryFilter(HistoryFilter.All) }
            FilterChip(stringResource(R.string.filter_falls), state.historyFilter == HistoryFilter.Falls) { viewModel.setHistoryFilter(HistoryFilter.Falls) }
            FilterChip(stringResource(R.string.filter_meds), state.historyFilter == HistoryFilter.Meds) { viewModel.setHistoryFilter(HistoryFilter.Meds) }
            FilterChip(stringResource(R.string.filter_activity), state.historyFilter == HistoryFilter.Activity) { viewModel.setHistoryFilter(HistoryFilter.Activity) }
        }
        GuardCard(container = GuardColor.Sand, bordered = false) {
            Text("${state.fallCount} ${stringResource(R.string.summary_falls)} · ${stringResource(R.string.summary_days)}", color = GuardColor.Navy, style = Body)
            Text("${state.falseAlarms} ${stringResource(R.string.summary_false)} · ${state.adherence} % ${stringResource(R.string.summary_adherence)} · ${state.weekKm} ${stringResource(R.string.summary_km)}", color = GuardColor.BrownDark, style = Meta)
            WeekBars(state.weekBars)
        }
        if (filtered.isEmpty()) {
            val word = when (state.historyFilter) {
                HistoryFilter.Falls -> stringResource(R.string.empty_falls)
                HistoryFilter.Meds -> stringResource(R.string.empty_meds)
                HistoryFilter.Activity -> stringResource(R.string.empty_activity)
                HistoryFilter.All -> stringResource(R.string.empty_events)
            }
            Text(stringResource(R.string.history_empty, word), color = GuardColor.Navy, style = Body)
        } else {
            listOf("Hoy", "Ayer").forEach { day ->
                val rows = filtered.filter { it.day == day }
                if (rows.isNotEmpty()) {
                    GuardSectionTitle(day)
                    rows.forEach { event ->
                        GuardCard {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(event.title, color = GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.weight(1f))
                                Text(event.time, color = GuardColor.WarmGray, style = Caption)
                            }
                            Text(event.body, color = GuardColor.WarmGray, style = Meta, modifier = Modifier.padding(top = 4.dp))
                            if (event.badge != null) {
                                Spacer(Modifier.height(8.dp))
                                GuardChip(event.badge, ChipKind.Taken)
                            }
                            event.details.forEach { detail ->
                                Text("· $detail", color = GuardColor.Navy, style = Caption, modifier = Modifier.padding(top = 4.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun CuidadorReminders(state: CuidadorState, viewModel: CuidadorViewModel) {
    val pending = state.reminders.any { !it.confirmed }
    CareScroll {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            GuardScreenTitle(stringResource(R.string.tab_reminders))
            GuardPrimaryButton(stringResource(R.string.new_short), { viewModel.open(CareScreen.NewReminder) }, height = 44.dp, radius = 16.dp, textStyle = ButtonCare)
        }
        if (state.reminders.isEmpty()) {
            Text(stringResource(R.string.empty_reminders, state.firstName), color = GuardColor.Navy, style = Body)
            GuardPrimaryButton(stringResource(R.string.new_reminder), { viewModel.open(CareScreen.NewReminder) }, Modifier.fillMaxWidth(), height = 52.dp, textStyle = ButtonCare)
        } else {
            if (pending) {
                GuardCard {
                    Text(stringResource(R.string.unconfirmed_title), color = GuardColor.Attention, fontFamily = Figtree, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                    Text(stringResource(R.string.unconfirmed_body, state.firstName), color = GuardColor.Navy, style = Body, modifier = Modifier.padding(vertical = 8.dp))
                    GuardPrimaryButton(stringResource(R.string.call_name, state.firstName), { viewModel.startCall(CareCall.Person) }, Modifier.fillMaxWidth(), height = 52.dp, textStyle = ButtonCare)
                }
            }
            GuardSectionTitle(stringResource(R.string.today_label))
            state.reminders.forEach { reminder ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(reminder.time, color = GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, modifier = Modifier.width(72.dp))
                    Column(Modifier.weight(1f)) {
                        Text(reminder.title, color = GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Text(reminder.detail, color = GuardColor.WarmGray, style = Caption)
                    }
                    GuardChip(
                        stringResource(if (reminder.confirmed) R.string.chip_taken else R.string.chip_unconfirmed),
                        if (reminder.confirmed) ChipKind.Taken else ChipKind.Pending,
                    )
                }
            }
            GuardSectionTitle(stringResource(R.string.active_meds))
            state.meds.forEach { med ->
                Text(med.name, color = GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text(med.detail, color = GuardColor.WarmGray, style = Meta)
            }
            GuardSectionTitle(stringResource(R.string.visits))
            state.visits.forEach { visit ->
                GuardCard {
                    Text(visit.whenLabel, color = GuardColor.WarmGray, style = Meta)
                    Text(visit.title, color = GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Text(visit.note, color = GuardColor.WarmGray, style = Meta)
                    Spacer(Modifier.height(6.dp))
                    GuardChip(stringResource(R.string.chip_visit), ChipKind.Info)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CuidadorNewReminder(state: CuidadorState, viewModel: CuidadorViewModel) {
    val draft = state.draft
    val valid = draft.name.isNotBlank() && draft.times.isNotEmpty() && draft.days.isNotEmpty()
    val nameLabel = when (draft.type) {
        ReminderType.Pill -> stringResource(R.string.field_medicine)
        ReminderType.Visit -> stringResource(R.string.field_reason)
        ReminderType.Other -> stringResource(R.string.field_title_other)
    }
    val detailLabel = when (draft.type) {
        ReminderType.Pill -> stringResource(R.string.field_dose)
        ReminderType.Visit -> stringResource(R.string.field_place)
        ReminderType.Other -> stringResource(R.string.field_detail)
    }
    CarePage(stringResource(R.string.new_reminder), viewModel::back) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(stringResource(R.string.type_pill), draft.type == ReminderType.Pill) { viewModel.updateDraft(draft.copy(type = ReminderType.Pill)) }
            FilterChip(stringResource(R.string.type_visit), draft.type == ReminderType.Visit) { viewModel.updateDraft(draft.copy(type = ReminderType.Visit)) }
            FilterChip(stringResource(R.string.type_other), draft.type == ReminderType.Other) { viewModel.updateDraft(draft.copy(type = ReminderType.Other)) }
        }
        GuardTextField(nameLabel, draft.name, { viewModel.updateDraft(draft.copy(name = it)) }, error = if (draft.showError && draft.name.isBlank()) stringResource(R.string.reminder_need_name) else null)
        GuardTextField(detailLabel, draft.detail, { viewModel.updateDraft(draft.copy(detail = it)) })
        Text(stringResource(R.string.field_times), color = GuardColor.Navy, style = Meta)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            draft.times.forEach { time ->
                val removeLabel = stringResource(R.string.remove_time, time)
                GuardChip(
                    time,
                    ChipKind.Info,
                    Modifier
                        .clickable { viewModel.removeTime(time) }
                        .semantics { contentDescription = removeLabel },
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            GuardTextField(
                label = stringResource(R.string.time_hint),
                value = draft.timeInput,
                onValueChange = { viewModel.updateDraft(draft.copy(timeInput = it)) },
                placeholder = stringResource(R.string.time_hint),
                modifier = Modifier.weight(1f),
            )
        }
        GuardOutlineButton(stringResource(R.string.add_time), viewModel::addTime, Modifier.fillMaxWidth(), height = 52.dp)
        Text(stringResource(R.string.field_days), color = GuardColor.Navy, style = Meta)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("L", "M", "X", "J", "V", "S", "D").forEachIndexed { index, label ->
                val selected = draft.days.contains(index)
                Box(
                    Modifier
                        .weight(1f)
                        .heightIn(min = 44.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (selected) GuardColor.Brown else GuardColor.White)
                        .border(1.dp, if (selected) GuardColor.Brown else GuardColor.Border, RoundedCornerShape(12.dp))
                        .clickable { viewModel.toggleDay(index) },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(label, color = if (selected) GuardColor.White else GuardColor.Navy, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal)
                }
            }
        }
        GuardToggleRow(stringResource(R.string.toggle_unconfirmed), draft.notifyIfUnconfirmed, { viewModel.updateDraft(draft.copy(notifyIfUnconfirmed = it)) }, yesLabel = stringResource(R.string.yes), noLabel = stringResource(R.string.no))
        GuardToggleRow(stringResource(R.string.toggle_repeat, state.firstName), draft.repeat, { viewModel.updateDraft(draft.copy(repeat = it)) }, yesLabel = stringResource(R.string.yes), noLabel = stringResource(R.string.no))
        GuardToggleRow(stringResource(R.string.toggle_share), draft.shareWithDoctor, { viewModel.updateDraft(draft.copy(shareWithDoctor = it)) }, yesLabel = stringResource(R.string.yes), noLabel = stringResource(R.string.no))
        if (!valid) {
            Text(stringResource(R.string.reminder_invalid), color = if (draft.showError) GuardColor.DangerText else GuardColor.WarmGray, style = Meta)
        }
        GuardPrimaryButton(
            text = stringResource(R.string.save_reminder),
            onClick = viewModel::saveReminder,
            enabled = valid,
            height = 56.dp,
            textStyle = ButtonCare,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
fun CuidadorCane(state: CuidadorState, viewModel: CuidadorViewModel) {
    val sensorLabel = when (state.caneSensorStatus) {
        "ok" -> stringResource(R.string.sensor_ok)
        "fault" -> stringResource(R.string.sensor_fault)
        else -> stringResource(R.string.sensor_unknown)
    }
    val sensorChip = when (state.caneSensorStatus) {
        "ok" -> ChipKind.Taken
        "fault" -> ChipKind.Pending
        else -> ChipKind.Info
    }
    val linkLabel = when (state.caneLinkState) {
        "connected" -> stringResource(R.string.connected)
        "gateway_set" -> stringResource(R.string.link_gateway_set)
        "stale" -> stringResource(R.string.link_stale)
        else -> stringResource(R.string.link_no_gateway)
    }
    CareScroll {
        GuardScreenTitle(stringResource(R.string.cane_of, state.firstName))
        Text(state.caneSerial, color = GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.Bold, fontSize = 18.sp)
        Text(stringResource(R.string.cane_firmware, state.firmware, state.firstName), color = GuardColor.WarmGray, style = Meta)
        Text(
            if (state.batteryPercent > 0) "${state.batteryPercent} %" else "—",
            color = GuardColor.Navy,
            fontFamily = Figtree,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 48.sp,
        )
        GuardCard {
            Fact(stringResource(R.string.row_connection), linkLabel)
            Fact(stringResource(R.string.last_signal), state.lastSignal)
            Fact(stringResource(R.string.via_phone, state.firstName), linkLabel)
        }
        GuardSectionTitle(stringResource(R.string.diagnosis))
        Text(stringResource(R.string.reviewed, state.reviewedAt), color = GuardColor.WarmGray, style = Meta)
        listOf(
            stringResource(R.string.row_sensors) to stringResource(R.string.sensor_imu_detail),
            stringResource(R.string.row_connection) to stringResource(R.string.sensor_ble_detail),
        ).forEach { (name, detail) ->
            val chipKind = if (name == stringResource(R.string.row_sensors)) sensorChip else {
                if (state.caneConnected) ChipKind.Taken else ChipKind.Pending
            }
            val chipText = if (name == stringResource(R.string.row_sensors)) sensorLabel else linkLabel
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(name, color = GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Text(detail, color = GuardColor.WarmGray, style = Caption)
                }
                GuardChip(chipText, chipKind)
            }
        }
        GuardOutlineButton(stringResource(R.string.test_sensors), { viewModel.refresh() }, Modifier.fillMaxWidth(), height = 52.dp)
        GuardPrimaryButton(stringResource(R.string.ring_cane), { viewModel.caneAction(CareToast.Ringing) }, Modifier.fillMaxWidth(), height = 56.dp, textStyle = ButtonCare)
    }
}

@Composable
fun CuidadorTeam(
    state: CuidadorState,
    viewModel: CuidadorViewModel,
    onLogout: () -> Unit = {},
) {
    CareScroll {
        GuardScreenTitle(stringResource(R.string.team_title))
        GuardCard(container = GuardColor.Sand, bordered = false) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                GuardAvatar("R", AvatarKind.Warm, size = 56.dp)
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.cared_label), color = GuardColor.BrownDark, style = Caption)
                    Text(state.profile.fullName, color = GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
                    Text(stringResource(R.string.caregivers_count, state.profile.age, state.members.count { !it.pending }), color = GuardColor.WarmGray, style = Meta)
                }
            }
            Spacer(Modifier.height(10.dp))
            GuardOutlineButton(stringResource(R.string.view_profile), { viewModel.open(CareScreen.Profile) }, Modifier.fillMaxWidth(), height = 52.dp)
        }
        state.members.forEach { member -> MemberRow(member) }
        GuardDashedButton(
            text = stringResource(R.string.invite_cta),
            onClick = { viewModel.open(CareScreen.Invite) },
        )
        GuardSectionTitle(stringResource(R.string.matrix_title))
        Matrix()
        GuardOutlineButton(
            stringResource(R.string.logout),
            onLogout,
            Modifier.fillMaxWidth(),
            height = 52.dp,
        )
    }
}

@Composable
fun CuidadorInvite(state: CuidadorState, viewModel: CuidadorViewModel) {
    val draft = state.invite
    val valid = draft.name.isNotBlank() && draft.contact.isNotBlank()
    CarePage(stringResource(R.string.invite_title), viewModel::back) {
        GuardTextField(stringResource(R.string.field_name), draft.name, { viewModel.updateInvite(draft.copy(name = it)) })
        GuardTextField(stringResource(R.string.field_phone_email), draft.contact, { viewModel.updateInvite(draft.copy(contact = it)) })
        Text(stringResource(R.string.role_label), color = GuardColor.Navy, style = Meta)
        RoleOption(stringResource(R.string.chip_family), stringResource(R.string.family_desc), draft.role == CareRole.Familiar) {
            viewModel.updateInvite(draft.copy(role = CareRole.Familiar))
        }
        RoleOption(stringResource(R.string.chip_doctor), stringResource(R.string.doctor_desc), draft.role == CareRole.Medico) {
            viewModel.updateInvite(draft.copy(role = CareRole.Medico))
        }
        if (draft.showError && !valid) {
            Text(stringResource(R.string.invite_invalid), color = GuardColor.DangerText, style = Meta)
        }
        GuardPrimaryButton(stringResource(R.string.send_invite), viewModel::sendInvite, Modifier.fillMaxWidth(), enabled = valid, height = 56.dp, textStyle = ButtonCare)
    }
}

@Composable
fun CuidadorProfile(state: CuidadorState, viewModel: CuidadorViewModel) {
    val draft = state.profileDraft
    CarePage(stringResource(R.string.profile_title, state.firstName), viewModel::back) {
        Text(stringResource(R.string.profile_edit_hint), color = GuardColor.WarmGray, style = Meta)
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            GuardAvatar(
                draft.fullName.take(1).ifBlank { "R" }.uppercase(),
                AvatarKind.Warm,
                size = 88.dp,
            )
        }
        GuardSectionTitle(stringResource(R.string.section_identity))
        GuardTextField(
            stringResource(R.string.field_name),
            draft.fullName,
            { viewModel.updateProfileDraft(draft.copy(fullName = it)) },
            error = if (draft.showError && draft.fullName.isBlank()) {
                stringResource(R.string.profile_need_name)
            } else {
                null
            },
        )
        GuardTextField(
            stringResource(R.string.label_age),
            draft.age,
            { viewModel.updateProfileDraft(draft.copy(age = it.filter { ch -> ch.isDigit() }.take(3))) },
            keyboardType = KeyboardType.Number,
            error = if (draft.showError && draft.age.isNotBlank() && draft.age.toIntOrNull() == null) {
                stringResource(R.string.profile_need_age)
            } else {
                null
            },
        )
        GuardTextField(
            stringResource(R.string.label_height),
            draft.height,
            { viewModel.updateProfileDraft(draft.copy(height = it)) },
        )
        GuardTextField(
            stringResource(R.string.label_weight),
            draft.weight,
            { viewModel.updateProfileDraft(draft.copy(weight = it)) },
        )
        GuardSectionTitle(stringResource(R.string.section_health))
        GuardTextField(
            stringResource(R.string.label_conditions),
            draft.conditions,
            { viewModel.updateProfileDraft(draft.copy(conditions = it)) },
        )
        GuardTextField(
            stringResource(R.string.label_allergies),
            draft.allergies,
            { viewModel.updateProfileDraft(draft.copy(allergies = it)) },
        )
        GuardTextField(
            stringResource(R.string.label_blood),
            draft.blood,
            { viewModel.updateProfileDraft(draft.copy(blood = it)) },
        )
        GuardSectionTitle(stringResource(R.string.section_meds))
        Text(state.profile.meds, color = GuardColor.Navy, style = Body)
        Text(stringResource(R.string.profile_meds_hint), color = GuardColor.WarmGray, style = Caption)
        GuardSectionTitle(stringResource(R.string.section_contact))
        GuardTextField(
            stringResource(R.string.label_address),
            draft.address,
            { viewModel.updateProfileDraft(draft.copy(address = it)) },
        )
        GuardTextField(
            stringResource(R.string.field_phone),
            draft.phone,
            { viewModel.updateProfileDraft(draft.copy(phone = it)) },
            keyboardType = KeyboardType.Phone,
        )
        GuardTextField(
            stringResource(R.string.label_doctor),
            draft.doctor,
            { viewModel.updateProfileDraft(draft.copy(doctor = it)) },
        )
        GuardTextField(
            stringResource(R.string.label_insurance),
            draft.insurance,
            { viewModel.updateProfileDraft(draft.copy(insurance = it)) },
        )
        GuardPrimaryButton(
            stringResource(R.string.save_profile),
            viewModel::saveProfile,
            Modifier.fillMaxWidth(),
            height = 56.dp,
            textStyle = ButtonCare,
        )
    }
}

@Composable
private fun CareScroll(content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        content = content,
    )
}

@Composable
private fun CarePage(
    title: String,
    onBack: () -> Unit,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize().background(GuardColor.Cream).imePadding()) {
        Row(
            Modifier.statusBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .clickable(role = Role.Button, onClickLabel = stringResource(R.string.back), onClick = onBack),
                contentAlignment = Alignment.Center,
            ) {
                GuardGlyph(Glyph.Back, modifier = Modifier.size(24.dp))
            }
            Text(
                title,
                color = GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 22.sp,
                modifier = Modifier
                    .padding(start = 4.dp)
                    .semantics { heading() },
            )
        }
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content,
        )
    }
}

@Composable
private fun CaneToggle(title: String, checked: Boolean, onChange: () -> Unit) {
    GuardToggleRow(title, checked, { onChange() }, yesLabel = stringResource(R.string.yes), noLabel = stringResource(R.string.no))
}

@Composable
private fun MemberRow(member: Member) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        GuardAvatar(member.name.first().uppercase(), member.avatar, size = 46.dp)
        Column(Modifier.weight(1f)) {
            Text(
                if (member.isYou) stringResource(R.string.you_suffix, member.name) else member.name,
                color = GuardColor.Navy,
                fontFamily = Figtree,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
            )
            Text(member.detail, color = GuardColor.WarmGray, style = Caption)
        }
        if (member.pending) {
            GuardChip(stringResource(R.string.chip_pending_invite), ChipKind.Pending)
        } else {
            GuardChip(
                stringResource(if (member.role == CareRole.Familiar) R.string.chip_family else R.string.chip_doctor),
                if (member.role == CareRole.Familiar) ChipKind.Family else ChipKind.Doctor,
            )
        }
    }
}

@Composable
private fun FilterChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        text = label,
        color = if (selected) GuardColor.White else GuardColor.Navy,
        fontFamily = Figtree,
        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
        fontSize = 14.sp,
        modifier = Modifier
            .clip(RoundedCornerShape(14.dp))
            .background(if (selected) GuardColor.Brown else GuardColor.White)
            .border(1.dp, if (selected) GuardColor.Brown else GuardColor.Border, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    )
}

@Composable
private fun Fact(label: String, value: String) {
    Column {
        Text(label, color = GuardColor.WarmGray, style = Caption)
        Text(value, color = GuardColor.Navy, style = Body)
    }
}

@Composable
private fun RoleOption(title: String, body: String, selected: Boolean, onClick: () -> Unit) {
    GuardCard(
        modifier = Modifier
            .clickable(onClick = onClick)
            .border(if (selected) 2.dp else 1.dp, if (selected) GuardColor.Brown else GuardColor.Border, RoundedCornerShape(22.dp)),
        bordered = false,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (selected) GuardGlyph(Glyph.Check, tint = GuardColor.Brown, modifier = Modifier.size(20.dp))
            Text(title, color = GuardColor.Navy, fontFamily = Figtree, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
        }
        Text(body, color = GuardColor.WarmGray, style = Meta, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun Matrix() {
    val rows = listOf(
        R.string.perm_live to true,
        R.string.perm_alerts to true,
        R.string.perm_falls to false,
        R.string.perm_meds to false,
        R.string.perm_create to false,
        R.string.perm_cane to true,
    )
    Column(Modifier.fillMaxWidth().background(GuardColor.White, RoundedCornerShape(18.dp)).border(1.dp, GuardColor.Border, RoundedCornerShape(18.dp)).padding(12.dp)) {
        Row(Modifier.fillMaxWidth()) {
            Text("", Modifier.weight(1.4f))
            Text(stringResource(R.string.chip_family), Modifier.weight(0.7f), color = GuardColor.BrownDark, fontWeight = FontWeight.Bold, fontSize = 13.sp, textAlign = TextAlign.Center)
            Text(stringResource(R.string.chip_doctor), Modifier.weight(0.7f), color = GuardColor.Meds, fontWeight = FontWeight.Bold, fontSize = 13.sp, textAlign = TextAlign.Center)
        }
        rows.forEach { (label, _) ->
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(label), Modifier.weight(1.4f), color = GuardColor.Navy, style = Caption)
                Text(stringResource(R.string.perm_yes), Modifier.weight(0.7f), textAlign = TextAlign.Center, color = GuardColor.Ok, fontWeight = FontWeight.Bold)
                Text(
                    stringResource(R.string.perm_yes),
                    Modifier.weight(0.7f),
                    textAlign = TextAlign.Center,
                    color = GuardColor.Ok,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun WeekBars(values: List<Float>) {
    val labels = listOf("L", "M", "X", "J", "V", "S", "D")
    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = 10.dp)
            .height(78.dp)
            .semantics { hideFromAccessibility() },
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.Bottom,
    ) {
        values.forEachIndexed { index, value ->
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    Modifier
                        .width(14.dp)
                        .height((46f * value).dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(GuardColor.Brown),
                )
                Text(labels[index], color = GuardColor.WarmGray, fontSize = 12.sp)
            }
        }
    }
}
