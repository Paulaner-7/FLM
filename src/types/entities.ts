// FLM — Modello dati
// Entità corrispondenti al PRD (sezione 3.4 e 7.2): docs/PRD.md è la fonte di verità.
// Convenzioni: UI in italiano, identificatori in inglese (camelCase), nomi entità come nel PRD.

export type Id = string;

/**
 * Obiettivo stagionale scelto a inizio carriera (PRD 3.2: "Obiettivo stagionale
 * (scelto a inizio)"). Solo memorizzato alla creazione: gli effetti arrivano
 * col motore fiducia di M2 (attese del presidente vs posizione in classifica).
 */
export type ObiettivoStagionale = 'salvezza' | 'meta_classifica' | 'coppe' | 'titolo';

/**
 * PRD — Carriera ("una carriera = un salvataggio").
 * Ogni carriera è uno snapshot completo e indipendente: squadre/giocatori/
 * assegnazioni clonati dal registro al momento della creazione (carrieraId),
 * più StatoClub, Competizione, calendario, eventi e ledger dedicati.
 */
export interface Carriera {
  id: Id;
  /** Nome auto-generato, es. "Inter · 2025/26" */
  nome: string;
  /** id della squadra dell'utente, clonata con carrieraId = carriera.id */
  squadraId: Id;
  campionato: string;
  obiettivo: ObiettivoStagionale;
  stagione: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Rating Elo squadra (continuo, base 1500; sostituisce la forza 1-5 — PRD 3.2).
 * Deriva dalla media overall all'importazione e VIVE nel tempo: i risultati
 * (tuoi e CPU) lo muovono a ogni turno (src/engine/rating.ts, formula eloratings).
 */
export type Rating = number;

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

/** Tipo di promessa (PRD 2.2, modulo morale): valutazione automatica a scadenza. */
export type TipoPromessa = 'titolare' | 'minuti' | 'coppa';

/** Esito della valutazione a scadenza (binario: soglia è soglia). */
export type StatoPromessa = 'attiva' | 'mantenuta' | 'tradita';

/** Promessa fatta a un giocatore (PRD 2.2, modulo morale). */
export interface Promessa {
  id: Id;
  tipo: TipoPromessa;
  /** Etichetta leggibile, es. "Sarai titolare" */
  testo: string;
  /** Settimana di creazione */
  creata: number;
  /** Settimana di scadenza: valutazione al referto che la supera (quella conta) */
  scadenza: number;
  /** Soglia misurabile: % presenze da titolare (titolare) o minuti totali (minuti) */
  soglia: number;
  stato: StatoPromessa;
}

/**
 * PRD 7.2 — Squadra (Team Registry).
 * La tua + avversarie della lega + squadre ombra (nome, nazione, rating per i sorteggi).
 */
export interface Squadra {
  id: Id;
  /**
   * Se presente, la squadra è una copia di carriera (snapshot del campionato
   * scelto alla creazione). undefined = template nel registro globale.
   */
  carrieraId?: string;
  /** Nome del campionato di appartenenza (colonna CSV `League` o dataset curato). */
  campionato?: string;
  /**
   * Media overall della rosa al bootstrap: base per la forza reale e per il
   * budget di carriera (piazzamento stimato nell'anno precedente, PRD).
   */
  mediaOverall?: number;
  /** Mapping con l'ID PES della squadra nell'export editor. */
  pesId: number | null;
  nome: string;
  /** Codice o nome nazione (PRD 7.1: le ombre hanno nome, nazione, forza) */
  nazione: string;
  /** true per nazionali FL26; le assegnazioni nazionali restano fuori dal bootstrap club. */
  nazionale: boolean;
  /** Rating Elo continuo (base 1500): guida la simulazione CPU e i sorteggi (PRD 3.2) */
  rating: Rating;
  /**
   * Rating a inizio stagione (base per la mean reversion intra-stagione,
   * engine/referto.ts ratingEffettivo): si aggiorna a ogni nuova stagione.
   */
  ratingInizioStagione?: number;
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
  /** Copia di carriera (vedi Squadra.carrieraId): undefined = registro globale */
  carrieraId?: string;
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
  /** 0-100 — credito verso l'allenatore: scala lenta, mossa SOLO dalle promesse (PRD 2.2) */
  fiducia: number;
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
  /** Copia di carriera (vedi Squadra.carrieraId): undefined = registro globale */
  carrieraId?: string;
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
  carrieraId: string;
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
 * I campi strutturati (titolari, infortunati, …) servono al rollback del referto
 * entro lo stesso turno e allo storico; `note` è il testo leggibile composto dal motore.
 */
export interface Partita {
  id: Id;
  carrieraId: string;
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
  /** Testo leggibile delle note del referto (espulsioni, infortuni, prestazioni) */
  note?: string;
  /** ID dei titolari schierati (referto utente): base per minuti e rollback */
  titolari?: Id[];
  /** ID dei giocatori con prestazione eccezionale (referto utente) */
  prestazioniEccezionali?: Id[];
  /** ID dei giocatori infortunatisi in partita (referto utente) */
  infortunati?: Id[];
  /** ID dei giocatori espulsi (referto utente) */
  espulsi?: Id[];
  /** Rating Elo delle due squadre PRIMA della partita: serve al rollback del referto */
  ratingPrima?: { casa: number; trasferta: number };
  /**
   * Snapshot morale/fiducia/promesse dei giocatori toccati PRIMA della conferma
   * + eventi creati/risolti dal referto: rollback secco in annullaReferto
   * (l'inversione a ritroso sarebbe fragile: la valutazione promesse cambia stato).
   */
  statoPrima?: {
    giocatori: Record<Id, { morale: number; fiducia: number; promesse: Promessa[] }>;
    eventiCreati: Id[];
    eventiRisolti: Id[];
  };
}

/**
 * PRD 3.4 — StatoClub: un record per carriera, aggiornato a ogni turno.
 * id = carrieraId ("una carriera = un salvataggio": ogni carriera ha il suo).
 */
export interface StatoClub {
  id: Id;
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
  carrieraId: string;
  settimana: number;
  categoria: CategoriaEvento;
  tipo: TipoEvento;
  titolo: string;
  testo: string;
  /** Nomi dei giocatori coinvolti (verificati dal motore contro la rosa, PRD 4.2) */
  giocatoriCoinvolti: string[];
  opzioni: OpzioneEvento[];
  /** Richiesta promessa strutturata (PRD 2.2): l'engine propone, l'utente accetta o rifiuta */
  promessaProposta?: {
    giocatoreId: Id;
    tipo: TipoPromessa;
    /** Soglia: % presenze (titolare) o minuti (minuti) */
    soglia: number;
    /** Durata in turni: scadenza = settimana della richiesta + durata */
    durataTurni: number;
  };
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
  /** Carriera di appartenenza: undefined = movimento fuori carriera (es. test su template) */
  carrieraId?: string;
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
