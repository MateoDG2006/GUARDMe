#include "store.h"
#include "config.h"
#include <Preferences.h>
#include <string.h>
#include <esp_system.h>
#include <esp_mac.h>

static Preferences prefs;

uint8_t RecordStore::begin() {
  ok_ = prefs.begin(NVS_NS, false) ? 1 : 0;
  head_ = 0;
  seq_ = 0;
  full_ = 0;
  memset(used_, 0, sizeof(used_));
  memset(cmds_, 0, sizeof(cmds_));
  for (int i = 0; i < ANILLO; i++) {
    char key[4] = {'r', (char)('0' + i), 0, 0};
    size_t n = prefs.getBytesLength(key);
    if (n == 64) {
      prefs.getBytes(key, ring_[i].bytes, 64);
      uint32_t crc = crc32Iso(ring_[i].bytes, 56);
      if (crc == readU32(ring_[i].bytes + 56)) {
        used_[i] = 1;
        uint16_t s = readU16(ring_[i].bytes + 8);
        if (s > seq_) seq_ = s;
      }
    }
  }
  return ok_;
}

void RecordStore::loadOrCreateSerial(char out[20]) {
  String s = prefs.getString("serial", "");
  if (s.length() >= 3) {
    strncpy(out, s.c_str(), 19);
    out[19] = 0;
    return;
  }
  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  snprintf(out, 20, "GM-%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2],
           mac[3], mac[4], mac[5]);
  prefs.putString("serial", out);
}

void RecordStore::loadOrCreateBoot(uint8_t boot_id[8], uint8_t generar_nuevo) {
  if (!generar_nuevo && prefs.getBytesLength("boot") == 8) {
    prefs.getBytes("boot", boot_id_, 8);
  } else {
    for (int i = 0; i < 8; i++) boot_id_[i] = (uint8_t)esp_random();
    prefs.putBytes("boot", boot_id_, 8);
  }
  memcpy(boot_id, boot_id_, 8);
}

uint16_t RecordStore::nextSequence() {
  if (seq_ == 0xffff) return 0;
  seq_++;
  return seq_;
}

uint8_t RecordStore::append(const Registro& rec) {
  int free_slot = -1;
  for (int i = 0; i < ANILLO; i++) {
    int idx = (head_ + i) % ANILLO;
    if (!used_[idx] || (ring_[idx].bytes[6] & 0x01)) {
      free_slot = idx;
      break;
    }
  }
  if (free_slot < 0) {
    full_ = 1;
    return 0;
  }
  ring_[free_slot] = rec;
  used_[free_slot] = 1;
  char key[4] = {'r', (char)('0' + free_slot), 0, 0};
  prefs.putBytes(key, rec.bytes, 64);
  head_ = (free_slot + 1) % ANILLO;
  full_ = 0;
  return 1;
}

uint8_t RecordStore::markAcked(const uint8_t boot[8], uint16_t from_seq,
                              uint16_t to_seq) {
  for (uint16_t s = from_seq; s <= to_seq; s++) {
    uint8_t found = 0;
    for (int i = 0; i < ANILLO; i++) {
      if (!used_[i]) continue;
      if (memcmp(ring_[i].bytes + 12, boot, 8) != 0) continue;
      if (readU16(ring_[i].bytes + 8) != s) continue;
      found = 1;
      break;
    }
    if (!found) return 0;
  }
  for (uint16_t s = from_seq; s <= to_seq; s++) {
    for (int i = 0; i < ANILLO; i++) {
      if (!used_[i]) continue;
      if (memcmp(ring_[i].bytes + 12, boot, 8) != 0) continue;
      if (readU16(ring_[i].bytes + 8) != s) continue;
      ring_[i].bytes[6] |= 0x01;
      char key[4] = {'r', (char)('0' + i), 0, 0};
      prefs.putBytes(key, ring_[i].bytes, 64);
    }
  }
  return 1;
}

