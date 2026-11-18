package com.example.guardmemobile.onboarding

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.guardmemobile.R
import com.example.guardmemobile.ble.BleDevice
import com.example.guardmemobile.data.api.ApiException
import com.example.guardmemobile.data.api.ClaimCaneBody
import com.example.guardmemobile.data.api.userMessage
import com.example.guardmemobile.guardMe
import com.example.guardmemobile.ui.components.GuardOutlineButton
import com.example.guardmemobile.ui.components.GuardPrimaryButton
import com.example.guardmemobile.ui.theme.Body
import com.example.guardmemobile.ui.theme.GuardColor
import com.example.guardmemobile.ui.theme.Meta
import com.example.guardmemobile.ui.theme.ScreenTitle
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

@Composable
fun CaneSetupScreen(
    profileId: String,
    onDone: (connected: Boolean) -> Unit,
    onCancel: () -> Unit,
) {
    val context = LocalContext.current
    val container = context.guardMe
    val scope = rememberCoroutineScope()
    var serial by remember { mutableStateOf("GM-DEMO-001") }
    var claimCode by remember { mutableStateOf("GMDEM-00001") }
    var devices by remember { mutableStateOf<List<BleDevice>>(emptyList()) }
    var selected by remember { mutableStateOf<BleDevice?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var scanning by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    val permissions = remember {
        buildList {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                add(Manifest.permission.BLUETOOTH_SCAN)
                add(Manifest.permission.BLUETOOTH_CONNECT)
            } else {
                add(Manifest.permission.ACCESS_FINE_LOCATION)
                add(Manifest.permission.BLUETOOTH)
                add(Manifest.permission.BLUETOOTH_ADMIN)
            }
        }.toTypedArray()
    }

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        if (result.values.any { !it }) {
            message = context.getString(R.string.ble_permission_denied)
        } else {
            scanning = true
        }
    }

    LaunchedEffect(scanning) {
        if (!scanning) return@LaunchedEffect
        if (!container.ble.isAdapterOn()) {
            message = context.getString(R.string.ble_adapter_off)
            scanning = false
            return@LaunchedEffect
        }
        var failed = false
        // Sin resultados en 15 s: avisar en lugar de quedarse "Buscando…" para siempre.
        withTimeoutOrNull(15_000) {
            container.ble.scanGuardMeDevices()
                .catch { failed = true }
                .collect { devices = it }
        }
        if (failed) message = context.getString(R.string.err_ble_scan_failed)
        else if (devices.isEmpty()) message = context.getString(R.string.ble_not_found)
        scanning = false
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(GuardColor.Cream)
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(stringResource(R.string.cane_setup_title), color = GuardColor.Navy, style = ScreenTitle)
        Text(stringResource(R.string.cane_setup_body), color = GuardColor.WarmGray, style = Body)
        GuardPrimaryButton(
            text = stringResource(R.string.cane_scan),
            subtitle = stringResource(R.string.cane_scan_hint),
            onClick = {
                message = null
                launcher.launch(permissions)
            },
            enabled = !busy,
        )
        devices.forEach { device ->
            Text(
                text = "${device.name} · ${device.address}",
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { selected = device }
                    .padding(vertical = 8.dp),
                color = if (selected?.id == device.id) GuardColor.Navy else GuardColor.WarmGray,
                style = Body,
            )
        }
        if (scanning && devices.isEmpty()) {
            Text(stringResource(R.string.ble_scanning), color = GuardColor.WarmGray, style = Meta)
        }
        OutlinedTextField(
            value = serial,
            onValueChange = { serial = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.cane_serial)) },
            singleLine = true,
        )
        OutlinedTextField(
            value = claimCode,
            onValueChange = { claimCode = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.cane_claim_code)) },
            singleLine = true,
        )
        if (message != null) {
            Text(message!!, color = GuardColor.DangerText, style = Meta)
        }
        GuardPrimaryButton(
            text = stringResource(R.string.cane_claim_action),
            subtitle = stringResource(R.string.cane_claim_hint),
            onClick = {
                val device = selected
                if (device == null) {
                    message = context.getString(R.string.err_cane_select)
                    return@GuardPrimaryButton
                }
                scope.launch {
                    busy = true
                    message = null
                    try {
                        if (!container.ble.isAdapterOn()) {
                            message = context.getString(R.string.ble_adapter_off)
                            return@launch
                        }
                        if (!container.ble.connectAndDiscover(device.address)) {
                            message = context.getString(R.string.ble_connect_failed)
                            return@launch
                        }
                        val cane = container.api.claimCane(
                            ClaimCaneBody(
                                serial = serial.trim(),
                                claimCode = claimCode.trim(),
                                profileId = profileId,
                            ),
                        )
                        container.api.setGateway(cane.id)
                        // Guardar el bastón local solo cuando el backend confirmó el vínculo.
                        container.auth.saveCaneDeviceId(device.address)
                        container.auth.saveCaneBackendId(cane.id)
                        container.gatt.connect(device.address)
                        onDone(true)
                    } catch (error: ApiException) {
                        message = when (error.code) {
                            "NOT_FOUND" -> context.getString(R.string.err_cane_claim_not_found)
                            "INCOMPATIBLE_STATE" -> context.getString(R.string.err_cane_assigned)
                            else -> error.userMessage(context)
                        }
                    } catch (error: SecurityException) {
                        message = context.getString(R.string.ble_permission_denied)
                    } catch (error: Exception) {
                        if (error is kotlinx.coroutines.CancellationException) throw error
                        message = error.userMessage(context)
                    } finally {
                        busy = false
                        scanning = false
                    }
                }
            },
            enabled = !busy && serial.isNotBlank() && claimCode.isNotBlank(),
        )
        GuardOutlineButton(
            text = stringResource(R.string.cancel),
            onClick = onCancel,
        )
    }
}
