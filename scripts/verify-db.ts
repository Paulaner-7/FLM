// FLM — Verifica delle fondamenta dati (M0.5)
// Esegue il seed e prova le invarianti del PRD 7.2 in positivo E in negativo.
// Avvio: npm run verify:db
import 'fake-indexeddb/auto';

import { db } from '../src/db/database';
import { eliminaCarriera } from '../src/db/carriere';
import { seedDemo } from '../src/db/seed';
import { generaCalendario } from '../src/engine/calendario';
import { budgetCarriera, campionatiDisponibili, posizioniInLega, squadreDellaLega } from '../src/engine/carriera';
import { eseguiTrasferimento, registraTrattativaSaltata } from '../src/db/transfers';
import {
  validaBudget,
  validaPesIdUnivoco,
  validaRosa,
  validaUnicitaClub,
} from '../src/engine/invariants';
import type { Giocatore, SquadAssignment } from '../src/types/entities';

let falliti = 0;

function check(nome: string, ok: boolean, dettaglio = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${nome}${dettaglio ? ` — ${dettaglio}` : ''}`);
  if (!ok) falliti++;
}

function fabGiocatore(overrides: Partial<Giocatore> = {}): Giocatore {
  return {
    id: 'g',
    pesId: null,
    nome: 'Test',
    nazionalita: 'ITA',
    eta: 22,
    ruolo: 'difensore',
    overall: 70,
    morale: 70,
    forma: 70,
    minutiStagione: 0,
    promesse: [],
    leader: false,
    giovane: false,
    valoreMercato: 500_000,
    ...overrides,
  };
}

async function main(): Promise<void> {
  // ---------- SEED ----------
  const seed = await seedDemo({ force: true });
  check('seed: 6 squadre (4 giocabili + 2 ombre)', seed.squadre === 6 && seed.ombre === 2 && seed.giocabili === 4, JSON.stringify(seed));
  check('seed: 80 giocatori', seed.giocatori === 80);
  check('seed: 80 assegnazioni di proprietà', seed.assegnazioni === 80);
  check('seed: 1 carriera demo', seed.carriere === 1);
  check('seed: 1 competizione (della carriera)', seed.competizioni === 1);
  // 4 squadre → 6 giornate × 2 partite = 12 partite di calendario (andata+ritorno)
  check('seed: 12 partite di calendario', seed.partite === 12, `trovate ${seed.partite}`);

  const carriere = await db.carriere.toArray();
  check('seed: carriera con StatoClub iniziale', carriere.length === 1 && (await db.statoClub.get(carriere[0]?.id ?? '')) !== undefined);
  const statoDemo = carriere[0] ? await db.statoClub.get(carriere[0].id) : undefined;
  // Budget per piazzamento: Meridiana è la squadra più forte della lega (pos 1)
  const templatePerBudget = (await db.squadre.toArray()).filter((s) => s.carrieraId === undefined);
  const meridianaTemplate = templatePerBudget.find((s) => s.nome === 'FC Meridiana');
  const legaDemo = squadreDellaLega(templatePerBudget, 'Serie FLM');
  const posMeridiana = meridianaTemplate ? posizioniInLega(legaDemo).get(meridianaTemplate.id) ?? 1 : 1;
  const budgetAtteso = meridianaTemplate ? budgetCarriera(meridianaTemplate, 'Serie FLM', posMeridiana) : -1;
  check('seed: fiducia società 70', statoDemo?.fiduciaSocieta === 70);
  check('seed: budget da piazzamento (Meridiana pos 1)', statoDemo?.budget === budgetAtteso, `atteso ${budgetAtteso}, trovato ${statoDemo?.budget}`);
  const budgetSquadreClonate = new Set((await db.squadre.toArray()).filter((s) => s.carrieraId !== undefined).map((s) => s.budget));
  check('seed: budget differenziati per squadra (4 valori distinti)', budgetSquadreClonate.size === 4, `valori: ${[...budgetSquadreClonate].join(', ')}`);
  check('seed: settimana 1', statoDemo?.settimanaCorrente === 1);
  check('seed: obiettivo memorizzato', statoDemo?.obiettivo === 'coppe');
  const seed2 = await seedDemo();
  check('seed idempotente (nessun duplicato)', seed2.squadre === 6 && seed2.giocatori === 80 && seed2.carriere === 1);

  // ---------- CALENDARIO ----------
  const partiteDemo = await db.partite.toArray();
  const giornate = new Set(partiteDemo.map((p) => p.giornata));
  check('calendario: 6 giornate (2×(4−1))', giornate.size === 6, `giornate: ${[...giornate].join(', ')}`);
  check('calendario: nessuna partita giocata', partiteDemo.every((p) => !p.giocata));
  const squadreClonate = (await db.squadre.toArray()).filter((s) => s.carrieraId !== undefined);
  check('calendario: 4 squadre clonate', squadreClonate.length === 4);
  for (const squadra of squadreClonate) {
    const partiteSquadra = partiteDemo.filter((p) => p.casa === squadra.id || p.trasferta === squadra.id);
    check(`calendario: ${squadra.nome} gioca 6 partite (3 casa + 3 trasferta)`, partiteSquadra.length === 6 && partiteSquadra.filter((p) => p.casa === squadra.id).length === 3, String(partiteSquadra.length));
  }
  const coppia = (a: string, b: string): string => [a, b].sort().join('|');
  const coppie = partiteDemo.map((p) => coppia(p.casa, p.trasferta));
  check('calendario: ogni coppia esattamente 2 volte', new Set(coppie).size === 6 && coppie.every((c) => coppie.filter((x) => x === c).length === 2));

  // ---------- CALENDARIO N DISPARI (bye) ----------
  const dispari = generaCalendario(['a', 'b', 'c', 'd', 'e'], 'comp-test', 'car-test');
  const giornateDispari = new Set(dispari.map((p) => p.giornata));
  check('calendario dispari: 5 squadre → 10 giornate × 2 partite = 20', dispari.length === 20 && giornateDispari.size === 10, String(dispari.length));
  check(
    'calendario dispari: ogni squadra 8 partite (4 avversari × 2), coppie 2 volte',
    ['a', 'b', 'c', 'd', 'e'].every((id) => dispari.filter((p) => p.casa === id || p.trasferta === id).length === 8) &&
      new Set(dispari.map((p) => coppia(p.casa, p.trasferta))).size === 10,
  );
  check('calendario: deterministico (stesso input → stesso output)', JSON.stringify(dispari) === JSON.stringify(generaCalendario(['a', 'b', 'c', 'd', 'e'], 'comp-test', 'car-test')));

  // ---------- NAZIONALI E CAMPIONATI ----------
  const templateNaz = (await db.squadre.toArray()).filter((s) => s.carrieraId === undefined);
  const disp = campionatiDisponibili(templateNaz);
  check('campionati: Serie FLM disponibile con 4 squadre', disp.campionati.length === 1 && disp.campionati[0]?.nome === 'Serie FLM' && disp.campionati[0]?.squadre.length === 4);
  // una squadra "nazionale" per nome viene esclusa dai campionati
  await db.squadre.add({ id: 'naz-test', pesId: null, nome: 'Italia', nazione: 'ITA', nazionale: false, forza: 4, coefficiente: 50, budget: 100_000_000, reputazione: 85, ombra: false });
  const disp2 = campionatiDisponibili((await db.squadre.toArray()).filter((s) => s.carrieraId === undefined));
  check('campionati: "Italia" (nome) finisce tra le nazionali, non nei campionati', disp2.nazionali.some((s) => s.id === 'naz-test') && disp2.campionati.every((c) => c.squadre.every((s) => s.id !== 'naz-test')));
  await db.squadre.delete('naz-test');

  const giocatori = await db.giocatori.toArray();
  const assignments = await db.squadAssignments.toArray();
  const squadre = await db.squadre.toArray();

  // ---------- INVARIANTI SUI DATI SEED ----------
  check(
    'invariante: max 1 proprietà per giocatore',
    giocatori.every((g) => validaUnicitaClub(g.id, assignments).ok),
  );
  check(
    'invariante: rose entro 25 di movimento',
    squadre.filter((s) => !s.ombra).every((s) => validaRosa(s.id, giocatori, assignments).ok),
  );
  check('invariante: PES ID tutti null → nessun conflitto', validaPesIdUnivoco(null, giocatori).ok);

  // ---------- TRASFERIMENTO VALIDO ----------
  // I test di mercato usano le squadre TEMPLATE (registro), non le clonate
  const squadreTemplate = squadre.filter((s) => s.carrieraId === undefined);
  const meridiana = squadreTemplate.find((s) => s.nome === 'FC Meridiana');
  const falco = squadreTemplate.find((s) => s.nome === 'SS Falco');
  if (!meridiana || !falco) throw new Error('Squadre seed non trovate');

  const idsFalco = new Set(
    assignments.filter((a) => a.squadraId === falco.id && a.tipo === 'proprieta' && !a.al && a.carrieraId === undefined).map((a) => a.giocatoreId),
  );
  const attaccanteFalco = giocatori.find((g) => idsFalco.has(g.id) && g.ruolo === 'attaccante' && !g.giovane && g.carrieraId === undefined);
  if (!attaccanteFalco) throw new Error('Attaccante Falco non trovato');

  const budgetMeridianaPrima = meridiana.budget;
  const esito1 = await eseguiTrasferimento({
    giocatoreId: attaccanteFalco.id,
    daSquadraId: falco.id,
    aSquadraId: meridiana.id,
    cifra: 500_000,
    stagione: '2025/26',
    settimana: 3,
  });
  check('trasferimento valido eseguito', esito1.ok, esito1.ok ? '' : esito1.errori.join(' | '));
  if (esito1.ok) {
    check('ledger: voce esito completato', esito1.voceLedger.esito === 'completato');
    const budgetDopo = (await db.squadre.get(meridiana.id))?.budget;
    check('budget acquirente aggiornato', budgetDopo === budgetMeridianaPrima - 500_000);
    const assDopo = await db.squadAssignments.toArray();
    const attive = assDopo.filter((a) => a.giocatoreId === attaccanteFalco.id);
    check(
      'assegnazioni: vecchia chiusa + nuova attiva in Meridiana',
      attive.length === 2 && attive.some((a) => a.al === '2025/26') && attive.some((a) => !a.al && a.squadraId === meridiana.id),
    );

    // ---------- TRASFERIMENTO NON VALIDO: GIOCATORE GIÀ CEDUTO ----------
    const esito2 = await eseguiTrasferimento({
      giocatoreId: attaccanteFalco.id,
      daSquadraId: falco.id,
      aSquadraId: meridiana.id,
      cifra: 100_000,
      stagione: '2025/26',
      settimana: 3,
    });
    check('doppia cessione bloccata (non appartiene più a Falco)', !esito2.ok);
    check('doppia cessione: nessuna voce ledger aggiunta', (await db.transferLedger.where('esito').equals('completato').count()) === 1);
  }

  // ---------- TRASFERIMENTO NON VALIDO: BUDGET INSUFFICIENTE ----------
  const idsMeridiana = new Set(
    assignments.filter((a) => a.squadraId === meridiana.id && a.tipo === 'proprieta' && !a.al && a.carrieraId === undefined).map((a) => a.giocatoreId),
  );
  const giocatoreMeridiana = giocatori.find((g) => idsMeridiana.has(g.id) && !g.giovane && g.carrieraId === undefined);
  if (!giocatoreMeridiana) throw new Error('Giocatore Meridiana non trovato');
  const esito3 = await eseguiTrasferimento({
    giocatoreId: giocatoreMeridiana.id,
    daSquadraId: meridiana.id,
    aSquadraId: falco.id, // budget 3M
    cifra: 4_000_000,
    stagione: '2025/26',
    settimana: 3,
  });
  check(
    'budget insufficiente bloccato',
    !esito3.ok && esito3.errori.some((e) => e.toLowerCase().includes('budget')),
    esito3.ok ? '' : esito3.errori.join(' | '),
  );
  check('budget: nessuna voce ledger per il bloccato', (await db.transferLedger.where('esito').equals('completato').count()) === 1);

  // ---------- INVARIANTI PURE (IN NEGATIVO) ----------
  const finti26: Giocatore[] = Array.from({ length: 26 }, (_, i) =>
    fabGiocatore({ id: `f${i}` }),
  );
  const assFinti26: SquadAssignment[] = finti26.map((g) => ({
    id: `a${g.id}`,
    giocatoreId: g.id,
    squadraId: 's1',
    tipo: 'proprieta',
    dal: '2025/26',
  }));
  check('rosa: 26 di movimento bloccato', !validaRosa('s1', finti26, assFinti26).ok);
  check('rosa: 25 di movimento ok', validaRosa('s1', finti26.slice(0, 25), assFinti26.slice(0, 25)).ok);

  const doppia: SquadAssignment[] = [
    { id: 'a1', giocatoreId: 'g1', squadraId: 's1', tipo: 'proprieta', dal: '2025/26' },
    { id: 'a2', giocatoreId: 'g1', squadraId: 's2', tipo: 'proprieta', dal: '2025/26' },
  ];
  check('doppia proprietà rilevata', !validaUnicitaClub('g1', doppia).ok);

  const gPes1 = fabGiocatore({ id: 'p1', pesId: 123 });
  const gPes2 = fabGiocatore({ id: 'p2', pesId: 123 });
  check('PES ID duplicato rilevato', !validaPesIdUnivoco(123, [gPes1, gPes2], 'p1').ok);
  check('PES ID null sempre ok', validaPesIdUnivoco(null, [gPes1, gPes2]).ok);

  const squadraPovera = squadreTemplate.find((s) => s.nome === 'SS Falco');
  if (squadraPovera) {
    check('budget: cifra entro il budget ok', validaBudget(squadraPovera, 2_999_999).ok);
    check('budget: cifra oltre il budget bloccata', !validaBudget(squadraPovera, 3_000_001).ok);
    check('budget: cifra negativa bloccata', !validaBudget(squadraPovera, -1).ok);
  }

  // ---------- TRATTATIVA SALTATA ----------
  await registraTrattativaSaltata(
    {
      giocatoreId: attaccanteFalco.id,
      daSquadraId: falco.id,
      aSquadraId: meridiana.id,
      cifra: 0,
      stagione: '2025/26',
      settimana: 4,
    },
    'Rosa piena',
  );
  check('ledger: trattativa saltata registrata', (await db.transferLedger.where('esito').equals('saltato').count()) === 1);

  // ---------- PONTE DATI ----------
  const { giocatoriACsv } = await import('../src/bridge/csv');
  const luca = giocatori.find((g) => g.nome === 'Luca Bianchi');
  const csv = giocatoriACsv(luca ? [luca] : []);
  check('bridge: CSV con header e separatore ";"', csv.includes('ID_PES') && csv.includes(';') && (luca ? csv.includes(luca.nome) : false));

  const { generaRiepilogoModifiche } = await import('../src/bridge/report');
  const report = generaRiepilogoModifiche(
    [{ giocatore: attaccanteFalco, squadra: meridiana, tipo: 'creazione' }],
    { stagione: '2025/26' },
  );
  check('bridge: report leggibile generato', report.includes('FC Meridiana') && report.includes(attaccanteFalco.nome));

  // ---------- PULIZIA: RI-SEED PULITO ----------
  const pulito = await seedDemo({ force: true });
  const assegnazioniTemplate = (await db.squadAssignments.toArray()).filter((a) => a.carrieraId === undefined).length;
  check(
    'ri-seed pulito (ledger e trasferimenti azzerati)',
    pulito.giocatori === 80 && (await db.transferLedger.count()) === 0 && assegnazioniTemplate === 80 && pulito.carriere === 1,
  );

  // ---------- ELIMINAZIONE CARRIERA (cascata) ----------
  const carriere2 = await db.carriere.toArray();
  const idCarriera = carriere2[0]?.id;
  if (idCarriera) {
    await eliminaCarriera(idCarriera);
    check('eliminazione: riga carriera rimossa', (await db.carriere.count()) === 0);
    check('eliminazione: copie squadre/giocatori rimosse', (await db.squadre.where('carrieraId').equals(idCarriera).count()) === 0 && (await db.giocatori.where('carrieraId').equals(idCarriera).count()) === 0);
    check('eliminazione: competizioni/partite/stato rimossi', (await db.competizioni.count()) === 0 && (await db.partite.count()) === 0 && (await db.statoClub.count()) === 0);
    check('eliminazione: template intatti', (await db.squadre.count()) === 6 && (await db.giocatori.count()) === 80);
  }

  console.log(falliti === 0 ? '\nTUTTI I CHECK PASSATI ✅' : `\n${falliti} CHECK FALLITI ❌`);
  process.exit(falliti === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('ERRORE', e);
  process.exit(1);
});
