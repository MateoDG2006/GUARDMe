#pragma once
#include "protocol.h"
#include <stdint.h>

class RecordStore {
 public:
  uint8_t begin();
  void loadOrCreateSerial(char out[20]);
  void loadOrCreateBoot(uint8_t boot_id[8], uint8_t generar_nuevo);
  uint8_t append(const Registro& rec);
  uint8_t markAcked(const uint8_t boot[8], uint16_t from_seq, uint16_t to_seq);
  int replay(const uint8_t* cursor_boot, uint16_t cursor_seq, Registro* out,
             int max_out);
  uint8_t saveEpisode(Fase fase, uint32_t t0_ms, const uint8_t source_boot[8],
                      uint16_t source_seq);
  uint8_t loadEpisode(Fase& fase, uint32_t& t0_ms, uint8_t source_boot[8],
                      uint16_t& source_seq, uint8_t& found);
  uint8_t saveCommand(const uint8_t command_id[16], const uint8_t orden[32],
                      const ResultadoOrden& result);
  uint8_t findCommand(const uint8_t command_id[16], const uint8_t orden[32],
                      ResultadoOrden& result, uint8_t& hash_distinto);
  uint16_t unacked() const;
  uint16_t uncertainUnacked() const;
  uint8_t full() const;
  uint8_t ok() const;
  uint16_t nextSequence();
  const uint8_t* bootId() const { return boot_id_; }

 private:
  uint8_t ok_ = 0;
  uint8_t full_ = 0;
  uint8_t head_ = 0;
  uint16_t seq_ = 0;
  uint8_t boot_id_[8] = {};
  Registro ring_[8] = {};
  uint8_t used_[8] = {};
  struct CmdSlot {
    uint8_t id[16];
    uint8_t orden[32];
    ResultadoOrden result;
    uint8_t used;
  } cmds_[16] = {};
  uint8_t cmd_head_ = 0;
};
