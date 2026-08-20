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
  /** true se la carriera è conclusa (game over dopo rifiuto totale offerte) */
  conclusa?: boolean;
  /** Storico panchine: ogni transizione club/nazionale durante la carriera */
  storicoPanchine: VocePanchina[];
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
  /** Δ fiducia dei giocatori citati (PRD 7.4: "come rispondo agli eventi") */
  fiduciaGiocatori: number;
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
  /**
   * Colori sociali dal CSV editor (colonne TeamColor1/2 RGB, scala PES 0-63
   * convertita in hex al bootstrap). undefined = non disponibile: l'UI usa
   * l'accento di default. Guida l'accento dinamico della carriera e lo stemma
   * fallback generato (src/media).
   */
  colori?: { primario: string; secondario: string };
}

/**
 * Attributi completi PES (PRD 7.5, vivaio): le 151 colonne del CSV editor.
 * Nomi = colonne esatte dell'export reale (docs/Players - PES 2021 - Edit.csv):
 * il writer CSV è un mapping 1:1, l'ordine non conta per l'editor (header sì).
 * Convenzioni verificate sul CSV reale: proficiency posizioni 0-2 (0=nessuna,
 * 2=registrato), POS: 0=GK,1=CB,2=LB,3=RB,4=DMF,5=CMF,6=LMF,7=RMF,8=AMF,
 * 9=LWF,10=RWF,11=SS,12=CF; Foot true = sinistro; skill 40-99; Value2 sempre 0.
 */
