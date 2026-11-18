package com.example.guardmemobile.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

data class BleDevice(
    val id: String,
    val name: String,
    val address: String,
)

sealed interface BleScanError {
    data object AdapterOff : BleScanError
    data object PermissionDenied : BleScanError
    data object NotFound : BleScanError
}

class CaneBleScanner(private val context: Context) {
    private val adapter: BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

    fun isAdapterOn(): Boolean = adapter?.isEnabled == true

    @SuppressLint("MissingPermission")
    fun scanGuardMeDevices(): Flow<List<BleDevice>> = callbackFlow {
        val bluetooth = adapter
        if (bluetooth == null || !bluetooth.isEnabled) {
            close(IllegalStateException("ADAPTER_OFF"))
            return@callbackFlow
        }
        val scanner = bluetooth.bluetoothLeScanner
        if (scanner == null) {
            close(IllegalStateException("ADAPTER_OFF"))
            return@callbackFlow
        }
        val found = LinkedHashMap<String, BleDevice>()
        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val name = result.device.name
                    ?: result.scanRecord?.deviceName
                    ?: return
                if (!name.equals("GUARDMe", ignoreCase = true)) return
                val uuids = result.scanRecord?.serviceUuids.orEmpty()
                if (uuids.isNotEmpty() &&
                    uuids.none { it.uuid == GuardMeUuids.SERVICE }
                ) {
                    return
                }
                val device = BleDevice(
                    id = result.device.address,
                    name = name,
                    address = result.device.address,
                )
                found[device.id] = device
                trySend(found.values.toList())
            }

            override fun onScanFailed(errorCode: Int) {
                close(IllegalStateException("SCAN_FAILED_$errorCode"))
            }
        }
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()
        scanner.startScan(null, settings, callback)
        awaitClose {
            runCatching { scanner.stopScan(callback) }
        }
    }

    /** Alcance A: conectar y descubrir servicios; sin frames de producto. */
    @SuppressLint("MissingPermission")
    suspend fun connectAndDiscover(address: String): Boolean =
        suspendCancellableCoroutine { cont ->
            val device = adapter?.getRemoteDevice(address)
            if (device == null) {
                cont.resume(false)
                return@suspendCancellableCoroutine
            }
            var gatt: BluetoothGatt? = null
            val callback = object : BluetoothGattCallback() {
                override fun onConnectionStateChange(
                    g: BluetoothGatt,
                    status: Int,
                    newState: Int,
                ) {
                    if (newState == BluetoothProfile.STATE_CONNECTED) {
                        g.discoverServices()
                    } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                        if (cont.isActive) cont.resume(false)
                        g.close()
                    }
                }

                override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
                    val ok = status == BluetoothGatt.GATT_SUCCESS
                    if (cont.isActive) cont.resume(ok)
                    g.disconnect()
                    g.close()
                }
            }
            gatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
            } else {
                @Suppress("DEPRECATION")
                device.connectGatt(context, false, callback)
            }
            cont.invokeOnCancellation {
                gatt?.disconnect()
                gatt?.close()
            }
        }
}
