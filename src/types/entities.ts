// FLM — Modello dati
// Entità corrispondenti al PRD (sezione 3.4 e 7.2): docs/PRD.md è la fonte di verità.
// Convenzioni: UI in italiano, identificatori in inglese (camelCase), nomi entità come nel PRD.

export type Id = string;

/** Forza squadra 1-5 (PRD 3.4) */
export type Forza = 1 | 2 | 3 | 4 | 5;

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

/** PRD 3.4 — Squadra (la tua + avversarie; per le avversarie serve solo nome e forza) */
export interface Squadra {
  id: Id;
  nome: string;
  forza: Forza;
}

/**
 * PRD 3.4 — Giocatore.
 * `squadraId` implementa il Squad Assignment di 7.2: un giocatore, un club (invariante di integrità).
 * La rosa di una squadra si deriva da qui, non da un array dentro Squadra.
 */
export interface Giocatore {
  id: Id;
  squadraId: Id;
  nome: string;
  ruolo: string;
  eta: number;
  /** Copiato da FL26 all'importazione, aggiornato tra stagioni (PRD 3.4) */
  overall: number;
  /** 0-100 */
  morale: number;
  /** 0-100 */
  forma: number;
  minutiStagione: number;
  promesse: Promessa[];
  leader: boolean;
  /** Settimana fino a cui è infortunato (opzionale) */
  infortunioFinoA?: number;
  /** Flag settore giovanile / vivaio (PRD 3.4) */
  giovane?: boolean;
}

/**
 * PRD 3.4 — Partita.
 * Le tue le inserisci col referto; le altre vengono simulate dal motore (PRD 3.2).
 */
export interface Partita {
  id: Id;
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
