// FLM — Motore referto (PRD 3.3): regole pure di formazione e simulazione CPU.
// Regola 3 AGENTS.md: funzioni PURE e deterministiche, nessuna scrittura qui.
// La transazione che applica il referto vive in src/db/referti.ts.
//
// Simulazione CPU (PRD 3.2: "regola basata sulla forza delle squadre, più un
// tocco di varianza"): gol attesi da media reale verificata + vantaggio casa +
// scarto dal rating Elo (continuo, non più 5 scaglioni), campionati con Poisson
// seminato dall'ID partita. Stesso risultato a ogni rigenerazione.

import type { Giocatore, Id, Partita, Squadra } from '../types/entities';
import { RUOLO_PORTIERE } from './invariants';
import { hashString, poisson, prng } from './random';
import {
  BONUS_FORMA_STREAK,
  CAP_FORMA_STREAK,
  DIVISORE_SCARTO_RATING,
  GOL_MEDIA_SQUADRA,
  MINUTI_PARTITA,
  REVERSIONE_DRIFT,
  SCARTO_STAGIONALE,
  VANTAGGIO_CASA_GOL,
} from './rules';

export const RUOLI_CAMPO = ['difensore', 'centrocampista', 'attaccante'] as const;

/** Minimo di giocatori per ruolo nell'XI di default (struttura 4-3-3/4-4-2 realistica). */
export const XI_MIN_DIFENSORI = 4;
export const XI_MIN_CENTROCAMPISTI = 3;
export const XI_MIN_ATTACCANTI = 2;
export const XI_TOTALE = 11;

/**
 * XI di default per una partita: portiere migliore + 10 di campo con minimi
 * per ruolo (4 difensori, 3 centrocampisti, 2 attaccanti), riempiti per overall.
 * I minimi si rilassano se la rosa non ha abbastanza giocatori in un ruolo.
 * Funzione riutilizzabile: quando il CSV formazioni dell'editor verrà decodificato
 * (M prossima), basterà sostituire la fonte dei titolari, non il picker.
 */
export function xiDefault(giocatori: Giocatore[]): Id[] {
  const perRuolo = (ruolo: string) =>
    giocatori
      .filter((g) => g.ruolo === ruolo)
      .sort((a, b) => b.overall - a.overall || a.nome.localeCompare(b.nome, 'it'));

  const portieri = perRuolo(RUOLO_PORTIERE);
  const difensori = perRuolo('difensore');
  const centrocampisti = perRuolo('centrocampista');
  const attaccanti = perRuolo('attaccante');

  const scelti: Giocatore[] = [];
  const aggiungi = (lista: Giocatore[], quanti: number): void => {
    for (const g of lista) {
      if (scelti.length >= XI_TOTALE) break;
      if (quanti <= 0) break;
      if (scelti.includes(g)) continue;
      scelti.push(g);
      quanti--;
    }
  };

  if (portieri.length > 0) scelti.push(portieri[0] as Giocatore);
  aggiungi(difensori, XI_MIN_DIFENSORI);
  aggiungi(centrocampisti, XI_MIN_CENTROCAMPISTI);
  aggiungi(attaccanti, XI_MIN_ATTACCANTI);

  // Riempi fino a 10 di campo con i migliori overall rimasti
  const rimanenti = [...difensori, ...centrocampisti, ...attaccanti]
    .filter((g) => !scelti.includes(g))
    .sort((a, b) => b.overall - a.overall || a.nome.localeCompare(b.nome, 'it'));
  aggiungi(rimanenti, XI_TOTALE);

  return scelti.slice(0, XI_TOTALE).map((g) => g.id);
}

/**
 * Gol attesi per squadra: media reale (Serie A 2024/25 = 2.56/partita) + casa
 * SIMMETRICA (±0.175: la media totale resta 2.56, non gonfiata) + scarto dal
 * rating Elo (1 punto = 1/350 di gol attesi: 350 punti = 1 gol atteso).
 * Taratura: scripts/calibra-sim.ts contro la stagione reale 2024/25.
 */
export function golAttesi(ratingCasa: number, ratingTrasferta: number): { casa: number; trasferta: number } {
  const scarto = (ratingCasa - ratingTrasferta) / DIVISORE_SCARTO_RATING;
  const metaCasa = VANTAGGIO_CASA_GOL / 2;
  return {
    casa: Math.max(0.1, GOL_MEDIA_SQUADRA + metaCasa + scarto),
    trasferta: Math.max(0.1, GOL_MEDIA_SQUADRA - metaCasa - scarto),
  };
}

/**
 * Risultato simulato di una partita CPU: deterministico per ID partita
 * (seme = hash dell'ID, come lo shuffle del calendario). Nessun Math.random.
 */
