// FLM — Accesso al database: l'unico punto di ingresso per la persistenza
// (regola 1 AGENTS.md). Il resto dell'app importa da qui, mai da localStorage.

export { db, DB_NAME, STATO_CLUB_ID, newId } from './database';
export type { FlmDatabase } from './database';
export { eseguiTrasferimento, registraTrattativaSaltata } from './transfers';
export type { EsitoEsecuzione } from './transfers';
export { seedDemo, STAGIONE_DEMO } from './seed';
export type { EsitoSeed } from './seed';
