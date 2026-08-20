// FLM — Motore vivaio (PRD 7.5, decisioni utente intervista).
// Funzioni PURE e deterministiche: la transazione Dexie vive in src/db/vivaio.ts.
// Divisione compiti: qui nascono i NUMERI (overall, potenziale, crescita, ritiri,
// prestiti); l'LLM scrive solo identità (nomi) e narrativa (mini-storia, scout).

import type { Giocatore, Squadra, SquadAssignment } from '../types/entities';
import {
  applicaDeltaOverall,
  categoriaDaPos,
  generaAttributi,
  nomePosizionePes,
  POS_PER_CATEGORIA,
  randDaSeme,
  soffittoDaPotenziale,
  overallDaAttributi,
} from './attributi';
import { prng } from './random';
import {
  CRESCITA_MAX_ANNO,
  CRESCITA_MINUTI_MAX,
  CRESCITA_MINUTI_MIN,
  CROLLO_MAX,
  CROLLO_MIN,
  DECLINO_MAX_ANNO,
  DELTA_ANNUO_CAP,
  ETA_FINE_CRESCITA,
  ETA_INIZIO_DECLINO,
  ETA_PICCO_CRESCITA,
  FLOP_POTENZIALE_MAX,
  GEMMA_POTENZIALE_MAX,
  GEMMA_POTENZIALE_MIN,
  INTAKE_ETA_MAX,
  INTAKE_ETA_MIN,
  INTAKE_OVERALL_BASE,
  INTAKE_OVERALL_REP_FATTORE,
  INTAKE_OVERALL_REP_OFFSET,
  INTAKE_OVERALL_VARIANZA,
  POTENZIALE_MAX,
  POTENZIALE_MIN,
  PRESTITO_MINUTI_PANCHINA_MAX,
  PRESTITO_MINUTI_PANCHINA_MIN,
  PRESTITO_MINUTI_TITOLARE_MAX,
  PRESTITO_MINUTI_TITOLARE_MIN,
  PRESTITO_RATING_SCARTO,
  PROB_CROLLO,
  PROB_FLOP,
  PROB_GEMMA,
  PROB_NAZIONE_CLUB,
  PROB_SVOLTA,
  REGEN_ETA,
  REGEN_NAZIONI_EUROPA,
  REGEN_NAZIONI_TOP5,
  REGEN_PROB_EUROPA,
  REGEN_PROB_TOP5,
  RITIRO_ETA_CAP,
  RITIRO_FORMA_ALTA_FATTORE,
  RITIRO_FORMA_ALTA_SOGLIA,
  RITIRO_FORMA_BASSA_FATTORE,
  RITIRO_FORMA_BASSA_SOGLIA,
  RITIRO_PROB_PER_ETA,
  SOFFITTO_MAX_FATTORE,
  SOFFITTO_MIN_FATTORE,
  SVOLTA_MAX,
  SVOLTA_MIN,
} from './rules';
import { elencoNazioni } from '../data/countries';

/** Profilo sportivo di un nuovo giocatore (numeri: tutto deterministico). */
export interface ProfiloVivaio {
  pos: number;
  ruolo: string;
  eta: number;
  overall: number;
  potenziale: number;
  soffittoReale: number;
  nazionalita: string;
  /** Se rigenerato: nome del ritirato da cui rinasce */
  rigeneratoDi?: string;
}

/** Fascia di potenziale del rigenerato in base all'overall finale del ritirato. */
export function fasciaPotenzialeRegen(overallRitirato: number, rand: () => number): number {
  if (overallRitirato >= 85) return Math.round(85 + rand() * 7); // 85-92: erede del fuoriclasse
  if (overallRitirato >= 78) return Math.round(79 + rand() * 8); // 79-87
  if (overallRitirato >= 70) return Math.round(74 + rand() * 8); // 74-82
  return Math.round(68 + rand() * 7); // 68-75
}

/** Overall iniziale del rigenerato: correlato al potenziale, sempre 55-68 (PRD). */
export function overallInizialeRegen(potenziale: number, rand: () => number): number {
  const base = 50 + (potenziale - POTENZIALE_MIN) * 0.45;
  return Math.min(68, Math.max(55, Math.round(base + (rand() * 2 - 1) * 4)));
}

