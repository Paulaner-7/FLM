// FLM — Verifica campionati giocabili contro il CSV FL26 reale (docs/Teams).
// REGOLA: giocabili solo i campionati europei con roster completo in FL26
// + Brasileirão, Liga Profesional, J1 League e Saudi Pro League.
// Avvio: npm run verify:leagues
//
// Legge il Teams export dell'editor (fonte di verità), costruisce il template
// come farebbe il bootstrap, e controlla che campionatiDisponibili produca
// esattamente i conteggi attesi — nessuna lega fantasma, nessun falso positivo.

import { readFileSync } from 'node:fs';
import { campionatiDisponibili } from '../src/engine/carriera';
import { ALIASI, LEGHE_CURATE, normalizzaNome } from '../src/data/leagues';
import type { Squadra } from '../src/types/entities';

const TEAMS_CSV = 'docs/Teams - PES 2021 - Edit.csv';

let falliti = 0;

function check(nome: string, ok: boolean, dettaglio = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${nome}${dettaglio ? ` — ${dettaglio}` : ''}`);
  if (!ok) falliti++;
}

function parseTeamsCsv(path: string): Squadra[] {
  const text = readFileSync(path, 'utf-8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0]!.split(';').map((h) => h.trim().replace(/^\uFEFF/, ''));
  const rows = lines.slice(1).map((l) => {
    const cells = l.split(';');
    const values: Record<string, string> = {};
    header.forEach((h, i) => { values[h] = cells[i]?.trim() ?? ''; });
    return values;
  });
  const squadre: Squadra[] = [];
  for (const row of rows) {
    const nazionale = ['true', '1'].includes(row['National']?.toLowerCase() ?? '');
    const nome = row['Name'];
    if (!nome || nome === '-') continue;
    squadre.push({
      id: `pes-team-${row['Id']}`,
      pesId: Number(row['Id']),
      nome,
      nazione: `PES-${row['Country']}`,
      nazionale,
      forza: 3,
      coefficiente: 50,
      budget: 10_000_000,
      reputazione: 55,
      ombra: false,
    });
  }
  return squadre;
}

/** Conteggi attesi: roster curato di ogni lega = squadre che devono matchare nel CSV. */
const ATTESE: Record<string, number> = Object.fromEntries(LEGHE_CURATE.map((l) => [l.nome, l.squadre.length]));

function main(): void {
  const template = parseTeamsCsv(TEAMS_CSV);
  const { campionati, nazionali } = campionatiDisponibili(template);

  console.log(`Template: ${template.length} squadre (di cui ${nazionali.length} nazionali)`);
  console.log(`Leghe risultanti: ${campionati.length}`);
  for (const c of campionati) {
    const attesa = ATTESE[c.nome];
    const ok = attesa !== undefined && c.squadre.length === attesa;
    check(`${c.nome}: ${c.squadre.length}/${attesa ?? '?'} squadre`, ok, c.squadre.map((s) => s.nome).join(', '));
  }

  // 1. Nessuna lega fantasma: ogni lega risultante deve essere curata (o demo).
  const nomiCurati = new Set(LEGHE_CURATE.map((l) => l.nome));
  check(
    'nessuna lega fuori dal dataset curato',
    campionati.every((c) => nomiCurati.has(c.nome) || c.demo),
    campionati.filter((c) => !nomiCurati.has(c.nome) && !c.demo).map((c) => c.nome).join(', ') || 'ok',
  );
  check(
    'nessun gruppo fallback "Paese PES-XXX"',
    campionati.every((c) => !c.nome.startsWith('Paese ')),
    campionati.filter((c) => c.nome.startsWith('Paese ')).map((c) => c.nome).join(', ') || 'ok',
  );
  check(
    'nessuna lega esclusa per roster incompleto (2. Bundesliga, Russian Premier League, Ekstraklasa…)',
    campionati.every((c) => !['2. Bundesliga', 'Russian Premier League', 'Ekstraklasa', 'Swiss Super League', 'Austrian Bundesliga'].includes(c.nome)),
    campionati.filter((c) => ['2. Bundesliga', 'Russian Premier League', 'Ekstraklasa', 'Swiss Super League', 'Austrian Bundesliga'].includes(c.nome)).map((c) => c.nome).join(', '),
  );

  // 2. Ogni squadra curata matcha nella propria lega (auto-consistenza indice).
  //    Confronto sui nomi NORMALIZZATI, risolti con gli alias: "Inter Milan"
  //    (CSV) risolve a "inter" come il canonico "Inter".
  const perLega = new Map(campionati.map((c) => [c.nome, new Set(c.squadre.map((s) => normalizzaNome(s.nome)))]));
  for (const lega of LEGHE_CURATE) {
    const presenti = perLega.get(lega.nome);
    const mancanti = lega.squadre.filter((nome) => {
      if (!presenti) return true;
      const k = normalizzaNome(nome);
      return ![...presenti].some((n) => n === k || ALIASI[n] === k);
    });
    check(`roster curato "${lega.nome}" tutto matchato`, mancanti.length === 0, mancanti.join(', '));
  }

  // 3. Il CSV non deve contenere falsi positivi fuori contesto (es. CD Everton in PL).
  //    Stessa risoluzione di legaCurataPerNome: normalizza + alias ("Inter Milan"
  //    → "inter" è legittimo, "Barcelona SC" → "barcelona" no).
  const normalizzatiPerLega = new Map(
    LEGHE_CURATE.map((l) => [l.nome, new Set(l.squadre.map((nome) => normalizzaNome(nome)))]),
  );
  const extra = campionati.flatMap((c) => {
    const curati = normalizzatiPerLega.get(c.nome);
    if (!curati) return [];
    return c.squadre
      .filter((s) => {
        const n = normalizzaNome(s.nome);
        const risolto = ALIASI[n] ?? n;
        return !curati.has(risolto);
      })
      .map((s) => `${s.nome} → ${c.nome}`);
  });
  check(
    'nessun falso positivo (squadra CSV in una lega dove non appartiene)',
    extra.length === 0,
    extra.join(', '),
  );

  console.log(falliti === 0 ? '\nTUTTI I CHECK PASSATI' : `\n${falliti} CHECK FALLITI`);
  process.exit(falliti === 0 ? 0 : 1);
}

main();
