package com.example.guardmemobile.platform

import android.content.Context
import android.location.Geocoder
import java.util.Locale
import kotlin.math.roundToInt

object PlaceNames {
    private var cachedKey: String? = null
    private var cachedLabel: String? = null

    /** Dirección legible; nunca devuelve coordenadas crudas. */
    fun fromLatLng(context: Context, lat: Double, lng: Double): String {
        val key = "${(lat * 1e4).roundToInt()}:${(lng * 1e4).roundToInt()}"
        cachedLabel?.takeIf { cachedKey == key }?.let { return it }

        val label = reverse(context, lat, lng)
        cachedKey = key
        cachedLabel = label
        return label
    }

    @Suppress("DEPRECATION")
    private fun reverse(context: Context, lat: Double, lng: Double): String {
        if (!Geocoder.isPresent()) return "Ubicación conocida"
        return runCatching {
            val geocoder = Geocoder(context, Locale("es", "PA"))
            val address = geocoder.getFromLocation(lat, lng, 1)?.firstOrNull()
                ?: return "Ubicación conocida"
            val street = listOfNotNull(address.thoroughfare, address.subThoroughfare)
                .joinToString(" ")
                .ifBlank { null }
            val area = address.subLocality ?: address.locality
            listOfNotNull(street, area, address.adminArea)
                .distinct()
                .joinToString(", ")
                .ifBlank { address.getAddressLine(0)?.takeIf { it.isNotBlank() } }
                ?: "Ubicación conocida"
        }.getOrDefault("Ubicación conocida")
    }
}