export interface AttributiPes {
  JapName: string;
  Shirt: string;
  ShirtNational: string;
  /** ID commento PES (stesso Id per i creati FLM) */
  Commentary: number;
  /** Seconda nazionalità (0 = nessuna) */
  Country2: number;
  Height: number;
  Weight: number;
  /** true = piede sinistro (verificato: Nakamura True, Hong Myung-Bo False) */
  Foot: boolean;
  PlayingStyle: number;
  POS: number;
  GK: number;
  CB: number;
  LB: number;
  RB: number;
  DMF: number;
  CMF: number;
  LMF: number;
  RMF: number;
  AMF: number;
  LWF: number;
  RWF: number;
  SS: number;
  CF: number;
  OffensiveAwareness: number;
  BallControl: number;
  Dribbling: number;
  TightPossession: number;
  LowPass: number;
  LoftedPass: number;
  Finishing: number;
  Heading: number;
  PlaceKicking: number;
  Curl: number;
  Speed: number;
  Acceleration: number;
  KickingPower: number;
  Jump: number;
  PhysicalContact: number;
  Balance: number;
  Stamina: number;
  DefensiveAwareness: number;
  BallWinning: number;
  Aggression: number;
  GKAwareness: number;
  GKCatching: number;
  GKClearing: number;
  GKReflexes: number;
  GKReach: number;
  /** 1-4 (verificato sul CSV reale) */
  WeakFootUsage: number;
  WeakFootAcc: number;
  /** 1-8 */
  Form: number;
  /** 1-3 */
  InjuryResistance: number;
  /** 1-8 */
  Reputation: number;
  /** 0 (sempre 0 nel CSV reale) */
  PlayingAttitude: number;
  Trickster: boolean;
  MazingRun: boolean;
  SpeedingBullet: boolean;
  IncisiveRun: boolean;
  LongBallExpert: boolean;
  EarlyCross: boolean;
  LongRanger: boolean;
  ScissorsFeint: boolean;
  DoubleTouch: boolean;
  FlipFlap: boolean;
  MarseilleTurn: boolean;
  Sombrero: boolean;
  CrossOverTurn: boolean;
  CutBehindAndTurn: boolean;
  ScotchMove: boolean;
  StepOnSkillcontrol: boolean;
  HeadingSpecial: boolean;
  LongRangeDrive: boolean;
  Chipshotcontrol: boolean;
  LongRangeShot: boolean;
  KnuckleShot: boolean;
  DippingShots: boolean;
  RisingShots: boolean;
  AcrobaticFinishing: boolean;
  HeelTrick: boolean;
  FirstTimeShot: boolean;
  OneTouchPass: boolean;
  ThroughPassing: boolean;
  WeightedPass: boolean;
  PinpointCrossing: boolean;
  OutsideCurler: boolean;
  Rabona: boolean;
  NoLookPass: boolean;
  LowLoftedPass: boolean;
  GKLowPunt: boolean;
  GKHighPunt: boolean;
  LongThrow: boolean;
  GKLongThrow: boolean;
  PenaltySpecialist: boolean;
  GKPenaltySaver: boolean;
  Gamesmanship: boolean;
  ManMarking: boolean;
  TrackBack: boolean;
  Interception: boolean;
  AcrobaticClear: boolean;
  Captaincy: boolean;
  SuperSub: boolean;
  FightingSpirit: boolean;
  Celebration1: number;
  Celebration2: number;
  /** 1-5 */
  DribblingHunching: number;
  /** 1-10 */
  DribblingArmMove: number;
  /** 1-6 */
  RunningHunching: number;
  /** 1-10 */
  RunningArmMovement: number;
  /** 1-10 */
  CornerKicks: number;
  /** 1-20 */
  FreeKicks: number;
  /** 1-7 */
  PenaltyKick: number;
  /** 0 (sempre 0 nel CSV reale) */
  DribbleMotion: number;
  YouthClub: number;
  OwnerClub: number;
  /** "dd/MM/yyyy HH:mm:ss"; 01/01/0001 = vuoto (default CSV reale) */
  ContractUntil: string;
  LoanUntil: string;
  MarketValue: number;
  NationalCaps: number;
  Legend: boolean;
  Hand: number;
  WinnerGoldenBall: boolean;
  EditName: boolean;
  EditBasics: boolean;
  EditPosition: boolean;
  EditPositions: boolean;
  EditAbilities: boolean;
  EditPlayerSkills: boolean;
  EditPlayingStyle: boolean;
  EditCOMPlayingStyles: boolean;
  EditMovements: boolean;
  Edit1: boolean;
  Edit2: boolean;
  Edit3: boolean;
  Edit4: boolean;
  Edit5: boolean;
  Edit6: boolean;
  Edit7: boolean;
  Value1: number;
  /** Deve essere FALSE/0 all'import (changelog v0.12 editor) */
  Value2: number;
  Value3: number;
  Value2020_1: number;
  Value2020_2: number;
  Appearance: number;
  ListBoots: number;
  ListGloves: number;
  InEditFile: boolean;
  /** Overall calcolato dall'editor con formula propria: FLM ci scrive il suo (tolleranza ±1-2) */
  OverallStats: number;
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
  /** 0-100 — credito verso l'allenatore: mossa da promesse, minuti giocati (referto) e risposte agli eventi (PRD 7.4) */
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
  /**
   * Valore di mercato (PRD 7.3): calcolato dall'engine con formula
   * deterministica (engine/mercato.ts). NON è più la fonte: il valore
   * si ricalcola on-the-fly; il campo resta per compatibilità e dati
   * importati dal CSV (bootstrap).
   */
  valoreMercato: number;
  /** Stagione di scadenza del contratto, es. "2028/29" (PRD 7.3, decisione utente M4) */
  scadenzaContratto: string;
  /** Ingaggio annuo in €, ancorato al valore (~5%) — PRD 7.3: l'ingaggio non si negozia */
  ingaggioAnnuo: number;
  // ---------- Vivaio (PRD 7.5, decisioni utente) ----------
  /** Attributi completi PES (151 colonne): presenti dopo il backfill/creazione FLM */
  attributi?: AttributiPes;
  /** Potenziale NASCOSTO (68-92): mai mostrato in UI, solo indizi via scout */
  potenziale?: number;
  /** Soffitto reale di crescita (nascosto, ≤ potenziale): non tutti arrivano al pieno potenziale */
  soffittoReale?: number;
  /** true = creato da FLM (intake/rigenerato): FLM ne gestisce attributi e crescita */
  creatoDaFlm?: boolean;
  /** Stagione di creazione, es. "2026/27" */
  stagioneCreazione?: string;
  /** Stagione del ritiro (es. "2026/27"): il giocatore resta nel DB, FLM smette di gestirlo */
  ritiratoIn?: string;
  /** Voti PES degli ultimi ≤5 turni: finestra per la verifica forma (PRD 7.5, decisione utente) */
  votiFinestra?: number[];
  /** Settimana dell'ultima verifica forma (ogni 5 partite) */
  ultimaVerificaFormaSettimana?: number;
  /** Minuti SIMULATI in prestito nella stagione corrente (engine, PRD 7.5) */
  minutiPrestitoStagione?: number;
  /** Media forma della stagione appena conclusa (input crescita, decisione utente) */
  formaMediaStagione?: number;
  /** Mini-storia del vivaio (LLM, PRD 7.5) */
  miniStoria?: string;
  /** Parere dello scout (LLM, PRD 7.5): indizi sul potenziale, mai il numero */
  parereScout?: string;
  /** Se rigenerato: nome del giocatore ritirato da cui rinasce (PRD 7.5) */
  rigeneratoDi?: string;
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
  /** Numero di maglia (backfill dal Roster CSV dell'editor, PRD 7.5 export) */
  numeroMaglia?: number;
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
  /** es. "2026/27" */
  stagione: string;
  /** es. "andata", "ritorno", "league_phase", "ottavi", "conclusa" */
  fase: string;
  /** ID delle squadre partecipanti (pool della competizione) */
  squadre: Id[];
  /** Vincitore registrato a fine stagione (PRD 7.1) */
  vincitoreId?: Id;
  /** Snapshot delle fasce del sorteggio league phase (report) */
  fasce?: Id[][];
  /** Classifica finale league phase (per il bracket a posizioni, regola reale) */
  classifica?: Array<{ squadraId: Id; posizione: number }>;
}

