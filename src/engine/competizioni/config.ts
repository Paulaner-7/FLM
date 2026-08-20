// FLM — Configurazione parametrica delle competizioni (PRD 7.1: "un unico template,
// le coppe sono istanze con parametri diversi").
//
// La configurazione vive in CODICE (regola: il DB tiene solo istanze + risultati).
// FONTI dei formati (verifica web, agosto 2026 — docs/verifica-web.md §6, §8, §9):
// - League phase UEFA 2024+: 36 squadre, UCL/UEL 8 partite (4 casa/4 fuori),
//   UECL 6 partite (3 casa/3 fuori); top 8 → ottavi, 9-24 → playoff, 25-36 out.
// - Tabellone: QF/SF predeterminati dal bracket; niente country protection in KO.
// - Coppa nazionale: turni a eliminazione secca con entrate scaglionate
//   (pattern Coppa Italia 2025/26: top 8 agli ottavi).

import type { FormatoCompetizione, TipoCompetizione } from '../../types/entities';

/** Nome di una fase del tabellone a eliminazione. */
export type NomeFase =
  | 'preliminare'
  | 'primo_turno'
  | 'secondo_turno'
  | 'playoff_qualificazione'
  | 'league_phase'
  | 'playoff'
  | 'ottavi'
  | 'quarti'
  | 'semifinali'
  | 'finale';

export interface ConfigFase {
  nome: NomeFase;
  /** Numero di squadre che ENTRANO in questa fase (nuove entranti + vincenti fase prima) */
  squadre: number;
  /** Andata e ritorno (true) o gara secca (false) */
  andataRitorno: boolean;
  /** Campo neutro (finali) */
  neutra?: boolean;
}

export interface ConfigCompetizione {
  tipo: TipoCompetizione;
  formato: FormatoCompetizione;
  nomeDefault: string;
  /** Fasi in ordine cronologico */
  fasi: ConfigFase[];
  /** Numero di partite della league phase (solo formati league_phase) */
  partiteLeaguePhase?: number;
  /** Avversarie per fascia nel sorteggio league phase (UCL/UEL: 2; UECL: 1) */
  avversariePerFascia?: number;
  /** Numero fasce del sorteggio league phase (UCL/UEL: 4×9; UECL: 6×6) */
  numeroFasce?: number;
  /** Punti coefficiente per vittoria/pareggio in league phase (regole UEFA reali) */
  puntiVittoriaCoefficiente: number;
  puntiPareggioCoefficiente: number;
  /** Bonus coefficiente per turno di tabellone raggiunto (ottavi, QF, SF, finale) */
  bonusTurnoCoefficiente: number;
  /** Bonus league phase (UCL: 6; UEL/UECL: minimo garantito) */
  bonusLeaguePhase?: number;
  /** Peso relativo per il coefficiente (già implicito nei punti reali) */
  peso?: number;
}

/**
 * Campionato: girone all'italiana andata/ritorno (metodo del cerchio,
 * src/engine/calendario.ts). Non alimenta il coefficiente UEFA.
 */
export const CONFIG_CAMPIONATO: ConfigCompetizione = {
  tipo: 'campionato',
  formato: 'girone',
  nomeDefault: 'Campionato',
  fasi: [{ nome: 'primo_turno', squadre: 0, andataRitorno: true }], // girone, non eliminazione
  puntiVittoriaCoefficiente: 0,
  puntiPareggioCoefficiente: 0,
  bonusTurnoCoefficiente: 0,
};

/**
 * Coppa nazionale (formato uniforme, decisione utente): top 8 agli ottavi
 * (teste di serie per piazzamento reale dell'anno prima), gli altri partono
 * dai turni preliminari che riducono a 8; tutto secco, finale in campo neutro.
 * Non alimenta il coefficiente UEFA.
 */
export const CONFIG_COPPA_NAZIONALE: ConfigCompetizione = {
  tipo: 'coppa_nazionale',
  formato: 'eliminazione_diretta',
  nomeDefault: 'Coppa nazionale',
  fasi: [
    { nome: 'preliminare', squadre: 8, andataRitorno: false },
    { nome: 'primo_turno', squadre: 32, andataRitorno: false },
    { nome: 'secondo_turno', squadre: 16, andataRitorno: false },
    { nome: 'ottavi', squadre: 16, andataRitorno: false },
    { nome: 'quarti', squadre: 8, andataRitorno: false },
    { nome: 'semifinali', squadre: 4, andataRitorno: false },
    { nome: 'finale', squadre: 2, andataRitorno: false, neutra: true },
  ],
  puntiVittoriaCoefficiente: 0,
  puntiPareggioCoefficiente: 0,
  bonusTurnoCoefficiente: 0,
};

