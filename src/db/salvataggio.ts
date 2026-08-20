// FLM — Export/import JSON del salvataggio completo (PRD 7.7).
// Regola 1 AGENTS.md: ogni scrittura passa da qui.

import { db } from './database';
import type { Carriera, Giocatore, Id, SquadAssignment, Squadra, StatoClub, Competizione, Partita, Evento, Notizia, PrestazionePartita, TransferLedgerEntry, Trattativa, VoceStoricoStagione, OffertaPanchina } from '../types/entities';

// ---------- Versione schema ----------

const SALVATAGGIO_VERSIONE = 1;

/** Struttura del file JSON esportato */
export interface SalvataggioJSON {
  versione: number;
  carrieraId: string;
  data: string; // ISO timestamp
  tabelle: {
    carriera: Carriera;
    statoClub: StatoClub;
    squadre: Squadra[];
    giocatori: Giocatore[];
    assegnazioni: SquadAssignment[];
    competizioni: Competizione[];
    partite: Partita[];
    prestazioni: PrestazionePartita[];
    eventi: Evento[];
    notizie: Notizia[];
    transferLedger: TransferLedgerEntry[];
    trattative: Trattativa[];
    storicoStagioni: VoceStoricoStagione[];
    offerte: OffertaPanchina[];
  };
}

// ---------- Export ----------

/**
 * Esporta l'intera carriera in un file JSON versionato.
 * Solo le righe con quel carrieraId (il registro template non viene toccato).
 */
export async function esportaSalvataggio(carrieraId: Id): Promise<SalvataggioJSON> {
  const [
    carriera,
    statoClub,
    squadre,
    giocatori,
    assegnazioni,
    competizioni,
    partite,
    prestazioni,
    eventi,
    notizie,
    transferLedger,
    trattative,
    storicoStagioni,
    offerte,
  ] = await Promise.all([
    db.carriere.get(carrieraId),
    db.statoClub.get(carrieraId),
    db.squadre.where('carrieraId').equals(carrieraId).toArray(),
    db.giocatori.where('carrieraId').equals(carrieraId).toArray(),
    db.squadAssignments.where('carrieraId').equals(carrieraId).toArray(),
    db.competizioni.where('carrieraId').equals(carrieraId).toArray(),
    db.partite.where('carrieraId').equals(carrieraId).toArray(),
    db.prestazioni.where('carrieraId').equals(carrieraId).toArray(),
    db.eventi.where('carrieraId').equals(carrieraId).toArray(),
    db.notizie.where('carrieraId').equals(carrieraId).toArray(),
    db.transferLedger.where('carrieraId').equals(carrieraId).toArray(),
    db.trattative.where('carrieraId').equals(carrieraId).toArray(),
    db.storicoStagioni.where('carrieraId').equals(carrieraId).toArray(),
    db.offerte.where('carrieraId').equals(carrieraId).toArray(),
  ]);

  if (!carriera) throw new Error('Carriera inesistente');

  return {
    versione: SALVATAGGIO_VERSIONE,
    carrieraId,
    data: new Date().toISOString(),
    tabelle: {
      carriera,
      statoClub: statoClub!,
      squadre,
      giocatori,
      assegnazioni,
      competizioni,
      partite,
      prestazioni,
      eventi,
      notizie,
      transferLedger,
      trattative,
      storicoStagioni,
      offerte,
    },
  };
}

// ---------- Import ----------

/**
 * Valida e importa un file JSON di salvataggio.
 * Opzione: se esiste già una carriera con lo stesso ID, sostituisci o annulla.
 * Ritorna il numero di righe importate.
 */
