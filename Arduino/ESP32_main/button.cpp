#include "button.h"
#include "config.h"
#include <Arduino.h>

void ButtonInput::begin(int pin) {
  pin_ = pin;
  // Esquema: un lado GPIO 4, otro GND → PULLUP, pulsado = LOW.
  pinMode(pin_, INPUT_PULLUP);
}

void ButtonInput::armForCancel() {
  armado_cancel_ = 1;
  contando_pulso_ = 0;
  esperando_suelta_ = 0;
  en_rearme_ = 0;
  suelta_ok_ = 0;
  rearme_ok_ = 0;
}

Gesto ButtonInput::tick(uint32_t now_ms) {
  bool pressed = digitalRead(pin_) == LOW;
  Gesto gesto = Gesto::Ninguno;

  if (armado_cancel_) {
    if (pressed) {
      if (!contando_pulso_) {
        inicio_pulso_ = now_ms;
        contando_pulso_ = 1;
      } else if (!esperando_suelta_ &&
                 now_ms - inicio_pulso_ >= PULSO_MS) {
        gesto = Gesto::Pulsacion;
        esperando_suelta_ = 1;
        contando_suelta_ = 0;
        suelta_ok_ = 0;
        rearme_ok_ = 0;
      }
    } else {
      contando_pulso_ = 0;
      if (esperando_suelta_) {
        if (!contando_suelta_) {
          inicio_suelta_ = now_ms;
          contando_suelta_ = 1;
        } else if (now_ms - inicio_suelta_ >= SUELTA_MS) {
          suelta_ok_ = 1;
          esperando_suelta_ = 0;
          en_rearme_ = 1;
          inicio_rearme_ = now_ms;
          armado_cancel_ = 0;
        }
      }
    }
  } else if (en_rearme_) {
    if (pressed) {
      inicio_rearme_ = now_ms;
    } else if (now_ms - inicio_rearme_ >= REARME_MS) {
      rearme_ok_ = 1;
      en_rearme_ = 0;
    }
  }

  if (!armado_cancel_ && !esperando_suelta_ && !en_rearme_) {
    if (pressed) {
      if (!inicio_atasco_) inicio_atasco_ = now_ms;
      if (!atascado_ && now_ms - inicio_atasco_ >= ATASCO_MS) {
        atascado_ = 1;
        gesto = Gesto::Atasco;
      }
    } else {
      inicio_atasco_ = 0;
      if (atascado_) {
        if (!contando_suelta_) {
          inicio_suelta_ = now_ms;
          contando_suelta_ = 1;
        } else if (now_ms - inicio_suelta_ >= SUELTA_MS) {
          atascado_ = 0;
          contando_suelta_ = 0;
        }
      }
    }
  }

  return gesto;
}

uint8_t ButtonInput::sueltaEstable() const { return suelta_ok_; }
uint8_t ButtonInput::rearmeCumplido() const { return rearme_ok_; }
uint8_t ButtonInput::atascado() const { return atascado_; }
