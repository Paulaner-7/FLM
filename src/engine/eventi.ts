// FLM — Motore eventi (PRD 4.1/4.2/4.3/4.6): regole PURE del direttore narrativo.
// Regola 3 AGENTS.md: qui si calcola TUTTO ciò che è meccanica (pesca categorie,
// cooldown, validazione semantica, clamp, applicazione effetti, notizie offline).
// L'LLM produce solo testo e proposte (src/llm); la persistenza vive in db/eventi.ts.
// Nessuna scrittura qui, nessun Math.random: pesca seminata (PRNG di random.ts).

import type { CategoriaEvento, Evento, Giocatore, Id, Partita, StatoClub } from '../types/entities';
import type { PropostaEventi } from '../llm';
import type { HintSelezioneGiocatore } from '../data/casi-reali';
import {
  COOLDOWN_CATEGORIA_TURNI,
  MAX_CONSECUTIVI_DUE_EVENTI,
  MAX_EVENTI_RARI_STAGIONE,
  MAX_EVENTI_TURNO,
  MAX_NOTIZIE,
  MAX_SETTIMANE_INFORTUNIO_EVENTO,
  MINUTI_PANCHINARO,
  OPZIONI_EVENTO_MAX,
  OPZIONI_EVENTO_MIN,
  OVERALL_PANCHINARO,
  PESO_CATEGORIA_EVENTO,
  PROB_UN_EVENTO,
  PROB_ZERO_EVENTI,
  QUOTA_SPRINT_FINALE,
  SOGLIA_ANTI_RIPETIZIONE,
  SOGLIA_FIDUCIA_CATEGORIA_RARA,
  clamp,
  validaEffetti,
} from './rules';
import { giocatoriInCrisi } from './morale';
import { hashString, prng } from './random';

export const CATEGORIE_EVENTO: readonly CategoriaEvento[] = ['giocatore', 'societa', 'tifosi_media'];

// ---------------------------------------------------------------------------
// Pesca del turno (PRD 4.3: il codice decide struttura, l'LLM riempie)
// ---------------------------------------------------------------------------

/**
 * Quanti eventi-decisione genera il turno: 0 (15%), 1 (60%), 2 (25%).
 * Anti-cluster: se le ultime `consecutiveConDue` settimane avevano già 2 eventi
 * e siamo al limite, si forza 0/1 (mai 3 settimane di fila con 2 eventi).
 * Deterministico: seme = carriera|settimana (come simulaRisultato).
 */
export function pescaCountEventi(seed: string, consecutiveConDue: number): number {
  const rand = prng(hashString(seed));
  const r = rand();
  if (consecutiveConDue >= MAX_CONSECUTIVI_DUE_EVENTI) {
    return r < PROB_ZERO_EVENTI ? 0 : 1;
  }
  if (r < PROB_ZERO_EVENTI) return 0;
  if (r < PROB_ZERO_EVENTI + PROB_UN_EVENTO) return 1;
  return MAX_EVENTI_TURNO;
}

/**
 * Settimane consecutive (dall'ultima) con ≥2 eventi: base dell'anti-cluster.
 * Le settimane contano solo se consecutive: 2,2,1 → 2; 2,1,2 → 1.
 */
export function settimaneConsecutiveConDueEventi(eventi: Evento[]): number {
  if (eventi.length === 0) return 0;
  const maxSettimana = Math.max(...eventi.map((e) => e.settimana));
  let count = 0;
  for (let s = maxSettimana; s >= 1; s--) {
    const quanti = eventi.filter((e) => e.settimana === s).length;
    if (quanti >= 2) {
      count++;
    } else if (quanti > 0) {
      break; // la catena si interrompe a una settimana con 0/1 eventi
    }
    // settimana senza eventi: la catena continua (il turno esiste, è solo vuoto)
  }
  return count;
}

/**
 * Fase della stagione per il prompt (PRD 4.3: la progressione stagionale guida
 * la credibilità: gli eventi di ottobre sono diversi da quelli di aprile).
 */
export type FaseStagione = 'avvio' | 'lotta' | 'sprint_finale';

export function faseStagione(settimana: number, giornateTotali: number): FaseStagione {
  if (giornateTotali <= 0) return 'avvio';
  const quota = settimana / giornateTotali;
  if (quota >= QUOTA_SPRINT_FINALE) return 'sprint_finale';
  if (quota <= 0.25) return 'avvio';
  return 'lotta';
}

