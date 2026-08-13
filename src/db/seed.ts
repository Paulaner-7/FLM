// FLM — Seed di prova: una lega finta per testare modello dati e invarianti (PRD 7.2).
// Deterministico: stessi nomi e stessi valori a ogni esecuzione (niente Math.random),
// così i test sono ripetibili. Idempotente: non duplica nulla se il DB è già pieno.

import { db, newId } from './database';
import { creaCarriera } from './carriere';
import type {
  Giocatore,
  Squadra,
  SquadAssignment,
} from '../types/entities';

export const STAGIONE_DEMO = '2025/26';

const NOMI = [
  'Luca', 'Marco', 'Alessandro', 'Davide', 'Simone', 'Federico', 'Matteo', 'Andrea',
  'Giuseppe', 'Antonio', 'Paolo', 'Stefano', 'Giorgio', 'Roberto', 'Francesco', 'Daniele',
  'Cristiano', 'Emanuele', 'Nicola', 'Salvatore', 'Michele', 'Riccardo', 'Tommaso', 'Gabriele', 'Lorenzo',
];

const COGNOMI = [
  'Bianchi', 'Rossi', 'Ferrari', 'Esposito', 'Romano', 'Colombo', 'Ricci', 'Marino',
  'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Costa', 'Giordano', 'Mancini',
  'Rizzo', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana', 'Santoro', 'Mariani', 'Rinaldi', 'Caruso',
];

/** Distribuzione ruoli in una rosa da 20 (2 portieri, 7 difensori, 7 centrocampisti, 4 attaccanti) */
const RUOLI: ReadonlyArray<readonly [ruolo: string, quanti: number]> = [
  ['portiere', 2],
  ['difensore', 7],
  ['centrocampista', 7],
  ['attaccante', 4],
];

interface SquadraDemo {
  nome: string;
  /** Livello interno 1-5 usato SOLO per generare gli overall della rosa demo */
  forza: number;
  /** Rating Elo iniziale (derivato dalla media overall della rosa, vedi engine/rating.ts) */
  rating: number;
  coefficiente: number;
  budget: number;
  reputazione: number;
  ombra: boolean;
  /** Campionato demo: valorizzato solo sulle squadre giocabili */
  campionato?: string;
}

const SQUADRE_DEMO: SquadraDemo[] = [
  { nome: 'FC Meridiana', forza: 4, rating: 1820, coefficiente: 45, budget: 15_000_000, reputazione: 70, ombra: false, campionato: 'Serie FLM' },
  { nome: 'US Levante', forza: 3, rating: 1700, coefficiente: 30, budget: 10_000_000, reputazione: 55, ombra: false, campionato: 'Serie FLM' },
  { nome: 'AC Borgo', forza: 2, rating: 1580, coefficiente: 18, budget: 6_000_000, reputazione: 40, ombra: false, campionato: 'Serie FLM' },
  { nome: 'SS Falco', forza: 1, rating: 1460, coefficiente: 8, budget: 3_000_000, reputazione: 25, ombra: false, campionato: 'Serie FLM' },
  { nome: 'Real Torre', forza: 2, rating: 1580, coefficiente: 12, budget: 5_000_000, reputazione: 30, ombra: true },
  { nome: 'FC Montecchio', forza: 1, rating: 1460, coefficiente: 5, budget: 2_000_000, reputazione: 20, ombra: true },
];

export interface EsitoSeed {
  squadre: number;
  giocabili: number;
  ombre: number;
  giocatori: number;
  assegnazioni: number;
  partite: number;
  competizioni: number;
  carriere: number;
}

/** Livello 1-4 per generare gli overall della rosa demo (inverso di ratingInizialeDaMedia). */
function livelloDaRating(rating: number): number {
  return Math.min(4, Math.max(1, Math.round((rating - 1400) / 90)));
}

function ruoloPerIndice(ji: number): string {
  let acc = 0;
  for (const [ruolo, quanti] of RUOLI) {
    acc += quanti;
    if (ji < acc) return ruolo;
  }
  return 'difensore';
}

async function conteggi(): Promise<EsitoSeed> {
  const squadre = (await db.squadre.toArray()).filter((s) => s.carrieraId === undefined);
  const giocatori = (await db.giocatori.toArray()).filter((g) => g.carrieraId === undefined);
  const assegnazioni = (await db.squadAssignments.toArray()).filter((a) => a.carrieraId === undefined);
  return {
    squadre: squadre.length,
    giocabili: squadre.filter((s) => !s.ombra).length,
    ombre: squadre.filter((s) => s.ombra).length,
    giocatori: giocatori.length,
    assegnazioni: assegnazioni.length,
    partite: await db.partite.count(),
    competizioni: await db.competizioni.count(),
    carriere: await db.carriere.count(),
  };
}

