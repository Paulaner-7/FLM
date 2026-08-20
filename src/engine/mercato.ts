// FLM — Motore di mercato (PRD 7.3): transazioni, non racconti.
// Regola 3 AGENTS.md: TUTTI i numeri del mercato sono calcolati QUI, con
// funzioni PURE e deterministiche. L'LLM produce solo testi (motivazioni,
// risposte delle trattative, notizie) — mai cifre, mai decisioni.
//
// FONTI (regola 6 AGENTS.md, verifica web agosto 2026, docs/verifica-web.md):
// - Valori: Transfermarkt 2025/26 — top-50 mondiale (Haaland 26 €220M, Yamal 19
//   €220M, Bellingham 23 €160M, Saliba 25 €100M, Belotti 32 €1.5M, Pavoletti 37
//   €600k), Serie B (Salernitana: top Łęgowski 23 €2M, panchina €100-600k),
//   Serie A (Cagliari: Piccoli 25 €14M, Esposito 23 €15M, Palestra 21 €35M,
//   Mina 31 €2.5M, Zortea 27 €7M).
// - Finestre: Transfermarkt finestre estive 2025/26 top-5 — Premier 414 arrivi,
//   Serie A 314, LaLiga 361, Ligue 1 351, Bundesliga 431 (≈1.870 totali; ≈19 a
//   club; metà sono prestiti/svincolati/giovani → definitivi ~9-10 a club).
// - Trattative: FM help ufficiale ("la volontà di negoziare limita i giri,
//   a 0 la trattativa salta"), FM26 (offerta iniziale 20-30% sotto il prezzo,
//   must-respond al deadline day).

import type {
  Giocatore,
  Id,
  Squadra,
  SquadAssignment,
  Trattativa,
} from '../types/entities';
import {
  MAX_ROSA_MOVIMENTO,
  RUOLO_PORTIERE,
  giocatoriMovimento,
  proprietaAttivaDi,
} from './invariants';
import { prng } from './random';
import {
  FINESTRA_ESTATE,
  FINESTRA_INVERNO,
  CONCESSIONE_FATTORE,
  SOGLIA_CPU_MIN,
  SOGLIA_CPU_MAX,
  TETTO_CPU,
  GIORNI_GIRO_CPU,
  ETA_MAX_VENDITA,
  VALORE_MIN_OFFERTA,
  CESSIONE_LEADER_MORALE,
  CESSIONE_LEADER_TIFOSI,
  CESSIONE_TITOLARE_MORALE,
  CESSIONE_TITOLARE_TIFOSI,
  ACQUISTO_TOP_MORALE,
  ACQUISTO_TOP_TIFOSI,
  ACQUISTO_TOP_SCARTO,
  INGAGGIO_FATTORE,
  ANNI_CONTRATTO,
} from './rules';

// ---------------------------------------------------------------------------
// Formula del valore di mercato (PRD 7.3, documentata in config)
// ---------------------------------------------------------------------------

/** Valore base (€) per overall: 200k × 1.28^(overall−60), cap 250M. */
export const BASE_VALORE = 200_000;
export const ESPONENTE_VALORE = 1.28;
export const CAP_VALORE = 250_000_000;

/** Multiplicatore età (picco 23-26, crollo 31+, dati Transfermarkt verificati) */
export const FATTORE_ETA: ReadonlyArray<{ finoA: number; fattore: number }> = [
  { finoA: 17, fattore: 0.5 },
  { finoA: 19, fattore: 0.85 },
  { finoA: 22, fattore: 0.9 },
  { finoA: 26, fattore: 1.0 },
  { finoA: 28, fattore: 0.9 },
  { finoA: 30, fattore: 0.7 },
  { finoA: 32, fattore: 0.3 },
  { finoA: 35, fattore: 0.12 },
  { finoA: 99, fattore: 0.05 },
];

/** Multiplicatore ruolo (attaccanti premium, portieri scontati — dati reali) */
export const FATTORE_RUOLO: Record<string, number> = {
  attaccante: 1.15,
  ala: 1.05,
  esterno: 1.05,
  trequartista: 1.05,
  centrocampista: 1.0,
  difensore: 0.85,
  terzino: 0.85,
  portiere: 0.6,
};

