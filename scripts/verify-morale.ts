// FLM — Verifica morale & spogliatoio (PRD 2.2, 3.2, M2).
// Avvio: npm run verify:morale
// Copre: funzioni pure (media pesata, effetti referto, valutazione promesse,
// candidato richiesta, scelta leader), bootstrap leader in carriera demo,
// conferma referto con morale + snapshot, richiesta promessa del giocatore,
// promessa tradita a scadenza, rollback completo del referto.
import 'fake-indexeddb/auto';

import { db } from '../src/db/database';
import { seedDemo } from '../src/db/seed';
import { creaPromessa, decidiRichiestaPromessa, promesseAttive, setLeader } from '../src/db/morale';
import { annullaReferto, confermaReferto, prossimaPartita, rosaDellaCarriera } from '../src/db/referti';
import {
  candidatoRichiestaPromessa,
  effettiMoraleReferto,
  fasciaSpogliatoio,
  giocatoriInCrisi,
  moraleSpogliatoio,
  scegliLeader,
  valutaPromesseScadute,
} from '../src/engine/morale';
import { xiDefault } from '../src/engine/referto';
import {
  BONUS_MARCATORE_MORALE,
  EFFETTO_VITTORIA_MORALE,
  LEADER_MAX,
  PANCHINA_PROMESSO_MORALE,
  PROMESSA_DURATA_DEFAULT,
  PROMESSA_MANTENUTA_FIDUCIA,
  PROMESSA_MANTENUTA_MORALE,
  PROMESSA_TRADITA_FIDUCIA,
  PROMESSA_TRADITA_MORALE,
  RIFIUTO_RICHIESTA_FIDUCIA,
  RIFIUTO_RICHIESTA_MORALE,
} from '../src/engine/rules';
import type { Giocatore, Id, Partita, Promessa } from '../src/types/entities';

let falliti = 0;

