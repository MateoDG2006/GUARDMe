package com.example.guardmemobile.data.api

import android.content.Context
import androidx.annotation.StringRes
import com.example.guardmemobile.R
import java.io.IOException

/** Traduce cualquier fallo a un texto para la persona; nunca muestra códigos del backend. */
@StringRes
fun errorRes(error: Throwable): Int = when (error) {
    is ApiException -> when (error.code) {
        "INVALID_EMAIL_OR_PASSWORD", "INVALID_PASSWORD", "USER_NOT_FOUND", "INVALID_EMAIL" ->
            R.string.err_bad_credentials
        "UNAUTHENTICATED", "SESSION_REVOKED", "INSTALLATION_MISMATCH" -> R.string.err_session
        "NO_PROFILE_ACCESS", "ACCOUNT_NOT_BOOTSTRAPPED" -> R.string.err_no_profile
        "NOT_FOUND" -> R.string.err_not_found
        "FORBIDDEN_ACTION" -> R.string.err_forbidden
        "VALIDATION_FAILED" -> R.string.err_validation
        "VERSION_CONFLICT" -> R.string.err_conflict
        "INCOMPATIBLE_STATE" -> R.string.err_state
        "RATE_LIMITED" -> R.string.err_rate
        "CAPABILITY_NOT_ENABLED" -> R.string.err_capability
        else -> when {
            error.httpStatus == 401 -> R.string.err_session
            error.httpStatus == 429 -> R.string.err_rate
            error.httpStatus >= 500 -> R.string.err_server
            else -> R.string.err_generic
        }
    }
    is IOException -> R.string.err_network
    else -> R.string.err_generic
}

fun Throwable.userMessage(context: Context): String = context.getString(errorRes(this))
