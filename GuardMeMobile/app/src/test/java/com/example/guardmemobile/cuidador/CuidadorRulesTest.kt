package com.example.guardmemobile.cuidador

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CuidadorRulesTest {

    @Test
    fun fixtureStartsOnHomeWithoutDemoNotices() {
        val state = CuidadorState.fixture(CareRole.Familiar)
        assertTrue(state.screen is CareScreen.TabRoot)
        assertEquals(CareTab.Home, (state.screen as CareScreen.TabRoot).tab)
        assertTrue(state.notices.isEmpty())
        assertEquals("Ana", state.youName)
    }

    @Test
    fun alertFixtureOpensAlertScreen() {
        val state = CuidadorState.fixture(CareRole.Medico, alert = AlertMode.Fall)
        assertTrue(state.screen is CareScreen.Alert)
        assertEquals(AlertMode.Fall, state.alert)
    }

    @Test
    fun acceptResponsibilityClosesOnce() {
        var state = CuidadorState.fixture(CareRole.Familiar, alert = AlertMode.Fall)
        val before = state.history.size
        state = accept(state)
        assertEquals(AttentionOutcome.ReceivedAssistance, state.attention)
        assertEquals("Recibió asistencia", state.history.first().badge)
        assertNull(state.alert)
        assertNull(state.call)
        assertEquals(before + 1, state.history.size)
        val again = accept(state)
        assertEquals(before + 1, again.history.size)
    }

    private fun accept(state: CuidadorState): CuidadorState {
        if (state.attention == AttentionOutcome.ReceivedAssistance) return state
        val event = HistoryEvent(
            id = "resolved-${state.history.size}",
            day = "Hoy",
            kind = HistoryKind.Fall,
            title = "Posible caída",
            body = "Ya hablé con ${state.firstName}, está bien",
            time = "ahora",
            badge = "Recibió asistencia",
        )
        return state.copy(
            attention = AttentionOutcome.ReceivedAssistance,
            alert = null,
            handlerName = state.youName,
            call = null,
            history = listOf(event) + state.history,
            stack = listOf(CareScreen.TabRoot(CareTab.Home)),
        )
    }
}
