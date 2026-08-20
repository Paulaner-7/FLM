// FLM — Classifiche speciali (decisione utente): marcatori, assist, voto medio,
// G+A, porta inviolata, cartellini rossi. Aggregazioni PURE da PrestazionePartita.

import type { Id, PrestazionePartita } from '../../types/entities';

export interface RigaClassificaSpeciale {
  giocatoreId: Id;
  nome: string;
  squadraId: Id;
  valore: number;
  /** Per il voto medio: numero di partite considerate */
  presenze: number;
}

function raggruppa(
  prestazioni: PrestazionePartita[],
  nomi: Map<Id, string>,
  squadre: Map<Id, Id>,
  riduci: (acc: Map<Id, RigaClassificaSpeciale>, p: PrestazionePartita) => void,
): RigaClassificaSpeciale[] {
  const acc = new Map<Id, RigaClassificaSpeciale>();
  for (const p of prestazioni) {
    if (!acc.has(p.giocatoreId)) {
      acc.set(p.giocatoreId, {
        giocatoreId: p.giocatoreId,
        nome: nomi.get(p.giocatoreId) ?? '—',
        squadraId: squadre.get(p.giocatoreId) ?? p.squadraId,
        valore: 0,
        presenze: 0,
      });
    }
    riduci(acc, p);
  }
  return [...acc.values()];
}

const ordina = (righe: RigaClassificaSpeciale[], secondario?: (r: RigaClassificaSpeciale) => number): RigaClassificaSpeciale[] =>
  [...righe].sort((a, b) => b.valore - a.valore || (secondario ? (secondario(b) - secondario(a)) : 0) || a.nome.localeCompare(b.nome, 'it'));

/** Classifica marcatori (gol, a parità meno presenze). */
export function classificaMarcatori(
  prestazioni: PrestazionePartita[],
  nomi: Map<Id, string>,
  squadre: Map<Id, Id>,
): RigaClassificaSpeciale[] {
  const righe = raggruppa(prestazioni, nomi, squadre, (acc, p) => {
    const r = acc.get(p.giocatoreId)!;
    r.valore += p.gol;
    r.presenze += p.minuti > 0 ? 1 : 0;
  });
  return ordina(righe, (r) => -r.presenze); // meno presenze meglio a parità gol
}

/** Classifica assist. */
export function classificaAssist(
  prestazioni: PrestazionePartita[],
  nomi: Map<Id, string>,
  squadre: Map<Id, Id>,
): RigaClassificaSpeciale[] {
  const righe = raggruppa(prestazioni, nomi, squadre, (acc, p) => {
    const r = acc.get(p.giocatoreId)!;
    r.valore += p.assist;
    r.presenze += p.minuti > 0 ? 1 : 0;
  });
  return ordina(righe);
}

/** Classifica G+A (gol + assist). */
export function classificaGolAssist(
  prestazioni: PrestazionePartita[],
  nomi: Map<Id, string>,
  squadre: Map<Id, Id>,
): RigaClassificaSpeciale[] {
  const righe = raggruppa(prestazioni, nomi, squadre, (acc, p) => {
    const r = acc.get(p.giocatoreId)!;
    r.valore += p.gol + p.assist;
    r.presenze += p.minuti > 0 ? 1 : 0;
  });
  return ordina(righe);
}

/** Classifica voto medio (minimo 3 presenze per entrare, come nelle medie reali). */
export const MIN_PRESENZE_VOTO = 3;

export function classificaVotoMedio(
  prestazioni: PrestazionePartita[],
  nomi: Map<Id, string>,
  squadre: Map<Id, Id>,
): RigaClassificaSpeciale[] {
  const somme = new Map<Id, { totale: number; presenze: number }>();
  for (const p of prestazioni) {
    if (p.minuti <= 0 || p.voto <= 0) continue;
    const acc = somme.get(p.giocatoreId) ?? { totale: 0, presenze: 0 };
    acc.totale += p.voto;
    acc.presenze++;
    somme.set(p.giocatoreId, acc);
  }
  return ordina(
    [...somme.entries()]
      .filter(([, v]) => v.presenze >= MIN_PRESENZE_VOTO)
      .map(([id, v]) => ({
        giocatoreId: id,
        nome: nomi.get(id) ?? '—',
        squadraId: squadre.get(id) ?? '',
        valore: Math.round((v.totale / v.presenze) * 100) / 100,
        presenze: v.presenze,
      })),
  );
}

/** Classifica porta inviolata (portieri). */
export function classificaPortaInviolata(
  prestazioni: PrestazionePartita[],
  nomi: Map<Id, string>,
  squadre: Map<Id, Id>,
  portieri: Set<Id>,
): RigaClassificaSpeciale[] {
  const righe = raggruppa(prestazioni, nomi, squadre, (acc, p) => {
    if (!portieri.has(p.giocatoreId)) return;
    const r = acc.get(p.giocatoreId)!;
    if (p.portaInviolata) r.valore += 1;
    r.presenze += 1;
  });
  return ordina(righe);
}

/** Classifica cartellini rossi (più rossi in testa — è una classifica "negativa"). */
export function classificaRossi(
  prestazioni: PrestazionePartita[],
  nomi: Map<Id, string>,
  squadre: Map<Id, Id>,
): RigaClassificaSpeciale[] {
  const righe = raggruppa(prestazioni, nomi, squadre, (acc, p) => {
    const r = acc.get(p.giocatoreId)!;
    if (p.rosso) r.valore += 1;
    r.presenze += p.minuti > 0 ? 1 : 0;
  });
  return ordina(righe.filter((r) => r.valore > 0));
}