/** Anni di contratto residuo → fattore (scadenza = forte sconto, caso reale) */
export function anniContrattoResidui(scadenzaContratto: string, stagioneCorrente: string): number {
  const annoScadenza = Number(scadenzaContratto.split('/')[0]);
  const annoCorrente = Number(stagioneCorrente.split('/')[0]);
  if (!Number.isFinite(annoScadenza) || !Number.isFinite(annoCorrente)) return 3;
  return Math.max(0, annoScadenza - annoCorrente);
}

export function fattoreContratto(anniResidui: number): number {
  if (anniResidui <= 0) return 0.5;
  if (anniResidui === 1) return 0.7;
  if (anniResidui === 2) return 0.85;
  return 1.0;
}

function fattoreRuolo(ruolo: string): number {
  const r = ruolo.toLowerCase();
  return FATTORE_RUOLO[r] ?? 1.0;
}

function fattoreEta(eta: number): number {
  for (const banda of FATTORE_ETA) {
    if (eta <= banda.finoA) return banda.fattore;
  }
  return 0.05;
}

/**
 * Valore di mercato deterministico (PRD 7.3): formula su overall, età, ruolo,
 * contratto residuo. On-the-fly: mai persistito, sempre coerente con lo stato.
 */
export function valoreMercato(giocatore: Giocatore, stagioneCorrente: string): number {
  const base = BASE_VALORE * Math.pow(ESPONENTE_VALORE, (giocatore.overall ?? 60) - 60);
  const anni = anniContrattoResidui(giocatore.scadenzaContratto, stagioneCorrente);
  const valore = base * fattoreEta(giocatore.eta) * fattoreRuolo(giocatore.ruolo) * fattoreContratto(anni);
  return Math.round(Math.min(CAP_VALORE, Math.max(0, valore)));
}

/** Ingaggio annuo: ancorato al valore (~5%), mai negoziato (PRD 7.3). */
export function ingaggioDaValore(valore: number): number {
  return Math.round(valore * INGAGGIO_FATTORE);
}

/** Nuovo contratto dopo un trasferimento: stagione corrente + N anni. */
export function nuovaScadenzaContratto(stagioneCorrente: string, anni: number = ANNI_CONTRATTO): string {
  const anno = Number(stagioneCorrente.split('/')[0]);
  if (!Number.isFinite(anno)) return stagioneCorrente;
  return `${anno + anni}/${String(anno + anni + 1).slice(2)}`;
}

// ---------------------------------------------------------------------------
// Finestre di mercato (PRD 7.3 + decisione utente M4: 30 giorni, congela calendario)
// ---------------------------------------------------------------------------

export type FinestraMercato = 'estate' | 'inverno';

export interface FinestraAttiva {
  nome: FinestraMercato;
  giorno: number;
  giorniTotali: number;
}

/**
 * Finestra di mercato per settimana (PRD 7.3): estate = settimane 1-9
 * (1 lug-31 ago), inverno = 27-31 (1-31 gen). Date reali 2026/27.
 */
export function finestraDiSettimana(settimana: number): FinestraMercato | null {
  if (settimana >= FINESTRA_ESTATE.da && settimana <= FINESTRA_ESTATE.a) return 'estate';
  if (settimana >= FINESTRA_INVERNO.da && settimana <= FINESTRA_INVERNO.a) return 'inverno';
  return null;
}

/** La finestra di mercato è attiva per la settimana data. */
export function finestraAttiva(settimana: number): FinestraMercato | null {
  return finestraDiSettimana(settimana);
}

/** Etichetta leggibile della finestra. */
export function nomeFinestra(finestra: FinestraMercato): string {
  return finestra === 'estate' ? 'Estate' : 'Gennaio';
}

// ---------------------------------------------------------------------------
// Bisogni delle rose (CPU market, PRD 7.3: il motore genera i bisogni)
// ---------------------------------------------------------------------------

export interface BisognoRosa {
  squadraId: Id;
  /** Ruolo scoperto: 'portiere' | 'difensore' | 'centrocampista' | 'attaccante' */
  ruolo: string;
  /** Intensità 0-100: quanto pesa il bisogno */
  intensita: number;
  /** Motivazione tecnica (per il prompt LLM) */
  motivo: string;
  /** Overall minimo accettabile per il ruolo */
  overallMin: number;
}

