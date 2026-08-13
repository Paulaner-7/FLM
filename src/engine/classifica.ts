// FLM — Classifica (PRD 3.2, modulo "Classifica & statistiche").
// Regola 3 AGENTS.md: funzioni PURE e deterministiche, nessuna scrittura qui.
//
// Criteri di ordinamento = regola Serie A ufficiale (Wikipedia "Serie A",
// sezione tiebreakers; 3 punti vittoria dal 1994/95):
//   1. punti
//   2. punti negli scontri diretti (tra le squadre a pari punti)
//   3. differenza reti negli scontri diretti
//   4. differenza reti generale
//   5. gol segnati
//   6. spareggio/sorteggio nella realtà: qui sorteggio sostituito da ordinamento
//      alfabetico stabile (deterministico) — irrilevante ai fini del gioco.

import type { Id, Partita } from '../types/entities';
import { PUNTI_PAREGGIO, PUNTI_SCONFITTA, PUNTI_VITTORIA } from './rules';

export interface RigaClassifica {
  squadraId: Id;
  posizione: number;
  giocate: number;
  vinte: number;
  pareggiate: number;
  perse: number;
  golFatti: number;
  golSubiti: number;
  differenzaReti: number;
  punti: number;
}

/** Accumulatore interno di una squadra sulle partite giocate. */
interface Accumulo {
  squadraId: Id;
  giocate: number;
  vinte: number;
  pareggiate: number;
  perse: number;
  golFatti: number;
  golSubiti: number;
  differenzaReti: number;
  punti: number;
}

function accumula(acc: Accumulo, golFatti: number, golSubiti: number): void {
  acc.giocate++;
  acc.golFatti += golFatti;
  acc.golSubiti += golSubiti;
  acc.differenzaReti = acc.golFatti - acc.golSubiti;
  if (golFatti > golSubiti) {
    acc.vinte++;
    acc.punti += PUNTI_VITTORIA;
  } else if (golFatti === golSubiti) {
    acc.pareggiate++;
    acc.punti += PUNTI_PAREGGIO;
  } else {
    acc.perse++;
    acc.punti += PUNTI_SCONFITTA;
  }
}

/** Metriche degli scontri diretti tra le squadre di un gruppo a pari punti. */
interface ScontriDiretti {
  punti: number;
  differenzaReti: number;
  golFatti: number;
}

/**
 * Classifica completa per una competizione (girone), calcolata SOLO dalle
 * partite giocate. Le squadre senza partite giocate sono incluse in coda
 * (0 punti, ordinate alfabeticamente). Posizione finale assegnata dopo l'ordinamento.
 */
