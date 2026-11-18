#include "detector.h"
#include "config.h"
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
#include <math.h>

static Adafruit_MPU6050 g_mpu;

uint8_t Detector::begin() {
  Wire.begin(PIN_SDA, PIN_SCL);
  if (!g_mpu.begin()) {
    sensor_ok_ = 0;
    last_.sensor_ok = 0;
    return 0;
  }
  g_mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  g_mpu.setFilterBandwidth(MPU6050_BAND_94_HZ);
  sensors_event_t a, g, temp;
  g_mpu.getEvent(&a, &g, &temp);
  ax_ant_ = a.acceleration.x;
  ay_ant_ = a.acceleration.y;
  az_ant_ = a.acceleration.z;
  sensor_ok_ = 1;
  last_.sensor_ok = 1;
  return 1;
}

void Detector::tick(uint32_t now_ms) {
  if (!sensor_ok_) {
    if (now_ms - ultimo_reintento_ >= REINTENTO_SENSOR_MS) {
      ultimo_reintento_ = now_ms;
      begin();
    }
    return;
  }
  if (now_ms - ultima_lectura_ < MUESTRA_MS) return;
  ultima_lectura_ = now_ms;

  sensors_event_t a, g, temp;
  if (!g_mpu.getEvent(&a, &g, &temp)) {
    sensor_ok_ = 0;
    last_.sensor_ok = 0;
    return;
  }
  float ax = a.acceleration.x;
  float ay = a.acceleration.y;
  float az = a.acceleration.z;
  float dx = ax - ax_ant_;
  float dy = ay - ay_ant_;
  float dz = az - az_ant_;
  float intensidad = sqrtf(dx * dx + dy * dy + dz * dz);
  last_.uptime_ms = now_ms;
  last_.ax = ax;
  last_.ay = ay;
  last_.az = az;
  last_.gx = g.gyro.x;
  last_.gy = g.gyro.y;
  last_.gz = g.gyro.z;
  last_.intensidad = intensidad;
  last_.sensor_ok = 1;
  if (!candidato_ && intensidad > UMBRAL_GOLPE) {
    candidato_ = 1;
    intensidad_cand_ = intensidad;
  }
  ax_ant_ = ax;
  ay_ant_ = ay;
  az_ant_ = az;
}

uint8_t Detector::takeCandidate(float& intensidad) {
  if (!candidato_) return 0;
  candidato_ = 0;
  intensidad = intensidad_cand_;
  return 1;
}

uint8_t Detector::sensorOk() const { return sensor_ok_; }

void Detector::lastSample(Muestra& out) const { out = last_; }
