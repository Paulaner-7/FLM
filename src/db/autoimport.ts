// FLM — Bootstrap automatico dai CSV nella cartella docs/ (PRD 7.4, M1).
// Il bootstrap "non si fa a mano": i tre export dell'editor (Players, Teams,
// Teams-Players) sono serviti da Vite come asset statici (plugin in vite.config.ts,
// /docs/ in dev, dist/docs/ in build) e importati qui con lo stesso parser del wizard.
// La scrittura resta in src/db (regola 1 AGENTS.md): fetch e parsing sono lettura.

import {
  BOOTSTRAP_STAGIONE_DEFAULT,
  importaBootstrap,
  parseBootstrapCsv,
} from './bootstrap';
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
