package com.example.guardmemobile.cuidador

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.guardmemobile.AppContainer
import com.example.guardmemobile.data.api.ApiException
import com.example.guardmemobile.data.api.userMessage
import com.example.guardmemobile.R
import com.example.guardmemobile.data.api.CreateReminderBody
import com.example.guardmemobile.data.api.CreateScheduleBody
import com.example.guardmemobile.data.api.LocationView
import com.example.guardmemobile.data.api.MemberView
import com.example.guardmemobile.data.api.NotificationView
import com.example.guardmemobile.data.api.ProfileView
import com.example.guardmemobile.data.api.ReminderView
import com.example.guardmemobile.data.api.UpdateProfileBody
import com.example.guardmemobile.persona.AvatarKind
import com.example.guardmemobile.platform.Dialer
import com.example.guardmemobile.platform.MapsDirections
import com.example.guardmemobile.platform.PlaceNames
import com.example.guardmemobile.session.ActiveSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class CuidadorViewModel(
    private val container: AppContainer,
    private val session: ActiveSession,
) : ViewModel() {
    private val role = when (session.caregiverCategory) {
        "medical" -> CareRole.Medico
        else -> CareRole.Familiar
    }
    private val _state = MutableStateFlow(
        CuidadorState.blank(role, session.profileName.substringBefore(' ')),
    )
    val state: StateFlow<CuidadorState> = _state.asStateFlow()
    private var toastJob: Job? = null
    private var zoneId: ZoneId = ZoneId.of("America/Panama")

    init {
        refresh()
        viewModelScope.launch {
            while (isActive) {
                delay(20_000)
                refreshLocation()
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            try {
                val profile = runCatching { container.api.getProfile(session.profileId) }.getOrNull()
                val reminders = container.api.listReminders(session.profileId)
                val members = container.api.listMemberships(session.profileId)
                val notices = runCatching { container.api.listNotifications().items }
                    .getOrDefault(emptyList())
                val incidents = runCatching { container.api.listIncidentsRaw(session.profileId) }
                    .getOrDefault(emptyList())
                val canes = runCatching { container.api.listCanes(session.profileId) }
                    .getOrDefault(emptyList())
                val cane = canes.firstOrNull()
                val location = runCatching { container.api.getLocation(session.profileId) }.getOrNull()
                zoneId = ZoneId.of(profile?.timeZone ?: "America/Panama")
                val locationLabel = labelFor(location)
                val mappedProfile = mapProfile(
                    profile,
                    session.profileName,
                    reminders.joinToString(" · ") { it.title },
                    members.firstOrNull { it.caregiverCategory == "medical" }?.displayName,
                )
                _state.update { state ->
                    state.copy(
                        firstName = mappedProfile.fullName
                            .substringBefore(' ')
                            .ifBlank { session.displayName },
                        profile = mappedProfile,
                        profileDraft = draftFrom(mappedProfile),
                        reminders = reminders.flatMap(::mapReminder),
                        meds = reminders
                            .filter { it.kind == "medication" }
                            .map { reminder ->
                                ActiveMed(
                                    reminder.title,
                                    reminder.schedules.joinToString(" · ") { it.localTime }
                                        .ifBlank { reminder.notes ?: "" },
                                )
                            },
                        visits = emptyList(),
                        members = members.map { mapMember(it, session.accountId) },
                        notices = notices.map { mapNotice(it, zoneId) },
                        history = incidents.mapIndexed { index, element ->
                            HistoryEvent(
                                id = "inc-$index",
                                day = "Reciente",
                                kind = HistoryKind.Fall,
                                title = "Incidente",
                                body = element.toString().take(120),
                                time = "",
                            )
                        },
                        caneConnected = canes.any {
                            it.linkState == "gateway_set" || it.linkState == "connected"
                        },
                        caneSerial = cane?.serial ?: "sin bastón",
                        caneSensorStatus = cane?.telemetry?.sensorStatus ?: "unknown",
                        caneLinkState = cane?.linkState ?: "linked_no_gateway",
                        locationLat = location?.takeIf { it.available }?.lat,
                        locationLng = location?.takeIf { it.available }?.lng,
                        locationLabel = locationLabel,
                        locationAgeSeconds = location?.takeIf { it.available }?.ageSeconds,
                        locationAccuracyM = location?.takeIf { it.available }?.accuracyM,
                        locationTimeLabel = location
                            ?.takeIf { it.available }
                            ?.capturedAt
                            ?.let { formatClock(it, zoneId) }
                            .orEmpty(),
                        batteryPercent = cane?.telemetry?.batteryPct ?: 0,
                        firmware = cane?.firmwareVersion?.takeIf { it.isNotBlank() } ?: "sin datos",
                        lastSignal = cane?.telemetry?.ageSeconds?.let { age ->
                            if (age < 60) "hace ${age}s" else "hace ${age / 60} min"
                        } ?: cane?.linkState ?: "sin datos",
                        reviewedAt = cane?.telemetry?.capturedAt
                            ?.let { formatClock(it, zoneId) }
                            ?.takeIf { it.isNotBlank() }
                            ?: "—",
                        steps = 0,
                        kilometersLabel = "—",
                        pillsLabel = "—",
                        adherence = 0,
                        takenWeek = 0,
                        missedWeek = 0,
                        weekBars = emptyList(),
                        fallCount = incidents.size,
                        falseAlarms = 0,
                        weekKm = "—",
                        caneNotices = CaneNotices(
                            lowBattery = (cane?.telemetry?.batteryPct ?: 100) < 20,
                            offline = cane == null ||
                                cane.linkState == "linked_no_gateway" ||
                                cane.linkState == "stale",
                            still = cane?.telemetry?.sensorStatus == "fault",
                        ),
                    )
                }
            } catch (error: Exception) {
                fail(error)
            }
        }
    }

    fun selectTab(tab: CareTab) {
        _state.update { it.copy(stack = listOf(CareScreen.TabRoot(tab))) }
    }

    fun open(screen: CareScreen) {
        _state.update { state ->
            val next = state.copy(stack = state.stack + screen)
            if (screen is CareScreen.Profile) next.copy(profileDraft = draftFrom(state.profile))
            else next
        }
        if (screen is CareScreen.Live) refreshLocation()
    }

    fun updateProfileDraft(draft: ProfileDraft) {
        _state.update { it.copy(profileDraft = draft.copy(showError = false)) }
    }

    fun saveProfile() {
        val draft = _state.value.profileDraft
        if (draft.fullName.isBlank()) {
            _state.update { it.copy(profileDraft = draft.copy(showError = true)) }
            return
        }
        val age = draft.age.trim().takeIf { it.isNotEmpty() }?.toIntOrNull()
        if (draft.age.isNotBlank() && age == null) {
            _state.update { it.copy(profileDraft = draft.copy(showError = true)) }
            return
        }
        viewModelScope.launch {
            try {
                val updated = container.api.updateProfile(
                    session.profileId,
                    UpdateProfileBody(
                        expectedVersion = draft.version,
                        displayName = draft.fullName.trim(),
                        timeZone = draft.timeZone,
                        ageYears = age,
                        height = draft.height.trim().ifBlank { null },
                        weight = draft.weight.trim().ifBlank { null },
                        conditions = draft.conditions.trim().ifBlank { null },
                        allergies = draft.allergies.trim().ifBlank { null },
                        bloodType = draft.blood.trim().ifBlank { null },
                        address = draft.address.trim().ifBlank { null },
                        phone = draft.phone.trim().ifBlank { null },
                        doctor = draft.doctor.trim().ifBlank { null },
                        insurance = draft.insurance.trim().ifBlank { null },
                    ),
                )
                val mapped = mapProfile(
                    updated,
                    session.profileName,
                    _state.value.profile.meds.takeIf { it != "sin datos" }.orEmpty(),
                    null,
                )
                _state.update {
                    it.copy(
                        firstName = mapped.fullName.substringBefore(' ').ifBlank { it.firstName },
                        profile = mapped.copy(meds = it.profile.meds, doctor = mapped.doctor),
                        profileDraft = draftFrom(mapped.copy(meds = it.profile.meds)),
                    )
                }
                show(CareToast.ProfileSaved)
            } catch (error: Exception) {
                fail(error)
            }
        }
    }

    fun refreshLocation() {
        viewModelScope.launch {
            val location = runCatching { container.api.getLocation(session.profileId) }.getOrNull()
            val label = labelFor(location)
            _state.update { state ->
                state.copy(
                    locationLat = location?.takeIf { it.available }?.lat,
                    locationLng = location?.takeIf { it.available }?.lng,
                    locationLabel = label,
                    locationAgeSeconds = location?.takeIf { it.available }?.ageSeconds,
                    locationAccuracyM = location?.takeIf { it.available }?.accuracyM,
                    locationTimeLabel = location
                        ?.takeIf { it.available }
                        ?.capturedAt
                        ?.let { formatClock(it, zoneId) }
                        .orEmpty(),
                )
            }
        }
    }

    fun back() {
        _state.update { state ->
            if (state.call != null) state.copy(call = null)
            else if (state.stack.size > 1) state.copy(stack = state.stack.dropLast(1))
            else state
        }
    }

    fun acceptResponsibility() {
        _state.update { state ->
            if (state.attention == AttentionOutcome.ReceivedAssistance) return@update state
            val event = HistoryEvent(
                id = "resolved-${state.history.size}",
                day = "Hoy",
                kind = HistoryKind.Fall,
                title = "Posible caída",
                body = "Ya hablé con ${state.firstName}, está bien",
                time = "ahora",
                badge = "Recibió asistencia",
            )
            state.copy(
                attention = AttentionOutcome.ReceivedAssistance,
                alert = null,
                handlerName = state.youName,
                call = null,
                history = listOf(event) + state.history,
                stack = listOf(CareScreen.TabRoot(CareTab.Home)),
            )
        }
    }

    fun markAllRead() {
        viewModelScope.launch {
            val unread = _state.value.notices.filter { !it.read }
            val acked = unread.filter { notice ->
                runCatching { container.api.ackNotification(notice.id) }.isSuccess
            }.map { it.id }.toSet()
            _state.update { state ->
                state.copy(notices = state.notices.map { if (it.id in acked) it.copy(read = true) else it })
            }
            if (acked.size < unread.size) {
                show(CareToast.Error(container.appContext.getString(R.string.err_mark_read)))
            }
        }
    }

    fun openNotice(id: String) {
        val notice = _state.value.notices.firstOrNull { it.id == id } ?: return
        viewModelScope.launch {
            runCatching { container.api.ackNotification(id) }
        }
        _state.update { state ->
            state.copy(notices = state.notices.map { if (it.id == id) it.copy(read = true) else it })
        }
        if (notice.opensAuto911) {
            _state.update { it.copy(alert = AlertMode.Auto911) }
            open(CareScreen.Alert)
        }
    }

    fun setHistoryFilter(filter: HistoryFilter) {
        _state.update { it.copy(historyFilter = filter) }
    }

    fun setNotifFilter(filter: NotifFilter) {
        _state.update { it.copy(notifFilter = filter) }
    }

    fun updateDraft(draft: ReminderDraft) {
        _state.update { it.copy(draft = draft.copy(showError = false)) }
    }

    fun addTime() {
        _state.update { state ->
            val time = state.draft.timeInput.trim()
            if (time.isEmpty()) state
            else state.copy(draft = state.draft.copy(timeInput = "", times = state.draft.times + time, showError = false))
        }
    }

    fun removeTime(time: String) {
        _state.update { state ->
            state.copy(draft = state.draft.copy(times = state.draft.times.filterNot { it == time }))
        }
    }

    fun toggleDay(day: Int) {
        _state.update { state ->
            val days = state.draft.days.toMutableSet()
            if (!days.add(day)) days.remove(day)
            state.copy(draft = state.draft.copy(days = days, showError = false))
        }
    }

    fun saveReminder() {
        val draft = _state.value.draft
        val valid = draft.name.isNotBlank() && draft.times.isNotEmpty() && draft.days.isNotEmpty()
        if (!valid) {
            _state.update { it.copy(draft = draft.copy(showError = true)) }
            return
        }
        viewModelScope.launch {
            try {
                val today = java.time.LocalDate.now().toString()
                container.api.createReminder(
                    session.profileId,
                    CreateReminderBody(
                        kind = when (draft.type) {
                            ReminderType.Pill -> "medication"
                            ReminderType.Visit, ReminderType.Other -> "appointment"
                        },
                        title = draft.name.trim(),
                        notes = draft.detail.ifBlank { null },
                        schedules = draft.times.map { time ->
                            CreateScheduleBody(
                                localTime = time,
                                daysOfWeek = draft.days.sorted(),
                                validFrom = today,
                            )
                        },
                    ),
                )
                _state.update {
                    it.copy(draft = ReminderDraft(), stack = it.stack.dropLast(1))
                }
                show(CareToast.ReminderSaved)
                refresh()
            } catch (error: Exception) {
                fail(error)
            }
        }
    }

    fun updateInvite(draft: InviteDraft) {
        _state.update { it.copy(invite = draft.copy(showError = false)) }
    }

    fun sendInvite() {
        val draft = _state.value.invite
        if (draft.name.isBlank() || draft.contact.isBlank()) {
            _state.update { it.copy(invite = draft.copy(showError = true)) }
            return
        }
        viewModelScope.launch {
            try {
                container.api.issueInvitation(session.profileId, draft.contact.trim())
                _state.update {
                    it.copy(invite = InviteDraft(), stack = it.stack.dropLast(1))
                }
                show(CareToast.InviteSent)
                refresh()
            } catch (error: Exception) {
                fail(error)
            }
        }
    }

    fun toggleCane(which: CaneToggle) {
        _state.update { state ->
            val notices = state.caneNotices
            state.copy(
                caneNotices = when (which) {
                    CaneToggle.Battery -> notices.copy(lowBattery = !notices.lowBattery)
                    CaneToggle.Offline -> notices.copy(offline = !notices.offline)
                    CaneToggle.Still -> notices.copy(still = !notices.still)
                },
            )
        }
    }

    fun startCall(target: CareCall) {
        val number = when (target) {
            CareCall.Emergency -> "911"
            CareCall.Person -> _state.value.profile.phone
        }
        val opened = Dialer.open(container.appContext, number)
        if (!opened && target == CareCall.Person) {
            show(CareToast.Error(container.appContext.getString(R.string.err_no_phone, _state.value.firstName)))
            return
        }
        _state.update { it.copy(call = target) }
    }

    fun endCall() {
        _state.update { it.copy(call = null) }
    }

    /** Acciones que necesitan el bastón: si no está conectado, pedir ese paso primero. */
    fun openDirections() {
        val state = _state.value
        val lat = state.locationLat
        val lng = state.locationLng
        if (lat == null || lng == null) {
            show(CareToast.Error(container.appContext.getString(R.string.err_no_location)))
            return
        }
        val opened = MapsDirections.open(
            container.appContext,
            lat,
            lng,
            state.locationLabel,
        )
        if (!opened) {
            show(CareToast.Error(container.appContext.getString(R.string.err_maps_unavailable)))
        }
    }

    fun caneAction(toast: CareToast) {
        if (_state.value.caneConnected) show(toast)
        else show(CareToast.Error(container.appContext.getString(R.string.err_cane_not_connected)))
    }

    private fun fail(error: Exception) {
        if (error is kotlinx.coroutines.CancellationException) throw error
        show(CareToast.Error(error.userMessage(container.appContext)))
        if ((error as? ApiException)?.code == "VERSION_CONFLICT") refresh()
    }

    fun show(toast: CareToast) {
        toastJob?.cancel()
        _state.update { it.copy(toast = toast) }
        toastJob = viewModelScope.launch {
            delay(3_000)
            _state.update { state -> if (state.toast == toast) state.copy(toast = null) else state }
        }
    }

    private fun mapReminder(reminder: ReminderView): List<CareReminder> =
        reminder.schedules.mapIndexed { index, schedule ->
            CareReminder(
                id = "${reminder.id}-$index",
                time = schedule.localTime,
                title = reminder.title,
                detail = reminder.notes ?: reminder.kind,
                confirmed = false,
            )
        }.ifEmpty {
            listOf(
                CareReminder(
                    id = reminder.id,
                    time = "—",
                    title = reminder.title,
                    detail = reminder.notes ?: reminder.kind,
                    confirmed = false,
                ),
            )
        }

    private fun mapMember(row: MemberView, selfAccountId: String): Member = Member(
        id = row.accessId,
        name = row.displayName,
        detail = row.caregiverCategory ?: row.relation,
        role = if (row.caregiverCategory == "medical") CareRole.Medico else CareRole.Familiar,
        pending = false,
        isYou = row.accountId == selfAccountId,
        avatar = if (row.caregiverCategory == "medical") AvatarKind.Blue else AvatarKind.Warm,
    )

    private fun mapNotice(row: NotificationView, zone: ZoneId): Notice {
        val local = runCatching {
            Instant.parse(row.createdAt).atZone(zone)
        }.getOrNull()
        val time = local?.toLocalTime()?.format(DateTimeFormatter.ofPattern("HH:mm")) ?: ""
        val day = local?.toLocalDate()?.toString() ?: ""
        return Notice(
            id = row.id,
            title = row.type,
            body = "${row.resourceType} · ${row.status}",
            time = time,
            day = day,
            urgent = row.type.contains("fall", ignoreCase = true) ||
                row.type.contains("emergency", ignoreCase = true),
            read = row.status != "pending",
            opensAuto911 = row.type.contains("911", ignoreCase = true),
        )
    }

    private fun formatClock(iso: String, zone: ZoneId): String =
        runCatching {
            Instant.parse(iso).atZone(zone).toLocalTime()
                .format(DateTimeFormatter.ofPattern("HH:mm"))
        }.getOrDefault("")

    private suspend fun labelFor(location: LocationView?): String = when {
        location?.available == true && location.lat != null && location.lng != null ->
            withContext(Dispatchers.IO) {
                PlaceNames.fromLatLng(container.appContext, location.lat, location.lng)
            }
        location?.reason == "not_enabled" -> "Ubicación deshabilitada"
        else -> "Sin ubicación"
    }

    private fun mapProfile(
        profile: ProfileView?,
        fallbackName: String,
        meds: String,
        doctorFallback: String?,
    ): Profile {
        fun text(value: String?): String = value?.takeIf { it.isNotBlank() } ?: "sin datos"
        return Profile(
            fullName = profile?.displayName?.takeIf { it.isNotBlank() } ?: fallbackName,
            age = profile?.ageYears ?: 0,
            height = text(profile?.height),
            weight = text(profile?.weight),
            conditions = text(profile?.conditions),
            allergies = text(profile?.allergies),
            blood = text(profile?.bloodType),
            meds = meds.ifBlank { "sin datos" },
            address = text(profile?.address),
            phone = text(profile?.phone),
            doctor = text(profile?.doctor ?: doctorFallback),
            insurance = text(profile?.insurance),
            version = profile?.version ?: 1,
            timeZone = profile?.timeZone ?: "America/Panama",
        )
    }

    private fun draftFrom(profile: Profile): ProfileDraft = ProfileDraft(
        fullName = profile.fullName,
        age = if (profile.age > 0) profile.age.toString() else "",
        height = profile.height.takeUnless { it == "sin datos" }.orEmpty(),
        weight = profile.weight.takeUnless { it == "sin datos" }.orEmpty(),
        conditions = profile.conditions.takeUnless { it == "sin datos" }.orEmpty(),
        allergies = profile.allergies.takeUnless { it == "sin datos" }.orEmpty(),
        blood = profile.blood.takeUnless { it == "sin datos" }.orEmpty(),
        address = profile.address.takeUnless { it == "sin datos" }.orEmpty(),
        phone = profile.phone.takeUnless { it == "sin datos" }.orEmpty(),
        doctor = profile.doctor.takeUnless { it == "sin datos" }.orEmpty(),
        insurance = profile.insurance.takeUnless { it == "sin datos" }.orEmpty(),
        version = profile.version,
        timeZone = profile.timeZone,
    )

    companion object {
        fun factory(container: AppContainer, session: ActiveSession): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T =
                    CuidadorViewModel(container, session) as T
            }
    }
}

enum class CaneToggle { Battery, Offline, Still }
