#pragma once
#include <stdint.h>

struct Muestra {
  uint32_t uptime_ms;
  float ax, ay, az;
  float gx, gy, gz;
  float intensidad;
  uint8_t sensor_ok;
};

class Detector {
 public:
  uint8_t begin();
  void tick(uint32_t now_ms);
  uint8_t takeCandidate(float& intensidad);
  uint8_t sensorOk() const;
  void lastSample(Muestra& out) const;

 private:
  uint32_t ultima_lectura_ = 0;
  uint32_t ultimo_reintento_ = 0;
  float ax_ant_ = 0, ay_ant_ = 0, az_ant_ = 0;
  Muestra last_{};
  uint8_t sensor_ok_ = 0;
  uint8_t candidato_ = 0;
  float intensidad_cand_ = 0;
};
