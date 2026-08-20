// FLM — Generazione della stagione completa (PRD 7.1): tutte le competizioni,
// calendari con date reali, sorteggi deterministici. Funzioni PURE.
//
// Regole di perimetro (decisioni utente):
// - Campionati: TUTTE le leghe UEFA del DB girano (servono per gli accessi);
//   eventi giocatore solo per la lega dell'utente.
// - Coppe nazionali: tutte girano (la vincitrice alimenta gli accessi);
//   eventi giocatore solo per la coppa della nazione dell'utente.
// - UCL/UEL/UECL: league phase + playoff qualificazione (ultimo turno) + tabellone;
//   eventi giocatore per tutte.
// - Supercoppe nazionali + Supercoppa UEFA.
// - Playoff: pool = club FL26 (sostituzione nazione→forza dei nomi reali);
//   la squadra dell'utente gioca il playoff se il suo accesso lo prevede.

import type { Competizione, Giocatore, Id, Partita, Squadra } from '../../types/entities';
import type { AccessoEuropeo } from '../../data/accessi';
import type { AncoraStagione } from '../../data/calendarioStagioni';
import { PLAYOFF_UCL_2026_27, PLAYOFF_UEL_2026_27, PLAYOFF_UECL_2026_27 } from '../../data/playoffReali';
import { generaCalendario } from '../calendario';
import { legaPerSquadra } from '../carriera';
import { hashString } from '../random';
import {
  fineSettimanaLiberi,
  settimanaDiData,
  slotDiData,
} from './calendarioStagione';
import { CONFIG_PER_TIPO, type NomeFase } from './config';
import type { PoolSostituzione } from './sostituzione';
import { sostituisciPlayoff } from './sostituzione';

/** Sentinella per le squadre dei turni da determinare (knockout). */
export const SQUADRA_DA_ASSEGNARE = '__tbd__' as Id;

export interface CompetizioneGenerata {
  competizione: Competizione;
  partite: Partita[];
  /** Fasce del sorteggio league phase (report) */
  fasce?: Id[][];
}

export interface InputGenerazioneStagione {
  carrieraId: Id;
  stagione: string;
  ancore: AncoraStagione;
  /** Nazione dell'utente (per coppa/supercoppa nazionali) */
  nazioneUtente: string;
  /** Lega dell'utente */
  legaUtente: string;
  /** TUTTI i club europei disponibili (template clonato per la carriera) */
  squadre: Squadra[];
  /** Rosa per squadra (solo lega utente: per gli eventi giocatore) */
  rosaUtente: Giocatore[];
  /** Accessi europei della stagione (seme reale o dalla stagione simulata) */
  accessi: AccessoEuropeo[];
  /** Vincitrici coppe nazionali dell'anno precedente (per supercoppe e detentrici) */
  vincitriciCoppe: Record<string, string>;
  /** Campioni nazionali dell'anno precedente */
  campioniNazionali: Record<string, string>;
  /** Campioni in carica UCL/UEL (per la Supercoppa UEFA) */
  campioneUcl: string;
  campioneUel: string;
  poolPlayoff: PoolSostituzione;
  /** Id della squadra dell'utente (per il playoff giocabile) */
  squadraUtenteId: Id;
}

/** Crea una partita base con tutti i campi del modello. */
function partita(input: {
  carrieraId: Id;
  competizioneId: Id;
  casa: Id;
  trasferta: Id;
  data: string;
  fase: string;
  giornata: number;
  gamba?: 1 | 2;
  neutra?: boolean;
}): Partita {
  const ancore = ANCORE_ATTIVE; // impostato dal chiamante (vedi sotto)
  return {
    id: '',
    carrieraId: input.carrieraId,
    competizioneId: input.competizioneId,
    giornata: input.giornata,
    casa: input.casa,
    trasferta: input.trasferta,
    golCasa: 0,
    golTrasferta: 0,
    marcatori: [],
    giocata: false,
    settimana: settimanaDiData(input.data, ancore.inizio),
    slot: slotDiData(input.data),
    fase: input.fase,
    gamba: input.gamba,
    neutra: input.neutra ?? false,
  };
}

