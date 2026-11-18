#pragma once
#include <stdint.h>

enum class Fase : uint8_t { Idle = 0, Pending = 1, Canceled = 2, Expired = 3 };

enum class Tipo : uint8_t {
  None = 0,
  FallCandidate = 0x01,
  FallCanceled = 0x02,
  FallExpired = 0x03,
  Telemetry = 0x05,
  DeviceFault = 0x06,
  AlarmSilenced = 0x07,
  CmdGetState = 0x10,
  CmdCancelFall = 0x11,
  CmdRequestReplay = 0x12,
  CmdAckRecords = 0x13,
  CmdSignalReminder = 0x14,
  CmdResult = 0x20
};

enum class FaseOrden : uint8_t { Received = 1, Applied = 2, Rejected = 3 };

enum class Codigo : uint8_t {
  Ok = 0,
  AlreadyApplied = 1,
  Expired = 2,
  UnknownEpisode = 3,
  NotBonded = 4,
  BadIdReuse = 5,
  Unsupported = 6,
  ExpiredTtl = 7,
  Gap = 8,
  NoSpace = 9,
  BadFrame = 10,
  Incompatible = 11,
  Preempted = 12
};

struct Registro {
  uint8_t bytes[64];
};

struct ResultadoOrden {
  uint8_t bytes[32];
};

inline void writeU16(uint8_t* p, uint16_t v) {
  p[0] = (uint8_t)(v & 0xff);
  p[1] = (uint8_t)((v >> 8) & 0xff);
}

inline void writeU32(uint8_t* p, uint32_t v) {
  p[0] = (uint8_t)(v & 0xff);
  p[1] = (uint8_t)((v >> 8) & 0xff);
  p[2] = (uint8_t)((v >> 16) & 0xff);
  p[3] = (uint8_t)((v >> 24) & 0xff);
}

inline uint16_t readU16(const uint8_t* p) {
  return (uint16_t)p[0] | ((uint16_t)p[1] << 8);
}

inline uint32_t readU32(const uint8_t* p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) |
         ((uint32_t)p[3] << 24);
}

uint32_t crc32Iso(const uint8_t* data, uint16_t len);
