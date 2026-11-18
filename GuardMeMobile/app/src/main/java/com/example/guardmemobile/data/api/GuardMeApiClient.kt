package com.example.guardmemobile.data.api

import com.example.guardmemobile.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.UUID
import java.util.concurrent.TimeUnit

class GuardMeApiClient(
    private val tokenProvider: () -> String?,
    private val installationIdProvider: () -> String?,
    private val onSessionInvalid: suspend () -> Unit,
    private val baseUrl: String = BuildConfig.GUARDME_API_BASE_URL.trimEnd('/'),
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build(),
) {
    val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val media = "application/json; charset=utf-8".toMediaType()

    suspend fun signIn(email: String, password: String): AuthSessionResponse =
        postUnauth("/v1/auth/sign-in/email", SignInBody(email.trim(), password))

    suspend fun signOutAuth() {
        runCatching { postEmpty("/v1/auth/sign-out") }
    }

    suspend fun bootstrap(kind: String, displayName: String): BootstrapResponse =
        post("/v1/accounts/bootstrap", BootstrapBody(kind, displayName), requireInstallation = false)

    suspend fun createInstallation(
        clientInstallationId: String,
        appVersion: String = "1.0",
        pushToken: String? = null,
    ): InstallationView =
        post(
            "/v1/installations",
            InstallationBody(
                clientInstallationId = clientInstallationId,
                appVersion = appVersion,
                pushToken = pushToken,
            ),
            requireInstallation = false,
        )

    suspend fun me(): MeResponse = get("/v1/me")

    suspend fun logoutDomain(scope: String = "all") {
        runCatching { post<LogoutBody, Unit>("/v1/session/logout", LogoutBody(scope)) }
    }

    suspend fun getProfile(profileId: String): ProfileView =
        get("/v1/profiles/$profileId")

    suspend fun updateProfile(profileId: String, body: UpdateProfileBody): ProfileView =
        exchange(
            method = "PATCH",
            path = "/v1/profiles/$profileId",
            bodyJson = json.encodeToString(body),
        )

    suspend fun listContacts(profileId: String): ContactListView =
        get("/v1/profiles/$profileId/contacts")

    suspend fun createContact(profileId: String, body: CreateContactBody): ContactListView =
        post("/v1/profiles/$profileId/contacts", body)

    suspend fun deleteContact(
        profileId: String,
        contactId: String,
        expectedContactsVersion: Int,
    ): ContactListView =
        exchange(
            method = "DELETE",
            path = "/v1/profiles/$profileId/contacts/$contactId" +
                "?expectedContactsVersion=$expectedContactsVersion",
            bodyJson = null,
        )

    suspend fun listReminders(profileId: String): List<ReminderView> =
        get("/v1/profiles/$profileId/reminders")

    suspend fun createReminder(profileId: String, body: CreateReminderBody): ReminderView =
        post("/v1/profiles/$profileId/reminders", body)

    suspend fun listOccurrences(
        profileId: String,
        fromIso: String,
        toIso: String,
    ): List<OccurrenceView> =
        get("/v1/profiles/$profileId/occurrences?from=$fromIso&to=$toIso")

    suspend fun respondOccurrence(
        id: String,
        response: String,
        expectedVersion: Int,
    ): OccurrenceView =
        post("/v1/occurrences/$id/responses", OccurrenceResponseBody(response, expectedVersion))

    suspend fun listNotifications(): NotificationPage = get("/v1/notifications")

    suspend fun ackNotification(id: String) {
        postEmpty("/v1/notifications/$id/acknowledgements")
    }

    suspend fun listMemberships(profileId: String): List<MemberView> =
        get("/v1/profiles/$profileId/memberships")

    suspend fun issueInvitation(profileId: String, hint: String): InviteIssuedView =
        post("/v1/profiles/$profileId/invitations", IssueInviteBody(hint))

    suspend fun listCanes(profileId: String): List<CaneView> =
        get("/v1/profiles/$profileId/canes")

    suspend fun claimCane(body: ClaimCaneBody): CaneView =
        post("/v1/canes/claim", body)

    suspend fun setGateway(caneId: String): CaneView =
        postEmptyTyped("/v1/canes/$caneId/gateway")

    suspend fun listIncidentsRaw(profileId: String): List<JsonElement> =
        get("/v1/profiles/$profileId/incidents")

    suspend fun postGatewayEvents(events: List<GatewayEventBody>): GatewayEventsResultView =
        post("/v1/gateway-events", GatewayEventsBatchBody(events))

    suspend fun activateIncident(body: ActivateIncidentBody): JsonElement =
        post("/v1/incidents", body)

    suspend fun publishLocation(profileId: String, body: PublishLocationBody): JsonElement =
        post("/v1/profiles/$profileId/location", body)

    suspend fun getLocation(profileId: String): LocationView =
        get("/v1/profiles/$profileId/location")

    suspend fun setLocationConsent(profileId: String, body: LocationConsentBody): JsonElement =
        exchange(
            method = "PUT",
            path = "/v1/profiles/$profileId/location-consent",
            bodyJson = json.encodeToString(body),
        )

    private suspend inline fun <reified T> get(path: String): T =
        exchange(method = "GET", path = path, bodyJson = null)

    private suspend inline fun <reified Req, reified Res> post(
        path: String,
        body: Req,
        requireInstallation: Boolean = true,
    ): Res = exchange(
        method = "POST",
        path = path,
        bodyJson = json.encodeToString(body),
        requireInstallation = requireInstallation,
    )

    private suspend inline fun <reified Req, reified Res> postUnauth(
        path: String,
        body: Req,
    ): Res = exchange(
        method = "POST",
        path = path,
        bodyJson = json.encodeToString(body),
        authenticated = false,
        requireInstallation = false,
    )

    private suspend fun postEmpty(path: String) {
        exchange<Unit>(
            method = "POST",
            path = path,
            bodyJson = "{}",
        )
    }

    private suspend inline fun <reified Res> postEmptyTyped(path: String): Res =
        exchange(method = "POST", path = path, bodyJson = "{}")

    private suspend inline fun <reified T> exchange(
        method: String,
        path: String,
        bodyJson: String?,
        authenticated: Boolean = true,
        requireInstallation: Boolean = true,
    ): T = withContext(Dispatchers.IO) {
        val builder = Request.Builder().url("$baseUrl$path")
        if (authenticated) {
            val token = tokenProvider() ?: throw ApiException("UNAUTHENTICATED", 401)
            builder.header("Authorization", "Bearer $token")
            if (requireInstallation) {
                installationIdProvider()?.takeIf { it.isNotBlank() }?.let {
                    builder.header("X-Installation-Id", it)
                }
            }
        }
        if (bodyJson != null) {
            builder.method(method, bodyJson.toRequestBody(media))
            builder.header("Idempotency-Key", UUID.randomUUID().toString())
        } else {
            builder.method(method, null)
        }
        client.newCall(builder.build()).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val code = runCatching {
                    json.decodeFromString<ErrorEnvelope>(text).error?.code
                }.getOrNull() ?: "HTTP_${response.code}"
                if (response.code == 401 &&
                    (code == "UNAUTHENTICATED" || code == "SESSION_REVOKED")
                ) {
                    onSessionInvalid()
                }
                throw ApiException(code, response.code, text.ifBlank { code })
            }
            if (T::class == Unit::class) {
                @Suppress("UNCHECKED_CAST")
                return@use Unit as T
            }
            if (text.isBlank()) throw ApiException("EMPTY_BODY", response.code)
            json.decodeFromString(text)
        }
    }
}