// Le ancore vengono iniettate via variabile di modulo per tenere `partita` semplice.
let ANCORE_ATTIVE: AncoraStagione;

const id = (carrieraId: Id, prefisso: string, contatore: { n: number }): Id =>
  `${carrieraId}-${prefisso}-${contatore.n++}`;

interface Generatore {
  carrieraId: Id;
  ancore: AncoraStagione;
  contatore: { n: number };
}

/** Campionato (girone andata/ritorno) con giornate nei weekend liberi. */
function generaCampionato(
  g: Generatore,
  squadre: Squadra[],
  nomeLega: string,
  stagione: string,
): CompetizioneGenerata {
  const competizione: Competizione = {
    id: id(g.carrieraId, 'camp', g.contatore),
    carrieraId: g.carrieraId,
    nome: nomeLega,
    tipo: 'campionato',
    formato: 'girone',
    stagione,
    fase: 'andata',
    squadre: squadre.map((s) => s.id),
  };
  const finestra = g.ancore.campionatiBig5[nomeLega] ?? {
    inizio: g.ancore.campionatiBig5['Serie A']!.inizio,
    fine: g.ancore.campionatiBig5['Serie A']!.fine,
  };
  const weekend = fineSettimanaLiberi(finestra.inizio, finestra.fine, g.ancore.pauseFifa);
  const base = generaCalendario(squadre.map((s) => s.id), competizione.id, g.carrieraId);
  const partite = base.map((p) => {
    // Giornata N → sabato N della finestra: TUTTE le partite del matchday
    // condividono lo stesso weekend (l'indice globale di base NON è il matchday).
    const data = weekend[p.giornata - 1] ?? finestra.fine;
    return {
      ...partita({
        carrieraId: g.carrieraId,
        competizioneId: competizione.id,
        casa: p.casa,
        trasferta: p.trasferta,
        data,
        // Girone all'italiana: andata fino alla giornata N-1, poi ritorno
        fase: p.giornata <= squadre.length - 1 ? 'andata' : 'ritorno',
        giornata: p.giornata,
      }),
      id: p.id,
    };
  });
  return { competizione, partite };
}

/**
 * Coppa nazionale (formato uniforme, decisione utente): tutte secche, top 8
 * agli ottavi, gli altri nei turni preliminari che riducono a 8, finale neutra.
 */
