// FLM — Migrazione diciture nazioni: "PES-215" → "Italia".
// I dati importati prima dell'introduzione della mappa nazioni
// (src/data/countries.ts) hanno salvato "PES-{id}" in nazionalita (giocatori)
// e nazione (squadre). Questa migrazione li normalizza una sola volta,
// comprese le copie delle carriere (stesse tabelle). Idempotente: le righe
// già normalizzate non vengono toccate.

import { db } from './database';
import { nomeNazioneDaStringa } from '../data/countries';
import type { UpdateSpec } from 'dexie';
import type { Giocatore, Squadra } from '../types/entities';

export interface EsitoMigrazioneNazioni {
  giocatori: number;
  squadre: number;
}

const CHUNK = 2000;

interface ModificaGiocatore { key: string; changes: UpdateSpec<Giocatore> }
interface ModificaSquadra { key: string; changes: UpdateSpec<Squadra> }

async function bulkUpdateAChunk<T>(tabella: { bulkUpdate: (modifiche: T[]) => Promise<unknown> }, modifiche: T[]): Promise<void> {
  for (let inizio = 0; inizio < modifiche.length; inizio += CHUNK) {
    await tabella.bulkUpdate(modifiche.slice(inizio, inizio + CHUNK));
  }
}

/**
 * Aggiorna ogni riga con dicitura "PES-{id}" al nome reale.
 * Da eseguire all'avvio, prima del primo render.
 */
export async function migraNazioniPes(): Promise<EsitoMigrazioneNazioni> {
  const giocatori = await db.giocatori.toArray();
  const squadre = await db.squadre.toArray();

  const aggiornamentiGiocatori: ModificaGiocatore[] = giocatori
    .filter((g) => g.nazionalita.startsWith('PES-'))
    .map((g) => ({ key: g.id, changes: { nazionalita: nomeNazioneDaStringa(g.nazionalita) } }));
  const aggiornamentiSquadre: ModificaSquadra[] = squadre
    .filter((s) => s.nazione.startsWith('PES-'))
    .map((s) => ({ key: s.id, changes: { nazione: nomeNazioneDaStringa(s.nazione) } }));

  if (aggiornamentiGiocatori.length === 0 && aggiornamentiSquadre.length === 0) return { giocatori: 0, squadre: 0 };

  await db.transaction('rw', db.giocatori, db.squadre, async () => {
    await bulkUpdateAChunk(db.giocatori, aggiornamentiGiocatori);
    await bulkUpdateAChunk(db.squadre, aggiornamentiSquadre);
  });

  return { giocatori: aggiornamentiGiocatori.length, squadre: aggiornamentiSquadre.length };
}