// ---------------------------------------------------------------------------
// Pool categorie pesato con gating (categorie rare = situazioni estreme)
// ---------------------------------------------------------------------------

export interface InputPoolCategorie {
  /** Categorie usate nelle ultime settimane (cooldown, PRD 4.3) */
  ultimeCategorie: CategoriaEvento[];
  fiduciaSocieta: number;
  fiduciaTifosi: number;
  /** Le ultime 2 partite sono entrambe sconfitte (sblocca tifosi/media) */
  strisciaNegativa: boolean;
  /** Eventi rari (società/tifosi) già usati in questa stagione (cap stagionale) */
  eventiRariStagione: { societa: number; tifosi_media: number };
  /** true = sprint finale: la pressione sblocca anche le categorie rare */
  sprintFinale: boolean;
}

/**
 * Pool di categorie PESATO e filtrato per il turno:
 * - cooldown: categorie usate negli ultimi 2 turni escluse (PRD 4.3)
 * - gating: società e tifosi/media entrano SOLO in situazioni estreme
 *   (fiducia bassa, striscia negativa, sprint finale) e mai oltre il cap
 *   stagionale (MAX_EVENTI_RARI_STAGIONE): nel calcio reale i momenti
 *   decisivi societari sono 2-4 a stagione, non rumore settimanale
 * - pesi: giocatore dominante (PESO_CATEGORIA_EVENTO)
 */
export function poolCategorie(input: InputPoolCategorie): CategoriaEvento[] {
  const vietate = new Set(input.ultimeCategorie.slice(0, COOLDOWN_CATEGORIA_TURNI * MAX_EVENTI_TURNO));
  const pool: CategoriaEvento[] = [];

  if (!vietate.has('giocatore')) pool.push('giocatore');

  const climaTeso = input.fiduciaSocieta < SOGLIA_FIDUCIA_CATEGORIA_RARA || input.fiduciaTifosi < SOGLIA_FIDUCIA_CATEGORIA_RARA;
  if (
    !vietate.has('societa') &&
    input.eventiRariStagione.societa < MAX_EVENTI_RARI_STAGIONE &&
    (climaTeso || input.sprintFinale)
  ) {
    pool.push('societa');
  }
  if (
    !vietate.has('tifosi_media') &&
    input.eventiRariStagione.tifosi_media < MAX_EVENTI_RARI_STAGIONE &&
    (input.strisciaNegativa || input.fiduciaTifosi < SOGLIA_FIDUCIA_CATEGORIA_RARA || input.sprintFinale)
  ) {
    pool.push('tifosi_media');
  }

  return pool.length > 0 ? pool : ['giocatore'];
}

/**
 * Categorie del turno: `count` categorie DISTINTE pescate dal pool pesato
 * (pesi PESO_CATEGORIA_EVENTO). Deterministico: seme = seed|indice.
 */
export function pescaCategorie(seed: string, count: number, pool: CategoriaEvento[]): CategoriaEvento[] {
  if (pool.length === 0) return [];
  const estratti: CategoriaEvento[] = [];
  const rimanenti = [...pool];
  for (let i = 0; i < count && rimanenti.length > 0; i++) {
    const pesoTotale = rimanenti.reduce((somma, c) => somma + PESO_CATEGORIA_EVENTO[c], 0);
    const rand = prng(hashString(`${seed}|categoria|${i}`));
    let bersaglio = rand() * pesoTotale;
    let scelta = rimanenti[0];
    for (const c of rimanenti) {
      bersaglio -= PESO_CATEGORIA_EVENTO[c];
      if (bersaglio <= 0) {
        scelta = c;
        break;
      }
    }
    if (scelta === undefined) break;
    estratti.push(scelta);
    rimanenti.splice(rimanenti.indexOf(scelta), 1);
  }
  return estratti;
}

// ---------------------------------------------------------------------------
// Candidati giocatori (PRD 4.1: stato strutturato al modello, pool con etichette)
// ---------------------------------------------------------------------------

export interface CandidatoGiocatore {
  nome: string;
  motivo: string;
}