function generaCoppaNazionale(
  g: Generatore,
  squadreNazione: Squadra[],
  nazione: string,
  stagione: string,
  seed: number,
): CompetizioneGenerata {
  const competizione: Competizione = {
    id: id(g.carrieraId, `coppa-${nazione}`, g.contatore),
    carrieraId: g.carrieraId,
    nome: `Coppa ${nazione}`,
    tipo: 'coppa_nazionale',
    formato: 'eliminazione_diretta',
    stagione,
    fase: 'preliminare',
    squadre: squadreNazione.map((s) => s.id),
  };
  const turni = g.ancore.coppeNazionali[nazione] ?? {
    preliminari: ['2026-08-12', '2026-08-19', '2026-09-23'],
    ottavi: '2026-12-02',
    quarti: '2027-02-10',
    semifinali: '2027-04-21',
    finale: '2027-05-12',
  };

  const rand = (seed: number) => {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  };
  const r = rand(seed);
  const shuffle = <T>(arr: T[]): T[] => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const a = out[i];
      const b = out[j];
      if (a === undefined || b === undefined) continue;
      out[i] = b;
      out[j] = a;
    }
    return out;
  };

  // Struttura generica: dimensione ottavi = massima potenza di 2 ≤ N;
  // metà teste di serie (top per rating), le altre ridotte dai turni preliminari
  // (con bye se dispari), poi eliminazione diretta fino alla finale.
  const n = squadreNazione.length;
  let potenza = 1;
  while (potenza * 2 <= n) potenza *= 2; // massima potenza di 2 ≤ n
  const testeSerieCount = Math.floor(potenza / 2);
  const ordinatePerRating = [...squadreNazione].sort((a, b) => b.rating - a.rating);
  const seededIds = ordinatePerRating.slice(0, testeSerieCount).map((s) => s.id);
  const nonSeededIds = squadreNazione
    .filter((s) => !seededIds.includes(s.id))
    .map((s) => s.id);

  // Turni preliminari: riducono i nonSeeded a testeSerieCount vincenti.
  const obiettivo = testeSerieCount;
  const turniNecessari = Math.max(
    0,
    Math.ceil(Math.log2(Math.max(1, nonSeededIds.length / obiettivo))),
  );
  const datePreliminari = turni.preliminari.slice(0, turniNecessari);
  const partite: Partita[] = [];
  let giornata = 0;
  let faseCorrente: NomeFase = 'preliminare';

  let pool = shuffle(nonSeededIds);
  for (const data of datePreliminari) {
    // Riduci il pool a 2*obiettivo con bye, poi abbina a coppie.
    const daMantenere = obiettivo * 2;
    pool = pool.slice(0, daMantenere);
    const prossimo: Id[] = [];
    for (let i = 0; i < pool.length; i += 2) {
      const casa = pool[i]!;
      const trasferta = pool[i + 1]!;
      partite.push(
        partita({
          carrieraId: g.carrieraId,
          competizioneId: competizione.id,
          casa,
          trasferta,
          data,
          fase: faseCorrente,
          giornata: ++giornata,
        }),
      );
      prossimo.push(casa, trasferta);
    }
    pool = prossimo;
    faseCorrente = faseCorrente === 'preliminare' ? 'primo_turno' : 'secondo_turno';
  }

  // Turno principale: vincenti preliminari (o nonSeeded se nessun preliminare)
  // vs teste di serie, poi via fino alla finale.
  const vincenti = pool.length === obiettivo ? pool : nonSeededIds.slice(0, obiettivo);
  if (vincenti.length !== obiettivo || seededIds.length !== obiettivo) {
    throw new Error(
      `Coppa ${nazione}: struttura non bilanciata (vincenti ${vincenti.length}, teste di serie ${seededIds.length}, attesi ${obiettivo})`,
    );
  }
  const testeSerieOrdinate = shuffle(seededIds);
  const sfide: Array<[Id, Id]> = vincenti.map((v, i) => [v, testeSerieOrdinate[i]!]);
  const turnoPrincipale = obiettivo === 16 ? 'ottavi' : obiettivo === 8 ? 'quarti' : obiettivo === 4 ? 'semifinali' : 'finale';
  for (const [casa, trasferta] of sfide) {
    partite.push(
      partita({
        carrieraId: g.carrieraId,
        competizioneId: competizione.id,
        casa,
        trasferta,
        data: turnoPrincipale === 'ottavi' ? turni.ottavi : turnoPrincipale === 'quarti' ? turni.quarti : turnoPrincipale === 'semifinali' ? turni.semifinali : turni.finale,
        fase: turnoPrincipale,
        giornata: ++giornata,
      }),
    );
  }
  const fasiDopo: Array<[NomeFase, string, boolean]> =
    turnoPrincipale === 'ottavi'
      ? [['quarti', turni.quarti, false], ['semifinali', turni.semifinali, false], ['finale', turni.finale, true]]
      : turnoPrincipale === 'quarti'
        ? [['semifinali', turni.semifinali, false], ['finale', turni.finale, true]]
        : turnoPrincipale === 'semifinali'
          ? [['finale', turni.finale, true]]
          : [];
  for (const [nome, data, neutra] of fasiDopo) {
    const num = nome === 'quarti' ? 4 : nome === 'semifinali' ? 2 : 1;
    for (let i = 0; i < num; i++) {
      partite.push(
        partita({
          carrieraId: g.carrieraId,
          competizioneId: competizione.id,
          casa: '' as Id, // da riempire con le vincitrici (avanzaSettimana)
          trasferta: '' as Id,
          data,
          fase: nome,
          giornata: ++giornata,
          neutra,
        }),
      );
    }
  }

  return { competizione, partite };
}

