// FLM — League phase UEFA: calendario matchday e classifica (PRD 7.1).
//
// FONTI (verifica web, agosto 2026 — docs/verifica-web.md §6):
// - 36 squadre, tabellone unico, 8 partite (UCL/UEL) / 6 (UECL).
// - Tiebreaker classifica (regolamento UEFA Art. 18, osservati nella tabella
//   reale 2025/26 UEL — "Away goals scored: Real Betis 5, Porto 3"):
//   1) punti 2) diff. reti 3) gol fatti 4) gol in trasferta 5) vittorie
//   6) vittorie in trasferta 7) punti ottenuti collettivamente dalle avversarie
//   8) diff. reti collettiva avversarie 9) gol collettivi avversarie
//   10) meno punti disciplinari 11) coefficiente club.

import type { Id, Partita, PrestazionePartita } from '../../types/entities';
import { hashString, prng } from '../random';
import type { EsitoSorteggioLeaguePhase } from './sorteggio';
import { PUNTI_PAREGGIO, PUNTI_VITTORIA } from '../rules';

export interface MatchLeaguePhase {
  casa: Id;
  trasferta: Id;
  matchday: number;
}

/**
 * Costruisce il calendario della league phase dal sorteggio: ogni coppia
 * diventa una partita, e le partite vengono distribuite sui matchday
 * (una partita per squadra per matchday) con alternanza casa/trasferta.
 */
export function calendarioLeaguePhase(
  sorteggio: EsitoSorteggioLeaguePhase,
  numeroMatchdays: number,
  seed: number,
): MatchLeaguePhase[] {
  const partite: Array<{ casa: Id; trasferta: Id }> = [];
  const viste = new Set<string>();
  for (const [squadra, avversarie] of sorteggio.avversarie) {
    for (const a of avversarie) {
      if (!a.inCasa) continue; // ogni coppia la registra solo chi gioca in casa
      const chiave = [squadra, a.id].sort().join('|');
      if (viste.has(chiave)) continue;
      viste.add(chiave);
      partite.push({ casa: squadra, trasferta: a.id });
    }
  }
  return assegnaMatchdays(partite, numeroMatchdays, seed);
}

/**
 * Assegna ogni partita a un matchday: nessuna squadra gioca due volte nello
 * stesso matchday; alternanza casa/trasferta come preferenza morbida.
 * Backtracking MRV (partita con meno matchday legali prima) con BUDGET di nodi
 * e retry a semi progressivi: deterministico e veloce.
 */
export function assegnaMatchdays(
  partite: Array<{ casa: Id; trasferta: Id }>,
  numeroMatchdays: number,
  seed: number,
): MatchLeaguePhase[] {
  const capPerMatchday = Math.ceil(partite.length / numeroMatchdays);
  let ultimoErrore: unknown = null;
  for (let tentativo = 0; tentativo < 40; tentativo++) {
    try {
      return tentaAssegnazione(partite, numeroMatchdays, capPerMatchday, (seed + tentativo * 7919) >>> 0);
    } catch (e) {
      ultimoErrore = e;
    }
  }
  throw new Error(`Impossibile distribuire ${partite.length} partite su ${numeroMatchdays} matchday: ${String(ultimoErrore)}`);
}

const BUDGET_NODI_ASSIGN = 300_000;

