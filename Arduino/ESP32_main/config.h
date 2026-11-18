#pragma once
#include <stdint.h>

static const int PIN_SDA = 21;
static const int PIN_SCL = 22;
static const int PIN_BOTON = 4;
static const int PIN_BUZZER = 5;

static const float UMBRAL_GOLPE = 100.0f;
static const uint32_t MUESTRA_MS = 10;
static const uint32_t SERIAL_MS = 100;
static const uint32_t VENTANA_MS = 30000;
static const uint32_t PULSO_MS = 600;
static const uint32_t SUELTA_MS = 80;
static const uint32_t REARME_MS = 400;
static const uint32_t ATASCO_MS = 2000;
static const uint32_t REINTENTO_SENSOR_MS = 1000;
static const uint32_t REINTENTO_NVS_MS = 1000;
static const uint32_t ENSAMBLE_MS = 2000;
static const uint32_t INDICATE_MS = 3000;
static const uint8_t INDICATE_REINTENTOS = 3;
static const uint32_t RECORDATORIO_MAX_MS = 300000;

static const uint8_t PROTO_MAJOR = 0;
static const uint8_t PROTO_MINOR = 2;
static const char FIRMWARE_VERSION[] = "0.2.0";
static const char BLE_NAME[] = "GUARDMe";
static const char NVS_NS[] = "gm";

static const int ANILLO = 8;
static const int ORDENES = 16;
static const int COLA_SALIDA = 4;

static const char UUID_SERVICE[] = "4f6a8c10-2b7e-4d91-a3c5-91e0b74d6f20";
static const char UUID_IDENTITY[] = "4f6a8c11-2b7e-4d91-a3c5-91e0b74d6f20";
static const char UUID_STATE[] = "4f6a8c12-2b7e-4d91-a3c5-91e0b74d6f20";
static const char UUID_EVENTS[] = "4f6a8c13-2b7e-4d91-a3c5-91e0b74d6f20";
static const char UUID_COMMANDS[] = "4f6a8c14-2b7e-4d91-a3c5-91e0b74d6f20";
static const char UUID_CMD_RESULTS[] = "4f6a8c15-2b7e-4d91-a3c5-91e0b74d6f20";

static const uint16_t CAPABILITIES = 0x003F;  // bits 0-5; battery/LED = 0
