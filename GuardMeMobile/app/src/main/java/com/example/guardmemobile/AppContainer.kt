package com.example.guardmemobile

import android.content.Context
import com.example.guardmemobile.ble.CaneBleScanner
import com.example.guardmemobile.ble.GuardMeGatt
import com.example.guardmemobile.data.api.GuardMeApiClient
import com.example.guardmemobile.data.auth.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.atomic.AtomicReference

class AppContainer(context: Context) {
    val appContext: Context = context.applicationContext
    val auth = AuthRepository(appContext)
    private val tokenRef = AtomicReference<String?>(null)
    private val installationRef = AtomicReference<String?>(null)
    private val sessionInvalid = MutableStateFlow(false)
    val sessionInvalidEvents: StateFlow<Boolean> = sessionInvalid.asStateFlow()

    val api = GuardMeApiClient(
        tokenProvider = { tokenRef.get() },
        installationIdProvider = { installationRef.get() },
        onSessionInvalid = {
            auth.clearSession()
            tokenRef.set(null)
            installationRef.set(null)
            sessionInvalid.value = true
        },
    )

    val ble = CaneBleScanner(appContext)
    val gatt = GuardMeGatt(appContext)

    fun setCredentials(token: String?, installationId: String?) {
        tokenRef.set(token)
        installationRef.set(installationId)
    }

    fun consumeSessionInvalid() {
        sessionInvalid.value = false
    }
}

class GuardMeApp : android.app.Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}

val Context.guardMe: AppContainer
    get() = (applicationContext as GuardMeApp).container
