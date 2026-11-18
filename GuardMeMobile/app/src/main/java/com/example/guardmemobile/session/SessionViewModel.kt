package com.example.guardmemobile.session

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.guardmemobile.AppContainer
import com.example.guardmemobile.data.api.ApiException
import com.example.guardmemobile.data.api.userMessage
import com.example.guardmemobile.R
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

data class SessionUiState(
    val loading: Boolean = true,
    val email: String = "",
    val password: String = "",
    val error: String? = null,
    val destination: AppDestination = AppDestination.Login,
    val session: ActiveSession? = null,
)

class SessionViewModel(private val container: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(SessionUiState())
    val state: StateFlow<SessionUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch { restore() }
    }

    fun updateEmail(value: String) = _state.update { it.copy(email = value, error = null) }

    fun updatePassword(value: String) = _state.update { it.copy(password = value, error = null) }

    fun login() {
        val email = _state.value.email.trim()
        val password = _state.value.password
        if (email.isBlank() || password.isBlank()) {
            _state.update { it.copy(error = container.appContext.getString(R.string.err_login_empty)) }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            try {
                val auth = container.api.signIn(email, password)
                val token = auth.token ?: auth.session?.token
                    ?: throw ApiException("NO_TOKEN", 500)
                container.setCredentials(token, null)
                container.auth.saveSession(token, null)
                val active = bootstrapAndMe(defaultName = auth.user?.name ?: email.substringBefore('@'))
                _state.update {
                    it.copy(
                        loading = false,
                        password = "",
                        destination = destinationFor(active.relation),
                        session = active,
                    )
                }
            } catch (error: Exception) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                _state.update {
                    it.copy(
                        loading = false,
                        error = error.userMessage(container.appContext),
                        destination = AppDestination.Login,
                    )
                }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            runCatching { container.api.logoutDomain("all") }
            runCatching { container.api.signOutAuth() }
            container.auth.clearSession()
            container.setCredentials(null, null)
            _state.update {
                SessionUiState(
                    loading = false,
                    email = it.email,
                    destination = AppDestination.Login,
                )
            }
        }
    }

    fun onForcedLogout() {
        container.consumeSessionInvalid()
        _state.update {
            SessionUiState(loading = false, email = it.email, destination = AppDestination.Login)
        }
    }

    private suspend fun restore() {
        val token = container.auth.token()
        if (token.isNullOrBlank()) {
            _state.update { it.copy(loading = false, destination = AppDestination.Login) }
            return
        }
        container.setCredentials(token, container.auth.serverInstallationId())
        try {
            val active = bootstrapAndMe(defaultName = "GuardMe")
            _state.update {
                it.copy(
                    loading = false,
                    destination = destinationFor(active.relation),
                    session = active,
                )
            }
        } catch (_: Exception) {
            container.auth.clearSession()
            container.setCredentials(null, null)
            _state.update { it.copy(loading = false, destination = AppDestination.Login) }
        }
    }

    private suspend fun bootstrapAndMe(defaultName: String): ActiveSession {
        try {
            return finishMe()
        } catch (error: ApiException) {
            if (error.code != "ACCOUNT_NOT_BOOTSTRAPPED" && error.httpStatus != 403) throw error
        }
        val kind = guessOnboardingKind(_state.value.email)
        container.api.bootstrap(kind, defaultName)
        return finishMe()
    }

    private suspend fun finishMe(): ActiveSession {
        // Siempre registrar/rebind: la instalación guarda auth_session_id de Better Auth.
        val clientId = container.auth.clientInstallationId()
        val pushToken = runCatching { FirebaseMessaging.getInstance().token.await() }.getOrNull()
        val created = container.api.createInstallation(clientId, pushToken = pushToken)
        val installationId = created.id
        container.auth.saveServerInstallationId(installationId)
        container.setCredentials(container.auth.token(), installationId)
        val me = try {
            container.api.me()
        } catch (error: ApiException) {
            if (error.code == "ACCOUNT_NOT_BOOTSTRAPPED") {
                container.api.bootstrap(guessOnboardingKind(_state.value.email), defaultNameFromEmail())
                container.api.createInstallation(clientId, pushToken = pushToken).also {
                    container.auth.saveServerInstallationId(it.id)
                    container.setCredentials(container.auth.token(), it.id)
                }
                container.api.me()
            } else {
                throw error
            }
        }
        val access = me.accesses.firstOrNull()
            ?: throw ApiException("NO_PROFILE_ACCESS", 409, "Sin perfil activo")
        return ActiveSession(
            accountId = me.account.id,
            displayName = me.account.displayName.ifBlank { access.profileName },
            profileId = access.profileId,
            profileName = access.profileName,
            relation = access.relation,
            caregiverCategory = access.caregiverCategory,
            telephony = me.capabilities.telephony,
            access = access,
            capabilities = me.capabilities,
        )
    }

    private fun defaultNameFromEmail(): String =
        _state.value.email.substringBefore('@').ifBlank { "GuardMe" }

    private fun guessOnboardingKind(email: String): String =
        when {
            email.contains("rosa", ignoreCase = true) -> "self"
            else -> "caregiver"
        }

    private fun destinationFor(relation: String): AppDestination =
        if (relation == "user") AppDestination.Persona else AppDestination.Cuidador

    companion object {
        fun factory(container: AppContainer): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T =
                    SessionViewModel(container) as T
            }
    }
}
