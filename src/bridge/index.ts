// FLM — Ponte dati con PES Editor: punto di ingresso unico (PRD 7.4).
// Legge da Dexie e produce file (CSV per l'editor, report leggibili per il fallback
// manuale). Non scrive mai nel database: la regola 1 AGENTS.md vale solo per la persistenza.

export { giocatoriACsv, assegnazioniACsv, HEADERS_EDITOR, SEPARATORE_CSV } from './csv';
export { generaRiepilogoModifiche } from './report';
export type { ModificaGiocatore, TipoModifica } from './report';

/** Scarica un file generato (solo browser) */
export function scaricaFile(nome: string, contenuto: string, tipoMime = 'text/plain'): void {
  const blob = new Blob([contenuto], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
