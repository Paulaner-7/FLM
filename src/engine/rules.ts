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

// ---------- Simulazione risultati CPU (PRD 3.2: rating Elo + varianza) ----------
// Calibrati sul calcio reale verificato (regola 6 AGENTS.md):
// - Media gol per partita nei top campionati europei: Serie A 2024/25 = 973 gol /
//   380 partite = 2.56 a partita (Wikipedia, stagione completa) → 1.28 per squadra.
// - Vantaggio casa storico ~0.3-0.5 gol a partita (dataset football-data.co.uk,
//   medie su decenni di campionati europei) → 0.35 netto, applicato in modo
//   SIMMETRICO (±0.175): così la media totale resta ancorata a 2.56 (un bonus
//   solo alla squadra in casa gonfiava la media a ~2.87, calibrazione corretta
//   con scripts/calibra-sim.ts contro la stagione reale 2024/25).
// - Scarto dal rating Elo: 1 punto = 1/350 di gol attesi (tarato con
//   calibra-sim.ts: spread finale ~61 punti vs 64 reali).

/** Gol attesi base per squadra in una partita (metà della media reale ~2.56) */
export const GOL_MEDIA_SQUADRA = 1.28;
/** Vantaggio casa NETTO in gol attesi (applicato ±metà in casa/trasferta) */
export const VANTAGGIO_CASA_GOL = 0.35;
/** Divisore dello scarto rating → gol attesi (Δ/350) */
export const DIVISORE_SCARTO_RATING = 350;

// ---------- Forma (momentum settimanale, PRD 3.2: cluster in classifica) ----------
// Una squadra su una striscia positiva gioca con un bonus di rating effettivo
// (e viceversa in crisi): crea i cluster tipici dei campionati reali (gruppi che
// si staccano e si ricompattano). Tarato con calibra-sim.ts: ±10 per risultato
// consecutivo, cap ±50 (~+1.5 livelli di forza al massimo).

/** Bonus di rating per vittoria/sconfitta consecutiva (0 = disattivo) */
export const BONUS_FORMA_STREAK = 10;
/** Cap del bonus forma (positivo e negativo) */
export const CAP_FORMA_STREAK = 50;

// ---------- Variabilità tra stagioni (calibra-sim.ts, ultimi 10 anni Serie A) ----------
// Due leve per riprodurre le stagioni reali (campione 82-95, gap 1ª-2ª 1-19,
// ultima 17-25):
// 1. SCARTO_STAGIONALE: ogni squadra rende ±40 di rating per stagione (seme
//    deterministico carriera+stagione+squadra) — modella il "quest'anno rendiamo
//    più/meno dell'overall" (mercato, allenatore, infortuni).
// 2. REVERSIONE_DRIFT: dentro la stagione solo metà della deriva Elo conta per
//    la simulazione (l'altra metà è rumore che rientra): evita le stagioni
//    irreali da 100+ punti del campione.

/** Scostamento stagionale massimo per squadra (0 = disattivo) */
export const SCARTO_STAGIONALE = 40;
/** Frazione della deriva Elo intra-stagione che conta per la sim (1 = tutta) */
export const REVERSIONE_DRIFT = 0.5;

// ---------- Rating iniziale dallo storico reale (src/engine/storico.ts) ----------
// La posizione finale si converte in rating: 1500 + (10.5 − pos) × PUNTI_POSIZIONE.
// Taratura: campione di A ≈ 1671, 20° di A ≈ 1330, campione di B ≈ 1411.

/** Punti Elo per posizione di classifica (18 = spread ~340 tra 1° e 20° di A) */
export const PUNTI_POSIZIONE_RATING = 18;
/** Sconto per la seconda divisione (campione di B ≈ 15° di A) */
export const OFFSET_SECONDA_DIVISIONE = 260;
/** Peso dello storico nel rating iniziale completo (1 − peso = rosa attuale) */
export const PESO_RATING_STORICO = 0.5;

// ---------- Referto (PRD 3.3) ----------

/** Minuti stagionali attribuiti a ogni titolare per partita giocata (90', recupero non contato) */
export const MINUTI_PARTITA = 90;
/** Settimane di infortunio registrato nel referto (infortunio breve, costante regolabile) */
export const SETTIMANE_INFORTUNIO = 2;
/** Bonus forma per prestazione eccezionale registrata nel referto (clamp 0-100) */
export const BONUS_FORMA_PRESTAZIONE = 10;

// ---------- Classifica (regola Serie A reale, Wikipedia "Serie A" — criteri ufficiali) ----------

export const PUNTI_VITTORIA = 3;
export const PUNTI_PAREGGIO = 1;
export const PUNTI_SCONFITTA = 0;

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
