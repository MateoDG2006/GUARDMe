#include "config.h"
#include "protocol.h"
#include "episode_step.h"
#include "detector.h"
#include "button.h"
#include "signals.h"
#include "store.h"
#include "ble_link.h"
#include "diag.h"
#include <string.h>

Detector detector;
ButtonInput button;
Signals signals;
RecordStore store;
GuardMeBle ble;
Diag diag;

Fase fase = Fase::Idle;
uint32_t t0_ms = 0;
uint8_t tiempo_cierto = 1;
uint8_t ya_silenciado = 0;
uint8_t via_cancel = 0;
uint8_t source_boot[8] = {};
uint16_t source_seq = 0;
uint8_t boot_id[8] = {};
char serial_buf[20] = {};
float last_intensity = 0;
uint8_t ble_ok = 0;
uint8_t buzzer_alarm = 0;

static void buildIdentity(uint8_t out[48]) {
  memset(out, 0, 48);
  out[0] = 0x47;
  out[1] = 0x4D;
  out[2] = 0x49;
  out[3] = 0x44;
  out[4] = 1;
  out[5] = PROTO_MAJOR;
  out[6] = PROTO_MINOR;
  strncpy((char*)(out + 8), serial_buf, 19);
  strncpy((char*)(out + 28), FIRMWARE_VERSION, 15);
  writeU16(out + 44, CAPABILITIES);
}

static void buildState(uint8_t out[52], uint32_t now_ms) {
  memset(out, 0, 52);
  out[0] = 0x47;
  out[1] = 0x4D;
  out[2] = 0x53;
  out[3] = 0x54;
  out[4] = 1;
  out[5] = (uint8_t)fase;
  out[6] = tiempo_cierto;
  out[7] = (uint8_t)ble.link();
  out[8] = detector.sensorOk() ? 1 : 2;
  out[9] = button.atascado();
  out[10] = store.ok();
  out[11] = store.full();
  memcpy(out + 12, boot_id, 8);
  if (fase != Fase::Idle) {
    writeU16(out + 20, source_seq);
    writeU16(out + 22, source_seq);
    memcpy(out + 24, source_boot, 8);
    if ((fase == Fase::Pending || fase == Fase::Expired) && tiempo_cierto)
      writeU32(out + 32, now_ms - t0_ms);
  }
  writeU32(out + 36, now_ms);
  writeU16(out + 40, (uint16_t)VENTANA_MS);
  writeU16(out + 42, store.unacked());
  out[44] = via_cancel;
  writeU16(out + 46, store.uncertainUnacked());
  writeU32(out + 48, crc32Iso(out, 48));
}

static void emitRegistro(Tipo tipo, uint8_t flags, const uint8_t payload[24],
                         uint8_t payload_len, uint32_t now_ms) {
  Registro rec;
  memset(rec.bytes, 0, 64);
  rec.bytes[0] = 0x47;
  rec.bytes[1] = 0x4D;
  rec.bytes[2] = 0x52;
  rec.bytes[3] = 0x31;
  rec.bytes[4] = 1;
  rec.bytes[5] = (uint8_t)tipo;
  rec.bytes[6] = flags;
  rec.bytes[7] = payload_len;
  uint16_t seq = store.nextSequence();
  if (seq == 0) return;
  writeU16(rec.bytes + 8, seq);
  writeU16(rec.bytes + 10, source_seq ? source_seq : seq);
  memcpy(rec.bytes + 12, boot_id, 8);
  uint8_t zero_boot = 1;
  for (int i = 0; i < 8; i++)
    if (source_boot[i]) zero_boot = 0;
  memcpy(rec.bytes + 20, zero_boot ? boot_id : source_boot, 8);
  writeU32(rec.bytes + 28, now_ms);
  memcpy(rec.bytes + 32, payload, 24);
  writeU32(rec.bytes + 56, crc32Iso(rec.bytes, 56));
  store.append(rec);
  ble.indicate(rec.bytes, 64, (uint8_t)tipo);
  if (tipo == Tipo::FallCandidate) {
    source_seq = seq;
    memcpy(source_boot, boot_id, 8);
  }
}