export function calcolaClassifica(partite: Partita[], squadreIds: Id[]): RigaClassifica[] {
  const mappa = new Map<Id, Accumulo>(
    squadreIds.map((id) => [id, { squadraId: id, giocate: 0, vinte: 0, pareggiate: 0, perse: 0, golFatti: 0, golSubiti: 0, differenzaReti: 0, punti: 0 }]),
  );

  for (const p of partite) {
    if (!p.giocata) continue;
    const casa = mappa.get(p.casa);
    const trasferta = mappa.get(p.trasferta);
    if (casa) accumula(casa, p.golCasa, p.golTrasferta);
    if (trasferta) accumula(trasferta, p.golTrasferta, p.golCasa);
  }

  // Gruppi a pari punti: gli scontri diretti si calcolano DENTRO il gruppo.
  const gruppi = new Map<number, Accumulo[]>();
  for (const acc of mappa.values()) {
    const lista = gruppi.get(acc.punti) ?? [];
    lista.push(acc);
    gruppi.set(acc.punti, lista);
  }

  const scontriDiretti = (gruppo: Accumulo[]): Map<Id, ScontriDiretti> => {
    const ids = new Set(gruppo.map((g) => g.squadraId));
    const risultato = new Map<Id, ScontriDiretti>();
    for (const g of gruppo) {
      risultato.set(g.squadraId, { punti: 0, differenzaReti: 0, golFatti: 0 });
    }
    for (const p of partite) {
      if (!p.giocata || !ids.has(p.casa) || !ids.has(p.trasferta)) continue;
      const rc = risultato.get(p.casa);
      const rt = risultato.get(p.trasferta);
      if (!rc || !rt) continue;
      // Casa
      rc.golFatti += p.golCasa;
      rc.differenzaReti += p.golCasa - p.golTrasferta;
      rc.punti += p.golCasa > p.golTrasferta ? PUNTI_VITTORIA : p.golCasa === p.golTrasferta ? PUNTI_PAREGGIO : PUNTI_SCONFITTA;
      // Trasferta
      rt.golFatti += p.golTrasferta;
      rt.differenzaReti += p.golTrasferta - p.golCasa;
      rt.punti += p.golTrasferta > p.golCasa ? PUNTI_VITTORIA : p.golTrasferta === p.golCasa ? PUNTI_PAREGGIO : PUNTI_SCONFITTA;
    }
    return risultato;
  };

  const ordinaGruppo = (gruppo: Accumulo[]): Accumulo[] => {
    if (gruppo.length <= 1) return gruppo;
    const sd = scontriDiretti(gruppo);
    return [...gruppo].sort((a, b) => {
      const da = sd.get(a.squadraId);
      const db = sd.get(b.squadraId);
      const puntiSd = (db?.punti ?? 0) - (da?.punti ?? 0);
      if (puntiSd !== 0) return puntiSd;
      const drSd = (db?.differenzaReti ?? 0) - (da?.differenzaReti ?? 0);
      if (drSd !== 0) return drSd;
      const dr = b.differenzaReti - a.differenzaReti;
      if (dr !== 0) return dr;
      const gf = b.golFatti - a.golFatti;
      if (gf !== 0) return gf;
      return a.squadraId.localeCompare(b.squadraId, 'it');
    });
  };

  const ordinate: Accumulo[] = [];
  for (const gruppo of gruppi.values()) {
    ordinate.push(...ordinaGruppo(gruppo));
  }
  ordinate.sort((a, b) => b.punti - a.punti);

  return ordinate.map((acc, index) => ({
    squadraId: acc.squadraId,
    posizione: index + 1,
    giocate: acc.giocate,
    vinte: acc.vinte,
    pareggiate: acc.pareggiate,
    perse: acc.perse,
    golFatti: acc.golFatti,
    golSubiti: acc.golSubiti,
    differenzaReti: acc.golFatti - acc.golSubiti,
    punti: acc.punti,
  }));
}

/** Esito di una singola partita dal punto di vista di una squadra (V/N/P). */
export type SegnoForma = 'V' | 'N' | 'P';

/**
 * Segno di una partita GIÀ giocata per la squadra data: V vittoria, N pareggio,
 * P sconfitta. Presentazione pura di un risultato esistente (nessun numero nuovo).
 */
export function segnoPartita(partita: Partita, squadraId: Id): SegnoForma {
  const golSquadra = partita.casa === squadraId ? partita.golCasa : partita.golTrasferta;
  const golAvversario = partita.casa === squadraId ? partita.golTrasferta : partita.golCasa;
  if (golSquadra > golAvversario) return 'V';
  if (golSquadra === golAvversario) return 'N';
  return 'P';
}

/**
 * Forma di una squadra: segni delle ultime `max` partite giocate nella
 * competizione, dalla più recente alla meno recente. Meno di `max` partite
 * giocate → lista più corta. Pura e deterministica (PRD 3.2, "forma ultime 5").
 */
export function formaUltime5(partite: Partita[], squadraId: Id, max = 5): SegnoForma[] {
  return partite
    .filter((p) => p.giocata && (p.casa === squadraId || p.trasferta === squadraId))
    .sort((a, b) => a.giornata - b.giornata)
    .slice(-max)
    .reverse()
    .map((p) => segnoPartita(p, squadraId));
}
