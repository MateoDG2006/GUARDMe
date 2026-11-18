package com.example.guardmemobile.platform

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log

object Dialer {
    private const val TAG = "GuardMeDialer"

    /** Abre el marcador del sistema con el número (no requiere CALL_PHONE). */
    fun open(context: Context, rawNumber: String): Boolean {
        val number = rawNumber.trim()
        if (number.isEmpty() || number.equals("sin datos", ignoreCase = true)) {
            return false
        }
        val uri = Uri.parse("tel:${Uri.encode(number)}")
        val intents = listOf(
            Intent(Intent.ACTION_DIAL, uri),
            Intent(Intent.ACTION_VIEW, uri),
        )
        for (base in intents) {
            val intent = Intent(base).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                context.startActivity(intent)
                return true
            } catch (error: Exception) {
                Log.w(TAG, "Dial attempt failed for $number via ${base.action}", error)
            }
        }
        return false
    }
}