/**
 * Profilo di un prospetto dell'intake: overall dalla reputazione del club
 * (PRD 7.5, formula concordata) con varianza; gemme e flop a prescindere
 * dalla reputazione (decisione utente: una stella può nascere ovunque).
 */
export function profiloProspetto(input: {
  carrieraId: string;
  stagione: string;
  club: Squadra;
  indice: number;
}): ProfiloVivaio {
  const { carrieraId, stagione, club, indice } = input;
  const rand = randDaSeme(carrieraId, stagione, club.id, indice);

  const rep = club.reputazione ?? 50;
  const overallBase = INTAKE_OVERALL_BASE + (rep - INTAKE_OVERALL_REP_OFFSET) * INTAKE_OVERALL_REP_FATTORE;
  const overall = Math.round(overallBase + (rand() * 2 - 1) * INTAKE_OVERALL_VARIANZA);

  // Gemma / flop: sganciati dalla reputazione (decisione utente)
  let potenziale: number;
  const tiro = rand();
  if (tiro < PROB_GEMMA) {
    potenziale = Math.round(GEMMA_POTENZIALE_MIN + rand() * (GEMMA_POTENZIALE_MAX - GEMMA_POTENZIALE_MIN));
  } else if (tiro < PROB_GEMMA + PROB_FLOP) {
    potenziale = Math.round(POTENZIALE_MIN + rand() * (FLOP_POTENZIALE_MAX - POTENZIALE_MIN));
  } else {
    const correlato = overall + 12 + rand() * 10;
    potenziale = Math.round(Math.min(POTENZIALE_MAX, Math.max(POTENZIALE_MIN, correlato)));
  }

  const pos = scegliPosizione(rand);
  const eta = INTAKE_ETA_MIN + Math.floor(rand() * (INTAKE_ETA_MAX - INTAKE_ETA_MIN + 1));

  return {
    pos,
    ruolo: categoriaDaPos(pos),
    eta,
    overall,
    potenziale,
    soffittoReale: soffittoDaPotenziale(potenziale, rand),
    nazionalita: nazionalitaProspetto(club.nazione, rand),
  };
}

/** Posizione pesata per categoria (ruoli più comuni più probabili). */
function scegliPosizione(rand: () => number): number {
  // Pesi: difensori/centrocampisti più numerosi degli attaccanti (come il DB reale)
  const pool: number[] = [];
  const pesi: Readonly<Record<number, number>> = { 0: 8, 1: 16, 2: 10, 3: 10, 4: 12, 5: 16, 6: 8, 7: 8, 8: 12, 9: 9, 10: 9, 11: 6, 12: 12 };
  for (const [pos, peso] of Object.entries(pesi)) {
    for (let i = 0; i < peso; i++) pool.push(Number(pos));
  }
  return pool[Math.floor(rand() * pool.length)]!;
}

/** Nazionalità prospetto: paese del club ~87%, altrimenti casuale (vivai reali). */
export function nazionalitaProspetto(nazioneClub: string, rand: () => number): string {
  if (rand() < PROB_NAZIONE_CLUB) return nazioneClub;
  const altre = elencoNazioni().filter((n) => n !== nazioneClub);
  if (altre.length === 0) return nazioneClub;
  return altre[Math.floor(rand() * altre.length)]!;
}

/**
 * Nazionalità rigenerato (decisione utente): top-5 55%, altre europee 30%,
 * resto del mondo 15%.
 */
export function nazionalitaRegen(rand: () => number): string {
  const tiro = rand();
  if (tiro < REGEN_PROB_TOP5) {
    return REGEN_NAZIONI_TOP5[Math.floor(rand() * REGEN_NAZIONI_TOP5.length)]!;
  }
  if (tiro < REGEN_PROB_TOP5 + REGEN_PROB_EUROPA) {
    const europa = REGEN_NAZIONI_EUROPA;
    return europa[Math.floor(rand() * europa.length)]!;
  }
  const resto = elencoNazioni().filter(
    (n) => !(REGEN_NAZIONI_TOP5 as readonly string[]).includes(n) && !(REGEN_NAZIONI_EUROPA as readonly string[]).includes(n),
  );
  if (resto.length === 0) return 'Brasile';
  return resto[Math.floor(rand() * resto.length)]!;
}

