// FLM — Sorteggi (PRD 7.1: fasce per coefficiente, vincoli nazione, procedure reali).
//
// FONTI (verifica web, agosto 2026 — docs/verifica-web.md §6):
// - League phase: 36 squadre, fasce per coefficiente; ogni squadra affronta
//   2 avversarie per fascia (1 casa/1 fuori) in UCL/UEL, 1 per fascia in UECL;
//   MAI avversarie della stessa associazione; MAX 2 avversarie dalla stessa
//   altra associazione. La UEFA estrae le squadre a mano e il software assegna
//   le avversarie: qui l'intero sorteggio è un backtracking deterministico
//   (seme da carriera+stagione), che replica gli stessi vincoli.
// - Playoff eliminazione: 9-16 teste di serie vs 17-24 non teste di serie,
//   sorteggio in 4 sezioni del bracket predeterminato; teste di serie in casa
//   al ritorno. Ottavi: 1-8 vs vincitrici playoff, stesso meccanismo.
//   QF/SF: accoppiamenti PREDETERMINATI dal bracket (nessun sorteggio).

import type { Id } from '../../types/entities';
import { hashString, prng } from '../random';

export interface SquadraSorteggio {
  id: Id;
  nome: string;
  nazione: string;
  coefficiente: number;
}

export interface ConfigSorteggioLeaguePhase {
  /** 8 per UCL/UEL, 6 per UECL */
  partite: number;
  /** 2 per UCL/UEL, 1 per UECL */
  avversariePerFascia: number;
  /** 4 per UCL/UEL, 6 per UECL */
  numeroFasce: number;
}

export interface AvversariaSorteggiata {
  id: Id;
  /** true = la squadra gioca in casa contro questa avversaria */
  inCasa: boolean;
  fascia: number;
}

export interface EsitoSorteggioLeaguePhase {
  /** Fasce: array di ID (indice 0 = fascia 1) */
  fasce: Id[][];
  /** Per squadra: le avversarie assegnate */
  avversarie: Map<Id, AvversariaSorteggiata[]>;
}

interface StatoSquadra {
  id: Id;
  nazione: string;
  fascia: number;
  /** Quante avversarie servono ancora per ogni fascia (indice) */
  bisogni: number[];
  caseRimanenti: number;
  trasferteRimanenti: number;
  /** Nazioni già affrontate → conteggio (max 2 per nazione diversa dalla propria) */
  nazioniAffrontate: Map<string, number>;
  avversarie: AvversariaSorteggiata[];
}

/**
 * Ordina le squadre in fasce per coefficiente decrescente (regola UEFA:
 * la campionessa in carica è sempre testa di serie in fascia 1 — il chiamante
 * la mette già prima nell'input se serve).
 */
export function creaFasce(
  squadre: SquadraSorteggio[],
  numeroFasce: number,
): Id[][] {
  const ordinate = [...squadre].sort(
    (a, b) => b.coefficiente - a.coefficiente || a.nome.localeCompare(b.nome, 'it'),
  );
  const perFascia = Math.ceil(ordinate.length / numeroFasce);
  const fasce: Id[][] = [];
  for (let f = 0; f < numeroFasce; f++) {
    fasce.push(ordinate.slice(f * perFascia, (f + 1) * perFascia).map((s) => s.id));
  }
  return fasce;
}

/**
 * Sorteggio della league phase con vincoli reali UEFA (procedura computer draw):
 * backtracking deterministico seminato, con BUDGET di nodi e retry a semi
 * progressivi (il backtracking puro può esplodere: mai oltre i limiti di tempo).
 * Ogni squadra riceve avversariePerFascia avversarie per fascia, bilanciando
 * casa/trasferta (metà e metà in totale).
 */
export function sorteggioLeaguePhase(
  squadre: SquadraSorteggio[],
  config: ConfigSorteggioLeaguePhase,
  seed: number,
): EsitoSorteggioLeaguePhase {
  if (squadre.length === 0) return { fasce: [], avversarie: new Map() };
  let ultimoErrore: unknown = null;
  for (let tentativo = 0; tentativo < 40; tentativo++) {
    try {
      return tentaSorteggio(squadre, config, (seed + tentativo * 104729) >>> 0);
    } catch (e) {
      ultimoErrore = e;
    }
  }
  throw new Error(
    `Sorteggio league phase impossibile dopo 40 tentativi (${squadre.length} squadre): ${String(ultimoErrore)}`,
  );
}