function tentaAssegnazione(
  partite: Array<{ casa: Id; trasferta: Id }>,
  numeroMatchdays: number,
  capPerMatchday: number,
  seed: number,
): MatchLeaguePhase[] {
  const rand = prng(seed);
  const shuffle = <T>(arr: T[]): T[] => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const a = out[i];
      const b = out[j];
      if (a === undefined || b === undefined) continue;
      out[i] = b;
      out[j] = a;
    }
    return out;
  };

  const usati = new Map<Id, Set<number>>(); // squadra → matchday occupati
  const conteggio = new Array<number>(numeroMatchdays + 1).fill(0);
  const casalinghe = new Map<Id, number[]>(); // ultimi matchday in casa (per alternanza)
  for (const p of partite) {
    if (!usati.has(p.casa)) usati.set(p.casa, new Set());
    if (!usati.has(p.trasferta)) usati.set(p.trasferta, new Set());
    if (!casalinghe.has(p.casa)) casalinghe.set(p.casa, []);
    if (!casalinghe.has(p.trasferta)) casalinghe.set(p.trasferta, []);
  }

  const assegnazione = new Array<number>(partite.length).fill(0);
  let nodi = 0;

  const risolvi = (rimanenti: number[]): boolean => {
    if (rimanenti.length === 0) return true;
    nodi++;
    if (nodi > BUDGET_NODI_ASSIGN) throw new Error('budget nodi superato');

    // MRV: per ogni partita rimasta, conta i matchday legali.
    let migliore: number | null = null;
    let miglioriLegali: number[] = [];
    let miglioriCount = Number.MAX_SAFE_INTEGER;
    for (const indice of rimanenti) {
      const p = partite[indice]!;
      const legali: number[] = [];
      for (let m = 1; m <= numeroMatchdays; m++) {
        if (conteggio[m]! < capPerMatchday && !usati.get(p.casa)!.has(m) && !usati.get(p.trasferta)!.has(m)) {
          legali.push(m);
        }
      }
      if (legali.length === 0) return false;
      if (legali.length < miglioriCount) {
        miglioriCount = legali.length;
        migliore = indice;
        miglioriLegali = legali;
        if (legali.length === 1) break;
      }
    }
    if (migliore === null) return true;

    const p = partite[migliore]!;
    // Ordina i matchday legali per alternanza (evita 3 case di fila) + rumore deterministico
    const costoAlternanza = (m: number): number => {
      let c = 0;
      const caseCasa = casalinghe.get(p.casa)!;
      if (caseCasa.length > 0 && caseCasa[caseCasa.length - 1] === m - 1) c += 2;
      const caseTrasferta = casalinghe.get(p.trasferta)!;
      if (caseTrasferta.length > 0 && caseTrasferta[caseTrasferta.length - 1] === m - 1) c += 2;
      return c;
    };
    const legaliOrdinati = shuffle(miglioriLegali).sort((a, b) => costoAlternanza(a) - costoAlternanza(b));

    const prossimi = rimanenti.filter((x) => x !== migliore);
    for (const m of legaliOrdinati) {
      usati.get(p.casa)!.add(m);
      usati.get(p.trasferta)!.add(m);
      conteggio[m]!++;
      casalinghe.get(p.casa)!.push(m);
      assegnazione[migliore] = m;
      if (risolvi(prossimi)) return true;
      casalinghe.get(p.casa)!.pop();
      assegnazione[migliore] = 0;
      conteggio[m]!--;
      usati.get(p.casa)!.delete(m);
      usati.get(p.trasferta)!.delete(m);
    }
    return false;
  };

  const ordine = shuffle(partite.map((_, i) => i));
  if (!risolvi(ordine)) throw new Error('nessuna soluzione con questo seme');
  return partite.map((p, i) => ({ casa: p.casa, trasferta: p.trasferta, matchday: assegnazione[i]! }));
}

// ---------------------------------------------------------------------------
// Classifica league phase (tiebreaker UEFA Art. 18)
// ---------------------------------------------------------------------------

export interface RigaLeaguePhase {
  squadraId: Id;
  posizione: number;
  giocate: number;
  vinte: number;
  pareggiate: number;
  perse: number;
  golFatti: number;
  golSubiti: number;
  golTrasferta: number;
  vittorieTrasferta: number;
  differenzaReti: number;
  punti: number;
  /** 1-8 = ottavi (teste di serie), 9-16 = playoff teste di serie, 17-24 = playoff non teste, 25-36 = eliminate */
  qualificazione: 'ottavi' | 'playoff_testa' | 'playoff_non_testa' | 'eliminata';
}

/**
 * Classifica della league phase con i criteri UEFA reali. `coefficienti` e
 * `disciplinari` servono per gli ultimi due tiebreaker (regolamento Art. 18).
 */
