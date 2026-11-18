package com.example.guardmemobile.cuidador

import com.example.guardmemobile.persona.AvatarKind

enum class CareRole { Familiar, Medico }

enum class CareTab { Home, History, Reminders, Cane, Team }

enum class HistoryFilter { All, Falls, Meds, Activity }

enum class HistoryKind { Fall, Medication, Activity }

enum class NotifFilter { All, Urgent }

enum class ReminderType { Pill, Visit, Other }

sealed interface CareScreen {
    data class TabRoot(val tab: CareTab) : CareScreen
    data object Alert : CareScreen
    data object Live : CareScreen
    data object Notifications : CareScreen
    data object NewReminder : CareScreen
    data object Invite : CareScreen
    data object Profile : CareScreen
}

enum class AlertMode { Fall, Auto911 }

enum class CareCall { Emergency, Person }

enum class AttentionOutcome { Open, ReceivedAssistance }

sealed interface CareToast {
    data object Ringing : CareToast
    data object Sensors : CareToast
    data object Preferences : CareToast
    data object ReminderSaved : CareToast
    data object InviteSent : CareToast
    data object ProfileSaved : CareToast
    data class Error(val message: String) : CareToast
}

data class ProfileDraft(
    val fullName: String = "",
    val age: String = "",
    val height: String = "",
    val weight: String = "",
    val conditions: String = "",
    val allergies: String = "",
    val blood: String = "",
    val address: String = "",
    val phone: String = "",
    val doctor: String = "",
    val insurance: String = "",
    val version: Int = 1,
    val timeZone: String = "America/Panama",
    val showError: Boolean = false,
)

data class Notice(
    val id: String,
    val title: String,
    val body: String,
    val time: String,
    val day: String,
    val urgent: Boolean,
    val read: Boolean,
    val opensAuto911: Boolean = false,
)

data class HistoryEvent(
    val id: String,
    val day: String,
    val kind: HistoryKind,
    val title: String,
    val body: String,
    val time: String,
    val badge: String? = null,
    val details: List<String> = emptyList(),
)

data class CareReminder(
    val id: String,
    val time: String,
    val title: String,
    val detail: String,
    val confirmed: Boolean,
)

data class ActiveMed(
    val name: String,
    val detail: String,
)

data class CareVisit(
    val whenLabel: String,
    val title: String,
    val note: String,
)

data class Member(
    val id: String,
    val name: String,
    val detail: String,
    val role: CareRole,
    val pending: Boolean = false,
    val isYou: Boolean = false,
    val avatar: AvatarKind = AvatarKind.Warm,
)

data class CaneNotices(
    val lowBattery: Boolean = true,
    val offline: Boolean = true,
    val still: Boolean = true,
)

data class ReminderDraft(
    val type: ReminderType = ReminderType.Pill,
    val name: String = "",
    val detail: String = "",
    val timeInput: String = "",
    val times: List<String> = emptyList(),
    val days: Set<Int> = emptySet(),
    val notifyIfUnconfirmed: Boolean = true,
    val repeat: Boolean = true,
    val shareWithDoctor: Boolean = false,
    val showError: Boolean = false,
)

data class InviteDraft(
    val name: String = "",
    val contact: String = "",
    val role: CareRole = CareRole.Familiar,
    val showError: Boolean = false,
)

data class Profile(
    val fullName: String = "",
    val age: Int = 0,
    val height: String = "sin datos",
    val weight: String = "sin datos",
    val conditions: String = "sin datos",
    val allergies: String = "sin datos",
    val blood: String = "sin datos",
    val meds: String = "sin datos",
    val address: String = "sin datos",
    val phone: String = "sin datos",
    val doctor: String = "sin datos",
    val insurance: String = "sin datos",
    val version: Int = 1,
    val timeZone: String = "America/Panama",
)

data class CuidadorState(
    val role: CareRole,
    val firstName: String,
    val profile: Profile,
    val stack: List<CareScreen>,
    val alert: AlertMode?,
    val handlerName: String?,
    val steps: Int,
    val kilometersLabel: String,
    val pillsLabel: String,
    val adherence: Int,
    val takenWeek: Int,
    val missedWeek: Int,
    val batteryPercent: Int,
    val caneConnected: Boolean,
    val firmware: String,
    val lastSignal: String,
    val reviewedAt: String,
    val caneNotices: CaneNotices,
    val notices: List<Notice>,
    val notifFilter: NotifFilter,
    val history: List<HistoryEvent>,
    val historyFilter: HistoryFilter,
    val weekBars: List<Float>,
    val fallCount: Int,
    val falseAlarms: Int,
    val weekKm: String,
    val reminders: List<CareReminder>,
    val meds: List<ActiveMed>,
    val visits: List<CareVisit>,
    val draft: ReminderDraft,
    val members: List<Member>,
    val invite: InviteDraft,
    val profileDraft: ProfileDraft = ProfileDraft(),
    val call: CareCall?,
    val toast: CareToast?,
    val attention: AttentionOutcome = AttentionOutcome.Open,
    val locationLat: Double? = null,
    val locationLng: Double? = null,
    val locationLabel: String = "Sin ubicación",
    val locationAgeSeconds: Int? = null,
    val locationAccuracyM: Double? = null,
    val locationTimeLabel: String = "",
) {
    val screen: CareScreen get() = stack.last()
    val youName: String get() = members.firstOrNull { it.isYou }?.name ?: "Ana"
    val unread: Int get() = notices.count { !it.read && visibleToRole(it) }

    fun visibleToRole(notice: Notice): Boolean = notice.let { true }

    companion object {
        fun blank(role: CareRole, firstName: String): CuidadorState = CuidadorState(
            role = role,
            firstName = firstName,
            profile = Profile(fullName = firstName),
            stack = listOf(CareScreen.TabRoot(CareTab.Home)),
            alert = null,
            handlerName = null,
            steps = 0,
            kilometersLabel = "—",
            pillsLabel = "—",
            adherence = 0,
            takenWeek = 0,
            missedWeek = 0,
            batteryPercent = 0,
            caneConnected = false,
            firmware = "sin datos",
            lastSignal = "sin datos",
            reviewedAt = "—",
            caneNotices = CaneNotices(lowBattery = false, offline = true, still = false),
            notices = emptyList(),
            notifFilter = NotifFilter.All,
            history = emptyList(),
            historyFilter = HistoryFilter.All,
            weekBars = emptyList(),
            fallCount = 0,
            falseAlarms = 0,
            weekKm = "—",
            reminders = emptyList(),
            meds = emptyList(),
            visits = emptyList(),
            draft = ReminderDraft(),
            members = emptyList(),
            invite = InviteDraft(),
            call = null,
            toast = null,
        )

        /** Fixture mínimo para unit tests (sin datos demo de producto). */
        fun fixture(role: CareRole = CareRole.Familiar, alert: AlertMode? = null): CuidadorState {
            val stack = if (alert != null) {
                listOf(CareScreen.TabRoot(CareTab.Home), CareScreen.Alert)
            } else {
                listOf(CareScreen.TabRoot(CareTab.Home))
            }
            return blank(role, "Rosa").copy(
                stack = stack,
                alert = alert,
                members = listOf(
                    Member("self", "Ana", "familiar", CareRole.Familiar, isYou = true),
                ),
                history = emptyList(),
            )
        }
    }
}
