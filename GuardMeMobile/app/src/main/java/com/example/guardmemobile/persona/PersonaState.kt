package com.example.guardmemobile.persona

enum class PersonaTab { Home, Contacts, Reminders, Cane }

enum class ReminderSegment { Today, Week }

enum class DayBucket { Today, Tomorrow, Later }

enum class AvatarKind { Warm, Blue, Green }

enum class FieldError { Name, Phone }

data class Contact(
    val id: String,
    val name: String,
    val relation: String,
    val phone: String,
    val priority: Int?,
    val avatar: AvatarKind = AvatarKind.Warm,
) {
    fun homeRelation(): String = when (relation.lowercase()) {
        "hija" -> "Tu hija"
        "hijo" -> "Tu hijo"
        "hermana" -> "Tu hermana"
        "hermano" -> "Tu hermano"
        "vecina" -> "Tu vecina"
        "vecino" -> "Tu vecino"
        "médico", "medico" -> "Tu médico"
        else -> relation.replaceFirstChar { char ->
            if (char.isLowerCase()) char.titlecase() else char.toString()
        }
    }

    fun initial(): String = name.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "?"
}

data class Dose(
    val id: String,
    val time: String,
    val name: String,
    val indication: String,
    val taken: Boolean,
    val bucket: DayBucket,
)

data class Appointment(
    val id: String,
    val dayLabel: String,
    val title: String,
    val time: String,
    val place: String,
)

data class ContactDraft(
    val id: String?,
    val name: String,
    val relation: String,
    val phone: String,
    val priority: Int?,
    val avatar: AvatarKind,
)

sealed interface ToastMessage {
    data object DoseSaved : ToastMessage
    data object Snoozed : ToastMessage
    data class NoAnswer(val name: String) : ToastMessage
    data object PhotoLater : ToastMessage
    data object ProtocolPending : ToastMessage
    data object CaneNotConnected : ToastMessage
    data class Error(val message: String) : ToastMessage
}

sealed interface PersonaOverlay {
    data object None : PersonaOverlay
    data class Countdown911(val secondsLeft: Int, val automatic: Boolean) : PersonaOverlay
    data class Calling911(val automatic: Boolean) : PersonaOverlay
    data class CallingFamily(
        val contactId: String,
        val attempt: Int,
        val inEpisode: Boolean,
        val secondsLeft: Int,
        val slot: Int = 1,
    ) : PersonaOverlay

    data class DialerUnavailable(val contactId: String?) : PersonaOverlay

    data class CallPlanExhausted(val outcome: EpisodeCallOutcome) : PersonaOverlay

    data class FamilyNoAnswer(val completedAttempt: Int, val contactId: String) : PersonaOverlay
    data class Fall(val secondsLeft: Int) : PersonaOverlay
    data object Escalation : PersonaOverlay
    data object Auto911Notice : PersonaOverlay
    data class HelpOnTheWay(val automatic: Boolean) : PersonaOverlay
    data class FamilyAnswered(
        val contactId: String,
        val attempt: Int,
        val stoppedEscalation: Boolean,
    ) : PersonaOverlay

    data object CaneRinging : PersonaOverlay
    data object PillTime : PersonaOverlay
}

fun PersonaOverlay.isTimed(): Boolean = when (this) {
    is PersonaOverlay.Countdown911,
    is PersonaOverlay.Fall,
    is PersonaOverlay.CallingFamily,
    is PersonaOverlay.FamilyNoAnswer,
    is PersonaOverlay.Auto911Notice,
    -> true
    else -> false
}

