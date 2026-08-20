// Smoke test del motore competizioni (PRD 7.1): sorteggi vincolati, league
// phase, tabellone, simulazione giocatori, generazione stagione completa.
// Uso: npm run verify:competizioni

import {
  sorteggioLeaguePhase,
  calendarioLeaguePhase,
  classificaLeaguePhase,
  sorteggioPlayoffEliminazione,
  sorteggioOttavi,
  accoppiamentiQuarti,
  accoppiamentiSemifinali,
  vincitriceSfida,
  completaConRigori,
  simulaEventiSquadra,
  coefficienteDaRating,
  coefficienteDaAssociazione,
  creaFasce,
} from '../src/engine/competizioni';
import type { Giocatore, Partita } from '../src/types/entities';

let falliti = 0;
function check(condizione: boolean, messaggio: string): void {
  if (condizione) {
    console.log(`  ✓ ${messaggio}`);
  } else {
    falliti++;
    console.error(`  ✗ ${messaggio}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Coefficiente
// ---------------------------------------------------------------------------
console.log('\n1. Coefficiente');
check(coefficienteDaRating(1500) < coefficienteDaRating(2100), 'cresce col rating');
check(coefficienteDaRating(2100) > 100, 'top rating → coefficiente alto');
check(coefficienteDaAssociazione('Italia') > 15, '20% associazione Italia ≈ 19.4');

// ---------------------------------------------------------------------------
// 2. Sorteggio league phase (36 squadre, 8 partite, vincoli nazione)
// ---------------------------------------------------------------------------
console.log('\n2. Sorteggio league phase UCL (36 squadre, 8 partite)');
const nazioni = ['Italia', 'Inghilterra', 'Spagna', 'Germania', 'Francia', 'Paesi Bassi', 'Portogallo', 'Belgio', 'Repubblica Ceca', 'Turchia', 'Scozia', 'Grecia'];
const squadre = Array.from({ length: 36 }, (_, i) => ({
  id: `S${i}`,
  nome: `Squadra ${i}`,
  nazione: nazioni[i % nazioni.length]!,
  coefficiente: 130 - i * 2.5,
}));
const sorteggio = sorteggioLeaguePhase(squadre, { partite: 8, avversariePerFascia: 2, numeroFasce: 4 }, 12345);
check(sorteggio.fasce.length === 4 && sorteggio.fasce.every((f) => f.length === 9), '4 fasce da 9');
let violazioni = 0;
for (const [id, avversarie] of sorteggio.avversarie) {
  const mia = squadre.find((s) => s.id === id)!;
  if (avversarie.length !== 8) violazioni++;
  const stessaNazione = avversarie.filter((a) => squadre.find((s) => s.id === a.id)!.nazione === mia.nazione).length;
  if (stessaNazione > 0) violazioni++;
  const perNazione = new Map<string, number>();
  for (const a of avversarie) {
    const n = squadre.find((s) => s.id === a.id)!.nazione;
    perNazione.set(n, (perNazione.get(n) ?? 0) + 1);
  }
  for (const [, c] of perNazione) if (c > 2) violazioni++;
  const inCasa = avversarie.filter((a) => a.inCasa).length;
  if (inCasa !== 4) violazioni++;
}
check(violazioni === 0, `nessuna violazione vincoli (${violazioni} trovate)`);

const calendario = calendarioLeaguePhase(sorteggio, 8, 999);
check(calendario.length === 144, `144 partite (trovate ${calendario.length})`);
const perMatchday = new Map<number, Set<string>>();
let conflitti = 0;
for (const m of calendario) {
  const usati = perMatchday.get(m.matchday) ?? new Set();
  if (usati.has(m.casa) || usati.has(m.trasferta)) conflitti++;
  usati.add(m.casa);
  usati.add(m.trasferta);
  perMatchday.set(m.matchday, usati);
}
check(conflitti === 0, `nessun conflitto matchday (${conflitti} trovati)`);

// UECL: 6 fasce da 6, 6 partite
console.log('3. Sorteggio league phase UECL (6 fasce da 6, 6 partite)');
const sorteggioUecl = sorteggioLeaguePhase(squadre, { partite: 6, avversariePerFascia: 1, numeroFasce: 6 }, 777);
check(sorteggioUecl.fasce.length === 6 && sorteggioUecl.fasce.every((f) => f.length === 6), '6 fasce da 6');
let violazioniUecl = 0;
for (const [id, avversarie] of sorteggioUecl.avversarie) {
  if (avversarie.length !== 6) violazioniUecl++;
  const inCasa = avversarie.filter((a) => a.inCasa).length;
  if (inCasa !== 3) violazioniUecl++;
}
check(violazioniUecl === 0, `nessuna violazione UECL (${violazioniUecl} trovate)`);

// ---------------------------------------------------------------------------
// 4. Classifica league phase + playoff
// ---------------------------------------------------------------------------
console.log('4. Classifica league phase');
const partiteFake: Partita[] = calendario.map((m) => ({
  id: `${m.matchday}-${m.casa}-${m.trasferta}`,
  carrieraId: 'c',
  competizioneId: 'comp',
  giornata: m.matchday,
  casa: m.casa,
  trasferta: m.trasferta,
  golCasa: (m.matchday + m.casa.charCodeAt(1)) % 4,
  golTrasferta: (m.matchday + m.trasferta.charCodeAt(1)) % 3,
  marcatori: [],
  giocata: true,
  settimana: m.matchday,
  slot: 'infrasettimanale',
  fase: 'league_phase',
  neutra: false,
}));
const classifica = classificaLeaguePhase(partiteFake, squadre.map((s) => s.id), new Map(squadre.map((s) => [s.id, s.coefficiente])), new Map());
check(classifica.length === 36, '36 righe');
check(classifica.filter((r) => r.qualificazione === 'ottavi').length === 8, 'top 8 agli ottavi');
check(classifica.filter((r) => r.qualificazione === 'playoff_testa').length === 8, '9-16 teste di serie playoff');
check(classifica.filter((r) => r.qualificazione === 'playoff_non_testa').length === 8, '17-24 non teste di serie');
check(classifica.filter((r) => r.qualificazione === 'eliminata').length === 12, '25-36 eliminate');

const posizioni = new Map(classifica.map((r) => [r.squadraId, r.posizione]));
const sfidePlayoff = sorteggioPlayoffEliminazione(posizioni, 42);
check(sfidePlayoff.length === 8, '8 sfide playoff');
const teste = sfidePlayoff.map((s) => posizioni.get(s.testaSerie)!);
check(teste.every((p) => p >= 9 && p <= 16), 'teste di serie 9-16');
const vincitriciPerSezione = new Map<number, [string, string]>([[1, [sfidePlayoff[0]!.testaSerie, sfidePlayoff[1]!.testaSerie]], [2, [sfidePlayoff[2]!.testaSerie, sfidePlayoff[3]!.testaSerie]], [3, [sfidePlayoff[4]!.testaSerie, sfidePlayoff[5]!.testaSerie]], [4, [sfidePlayoff[6]!.testaSerie, sfidePlayoff[7]!.testaSerie]]]);
const sfideOttavi = sorteggioOttavi(posizioni, vincitriciPerSezione, 43);
check(sfideOttavi.length === 8, '8 sfide ottavi');
const quarti = accoppiamentiQuarti(sfideOttavi.map((s) => s.testaSerie));
check(quarti.length === 4, '4 quarti dal bracket');
const semi = accoppiamentiSemifinali(quarti.map(([a]) => a));
check(semi.length === 2, '2 semifinali dal bracket');

// ---------------------------------------------------------------------------
// 5. Tabellone: vincitrice sfida + rigori CPU 50/50
// ---------------------------------------------------------------------------
console.log('5. Tabellone e rigori');
const andata: Partita = { ...partiteFake[0]!, casa: 'A', trasferta: 'B', golCasa: 1, golTrasferta: 0, fase: 'ottavi', gamba: 1 };
const ritorno: Partita = { ...andata, casa: 'B', trasferta: 'A', golCasa: 1, golTrasferta: 0, gamba: 2 };
check(vincitriceSfida(andata, ritorno, { testaSerie: 'A', avversaria: 'B' }) === null, 'pareggio senza rigori → null (blocco referto)');
const ritornoRigori = completaConRigori({ ...ritorno, golCasa: 1, golTrasferta: 1, giocata: true });
check(ritornoRigori.rigori !== undefined, 'rigori CPU generati');
check((ritornoRigori.rigori!.casa !== ritornoRigori.rigori!.trasferta), 'rigori con vincitrice');
const v = vincitriceSfida(andata, { ...ritorno, rigori: ritornoRigori.rigori }, { testaSerie: 'A', avversaria: 'B' });
check(v === 'A' || v === 'B', 'vincitrice determinata');
// Determinismo: stessa partita → stessi rigori
const diNuovo = completaConRigori({ ...ritorno, golCasa: 1, golTrasferta: 1, giocata: true });
check(JSON.stringify(diNuovo.rigori) === JSON.stringify(ritornoRigori.rigori), 'rigori deterministici per ID partita');

// ---------------------------------------------------------------------------
// 6. Simulazione eventi giocatore
// ---------------------------------------------------------------------------
console.log('6. Simulazione eventi giocatore');
const rosa: Giocatore[] = Array.from({ length: 20 }, (_, i) => ({
  id: `G${i}`,
  pesId: null,
  nome: `Giocatore ${i}`,
  nazionalita: 'Italia',
  eta: 24,
  ruolo: i === 0 ? 'portiere' : i <= 7 ? 'difensore' : i <= 14 ? 'centrocampista' : 'attaccante',
  overall: 60 + i * 2,
  morale: 60,
  fiducia: 50,
  forma: 60,
  minutiStagione: 0,
  promesse: [],
  leader: false,
  giovane: false,
  valoreMercato: 0,
}));
const eventi = simulaEventiSquadra('P1', 'SQ1', rosa, 2, 0);
check(eventi.some((e) => e.gol > 0), 'marcatori presenti');
check(eventi.reduce((s, e) => s + e.gol, 0) === 2, 'gol totali = gol squadra');
check(eventi.every((e) => e.voto >= 1 && e.voto <= 10), 'voti nel range 1-10');
check(eventi.filter((e) => e.portaInviolata).length > 0, 'porta inviolata registrata (0 subiti)');
check(eventi.filter((e) => e.minuti > 0).length >= 11, 'XI + subentrati in campo');

// ---------------------------------------------------------------------------
// 7. Generazione stagione completa (mini-mondo fake)
// ---------------------------------------------------------------------------
console.log('7. Generazione stagione completa');
import { generaStagione, SQUADRA_DA_ASSEGNARE } from '../src/engine/competizioni';
import { STAGIONE_2026_27 } from '../src/data/calendarioStagioni';
import type { Squadra } from '../src/types/entities';

const clubFake: Squadra[] = [];
let n = 0;
for (const [nazione, lega] of [['Italia', 'Serie A'], ['Inghilterra', 'Premier League']] as const) {
  for (let i = 0; i < 12; i++) {
    clubFake.push({
      id: `CLUB${n++}`,
      pesId: null,
      nome: `${lega} Club ${i}`,
      nazione,
      nazionale: false,
      rating: 1800 - i * 25,
      coefficiente: 0,
      budget: 10_000_000,
      reputazione: 60,
      ombra: false,
      campionato: lega,
      mediaOverall: 75 - i * 0.8,
    });
  }
}
const rosaFake: Giocatore[] = Array.from({ length: 18 }, (_, i) => ({
  id: `FG${i}`,
  pesId: null,
  nome: `Fake ${i}`,
  nazionalita: 'Italia',
  eta: 24,
  ruolo: i === 0 ? 'portiere' : i <= 6 ? 'difensore' : i <= 12 ? 'centrocampista' : 'attaccante',
  overall: 70,
  morale: 60,
  fiducia: 50,
  forma: 60,
  minutiStagione: 0,
  promesse: [],
  leader: false,
  giovane: false,
  valoreMercato: 0,
}));

const output = generaStagione({
  carrieraId: 'CAR1',
  stagione: '2026/27',
  ancore: STAGIONE_2026_27,
  nazioneUtente: 'Italia',
  legaUtente: 'Serie A',
  squadre: clubFake,
  rosaUtente: rosaFake,
  accessi: [
    { nazione: 'Italia', squadra: 'Serie A Club 0', competizione: 'champions_league', turno: 'league_phase', motivo: 'test' },
    { nazione: 'Italia', squadra: 'Serie A Club 1', competizione: 'champions_league', turno: 'league_phase', motivo: 'test' },
    { nazione: 'Inghilterra', squadra: 'Premier League Club 0', competizione: 'champions_league', turno: 'league_phase', motivo: 'test' },
    { nazione: 'Inghilterra', squadra: 'Premier League Club 1', competizione: 'europa_league', turno: 'league_phase', motivo: 'test' },
  ],
  vincitriciCoppe: {},
  campioniNazionali: {},
  campioneUcl: '',
  campioneUel: '',
  poolPlayoff: { perNazione: new Map([['Italia', clubFake.filter((c) => c.nazione === 'Italia')], ['Inghilterra', clubFake.filter((c) => c.nazione === 'Inghilterra')]]) },
  squadraUtenteId: 'CLUB0',
});
check(output.competizioni.length >= 5, `competizioni generate (${output.competizioni.length})`);
check(output.partite.length > 0, `partite generate (${output.partite.length})`);
check(output.partite.every((p) => p.settimana > 0), 'tutte le partite hanno settimana > 0');
check(output.partite.every((p) => p.fase.length > 0 && p.slot.length > 0), 'fase e slot valorizzati');
const campionato = output.competizioni.find((c) => c.tipo === 'campionato' && c.nome === 'Serie A');
check(campionato !== undefined, 'campionato Serie A generato');
const partiteCampionato = output.partite.filter((p) => p.competizioneId === campionato?.id);
check(partiteCampionato.length === 132, `campionato 12 squadre = 132 partite (trovate ${partiteCampionato.length})`);
const coppa = output.competizioni.find((c) => c.tipo === 'coppa_nazionale' && c.nome === 'Coppa Italia');
check(coppa !== undefined, 'coppa nazionale Italia generata');
const ucl = output.competizioni.find((c) => c.tipo === 'champions_league');
check(ucl !== undefined, 'UCL generata');
const uclPlayoff = output.partite.filter((p) => p.competizioneId === ucl?.id && p.fase === 'playoff_qualificazione');
check(uclPlayoff.length > 0 && uclPlayoff.every((p) => p.casa !== SQUADRA_DA_ASSEGNARE), 'playoff UCL con squadre reali sostituite');
const uclKo = output.partite.filter((p) => p.competizioneId === ucl?.id && p.fase === 'finale');
check(uclKo.length === 1 && uclKo[0]!.neutra && uclKo[0]!.casa === SQUADRA_DA_ASSEGNARE, 'finale UCL segnaposto neutra');

// ---------------------------------------------------------------------------
// Riepilogo
// ---------------------------------------------------------------------------
console.log(falliti === 0 ? '\nTUTTI I TEST PASSATI' : `\n${falliti} TEST FALLITI`);
process.exit(falliti === 0 ? 0 : 1);
