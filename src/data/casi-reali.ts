// FLM — Casi reali di riferimento per il motore narrativo (PRD 3.1, regola 6 AGENTS.md)
// Situazioni REALI verificate sul web, usate come ispirazione per gli eventi:
// il prompt LLM riceve SOLO `situazione` (pattern generico, mai nomi reali);
// l'engine la adatta alla rosa dell'utente (pool candidati con etichette).
// `riferimento` e `fonte` sono documentazione verificata, mai inviate al modello.
//
// Fonti verificate via fetch diretto (feb 2026):
//   - Wikipedia "Jadon Sancho", "Federico Chiesa", "Victor Osimhen",
//     "Daniele De Rossi", "UC Sampdoria", "Sandro Tonali", "Arda Güler"

import type { CategoriaEvento } from '../types/entities';

/** Come l'engine seleziona il giocatore più coerente per questa situazione. */
export type HintSelezioneGiocatore =
  | 'crisi_morale' // morale < SOGLIA_MORALE_CRISI
  | 'panchinaro' // overall alto ma pochi minuti (o promessa titolare attiva)
  | 'infortunato' // in infortunio o reduce
  | 'giovane' // settore giovanile
  | 'leader' // capitano/senatori
  | 'rottura' // top player della rosa (overall più alto)
  | 'casuale'; // situazioni personali, infortuni in allenamento, ecc.

export interface CasoReale {
  id: string;
  categoria: CategoriaEvento;
  /** Come l'engine seleziona il giocatore più coerente per questa situazione */
  hint: HintSelezioneGiocatore;
  /** Pattern generico inviato al modello (mai nomi reali) */
  situazione: string;
  /** Il caso vero con nomi e date (solo documentazione) */
  riferimento: string;
  fonte: string;
  anno: string;
}