data class PersonaState(
    val firstName: String,
    val contacts: List<Contact>,
    val doses: List<Dose>,
    val appointments: List<Appointment>,
    val steps: Int,
    val kilometersLabel: String,
    val calories: Int,
    val batteryPercent: Int,
    val caneConnected: Boolean,
    val sensorsOk: Boolean,
    val lastUse: String,
    val tomorrowTime: String,
    val tab: PersonaTab = PersonaTab.Home,
    val segment: ReminderSegment = ReminderSegment.Today,
    val query: String = "",
    val overlay: PersonaOverlay = PersonaOverlay.None,
    val helpEpisode: Boolean = false,
    val attemptsClosed: Boolean = false,
    val failedAttempts: Int = 0,
    val editor: ContactDraft? = null,
    val editorError: FieldError? = null,
    val deleteConfirm: Boolean = false,
    val sheetDoseId: String? = null,
    val toast: ToastMessage? = null,
    val callOutcome: EpisodeCallOutcome? = null,
    val loading: Boolean = false,
    val contactsVersion: Int = 1,
    val showCaneSetup: Boolean = false,
) {
    fun preferred(): Contact? = contacts.firstOrNull { it.priority == 1 }

    fun contact(id: String): Contact? = contacts.firstOrNull { it.id == id }

    fun nextDose(): Dose? = doses
        .filter { it.bucket == DayBucket.Today && !it.taken }
        .minByOrNull { it.time }

    companion object {
        fun empty(firstName: String = ""): PersonaState = PersonaState(
            firstName = firstName,
            contacts = emptyList(),
            doses = emptyList(),
            appointments = emptyList(),
            steps = 0,
            kilometersLabel = "—",
            calories = 0,
            batteryPercent = 0,
            caneConnected = false,
            sensorsOk = false,
            lastUse = "sin datos",
            tomorrowTime = "—",
            loading = true,
        )

        /** Fixture mínimo para unit tests del reducer (sin datos demo de producto). */
        fun fixture(
            contacts: List<Contact> = listOf(
                Contact("c1", "Ana", "hija", "+50761000101", priority = 1),
                Contact("c2", "Luis", "hijo", "+50761000102", priority = 2),
            ),
            doses: List<Dose> = listOf(
                Dose("d1", "08:00", "Medicamento", "1 tableta", taken = false, DayBucket.Today),
            ),
        ): PersonaState = empty("Rosa").copy(
            loading = false,
            contacts = contacts,
            doses = doses,
            caneConnected = false,
            sensorsOk = true,
            batteryPercent = 50,
        )
    }
}

data class PrioritySlot(val slot: Int, val contactId: String)

data class PlannedAttempt(val slot: Int, val contactId: String, val index: Int)

enum class EpisodeCallOutcome { InProgress, Answered, PlanExhausted, NoPriorityContacts }

sealed interface PersonaEvent {
    data object Tap911 : PersonaEvent
    data object Cancel911 : PersonaEvent
    data object HangUp911 : PersonaEvent
    data object Manual911 : PersonaEvent
    data class CallContact(val id: String) : PersonaEvent
    data object FindCane : PersonaEvent
    data object FoundCane : PersonaEvent
    data object OpenCaneSetup : PersonaEvent
    data object CloseCaneSetup : PersonaEvent
    data class CaneLinked(val connected: Boolean) : PersonaEvent
    data object FallDetected : PersonaEvent
    data object Reload : PersonaEvent
    data object ImFine : PersonaEvent
    data object NeedHelp : PersonaEvent
    data object FamilyAnswered : PersonaEvent
    data object HangUpFamily : PersonaEvent
    data object DismissFamilyAnswered : PersonaEvent
    data object DismissHelp : PersonaEvent
    data object SecondElapsed : PersonaEvent
    data object MissedPauseElapsed : PersonaEvent
    data object AutoNoticeElapsed : PersonaEvent
    data object ShowPillTime : PersonaEvent
    data object TookPillOverlay : PersonaEvent
    data object SnoozePill : PersonaEvent
    data class OpenDose(val id: String) : PersonaEvent
    data object DismissDose : PersonaEvent
    data object ConfirmDose : PersonaEvent
    data object UndoDose : PersonaEvent
    data object DismissToast : PersonaEvent
    data class Search(val query: String) : PersonaEvent
    data class SelectTab(val tab: PersonaTab) : PersonaEvent
    data class SelectSegment(val segment: ReminderSegment) : PersonaEvent
    data class OpenEditor(val id: String?) : PersonaEvent
    data object CloseEditor : PersonaEvent
    data class UpdateDraft(val draft: ContactDraft) : PersonaEvent
    data object SaveContact : PersonaEvent
    data object AskDelete : PersonaEvent
    data object CancelDelete : PersonaEvent
    data object ConfirmDelete : PersonaEvent
    data object PhotoTapped : PersonaEvent
}

object PersonaReducer {
    const val FALL_SECONDS = 30

    /** P-07: duración de timbre no decidida. Este valor solo avanza la demo. */
    const val DEMO_RING_TICKS = 28

    fun buildCallPlan(slots: List<PrioritySlot>): List<PlannedAttempt> =
        slots
            .filter { it.slot == 1 || it.slot == 2 }
            .distinctBy { it.slot }
            .sortedBy { it.slot }
            .flatMap { slot ->
                listOf(
                    PlannedAttempt(slot.slot, slot.contactId, 1),
                    PlannedAttempt(slot.slot, slot.contactId, 2),
                )
            }