/**
 * PRD 3.4 — Partita (estesa per il motore competizioni PRD 7.1).
 * Le tue le inserisci col referto; le altre vengono simulate dal motore (PRD 3.2).
 * Referto IMMUTABILE dopo l'invio (decisione utente): niente rollback.
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
  /** ID dei titolari schierati (referto utente): base per minuti */
  titolari?: Id[];
  /** ID dei giocatori con prestazione eccezionale (referto utente) */
  prestazioniEccezionali?: Id[];
  /** ID dei giocatori infortunatisi in partita (referto utente) */
  infortunati?: Id[];
  /** ID dei giocatori espulsi (referto utente) */
  espulsi?: Id[];
  /**
   * Voto PES (1.0-10.0, passo 0.5) per giocatore, letto dallo screenshot FL26.
   * Base dei delta forma alla conferma.
   */
  prestazioni?: Record<Id, { voto: number }>;
  /** Marcatori con minuti (schermata risultato FL26): SOLO narrativa nelle note */
  marcatoriConMinuti?: Array<{ id: Id; minuti: number[] }>;
  // --- Motore competizioni (PRD 7.1): tempo e struttura ---
  /** Settimana di stagione (unità atomica del tempo) */
  settimana: number;
  /** Slot della settimana */
  slot: 'weekend' | 'infrasettimanale';
  /** Fase/turno: 'andata' | 'ritorno' | 'league_phase' | 'playoff_qualificazione' | 'ottavi' | ... */
  fase: string;
  /** Gamba dell'andata/ritorno (solo turni a doppia sfida) */
  gamba?: 1 | 2;
  /** Esito rigori (solo eliminazione diretta) */
  rigori?: { casa: number; trasferta: number };
  /** Supplementari giocati */
  supplementari?: boolean;
  /** Partita in campo neutro (finali) */
  neutra: boolean;
  /** Autogol avversari (referto utente): marcatori + autogol = gol miei */
  autogolAvversari?: number;
}