export function simulaRisultato(
  partitaId: Id,
  ratingCasa: number,
  ratingTrasferta: number,
): { golCasa: number; golTrasferta: number } {
  const { casa, trasferta } = golAttesi(ratingCasa, ratingTrasferta);
  const rand = prng(hashString(partitaId));
  return { golCasa: poisson(rand, casa), golTrasferta: poisson(rand, trasferta) };
}

/** Minuti stagionali attribuiti a un titolare per una partita (90', recupero non contato). */
export function minutiPerPartita(): number {
  return MINUTI_PARTITA;
}

/**
 * Bonus forma di una squadra dalle partite GIÀ giocate della competizione:
 * striscia consecutiva più recente (vittorie +, sconfitte −, pareggio azzera),
 * × BONUS_FORMA_STREAK, cap ±CAP_FORMA_STREAK. Si somma al rating effettivo
 * SOLO per la simulazione CPU: crea il momentum (cluster in classifica) senza
 * toccare l'Elo, che resta pulito. Deterministico: deriva solo dalle partite.
 */
export function bonusForma(partite: Partita[], squadraId: Id): number {
  const giocate = partite
    .filter((p) => p.giocata && (p.casa === squadraId || p.trasferta === squadraId))
    .sort((a, b) => a.giornata - b.giornata);
  let striscia = 0;
  for (let i = giocate.length - 1; i >= 0; i--) {
    const p = giocate[i];
    if (!p) break;
    const inCasa = p.casa === squadraId;
    const golSquadra = inCasa ? p.golCasa : p.golTrasferta;
    const golAvversario = inCasa ? p.golTrasferta : p.golCasa;
    const segno = golSquadra > golAvversario ? 1 : golSquadra < golAvversario ? -1 : 0;
    if (segno === 0) break; // pareggio: azzera la striscia
    if (striscia === 0) {
      striscia = segno;
    } else if (striscia * segno > 0) {
      striscia += segno;
    } else {
      break; // risultato di segno opposto: la striscia è finita qui
    }
  }
  return Math.min(CAP_FORMA_STREAK, Math.max(-CAP_FORMA_STREAK, striscia * BONUS_FORMA_STREAK));
}

/**
 * Scostamento stagionale di una squadra: deterministico da carriera+stagione+
 * squadra → uniforme in [−SCARTO_STAGIONALE, +SCARTO_STAGIONALE]. Modella il
 * "quest'anno la squadra rende più/meno del suo overall" (mercato, allenatore,
 * infortuni, fortuna): è la fonte delle stagioni dominanti reali (campione 90+)
 * e di quelle flop, senza toccare l'Elo che resta pulito. Stabile per tutta la
 * stagione (stesso seme): rollback-safe perché non viene mai scritto.
 */
export function scostamentoStagionale(carrieraId: Id, stagione: string, squadraId: Id): number {
  if (SCARTO_STAGIONALE <= 0) return 0;
  const rand = prng(hashString(`${carrieraId}|${stagione}|${squadraId}`));
  return Math.round((rand() * 2 - 1) * SCARTO_STAGIONALE);
}

/**
 * Rating effettivo per la simulazione CPU: rating corrente con mean reversion
 * della deriva intra-stagione (solo REVERSIONE_DRIFT della deriva conta: il
 * resto è rumore che rientra) + bonus forma dalla striscia + scostamento
 * stagionale. L'Elo salvato NON viene toccato: resta la forza di lungo periodo.
 */
export function ratingEffettivo(
  squadra: Squadra,
  carrieraId: Id,
  stagione: string,
  partiteGiocate: Partita[],
): number {
  const base = squadra.ratingInizioStagione ?? squadra.rating;
  const deriva = (squadra.rating - base) * REVERSIONE_DRIFT;
  return squadra.rating - deriva + bonusForma(partiteGiocate, squadra.id) + scostamentoStagionale(carrieraId, stagione, squadra.id);
}

/** Compone il testo leggibile delle note del referto (PRD 3.4: `Partita.note`). */
export function testoNoteReferto(parti: {
  espulsi: string[];
  infortunati: string[];
  prestazioni: string[];
}): string | undefined {
  const frasi: string[] = [];
  if (parti.espulsi.length > 0) {
    frasi.push(parti.espulsi.length === 1 ? `Espulso: ${parti.espulsi[0]}.` : `Espulsi: ${parti.espulsi.join(', ')}.`);
  }
  if (parti.infortunati.length > 0) {
    frasi.push(
      parti.infortunati.length === 1 ? `Infortunato: ${parti.infortunati[0]}.` : `Infortunati: ${parti.infortunati.join(', ')}.`,
    );
  }
  if (parti.prestazioni.length > 0) {
    frasi.push(
      parti.prestazioni.length === 1
        ? `Prestazione eccezionale: ${parti.prestazioni[0]}.`
        : `Prestazioni eccezionali: ${parti.prestazioni.join(', ')}.`,
    );
  }
  return frasi.length > 0 ? frasi.join(' ') : undefined;
}
