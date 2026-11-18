#include "ble_link.h"
#include "config.h"
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <string.h>

static GuardMeBle* g_ble = nullptr;
static BLECharacteristic* g_identity = nullptr;
static BLECharacteristic* g_state = nullptr;
static BLECharacteristic* g_events = nullptr;
static BLECharacteristic* g_commands = nullptr;
static BLECharacteristic* g_results = nullptr;
static BLEServer* g_server = nullptr;
static uint8_t g_connected = 0;

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    g_connected = 1;
    if (g_ble) g_ble->onConnect();
  }
  void onDisconnect(BLEServer* server) override {
    g_connected = 0;
    if (g_ble) g_ble->onDisconnect();
    server->startAdvertising();
  }
};

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    // NimBLE/Arduino-ESP32: getValue() returns Arduino String, not std::string.
    String v = c->getValue();
    if (g_ble && v.length() > 0) {
      g_ble->onWrite((const uint8_t*)v.c_str(), (size_t)v.length());
    }
  }
};

class IndicateCallbacks : public BLECharacteristicCallbacks {
  void onStatus(BLECharacteristic*, Status s, uint32_t) override {
    if (s == SUCCESS_INDICATE && g_ble) g_ble->onIndicateComplete();
  }
};

void GuardMeBle::begin(RecordStore& store) {
  store_ = &store;
  g_ble = this;
  BLEDevice::init(BLE_NAME);
  // setEncryptionLevel() no existe en este stack BLE; bonding + PERM_*_ENCRYPTED bastan.
  BLESecurity* sec = new BLESecurity();
  sec->setAuthenticationMode(ESP_LE_AUTH_BOND);
  sec->setCapability(ESP_IO_CAP_NONE);
  sec->setInitEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK);

  g_server = BLEDevice::createServer();
  g_server->setCallbacks(new ServerCallbacks());
  BLEService* svc = g_server->createService(BLEUUID(UUID_SERVICE));

  g_identity = svc->createCharacteristic(
      BLEUUID(UUID_IDENTITY), BLECharacteristic::PROPERTY_READ);
  g_identity->setAccessPermissions(ESP_GATT_PERM_READ);

  g_state = svc->createCharacteristic(
      BLEUUID(UUID_STATE), BLECharacteristic::PROPERTY_READ);
  g_state->setAccessPermissions(ESP_GATT_PERM_READ_ENCRYPTED);

  g_events = svc->createCharacteristic(
      BLEUUID(UUID_EVENTS), BLECharacteristic::PROPERTY_INDICATE);
  g_events->setAccessPermissions(ESP_GATT_PERM_READ_ENCRYPTED);
  g_events->addDescriptor(new BLE2902());
  g_events->setCallbacks(new IndicateCallbacks());

  g_commands = svc->createCharacteristic(
      BLEUUID(UUID_COMMANDS), BLECharacteristic::PROPERTY_WRITE);
  g_commands->setAccessPermissions(ESP_GATT_PERM_WRITE_ENCRYPTED);
  g_commands->setCallbacks(new CommandCallbacks());

  g_results = svc->createCharacteristic(
      BLEUUID(UUID_CMD_RESULTS), BLECharacteristic::PROPERTY_INDICATE);
  g_results->setAccessPermissions(ESP_GATT_PERM_READ_ENCRYPTED);
  g_results->addDescriptor(new BLE2902());
  g_results->setCallbacks(new IndicateCallbacks());

  svc->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(BLEUUID(UUID_SERVICE));
  adv->setScanResponse(true);
  adv->setMinPreferred(0x06);
  adv->setMinInterval(160);  // ~100ms
  adv->setMaxInterval(160);
  BLEDevice::startAdvertising();
}

void GuardMeBle::onConnect() {
  enlace_ = Enlace::Connected;
}

void GuardMeBle::onDisconnect() {
  enlace_ = Enlace::Off;
  assemble_len_ = 0;
  out_pending_ = 0;
}

void GuardMeBle::onIndicateComplete() { out_pending_ = 0; }

void GuardMeBle::onWrite(const uint8_t* data, size_t len) {
  if (len < 8 || data[0] != 0xA5 || data[1] != 0x02) return;
  uint8_t more = data[3] & 0x01;
  uint16_t tid = readU16(data + 4);
  uint8_t idx = data[6];
  uint8_t count = data[7];
  if (count == 0 || idx >= count) return;
  uint16_t payload = (uint16_t)(len - 8);
  if (idx == 0) {
    assemble_transfer_ = tid;
    assemble_count_ = count;
    assemble_next_ = 0;
    assemble_len_ = 0;
    assemble_t0_ = millis();
  }
  if (tid != assemble_transfer_ || idx != assemble_next_) {
    assemble_len_ = 0;
    return;
  }
  if (assemble_len_ + payload > sizeof(assemble_)) {
    assemble_len_ = 0;
    return;
  }
  memcpy(assemble_ + assemble_len_, data + 8, payload);
  assemble_len_ = (uint16_t)(assemble_len_ + payload);
  assemble_next_++;
  if (more || assemble_next_ < assemble_count_) return;
  if (assemble_len_ >= 32 && cmd_q_len_ < 4) {
    memcpy(cmd_queue_[cmd_q_len_].bytes, assemble_, 32);
    cmd_queue_[cmd_q_len_].llegada_ms = millis();
    cmd_q_len_++;
  }
  assemble_len_ = 0;
}

void GuardMeBle::tick(uint32_t now_ms) {
  if (assemble_len_ && now_ms - assemble_t0_ > ENSAMBLE_MS) assemble_len_ = 0;
  if (g_connected && enlace_ == Enlace::Connected) {
    // After bonding the stack encrypts; treat connected encrypted as authorized.
    enlace_ = Enlace::Authorized;
  }
  if (g_identity) g_identity->setValue(identity_, sizeof(identity_));
  if (g_state) g_state->setValue(state_, sizeof(state_));
  if (!out_pending_ || !g_connected) return;
  // re-send handled by characteristic indicate once
}

Enlace GuardMeBle::link() const { return enlace_; }

uint8_t GuardMeBle::takeCommand(OrdenLista& out) {
  if (cmd_q_len_ == 0) return 0;
  out = cmd_queue_[0];
  for (uint8_t i = 1; i < cmd_q_len_; i++) cmd_queue_[i - 1] = cmd_queue_[i];
  cmd_q_len_--;
  return 1;
}

uint8_t GuardMeBle::indicate(const uint8_t* msg, uint16_t len, uint8_t tipo) {
  if (!g_connected || len == 0 || len > 72) return 0;
  BLECharacteristic* ch =
      (tipo == (uint8_t)Tipo::CmdResult) ? g_results : g_events;
  if (!ch) return 0;
  // Single fragment for MTU-friendly small messages; wrap with header.
  uint8_t frame[80];
  frame[0] = 0xA5;
  frame[1] = 0x02;
  frame[2] = tipo;
  frame[3] = 0;
  writeU16(frame + 4, transfer_id_++);
  frame[6] = 0;
  frame[7] = 1;
  memcpy(frame + 8, msg, len);
  ch->setValue(frame, (size_t)(8 + len));
  ch->indicate();
  out_pending_ = 1;
  return 1;
}

void GuardMeBle::setState(const uint8_t* bloque52) {
  memcpy(state_, bloque52, 52);
  if (g_state) g_state->setValue(state_, 52);
}

void GuardMeBle::setIdentity(const uint8_t* bloque48) {
  memcpy(identity_, bloque48, 48);
  if (g_identity) g_identity->setValue(identity_, 48);
}
