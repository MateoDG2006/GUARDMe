package com.example.guardmemobile.persona

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.guardmemobile.AppContainer
import com.example.guardmemobile.ble.CaneBleEvent
import com.example.guardmemobile.ble.GuardMeCodec
import com.example.guardmemobile.data.api.ActivateIncidentBody
import com.example.guardmemobile.data.api.ApiException
import com.example.guardmemobile.data.api.ConnectivityBody
import com.example.guardmemobile.data.api.ContactView
import com.example.guardmemobile.data.api.CreateContactBody
import com.example.guardmemobile.data.api.GatewayEventBody
import com.example.guardmemobile.data.api.GatewayEventPayload
import com.example.guardmemobile.data.api.LocationConsentBody
import com.example.guardmemobile.data.api.OccurrenceView
import com.example.guardmemobile.data.api.PublishLocationBody
import com.example.guardmemobile.data.api.userMessage
import com.example.guardmemobile.platform.Dialer
import com.example.guardmemobile.session.ActiveSession
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID

class PersonaViewModel(
    private val container: AppContainer,
    private val session: ActiveSession,
) : ViewModel() {
    private val _state = MutableStateFlow(
        PersonaState.empty(session.profileName.substringBefore(' ').ifBlank { session.displayName }),
    )
    val state: StateFlow<PersonaState> = _state.asStateFlow()

    private var timerJob: Job? = null
    private var toastJob: Job? = null
    private var locationJob: Job? = null
    private val occurrenceVersions = mutableMapOf<String, Int>()
    private var pendingCancel = false
    private var publishedExpireId: String? = null
    private var windowStartedAt: Instant? = null

    init {
        refresh()
        observeBle()
        reconnectCane()
    }

    /** Llamar solo cuando Android ya concedió ubicación (o ya estaba concedida). */
    fun onLocationPermissionGranted() {
        startLocationPublisher()
    }

    fun dispatch(event: PersonaEvent) {
        when (event) {
            PersonaEvent.Reload -> {
                refresh()
                return
            }
            PersonaEvent.SaveContact -> {
                saveContactRemote()
                return
            }
            PersonaEvent.ConfirmDelete -> {
                deleteContactRemote()
                return
            }
            PersonaEvent.ConfirmDose -> {
                confirmDoseRemote()
                return
            }
            PersonaEvent.FindCane -> {
                findCaneRemote()
                return
            }
            PersonaEvent.ImFine -> {
                if (_state.value.overlay is PersonaOverlay.Fall) {
                    cancelFallRemote()
                    return
                }
            }
            else -> Unit
        }
        val before = _state.value
        _state.update { PersonaReducer.reduce(it, event) }
        maybeOpenDialer(before, _state.value)
        if (timerIdentity(before.overlay) != timerIdentity(_state.value.overlay)) {
            arm()
        }
        watchToast(before.toast)
        if (event == PersonaEvent.SecondElapsed &&
            before.overlay is PersonaOverlay.Fall &&
            _state.value.overlay !is PersonaOverlay.Fall
        ) {
            publishFallExpiredFromLocal()
        }
    }

    private fun observeBle() {
        viewModelScope.launch {
            container.gatt.eventsFlow.collect { event ->
                when (event) {
                    is CaneBleEvent.Connected ->
                        _state.update {
                            it.copy(caneConnected = true, sensorsOk = true, lastUse = "ahora")
                        }
                    is CaneBleEvent.Disconnected ->
                        _state.update {
                            it.copy(caneConnected = false, sensorsOk = false, lastUse = "desconectado")
                        }
                    is CaneBleEvent.FallCandidate -> {
                        windowStartedAt = Instant.now()
                        publishedExpireId = null
                        val seconds = (event.event.windowMs / 1000).coerceAtLeast(1)
                        val before = _state.value
                        _state.update {
                            PersonaReducer.reduce(it, PersonaEvent.FallDetected)
                                .let { s ->
                                    if (s.overlay is PersonaOverlay.Fall) {
                                        s.copy(overlay = PersonaOverlay.Fall(seconds))
                                    } else {
                                        s
                                    }
                                }
                        }
                        if (timerIdentity(before.overlay) != timerIdentity(_state.value.overlay)) {
                            arm()
                        }
                    }
                    is CaneBleEvent.FallCanceled -> {
                        pendingCancel = false
                        publishFalseAlarm("button")
                        val before = _state.value
                        _state.update { PersonaReducer.reduce(it, PersonaEvent.ImFine) }
                        if (timerIdentity(before.overlay) != timerIdentity(_state.value.overlay)) {
                            arm()
                        }
                    }
                    is CaneBleEvent.FallExpired -> {
                        publishFallDetected(event.sequence, event.bootId, event.sourceBoot)
                        if (_state.value.overlay is PersonaOverlay.Fall) {
                            val before = _state.value
                            _state.update {
                                PersonaReducer.reduce(
                                    it.copy(overlay = PersonaOverlay.Fall(1)),
                                    PersonaEvent.SecondElapsed,
                                )
                            }
                            maybeOpenDialer(before, _state.value)
                            if (timerIdentity(before.overlay) != timerIdentity(_state.value.overlay)) {
                                arm()
                            }
                        }
                    }
                    is CaneBleEvent.CmdApplied -> {
                        if (pendingCancel) {
                            pendingCancel = false
                            publishFalseAlarm("app")
                            val before = _state.value
                            _state.update { PersonaReducer.reduce(it, PersonaEvent.ImFine) }
                            if (timerIdentity(before.overlay) != timerIdentity(_state.value.overlay)) {
                                arm()
                            }
                        }
                    }
                    is CaneBleEvent.CmdRejected -> {
                        pendingCancel = false
                    }
                }
            }
        }
        viewModelScope.launch {
            container.gatt.link.collect { linked ->
                _state.update {
                    it.copy(
                        caneConnected = linked || it.caneConnected,
                        sensorsOk = linked,
                    )
                }
            }
        }
    }

    private fun reconnectCane() {
        viewModelScope.launch {
            val address = container.auth.caneDeviceId() ?: return@launch
            runCatching { container.gatt.connect(address) }
        }
    }

    private fun findCaneRemote() {
        val before = _state.value
        if (before.overlay !is PersonaOverlay.None) return
        if (!before.caneConnected && !container.gatt.link.value) {
            _state.update { PersonaReducer.reduce(it, PersonaEvent.FindCane) }
            watchToast(before.toast)
            return
        }
        container.gatt.signalReminder()
        _state.update { it.copy(overlay = PersonaOverlay.CaneRinging) }
    }

    private fun cancelFallRemote() {
        pendingCancel = true
        container.gatt.cancelFall()
    }

    private fun publishFalseAlarm(via: String) {
        viewModelScope.launch {
            val caneId = container.auth.caneBackendId() ?: return@launch
            val candidate = container.gatt.lastCandidate
            val eventId = if (candidate != null) {
                "cancel:${GuardMeCodec.bootHex(candidate.sourceBootId)}:${candidate.sequence}"
            } else {
                "cancel:${UUID.randomUUID()}"
            }
            runCatching {
                container.api.postGatewayEvents(
                    listOf(
                        GatewayEventBody(
                            eventId = eventId,
                            type = "false_alarm_canceled",
                            caneId = caneId,
                            occurredAt = Instant.now().toString(),
                            payload = GatewayEventPayload(cancelledVia = via),
                        ),
                    ),
                )
            }
        }
    }

    private fun publishFallExpiredFromLocal() {
        val candidate = container.gatt.lastCandidate ?: return
        publishFallDetected(candidate.sequence, candidate.bootId, candidate.sourceBootId)
    }

    private fun publishFallDetected(sequence: Int, bootId: ByteArray, sourceBoot: ByteArray) {
        val sourceEventId = "${GuardMeCodec.bootHex(sourceBoot)}:$sequence"
        if (publishedExpireId == sourceEventId) return
        publishedExpireId = sourceEventId
        viewModelScope.launch {
            val caneId = container.auth.caneBackendId() ?: return@launch
            val started = windowStartedAt ?: Instant.now().minusSeconds(30)
            val ended = Instant.now()
            runCatching {
                container.api.activateIncident(
                    ActivateIncidentBody(
                        origin = "fall_detected",
                        sourceEventId = sourceEventId,
                        caneId = caneId,
                        reportedOccurredAt = ended.toString(),
                        ageAtSendMs = 0,
                        protocolVersion = "1",
                        bootId = GuardMeCodec.bootHex(bootId),
                        sequence = sequence,
                        windowStartedAt = started.toString(),
                        windowEndedAt = ended.toString(),
                        connectivity = ConnectivityBody(
                            network = "unknown",
                            bleLinked = container.gatt.link.value,
                        ),
                    ),
                )
            }
        }
    }

    private fun startLocationPublisher() {
        if (session.capabilities.location != "enabled") return
        if (locationJob?.isActive == true) return
        locationJob = viewModelScope.launch {
            // shortcut: auto-share with all active caregivers when OS permission is granted; add a consent screen later
            ensureLocationConsent()
            val fused = LocationServices.getFusedLocationProviderClient(container.appContext)
            while (isActive) {
                runCatching {
                    val cts = CancellationTokenSource()
                    val loc = fused.getCurrentLocation(
                        Priority.PRIORITY_BALANCED_POWER_ACCURACY,
                        cts.token,
                    ).await()
                    if (loc != null && loc.accuracy > 0f) {
                        container.api.publishLocation(
                            session.profileId,
                            PublishLocationBody(
                                lat = loc.latitude,
                                lng = loc.longitude,
                                accuracyM = loc.accuracy.toDouble().coerceAtLeast(0.000001),
                                capturedAt = Instant.ofEpochMilli(loc.time).toString(),
                            ),
                        )
                    }
                }
                delay(60_000)
            }
        }
    }

    private suspend fun ensureLocationConsent() {
        val members = runCatching { container.api.listMemberships(session.profileId) }
            .getOrDefault(emptyList())
        val readers = members
            .filter { it.relation == "caregiver" }
            .map { it.accountId }
        runCatching {
            container.api.setLocationConsent(
                session.profileId,
                LocationConsentBody(enabled = true, readers = readers),
            )
        }
    }

    private fun maybeOpenDialer(before: PersonaState, after: PersonaState) {
        when (val overlay = after.overlay) {
            is PersonaOverlay.DialerUnavailable -> {
                val number = overlay.contactId
                    ?.let { after.contact(it)?.phone }
                    ?: "911"
                val opened = Dialer.open(container.appContext, number)
                if (opened) {
                    _state.update { it.copy(overlay = PersonaOverlay.None) }
                }
            }
            is PersonaOverlay.Calling911 -> {
                if (before.overlay !is PersonaOverlay.Calling911) {
                    Dialer.open(container.appContext, "911")
                }
            }
            is PersonaOverlay.CallingFamily -> {
                val previous = before.overlay
                val changed = previous !is PersonaOverlay.CallingFamily ||
                    previous.contactId != overlay.contactId ||
                    previous.attempt != overlay.attempt
                if (changed) {
                    after.contact(overlay.contactId)?.phone
                        ?.let { Dialer.open(container.appContext, it) }
                }
            }
            else -> Unit
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            try {
                val profile = runCatching { container.api.getProfile(session.profileId) }.getOrNull()
                val contacts = container.api.listContacts(session.profileId)
                val zone = ZoneId.of(profile?.timeZone ?: "America/Panama")
                val today = LocalDate.now(zone)
                val from = today.atStartOfDay(zone).toInstant()
                val to = today.plusDays(2).atStartOfDay(zone).toInstant()
                val occurrences = runCatching {
                    container.api.listOccurrences(
                        session.profileId,
                        from.toString(),
                        to.toString(),
                    )
                }.getOrDefault(emptyList())
                occurrenceVersions.clear()
                occurrences.forEach { occurrenceVersions[it.id] = it.version }
                val linked = container.gatt.link.value ||
                    !container.auth.caneDeviceId().isNullOrBlank() ||
                    runCatching { container.api.listCanes(session.profileId) }
                        .getOrDefault(emptyList())
                        .any { it.linkState == "gateway_set" || it.linkState == "connected" }
                _state.update {
                    it.copy(
                        loading = false,
                        firstName = (profile?.displayName ?: session.profileName)
                            .substringBefore(' ')
                            .ifBlank { session.displayName },
                        contacts = contacts.items.map(::mapContact),
                        contactsVersion = contacts.contactsVersion,
                        doses = occurrences.map { mapOccurrence(it, zone) },
                        appointments = emptyList(),
                        steps = 0,
                        kilometersLabel = "—",
                        calories = 0,
                        caneConnected = linked,
                        sensorsOk = container.gatt.link.value,
                        lastUse = if (linked) "vinculado" else "sin datos",
                        tomorrowTime = occurrences
                            .map { Instant.parse(it.scheduledFor).atZone(zone).toLocalTime() }
                            .filter { it.toString() >= "00:00" }
                            .minOrNull()
                            ?.format(DateTimeFormatter.ofPattern("HH:mm"))
                            ?: "—",
                    )
                }
            } catch (error: Exception) {
                _state.update { it.copy(loading = false) }
                fail(error)
            }
        }
    }

    private fun saveContactRemote() {
        val draft = _state.value.editor ?: return
        if (draft.name.isBlank() || draft.phone.isBlank()) {
            _state.update { PersonaReducer.reduce(it, PersonaEvent.SaveContact) }
            return
        }
        viewModelScope.launch {
            try {
                val list = container.api.createContact(
                    session.profileId,
                    CreateContactBody(
                        displayName = draft.name.trim(),
                        phone = draft.phone.trim(),
                        priority = draft.priority?.takeIf { it == 1 || it == 2 },
                        expectedContactsVersion = _state.value.contactsVersion,
                    ),
                )
                _state.update {
                    it.copy(
                        contacts = list.items.map(::mapContact),
                        contactsVersion = list.contactsVersion,
                        editor = null,
                        editorError = null,
                        deleteConfirm = false,
                    )
                }
            } catch (error: Exception) {
                fail(error)
            }
        }
    }

    private fun deleteContactRemote() {
        val id = _state.value.editor?.id ?: return
        val version = _state.value.contactsVersion
        viewModelScope.launch {
            try {
                val list = container.api.deleteContact(session.profileId, id, version)
                _state.update {
                    it.copy(
                        contacts = list.items.map(::mapContact),
                        contactsVersion = list.contactsVersion,
                        editor = null,
                        editorError = null,
                        deleteConfirm = false,
                    )
                }
            } catch (error: Exception) {
                fail(error)
            }
        }
    }

    private fun confirmDoseRemote() {
        val id = _state.value.sheetDoseId ?: return
        val version = occurrenceVersions[id] ?: 1
        viewModelScope.launch {
            try {
                val updated = container.api.respondOccurrence(id, "taken", version)
                occurrenceVersions[id] = updated.version
                _state.update {
                    it.copy(
                        doses = it.doses.map { dose ->
                            if (dose.id == id) dose.copy(taken = true) else dose
                        },
                        sheetDoseId = null,
                        toast = ToastMessage.DoseSaved,
                    )
                }
                watchToast(null)
            } catch (error: Exception) {
                fail(error)
            }
        }
    }

    private fun fail(error: Exception) {
        if (error is kotlinx.coroutines.CancellationException) throw error
        val previous = _state.value.toast
        _state.update { it.copy(toast = ToastMessage.Error(error.userMessage(container.appContext))) }
        watchToast(previous)
        if ((error as? ApiException)?.code == "VERSION_CONFLICT") refresh()
    }

    private fun mapContact(row: ContactView): Contact = Contact(
        id = row.id,
        name = row.displayName,
        relation = "contacto",
        phone = row.phoneE164,
        priority = row.priority,
        avatar = when (row.priority) {
            1 -> AvatarKind.Warm
            2 -> AvatarKind.Green
            else -> AvatarKind.Blue
        },
    )

    private fun mapOccurrence(row: OccurrenceView, zone: ZoneId): Dose {
        val local = Instant.parse(row.scheduledFor).atZone(zone)
        val today = LocalDate.now(zone)
        val bucket = when {
            local.toLocalDate() == today -> DayBucket.Today
            local.toLocalDate() == today.plusDays(1) -> DayBucket.Tomorrow
            else -> DayBucket.Later
        }
        return Dose(
            id = row.id,
            time = local.toLocalTime().format(DateTimeFormatter.ofPattern("HH:mm")),
            name = row.title,
            indication = row.kind,
            taken = row.status == "taken" || row.status == "acknowledged",
            bucket = bucket,
        )
    }

    private fun arm() {
        timerJob?.cancel()
        timerJob = viewModelScope.launch { runTimer() }
    }

    private suspend fun CoroutineScope.runTimer() {
        val start = _state.value.overlay
        val startId = timerIdentity(start)
        when (start) {
            is PersonaOverlay.Countdown911,
            is PersonaOverlay.Fall,
            is PersonaOverlay.CallingFamily,
            -> {
                while (isActive) {
                    delay(1_000)
                    if (timerIdentity(_state.value.overlay) != startId) break
                    val previous = _state.value
                    _state.update { PersonaReducer.reduce(it, PersonaEvent.SecondElapsed) }
                    maybeOpenDialer(previous, _state.value)
                    watchToast(previous.toast)
                    if (previous.overlay is PersonaOverlay.Fall &&
                        _state.value.overlay !is PersonaOverlay.Fall
                    ) {
                        publishFallExpiredFromLocal()
                    }
                    if (timerIdentity(_state.value.overlay) != startId) break
                }
            }
            is PersonaOverlay.FamilyNoAnswer -> {
                delay(2_500)
                if (_state.value.overlay is PersonaOverlay.FamilyNoAnswer) {
                    _state.update { PersonaReducer.reduce(it, PersonaEvent.MissedPauseElapsed) }
                }
            }
            is PersonaOverlay.Auto911Notice -> {
                delay(3_000)
                if (_state.value.overlay is PersonaOverlay.Auto911Notice) {
                    _state.update { PersonaReducer.reduce(it, PersonaEvent.AutoNoticeElapsed) }
                }
            }
            else -> return
        }
        val next = _state.value.overlay
        if (timerIdentity(next) != startId && next.isTimed()) {
            runTimer()
        }
    }

    private fun watchToast(previous: ToastMessage?) {
        val toast = _state.value.toast
        if (toast != null && toast != previous) {
            toastJob?.cancel()
            toastJob = viewModelScope.launch {
                delay(3_000)
                _state.update { current -> if (current.toast == toast) current.copy(toast = null) else current }
            }
        }
    }

    override fun onCleared() {
        locationJob?.cancel()
        super.onCleared()
    }

    companion object {
        fun factory(container: AppContainer, session: ActiveSession): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T =
                    PersonaViewModel(container, session) as T
            }
    }
}