/**
 * Pool di candidati della rosa con l'etichetta del perché sono coerenti con un
 * evento: crisi di morale, panchinaro (overall alto, pochi minuti), in
 * recupero, gioiello del vivaio, leader, top player. L'LLM cita SOLO questi
 * nomi; il fallback usa lo stesso pool per gli hint di sostituzione.
 */
export function candidatiPerCategoria(giocatori: Giocatore[]): CandidatoGiocatore[] {
  const giaVisti = new Set<Id>();
  const candidati: CandidatoGiocatore[] = [];
  const aggiungi = (g: Giocatore, motivo: string): void => {
    if (giaVisti.has(g.id)) return;
    giaVisti.add(g.id);
    candidati.push({ nome: g.nome, motivo });
  };

  for (const g of giocatoriInCrisi(giocatori)) {
    aggiungi(g, `morale in crisi (${g.morale}/100)`);
  }
  const panchinari = giocatori
    .filter(
      (g) =>
        g.overall >= OVERALL_PANCHINARO &&
        g.minutiStagione < MINUTI_PANCHINARO &&
        !(g.infortunioFinoA !== undefined && g.infortunioFinoA > 0),
    )
    .sort((a, b) => b.overall - a.overall);
  for (const g of panchinari) {
    const promessa = g.promesse.some((p) => p.stato === 'attiva' && p.tipo === 'titolare');
    aggiungi(g, promessa ? 'poco impiegato nonostante la promessa di titolarità' : `poco impiegato (${g.minutiStagione} minuti)`);
  }
  for (const g of giocatori) {
    if (g.infortunioFinoA !== undefined && g.infortunioFinoA > 0) {
      aggiungi(g, `in recupero dall'infortunio`);
    }
  }
  for (const g of giocatori) {
    if (g.giovane) aggiungi(g, 'gioiello del vivaio');
  }
  for (const g of giocatori) {
    if (g.leader) aggiungi(g, 'leader dello spogliatoio');
  }
  const top = [...giocatori].sort((a, b) => b.overall - a.overall || a.nome.localeCompare(b.nome, 'it')).slice(0, 3);
  for (const g of top) {
    aggiungi(g, 'il più forte della rosa');
  }
  for (const g of [...giocatori].sort((a, b) => b.morale - a.morale || a.nome.localeCompare(b.nome, 'it'))) {
    aggiungi(g, 'morale alto, in fiducia');
  }
  // Fondo casuale: chiunque può finire in un evento (situazioni personali)
  for (const g of [...giocatori].sort((a, b) => a.nome.localeCompare(b.nome, 'it'))) {
    aggiungi(g, 'situazione personale o infortunio in allenamento');
  }
  return candidati.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Normalizzazione nomi e similarità testi (validazione, PRD 4.2)
// ---------------------------------------------------------------------------

/** Minuscole, senza accenti, solo alfanumerici, parole ordinate. */
export function normalizzaNome(nome: string): string {
  const pulito = nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return pulito.split(' ').sort().join(' ');
}

/** Match fuzzy: uguali normalizzati, oppure "Nome Cognome" ↔ "Cognome Nome". */
export function nomiEquivalenti(a: string, b: string): boolean {
  const na = normalizzaNome(a);
  const nb = normalizzaNome(b);
  if (na === nb) return true;
  const ta = na.split(' ');
  const tb = nb.split(' ');
  if (ta.length > 1 && [...ta].reverse().join(' ') === nb) return true;
  if (tb.length > 1 && [...tb].reverse().join(' ') === na) return true;
  return false;
}

const STOPWORD_IT = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'di', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
  'e', 'ed', 'o', 'che', 'non', 'si', 'al', 'alla', 'ai', 'agli', 'alle', 'del', 'dello', 'della', 'dei',
  'degli', 'delle', 'nel', 'nello', 'nella', 'nei', 'negli', 'nelle', 'dal', 'dallo', 'dalla', 'dai',
  'dagli', 'dalle', 'piu', 'meno', 'come', 'cui', 'ha', 'ho', 'hai', 'hanno', 'sono', 'era', 'stato',
  'sta', 'stanno', 'essere', 'avere', 'dopo', 'prima', 'anche', 'solo', 'gia', 'fino', 'oltre', 'molto',
]);

/** Token di un testo: minuscole, senza accenti, stopword escluse. */
function tokenizza(testo: string): Set<string> {
  return new Set(
    testo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORD_IT.has(t)),
  );
}

