// FLM — Accesso al database: l'unico punto di ingresso per la persistenza
// (regola 1 AGENTS.md). Il resto dell'app importa da qui, mai da localStorage.

export { db, DB_NAME, newId } from './database';
export { creaCarriera, eliminaCarriera, listaCarriere, squadreTemplate, type EsitoCreazioneCarriera, type CarrieraConDettagli } from './carriere';
export type { FlmDatabase } from './database';
export { eseguiTrasferimento, registraTrattativaSaltata } from './transfers';
export type { EsitoEsecuzione } from './transfers';
export { confermaReferto, annullaReferto, prossimaPartita, rosaDellaCarriera } from './referti';
export type { EsitoConfermaReferto, InputConfermaReferto } from './referti';
export {
  BOOTSTRAP_STAGIONE_DEFAULT,
  CSV_SEPARATORE,
  importaBootstrap,
  parseBootstrapCsv,
  parseBootstrapFile,
} from './bootstrap';
export type {
  BootstrapFileKind,
  BootstrapImportSummary,
  BootstrapInput,
  BootstrapIssue,
  CsvParseResult,
  CsvRow,
} from './bootstrap';
export { seedDemo, STAGIONE_DEMO } from './seed';
export type { EsitoSeed } from './seed';