/**
 * PRD 7.1 esteso (decisione utente) — PrestazionePartita: una riga per
 * giocatore per partita (eventi CPU e dati referto). Passive ora, attive
 * sugli overall in milestone futura.
 */
export interface PrestazionePartita {
  id: Id;
  carrieraId: string;
  partitaId: Id;
  competizioneId: Id;
  squadraId: Id;
  giocatoreId: Id;
  gol: number;
  assist: number;
  giallo: boolean;
  rosso: boolean;
  /** Voto 1.0-10.0 (passo 0.5) */
  voto: number;
  portaInviolata: boolean;
  /** 0-120 */
  minuti: number;
  titolare: boolean;
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
  /**
   * Giorno corrente della finestra di mercato (1-30).
   * 0 = nessuna finestra attiva (calendario partite normale).
   * La finestra CONGELA il calendario: avanza solo con "Avanza giorno" (M4).
   */
  giornoMercato: number;
  // ---------- Vivaio (PRD 7.5) ----------
  /** Stato dell'intake annuale: 'in_attesa' (LLM offline) o 'generato' */
  intakeStato?: 'in_attesa' | 'generato';
  /** Stagione a cui si riferisce l'intake corrente */
  intakeStagione?: string;
  /** Motivo dell'attesa (per l'avviso UI) */
  intakeMotivo?: string;
  // ---------- Carriera lunga (PRD 7.7) ----------
  /** Squadra/NT gestita come CT (se applicabile) */
  nazionaleId?: Id;
  /** true quando fine stagione è in corso (riprendibile dopo reload) */
  fineStagioneAperta?: boolean;
  /** Esito della risoluzione fine stagione */
  esitoFineStagione?: 'confermato' | 'esonerato' | 'game_over';
}

/**
 * PRD 7.8 — Impostazioni globali dell'app (config LLM, record unico id 'llm').
 * Globali, non per-carriera: la chiave API è una credenziale dell'utente.
 * Record assente = LLM disattivo → il motore usa il fallback offline (PRD 4.6).
 * La chiave resta in chiaro in IndexedDB (serve in chiaro a fetch; IndexedDB
 * è locale, non esce mai dal browser) ed è mascherata in UI, mai nei log.
 */
export interface ImpostazioniRecord {
  id: Id;
  /** Endpoint OpenAI-compatibile, es. https://opencode.ai/zen/go/v1 */
  baseUrl: string;
  /** Chiave API (Bearer). Vuota = LLM non configurato. */
  apiKey: string;
  /** Modello narrativo (eventi, cronache, dialoghi, stampa) */
  modelloNarrativo: string;
  /** Modello visione (screenshot referto / rosa, OCR) */
  modelloVisione: string;
  /** Interruttore esplicito: false = offline forzato (PRD 4.6) */
  llmAttivo: boolean;
  /** Timestamp dell'ultimo export JSON (per banner backup settimanale) */
  ultimoBackupAt?: number;
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
  /**
   * Infortunio narrativo dichiarato dall'LLM (effetti_fisici): viene applicato
   * DAVVERO alla rosa alla creazione dell'evento (infortunioFinoA sui citati).
   */
  effettiFisici?: Array<{ giocatore: string; settimane: number }>;
  /**
   * Stato PRIMA dell'applicazione dell'infortunio narrativo: rollback secco in
   * annullaReferto (il giocatore non è nello statoPrima del referto, l'infortunio
   * narrativo arriva DOPO la transazione di conferma).
   */
  infortuniApplicati?: Array<{ giocatoreId: Id; infortunioFinoAPrima?: number }>;
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
  /** Fonte del contenuto: LLM o fallback offline (PRD 4.6) — serve all'anti-ripetizione */
  origine?: 'llm' | 'fallback';
  /** Id del template di fallback usato (anti-ripetizione 5 settimane, PRD 4.6) */
  templateId?: string;
  /** Letto/non letto in pagina Mail (decisione utente M4: inbox come casella email) */
  letta?: boolean;
}

