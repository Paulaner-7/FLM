// FLM — Bootstrap CSV da ejogc327.
// Parsing e persistenza restano in src/db; regole numeriche derivate vivono in src/engine.

import { profiloSquadraBootstrap, valoriGiocatoreBootstrap } from '../engine/bootstrap';
import { ingaggioDaValore, nuovaScadenzaContratto } from '../engine/mercato';
import { nomeNazione } from '../data/countries';
import { legaCurataPerNome } from '../data/leagues';
import { HEADERS_PLAYERS } from '../bridge/csv';
import { db } from './database';
import type { AttributiPes, Giocatore, SquadAssignment, Squadra } from '../types/entities';

export const BOOTSTRAP_STAGIONE_DEFAULT = '2025/26';
export const CSV_SEPARATORE = ';';

export type BootstrapFileKind = 'giocatori' | 'squadre' | 'assegnazioni' | 'roster';

export interface CsvRow {
  rowNumber: number;
  values: Record<string, string>;
}

export interface BootstrapIssue {
  file: BootstrapFileKind;
  row: number;
  message: string;
}

export interface CsvParseResult {
  kind: BootstrapFileKind;
  fileName: string;
  headers: string[];
  rows: CsvRow[];
  headerErrors: string[];
  issues: BootstrapIssue[];
}

export interface BootstrapInput {
  giocatori: CsvParseResult;
  squadre: CsvParseResult;
  assegnazioni: CsvParseResult;
}

export interface BootstrapImportSummary {
  squadre: number;
  giocatori: number;
  assegnazioni: number;
  senzaSquadra: number;
  issues: BootstrapIssue[];
}

const REQUIRED_HEADERS: Record<BootstrapFileKind, readonly string[]> = {
  giocatori: ['Id', 'Name', 'Country', 'Age', 'POS', 'GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF', 'MarketValue', 'OverallStats'],
  squadre: ['Id', 'Name', 'Country', 'National'],
  assegnazioni: ['Id', 'Id Club'],
  roster: ['Id', 'Player1', 'TotalPlayers'],
};

interface RawCsvRecord {
  line: number;
  cells: string[];
}

function parseRawCsv(text: string): { records: RawCsvRecord[]; issues: Array<{ row: number; message: string }> } {
  const records: RawCsvRecord[] = [];
  const issues: Array<{ row: number; message: string }> = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const pushRecord = (): void => {
    if (cells.length > 0 || cell.trim() !== '') {
      records.push({ line: recordLine, cells: [...cells, cell] });
    }
    cells = [];
    cell = '';
    recordLine = line;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === undefined) continue;

    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === CSV_SEPARATORE && !inQuotes) {
      cells.push(cell);
      cell = '';
      continue;
    }

    if (character === '\n' && !inQuotes) {
      line += 1;
      pushRecord();
      continue;
    }

    if (character === '\r' && !inQuotes) {
      if (text[index + 1] === '\n') index += 1;
      line += 1;
      pushRecord();
      continue;
    }

    if (character === '\n' || character === '\r') line += 1;
    cell += character;
  }

  if (inQuotes) {
    issues.push({ row: recordLine, message: 'Virgolette non chiuse nel record CSV' });
  }
  if (cells.length > 0 || cell.trim() !== '') pushRecord();

  return { records, issues };
}

function requiredHeaders(kind: BootstrapFileKind): readonly string[] {
  return REQUIRED_HEADERS[kind];
}

function numberIsValid(value: string, integer = true): boolean {
  if (value.trim() === '') return false;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && (!integer || Number.isInteger(parsed));
}

function booleanIsValid(value: string): boolean {
  return ['true', 'false', '1', '0'].includes(value.trim().toLowerCase());
}

