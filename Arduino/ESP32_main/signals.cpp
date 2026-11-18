#include "signals.h"
#include "config.h"
#include <Arduino.h>

void Signals::begin(int pin) {
  pin_ = pin;
  pinMode(pin_, OUTPUT);
  digitalWrite(pin_, LOW);
  pinMode(PIN_LED_R, OUTPUT);
  pinMode(PIN_LED_G, OUTPUT);
  pinMode(PIN_LED_B, OUTPUT);
  ledOff();
}

void Signals::ledOff() {
  // RGB ánodo común: HIGH = apagado
  digitalWrite(PIN_LED_R, HIGH);
  digitalWrite(PIN_LED_G, HIGH);
  digitalWrite(PIN_LED_B, HIGH);
}

void Signals::ledRgb(uint8_t r_on, uint8_t g_on, uint8_t b_on) {
  digitalWrite(PIN_LED_R, r_on ? LOW : HIGH);
  digitalWrite(PIN_LED_G, g_on ? LOW : HIGH);
  digitalWrite(PIN_LED_B, b_on ? LOW : HIGH);
}

void Signals::set(Sonido sonido) {
  modo_ = sonido;
  t0_ = millis();
  if (sonido == Sonido::Alarma) {
    digitalWrite(pin_, HIGH);
    ledRgb(1, 0, 0);
  } else if (sonido == Sonido::Off) {
    digitalWrite(pin_, LOW);
    reminder_until_ = 0;
    ledOff();
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
    ledRgb(1, 0, 0);
    return;
  }
  if (modo_ == Sonido::Off) {
    digitalWrite(pin_, LOW);
    ledOff();
    return;
  }
  if (modo_ == Sonido::Recordatorio) {
    if (reminder_until_ && now_ms >= reminder_until_) {
      set(Sonido::Off);
      return;
    }
    uint32_t phase = (now_ms - t0_) % 500;
    uint8_t on = phase < 100 ? 1 : 0;
    digitalWrite(pin_, on ? HIGH : LOW);
    ledRgb(0, 0, on);
    return;
  }
  if (modo_ == Sonido::Fallo) {
    uint32_t phase = (now_ms - t0_) % 2000;
    uint8_t on = phase < 50 ? 1 : 0;
    digitalWrite(pin_, on ? HIGH : LOW);
    ledRgb(on, 0, 0);
  }
}
