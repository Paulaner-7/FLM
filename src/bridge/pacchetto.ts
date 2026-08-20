// FLM — Pacchetto export coordinato per PES Editor (PRD 7.5, decisione utente).
// Un'unica azione "Esporta per PES Editor" genera i 3 file dell'ecosistema editor
// (Players completo, Roster completo, Teams-Players completo) con l'intero
// database giocatori come lo vede FLM: nuovi creati, cambiati aggiornati,
// intoccati identici alla sorgente (import = no-op). Idempotente e self-healing.
// Il backup dell'EDIT file è un reminder della UI (PRD 7.4).

import { db } from '../db/database';
import { assegnazioniACsv, giocatoriACsv, rosterACsv } from './csv';
import { EXPORT_ASSIGNMENTS_FILE, EXPORT_PLAYERS_FILE, EXPORT_ROSTER_FILE } from '../engine/rules';
import type { Id } from '../types/entities';

export interface PacchettoEditor {
  carrieraId: Id;
  stagione: string;
  files: Array<{ nome: string; contenuto: string; descrizione: string }>;
  /** Riepilogo per la UI */
  riepilogo: {
    giocatoriTotali: number;
    giocatoriNuovi: number;
    giocatoriAggiornati: number;
    prestitiAttivi: number;
  };
}

/**
 * Costruisce il pacchetto completo per la carriera: Players (tutti, righe
 * complete), Roster (tutte le squadre reali, slot+numeri), Teams-Players
 * (tutte le assegnazioni attive, proprietà + prestiti).
 */
export async function esportaPacchettoEditor(carrieraId: Id): Promise<PacchettoEditor> {
  const [carriera, giocatori, squadre, assegnazioni] = await Promise.all([
    db.carriere.get(carrieraId),
    db.giocatori.where('carrieraId').equals(carrieraId).toArray(),
    db.squadre.where('carrieraId').equals(carrieraId).toArray(),
    db.squadAssignments.where('carrieraId').equals(carrieraId).toArray(),
  ]);
  if (!carriera) throw new Error('Carriera inesistente');

  const conPesId = giocatori.filter((g) => g.pesId !== null);
  const nuovi = conPesId.filter((g) => g.creatoDaFlm);
  const aggiornati = conPesId.filter(
    (g) => !g.creatoDaFlm && g.attributi && g.attributi.OverallStats !== g.overall,
  );
  const prestitiAttivi = assegnazioni.filter((a) => a.tipo === 'prestito' && a.al === undefined);

  return {
    carrieraId,
    stagione: carriera.stagione,
    files: [
      {
        nome: EXPORT_PLAYERS_FILE,
        contenuto: giocatoriACsv(conPesId),
        descrizione: 'Giocatori (completo: nuovi creati, cambiati aggiornati, intoccati invariati)',
      },
      {
        nome: EXPORT_ROSTER_FILE,
        contenuto: rosterACsv(squadre, giocatori, assegnazioni),
        descrizione: 'Rose per squadra (slot 1-40 + numeri maglia)',
      },
      {
        nome: EXPORT_ASSIGNMENTS_FILE,
        contenuto: assegnazioniACsv(assegnazioni, giocatori, squadre),
        descrizione: 'Assegnazioni giocatore → club (proprietà + prestiti)',
      },
    ],
    riepilogo: {
      giocatoriTotali: conPesId.length,
      giocatoriNuovi: nuovi.length,
      giocatoriAggiornati: aggiornati.length,
      prestitiAttivi: prestitiAttivi.length,
    },
  };
}