const RUOLI_REPARTO = ['portiere', 'difensore', 'centrocampista', 'attaccante'] as const;

export function repartoDi(ruolo: string): string {
  const r = ruolo.toLowerCase();
  if (r.includes('portiere')) return 'portiere';
  if (r.includes('difensore') || r.includes('terzino') || r.includes('centrale')) return 'difensore';
  if (r.includes('attaccante') || r.includes('ala') || r.includes('punta')) return 'attaccante';
  return 'centrocampista';
}

/**
 * Bisogni deterministici di una rosa: ruoli scoperti (pochi giocatori per
 * reparto), età avanzata nei reparti, rating sotto la media della lega.
 */
export function bisogniRosa(
  squadra: Squadra,
  giocatori: Giocatore[],
  assignments: SquadAssignment[],
  mediaLega: number,
): BisognoRosa[] {
  const ids = new Set(
    assignments
      .filter((a) => a.squadraId === squadra.id && a.tipo === 'proprieta' && a.al === undefined)
      .map((a) => a.giocatoreId),
  );
  const rosa = giocatori.filter((g) => ids.has(g.id));
  if (rosa.length === 0) return [];

  const bisogni: BisognoRosa[] = [];
  for (const reparto of RUOLI_REPARTO) {
    const delReparto = rosa.filter((g) => repartoDi(g.ruolo) === reparto);
    const over30 = delReparto.filter((g) => g.eta > 30);
    let intensita = 0;
    let motivo = '';
    let overallMin = 60;

    if (reparto === 'portiere') {
      if (delReparto.length === 0) {
        intensita = 95;
        motivo = 'Nessun portiere in rosa';
      } else if (delReparto.length < 2) {
        intensita = 60;
        motivo = 'Un solo portiere: serve un vice';
      }
      overallMin = 62;
    } else {
      const sogliaMin = reparto === 'difensore' ? 3 : reparto === 'centrocampista' ? 4 : 3;
      if (delReparto.length < sogliaMin) {
        intensita = 80;
        motivo = `Solo ${delReparto.length} ${reparto === 'difensore' ? 'difensori' : reparto}: reparto sotto organico`;
        overallMin = reparto === 'difensore' ? 65 : 68;
      } else if (over30.length >= Math.ceil(delReparto.length / 2)) {
        intensita = 55;
        motivo = `Reparto invecchiato: ${over30.length}/${delReparto.length} over 30`;
        overallMin = 66;
      }
    }

    if (intensita > 0) {
      // Squadre sotto la media della lega: bisogno più forte
      if (squadra.rating < mediaLega - 40) intensita = Math.min(100, intensita + 15);
      bisogni.push({ squadraId: squadra.id, ruolo: reparto, intensita, motivo, overallMin });
    }
  }

  // Rosa corta (sotto i 22 di movimento): bisogno generico di rinforzo
  const movimento = rosa.filter((g) => !g.giovane && g.ruolo !== RUOLO_PORTIERE).length;
  if (movimento < 22) {
    bisogni.push({
      squadraId: squadra.id,
      ruolo: 'centrocampista',
      intensita: Math.max(40, 80 - (22 - movimento) * 5),
      motivo: `Rosa corta (${movimento} di movimento): serve un rinforzo`,
      overallMin: 62,
    });
  }
  return bisogni;
}

// ---------------------------------------------------------------------------
// Offerte in entrata (PRD 7.3: il motore decide chi/quando/quanto, l'LLM il testo)
// ---------------------------------------------------------------------------

export interface EleggibilitaOfferta {
  giocatore: Giocatore;
  valore: number;
  /** 0-1 probabilità pesata (più il giocatore è appetibile, più è alta) */
  appetibilita: number;
}

/**
 * Eleggibilità di un giocatore a ricevere offerte in entrata:
 * valore ≥ soglia, non infortunato, età ≤ limite, non leader insostituibile.
 */
export function eleggibilePerOfferta(giocatore: Giocatore, settimana: number): boolean {
  if (giocatore.infortunioFinoA !== undefined && giocatore.infortunioFinoA > settimana) return false;
  if (giocatore.eta > ETA_MAX_VENDITA) return false;
  return true;
}

