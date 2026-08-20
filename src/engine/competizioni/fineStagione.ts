// FLM — Fine stagione: vincitori, accessi della stagione successiva, rollover
// (PRD 7.1: "vincitori registrati, piazzamenti determinano gli accessi").
// Funzioni PURE: la transazione Dexie vive in src/db/competizioni.ts.

import type { Competizione, Id, Partita } from '../../types/entities';
import { accessiPerLega, type AccessoEuropeo } from '../../data/accessi';
import { calcolaClassifica, type RigaClassifica } from '../classifica';
import { classificaLeaguePhase } from './leaguePhase';
import type { Sfida } from './tabellone';

/** Vincitore di una competizione chiusa (per tipo/formato). */
export function vincitoreCompetizione(
  competizione: Competizione,
  partite: Partita[],
  coefficienti: Map<Id, number>,
  disciplinari: Map<Id, number>,
): Id | null {
  const proprie = partite.filter((p) => p.competizioneId === competizione.id && p.giocata);
  if (competizione.formato === 'girone') {
    const classifica = calcolaClassifica(proprie, competizione.squadre);
    return classifica[0]?.squadraId ?? null;
  }
  if (competizione.formato === 'league_phase') {
    const classifica = classificaLeaguePhase(proprie, competizione.squadre, coefficienti, disciplinari);
    // La vincitrice della league phase è la 1ª (il trofeo lo dà il tabellone,
    // ma serve il dato anche senza tabellone completo).
    return classifica[0]?.squadraId ?? null;
  }
  // Eliminazione diretta: la finale è l'ultima fase
  const finali = proprie.filter((p) => p.fase === 'finale');
  if (finali.length !== 1) return null;
  const f = finali[0]!;
  if (f.golCasa > f.golTrasferta) return f.casa;
  if (f.golTrasferta > f.golCasa) return f.trasferta;
  return f.rigori ? (f.rigori.casa > f.rigori.trasferta ? f.casa : f.trasferta) : null;
}

/**
 * Accessi europei della stagione successiva: applica gli slot reali della lega
 * alla classifica finale appena conclusa + vincitrici coppe + campioni in carica.
 * Ritorna l'elenco per competizione e turno.
 */
export function accessiStagioneSuccessiva(input: {
  lega: string;
  classifica: RigaClassifica[];
  vincitriceCoppaNazionale: Id | null;
  campioneUcl: Id | null;
  campioneUel: Id | null;
  campioneUecl: Id | null;
  /** Posizione → nome squadra (per il report) */
  nomi: Map<Id, string>;
}): AccessoEuropeo[] {
  const config = accessiPerLega(input.lega);
  if (!config) return [];

  const perPosizione = new Map<number, Id>();
  input.classifica.forEach((r) => perPosizione.set(r.posizione, r.squadraId));

  const giaQualificate = new Set<Id>();
  const accessi: AccessoEuropeo[] = [];
  const aggiungi = (
    squadra: Id | null | undefined,
    competizione: AccessoEuropeo['competizione'],
    turno: AccessoEuropeo['turno'],
    motivo: string,
  ): void => {
    if (squadra === null || squadra === undefined || giaQualificate.has(squadra)) return;
    giaQualificate.add(squadra);
    accessi.push({
      nazione: config.nazione,
      squadra: input.nomi.get(squadra) ?? '—',
      competizione,
      turno,
      motivo,
    });
  };

  // Campioni in carica (se non già qualificati via campionato — verrà dedotto sotto)
  aggiungi(input.campioneUcl, 'champions_league', 'league_phase', 'Campione UCL in carica');
  aggiungi(input.campioneUel, 'champions_league', 'league_phase', 'Campione UEL in carica');
  aggiungi(input.campioneUecl, 'europa_league', 'league_phase', 'Campione UECL in carica');

  // Slot per posizione (in ordine: UCL, poi UEL, poi UECL)
  for (const slot of config.champions) {
    aggiungi(perPosizione.get(slot.posizione), 'champions_league', slot.turno, `${slot.posizione}ª classificata`);
  }
  for (const slot of config.europa) {
    aggiungi(perPosizione.get(slot.posizione), 'europa_league', slot.turno, `${slot.posizione}ª classificata`);
  }
  for (const slot of config.conference) {
    aggiungi(perPosizione.get(slot.posizione), 'conference_league', slot.turno, `${slot.posizione}ª classificata`);
  }

  // Vincitrice coppa nazionale → UEL league phase; se già qualificata, il posto
  // scorre alla posizione successiva (riallocazione reale).
  if (config.coppaNazionaleInUel) {
    if (input.vincitriceCoppaNazionale && !giaQualificate.has(input.vincitriceCoppaNazionale)) {
      aggiungi(input.vincitriceCoppaNazionale, 'europa_league', 'league_phase', 'Vincitrice coppa nazionale');
    } else {
      // Riallocazione: la posizione successiva all'ultimo slot UEL
      const ultimoSlot = config.europa[config.europa.length - 1]?.posizione ?? 5;
      aggiungi(perPosizione.get(ultimoSlot + 1), 'europa_league', 'league_phase', 'Riallocazione coppa nazionale');
    }
  }

  return accessi;
}

/** Reset stagionali dei giocatori (rollover, decisione utente). */
export interface ResetStagionale {
  minutiStagione: number;
  forma: number;
  morale: number;
  fiducia: number;
}

export function resetStagionaleGiocatore(moraleAttuale: number, fiduciaAttuale: number, formaAttuale: number): ResetStagionale {
  // Riequilibrio verso 50 (decisione utente): metà strada tra lo stato attuale e 50.
  const verso50 = (v: number): number => Math.round((v + 50) / 2);
  return {
    minutiStagione: 0,
    forma: verso50(formaAttuale),
    morale: verso50(moraleAttuale),
    fiducia: verso50(fiduciaAttuale),
  };
}

/** Avanza l'etichetta stagione "2026/27" → "2027/28". */
export function prossimaStagione(stagione: string): string {
  const [a] = stagione.split('/');
  const anno = Number(a);
  if (!Number.isFinite(anno)) return stagione;
  return `${anno + 1}/${String(anno + 2).slice(2)}`;
}

export type { Sfida };
