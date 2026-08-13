// FLM — Accesso al database: l'unico punto di ingresso per la persistenza
// (regola 1 AGENTS.md). Il resto dell'app importa da qui, mai da localStorage.

export { db, DB_NAME, newId } from './database';
export { creaCarriera, eliminaCarriera, listaCarriere, squadreTemplate, type EsitoCreazioneCarriera, type CarrieraConDettagli } from './carriere';
export type { FlmDatabase } from './database';
export { eseguiTrasferimento, registraTrattativaSaltata } from './transfers';
export type { EsitoEsecuzione } from './transfers';
export { confermaReferto, annullaReferto, prossimaPartita, rosaDellaCarriera } from './referti';
export type { EsitoConfermaReferto, InputConfermaReferto } from './referti';
export { generaContenutiTurno, decidiEvento } from './eventi';
export type { EsitoGenerazioneContenuti } from './eventi';
export { setLeader, creaPromessa, decidiRichiestaPromessa, PRESET_PROMESSE, promesseAttive } from './morale';
export type { PresetPromessa } from './morale';
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
export { importaBootstrapDaDocs, DOCS_CSV, descrizioneProgresso } from './autoimport';
export type { AutoImportFase, AutoImportProgress } from './autoimport';
export { migraNazioniPes } from './nazioni';
export type { EsitoMigrazioneNazioni } from './nazioni';
export { IMPOSTAZIONI_LLM_DEFAULT, IMPOSTAZIONI_LLM_ID, impostazioniLlm, llmConfigurato, salvaImpostazioniLlm } from './impostazioni';
