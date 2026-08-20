// FLM — Coefficiente club per sorteggi e fasce (PRD 7.1: "versione semplificata
// del ranking UEFA", decisione utente: init derivato dal rating Elo).
//
// FONTI (verifica web, agosto 2026 — docs/verifica-web.md §11):
// Regole reali UEFA 2024/25–2026/27:
// - Vittoria 2 pt, pareggio 1 pt dalla league phase (1 pt / 0,5 pt nei playoff KO).
// - Bonus UCL league phase 6; UEL/UECL minimo garantito 3 / 2,5.
// - Bonus ranking league phase: +0,25 per posizione (UCL/UEL), +0,125 (UECL da 24ª a 9ª).
// - Bonus turno KO: +1,5 (UCL) / +1 (UEL) / +0,5 (UECL).
// - Finestra 5 stagioni; club senza storia = 20% del coefficiente associazione.

import type { Id, Partita } from '../../types/entities';
import { COEFFICIENTI_ASSOCIAZIONE_2026_27 } from '../../data/accessi';

/** Scala Elo → coefficiente UEFA-like: rating 1500 → ~15, 2100 → ~135. */
const ELO_MIN = 1500;
const ELO_MAX = 2100;
const COEFF_MIN = 15;
const COEFF_MAX = 135;

/**
 * Coefficiente iniziale dal rating Elo (decisione utente D10): mappatura
 * lineare su scala UEFA (top club reali ~90-130).
 */
export function coefficienteDaRating(rating: number): number {
  const t = Math.min(1, Math.max(0, (rating - ELO_MIN) / (ELO_MAX - ELO_MIN)));
  return Math.round((COEFF_MIN + t * (COEFF_MAX - COEFF_MIN)) * 100) / 100;
}

/**
 * Coefficiente di un club senza storia europea (regola reale UEFA):
 * 20% del coefficiente associazione della sua nazione.
 */
export function coefficienteDaAssociazione(nazione: string): number {
  const associazione = COEFFICIENTI_ASSOCIAZIONE_2026_27[nazione];
  if (associazione === undefined) return COEFF_MIN;
  return Math.round(associazione * 0.2 * 100) / 100;
}

/**
 * Punti coefficiente di una partita (regole reali):
 * - league phase: vittoria 2, pareggio 1
 * - playoff KO e tabellone: vittoria 1, pareggio 0,5
 * Il pareggio ai rigori vale come pareggio (regola reale).
 */
export function puntiCoefficientePartita(p: Partita, fase: string): number {
  const vittoriaCasa = p.golCasa > p.golTrasferta;
  const pareggio = p.golCasa === p.golTrasferta;
  const knockout = fase === 'playoff' || fase === 'ottavi' || fase === 'quarti' || fase === 'semifinali' || fase === 'playoff_qualificazione';
  const v = knockout ? 1 : 2;
  const n = knockout ? 0.5 : 1;
  const casa = vittoriaCasa ? v : pareggio ? n : 0;
  const trasferta = !vittoriaCasa && !pareggio ? v : pareggio ? n : 0;
  return casa + trasferta === 0 && !vittoriaCasa && !pareggio
    ? v // sconfitta casa: punti trasferta
    : casa + trasferta;
}

/** Bonus league phase per posizione finale (regola reale UEFA). */
export function bonusRankingLeaguePhase(posizione: number, puntiPerPosizione: number): number {
  if (posizione < 1 || posizione > 36) return 0;
  // 1ª: 12 (UCL) / 6 (UEL) / 4 (UECL) con +0,25 per posizione; UECL +0,125 da 24ª a 9ª
  const max = puntiPerPosizione === 0.125 ? 4 : puntiPerPosizione === 0.25 ? 12 : 6;
  if (posizione <= 8) return Math.round((max - (posizione - 1) * 0.25) * 100) / 100;
  if (posizione <= 24) return Math.round((24 - posizione + 1) * puntiPerPosizione * 100) / 100;
  return 0;
}

export interface StoricoCoefficienti {
  [squadraId: Id]: number[];
}

/**
 * Coefficiente totale: somma delle ultime 5 stagioni di punti.
 * Alla prima stagione la storia è approssimata dall'init da rating
 * (decisione utente: la griglia reale arriva dagli accessi seme).
 */
export function coefficienteTotale(storico: StoricoCoefficienti, squadraId: Id, base: number): number {
  const stagioni = storico[squadraId] ?? [];
  return Math.round((base + stagioni.reduce((a, b) => a + b, 0)) * 100) / 100;
}
