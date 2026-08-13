// FLM — Verifica società, obiettivi & fiducia (PRD 3.2, M2).
// Avvio: npm run verify:societa
// Copre: banda attesa Elo, striscia consecutiva, Δ fiducia società/tifosi dal
// referto (tabella × attesa + casa + strisce), target obiettivo per dimensione
// lega, barra avanzamento, stima fine stagione, e flusso DB: conferma referto
// che aggiorna StatoClub e rollback completo in annullaReferto.
import 'fake-indexeddb/auto';

import { db } from '../src/db/database';
import { seedDemo } from '../src/db/seed';
import { annullaReferto, confermaReferto, prossimaPartita, rosaDellaCarriera } from '../src/db/referti';
import {
  bandaAttesa,
  effettiFiduciaReferto,
  posizioneTarget,
  progressoObiettivo,
  stimaFineStagione,
  strisciaCorrente,
} from '../src/engine/societa';
import { FIDUCIA_SOCIETA_INIZIALE, FIDUCIA_TIFOSI_INIZIALE } from '../src/engine/rules';
import { xiDefault } from '../src/engine/referto';
import type { Partita } from '../src/types/entities';

let falliti = 0;

function check(nome: string, ok: boolean, dettaglio = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${nome}${dettaglio ? ` — ${dettaglio}` : ''}`);
  if (!ok) falliti++;
}

function fabPartita(giornata: number, golCasa: number, golTrasferta: number, casa: string, trasferta: string): Partita {
  return {
    id: `p${giornata}`,
    carrieraId: 'car',
    competizioneId: 'comp',
    giornata,
    casa,
    trasferta,
    golCasa,
    golTrasferta,
    marcatori: [],
    giocata: true,
  };
}

// ---------- Funzioni pure ----------

function testPure(): void {
  // Banda attesa: soglia ±100 Elo
  check('bandaAttesa: +150 = favorito', bandaAttesa(1600, 1450) === 'favorito');
  check('bandaAttesa: +100 = equilibrio (soglia inclusa)', bandaAttesa(1600, 1500) === 'equilibrio');
  check('bandaAttesa: −120 = sfavorito', bandaAttesa(1400, 1520) === 'sfavorito');
  check('bandaAttesa: 0 = equilibrio', bandaAttesa(1500, 1500) === 'equilibrio');

  // Striscia: V,V,P,P,P → −3; V,V,V → +3; N azzera
  const casa = 'mia';
  const trasf = 'avv';
  const mix = [fabPartita(1, 2, 0, casa, trasf), fabPartita(2, 1, 0, casa, trasf), fabPartita(3, 0, 1, casa, trasf), fabPartita(4, 0, 2, casa, trasf), fabPartita(5, 0, 1, casa, trasf)];
  check('strisciaCorrente: V,V,P,P,P = −3', strisciaCorrente(mix, casa) === -3, String(strisciaCorrente(mix, casa)));
  const treV = [fabPartita(1, 1, 0, casa, trasf), fabPartita(2, 2, 0, casa, trasf), fabPartita(3, 3, 1, casa, trasf)];
  check('strisciaCorrente: V,V,V = +3', strisciaCorrente(treV, casa) === 3, String(strisciaCorrente(treV, casa)));
  const conPareggio = [fabPartita(1, 2, 0, casa, trasf), fabPartita(2, 1, 1, casa, trasf)];
  check('strisciaCorrente: pareggio azzera', strisciaCorrente(conPareggio, casa) === 0, String(strisciaCorrente(conPareggio, casa)));
  check('strisciaCorrente: nessuna partita = 0', strisciaCorrente([], casa) === 0);

  // Δ società: risultato × attesa (vittoria da sfavorito +6, sconfitta da favorito −8)
  const vSfav = effettiFiduciaReferto({
    vittoria: true, pareggio: false, inCasa: true,
    ratingMio: 1400, ratingAvversario: 1600,
    partiteSquadra: [fabPartita(1, 2, 0, casa, trasf)], squadraId: casa,
  });
  check('Δ società: vittoria da sfavorito = +6', vSfav.fiduciaSocieta === 6, String(vSfav.fiduciaSocieta));
  const pFav = effettiFiduciaReferto({
    vittoria: false, pareggio: false, inCasa: false,
    ratingMio: 1600, ratingAvversario: 1400,
    partiteSquadra: [fabPartita(1, 0, 1, casa, trasf)], squadraId: casa,
  });
  check('Δ società: sconfitta da favorito = −8', pFav.fiduciaSocieta === -8, String(pFav.fiduciaSocieta));
  const nPar = effettiFiduciaReferto({
    vittoria: false, pareggio: true, inCasa: false,
    ratingMio: 1500, ratingAvversario: 1500,
    partiteSquadra: [fabPartita(1, 1, 1, casa, trasf)], squadraId: casa,
  });
  check('Δ società: pareggio in equilibrio = 0', nPar.fiduciaSocieta === 0, String(nPar.fiduciaSocieta));

  // Δ tifosi: sconfitte in casa e strisce
  const trePCasa = effettiFiduciaReferto({
    vittoria: false, pareggio: false, inCasa: true,
    ratingMio: 1500, ratingAvversario: 1500,
    partiteSquadra: [fabPartita(1, 0, 1, casa, trasf), fabPartita(2, 0, 1, casa, trasf), fabPartita(3, 0, 1, casa, trasf)],
    squadraId: casa,
  });
  // −3 base −3 casa −4 striscia (3ª consecutiva) = −10
  check('Δ tifosi: 3ª sconfitta in casa di fila = −10', trePCasa.fiduciaTifosi === -10, String(trePCasa.fiduciaTifosi));
  const cinqueV = effettiFiduciaReferto({
    vittoria: true, pareggio: false, inCasa: false,
    ratingMio: 1500, ratingAvversario: 1500,
    partiteSquadra: [1, 2, 3, 4, 5].map((g) => fabPartita(g, 1, 0, casa, trasf)),
    squadraId: casa,
  });
  // +4 base +3 striscia (5ª consecutiva, cap +3) = +7
  check('Δ tifosi: 5ª vittoria di fila = +7', cinqueV.fiduciaTifosi === 7, String(cinqueV.fiduciaTifosi));
  const capStriscia = effettiFiduciaReferto({
    vittoria: false, pareggio: false, inCasa: false,
    ratingMio: 1500, ratingAvversario: 1500,
    partiteSquadra: [1, 2, 3, 4, 5, 6, 7, 8].map((g) => fabPartita(g, 0, 1, casa, trasf)),
    squadraId: casa,
  });
  // −3 base −6 cap striscia (8ª consecutiva) = −9
  check('Δ tifosi: striscia sconfitte cappata a −6', capStriscia.fiduciaTifosi === -9, String(capStriscia.fiduciaTifosi));

  // Target obiettivo per dimensione lega
  check('target: titolo = 1', posizioneTarget('titolo', 20) === 1);
  check('target: coppe N=16 = 4', posizioneTarget('coppe', 16) === 4);
  check('target: coppe N=18 = 4', posizioneTarget('coppe', 18) === 4);
  check('target: coppe N=20 = 6', posizioneTarget('coppe', 20) === 6);
  check('target: coppe N=22 = 6', posizioneTarget('coppe', 22) === 6);
  check('target: meta N=20 = 10', posizioneTarget('meta_classifica', 20) === 10);
  check('target: salvezza N=20 = 17', posizioneTarget('salvezza', 20) === 17);

  // Barra avanzamento
  check('progresso: 0 partite = 0%', progressoObiettivo({ posizione: 1, giocate: 0, obiettivo: 'titolo', nSquadre: 20 }) === 0);
  check('progresso: 1ª col target titolo = 100%', progressoObiettivo({ posizione: 1, giocate: 10, obiettivo: 'titolo', nSquadre: 20 }) === 100);
  check('progresso: 5ª col target titolo = 79%', progressoObiettivo({ posizione: 5, giocate: 10, obiettivo: 'titolo', nSquadre: 20 }) === 79, String(progressoObiettivo({ posizione: 5, giocate: 10, obiettivo: 'titolo', nSquadre: 20 })));
  check('progresso: 10ª col target titolo = 53%', progressoObiettivo({ posizione: 10, giocate: 10, obiettivo: 'titolo', nSquadre: 20 }) === 53, String(progressoObiettivo({ posizione: 10, giocate: 10, obiettivo: 'titolo', nSquadre: 20 })));
  check('progresso: 20ª col target titolo = 0%', progressoObiettivo({ posizione: 20, giocate: 10, obiettivo: 'titolo', nSquadre: 20 }) === 0);
  check('progresso: 17ª col target salvezza = 100%', progressoObiettivo({ posizione: 17, giocate: 10, obiettivo: 'salvezza', nSquadre: 20 }) === 100);
  check('progresso: 18ª col target salvezza = 67%', progressoObiettivo({ posizione: 18, giocate: 10, obiettivo: 'salvezza', nSquadre: 20 }) === 67, String(progressoObiettivo({ posizione: 18, giocate: 10, obiettivo: 'salvezza', nSquadre: 20 })));

  // Stima fine stagione: ritmo punti su 38 giornate
  const classifica = [
    { squadraId: 'a', posizione: 1, giocate: 10, vinte: 8, pareggiate: 2, perse: 0, golFatti: 20, golSubiti: 5, differenzaReti: 15, punti: 26 },
    { squadraId: 'b', posizione: 2, giocate: 10, vinte: 7, pareggiate: 2, perse: 1, golFatti: 18, golSubiti: 8, differenzaReti: 10, punti: 23 },
    { squadraId: casa, posizione: 3, giocate: 10, vinte: 4, pareggiate: 3, perse: 3, golFatti: 12, golSubiti: 10, differenzaReti: 2, punti: 15 },
    { squadraId: 'c', posizione: 4, giocate: 10, vinte: 4, pareggiate: 2, perse: 4, golFatti: 10, golSubiti: 12, differenzaReti: -2, punti: 14 },
    { squadraId: 'd', posizione: 5, giocate: 10, vinte: 0, pareggiate: 1, perse: 9, golFatti: 4, golSubiti: 25, differenzaReti: -21, punti: 1 },
  ];
  const stima = stimaFineStagione({ squadraId: casa, classifica, giornateTotali: 38, obiettivo: 'coppe', nSquadre: 20 });
  check(
    'stima: 15 pt su 10 → 57 pt proiettati, 3ª, in traiettoria coppe',
    stima !== null && stima.puntiProiettati === 57 && stima.posizioneStimata === 3 && stima.inTraiettoria,
    JSON.stringify(stima),
  );
  check('stima: nessuna partita = null', stimaFineStagione({ squadraId: casa, classifica: classifica.map((r) => ({ ...r, giocate: 0, punti: 0 })), giornateTotali: 38, obiettivo: 'coppe', nSquadre: 20 }) === null);
}

// ---------- Flusso DB (carriera demo): conferma aggiorna la fiducia, annulla la ripristina ----------

async function testDb(): Promise<void> {
  await seedDemo({ force: true });
  const carriera = (await db.carriere.toArray())[0];
  const squadra = carriera ? await db.squadre.get(carriera.squadraId) : undefined;
  if (!carriera || !squadra) throw new Error('Carriera demo assente');
  const rosa = await rosaDellaCarriera(carriera.id, squadra.id);
  const competizione = (await db.competizioni.toArray())[0];

  let stato = await db.statoClub.get(carriera.id);
  check(
    'stato iniziale: fiducia società 70, tifosi 65',
    stato?.fiduciaSocieta === FIDUCIA_SOCIETA_INIZIALE && stato?.fiduciaTifosi === FIDUCIA_TIFOSI_INIZIALE,
    `${stato?.fiduciaSocieta}/${stato?.fiduciaTifosi}`,
  );
  const fiduciaPrima = { societa: stato?.fiduciaSocieta ?? 0, tifosi: stato?.fiduciaTifosi ?? 0 };

  // Giornata 1: vittoria 2-1 (Δ atteso dall'engine con i rating pre-partita)
  const xi1 = xiDefault(rosa);
  let prossima = await prossimaPartita(squadra.id, competizione.id);
  if (!prossima) throw new Error('Nessuna partita');
  const inCasa1 = prossima.casa === squadra.id;
  const avversarioId1 = inCasa1 ? prossima.trasferta : prossima.casa;
  const avversaria1 = await db.squadre.get(avversarioId1);
  const esito1 = await confermaReferto({
    carrieraId: carriera.id,
    partitaId: prossima.id,
    golMiei: 2,
    golAvversario: 1,
    marcatori: xi1.slice(0, 2),
    titolari: xi1,
    infortunati: [],
    prestazioniEccezionali: [],
    espulsi: [],
  });
  const atteso1 = effettiFiduciaReferto({
    vittoria: true,
    pareggio: false,
    inCasa: inCasa1,
    ratingMio: squadra.rating,
    ratingAvversario: avversaria1?.rating ?? 1500,
    partiteSquadra: [esito1.partita],
    squadraId: squadra.id,
  });
  stato = await db.statoClub.get(carriera.id);
  check(
    'referto: vittoria aggiorna fiducia società e tifosi come da engine',
    stato?.fiduciaSocieta === fiduciaPrima.societa + atteso1.fiduciaSocieta &&
      stato?.fiduciaTifosi === fiduciaPrima.tifosi + atteso1.fiduciaTifosi,
    `${fiduciaPrima.societa}→${stato?.fiduciaSocieta} (Δ ${atteso1.fiduciaSocieta}), ${fiduciaPrima.tifosi}→${stato?.fiduciaTifosi} (Δ ${atteso1.fiduciaTifosi})`,
  );
  const fiduciaDopo1 = { societa: stato?.fiduciaSocieta ?? 0, tifosi: stato?.fiduciaTifosi ?? 0 };
  check(
    'referto: snapshot clubFiducia salvato sulla partita',
    esito1.partita.statoPrima?.clubFiducia !== undefined &&
      esito1.partita.statoPrima.clubFiducia.fiduciaSocieta === fiduciaPrima.societa,
    JSON.stringify(esito1.partita.statoPrima?.clubFiducia),
  );

  // Giornata 2: sconfitta 0-2 in trasferta (striscia −1: nessuna penale extra)
  const xi2 = xiDefault(rosa);
  prossima = await prossimaPartita(squadra.id, competizione.id);
  if (!prossima) throw new Error('Nessuna partita 2');
  const inCasa2 = prossima.casa === squadra.id;
  const avversarioId2 = inCasa2 ? prossima.trasferta : prossima.casa;
  const avversaria2 = await db.squadre.get(avversarioId2);
  const esito2 = await confermaReferto({
    carrieraId: carriera.id,
    partitaId: prossima.id,
    golMiei: 0,
    golAvversario: 2,
    marcatori: [],
    titolari: xi2,
    infortunati: [],
    prestazioniEccezionali: [],
    espulsi: [],
  });
  const atteso2 = effettiFiduciaReferto({
    vittoria: false,
    pareggio: false,
    inCasa: inCasa2,
    ratingMio: squadra.rating,
    ratingAvversario: avversaria2?.rating ?? 1500,
    partiteSquadra: [esito1.partita, esito2.partita],
    squadraId: squadra.id,
  });
  stato = await db.statoClub.get(carriera.id);
  check(
    'referto: sconfitta aggiorna la fiducia (striscia −1 senza penale)',
    stato?.fiduciaSocieta === fiduciaDopo1.societa + atteso2.fiduciaSocieta &&
      stato?.fiduciaTifosi === fiduciaDopo1.tifosi + atteso2.fiduciaTifosi,
    `Δ atteso ${atteso2.fiduciaSocieta}/${atteso2.fiduciaTifosi}`,
  );

  // Rollback della giornata 2: la fiducia torna esattamente a dopo-la-1
  await annullaReferto({ carrieraId: carriera.id, partitaId: esito2.partita.id });
  stato = await db.statoClub.get(carriera.id);
  check(
    'annulla: fiducia società/tifosi ripristinata allo snapshot',
    stato?.fiduciaSocieta === fiduciaDopo1.societa && stato?.fiduciaTifosi === fiduciaDopo1.tifosi,
    `${stato?.fiduciaSocieta}/${stato?.fiduciaTifosi} (atteso ${fiduciaDopo1.societa}/${fiduciaDopo1.tifosi})`,
  );
}

// ---------- Main ----------

async function main(): Promise<void> {
  testPure();
  await testDb();
  if (falliti > 0) {
    console.log(`\n${falliti} verifica${falliti === 1 ? '' : 'e'} fallita${falliti === 1 ? '' : 'e'}.`);
    process.exit(1);
  }
  console.log('\nTutte le verifiche superate.');
}

void main();
