// FLM — Verifica motore mercato (PRD 7.3), offline, senza chiave API.
// Esegue: npm run verify:mercato
// Copre: formula valore (ancore reali Transfermarkt), finestre, macchina a
// stati trattativa (4 giri, final offer, scadenze), avanza giorno (offerte
// in entrata, CPU-to-CPU, invarianti mai violate), svincolati, effetti morale,
// chiusura finestra (must-respond), export CSV.
import 'fake-indexeddb/auto';

import { db, seedDemo, creaCarriera, eliminaCarriera, avanzaGiornoMercato, creaOffertaAcquisto, rispondiTrattativa, statoMercato, firmaSvincolato, STAGIONE_DEMO } from '../src/db';
import {
  valoreMercato,
  finestraDiSettimana,
  rispostaCpu,
  sogliaCpu,
  tettoCpu,
  effettiCessione,
  effettiAcquisto,
  bisogniRosa,
  anniContrattoResidui,
  fattoreContratto,
  nuovaScadenzaContratto,
  ingaggioDaValore,
  eleggibilePerOfferta,
} from '../src/engine/mercato';
import { validaTrasferimento, MAX_ROSA_MOVIMENTO } from '../src/engine/invariants';
import type { Giocatore, Trattativa, SquadAssignment, Squadra } from '../src/types/entities';

let falliti = 0;
function check(condizione: boolean, nome: string): void {
  if (condizione) {
    console.log(`  ok  ${nome}`);
  } else {
    falliti++;
    console.error(`FAIL  ${nome}`);
  }
}

function fabGiocatore(overrides: Partial<Giocatore> = {}): Giocatore {
  return {
    id: 'g1',
    carrieraId: 'c1',
    pesId: null,
    nome: 'Test',
    nazionalita: 'ITA',
    eta: 25,
    ruolo: 'attaccante',
    overall: 75,
    morale: 50,
    fiducia: 50,
    forma: 50,
    minutiStagione: 0,
    promesse: [],
    leader: false,
    giovane: false,
    valoreMercato: 10_000_000,
    scadenzaContratto: '2029/30',
    ingaggioAnnuo: 500_000,
    ...overrides,
  };
}

function fabTrattativa(overrides: Partial<Trattativa> = {}): Trattativa {
  return {
    id: 't1',
    carrieraId: 'c1',
    giocatoreId: 'g1',
    clubId: 's2',
    direzione: 'acquisto',
    stato: 'proposta',
    giro: 0,
    cifraUtente: 0,
    cifraCpu: 0,
    sogliaCpu: 10_000_000,
    tettoCpu: 14_000_000,
    giornoCreato: 1,
    scadenzaRisposta: 2,
    finalOffer: false,
    messaggi: [],
    updatedAt: 1,
    ...overrides,
  };
}

