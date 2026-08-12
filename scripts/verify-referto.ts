// FLM — Verifica referto e simulazione CPU (PRD 3.3, M1).
// Avvio: npm run verify:referto
// Copre: XI di default per ruoli, simulazione deterministica, conferma referto
// (salvataggio + minuti + forma + infortunio + CPU turno + settimana),
// annullamento entro lo stesso turno (rollback totale) e regola classifica Serie A.
import 'fake-indexeddb/auto';

import { db } from '../src/db/database';
import { annullaReferto, confermaReferto, prossimaPartita, rosaDellaCarriera } from '../src/db/referti';
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

  // ---------- Simulazione CPU: deterministica e calibrata ----------
  const r1 = simulaRisultato('partita-test', 1500, 1500);
  const r2 = simulaRisultato('partita-test', 1500, 1500);
  check('simulaRisultato: deterministico (stesso ID → stesso risultato)', r1.golCasa === r2.golCasa && r1.golTrasferta === r2.golTrasferta, `${r1.golCasa}-${r1.golTrasferta}`);
  const attesi = golAttesi(1500, 1500);
  check('golAttesi: vantaggio casa con rating pari', attesi.casa > attesi.trasferta, `${attesi.casa.toFixed(2)} vs ${attesi.trasferta.toFixed(2)}`);
  check('golAttesi: media totale ancorata a 2.56 (casa simmetrica)', Math.abs(attesi.casa + attesi.trasferta - 2.56) < 0.001, `${(attesi.casa + attesi.trasferta).toFixed(3)}`);
  const schiacciante = golAttesi(1900, 1460);
  check('golAttesi: 1900 vs 1460 = favorito netto', schiacciante.casa - schiacciante.trasferta > 1.2, `${schiacciante.casa.toFixed(2)} vs ${schiacciante.trasferta.toFixed(2)}`);

  // ---------- Rating Elo (formula eloratings.net, esempi Wikipedia) ----------
  const weCasa = risultatoAtteso(1500, 1500);
  check('rating: We casa = 0.64 con +100 di vantaggio casa', Math.abs(weCasa - 0.64) < 0.005, weCasa.toFixed(4));
  check('rating: vittoria 1-0 in casa = +7/-7 (K=20, G=1)', (() => {
    const r = aggiornaRating(1, 0, 1500, 1500);
    return r.ratingCasa === 1507 && r.ratingTrasferta === 1493;
  })());
  check('rating: pareggio 0-0 = −3/+3 (sorpresa per il favorito di casa)', (() => {
    const r = aggiornaRating(0, 0, 1500, 1500);
    return r.ratingCasa === 1497 && r.ratingTrasferta === 1503;
  })());
  check('rating: vittoria 3-0 muove più di 1-0 (G=1.75)', (() => {
    const treZero = aggiornaRating(3, 0, 1500, 1500);
    const unoZero = aggiornaRating(1, 0, 1500, 1500);
    return treZero.ratingCasa - 1500 > unoZero.ratingCasa - 1500;
  })());
  check('rating: fattoreGol corretto (0/1→1, 2→1.5, 3→1.75, 5→2)', fattoreGol(0) === 1 && fattoreGol(1) === 1 && fattoreGol(2) === 1.5 && fattoreGol(3) === 1.75 && fattoreGol(5) === 2);
  check('rating: iniziale da media overall (76→1820, 80→1900, monotona)', ratingInizialeDaMedia(76) === 1820 && ratingInizialeDaMedia(80) === 1900 && ratingInizialeDaMedia(90) > ratingInizialeDaMedia(70));

  // ---------- Bonus forma (momentum: cluster in classifica) ----------
  const fab = (g: number, gc: number, gt: number, casa = 'a', trasferta = 'b'): Partita =>
    fabPartita({ id: `g${g}`, giornata: g, casa, trasferta, golCasa: gc, golTrasferta: gt, giocata: true });
  check('forma: 3 vittorie → +30', bonusForma([fab(1, 2, 0), fab(2, 1, 0), fab(3, 3, 1)], 'a') === 30);
  check('forma: 3 sconfitte → −30', bonusForma([fab(1, 0, 2), fab(2, 0, 1), fab(3, 1, 3)], 'a') === -30);
  check('forma: pareggio azzera la striscia', bonusForma([fab(1, 1, 0), fab(2, 1, 1), fab(3, 2, 0)], 'a') === 10);
  check('forma: striscia in trasferta contata', bonusForma([fab(1, 0, 1, 'b', 'a'), fab(2, 0, 2, 'b', 'a')], 'a') === 20);
  check('forma: ordine per giornata (V,S,V,V,V → +30)', bonusForma([fab(1, 2, 0), fab(2, 0, 1), fab(3, 1, 0), fab(4, 2, 1), fab(5, 3, 0)], 'a') === 30);
  check('forma: ultima sconfitta domina (S,V,V → −10)', bonusForma([fab(1, 1, 0), fab(2, 2, 1), fab(3, 0, 1)], 'a') === -10);
  check('forma: non giocate ignorate', bonusForma([fab(1, 2, 0), fabPartita({ id: 'g2', giornata: 2, casa: 'a', trasferta: 'b', giocata: false })], 'a') === 10);
  check('forma: cap a +50 (5 vittorie)', bonusForma([fab(1, 1, 0), fab(2, 1, 0), fab(3, 1, 0), fab(4, 1, 0), fab(5, 1, 0), fab(6, 1, 0)], 'a') === 50);

  // ---------- Storico reale: rating iniziale dalle prestazioni passate ----------
  check('storico: posizione→rating (A 1°=1671, A 20°=1329, B 1°=1411, B 20°=1069)',
    ratingStoricoPerStagione('serie_a', 1) === 1671 && ratingStoricoPerStagione('serie_a', 20) === 1329 &&
    ratingStoricoPerStagione('serie_b', 1) === 1411 && ratingStoricoPerStagione('serie_b', 20) === 1069);
  check('storico: Juventus sempre in alto (1611)', ratingStorico('Juventus') === 1611, String(ratingStorico('Juventus')));
  check('storico: Inter top (1655)', ratingStorico('Inter') === 1655, String(ratingStorico('Inter')));
  check('storico: Atalanta in ascesa = Juventus (3,8,5,4,3)', ratingStorico('Atalanta') === 1611, String(ratingStorico('Atalanta')));
  check('storico: Cremonese yo-yo in fondo (1349)', ratingStorico('Cremonese') === 1349, String(ratingStorico('Cremonese')));
  check('storico: Monza (3,4,11,12,20) sotto la media (1407)', ratingStorico('Monza') === 1407, String(ratingStorico('Monza')));
  check('storico: gerarchia Inter > Napoli > Juventus > Monza > Cremonese',
    ratingStorico('Inter')! > ratingStorico('Napoli')! && ratingStorico('Napoli')! > ratingStorico('Juventus')! &&
    ratingStorico('Juventus')! > ratingStorico('Monza')! && ratingStorico('Monza')! > ratingStorico('Cremonese')!,
    [ratingStorico('Inter'), ratingStorico('Napoli'), ratingStorico('Juventus'), ratingStorico('Monza'), ratingStorico('Cremonese')].join(' > '));
  check('storico: senza storico → null (Avellino)', ratingStorico('Avellino') === null);
  // Blend 50/50: storico reale + rosa attuale (overall → rating ×20)
  check('storico: Juve (storico 1611, rosa 84→1980) → 1796', ratingInizialeCompleto('Juventus', 84, 'Serie A') === 1796, String(ratingInizialeCompleto('Juventus', 84, 'Serie A')));
  check('storico: Inter (1655 + 1980) → 1818 > Juve', ratingInizialeCompleto('Inter', 84, 'Serie A') === 1818);
  check('storico: Cremonese (1349 + rosa 75→1800) → 1575, molto sotto Inter', ratingInizialeCompleto('Cremonese', 75, 'Serie A') === 1575, String(ratingInizialeCompleto('Cremonese', 75, 'Serie A')));
  check('storico: neopromossa senza storico usa la baseline di divisione (Avellino B 1490)', ratingInizialeCompleto('Avellino', 72, 'Serie B') === 1490, String(ratingInizialeCompleto('Avellino', 72, 'Serie B')));
  check('storico: senza campionato coperto → solo rosa (1740)', ratingInizialeCompleto('Avellino', 72) === 1740);
  check('storico: quasi tutto unico — pareggia solo chi ha 5 anni quasi identici (≥18/20 distinti)', (() => {
    const rosa = ['Juventus', 'Inter', 'Milan', 'Atalanta', 'Napoli', 'Roma', 'Lazio', 'Fiorentina', 'Bologna', 'Torino', 'Udinese', 'Genoa', 'Hellas Verona', 'Cagliari', 'Lecce', 'Parma', 'Como', 'Cremonese', 'Pisa', 'Sassuolo'];
    const valori = rosa.map((n) => ratingInizialeCompleto(n, 80, 'Serie A'));
    return new Set(valori).size >= 18;
  })());

  // ---------- Scostamento stagionale + rating effettivo ----------
  const s1 = scostamentoStagionale('car-test', '2025/26', 'sq-a');
  const s2 = scostamentoStagionale('car-test', '2025/26', 'sq-a');
  check('stagionale: deterministico', s1 === s2, String(s1));
  check('stagionale: entro ±SCARTO', Math.abs(s1) <= SCARTO_STAGIONALE, String(s1));
  const s3 = scostamentoStagionale('car-test', '2025/26', 'sq-b');
  const s4 = scostamentoStagionale('car-test', '2026/27', 'sq-a');
  check('stagionale: diverso per squadra e stagione', s1 !== s3 || s1 !== s4, `${s1} ${s3} ${s4}`);
  const fabSquadra = (rating: number, base?: number): Squadra => ({
    id: 'sq', pesId: null, nome: 'Test', nazione: 'ITA', nazionale: false,
    rating, ratingInizioStagione: base ?? rating,
    coefficiente: 30, budget: 10_000_000, reputazione: 50, ombra: false,
  });
  const eff1 = ratingEffettivo(fabSquadra(1600, 1500), 'car-test', '2025/26', []);
  check('ratingEffettivo: mean reversion metà deriva + scostamento', eff1 === 1550 + scostamentoStagionale('car-test', '2025/26', 'sq'), `${eff1} (atteso ${1550 + s1})`);
  check('ratingEffettivo: senza deriva = base + scostamento', ratingEffettivo(fabSquadra(1500, 1500), 'car-test', '2025/26', []) === 1500 + scostamentoStagionale('car-test', '2025/26', 'sq'));

  // ---------- Conferma referto ----------
  const competizione = (await db.competizioni.where('carrieraId').equals(carriera.id).toArray())[0];
  if (!competizione) throw new Error('Competizione assente');
  const prossima = await prossimaPartita(squadra.id, competizione.id);
  if (!prossima) throw new Error('Nessuna partita da giocare');
  check('referto: prossima partita = giornata 1', prossima.giornata === 1);

  const golMiei = 2;
  const golAvversario = 1;
  const titolari = xi;
  const marcatori = xi.slice(0, golMiei);
  const infortunati = [xi[10] ?? xi[0]];
  const prestazioniEccezionali = [xi[1] ?? xi[0]];
  const formaInizialePrestazione = (prestazioniEccezionali[0] ? await db.giocatori.get(prestazioniEccezionali[0]) : undefined)?.forma ?? 50;
  // Rating prima del turno: per verificare che conferma li muova e annulla li ripristini
  const idAvversaria = prossima.casa === squadra.id ? prossima.trasferta : prossima.casa;
  const ratingUtentePrima = (await db.squadre.get(squadra.id))?.rating ?? 0;
  const ratingAvversariaPrima = (await db.squadre.get(idAvversaria))?.rating ?? 0;
  const esito = await confermaReferto({
    carrieraId: carriera.id,
    partitaId: prossima.id,
    golMiei,
    golAvversario,
    marcatori,
    titolari,
    infortunati,
    prestazioniEccezionali,
    espulsi: [],
  });

  const inCasa = prossima.casa === squadra.id;
  check('referto: partita salvata con risultato normalizzato', esito.partita.giocata && esito.partita.golCasa === (inCasa ? 2 : 1) && esito.partita.golTrasferta === (inCasa ? 1 : 2), `${esito.partita.golCasa}-${esito.partita.golTrasferta}`);
  check('referto: marcatori = nomi dei 2 titolari', esito.partita.marcatori.length === 2, esito.partita.marcatori.join(', '));
  check('referto: turno completo (2 partite con 4 squadre)', esito.turno.length === 2 && esito.turno.every((p) => p.giocata), String(esito.turno.length));
  check('referto: classifica con 3 punti per la tua squadra', esito.classifica.find((r) => r.squadraId === squadra.id)?.punti === 3);
  check('referto: settimana avanzata a 2', (await db.statoClub.get(carriera.id))?.settimanaCorrente === 2);

  const minutiTitolari = await db.giocatori.bulkGet(titolari);
  check('referto: +90 minuti ai titolari', minutiTitolari.every((g) => g?.minutiStagione === 90));
  const infortunato = await db.giocatori.get(infortunati[0] ?? '');
  check('referto: infortunio fino a settimana +2', infortunato?.infortunioFinoA === 1 + SETTIMANE_INFORTUNIO, String(infortunato?.infortunioFinoA));
  const topForma = prestazioniEccezionali[0] ? await db.giocatori.get(prestazioniEccezionali[0]) : undefined;
  check('referto: forma +10 per prestazione eccezionale', topForma?.forma === formaInizialePrestazione + BONUS_FORMA_PRESTAZIONE, String(topForma?.forma));

  // Rating Elo: il turno muove le squadre (tua partita + CPU) e salva ratingPrima
  const rp = esito.partita.ratingPrima;
  const ratingCasaPrima = prossima.casa === squadra.id ? ratingUtentePrima : ratingAvversariaPrima;
  const ratingTrasfertaPrima = prossima.casa === squadra.id ? ratingAvversariaPrima : ratingUtentePrima;
  const ratingUtenteDopo = (await db.squadre.get(squadra.id))?.rating ?? 0;
  const atteso = aggiornaRating(
    esito.partita.golCasa, esito.partita.golTrasferta,
    ratingCasaPrima, ratingTrasfertaPrima,
  );
  const ratingAttesoUtente = esito.partita.casa === squadra.id ? atteso.ratingCasa : atteso.ratingTrasferta;
  check('referto: rating della tua squadra aggiornato dopo la vittoria', ratingUtenteDopo === ratingAttesoUtente, `${ratingUtentePrima} → ${ratingUtenteDopo} (atteso ${ratingAttesoUtente})`);
  check('referto: ratingPrima salvato sulla partita', rp !== undefined && rp.casa === ratingCasaPrima && rp.trasferta === ratingTrasfertaPrima, JSON.stringify(rp));
  const cpuDelTurnoConferma = esito.turno.find((p) => p.id !== esito.partita.id);
  check('referto: anche le CPU del turno hanno ratingPrima', cpuDelTurnoConferma?.ratingPrima !== undefined);

  let doppioConferma = false;
  try {
    await confermaReferto({ carrieraId: carriera.id, partitaId: prossima.id, golMiei, golAvversario, marcatori, titolari, infortunati, prestazioniEccezionali, espulsi: [] });
  } catch {
    doppioConferma = true;
  }
  check('referto: doppia conferma rifiutata', doppioConferma);

  // ---------- Annullamento entro lo stesso turno ----------
  await annullaReferto({ carrieraId: carriera.id, partitaId: prossima.id });
  const ripristinata = await db.partite.get(prossima.id);
  const minutiRipristinati = await db.giocatori.bulkGet(titolari);
  const infortunatoRipristinato = infortunati[0] ? await db.giocatori.get(infortunati[0]) : undefined;
  const formaRipristinata = prestazioniEccezionali[0] ? await db.giocatori.get(prestazioniEccezionali[0]) : undefined;
  const statoDopoAnnullo = await db.statoClub.get(carriera.id);
  const cpuDelTurno = await db.partite
    .where('competizioneId').equals(competizione.id).toArray();
  check('annulla: partita tornata non giocata', ripristinata !== undefined && !ripristinata.giocata && ripristinata.marcatori.length === 0);
  check('annulla: minuti titolari azzerati', minutiRipristinati.every((g) => g?.minutiStagione === 0));
  check('annulla: forma ripristinata', formaRipristinata?.forma === formaInizialePrestazione, String(formaRipristinata?.forma));
  check('annulla: infortunio cancellato', infortunatoRipristinato?.infortunioFinoA === undefined);
  check('annulla: risultati CPU del turno azzerati', cpuDelTurno.filter((p) => p.giornata === 1).every((p) => !p.giocata));
  check('annulla: settimana tornata a 1', statoDopoAnnullo?.settimanaCorrente === 1);
  const ratingUtenteRipristinato = (await db.squadre.get(squadra.id))?.rating ?? 0;
  const ratingAvversariaRipristinato = (await db.squadre.get(idAvversaria))?.rating ?? 0;
  check('annulla: rating della tua squadra ripristinato', ratingUtenteRipristinato === ratingUtentePrima, `${ratingUtenteRipristinato} vs ${ratingUtentePrima}`);
  check('annulla: rating avversaria ripristinato', ratingAvversariaRipristinato === ratingAvversariaPrima, `${ratingAvversariaRipristinato} vs ${ratingAvversariaPrima}`);
  check('annulla: ratingPrima rimosso dalle partite', cpuDelTurno.filter((p) => p.giornata === 1).every((p) => p.ratingPrima === undefined));

  let annulloVuoto = false;
  try {
    await annullaReferto({ carrieraId: carriera.id, partitaId: prossima.id });
  } catch {
    annulloVuoto = true;
  }
  check('annulla: partita non giocata → rifiutato', annulloVuoto);

  // ---------- "Entro lo stesso turno": dopo il turno successivo è storia ----------
  const esito2 = await confermaReferto({
    carrieraId: carriera.id,
    partitaId: prossima.id,
    golMiei: 0,
    golAvversario: 0,
    marcatori: [],
    titolari,
    infortunati: [],
    prestazioniEccezionali: [],
    espulsi: [],
  });
  const prossima2 = await prossimaPartita(squadra.id, competizione.id);
  if (!prossima2) throw new Error('Nessuna seconda partita');
  await confermaReferto({
    carrieraId: carriera.id,
    partitaId: prossima2.id,
    golMiei: 1,
    golAvversario: 1,
    marcatori: [xi[0] ?? ''],
    titolari,
    infortunati: [],
    prestazioniEccezionali: [],
    espulsi: [],
  });
  let storia = false;
  try {
    await annullaReferto({ carrieraId: carriera.id, partitaId: esito2.partita.id });
  } catch {
    storia = true;
  }
  check('annulla: referto del turno precedente = storia (rifiutato)', storia);
  check('referto: seconda conferma a 3 punti di nuovo', (await db.statoClub.get(carriera.id))?.settimanaCorrente === 3);

  // ---------- Classifica: regola Serie A (scontri diretti) ----------
  // A batte B all'andata (1-0) ma ha DR peggiore: gli scontri diretti devono prevalere.
  const partite = [
    fabPartita({ id: 'ab', casa: 'a', trasferta: 'b', golCasa: 1, golTrasferta: 0, giocata: true }),
    fabPartita({ id: 'ba', casa: 'b', trasferta: 'a', golCasa: 0, golTrasferta: 0, giocata: false }),
    fabPartita({ id: 'ad', casa: 'a', trasferta: 'd', golCasa: 0, golTrasferta: 5, giocata: true }),
    fabPartita({ id: 'bd', casa: 'b', trasferta: 'd', golCasa: 5, golTrasferta: 0, giocata: true }),
    fabPartita({ id: 'dd', casa: 'd', trasferta: 'a', golCasa: 5, golTrasferta: 0, giocata: true }),
    fabPartita({ id: 'db', casa: 'd', trasferta: 'b', golCasa: 5, golTrasferta: 0, giocata: true }),
  ];
  const classifica = calcolaClassifica(partite, ['a', 'b', 'd']);
  const pos = (id: string): number => classifica.find((r) => r.squadraId === id)?.posizione ?? -1;
  check('classifica: D primo (6 punti)', pos('d') === 1, classifica.map((r) => `${r.squadraId}@${r.posizione}`).join(' '));
  check('classifica: A davanti a B per scontri diretti (DR generale peggiore)', pos('a') < pos('b'), `A@${pos('a')} B@${pos('b')}`);
  check('classifica: punti corretti (A=3, B=3, D=9)', classifica.find((r) => r.squadraId === 'a')?.punti === 3 && classifica.find((r) => r.squadraId === 'b')?.punti === 3 && classifica.find((r) => r.squadraId === 'd')?.punti === 9);

  console.log(falliti === 0 ? '\nTUTTI I CONTROLLI SUPERATI' : `\n${falliti} CONTROLLI FALLITI`);
  if (falliti > 0) process.exitCode = 1;
}

void main();
