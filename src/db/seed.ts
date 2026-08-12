// FLM — Seed di prova: una lega finta per testare modello dati e invarianti (PRD 7.2).
// Deterministico: stessi nomi e stessi valori a ogni esecuzione (niente Math.random),
// così i test sono ripetibili. Idempotente: non duplica nulla se il DB è già pieno.

import { db, newId, STATO_CLUB_ID } from './database';
import type {
  Competizione,
  Giocatore,
  Partita,
  Squadra,
  SquadAssignment,
  StatoClub,
  Forza,
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
  forza: Forza;
  coefficiente: number;
  budget: number;
  reputazione: number;
  ombra: boolean;
}

const SQUADRE_DEMO: SquadraDemo[] = [
  { nome: 'FC Meridiana', forza: 4, coefficiente: 45, budget: 15_000_000, reputazione: 70, ombra: false },
  { nome: 'US Levante', forza: 3, coefficiente: 30, budget: 10_000_000, reputazione: 55, ombra: false },
  { nome: 'AC Borgo', forza: 2, coefficiente: 18, budget: 6_000_000, reputazione: 40, ombra: false },
  { nome: 'SS Falco', forza: 1, coefficiente: 8, budget: 3_000_000, reputazione: 25, ombra: false },
  { nome: 'Real Torre', forza: 2, coefficiente: 12, budget: 5_000_000, reputazione: 30, ombra: true },
  { nome: 'FC Montecchio', forza: 1, coefficiente: 5, budget: 2_000_000, reputazione: 20, ombra: true },
];

export interface EsitoSeed {
  squadre: number;
  giocabili: number;
  ombre: number;
  giocatori: number;
  assegnazioni: number;
  partite: number;
  competizioni: number;
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
  const squadre = await db.squadre.toArray();
  return {
    squadre: squadre.length,
    giocabili: squadre.filter((s) => !s.ombra).length,
    ombre: squadre.filter((s) => s.ombra).length,
    giocatori: await db.giocatori.count(),
    assegnazioni: await db.squadAssignments.count(),
    partite: await db.partite.count(),
    competizioni: await db.competizioni.count(),
  };
}

const TABELLE = [
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
 * 2 squadre ombra, assegnazioni di proprietà, 1 campionato con 4 partite giocate
 * e lo StatoClub avviato. Con `force: true` svuota tutto e rigenera.
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
      nome: s.nome,
      nazione: 'ITA',
      forza: s.forza,
      coefficiente: s.coefficiente,
      budget: s.budget,
      reputazione: s.reputazione,
      ombra: s.ombra,
    }));
    const giocabili = squadre.filter((s) => !s.ombra);

    const perSquadra = new Map<string, Giocatore[]>();
    const giocatori: Giocatore[] = [];
    const assegnazioni: SquadAssignment[] = [];

    giocabili.forEach((squadra, si) => {
      const rosa: Giocatore[] = [];
      for (let ji = 0; ji < 20; ji++) {
        const eta = ji >= 17 ? 17 + (ji % 3) : 17 + ((si * 3 + ji * 5) % 19);
        const overall = 58 + (squadra.forza - 1) * 6 + ((ji * 7) % 9) - 4;
        const g: Giocatore = {
          id: newId(),
          pesId: null,
          nome: `${NOMI[(si * 5 + ji) % NOMI.length]} ${COGNOMI[(si * 7 + ji * 3) % COGNOMI.length]}`,
          nazionalita: 'ITA',
          eta,
          ruolo: ruoloPerIndice(ji),
          overall,
          morale: 55 + ((si * 2 + ji * 3) % 31),
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

    const campionato: Competizione = {
      id: newId(),
      nome: 'Serie FLM',
      tipo: 'campionato',
      formato: 'girone',
      stagione: STAGIONE_DEMO,
      fase: 'andata',
      squadre: giocabili.map((s) => s.id),
    };

    const meridiana = giocabili[0];
    const levante = giocabili[1];
    const borgo = giocabili[2];
    const falco = giocabili[3];
    if (!meridiana || !levante || !borgo || !falco) {
      throw new Error('Seed: servono esattamente 4 squadre giocabili');
    }

    const attaccante = (squadra: Squadra, offset: number): string => {
      const rosa = perSquadra.get(squadra.id);
      const attaccanti = (rosa ?? []).filter((g) => g.ruolo === 'attaccante');
      return attaccanti[offset]?.nome ?? squadra.nome;
    };

    // Risultati coerenti con le forze: Meridiana (4) domina, Falco (1) fatica
    const partite: Partita[] = [
      {
        id: newId(),
        competizioneId: campionato.id,
        giornata: 1,
        casa: meridiana.id,
        trasferta: falco.id,
        golCasa: 3,
        golTrasferta: 0,
        marcatori: [attaccante(meridiana, 0), attaccante(meridiana, 1), attaccante(meridiana, 2)],
        giocata: true,
      },
      {
        id: newId(),
        competizioneId: campionato.id,
        giornata: 1,
        casa: levante.id,
        trasferta: borgo.id,
        golCasa: 1,
        golTrasferta: 1,
        marcatori: [attaccante(levante, 0), attaccante(borgo, 0)],
        giocata: true,
      },
      {
        id: newId(),
        competizioneId: campionato.id,
        giornata: 2,
        casa: falco.id,
        trasferta: levante.id,
        golCasa: 0,
        golTrasferta: 2,
        marcatori: [attaccante(levante, 1), attaccante(levante, 2)],
        giocata: true,
      },
      {
        id: newId(),
        competizioneId: campionato.id,
        giornata: 2,
        casa: borgo.id,
        trasferta: meridiana.id,
        golCasa: 0,
        golTrasferta: 1,
        marcatori: [attaccante(meridiana, 3)],
        giocata: true,
      },
    ];

    const statoClub: StatoClub = {
      id: STATO_CLUB_ID,
      fiduciaSocieta: 65,
      fiduciaTifosi: 60,
      obiettivo: 'Zona europea',
      budget: 15_000_000,
      reputazioneAllenatore: 50,
      settimanaCorrente: 3,
    };

    await db.squadre.bulkAdd(squadre);
    await db.giocatori.bulkAdd(giocatori);
    await db.squadAssignments.bulkAdd(assegnazioni);
    await db.competizioni.add(campionato);
    await db.partite.bulkAdd(partite);
    await db.statoClub.add(statoClub);
  });

  return conteggi();
}
