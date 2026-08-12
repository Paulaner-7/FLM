// FLM — Regole deterministiche del gioco (PRD 3.1, 4.1, 6.1)
// Regola 3 AGENTS.md: classifica, morale, fiducia, budget e ogni numero di gioco
// sono calcolati SOLO qui, con funzioni pure. L'LLM produce solo testo e proposte.
// Costanti di bilanciamento centralizzate: si tarano qui dopo una stagione di prova (PRD 6.1).

/** Intervallo degli indicatori di stato (morale, fiducia) 0-100 */
export const MIN_STATO = 0;
export const MAX_STATO = 100;

/** Effetti risultati sul morale (PRD 6.1: intervalli suggeriti ±5) */
export const EFFETTO_VITTORIA_MORALE = 5;
export const EFFETTO_PAREGGIO_MORALE = 0;
export const EFFETTO_SCONFITTA_MORALE = -5;

/** Limiti degli effetti proposti per un evento (PRD 4.2: tra -10 e +10) */
export const EFFETTO_EVENTO_MIN = -10;
export const EFFETTO_EVENTO_MAX = 10;

/** Soglia sotto cui lo spogliatoio è in crisi (PRD 3.2, modulo morale) */
export const SOGLIA_MORALE_CRISI = 30;

/** Soglia di fiducia società sotto cui scatta il rischio esonero (PRD 3.2) */
export const SOGLIA_FIDUCIA_ESONERO = 25;

/** Limita un valore all'intervallo [min, max] */
export function clamp(valore: number, min: number = MIN_STATO, max: number = MAX_STATO): number {
  return Math.min(max, Math.max(min, valore));
}

/** Limita un valore a un passo discreto (es. morale intero 0-100) */
export function arrotonda(valore: number): number {
  return Math.round(valore);
}

/**
 * Valida e limita gli effetti PROPOSTI (dall'LLM o da tabelle di fallback) prima
 * che vengano applicati allo stato (PRD 4.1: "il game engine valida il JSON, fissa
 * gli effetti dentro i limiti ammessi (clamp), li applica allo stato").
 */
export function validaEffetti(proposti: {
  moraleGiocatori: number;
  fiduciaSocieta: number;
  fiduciaTifosi: number;
  reputazione: number;
}): {
  moraleGiocatori: number;
  fiduciaSocieta: number;
  fiduciaTifosi: number;
  reputazione: number;
} {
  return {
    moraleGiocatori: clamp(proposti.moraleGiocatori, EFFETTO_EVENTO_MIN, EFFETTO_EVENTO_MAX),
    fiduciaSocieta: clamp(proposti.fiduciaSocieta, EFFETTO_EVENTO_MIN, EFFETTO_EVENTO_MAX),
    fiduciaTifosi: clamp(proposti.fiduciaTifosi, EFFETTO_EVENTO_MIN, EFFETTO_EVENTO_MAX),
    reputazione: clamp(proposti.reputazione, EFFETTO_EVENTO_MIN, EFFETTO_EVENTO_MAX),
  };
}
