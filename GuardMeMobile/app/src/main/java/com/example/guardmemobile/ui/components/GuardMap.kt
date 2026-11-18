package com.example.guardmemobile.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.example.guardmemobile.BuildConfig
import com.example.guardmemobile.ui.theme.Body
import com.example.guardmemobile.ui.theme.GuardColor
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.rememberCameraPositionState

@Composable
fun GuardLocationMap(
    lat: Double?,
    lng: Double?,
    modifier: Modifier = Modifier,
    placeholder: String = "Sin ubicación disponible",
) {
    val keyOk = BuildConfig.MAPS_API_KEY.isNotBlank() &&
        BuildConfig.MAPS_API_KEY != "REPLACE_ME"
    Box(
        modifier
            .clip(RoundedCornerShape(18.dp))
            .background(GuardColor.MapBase),
        contentAlignment = Alignment.Center,
    ) {
        when {
            !keyOk -> Text(
                text = "Configura MAPS_API_KEY en local.properties",
                color = GuardColor.WarmGray,
                style = Body,
                modifier = Modifier.padding(16.dp),
            )
            lat == null || lng == null -> Text(
                text = placeholder,
                color = GuardColor.WarmGray,
                style = Body,
                modifier = Modifier.padding(16.dp),
            )
            else -> {
                val target = LatLng(lat, lng)
                val camera = rememberCameraPositionState {
                    position = CameraPosition.fromLatLngZoom(target, 15f)
                }
                val markerState = remember { MarkerState(position = target) }
                LaunchedEffect(lat, lng) {
                    markerState.position = target
                    camera.position = CameraPosition.fromLatLngZoom(target, 15f)
                }
                GoogleMap(
                    modifier = Modifier.fillMaxSize(),
                    cameraPositionState = camera,
                ) {
                    Marker(state = markerState)
                }
            }
        }
    }
}
