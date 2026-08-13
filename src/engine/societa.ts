// FLM — Motore società, obiettivi & fiducia (PRD 3.2, modulo "Società, obiettivi & fiducia").
// Regola 3 AGENTS.md: funzioni PURE e deterministiche, nessuna scrittura qui.
// La transazione che applica i Δ allo StatoClub vive in src/db/referti.ts.
// Costanti di bilanciamento in rules.ts. L'LLM produce solo comunicati e toni (M3):
// i numeri della fiducia si muovono SOLO dai referti e dagli eventi validati.

import type { Id, ObiettivoStagionale, Partita } from '../types/entities';
import type { RigaClassifica } from './classifica';
import {
  FIDUCIA_SOCIETA_PAREGGIO,
  FIDUCIA_SOCIETA_SCONFITTA,
  FIDUCIA_SOCIETA_VITTORIA,
  FIDUCIA_TIFOSI_PAREGGIO,
  FIDUCIA_TIFOSI_SCONFITTA,
  FIDUCIA_TIFOSI_SCONFITTA_CASA,
  FIDUCIA_TIFOSI_STRISCIA_SCONFITTE,
  FIDUCIA_TIFOSI_STRISCIA_SCONFITTE_CAP,
  FIDUCIA_TIFOSI_STRISCIA_VITTORIE,
  FIDUCIA_TIFOSI_STRISCIA_VITTORIE_CAP,
  FIDUCIA_TIFOSI_VITTORIA,
  OBIETTIVO_COPPE_LEGA_GRANDE,
  OBIETTIVO_COPPE_LEGA_PICCOLA,
  OBIETTIVO_SALVEZZA_RETROCESSI,
  OBIETTIVO_TITOLO,
  SCARTO_ATTESA_ELO,
  clamp,
} from './rules';

/** Banda di attesa di una partita: cosa si aspetta il club dal risultato. */
export type BandaAttesa = 'sfavorito' | 'equilibrio' | 'favorito';

/**
 * Banda di attesa dallo scarto di rating Elo (mio − avversario). Il PRD 3.4
 * parlava di forza 1-5; il motore è migrato al rating Elo continuo (base 1500,
 * vedi entities.ts): l'attesa "squadra più forte = più fiducia" resta identica,
 * con granularità maggiore.
 */
export function bandaAttesa(ratingMio: number, ratingAvversario: number): BandaAttesa {
  const scarto = ratingMio - ratingAvversario;
  if (scarto > SCARTO_ATTESA_ELO) return 'favorito';
  if (scarto < -SCARTO_ATTESA_ELO) return 'sfavorito';
  return 'equilibrio';
}

/**
 * Striscia consecutiva di risultati della squadra fino alla partita più recente:
 * segno × lunghezza (3 = tre vittorie di fila, −2 = due sconfitte, 0 = pareggio
 * o nessuna partita). Stessa logica del bonus forma CPU (referto.ts), calcolata
 * sulle partite della TUA squadra inclusa quella appena giocata.
 */
export function strisciaCorrente(partite: Partita[], squadraId: Id): number {
  const segno = (p: Partita): number => {
    const golSquadra = p.casa === squadraId ? p.golCasa : p.golTrasferta;
    const golAvversario = p.casa === squadraId ? p.golTrasferta : p.golCasa;
    if (golSquadra > golAvversario) return 1;
    if (golSquadra === golAvversario) return 0;
    return -1;
  };
  const ordinate = partite
    .filter((p) => p.giocata && (p.casa === squadraId || p.trasferta === squadraId))
    .sort((a, b) => a.giornata - b.giornata);
  if (ordinate.length === 0) return 0;
  const ultimo = segno(ordinate[ordinate.length - 1] as Partita);
  if (ultimo === 0) return 0;
  let n = 1;
  for (let i = ordinate.length - 2; i >= 0; i--) {
    const p = ordinate[i];
    if (p && segno(p) === ultimo) n++;
    else break;
  }
  return ultimo * n;
}

export interface InputEffettiFiduciaReferto {
  vittoria: boolean;
  pareggio: boolean;
  inCasa: boolean;
  /** Rating Elo della tua squadra PRIMA della partita */
  ratingMio: number;
  /** Rating Elo dell'avversario PRIMA della partita */
  ratingAvversario: number;
  /** Partite della tua squadra già giocate + la partita appena giocata (striscia) */
  partiteSquadra: Partita[];
  squadraId: Id;
}

export interface EffettiFiducia {
  fiduciaSocieta: number;
  fiduciaTifosi: number;
}

/**
 * Δ fiducia dal referto (PRD 3.2):
 * - società: risultato × attesa (banda Elo). Vincere da sfavorito vale +6,
 *   vincere da favorito solo +2; perdere da favorito costa −8.
 * - tifosi: stessa base più sensibile + sconfitta in casa (−3) + strisce
 *   (sconfitte −2×(n−1) cap −6, vittorie +1×(n−2) cap +3).
 * I Δ sono CLAMPATI dall'applicazione (rules.clamp), qui si restituisce il delta.
 */