function validateRow(kind: BootstrapFileKind, row: CsvRow): string[] {
  const errors: string[] = [];
  const value = (header: string): string => row.values[header] ?? '';

  if (kind === 'giocatori') {
    if (!value('Name').trim()) errors.push('Nome giocatore vuoto');
    for (const header of ['Id', 'Age', 'POS', 'GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF', 'MarketValue', 'OverallStats']) {
      if (!numberIsValid(value(header))) errors.push(`Valore numerico non valido: ${header}`);
    }
  }

  if (kind === 'squadre') {
    if (!value('Name').trim()) errors.push('Nome squadra vuoto');
    for (const header of ['Id', 'Country']) {
      if (!numberIsValid(value(header))) errors.push(`Valore numerico non valido: ${header}`);
    }
    if (!booleanIsValid(value('National'))) errors.push('Valore booleano non valido: National');
  }

  if (kind === 'assegnazioni') {
    if (!numberIsValid(value('Id'))) errors.push('Valore numerico non valido: Id');
    const club = value('Id Club').trim();
    if (club !== '' && club !== '0' && club !== '-1' && !numberIsValid(club)) {
      errors.push('Valore numerico non valido: Id Club');
    }
  }

  if (kind === 'roster') {
    if (!numberIsValid(value('Id'))) errors.push('Valore numerico non valido: Id');
  }

  return errors;
}

/** Parser puro: ordine colonne libero, header con nomi editor, colonne extra tollerate. */
export function parseBootstrapCsv(
  text: string,
  kind: BootstrapFileKind,
  fileName = 'CSV',
): CsvParseResult {
  const raw = parseRawCsv(text);
  const first = raw.records[0];
  const headers = (first?.cells ?? []).map((header, index) => {
    const cleaned = header.trim();
    return index === 0 ? cleaned.replace(/^\uFEFF/, '') : cleaned;
  });
  const headerErrors: string[] = [];
  const seen = new Set<string>();

  for (const header of headers) {
    if (seen.has(header)) headerErrors.push(`Header duplicato: ${header}`);
    seen.add(header);
  }
  for (const expected of requiredHeaders(kind)) {
    if (!seen.has(expected)) headerErrors.push(`Header mancante: ${expected}`);
  }

  const issues: BootstrapIssue[] = raw.issues.map((issue) => ({ file: kind, row: issue.row, message: issue.message }));
  const rows: CsvRow[] = [];
  if (first && headerErrors.length === 0) {
    for (const record of raw.records.slice(1)) {
      if (record.cells.every((cellValue) => cellValue.trim() === '')) continue;
      if (record.cells.length !== headers.length) {
        issues.push({
          file: kind,
          row: record.line,
          message: `Numero colonne errato: attese ${headers.length}, trovate ${record.cells.length}`,
        });
        continue;
      }
      const values: Record<string, string> = {};
      headers.forEach((header, index) => {
        values[header] = record.cells[index]?.trim() ?? '';
      });
      const row: CsvRow = { rowNumber: record.line, values };
      const rowIssues = validateRow(kind, row);
      for (const message of rowIssues) {
        issues.push({ file: kind, row: record.line, message });
      }
      if (rowIssues.length === 0) rows.push(row);
    }
  }

  return { kind, fileName, headers, rows, headerErrors, issues };
}

export async function parseBootstrapFile(file: File, kind: BootstrapFileKind): Promise<CsvParseResult> {
  return parseBootstrapCsv(await file.text(), kind, file.name);
}

function textValue(row: CsvRow, header: string): string {
  return row.values[header] ?? '';
}

function numericValue(row: CsvRow, header: string): number {
  return Number(textValue(row, header));
}

function booleanValue(value: string): boolean {
  return ['true', '1'].includes(value.trim().toLowerCase());
}

function ruoloDaRiga(row: CsvRow): string {
  if (numericValue(row, 'GK') > 0) return 'portiere';
  const categorie: Array<{ nome: string; posizioni: string[] }> = [
    { nome: 'difensore', posizioni: ['CB', 'LB', 'RB'] },
    { nome: 'centrocampista', posizioni: ['DMF', 'CMF', 'LMF', 'RMF', 'AMF'] },
    { nome: 'attaccante', posizioni: ['LWF', 'RWF', 'SS', 'CF'] },
  ];
  let migliore = 'centrocampista';
  let punteggioMigliore = -1;
  for (const categoria of categorie) {
    const punteggio = Math.max(...categoria.posizioni.map((posizione) => numericValue(row, posizione)));
    if (punteggio > punteggioMigliore) {
      migliore = categoria.nome;
      punteggioMigliore = punteggio;
    }
  }
  return migliore;
}

