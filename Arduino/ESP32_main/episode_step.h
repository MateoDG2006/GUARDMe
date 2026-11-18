#pragma once
#include "protocol.h"

struct EntradaEpisodio {
  Fase fase;
  uint8_t tiempo_cierto;
  uint32_t now_ms;
  uint32_t t0_ms;
  uint8_t candidato;
  uint8_t cancelar;
  uint32_t cancel_at_ms;
  uint8_t via;
  uint8_t silenciar;
  uint8_t ya_silenciado;
};

struct DecisionEpisodio {
  Fase fase;
  Tipo emitir;
  uint8_t hay_emision;
  uint8_t buzzer_on;
  uint8_t silenciado;
  uint32_t elapsed_ms;
};

struct RestaureArranque {
  Fase fase_viva;
  uint8_t buzzer_on;
  uint8_t marcar_incierta;
};

DecisionEpisodio stepEpisode(const EntradaEpisodio& in, uint32_t window_ms);
RestaureArranque onBootRestore(Fase fase_guardada);
uint8_t episodioListoParaNuevo(Fase fase, uint8_t suelta_estable, uint8_t rearme_cumplido);
int runEpisodeSelfCheck();