function check(nome: string, ok: boolean, dettaglio = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${nome}${dettaglio ? ` — ${dettaglio}` : ''}`);
  if (!ok) falliti++;
}

function fabGiocatore(overrides: Partial<Giocatore>): Giocatore {
  return {
    id: 'g',
    pesId: null,
    nome: 'Giocatore',
    nazionalita: 'ITA',
    eta: 24,
    ruolo: 'centrocampista',
    overall: 75,
    morale: 50,
    fiducia: 50,
    forma: 50,
    minutiStagione: 0,
    promesse: [],
    leader: false,
    giovane: false,
    valoreMercato: 1_000_000,
    ...overrides,
  };
}

function fabPartita(overrides: Partial<Partita>): Partita {
  return {
    id: 'p',
    carrieraId: 'car',
    competizioneId: 'comp',
    giornata: 1,
    casa: 'a',
    trasferta: 'b',
    golCasa: 0,
    golTrasferta: 0,
    marcatori: [],
    giocata: false,
    ...overrides,
  };
}

function fabPromessa(overrides: Partial<Promessa>): Promessa {
  return {
    id: 'pr',
    tipo: 'titolare',
    testo: 'Sarai titolare',
    creata: 1,
    scadenza: 5,
    soglia: 50,
    stato: 'attiva',
    ...overrides,
  };
}

// ---------- Funzioni pure ----------

function testPure(): void {
  // Media pesata: leader ×1,5
  const a = fabGiocatore({ id: 'a', morale: 40, leader: true });
  const b = fabGiocatore({ id: 'b', morale: 60 });
  check('moraleSpogliatoio: leader pesa ×1,5', moraleSpogliatoio([a, b]) === 48, String(moraleSpogliatoio([a, b])));
  check('fasciaSpogliatoio: 48 = teso', fasciaSpogliatoio(48) === 'teso');
  check('fasciaSpogliatoio: 30 = crisi', fasciaSpogliatoio(30) === 'crisi');
  check('fasciaSpogliatoio: 70 = sereno', fasciaSpogliatoio(70) === 'sereno');

  const crisi1 = fabGiocatore({ id: 'c', morale: 29 });
  check('giocatoriInCrisi: morale < 30', giocatoriInCrisi([a, b, crisi1]).length === 1);

  // Effetti referto: titolare +5, marcatore +7 cumulativo, panchina promesso −2, infortunato esente
  const promesso = fabGiocatore({ id: 'promesso', promesse: [fabPromessa()] });
  const infortunato = fabGiocatore({ id: 'infortunato', promesse: [fabPromessa()], infortunioFinoA: 5 });
  const titolare = fabGiocatore({ id: 'titolare' });
  const marcatore = fabGiocatore({ id: 'marcatore' });
  const deltas = effettiMoraleReferto({
    giocatori: [titolare, marcatore, promesso, infortunato],
    titolari: ['titolare', 'marcatore'],
    marcatori: ['marcatore'],
    vittoria: true,
    pareggio: false,
    settimana: 4,
  });
  check(
    'effettiMoraleReferto: vittoria +5 titolare, +7 marcatore, −2 promesso, 0 infortunato',
    deltas.get('titolare') === EFFETTO_VITTORIA_MORALE &&
      deltas.get('marcatore') === EFFETTO_VITTORIA_MORALE + BONUS_MARCATORE_MORALE &&
      deltas.get('promesso') === PANCHINA_PROMESSO_MORALE &&
      deltas.get('infortunato') === undefined,
    [...deltas.entries()].map(([k, v]) => `${k}:${v}`).join(', '),
  );

  // Valutazione promesse: mantenuta (3/5 presenze ≥ 50%) e tradita (180 < 450 min)
  const p1 = fabGiocatore({
    id: 'p1',
    promesse: [fabPromessa({ id: 'pr1', tipo: 'titolare', creata: 1, scadenza: 5, soglia: 50 })],
  });
  const p2 = fabGiocatore({
    id: 'p2',
    promesse: [fabPromessa({ id: 'pr2', tipo: 'minuti', creata: 1, scadenza: 5, soglia: 450 })],
  });
  const partite: Partita[] = [1, 2, 3, 4, 5].map((g) =>
    fabPartita({ id: `m${g}`, giornata: g, giocata: true, titolari: g <= 3 ? ['p1'] : [] }),
  );
  const val = valutaPromesseScadute([p1, p2], partite, 5);
  const esito1 = val.giocatori.find((g) => g.id === 'p1');
  const esito2 = val.giocatori.find((g) => g.id === 'p2');
  const cons1 = val.conseguenze.get('p1');
  const cons2 = val.conseguenze.get('p2');
  check(
    'valutaPromesseScadute: 3/5 presenze = mantenuta (+4 morale, +6 fiducia)',
    esito1?.promesse[0]?.stato === 'mantenuta' &&
      cons1?.morale === PROMESSA_MANTENUTA_MORALE &&
      cons1?.fiducia === PROMESSA_MANTENUTA_FIDUCIA,
    `${esito1?.promesse[0]?.stato} ${JSON.stringify(cons1)}`,
  );
  check(
    'valutaPromesseScadute: 2 partite × 90 = 180 min < 450 = tradita (−6, −12)',
    esito2?.promesse[0]?.stato === 'tradita' &&
      cons2?.morale === PROMESSA_TRADITA_MORALE &&
      cons2?.fiducia === PROMESSA_TRADITA_FIDUCIA,
    `${esito2?.promesse[0]?.stato} ${JSON.stringify(cons2)}`,
  );
  // Nessuna partita nella finestra: non punire (mantenuta)
  const p3 = fabGiocatore({ id: 'p3', promesse: [fabPromessa({ id: 'pr3', creata: 10, scadenza: 12 })] });
  const val3 = valutaPromesseScadute([p3], partite, 12);
  check('valutaPromesseScadute: finestra senza partite = mantenuta', val3.giocatori[0]?.promesse[0]?.stato === 'mantenuta');

  // Candidato richiesta: overall alto + minuti sotto attesa
  const top = fabGiocatore({ id: 'top', nome: 'Top', overall: 82, minutiStagione: 0 });
  const medio = fabGiocatore({ id: 'medio', nome: 'Medio', overall: 76, minutiStagione: 0 });
  const riserva = fabGiocatore({ id: 'riserva', nome: 'Riserva', overall: 60, minutiStagione: 0 });
  const base = { giocatori: [top, medio, riserva], settimana: 3, partiteGiocateSquadra: 2, richiesteRecenti: new Set<Id>(), pendingEsistente: false };
  const cand = candidatoRichiestaPromessa(base);
  check(
    'candidatoRichiestaPromessa: top overall, tipo titolare, preset 50/5',
    cand?.giocatoreId === 'top' && cand.tipo === 'titolare' && cand.soglia === 50 && cand.durataTurni === 5,
    JSON.stringify(cand),
  );
  check('candidatoRichiestaPromessa: pending blocca', candidatoRichiestaPromessa({ ...base, pendingEsistente: true }) === null);
  const conCooldown = candidatoRichiestaPromessa({ ...base, richiesteRecenti: new Set(['top']) });
  check(
    'candidatoRichiestaPromessa: cooldown → secondo candidato, tipo minuti',
    conCooldown?.giocatoreId === 'medio' && conCooldown.tipo === 'minuti',
    JSON.stringify(conCooldown),
  );
  check('candidatoRichiestaPromessa: 0 partite = nessun candidato', candidatoRichiestaPromessa({ ...base, partiteGiocateSquadra: 0 }) === null);

  // Scelta leader al bootstrap: veterani ≥ 26 per overall, poi riempimento
  const rosaLeader = [
    fabGiocatore({ id: 'v1', eta: 30, overall: 70 }),
    fabGiocatore({ id: 'v2', eta: 28, overall: 80 }),
    fabGiocatore({ id: 'v3', eta: 27, overall: 85 }),
    fabGiocatore({ id: 'g1', eta: 25, overall: 90 }),
    fabGiocatore({ id: 'g2', eta: 20, overall: 95 }),
  ];
  const leader = scegliLeader(rosaLeader, LEADER_MAX);
  check(
    'scegliLeader: 3 veterani per overall (70/80/85), i giovani no',
    JSON.stringify(leader) === JSON.stringify(['v3', 'v2', 'v1']),
    leader.join(','),
  );
  const pochiVeterani = [
    fabGiocatore({ id: 'v1', eta: 30, overall: 70 }),
    fabGiocatore({ id: 'g1', eta: 25, overall: 90 }),
    fabGiocatore({ id: 'g2', eta: 20, overall: 95 }),
  ];
  const leader2 = scegliLeader(pochiVeterani, LEADER_MAX);
  check(
    'scegliLeader: riempimento per overall se veterani insufficienti',
    JSON.stringify(leader2) === JSON.stringify(['v1', 'g2', 'g1']),
    leader2.join(','),
  );
}

// ---------- Flusso DB (carriera demo) ----------

async function testDb(): Promise<void> {
  await seedDemo({ force: true });
  const carriera = (await db.carriere.toArray())[0];
  const squadra = carriera ? await db.squadre.get(carriera.squadraId) : undefined;
  if (!carriera || !squadra) throw new Error('Carriera demo assente');
  const rosa = await rosaDellaCarriera(carriera.id, squadra.id);
  const competizione = (await db.competizioni.toArray())[0];

  // Leader al bootstrap: esattamente LEADER_MAX sulla rosa utente
  const leaderRosa = rosa.filter((g) => g.leader);
  check(
    `bootstrap: ${LEADER_MAX} leader assegnati, tutti veterani se possibile`,
    leaderRosa.length === LEADER_MAX && leaderRosa.every((g) => g.eta >= 26),
    leaderRosa.map((g) => `${g.nome} (${g.eta}, ${g.overall})`).join(', '),
  );

  // Conferma giornata 1 (vittoria 2-1): morale titolari +5, marcatori +7, snapshot
  const xi1 = xiDefault(rosa);
  const moralePrima = new Map(rosa.map((g) => [g.id, g.morale]));
  let prossima = await prossimaPartita(squadra.id, competizione.id);
  if (!prossima) throw new Error('Nessuna partita');
  const marcatori = xi1.slice(0, 2);
  const esito1 = await confermaReferto({
    carrieraId: carriera.id,
    partitaId: prossima.id,
    golMiei: 2,
    golAvversario: 1,
    marcatori,
    titolari: xi1,
    infortunati: [],
    prestazioniEccezionali: [],
    espulsi: [],
  });
  const titolarePuro = xi1.find((id) => !marcatori.includes(id));
  const dopo1 = await db.giocatori.bulkGet([...xi1]);
  const mTitolare = titolarePuro ? dopo1.find((g) => g?.id === titolarePuro) : undefined;
  const mMarcatore = dopo1.find((g) => g?.id === marcatori[0]);
  check(
    'referto: titolare +5 dopo vittoria',
    mTitolare !== undefined && mTitolare.morale === moralePrima.get(titolarePuro ?? '')! + EFFETTO_VITTORIA_MORALE,
    `${moralePrima.get(titolarePuro ?? '')} → ${mTitolare?.morale}`,
  );
  check(
    'referto: marcatore +7 cumulativo',
    mMarcatore !== undefined && mMarcatore.morale === moralePrima.get(marcatori[0]!)! + EFFETTO_VITTORIA_MORALE + BONUS_MARCATORE_MORALE,
    `${moralePrima.get(marcatori[0]!)} → ${mMarcatore?.morale}`,
  );
  check(
    'referto: snapshot statoPrima con giocatori toccati',
    esito1.partita.statoPrima !== undefined &&
      esito1.partita.statoPrima.giocatori[marcatori[0]!] !== undefined &&
      esito1.partita.statoPrima.eventiCreati.length === 0,
    `eventiCreati: ${esito1.partita.statoPrima?.eventiCreati.length}`,
  );

  // Conferma giornata 2: nasce la richiesta promessa (1 partita giocata, riserve under 75+ a 0 minuti)
  prossima = await prossimaPartita(squadra.id, competizione.id);
  if (!prossima) throw new Error('Nessuna partita 2');
  const xi2 = xiDefault(rosa);
  await confermaReferto({
    carrieraId: carriera.id,
    partitaId: prossima.id,
    golMiei: 1,
    golAvversario: 1,
    marcatori: [],
    titolari: xi2,
    infortunati: [],
    prestazioniEccezionali: [],
    espulsi: [],
  });
  const eventi = await db.eventi.where('carrieraId').equals(carriera.id).toArray();
  const richiesta = eventi.find((e) => e.promessaProposta !== undefined && e.sceltaFatta === undefined);
  check(
    'richiesta: evento con promessaProposta creato dal candidato',
    richiesta?.promessaProposta !== undefined,
    richiesta ? `${richiesta.promessaProposta?.giocatoreId} ${richiesta.promessaProposta?.tipo}` : 'nessuna richiesta',
  );

  // Accetta la richiesta → promessa attiva con parametri dell'engine
  if (richiesta?.promessaProposta) {
    const idCandidato = richiesta.promessaProposta.giocatoreId;
    const tipoProposto = richiesta.promessaProposta.tipo;
    await decidiRichiestaPromessa(richiesta.id, 0);
    const candidato = await db.giocatori.get(idCandidato);
    const attiva = candidato?.promesse.find((p) => p.stato === 'attiva');
    check(
      'decisione: accetta crea promessa attiva con parametri proposti',
      candidato !== undefined &&
        promesseAttive(candidato) === 1 &&
        attiva?.tipo === tipoProposto &&
        attiva?.scadenza === attiva.creata + 5 - 1,
      JSON.stringify(attiva),
    );
    const eventoDeciso = await db.eventi.get(richiesta.id);
    check('decisione: evento marcato sceltaFatta=0', eventoDeciso?.sceltaFatta === 0 && eventoDeciso.effettiApplicati === true);

    // Promessa di 5 turni (3→7) ma la lega demo ha solo 6 giornate: la scadenza
    // 7 non verrebbe mai valutata. La accorcio a 6 direttamente sul DB (come una
    // durata 3): valutata al referto della giornata 6 (scadenza ≤ settimana).
    await db.giocatori.put({
      ...(await db.giocatori.get(idCandidato))!,
      promesse: [
        ...(await db.giocatori.get(idCandidato))!.promesse.map((p) =>
          p.stato === 'attiva' ? { ...p, scadenza: 6 } : p,
        ),
      ],
    });
    // Gioca 4 partite (3-6) senza schierarlo: nessun malus panchina (promessa
    // minuti), tradita a scadenza alla giornata 6 (0 min < 450).
    const base = await db.giocatori.get(idCandidato);
    const moraleBase = base?.morale ?? 50;
    const fiduciaBase = base?.fiducia ?? 50;
    const malusPanchina = tipoProposto === 'titolare' ? PANCHINA_PROMESSO_MORALE : 0;
    for (let g = 3; g <= 6; g++) {
      const p = await prossimaPartita(squadra.id, competizione.id);
      if (!p) throw new Error(`Nessuna partita ${g}`);
      let xi = xiDefault(rosa);
      if (xi.includes(idCandidato)) {
        const sostituto = rosa.find(
          (r) => !xi.includes(r.id) && r.id !== idCandidato && r.infortunioFinoA === undefined,
        );
        xi = xi.map((id) => (id === idCandidato ? (sostituto?.id ?? id) : id));
      }
      await confermaReferto({
        carrieraId: carriera.id,
        partitaId: p.id,
        golMiei: 1,
        golAvversario: 0,
        marcatori: [],
        titolari: xi,
        infortunati: [],
        prestazioniEccezionali: [],
        espulsi: [],
      });
    }
    const dopoScadenza = await db.giocatori.get(idCandidato);
    const tradita = dopoScadenza?.promesse.find((p) => p.stato === 'tradita');
    const attese = {
      morale: moraleBase + malusPanchina * 4 + PROMESSA_TRADITA_MORALE,
      fiducia: fiduciaBase + PROMESSA_TRADITA_FIDUCIA,
    };
    check(
      `promessa: tradita a scadenza (${malusPanchina * 4} panchina + ${PROMESSA_TRADITA_MORALE} morale, ${PROMESSA_TRADITA_FIDUCIA} fiducia)`,
      tradita !== undefined &&
        dopoScadenza?.morale === attese.morale &&
        dopoScadenza?.fiducia === attese.fiducia,
      `${moraleBase}/${fiduciaBase} → ${dopoScadenza?.morale}/${dopoScadenza?.fiducia} (atteso ${attese.morale}/${attese.fiducia})`,
    );
    // Bersaglio del rollback: valori dopo la giornata 5 (prima della 6)
    const bersaglioRollback = {
      morale: (dopoScadenza?.morale ?? 0) - malusPanchina - PROMESSA_TRADITA_MORALE,
      fiducia: (dopoScadenza?.fiducia ?? 0) - PROMESSA_TRADITA_FIDUCIA,
    };

    // Rollback della giornata 6: promessa torna attiva, morale/fiducia ripristinati
    const ultima = await db.partite
      .where('competizioneId')
      .equals(competizione.id)
      .toArray();
    const partita6 = ultima.find((p) => p.giornata === 6 && (p.casa === squadra.id || p.trasferta === squadra.id));
    if (partita6) {
      await annullaReferto({ carrieraId: carriera.id, partitaId: partita6.id });
      const ripristinato = await db.giocatori.get(idCandidato);
      const attivaDiNuovo = ripristinato?.promesse.find((p) => p.stato === 'attiva');
      check(
        'annulla: promessa riattivata e morale/fiducia ripristinati',
        attivaDiNuovo !== undefined &&
          ripristinato?.morale === bersaglioRollback.morale &&
          ripristinato?.fiducia === bersaglioRollback.fiducia,
        `atteso ${bersaglioRollback.morale}/${bersaglioRollback.fiducia} → ${ripristinato?.morale}/${ripristinato?.fiducia}`,
      );
      const eventi6 = (await db.eventi.where('carrieraId').equals(carriera.id).toArray()).filter(
        (e) => e.promessaProposta && e.settimana === 6,
      );
      check('annulla: eventi creati alla giornata 6 cancellati', eventi6.length === 0, String(eventi6.length));
      const partitaSenzaSnapshot = await db.partite.get(partita6.id);
      check('annulla: snapshot rimosso dalla partita', partitaSenzaSnapshot?.statoPrima === undefined);
    }
  }

  // setLeader: vincoli min/max
  const leader1 = leaderRosa[0];
  const leader2 = leaderRosa[1];
  const nonLeader = rosa.find((g) => !g.leader);
  if (leader1 && leader2 && nonLeader) {
    await setLeader(leader1.id, false);
    const dopoRevoca = (await db.giocatori.get(leader1.id))?.leader;
    check('setLeader: revoca ok a 3 leader', dopoRevoca === false);
    let erroreMin = '';
    try {
      await setLeader(leader2.id, false); // 2 → sotto LEADER_MIN
    } catch (e) {
      erroreMin = e instanceof Error ? e.message : 'err';
    }
    check('setLeader: bloccato sotto LEADER_MIN', erroreMin.length > 0, erroreMin);
    await setLeader(leader1.id, true);
    let erroreMax = '';
    try {
      await setLeader(nonLeader.id, true);
    } catch (e) {
      erroreMax = e instanceof Error ? e.message : 'err';
    }
    const leaderDopo = (await rosaDellaCarriera(carriera.id, squadra.id)).filter((g) => g.leader);
    check('setLeader: bloccato sopra LEADER_MAX', erroreMax.length > 0 && leaderDopo.length === LEADER_MAX, String(leaderDopo.length));
  }

  // Creazione manuale promessa: limite attive (su un giocatore senza promesse)
  const nonLeader2 = rosa.find((g) => !g.leader && g.infortunioFinoA === undefined && promesseAttive(g) === 0);
  if (nonLeader2) {
    await creaPromessa(nonLeader2.id, 'minuti');
    await creaPromessa(nonLeader2.id, 'titolare');
    let erroreLimite = '';
    try {
      await creaPromessa(nonLeader2.id, 'minuti');
    } catch (e) {
      erroreLimite = e instanceof Error ? e.message : 'err';
    }
    const dopo = await db.giocatori.get(nonLeader2.id);
    check(
      'creaPromessa: max 2 attive',
      erroreLimite.length > 0 && promesseAttive(dopo ?? nonLeader2) === 2,
      `attive: ${dopo ? promesseAttive(dopo) : '?'}`,
    );
    const stato = await db.statoClub.get(carriera.id);
    const scadenzaAttesa = (stato?.settimanaCorrente ?? 0) + PROMESSA_DURATA_DEFAULT - 1;
    const minuti = dopo?.promesse.find((p) => p.tipo === 'minuti' && p.stato === 'attiva');
    check(
      'creaPromessa: preset minuti 450, finestra 5 turni',
      minuti?.soglia === 450 && minuti.scadenza === scadenzaAttesa,
      JSON.stringify(minuti),
    );
  }

  // Rifiuto richiesta: −2 morale / −3 fiducia (evento sintetico pendente)
  const bersaglio = rosa.find((g) => g.infortunioFinoA === undefined && promesseAttive(g) < 2);
  if (bersaglio) {
    const eventoRifiuto = {
      id: 'ev-rifiuto-test',
      carrieraId: carriera.id,
      settimana: (await db.statoClub.get(carriera.id))?.settimanaCorrente ?? 1,
      categoria: 'giocatore' as const,
      tipo: 'scenario_emergente' as const,
      titolo: 'Richiesta di colloquio',
      testo: 'Test rifiuto',
      giocatoriCoinvolti: [bersaglio.nome],
      opzioni: [],
      promessaProposta: { giocatoreId: bersaglio.id, tipo: 'minuti', soglia: 450, durataTurni: 5 },
      effettiApplicati: false,
    };
    await db.eventi.add(eventoRifiuto);
    const prima = await db.giocatori.get(bersaglio.id);
    const moraleIniziale = prima?.morale ?? 50;
    const fiduciaIniziale = prima?.fiducia ?? 50;
    await decidiRichiestaPromessa(eventoRifiuto.id, 1);
    const dopo = await db.giocatori.get(bersaglio.id);
    check(
      'decisione: rifiuto applica −2 morale / −3 fiducia',
      dopo?.morale === moraleIniziale + RIFIUTO_RICHIESTA_MORALE && dopo?.fiducia === fiduciaIniziale + RIFIUTO_RICHIESTA_FIDUCIA,
      `${moraleIniziale}/${fiduciaIniziale} → ${dopo?.morale}/${dopo?.fiducia}`,
    );
    const eventoDopo = await db.eventi.get(eventoRifiuto.id);
    check('decisione: evento rifiuto marcato sceltaFatta=1', eventoDopo?.sceltaFatta === 1 && eventoDopo.effettiApplicati === true);
  } else {
    console.log('SKIP decisione rifiuto — nessun bersaglio');
  }
}

async function main(): Promise<void> {
  testPure();
  await testDb();
  console.log(falliti === 0 ? '\nTUTTI I TEST PASSANO' : `\n${falliti} TEST FALLITI`);
  process.exit(falliti === 0 ? 0 : 1);
}

void main();