/** Budget massimo di nodi di backtracking per tentativo. */
const BUDGET_NODI_SORTEGGIO = 300_000;

function tentaSorteggio(
  squadre: SquadraSorteggio[],
  config: ConfigSorteggioLeaguePhase,
  seed: number,
): EsitoSorteggioLeaguePhase {
  const fasce = creaFasce(squadre, config.numeroFasce);
  const fasciaDi = new Map<Id, number>();
  fasce.forEach((f, i) => f.forEach((id) => fasciaDi.set(id, i)));

  const stato = new Map<Id, StatoSquadra>();
  for (const s of squadre) {
    const f = fasciaDi.get(s.id) ?? 0;
    stato.set(s.id, {
      id: s.id,
      nazione: s.nazione,
      fascia: f,
      bisogni: Array.from({ length: config.numeroFasce }, () => config.avversariePerFascia),
      caseRimanenti: config.partite / 2,
      trasferteRimanenti: config.partite / 2,
      nazioniAffrontate: new Map(),
      avversarie: [],
    });
  }

  // Ordine di lavorazione: squadre per coefficiente decrescente (come il draw reale).
  const ordine = [...squadre]
    .sort((a, b) => b.coefficiente - a.coefficiente || a.nome.localeCompare(b.nome, 'it'))
    .map((s) => s.id);

  const rand = prng(seed);
  const shuffle = <T>(arr: T[]): T[] => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const a = out[i];
      const b = out[j];
      if (a === undefined || b === undefined) continue;
      out[i] = b;
      out[j] = a;
    }
    return out;
  };

  /** Vincoli nazione tra due squadre (regola reale). */
  const nazioniOk = (a: StatoSquadra, b: StatoSquadra): boolean => {
    if (a.nazione === b.nazione) return false;
    const aVsB = a.nazioniAffrontate.get(b.nazione) ?? 0;
    const bVsA = b.nazioniAffrontate.get(a.nazione) ?? 0;
    return aVsB < 2 && bVsA < 2;
  };

  /** Abbina T e C: decrementa bisogni incrociati e registra nazioni. */
  const abbina = (t: StatoSquadra, c: StatoSquadra, tInCasa: boolean): void => {
    t.bisogni[c.fascia]!--;
    c.bisogni[t.fascia]!--;
    if (tInCasa) {
      t.caseRimanenti--;
      c.trasferteRimanenti--;
    } else {
      t.trasferteRimanenti--;
      c.caseRimanenti--;
    }
    t.nazioniAffrontate.set(c.nazione, (t.nazioniAffrontate.get(c.nazione) ?? 0) + 1);
    c.nazioniAffrontate.set(t.nazione, (c.nazioniAffrontate.get(t.nazione) ?? 0) + 1);
    t.avversarie.push({ id: c.id, inCasa: tInCasa, fascia: c.fascia });
    c.avversarie.push({ id: t.id, inCasa: !tInCasa, fascia: t.fascia });
  };

  const disabbina = (t: StatoSquadra, c: StatoSquadra, tInCasa: boolean): void => {
    t.bisogni[c.fascia]!++;
    c.bisogni[t.fascia]!++;
    if (tInCasa) {
      t.caseRimanenti++;
      c.trasferteRimanenti++;
    } else {
      t.trasferteRimanenti++;
      c.caseRimanenti++;
    }
    t.nazioniAffrontate.set(c.nazione, (t.nazioniAffrontate.get(c.nazione) ?? 1) - 1);
    c.nazioniAffrontate.set(t.nazione, (c.nazioniAffrontate.get(t.nazione) ?? 1) - 1);
    t.avversarie.pop();
    c.avversarie.pop();
  };

  let nodi = 0;
  const consumaNodo = (): void => {
    nodi++;
    if (nodi > BUDGET_NODI_SORTEGGIO) throw new Error('budget nodi superato');
  };

  /** Ricerca ricorsiva: squadra corrente riempie i suoi bisogni (fascia più vincolata prima). */
  const risolvi = (index: number): boolean => {
    if (index >= ordine.length) return true;
    const tId = ordine[index];
    if (tId === undefined) return false;
    const t = stato.get(tId);
    if (!t) return false;

    // Scegli la fascia più VINCOLATA tra quelle con bisogni aperti (meno candidate).
    let fasciaScelta = -1;
    let migliorNumeroCandidate = Number.MAX_SAFE_INTEGER;
    let miglioriCandidate: StatoSquadra[] = [];
    for (let f = 0; f < config.numeroFasce; f++) {
      if ((t.bisogni[f] ?? 0) <= 0) continue;
      const candidate = (fasce[f] ?? [])
        .filter((cId) => cId !== t.id)
        .map((cId) => stato.get(cId))
        .filter((c): c is StatoSquadra => c !== undefined)
        .filter((c) => (c.bisogni[t.fascia] ?? 0) > 0)
        .filter((c) => !t.avversarie.some((a) => a.id === c.id))
        .filter((c) => nazioniOk(t, c));
      if (candidate.length < migliorNumeroCandidate) {
        migliorNumeroCandidate = candidate.length;
        fasciaScelta = f;
        miglioriCandidate = candidate;
      }
    }
    if (fasciaScelta === -1) return risolvi(index + 1);
    if (miglioriCandidate.length === 0) return false;

    const candidate = shuffle(miglioriCandidate);
    for (const c of candidate) {
      // Preferisci il lato che riequilibra casa/trasferta di T.
      const opzioniLato: boolean[] = [];
      if (t.caseRimanenti > 0 && c.trasferteRimanenti > 0) opzioniLato.push(true);
      if (t.trasferteRimanenti > 0 && c.caseRimanenti > 0) opzioniLato.push(false);
      const tInCasaPreferito = t.caseRimanenti > t.trasferteRimanenti ? false : true;
      opzioniLato.sort((a, b) => (a === tInCasaPreferito ? -1 : b === tInCasaPreferito ? 1 : 0));

      for (const tInCasa of opzioniLato) {
        consumaNodo();
        abbina(t, c, tInCasa);
        if (risolvi(index)) return true;
        disabbina(t, c, tInCasa);
      }
    }
    return false;
  };

  if (!risolvi(0)) {
    throw new Error('nessuna soluzione con questo seme');
  }

  const avversarie = new Map<Id, AvversariaSorteggiata[]>();
  for (const s of stato.values()) avversarie.set(s.id, s.avversarie);
  return { fasce, avversarie };
}

