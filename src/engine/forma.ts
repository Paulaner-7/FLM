// FLM — Forma UNIFICATA (morale + fiducia + prestazione → forma → overall).
// Regola 3 AGENTS.md: funzioni PURE, nessun DB, nessun Math.random.
// Bilanciamento: prestazione 50% + morale 30% + fiducia 20% = composite;
// inerzia 68% = forma non salta mai >±9 a partita, servono 3-4 gare per
// scalare da 50 a 75 (realismo FM / dati Serie A 2024/25).
// Voto 6.5 = 50 neutro; gol/assist/cartellini modulano prestazione.
// Overall effettivo = overall base + (forma-50)/12 clamp ±4: stella in forma
// 84→88, flop 78→74, mai rotto (max ±4, media squadra resta stabile).

import type { Giocatore } from '../types/entities';
import {
  clamp,
  FORMA_ASSIST_BONUS,
  FORMA_ASSIST_CAP,
  FORMA_CLEAN_SHEET_BONUS,
  FORMA_DECAY_INFORTUNIO,
  FORMA_GIALLO_MALUS,
  FORMA_GOL_BONUS,
  FORMA_GOL_CAP,
  FORMA_INERZIA,
  FORMA_OVERALL_DIVISORE,
  FORMA_OVERALL_MAX,
  FORMA_OVERALL_MIN,
  FORMA_PANCHINA_SCORE,
  FORMA_PESO_FIDUCIA,
  FORMA_PESO_MORALE,
  FORMA_PESO_NUOVO,
  FORMA_PESO_PRESTAZIONE,
  FORMA_ROSSO_MALUS,
  FORMA_VOTO_SLOPE,
  VOTO_NEUTRO,
} from './rules';
import { clampSkill } from './attributi';

// ---------- Prestazione: voto + gol/assist/cartellini ----------

/** Voto PES (5.0-10.0) → score prestazione 0-100. Non finito = 50 neutro. */
export function votoToPrestazioneScore(voto: number | undefined): number {
  if (voto === undefined || !Number.isFinite(voto)) return 50;
  return clamp(Math.round(50 + (voto - VOTO_NEUTRO) * FORMA_VOTO_SLOPE), 0, 100);
}

export interface InputPrestazioneScore {
  voto?: number;
  gol: number;
  assist: number;
  giallo: boolean;
  rosso: boolean;
  titolare: boolean;
  /** Porta inviolata della squadra (solo portiere/difensore titolare) */
  portaInviolata?: boolean;
  ruolo?: string;
}

/**
 * Score prestazione 0-100 per la partita.
 * - voto presente: base dal voto + bonus ridotti (gol in voto già contato)
 * - voto assente + titolare: base 50 + bonus pieni
 * - panchinaro: 35 fisso (ritmo perso), ancora modulato da eventuale gol da sub
 */
export function prestazioneScore(input: InputPrestazioneScore): number {
  const { voto, gol, assist, giallo, rosso, titolare, portaInviolata, ruolo } = input;

  let base: number;
  let bonusGol: number;
  let bonusAssist: number;

  if (!titolare) {
    base = FORMA_PANCHINA_SCORE;
    // Subentrato che segna comunque incide (bonus pieni se entra e segna)
    bonusGol = Math.min(FORMA_GOL_CAP, Math.max(0, gol) * FORMA_GOL_BONUS);
    bonusAssist = Math.min(FORMA_ASSIST_CAP, Math.max(0, assist) * FORMA_ASSIST_BONUS);
  } else if (voto !== undefined) {
    base = votoToPrestazioneScore(voto);
    // Voto già include gol/assist: bonus dimezzato per non raddoppiare
    bonusGol = Math.min(8, Math.max(0, gol) * 3);
    bonusAssist = Math.min(6, Math.max(0, assist) * 2);
  } else {
    base = 50;
    bonusGol = Math.min(FORMA_GOL_CAP, Math.max(0, gol) * FORMA_GOL_BONUS);
    bonusAssist = Math.min(FORMA_ASSIST_CAP, Math.max(0, assist) * FORMA_ASSIST_BONUS);
  }

  let score = base + bonusGol + bonusAssist;

  // Cartellini: rosso domina (giallo già incluso se rosso)
  if (rosso) score -= FORMA_ROSSO_MALUS;
  else if (giallo) score -= FORMA_GIALLO_MALUS;

  // Clean sheet bonus solo per difensori/portieri titolari
  if (titolare && portaInviolata && (ruolo === 'portiere' || ruolo === 'difensore')) {
    score += FORMA_CLEAN_SHEET_BONUS;
  }

  return clamp(Math.round(score), 0, 100);
}

// ---------- Forma unificata ----------

export interface InputNuovaForma {
  formaPrecedente: number;
  morale: number;
  fiducia: number;
  prestazioneScore: number;
  infortunato: boolean;
}

/**
 * Nuova forma unificata 0-100.
 * Infortunato: decade -1 a settimana (forma fisica persa).
 * Altrimenti: composite = morale*0.3 + fiducia*0.2 + prestazione*0.5
 * → EMA: forma*0.68 + composite*0.32
 */
export function calcolaNuovaForma(input: InputNuovaForma): number {
  if (input.infortunato) {
    return clamp(input.formaPrecedente - FORMA_DECAY_INFORTUNIO);
  }
  const composite =
    input.morale * FORMA_PESO_MORALE +
    input.fiducia * FORMA_PESO_FIDUCIA +
    input.prestazioneScore * FORMA_PESO_PRESTAZIONE;
  const nuova = input.formaPrecedente * FORMA_INERZIA + composite * FORMA_PESO_NUOVO;
  return clamp(Math.round(nuova));
}

// ---------- Overall / stats effettive ----------

/** Delta overall da forma: (forma-50)/12 clamp ±4. */
export function deltaOverallDaForma(forma: number): number {
  const raw = Math.round((forma - 50) / FORMA_OVERALL_DIVISORE);
  return Math.max(FORMA_OVERALL_MIN, Math.min(FORMA_OVERALL_MAX, raw));
}

/** Overall effettivo (base + forma). Mai sotto 40 né sopra 99. */
export function overallEffettivo(g: Giocatore): number {
  return clampSkill(g.overall + deltaOverallDaForma(g.forma));
}

/** Label forma per UI (4 fasce). */
export function etichettaForma(forma: number): string {
  if (forma >= 75) return 'In forma';
  if (forma >= 60) return 'Buona';
  if (forma >= 40) return 'Normale';
  if (forma >= 25) return 'Appannato';
  return 'In crisi';
}

/** Colore barra forma per UI. */
export function coloreForma(forma: number): string {
  if (forma >= 75) return 'var(--mint)';
  if (forma >= 40) return 'var(--paper)';
  return 'var(--accent-strong)';
}