/** Supercoppa: partita secca in campo neutro. */
export const CONFIG_SUPERCOPPA: ConfigCompetizione = {
  tipo: 'supercoppa',
  formato: 'partita_secca',
  nomeDefault: 'Supercoppa',
  fasi: [{ nome: 'finale', squadre: 2, andataRitorno: false, neutra: true }],
  puntiVittoriaCoefficiente: 0,
  puntiPareggioCoefficiente: 0,
  bonusTurnoCoefficiente: 0,
};

/**
 * Champions League 2026/27: 36 squadre, 8 partite league phase (4+4),
 * 4 fasce da 9, 2 avversarie per fascia, top 8 / playoff 9-24 / out 25-36.
 * Punti coefficiente reali UEFA (verifica-web.md §11).
 */
export const CONFIG_CHAMPIONS: ConfigCompetizione = {
  tipo: 'champions_league',
  formato: 'league_phase',
  nomeDefault: 'Champions League',
  fasi: [
    { nome: 'playoff_qualificazione', squadre: 14, andataRitorno: true }, // 7 sfide: 5 CH + 2 LP
    { nome: 'league_phase', squadre: 36, andataRitorno: false },
    { nome: 'playoff', squadre: 16, andataRitorno: true },
    { nome: 'ottavi', squadre: 16, andataRitorno: true },
    { nome: 'quarti', squadre: 8, andataRitorno: true },
    { nome: 'semifinali', squadre: 4, andataRitorno: true },
    { nome: 'finale', squadre: 2, andataRitorno: false, neutra: true },
  ],
  partiteLeaguePhase: 8,
  avversariePerFascia: 2,
  numeroFasce: 4,
  puntiVittoriaCoefficiente: 2,
  puntiPareggioCoefficiente: 1,
  bonusTurnoCoefficiente: 1.5,
  bonusLeaguePhase: 6,
};

/** Europa League: identica alla UCL (8 partite), bonus minori (reali). */
export const CONFIG_EUROPA: ConfigCompetizione = {
  tipo: 'europa_league',
  formato: 'league_phase',
  nomeDefault: 'Europa League',
  fasi: CONFIG_CHAMPIONS.fasi,
  partiteLeaguePhase: 8,
  avversariePerFascia: 2,
  numeroFasce: 4,
  puntiVittoriaCoefficiente: 2,
  puntiPareggioCoefficiente: 1,
  bonusTurnoCoefficiente: 1,
  bonusLeaguePhase: 3,
};

/** Conference League: 6 partite, 6 fasce da 6, 1 avversaria per fascia. */
export const CONFIG_CONFERENCE: ConfigCompetizione = {
  tipo: 'conference_league',
  formato: 'league_phase',
  nomeDefault: 'Conference League',
  fasi: CONFIG_CHAMPIONS.fasi,
  partiteLeaguePhase: 6,
  avversariePerFascia: 1,
  numeroFasce: 6,
  puntiVittoriaCoefficiente: 2,
  puntiPareggioCoefficiente: 1,
  bonusTurnoCoefficiente: 0.5,
  bonusLeaguePhase: 2.5,
};

export const CONFIG_PER_TIPO: Record<TipoCompetizione, ConfigCompetizione> = {
  campionato: CONFIG_CAMPIONATO,
  coppa_nazionale: CONFIG_COPPA_NAZIONALE,
  supercoppa: CONFIG_SUPERCOPPA,
  champions_league: CONFIG_CHAMPIONS,
  europa_league: CONFIG_EUROPA,
  conference_league: CONFIG_CONFERENCE,
  mondiale: CONFIG_CAMPIONATO, // fuori scope (M5): placeholder
  europeo: CONFIG_CAMPIONATO, // fuori scope (M5): placeholder
  qualificazioni: CONFIG_SUPERCOPPA, // fuori scope: placeholder
};

/** Etichetta leggibile di una fase per la UI italiana. */
export function nomeFaseLeggibile(fase: NomeFase): string {
  const mappa: Record<NomeFase, string> = {
    preliminare: 'Turno preliminare',
    primo_turno: 'Primo turno',
    secondo_turno: 'Secondo turno',
    playoff_qualificazione: 'Playoff di qualificazione',
    league_phase: 'League phase',
    playoff: 'Playoff',
    ottavi: 'Ottavi di finale',
    quarti: 'Quarti di finale',
    semifinali: 'Semifinali',
    finale: 'Finale',
  };
  return mappa[fase];
}