/**
 * Attributi completi dal CSV reale (151 colonne, PRD 7.5): parsing tollerante,
 * le colonne mancanti cadono sui default (mai righe rotte). Booleani: True/1.
 */
export function attributiDaRiga(row: CsvRow, overall: number): AttributiPes {
  const num = (header: string, def: number): number => {
    const v = row.values[header];
    if (v === undefined || v.trim() === '') return def;
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : def;
  };
  const bool = (header: string, def = false): boolean => {
    const v = row.values[header];
    if (v === undefined || v.trim() === '') return def;
    return ['true', '1'].includes(v.trim().toLowerCase());
  };
  const str = (header: string, def = ''): string => row.values[header] ?? def;
  const skill = (header: string): number => {
    const v = num(header, 50);
    return Math.min(99, Math.max(40, v));
  };

  return {
    JapName: str('JapName'),
    Shirt: str('Shirt'),
    ShirtNational: str('ShirtNational'),
    Commentary: num('Commentary', 0),
    Country2: num('Country2', 0),
    Height: num('Height', 178),
    Weight: num('Weight', 74),
    Foot: bool('Foot'),
    PlayingStyle: num('PlayingStyle', 5),
    POS: num('POS', 5),
    GK: num('GK', 0), CB: num('CB', 0), LB: num('LB', 0), RB: num('RB', 0),
    DMF: num('DMF', 0), CMF: num('CMF', 0), LMF: num('LMF', 0), RMF: num('RMF', 0),
    AMF: num('AMF', 0), LWF: num('LWF', 0), RWF: num('RWF', 0), SS: num('SS', 0), CF: num('CF', 0),
    OffensiveAwareness: skill('OffensiveAwareness'),
    BallControl: skill('BallControl'),
    Dribbling: skill('Dribbling'),
    TightPossession: skill('TightPossession'),
    LowPass: skill('LowPass'),
    LoftedPass: skill('LoftedPass'),
    Finishing: skill('Finishing'),
    Heading: skill('Heading'),
    PlaceKicking: skill('PlaceKicking'),
    Curl: skill('Curl'),
    Speed: skill('Speed'),
    Acceleration: skill('Acceleration'),
    KickingPower: skill('KickingPower'),
    Jump: skill('Jump'),
    PhysicalContact: skill('PhysicalContact'),
    Balance: skill('Balance'),
    Stamina: skill('Stamina'),
    DefensiveAwareness: skill('DefensiveAwareness'),
    BallWinning: skill('BallWinning'),
    Aggression: skill('Aggression'),
    GKAwareness: skill('GKAwareness'),
    GKCatching: skill('GKCatching'),
    GKClearing: skill('GKClearing'),
    GKReflexes: skill('GKReflexes'),
    GKReach: skill('GKReach'),
    WeakFootUsage: num('WeakFootUsage', 2),
    WeakFootAcc: num('WeakFootAcc', 2),
    Form: num('Form', 4),
    InjuryResistance: num('InjuryResistance', 2),
    Reputation: num('Reputation', 2),
    PlayingAttitude: num('PlayingAttitude', 0),
    Trickster: bool('Trickster'), MazingRun: bool('MazingRun'),
    SpeedingBullet: bool('SpeedingBullet'), IncisiveRun: bool('IncisiveRun'),
    LongBallExpert: bool('LongBallExpert'), EarlyCross: bool('EarlyCross'),
    LongRanger: bool('LongRanger'), ScissorsFeint: bool('ScissorsFeint'),
    DoubleTouch: bool('DoubleTouch'), FlipFlap: bool('FlipFlap'),
    MarseilleTurn: bool('MarseilleTurn'), Sombrero: bool('Sombrero'),
    CrossOverTurn: bool('CrossOverTurn'), CutBehindAndTurn: bool('CutBehindAndTurn'),
    ScotchMove: bool('ScotchMove'), StepOnSkillcontrol: bool('StepOnSkillcontrol'),
    HeadingSpecial: bool('HeadingSpecial'), LongRangeDrive: bool('LongRangeDrive'),
    Chipshotcontrol: bool('Chipshotcontrol'), LongRangeShot: bool('LongRangeShot'),
    KnuckleShot: bool('KnuckleShot'), DippingShots: bool('DippingShots'),
    RisingShots: bool('RisingShots'), AcrobaticFinishing: bool('AcrobaticFinishing'),
    HeelTrick: bool('HeelTrick'), FirstTimeShot: bool('FirstTimeShot'),
    OneTouchPass: bool('OneTouchPass'), ThroughPassing: bool('ThroughPassing'),
    WeightedPass: bool('WeightedPass'), PinpointCrossing: bool('PinpointCrossing'),
    OutsideCurler: bool('OutsideCurler'), Rabona: bool('Rabona'),
    NoLookPass: bool('NoLookPass'), LowLoftedPass: bool('LowLoftedPass'),
    GKLowPunt: bool('GKLowPunt'), GKHighPunt: bool('GKHighPunt'),
    LongThrow: bool('LongThrow'), GKLongThrow: bool('GKLongThrow'),
    PenaltySpecialist: bool('PenaltySpecialist'), GKPenaltySaver: bool('GKPenaltySaver'),
    Gamesmanship: bool('Gamesmanship'), ManMarking: bool('ManMarking'),
    TrackBack: bool('TrackBack'), Interception: bool('Interception'),
    AcrobaticClear: bool('AcrobaticClear'), Captaincy: bool('Captaincy'),
    SuperSub: bool('SuperSub'), FightingSpirit: bool('FightingSpirit'),
    Celebration1: num('Celebration1', 1),
    Celebration2: num('Celebration2', 1),
    DribblingHunching: num('DribblingHunching', 2),
    DribblingArmMove: num('DribblingArmMove.', 2),
    RunningHunching: num('RunningHunching', 2),
    RunningArmMovement: num('RunningArmMovement', 2),
    CornerKicks: num('CornerKicks', 1),
    FreeKicks: num('FreeKicks', 1),
    PenaltyKick: num('PenaltyKick', 1),
    DribbleMotion: num('DribbleMotion', 0),
    YouthClub: num('YouthClub', 0),
    OwnerClub: num('OwnerClub', 0),
    ContractUntil: str('ContractUntil', '01/01/0001 00:00:00'),
    LoanUntil: str('LoanUntil', '01/01/0001 00:00:00'),
    MarketValue: num('MarketValue', 0),
    NationalCaps: num('NationalCaps', 0),
    Legend: bool('Legend'),
    Hand: num('Hand', 0),
    WinnerGoldenBall: bool('WinnerGoldenBall'),
    EditName: bool('EditName'), EditBasics: bool('EditBasics'),
    EditPosition: bool('EditPosition'), EditPositions: bool('EditPositions'),
    EditAbilities: bool('EditAbilities'), EditPlayerSkills: bool('EditPlayerSkills'),
    EditPlayingStyle: bool('EditPlayingStyle'), EditCOMPlayingStyles: bool('EditCOMPlayingStyles'),
    EditMovements: bool('EditMovements'),
    Edit1: bool('Edit1'), Edit2: bool('Edit2'), Edit3: bool('Edit3'), Edit4: bool('Edit4'),
    Edit5: bool('Edit5'), Edit6: bool('Edit6'), Edit7: bool('Edit7'),
    Value1: num('Value1', 0),
    Value2: num('Value2', 0),
    Value3: num('Value3', 0),
    Value2020_1: num('Value2020_1', 0),
    Value2020_2: num('Value2020_2', 0),
    Appearance: num('Appearance', 0),
    ListBoots: num('ListBoots', 0),
    ListGloves: num('ListGloves', 0),
    InEditFile: bool('InEditFile'),
    OverallStats: overall,
  };
}

