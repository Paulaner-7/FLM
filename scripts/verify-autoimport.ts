// FLM — Verifica rapida: import dei CSV reali in docs/ (come farebbe il browser).
// Avvio: npx tsx scripts/verify-autoimport.ts
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { db } from '../src/db/database';
import { parseBootstrapCsv, importaBootstrap } from '../src/db/bootstrap';

async function main(): Promise<void> {
  const doc = (nome: string): string => readFileSync(`docs/${nome}`, 'utf8');

  const t0 = Date.now();
  const giocatori = parseBootstrapCsv(doc('Players - PES 2021 - Edit.csv'), 'giocatori', 'Players');
  const squadre = parseBootstrapCsv(doc('Teams - PES 2021 - Edit.csv'), 'squadre', 'Teams');
  const assegnazioni = parseBootstrapCsv(doc('Teams-Players - PES 2021 - Edit.csv'), 'assegnazioni', 'Teams-Players');
  console.log(`parse: ${Date.now() - t0}ms`);
  console.log('headerErrors:', giocatori.headerErrors.length, squadre.headerErrors.length, assegnazioni.headerErrors.length);
  console.log('righe valide:', giocatori.rows.length, squadre.rows.length, assegnazioni.rows.length);
  console.log('issue:', giocatori.issues.length, squadre.issues.length, assegnazioni.issues.length);
  giocatori.issues.slice(0, 5).forEach((i) => console.log('  giocatori issue:', i.row, i.message));
  squadre.issues.slice(0, 5).forEach((i) => console.log('  squadre issue:', i.row, i.message));
  assegnazioni.issues.slice(0, 5).forEach((i) => console.log('  assegnazioni issue:', i.row, i.message));

  if (giocatori.headerErrors.length + squadre.headerErrors.length + assegnazioni.headerErrors.length > 0) {
    console.log('ABORT: header non riconosciuti');
    return;
  }

  const t1 = Date.now();
  const summary = await importaBootstrap({ giocatori, squadre, assegnazioni }, '2025/26');
  console.log(`import: ${Date.now() - t1}ms`);
  console.log('summary:', JSON.stringify(summary));

  console.log('db:', await db.squadre.count(), 'squadre,', await db.giocatori.count(), 'giocatori,', await db.squadAssignments.count(), 'assegnazioni');
  const senza = (await db.giocatori.toArray()).filter((g) => g.pesId === null).length;
  console.log('giocatori senza pesId:', senza);

  // Controllo nazionalità: nessun "PES-" residuo (fallback solo per ID sconosciuti)
  const giocatoriDb = await db.giocatori.toArray();
  const residui = giocatoriDb.filter((g) => g.nazionalita.startsWith('PES-'));
  const perId = new Map<string, number>();
  for (const g of residui) perId.set(g.nazionalita, (perId.get(g.nazionalita) ?? 0) + 1);
  console.log('nazionalità PES- residue:', [...perId.entries()]);
  const squadreDb = await db.squadre.toArray();
  const squadreResidue = [...new Set(squadreDb.map((s) => s.nazione).filter((n) => n.startsWith('PES-')))].sort();
  console.log('nazioni squadra PES- residue:', squadreResidue);
  const campioni = giocatoriDb.filter((g) => ['Italia', 'Brasile', 'Inghilterra', 'Argentina', 'Francia', 'Portogallo', 'Taipei cinese', 'Nuova Caledonia', 'Antigua e Barbuda'].includes(g.nazionalita)).slice(0, 12);
  console.log('campioni:', campioni.map((g) => `${g.nome} → ${g.nazionalita}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