/** Supercoppa nazionale: campione vs vincitrice coppa (secca, neutra). */
function generaSupercoppaNazionale(
  g: Generatore,
  squadre: Squadra[],
  nazione: string,
  stagione: string,
  campione: string,
  vincitriceCoppa: string,
): CompetizioneGenerata | null {
  const perNome = new Map(squadre.map((s) => [s.nome, s]));
  const c = perNome.get(campione);
  const v = perNome.get(vincitriceCoppa);
  if (!c || !v || c.id === v.id) return null;
  const competizione: Competizione = {
    id: id(g.carrieraId, `supercoppa-${nazione}`, g.contatore),
    carrieraId: g.carrieraId,
    nome: `Supercoppa ${nazione}`,
    tipo: 'supercoppa',
    formato: 'partita_secca',
    stagione,
    fase: 'finale',
    squadre: [c.id, v.id],
  };
  return {
    competizione,
    partite: [
      partita({
        carrieraId: g.carrieraId,
        competizioneId: competizione.id,
        casa: c.id,
        trasferta: v.id,
        data: g.ancore.supercoppeNazionali,
        fase: 'finale',
        giornata: 1,
        neutra: true,
      }),
    ],
  };
}

/** Supercoppa UEFA: campione UCL vs campione UEL (secca, neutra). */
function generaSupercoppaUefa(
  g: Generatore,
  squadre: Squadra[],
  stagione: string,
  campioneUcl: string,
  campioneUel: string,
): CompetizioneGenerata | null {
  const perNome = new Map(squadre.map((s) => [s.nome, s]));
  const c = perNome.get(campioneUcl);
  const v = perNome.get(campioneUel);
  if (!c || !v || c.id === v.id) return null;
  const competizione: Competizione = {
    id: id(g.carrieraId, 'supercoppa-uefa', g.contatore),
    carrieraId: g.carrieraId,
    nome: 'Supercoppa UEFA',
    tipo: 'supercoppa',
    formato: 'partita_secca',
    stagione,
    fase: 'finale',
    squadre: [c.id, v.id],
  };
  return {
    competizione,
    partite: [
      partita({
        carrieraId: g.carrieraId,
        competizioneId: competizione.id,
        casa: c.id,
        trasferta: v.id,
        data: g.ancore.uefa.supercoppaUefa,
        fase: 'finale',
        giornata: 1,
        neutra: true,
      }),
    ],
  };
}

export interface OutputGenerazioneStagione {
  competizioni: Competizione[];
  partite: Partita[];
  /** Per competizione: fasce sorteggio (report) */
  reportFasce: Map<Id, Id[][]>;
  /** Squadre della lega utente (id) — comodità */
  legaUtenteIds: Id[];
  /** La squadra dell'utente */
  squadraUtenteId: Id;
}

/**
 * Genera TUTTE le competizioni della stagione. Le partite dei turni successivi
 * al primo di ogni eliminazione diretta nascono come placeholder (casa/trasferta
 * vuoti) e vengono riempite da avanzaSettimana quando la fase precedente finisce.
 */
