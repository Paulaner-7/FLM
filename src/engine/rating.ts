// FLM — Rating Elo squadre (sostituisce la forza 1-5, PRD 3.2).
// Regola 3 AGENTS.md: funzioni PURE e deterministiche, nessuna scrittura qui.
//
// Formula = World Football Elo Ratings (eloratings.net), verificata su Wikipedia
// "World Football Elo Ratings" (consultata per questa feature):
//   Rn = Ro + P,  P = K · G · (W − We)
//   We = 1 / (10^(−dr/400) + 1)   con dr = differenza rating + 100 per la squadra in casa
//   W  = 1 vittoria, 0.5 pareggio, 0 sconfitta
//   G  = 1 (pareggio o 1 gol), 1.5 (2 gol), (11+N)/8 (N = differenza reti ≥ 3)
//   K  = 30 per il campionato ("all other tournaments")
//   P  arrotondato all'intero prima dell'aggiornamento (come da sistema reale).
// La valutazione è continua (non più 5 scaglioni) e VIVE nel tempo: una squadra
// che parte debole ma vince sale; il vantaggio casa è premiato in modo naturale
// (vincere in trasferta contro il bonus +100 vale di più).

/** Rating iniziale di una squadra media (base del sistema) */
export const ELO_INIZIALE = 1500;
/** Bonus Elo della squadra in casa (convenzione eloratings.net: +100 punti) */
export const VANTAGGIO_CASA_ELO = 100;
/**
 * Peso del campionato. eloratings.net: 60 mondiale, 50 continentale, 40 qualificazioni,
 * 30 altri tornei, 20 amichevoli. Un campionato di club = competizione a metà peso:
 * 20 (tarato con calibra-sim.ts: con 30 il campione accumulava troppa deriva
 * intra-stagione e produceva stagioni da 100+ punti, mai viste nel reale).
 */
export const K_CAMPIONATO = 20;

/**
 * Rating iniziale dalla media overall della rosa (bootstrap/import CSV):
 *   rating = 1500 + (mediaOverall − 60) × 20
 * Calibrazione (scripts/calibra-sim.ts, contro Serie A 2024/25): overall 76
 * (top lega) → 1820 · 70 (medio-alto) → 1700 · 64 (media) → 1580 · 58 (debole)
 * → 1460 · 85+ (top europee) → 2000+, in linea con i rating reali dei top club
 * su eloratings/clubelo (1400-2100).
 */
export function ratingInizialeDaMedia(mediaOverall: number): number {
  return Math.round(ELO_INIZIALE + (mediaOverall - 60) * 20);
}

/** Indice G della differenza reti (Wikipedia, tabella esempi verificata). */
export function fattoreGol(differenzaReti: number): number {
  const n = Math.abs(Math.round(differenzaReti));
  if (n <= 1) return 1;
  if (n === 2) return 1.5;
  return (11 + n) / 8;
}

/** Risultato atteso We (vittoria attesa, pareggio = 0.5), con vantaggio casa. */
export function risultatoAtteso(ratingCasa: number, ratingTrasferta: number): number {
  const dr = ratingCasa + VANTAGGIO_CASA_ELO - ratingTrasferta;
  return 1 / (10 ** (-dr / 400) + 1);
}

export interface EsitoAggiornamentoRating {
  ratingCasa: number;
  ratingTrasferta: number;
}

/**
 * Nuovi rating dopo una partita giocata. Simmetrico nel caso reale
 * (P trasferta = −P casa prima dell'arrotondamento; il sistema reale
 * arrotonda ogni squadra per conto suo, quindi è ammesso uno scarto di 1).
 */
export function aggiornaRating(
  golCasa: number,
  golTrasferta: number,
  ratingCasa: number,
  ratingTrasferta: number,
): EsitoAggiornamentoRating {
  const weCasa = risultatoAtteso(ratingCasa, ratingTrasferta);
  const wCasa = golCasa > golTrasferta ? 1 : golCasa === golTrasferta ? 0.5 : 0;
  const g = fattoreGol(golCasa - golTrasferta);
  const pCasa = Math.round(K_CAMPIONATO * g * (wCasa - weCasa));
  const pTrasferta = Math.round(K_CAMPIONATO * g * ((1 - wCasa) - (1 - weCasa)));
  return {
    ratingCasa: ratingCasa + pCasa,
    ratingTrasferta: ratingTrasferta + pTrasferta,
  };
}
