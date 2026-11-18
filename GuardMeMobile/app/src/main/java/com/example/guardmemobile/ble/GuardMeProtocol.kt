package com.example.guardmemobile.ble

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID

object GuardMeUuids {
    val SERVICE: UUID = UUID.fromString("4f6a8c10-2b7e-4d91-a3c5-91e0b74d6f20")
    val IDENTITY: UUID = UUID.fromString("4f6a8c11-2b7e-4d91-a3c5-91e0b74d6f20")
    val STATE: UUID = UUID.fromString("4f6a8c12-2b7e-4d91-a3c5-91e0b74d6f20")
    val EVENTS: UUID = UUID.fromString("4f6a8c13-2b7e-4d91-a3c5-91e0b74d6f20")
    val COMMANDS: UUID = UUID.fromString("4f6a8c14-2b7e-4d91-a3c5-91e0b74d6f20")
    val CMD_RESULTS: UUID = UUID.fromString("4f6a8c15-2b7e-4d91-a3c5-91e0b74d6f20")
    val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
}

enum class BleFase(val code: Int) {
    Idle(0), Pending(1), Canceled(2), Expired(3);

    companion object {
        fun from(code: Int) = entries.firstOrNull { it.code == code } ?: Idle
    }
}

enum class BleTipo(val code: Int) {
    FallCandidate(0x01),
    FallCanceled(0x02),
    FallExpired(0x03),
    Telemetry(0x05),
    DeviceFault(0x06),
    AlarmSilenced(0x07),
    CmdGetState(0x10),
    CmdCancelFall(0x11),
    CmdRequestReplay(0x12),
    CmdAckRecords(0x13),
    CmdSignalReminder(0x14),
    CmdResult(0x20);

    companion object {
        fun from(code: Int) = entries.firstOrNull { it.code == code }
    }
}

data class FallCandidateEvent(
    val sequence: Int,
    val bootId: ByteArray,
    val sourceBootId: ByteArray,
    val windowMs: Int,
    val intensity: Float,
)

data class CaneStateSnapshot(
    val fase: BleFase,
    val elapsedMs: Int,
    val windowMs: Int,
    val sourceSequence: Int,
    val sourceBootId: ByteArray,
    val link: Int,
    val sensor: Int,
)

object GuardMeCodec {
    fun unwrapFragment(frame: ByteArray): ByteArray? {
        if (frame.size < 8 || frame[0] != 0xA5.toByte() || frame[1] != 0x02.toByte()) {
            // Raw event/result without wrapper (identity/state reads)
            return frame
        }
        return frame.copyOfRange(8, frame.size)
    }

    fun wrapCommand(tipo: BleTipo, commandId: ByteArray, args: ByteArray = ByteArray(12)): ByteArray {
        require(commandId.size == 16)
        require(args.size == 12)
        val body = ByteArray(32)
        body[0] = tipo.code.toByte()
        System.arraycopy(commandId, 0, body, 4, 16)
        System.arraycopy(args, 0, body, 20, 12)
        val frame = ByteArray(8 + 32)
        frame[0] = 0xA5.toByte()
        frame[1] = 0x02.toByte()
        frame[2] = tipo.code.toByte()
        frame[3] = 0
        frame[4] = 1
        frame[5] = 0
        frame[6] = 0
        frame[7] = 1
        System.arraycopy(body, 0, frame, 8, 32)
        return frame
    }

    fun parseState(raw: ByteArray): CaneStateSnapshot? {
        if (raw.size < 52) return null
        if (raw[0] != 0x47.toByte() || raw[1] != 0x4D.toByte()) return null
        val le = ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN)
        val fase = BleFase.from(raw[5].toInt() and 0xff)
        val link = raw[7].toInt() and 0xff
        val sensor = raw[8].toInt() and 0xff
        val sourceSeq = le.getShort(22).toInt() and 0xffff
        val sourceBoot = raw.copyOfRange(24, 32)
        val elapsed = le.getInt(32)
        val window = le.getShort(40).toInt() and 0xffff
        return CaneStateSnapshot(fase, elapsed, window, sourceSeq, sourceBoot, link, sensor)
    }

    fun parseRegistro(raw: ByteArray): Pair<BleTipo, FallCandidateEvent?>? {
        val msg = unwrapFragment(raw) ?: return null
        if (msg.size < 64) return null
        if (msg[0] != 0x47.toByte() || msg[1] != 0x4D.toByte() || msg[2] != 0x52.toByte()) return null
        val tipo = BleTipo.from(msg[5].toInt() and 0xff) ?: return null
        val le = ByteBuffer.wrap(msg).order(ByteOrder.LITTLE_ENDIAN)
        val seq = le.getShort(8).toInt() and 0xffff
        val boot = msg.copyOfRange(12, 20)
        val sourceBoot = msg.copyOfRange(20, 28)
        return when (tipo) {
            BleTipo.FallCandidate -> {
                val window = le.getShort(32).toInt() and 0xffff
                val intensity = le.getFloat(34)
                tipo to FallCandidateEvent(seq, boot, sourceBoot, window, intensity)
            }
            else -> tipo to null
        }
    }

    fun bootHex(boot: ByteArray): String =
        boot.joinToString("") { "%02x".format(it) }

    fun cancelArgs(sourceBoot: ByteArray, sourceSeq: Int): ByteArray {
        val args = ByteArray(12)
        System.arraycopy(sourceBoot, 0, args, 0, 8)
        args[8] = (sourceSeq and 0xff).toByte()
        args[9] = ((sourceSeq shr 8) and 0xff).toByte()
        return args
    }

    fun ackArgs(boot: ByteArray, from: Int, to: Int): ByteArray {
        val args = ByteArray(12)
        System.arraycopy(boot, 0, args, 0, 8)
        args[8] = (from and 0xff).toByte()
        args[9] = ((from shr 8) and 0xff).toByte()
        args[10] = (to and 0xff).toByte()
        args[11] = ((to shr 8) and 0xff).toByte()
        return args
    }

    fun reminderArgs(occurrenceId: ByteArray, durationMs: Int, pattern: Int): ByteArray {
        val args = ByteArray(12)
        System.arraycopy(occurrenceId.copyOf(8), 0, args, 0, 8)
        args[8] = (durationMs and 0xff).toByte()
        args[9] = ((durationMs shr 8) and 0xff).toByte()
        args[10] = (pattern and 0xff).toByte()
        return args
    }
}