export async function importaSalvataggio(
  json: SalvataggioJSON,
  opzione: 'sostituisci' | 'annulla' = 'annulla',
): Promise<{ righe: number; carrieraId: string }> {
  // Validazione versione
  if (json.versione !== SALVATAGGIO_VERSIONE) {
    throw new Error(`Versione salvataggio non supportata: ${json.versione} (attesa ${SALVATAGGIO_VERSIONE})`);
  }

  const carrieraId = json.carrieraId;

  // Controlla esistenza
  const esistente = await db.carriere.get(carrieraId);
  if (esistente) {
    if (opzione === 'annulla') {
      throw new Error('Esiste già una carriera con questo ID. Scegli "sostituisci" per sovrascrivere.');
    }
    // Elimina la carriera esistente in cascata
    await eliminaCarrieraPerImport(carrieraId);
  }

  // Importa in transazione atomica
  const righe = await db.transaction(
    'rw',
    [
      db.carriere,
      db.squadre,
      db.giocatori,
      db.squadAssignments,
      db.competizioni,
      db.partite,
      db.prestazioni,
      db.statoClub,
      db.eventi,
      db.notizie,
      db.transferLedger,
      db.trattative,
      db.storicoStagioni,
      db.offerte,
    ],
    async () => {
      let count = 0;

      await db.carriere.add(json.tabelle.carriera); count++;
      await db.statoClub.add(json.tabelle.statoClub); count++;

      if (json.tabelle.squadre.length > 0) { await db.squadre.bulkAdd(json.tabelle.squadre); count += json.tabelle.squadre.length; }
      if (json.tabelle.giocatori.length > 0) { await db.giocatori.bulkAdd(json.tabelle.giocatori); count += json.tabelle.giocatori.length; }
      if (json.tabelle.assegnazioni.length > 0) { await db.squadAssignments.bulkAdd(json.tabelle.assegnazioni); count += json.tabelle.assegnazioni.length; }
      if (json.tabelle.competizioni.length > 0) { await db.competizioni.bulkAdd(json.tabelle.competizioni); count += json.tabelle.competizioni.length; }
      if (json.tabelle.partite.length > 0) { await db.partite.bulkAdd(json.tabelle.partite); count += json.tabelle.partite.length; }
      if (json.tabelle.prestazioni.length > 0) { await db.prestazioni.bulkAdd(json.tabelle.prestazioni); count += json.tabelle.prestazioni.length; }
      if (json.tabelle.eventi.length > 0) { await db.eventi.bulkAdd(json.tabelle.eventi); count += json.tabelle.eventi.length; }
      if (json.tabelle.notizie.length > 0) { await db.notizie.bulkAdd(json.tabelle.notizie); count += json.tabelle.notizie.length; }
      if (json.tabelle.transferLedger.length > 0) { await db.transferLedger.bulkAdd(json.tabelle.transferLedger); count += json.tabelle.transferLedger.length; }
      if (json.tabelle.trattative.length > 0) { await db.trattative.bulkAdd(json.tabelle.trattative); count += json.tabelle.trattative.length; }
      if (json.tabelle.storicoStagioni.length > 0) { await db.storicoStagioni.bulkAdd(json.tabelle.storicoStagioni); count += json.tabelle.storicoStagioni.length; }
      if (json.tabelle.offerte.length > 0) { await db.offerte.bulkAdd(json.tabelle.offerte); count += json.tabelle.offerte.length; }

      return count;
    },
  );

  return { righe, carrieraId };
}

/** Elimina una carriera e tutto il suo stato (per import con sostituzione). */
async function eliminaCarrieraPerImport(carrieraId: Id): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.carriere, db.squadre, db.giocatori, db.squadAssignments,
      db.competizioni, db.partite, db.prestazioni, db.statoClub,
      db.eventi, db.notizie, db.transferLedger, db.trattative,
      db.storicoStagioni, db.offerte,
    ],
    async () => {
      await db.carriere.delete(carrieraId);
      await db.squadre.where('carrieraId').equals(carrieraId).delete();
      await db.giocatori.where('carrieraId').equals(carrieraId).delete();
      await db.squadAssignments.where('carrieraId').equals(carrieraId).delete();
      await db.competizioni.where('carrieraId').equals(carrieraId).delete();
      await db.partite.where('carrieraId').equals(carrieraId).delete();
      await db.prestazioni.where('carrieraId').equals(carrieraId).delete();
      await db.statoClub.delete(carrieraId);
      await db.eventi.where('carrieraId').equals(carrieraId).delete();
      await db.notizie.where('carrieraId').equals(carrieraId).delete();
      await db.transferLedger.where('carrieraId').equals(carrieraId).delete();
      await db.trattative.where('carrieraId').equals(carrieraId).delete();
      await db.storicoStagioni.where('carrieraId').equals(carrieraId).delete();
      await db.offerte.where('carrieraId').equals(carrieraId).delete();
    },
  );
}
