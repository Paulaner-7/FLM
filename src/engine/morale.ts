// FLM — Motore morale (PRD 2.2, 3.2): regole PURE del modulo Morale & spogliatoio.
// Regola 3 AGENTS.md: classifica, morale, fiducia e ogni numero di gioco si
// calcolano SOLO qui. L'LLM produce solo testo e proposte: le richieste promessa
// sono eventi deterministici (candidato scelto dall'engine), l'LLM riscriverà
// le parole in M3. Nessuna scrittura qui: la transazione vive in db/referti.ts
// e db/morale.ts. Costanti di bilanciamento in rules.ts.

import type { Giocatore, Id, Partita, Promessa, TipoPromessa } from '../types/entities';
import {
  BONUS_MARCATORE_MORALE,
  EFFETTO_PAREGGIO_MORALE,
  EFFETTO_SCONFITTA_MORALE,
  EFFETTO_VITTORIA_MORALE,
  FASCIA_SPOGLIATOIO_CRISI,
  FASCIA_SPOGLIATOIO_SERENO,
  LEADER_PESO_MORALE,
  MINUTI_ATTESI_FATTORE_RICHIESTA,
  MINUTI_PARTITA,
  OVERALL_MIN_RICHIESTA,
  OVERALL_TITOLARE_RICHIESTA,
  PANCHINA_PROMESSO_MORALE,
  PROMESSA_DURATA_DEFAULT,
  PROMESSA_MANTENUTA_FIDUCIA,
  PROMESSA_MANTENUTA_MORALE,
  PROMESSE_MAX_ATTIVE,
  PROMESSA_PRESET_MINUTI_SOGLIA,
  PROMESSA_PRESET_TITOLARE_SOGLIA,
  PROMESSA_TRADITA_FIDUCIA,
  PROMESSA_TRADITA_MORALE,
  SOGLIA_MORALE_CRISI,
  arrotonda,
  clamp,
} from './rules';

// ---------- Indicatori di spogliatoio ----------

/** Media morale pesata: i leader pesano LEADER_PESO_MORALE (PRD 3.2). */
export function moraleSpogliatoio(giocatori: Giocatore[]): number {
  if (giocatori.length === 0) return 50;
  let somma = 0;
  let pesi = 0;
  for (const g of giocatori) {
    const peso = g.leader ? LEADER_PESO_MORALE : 1;
    somma += g.morale * peso;
    pesi += peso;
  }
  return arrotonda(somma / pesi);
}

export type FasciaSpogliatoio = 'sereno' | 'teso' | 'crisi';

export function fasciaSpogliatoio(morale: number): FasciaSpogliatoio {
  if (morale >= FASCIA_SPOGLIATOIO_SERENO) return 'sereno';
  if (morale < FASCIA_SPOGLIATOIO_CRISI) return 'crisi';
  return 'teso';
}

/** Giocatori in crisi (morale < SOGLIA_MORALE_CRISI): segnalazione pura. */
export function giocatoriInCrisi(giocatori: Giocatore[]): Giocatore[] {
  return giocatori.filter((g) => g.morale < SOGLIA_MORALE_CRISI);
}

/** Nomina leader al bootstrap: età ≥ ETA_MIN_LEADER e overall più alto, poi riempimento. */
export function scegliLeader(giocatori: Giocatore[], numero: number): Id[] {
  const ordinati = [...giocatori].sort(
    (a, b) => b.overall - a.overall || a.nome.localeCompare(b.nome, 'it'),
  );
  const veterani = ordinati.filter((g) => g.eta >= 26);
  const scelti = [...veterani.slice(0, numero)];
  for (const g of ordinati) {
    if (scelti.length >= numero) break;
    if (!scelti.includes(g)) scelti.push(g);
  }
  return scelti.slice(0, numero).map((g) => g.id);
}

// ---------- Effetti del referto (PRD 2.2: risultati, minuti, promesse) ----------

export interface InputEffettiMoraleReferto {
  /** Rosa completa della carriera */
  giocatori: Giocatore[];
  /** ID dei titolari schierati nel referto */
  titolari: Id[];
  /** ID dei marcatori (ripetuti per gol: il bonus è flat se ≥1) */
  marcatori: Id[];
  vittoria: boolean;
  pareggio: boolean;
  /** Settimana appena giocata (settimanaCorrente PRIMA dell'incremento) */
  settimana: number;
}