/** Similarità Jaccard tra due testi (0-1): base dello scarto anti-ripetizione. */
export function similaritaTesti(a: string, b: string): number {
  const ta = tokenizza(a);
  const tb = tokenizza(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersezione = 0;
  for (const t of ta) {
    if (tb.has(t)) intersezione++;
  }
  return intersezione / (ta.size + tb.size - intersezione);
}

// ---------------------------------------------------------------------------
// Validazione semantica della proposta LLM (PRD 4.2: doppia rete di sicurezza)
// ---------------------------------------------------------------------------

export interface ContestoValidazione {
  /** Categorie pescate dall'engine: gli eventi devono corrispondere (PRD 4.3) */
  categorieRichieste: CategoriaEvento[];
  /** Nomi canonici della rosa (per match fuzzy e riscrittura) */
  rosa: string[];
  /** Eventi già in archivio (anti-ripetizione, ultimi FINESTRA_ANTI_RIPETIZIONE) */
  ultimiEventi: Evento[];
}

/**
 * Filtra la proposta LLM:
 * - scarta eventi con categoria non richiesta
 * - scarta eventi che citano giocatori non in rosa (allucinazione; i nomi citati
 *   vengono riscritti nella forma canonica della rosa)
 * - clamp degli effetti proposti a ±10 (validaEffetti)
 * - opzioni 2-4 (sotto si scarta, sopra si tronca)
 * - scarta eventi troppo simili all'archivio (Jaccard ≥ soglia)
 * - notizie: solo stringhe non vuote, max MAX_NOTIZIE
 * Ritorna la proposta filtrata (può avere 0 eventi: il chiamante decide il fallback).
 */
export function validaPropostaEventi(proposta: PropostaEventi, contesto: ContestoValidazione): PropostaEventi {
  const richieste = new Set(contesto.categorieRichieste);

  const trovaNomeCanonico = (citato: string): string | null => {
    for (const nome of contesto.rosa) {
      if (nomiEquivalenti(citato, nome)) return nome;
    }
    return null;
  };

  const eventiValidi = proposta.eventi
    .filter((e) => richieste.has(e.categoria))
    .filter((e) => {
      // Nomi citati: tutti devono esistere in rosa (match fuzzy)
      const canonici = e.giocatoriCoinvolti.map(trovaNomeCanonico);
      return canonici.every((c) => c !== null);
    })
    .map((e) => {
      const giocatoriCoinvolti = e.giocatoriCoinvolti.map((n) => trovaNomeCanonico(n) ?? n);
      // Effetti fisici (infortuni narrativi): solo giocatori in rosa, durata
      // clampata 1..MAX_SETTIMANE_INFORTUNIO_EVENTO, nome in forma canonica
      const effettiFisici = (e.effettiFisici ?? [])
        .map((f) => {
          const canonico = trovaNomeCanonico(f.giocatore);
          if (!canonico) return null;
          return { giocatore: canonico, settimane: clamp(f.settimane, 1, MAX_SETTIMANE_INFORTUNIO_EVENTO) };
        })
        .filter((f): f is { giocatore: string; settimane: number } => f !== null);
      const opzioni = e.opzioni
        .filter((o) => o.testo.trim().length > 0)
        .map((o) => ({ testo: o.testo.trim(), effettiProposti: validaEffetti(o.effettiProposti) }))
        .slice(0, OPZIONI_EVENTO_MAX);
      return {
        ...e,
        giocatoriCoinvolti,
        effettiFisici: effettiFisici.length > 0 ? effettiFisici : undefined,
        opzioni,
      };
    })
    .filter((e) => e.opzioni.length >= OPZIONI_EVENTO_MIN)
    .filter((e) => {
      const testoNuovo = `${e.titolo} ${e.testo}`;
      for (const passato of contesto.ultimiEventi) {
        if (similaritaTesti(testoNuovo, `${passato.titolo} ${passato.testo}`) >= SOGLIA_ANTI_RIPETIZIONE) {
          return false;
        }
      }
      return true;
    });

  return {
    eventi: eventiValidi.slice(0, MAX_EVENTI_TURNO),
    notizie: proposta.notizie.filter((n) => n.trim().length > 0).slice(0, MAX_NOTIZIE),
  };
}

// ---------------------------------------------------------------------------
// Selezione giocatore per hint (fallback offline, PRD 4.6)
// ---------------------------------------------------------------------------

/**
 * Sceglie il giocatore più coerente con l'hint del template di fallback
 * (o casuale per le situazioni personali). Deterministico: seme = seed|hint.
 */
export function selezionaPerHint(giocatori: Giocatore[], hint: HintSelezioneGiocatore, seed: string): Giocatore | null {
  if (giocatori.length === 0) return null;
  const rand = prng(hashString(`${seed}|hint|${hint}`));
  const casuale = (): Giocatore => {
    const g = giocatori[Math.floor(rand() * giocatori.length)];
    return g ?? giocatori[0]!;
  };

  switch (hint) {
    case 'crisi_morale':
      return (
        [...giocatori].sort((a, b) => a.morale - b.morale)[0] ??
        casuale()
      );
    case 'panchinaro': {
      const candidati = giocatori.filter(
        (g) => g.overall >= OVERALL_PANCHINARO && g.minutiStagione < MINUTI_PANCHINARO,
      );
      return candidati.sort((a, b) => b.overall - a.overall)[0] ?? casuale();
    }
    case 'infortunato': {
      const infortunati = giocatori.filter((g) => g.infortunioFinoA !== undefined && g.infortunioFinoA > 0);
      return infortunati.sort((a, b) => (b.infortunioFinoA ?? 0) - (a.infortunioFinoA ?? 0))[0] ?? casuale();
    }
    case 'giovane': {
      const giovani = giocatori.filter((g) => g.giovane);
      return giovani.sort((a, b) => b.overall - a.overall)[0] ?? casuale();
    }
    case 'leader': {
      const leader = giocatori.filter((g) => g.leader);
      return leader.sort((a, b) => b.overall - a.overall)[0] ?? casuale();
    }
    case 'rottura':
      return [...giocatori].sort((a, b) => b.overall - a.overall)[0] ?? casuale();
    case 'casuale':
      return casuale();
  }
}

// ---------------------------------------------------------------------------
// Infortuni narrativi (PRD 4.2 esteso: l'evento "infortunio in allenamento"
// diventa un fatto di rosa — il giocatore è davvero out, come da richiesta)
// ---------------------------------------------------------------------------

/**
 * Conseguenze fisiche degli eventi del turno: per ogni evento con effettiFisici
 * il giocatore citato risulta infortunato per `settimane` dalla settimana del
 * turno. Pura: ritorna la mappa giocatoreId → nuovo infortunioFinoA (chi non
 * compare non viene toccato). Il chiamante registra il prima/dopo per il rollback.
 */
export function conseguenzeInfortuni(
  eventi: Array<Pick<Evento, 'effettiFisici'>>,
  giocatori: Giocatore[],
  settimanaTurno: number,
): Map<Id, number> {
  const perNome = new Map(giocatori.map((g) => [normalizzaNome(g.nome), g]));
  const conseguenze = new Map<Id, number>();
  for (const evento of eventi) {
    for (const effetto of evento.effettiFisici ?? []) {
      const giocatore = perNome.get(normalizzaNome(effetto.giocatore));
      if (!giocatore) continue;
      const nuovo = settimanaTurno + clamp(effetto.settimane, 1, MAX_SETTIMANE_INFORTUNIO_EVENTO);
      const esistente = conseguenze.get(giocatore.id);
      if (esistente === undefined || nuovo > esistente) {
        conseguenze.set(giocatore.id, nuovo);
      }
    }
  }
  return conseguenze;
}

// ---------------------------------------------------------------------------
// Applicazione degli effetti (PRD 4.1: l'engine applica, l'LLM propone)
// ---------------------------------------------------------------------------

export interface EsitoApplicazioneEvento {
  giocatori: Giocatore[];
  stato: StatoClub;
}

/**
 * Applica gli effetti dell'opzione scelta:
 * - moraleGiocatori → SOLO ai giocatori citati nell'evento (nessun citato = scartato)
 * - fiduciaSocieta / fiduciaTifosi / reputazione → StatoClub (clamp 0-100)
 * Funzione PURE: ritorna nuovi oggetti, non muta gli input.
 */
export function applicaEffettiEvento(
  stato: StatoClub,
  giocatori: Giocatore[],
  evento: Evento,
  scelta: number,
): EsitoApplicazioneEvento {
  const opzione = evento.opzioni[scelta];
  if (!opzione) return { giocatori, stato };
  const effetti = validaEffetti(opzione.effettiProposti);

  const citati = new Set(evento.giocatoriCoinvolti.map(normalizzaNome));
  const daAggiornare = giocatori
    .filter((g) => citati.has(normalizzaNome(g.nome)))
    .map((g) => ({ ...g, morale: clamp(g.morale + effetti.moraleGiocatori) }));

  return {
    giocatori: daAggiornare.length > 0
      ? giocatori.map((g) => daAggiornare.find((d) => d.id === g.id) ?? g)
      : giocatori,
    stato: {
      ...stato,
      fiduciaSocieta: clamp(stato.fiduciaSocieta + effetti.fiduciaSocieta),
      fiduciaTifosi: clamp(stato.fiduciaTifosi + effetti.fiduciaTifosi),
      reputazioneAllenatore: clamp(stato.reputazioneAllenatore + effetti.reputazione),
    },
  };
}

// ---------------------------------------------------------------------------
// Notizie offline (PRD 4.6): cronaca deterministica dai risultati REALI del turno
// ---------------------------------------------------------------------------

export interface InputNotizieOffline {
  /** La tua partita del turno */
  miaPartita: Partita;
  /** Tutte le partite del turno (per l'evidenza CPU) */
  turno: Partita[];
  miaSquadraId: Id;
  /** Nome squadra da id */
  nomeSquadra: (id: Id) => string;
}

/** "Il giornale del giorno dopo" senza LLM: la tua partita + l'evidenza del turno. */
export function notizieOfflineDaTurno(input: InputNotizieOffline): string[] {
  const { miaPartita, turno, miaSquadraId, nomeSquadra } = input;
  const notizie: string[] = [];

  const inCasa = miaPartita.casa === miaSquadraId;
  const avversario = nomeSquadra(inCasa ? miaPartita.trasferta : miaPartita.casa);
  const golMiei = inCasa ? miaPartita.golCasa : miaPartita.golTrasferta;
  const golLoro = inCasa ? miaPartita.golTrasferta : miaPartita.golCasa;
  const sede = inCasa ? 'in casa' : 'in trasferta';
  const marcatori = miaPartita.marcatori?.length
    ? ` A segno: ${miaPartita.marcatori.slice(0, 2).join(' e ')}${miaPartita.marcatori.length > 2 ? ' e altri' : ''}.`
    : '';

  if (golMiei > golLoro) {
    notizie.push(`Il ${nomeSquadra(miaSquadraId)} batte ${golMiei}-${golLoro} ${avversario} ${sede}.${marcatori}`);
  } else if (golMiei === golLoro) {
    notizie.push(`Pareggio ${golMiei}-${golLoro} ${sede} contro ${avversario} per il ${nomeSquadra(miaSquadraId)}.`);
  } else {
    notizie.push(`Sconfitta amara ${golLoro}-${golMiei} ${sede} contro ${avversario} per il ${nomeSquadra(miaSquadraId)}.`);
  }

  // Evidenza CPU: la sorpresa più grossa (scarto rating non noto qui → uso la
  // partita col maggior numero di gol, o quella più vicina se tutto noioso)
  const cpu = turno.filter((p) => p.id !== miaPartita.id);
  if (cpu.length > 0) {
    const piuGol = [...cpu].sort(
      (a, b) => b.golCasa + b.golTrasferta - (a.golCasa + a.golTrasferta),
    )[0];
    if (piuGol) {
      const scarto = Math.abs(piuGol.golCasa - piuGol.golTrasferta);
      const testa = nomeSquadra(piuGol.casa);
      const coda = nomeSquadra(piuGol.trasferta);
      if (piuGol.golCasa === piuGol.golTrasferta) {
        notizie.push(`Finisce ${piuGol.golCasa}-${piuGol.golTrasferta} tra ${testa} e ${coda}: niente sorprese, tante recriminazioni.`);
      } else if (scarto >= 3) {
        notizie.push(`Tennis anche in campionato: ${testa}-${coda} ${piuGol.golCasa}-${piuGol.golTrasferta}.`);
      } else {
        notizie.push(`${testa}-${coda} ${piuGol.golCasa}-${piuGol.golTrasferta}: tre punti pesanti in chiave classifica.`);
      }
    }
  }

  return notizie.slice(0, MAX_NOTIZIE);
}
