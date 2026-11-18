#include "protocol.h"

uint32_t crc32Iso(const uint8_t* data, uint16_t len) {
  uint32_t crc = 0xFFFFFFFFu;
  for (uint16_t i = 0; i < len; i++) {
    crc ^= data[i];
    for (int b = 0; b < 8; b++) {
      uint32_t mask = -(crc & 1u);
      crc = (crc >> 1) ^ (0xEDB88320u & mask);
    }
  }
  return crc ^ 0xFFFFFFFFu;
}