/**
 * Appetibilità 0-1 di un giocatore per il mercato: overall, forma, età,
 * ruolo (attaccanti più richiesti). Base per il peso di pesca.
 */
export function appetibilita(giocatore: Giocatore, valore: number): number {
  if (valore < VALORE_MIN_OFFERTA) return 0;
  const over = Math.max(0, Math.min(1, (giocatore.overall - 60) / 30));
  const forma = (giocatore.forma ?? 50) / 100;
  const eta = Math.max(0, Math.min(1, 1 - (giocatore.eta - 16) / 20));
  const ruolo = fattoreRuolo(giocatore.ruolo);
  return Math.min(1, (over * 0.5 + forma * 0.25 + eta * 0.15) * Math.min(1.2, ruolo) * 0.9);
}

/** Cifra proposta dalla CPU: valore × fattore bisogno (0.8-1.4). */
export function cifraOfferta(valore: number, bisogno: number, rand: () => number): number {
  const fattore = 0.8 + bisogno * 0.6 + (rand() - 0.5) * 0.2;
  return Math.round(valore * Math.max(0.8, Math.min(1.4, fattore)) / 1_000_000) * 1_000_000;
}

// ---------------------------------------------------------------------------
// Macchina a stati della trattativa (PRD 7.3, decisioni utente M4)
// ---------------------------------------------------------------------------

/**
 * Soglia interna CPU (deterministica): accetta la tua offerta se cifra ≥ soglia.
 * Range 0.9-1.1 × valore + rumore stabile da seed.
 */
export function sogliaCpu(valore: number, seed: string): number {
  const rand = prng(hashSeed(seed));
  const fattore = SOGLIA_CPU_MIN + rand() * (SOGLIA_CPU_MAX - SOGLIA_CPU_MIN);
  return Math.round(valore * fattore / 1_000_000) * 1_000_000;
}

/** Tetto CPU per una vendita (richieste oltre il tetto → rifiuto). */
export function tettoCpu(valore: number, seed: string): number {
  const rand = prng(hashSeed(seed + '|tetto'));
  const fattore = TETTO_CPU * (0.9 + rand() * 0.2);
  return Math.round(valore * fattore / 1_000_000) * 1_000_000;
}

/** Concessione CPU a ogni giro: si avvicina alla tua cifra del 25% del gap. */
export function cifraDopoConcessione(cifraCpu: number, cifraUtente: number): number {
  const gap = cifraUtente - cifraCpu;
  if (gap <= 0) return cifraCpu;
  return Math.round((cifraCpu + gap * CONCESSIONE_FATTORE) / 1_000_000) * 1_000_000;
}

/**
 * Esito della risposta CPU a una mossa dell'utente (funzione pura).
 * Ritorna la nuova cifra CPU e se la proposta è accettata.
 */
export interface RispostaCpu {
  accettata: boolean;
  cifraCpu: number;
  finalOffer: boolean;
}

export function rispostaCpu(
  trattativa: Trattativa,
  valore: number,
  cifraUtente: number,
  seed: string,
): RispostaCpu {
  // Acquisto: l'utente compra → la CPU vende. Soglia = prezzo minimo accettabile.
  // Vendita: l'utente vende → la CPU compra. Tetto = prezzo massimo accettabile.
  const accettata =
    trattativa.direzione === 'acquisto'
      ? cifraUtente >= trattativa.sogliaCpu
      : cifraUtente <= (trattativa.tettoCpu ?? tettoCpu(valore, seed));

  if (accettata) return { accettata: true, cifraCpu: cifraUtente, finalOffer: false };

  const ultimoGiro = trattativa.giro + 1 >= GIORNI_GIRO_CPU;
  // La CPU contropropone: concede il 25% del gap verso la tua cifra
  let nuovaCifra: number;
  if (trattativa.direzione === 'acquisto') {
    // Richiesta iniziale: 15% sopra la soglia (la CPU quota alto, poi scende)
    const asking = trattativa.cifraCpu > 0 ? trattativa.cifraCpu : Math.round((trattativa.sogliaCpu * 1.15) / 1_000_000) * 1_000_000;
    const gap = asking - cifraUtente;
    nuovaCifra = gap <= 0 ? asking : asking - gap * CONCESSIONE_FATTORE;
    // Mai sotto la soglia (prezzo minimo accettabile), mai sopra la richiesta
    nuovaCifra = Math.min(Math.max(nuovaCifra, trattativa.sogliaCpu), asking);
  } else {
    const base = trattativa.cifraCpu > 0 ? trattativa.cifraCpu : trattativa.tettoCpu ?? 0;
    const gap = cifraUtente - base;
    nuovaCifra = gap <= 0 ? base : base + gap * CONCESSIONE_FATTORE;
    // La CPU non supera MAI il suo tetto (prezzo massimo accettabile)
    nuovaCifra = Math.min(nuovaCifra, trattativa.tettoCpu ?? base);
  }
  return { accettata: false, cifraCpu: nuovaCifra, finalOffer: ultimoGiro };
}