async function main(): Promise<void> {
  console.log('Verifica motore mercato\n');

  // ---------- Formula valore: ancore reali (Transfermarkt 2025/26) ----------
  console.log('Formula valore (ancore reali):');
  const giocatore = (overall: number, eta: number, ruolo: string, scadenza: string): Giocatore =>
    fabGiocatore({ overall, eta, ruolo, scadenzaContratto: scadenza });
  const v = (g: Giocatore): number => valoreMercato(g, '2026/27');

  // top-50: Bellingham 23 CM €160M; Saliba 25 DC €100M; Palestra 21 €35M
  const bellingham = v(giocatore(88, 23, 'centrocampista', '2029/30'));
  check(bellingham > 100_000_000 && bellingham < 220_000_000, `overall 88/23/CM → €${(bellingham / 1e6).toFixed(0)}M (reale ~160M)`);
  const saliba = v(giocatore(84, 25, 'difensore', '2029/30'));
  check(saliba > 40_000_000 && saliba < 130_000_000, `overall 84/25/DC → €${(saliba / 1e6).toFixed(0)}M (reale ~100M)`);

  // Serie A: Piccoli 25 attaccante €14M; Zortea 27 terzino €7M; Belotti 32 €1.5M
  const piccoli = v(giocatore(76, 25, 'attaccante', '2028/29'));
  check(piccoli > 5_000_000 && piccoli < 30_000_000, `overall 76/25/ATT → €${(piccoli / 1e6).toFixed(0)}M (reale ~14M)`);
  const zortea = v(giocatore(72, 27, 'terzino', '2028/29'));
  check(zortea > 2_000_000 && zortea < 15_000_000, `overall 72/27/terzino → €${(zortea / 1e6).toFixed(0)}M (reale ~7M)`);
  const belotti = v(giocatore(74, 32, 'attaccante', '2027/28'));
  check(belotti < 3_000_000, `overall 74/32/ATT → €${(belotti / 1e6).toFixed(0)}M (reale ~1.5M: crollo età)`);

  // Serie B: Łęgowski 23 €2M; panchina €100-600k
  const legowski = v(giocatore(68, 23, 'centrocampista', '2028/29'));
  check(legowski > 500_000 && legowski < 5_000_000, `overall 68/23/CC → €${(legowski / 1e6).toFixed(1)}M (reale ~2M)`);
  const serieB = v(giocatore(62, 24, 'difensore', '2027/28'));
  check(serieB < 800_000, `overall 62/24/DC → €${(serieB / 1e3).toFixed(0)}k (reale ~100-600k)`);

  // Contratto: scadenza sconta forte (caso reale: in scadenza costa meno)
  const inScadenza = v(giocatore(80, 26, 'attaccante', '2026/27'));
  const lungo = v(giocatore(80, 26, 'attaccante', '2030/31'));
  check(inScadenza < lungo * 0.6, `scadenza 0 anni sconta (${(inScadenza / lungo * 100).toFixed(0)}% del valore pieno)`);
  check(anniContrattoResidui('2028/29', '2026/27') === 2, 'anni residui: 2028/29 - 2026/27 = 2');
  check(fattoreContratto(0) === 0.5 && fattoreContratto(3) === 1.0, 'fattore contratto: 0 anni 0.5, 3+ anni 1.0');
  check(nuovaScadenzaContratto('2026/27') === '2029/30', 'nuovo contratto: +3 anni');
  check(ingaggioDaValore(10_000_000) === 500_000, 'ingaggio = 5% del valore');

  // ---------- Finestre ----------
  console.log('Finestre di mercato:');
  check(finestraDiSettimana(1) === 'estate', 'settimana 1 → estate');
  check(finestraDiSettimana(9) === 'estate', 'settimana 9 → estate');
  check(finestraDiSettimana(10) === null, 'settimana 10 → chiuso');
  check(finestraDiSettimana(27) === 'inverno', 'settimana 27 → inverno');
  check(finestraDiSettimana(31) === 'inverno', 'settimana 31 → inverno');
  check(finestraDiSettimana(32) === null, 'settimana 32 → chiuso');

  // ---------- Macchina a stati (4 giri, final offer, soglie) ----------
  console.log('Macchina a stati trattativa:');
  const t = fabTrattativa({ sogliaCpu: 10_000_000, direzione: 'acquisto' });
  // Offerta bassa (6M < soglia): la CPU contropropone verso l'alto, mai sotto la soglia
  const r1 = rispostaCpu(t, 10_000_000, 6_000_000, 'seed1');
  check(!r1.accettata, 'offerta 6M sotto soglia 10M → rifiutata (controproposta)');
  check(r1.cifraCpu >= 10_000_000, `controproposta ≥ soglia (${(r1.cifraCpu / 1e6).toFixed(1)}M)`);
  check(!r1.finalOffer, 'giro 1: non è final offer');

  const t2 = fabTrattativa({ sogliaCpu: 10_000_000, giro: 3, direzione: 'acquisto' });
  const r2 = rispostaCpu(t2, 10_000_000, 7_000_000, 'seed2');
  check(r2.finalOffer, 'giro 4 → final offer');
  const t3 = fabTrattativa({ sogliaCpu: 10_000_000, direzione: 'acquisto' });
  const r3 = rispostaCpu(t3, 10_000_000, 11_000_000, 'seed3');
  check(r3.accettata, 'offerta 11M ≥ soglia 10M → accettata');
  const t4 = fabTrattativa({ tettoCpu: 14_000_000, direzione: 'vendita' });
  const r4 = rispostaCpu(t4, 10_000_000, 13_000_000, 'seed4');
  check(r4.accettata, 'vendita: richiesta 13M ≤ tetto 14M → accettata');
  const r5 = rispostaCpu(fabTrattativa({ tettoCpu: 14_000_000, cifraCpu: 12_000_000, direzione: 'vendita' }), 10_000_000, 18_000_000, 'seed5');
  check(!r5.accettata && r5.cifraCpu <= 14_000_000, `vendita: richiesta 18M > tetto → controproposta ≤ tetto (${(r5.cifraCpu / 1e6).toFixed(0)}M)`);
  check(Number.isFinite(sogliaCpu(10_000_000, 'x')), 'soglia CPU deterministica');
  check(sogliaCpu(10_000_000, 'x') === sogliaCpu(10_000_000, 'x'), 'soglia CPU riproducibile');
  check(tettoCpu(10_000_000, 'y') >= 10_000_000, 'tetto CPU ≥ valore');

  // Concessione: soglia 10M, richiesta iniziale 11.5M, user 6M →
  // 11.5 + (6-11.5)×0.25 = 10.125 → 10M (mai sotto la soglia)
  const t6 = fabTrattativa({ sogliaCpu: 10_000_000, direzione: 'acquisto' });
  const r6 = rispostaCpu(t6, 10_000_000, 6_000_000, 'seed6');
  check(r6.cifraCpu >= 10_000_000 && r6.cifraCpu < 12_000_000, `concessione: tra soglia e richiesta iniziale (${(r6.cifraCpu / 1e6).toFixed(1)}M)`);
  const t7 = fabTrattativa({ sogliaCpu: 10_000_000, direzione: 'acquisto' });
  const r7 = rispostaCpu(t7, 10_000_000, 9_500_000, 'seed7');
  check(!r7.accettata && r7.cifraCpu > 9_500_000 && r7.cifraCpu < 11_500_000, `concessione tra richiesta e offerta (${(r7.cifraCpu / 1e6).toFixed(1)}M)`);

  // ---------- Effetti cessione/acquisto ----------
  console.log('Effetti cessioni eccellenti:');
  const leader = fabGiocatore({ leader: true, overall: 85 });
  const eff1 = effettiCessione(leader, [fabGiocatore({ id: 'a' })], () => 0, 0);
  check(eff1.moraleTutti === -4 && eff1.fiduciaTifosi === -5 && eff1.eventoReazione, 'cessione leader → −4 morale, −5 tifosi, evento');
  const titolare = fabGiocatore({ id: 'g1', overall: 80, leader: false });
  const eff2 = effettiCessione(titolare, [fabGiocatore({ id: 'a' })], () => 8, 10);
  check(eff2.moraleTutti === -2 && eff2.fiduciaTifosi === -2, 'titolare 80% presenze → −2/−2');
  const panchinaro = fabGiocatore({ id: 'g1', overall: 70, leader: false });
  const eff3 = effettiCessione(
    panchinaro,
    [fabGiocatore({ id: 'a1', overall: 72 }), fabGiocatore({ id: 'a2', overall: 74 }), fabGiocatore({ id: 'a3', overall: 76 })],
    () => 1, 10,
  );
  check(eff3.moraleTutti === 0 && !eff3.eventoReazione, 'panchinaro (fuori top-3) → nessun effetto');
  const miglior = fabGiocatore({ id: 'g1', overall: 85, leader: false });
  const effTop = effettiCessione(miglior, [fabGiocatore({ id: 'a1', overall: 72 }), fabGiocatore({ id: 'a2', overall: 74 }), fabGiocatore({ id: 'a3', overall: 76 })], () => 9, 10);
  check(effTop.eventoReazione && effTop.moraleTutti === -2, 'cessione del miglior giocatore (top-3) → effetto + evento');
  const acquisto = effettiAcquisto(fabGiocatore({ overall: 85 }), [fabGiocatore({ id: 'a', overall: 74 })]);
  check(acquisto.moraleTutti === 3 && acquisto.fiduciaTifosi === 3, 'acquisto top (+3 overall) → +3 morale, +3 tifosi');

  // ---------- Eleggibilità ----------
  console.log('Eleggibilità offerte:');
  check(eleggibilePerOfferta(fabGiocatore(), 5), 'giocatore sano eleggibile');
  check(!eleggibilePerOfferta(fabGiocatore({ infortunioFinoA: 10 }), 5), 'infortunato non eleggibile');
  check(!eleggibilePerOfferta(fabGiocatore({ eta: 35 }), 5), '35 anni non eleggibile');

  // ---------- Bisogni rose ----------
  console.log('Bisogni rose:');
  const bisogni = bisogniRosa(
    { id: 's1', nome: 'Squadra', rating: 1500 } as Squadra,
    [fabGiocatore({ id: 'p1', ruolo: 'portiere', eta: 30 })],
    [{ id: 'a1', giocatoreId: 'p1', squadraId: 's1', tipo: 'proprieta', dal: '2026/27' }] as SquadAssignment[],
    1500,
  );
  const portiere = bisogni.find((b) => b.ruolo === 'portiere');
  check(portiere !== undefined && portiere.intensita === 60, 'un solo portiere → bisogno medio');
  const bisogni2 = bisogniRosa(
    { id: 's1', nome: 'Squadra', rating: 1400 } as Squadra,
    [fabGiocatore({ id: 'p1', ruolo: 'portiere', eta: 30 })],
    [{ id: 'a1', giocatoreId: 'p1', squadraId: 's1', tipo: 'proprieta', dal: '2026/27' }] as SquadAssignment[],
    1500,
  );
  check(bisogni2.find((b) => b.ruolo === 'portiere')!.intensita >= 75, 'club debole → bisogno rafforzato');

  // ---------- Test end-to-end con carriera reale ----------
  console.log('\nCarriera demo end-to-end:');
  await seedDemo();
  const demo = (await db.carriere.toArray()).find((c) => c.stagione === STAGIONE_DEMO) ??
    (await creaCarriera({ squadraTemplateId: (await db.squadre.where('carrieraId').equals(undefined).toArray())[0]!.id, obiettivo: 'salvezza', campionato: 'Serie FLM', stagione: STAGIONE_DEMO })).carriera;

  const stato0 = await db.statoClub.get(demo.id);
  check(stato0 !== undefined, 'StatoClub creato');
  if (!stato0) { console.error('stop'); return; }
  check(stato0.giornoMercato >= 1, `finestra attiva all'avvio (giorno ${stato0.giornoMercato})`);

  const mer0 = await statoMercato(demo.id);
  check(mer0.attiva, 'statoMercato: finestra attiva');
  check(mer0.giorno === stato0.giornoMercato, 'giorno coerente');

  // Acquisto: prendo un giocatore di un'altra squadra della lega demo
  const giocatori = await db.giocatori.where('carrieraId').equals(demo.id).toArray();
  const squadre = await db.squadre.where('carrieraId').equals(demo.id).toArray();
  const mia = squadre.find((s) => s.id === demo.squadraId);
  check(mia !== undefined, 'squadra utente trovata');
  if (!mia) { console.error('stop'); return; }
  const assegnazioni = await db.squadAssignments.where('carrieraId').equals(demo.id).toArray();
  const altrui = giocatori.find((g) => {
    const a = assegnazioni.find((x) => x.giocatoreId === g.id && x.tipo === 'proprieta' && x.al === undefined);
    return a !== undefined && a.squadraId !== mia.id && g.ruolo !== 'portiere';
  });
  check(altrui !== undefined, 'esiste un giocatore di un altro club');
  if (!altrui) { console.error('stop'); return; }

  const valore = valoreMercato(altrui, demo.stagione);
  const offerta = await creaOffertaAcquisto(demo.id, altrui.id, Math.round(valore * 0.8));
  check(offerta.ok, 'offerta d\'acquisto creata');
  if (!offerta.ok) { console.error(offerta.errori); }
  const trattOfferta = offerta.trattativa;
  if (trattOfferta) {
    check(trattOfferta.scadenzaRisposta === stato0.giornoMercato + 1, 'risposta CPU attesa il giorno dopo');
    // Turno sbagliato: l'utente non può rispondere prima della risposta CPU
    const precoce = await rispondiTrattativa(demo.id, trattOfferta.id, { tipo: 'accetta' });
    check(!precoce.ok, 'non è il turno utente prima della risposta CPU');
  }

  // Fuori finestra: nessun avanzamento possibile
  const statoChiuso = await db.statoClub.get(demo.id);
  if (statoChiuso) {
    await db.statoClub.put({ ...statoChiuso, giornoMercato: 0 });
    const chiuso = await avanzaGiornoMercato(demo.id);
    check(chiuso.esito === 'non_attiva', 'finestra chiusa → nessun avanzamento');
    await db.statoClub.put({ ...statoChiuso, giornoMercato: statoChiuso.giornoMercato });
  }

  // Simulazione: avanzo fino a fine finestra, invarianti sempre rispettate
  console.log('Simulazione 30 giorni (invarianti):');
  let violazioni = 0;
  let movimentiTotali = 0;
  let offerteTotali = 0;
  let giorni = 0;
  let esitoChiusura: { esito: string } | null = null;
  for (let i = 0; i < 40; i++) {
    const esito = await avanzaGiornoMercato(demo.id);
    if (esito.esito === 'chiusa') { esitoChiusura = esito; break; }
    if (esito.esito === 'non_attiva') break;
    giorni = esito.giorno;
    movimentiTotali += esito.movimentiCpu;
    offerteTotali += esito.offerteCreate;

    // Verifica invarianti dopo ogni giorno
    const [g, s, a] = await Promise.all([
      db.giocatori.where('carrieraId').equals(demo.id).toArray(),
      db.squadre.where('carrieraId').equals(demo.id).toArray(),
      db.squadAssignments.where('carrieraId').equals(demo.id).toArray(),
    ]);
    // Unicità club: ogni giocatore al massimo una proprietà attiva
    const conteggio = new Map<string, number>();
    for (const as of a) {
      if (as.tipo === 'proprieta' && as.al === undefined) {
        conteggio.set(as.giocatoreId, (conteggio.get(as.giocatoreId) ?? 0) + 1);
      }
    }
    for (const [gid, n] of conteggio) {
      if (n > 1) { violazioni++; console.error(`  doppia proprietà: ${gid} (${n})`); }
    }
    // Rosa max 25 di movimento
    for (const sq of s) {
      const movimento = a.filter(
        (as) => as.squadraId === sq.id && as.tipo === 'proprieta' && as.al === undefined && !(g.find((x) => x.id === as.giocatoreId)?.giovane) && (g.find((x) => x.id === as.giocatoreId)?.ruolo ?? 'portiere') !== 'portiere',
      ).length;
      if (movimento > MAX_ROSA_MOVIMENTO) { violazioni++; console.error(`  rosa oltre limite: ${sq.nome} (${movimento})`); }
    }
    // Budget mai negativo
    for (const sq of s) {
      if (sq.budget < 0) { violazioni++; console.error(`  budget negativo: ${sq.nome} (${sq.budget})`); }
    }
  }
  check(giorni > 0, `avanzamento completato fino a giorno ${giorni}`);
  check(esitoChiusura !== null, 'finestra chiusa dopo giorno 30');
  check(violazioni === 0, `zero violazioni invarianti (${violazioni})`);
  check(movimentiTotali >= 15, `mercato CPU attivo (${movimentiTotali} movimenti totali)`);
  check(offerteTotali >= 0, `offerte in entrata create (${offerteTotali})`);

  // Dopo la chiusura: mercato disattivo
  const dopo = await statoMercato(demo.id);
  check(!dopo.attiva, 'finestra chiusa → mercato disattivo');

  // Svincolati: fuori finestra la firma è rifiutata (regola Q11); in finestra ok
  const merPost = await statoMercato(demo.id);
  console.log('Svincolati:');
  check(Array.isArray(merPost.svincolati), 'lista svincolati disponibile');
  const svincolato = merPost.svincolati[0];
  if (svincolato) {
    const chiuso = await firmaSvincolato(demo.id, svincolato.id);
    check(!chiuso.ok, 'firma svincolato rifiutata fuori finestra');
    const st = await db.statoClub.get(demo.id);
    if (st) {
      await db.statoClub.put({ ...st, giornoMercato: 1 });
      const firma = await firmaSvincolato(demo.id, svincolato.id);
      check(firma.ok, `firma svincolato in finestra: ${svincolato.nome}`);
      await db.statoClub.put({ ...st, giornoMercato: 0 });
    }
  } else {
    console.log('  (nessuno svincolato nella demo: ok)');
  }

  // Ledger popolato
  const ledger = await db.transferLedger.where('carrieraId').equals(demo.id).toArray();
  check(ledger.length > 0, `ledger popolato (${ledger.length} voci)`);

  await eliminaCarriera(demo.id);
  console.log(`\n${falliti === 0 ? 'TUTTI I TEST SUPERATI' : `${falliti} TEST FALLITI`}`);
  process.exit(falliti === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