/** Header attesi dal parsing attributi (per validazione, subset di HEADERS_PLAYERS). */
export const HEADERS_ATTRIBUTI = HEADERS_PLAYERS;

function pesPlayerId(row: CsvRow): number {
  return numericValue(row, 'Id');
}

function pesTeamId(row: CsvRow): number {
  return numericValue(row, 'Id');
}

function stablePlayerId(pesId: number): string {
  return `pes-player-${pesId}`;
}

function stableTeamId(pesId: number): string {
  return `pes-team-${pesId}`;
}

function stableAssignmentId(pesId: number): string {
  return `pes-assignment-${pesId}`;
}

/**
 * Colori sociali dalle colonne TeamColor1/2 R/G/B del CSV editor.
 * Scala PES 0-63 → hex. null se colonne assenti o colore nero (0,0,0):
 * inutilizzabile come accento su fondo scuro.
 */
export function coloreDaRiga(row: CsvRow, base: 'TeamColor1' | 'TeamColor2'): string | null {
  const grezzo = [numericValue(row, `${base}R`), numericValue(row, `${base}G`), numericValue(row, `${base}B`)];
  if (grezzo.some((v) => !Number.isFinite(v))) return null;
  if (grezzo.every((v) => v === 0)) return null;
  const canali = grezzo.map((v) => Math.round(Math.min(63, Math.max(0, v)) * (255 / 63)));
  return `#${canali.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Coppia primario/secondario; undefined se nemmeno il primario esiste. */
export function coloriDaRiga(row: CsvRow): { primario: string; secondario: string } | undefined {
  const primario = coloreDaRiga(row, 'TeamColor1');
  if (!primario) return undefined;
  return { primario, secondario: coloreDaRiga(row, 'TeamColor2') ?? primario };
}

function uniqueRows(
  rows: CsvRow[],
  kind: BootstrapFileKind,
  issues: BootstrapIssue[],
  idHeader: string,
): CsvRow[] {
  const seen = new Set<number>();
  const result: CsvRow[] = [];
  for (const row of rows) {
    const id = numericValue(row, idHeader);
    if (seen.has(id)) {
      issues.push({ file: kind, row: row.rowNumber, message: `ID PES duplicato: ${id}; riga ignorata` });
      continue;
    }
    seen.add(id);
    result.push(row);
  }
  return result;
}

/**
 * Importa fotografia autoritativa FL26.
 * Sostituisce squadre, giocatori e assegnazioni; lascia storico partite/eventi/mercato intatto.
 */
export async function importaBootstrap(
  input: BootstrapInput,
  stagione = BOOTSTRAP_STAGIONE_DEFAULT,
): Promise<BootstrapImportSummary> {
  const fileResults = [input.giocatori, input.squadre, input.assegnazioni];
  const headerErrors = fileResults.flatMap((result) => result.headerErrors);
  if (headerErrors.length > 0) throw new Error(headerErrors.join(' | '));

  const issues: BootstrapIssue[] = fileResults.flatMap((result) => result.issues);
  const playerRows = uniqueRows(input.giocatori.rows, 'giocatori', issues, 'Id');
  const teamRows = uniqueRows(input.squadre.rows, 'squadre', issues, 'Id');

  const giocatori: Giocatore[] = playerRows.map((row) => {
    const pesId = pesPlayerId(row);
    const eta = numericValue(row, 'Age');
    const valori = valoriGiocatoreBootstrap(eta);
    const overall = numericValue(row, 'OverallStats');
    return {
      id: stablePlayerId(pesId),
      pesId,
      nome: textValue(row, 'Name'),
      nazionalita: nomeNazione(numericValue(row, 'Country')),
      eta,
      ruolo: ruoloDaRiga(row),
      overall,
      ...valori,
      promesse: [],
      valoreMercato: Math.max(0, numericValue(row, 'MarketValue')),
      scadenzaContratto: nuovaScadenzaContratto(stagione, 2 + (eta % 3)),
      ingaggioAnnuo: ingaggioDaValore(Math.max(0, numericValue(row, 'MarketValue'))),
      // Attributi completi (PRD 7.5): parsing tollerante delle 151 colonne
      attributi: attributiDaRiga(row, overall),
    };
  });

  const giocatorePerPesId = new Map(giocatori.map((giocatore) => [giocatore.pesId, giocatore]));
  const assignmentRows = input.assegnazioni.rows;
  const squadraPerPesId = new Map<number, CsvRow>();
  for (const row of teamRows) squadraPerPesId.set(pesTeamId(row), row);

  const assegnazioni: SquadAssignment[] = [];
  const assegnato = new Set<number>();
  for (const row of assignmentRows) {
    const playerPesId = numericValue(row, 'Id');
    const clubText = textValue(row, 'Id Club').trim();
    if (clubText === '' || clubText === '0' || clubText === '-1') continue;
    const clubPesId = Number(clubText);
    const giocatore = giocatorePerPesId.get(playerPesId);
    if (!giocatore) {
      issues.push({ file: 'assegnazioni', row: row.rowNumber, message: `Giocatore PES ${playerPesId} non presente nel CSV giocatori` });
      continue;
    }
    if (!squadraPerPesId.has(clubPesId)) {
      issues.push({ file: 'assegnazioni', row: row.rowNumber, message: `Squadra PES ${clubPesId} non presente nel CSV squadre` });
      continue;
    }
    if (assegnato.has(playerPesId)) {
      issues.push({ file: 'assegnazioni', row: row.rowNumber, message: `Più club per giocatore PES ${playerPesId}; prima assegnazione mantenuta` });
      continue;
    }
    assegnato.add(playerPesId);
    assegnazioni.push({
      id: stableAssignmentId(playerPesId),
      giocatoreId: giocatore.id,
      squadraId: stableTeamId(clubPesId),
      tipo: 'proprieta',
      dal: stagione,
    });
  }

  const giocatorePerId = new Map(giocatori.map((giocatore) => [giocatore.id, giocatore]));
  const giocatoriPerSquadra = new Map<number, Giocatore[]>();
  for (const assegnazione of assegnazioni) {
    const pesTeam = Number(assegnazione.squadraId.replace('pes-team-', ''));
    const giocatore = giocatorePerId.get(assegnazione.giocatoreId);
    if (!giocatore) continue;
    const rosa = giocatoriPerSquadra.get(pesTeam) ?? [];
    rosa.push(giocatore);
    giocatoriPerSquadra.set(pesTeam, rosa);
  }

  const squadre: Squadra[] = teamRows.map((row) => {
    const pesId = pesTeamId(row);
    const rosa = giocatoriPerSquadra.get(pesId) ?? [];
    const mediaOverall = rosa.length === 0
      ? null
      : rosa.reduce((somma, giocatore) => somma + giocatore.overall, 0) / rosa.length;
    const profilo = profiloSquadraBootstrap(mediaOverall, booleanValue(textValue(row, 'National')));
    const nome = textValue(row, 'Name');
    // Colonna opzionale "League": se l'export la contiene viene valorizzata;
    // altrimenti match per nome sul dataset curato (src/data/leagues.ts).
    const league = textValue(row, 'League').trim();
    const campionato = league || legaCurataPerNome(nome);
    return {
      id: stableTeamId(pesId),
      pesId,
      nome,
      nazione: nomeNazione(numericValue(row, 'Country')),
      nazionale: booleanValue(textValue(row, 'National')),
      campionato: campionato || undefined,
      mediaOverall: mediaOverall ?? undefined,
      ...profilo,
      ratingInizioStagione: profilo.rating,
      colori: coloriDaRiga(row),
      ombra: false,
    };
  });

  const senzaSquadra = giocatori.filter((giocatore) => !assegnato.has(giocatore.pesId ?? -1)).length;

  // Chunk di 2.000 righe: a 27k+ giocatori un bulkAdd unico può far scattare
  // i limiti di durata transazione di IndexedDB (Safari/Firefox).
  const CHUNK = 2000;
  async function bulkAddAChunk<T>(tabella: { bulkAdd: (righe: T[]) => Promise<unknown> }, righe: T[]): Promise<void> {
    for (let inizio = 0; inizio < righe.length; inizio += CHUNK) {
      await tabella.bulkAdd(righe.slice(inizio, inizio + CHUNK));
    }
  }

  await db.transaction('rw', db.squadre, db.giocatori, db.squadAssignments, async () => {
    await db.squadAssignments.clear();
    await db.giocatori.clear();
    await db.squadre.clear();
    await bulkAddAChunk(db.squadre, squadre);
    await bulkAddAChunk(db.giocatori, giocatori);
    await bulkAddAChunk(db.squadAssignments, assegnazioni);
  });

  return {
    squadre: squadre.length,
    giocatori: giocatori.length,
    assegnazioni: assegnazioni.length,
    senzaSquadra,
    issues,
  };
}