/**
 * PRD 4.2 — Notizia di cronaca del turno ("Il giornale del giorno dopo").
 * Generata dall'LLM insieme agli eventi, o dall'engine dai risultati reali
 * quando offline. Archivio separato da Evento: non è azionabile e non serve
 * all'anti-ripetizione dei prompt (il testo della cronaca non torna nel prompt).
 */
export interface Notizia {
  id: Id;
  carrieraId: string;
  settimana: number;
  testo: string;
  /** Fonte: LLM o template engine dai risultati reali (PRD 4.6) */
  origine?: 'llm' | 'engine';
  /** Giorno di mercato (1-30): presente = notizia di mercato, non di turno */
  giornoMercato?: number;
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
  /** Giorno della finestra di mercato (1-30); assente = fuori finestra (es. test) */
  giornoMercato?: number;
  esito: EsitoTrasferimento;
  /** es. "rosa piena", "budget insufficiente" (per esito 'saltato') */
  motivo?: string;
  /** prestito = movimento a titolo temporaneo (PRD 7.5) */
  tipoMovimento?: 'trasferimento' | 'prestito';
}

/** Direzione di una trattativa rispetto alla squadra utente (PRD 7.3) */
export type DirezioneTrattativa = 'acquisto' | 'vendita';

/** Stato della macchina a stati di una trattativa (PRD 7.3: proposta → trattativa → accordo → applicata) */
export type StatoTrattativa =
  | 'proposta'
  | 'trattativa'
  | 'accordo'
  | 'applicata'
  | 'rifiutata'
  | 'scaduta'
  | 'saltata';

/**
 * PRD 7.3 — Trattativa: macchina a stati delle negoziazioni di mercato.
 * Max 4 giri (decisione utente, verificato FM: la volontà limita i giri).
 * I NUMERI sono dell'engine (soglie, concessioni, tetto); l'LLM scrive solo
 * i testi del thread (mail).
 */
export interface Trattativa {
  id: Id;
  carrieraId: string;
  /** Giocatore oggetto della trattativa */
  giocatoreId: Id;
  /** Club controparte (venditore se direzione acquisto, acquirente se vendita) */
  clubId: Id;
  direzione: DirezioneTrattativa;
  stato: StatoTrattativa;  /** Giro corrente 1-4 */
  giro: number;
  /** Cifra proposta dall'utente nell'ultima mossa (0 = non ancora proposta) */
  cifraUtente: number;
  /** Cifra proposta dal club CPU nell'ultima mossa (0 = nessuna) */
  cifraCpu: number;
  /** Soglia interna CPU (deterministica): accetta se cifra ≥ soglia */
  sogliaCpu: number;
  /** Tetto CPU per la vendita (deterministico): accetta richieste ≤ tetto */
  tettoCpu?: number;
  /** Giorno di mercato di creazione */
  giornoCreato: number;
  /** Giorno di scadenza della risposta corrente (deadline per l'utente) */
  scadenzaRisposta: number;
  /** true = l'ultima risposta CPU è una final offer (giro 4) */
  finalOffer: boolean;
  /** Messaggi del thread (mail): ultimo in fondo. Il testo è LLM o fallback engine. */
  messaggi: Array<{
    id: Id;
    mittente: 'utente' | 'cpu';
    testo: string;
    giorno: number;
    /** Se presente, la mossa ha cambiato le cifre (es. "controproposta: 8,5M") */
    cifra?: number;
  }>;
  /** Data dell'ultimo aggiornamento (ordinamento mail) */
  updatedAt: number;
  /** prestito = trattativa a titolo temporaneo, cifra 0, rientro a fine stagione (PRD 7.5) */
  tipoMovimento?: 'trasferimento' | 'prestito';
}

// ---------- Carriera lunga (PRD 7.7) ----------

