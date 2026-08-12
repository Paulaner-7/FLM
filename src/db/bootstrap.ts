// FLM — Bootstrap CSV da ejogc327.
// Parsing e persistenza restano in src/db; regole numeriche derivate vivono in src/engine.

import { profiloSquadraBootstrap, valoriGiocatoreBootstrap } from '../engine/bootstrap';
import { db } from './database';
import type { Giocatore, SquadAssignment, Squadra } from '../types/entities';

export const BOOTSTRAP_STAGIONE_DEFAULT = '2025/26';
export const CSV_SEPARATORE = ';';

export type BootstrapFileKind = 'giocatori' | 'squadre' | 'assegnazioni';

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
    return {
      id: stablePlayerId(pesId),
      pesId,
      nome: textValue(row, 'Name'),
      nazionalita: `PES-${textValue(row, 'Country')}`, 
      eta,
      ruolo: ruoloDaRiga(row),
      overall: numericValue(row, 'OverallStats'),
      ...valori,
      promesse: [],
      valoreMercato: Math.max(0, numericValue(row, 'MarketValue')),
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

  const giocatoriPerSquadra = new Map<number, Giocatore[]>();
  for (const assegnazione of assegnazioni) {
    const pesTeam = Number(assegnazione.squadraId.replace('pes-team-', ''));
    const giocatore = giocatori.find((item) => item.id === assegnazione.giocatoreId);
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
    // Colonna opzionale: se l'export contiene il campionato (es. "League"),
    // viene valorizzato qui; altrimenti il flusso "Nuova Carriera" usa il
    // dataset curato (src/data/leagues.ts) o il fallback per nazione.
    const league = textValue(row, 'League').trim();
    return {
      id: stableTeamId(pesId),
      pesId,
      nome: textValue(row, 'Name'),
      nazione: `PES-${textValue(row, 'Country')}`, 
      nazionale: booleanValue(textValue(row, 'National')),
      campionato: league || undefined,
      mediaOverall: mediaOverall ?? undefined,
      ...profilo,
      ombra: false,
    };
  });

  const senzaSquadra = giocatori.filter((giocatore) => !assegnato.has(giocatore.pesId ?? -1)).length;

  await db.transaction('rw', db.squadre, db.giocatori, db.squadAssignments, async () => {
    await db.squadAssignments.clear();
    await db.giocatori.clear();
    await db.squadre.clear();
    await db.squadre.bulkAdd(squadre);
    await db.giocatori.bulkAdd(giocatori);
    await db.squadAssignments.bulkAdd(assegnazioni);
  });

  return {
    squadre: squadre.length,
    giocatori: giocatori.length,
    assegnazioni: assegnazioni.length,
    senzaSquadra,
    issues,
  };
}
