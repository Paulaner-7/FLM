// FLM — Motore calendario stagionale: settimane, slot, date reali (PRD 7.1).
//
// La stagione è una sequenza di settimane (unità atomica del tempo, decisione
// utente). Ogni settimana ha slot weekend e infrasettimanale. Le ancore date
// arrivano da src/data/calendarioStagioni.ts (date reali verificate).
// Funzioni PURE: nessuna scrittura.

import type { Id } from '../../types/entities';
import type { AncoraStagione } from '../../data/calendarioStagioni';
import type { NomeFase } from './config';

export type Slot = 'weekend' | 'infrasettimanale';

export interface Impegno {
  casa: Id;
  trasferta: Id;
  competizioneId: Id;
  competizioneNome: string;
  fase: NomeFase;
  /** Data ISO della partita */
  data: string;
  slot: Slot;
  /** Gamba 1 o 2 per andata/ritorno (opzionale: secca) */
  gamba?: 1 | 2;
  neutra: boolean;
}

export interface PianoSettimana {
  settimana: number;
  dataInizio: string;
  weekend: Impegno[];
  infrasettimanale: Impegno[];
}

/** Settimana di stagione (1-based) per una data ISO. */
export function settimanaDiData(data: string, inizioStagione: string): number {
  const d = new Date(`${data}T12:00:00Z`);
  const i = new Date(`${inizioStagione}T12:00:00Z`);
  return Math.floor((d.getTime() - i.getTime()) / (7 * 24 * 3600 * 1000)) + 1;
}

/** Data (ISO) della settimana n. */
export function dataDiSettimana(settimana: number, inizioStagione: string): string {
  const i = new Date(`${inizioStagione}T12:00:00Z`);
  i.setUTCDate(i.getUTCDate() + (settimana - 1) * 7);
  return i.toISOString().slice(0, 10);
}

/** I sabati liberi (niente pausa FIFA) dentro la finestra del campionato.
 * Le pause sono finestre di 7 giorni (inizio lunedì, es. 31 ago → si salta
 * sab 5 set): viene escluso il sabato interno a ciascuna finestra. */
export function fineSettimanaLiberi(
  inizio: string,
  fine: string,
  pause: string[],
): string[] {
  const out: string[] = [];
  // Finestre pausa: [inizio, inizio+6] — il sabato interno cade sempre qui.
  const finestre = pause.map((p) => {
    const d = new Date(`${p}T12:00:00Z`);
    return { da: d.getTime(), a: d.getTime() + 6 * 24 * 3600 * 1000 };
  });
  const d = new Date(`${inizio}T12:00:00Z`);
  // Porta alla domenica successiva alla data di inizio (le giornate stanno nel weekend)
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1); // sabato
  const fineD = new Date(`${fine}T12:00:00Z`);
  while (d.getTime() <= fineD.getTime()) {
    const t = d.getTime();
    if (!finestre.some((f) => t >= f.da && t <= f.a)) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

/**
 * Costruisce il piano settimanale: raggruppa gli impegni in settimane e slot.
 * Controlla l'invariante: nessuna squadra gioca due volte nella stessa data
 * (getta se violata: le ancore dati sono curate a mano).
 */
export function pianoSettimanale(impegni: Impegno[], inizioStagione: string): PianoSettimana[] {
  // Invariante: una squadra non può avere due impegni nella stessa data
  const perData = new Map<string, Set<Id>>();
  for (const imp of impegni) {
    const squadre = perData.get(imp.data) ?? new Set();
    if (squadre.has(imp.casa) || squadre.has(imp.trasferta)) {
      throw new Error(
        `Conflitto calendario: ${imp.competizioneNome} ${imp.fase} il ${imp.data} — squadra già impegnata`,
      );
    }
    squadre.add(imp.casa);
    squadre.add(imp.trasferta);
    perData.set(imp.data, squadre);
  }

  const perSettimana = new Map<number, PianoSettimana>();
  for (const imp of [...impegni].sort((a, b) => a.data.localeCompare(b.data))) {
    const settimana = settimanaDiData(imp.data, inizioStagione);
    let piano = perSettimana.get(settimana);
    if (!piano) {
      piano = {
        settimana,
        dataInizio: dataDiSettimana(settimana, inizioStagione),
        weekend: [],
        infrasettimanale: [],
      };
      perSettimana.set(settimana, piano);
    }
    (imp.slot === 'weekend' ? piano.weekend : piano.infrasettimanale).push(imp);
  }
  return [...perSettimana.values()].sort((a, b) => a.settimana - b.settimana);
}

/**
 * Slot di una data: weekend = sabato/domenica, altrimenti infrasettimanale.
 */
export function slotDiData(data: string): Slot {
  const d = new Date(`${data}T12:00:00Z`);
  const giorno = d.getUTCDay();
  return giorno === 0 || giorno === 6 ? 'weekend' : 'infrasettimanale';
}

/** Etichetta leggibile di una data (es. "sab 15 ago 2026"). */
export function dataLeggibile(data: string): string {
  return new Date(`${data}T12:00:00Z`).toLocaleDateString('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Nome del mese approssimato per la UI (sapore stagionale). */
export function meseDiData(data: string): string {
  return new Date(`${data}T12:00:00Z`).toLocaleDateString('it-IT', { month: 'long' });
}

export type { AncoraStagione };
