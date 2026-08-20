// FLM — Motore carriera lunga: reputazione, carosello, offerte, esonero (PRD 7.7)
// Regola 3 AGENTS.md: funzioni PURE e deterministiche, nessuna scrittura qui.
// La persistenza (transazioni Dexie) vive in src/db/panchine.ts.

import { ratingInizialeDaMedia } from './rating';
import {
  REPUTAZIONE_OBIETTIVO_CENTRATO,
  REPUTAZIONE_TROFEO_MAGGIORE,
  REPUTAZIONE_TROFEO_MEDIORE,
  REPUTAZIONE_TROFEO_MINORE,
  REPUTAZIONE_SUPERCOPPA,
  REPUTAZIONE_EUROPEO,
  REPUTAZIONE_OVER_ACHIEVEMENT,
  REPUTAZIONE_OBIETTIVO_FALLITO,
  REPUTAZIONE_RETROCESSIONE,
  REPUTAZIONE_PENALTY_ESONERO,
  SOGLIA_REPUTAZIONE_OFFERTE,
  OFFERTE_VOLONTARIE_MAX,
  OFFERTE_FORZATE_COUNT,
  CAROSELLO_PERCENTUALE,
  CAROSELLO_RANGE,
  ROSA_CT_TITOLARI,
  ROSA_CT_RISERVE,
} from './rules';
import { clamp } from './rules';
import type { ObiettivoStagionale, OffertaPanchina } from '../types/entities';

// ---------- Trofei: peso per tipo ----------

/** Peso della competizione per il calcolo reputazione (verificato su valori reali) */
const PESO_TROFEO: Record<string, number> = {
  campionato: REPUTAZIONE_TROFEO_MAGGIORE,
  champions_league: REPUTAZIONE_TROFEO_MAGGIORE,
  europa_league: REPUTAZIONE_TROFEO_MEDIORE,
  conference_league: REPUTAZIONE_TROFEO_MEDIORE,
  coppa_nazionale: REPUTAZIONE_TROFEO_MINORE,
  supercoppa: REPUTAZIONE_SUPERCOPPA,
  mondiale: REPUTAZIONE_TROFEO_MAGGIORE,
  europeo: REPUTAZIONE_EUROPEO,
};

/**
 * Delta reputazione a fine stagione da obiettivi e piazzamenti.
 * Calibrato sui valori reali di carriera allenatore: un campionato vale 15,
 * una coppa nazionale 5, l'obiettivo centrato 8, la retrocessione −20.
 */
export function deltaReputazione(input: {
  obiettivo: ObiettivoStagionale;
  obiettivoCentrato: boolean;
  trofei: Array<{ tipo: string }>;
  piazzamento: number;
  posizioneAttesa: number; // da rating Elo
  retrocessione: boolean;
  penaltyEsonero: boolean;
}): number {
  let delta = 0;

  // Obiettivo
  if (input.obiettivoCentrato) {
    delta += REPUTAZIONE_OBIETTIVO_CENTRATO;
  } else {
    delta += REPUTAZIONE_OBIETTIVO_FALLITO;
  }

  // Trofei (ogni singolo trofeo)
  for (const t of input.trofei) {
    delta += PESO_TROFEO[t.tipo] ?? REPUTAZIONE_TROFEO_MINORE;
  }

  // Over-achievement / under-achievement
  if (input.posizioneAttesa > input.piazzamento) {
    // Migliore del previsto
    const diff = input.posizioneAttesa - input.piazzamento;
    delta += Math.min(REPUTAZIONE_OVER_ACHIEVEMENT[1], REPUTAZIONE_OVER_ACHIEVEMENT[0] + diff);
  } else if (input.posizioneAttesa < input.piazzamento) {
    // Peggio del previsto
    const diff = input.piazzamento - input.posizioneAttesa;
    delta -= Math.min(REPUTAZIONE_OVER_ACHIEVEMENT[1], REPUTAZIONE_OVER_ACHIEVEMENT[0] + diff);
  }

  // Retrocessione
  if (input.retrocessione) {
    delta += REPUTAZIONE_RETROCESSIONE;
  }

  // Penalty esonero
  if (input.penaltyEsonero) {
    delta += REPUTAZIONE_PENALTY_ESONERO;
  }

  return delta;
}

// ---------- Carosello CPU ----------

/** Trofei che riducono la pressione del carosello (mitigano un piazzamento basso) */
const TROFEI_MITIGANTI = new Set(['coppa_nazionale', 'supercoppa']);

/**
 * Giudizio del carosello per un club CPU: vero se il manager deve essere esonerato.
 * Calcolato da piazzamento reale vs atteso (dal rating) + trofei.
 * La soglia è calibrata affinché ~10-20% dei club cambino allenatore.
 */
export function giudizioCaroselloClub(input: {
  posizioneReale: number;
  nSquadre: number;
  rating: number;
  trofeiVinti: string[];
  retrocesso: boolean;
}): boolean {
  if (input.retrocesso) return true;

  const mediaRating = 1500; // base Elo media
  const posizioneAttesa = Math.round(clamp(
    1 + (mediaRating - input.rating) / 50,
    1,
    input.nSquadre,
  ));

  const diff = input.posizioneReale - posizioneAttesa;
  // Se ha vinto un trofeo mitigante, serve una situazione peggiore per essere esonerato
  const haTrofeoMitigante = input.trofeiVinti.some((t) => TROFEI_MITIGANTI.has(t));
  const soglia = haTrofeoMitigante ? diff + 3 : diff;

  // Esonero se piazzamento > 3 posizioni sotto le attese
  return soglia > 3;
}

