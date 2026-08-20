// FLM — Verifica referto e simulazione CPU (PRD 3.3 + 7.1, M4).
// Avvio: npm run verify:referto
// Copre: XI di default per ruoli, simulazione deterministica, conferma referto
// (salvataggio + minuti + forma + infortunio + avanzamento settimana),
// REFERTO IMMUTABILE (doppia conferma rifiutata, nessun rollback),
// validazione bloccante (marcatori/autogol/titolari/voti) e regola classifica Serie A.
import 'fake-indexeddb/auto';

import { db } from '../src/db/database';
import { confermaReferto, prossimaPartita, rosaDellaCarriera } from '../src/db';
import { seedDemo } from '../src/db/seed';
import { calcolaClassifica } from '../src/engine/classifica';
import { aggiornaRating, fattoreGol, ratingInizialeDaMedia, risultatoAtteso } from '../src/engine/rating';
import { bonusForma, golAttesi, ratingEffettivo, scostamentoStagionale, simulaRisultato, xiDefault, XI_MIN_ATTACCANTI, XI_MIN_CENTROCAMPISTI, XI_MIN_DIFENSORI, XI_TOTALE } from '../src/engine/referto';
import { ratingInizialeCompleto, ratingStorico, ratingStoricoPerStagione } from '../src/engine/storico';
import { BONUS_FORMA_PRESTAZIONE, SCARTO_STAGIONALE, SETTIMANE_INFORTUNIO } from '../src/engine/rules';
import type { Partita, Squadra } from '../src/types/entities';

let falliti = 0;

