// FLM — Risoluzione media con cache Dexie (regola 1: la persistenza passa da src/db).
// Chiave = nome normalizzato + contesto (nazione/squadra). Cache negativa:
// url '' = lookup già tentato e fallito → non si richiede più la rete.

import { db, newId } from '../db';
import type { MediaRecord } from '../types/entities';
import {
  cercaLogoCompetizione,
  cercaLogoSquadra,
  cercaVoltoGiocatore,
  normalizzaChiave,
  type MediaTrovato,
} from './provider';

type TipoMedia = MediaRecord['tipo'];

/** Dedup in-flight: stessa chiave = stessa promise (la griglia chiede in parallelo). */
const inVolo = new Map<string, Promise<string>>();

async function risolvi(tipo: TipoMedia, chiave: string, fetcher: () => Promise<MediaTrovato | null>): Promise<string> {
  const cacheKey = `${tipo}|${chiave}`;
  const esistente = await db.media.where('chiave').equals(chiave).and((m) => m.tipo === tipo).first();
  if (esistente) return esistente.url;

  const pendente = inVolo.get(cacheKey);
  if (pendente) return pendente;

  const richiesta = (async (): Promise<string> => {
    const trovato = await fetcher();
    const record: MediaRecord = {
      id: newId(),
      tipo,
      chiave,
      url: trovato?.url ?? '',
      nomeProvider: trovato?.nomeProvider,
      sorgente: 'thesportsdb',
      createdAt: Date.now(),
    };
    try {
      await db.media.put(record);
    } catch {
      // Cache non critica: se la scrittura fallisce si riprova alla prossima sessione
    }
    return record.url;
  })();

  inVolo.set(cacheKey, richiesta);
  try {
    return await richiesta;
  } finally {
    inVolo.delete(cacheKey);
  }
}

export function logoSquadra(nome: string, nazione?: string): Promise<string> {
  return risolvi('logo_squadra', `${normalizzaChiave(nome)}|${normalizzaChiave(nazione ?? '')}`, () =>
    cercaLogoSquadra(nome, nazione),
  );
}

export function voltoGiocatore(nome: string, nomeSquadra?: string): Promise<string> {
  return risolvi('volto_giocatore', `${normalizzaChiave(nome)}|${normalizzaChiave(nomeSquadra ?? '')}`, () =>
    cercaVoltoGiocatore(nome, nomeSquadra),
  );
}

export function logoCompetizione(nome: string, nazione?: string): Promise<string> {
  return risolvi('logo_competizione', `${normalizzaChiave(nome)}|${normalizzaChiave(nazione ?? '')}`, () =>
    cercaLogoCompetizione(nome, nazione),
  );
}
