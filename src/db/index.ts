// FLM — Accesso al database: l'unico punto di ingresso per la persistenza
// (regola 1 AGENTS.md). Il resto dell'app importa da qui, mai da localStorage.

export { db, DB_NAME, STATO_CLUB_ID } from './database';
export type { FlmDatabase } from './database';

/** Genera un ID univoco per le chiavi primarie delle entità */
export function newId(): string {
  return crypto.randomUUID();
}