int RecordStore::replay(const uint8_t* cursor_boot, uint16_t cursor_seq,
                        Registro* out, int max_out) {
  int n = 0;
  uint8_t started = (cursor_boot == nullptr ||
                     (cursor_boot[0] | cursor_boot[1] | cursor_boot[2] |
                      cursor_boot[3] | cursor_boot[4] | cursor_boot[5] |
                      cursor_boot[6] | cursor_boot[7]) == 0) &&
                    cursor_seq == 0;
  if (!started) {
    uint8_t found_cursor = 0;
    for (int i = 0; i < ANILLO; i++) {
      if (!used_[i]) continue;
      if (memcmp(ring_[i].bytes + 12, cursor_boot, 8) == 0 &&
          readU16(ring_[i].bytes + 8) == cursor_seq) {
        found_cursor = 1;
        break;
      }
    }
    if (!found_cursor) return -1;
  }
  for (int k = 0; k < ANILLO && n < max_out; k++) {
    int i = (head_ + k) % ANILLO;
    if (!used_[i]) continue;
    if (!started) {
      if (memcmp(ring_[i].bytes + 12, cursor_boot, 8) == 0 &&
          readU16(ring_[i].bytes + 8) == cursor_seq) {
        started = 1;
      }
      continue;
    }
    out[n++] = ring_[i];
  }
  return n;
}

uint8_t RecordStore::saveEpisode(Fase fase, uint32_t t0_ms,
                                 const uint8_t source_boot[8],
                                 uint16_t source_seq) {
  uint8_t buf[24];
  memset(buf, 0, sizeof(buf));
  buf[0] = (uint8_t)fase;
  writeU32(buf + 1, t0_ms);
  memcpy(buf + 5, source_boot, 8);
  writeU16(buf + 13, source_seq);
  writeU32(buf + 15, crc32Iso(buf, 15));
  return prefs.putBytes("live", buf, 24) ? 1 : 0;
}

uint8_t RecordStore::loadEpisode(Fase& fase, uint32_t& t0_ms,
                                 uint8_t source_boot[8], uint16_t& source_seq,
                                 uint8_t& found) {
  found = 0;
  if (prefs.getBytesLength("live") != 24) return 0;
  uint8_t buf[24];
  prefs.getBytes("live", buf, 24);
  if (crc32Iso(buf, 15) != readU32(buf + 15)) return 0;
  fase = (Fase)buf[0];
  t0_ms = readU32(buf + 1);
  memcpy(source_boot, buf + 5, 8);
  source_seq = readU16(buf + 13);
  found = 1;
  return 1;
}

uint8_t RecordStore::saveCommand(const uint8_t command_id[16],
                                 const uint8_t orden[32],
                                 const ResultadoOrden& result) {
  int slot = -1;
  for (int i = 0; i < ORDENES; i++) {
    if (cmds_[i].used && memcmp(cmds_[i].id, command_id, 16) == 0) {
      slot = i;
      break;
    }
  }
  if (slot < 0) {
    slot = cmd_head_;
    cmd_head_ = (cmd_head_ + 1) % ORDENES;
  }
  memcpy(cmds_[slot].id, command_id, 16);
  memcpy(cmds_[slot].orden, orden, 32);
  cmds_[slot].result = result;
  cmds_[slot].used = 1;
  return 1;
}

uint8_t RecordStore::findCommand(const uint8_t command_id[16],
                                 const uint8_t orden[32], ResultadoOrden& result,
                                 uint8_t& hash_distinto) {
  hash_distinto = 0;
  for (int i = 0; i < ORDENES; i++) {
    if (!cmds_[i].used) continue;
    if (memcmp(cmds_[i].id, command_id, 16) != 0) continue;
    if (memcmp(cmds_[i].orden, orden, 32) != 0) hash_distinto = 1;
    result = cmds_[i].result;
    return 1;
  }
  return 0;
}

uint16_t RecordStore::unacked() const {
  uint16_t n = 0;
  for (int i = 0; i < ANILLO; i++) {
    if (used_[i] && !(ring_[i].bytes[6] & 0x01)) n++;
  }
  return n;
}

uint16_t RecordStore::uncertainUnacked() const {
  uint16_t n = 0;
  for (int i = 0; i < ANILLO; i++) {
    if (used_[i] && !(ring_[i].bytes[6] & 0x01) && (ring_[i].bytes[6] & 0x02))
      n++;
  }
  return n;
}

uint8_t RecordStore::full() const { return full_; }
uint8_t RecordStore::ok() const { return ok_; }