static void applyDecision(const DecisionEpisodio& d, uint32_t now_ms,
                          float intensidad, uint8_t via) {
  uint8_t payload[24];
  memset(payload, 0, 24);
  if (d.hay_emision) {
    if (d.emitir == Tipo::FallCandidate) {
      writeU16(payload, (uint16_t)VENTANA_MS);
      memcpy(payload + 2, &intensidad, 4);
      payload[6] = (uint8_t)Fase::Pending;
      payload[7] = 1;
      emitRegistro(Tipo::FallCandidate, 0, payload, 8, now_ms);
    } else if (d.emitir == Tipo::FallCanceled) {
      payload[0] = via;
      writeU32(payload + 4, d.elapsed_ms);
      emitRegistro(Tipo::FallCanceled, 0, payload, 8, now_ms);
      via_cancel = via;
    } else if (d.emitir == Tipo::FallExpired) {
      writeU32(payload, d.elapsed_ms);
      payload[4] = 1;
      emitRegistro(Tipo::FallExpired, 0, payload, 8, now_ms);
    } else if (d.emitir == Tipo::AlarmSilenced) {
      payload[0] = 1;
      payload[1] = 1;
      emitRegistro(Tipo::AlarmSilenced, 0, payload, 4, now_ms);
    }
  }
  fase = d.fase;
  if (d.fase == Fase::Pending && d.hay_emision &&
      d.emitir == Tipo::FallCandidate) {
    t0_ms = now_ms;
    tiempo_cierto = 1;
    ya_silenciado = 0;
    via_cancel = 0;
  }
  if (d.silenciado) ya_silenciado = 1;
  buzzer_alarm = d.buzzer_on;
  signals.set(d.buzzer_on ? Sonido::Alarma : Sonido::Off);
  store.saveEpisode(fase, t0_ms, source_boot, source_seq);
}

static void sendCmdResult(const uint8_t command_id[16], FaseOrden fo, Codigo cod,
                          const uint8_t* src_boot, uint16_t src_seq) {
  ResultadoOrden r;
  memset(r.bytes, 0, 32);
  r.bytes[0] = (uint8_t)Tipo::CmdResult;
  r.bytes[1] = (uint8_t)fo;
  r.bytes[2] = (uint8_t)cod;
  memcpy(r.bytes + 4, command_id, 16);
  if (src_boot) memcpy(r.bytes + 20, src_boot, 8);
  writeU16(r.bytes + 28, src_seq);
  ble.indicate(r.bytes, 32, (uint8_t)Tipo::CmdResult);
}

static void handleCommand(const OrdenLista& orden) {
  uint8_t tipo = orden.bytes[0];
  const uint8_t* command_id = orden.bytes + 4;
  ResultadoOrden prev;
  uint8_t hash_distinto = 0;
  if (store.findCommand(command_id, orden.bytes, prev, hash_distinto)) {
    if (hash_distinto) {
      sendCmdResult(command_id, FaseOrden::Rejected, Codigo::BadIdReuse,
                    nullptr, 0);
      return;
    }
    ble.indicate(prev.bytes, 32, (uint8_t)Tipo::CmdResult);
    return;
  }
  sendCmdResult(command_id, FaseOrden::Received, Codigo::Ok, nullptr, 0);

  ResultadoOrden finalr;
  memset(finalr.bytes, 0, 32);
  finalr.bytes[0] = (uint8_t)Tipo::CmdResult;
  memcpy(finalr.bytes + 4, command_id, 16);

  if (tipo == (uint8_t)Tipo::CmdGetState) {
    finalr.bytes[1] = (uint8_t)FaseOrden::Applied;
    finalr.bytes[2] = (uint8_t)Codigo::Ok;
  } else if (tipo == (uint8_t)Tipo::CmdCancelFall) {
    uint8_t sb[8];
    memcpy(sb, orden.bytes + 20, 8);
    uint16_t ss = readU16(orden.bytes + 28);
    if (fase != Fase::Pending || memcmp(sb, source_boot, 8) != 0 ||
        ss != source_seq) {
      finalr.bytes[1] = (uint8_t)FaseOrden::Rejected;
      finalr.bytes[2] = (uint8_t)Codigo::UnknownEpisode;
    } else {
      EntradaEpisodio in = {};
      in.fase = fase;
      in.tiempo_cierto = tiempo_cierto;
      in.now_ms = orden.llegada_ms;
      in.t0_ms = t0_ms;
      in.cancelar = 1;
      in.cancel_at_ms = orden.llegada_ms;
      in.via = 2;
      DecisionEpisodio d = stepEpisode(in, VENTANA_MS);
      if (d.fase == Fase::Canceled) {
        applyDecision(d, orden.llegada_ms, last_intensity, 2);
        finalr.bytes[1] = (uint8_t)FaseOrden::Applied;
        finalr.bytes[2] = (uint8_t)Codigo::Ok;
        memcpy(finalr.bytes + 20, source_boot, 8);
        writeU16(finalr.bytes + 28, source_seq);
      } else {
        finalr.bytes[1] = (uint8_t)FaseOrden::Rejected;
        finalr.bytes[2] = (uint8_t)Codigo::Expired;
      }
    }
  } else if (tipo == (uint8_t)Tipo::CmdAckRecords) {
    uint8_t b[8];
    memcpy(b, orden.bytes + 20, 8);
    uint16_t from = readU16(orden.bytes + 28);
    uint16_t to = readU16(orden.bytes + 30);
    if (store.markAcked(b, from, to)) {
      finalr.bytes[1] = (uint8_t)FaseOrden::Applied;
      finalr.bytes[2] = (uint8_t)Codigo::Ok;
    } else {
      finalr.bytes[1] = (uint8_t)FaseOrden::Rejected;
      finalr.bytes[2] = (uint8_t)Codigo::Gap;
    }
  } else if (tipo == (uint8_t)Tipo::CmdSignalReminder) {
    // args[12]: occurrence[8] + duration_u16 + pattern_u8 + pad
    uint32_t dur = readU16(orden.bytes + 28);
    uint8_t pattern = orden.bytes[30];
    if (fase == Fase::Pending) {
      finalr.bytes[1] = (uint8_t)FaseOrden::Rejected;
      finalr.bytes[2] = (uint8_t)Codigo::Preempted;
    } else {
      signals.startReminder(dur ? dur : 2000, pattern);
      finalr.bytes[1] = (uint8_t)FaseOrden::Applied;
      finalr.bytes[2] = (uint8_t)Codigo::Ok;
    }
  } else if (tipo == (uint8_t)Tipo::CmdRequestReplay) {
    Registro buf[4];
    int n = store.replay(orden.bytes + 20, readU16(orden.bytes + 28), buf, 4);
    if (n < 0) {
      finalr.bytes[1] = (uint8_t)FaseOrden::Rejected;
      finalr.bytes[2] = (uint8_t)Codigo::Gap;
    } else {
      for (int i = 0; i < n; i++)
        ble.indicate(buf[i].bytes, 64, buf[i].bytes[5]);
      finalr.bytes[1] = (uint8_t)FaseOrden::Applied;
      finalr.bytes[2] = (uint8_t)Codigo::Ok;
    }
  } else {
    finalr.bytes[1] = (uint8_t)FaseOrden::Rejected;
    finalr.bytes[2] = (uint8_t)Codigo::Unsupported;
  }

  store.saveCommand(command_id, orden.bytes, finalr);
  ble.indicate(finalr.bytes, 32, (uint8_t)Tipo::CmdResult);
}

