// FLM — Servizio LLM
// Regola 2 AGENTS.md: le chiamate a API LLM vivono SOLO in questo modulo.
// Il resto dell'app usa esclusivamente le funzioni esposte qui.
//
// Provider-agnostic (PRD 4.5, 7.8): base URL + chiave + modello da impostazioni,
// endpoint OpenAI-compatibile (es. Opencode Go). In M0 è uno stub senza chiamate
// reali: restituisce null, e l'engine usa il fallback offline (PRD 4.6).

import type { CategoriaEvento, TipoEvento, EffettiProposti } from '../types/entities';

/** Impostazioni provider (PRD 7.8) */
export interface LlmSettings {
  /** es. https://opencode.ai/zen/go/v1 */
  baseUrl: string;
  apiKey: string;
  /** es. deepseek-v4-flash, mimo-v2.5 */
  modello: string;
}

/**
 * Stato sintetico passato al modello a ogni chiamata (PRD 4.1):
 * il codice raccoglie lo stato, l'LLM lo racconta — mai numeri finali.
 */
export interface ContestoGenerazione {
  settimana: number;
  posizioneClassifica: number;
  ultimePartite: string[];
  giocatoriMoraleBasso: string[];
  /** Morale medio pesato dello spogliatoio (engine/morale.ts), 0-100 */
  moraleSpogliatoio?: number;
  promesseInScadenza: string[];
  fiduciaSocieta: number;
  /** Ultimi 10-15 eventi già usati, per l'anti-ripetizione (PRD 4.3) */
  ultimiEventi: string[];
}

/** Risposta conforme allo schema structured output del PRD 4.2 */
export interface PropostaEventi {
  eventi: Array<{
    categoria: CategoriaEvento;
    tipo: TipoEvento;
    titolo: string;
    testo: string;
    giocatoriCoinvolti: string[];
    opzioni: Array<{
      testo: string;
      effettiProposti: EffettiProposti;
    }>;
  }>;
  notizie: string[];
}

export interface LlmService {
  /**
   * Genera gli eventi settimanali e le notizie del turno.
   * Restituisce null se la chiamata fallisce o non è configurata:
   * in quel caso il motore pesca dal fallback offline (PRD 4.6).
   */
  generaEventiSettimanali(contesto: ContestoGenerazione): Promise<PropostaEventi | null>;
}

/** Stub M0: nessuna chiamata reale. Implementazione completa in M3 (PRD 5.3). */
export const llm: LlmService = {
  async generaEventiSettimanali(): Promise<PropostaEventi | null> {
    return null;
  },
};
