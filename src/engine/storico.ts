// FLM — Rating iniziale dalle prestazioni storiche reali (PRD 3.1, regola 6).
// Regola 3 AGENTS.md: funzioni PURE e deterministiche, nessuna scrittura qui.
//
// Il rating iniziale di una squadra ha DUE componenti:
//   1. ratingStorico: media pesata per recency (5/4/3/2/1) delle posizioni
//      finali reali delle ultime 5 stagioni (src/data/storico.ts, fonte
//      Wikipedia). La posizione si converte con:
//        rating = 1500 + (10.5 − posizione) × 18 − offsetDivisione
//      (offset Serie B = 260: il campione di B è più debole del 15° di A).
//      La Juventus resta sempre in alto, la Cremonese fa lo yo-yo, una squadra
//      in ascesa come l'Atalanta sale di stagione in stagione.
//   2. ratingRosa: dalla media overall della rosa attuale (ratingInizialeDaMedia).
//   ratingInizialeCompleto = 50% storico + 50% rosa. Senza storico (promosse
//   dalla Serie C, leghe non ancora coperte) → solo rosa.

import { STORICO, type DivisioneStorica } from '../data/storico';
import { normalizzaNome } from '../data/leagues';
import {
  OFFSET_SECONDA_DIVISIONE,
  PESO_RATING_STORICO,
  PUNTI_POSIZIONE_RATING,
} from './rules';
import { ratingInizialeDaMedia } from './rating';

/** Rating Elo di una singola stagione dalla posizione finale (divisione compresa). */
export function ratingStoricoPerStagione(divisione: DivisioneStorica, posizione: number): number {
  const base = 1500 + (10.5 - posizione) * PUNTI_POSIZIONE_RATING;
  return Math.round(base - (divisione === 'serie_b' ? OFFSET_SECONDA_DIVISIONE : 0));
}

/**
 * Rating storico di una squadra: media pesata per recency delle sue stagioni
 * disponibili (pesi 1..5 dalla più vecchia alla più recente). null se la squadra
 * non ha stagioni coperte (es. promossa dalla Serie C).
 */
export function ratingStorico(nome: string): number | null {
  const chiave = Object.keys(STORICO).find((k) => normalizzaNome(k) === normalizzaNome(nome));
  const stagioni = chiave ? STORICO[chiave] : undefined;
  if (!stagioni || stagioni.length === 0) return null;
  const ordinate = [...stagioni].sort((a, b) => a.stagione.localeCompare(b.stagione, 'it'));
  let somma = 0;
  let pesi = 0;
  ordinate.forEach((s, index) => {
    const peso = index + 1; // recency: la stagione più recente pesa di più
    somma += ratingStoricoPerStagione(s.divisione, s.posizione) * peso;
    pesi += peso;
  });
  return Math.round(somma / pesi);
}

/**
 * Baseline storico di una divisione coperta dai dati: il rating medio storico
 * delle sue squadre (posizione media 10.5 → base 1500, meno l'offset di serie).
 * null se la divisione non è coperta: in quel caso vale il solo rating da rosa.
 */
export function baseStoricoDivisione(campionato?: string): number | null {
  if (!campionato) return null;
  const c = normalizzaNome(campionato);
  if (c === 'serie a') return 1500;
  if (c === 'serie b') return 1500 - OFFSET_SECONDA_DIVISIONE;
  return null;
}

/**
 * Rating iniziale completo di una squadra: 50% storico reale + 50% rosa attuale.
 * Senza storico (promossa dalla C): baseline della divisione al posto dello
 * storico — una neopromossa non parte più forte di una squadra affermata.
 * Divisione non coperta dai dati → solo rosa (fallback deterministico).
 */
export function ratingInizialeCompleto(nome: string, mediaOverall?: number, campionato?: string): number {
  const rosa = ratingInizialeDaMedia(mediaOverall ?? 60);
  const storico = ratingStorico(nome) ?? baseStoricoDivisione(campionato);
  if (storico === null) return rosa;
  return Math.round(storico * PESO_RATING_STORICO + rosa * (1 - PESO_RATING_STORICO));
}
