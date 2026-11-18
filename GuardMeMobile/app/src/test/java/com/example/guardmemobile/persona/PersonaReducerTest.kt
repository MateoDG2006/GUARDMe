package com.example.guardmemobile.persona

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PersonaReducerTest {

    private fun fold(start: PersonaState, vararg events: PersonaEvent): PersonaState =
        events.fold(start) { state, event -> PersonaReducer.reduce(state, event) }

    private fun fallThenRings(rings: Int): PersonaState = fold(
        PersonaState.fixture(),
        PersonaEvent.FallDetected,
        *Array(PersonaReducer.FALL_SECONDS) { PersonaEvent.SecondElapsed },
        *Array(rings * PersonaReducer.DEMO_RING_TICKS) { PersonaEvent.SecondElapsed },
    )

    @Test
    fun emergencyButtonShowsDialerUnavailable() {
        val shown = PersonaReducer.reduce(PersonaState.fixture(), PersonaEvent.Tap911)
        assertEquals(PersonaOverlay.DialerUnavailable(null), shown.overlay)
        val closed = PersonaReducer.reduce(shown, PersonaEvent.Cancel911)
        assertEquals(PersonaOverlay.None, closed.overlay)
    }

    @Test
    fun contactCallShowsWhoWouldBeCalled() {
        val ana = PersonaState.fixture().preferred()!!
        val shown = PersonaReducer.reduce(PersonaState.fixture(), PersonaEvent.CallContact(ana.id))
        assertEquals(PersonaOverlay.DialerUnavailable(ana.id), shown.overlay)
        assertFalse(shown.helpEpisode)
    }

    @Test
    fun fallTimeoutStartsPreferredAttemptOne() {
        val call = fallThenRings(0).overlay as PersonaOverlay.CallingFamily
        assertEquals("c1", call.contactId)
        assertEquals(1, call.slot)
        assertEquals(1, call.attempt)
        assertTrue(call.inEpisode)
    }

    @Test
    fun planOrderIsPreferredTwiceThenSecondTwice() {
        val first = fallThenRings(0).overlay as PersonaOverlay.CallingFamily
        val second = fallThenRings(1).overlay as PersonaOverlay.CallingFamily
        val third = fallThenRings(2).overlay as PersonaOverlay.CallingFamily
        val fourth = fallThenRings(3).overlay as PersonaOverlay.CallingFamily
        assertEquals(1 to "c1" to 1, first.slot to first.contactId to first.attempt)
        assertEquals(1 to "c1" to 2, second.slot to second.contactId to second.attempt)
        assertEquals(2 to "c2" to 1, third.slot to third.contactId to third.attempt)
        assertEquals(2 to "c2" to 2, fourth.slot to fourth.contactId to fourth.attempt)
    }

    @Test
    fun answerOnFirstAttemptStopsThePlan() {
        val calling = fallThenRings(0)
        val answered = PersonaReducer.reduce(calling, PersonaEvent.FamilyAnswered)
        val overlay = answered.overlay as PersonaOverlay.FamilyAnswered
        assertEquals("c1", overlay.contactId)
        assertEquals(1, overlay.attempt)
        assertEquals(EpisodeCallOutcome.Answered, answered.callOutcome)
    }

    @Test
    fun fourMissedAttemptsDoNotOpen911() {
        val done = fallThenRings(4)
        val overlay = done.overlay as PersonaOverlay.CallPlanExhausted
        assertEquals(EpisodeCallOutcome.PlanExhausted, overlay.outcome)
    }

    @Test
    fun emptyPlanDoesNotInventANumber() {
        val empty = PersonaState.fixture().copy(contacts = emptyList(), overlay = PersonaOverlay.Fall(1))
        val done = PersonaReducer.reduce(empty, PersonaEvent.SecondElapsed)
        val overlay = done.overlay as PersonaOverlay.CallPlanExhausted
        assertEquals(EpisodeCallOutcome.NoPriorityContacts, overlay.outcome)
    }

    @Test
    fun findCaneShowsRingingWhenConnected() {
        val shown = PersonaReducer.reduce(PersonaState.fixture().copy(caneConnected = true), PersonaEvent.FindCane)
        assertEquals(PersonaOverlay.CaneRinging, shown.overlay)
    }

    @Test
    fun findCaneWithoutCaneAsksToConnectFirst() {
        val shown = PersonaReducer.reduce(PersonaState.fixture(), PersonaEvent.FindCane)
        assertEquals(ToastMessage.CaneNotConnected, shown.toast)
    }

    @Test
    fun confirmingDoseMarksItTaken() {
        val pending = PersonaState.fixture().doses.first { !it.taken && it.bucket == DayBucket.Today }
        val open = PersonaReducer.reduce(PersonaState.fixture(), PersonaEvent.OpenDose(pending.id))
        val saved = PersonaReducer.reduce(open, PersonaEvent.ConfirmDose)
        assertEquals(null, saved.sheetDoseId)
        assertTrue(saved.doses.first { it.id == pending.id }.taken)
        assertEquals(ToastMessage.DoseSaved, saved.toast)
    }

    @Test
    fun buildCallPlanExpandsEachSlotTwice() {
        val plan = PersonaReducer.buildCallPlan(
            listOf(PrioritySlot(1, "c1"), PrioritySlot(2, "c2")),
        )
        assertEquals(
            listOf(
                PlannedAttempt(1, "c1", 1),
                PlannedAttempt(1, "c1", 2),
                PlannedAttempt(2, "c2", 1),
                PlannedAttempt(2, "c2", 2),
            ),
            plan,
        )
        assertTrue(PersonaReducer.buildCallPlan(emptyList()).isEmpty())
    }

    @Test
    fun imFineDuringAttemptCancelsEscalation() {
        val calling = fold(PersonaState.fixture(), PersonaEvent.FallDetected, PersonaEvent.NeedHelp)
        val fine = PersonaReducer.reduce(calling, PersonaEvent.ImFine)
        assertEquals(PersonaOverlay.None, fine.overlay)
        assertFalse(fine.helpEpisode)
        assertNull(fine.callOutcome)
    }

    @Test
    fun demoRingTicksAreNotAProductTimeout() {
        assertTrue(PersonaReducer.DEMO_RING_TICKS in 25..30)
        assertEquals(30, PersonaReducer.FALL_SECONDS)
    }
}
