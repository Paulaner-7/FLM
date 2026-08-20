import { generaAttributi } from '/Users/vittorio/Desktop/FLM/src/engine/attributi.ts';
import { prng } from '/Users/vittorio/Desktop/FLM/src/engine/random.ts';
import { giocatoriACsv, rosterACsv, assegnazioniACsv, HEADERS_PLAYERS } from '/Users/vittorio/Desktop/FLM/src/bridge/csv.ts';

const rand = prng(42);
const attributi = generaAttributi({ pos: 9, eta: 16, overallTarget: 61, rand, creatoDaFlm: true });
const g = {
  id: 'x1', carrieraId: 'c1', pesId: 2147483649, nome: 'João Silva', nazionalita: 'Brasile', eta: 16,
  ruolo: 'attaccante', overall: 61, morale: 55, fiducia: 50, forma: 55, minutiStagione: 0, promesse: [],
  leader: false, giovane: true, valoreMercato: 500000, scadenzaContratto: '2029/30', ingaggioAnnuo: 25000,
  attributi, creatoDaFlm: true,
} as never;

const csv = giocatoriACsv([g]);
const righe = csv.split('\r\n');
console.log('header count:', righe[0].split(';').length, '(attesi 151)');
console.log('riga count:', righe[1].split(';').length);
const h = righe[0].split(';'); const v = righe[1].split(';');
const idx = Object.fromEntries(h.map((x, i) => [x, i]));
console.log('Id:', v[idx['Id']], '| Name:', v[idx['Name']], '| Country:', v[idx['Country']], '| Age:', v[idx['Age']]);
console.log('Value2:', v[idx['Value2']], '| InEditFile:', v[idx['InEditFile']], '| EditName:', v[idx['EditName']]);
console.log('OverallStats:', v[idx['OverallStats']], '| POS:', v[idx['POS']], '| GK:', v[idx['GK']], '| Height:', v[idx['Height']], '| Foot:', v[idx['Foot']]);
console.log('BOM:', csv.charCodeAt(0).toString(16));

// Roster
const s = { id: 's1', carrieraId: 'c1', pesId: 900, nome: 'Test FC', nazione: 'Italia', nazionale: false, rating: 1600, coefficiente: 10, budget: 50000000, reputazione: 70, ombra: false } as never;
const a = { id: 'a1', carrieraId: 'c1', giocatoreId: 'x1', squadraId: 's1', tipo: 'proprieta', dal: '2026/27', numeroMaglia: 7 } as never;
const roster = rosterACsv([s], [g], [a]);
const rl = roster.split('\r\n');
console.log('roster header count:', rl[0].split(';').length, '(attesi 122)');
const rh = rl[0].split(';'); const rv = rl[1].split(';');
const ridx = Object.fromEntries(rh.map((x, i) => [x, i]));
console.log('roster Id:', rv[ridx['Id']], '| Player1:', rv[ridx['Player1']], '| Number1:', rv[ridx['Number1']], '| TotalPlayers:', rv[ridx['TotalPlayers']]);

// Teams-Players
const tp = assegnazioniACsv([a], [g], [s]);
console.log('teams-players:', tp.split('\r\n')[1]);