    fun reduce(state: PersonaState, event: PersonaEvent): PersonaState = when (event) {
        PersonaEvent.Tap911 ->
            if (state.overlay !is PersonaOverlay.None) state
            else state.copy(overlay = PersonaOverlay.DialerUnavailable(contactId = null))

        PersonaEvent.Cancel911 -> when (state.overlay) {
            is PersonaOverlay.Countdown911 ->
                if (state.helpEpisode) state.copy(overlay = PersonaOverlay.Escalation)
                else state.copy(overlay = PersonaOverlay.None)
            is PersonaOverlay.DialerUnavailable -> state.copy(overlay = PersonaOverlay.None)
            else -> state
        }

        PersonaEvent.HangUp911 -> when (state.overlay) {
            is PersonaOverlay.Calling911 -> state.copy(overlay = PersonaOverlay.None)
            else -> state
        }

        PersonaEvent.Manual911 ->
            state.copy(overlay = PersonaOverlay.DialerUnavailable(contactId = null))

        is PersonaEvent.CallContact -> {
            if (state.overlay !is PersonaOverlay.None) state
            else if (state.contact(event.id) == null) state
            else state.copy(overlay = PersonaOverlay.DialerUnavailable(contactId = event.id))
        }

        PersonaEvent.FindCane ->
            if (state.overlay !is PersonaOverlay.None) state
            else if (!state.caneConnected) state.copy(toast = ToastMessage.CaneNotConnected)
            else state.copy(overlay = PersonaOverlay.CaneRinging)

        PersonaEvent.FoundCane ->
            if (state.overlay is PersonaOverlay.CaneRinging) state.copy(overlay = PersonaOverlay.None) else state

        PersonaEvent.OpenCaneSetup -> state.copy(showCaneSetup = true)
        PersonaEvent.CloseCaneSetup -> state.copy(showCaneSetup = false)
        is PersonaEvent.CaneLinked -> state.copy(
            showCaneSetup = false,
            caneConnected = event.connected,
            sensorsOk = event.connected,
            lastUse = if (event.connected) "ahora" else state.lastUse,
        )

        PersonaEvent.FallDetected ->
            if (state.overlay !is PersonaOverlay.None) state
            else state.copy(
                overlay = PersonaOverlay.Fall(FALL_SECONDS),
                helpEpisode = true,
                attemptsClosed = false,
                failedAttempts = 0,
            )

        PersonaEvent.ImFine -> when (val overlay = state.overlay) {
            is PersonaOverlay.Fall,
            is PersonaOverlay.Escalation,
            is PersonaOverlay.FamilyNoAnswer,
            is PersonaOverlay.Auto911Notice,
            is PersonaOverlay.CallPlanExhausted,
            -> clearHelp(state)
            is PersonaOverlay.CallingFamily -> if (overlay.inEpisode) clearHelp(state) else state
            else -> state
        }

        PersonaEvent.NeedHelp ->
            if (state.overlay is PersonaOverlay.Fall) {
                startPlan(state.copy(attemptsClosed = false, failedAttempts = 0))
            } else {
                state
            }

        PersonaEvent.FamilyAnswered -> {
            val call = state.overlay as? PersonaOverlay.CallingFamily ?: return state
            state.copy(
                overlay = PersonaOverlay.FamilyAnswered(
                    contactId = call.contactId,
                    attempt = call.attempt,
                    stoppedEscalation = call.inEpisode,
                ),
                helpEpisode = false,
                attemptsClosed = true,
                callOutcome = EpisodeCallOutcome.Answered,
            )
        }

        PersonaEvent.HangUpFamily -> {
            val call = state.overlay as? PersonaOverlay.CallingFamily
            if (call != null && !call.inEpisode) state.copy(overlay = PersonaOverlay.None) else state
        }

        PersonaEvent.DismissFamilyAnswered ->
            if (state.overlay is PersonaOverlay.FamilyAnswered) state.copy(overlay = PersonaOverlay.None) else state

        PersonaEvent.DismissHelp ->
            if (state.overlay is PersonaOverlay.HelpOnTheWay) clearHelp(state) else state

        PersonaEvent.SecondElapsed -> when (val overlay = state.overlay) {
            is PersonaOverlay.Countdown911 ->
                if (overlay.secondsLeft > 1) {
                    state.copy(overlay = overlay.copy(secondsLeft = overlay.secondsLeft - 1))
                } else {
                    state.copy(overlay = PersonaOverlay.DialerUnavailable(contactId = null))
                }
            is PersonaOverlay.Fall ->
                if (overlay.secondsLeft > 1) {
                    state.copy(overlay = overlay.copy(secondsLeft = overlay.secondsLeft - 1))
                } else {
                    startPlan(state)
                }
            is PersonaOverlay.CallingFamily ->
                if (overlay.secondsLeft > 1) {
                    state.copy(overlay = overlay.copy(secondsLeft = overlay.secondsLeft - 1))
                } else {
                    finishRing(state, overlay)
                }
            else -> state
        }

        PersonaEvent.MissedPauseElapsed -> {
            val missed = state.overlay as? PersonaOverlay.FamilyNoAnswer ?: return state
            if (state.attemptsClosed) state else advanceAfter(state, missed.contactId, missed.completedAttempt)
        }

        PersonaEvent.AutoNoticeElapsed ->
            if (state.overlay is PersonaOverlay.Auto911Notice) {
                state.copy(
                    overlay = PersonaOverlay.CallPlanExhausted(EpisodeCallOutcome.PlanExhausted),
                    helpEpisode = true,
                    attemptsClosed = true,
                    callOutcome = EpisodeCallOutcome.PlanExhausted,
                )
            } else {
                state
            }

        PersonaEvent.ShowPillTime ->
            if (state.overlay !is PersonaOverlay.None) state else state.copy(overlay = PersonaOverlay.PillTime)

        PersonaEvent.TookPillOverlay -> markNextPending(state).copy(overlay = PersonaOverlay.None)

        PersonaEvent.SnoozePill ->
            if (state.overlay is PersonaOverlay.PillTime) {
                state.copy(overlay = PersonaOverlay.None, toast = ToastMessage.Snoozed)
            } else {
                state
            }

        is PersonaEvent.OpenDose ->
            if (state.doses.any { it.id == event.id }) state.copy(sheetDoseId = event.id) else state

        PersonaEvent.DismissDose -> state.copy(sheetDoseId = null)

        PersonaEvent.ConfirmDose -> {
            val id = state.sheetDoseId ?: return state
            state.copy(
                doses = state.doses.map { dose -> if (dose.id == id) dose.copy(taken = true) else dose },
                sheetDoseId = null,
                toast = ToastMessage.DoseSaved,
            )
        }

        PersonaEvent.UndoDose -> {
            val id = state.sheetDoseId ?: return state
            state.copy(
                doses = state.doses.map { dose -> if (dose.id == id) dose.copy(taken = false) else dose },
                sheetDoseId = null,
            )
        }

        PersonaEvent.DismissToast -> state.copy(toast = null)

        is PersonaEvent.Search -> state.copy(query = event.query)

        is PersonaEvent.SelectTab -> state.copy(tab = event.tab)

        is PersonaEvent.SelectSegment -> state.copy(segment = event.segment)

        is PersonaEvent.OpenEditor -> {
            val existing = event.id?.let(state::contact)
            val draft = if (existing == null) {
                ContactDraft(null, "", "", "", priority = null, avatar = AvatarKind.Warm)
            } else {
                ContactDraft(
                    existing.id,
                    existing.name,
                    existing.relation,
                    existing.phone,
                    existing.priority,
                    existing.avatar,
                )
            }
            state.copy(editor = draft, editorError = null, deleteConfirm = false)
        }

        PersonaEvent.CloseEditor -> state.copy(editor = null, editorError = null, deleteConfirm = false)

        is PersonaEvent.UpdateDraft -> state.copy(editor = event.draft, editorError = null)

        PersonaEvent.SaveContact -> saveContact(state)

        PersonaEvent.AskDelete ->
            if (state.editor?.id != null) state.copy(deleteConfirm = true) else state

        PersonaEvent.CancelDelete -> state.copy(deleteConfirm = false)

        PersonaEvent.ConfirmDelete -> {
            val id = state.editor?.id ?: return state
            state.copy(
                contacts = state.contacts.filterNot { it.id == id },
                editor = null,
                editorError = null,
                deleteConfirm = false,
            )
        }

        PersonaEvent.PhotoTapped -> state.copy(toast = ToastMessage.PhotoLater)

        PersonaEvent.Reload -> state
    }

