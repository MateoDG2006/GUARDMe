package com.example.guardmemobile.cuidador

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.guardmemobile.R
import com.example.guardmemobile.guardMe
import com.example.guardmemobile.session.ActiveSession
import com.example.guardmemobile.ui.components.FillKind
import com.example.guardmemobile.ui.components.Glyph
import com.example.guardmemobile.ui.components.GuardPrimaryButton
import com.example.guardmemobile.ui.components.GuardTab
import com.example.guardmemobile.ui.components.GuardTabBar
import com.example.guardmemobile.ui.components.GuardToastHost
import com.example.guardmemobile.ui.theme.Body
import com.example.guardmemobile.ui.theme.ButtonCare
import com.example.guardmemobile.ui.theme.Figtree
import com.example.guardmemobile.ui.theme.GuardColor

@Composable
fun CuidadorApp(session: ActiveSession, onExit: () -> Unit) {
    val container = LocalContext.current.guardMe
    val viewModel: CuidadorViewModel = viewModel(
        key = session.profileId + session.accountId,
        factory = CuidadorViewModel.factory(container, session),
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    BackHandler {
        if (state.call != null || state.stack.size > 1) viewModel.back() else onExit()
    }
    val showTabs = state.screen is CareScreen.TabRoot && state.call == null
    Box(
        Modifier
            .fillMaxSize()
            .background(GuardColor.Cream),
    ) {
        Scaffold(
            containerColor = GuardColor.Cream,
            contentWindowInsets = WindowInsets(0, 0, 0, 0),
            bottomBar = {
                if (showTabs) {
                    val selected = (state.screen as CareScreen.TabRoot).tab
                    val tabs = buildList {
                        add(GuardTab(stringResource(R.string.tab_home), Glyph.Home, selected == CareTab.Home) {
                            viewModel.selectTab(CareTab.Home)
                        })
                        add(GuardTab(stringResource(R.string.tab_history), Glyph.History, selected == CareTab.History) {
                            viewModel.selectTab(CareTab.History)
                        })
                        add(GuardTab(stringResource(R.string.tab_remember), Glyph.Clock, selected == CareTab.Reminders) {
                            viewModel.selectTab(CareTab.Reminders)
                        })
                        add(GuardTab(stringResource(R.string.tab_cane), Glyph.Cane, selected == CareTab.Cane) {
                            viewModel.selectTab(CareTab.Cane)
                        })
                        add(GuardTab(stringResource(R.string.tab_team), Glyph.Team, selected == CareTab.Team) {
                            viewModel.selectTab(CareTab.Team)
                        })
                    }
                    GuardTabBar(tabs)
                }
            },
        ) { padding ->
            Box(Modifier.padding(padding)) {
                when (val screen = state.screen) {
                    is CareScreen.TabRoot -> when (screen.tab) {
                        CareTab.Home -> CuidadorHome(state, viewModel)
                        CareTab.History -> CuidadorHistory(state, viewModel)
                        CareTab.Reminders -> CuidadorReminders(state, viewModel)
                        CareTab.Cane -> CuidadorCane(state, viewModel)
                        CareTab.Team -> CuidadorTeam(state, viewModel, onLogout = onExit)
                    }
                    CareScreen.Alert -> CuidadorAlert(state, viewModel)
                    CareScreen.Live -> CuidadorLive(state, viewModel)
                    CareScreen.Notifications -> CuidadorNotifications(state, viewModel)
                    CareScreen.NewReminder -> CuidadorNewReminder(state, viewModel)
                    CareScreen.Invite -> CuidadorInvite(state, viewModel)
                    CareScreen.Profile -> CuidadorProfile(state, viewModel)
                }
            }
        }
        if (state.call != null) {
            CareCallOverlay(state, viewModel)
        }
        GuardToastHost(
            text = careToast(state.toast),
            isError = state.toast is CareToast.Error,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = if (showTabs) 108.dp else 24.dp),
        )
    }
}

@Composable
private fun CareCallOverlay(state: CuidadorState, viewModel: CuidadorViewModel) {
    val emergency = state.call == CareCall.Emergency
    Column(
        Modifier
            .fillMaxSize()
            .background(if (emergency) GuardColor.Emergency else GuardColor.Brown)
            .padding(22.dp)
            .navigationBarsPadding(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.calling),
            color = GuardColor.White,
            style = Body.copy(fontSize = 18.sp),
        )
        Text(
            text = if (emergency) "911" else state.firstName,
            color = GuardColor.White,
            fontFamily = Figtree,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 40.sp,
            modifier = Modifier.padding(vertical = 12.dp),
        )
        GuardPrimaryButton(
            text = stringResource(R.string.hangup),
            onClick = viewModel::endCall,
            kind = FillKind.Navy,
            height = 60.dp,
            textStyle = ButtonCare,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun careToast(toast: CareToast?): String? = when (toast) {
    null -> null
    CareToast.Ringing -> stringResource(R.string.toast_ring)
    CareToast.Sensors -> stringResource(R.string.toast_sensors)
    CareToast.Preferences -> stringResource(R.string.prefs_pending)
    CareToast.ReminderSaved -> stringResource(R.string.toast_reminder)
    CareToast.InviteSent -> stringResource(R.string.toast_invite)
    CareToast.ProfileSaved -> stringResource(R.string.toast_profile_saved)
    is CareToast.Error -> toast.message
}
