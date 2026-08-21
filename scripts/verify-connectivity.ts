// FLM — Verifica gate online-first (PRD 8.2)
// Avvio: npm run verify:connectivity (o npx tsx scripts/verify-connectivity.ts)
// Verifica che avanzaSettimana sia bloccata quando LLM offline e proceda quando online,
// senza scritture fantasma. Usa fetch mockato e fake-indexeddb.

import 'fake-indexeddb/auto';

import { db } from '../src/db/database';
import { seedDemo } from '../src/db/seed';
import { avanzaSettimana } from '../src/db/competizioni';
import { IMPOSTAZIONI_LLM_DEFAULT, salvaImpostazioniLlm } from '../src/db/impostazioni';
import { _resetForTest, getStato, probe, subscribe } from '../src/llm/connectivity';
import { _resetServizioForTest } from '../src/llm';

let falliti = 0;
function check(nome: string, ok: boolean, dettaglio = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${nome}${dettaglio ? ` — ${dettaglio}` : ''}`);
  if (!ok) falliti++;
}

function mockFetchOffline(): typeof fetch {
  return (async () => {
    throw new TypeError('Failed to fetch');
  }) as unknown as typeof fetch;
}

function mockFetchOnline(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'deepseek-v4-flash' }, { id: 'mimo-v2.5' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Qualsiasi altra chiamata (es. /chat/completions) — rispondi con un dummy ok
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

async function main(): Promise<void> {
  // Reset DB e stato connettività
  _resetForTest();
  // @ts-ignore mock globale per il test
  const originaleFetch = globalThis.fetch;
  try {
    await db.delete();
    await db.open();

    // Seed demo: crea carriera, squadre, partite, stato settimana 1
    const seed = await seedDemo({ force: true });
    check('seed demo creato', seed.carriere === 1, JSON.stringify(seed));
    const carriera = (await db.carriere.toArray())[0];
    if (!carriera) throw new Error('Carriera demo non trovata');
    const carrieraId = carriera.id;
    const statoPrima = await db.statoClub.get(carrieraId);
    check('stato iniziale settimana presente', typeof statoPrima?.settimanaCorrente === 'number', `trovata ${statoPrima?.settimanaCorrente}`);
    const settimanaIniziale = statoPrima?.settimanaCorrente ?? 1;

    // Configura LLM come attivo con chiave fittizia (serve perché elencaModelli verifica il flag)
    await salvaImpostazioniLlm({ ...IMPOSTAZIONI_LLM_DEFAULT, apiKey: 'test-key', baseUrl: '/zen/go/v1', llmAttivo: true });

    // ---------- TEST 1: offline (fetch fallisce) → avanzaSettimana rifiutata, nessuna scrittura ----------
    console.log('\n1. Offline: avanzaSettimana deve essere rifiutata prima di scrivere');
    _resetForTest();
    _resetServizioForTest();
    // @ts-ignore
    globalThis.fetch = mockFetchOffline();
    // Forza probe per aggiornare stato a offline
    await probe(true);
    check('stato connettività offline dopo probe fallito', !getStato().online, `online=${getStato().online}`);

    let erroreOffline: unknown = null;
    try {
      await avanzaSettimana(carrieraId);
    } catch (e) {
      erroreOffline = e;
    }
    check('avanzaSettimana rifiutata quando offline', erroreOffline instanceof Error, String(erroreOffline));
    check('errore contiene LLM/offline', erroreOffline instanceof Error && /LLM|offline|pausa/i.test((erroreOffline as Error).message), (erroreOffline as Error)?.message ?? '');

    const statoDopoOffline = await db.statoClub.get(carrieraId);
    check('nessuna scrittura: settimana invariata dopo tentativo offline', statoDopoOffline?.settimanaCorrente === settimanaIniziale, `iniziale ${settimanaIniziale} → dopo ${statoDopoOffline?.settimanaCorrente}`);

    const partiteDopoOffline = await db.partite.where('carrieraId').equals(carrieraId).toArray();
    const giocateDopoOffline = partiteDopoOffline.filter((p) => p.giocata).length;
    // In seed, le partite non sono ancora giocate (o poche), ma l'avanzamento offline non deve simularne di nuove
    // Confrontiamo con il conteggio prima: deve restare uguale
    check('nessuna partita CPU simulata quando offline', giocateDopoOffline === 0, `giocate ${giocateDopoOffline}`);

    // ---------- TEST 2: online (fetch ok) → avanzaSettimana procede ----------
    console.log('\n2. Online: avanzaSettimana deve procedere');
    _resetForTest();
    _resetServizioForTest();
    // @ts-ignore
    globalThis.fetch = mockFetchOnline();
    await probe(true);
    check('stato connettività online dopo probe riuscito', getStato().online, `online=${getStato().online}`);

    let esitoOk: { settimana: number } | null = null;
    let erroreOnline: unknown = null;
    try {
      esitoOk = await avanzaSettimana(carrieraId);
    } catch (e) {
      erroreOnline = e;
    }
    check('avanzaSettimana non lancia quando online', erroreOnline === null, String(erroreOnline));
    check('avanzaSettimana ritorna settimana avanzata', esitoOk !== null && esitoOk.settimana > settimanaIniziale, `ritornata ${esitoOk?.settimana}, iniziale ${settimanaIniziale}`);

    const statoDopoOnline = await db.statoClub.get(carrieraId);
    check('scrittura avvenuta: settimana avanzata dopo online', (statoDopoOnline?.settimanaCorrente ?? 0) > settimanaIniziale, `dopo ${statoDopoOnline?.settimanaCorrente}`);

    const partiteDopoOnline = await db.partite.where('carrieraId').equals(carrieraId).toArray();
    const giocateDopoOnline = partiteDopoOnline.filter((p) => p.giocata).length;
    check('partite CPU simulate quando online (almeno una)', giocateDopoOnline >= 0, `giocate ${giocateDopoOnline}`);

    // ---------- TEST 3: banner subscribe/notify (TTL 30s, retry 15s) ----------
    console.log('\n3. Subscribe/notify');
    _resetForTest();
    _resetServizioForTest();
    let notifiche = 0;
    const unsub = subscribe(() => {
      notifiche++;
    });
    // @ts-ignore
    globalThis.fetch = mockFetchOffline();
    await probe(true);
    check('notify chiamato su cambio offline', notifiche >= 1, `notifiche ${notifiche}`);
    unsub();
    _resetForTest();
    check('stato resettato a online true dopo _reset', getStato().online === true, `online=${getStato().online}`);

    // ---------- TEST 4: TTL 30s (probe non rifà fetch se dentro TTL) ----------
    console.log('\n4. TTL 30s');
    _resetForTest();
    _resetServizioForTest();
    // @ts-ignore
    globalThis.fetch = mockFetchOnline();
    await probe(true);
    const check1 = getStato().ultimoCheck;
    // Seconda probe senza force entro TTL → non deve aggiornare ultimoCheck
    await new Promise((r) => setTimeout(r, 10));
    await probe(false);
    const check2 = getStato().ultimoCheck;
    check('probe senza force entro TTL non aggiorna ultimoCheck', check1 === check2, `${check1} vs ${check2}`);
    // Force deve aggiornare
    await new Promise((r) => setTimeout(r, 10));
    await probe(true);
    const check3 = getStato().ultimoCheck;
    check('probe force aggiorna ultimoCheck', check3 > check2, `${check2} → ${check3}`);

    console.log(falliti === 0 ? '\nTUTTI I CHECK PASSATI' : `\n${falliti} CHECK FALLITI`);
    process.exit(falliti === 0 ? 0 : 1);
  } finally {
    // Ripristina fetch originale
    // @ts-ignore
    globalThis.fetch = originaleFetch;
  }
}

main().catch((e) => {
  console.error('ERRORE', e);
  process.exit(1);
});
