package com.example.guardmemobile.session

import com.example.guardmemobile.data.api.AccessView
import com.example.guardmemobile.data.api.CapabilitiesView

enum class AppDestination { Login, Persona, Cuidador }

data class ActiveSession(
    val accountId: String,
    val displayName: String,
    val profileId: String,
    val profileName: String,
    val relation: String,
    val caregiverCategory: String?,
    val telephony: String,
    val access: AccessView,
    val capabilities: CapabilitiesView,
)
