import 'fake-indexeddb/auto';
import Dexie from 'dexie';

async function main() {
  const old = new Dexie('flm');
  old.version(10).stores({
    carriere: 'id, squadraId, stagione, createdAt',
    squadre: 'id, pesId, nome, carrieraId',
    giocatori: 'id, pesId, ruolo, giovane, carrieraId',
    squadAssignments: 'id, giocatoreId, squadraId, tipo, carrieraId',
    partite: 'id, competizioneId, giornata, giocata, carrieraId, settimana, slot, fase',
    competizioni: 'id, tipo, stagione, carrieraId',
    statoClub: 'id',
    eventi: 'id, settimana, categoria, tipo, carrieraId',
    notizie: 'id, carrieraId, settimana',
    prestazioni: 'id, carrieraId, partitaId, competizioneId, squadraId, giocatoreId',
    transferLedger: 'id, giocatoreId, aSquadraId, stagione, esito, carrieraId',
    impostazioni: 'id',
  });
  await old.open();
  await old.table('giocatori').add({
    id: 'g1', carrieraId: 'c1', pesId: 1, nome: 'Mario Rossi', nazionalita: 'ITA', eta: 25,
    ruolo: 'attaccante', overall: 80, morale: 50, fiducia: 50, forma: 50, minutiStagione: 0,
    promesse: [], leader: false, giovane: false, valoreMercato: 12_000_000,
  });
  await old.table('statoClub').add({ id: 'c1', fiduciaSocieta: 70, fiduciaTifosi: 65, obiettivo: 'salvezza', budget: 10_000_000, reputazioneAllenatore: 50, settimanaCorrente: 3 });
  await old.close();
  console.log('DB v10 creato con dati');

  const { db } = await import('../src/db/database');
  const g = await db.giocatori.get('g1');
  const s = await db.statoClub.get('c1');
  console.log('upgrade ok:', g?.scadenzaContratto, g?.ingaggioAnnuo, '| giornoMercato =', s?.giornoMercato);
  const ok = typeof g?.scadenzaContratto === 'string' && typeof g?.ingaggioAnnuo === 'number' && s?.giornoMercato === 0;
  console.log(ok ? 'UPGRADE V11 SUPERATO' : 'UPGRADE V11 FALLITO');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('ERRORE:', e); process.exit(1); });