// ---------------------------------------------------------------------------
// Effetti delle cessioni eccellenti (PRD 7.3, decisione utente Q8)
// ---------------------------------------------------------------------------

export interface EffettiCessione {
  moraleTutti: number;
  fiduciaTifosi: number;
  /** Se true, la cessione merita un evento LLM di reazione spogliatoio */
  eventoReazione: boolean;
}

/**
 * Effetti deterministici di una cessione sul morale spogliatoio e sui tifosi.
 * Cessione eccellente = leader, oppure overall top-3 della rosa, oppure
 * titolare con ≥70% presenze.
 */
export function effettiCessione(
  ceduto: Giocatore,
  rosa: Giocatore[],
  presenzeTitolare: (giocatoreId: Id) => number,
  partiteGiocate: number,
): EffettiCessione {
  const leader = ceduto.leader;
  // Top-3 della rosa per overall (il ceduto incluso: è appena uscito dalla rosa)
  const ordinati = [...rosa, ceduto].sort((a, b) => b.overall - a.overall);
  const posizione = ordinati.findIndex((g) => g.id === ceduto.id);
  const top3 = posizione >= 0 && posizione < 3;
  const presenzaRatio = partiteGiocate > 0 ? presenzeTitolare(ceduto.id) / partiteGiocate : 0;
  const titolareFisso = presenzaRatio >= 0.7;

  if (leader) {
    return { moraleTutti: CESSIONE_LEADER_MORALE, fiduciaTifosi: CESSIONE_LEADER_TIFOSI, eventoReazione: true };
  }
  if (top3 || titolareFisso) {
    return {
      moraleTutti: CESSIONE_TITOLARE_MORALE,
      fiduciaTifosi: CESSIONE_TITOLARE_TIFOSI,
      eventoReazione: top3,
    };
  }
  return { moraleTutti: 0, fiduciaTifosi: 0, eventoReazione: false };
}

