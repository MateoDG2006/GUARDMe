package com.example.guardmemobile.data.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

class ApiException(
    val code: String,
    val httpStatus: Int,
    message: String = code,
) : Exception(message)

@Serializable
data class ErrorEnvelope(val error: ErrorBody? = null)

@Serializable
data class ErrorBody(val code: String? = null, val message: String? = null)

@Serializable
data class SignInBody(val email: String, val password: String)

@Serializable
data class AuthSessionResponse(
    val token: String? = null,
    val user: AuthUser? = null,
    val session: AuthSessionToken? = null,
)

@Serializable
data class AuthUser(val id: String? = null, val name: String? = null, val email: String? = null)

@Serializable
data class AuthSessionToken(val token: String? = null)

@Serializable
data class BootstrapBody(val onboardingKind: String, val displayName: String)

@Serializable
data class BootstrapResponse(val account: AccountView? = null, val created: Boolean? = null)

@Serializable
data class AccountView(
    val id: String,
    val displayName: String,
    val onboardingKind: String,
    val status: String,
    val version: Int,
)

@Serializable
data class InstallationBody(
    val clientInstallationId: String,
    val platform: String = "android",
    val appVersion: String = "1.0",
    val pushToken: String? = null,
)

@Serializable
data class GatewayEventsBatchBody(
    val events: List<GatewayEventBody>,
)

@Serializable
data class GatewayEventBody(
    val eventId: String,
    val type: String,
    val caneId: String,
    val occurredAt: String,
    val payload: GatewayEventPayload = GatewayEventPayload(),
)

@Serializable
data class GatewayEventPayload(
    val cancelledVia: String? = null,
    val capturedAt: String? = null,
    val batteryPct: Int? = null,
    val linkStatus: String? = null,
    val firmwareVersion: String? = null,
)

@Serializable
data class GatewayEventsResultView(
    val results: List<GatewayEventItemResult> = emptyList(),
)

@Serializable
data class GatewayEventItemResult(
    val eventId: String,
    val status: String,
    val code: String? = null,
)

@Serializable
data class ActivateIncidentBody(
    val origin: String,
    val sourceEventId: String,
    val caneId: String? = null,
    val profileId: String? = null,
    val reportedOccurredAt: String,
    val ageAtSendMs: Int? = null,
    val protocolVersion: String = "1",
    val bootId: String? = null,
    val sequence: Int? = null,
    val windowStartedAt: String? = null,
    val windowEndedAt: String? = null,
    val connectivity: ConnectivityBody? = null,
)

@Serializable
data class ConnectivityBody(
    val network: String = "unknown",
    val bleLinked: Boolean,
)

@Serializable
data class PublishLocationBody(
    val lat: Double,
    val lng: Double,
    val accuracyM: Double,
    val capturedAt: String,
)

@Serializable
data class LocationConsentBody(
    val enabled: Boolean,
    val readers: List<String> = emptyList(),
    val expectedVersion: Int? = null,
)

@Serializable
data class LocationView(
    val available: Boolean,
    val lat: Double? = null,
    val lng: Double? = null,
    val accuracyM: Double? = null,
    val capturedAt: String? = null,
    val receivedAt: String? = null,
    val ageSeconds: Int? = null,
    val reason: String? = null,
)

@Serializable
data class InstallationView(
    val id: String,
    val status: String,
    val appVersion: String,
    val hasPushToken: Boolean,
)

@Serializable
data class MeResponse(
    val account: AccountView,
    val installation: InstallationView? = null,
    val accesses: List<AccessView> = emptyList(),
    val capabilities: CapabilitiesView,
)

@Serializable
data class AccessView(
    val accessId: String,
    val profileId: String,
    val profileName: String,
    val relation: String,
    val caregiverCategory: String? = null,
)

@Serializable
data class CapabilitiesView(
    val telephony: String,
    val push: String,
    val emergencyAutoCall: String,
    val voiceInApp: String,
    val location: String,
    val pendingPolicies: List<String> = emptyList(),
)

@Serializable
data class ProfileView(
    val id: String,
    val displayName: String,
    val timeZone: String? = null,
)

@Serializable
data class ContactListView(
    val contactsVersion: Int,
    val items: List<ContactView> = emptyList(),
)

@Serializable
data class ContactView(
    val id: String,
    val displayName: String,
    val phoneE164: String,
    val priority: Int? = null,
    val linkedAccountId: String? = null,
    val version: Int,
)

@Serializable
data class CreateContactBody(
    val displayName: String,
    val phone: String,
    val priority: Int? = null,
    val expectedContactsVersion: Int,
)

@Serializable
data class ReminderView(
    val id: String,
    val profileId: String,
    val kind: String,
    val title: String,
    val notes: String? = null,
    val status: String,
    val version: Int,
    val schedules: List<ScheduleView> = emptyList(),
)

@Serializable
data class ScheduleView(
    val id: String? = null,
    val localTime: String,
    val daysOfWeek: List<Int> = emptyList(),
    val timeZone: String? = null,
    val validFrom: String? = null,
    val status: String? = null,
)

@Serializable
data class CreateReminderBody(
    val kind: String,
    val title: String,
    val notes: String? = null,
    val schedules: List<CreateScheduleBody>,
)

@Serializable
data class CreateScheduleBody(
    val localTime: String,
    val daysOfWeek: List<Int>,
    val timeZone: String = "America/Panama",
    val validFrom: String,
)

@Serializable
data class OccurrenceView(
    val id: String,
    val reminderId: String,
    val kind: String,
    val title: String,
    val scheduledFor: String,
    val status: String,
    val postponedUntil: String? = null,
    val respondedAt: String? = null,
    val respondedBy: String? = null,
    val version: Int,
)

@Serializable
data class OccurrenceResponseBody(val response: String, val expectedVersion: Int)

@Serializable
data class NotificationPage(
    val items: List<NotificationView> = emptyList(),
    val nextCursor: String? = null,
)

@Serializable
data class NotificationView(
    val id: String,
    val type: String,
    val profileId: String,
    val resourceType: String,
    val resourceId: String,
    val resourceVersion: Int,
    val status: String,
    val createdAt: String,
    val expiresAt: String,
    val myDelivery: JsonElement? = null,
)

@Serializable
data class MemberView(
    val accessId: String,
    val accountId: String,
    val displayName: String,
    val relation: String,
    val caregiverCategory: String? = null,
    val grantedAt: String,
)

@Serializable
data class IssueInviteBody(val recipientHint: String)

@Serializable
data class InviteIssuedView(
    val id: String? = null,
    val secret: String,
)

@Serializable
data class ClaimCaneBody(
    val serial: String,
    val claimCode: String,
    val profileId: String,
)

@Serializable
data class CaneView(
    val id: String,
    val serial: String? = null,
    val model: String? = null,
    val status: String? = null,
    val linkState: String? = null,
)

@Serializable
data class LogoutBody(val scope: String = "all")