/** Transizione panchina durante la carriera */
export interface VocePanchina {
  /** Nome del club o della nazionale */
  nome: string;
  /** Campionato (o 'Nazionali' per CT) */
  campionato: string;
  /** Stagione di ingresso */
  stagione: string;
  /** Stagione di uscita (assente = panchina attuale) */
  finoA?: string;
  tipo: 'club' | 'nazionale';
}

/** Riga dello storico stagionale (albo d'oro + mie stagioni + palmares) */
export interface VoceStoricoStagione {
  id: Id;
  carrieraId: string;
  stagione: string;
  /** Nome della squadra gestita */
  squadraNome: string;
  campionato: string;
  /** Posizione finale in campionato */
  piazzamento?: number;
  /** Obiettivo assegnato */
  obiettivo: string;
  /** Obiettivo centrato */
  obiettivoCentrato: boolean;
  /** Trofei vinti */
  trofeiVinti: Array<{ competizione: string; nome: string }>;
  /** Reputazione a fine stagione */
  reputazioneFine: number;
  /** Esito: confermato, esonerato, cambio panchina, game over */
  esito: 'confermato' | 'esonero' | 'cambio' | 'game_over';
  /** Albo d'oro mondiale: vincitore per ogni competizione */
  alboDoro: Array<{ competizione: string; vincitore: string }>;
  /** Risultato CT (se applicabile) */
  ct?: {
    nazionale: string;
    torneo: string;
    risultato: string;
    piazzamento?: number;
  };
  /** Timestamp della creazione */
  data: number;
}

/** Offerta di panchina (volontaria o forzata dopo esonero) */
export interface OffertaPanchina {
  id: Id;
  carrieraId: string;
  stagione: string;
  tipo: 'volontaria' | 'forzata';
  /** Squadra/NT offerente */
  squadraId: Id;
  /** Prestigio del club/NT (per ranking offerte) */
  prestigio: number;
  /** Obiettivo proposto */
  obiettivoProposto: string;
  stato: 'in_attesa' | 'accettata' | 'rifiutata';
}

/**
 * Cache media (loghi/volti reali): mapping nome → URL remoto risolto via
 * provider esterno (TheSportsDB). Registro tecnico, non entità PRD.
 * I pixel non vengono duplicati in IndexedDB (host immagini senza CORS):
 * si persiste il mapping, le immagini viaggiano via <img> + cache HTTP.
 * `url` vuota = lookup già tentato, nessun risultato: si usa il fallback generato.
 */
export interface MediaRecord {
  id: Id;
  tipo: 'logo_squadra' | 'volto_giocatore' | 'logo_competizione';
  /** Chiave di lookup normalizzata (es. "inter milan|italia") */
  chiave: string;
  /** URL remoto dell'immagine; '' = non trovato (negativo cacheato) */
  url: string;
  /** Nome visualizzato restituito dal provider (per debug/disambiguazione) */
  nomeProvider?: string;
  sorgente: 'thesportsdb';
  createdAt: number;
}

/** Categoria world news (mondo fuori dalla tua squadra) */
export type CategoriaMondo = 'performance' | 'derby' | 'infortunio' | 'sorteggio' | 'mercato' | 'coppe' | 'altro';

/**
 * Notizia dal mondo (non legata alla tua squadra): formattata come post X
 * di giornalista sportivo. Generata ogni turno (3-5) con engine deterministico
 * + LLM per narrativa (PRD 4.1 esteso). Archivio separato.
 */
export interface MondoNotizia {
  id: Id;
  carrieraId: string;
  settimana: number;
  categoria: CategoriaMondo;
  titolo: string;
  estratto: string;
  corpo: string;
  autoreNome: string;
  autoreHandle: string;
  oreFa: number;
  likes: number;
  reposts: number;
  commenti: number;
  squadra?: string;
  giocatore?: string;
  origine?: 'llm' | 'engine';
  letta?: boolean;
}