/** Converte un seed stringa (carriera+stagione) in un intero per la PRNG. */
export function seedSorteggio(carrieraId: Id, stagione: string, competizione: string): number {
  return hashString(`${carrieraId}|${stagione}|${competizione}`) >>> 0;
}

// ---------------------------------------------------------------------------
// Tabellone a eliminazione: sezioni del bracket predeterminato (regola reale)
// ---------------------------------------------------------------------------

/**
 * Playoff eliminazione: teste di serie 9-16 vs non teste di serie 17-24,
 * in 4 sezioni del bracket. Ritorna le sfide (andata/ritorno): la testa di
 * serie gioca il ritorno in casa.
 * Sezioni reali: S1=(9,10|23,24), S2=(11,12|21,22), S3=(13,14|19,20), S4=(15,16|17,18).
 */
export function sorteggioPlayoffEliminazione(
  posizioni: Map<Id, number>,
  seed: number,
): Array<{ testaSerie: Id; nonTestaSerie: Id }> {
  const ordina = (range: number[], preferenza: (pos: number) => boolean): Id[] =>
    [...posizioni.entries()]
      .filter(([, p]) => range.includes(p) && preferenza(p))
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id);

  const sezioni: Array<{ teste: number[]; nonTeste: number[] }> = [
    { teste: [9, 10], nonTeste: [23, 24] },
    { teste: [11, 12], nonTeste: [21, 22] },
    { teste: [13, 14], nonTeste: [19, 20] },
    { teste: [15, 16], nonTeste: [17, 18] },
  ];

  const rand = prng(seed);
  const sfide: Array<{ testaSerie: Id; nonTestaSerie: Id }> = [];
  for (const sezione of sezioni) {
    const teste = ordina(sezione.teste, () => true);
    const nonTeste = ordina(sezione.nonTeste, () => true);
    if (teste.length !== 2 || nonTeste.length !== 2) {
      throw new Error('Bracket playoff incompleto: attese 2+2 squadre per sezione');
    }
    // Ogni testa di serie pesca una delle due non teste di serie della sezione.
    const pesca = rand() < 0.5 ? [0, 1] : [1, 0];
    sfide.push({ testaSerie: teste[0]!, nonTestaSerie: nonTeste[pesca[0]!]! });
    sfide.push({ testaSerie: teste[1]!, nonTestaSerie: nonTeste[pesca[1]!]! });
  }
  return sfide;
}

