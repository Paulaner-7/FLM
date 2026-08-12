// FLM — Database locale (Dexie / IndexedDB)
// Regola 1 AGENTS.md: ogni dato persistente passa da qui. Mai localStorage diretto.
// Schema allineato alle entità del PRD (sezione 3.4 e 7.2).

import Dexie, { type EntityTable } from 'dexie';

import type {
  Squadra,
  Giocatore,
  SquadAssignment,
  Partita,
  Competizione,
  StatoClub,
  Evento,
  TransferLedgerEntry,
} from '../types/entities';

export const DB_NAME = 'flm';

/** Chiave del record singolo di StatoClub (PRD 3.4: "un record solo") */
export const STATO_CLUB_ID = 'default' as const;

/** Genera un ID univoco per le chiavi primarie delle entità */
export function newId(): string {
  return crypto.randomUUID();
}

export class FlmDatabase extends Dexie {
  squadre!: EntityTable<Squadra, 'id'>;
  giocatori!: EntityTable<Giocatore, 'id'>;
  squadAssignments!: EntityTable<SquadAssignment, 'id'>;
  partite!: EntityTable<Partita, 'id'>;
  competizioni!: EntityTable<Competizione, 'id'>;
  statoClub!: EntityTable<StatoClub, 'id'>;
  eventi!: EntityTable<Evento, 'id'>;
  transferLedger!: EntityTable<TransferLedgerEntry, 'id'>;

  constructor() {
    super(DB_NAME);
    // v1 (M0): fondamenta iniziali
    this.version(1).stores({
      squadre: 'id, nome',
      giocatori: 'id, squadraId, ruolo',
      partite: 'id, giornata, giocata',
      statoClub: 'id',
      eventi: 'id, settimana, categoria, tipo',
    });
    // v2 (M0.5): modello dati completo PRD 3.4 + 7.2 — 8 tabelle.
    // L'upgrade svuota i dati v1 (non esistevano dati reali: il seed ripopola).
    this.version(2)
      .stores({
        squadre: 'id, nome',
        giocatori: 'id, ruolo, giovane',
        squadAssignments: 'id, giocatoreId, squadraId, tipo',
        partite: 'id, competizioneId, giornata, giocata',
        competizioni: 'id, tipo, stagione',
        statoClub: 'id',
        eventi: 'id, settimana, categoria, tipo',
        transferLedger: 'id, giocatoreId, aSquadraId, stagione, esito',
      })
      .upgrade(async (tx) => {
        await tx.table('squadre').clear();
        await tx.table('giocatori').clear();
        await tx.table('partite').clear();
        await tx.table('statoClub').clear();
        await tx.table('eventi').clear();
      });
  }
}

export const db = new FlmDatabase();
