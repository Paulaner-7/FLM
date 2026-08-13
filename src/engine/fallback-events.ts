// FLM — Eventi di fallback offline (PRD 4.6): tabelle precaricate con lo stesso
// schema del PRD 4.2 (categoria, tipo, titolo, testo, giocatoriCoinvolti, opzioni
// con effetti ±10). Usati SOLO quando la chiamata LLM fallisce o la validazione
// scarta tutto. Ispirati ai casi reali verificati in src/data/casi-reali.ts
// (situazioni generiche, mai nomi reali).
//
// Hint di sostituzione: {giocatore} viene sostituito dall'engine con il
// candidato più coerente (hint) o con un giocatore casuale. Un template usato
// non viene ripescato per FALLBACK_NO_RIPETI_SETTIMANE settimane.

import type { CategoriaEvento, EffettiProposti, TipoEvento } from '../types/entities';
import type { HintSelezioneGiocatore } from '../data/casi-reali';

export interface OpzioneFallback {
  testo: string;
  effettiProposti: EffettiProposti;
}

export interface FallbackEventoTemplate {
  id: string;
  categoria: CategoriaEvento;
  tipo: TipoEvento;
  titolo: string;
  testo: string;
  /** Come selezionare il giocatore per {giocatore}; null = evento senza giocatori */
  hint: HintSelezioneGiocatore | null;
  /** Se presente, l'evento applica DAVVERO l'infortunio al giocatore (settimane) */
  infortunioSettimane?: number;
  opzioni: OpzioneFallback[];
}

const EFFETTI_ZERO: EffettiProposti = { moraleGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 };

