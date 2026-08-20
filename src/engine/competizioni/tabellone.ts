// FLM — Tabellone a eliminazione: sfide, vincitrici, progressione (PRD 7.1).
//
// Regole reali (verifica-web.md §6, decisioni utente):
// - Andata/ritorno con aggregato; NIENTE gol in trasferta (abolito UEFA 2021):
//   pari dopo 180' → supplementari + rigori. Finali: secca in campo neutro.
// - Rigori CPU = lotteria 50/50 con seme deterministico dall'ID partita
//   (decisione utente: i rigori restano casuali).
// - Chi elimina una testa di serie ne eredita la posizione nel bracket (reale).

import type { Id, Partita } from '../../types/entities';
import { hashString, prng } from '../random';

export interface Sfida {
  /** Squadra che gioca il ritorno in casa (testa di serie o erede) */
  testaSerie: Id;
  avversaria: Id;
}

/** Risultato aggregato di una sfida (dalle partite giocate). */
export interface Aggregato {
  golSquadra1: number;
  golSquadra2: number;
  /** Rigori della seconda partita (solo se disputati) */
  rigoriSquadra1?: number;
  rigoriSquadra2?: number;
  completata: boolean;
}

/**
 * Aggregato di una sfida andata/ritorno. Se una gamba non è giocata, la sfida
 * è incompleta. I rigori contano solo se l'aggregato è in parità.
 */
export function aggregatoSfida(andata: Partita, ritorno: Partita, sfida: Sfida): Aggregato {
  const s1 = sfida.testaSerie;
  const s2 = sfida.avversaria;
  const golDi = (p: Partita, squadra: Id): number =>
    p.casa === squadra ? p.golCasa : p.golTrasferta;

  if (!andata.giocata || !ritorno.giocata) {
    return {
      golSquadra1: golDi(andata, s1),
      golSquadra2: golDi(andata, s2),
      completata: false,
    };
  }
  const g1 = golDi(andata, s1) + golDi(ritorno, s1);
  const g2 = golDi(andata, s2) + golDi(ritorno, s2);
  const r = ritorno.rigori;
  return {
    golSquadra1: g1,
    golSquadra2: g2,
    rigoriSquadra1: r && g1 === g2 ? r.casa : undefined,
    rigoriSquadra2: r && g1 === g2 ? r.trasferta : undefined,
    completata: true,
  };
}

/**
 * Vincitrice di una sfida completata. Pari dopo 180' → rigori (se presenti).
 * Se i rigori mancano su una sfida in parità, ritorna null (dato incompleto:
 * il referto li richiede obbligatoriamente, decisione utente).
 */
export function vincitriceSfida(andata: Partita, ritorno: Partita, sfida: Sfida): Id | null {
  const agg = aggregatoSfida(andata, ritorno, sfida);
  if (!agg.completata) return null;
  if (agg.golSquadra1 !== agg.golSquadra2) {
    return agg.golSquadra1 > agg.golSquadra2 ? sfida.testaSerie : sfida.avversaria;
  }
  if (agg.rigoriSquadra1 === undefined || agg.rigoriSquadra2 === undefined) return null;
  return agg.rigoriSquadra1 > agg.rigoriSquadra2 ? sfida.testaSerie : sfida.avversaria;
}

/**
 * Risultato ai rigori per una partita CPU pareggiata (lotteria 50/50):
 * seme deterministico dall'ID partita — stesso esito a ogni rigenerazione
 * (rollback-safe), casuale per il giocatore.
 */
export function rigoriCpu(partitaId: Id): { casa: number; trasferta: number } {
  const rand = prng(hashString(`${partitaId}|rigori`));
  // I rigori si decidono di solito dopo 5+ tiri: simula sequenza fino alla
  // decisione, con esito finale comunque ~50/50.
  let a = 0;
  let b = 0;
  for (let turno = 0; turno < 5; turno++) {
    if (rand() < 0.75) a++;
    if (rand() < 0.75) b++;
  }
  // Morte improvvisa se ancora pari (raro)
  while (a === b) {
    if (rand() < 0.75) a++;
    if (rand() < 0.75) b++;
  }
  return { casa: a, trasferta: b };
}

/**
 * Se una partita CPU a eliminazione diretta è finita in pareggio, produce i
 * rigori da salvare sulla partita (chiamato alla simulazione, non al referto).
 */
export function completaConRigori(partita: Partita): Partita {
  if (!partita.giocata || partita.golCasa !== partita.golTrasferta) return partita;
  if (partita.rigori) return partita;
  return { ...partita, supplementari: true, rigori: rigoriCpu(partita.id) };
}

/**
 * Progressione del tabellone: dato l'ordine delle sfide e le vincitrici,
 * produce le sfide del turno successivo (accoppiamenti adiacenti nel bracket).
 */
export function prossimoTurno(vincitrici: Id[]): Sfida[] {
  const sfide: Sfida[] = [];
  for (let i = 0; i + 1 < vincitrici.length; i += 2) {
    sfide.push({ testaSerie: vincitrici[i]!, avversaria: vincitrici[i + 1]! });
  }
  return sfide;
}
