package com.example.guardmemobile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.guardmemobile.cuidador.CuidadorApp
import com.example.guardmemobile.persona.PersonaApp
import com.example.guardmemobile.session.AppDestination
import com.example.guardmemobile.session.LoginScreen
import com.example.guardmemobile.session.SessionViewModel
import com.example.guardmemobile.ui.theme.GuardColor

@Composable
fun GuardMeRoot() {
    val context = LocalContext.current
    val container = context.guardMe
    val sessionVm = viewModel<SessionViewModel>(factory = SessionViewModel.factory(container))
    val sessionState by sessionVm.state.collectAsStateWithLifecycle()
    val forcedLogout by container.sessionInvalidEvents.collectAsStateWithLifecycle()
    val nav = rememberNavController()

    LaunchedEffect(forcedLogout) {
        if (forcedLogout) {
            sessionVm.onForcedLogout()
            nav.navigate("login") {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    LaunchedEffect(sessionState.destination, sessionState.loading) {
        if (sessionState.loading) return@LaunchedEffect
        val route = when (sessionState.destination) {
            AppDestination.Login -> "login"
            AppDestination.Persona -> "persona"
            AppDestination.Cuidador -> "cuidador"
        }
        val current = nav.currentDestination?.route
        if (current != route) {
            nav.navigate(route) {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    Box(Modifier.fillMaxSize().background(GuardColor.Cream)) {
        NavHost(navController = nav, startDestination = "login") {
            composable("login") {
                LoginScreen(
                    state = sessionState,
                    onEmail = sessionVm::updateEmail,
                    onPassword = sessionVm::updatePassword,
                    onLogin = sessionVm::login,
                )
            }
            composable("persona") {
                val session = sessionState.session
                if (session == null) {
                    LaunchedEffect(Unit) { sessionVm.onForcedLogout() }
                } else {
                    PersonaApp(
                        session = session,
                        onExit = sessionVm::logout,
                    )
                }
            }
            composable("cuidador") {
                val session = sessionState.session
                if (session == null) {
                    LaunchedEffect(Unit) { sessionVm.onForcedLogout() }
                } else {
                    CuidadorApp(
                        session = session,
                        onExit = sessionVm::logout,
                    )
                }
            }
        }
        if (sessionState.loading) {
            CircularProgressIndicator(Modifier.align(Alignment.Center))
        }
    }
}
