// FLM — Bootstrap automatico dai CSV nella cartella docs/ (PRD 7.4, M1).
// Il bootstrap "non si fa a mano": i tre export dell'editor (Players, Teams,
// Teams-Players) sono serviti da Vite come asset statici (plugin in vite.config.ts,
// /docs/ in dev, dist/docs/ in build) e importati qui con lo stesso parser del wizard.
// La scrittura resta in src/db (regola 1 AGENTS.md): fetch e parsing sono lettura.

import {
  BOOTSTRAP_STAGIONE_DEFAULT,
  coloriDaRiga,
  importaBootstrap,
  parseBootstrapCsv,
} from './bootstrap';
import { db } from './database';
import type {
  BootstrapFileKind,
  BootstrapImportSummary,
  CsvParseResult,
} from './bootstrap';

/** Nomi file nella cartella docs/ — devono combaciare con il plugin Vite. */
export const DOCS_CSV: Record<BootstrapFileKind, string> = {
  giocatori: 'Players - PES 2021 - Edit.csv',
  squadre: 'Teams - PES 2021 - Edit.csv',
  assegnazioni: 'Teams-Players - PES 2021 - Edit.csv',
  roster: 'Roster - PES 2021 - Edit.csv',
} as const;

export type AutoImportFase = 'fetch' | 'parse' | 'import';

export interface AutoImportProgress {
  fase: AutoImportFase;
  kind: BootstrapFileKind | null;
  /** 0-100, approssimativo (utile per la UI, non per la logica) */
  percentuale: number;
}

const KINDS: BootstrapFileKind[] = ['giocatori', 'squadre', 'assegnazioni'];

const ETICHETTA: Record<BootstrapFileKind, string> = {
  giocatori: 'Giocatori',
  squadre: 'Squadre',
  assegnazioni: 'Rose',
  roster: 'Rose',
};

function urlDoc(kind: BootstrapFileKind): string {
  const base = import.meta.env.BASE_URL;
  const radice = base.endsWith('/') ? base : `${base}/`;
  return `${radice}docs/${encodeURIComponent(DOCS_CSV[kind])}`;
}

/**
 * Scarica, valida e importa la fotografia FL26 dai CSV in docs/.
 * Stesso percorso del wizard manuale: parseBootstrapCsv → importaBootstrap.
 */
export async function importaBootstrapDaDocs(
  opzioni: { stagione?: string; onProgress?: (progresso: AutoImportProgress) => void } = {},
): Promise<BootstrapImportSummary> {
  const { stagione = BOOTSTRAP_STAGIONE_DEFAULT, onProgress } = opzioni;

  const results: Partial<Record<BootstrapFileKind, CsvParseResult>> = {};
  for (let index = 0; index < KINDS.length; index += 1) {
    const kind = KINDS[index]!;
    const base = Math.round((index / KINDS.length) * 100);

    onProgress?.({ fase: 'fetch', kind, percentuale: base });
    const response = await fetch(urlDoc(kind));
    if (!response.ok) {
      throw new Error(`CSV non raggiungibile (${DOCS_CSV[kind]}, HTTP ${response.status}). Verifica che docs/ sia servito da Vite.`);
    }
    const text = await response.text();

    onProgress?.({ fase: 'parse', kind, percentuale: base + Math.round(50 / KINDS.length) });
    results[kind] = parseBootstrapCsv(text, kind, DOCS_CSV[kind]);
  }

  const headerErrors = KINDS.flatMap((kind) => results[kind]!.headerErrors);
  if (headerErrors.length > 0) {
    throw new Error(`Header CSV in docs/ non riconosciuti: ${headerErrors.join(' | ')}`);
  }

  onProgress?.({ fase: 'import', kind: null, percentuale: 90 });
  const summary = await importaBootstrap(
    { giocatori: results.giocatori!, squadre: results.squadre!, assegnazioni: results.assegnazioni! },
    stagione,
  );
  onProgress?.({ fase: 'import', kind: null, percentuale: 100 });
  return summary;
}

/** Descrizione progresso per la UI (es. "Parsing Giocatori…"). */
export function descrizioneProgresso(progresso: AutoImportProgress): string {
  const nome = progresso.kind ? ETICHETTA[progresso.kind] : '';
  if (progresso.fase === 'fetch') return `Scaricamento ${nome} da docs/…`;
  if (progresso.fase === 'parse') return `Lettura e validazione ${nome}…`;
  return 'Scrittura nel database…';
}

/**
 * Backfill colori sociali (TeamColor1/2 → hex) per database importati prima
 * dell'introduzione di Squadra.colori. Idempotente, mai bloccante: aggiorna
 * solo i record senza colori, matchando per pesId (template e copie carriera).
 */
export async function backfillColoriSquadre(): Promise<void> {
  try {
    const response = await fetch(urlDoc('squadre'));
    if (!response.ok) return;
    const parsed = parseBootstrapCsv(await response.text(), 'squadre', DOCS_CSV.squadre);
    if (parsed.headerErrors.length > 0) return;

    const coloriPerPesId = new Map<number, { primario: string; secondario: string }>();
    for (const row of parsed.rows) {
      const pesId = Number(row.values['Id'] ?? '');
      const colori = coloriDaRiga(row);
      if (Number.isInteger(pesId) && colori) coloriPerPesId.set(pesId, colori);
    }
    if (coloriPerPesId.size === 0) return;

    const senzaColori = await db.squadre.filter((s) => s.colori === undefined && s.pesId !== null).toArray();
    if (senzaColori.length === 0) return;
    const aggiornate = senzaColori.flatMap((s) => {
      const colori = coloriPerPesId.get(s.pesId as number);
      return colori ? [{ ...s, colori }] : [];
    });
    if (aggiornate.length > 0) await db.squadre.bulkPut(aggiornate);
  } catch {
    // Mai bloccante: senza colori l'UI usa l'accento di default.
  }
}
