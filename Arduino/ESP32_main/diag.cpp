#include "diag.h"
#include "config.h"
#include <Arduino.h>

void Diag::begin() { last_ = 0; }

void Diag::tick(uint32_t now_ms, Fase fase, const Muestra& muestra,
                Enlace /*enlace*/, uint8_t esperando_suelta,
                uint8_t rearmando) {
  if (now_ms - last_ < SERIAL_MS) return;
  last_ = now_ms;
  Serial.print("Intensidad: ");
  Serial.print(muestra.intensidad, 2);
  Serial.print(" m/s2 | Umbral: ");
  Serial.print(UMBRAL_GOLPE, 2);
  Serial.print(" | Estado: ");
  if (!muestra.sensor_ok) {
    Serial.println("FALLO_SENSOR");
    return;
  }
  if (esperando_suelta) {
    Serial.println("ESPERANDO_LIBERACION");
    return;
  }
  if (rearmando) {
    Serial.println("REARMANDO");
    return;
  }
  switch (fase) {
    case Fase::Idle:
      Serial.println("ESPERANDO_GOLPE");
      break;
    case Fase::Pending:
      Serial.println("ALARMA_ACTIVA");
      break;
    case Fase::Canceled:
      Serial.println("CANCELADO");
      break;
    case Fase::Expired:
      Serial.println("VENCIDO");
      break;
  }
}
