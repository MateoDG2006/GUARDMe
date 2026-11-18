package com.example.guardmemobile.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.os.Build
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID
import java.util.concurrent.ConcurrentLinkedQueue

sealed interface CaneBleEvent {
    data class FallCandidate(val event: FallCandidateEvent) : CaneBleEvent
    data class FallCanceled(val sequence: Int) : CaneBleEvent
    data class FallExpired(
        val sequence: Int,
        val bootId: ByteArray,
        val sourceBoot: ByteArray,
    ) : CaneBleEvent
    data class CmdApplied(val tipo: BleTipo) : CaneBleEvent
    data class CmdRejected(val tipo: BleTipo) : CaneBleEvent
    data class StateUpdated(val state: CaneStateSnapshot) : CaneBleEvent
    data object Disconnected : CaneBleEvent
    data object Connected : CaneBleEvent
}

class GuardMeGatt(private val context: Context) {
    private val adapter =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

    private var gatt: BluetoothGatt? = null
    private var commands: BluetoothGattCharacteristic? = null
    private var events: BluetoothGattCharacteristic? = null
    private var results: BluetoothGattCharacteristic? = null
    private var stateChar: BluetoothGattCharacteristic? = null

    private val _link = MutableStateFlow(false)
    val link: StateFlow<Boolean> = _link.asStateFlow()

    private val _events = MutableSharedFlow<CaneBleEvent>(
        extraBufferCapacity = 32,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val eventsFlow: SharedFlow<CaneBleEvent> = _events.asSharedFlow()

    @Volatile
    var lastState: CaneStateSnapshot? = null
        private set

    @Volatile
    var lastCandidate: FallCandidateEvent? = null
        private set

    private val writeQueue = ConcurrentLinkedQueue<ByteArray>()
    private val descriptorQueue = ConcurrentLinkedQueue<BluetoothGattDescriptor>()
    private var writing = false
    private var writingDescriptor = false

    @SuppressLint("MissingPermission")
    fun connect(address: String) {
        disconnect()
        val device = adapter?.getRemoteDevice(address) ?: return
        runCatching { device.createBond() }
        gatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
        } else {
            @Suppress("DEPRECATION")
            device.connectGatt(context, false, callback)
        }
    }

    @SuppressLint("MissingPermission")
    fun disconnect() {
        gatt?.disconnect()
        gatt?.close()
        gatt = null
        commands = null
        events = null
        results = null
        stateChar = null
        writeQueue.clear()
        descriptorQueue.clear()
        writing = false
        writingDescriptor = false
        _link.value = false
    }

    @SuppressLint("MissingPermission")
    fun cancelFall() {
        val boot = lastCandidate?.sourceBootId ?: lastState?.sourceBootId ?: return
        val seq = lastCandidate?.sequence ?: lastState?.sourceSequence ?: return
        enqueueWrite(
            GuardMeCodec.wrapCommand(
                BleTipo.CmdCancelFall,
                randomCommandId(),
                GuardMeCodec.cancelArgs(boot, seq),
            ),
        )
    }

    @SuppressLint("MissingPermission")
    fun ackRecords(boot: ByteArray, from: Int, to: Int) {
        enqueueWrite(
            GuardMeCodec.wrapCommand(
                BleTipo.CmdAckRecords,
                randomCommandId(),
                GuardMeCodec.ackArgs(boot, from, to),
            ),
        )
    }

    @SuppressLint("MissingPermission")
    fun signalReminder(durationMs: Int = 2000) {
        enqueueWrite(
            GuardMeCodec.wrapCommand(
                BleTipo.CmdSignalReminder,
                randomCommandId(),
                GuardMeCodec.reminderArgs(ByteArray(8), durationMs, 1),
            ),
        )
    }

    @SuppressLint("MissingPermission")
    fun refreshState() {
        stateChar?.let { gatt?.readCharacteristic(it) }
    }

    private fun randomCommandId(): ByteArray =
        ByteArray(16) { (Math.random() * 256).toInt().toByte() }

    @SuppressLint("MissingPermission")
    private fun enqueueWrite(frame: ByteArray) {
        writeQueue.offer(frame)
        pumpWrite()
    }

    @SuppressLint("MissingPermission")
    private fun pumpWrite() {
        if (writing) return
        val ch = commands ?: return
        val g = gatt ?: return
        val next = writeQueue.poll() ?: return
        writing = true
        ch.value = next
        if (!g.writeCharacteristic(ch)) writing = false
    }

    @SuppressLint("MissingPermission")
    private fun enqueueDescriptor(descriptor: BluetoothGattDescriptor) {
        descriptorQueue.offer(descriptor)
        pumpDescriptor()
    }

    @SuppressLint("MissingPermission")
    private fun pumpDescriptor() {
        if (writingDescriptor) return
        val g = gatt ?: return
        val next = descriptorQueue.poll() ?: return
        writingDescriptor = true
        if (!g.writeDescriptor(next)) writingDescriptor = false
    }