/**
 * Profilo del rigenerato: stesso ruolo (e posizione se nota) del ritirato,
 * potenziale dalla fascia dell'overall finale, attributi ricostruiti da zero.
 */
export function profiloRigenerato(input: {
  carrieraId: string;
  stagione: string;
  ritirato: Giocatore;
  /** club destinatario (per seme e nazionalità base) */
  club: Squadra;
  indice: number;
  /** true = arriva nell'intake della squadra utente (probabilità gestita dal chiamante) */
  nelTuoIntake?: boolean;
}): ProfiloVivaio {
  const { carrieraId, stagione, ritirato, club, indice } = input;
  const rand = randDaSeme(carrieraId, stagione, club.id, 10000 + indice);
  const pos = ritirato.attributi
    ? ritirato.attributi.POS
    : POS_PER_CATEGORIA[ritirato.ruolo]?.[Math.floor(rand() * (POS_PER_CATEGORIA[ritirato.ruolo]?.length ?? 1))] ?? 5;
  const potenziale = fasciaPotenzialeRegen(ritirato.overall, rand);
  return {
    pos,
    ruolo: categoriaDaPos(pos),
    eta: REGEN_ETA,
    overall: overallInizialeRegen(potenziale, rand),
    potenziale,
    soffittoReale: soffittoDaPotenziale(potenziale, rand),
    nazionalita: nazionalitaRegen(rand),
    rigeneratoDi: ritirato.nome,
  };
}

/** Costruisce il Giocatore completo (attributi inclusi) da un profilo. */
export function giocatoreDaProfilo(input: {
  carrieraId: string;
  profilo: ProfiloVivaio;
  pesId: number;
  nome: string;
  stagione: string;
  club: Squadra;
  indice: number;
}): Giocatore {
  const { carrieraId, profilo, pesId, nome, stagione, club, indice } = input;
  const rand = randDaSeme(carrieraId, stagione, club.id, indice);
  const attributi = generaAttributi({
    pos: profilo.pos,
    eta: profilo.eta,
    overallTarget: profilo.overall,
    rand,
    creatoDaFlm: true,
  });
  attributi.Commentary = pesId;
  attributi.OwnerClub = club.pesId ?? 0;
  const g: Giocatore = {
    id: `pes-player-${pesId}`,
    carrieraId,
    pesId,
    nome,
    nazionalita: profilo.nazionalita,
    eta: profilo.eta,
    ruolo: profilo.ruolo,
    overall: profilo.overall,
    morale: 55,
    fiducia: 50,
    forma: 55,
    minutiStagione: 0,
    promesse: [],
    leader: false,
    giovane: true,
    valoreMercato: Math.max(100_000, profilo.overall * 800 + (25 - profilo.eta) * 8_000),
    scadenzaContratto: scadenzaDaStagione(stagione, 3),
    ingaggioAnnuo: Math.round(Math.max(100_000, profilo.overall * 800 + (25 - profilo.eta) * 8_000) * 0.05),
    attributi,
    potenziale: profilo.potenziale,
    soffittoReale: profilo.soffittoReale,
    creatoDaFlm: true,
    stagioneCreazione: stagione,
  };
  if (profilo.rigeneratoDi) g.rigeneratoDi = profilo.rigeneratoDi;
  return g;
}

/** Scadenza contratto "stagione + n anni" nel formato FLM ("2029/30"). */
export function scadenzaDaStagione(stagione: string, anni: number): string {
  const anno = Number(stagione.split('/')[0]);
  if (!Number.isFinite(anno)) return stagione;
  return `${anno + anni}/${String(anno + anni + 1).slice(2)}`;
}

