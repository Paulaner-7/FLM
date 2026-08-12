// FLM — Regole numeriche per bootstrap da PES Editor.
// I CSV forniscono dati grezzi; ogni valore di gioco derivato vive qui.

import type { Forza } from '../types/entities';

export interface ValoriGiocatoreBootstrap {
  morale: number;
  forma: number;
  minutiStagione: number;
  leader: boolean;
  giovane: boolean;
}

export interface ProfiloSquadraBootstrap {
  forza: Forza;
  coefficiente: number;
  budget: number;
  reputazione: number;
}

/** Regola MVP: giocatore di vivaio se ha al massimo 21 anni all'import. */
export function valoriGiocatoreBootstrap(eta: number): ValoriGiocatoreBootstrap {
  return {
    morale: 50,
    forma: 50,
    minutiStagione: 0,
    leader: false,
    giovane: eta <= 21,
  };
}

/**
 * Crea profilo numerico minimo quando export editor non contiene finanze o rating club.
 * Media overall resta unica fonte per forza e coefficiente; budget/reputazione usano fallback
 * deterministici, mai valori inventati dall'LLM.
 */
export function profiloSquadraBootstrap(
  mediaOverall: number | null,
  nazionale: boolean,
): ProfiloSquadraBootstrap {
  const overall = mediaOverall ?? 60;
  const forza: Forza = overall >= 80 ? 5 : overall >= 72 ? 4 : overall >= 64 ? 3 : overall >= 55 ? 2 : 1;
  const coefficiente = Math.max(0, Math.round((overall - 50) * 1.5));

  return {
    forza,
    coefficiente,
    budget: nazionale ? 0 : forza * 5_000_000,
    reputazione: nazionale ? 70 : Math.min(95, 25 + forza * 12),
  };
}
