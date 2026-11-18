#pragma once
#include "detector.h"
#include "ble_link.h"
#include "episode_step.h"
#include <stdint.h>

class Diag {
 public:
  void begin();
  void tick(uint32_t now_ms, Fase fase, const Muestra& muestra, Enlace enlace,
            uint8_t esperando_suelta, uint8_t rearmando);

 private:
  uint32_t last_ = 0;
};
