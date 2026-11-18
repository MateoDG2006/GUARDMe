#pragma once
#include "store.h"
#include <stdint.h>

enum class Enlace : uint8_t { Off = 0, Connected = 1, Authorized = 2 };

struct OrdenLista {
  uint8_t bytes[32];
  uint32_t llegada_ms;
};

class GuardMeBle {
 public:
  void begin(RecordStore& store);
  void tick(uint32_t now_ms);
  Enlace link() const;
  uint8_t takeCommand(OrdenLista& out);
  uint8_t indicate(const uint8_t* msg, uint16_t len, uint8_t tipo);
  void setState(const uint8_t* bloque52);
  void setIdentity(const uint8_t* bloque48);
  void onConnect();
  void onDisconnect();
  void onWrite(const uint8_t* data, size_t len);
  void onIndicateComplete();

 private:
  RecordStore* store_ = nullptr;
  Enlace enlace_ = Enlace::Off;
  uint8_t identity_[48] = {};
  uint8_t state_[52] = {};
  OrdenLista cmd_queue_[4] = {};
  uint8_t cmd_q_len_ = 0;
  uint8_t assemble_[128] = {};
  uint16_t assemble_len_ = 0;
  uint16_t assemble_transfer_ = 0;
  uint8_t assemble_count_ = 0;
  uint8_t assemble_next_ = 0;
  uint32_t assemble_t0_ = 0;
  uint8_t out_msg_[80] = {};
  uint16_t out_len_ = 0;
  uint8_t out_tipo_ = 0;
  uint8_t out_pending_ = 0;
  uint16_t transfer_id_ = 1;
};