/**
 * Δ morale per giocatore dal referto:
 * - titolare: +5 vittoria / 0 pareggio / −5 sconfitta (+2 flat se marcatore)
 * - non titolare con promessa 'titolare' attiva: −2 (peso delle tue parole)
 * - infortunati già prima della partita: esenti (non potevano giocare)
 */
export function effettiMoraleReferto(input: InputEffettiMoraleReferto): Map<Id, number> {
  const deltas = new Map<Id, number>();
  const titolari = new Set(input.titolari);
  const marcatori = new Set(input.marcatori);
  const esenti = new Set(
    input.giocatori
      .filter((g) => g.infortunioFinoA !== undefined && g.infortunioFinoA >= input.settimana)
      .map((g) => g.id),
  );
  const segno = input.vittoria
    ? EFFETTO_VITTORIA_MORALE
    : input.pareggio
      ? EFFETTO_PAREGGIO_MORALE
      : EFFETTO_SCONFITTA_MORALE;

  for (const g of input.giocatori) {
    if (esenti.has(g.id)) continue;
    let delta = 0;
    if (titolari.has(g.id)) {
      delta += segno;
      if (marcatori.has(g.id)) delta += BONUS_MARCATORE_MORALE;
    } else if (g.promesse.some((p) => p.tipo === 'titolare' && p.stato === 'attiva')) {
      delta += PANCHINA_PROMESSO_MORALE;
    }
    if (delta !== 0) deltas.set(g.id, delta);
  }
  return deltas;
}

// ---------- Valutazione promesse a scadenza (PRD 2.2) ----------

/** Presenze da titolare del giocatore nella finestra [creata, scadenza] (inclusiva). */
export function presenzeTitolareFinestra(
  giocatoreId: Id,
  creata: number,
  scadenza: number,
  partiteSquadra: Partita[],
): number {
  return partiteSquadra.filter(
    (p) => p.giocata && p.giornata >= creata && p.giornata <= scadenza && (p.titolari ?? []).includes(giocatoreId),
  ).length;
}

/** Partite GIOCATE della squadra nella finestra [creata, scadenza] (inclusiva). */
export function partiteGiocateFinestra(creata: number, scadenza: number, partiteSquadra: Partita[]): number {
  return partiteSquadra.filter((p) => p.giocata && p.giornata >= creata && p.giornata <= scadenza).length;
}

/** Minuti accumulati nella finestra: il referto traccia solo titolari (90' a partita). */
export function minutiFinestra(
  giocatoreId: Id,
  creata: number,
  scadenza: number,
  partiteSquadra: Partita[],
): number {
  return presenzeTitolareFinestra(giocatoreId, creata, scadenza, partiteSquadra) * MINUTI_PARTITA;
}

/** Valutazione singola: binario secco (soglia è soglia). */
function promessaMantenuta(p: Promessa, giocatoreId: Id, partiteSquadra: Partita[]): boolean {
  if (p.tipo === 'minuti') {
    return minutiFinestra(giocatoreId, p.creata, p.scadenza, partiteSquadra) >= p.soglia;
  }
  // titolare: percentuale presenze sulle partite giocate nella finestra
  const giocate = partiteGiocateFinestra(p.creata, p.scadenza, partiteSquadra);
  if (giocate === 0) return true; // nessuna partita in finestra: niente da giudicare
  const presenze = presenzeTitolareFinestra(giocatoreId, p.creata, p.scadenza, partiteSquadra);
  return (presenze / giocate) * 100 >= p.soglia;
}

export interface EsitoValutazionePromesse {
  /** Rosa con le promesse scadute aggiornate a mantenuta/tradita */
  giocatori: Giocatore[];
  /** Conseguenze cumulative per giocatore (più promesse scadute insieme) */
  conseguenze: Map<Id, { morale: number; fiducia: number }>;
}

/**
 * Valuta TUTTE le promesse 'attiva' scadute alla settimana appena giocata.
 * La partita della settimana di scadenza CONTA (è già in partiteSquadra).
 * Le 'coppa' non si valutano (le coppe non esistono ancora in M1: restano attive). */