/**
 * Ottavi: teste di serie 1-8 vs vincitrici playoff, per sezioni del bracket.
 * Vincitrici indicate come "eredi" della sezione (posizione della testa di
 * serie eliminata: chi elimina una testa di serie ne eredita il seeding — reale).
 */
export function sorteggioOttavi(
  posizioni: Map<Id, number>,
  vincitriciPlayoff: Map<number, [Id, Id]>, // sezione (1-4) → le 2 vincitrici
  seed: number,
): Array<{ testaSerie: Id; avversaria: Id }> {
  // Sezioni degli ottavi: (1,2) vs S4, (3,4) vs S3, (5,6) vs S2, (7,8) vs S1.
  const sezioni: Array<{ teste: number[]; sezionePlayoff: number }> = [
    { teste: [1, 2], sezionePlayoff: 4 },
    { teste: [3, 4], sezionePlayoff: 3 },
    { teste: [5, 6], sezionePlayoff: 2 },
    { teste: [7, 8], sezionePlayoff: 1 },
  ];
  const rand = prng(seed);
  const sfide: Array<{ testaSerie: Id; avversaria: Id }> = [];
  for (const s of sezioni) {
    const teste = [...posizioni.entries()]
      .filter(([, p]) => s.teste.includes(p))
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id);
    const vincenti = vincitriciPlayoff.get(s.sezionePlayoff);
    if (teste.length !== 2 || !vincenti || vincenti.some((v) => v === undefined)) {
      throw new Error(`Bracket ottavi incompleto per la sezione ${s.sezionePlayoff}`);
    }
    // Ogni testa di serie pesca una delle due vincitrici della sezione.
    const pesca = rand() < 0.5 ? [0, 1] : [1, 0];
    sfide.push({ testaSerie: teste[0]!, avversaria: vincenti[pesca[0]!]! });
    sfide.push({ testaSerie: teste[1]!, avversaria: vincenti[pesca[1]!]! });
  }
  return sfide;
}

/**
 * Bracket QF/SF predeterminato (regola reale: nessun sorteggio).
 * Input: vincitrici ottavi in ordine di bracket [1..8] → accoppiamenti:
 * QF1: 1vs8, QF2: 2vs7, QF3: 3vs6, QF4: 4vs5; SF1: QF1vsQF2, SF2: QF3vsQF4.
 * Ritorna le sfide dei quarti (le semifinali si derivano in tabellone.ts).
 */
export function accoppiamentiQuarti(vincitriciOttavi: Id[]): Array<[Id, Id]> {
  if (vincitriciOttavi.length !== 8) {
    throw new Error(`Quarti: attese 8 vincitrici, trovate ${vincitriciOttavi.length}`);
  }
  return [
    [vincitriciOttavi[0]!, vincitriciOttavi[7]!],
    [vincitriciOttavi[1]!, vincitriciOttavi[6]!],
    [vincitriciOttavi[2]!, vincitriciOttavi[5]!],
    [vincitriciOttavi[3]!, vincitriciOttavi[4]!],
  ];
}

/** Semifinali dal bracket: QF1 vs QF2 (semifinale 1 = "casa" in finale), QF3 vs QF4. */
export function accoppiamentiSemifinali(vincitriciQuarti: Id[]): Array<[Id, Id]> {
  if (vincitriciQuarti.length !== 4) {
    throw new Error(`Semifinali: attese 4 vincitrici, trovate ${vincitriciQuarti.length}`);
  }
  return [
    [vincitriciQuarti[0]!, vincitriciQuarti[1]!],
    [vincitriciQuarti[2]!, vincitriciQuarti[3]!],
  ];
}