    private val callback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                g.requestMtu(185)
                g.discoverServices()
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                _link.value = false
                _events.tryEmit(CaneBleEvent.Disconnected)
            }
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) return
            val svc = g.getService(GuardMeUuids.SERVICE) ?: return
            stateChar = svc.getCharacteristic(GuardMeUuids.STATE)
            events = svc.getCharacteristic(GuardMeUuids.EVENTS)
            results = svc.getCharacteristic(GuardMeUuids.CMD_RESULTS)
            commands = svc.getCharacteristic(GuardMeUuids.COMMANDS)
            events?.let { enableIndicate(g, it) }
            results?.let { enableIndicate(g, it) }
            stateChar?.let { g.readCharacteristic(it) }
            _link.value = true
            _events.tryEmit(CaneBleEvent.Connected)
        }

        @Deprecated("Deprecated in Java")
        override fun onCharacteristicChanged(
            g: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
        ) {
            handleNotify(characteristic.uuid, characteristic.value ?: return)
        }

        override fun onCharacteristicChanged(
            g: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
        ) {
            handleNotify(characteristic.uuid, value)
        }

        @Deprecated("Deprecated in Java")
        override fun onCharacteristicRead(
            g: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int,
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS &&
                characteristic.uuid == GuardMeUuids.STATE
            ) {
                characteristic.value?.let { parseStateBytes(it) }
            }
        }

        override fun onCharacteristicRead(
            g: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
            status: Int,
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS &&
                characteristic.uuid == GuardMeUuids.STATE
            ) {
                parseStateBytes(value)
            }
        }

        @SuppressLint("MissingPermission")
        override fun onCharacteristicWrite(
            g: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int,
        ) {
            writing = false
            pumpWrite()
        }

        @SuppressLint("MissingPermission")
        override fun onDescriptorWrite(
            g: BluetoothGatt,
            descriptor: BluetoothGattDescriptor,
            status: Int,
        ) {
            writingDescriptor = false
            pumpDescriptor()
        }

        @SuppressLint("MissingPermission")
        private fun enableIndicate(g: BluetoothGatt, ch: BluetoothGattCharacteristic) {
            g.setCharacteristicNotification(ch, true)
            val cccd = ch.getDescriptor(GuardMeUuids.CCCD) ?: return
            cccd.value = BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
            enqueueDescriptor(cccd)
        }
    }

    private fun handleNotify(uuid: UUID, value: ByteArray) {
        when (uuid) {
            GuardMeUuids.EVENTS -> handleEvent(value)
            GuardMeUuids.CMD_RESULTS -> handleResult(value)
            else -> Unit
        }
    }

    private fun parseStateBytes(value: ByteArray) {
        val snapshot = GuardMeCodec.parseState(value) ?: return
        lastState = snapshot
        _events.tryEmit(CaneBleEvent.StateUpdated(snapshot))
    }

    private fun handleEvent(value: ByteArray) {
        val parsed = GuardMeCodec.parseRegistro(value) ?: return
        val (tipo, candidate) = parsed
        when (tipo) {
            BleTipo.FallCandidate -> {
                if (candidate != null) {
                    lastCandidate = candidate
                    _events.tryEmit(CaneBleEvent.FallCandidate(candidate))
                    ackRecords(candidate.bootId, candidate.sequence, candidate.sequence)
                }
            }
            BleTipo.FallCanceled -> {
                val msg = GuardMeCodec.unwrapFragment(value) ?: value
                val seq = if (msg.size >= 10) {
                    (msg[8].toInt() and 0xff) or ((msg[9].toInt() and 0xff) shl 8)
                } else {
                    0
                }
                _events.tryEmit(CaneBleEvent.FallCanceled(seq))
            }
            BleTipo.FallExpired -> {
                val msg = GuardMeCodec.unwrapFragment(value) ?: value
                val seq = if (msg.size >= 10) {
                    (msg[8].toInt() and 0xff) or ((msg[9].toInt() and 0xff) shl 8)
                } else {
                    0
                }
                val boot = if (msg.size >= 20) msg.copyOfRange(12, 20) else ByteArray(8)
                val source = if (msg.size >= 28) msg.copyOfRange(20, 28) else boot
                _events.tryEmit(CaneBleEvent.FallExpired(seq, boot, source))
                ackRecords(boot, seq, seq)
            }
            else -> Unit
        }
    }

    private fun handleResult(value: ByteArray) {
        val msg = GuardMeCodec.unwrapFragment(value) ?: value
        if (msg.isEmpty()) return
        val faseOrden = if (msg.size > 1) msg[1].toInt() and 0xff else 0
        when (faseOrden) {
            2 -> _events.tryEmit(CaneBleEvent.CmdApplied(BleTipo.CmdCancelFall))
            3 -> _events.tryEmit(CaneBleEvent.CmdRejected(BleTipo.CmdCancelFall))
        }
    }
}
