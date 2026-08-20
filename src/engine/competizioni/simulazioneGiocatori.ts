// FLM — Eventi giocatore delle partite CPU (decisione utente: passivi ora,
// attivi sugli overall in milestone futura).
//
// FONTI dei pesi: src/data/statisticheReali.ts (valori reali Opta/FBref,
// verifica-web.md §14). Ogni evento è seminato dall'ID partita: deterministico.
//
// Produzione per partita: marcatori (con minuti), assist, gialli, rossi, voti
// (scala PES 1-10 passo 0,5), porta inviolata, minuti giocati — per TUTTI i
// giocatori delle due rose (XI + subentrati).

import type { Giocatore, Id } from '../../types/entities';
import { hashString, prng } from '../random';
import { xiDefault, RUOLI_CAMPO } from '../referto';
import { RUOLO_PORTIERE } from '../invariants';
import {
  BONUS_VOTO,
  FRAZIONE_GOL_CON_ASSIST,
  GIALLI_MEDIA_SQUADRA,
  MINUTI_SUBENTRATO_MAX,
  MINUTI_SUBENTRATO_MIN,
  PESI_ASSIST_RUOLO,
  PESI_GIALLI_RUOLO,
  PESI_GOL_RUOLO,
  PESI_ROSSI_RUOLO,
  PROB_RIGORE,
  ROSSI_MEDIA_SQUADRA,
  VOTO_MAX,
  VOTO_MIN,
  VOTO_SIGMA,
} from '../../data/statisticheReali';

/** Righe evento di una partita (senza id/carrieraId: li aggiunge il layer DB). */
export interface EventiGiocatorePartita {
  partitaId: Id;
  squadraId: Id;
  giocatoreId: Id;
  gol: number;
  assist: number;
  giallo: boolean;
  rosso: boolean;
  voto: number;
  portaInviolata: boolean;
  minuti: number;
  titolare: boolean;
}

export interface EsitoSimulazioneGiocatori {
  casa: EventiGiocatorePartita[];
  trasferta: EventiGiocatorePartita[];
}

/** Pesca pesata per ruolo dai pesi dati. */
function pescaRuolo(rand: () => number, pesi: Record<string, number>): string {
  const ruoli = Object.entries(pesi);
  let tiro = rand();
  for (const [ruolo, peso] of ruoli) {
    tiro -= peso;
    if (tiro <= 0) return ruolo;
  }
  return ruoli[ruoli.length - 1]![0];
}

/** Pesca un giocatore tra i candidati, pesato per overall (più alto = più probabile). */
function pescaGiocatore(rand: () => number, candidati: Giocatore[]): Giocatore | undefined {
  if (candidati.length === 0) return undefined;
  const pesi = candidati.map((g) => Math.max(1, (g.overall - 40) ** 2));
  const totale = pesi.reduce((a, b) => a + b, 0);
  let tiro = rand() * totale;
  for (let i = 0; i < candidati.length; i++) {
    tiro -= pesi[i]!;
    if (tiro <= 0) return candidati[i];
  }
  return candidati[candidati.length - 1];
}

/** Voto base dall'overall: mappa 40→~4,0, 70→~5,8, 85→~6,7, 99→~7,5. */
function votoBaseDaOverall(overall: number): number {
  return 4.0 + (overall - 40) * 0.06;
}

/**
 * Simula gli eventi giocatore di UNA squadra in una partita (gol già decisi).
 * Usata per le squadre avversarie nelle partite dell'utente (decisione utente:
 * il form referto resta veloce, solo i miei dati).
 */
export function simulaEventiSquadra(
  partitaId: Id,
  squadraId: Id,
  rosa: Giocatore[],
  golFatti: number,
  subiti: number,
): EventiGiocatorePartita[] {
  const rand = prng(hashString(`${partitaId}|eventi|${squadraId}`));
  return preparaEventi(partitaId, squadraId, rosa, golFatti, subiti, rand);
}

/**
 * Simula gli eventi giocatore di una partita CPU (gol già decisi dal Poisson).
 * I marcatori appartengono alla squadra che ha segnato; gli assist a un
 * compagno; i voti a ogni giocatore sceso in campo.
 */