void setup() {
  Serial.begin(115200);
  int sc = runEpisodeSelfCheck();
  if (sc != 0) {
    Serial.print("EPISODE_SELFTEST_FAIL ");
    Serial.println(sc);
    return;
  }
  Serial.println("EPISODE_SELFTEST_OK");

  store.begin();
  store.loadOrCreateSerial(serial_buf);
  store.loadOrCreateBoot(boot_id, 1);

  Fase saved = Fase::Idle;
  uint32_t saved_t0 = 0;
  uint8_t sb[8] = {};
  uint16_t ss = 0;
  uint8_t found = 0;
  store.loadEpisode(saved, saved_t0, sb, ss, found);
  RestaureArranque r = onBootRestore(found ? saved : Fase::Idle);
  fase = r.fase_viva;
  if (r.marcar_incierta) {
    memcpy(source_boot, sb, 8);
    source_seq = ss;
  }

  button.begin(PIN_BOTON);
  signals.begin(PIN_BUZZER);
  signals.set(Sonido::Off);
  detector.begin();
  if (!detector.sensorOk()) signals.set(Sonido::Fallo);

  uint8_t id[48];
  buildIdentity(id);
  ble.begin(store);
  ble.setIdentity(id);
  ble_ok = 1;
  diag.begin();
  Serial.println("Sistema iniciado");
  Serial.println("Esperando golpe...");
}

void loop() {
  if (!ble_ok) return;
  uint32_t now = millis();

  Gesto g = button.tick(now);
  detector.tick(now);

  float intensidad = 0;
  uint8_t cand = detector.takeCandidate(intensidad);
  if (cand) last_intensity = intensidad;

  if (fase == Fase::Pending || fase == Fase::Expired) button.armForCancel();

  uint8_t cancelar = 0;
  uint8_t silenciar = 0;
  if (g == Gesto::Pulsacion) {
    if (fase == Fase::Pending)
      cancelar = 1;
    else if (fase == Fase::Expired)
      silenciar = 1;
  }

  EntradaEpisodio in = {};
  in.fase = fase;
  in.tiempo_cierto = tiempo_cierto;
  in.now_ms = now;
  in.t0_ms = t0_ms;
  in.candidato = (fase == Fase::Idle && cand) ? 1 : 0;
  in.cancelar = cancelar;
  in.cancel_at_ms = now;
  in.via = 1;
  in.silenciar = silenciar;
  in.ya_silenciado = ya_silenciado;

  DecisionEpisodio d = stepEpisode(in, VENTANA_MS);
  uint8_t changed =
      d.hay_emision || d.fase != fase || (uint8_t)d.buzzer_on != buzzer_alarm;
  if (changed) applyDecision(d, now, last_intensity, 1);

  if (episodioListoParaNuevo(fase, button.sueltaEstable(),
                             button.rearmeCumplido())) {
    fase = Fase::Idle;
    ya_silenciado = 0;
    via_cancel = 0;
    source_seq = 0;
    memset(source_boot, 0, 8);
    store.saveEpisode(fase, 0, source_boot, 0);
  }

  OrdenLista orden;
  while (ble.takeCommand(orden)) handleCommand(orden);

  uint8_t st[52];
  buildState(st, now);
  ble.setState(st);
  ble.tick(now);
  signals.tick(now);

  Muestra m;
  detector.lastSample(m);
  diag.tick(now, fase, m, ble.link(), 0, 0);
}