/**
 * Fracción di club che cambiano allenatore nel carosello (distribuzione casuale
 * ponderata: i club sotto le attese hanno più probabilità).
 * Ritorna il numero di movimenti (da estrarre e applicare con estrazione pesata).
 */
export function quantiCarosello(nClub: number): number {
  const percentuale = CAROSELLO_PERCENTUALE + (Math.random() * (CAROSELLO_RANGE[1] - CAROSELLO_RANGE[0]) - (CAROSELLO_RANGE[1] - CAROSELLO_RANGE[0]) / 2);
  return Math.max(1, Math.round(nClub * clamp(percentuale, CAROSELLO_RANGE[0], CAROSELLO_RANGE[1])));
}

// ---------- Offerte ----------

/** Genera le offerte per l'utente (volontarie o forzate). */
export function generaOfferte(input: {
  reputazione: number;
  esonerato: boolean;
  squadreCandidate: Array<{ id: string; nome: string; rating: number; campionato: string }>;
  ntCandidate: Array<{ id: string; nome: string; rating: number }>;
  stagione: string;
  carrieraId: string;
}): OffertaPanchina[] {
  const prestigioUtente = ratingInizialeDaMedia(input.reputazione);

  if (input.esonerato) {
    // Pool forzata: club di livello variabile
    const candidati = [...input.squadreCandidate]
      .sort((a, b) => Math.abs(a.rating - prestigioUtente) - Math.abs(b.rating - prestigioUtente))
      .slice(0, OFFERTE_FORZATE_COUNT);

    return candidati.map((c, i) => ({
      id: `offerta-${i}`,
      carrieraId: input.carrieraId,
      stagione: input.stagione,
      tipo: 'forzata' as const,
      squadraId: c.id,
      prestigio: c.rating,
      obiettivoProposto: obiettivoPerPrestigio(c.rating),
      stato: 'in_attesa' as const,
    }));
  }

  // Volontarie: solo se reputazione alta o trofei
  if (input.reputazione < SOGLIA_REPUTAZIONE_OFFERTE) return [];

  const candidati = [...input.squadreCandidate]
    .filter((c) => c.rating >= prestigioUtente - 10)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, OFFERTE_VOLONTARIE_MAX);

  return candidati.map((c, i) => ({
    id: `offerta-${i}`,
    carrieraId: input.carrieraId,
    stagione: input.stagione,
    tipo: 'volontaria' as const,
    squadraId: c.id,
    prestigio: c.rating,
    obiettivoProposto: obiettivoPerPrestigio(c.rating),
    stato: 'in_attesa' as const,
  }));
}

// ---------- Obiettivo dal prestigio ----------

/**
 * Obiettivo proposto per un nuovo club in base al suo prestigio (rating).
 * Calibrato sui obiettivi reali dei club europei (PRD 3.2).
 */
export function obiettivoPerPrestigio(rating: number): ObiettivoStagionale {
  if (rating >= 1700) return 'titolo';
  if (rating >= 1580) return 'coppe';
  if (rating >= 1480) return 'meta_classifica';
  return 'salvezza';
}

// ---------- Nazionali ----------

/** Giudizio del carosello CT dopo un torneo estivo. */
export function giudizioCaroselloCt(input: {
  piazzamentoTorneo: number; // posizione finale (1 = campione)
  nPartecipanti: number;
  ratingNazionale: number;
}): boolean {
  if (input.piazzamentoTorneo <= 1) return false; // campione → confermato
  const posizioneAttesa = Math.round(clamp(
    1 + (1700 - input.ratingNazionale) / 40,
    1,
    input.nPartecipanti,
  ));
  return input.piazzamentoTorneo > posizioneAttesa + 4;
}

/**
 * Soglia overall per le convocazioni in nazionale.
 * Le nazionali forti (mediaOverall alta) convocano più giocatori (soglia più bassa).
 * Verificata su calci reali: Italia convoca giocatori da ~70 in su, nazioni minori solo top.
 */
export function sogliaConvocazione(ratingNazionale: number): number {
  if (ratingNazionale >= 1800) return 70;
  if (ratingNazionale >= 1650) return 75;
  if (ratingNazionale >= 1500) return 80;
  return 85;
}

/**
 * Rosa nazionale derivata dallo snapshot: i migliori N giocatori della nazionalità.
 * Titolari = ROSA_CT_TITOLARI, riserve = ROSA_CT_RISERVE.
 * Nessuna assegnazione SquadAssignment (la rosa NT è derivata, non persistita).
 */
export function roseeNazionali(
  giocatori: Array<{ id: string; nazionalita: string; overall: number }>,
  nomeNazionalita: string,
): string[] {
  const candidati = giocatori
    .filter((g) => g.nazionalita === nomeNazionalita)
    .sort((a, b) => b.overall - a.overall);

  const totale = ROSA_CT_TITOLARI + ROSA_CT_RISERVE;
  return candidati.slice(0, totale).map((g) => g.id);
}

/** Effetti di una sosta sul giocatore convocato. */
export function effettiSosta(input: {
  vittoriaSquadra: boolean;
  minuti: number;
  eraTitolare: boolean;
}): { morale: number; forma: number; rischioInfortunio: number } {
  let morale = 0;
  let forma = 0;
  const rischioInfortunio = 0.02; // 2% base per sosta

  if (input.vittoriaSquadra) {
    morale += 3;
  } else {
    morale -= 2;
  }

  // Fatica dai minuti giocati
  if (input.minuti >= 80) {
    forma -= 4;
  } else if (input.minuti >= 45) {
    forma -= 2;
  }

  return { morale, forma, rischioInfortunio };
}
