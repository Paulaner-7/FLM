// FLM — Esecuzione transazionale dei trasferimenti (PRD 7.2: atomicità)
// Divisione dei compiti: le REGOLE vivono in src/engine (regola 3 AGENTS.md),
// la PERSISTENZA solo qui via Dexie (regola 1). Un trasferimento aggiorna entrambe
// le rose in una sola operazione: o tutto o niente.

import { db, newId } from './database';
import {
  pianificaTrasferimento,
  type ParametriTrasferimento,
} from '../engine/invariants';
import type { TransferLedgerEntry } from '../types/entities';

export type EsitoEsecuzione =
  | { ok: true; voceLedger: TransferLedgerEntry }
  | { ok: false; errori: string[] };

/**
 * Esegue un trasferimento in un'unica transazione Dexie:
 * 1. legge uno snapshot coerente (giocatori, squadre, assegnazioni)
 * 2. valida e pianifica con le funzioni pure dell'engine
 * 3. applica: chiude la vecchia proprietà, apre la nuova, scrive il ledger, aggiorna il budget
 * Se una qualsiasi verifica fallisce, nulla viene scritto (atomicità, PRD 7.2).
 */
export async function eseguiTrasferimento(p: ParametriTrasferimento): Promise<EsitoEsecuzione> {
  return db.transaction('rw', db.giocatori, db.squadre, db.squadAssignments, db.transferLedger, async () => {
    const giocatori = await db.giocatori.toArray();
    const squadre = await db.squadre.toArray();
    const assignments = await db.squadAssignments.toArray();

    const esito = pianificaTrasferimento(
      p,
      { giocatori, squadre, assignments },
      { assegnazioneId: newId(), voceId: newId() },
    );
    if (!esito.ok) return { ok: false, errori: esito.errori };

    const { chiusura, nuovaAssegnazione, voceLedger, budgetAggiornato, budgetCedenteAggiornato } = esito.piano;
    await db.squadAssignments.put(chiusura);
    await db.squadAssignments.add(nuovaAssegnazione);
    await db.transferLedger.add(voceLedger);
    await db.squadre.update(p.aSquadraId, { budget: budgetAggiornato });
    await db.squadre.update(p.daSquadraId, { budget: budgetCedenteAggiornato });
    return { ok: true, voceLedger };
  });
}

/**
 * Registra una trattativa saltata (PRD 7.3): nessun cambiamento di stato,
 * solo la voce nel ledger — è materiale narrativo ("i giornali adorano le trattative fallite").
 */
export async function registraTrattativaSaltata(
  p: ParametriTrasferimento,
  motivo: string,
): Promise<TransferLedgerEntry> {
  const voce: TransferLedgerEntry = {
    id: newId(),
    giocatoreId: p.giocatoreId,
    daSquadraId: p.daSquadraId,
    aSquadraId: p.aSquadraId,
    cifra: p.cifra,
    stagione: p.stagione,
    settimana: p.settimana,
    esito: 'saltato',
    motivo,
  };
  await db.transferLedger.add(voce);
  return voce;
}
