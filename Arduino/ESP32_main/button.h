#pragma once
#include <stdint.h>

enum class Gesto : uint8_t { Ninguno = 0, Pulsacion = 1, Atasco = 2 };

class ButtonInput {
 public:
  void begin(int pin);
  Gesto tick(uint32_t now_ms);
  uint8_t sueltaEstable() const;
  uint8_t rearmeCumplido() const;
  uint8_t atascado() const;
  void armForCancel();

 private:
  int pin_ = -1;
  uint32_t inicio_pulso_ = 0;
  uint32_t inicio_suelta_ = 0;
  uint32_t inicio_rearme_ = 0;
  uint32_t inicio_atasco_ = 0;
  uint8_t contando_pulso_ = 0;
  uint8_t contando_suelta_ = 0;
  uint8_t esperando_suelta_ = 0;
  uint8_t en_rearme_ = 0;
  uint8_t suelta_ok_ = 0;
  uint8_t rearme_ok_ = 0;
  uint8_t atascado_ = 0;
  uint8_t armado_cancel_ = 0;
};
