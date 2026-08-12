// FLM — Database locale (Dexie / IndexedDB)
// Regola 1 AGENTS.md: ogni dato persistente passa da qui. Mai localStorage diretto.
// Schema allineato alle entità del PRD (sezione 3.4 e 7.2).

import Dexie, { type EntityTable } from 'dexie';

import type { Squadra, Giocatore, Partita, StatoClub, Evento } from '../types/entities';

export const DB_NAME = 'flm';

/** Chiave del record singolo di StatoClub (PRD 3.4: "un record solo") */
export const STATO_CLUB_ID = 'default' as const;

export class FlmDatabase extends Dexie {
  squadre!: EntityTable<Squadra, 'id'>;
  giocatori!: EntityTable<Giocatore, 'id'>;
  partite!: EntityTable<Partita, 'id'>;
  statoClub!: EntityTable<StatoClub, 'id'>;
  eventi!: EntityTable<Evento, 'id'>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      squadre: 'id, nome',
      giocatori: 'id, squadraId, ruolo',
      partite: 'id, giornata, giocata',
      statoClub: 'id',
      eventi: 'id, settimana, categoria, tipo',
    });
  }
}

export const db = new FlmDatabase();
