package com.example.guardmemobile.data.auth

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.util.UUID

private val Context.sessionStore: DataStore<Preferences> by preferencesDataStore("guardme_session")

/**
 * shortcut: token en claro en almacenamiento privado de la app;
 * cifrar con Android Keystore antes de producción.
 */
class AuthRepository(private val context: Context) {
    private val tokenKey = stringPreferencesKey("token")
    private val clientInstallKey = stringPreferencesKey("client_installation_id")
    private val serverInstallKey = stringPreferencesKey("server_installation_id")
    private val caneDeviceKey = stringPreferencesKey("cane_device_id")
    private val caneIdKey = stringPreferencesKey("cane_backend_id")

    val tokenFlow: Flow<String?> = context.sessionStore.data.map { it[tokenKey] }

    suspend fun token(): String? = tokenFlow.first()

    suspend fun clientInstallationId(): String {
        val existing = context.sessionStore.data.first()[clientInstallKey]
        if (existing != null) return existing
        val created = UUID.randomUUID().toString()
        context.sessionStore.edit { it[clientInstallKey] = created }
        return created
    }

    suspend fun serverInstallationId(): String? =
        context.sessionStore.data.first()[serverInstallKey]

    suspend fun saveSession(token: String, serverInstallationId: String?) {
        context.sessionStore.edit { prefs ->
            prefs[tokenKey] = token
            if (serverInstallationId != null) {
                prefs[serverInstallKey] = serverInstallationId
            }
        }
    }

    suspend fun saveServerInstallationId(id: String) {
        context.sessionStore.edit { it[serverInstallKey] = id }
    }

    suspend fun clearSession() {
        context.sessionStore.edit { prefs ->
            prefs.remove(tokenKey)
            prefs.remove(serverInstallKey)
        }
    }

    suspend fun caneDeviceId(): String? =
        context.sessionStore.data.first()[caneDeviceKey]

    suspend fun saveCaneDeviceId(id: String) {
        context.sessionStore.edit { it[caneDeviceKey] = id }
    }

    suspend fun caneBackendId(): String? =
        context.sessionStore.data.first()[caneIdKey]

    suspend fun saveCaneBackendId(id: String) {
        context.sessionStore.edit { it[caneIdKey] = id }
    }
}