export function simulaEventiGiocatori(
  partitaId: Id,
  casa: { squadraId: Id; rosa: Giocatore[]; gol: number; subiti: number },
  trasferta: { squadraId: Id; rosa: Giocatore[]; gol: number; subiti: number },
): EsitoSimulazioneGiocatori {
  const rand = prng(hashString(`${partitaId}|eventi`));
  return {
    casa: preparaEventi(partitaId, casa.squadraId, casa.rosa, casa.gol, casa.subiti, rand),
    trasferta: preparaEventi(partitaId, trasferta.squadraId, trasferta.rosa, trasferta.gol, trasferta.subiti, rand),
  };
}

function preparaEventi(
  partitaId: Id,
  squadraId: Id,
  rosa: Giocatore[],
  golFatti: number,
  subiti: number,
  rand: () => number,
): EventiGiocatorePartita[] {
    const xi = new Set(xiDefault(rosa));
    const titolari = rosa.filter((g) => xi.has(g.id));
    // Subentrati: 2-3 dei migliori rimasti (frequenza reale dei cambi offensivi).
    const panchina = rosa.filter((g) => !xi.has(g.id)).sort((a, b) => b.overall - a.overall);
    const subentrati = panchina.slice(0, 2 + Math.floor(rand() * 2));
    const inCampo: Array<{ giocatore: Giocatore; minuti: number; titolare: boolean }> = [
      ...titolari.map((g) => ({ giocatore: g, minuti: 90, titolare: true })),
      ...subentrati.map((g) => ({
        giocatore: g,
        minuti: MINUTI_SUBENTRATO_MIN + Math.floor(rand() * (MINUTI_SUBENTRATO_MAX - MINUTI_SUBENTRATO_MIN)),
        titolare: false,
      })),
    ];
    const righe = new Map<Id, EventiGiocatorePartita>();
    const base = (g: Giocatore, minuti: number, titolare: boolean): EventiGiocatorePartita => ({
      partitaId,
      squadraId,
      giocatoreId: g.id,
      gol: 0,
      assist: 0,
      giallo: false,
      rosso: false,
      voto: 0,
      portaInviolata: false,
      minuti,
      titolare,
    });
    for (const { giocatore, minuti, titolare } of inCampo) {
      righe.set(giocatore.id, base(giocatore, minuti, titolare));
    }

    const inCampoPerRuolo = (ruolo: string): Giocatore[] =>
      inCampo.filter((e) => e.giocatore.ruolo === ruolo).map((e) => e.giocatore);
    const attaccanti = () => inCampoPerRuolo('attaccante');
    const diRuolo = (ruolo: string): Giocatore[] =>
      inCampoPerRuolo(ruolo).length > 0 ? inCampoPerRuolo(ruolo) : inCampo.map((e) => e.giocatore);

    // --- Gol ---
    for (let i = 0; i < golFatti; i++) {
      const rigore = rand() < PROB_RIGORE;
      let marcatore: Giocatore | undefined;
      if (rigore) {
        marcatore = pescaGiocatore(rand, attaccanti().length > 0 ? attaccanti() : inCampo.map((e) => e.giocatore));
      } else {
        const ruolo = pescaRuolo(rand, PESI_GOL_RUOLO);
        marcatore = pescaGiocatore(rand, diRuolo(ruolo));
      }
      if (!marcatore) continue;
      const riga = righe.get(marcatore.id);
      if (riga) riga.gol++;
      // Assist (~3 gol su 4)
      if (!rigore && rand() < FRAZIONE_GOL_CON_ASSIST) {
        const ruoloAssist = pescaRuolo(rand, PESI_ASSIST_RUOLO);
        const candidati = diRuolo(ruoloAssist).filter((g) => g.id !== marcatore.id);
        const assistman = pescaGiocatore(rand, candidati);
        if (assistman) {
          const rigaAssist = righe.get(assistman.id);
          if (rigaAssist) rigaAssist.assist++;
        }
      }
    }

    // --- Cartellini ---
    // Gialli: ~GIALLI_MEDIA_SQUADRA a partita, pesati per ruolo.
    const nGialli = Math.round(GIALLI_MEDIA_SQUADRA + (rand() * 2 - 1) * 0.9);
    for (let i = 0; i < nGialli; i++) {
      const ruolo = pescaRuolo(rand, PESI_GIALLI_RUOLO);
      const candidati = diRuolo(ruolo).filter((g) => {
        const r = righe.get(g.id);
        return r && !r.giallo && !r.rosso;
      });
      const ammonito = pescaGiocatore(rand, candidati);
      if (ammonito) {
        const riga = righe.get(ammonito.id);
        if (riga) riga.giallo = true;
      }
    }
    // Rossi: rari (~0,15 a squadra). Il rosso tronca i minuti del giocatore.
    if (rand() < ROSSI_MEDIA_SQUADRA) {
      const ruolo = pescaRuolo(rand, PESI_ROSSI_RUOLO);
      const candidati = diRuolo(ruolo).filter((g) => {
        const r = righe.get(g.id);
        return r && !r.rosso;
      });
      const espulso = pescaGiocatore(rand, candidati);
      if (espulso) {
        const riga = righe.get(espulso.id);
        if (riga) {
          riga.rosso = true;
          riga.minuti = Math.min(riga.minuti, 15 + Math.floor(rand() * 60));
        }
      }
    }

    // --- Porta inviolata: la squadra NON ha subito gol (certo, non probabilistico).
    // PROB_CLEAN_SHEET in statisticheReali.ts serve solo da benchmark di calibra.
    const cleanSheet = subiti === 0;

    // --- Voti ---
    for (const riga of righe.values()) {
      const g = rosa.find((x) => x.id === riga.giocatoreId);
      if (!g) continue;
      let voto = votoBaseDaOverall(g.overall);
      voto += riga.gol * BONUS_VOTO.gol;
      voto += riga.assist * BONUS_VOTO.assist;
      if (cleanSheet && riga.minuti >= 60) {
        voto += g.ruolo === RUOLO_PORTIERE ? BONUS_VOTO.cleanSheetPortiere : g.ruolo === 'difensore' ? BONUS_VOTO.cleanSheetDifensore : 0;
        if (g.ruolo === RUOLO_PORTIERE || g.ruolo === 'difensore') riga.portaInviolata = true;
      }
      if (riga.giallo) voto += BONUS_VOTO.giallo;
      if (riga.rosso) voto += BONUS_VOTO.rosso;
      // Rumore uniforme ±VOTO_SIGMA
      const rumore = (rand() - 0.5) * 2 * VOTO_SIGMA;
      voto += rumore;
      voto = Math.min(VOTO_MAX, Math.max(VOTO_MIN, Math.round(voto * 2) / 2));
      riga.voto = voto;
    }

    return [...righe.values()];
}

