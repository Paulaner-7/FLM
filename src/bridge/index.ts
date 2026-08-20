// FLM — Ponte dati con PES Editor: punto di ingresso unico (PRD 7.4/7.5).
// Legge da Dexie e produce file (CSV per l'editor, report leggibili per il fallback
// manuale). Non scrive mai nel database: la regola 1 AGENTS.md vale solo per la persistenza.

export {
  giocatoriACsv,
  assegnazioniACsv,
  rosterACsv,
  HEADERS_PLAYERS,
  HEADERS_TEAMS_PLAYERS,
  HEADERS_ROSTER,
  SEPARATORE_CSV,
  DATA_VUOTA_EDITOR,
  dataFineStagioneEditor,
} from './csv';
export { generaRiepilogoModifiche } from './report';
export type { ModificaGiocatore, TipoModifica } from './report';
export { esportaPacchettoEditor } from './pacchetto';
export type { PacchettoEditor } from './pacchetto';

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
