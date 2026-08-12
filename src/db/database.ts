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
  Carriera,
} from '../types/entities';

export const DB_NAME = 'flm';

/** Genera un ID univoco per le chiavi primarie delle entità */
export function newId(): string {
  return crypto.randomUUID();
}

export class FlmDatabase extends Dexie {
  carriere!: EntityTable<Carriera, 'id'>;
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
    // v3 (M1): mapping PES ID necessario per bootstrap editor idempotente.
    this.version(3).stores({
      squadre: 'id, pesId, nome',
      giocatori: 'id, pesId, ruolo, giovane',
      squadAssignments: 'id, giocatoreId, squadraId, tipo',
      partite: 'id, competizioneId, giornata, giocata',
      competizioni: 'id, tipo, stagione',
      statoClub: 'id',
      eventi: 'id, settimana, categoria, tipo',
      transferLedger: 'id, giocatoreId, aSquadraId, stagione, esito',
    });
    // v4 (M1.5): carriere multiple — "una carriera = un salvataggio".
    // Nuova tabella carriere; carrieraId su tutte le tabelle di carriera;
    // carrieraId/campionato opzionali su squadre, giocatori, assegnazioni
    // (undefined = template del registro globale).
    // L'upgrade svuota SOLO le tabelle di carriera (contenevano dati demo del
    // seed: nessuna carriera reale esisteva); i registri importati restano intatti.
    this.version(4).stores({
      carriere: 'id, squadraId, stagione',
      squadre: 'id, pesId, nome, carrieraId',
      giocatori: 'id, pesId, ruolo, giovane, carrieraId',
      squadAssignments: 'id, giocatoreId, squadraId, tipo, carrieraId',
      partite: 'id, competizioneId, giornata, giocata, carrieraId',
      competizioni: 'id, tipo, stagione, carrieraId',
      statoClub: 'id',
      eventi: 'id, settimana, categoria, tipo, carrieraId',
      transferLedger: 'id, giocatoreId, aSquadraId, stagione, esito, carrieraId',
    }).upgrade(async (tx) => {
      await tx.table('competizioni').clear();
      await tx.table('partite').clear();
      await tx.table('statoClub').clear();
      await tx.table('eventi').clear();
      await tx.table('transferLedger').clear();
    });
    // v5: indice createdAt su carriere (orderBy in listaCarriere).
    // La v4 è già stata distribuita con lo schema senza indice: si dichiara
    // identica (compatibilità con i DB esistenti) e si aggiunge la v5.
    this.version(5).stores({
      carriere: 'id, squadraId, stagione, createdAt',
      squadre: 'id, pesId, nome, carrieraId',
      giocatori: 'id, pesId, ruolo, giovane, carrieraId',
      squadAssignments: 'id, giocatoreId, squadraId, tipo, carrieraId',
      partite: 'id, competizioneId, giornata, giocata, carrieraId',
      competizioni: 'id, tipo, stagione, carrieraId',
      statoClub: 'id',
      eventi: 'id, settimana, categoria, tipo, carrieraId',
      transferLedger: 'id, giocatoreId, aSquadraId, stagione, esito, carrieraId',
    });
  }
}

export const db = new FlmDatabase();