export function classificaLeaguePhase(
  partite: Partita[],
  squadre: Id[],
  coefficienti: Map<Id, number>,
  disciplinari: Map<Id, number>, // punti disciplinari (giallo 1, rosso 3)
): RigaLeaguePhase[] {
  interface Acc {
    id: Id;
    giocate: number;
    vinte: number;
    pareggiate: number;
    perse: number;
    gf: number;
    gs: number;
    gfTrasferta: number;
    vinteTrasferta: number;
    punti: number;
    avversarie: Set<Id>;
  }
  const mappa = new Map<Id, Acc>(
    squadre.map((id) => [
      id,
      { id, giocate: 0, vinte: 0, pareggiate: 0, perse: 0, gf: 0, gs: 0, gfTrasferta: 0, vinteTrasferta: 0, punti: 0, avversarie: new Set() },
    ]),
  );
  for (const p of partite) {
    if (!p.giocata) continue;
    const casa = mappa.get(p.casa);
    const trasferta = mappa.get(p.trasferta);
    if (!casa || !trasferta) continue;
    casa.giocate++;
    trasferta.giocate++;
    casa.gf += p.golCasa;
    casa.gs += p.golTrasferta;
    trasferta.gf += p.golTrasferta;
    trasferta.gs += p.golCasa;
    trasferta.gfTrasferta += p.golTrasferta;
    casa.avversarie.add(p.trasferta);
    trasferta.avversarie.add(p.casa);
    if (p.golCasa > p.golTrasferta) {
      casa.vinte++;
      casa.punti += PUNTI_VITTORIA;
      trasferta.perse++;
    } else if (p.golCasa === p.golTrasferta) {
      casa.pareggiate++;
      trasferta.pareggiate++;
      casa.punti += PUNTI_PAREGGIO;
      trasferta.punti += PUNTI_PAREGGIO;
    } else {
      trasferta.vinte++;
      trasferta.vinteTrasferta++;
      trasferta.punti += PUNTI_VITTORIA;
      casa.perse++;
    }
  }

  const ordinate = [...mappa.values()].sort((a, b) => {
    if (b.punti !== a.punti) return b.punti - a.punti;
    const drA = a.gf - a.gs;
    const drB = b.gf - b.gs;
    if (drB !== drA) return drB - drA;
    if (b.gf !== a.gf) return b.gf - a.gf;
    if (b.gfTrasferta !== a.gfTrasferta) return b.gfTrasferta - a.gfTrasferta;
    if (b.vinte !== a.vinte) return b.vinte - a.vinte;
    if (b.vinteTrasferta !== a.vinteTrasferta) return b.vinteTrasferta - a.vinteTrasferta;
    // Criteri collettivi avversarie (Art. 18)
    const puntiAvv = (x: Acc) => [...x.avversarie].reduce((s, id) => s + (mappa.get(id)?.punti ?? 0), 0);
    const drAvv = (x: Acc) => [...x.avversarie].reduce((s, id) => { const o = mappa.get(id); return s + (o ? o.gf - o.gs : 0); }, 0);
    const gfAvv = (x: Acc) => [...x.avversarie].reduce((s, id) => s + (mappa.get(id)?.gf ?? 0), 0);
    const pa = puntiAvv(a);
    const pb = puntiAvv(b);
    if (pb !== pa) return pb - pa;
    const da = drAvv(a);
    const db = drAvv(b);
    if (db !== da) return db - da;
    const ga = gfAvv(a);
    const gb = gfAvv(b);
    if (gb !== ga) return gb - ga;
    // Punti disciplinari: MENO è meglio
    const discA = disciplinari.get(a.id) ?? 0;
    const discB = disciplinari.get(b.id) ?? 0;
    if (discB !== discA) return discA - discB;
    // Coefficiente club: più alto è meglio
    const coeffA = coefficienti.get(a.id) ?? 0;
    const coeffB = coefficienti.get(b.id) ?? 0;
    if (coeffB !== coeffA) return coeffB - coeffA;
    return a.id.localeCompare(b.id);
  });

  return ordinate.map((acc, i) => {
    const pos = i + 1;
    return {
      squadraId: acc.id,
      posizione: pos,
      giocate: acc.giocate,
      vinte: acc.vinte,
      pareggiate: acc.pareggiate,
      perse: acc.perse,
      golFatti: acc.gf,
      golSubiti: acc.gs,
      golTrasferta: acc.gfTrasferta,
      vittorieTrasferta: acc.vinteTrasferta,
      differenzaReti: acc.gf - acc.gs,
      punti: acc.punti,
      qualificazione:
        pos <= 8 ? 'ottavi' : pos <= 16 ? 'playoff_testa' : pos <= 24 ? 'playoff_non_testa' : 'eliminata',
    };
  });
}

/** Punti disciplinari da una riga prestazione (giallo 1, rosso 3). */
export function puntiDisciplinari(prestazione: Pick<PrestazionePartita, 'giallo' | 'rosso'>): number {
  return (prestazione.giallo ? 1 : 0) + (prestazione.rosso ? 3 : 0);
}

/** Seed per il calendario della league phase. */
export function seedCalendarioLeaguePhase(carrieraId: Id, competizioneId: Id): number {
  return hashString(`${carrieraId}|${competizioneId}|leaguephase`) >>> 0;
}