export const CASI_REALI: CasoReale[] = [
  // ---------------- Categoria: giocatore ----------------
  {
    id: 'esiliato_dal_gruppo',
    categoria: 'giocatore',
    hint: 'panchinaro',
    situazione:
      'Un giocatore ai margini della rosa contesta pubblicamente le scelte tecniche sui social; il club lo esclude dal gruppo e lo fa allenare a parte. La situazione si sblocca solo con un prestito o una riappacificazione.',
    riferimento:
      'Jadon Sancho (Manchester United, 2023-24): escluso dalla squadra dopo la polemica social con Ten Hag sulla prestazione in allenamento, allenato lontano dal gruppo, ceduto in prestito al Dortmund a gennaio.',
    fonte: 'Wikipedia — Jadon Sancho',
    anno: '2023',
  },
  {
    id: 'infortunio_lungo_recupero',
    categoria: 'giocatore',
    hint: 'infortunato',
    situazione:
      'Un giocatore chiave si rompe il legamento crociato in una partita secca: fuori 6-8 mesi, recupero lento, rientro graduale con la paura di non essere più lo stesso.',
    riferimento:
      'Federico Chiesa (Juventus, gennaio 2022): lesione del crociato contro la Roma, sette mesi di stop, stagione finita; i recuperi lunghi hanno segnato la sua carriera.',
    fonte: 'Wikipedia — Federico Chiesa',
    anno: '2022',
  },
  {
    id: 'acquisto_costoso_panchina',
    categoria: 'giocatore',
    hint: 'panchinaro',
    situazione:
      'Un acquisto importante fatica a trovare minuti: la stampa e i tifosi iniziano a chiedersi perché il club abbia speso tanto per un giocatore che non gioca mai.',
    riferimento:
      'Federico Chiesa (Liverpool, 2024-25): pochi minuti nel primo anno sotto Slot, critiche e ironie dei tifosi su un acquisto mai utilizzato.',
    fonte: 'Wikipedia — Federico Chiesa',
    anno: '2024',
  },
  {
    id: 'stella_in_rottura',
    categoria: 'giocatore',
    hint: 'rottura',
    situazione:
      'Il giocatore più forte della rosa è in rottura con la società: una trattativa di rinnovo o di cessione è saltata, e il rapporto è ai minimi storici. L\'agente spinge per andarsene.',
    riferimento:
      'Victor Osimhen (Napoli, estate 2024): trattativa con Al-Ahli saltata all\'ultimo, escluso dalla lista Serie A e spogliato del numero di maglia, passato al Galatasaray in prestito.',
    fonte: 'Wikipedia — Victor Osimhen',
    anno: '2024',
  },
  {
    id: 'squalifica_vicenda_personale',
    categoria: 'giocatore',
    hint: 'casuale',
    situazione:
      'Un giocatore della rosa è travolto da una vicenda personale fuori dal campo (scommesse, problemi disciplinari): squalifica lunga, percorso di riabilitazione, ritorno complicato.',
    riferimento:
      'Sandro Tonali (Newcastle, 2023): squalificato 10 mesi per scommesse illegali, otto mesi di riabilitazione, ha saltato il resto della stagione e l\'Europeo 2024.',
    fonte: 'Wikipedia — Sandro Tonali',
    anno: '2023',
  },
  {
    id: 'giovane_talento_infortuni',
    categoria: 'giocatore',
    hint: 'giovane',
    situazione:
      'Un giovane di grande talento acquistato a peso d\'oro non debutta mai: una serie di infortuni muscolari lo tiene fermo per mesi e la pazienza di tutti si assottiglia.',
    riferimento:
      'Arda Güler (Real Madrid, 2023-24): dopo l\'acquisto, infortuni ripetuti nella seconda metà del 2023; debutto solo a gennaio 2024, poi a lungo impiegato con il contagocce.',
    fonte: 'Wikipedia — Arda Güler',
    anno: '2023',
  },
  {
    id: 'veterano_contesta_panchina',
    categoria: 'giocatore',
    hint: 'leader',
    situazione:
      'Un veterano leader dello spogliatoio, in panchina in una partita decisiva, contesta apertamente le scelte del tecnico: il gesto diventa virale e apre un caso interno.',
    riferimento:
      'Daniele De Rossi (Italia-Svezia, spareggio Mondiale 2017): dalla panchina rifiuta di scaldarsi e indica Lorenzo Insigne, contestando le scelte di Ventura; gesto finito al centro del dibattito.',
    fonte: 'Wikipedia — Daniele De Rossi',
    anno: '2017',
  },
  {
    id: 'rientro_dopo_stop_lungo',
    categoria: 'giocatore',
    hint: 'infortunato',
    situazione:
      'Il rientro di un infortunato di lungo corso non è mai definitivo: tra ricadute e gestioni caute, il giocatore e lo staff medico finiscono sotto la lente di stampa e tifosi.',
    riferimento:
      'Federico Chiesa (2021-2023): tra il crociato del 2022 e i continui problemi muscolari, ogni rientro è stato accompagnato da nuove paure e stop (fonte Wikipedia).',
    fonte: 'Wikipedia — Federico Chiesa',
    anno: '2023',
  },

  // ---------------- Categoria: societa ----------------
  {
    id: 'societa_umilia_stella',
    categoria: 'societa',
    hint: 'rottura',
    situazione:
      'La società prende in giro la propria stella sui canali ufficiali (video social, comunicati ironici): il giocatore e il suo entourage minacciano azioni legali, il caso esplode sui media.',
    riferimento:
      'Napoli e Victor Osimhen (settembre 2023): il profilo TikTok ufficiale del club pubblica un video canzonatorio sul giocatore; l\'agente minaccia azioni legali, rapporto irreparabile.',
    fonte: 'Wikipedia — Victor Osimhen (ESPN, Marca citate)',
    anno: '2023',
  },
  {
    id: 'rinnovo_e_esonero_lampo',
    categoria: 'societa',
    hint: 'casuale',
    situazione:
      'Il club rinnova la fiducia con un contratto lungo e poi esonera dopo poche giornate senza vittorie: la decisione appare frettolosa e divide tifosi e spogliatoio.',
    riferimento:
      'AS Roma e Daniele De Rossi (2024): contratto rinnovato fino al 2027 a giugno, esonerato il 18 settembre dopo 4 partite senza vittorie a inizio stagione.',
    fonte: 'Wikipedia — Daniele De Rossi',
    anno: '2024',
  },
  {
    id: 'presidente_arrestato_crisi',
    categoria: 'societa',
    hint: 'casuale',
    situazione:
      'Il presidente del club finisce in un\'inchiesta giudiziaria: arresto, dimissioni, caos gestionale. La società naviga a vista tra stipendi, mercato e fiducia dei tifosi.',
    riferimento:
      'Sampdoria e Massimo Ferrero (2021): il presidente viene arrestato per reati societari e si dimette; il club resta senza guida, con proteste dei tifosi e rischio fallimento fino alla vendita del 2023.',
    fonte: 'Wikipedia — UC Sampdoria',
    anno: '2021',
  },
  {
    id: 'carosello_allenatori',
    categoria: 'societa',
    hint: 'casuale',
    situazione:
      'Una stagione disastrosa porta a un carosello di allenatori: la società cambia guida tecnica più volte, ogni cambio azzera le idee, la squadra galleggia a fondo classifica.',
    riferimento:
      'Sampdoria 2024-25: quattro cambi di allenatore in una stagione, 18° posto in Serie B e salvezza solo ai playout dopo una penalizzazione altrui.',
    fonte: 'Wikipedia — UC Sampdoria',
    anno: '2024',
  },
  {
    id: 'vendita_club_contesa',
    categoria: 'societa',
    hint: 'casuale',
    situazione:
      'Il club è in vendita e le trattative si trascinano: i tifosi contestano la proprietà, il mercato è bloccato e i giocatori chiave guardano altrove.',
    riferimento:
      'Sampdoria 2013-2023: la cessione a Ferrero fu contestata dai tifosi per anni, con proteste sotto la sede (500 tifosi nel febbraio 2023) e continui tentativi di vendita.',
    fonte: 'Wikipedia — UC Sampdoria',
    anno: '2023',
  },

  // ---------------- Categoria: tifosi_media ----------------
  {
    id: 'tifosi_contestano_proprieta',
    categoria: 'tifosi_media',
    hint: 'casuale',
    situazione:
      'I tifosi organizzano proteste contro la proprietà: striscioni allo stadio, sit-in davanti alla sede, curva che resta in silenzio. La contestazione tracima dai risultati alla gestione.',
    riferimento:
      'Sampdoria 2023: 500 tifosi contestano la proprietà sotto la sede (ansa/mediaset), dopo anni di proteste iniziate con la vendita contestata del 2014.',
    fonte: 'Wikipedia — UC Sampdoria (ANSA citata)',
    anno: '2023',
  },
  {
    id: 'stampa_contro_acquisto',
    categoria: 'tifosi_media',
    hint: 'panchinaro',
    situazione:
      'La stampa accende i riflettori su un giocatore che non rende o non gioca: titoli, pagelle ironiche e interrogativi continui nelle conferenze. La pressione mediatica sale.',
    riferimento:
      'Federico Chiesa a Liverpool (2024-25): il mediocentro sportivo lo mette nel mirino ("Chiesa nel mirino dei tifosi", Sportmediaset) per i minuti mai trovati.',
    fonte: 'Wikipedia — Federico Chiesa (Sportmediaset citata)',
    anno: '2025',
  },
  {
    id: 'talento_giovane_atteso',
    categoria: 'tifosi_media',
    hint: 'giovane',
    situazione:
      'Un giovane molto atteso dai tifosi non gioca mai: ogni panchina alimenta dibattiti social e radio, la società è accusata di non saper valorizzare il vivaio.',
    riferimento:
      'Arda Güler al Real Madrid (2023-25): usato con il contagocce nel primo anno, ogni apparizione in Copa del Rey riaccendeva il dibattito sui minuti negati.',
    fonte: 'Wikipedia — Arda Güler',
    anno: '2024',
  },
  {
    id: 'social_stella_silenzio',
    categoria: 'tifosi_media',
    hint: 'rottura',
    situazione:
      'La stella della squadra smette di salutare i tifosi e risponde con messaggi criptici sui social: la piazza interpreta ogni post come un addio imminente.',
    riferimento:
      'Victor Osimhen (Napoli, 2023-24): dopo il caso TikTok e la trattativa saltata, i silenzi e i post social del nigeriano alimentavano ogni giorno voci di addio.',
    fonte: 'Wikipedia — Victor Osimhen',
    anno: '2023',
  },
];

/** Situazioni per categoria (per il prompt LLM: solo pattern, mai nomi reali). */
export function situazioniPerCategoria(categoria: CategoriaEvento): string[] {
  return CASI_REALI.filter((c) => c.categoria === categoria).map((c) => c.situazione);
}

/** Situazioni di tutte le categorie (per il prompt LLM). */
export function tutteLeSituazioni(): string[] {
  return CASI_REALI.map((c) => c.situazione);
}