export const EVENTI_FALLBACK: FallbackEventoTemplate[] = [
  // ---------------- Categoria: giocatore (12) ----------------
  {
    id: 'fb_esiliato_gruppo',
    categoria: 'giocatore',
    tipo: 'punto_decisionale',
    titolo: 'Caos in allenamento: {giocatore} si allena a parte',
    testo:
      '{giocatore} ha contestato le scelte tattiche davanti a tutto il gruppo e ora si allena separato dalla squadra. L\'agente ha già fatto sapere che a gennaio vuole una soluzione: o minuti, o cessione.',
    hint: 'panchinaro',
    opzioni: [
      {
        testo: 'Colloquio privato e reintegro immediato: gli prometto spazio nelle prossime partite',
        effettiProposti: { moraleGiocatori: 4, fiduciaSocieta: 2, fiduciaTifosi: 2, reputazione: 2 },
      },
      {
        testo: 'Ferro: si allena a parte finché non cambia atteggiamento',
        effettiProposti: { moraleGiocatori: -6, fiduciaSocieta: 2, fiduciaTifosi: 3, reputazione: 3 },
      },
      {
        testo: 'Delego il vice e lascio che sia la società a gestire la situazione',
        effettiProposti: { moraleGiocatori: -2, fiduciaSocieta: -3, fiduciaTifosi: -1, reputazione: -2 },
      },
    ],
  },
  {
    id: 'fb_infortunio_crociato',
    categoria: 'giocatore',
    tipo: 'scenario_emergente',
    titolo: 'Stop per {giocatore}: lesione muscolare in allenamento',
    testo:
      'Gli esami confermano la lesione muscolare per {giocatore}: qualche settimana di stop, il reparto resta scoperto proprio nel momento chiave della stagione. Lo spogliatoio è sotto choc.',
    hint: 'infortunato',
    infortunioSettimane: 3,
    opzioni: [
      {
        testo: 'Sostengo il giocatore: presenza al suo fianco e piano di recupero personalizzato',
        effettiProposti: { moraleGiocatori: 5, fiduciaSocieta: 2, fiduciaTifosi: 2, reputazione: 3 },
      },
      {
        testo: 'Concentro tutto sul mercato: serve un sostituto immediato',
        effettiProposti: { moraleGiocatori: -4, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: -1 },
      },
      {
        testo: 'Gestione ordinaria: lo staff medico decide tutto',
        effettiProposti: { moraleGiocatori: -2, fiduciaSocieta: -1, fiduciaTifosi: -1, reputazione: -1 },
      },
    ],
  },
  {
    id: 'fb_acquisto_panchina',
    categoria: 'giocatore',
    tipo: 'scenario_emergente',
    titolo: 'La stampa attacca: "{giocatore}, l\'acquisto fantasma"',
    testo:
      'Un quotidiano titola sulla panchina infinita di {giocatore}, arrivato in estate con grandi aspettative. I tifosi iniziano a chiedersi perché sia stato acquistato se non gioca mai.',
    hint: 'panchinaro',
    opzioni: [
      {
        testo: 'Lo lancio titolare nella prossima partita: meglio rischiare che perderlo',
        effettiProposti: { moraleGiocatori: 6, fiduciaSocieta: -1, fiduciaTifosi: 3, reputazione: 1 },
      },
      {
        testo: 'Spiego pubblicamente il piano di inserimento graduale',
        effettiProposti: { moraleGiocatori: 2, fiduciaSocieta: 2, fiduciaTifosi: 1, reputazione: 2 },
      },
      {
        testo: 'Ignoro le pressioni: scelte tecniche solo mie',
        effettiProposti: { moraleGiocatori: -3, fiduciaSocieta: -2, fiduciaTifosi: -3, reputazione: -1 },
      },
    ],
  },
  {
    id: 'fb_stella_rottura',
    categoria: 'giocatore',
    tipo: 'punto_decisionale',
    titolo: '{giocatore} vuole andarsene: rapporto ai minimi',
    testo:
      '{giocatore}, il giocatore più forte della rosa, ha chiesto un incontro: la trattativa col club che lo vuole è in fase avanzata e lui vuole il via libera. Lo spogliatoio è spaccato tra chi capisce e chi lo considera un traditore.',
    hint: 'rottura',
    opzioni: [
      {
        testo: 'Lo convinco a restare: progetto e centralità assoluta',
        effettiProposti: { moraleGiocatori: 7, fiduciaSocieta: 1, fiduciaTifosi: 5, reputazione: 3 },
      },
      {
        testo: 'Via libera alla cessione: chi non crede nel progetto non resta',
        effettiProposti: { moraleGiocatori: -5, fiduciaSocieta: 3, fiduciaTifosi: -4, reputazione: -2 },
      },
      {
        testo: 'Rimando tutto alla società: non è un problema mio',
        effettiProposti: { moraleGiocatori: -4, fiduciaSocieta: -4, fiduciaTifosi: -2, reputazione: -3 },
      },
    ],
  },
  {
    id: 'fb_vicenda_personale',
    categoria: 'giocatore',
    tipo: 'scenario_emergente',
    titolo: 'Vicenda extra-campo per {giocatore}',
    testo:
      'Una vicenda personale di {giocatore} è finita sulle prime pagine: la società ha aperto un procedimento interno e la stampa chiede provvedimenti. Il ragazzo si è chiuso nel silenzio.',
    hint: 'casuale',
    opzioni: [
      {
        testo: 'Lo proteggo pubblicamente e gestiamo la vicenda in famiglia',
        effettiProposti: { moraleGiocatori: 5, fiduciaSocieta: -1, fiduciaTifosi: 1, reputazione: 1 },
      },
      {
        testo: 'Provvedimenti interni: multa e panchina, le regole valgono per tutti',
        effettiProposti: { moraleGiocatori: -6, fiduciaSocieta: 2, fiduciaTifosi: 3, reputazione: 2 },
      },
      {
        testo: 'Nessuna dichiarazione: aspetto che la giustizia faccia il suo corso',
        effettiProposti: { moraleGiocatori: -2, fiduciaSocieta: -2, fiduciaTifosi: -2, reputazione: -2 },
      },
    ],
  },
  {
    id: 'fb_giovane_infortuni',
    categoria: 'giocatore',
    tipo: 'scenario_emergente',
    titolo: '{giocatore}, il talento che si ferma di nuovo',
    testo:
      'Il gioiello della cantera {giocatore} è di nuovo out: l\'ennesimo problema muscolare in allenamento. I tifosi si chiedono se il suo fisico reggerà mai la prima squadra.',
    hint: 'giovane',
    infortunioSettimane: 2,
    opzioni: [
      {
        testo: 'Programma di gestione personalizzato: pazienza e lavoro individuale',
        effettiProposti: { moraleGiocatori: 4, fiduciaSocieta: 1, fiduciaTifosi: 1, reputazione: 2 },
      },
      {
        testo: 'Lo rimetto in campo appena possibile: i giovani devono giocare',
        effettiProposti: { moraleGiocatori: 3, fiduciaSocieta: -1, fiduciaTifosi: 2, reputazione: -2 },
      },
      {
        testo: 'Valuto un prestito per farlo giocare con continuità',
        effettiProposti: { moraleGiocatori: 1, fiduciaSocieta: 2, fiduciaTifosi: -3, reputazione: 1 },
      },
    ],
  },
  {
    id: 'fb_veterano_contesta',
    categoria: 'giocatore',
    tipo: 'punto_decisionale',
    titolo: '{giocatore} contesta la panchina: scena davanti a tutti',
    testo:
      'Durante l\'ultima partita le telecamere hanno beccato {giocatore}, uno dei leader dello spogliatoio, mentre contestava platealmente il cambio. Il video gira e il caso è aperto.',
    hint: 'leader',
    opzioni: [
      {
        testo: 'Confronto duro in privato: rispetto reciproco, poi si volta pagina',
        effettiProposti: { moraleGiocatori: 2, fiduciaSocieta: 2, fiduciaTifosi: 2, reputazione: 3 },
      },
      {
        testo: 'Panchina per lui alla prossima: le gerarchie non si discutono',
        effettiProposti: { moraleGiocatori: -7, fiduciaSocieta: 1, fiduciaTifosi: 2, reputazione: 1 },
      },
      {
        testo: 'Pubblico un comunicato congiunto: gestiamo l\'immagine',
        effettiProposti: { moraleGiocatori: 1, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: -1 },
      },
    ],
  },
  {
    id: 'fb_rientro_stop_lungo',
    categoria: 'giocatore',
    tipo: 'scenario_emergente',
    titolo: 'Rientro a singhiozzo per {giocatore}',
    testo:
      '{giocatore} è rientrato da due settimane ma accusa ancora fastidi: lo staff medico chiede cautela, il giocatore vuole giocare. La gestione del suo recupero divide lo spogliatoio.',
    hint: 'infortunato',
    opzioni: [
      {
        testo: 'Cautela: lo gestisco a step, anche a costo di perderlo in un paio di partite',
        effettiProposti: { moraleGiocatori: 3, fiduciaSocieta: 1, fiduciaTifosi: -1, reputazione: 2 },
      },
      {
        testo: 'Lo butto dentro: se dice di star bene, mi fido',
        effettiProposti: { moraleGiocatori: 2, fiduciaSocieta: -2, fiduciaTifosi: 2, reputazione: -3 },
      },
      {
        testo: 'Decisione affidata al medico: non voglio responsabilità',
        effettiProposti: { moraleGiocatori: -2, fiduciaSocieta: -2, fiduciaTifosi: -2, reputazione: -2 },
      },
    ],
  },
  {
    id: 'fb_richiesta_minuti',
    categoria: 'giocatore',
    tipo: 'punto_decisionale',
    titolo: '{giocatore} chiede più spazio: "Non posso restare in panchina"',
    testo:
      '{giocatore} ha parlato chiaro in conferenza: se la situazione non cambia, a gennaio valuterà il da farsi. I minuti stagionali non bastano e l\'agente ha già bussato alla società.',
    hint: 'panchinaro',
    opzioni: [
      {
        testo: 'Gli do spazio: lo schiero e gli garantisco continuità',
        effettiProposti: { moraleGiocatori: 6, fiduciaSocieta: -1, fiduciaTifosi: 2, reputazione: 0 },
      },
      {
        testo: 'Rispondo in campo: deve guadagnarsela',
        effettiProposti: { moraleGiocatori: -4, fiduciaSocieta: 2, fiduciaTifosi: 1, reputazione: 2 },
      },
      {
        testo: 'Propongo alla società una cessione a gennaio se arrivano offerte',
        effettiProposti: { moraleGiocatori: -3, fiduciaSocieta: 1, fiduciaTifosi: -2, reputazione: -1 },
      },
    ],
  },
  {
    id: 'fb_leader_ammutinato',
    categoria: 'giocatore',
    tipo: 'scenario_emergente',
    titolo: 'Riunione di spogliatoio senza di te',
    testo:
      'Dopo l\'ultima sconfitta, i leader hanno convocato una riunione di spogliatoio e non ti hanno invitato. Le voci dicono che il gruppo discute delle tue scelte tattiche.',
    hint: 'leader',
    opzioni: [
      {
        testo: 'Entro in riunione e affronto il gruppo a viso aperto',
        effettiProposti: { moraleGiocatori: 3, fiduciaSocieta: 2, fiduciaTifosi: 2, reputazione: 4 },
      },
      {
        testo: 'Lascio che parlino e aspetto il resoconto del capitano',
        effettiProposti: { moraleGiocatori: -2, fiduciaSocieta: -2, fiduciaTifosi: -1, reputazione: -2 },
      },
      {
        testo: 'Sciolgo le riunioni senza di me: le decisioni si prendono insieme o da soli',
        effettiProposti: { moraleGiocatori: -6, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 1 },
      },
    ],
  },
  {
    id: 'fb_agente_offerta',
    categoria: 'giocatore',
    tipo: 'scenario_emergente',
    titolo: 'Offerta importante per {giocatore}',
    testo:
      'L\'agente di {giocatore} ha portato in società un\'offerta importante da un club estero. Il giocatore è tentato: soldi e campionato diverso contro il progetto attuale.',
    hint: 'rottura',
    opzioni: [
      {
        testo: 'Parlo col giocatore e cerco di blindarlo con un rinnovo',
        effettiProposti: { moraleGiocatori: 5, fiduciaSocieta: 1, fiduciaTifosi: 3, reputazione: 2 },
      },
      {
        testo: 'Via libera: con quei soldi rinforziamo due ruoli',
        effettiProposti: { moraleGiocatori: -4, fiduciaSocieta: 2, fiduciaTifosi: -3, reputazione: -1 },
      },
      {
        testo: 'Mando via l\'agente: le trattative passano solo dalla società',
        effettiProposti: { moraleGiocatori: -5, fiduciaSocieta: 0, fiduciaTifosi: 1, reputazione: -2 },
      },
    ],
  },
  {
    id: 'fb_crisi_morale',
    categoria: 'giocatore',
    tipo: 'scenario_emergente',
    titolo: '{giocatore} non si allena con la testa',
    testo:
      '{giocatore} è irriconoscibile: arriva in ritardo, si allena svogliato, parla poco. Il morale è a terra e i compagni cominciano a notarlo.',
    hint: 'crisi_morale',
    opzioni: [
      {
        testo: 'Colloquio in privato: provo a capire cosa succede',
        effettiProposti: { moraleGiocatori: 6, fiduciaSocieta: 1, fiduciaTifosi: 1, reputazione: 2 },
      },
      {
        testo: 'Lo lascio fuori squadra finché non si sveglia',
        effettiProposti: { moraleGiocatori: -6, fiduciaSocieta: 0, fiduciaTifosi: -1, reputazione: -1 },
      },
      {
        testo: 'Ne parlo col capitano: il gruppo lo deve aiutare',
        effettiProposti: { moraleGiocatori: 3, fiduciaSocieta: 1, fiduciaTifosi: 1, reputazione: 1 },
      },
    ],
  },

  // ---------------- Categoria: societa (9) ----------------
  {
    id: 'fb_societa_umilia_stella',
    categoria: 'societa',
    tipo: 'punto_decisionale',
    titolo: 'Il club prende in giro la sua stella sui social',
    testo:
      'Il profilo ufficiale del club ha pubblicato un video ironico sul tuo giocatore più forte. Il suo entourage parla di azioni legali e la vicenda è su tutti i telegiornali.',
    hint: 'rottura',
    opzioni: [
      {
        testo: 'Chiedo un comunicato ufficiale di scuse e la testa del social media manager',
        effettiProposti: { moraleGiocatori: 4, fiduciaSocieta: 1, fiduciaTifosi: 2, reputazione: 3 },
      },
      {
        testo: 'Difendo il club: era una battuta, chi se la prende è permaloso',
        effettiProposti: { moraleGiocatori: -6, fiduciaSocieta: 1, fiduciaTifosi: -2, reputazione: -3 },
      },
      {
        testo: 'Non entro nella polemica: non sono affari miei',
        effettiProposti: { moraleGiocatori: -3, fiduciaSocieta: -3, fiduciaTifosi: -1, reputazione: -2 },
      },
    ],
  },
  {
    id: 'fb_rinnovo_esonero',
    categoria: 'societa',
    tipo: 'scenario_emergente',
    titolo: 'La società freme: voci di esonero dopo il rinnovo',
    testo:
      'Strano clima: il club ti aveva rinnovato la fiducia a inizio anno, ma dopo l\'ultimo risultato i giornali scrivono che la panchina è già a rischio. Qualcuno in società ha fatto filtrare il malcontento.',
    hint: null,
    opzioni: [
      {
        testo: 'Conferenza stampa: chiedo un voto di fiducia pubblico',
        effettiProposti: { moraleGiocatori: 1, fiduciaSocieta: 3, fiduciaTifosi: 2, reputazione: 3 },
      },
      {
        testo: 'Parlo a quattr\'occhi col presidente e chiudo la questione',
        effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: 2, fiduciaTifosi: 0, reputazione: 2 },
      },
      {
        testo: 'Rispondo in campo: testa bassa e lavoro',
        effettiProposti: { moraleGiocatori: 2, fiduciaSocieta: -2, fiduciaTifosi: 1, reputazione: -1 },
      },
    ],
  },
  {
    id: 'fb_presidente_guai_giudiziari',
    categoria: 'societa',
    tipo: 'scenario_emergente',
    titolo: 'Il presidente finisce in un\'inchiesta',
    testo:
      'Il presidente del club è coinvolto in un\'inchiesta giudiziaria: si vocifera di dimissioni imminenti e la società naviga a vista. Stipendi, mercato e progetti sono nel congelatore.',
    hint: null,
    opzioni: [
      {
        testo: 'Mi faccio garante del gruppo: intervengo per tenere unito lo spogliatoio',
        effettiProposti: { moraleGiocatori: 4, fiduciaSocieta: -1, fiduciaTifosi: 2, reputazione: 4 },
      },
      {
        testo: 'Tengo le distanze: questione tra presidente e giustizia',
        effettiProposti: { moraleGiocatori: -2, fiduciaSocieta: -3, fiduciaTifosi: -3, reputazione: -2 },
      },
      {
        testo: 'Chiedo garanzie scritte sul progetto alla proprietà',
        effettiProposti: { moraleGiocatori: 1, fiduciaSocieta: -2, fiduciaTifosi: 1, reputazione: 1 },
      },
    ],
  },
  {
    id: 'fb_carosello_allenatori',
    categoria: 'societa',
    tipo: 'scenario_emergente',
    titolo: 'La società cambia idea: progetto stravolto',
    testo:
      'Il direttore sportivo è stato esonerato e il suo sostituto parla di rifondazione: metà rosa è sul mercato e le idee tattiche della società non coincidono più con le tue.',
    hint: null,
    opzioni: [
      {
        testo: 'Mi adeguo al nuovo corso: dialogo e disponibilità',
        effettiProposti: { moraleGiocatori: 1, fiduciaSocieta: 4, fiduciaTifosi: 0, reputazione: 1 },
      },
      {
        testo: 'Difendo il mio progetto: o si fa come dico io o valuto le dimissioni',
        effettiProposti: { moraleGiocatori: -2, fiduciaSocieta: -6, fiduciaTifosi: 1, reputazione: -2 },
      },
      {
        testo: 'Chiedo un incontro a tre: presidente, DS e allenatore',
        effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: 1, fiduciaTifosi: 0, reputazione: 2 },
      },
    ],
  },
  {
    id: 'fb_vendita_club',
    categoria: 'societa',
    tipo: 'scenario_emergente',
    titolo: 'Il club è in vendita e le trattative si trascinano',
    testo:
      'Le voci di cessione del club si rincorrono da mesi: i potenziali acquirenti si affacciano e spariscono, il mercato è bloccato e i giocatori chiave guardano altrove.',
    hint: null,
    opzioni: [
      {
        testo: 'Rassicuro la squadra: a me interessa solo il campo',
        effettiProposti: { moraleGiocatori: 4, fiduciaSocieta: 0, fiduciaTifosi: 2, reputazione: 3 },
      },
      {
        testo: 'Pretendo risposte dalla proprietà sulla programmazione',
        effettiProposti: { moraleGiocatori: -1, fiduciaSocieta: -3, fiduciaTifosi: -1, reputazione: 0 },
      },
      {
        testo: 'Uso l\'incertezza come stimolo: chi resta, resta per il progetto',
        effettiProposti: { moraleGiocatori: 2, fiduciaSocieta: -2, fiduciaTifosi: 1, reputazione: 2 },
      },
    ],
  },
  {
    id: 'fb_ds_conflitto',
    categoria: 'societa',
    tipo: 'punto_decisionale',
    titolo: 'Scontro col direttore sportivo sul mercato',
    testo:
      'Il direttore sportivo vuole vendere un giocatore che per te è fondamentale. La riunione di mercato è degenerata e ora ti chiede una decisione definitiva.',
    hint: 'panchinaro',
    opzioni: [
      {
        testo: 'Veto sulla cessione: sul campo decido io',
        effettiProposti: { moraleGiocatori: 3, fiduciaSocieta: -3, fiduciaTifosi: 2, reputazione: 2 },
      },
      {
        testo: 'Accetto la cessione ma pretendo un sostituto allo stesso livello',
        effettiProposti: { moraleGiocatori: -2, fiduciaSocieta: 2, fiduciaTifosi: -1, reputazione: 0 },
      },
      {
        testo: 'Mediazione: lo teniamo fino a gennaio, poi si rivaluta',
        effettiProposti: { moraleGiocatori: 1, fiduciaSocieta: 1, fiduciaTifosi: 0, reputazione: 1 },
      },
    ],
  },
  {
    id: 'fb_budget_tagliato',
    categoria: 'societa',
    tipo: 'scenario_emergente',
    titolo: 'La società annuncia un ridimensionamento',
    testo:
      'La proprietà ha annunciato un piano di riduzione dei costi: niente acquisti a gennaio e rinnovi al ribasso. I big dello spogliatoio iniziano a guardarsi intorno.',
    hint: null,
    opzioni: [
      {
        testo: 'Progetto giovani: trasformo il limite in opportunità',
        effettiProposti: { moraleGiocatori: 2, fiduciaSocieta: 3, fiduciaTifosi: -2, reputazione: 2 },
      },
      {
        testo: 'Protesto formalmente: senza rinforzi non posso garantire risultati',
        effettiProposti: { moraleGiocatori: -1, fiduciaSocieta: -4, fiduciaTifosi: -1, reputazione: -2 },
      },
      {
        testo: 'Accetto e cerco di vendere i giocatori scontenti',
        effettiProposti: { moraleGiocatori: -3, fiduciaSocieta: 2, fiduciaTifosi: -3, reputazione: -1 },
      },
    ],
  },
  {
    id: 'fb_stadio_lavori',
    categoria: 'societa',
    tipo: 'scenario_emergente',
    titolo: 'Trasferta forzata: lo stadio chiude per lavori',
    testo:
      'Il club ha annunciato la chiusura dello stadio per lavori di adeguamento: per mesi giocherete in un impianto provvisorio, lontano dal vostro pubblico.',
    hint: null,
    opzioni: [
      {
        testo: 'Trasformo la trasferta in un\'occasione: gruppo contro tutto',
        effettiProposti: { moraleGiocatori: 3, fiduciaSocieta: 1, fiduciaTifosi: 2, reputazione: 2 },
      },
      {
        testo: 'Chiedo spiegazioni sui tempi: è una decisione troppo affrettata',
        effettiProposti: { moraleGiocatori: -1, fiduciaSocieta: -3, fiduciaTifosi: -2, reputazione: -1 },
      },
      {
        testo: 'Organizzo io il rapporto coi tifosi in trasferta',
        effettiProposti: { moraleGiocatori: 1, fiduciaSocieta: 1, fiduciaTifosi: 4, reputazione: 2 },
      },
    ],
  },
  {
    id: 'fb_premio_promesse',
    categoria: 'societa',
    tipo: 'punto_decisionale',
    titolo: 'La società ti chiede di garantire risultati',
    testo:
      'Il presidente ti convoca: la società è disposta a blindare il tuo contratto, ma in cambio vuole una promessa pubblica di raggiungere l\'obiettivo stagionale.',
    hint: null,
    opzioni: [
      {
        testo: 'Accetto: pubblico l\'obiettivo e mi prendo la responsabilità',
        effettiProposti: { moraleGiocatori: 2, fiduciaSocieta: 5, fiduciaTifosi: 3, reputazione: 3 },
      },
      {
        testo: 'Rifiuto le promesse pubbliche: risultato sì, proclami no',
        effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: -2, fiduciaTifosi: -1, reputazione: 1 },
      },
      {
        testo: 'Chiedo contropartite: rinnovo sì, ma con budget garantito',
        effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: 1, fiduciaTifosi: 0, reputazione: 1 },
      },
    ],
  },

  // ---------------- Categoria: tifosi_media (9) ----------------
  {
    id: 'fb_tifosi_contestano_proprieta',
    categoria: 'tifosi_media',
    tipo: 'scenario_emergente',
    titolo: 'I tifosi protestano davanti alla sede',
    testo:
      'Centinaia di tifosi hanno organizzato una protesta davanti alla sede: striscioni contro la proprietà, cori e richieste di chiarezza sul progetto. La contestazione non è contro di te, ma la piazza è incandescente.',
    hint: null,
    opzioni: [
      {
        testo: 'Vado a parlare coi tifosi: li ascolto e mi faccio portavoce',
        effettiProposti: { moraleGiocatori: 1, fiduciaSocieta: -1, fiduciaTifosi: 4, reputazione: 3 },
      },
      {
        testo: 'Invito alla calma: le proteste non aiutano la squadra',
        effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: 2, fiduciaTifosi: -3, reputazione: -1 },
      },
      {
        testo: 'Silenzio stampa: chi di dovere risponderà',
        effettiProposti: { moraleGiocatori: -1, fiduciaSocieta: -2, fiduciaTifosi: -2, reputazione: -2 },
      },
    ],
  },
  {
    id: 'fb_stampa_pressione',
    categoria: 'tifosi_media',
    tipo: 'scenario_emergente',
    titolo: 'La stampa ti mette sul banco degli imputati',
    testo:
      'Titoli pesanti sui quotidiani: le tue scelte tattiche sono sotto processo e le radio sportive tengono il conto dei tuoi errori. La pressione mediatica non è mai stata così alta.',
    hint: null,
    opzioni: [
      {
        testo: 'Conferenza stampa diretta: rispondo punto su punto',
        effettiProposti: { moraleGiocatori: 1, fiduciaSocieta: 1, fiduciaTifosi: 1, reputazione: 3 },
      },
      {
        testo: 'Ignoro i media: giudice è solo il campo',
        effettiProposti: { moraleGiocatori: 2, fiduciaSocieta: -1, fiduciaTifosi: -2, reputazione: -1 },
      },
      {
        testo: 'Uso la pressione come carburante nello spogliatoio',
        effettiProposti: { moraleGiocatori: 4, fiduciaSocieta: 0, fiduciaTifosi: 1, reputazione: 2 },
      },
    ],
  },
  {
    id: 'fb_social_stella',
    categoria: 'tifosi_media',
    tipo: 'scenario_emergente',
    titolo: 'Messaggi criptici sui social del tuo top player',
    testo:
      'Il tuo giocatore più forte ha pubblicato una storia con una frase enigmatica e i tifosi hanno già decretato: vuole andarsene. I commenti sotto il post sono migliaia.',
    hint: 'rottura',
    opzioni: [
      {
        testo: 'Chiedo un chiarimento immediato e una smentita pubblica',
        effettiProposti: { moraleGiocatori: 2, fiduciaSocieta: 2, fiduciaTifosi: 3, reputazione: 2 },
      },
      {
        testo: 'Multa per comportamento: i social del club si gestiscono col club',
        effettiProposti: { moraleGiocatori: -5, fiduciaSocieta: 1, fiduciaTifosi: 2, reputazione: -1 },
      },
      {
        testo: 'Non ci vedo nulla di male: libertà di espressione',
        effettiProposti: { moraleGiocatori: 1, fiduciaSocieta: -2, fiduciaTifosi: -3, reputazione: -2 },
      },
    ],
  },
  {
    id: 'fb_curva_silenzio',
    categoria: 'tifosi_media',
    tipo: 'scenario_emergente',
    titolo: 'La curva resta in silenzio',
    testo:
      'Dopo l\'ultima partita, la curva ha annunciato: niente cori per la prossima gara. Il silenzio dei tifosi è la protesta più rumorosa che ci sia.',
    hint: null,
    opzioni: [
      {
        testo: 'Lancio un appello: la squadra ha bisogno della gente',
        effettiProposti: { moraleGiocatori: 3, fiduciaSocieta: 0, fiduciaTifosi: 4, reputazione: 2 },
      },
      {
        testo: 'Rispetto la protesta: i silenzi si meritano sul campo',
        effettiProposti: { moraleGiocatori: 1, fiduciaSocieta: 1, fiduciaTifosi: 1, reputazione: 2 },
      },
      {
        testo: 'Chiedo alla società di mediare con la curva',
        effettiProposti: { moraleGiocatori: -1, fiduciaSocieta: -2, fiduciaTifosi: -2, reputazione: -2 },
      },
    ],
  },
  {
    id: 'fb_radio_insulti',
    categoria: 'tifosi_media',
    tipo: 'scenario_emergente',
    titolo: 'Le radio sportive ti danno dell\'inetto',
    testo:
      'Le radio sportive locali sono senza pietà: opinionisti e tifosi in diretta chiedono la tua testa. Un giornalista ha anche chiamato in causa la tua famiglia.',
    hint: null,
    opzioni: [
      {
        testo: 'Denuncia formale: il limite è il rispetto',
        effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: 1, fiduciaTifosi: 1, reputazione: 2 },
      },
      {
        testo: 'Ironia: rispondo con una battuta che diventa virale',
        effettiProposti: { moraleGiocatori: 2, fiduciaSocieta: 0, fiduciaTifosi: 2, reputazione: 1 },
      },
      {
        testo: 'Tiro dritto: chi parla non allena',
        effettiProposti: { moraleGiocatori: 1, fiduciaSocieta: -1, fiduciaTifosi: -1, reputazione: -1 },
      },
    ],
  },
  {
    id: 'fb_talento_atteso',
    categoria: 'tifosi_media',
    tipo: 'scenario_emergente',
    titolo: 'Tutta la città vuole vedere il giovane in campo',
    testo:
      'I tifosi hanno scelto il loro nuovo idolo: un giovane della cantera che non gioca mai. Ogni panchina è un caso, ogni intervista una domanda: "Quando lo fa giocare?"',
    hint: 'giovane',
    opzioni: [
      {
        testo: 'Lo lancio: la città merita di vedere il suo talento',
        effettiProposti: { moraleGiocatori: 5, fiduciaSocieta: 1, fiduciaTifosi: 5, reputazione: 2 },
      },
      {
        testo: 'Lo gestisco con calma: i giovani si bruciano in fretta',
        effettiProposti: { moraleGiocatori: 1, fiduciaSocieta: 1, fiduciaTifosi: -3, reputazione: 1 },
      },
      {
        testo: 'Lo faccio giocare solo a risultato acquisito',
        effettiProposti: { moraleGiocatori: -2, fiduciaSocieta: 0, fiduciaTifosi: -2, reputazione: -1 },
      },
    ],
  },
  {
    id: 'fb_media_giornale',
    categoria: 'tifosi_media',
    tipo: 'scenario_emergente',
    titolo: 'Retroscena di giornale: spogliatoio spaccato',
    testo:
      'Un quotidiano racconta presunti retroscena: malumori nello spogliatoio, un gruppo di giocatori contro le tue idee. La notizia è smentita da tutti, ma il danno è fatto.',
    hint: null,
    opzioni: [
      {
        testo: 'Riunione di squadra: chiudiamo il caso davanti a tutti',
        effettiProposti: { moraleGiocatori: 4, fiduciaSocieta: 1, fiduciaTifosi: 2, reputazione: 3 },
      },
      {
        testo: 'Smentita ufficiale via club e nessun altro commento',
        effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: 1, fiduciaTifosi: 0, reputazione: 0 },
      },
      {
        testo: 'Caccio la talpa: chi parla con i giornali paga',
        effettiProposti: { moraleGiocatori: -5, fiduciaSocieta: 0, fiduciaTifosi: 1, reputazione: -1 },
      },
    ],
  },
  {
    id: 'fb_premio_tifosi',
    categoria: 'tifosi_media',
    tipo: 'scenario_emergente',
    titolo: 'I tifosi ti dedicano una coreografia',
    testo:
      'Sorpresa: la curva ha preparato una coreografia dedicata a te e al tuo staff. Dopo settimane di critiche, la piazza dimostra di credere ancora nel progetto.',
    hint: null,
    opzioni: [
      {
        testo: 'Ringrazio pubblicamente e dedico la prossima vittoria alla curva',
        effettiProposti: { moraleGiocatori: 3, fiduciaSocieta: 1, fiduciaTifosi: 3, reputazione: 3 },
      },
      {
        testo: 'Ringrazio in privato: le dediche si fanno in campo',
        effettiProposti: { moraleGiocatori: 1, fiduciaSocieta: 0, fiduciaTifosi: -1, reputazione: 1 },
      },
      {
        testo: 'La uso come stimolo: "Questo affetto va ripagato"',
        effettiProposti: { moraleGiocatori: 4, fiduciaSocieta: 0, fiduciaTifosi: 2, reputazione: 2 },
      },
    ],
  },
  {
    id: 'fb_tifosi_trasferta',
    categoria: 'tifosi_media',
    tipo: 'scenario_emergente',
    titolo: 'Mille tifosi in trasferta nonostante i risultati',
    testo:
      'Nonostante il momento difficile, più di mille tifosi hanno prenotato il pullman per la prossima trasferta. La passione della piazza non si è spenta.',
    hint: null,
    opzioni: [
      {
        testo: 'Vado a salutarli prima della partita e li ringrazio pubblicamente',
        effettiProposti: { moraleGiocatori: 3, fiduciaSocieta: 1, fiduciaTifosi: 4, reputazione: 3 },
      },
      {
        testo: 'Li cito in conferenza: "Giocheremo anche per loro"',
        effettiProposti: { moraleGiocatori: 2, fiduciaSocieta: 0, fiduciaTifosi: 2, reputazione: 2 },
      },
      {
        testo: 'Nessun gesto particolare: le parole valgono meno dei risultati',
        effettiProposti: { moraleGiocatori: -1, fiduciaSocieta: 0, fiduciaTifosi: -2, reputazione: -1 },
      },
    ],
  },
];

/** Template di fallback per categoria (per la pesca offline). */
export function fallbackPerCategoria(categoria: CategoriaEvento): FallbackEventoTemplate[] {
  return EVENTI_FALLBACK.filter((e) => e.categoria === categoria);
}

/** Esclude i template già usati di recente (anti-ripetizione, PRD 4.6). */
export function fallbackDisponibili(
  categoria: CategoriaEvento,
  templateUsatiDiRecent: Set<string>,
): FallbackEventoTemplate[] {
  return fallbackPerCategoria(categoria).filter((e) => !templateUsatiDiRecent.has(e.id));
}

export { EFFETTI_ZERO };