/** Ritiro: probabilità per età × modificatore condizione (tabella concordata). */
export function ritiroDeciso(input: { eta: number; forma: number; rand: () => number }): boolean {
  const { eta, forma, rand } = input;
  if (eta < 33) return false;
  const chiave = Math.min(eta, RITIRO_ETA_CAP);
  let prob = RITIRO_PROB_PER_ETA[chiave] ?? 0.88;
  if (forma < RITIRO_FORMA_BASSA_SOGLIA) prob *= RITIRO_FORMA_BASSA_FATTORE;
  else if (forma > RITIRO_FORMA_ALTA_SOGLIA) prob *= RITIRO_FORMA_ALTA_FATTORE;
  return rand() < prob;
}

/**
 * Crescita annuale (decisioni utente): minuti + età + potenziale + forma con
 * code di distribuzione (annata di svolta / crollo) e soffitto reale nascosto.
 * Ritorna il delta overall (positivo o negativo).
 */
export function deltaCrescitaAnnuale(input: {
  eta: number;
  minuti: number;
  overall: number;
  potenziale: number;
  soffittoReale: number;
  formaMedia?: number;
  rand: () => number;
}): number {
  const { eta, minuti, overall, soffittoReale, formaMedia, rand } = input;

  // Fattore minuti: sotto CRESCITA_MINUTI_MIN non si cresce quasi, sopra MAX pieno
  const fattoreMinuti = Math.min(1, Math.max(0, (minuti - CRESCITA_MINUTI_MIN) / (CRESCITA_MINUTI_MAX - CRESCITA_MINUTI_MIN)));

  // Curva età: picco a 17, zero a 23 (per i giovani); declino dopo i 30
  let delta: number;
  if (eta <= ETA_FINE_CRESCITA) {
    const curvaEta = Math.max(0, 1 - Math.abs(eta - ETA_PICCO_CRESCITA) / (ETA_FINE_CRESCITA - ETA_PICCO_CRESCITA + 1));
    // Spazio al soffitto normalizzato su headroom fisso (25 punti): chi è lontano
    // dal potenziale cresce più in fretta, chi è vicino rallenta (curva reale).
    const spazioAlSoffitto = Math.min(1, Math.max(0, (soffittoReale - overall) / 25));
    const atteso = CRESCITA_MAX_ANNO * fattoreMinuti * curvaEta * spazioAlSoffitto;
    // Rumore stagionale: non tutti raggiungono il potenziale, alcuni lo superano
    delta = atteso + (rand() * 3 - 1.5) * fattoreMinuti;
    // Annata di svolta (giovane): +5/+7
    if (rand() < PROB_SVOLTA) delta = SVOLTA_MIN + rand() * (SVOLTA_MAX - SVOLTA_MIN);
    // Crollo per un giovane = crescita nulla/stagnazione (mai negativo in età di crescita)
    if (rand() < PROB_CROLLO) delta = rand() < 0.5 ? 0 : 1;
    delta = Math.max(0, delta);
  } else if (eta >= ETA_INIZIO_DECLINO) {
    // Declino base + forma: chi ha fatto male tutta la stagione si indebolisce davvero
    const formaMod = (formaMedia ?? 50) < 40 ? 0.6 : (formaMedia ?? 50) > 70 ? -0.3 : 0;
    delta = -DECLINO_MAX_ANNO * (0.4 + (eta - ETA_INIZIO_DECLINO) / 12) + formaMod;
    if (rand() < PROB_CROLLO) delta = CROLLO_MIN + rand() * (CROLLO_MAX - CROLLO_MIN);
    delta = Math.min(0, delta);
  } else {
    // Fascia 24-29: stabilità con piccola varianza
    delta = (rand() * 2 - 1) * 1.5;
    if (rand() < PROB_SVOLTA) delta = SVOLTA_MIN + rand() * (SVOLTA_MAX - SVOLTA_MIN);
    if (rand() < PROB_CROLLO) delta = CROLLO_MIN + rand() * (CROLLO_MAX - CROLLO_MIN);
  }

  // Bonus forma stagionale (decisione utente): in forma cresce di più
  if (formaMedia !== undefined && eta <= ETA_FINE_CRESCITA) {
    if (formaMedia > 70) delta += 0.6;
    else if (formaMedia < 40) delta -= 0.6;
  }

  return Math.round(Math.min(DELTA_ANNUO_CAP, Math.max(-DELTA_ANNUO_CAP, delta)));
}

