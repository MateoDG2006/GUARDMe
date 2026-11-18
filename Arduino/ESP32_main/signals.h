#pragma once
#include <stdint.h>

enum class Sonido : uint8_t { Off = 0, Alarma = 1, Recordatorio = 2, Fallo = 3 };

class Signals {
 public:
  void begin(int pin);
  void set(Sonido sonido);
  void tick(uint32_t now_ms);
  void startReminder(uint32_t duration_ms, uint8_t pattern_id);

 private:
  int pin_ = -1;
  Sonido modo_ = Sonido::Off;
  uint32_t t0_ = 0;
  uint32_t reminder_until_ = 0;
};
