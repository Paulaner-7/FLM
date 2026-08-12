// FLM — Modello dati
// Entità corrispondenti al PRD (sezione 3.4 e 7.2): docs/PRD.md è la fonte di verità.
// Convenzioni: UI in italiano, identificatori in inglese (camelCase), nomi entità come nel PRD.

export type Id = string;

/** Forza squadra 1-5 (PRD 3.4) */
export type Forza = 1 | 2 | 3 | 4 | 5;

/** Tipo di competizione (PRD 7.1: un template parametrico, le coppe sono istanze) */
export type TipoCompetizione =
  | 'campionato'
  | 'coppa_nazionale'
  | 'supercoppa'
  | 'champions_league'
  | 'europa_league'
  | 'conference_league'
  | 'mondiale'
  | 'europeo'
  | 'qualificazioni';

/** Formato del template parametrico (PRD 7.1) */
export type FormatoCompetizione =
  | 'girone'
  | 'eliminazione_diretta'
  | 'league_phase'
  | 'gironi_tabellone'
  | 'partita_secca'
  | 'andata_ritorno';

/**
 * Tipo di assegnazione giocatore↔squadra (PRD 7.2).
 * Il prestito è previsto dal PRD ma la logica completa arriva in M4:
 * oggi il motore valida e applica solo 'proprieta'.
 */
export type TipoAssegnazione = 'proprieta' | 'prestito';

/** Esito di un movimento registrato nel TransferLedger (PRD 7.3: anche le trattative saltate) */
export type EsitoTrasferimento = 'completato' | 'saltato';

/** Categoria evento — tassonomia FC 26 (PRD 4.2) */
export type CategoriaEvento = 'giocatore' | 'societa' | 'tifosi_media';

/** Tipo evento (PRD 4.2) */
export type TipoEvento = 'scenario_emergente' | 'punto_decisionale';

/**
 * Effetti proposti (dall'LLM o da regole): sono SOLO proposte.
 * Il motore (src/engine) li valida, li limita e li applica (PRD 4.1, regola 3 AGENTS.md).
 */
export interface EffettiProposti {
  moraleGiocatori: number;
  fiduciaSocieta: number;
  fiduciaTifosi: number;
  reputazione: number;
}

export interface OpzioneEvento {
  testo: string;
  effettiProposti: EffettiProposti;
}

/** Promessa fatta a un giocatore (PRD 2.2, modulo morale) */
export interface Promessa {
  testo: string;
  /** Settimana di scadenza della promessa */
  scadenza: number;
}

/**
 * PRD 7.2 — Squadra (Team Registry).
 * La tua + avversarie della lega + squadre ombra (nome, nazione, forza per i sorteggi).
 */
export interface Squadra {
  id: Id;
  nome: string;
  /** Codice o nome nazione (PRD 7.1: le ombre hanno nome, nazione, forza) */
  nazione: string;
  forza: Forza;
  /** Coefficiente per sorteggi europei: determina fasce e teste di serie (PRD 7.1) */
  coefficiente: number;
  budget: number;
  reputazione: number;
  /** true = squadra ombra: esiste solo per la logica dei sorteggi, non giocabile in FL26 (PRD 7.1) */
  ombra: boolean;
}

/**
 * PRD 7.2 — Giocatore (Player Registry).
 * Anagrafica globale: ogni calciatore esiste una sola volta.
 * L'appartenenza a una squadra NON è qui: vive in SquadAssignment (invariante 7.2).
 */
export interface Giocatore {
  id: Id;
  /** Mapping con l'ID PES di FL26 (PRD 7.2): null finché non mappato */
  pesId: number | null;
  nome: string;
  nazionalita: string;
  eta: number;
  ruolo: string;
  /** Copiato da FL26 all'importazione, aggiornato tra stagioni (PRD 3.4) */
  overall: number;
  /** 0-100 */
  morale: number;
  /** 0-100 */
  forma: number;
  minutiStagione: number;
  promesse: Promessa[];
  leader: boolean;
  /** Flag settore giovanile / vivaio (PRD 3.4) */
  giovane: boolean;
  /** Settimana fino a cui è infortunato (opzionale) */
  infortunioFinoA?: number;
  /** Valore di mercato: calcolato dall'engine con formula deterministica (PRD 7.3) */
  valoreMercato: number;
}

/**
 * PRD 7.2 — Squad Assignment: collega giocatori e squadre con validità temporale (dal/al).
 * Garantisce l'invariante "un giocatore = un solo club proprietario" (+ eventuale prestito in M4)
 * e rende ricostruibile lo storico dei passaggi.
 */
export interface SquadAssignment {
  id: Id;
  giocatoreId: Id;
  squadraId: Id;
  tipo: TipoAssegnazione;
  /** Stagione di inizio validità, es. "2025/26" */
  dal: string;
  /** Stagione di fine validità: assente = assegnazione attiva */
  al?: string;
}

/**
 * PRD 7.1 — Competizione: template parametrico unico.
 * Campionato, coppe, competizioni UEFA e nazionali sono istanze con parametri diversi.
 */
export interface Competizione {
  id: Id;
  nome: string;
  tipo: TipoCompetizione;
  formato: FormatoCompetizione;
  /** es. "2025/26" */
  stagione: string;
  /** es. "andata", "ritorno", "gironi", "ottavi" */
  fase: string;
  /** ID delle squadre partecipanti (Opzione A: lista piatta) */
  squadre: Id[];
}

/**
 * PRD 3.4 — Partita.
 * Le tue le inserisci col referto; le altre vengono simulate dal motore (PRD 3.2).
 */
export interface Partita {
  id: Id;
  competizioneId: Id;
  /** Numero del turno: giornata per il girone, turno per le coppe */
  giornata: number;
  /** id Squadra */
  casa: Id;
  /** id Squadra */
  trasferta: Id;
  golCasa: number;
  golTrasferta: number;
  /** Nomi dei marcatori (PRD 3.4) */
  marcatori: string[];
  giocata: boolean;
  note?: string;
}

/** PRD 3.4 — StatoClub: un record solo, aggiornato a ogni turno */
export interface StatoClub {
  id: 'default';
  /** 0-100 */
  fiduciaSocieta: number;
  /** 0-100 */
  fiduciaTifosi: number;
  obiettivo: string;
  budget: number;
  reputazioneAllenatore: number;
  settimanaCorrente: number;
}

/**
 * PRD 3.4 — Evento: archivio permanente (serve anche all'anti-ripetizione dei prompt, PRD 4.3).
 */
export interface Evento {
  id: Id;
  settimana: number;
  categoria: CategoriaEvento;
  tipo: TipoEvento;
  titolo: string;
  testo: string;
  /** Nomi dei giocatori coinvolti (verificati dal motore contro la rosa, PRD 4.2) */
  giocatoriCoinvolti: string[];
  opzioni: OpzioneEvento[];
  /** Indice dell'opzione scelta dall'allenatore (vuoto finché non deciso) */
  sceltaFatta?: number;
  effettiApplicati: boolean;
}

/**
 * PRD 7.3 — TransferLedger: storico permanente dei movimenti di mercato.
 * Alimenta narrativa e anti-ripetizione; anche le trattative saltate sono registrate
 * (sono materiale narrativo a loro volta).
 */
export interface TransferLedgerEntry {
  id: Id;
  giocatoreId: Id;
  daSquadraId: Id;
  aSquadraId: Id;
  cifra: number;
  stagione: string;
  settimana: number;
  esito: EsitoTrasferimento;
  /** es. "rosa piena", "budget insufficiente" (per esito 'saltato') */
  motivo?: string;
}
