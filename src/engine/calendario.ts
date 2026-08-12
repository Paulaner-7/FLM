// FLM — Generatore calendario (girone all'italiana, andata e ritorno).
// Regola 3 AGENTS.md: funzioni PURE e deterministiche, nessuna scrittura qui.
//
// Algoritmo: metodo del cerchio (tavole di Berger, standard dei campionati —
// verificato su Wikipedia "Round-robin tournament", sezione Scheduling algorithm).
// - N pari: 2×(N−1) giornate; il ritorno specchia l'andata a campi invertiti
//   (ogni coppia gioca esattamente una volta per campo, come nei campionati reali).
// - N dispari: una squadra riposa per giornata (bye), come da algoritmo standard
//   con competitor fittizio.
// - L'ordine delle squadre è uno shuffle deterministico seminato dagli ID
//   (stesso calendario a parità di lega: testabile, nessun Math.random).

import type { Id, Partita } from '../types/entities';

/** Hash numerico stabile da stringa (FNV-1a) — non crittografico, solo seeding. */
function hashString(valore: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < valore.length; i++) {
    hash ^= valore.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** PRNG deterministico (mulberry32) per lo shuffle delle squadre. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeterministic<T>(items: T[], seed: number): T[] {
  const result = [...items];
  const random = prng(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i];
    const b = result[j];
    if (a === undefined || b === undefined) continue;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/** Seed stabile: deriva dagli ID ordinati delle squadre (indipendente dall'ordine di arrivo). */
function seedDaSquadre(ids: Id[]): number {
  return [...ids].sort().reduce((acc, id) => (Math.imul(acc, 31) + hashString(id)) >>> 0, 17);
}

/**
 * Genera TUTTE le partite di andata e ritorno per le squadre date.
 * Le partite sono create con giocata=false (le tue le inserisci col referto,
 * le altre verranno simulate dal motore in M2 — PRD 3.2).
 * Gli ID delle partite sono deterministici (idempotente: stessa lega, stesso calendario).
 */
export function generaCalendario(
  squadreIds: Id[],
  competizioneId: Id,
  carrieraId: Id,
): Partita[] {
  if (squadreIds.length < 2) return [];

  const ordinate = shuffleDeterministic([...squadreIds], seedDaSquadre(squadreIds));
  // N dispari: aggiungi un "riposo" fittizio (bye) — le coppie col fittizio non producono partite.
  const riposo: Id | null = ordinate.length % 2 === 1 ? '__riposo__' : null;
  const cerchio = riposo ? [...ordinate, riposo] : [...ordinate];
  const n = cerchio.length;
  const giornateAndata = n - 1;

  const partite: Partita[] = [];
  const mkId = (giornata: number, index: number): Id => `${competizioneId}-g${giornata}-${index}`;

  for (let r = 0; r < giornateAndata; r++) {
    const accoppiamenti: Array<[Id, Id]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = cerchio[i];
      const b = cerchio[n - 1 - i];
      if (a === undefined || b === undefined) continue;
      accoppiamenti.push([a, b]);
    }
    // Alterna il lato casa/trasferta tra giornate (fairness, come da algoritmo standard)
    const inverti = r % 2 === 1;
    let index = 0;
    for (const [a, b] of accoppiamenti) {
      if (a === riposo || b === riposo) continue; // bye: nessuna partita
      const [casa, trasferta] = inverti ? [b, a] : [a, b];
      partite.push({
        id: mkId(r + 1, index),
        carrieraId,
        competizioneId,
        giornata: r + 1,
        casa,
        trasferta,
        golCasa: 0,
        golTrasferta: 0,
        marcatori: [],
        giocata: false,
      });
      index++;
    }
    // Rotazione del cerchio: il primo resta fisso, gli altri girano in avanti
    const testa = cerchio[0];
    const coda = cerchio.slice(1);
    if (coda.length > 0) {
      const ultimo = coda.pop();
      if (ultimo !== undefined) cerchio.splice(0, cerchio.length, testa as Id, ultimo, ...coda);
    }
  }

  // Ritorno: specchio dell'andata (stesse coppie, campi invertiti, ordine giornate inverso)
  const andata = partite.map((p) => ({ ...p }));
  for (let r = 0; r < giornateAndata; r++) {
    const giornataRitorno = giornateAndata + r + 1;
    const giornataAndataOrigine = giornateAndata - r;
    let index = 0;
    for (const p of andata) {
      if (p.giornata !== giornataAndataOrigine) continue;
      partite.push({
        ...p,
        id: mkId(giornataRitorno, index),
        giornata: giornataRitorno,
        casa: p.trasferta,
        trasferta: p.casa,
      });
      index++;
    }
  }

  return partite;
}
