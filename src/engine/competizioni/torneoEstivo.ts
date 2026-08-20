// FLM — Generazione torneo estivo: Mondiale (anni pari) / Europeo (dispari) (PRD 7.7).
// Funzioni PURE: la transazione Dexie vive in src/db/nt.ts.

import type { Competizione, Id, Squadra } from '../../types/entities';
import { newId } from '../../db/database';

/** Se è anno di Mondiale (pari) o Europeo (dispari). */
export function annoDiTorneo(stagione: string): 'mondiale' | 'europeo' | null {
  const anno = Number(stagione.split('/')[0]);
  if (!Number.isFinite(anno)) return null;
  return anno % 2 === 0 ? 'mondiale' : 'europeo';
}

/** Numero di partecipanti al torneo per tipo. */
export function partecipantiTorneo(tipo: 'mondiale' | 'europeo'): number {
  return tipo === 'mondiale' ? 32 : 24;
}

/**
 * Seleziona le nazionali partecipanti al torneo dallo snapshot.
 * Le migliori N per rating (mediaOverall della squadra NT nel DB).
 * La tua nazionale (se CT) è inclusa automaticamente.
 */
export function selezionaPartecipanti(
  nazionali: Squadra[],
  n: number,
  nazionaleUtenteId?: Id,
): Squadra[] {
  const ordinate = [...nazionali].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const partecipanti = ordinate.slice(0, n);

  // Assicura che la nazionale dell'utente sia inclusa
  if (nazionaleUtenteId && !partecipanti.some((s) => s.id === nazionaleUtenteId)) {
    const tua = ordinate.find((s) => s.id === nazionaleUtenteId);
    if (tua) {
      partecipanti.pop(); // rimuovi l'ultima per fare spazio
      partecipanti.push(tua);
    }
  }

  return partecipanti;
}

/**
 * Genera i gironi del torneo (sorteggio casuale ponderato per seeding).
 * Le prime N sono teste di serie (una per girone), le restanti estratte a caso.
 */
export function generaGironi(
  partecipanti: Squadra[],
  nGironi: number,
): Array<{ nome: string; squadre: Id[] }> {
  const testeDiSerie = partecipanti.slice(0, nGironi);
  const resto = partecipanti.slice(nGironi);

  const shuffled = [...resto].sort(() => Math.random() - 0.5);

  const gironi: Array<{ nome: string; squadre: Id[] }> = [];
  for (let i = 0; i < nGironi; i++) {
    const testa = testeDiSerie[i];
    if (!testa) continue;
    gironi.push({
      nome: `Girone ${String.fromCharCode(65 + i)}`,
      squadre: [testa.id],
    });
  }

  for (let i = 0; i < shuffled.length; i++) {
    const s = shuffled[i];
    const girone = gironi[i % nGironi];
    if (s && girone) girone.squadre.push(s.id);
  }

  return gironi;
}

/**
 * Crea l'istanza Competizione per il torneo estivo.
 * Nota: Competizione non ha campo gironi — i gironi sono derivati dalla struttura
 * delle partite (fase = 'gironi' + nome girone dal campo `note`).
 */
export function creaCompetizioneTorneo(input: {
  carrieraId: Id;
  stagione: string;
  tipo: 'mondiale' | 'europeo';
  squadre: Id[];
}): Competizione {
  return {
    id: newId(),
    carrieraId: input.carrieraId,
    nome: input.tipo === 'mondiale' ? 'Mondiale' : 'Europeo',
    tipo: input.tipo,
    stagione: input.stagione,
    formato: 'gironi_tabellone',
    squadre: input.squadre,
    fase: 'gironi',
  };
}

/**
 * Simula una partita NT (casuale ponderata per rating).
 * Non usa il motore completo delle partite club (che richiede contesto complesso).
 */
export function simulaPartitaNt(
  casa: Squadra,
  trasferta: Squadra,
): { golCasa: number; golTrasferta: number } {
  const forzaCasa = (casa.rating ?? 1500) / 100;
  const forzaTrasferta = (trasferta.rating ?? 1500) / 100;
  const xGcasa = Math.max(0.3, forzaCasa * 0.8 + Math.random() * 1.5);
  const xGtrasferta = Math.max(0.3, forzaTrasferta * 0.8 + Math.random() * 1.5);
  return {
    golCasa: Math.round(xGcasa),
    golTrasferta: Math.round(xGtrasferta),
  };
}