export function valutaPromesseScadute(
  giocatori: Giocatore[],
  partiteSquadra: Partita[],
  settimana: number,
): EsitoValutazionePromesse {
  const conseguenze = new Map<Id, { morale: number; fiducia: number }>();
  const aggiornati = giocatori.map((g) => {
    if (!g.promesse.some((p) => p.stato === 'attiva' && p.tipo !== 'coppa' && p.scadenza <= settimana)) {
      return g;
    }
    const promesse = g.promesse.map((p) => {
      if (p.stato !== 'attiva' || p.tipo === 'coppa' || p.scadenza > settimana) return p;
      const mantenuta = promessaMantenuta(p, g.id, partiteSquadra);
      const conseg = conseguenze.get(g.id) ?? { morale: 0, fiducia: 0 };
      if (mantenuta) {
        conseg.morale += PROMESSA_MANTENUTA_MORALE;
        conseg.fiducia += PROMESSA_MANTENUTA_FIDUCIA;
      } else {
        conseg.morale += PROMESSA_TRADITA_MORALE;
        conseg.fiducia += PROMESSA_TRADITA_FIDUCIA;
      }
      conseguenze.set(g.id, conseg);
      return { ...p, stato: mantenuta ? ('mantenuta' as const) : ('tradita' as const) };
    });
    return { ...g, promesse };
  });
  return { giocatori: aggiornati, conseguenze };
}

// ---------- Richieste promessa (engine sceglie il candidato) ----------

export interface PropostaRichiesta {
  giocatoreId: Id;
  tipo: TipoPromessa;
  soglia: number;
  durataTurni: number;
}

export interface InputCandidatoRichiesta {
  giocatori: Giocatore[];
  /** Settimana appena giocata */
  settimana: number;
  /** Partite giocate finora della TUA squadra (per l'attesa minuti) */
  partiteGiocateSquadra: number;
  /** Giocatori che hanno già chiesto nel cooldown (da db.eventi) */
  richiesteRecenti: Set<Id>;
  /** C'è già una richiesta non risolta in piedi: max 1 alla volta */
  pendingEsistente: boolean;
}

/**
 * Candidato deterministico alla richiesta promessa: overall alto, non infortunato,
 * minuti sotto l'attesa per il suo livello, morale in calo come spareggio.
 * Preset identici ai manuali (rules.ts): l'LLM in M3 scriverà solo il testo.
 */
export function candidatoRichiestaPromessa(input: InputCandidatoRichiesta): PropostaRichiesta | null {
  if (input.pendingEsistente || input.partiteGiocateSquadra === 0) return null;
  const attesaMinuti = input.partiteGiocateSquadra * MINUTI_PARTITA * MINUTI_ATTESI_FATTORE_RICHIESTA;
  const candidati = input.giocatori.filter(
    (g) =>
      g.overall >= OVERALL_MIN_RICHIESTA &&
      g.infortunioFinoA === undefined &&
      g.promesse.filter((p) => p.stato === 'attiva').length < PROMESSE_MAX_ATTIVE &&
      !input.richiesteRecenti.has(g.id) &&
      g.minutiStagione < attesaMinuti,
  );
  if (candidati.length === 0) return null;
  const scelto = [...candidati].sort((a, b) => b.overall - a.overall || a.morale - b.morale)[0];
  if (!scelto) return null;
  const tipo: TipoPromessa = scelto.overall >= OVERALL_TITOLARE_RICHIESTA ? 'titolare' : 'minuti';
  return {
    giocatoreId: scelto.id,
    tipo,
    soglia: tipo === 'titolare' ? PROMESSA_PRESET_TITOLARE_SOGLIA : PROMESSA_PRESET_MINUTI_SOGLIA,
    durataTurni: PROMESSA_DURATA_DEFAULT,
  };
}

/** Testo offline della richiesta (fallback PRD 4.6: l'LLM riscriverà in M3). */
export function testoRichiestaPromessa(nome: string, tipo: TipoPromessa): string {
  return tipo === 'titolare'
    ? `${nome} ti chiede un colloquio: «Mister, voglio la maglia da titolare. Mi prometta che giocherò: non la deluderò.»`
    : `${nome} ti chiede un colloquio: «Mister, voglio i miei minuti. Mi prometta di farmi giocare con continuità.»`;
}

/** Applica le conseguenze a un giocatore (mantenuta/tradita/rifiuto), clamp su 0-100. */
export function applicaConseguenze(
  g: Giocatore,
  conseg: { morale: number; fiducia: number },
): Giocatore {
  return {
    ...g,
    morale: clamp(g.morale + conseg.morale),
    fiducia: clamp(g.fiducia + conseg.fiducia),
  };
}
