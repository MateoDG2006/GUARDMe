package com.example.guardmemobile.platform

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log

object MapsDirections {
    private const val TAG = "GuardMeMaps"

    /** Abre Google Maps con indicaciones hacia lat/lng (fallback al navegador). */
    fun open(context: Context, lat: Double, lng: Double, label: String? = null): Boolean {
        val query = if (!label.isNullOrBlank() && label != "Sin ubicación") {
            Uri.encode("$lat,$lng($label)")
        } else {
            "$lat,$lng"
        }
        val candidates = listOf(
            Intent(
                Intent.ACTION_VIEW,
                Uri.parse("google.navigation:q=$lat,$lng"),
            ).setPackage("com.google.android.apps.maps"),
            Intent(
                Intent.ACTION_VIEW,
                Uri.parse("geo:0,0?q=$query"),
            ).setPackage("com.google.android.apps.maps"),
            Intent(
                Intent.ACTION_VIEW,
                Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lng"),
            ),
        )
        for (base in candidates) {
            val intent = Intent(base).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                context.startActivity(intent)
                return true
            } catch (error: Exception) {
                Log.w(TAG, "Maps attempt failed via ${base.data}", error)
            }
        }
        return false
    }
}