export function effettiFiduciaReferto(input: InputEffettiFiduciaReferto): EffettiFiducia {
  const banda = bandaAttesa(input.ratingMio, input.ratingAvversario);
  const fiduciaSocieta = input.vittoria
    ? FIDUCIA_SOCIETA_VITTORIA[banda]
    : input.pareggio
      ? FIDUCIA_SOCIETA_PAREGGIO[banda]
      : FIDUCIA_SOCIETA_SCONFITTA[banda];

  let fiduciaTifosi = input.vittoria
    ? FIDUCIA_TIFOSI_VITTORIA[banda]
    : input.pareggio
      ? FIDUCIA_TIFOSI_PAREGGIO[banda]
      : FIDUCIA_TIFOSI_SCONFITTA[banda];
  if (!input.vittoria && !input.pareggio && input.inCasa) {
    fiduciaTifosi += FIDUCIA_TIFOSI_SCONFITTA_CASA;
  }
  const striscia = strisciaCorrente(input.partiteSquadra, input.squadraId);
  if (striscia < 0) {
    const n = -striscia;
    fiduciaTifosi += Math.max(
      FIDUCIA_TIFOSI_STRISCIA_SCONFITTE_CAP,
      FIDUCIA_TIFOSI_STRISCIA_SCONFITTE * (n - 1),
    );
  } else if (striscia >= 3) {
    fiduciaTifosi += Math.min(
      FIDUCIA_TIFOSI_STRISCIA_VITTORIE_CAP,
      FIDUCIA_TIFOSI_STRISCIA_VITTORIE * (striscia - 2),
    );
  }

  return { fiduciaSocieta, fiduciaTifosi };
}

// ---------- Obiettivo stagionale: target, barra avanzamento, stima fine stagione ----------

/**
 * Posizione target dell'obiettivo per una lega di N squadre (PRD 3.2:
 * "obiettivo stagionale (scelto a inizio)"). Verificato sul calcio reale:
 * titolo 1°, coppe 4/6 (dimensione lega), metà N/2, salvezza N−3.
 */
export function posizioneTarget(obiettivo: ObiettivoStagionale, nSquadre: number): number {
  switch (obiettivo) {
    case 'titolo':
      return OBIETTIVO_TITOLO;
    case 'coppe':
      return nSquadre >= 20 ? OBIETTIVO_COPPE_LEGA_GRANDE : OBIETTIVO_COPPE_LEGA_PICCOLA;
    case 'meta_classifica':
      return Math.max(1, Math.round(nSquadre / 2));
    case 'salvezza':
      return Math.max(1, nSquadre - OBIETTIVO_SALVEZZA_RETROCESSI);
  }
}

export interface InputProgressoObiettivo {
  /** Posizione attuale in classifica (1 = prima) */
  posizione: number;
  /** Partite giocate dalla tua squadra: 0 = nessuna stima, barra a 0 */
  giocate: number;
  obiettivo: ObiettivoStagionale;
  nSquadre: number;
}

/**
 * Barra di avanzamento stimata verso l'obiettivo (0-100):
 * - nessuna partita giocata → 0 (la posizione iniziale è alfabetica, senza senso)
 * - posizione ≤ target → 100 (obiettivo raggiunto)
 * - altrimenti: strada percorsa dall'ultimo posto verso il target, (N−P)/(N−T).
 */
export function progressoObiettivo(input: InputProgressoObiettivo): number {
  if (input.giocate === 0) return 0;
  const target = posizioneTarget(input.obiettivo, input.nSquadre);
  if (input.posizione <= target) return 100;
  if (input.nSquadre <= target) return 100;
  return Math.round(clamp(((input.nSquadre - input.posizione) / (input.nSquadre - target)) * 100));
}

export interface StimaFineStagione {
  /** Punti proiettati a fine stagione (ritmo attuale) */
  puntiProiettati: number;
  /** Posizione stimata a fine stagione (classifica per punti proiettati) */
  posizioneStimata: number;
  /** true se la posizione stimata soddisfa l'obiettivo */
  inTraiettoria: boolean;
}

export interface InputStimaFineStagione {
  squadraId: Id;
  /** Classifica attuale completa (RigaClassifica[]) */
  classifica: RigaClassifica[];
  /** Partite totali della tua squadra nella competizione (andata+ritorno, bye incluso) */
  giornateTotali: number;
  obiettivo: ObiettivoStagionale;
  nSquadre: number;
}

/**
 * Stima di fine stagione dal ritmo punti: (punti / giocate) × giornateTotali per
 * ogni squadra, posizione per punti proiettati (spareggio: posizione attuale).
 * Tutte le squadre hanno giocato lo stesso turno → confronto onesto.
 * Ritorna null senza partite giocate (niente stime false).
 */
export function stimaFineStagione(input: InputStimaFineStagione): StimaFineStagione | null {
  if (input.classifica.length === 0 || input.giornateTotali <= 0) return null;
  const rigaMia = input.classifica.find((r) => r.squadraId === input.squadraId);
  if (!rigaMia || rigaMia.giocate === 0) return null;
  const proiezione = (punti: number, giocate: number): number =>
    Math.round((punti / giocate) * input.giornateTotali);
  const stimate = input.classifica
    .map((r) => ({ riga: r, proiettati: proiezione(r.punti, r.giocate) }))
    .sort((a, b) => b.proiettati - a.proiettati || a.riga.posizione - b.riga.posizione);
  const indice = stimate.findIndex((s) => s.riga.squadraId === input.squadraId);
  if (indice < 0) return null;
  const posizioneStimata = indice + 1;
  const puntiProiettati = (stimate[indice] as { proiettati: number }).proiettati;
  return {
    puntiProiettati,
    posizioneStimata,
    inTraiettoria: posizioneStimata <= posizioneTarget(input.obiettivo, input.nSquadre),
  };
}
