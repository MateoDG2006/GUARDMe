package com.example.guardmemobile.persona

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.guardmemobile.R
import com.example.guardmemobile.guardMe
import com.example.guardmemobile.onboarding.CaneSetupScreen
import com.example.guardmemobile.session.ActiveSession
import com.example.guardmemobile.ui.components.Glyph
import com.example.guardmemobile.ui.components.GuardTab
import com.example.guardmemobile.ui.components.GuardTabBar
import com.example.guardmemobile.ui.components.GuardToastHost
import com.example.guardmemobile.ui.theme.GuardColor

@Composable
fun PersonaApp(session: ActiveSession, onExit: () -> Unit) {
    val container = LocalContext.current.guardMe
    val viewModel: PersonaViewModel = viewModel(
        key = session.profileId,
        factory = PersonaViewModel.factory(container, session),
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    val dispatch = viewModel::dispatch
    val modal = state.overlay !is PersonaOverlay.None ||
        state.sheetDoseId != null ||
        state.deleteConfirm ||
        state.showCaneSetup

    RequestPersonaLocationPermission(onGranted = viewModel::onLocationPermissionGranted)

    BackHandler {
        when {
            state.showCaneSetup -> dispatch(PersonaEvent.CloseCaneSetup)
            state.deleteConfirm -> dispatch(PersonaEvent.CancelDelete)
            state.editor != null -> dispatch(PersonaEvent.CloseEditor)
            state.sheetDoseId != null -> dispatch(PersonaEvent.DismissDose)
            state.overlay !is PersonaOverlay.None -> Unit
            else -> onExit()
        }
    }

    if (state.showCaneSetup) {
        CaneSetupScreen(
            profileId = session.profileId,
            onDone = { connected -> dispatch(PersonaEvent.CaneLinked(connected)) },
            onCancel = { dispatch(PersonaEvent.CloseCaneSetup) },
        )
        return
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(GuardColor.Cream),
    ) {
        val hideBackground = if (modal) Modifier.clearAndSetSemantics { } else Modifier
        if (state.editor != null) {
            PersonaEditor(
                state = state,
                onEvent = dispatch,
                modifier = hideBackground,
            )
        } else {
            Scaffold(
                modifier = hideBackground,
                containerColor = GuardColor.Cream,
                contentWindowInsets = WindowInsets(0, 0, 0, 0),
                bottomBar = {
                    GuardTabBar(
                        tabs = listOf(
                            GuardTab(stringResource(R.string.tab_home), Glyph.Home, state.tab == PersonaTab.Home) {
                                dispatch(PersonaEvent.SelectTab(PersonaTab.Home))
                            },
                            GuardTab(stringResource(R.string.tab_contacts), Glyph.Person, state.tab == PersonaTab.Contacts) {
                                dispatch(PersonaEvent.SelectTab(PersonaTab.Contacts))
                            },
                            GuardTab(stringResource(R.string.tab_reminders), Glyph.Clock, state.tab == PersonaTab.Reminders) {
                                dispatch(PersonaEvent.SelectTab(PersonaTab.Reminders))
                            },
                            GuardTab(stringResource(R.string.tab_cane), Glyph.Cane, state.tab == PersonaTab.Cane) {
                                dispatch(PersonaEvent.SelectTab(PersonaTab.Cane))
                            },
                        ),
                    )
                },
            ) { padding ->
                Box(Modifier.padding(padding)) {
                    when (state.tab) {
                        PersonaTab.Home -> PersonaHome(state, dispatch)
                        PersonaTab.Contacts -> PersonaContacts(state, dispatch)
                        PersonaTab.Reminders -> PersonaReminders(state, dispatch)
                        PersonaTab.Cane -> PersonaCane(state, dispatch, onLogout = onExit)
                    }
                }
            }
        }

        if (state.overlay !is PersonaOverlay.None) {
            PersonaOverlayHost(state, dispatch)
        }
        val sheetId = state.sheetDoseId
        if (sheetId != null) {
            DoseSheet(state, sheetId, dispatch)
        }
        if (state.deleteConfirm) {
            DeleteContactDialog(state, dispatch)
        }
        GuardToastHost(
            text = personaToast(state),
            isError = state.toast is ToastMessage.Error || state.toast == ToastMessage.CaneNotConnected,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = if (state.editor == null && state.overlay is PersonaOverlay.None) 108.dp else 24.dp),
        )
    }
}

@Composable
private fun RequestPersonaLocationPermission(onGranted: () -> Unit) {
    val context = LocalContext.current
    val permissions = remember {
        arrayOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        )
    }
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        if (result.values.any { it }) onGranted()
    }
    LaunchedEffect(Unit) {
        val granted = permissions.any {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }
        if (granted) {
            onGranted()
            return@LaunchedEffect
        }
        // Tras NavHost el registry a veces no está listo en el primer frame.
        kotlinx.coroutines.delay(300)
        launcher.launch(permissions)
    }
}

@Composable
private fun personaToast(state: PersonaState): String? {
    val toast = state.toast ?: return null
    val family = state.preferred()?.name
    return when (toast) {
        ToastMessage.DoseSaved ->
            if (family != null) stringResource(R.string.toast_dose, family)
            else stringResource(R.string.toast_dose_no_family)
        ToastMessage.Snoozed -> stringResource(R.string.toast_snooze)
        is ToastMessage.NoAnswer -> stringResource(R.string.toast_no_answer, toast.name)
        ToastMessage.PhotoLater -> stringResource(R.string.toast_photo)
        ToastMessage.ProtocolPending -> stringResource(R.string.toast_protocol_pending)
        ToastMessage.CaneNotConnected -> stringResource(R.string.err_cane_not_connected)
        is ToastMessage.Error -> toast.message
    }
}
