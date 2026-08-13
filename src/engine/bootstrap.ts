// FLM — Regole numeriche per bootstrap da PES Editor.
// I CSV forniscono dati grezzi; ogni valore di gioco derivato vive qui.

import { ratingInizialeDaMedia } from './rating';

export interface ValoriGiocatoreBootstrap {
  morale: number;
  fiducia: number;
  forma: number;
  minutiStagione: number;
  leader: boolean;
  giovane: boolean;
}

export interface ProfiloSquadraBootstrap {
  rating: number;
  coefficiente: number;
  budget: number;
  reputazione: number;
}

/** Regola MVP: giocatore di vivaio se ha al massimo 21 anni all'import. */
export function valoriGiocatoreBootstrap(eta: number): ValoriGiocatoreBootstrap {
  return {
    morale: 50,
    fiducia: 50,
    forma: 50,
    minutiStagione: 0,
    leader: false,
    giovane: eta <= 21,
  };
}

/**
 * Crea profilo numerico minimo quando export editor non contiene finanze o rating club.
 * Media overall resta unica fonte per rating e coefficiente; budget/reputazione usano
 * fallback deterministici, mai valori inventati dall'LLM.
 * Il rating Elo iniziale è continuo (ratingInizialeDaMedia) e poi vive coi risultati.
 */
export function profiloSquadraBootstrap(
  mediaOverall: number | null,
  nazionale: boolean,
): ProfiloSquadraBootstrap {
  const overall = mediaOverall ?? 60;
  const rating = ratingInizialeDaMedia(overall);
  const coefficiente = Math.max(0, Math.round((overall - 50) * 1.5));
  // Fallback budget/reputazione: gradazioni ampie ma deterministiche (rating ≈ 100 punti = 1 livello)
  const livello = Math.min(5, Math.max(1, Math.round((rating - 1400) / 100)));

  return {
    rating,
    coefficiente,
    budget: nazionale ? 0 : livello * 5_000_000,
    reputazione: nazionale ? 70 : Math.min(95, 25 + livello * 12),
  };
}