    private fun prioritySlots(state: PersonaState): List<PrioritySlot> = listOfNotNull(
        state.contacts.firstOrNull { it.priority == 1 }?.let { PrioritySlot(1, it.id) },
        state.contacts.firstOrNull { it.priority == 2 }?.let { PrioritySlot(2, it.id) },
    )

    private fun startPlan(state: PersonaState): PersonaState {
        val first = buildCallPlan(prioritySlots(state)).firstOrNull()
            ?: return state.copy(
                overlay = PersonaOverlay.CallPlanExhausted(EpisodeCallOutcome.NoPriorityContacts),
                helpEpisode = true,
                attemptsClosed = true,
                callOutcome = EpisodeCallOutcome.NoPriorityContacts,
            )
        return showAttempt(state, first)
    }

    private fun showAttempt(state: PersonaState, attempt: PlannedAttempt): PersonaState = state.copy(
        overlay = PersonaOverlay.CallingFamily(
            contactId = attempt.contactId,
            attempt = attempt.index,
            inEpisode = true,
            secondsLeft = DEMO_RING_TICKS,
            slot = attempt.slot,
        ),
        helpEpisode = true,
        attemptsClosed = false,
        callOutcome = EpisodeCallOutcome.InProgress,
    )

    private fun advanceAfter(state: PersonaState, contactId: String, completedIndex: Int): PersonaState {
        val plan = buildCallPlan(prioritySlots(state))
        val current = plan.indexOfFirst { it.contactId == contactId && it.index == completedIndex }
        val next = plan.getOrNull(current + 1)
        return if (next == null) exhaustPlan(state) else showAttempt(state, next)
    }

