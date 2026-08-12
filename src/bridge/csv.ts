// FLM — Ponte dati con PES Editor (PRD 7.4): CSV nel formato dell'editor.
// Vincoli dal PRD: UTF-8, separatore punto e virgola, header esatti dell'editor.
// ATTENZIONE (rischio formato CSV, PRD): gli header veri si catturano da un export
// reale di ejogc327 in M1 — fino ad allora questi sono segnaposto coerenti.

import type { Giocatore, SquadAssignment } from '../types/entities';

export const SEPARATORE_CSV = ';';

/** Header CSV attesi dall'editor. TODO M1: sostituire con gli header esatti di un export reale. */
export const HEADERS_EDITOR = {
  giocatori: ['ID_PES', 'Nome', 'Nazionalità', 'Età', 'Ruolo', 'Overall'],
  assegnazioni: ['ID_PES', 'ID_Squadra'],
} as const;

function escapeCsv(valore: string): string {
  return /[";\n\r]/.test(valore) ? `"${valore.replace(/"/g, '""')}"` : valore;
}

/**
 * CSV dei giocatori da creare/aggiornare nell'editor.
 * Il BOM iniziale (\uFEFF) aiuta Excel e gli editor a leggere gli accenti in UTF-8.
 */
export function giocatoriACsv(giocatori: Giocatore[]): string {
  const righe: string[] = [HEADERS_EDITOR.giocatori.join(SEPARATORE_CSV)];
  for (const g of giocatori) {
    righe.push(
      [g.pesId ?? '', g.nome, g.nazionalita, g.eta, g.ruolo, g.overall]
        .map(String)
        .map(escapeCsv)
        .join(SEPARATORE_CSV),
    );
  }
  return `\uFEFF${righe.join('\r\n')}`;
}

/**
 * CSV delle assegnazioni giocatore→squadra (l'editor lavora sugli ID PES:
 * i giocatori senza mapping escono marcati "da mappare").
 */
export function assegnazioniACsv(assegnazioni: SquadAssignment[], giocatori: Giocatore[]): string {
  const pesIdPerGiocatore = new Map(giocatori.map((g) => [g.id, g.pesId]));
  const righe: string[] = [HEADERS_EDITOR.assegnazioni.join(SEPARATORE_CSV)];
  for (const a of assegnazioni) {
    righe.push(
      [pesIdPerGiocatore.get(a.giocatoreId) ?? 'da mappare', a.squadraId]
        .map(String)
        .map(escapeCsv)
        .join(SEPARATORE_CSV),
    );
  }
  return `\uFEFF${righe.join('\r\n')}`;
}
