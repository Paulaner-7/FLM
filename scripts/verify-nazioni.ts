// FLM — Verifica migrazione nazioni: "PES-215" → "Italia".
// Avvio: npx tsx scripts/verify-nazioni.ts
import 'fake-indexeddb/auto';
import { db, newId } from '../src/db/database';
import { migraNazioniPes } from '../src/db/nazioni';

async function main(): Promise<void> {
  await db.transaction('rw', db.giocatori, db.squadre, async () => {
    await db.giocatori.clear();
    await db.squadre.clear();
    await db.giocatori.bulkAdd([
      { id: newId(), pesId: 1, nome: 'A', nazionalita: 'PES-215', eta: 20, ruolo: 'difensore', overall: 70, morale: 60, forma: 60, minutiStagione: 0, promesse: [], valoreMercato: 1000 },
      { id: newId(), pesId: 2, nome: 'B', nazionalita: 'PES-204', eta: 20, ruolo: 'difensore', overall: 70, morale: 60, forma: 60, minutiStagione: 0, promesse: [], valoreMercato: 1000 },
      { id: newId(), pesId: 3, nome: 'C', nazionalita: 'Italia', eta: 20, ruolo: 'difensore', overall: 70, morale: 60, forma: 60, minutiStagione: 0, promesse: [], valoreMercato: 1000 },
      { id: newId(), pesId: 4, nome: 'D', nazionalita: 'PES-999', eta: 20, ruolo: 'difensore', overall: 70, morale: 60, forma: 60, minutiStagione: 0, promesse: [], valoreMercato: 1000 },
    ]);
    await db.squadre.bulkAdd([
      { id: newId(), pesId: 1, nome: 'S1', nazione: 'PES-146', nazionale: false, rating: 1800, ratingInizioStagione: 1800, coefficiente: 10, budget: 1000, reputazione: 50, ombra: false },
      { id: newId(), pesId: 2, nome: 'S2', nazione: 'Germania', nazionale: false, rating: 1800, ratingInizioStagione: 1800, coefficiente: 10, budget: 1000, reputazione: 50, ombra: false },
    ]);
  });

  const esito = await migraNazioniPes();
  console.log('esito:', JSON.stringify(esito));

  const giocatori = await db.giocatori.toArray();
  const squadre = await db.squadre.toArray();
  const perNome = (arr: Array<{ nazionalita?: string; nazione?: string }>, k: 'nazionalita' | 'nazione'): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const r of arr) { const v = r[k] ?? ''; m[v] = (m[v] ?? 0) + 1; }
    return m;
  };
  console.log('giocatori:', JSON.stringify(perNome(giocatori, 'nazionalita')));
  console.log('squadre:', JSON.stringify(perNome(squadre, 'nazione')));

  const ok = esito.giocatori === 3 && esito.squadre === 1
    && giocatori.some((g) => g.nazionalita === 'Italia')
    && giocatori.some((g) => g.nazionalita === 'Inghilterra')
    && giocatori.some((g) => g.nazionalita === 'PES-999')
    && squadre.some((s) => s.nazione === 'Brasile')
    && squadre.some((s) => s.nazione === 'Germania');
  console.log(ok ? 'PASS' : 'FAIL');
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