    private fun finishRing(state: PersonaState, call: PersonaOverlay.CallingFamily): PersonaState {
        if (!call.inEpisode) {
            return state.copy(overlay = PersonaOverlay.DialerUnavailable(call.contactId))
        }
        if (state.callOutcome == EpisodeCallOutcome.Answered || state.attemptsClosed) return state
        return advanceAfter(state, call.contactId, call.attempt)
            .let { next ->
                if (next.overlay is PersonaOverlay.CallPlanExhausted) next
                else next.copy(failedAttempts = state.failedAttempts + 1)
            }
    }

    private fun exhaustPlan(state: PersonaState): PersonaState = state.copy(
        overlay = PersonaOverlay.CallPlanExhausted(EpisodeCallOutcome.PlanExhausted),
        failedAttempts = state.failedAttempts + 1,
        attemptsClosed = true,
        helpEpisode = true,
        callOutcome = EpisodeCallOutcome.PlanExhausted,
    )

    private fun markNextPending(state: PersonaState): PersonaState {
        val target = state.nextDose() ?: return state.copy(toast = ToastMessage.DoseSaved)
        return state.copy(
            doses = state.doses.map { dose -> if (dose.id == target.id) dose.copy(taken = true) else dose },
            toast = ToastMessage.DoseSaved,
        )
    }

    private fun saveContact(state: PersonaState): PersonaState {
        val draft = state.editor ?: return state
        if (draft.name.isBlank()) return state.copy(editorError = FieldError.Name)
        if (draft.phone.isBlank()) return state.copy(editorError = FieldError.Phone)
        val priority = draft.priority?.takeIf { it == 1 || it == 2 }
        val cleared = if (priority == null) {
            state.contacts
        } else {
            state.contacts.map { contact ->
                if (contact.priority == priority && contact.id != draft.id) contact.copy(priority = null) else contact
            }
        }
        val contacts = if (draft.id == null) {
            cleared + Contact(
                id = "c-${cleared.size}-${draft.name.length}",
                name = draft.name.trim(),
                relation = draft.relation.trim().ifBlank { "contacto" },
                phone = draft.phone.trim(),
                priority = priority,
            )
        } else {
            cleared.map { contact ->
                if (contact.id == draft.id) {
                    contact.copy(
                        name = draft.name.trim(),
                        relation = draft.relation.trim().ifBlank { "contacto" },
                        phone = draft.phone.trim(),
                        priority = priority,
                    )
                } else {
                    contact
                }
            }
        }
        return state.copy(contacts = contacts, editor = null, editorError = null, deleteConfirm = false)
    }

    private fun clearHelp(state: PersonaState): PersonaState = state.copy(
        overlay = PersonaOverlay.None,
        helpEpisode = false,
        attemptsClosed = false,
        failedAttempts = 0,
        callOutcome = null,
    )
}

fun timerIdentity(overlay: PersonaOverlay): String = when (overlay) {
    is PersonaOverlay.Countdown911 -> "c911-${overlay.automatic}"
    is PersonaOverlay.Fall -> "fall"
    is PersonaOverlay.CallingFamily -> "call-${overlay.contactId}-${overlay.attempt}-${overlay.inEpisode}"
    is PersonaOverlay.FamilyNoAnswer -> "miss-${overlay.completedAttempt}"
    is PersonaOverlay.Auto911Notice -> "auto"
    else -> "none"
}