/** Minuti simulati in prestito: titolare se overall ≥ media rosa del club. */
export function minutiPrestitoSimulati(input: {
  overall: number;
  mediaOverallClub: number;
  rand: () => number;
}): number {
  const { overall, mediaOverallClub, rand } = input;
  if (overall >= mediaOverallClub) {
    return Math.round(PRESTITO_MINUTI_TITOLARE_MIN + rand() * (PRESTITO_MINUTI_TITOLARE_MAX - PRESTITO_MINUTI_TITOLARE_MIN));
  }
  return Math.round(PRESTITO_MINUTI_PANCHINA_MIN + rand() * (PRESTITO_MINUTI_PANCHINA_MAX - PRESTITO_MINUTI_PANCHINA_MIN));
}

/**
 * Scelta della destinazione del prestito (decisione utente: sceglie l'engine):
 * club reali dello stesso paese, rating inferiore (scarto minimo), con posto
 * in rosa. Migliore adattamento = bisogno di ruolo (pochi giocatori di quel
 * ruolo in rosa) + rating più vicino al proprietario.
 */
export function scegliClubPrestito(input: {
  giocatore: Giocatore;
  clubProprietario: Squadra;
  squadre: Squadra[];
  giocatori: Giocatore[];
  assignments: SquadAssignment[];
  rand: () => number;
}): Squadra | null {
  const { giocatore, clubProprietario, squadre, giocatori, assignments, rand } = input;
  const candidati = squadre.filter((s) => {
    if (s.ombra || s.nazionale) return false;
    if (s.id === clubProprietario.id) return false;
    if (s.nazione !== clubProprietario.nazione) return false;
    if (s.rating >= clubProprietario.rating - PRESTITO_RATING_SCARTO) return false;
    return true;
  });
  if (candidati.length === 0) return null;

  // Bisogno di ruolo: club con pochi giocatori dello stesso ruolo del prestato
  const attiviPerSquadra = new Map<string, number>();
  const ruoloCount = new Map<string, number>();
  for (const a of assignments) {
    if (a.tipo !== 'proprieta' || a.al !== undefined) continue;
    const g = giocatori.find((x) => x.id === a.giocatoreId);
    if (!g) continue;
    attiviPerSquadra.set(a.squadraId, (attiviPerSquadra.get(a.squadraId) ?? 0) + 1);
    if (g.ruolo === giocatore.ruolo) {
      ruoloCount.set(a.squadraId, (ruoloCount.get(a.squadraId) ?? 0) + 1);
    }
  }

  let migliore: Squadra | null = null;
  let punteggioMigliore = -Infinity;
  for (const s of candidati) {
    const totale = attiviPerSquadra.get(s.id) ?? 0;
    if (totale >= 28) continue; // rosa piena
    const bisogno = 3 - (ruoloCount.get(s.id) ?? 0); // più scoperto è il ruolo, meglio
    const vicinanza = clubProprietario.rating - s.rating; // più vicino, meglio
    const punteggio = bisogno * 10 - vicinanza / 20 + rand() * 2;
    if (punteggio > punteggioMigliore) {
      punteggioMigliore = punteggio;
      migliore = s;
    }
  }
  return migliore;
}

/** Costruisce la voce attributi completa per un giocatore cresciuto (helper per db). */
export function attributiAggiornati(g: Giocatore, delta: number): Giocatore['attributi'] {
  if (!g.attributi) return g.attributi;
  const pos = g.attributi.POS;
  const rand = prng((hashVivaio(`${g.id}|${g.stagioneCreazione ?? ''}|${g.eta}|${delta}`)));
  return applicaDeltaOverall(g.attributi, pos, delta, rand);
}

/** Hash stabile per la crescita (helper locale). */
function hashVivaio(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Media dei voti della finestra (per la verifica forma ogni 5 partite). */
export function mediaVotiFinestra(voti: number[]): number {
  if (voti.length === 0) return 0;
  return voti.reduce((s, v) => s + v, 0) / voti.length;
}

export { nomePosizionePes, overallDaAttributi, SOFFITTO_MIN_FATTORE, SOFFITTO_MAX_FATTORE };
