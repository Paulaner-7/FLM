// FLM — Accesso al database: l'unico punto di ingresso per la persistenza
// (regola 1 AGENTS.md). Il resto dell'app importa da qui, mai da localStorage.

export { db, DB_NAME, newId } from './database';
export { creaCarriera, eliminaCarriera, listaCarriere, squadreTemplate, type EsitoCreazioneCarriera, type CarrieraConDettagli } from './carriere';
export type { FlmDatabase } from './database';
export { eseguiTrasferimento, registraTrattativaSaltata } from './transfers';
export type { EsitoEsecuzione } from './transfers';
export {
  statoMercato,
  creaOffertaAcquisto,
  firmaSvincolato,
  rispondiTrattativa,
  avanzaGiornoMercato,
  SQUADRA_SVINCOLATI,
} from './mercato';
export type { EsitoGiornoMercato, EsitoOffertaAcquisto, EsitoRisposta, AzioneTrattativa, StatoMercato } from './mercato';
export { confermaReferto, rosaDellaCarriera } from './referti';
export type { EsitoConfermaReferto, InputConfermaReferto } from './referti';
export { prossimaPartita, avanzaSettimana, creaStagioneCompleta, concludiStagione, iniziaStagioneSuccessiva } from './competizioni';
export type { RiepilogoStagione } from './competizioni';
export {
  eseguiRitiri,
  generaIntake,
  applicaCrescitaStagionale,
  eseguiPrestitoUtente,
  applicaPrestitoNelContesto,
  registraVotoFinestra,
  backfillAttributiENumeri,
} from './vivaio';
export type { EsitoIntake, EsitoPrestito, EsitoRitiri } from './vivaio';
export { esportaPacchettoEditor, scaricaFile } from '../bridge';
export type { PacchettoEditor } from '../bridge';
export { risolviFineStagione, accettaOfferta, rifiutaOfferta, confermaFineStagione, rosaNazionaleSnapshot } from './panchine';
export type { EsitoRisoluzione } from './panchine';
export { generaTorneoEstivo, convocatiDellaRosa, applicaEffettiRitorno } from './nt';
export type { StatoTorneo } from './nt';
export { esportaSalvataggio, importaSalvataggio } from './salvataggio';
export type { SalvataggioJSON } from './salvataggio';
export { generaContenutiTurno, decidiEvento } from './eventi';
export type { EsitoGenerazioneContenuti } from './eventi';
export { generaMondoContenutiTurno, caricaMondoNotizie, assicuratiMondoNotizie } from './mondo';
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
export { importaBootstrapDaDocs, DOCS_CSV, descrizioneProgresso, backfillColoriSquadre } from './autoimport';
export type { AutoImportFase, AutoImportProgress } from './autoimport';
export { migraNazioniPes } from './nazioni';
export type { EsitoMigrazioneNazioni } from './nazioni';
export { IMPOSTAZIONI_LLM_DEFAULT, IMPOSTAZIONI_LLM_ID, impostazioniLlm, llmConfigurato, salvaImpostazioniLlm } from './impostazioni';