const TABELLE = [
  db.carriere,
  db.squadre,
  db.giocatori,
  db.squadAssignments,
  db.partite,
  db.competizioni,
  db.statoClub,
  db.eventi,
  db.transferLedger,
] as const;

/**
 * Popola il database con la lega demo: 4 squadre giocabili × 20 giocatori,
 * 2 squadre ombra, assegnazioni di proprietà, e crea UNA carriera demo tramite
 * il vero flusso di creazione (dogfooding del motore: snapshot del campionato
 * "Serie FLM", calendario completo andata/ritorno, StatoClub iniziale).
 * Con `force: true` svuota tutto e rigenera.
 */
export async function seedDemo(opzioni: { force?: boolean } = {}): Promise<EsitoSeed> {
  const { force = false } = opzioni;
  if (!force && (await db.squadre.count()) > 0) return conteggi();

  await db.transaction('rw', [...TABELLE], async () => {
    if (force) {
      for (const tabella of TABELLE) await tabella.clear();
    }

    const squadre: Squadra[] = SQUADRE_DEMO.map((s) => ({
      id: newId(),
      pesId: null,
      nome: s.nome,
      nazione: 'ITA',
      nazionale: false,
      campionato: s.campionato,
      rating: s.rating,
      ratingInizioStagione: s.rating,
      coefficiente: s.coefficiente,
      budget: s.budget,
      reputazione: s.reputazione,
      ombra: s.ombra,
    }));
    const giocabili = squadre.filter((s) => !s.ombra);
    // Media overall per squadra: base del budget di carriera (piazzamento stimato)
    const mediaPerSquadra = new Map<string, number>();
    giocabili.forEach((squadra) => {
      let somma = 0;
      for (let ji = 0; ji < 20; ji++) {
        const overall = 58 + (livelloDaRating(squadra.rating) - 1) * 6 + ((ji * 7) % 9) - 4;
        somma += overall;
      }
      mediaPerSquadra.set(squadra.id, somma / 20);
    });
    for (const squadra of squadre) {
      squadra.mediaOverall = mediaPerSquadra.get(squadra.id);
    }

    const perSquadra = new Map<string, Giocatore[]>();
    const giocatori: Giocatore[] = [];
    const assegnazioni: SquadAssignment[] = [];

    giocabili.forEach((squadra, si) => {
      const rosa: Giocatore[] = [];
      for (let ji = 0; ji < 20; ji++) {
        const eta = ji >= 17 ? 17 + (ji % 3) : 17 + ((si * 3 + ji * 5) % 19);
        const overall = 58 + (livelloDaRating(squadra.rating) - 1) * 6 + ((ji * 7) % 9) - 4;
        const g: Giocatore = {
          id: newId(),
          pesId: null,
          nome: `${NOMI[(si * 5 + ji) % NOMI.length]} ${COGNOMI[(si * 7 + ji * 3) % COGNOMI.length]}`,
          nazionalita: 'ITA',
          eta,
          ruolo: ruoloPerIndice(ji),
          overall,
          morale: 55 + ((si * 2 + ji * 3) % 31),
          fiducia: 50,
          forma: 50 + ((si * 4 + ji * 7) % 36),
          minutiStagione: 0,
          promesse: [],
          leader: ji === 5,
          giovane: ji >= 17,
          infortunioFinoA: ji === 3 ? 5 : undefined,
          valoreMercato: Math.max(50_000, overall * 1_000 + (26 - eta) * 12_000),
        };
        rosa.push(g);
        giocatori.push(g);
        assegnazioni.push({
          id: newId(),
          giocatoreId: g.id,
          squadraId: squadra.id,
          tipo: 'proprieta',
          dal: STAGIONE_DEMO,
        });
      }
      perSquadra.set(squadra.id, rosa);
    });

    await db.squadre.bulkAdd(squadre);
    await db.giocatori.bulkAdd(giocatori);
    await db.squadAssignments.bulkAdd(assegnazioni);
  });

  // Carriera demo creata con il vero motore (snapshot + calendario + StatoClub)
  const meridiana = (await db.squadre.toArray()).find((s) => s.nome === 'FC Meridiana');
  if (meridiana) {
    await creaCarriera({
      squadraTemplateId: meridiana.id,
      obiettivo: 'coppe',
      campionato: 'Serie FLM',
      stagione: STAGIONE_DEMO,
    });
  }

  return conteggi();
}
