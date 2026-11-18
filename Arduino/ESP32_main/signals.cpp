#include "signals.h"
#include "config.h"
#include <Arduino.h>

void Signals::begin(int pin) {
  pin_ = pin;
  pinMode(pin_, OUTPUT);
  digitalWrite(pin_, LOW);
}

void Signals::set(Sonido sonido) {
  modo_ = sonido;
  t0_ = millis();
  if (sonido == Sonido::Alarma) {
    digitalWrite(pin_, HIGH);
  } else if (sonido == Sonido::Off) {
    digitalWrite(pin_, LOW);
    reminder_until_ = 0;
  }
}

void Signals::startReminder(uint32_t duration_ms, uint8_t /*pattern_id*/) {
  if (modo_ == Sonido::Alarma) return;
  if (duration_ms > RECORDATORIO_MAX_MS) duration_ms = RECORDATORIO_MAX_MS;
  reminder_until_ = millis() + duration_ms;
  set(Sonido::Recordatorio);
}

void Signals::tick(uint32_t now_ms) {
  if (modo_ == Sonido::Alarma) {
    digitalWrite(pin_, HIGH);
    return;
  }
  if (modo_ == Sonido::Off) {
    digitalWrite(pin_, LOW);
    return;
  }
  if (modo_ == Sonido::Recordatorio) {
    if (reminder_until_ && now_ms >= reminder_until_) {
      set(Sonido::Off);
      return;
    }
    uint32_t phase = (now_ms - t0_) % 500;
    digitalWrite(pin_, phase < 100 ? HIGH : LOW);
    return;
  }
  if (modo_ == Sonido::Fallo) {
    uint32_t phase = (now_ms - t0_) % 2000;
    digitalWrite(pin_, phase < 50 ? HIGH : LOW);
  }
}