export function generaStagione(input: InputGenerazioneStagione): OutputGenerazioneStagione {
  ANCORE_ATTIVE = input.ancore;
  const g: Generatore = {
    carrieraId: input.carrieraId,
    ancore: input.ancore,
    contatore: { n: 1 },
  };

  const perNome = new Map<string, Squadra>();
  for (const s of input.squadre) {
    const chiave = s.nome.toLowerCase();
    if (!perNome.has(chiave)) perNome.set(chiave, s);
  }
  const club = input.squadre.filter((s) => !s.ombra && !s.nazionale);
  const clubPerNazione = new Map<string, Squadra[]>();
  for (const s of club) {
    const lista = clubPerNazione.get(s.nazione) ?? [];
    lista.push(s);
    clubPerNazione.set(s.nazione, lista);
  }

  const competizioni: Competizione[] = [];
  const tuttePartite: Partita[] = [];
  const reportFasce = new Map<Id, Id[][]>();

  // --- Campionati: tutte le leghe UEFA del DB ---
  // Risoluzione condivisa con il wizard (legaPerSquadra): il CSV dell'editor
  // non ha la colonna League, quindi il campionato arriva dal match per nome
  // (src/data/leagues.ts). Esclusi nazionali e gruppi fallback per nazione.
  const leghe = new Set(
    club.map((s) => legaPerSquadra(s)).filter((c) => c !== 'Nazionali' && !c.startsWith('Squadre di ')),
  );
  const legaUtenteIds: Id[] = [];
  const squadraUtenteId: Id = input.squadraUtenteId;
  for (const lega of leghe) {
    const squadreLega = club.filter((s) => legaPerSquadra(s) === lega);
    if (squadreLega.length < 2) continue;
    const gen = generaCampionato(g, squadreLega, lega, input.stagione);
    competizioni.push(gen.competizione);
    tuttePartite.push(...gen.partite);
    if (lega === input.legaUtente) {
      legaUtenteIds.push(...squadreLega.map((s) => s.id));
    }
  }

  // --- Coppe nazionali: tutte le nazioni con club ---
  const nazioniConClub = [...clubPerNazione.keys()];
  for (const nazione of nazioniConClub) {
    const squadreNazione = clubPerNazione.get(nazione)!;
    if (squadreNazione.length < 8) continue; // troppo poche: coppa non generata
    const gen = generaCoppaNazionale(
      g,
      squadreNazione,
      nazione,
      input.stagione,
      hashString(`${input.carrieraId}|coppa|${nazione}`),
    );
    competizioni.push(gen.competizione);
    tuttePartite.push(...gen.partite);
  }

  // --- Supercoppe nazionali ---
  for (const nazione of nazioniConClub) {
    const campione = input.campioniNazionali[nazione];
    const vincitrice = input.vincitriciCoppe[nazione];
    if (!campione || !vincitrice) continue;
    const gen = generaSupercoppaNazionale(g, club, nazione, input.stagione, campione, vincitrice);
    if (gen) {
      competizioni.push(gen.competizione);
      tuttePartite.push(...gen.partite);
    }
  }

  // --- Supercoppa UEFA ---
  const su = generaSupercoppaUefa(g, club, input.stagione, input.campioneUcl, input.campioneUel);
  if (su) {
    competizioni.push(su.competizione);
    tuttePartite.push(...su.partite);
  }

  // --- UCL / UEL / UECL ---
  for (const tipo of ['champions_league', 'europa_league', 'conference_league'] as const) {
    const config = CONFIG_PER_TIPO[tipo];
    const diretti = input.accessi.filter((a) => a.competizione === tipo && a.turno === 'league_phase');
    const playoffAccessi = input.accessi.filter((a) => a.competizione === tipo && a.turno === 'playoff');

    const risolvi = (a: AccessoEuropeo): Squadra | undefined => perNome.get(a.squadra.toLowerCase());

    const squadreDirette: Squadra[] = [];
    for (const a of diretti) {
      const s = risolvi(a);
      if (s && !squadreDirette.some((x) => x.id === s.id)) squadreDirette.push(s);
    }

    const competizione: Competizione = {
      id: id(g.carrieraId, tipo, g.contatore),
      carrieraId: g.carrieraId,
      nome: config.nomeDefault,
      tipo,
      formato: 'league_phase',
      stagione: input.stagione,
      fase: 'playoff_qualificazione',
      squadre: [],
    };

    const partite: Partita[] = [];
    const dataPlayoff = input.ancore.uefa[tipo === 'champions_league' ? 'ucl' : tipo === 'europa_league' ? 'uel' : 'uecl'];

    // Playoff di qualificazione: coppie reali sostituite con club FL26
    const reali = tipo === 'champions_league'
      ? [...PLAYOFF_UCL_2026_27.ch, ...PLAYOFF_UCL_2026_27.lp]
      : tipo === 'europa_league'
        ? [...PLAYOFF_UEL_2026_27.mp, ...PLAYOFF_UEL_2026_27.cp]
        : [...PLAYOFF_UECL_2026_27.mp, ...PLAYOFF_UECL_2026_27.ch];

    const giaUsati = new Set<string>(squadreDirette.map((s) => s.id));
    const sostituiti = sostituisciPlayoff(reali, input.poolPlayoff, giaUsati);

    // Squadra utente nel playoff: la inseriamo in una sfida
    const utenteAccesso = playoffAccessi.find((a) => risolvi(a)?.id === squadraUtenteId);

    const sfide: Array<[Squadra, Squadra]> = [];
    for (let i = 0; i + 1 < sostituiti.length; i += 2) {
      sfide.push([sostituiti[i]!.club, sostituiti[i + 1]!.club]);
    }
    // Se il numero è dispari o manca l'utente, sistema
    if (utenteAccesso) {
      const utente = risolvi(utenteAccesso)!;
      if (sfide.length === 0) {
        const avversaria = sostituiti[0]?.club;
        if (avversaria) sfide.push([utente, avversaria]);
      } else if (!sostituiti.some((x) => x.club.id === utente.id)) {
        sfide[0] = [utente, sfide[0]![1]];
      }
    }

    let giornata = 0;
    for (const [a, b] of sfide) {
      giornata++;
      partite.push(
        partita({
          carrieraId: g.carrieraId,
          competizioneId: competizione.id,
          casa: a.id,
          trasferta: b.id,
          data: dataPlayoff.playoff.andata,
          fase: 'playoff_qualificazione',
          giornata,
          gamba: 1,
        }),
      );
      partite.push(
        partita({
          carrieraId: g.carrieraId,
          competizioneId: competizione.id,
          casa: b.id,
          trasferta: a.id,
          data: dataPlayoff.playoff.ritorno,
          fase: 'playoff_qualificazione',
          giornata,
          gamba: 2,
        }),
      );
    }

    // League phase: il sorteggio avviene quando i playoff sono conclusi
    // (le vincitrici si aggiungono ai diretti). Qui creiamo SOLO i segnaposto
    // delle fasi knockout successive; le partite LP le genera avanzaSettimana.
    const faseUefa = dataPlayoff.fase;
    // Segnaposto knockout (riempiti da avanzaSettimana)
    for (const [nome, numSfide, dataAndata, dataRitorno] of [
      ['playoff', 8, faseUefa.playoffAndata, faseUefa.playoffRitorno],
      ['ottavi', 8, faseUefa.ottaviAndata, faseUefa.ottaviRitorno],
      ['quarti', 4, faseUefa.quartiAndata, faseUefa.quartiRitorno],
      ['semifinali', 2, faseUefa.semifinaliAndata, faseUefa.semifinaliRitorno],
      ['finale', 1, faseUefa.finale, faseUefa.finale],
    ] as Array<[NomeFase, number, string, string]>) {
      const andataRitorno = nome !== 'finale';
      const neutra = nome === 'finale';
      for (let i = 0; i < numSfide; i++) {
        giornata++;
        const crea = (casa: Id, trasferta: Id, data: string, gamba?: 1 | 2): Partita =>
          partita({
            carrieraId: g.carrieraId,
            competizioneId: competizione.id,
            casa,
            trasferta,
            data,
            fase: nome,
            giornata,
            gamba,
            neutra,
          });
        if (andataRitorno) {
          partite.push(crea(SQUADRA_DA_ASSEGNARE, SQUADRA_DA_ASSEGNARE, dataAndata, 1));
          partite.push(crea(SQUADRA_DA_ASSEGNARE, SQUADRA_DA_ASSEGNARE, dataRitorno, 2));
        } else {
          partite.push(crea(SQUADRA_DA_ASSEGNARE, SQUADRA_DA_ASSEGNARE, dataAndata));
        }
      }
    }

    // Salva la competizione con le squadre dirette (le vincitrici playoff si
    // aggiungeranno); per il report memorizziamo già le fasce dei diretti.
    competizione.squadre = squadreDirette.map((s) => s.id);
    competizioni.push(competizione);
    tuttePartite.push(...partite);

    // Fasce report dei diretti (parziali: complete dopo i playoff)
    const ordinati = [...squadreDirette].sort((a, b) => b.coefficiente - a.coefficiente);
    const numeroFasce = config.numeroFasce ?? 4;
    const perFascia = Math.ceil(ordinati.length / numeroFasce);
    const fasce: Id[][] = [];
    for (let f = 0; f < numeroFasce; f++) {
      fasce.push(ordinati.slice(f * perFascia, (f + 1) * perFascia).map((s) => s.id));
    }
    reportFasce.set(competizione.id, fasce);
  }

  return {
    competizioni,
    partite: tuttePartite,
    reportFasce,
    legaUtenteIds,
    squadraUtenteId,
  };
}