/** I marcatori di una squadra dagli eventi (per le note partita). */
export function marcatoriDaEventi(eventi: EventiGiocatorePartita[], rosa: Giocatore[]): string[] {
  const nomi = new Map(rosa.map((g) => [g.id, g.nome]));
  const out: string[] = [];
  for (const e of eventi) {
    for (let i = 0; i < e.gol; i++) out.push(nomi.get(e.giocatoreId) ?? '—');
  }
  return out;
}

/** Riepilogo testuale breve degli eventi (note leggibili). */
export function noteDaEventi(eventi: EventiGiocatorePartita[], rosa: Giocatore[]): string | undefined {
  const nomi = new Map(rosa.map((g) => [g.id, g.nome]));
  const marcatori = new Map<string, number>();
  const assist = new Map<string, number>();
  const espulsi: string[] = [];
  for (const e of eventi) {
    const nome = nomi.get(e.giocatoreId) ?? '—';
    if (e.gol > 0) marcatori.set(nome, e.gol);
    if (e.assist > 0) assist.set(nome, e.assist);
    if (e.rosso) espulsi.push(nome);
  }
  const frasi: string[] = [];
  if (marcatori.size > 0) {
    frasi.push(
      'Marcatori: ' +
        [...marcatori.entries()].map(([n, g]) => (g > 1 ? `${n} (${g})` : n)).join(', ') +
        '.',
    );
  }
  if (espulsi.length > 0) frasi.push(espulsi.length === 1 ? `Espulso: ${espulsi[0]}.` : `Espulsi: ${espulsi.join(', ')}.`);
  return frasi.length > 0 ? frasi.join(' ') : undefined;
}

export { RUOLI_CAMPO };
