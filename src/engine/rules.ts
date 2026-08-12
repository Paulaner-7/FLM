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

// ---------- Stato iniziale di una nuova carriera (flusso "Nuova Carriera") ----------
// Fissati con l'utente: fiducia società 70, budget dalla reputazione squadra.

/** Fiducia società iniziale alla creazione della carriera */
export const FIDUCIA_SOCIETA_INIZIALE = 70;
/** Fiducia tifosi iniziale (tiepidi ma non ostili) */
export const FIDUCIA_TIFOSI_INIZIALE = 65;
/** Reputazione allenatore iniziale (mezza classifica, cresce coi risultati) */
export const REPUTAZIONE_ALLENATORE_INIZIALE = 50;
/** Prima settimana di gioco */
export const SETTIMANA_INIZIALE = 1;

// ---------- Budget iniziale: budget = round(rep³ / 6000) × fattore lega ----------
// Calibrato sui budget reali delle principali squadre europee (finestra 2025/26):
// City ~250M, PSG ~180M, Arsenal ~160M, Bayern ~150M, Real ~130M, Inter ~100M,
// Juve/Milan ~80-90M, Atletico/Dortmund/OM ~90M, medio PL ~40-60M,
// piccolo Serie A ~10-20M, top Serie B ~5-10M, Championship medio ~10-20M.
// Costanti centralizzate: si tarano dopo una stagione di prova (PRD 6.1).

export const BUDGET_BASE_DIVISORE = 6000;
export const BUDGET_MIN = 1_000_000;
export const BUDGET_MAX = 300_000_000;

/**
 * Fattore ricchezza per campionato (a parità di reputazione la Premier paga
 * più della Liga). Match sul nome del campionato (colonna CSV `League` o
 * dataset curato src/data/leagues.ts): primo pattern che matcha vince.
 */
export const FATTORI_BUDGET_LEGA: ReadonlyArray<{ pattern: RegExp; fattore: number }> = [
  { pattern: /premier\s*league/i, fattore: 1.6 },
  { pattern: /ligue\s*1/i, fattore: 1.3 },
  { pattern: /serie\s*a/i, fattore: 1.1 },
  { pattern: /liga/i, fattore: 1.1 },
  { pattern: /bundesliga/i, fattore: 1.1 },
  { pattern: /championship|serie\s*b|2\.?\s*bundesliga|ligue\s*2|segunda/i, fattore: 0.35 },
  { pattern: /first\s*league|1\.\s*lig|eerste|liga\s*portugal\s*2|challenger|challenge\s*league/i, fattore: 0.35 },
];

/** Fattore default per campionati non riconosciuti (es. lega demo) */
export const FATTORE_BUDGET_DEFAULT = 1.0;

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