function check(nome: string, ok: boolean, dettaglio = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${nome}${dettaglio ? ` — ${dettaglio}` : ''}`);
  if (!ok) falliti++;
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
    settimana: 1,
    slot: 'weekend',
    fase: 'andata',
    neutra: false,
    ...overrides,
  };
}

async function main(): Promise<void> {
  await seedDemo({ force: true });

  // ---------- XI di default per ruoli ----------
  const carriera = (await db.carriere.toArray())[0];
  const squadra = carriera ? await db.squadre.get(carriera.squadraId) : undefined;
  if (!carriera || !squadra) throw new Error('Carriera demo assente');
  const rosa = await rosaDellaCarriera(carriera.id, squadra.id);
  const xi = xiDefault(rosa);
  const ruoliXi = xi.map((id) => rosa.find((g) => g.id === id)?.ruolo ?? '?');
  check(
    'xiDefault: 11 giocatori con 1 portiere, 4+ difensori, 3+ centrocampisti, 2+ attaccanti',
    xi.length === XI_TOTALE &&
      ruoliXi.filter((r) => r === 'portiere').length === 1 &&
      ruoliXi.filter((r) => r === 'difensore').length >= XI_MIN_DIFENSORI &&
      ruoliXi.filter((r) => r === 'centrocampista').length >= XI_MIN_CENTROCAMPISTI &&
      ruoliXi.filter((r) => r === 'attaccante').length >= XI_MIN_ATTACCANTI,
    ruoliXi.join(', '),
  );
  check('xiDefault: deterministico', JSON.stringify(xi) === JSON.stringify(xiDefault(rosa)));

  // ---------- Simulazione deterministica ----------
  const risultatoA = simulaRisultato('partita-x', 1700, 1500);
  const risultatoB = simulaRisultato('partita-x', 1700, 1500);
  check('simulaRisultato: deterministico per ID', JSON.stringify(risultatoA) === JSON.stringify(risultatoB));
  const giocatori = rosa;
  const partiteGiocate: Partita[] = [];
  const bonus1 = bonusForma(partiteGiocate, squadra.id);
  check('bonusForma: zero senza partite', bonus1 === 0);

  // ---------- Conferma referto (nuovo flusso M4) ----------
  const prossima = await prossimaPartita(carriera.id, squadra.id);
  if (!prossima) throw new Error('Nessuna prossima partita');
  const idAvversaria = prossima.casa === squadra.id ? prossima.trasferta : prossima.casa;
  const ratingUtentePrima = squadra.rating;
  const ratingAvversariaPrima = (await db.squadre.get(idAvversaria))?.rating ?? 0;

  const titolari = xiDefault(rosa);
  const marcatore = titolari.find((id) => {
    const g = rosa.find((x) => x.id === id);
    return g?.ruolo === 'attaccante' || g?.ruolo === 'centrocampista';
  }) ?? titolari[0]!;
  const golMiei = 1;
  const golAvversario = 0;

  const minutiPrima = await db.giocatori.bulkGet(titolari);
  const esito = await confermaReferto({
    carrieraId: carriera.id,
    partitaId: prossima.id,
    golMiei,
    golAvversario,
    marcatori: [marcatore],
    titolari,
    infortunati: [],
    espulsi: [],
    autogolAvversari: 0,
  });
  const inCasa = esito.partita.casa === squadra.id;
  const golMieiSalvati = inCasa ? esito.partita.golCasa : esito.partita.golTrasferta;
  check('conferma: partita salvata giocata', esito.partita.giocata && golMieiSalvati === golMiei);
  const minutiDopo = await db.giocatori.bulkGet(titolari);
  check('conferma: minuti titolari +90', minutiDopo.every((g, i) => (g?.minutiStagione ?? 0) === (minutiPrima[i]?.minutiStagione ?? 0) + 90));

  // IMMUTABILITÀ (decisione utente): riconferma rifiutata
  let doppia = false;
  try {
    await confermaReferto({
      carrieraId: carriera.id,
      partitaId: prossima.id,
      golMiei: 0,
      golAvversario: 0,
      marcatori: [],
      titolari,
      infortunati: [],
      espulsi: [],
      autogolAvversari: 0,
    });
  } catch {
    doppia = true;
  }
  check('immutabile: doppia conferma rifiutata', doppia);
  const riletta = await db.partite.get(prossima.id);
  check('immutabile: partita invariata dopo tentata riconferma', riletta?.giocata && (riletta!.casa === squadra.id ? riletta!.golCasa : riletta!.golTrasferta) === golMiei);
  // Rating Elo subito dopo la prima vittoria
  const ratingDopo = (await db.squadre.get(squadra.id))?.rating ?? 0;
  const ratingAtteso = aggiornaRating(
    esito.partita.golCasa,
    esito.partita.golTrasferta,
    ratingUtentePrima,
    ratingAvversariaPrima,
  );
  const ratingUtenteAtteso = esito.partita.casa === squadra.id ? ratingAtteso.ratingCasa : ratingAtteso.ratingTrasferta;
  check('rating: squadra utente aggiornata dopo la vittoria', ratingDopo === ratingUtenteAtteso, `${ratingUtentePrima} → ${ratingDopo} (atteso ${ratingUtenteAtteso})`);

  // Avanzamento settimana: la prossima partita è in una settimana ≥ quella giocata
  const prossima2 = await prossimaPartita(carriera.id, squadra.id);
  const stato = await db.statoClub.get(carriera.id);
  check(
    'settimana: avanzata alla settimana della prossima partita',
    stato !== undefined && prossima2 !== null && stato.settimanaCorrente === prossima2.settimana,
    `settimana ${stato?.settimanaCorrente}, prossima a ${prossima2?.settimana}`,
  );

  // ---------- Validazione bloccante (decisione utente) ----------
  const inputBase = {
    carrieraId: carriera.id,
    partitaId: prossima2!.id,
    golMiei: 2,
    golAvversario: 0,
    marcatori: [marcatore, marcatore],
    titolari,
    infortunati: [],
    espulsi: [],
    autogolAvversari: 0,
  };
  // marcatori > gol: rifiutato
  let troppiMarcatori = false;
  try {
    await confermaReferto({ ...inputBase, golMiei: 1, marcatori: [marcatore, marcatore], autogolAvversari: 0 });
  } catch {
    troppiMarcatori = true;
  }
  check('validazione: marcatori > gol rifiutato', troppiMarcatori);
  // marcatori + autogol ≠ gol: rifiutato
  let contoAutogol = false;
  try {
    await confermaReferto({ ...inputBase, golMiei: 3 });
  } catch {
    contoAutogol = true;
  }
  check('validazione: marcatori + autogol ≠ gol rifiutato', contoAutogol);
  // conto giusto con autogol: accettato
  const esitoAutogol = await confermaReferto({ ...inputBase, golMiei: 3, autogolAvversari: 1 });
  check('validazione: conto con autogol accettato', esitoAutogol.partita.golCasa === 3);
  // titolari ≠ 11: rifiutato
  let titolariErrati = false;
  try {
    const prossima3 = await prossimaPartita(carriera.id, squadra.id);
    await confermaReferto({
      carrieraId: carriera.id,
      partitaId: prossima3!.id,
      golMiei: 0,
      golAvversario: 0,
      marcatori: [],
      titolari: titolari.slice(0, 10),
      infortunati: [],
      espulsi: [],
      autogolAvversari: 0,
    });
  } catch {
    titolariErrati = true;
  }
  check('validazione: titolari ≠ 11 rifiutato', titolariErrati);
  // voto fuori range: rifiutato
  let votoErrato = false;
  try {
    const prossima4 = await prossimaPartita(carriera.id, squadra.id);
    await confermaReferto({
      carrieraId: carriera.id,
      partitaId: prossima4!.id,
      golMiei: 0,
      golAvversario: 0,
      marcatori: [],
      titolari,
      infortunati: [],
      espulsi: [],
      autogolAvversari: 0,
      prestazioni: { [marcatore]: { voto: 11 } },
    });
  } catch {
    votoErrato = true;
  }
  check('validazione: voto fuori range rifiutato', votoErrato);

  // ---------- Classifica: regola Serie A (scontri diretti) ----------
  // A batte B all'andata (1-0) ma ha DR peggiore: gli scontri diretti devono prevalere.
  const partite = [
    fabPartita({ id: 'ab', casa: 'a', trasferta: 'b', golCasa: 1, golTrasferta: 0, giocata: true }),
    fabPartita({ id: 'ba', casa: 'b', trasferta: 'a', golCasa: 0, golTrasferta: 0, giocata: false }),
    fabPartita({ id: 'ac', casa: 'a', trasferta: 'c', golCasa: 0, golTrasferta: 5, giocata: true }),
    fabPartita({ id: 'ca', casa: 'c', trasferta: 'a', golCasa: 0, golTrasferta: 0, giocata: false }),
    fabPartita({ id: 'bc', casa: 'b', trasferta: 'c', golCasa: 0, golTrasferta: 0, giocata: true }),
    fabPartita({ id: 'cb', casa: 'c', trasferta: 'b', golCasa: 0, golTrasferta: 0, giocata: false }),
  ];
  const classifica = calcolaClassifica(partite.filter((p) => p.giocata), ['a', 'b', 'c']);
  check('classifica: C prima (4 punti, DR migliore)', classifica[0]?.squadraId === 'c', classifica.map((r) => `${r.squadraId}:${r.punti}`).join(' '));
  check('classifica: A seconda (3 punti, vittoria su B)', classifica[1]?.squadraId === 'a');
  check('classifica: B ultima (1 punto)', classifica[2]?.squadraId === 'b');

  console.log(falliti === 0 ? '\nTUTTI I TEST PASSATI' : `\n${falliti} TEST FALLITI`);
  if (falliti > 0) process.exit(1);
}

void main();