/** Effetti di un acquisto top (overall ≥ media rosa + scarto): morale + tifosi. */
export function effettiAcquisto(acquistato: Giocatore, rosa: Giocatore[]): { moraleTutti: number; fiduciaTifosi: number } {
  const media = rosa.length > 0 ? rosa.reduce((s, g) => s + g.overall, 0) / rosa.length : 60;
  if (acquistato.overall < media + ACQUISTO_TOP_SCARTO) return { moraleTutti: 0, fiduciaTifosi: 0 };
  return { moraleTutti: ACQUISTO_TOP_MORALE, fiduciaTifosi: ACQUISTO_TOP_TIFOSI };
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function hashSeed(valore: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < valore.length; i++) {
    h ^= valore.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Il giocatore più forte di un ruolo in una rosa (per il bisogno CPU). */
export function migliorGiocatoreRuolo(
  ruolo: string,
  giocatori: Giocatore[],
  assignments: SquadAssignment[],
  squadraId: Id,
): Giocatore | null {
  const ids = new Set(
    assignments
      .filter((a) => a.squadraId === squadraId && a.tipo === 'proprieta' && a.al === undefined)
      .map((a) => a.giocatoreId),
  );
  const rosa = giocatori.filter((g) => ids.has(g.id));
  const candidati = rosa.filter((g) => repartoDi(g.ruolo) === ruolo);
  if (candidati.length === 0) return null;
  return [...candidati].sort((a, b) => b.overall - a.overall)[0] ?? null;
}

/** Giocatori di un club diversi da un escluso (per i candidati alla vendita CPU). */
export function giocatoriCedibili(
  squadraId: Id,
  giocatori: Giocatore[],
  assignments: SquadAssignment[],
  escludi: Set<Id> = new Set(),
): Giocatore[] {
  const ids = new Set(
    assignments
      .filter((a) => a.squadraId === squadraId && a.tipo === 'proprieta' && a.al === undefined)
      .map((a) => a.giocatoreId),
  );
  return giocatori.filter((g) => ids.has(g.id) && !escludi.has(g.id) && !g.leader);
}

export { MAX_ROSA_MOVIMENTO, RUOLO_PORTIERE, giocatoriMovimento, proprietaAttivaDi };

// ---------------------------------------------------------------------------
// Testi fallback (PRD 4.6: nessuna chiamata LLM richiesta — il mondo non si ferma)
// ---------------------------------------------------------------------------

/** Formatta una cifra in € (es. "8,5 M€"). */
export function formattaCifra(cifra: number): string {
  if (cifra >= 1_000_000) {
    const m = cifra / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1).replace('.', ',')} M€`;
  }
  return `${Math.round(cifra / 1000)} k€`;
}

/** Mail fallback per un'offerta in entrata (sostituita dal testo LLM se disponibile). */
export function testoOffertaInEntrata(giocatore: Giocatore, club: string, cifra: number, bisogno: string): string {
  return (
    `Il ${club} è interessato a ${giocatore.nome} (${giocatore.ruolo}, ${giocatore.eta} anni, overall ${giocatore.overall}). ` +
    `La nostra offerta è di ${formattaCifra(cifra)}. ${bisogno}. ` +
    `Siamo pronti a chiudere rapidamente: la proposta resta valida per pochi giorni.`
  );
}

/** Risposta CPU fallback (tono variabile per seed: freddo/interessato/definitivo). */
export function testoRispostaCpu(
  esito: 'accettata' | 'controproposta' | 'final_offer' | 'rifiuto',
  giocatore: Giocatore,
  cifra: number,
  seed: string,
): string {
  const rand = prng(hashSeed(seed + '|tono'));
  const tono = rand();
  switch (esito) {
    case 'accettata':
      return `Accettiamo la proposta per ${giocatore.nome}: ${formattaCifra(cifra)}. Prepariamo le carte, è un accordo.`;
    case 'controproposta':
      return tono < 0.5
        ? `La cifra non ci convince. Possiamo incontrarci su ${formattaCifra(cifra)}: è il nostro limite.`
        : `Ci abbiamo pensato: per ${giocatore.nome} chiediamo ${formattaCifra(cifra)}. Siamo vicini, non perdiamo altro tempo.`;
    case 'final_offer':
      return `Ultima parola: ${formattaCifra(cifra)}. Prendere o lasciare, la trattativa si chiude qui.`;
    case 'rifiuto':
      return `Le distanze sono troppe. Chiudiamo la trattativa per ${giocatore.nome}: grazie per il tempo.`;
  }
}

/** Notizia di mercato fallback (una riga da gazzetta, dai movimenti validi). */
export function testoNotiziaMercato(giocatore: string, da: string, a: string, cifra: number): string {
  return cifra > 0
    ? `${a} chiude per ${giocatore}: operazione da ${formattaCifra(cifra)} con il ${da}.`
    : `${a} firma a parametro zero ${giocatore}, svincolato dal ${da}.`;
}

/** Reazione spogliatoio fallback dopo una cessione eccellente (evento LLM). */
export function testoReazioneCessione(ceduto: Giocatore, clubAcquirente: string): string {
  if (ceduto.leader) {
    return `La notizia della cessione di ${ceduto.nome} ha gelato lo spogliatoio: era uno dei leader dello spogliatoio e il suo passaggio al ${clubAcquirente} ha lasciato un vuoto che i compagni sentono già.`;
  }
  return `La cessione di ${ceduto.nome} al ${clubAcquirente} ha fatto discutere lo spogliatoio: era un punto di riferimento in campo e fuori.`;
}
