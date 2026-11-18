#include "episode_step.h"

DecisionEpisodio stepEpisode(const EntradaEpisodio& in, uint32_t window_ms) {
  DecisionEpisodio out = {};
  out.fase = in.fase;
  out.emitir = Tipo::None;
  out.hay_emision = 0;
  out.buzzer_on = 0;
  out.silenciado = 0;
  out.elapsed_ms = 0;

  if (in.fase == Fase::Idle && in.candidato) {
    out.fase = Fase::Pending;
    out.emitir = Tipo::FallCandidate;
    out.hay_emision = 1;
    out.buzzer_on = 1;
    out.elapsed_ms = 0;
    return out;
  }

  if (in.fase == Fase::Pending && in.tiempo_cierto == 1 && in.cancelar &&
      (in.cancel_at_ms - in.t0_ms) < window_ms) {
    out.fase = Fase::Canceled;
    out.emitir = Tipo::FallCanceled;
    out.hay_emision = 1;
    out.buzzer_on = 0;
    out.elapsed_ms = in.cancel_at_ms - in.t0_ms;
    return out;
  }

  if (in.fase == Fase::Pending && in.tiempo_cierto == 1 &&
      (in.now_ms - in.t0_ms) >= window_ms) {
    out.fase = Fase::Expired;
    out.emitir = Tipo::FallExpired;
    out.hay_emision = 1;
    out.buzzer_on = 1;
    out.elapsed_ms = in.now_ms - in.t0_ms;
    return out;
  }

  if (in.fase == Fase::Pending && in.tiempo_cierto == 0) {
    out.fase = Fase::Pending;
    out.buzzer_on = 0;
    return out;
  }

  if (in.fase == Fase::Expired && in.silenciar && in.ya_silenciado == 0) {
    out.fase = Fase::Expired;
    out.emitir = Tipo::AlarmSilenced;
    out.hay_emision = 1;
    out.buzzer_on = 0;
    out.silenciado = 1;
    return out;
  }

  if (in.fase == Fase::Expired && in.ya_silenciado == 1) {
    out.fase = Fase::Expired;
    out.buzzer_on = 0;
    out.silenciado = 1;
    return out;
  }

  if (in.fase == Fase::Canceled) {
    out.fase = Fase::Canceled;
    out.buzzer_on = 0;
    return out;
  }

  if (in.fase == Fase::Idle && !in.candidato) {
    out.fase = Fase::Idle;
    return out;
  }

  if (in.fase == Fase::Pending) {
    out.fase = Fase::Pending;
    out.buzzer_on = in.tiempo_cierto == 1 ? 1 : 0;
    out.elapsed_ms = in.tiempo_cierto ? (in.now_ms - in.t0_ms) : 0;
    return out;
  }

  out.fase = in.fase;
  return out;
}

RestaureArranque onBootRestore(Fase fase_guardada) {
  RestaureArranque r;
  r.fase_viva = Fase::Idle;
  r.buzzer_on = 0;
  r.marcar_incierta = (fase_guardada == Fase::Pending) ? 1 : 0;
  return r;
}

uint8_t episodioListoParaNuevo(Fase fase, uint8_t suelta_estable,
                               uint8_t rearme_cumplido) {
  if (fase != Fase::Canceled && fase != Fase::Expired) return 0;
  return (suelta_estable && rearme_cumplido) ? 1 : 0;
}

static int expectStep(const EntradaEpisodio& in, uint32_t window, Fase fase,
                      Tipo emitir, uint8_t buzzer, int fila) {
  DecisionEpisodio d = stepEpisode(in, window);
  uint8_t hay = emitir == Tipo::None ? 0 : 1;
  if (d.fase != fase) return fila;
  if (d.hay_emision != hay) return fila;
  if (hay && d.emitir != emitir) return fila;
  if (d.buzzer_on != buzzer) return fila;
  return 0;
}

int runEpisodeSelfCheck() {
  const uint32_t W = 30000;
  EntradaEpisodio in = {};
  int fail;

  in = {};
  in.fase = Fase::Idle;
  in.candidato = 1;
  in.tiempo_cierto = 1;
  in.now_ms = 1000;
  fail = expectStep(in, W, Fase::Pending, Tipo::FallCandidate, 1, 1);
  if (fail) return fail;

  in = {};
  in.fase = Fase::Pending;
  in.tiempo_cierto = 1;
  in.t0_ms = 0;
  in.now_ms = 10000;
  in.cancelar = 1;
  in.cancel_at_ms = 29999;
  in.via = 1;
  fail = expectStep(in, W, Fase::Canceled, Tipo::FallCanceled, 0, 2);
  if (fail) return fail;

  in = {};
  in.fase = Fase::Pending;
  in.tiempo_cierto = 1;
  in.t0_ms = 0;
  in.now_ms = 30000;
  in.cancelar = 1;
  in.cancel_at_ms = 30000;
  fail = expectStep(in, W, Fase::Expired, Tipo::FallExpired, 1, 3);
  if (fail) return fail;

  in = {};
  in.fase = Fase::Pending;
  in.tiempo_cierto = 1;
  in.t0_ms = 0;
  in.now_ms = 30000;
  fail = expectStep(in, W, Fase::Expired, Tipo::FallExpired, 1, 4);
  if (fail) return fail;

  in = {};
  in.fase = Fase::Pending;
  in.tiempo_cierto = 1;
  in.t0_ms = 0;
  in.now_ms = 29999;
  fail = expectStep(in, W, Fase::Pending, Tipo::None, 1, 5);
  if (fail) return fail;

  in = {};
  in.fase = Fase::Pending;
  in.tiempo_cierto = 0;
  in.t0_ms = 0;
  in.now_ms = 999999;
  fail = expectStep(in, W, Fase::Pending, Tipo::None, 0, 6);
  if (fail) return fail;

  in = {};
  in.fase = Fase::Expired;
  in.tiempo_cierto = 1;
  in.silenciar = 1;
  in.ya_silenciado = 0;
  DecisionEpisodio d1 = stepEpisode(in, W);
  if (d1.fase != Fase::Expired || !d1.hay_emision ||
      d1.emitir != Tipo::AlarmSilenced || d1.buzzer_on != 0 ||
      d1.silenciado != 1)
    return 7;
  in.ya_silenciado = 1;
  in.silenciar = 0;
  DecisionEpisodio d2 = stepEpisode(in, W);
  if (d2.fase != Fase::Expired || d2.hay_emision || d2.buzzer_on != 0 ||
      d2.silenciado != 1)
    return 7;

  RestaureArranque r = onBootRestore(Fase::Pending);
  if (r.fase_viva != Fase::Idle || r.marcar_incierta != 1 || r.buzzer_on != 0)
    return 8;

  return 0;
}
