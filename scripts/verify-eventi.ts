// FLM — Verifica motore eventi (PRD 4.2/4.3/4.6), offline, senza chiave API.
// Esegue: npm run verify:eventi
// Copre: pesca count (distribuzione + anti-cluster), cooldown categorie,
// normalizzazione nomi, similarità Jaccard, validazione proposta (giocatori
// fantasma, clamp effetti, opzioni), selezione per hint, notizie offline,
// applicazione effetti. Usa lo stesso pattern degli altri verify-*.ts.
import 'fake-indexeddb/auto';

import { db, eliminaCarriera, seedDemo } from '../src/db';
import {
  applicaEffettiEvento,
  candidatiPerCategoria,
  conseguenzeInfortuni,
  faseStagione,
  nomiEquivalenti,
  normalizzaNome,
  notizieOfflineDaTurno,
  pescaCategorie,
  pescaCountEventi,
  poolCategorie,
  selezionaPerHint,
  settimaneConsecutiveConDueEventi,
  similaritaTesti,
  validaPropostaEventi,
} from '../src/engine/eventi';
import { EVENTI_FALLBACK } from '../src/engine/fallback-events';
import { CASI_REALI } from '../src/data/casi-reali';
import type { Evento, Giocatore, Partita, StatoClub } from '../src/types/entities';

let falliti = 0;
function check(condizione: boolean, nome: string): void {
  if (condizione) {
    console.log(`  ok  ${nome}`);
  } else {
    falliti++;
    console.error(`FAIL  ${nome}`);
  }
}

function giocatoreFinto(nome: string, extra: Partial<Giocatore> = {}): Giocatore {
  return {
    id: nome.replace(/\s/g, '').toLowerCase(),
    carrieraId: 'c1',
    pesId: null,
    nome,
    nazionalita: 'IT',
    eta: 25,
    ruolo: 'centrocampista',
    overall: 80,
    morale: 50,
    fiducia: 50,
    forma: 50,
    minutiStagione: 900,
    promesse: [],
    leader: false,
    giovane: false,
    valoreMercato: 10_000_000,
    ...extra,
  };
}

function eventoFinto(settimana: number, categoria: Evento['categoria'], titolo: string, testo: string): Evento {
  return {
    id: `e${settimana}-${titolo}`,
    carrieraId: 'c1',
    settimana,
    categoria,
    tipo: 'punto_decisionale',
    titolo,
    testo,
    giocatoriCoinvolti: [],
    opzioni: [
      { testo: 'Opzione A', effettiProposti: { moraleGiocatori: 1, fiduciaGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 } },
      { testo: 'Opzione B', effettiProposti: { moraleGiocatori: -1, fiduciaGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 } },
    ],
    effettiApplicati: false,
  };
}

async function main(): Promise<void> {
  console.log('Verifica motore eventi\n');

  // ---------- Pesca count (distribuzione e anti-cluster) ----------
  console.log('Pesca count eventi:');
  let zero = 0;
  let uno = 0;
  let due = 0;
  for (let s = 1; s <= 2000; s++) {
    const c = pescaCountEventi(`c1|${s}`, 0);
    if (c === 0) zero++;
    else if (c === 1) uno++;
    else due++;
  }
  check(zero / 2000 > 0.35 && zero / 2000 < 0.45, `~40% settimane vuote (${((zero / 2000) * 100).toFixed(1)}%)`);
  check(uno / 2000 > 0.45 && uno / 2000 < 0.55, `~50% un evento (${((uno / 2000) * 100).toFixed(1)}%)`);
  check(due / 2000 > 0.05 && due / 2000 < 0.15, `~10% due eventi (${((due / 2000) * 100).toFixed(1)}%)`);
  // Anti-cluster: con 2 settimane consecutive da 2, mai 2
  let maiDue = true;
  for (let s = 1; s <= 500; s++) {
    if (pescaCountEventi(`c1|${s}`, 2) === 2) maiDue = false;
  }
  check(maiDue, 'anti-cluster: mai 2 eventi dopo 2 settimane consecutive da 2');
  check(settimaneConsecutiveConDueEventi([
    eventoFinto(10, 'giocatore', 'A', 'a'), eventoFinto(10, 'societa', 'B', 'b'),
    eventoFinto(9, 'giocatore', 'C', 'c'), eventoFinto(9, 'tifosi_media', 'D', 'd'),
    eventoFinto(8, 'giocatore', 'E', 'e'),
  ]) === 2, 'settimane consecutive con 2 eventi: 10,9 = 2 (8 interrompe)');
  check(settimaneConsecutiveConDueEventi([eventoFinto(5, 'giocatore', 'A', 'a')]) === 0, 'una settimana con 1 evento = 0 consecutive');

  // ---------- Pool categorie: gating e cap stagionale ----------
  console.log('Pool categorie (gating + cap stagionale):');
  const poolCalmo = poolCategorie({
    ultimeCategorie: [],
    fiduciaSocieta: 80,
    fiduciaTifosi: 75,
    strisciaNegativa: false,
    eventiRariStagione: { societa: 0, tifosi_media: 0 },
    sprintFinale: false,
  });
  check(poolCalmo.length === 1 && poolCalmo[0] === 'giocatore', 'clima tranquillo → solo giocatore');
  const poolTeso = poolCategorie({
    ultimeCategorie: [],
    fiduciaSocieta: 30,
    fiduciaTifosi: 25,
    strisciaNegativa: true,
    eventiRariStagione: { societa: 0, tifosi_media: 0 },
    sprintFinale: false,
  });
  check(poolTeso.includes('societa') && poolTeso.includes('tifosi_media'), 'crisi di fiducia → categorie rare sbloccate');
  const poolCap = poolCategorie({
    ultimeCategorie: [],
    fiduciaSocieta: 10,
    fiduciaTifosi: 10,
    strisciaNegativa: true,
    eventiRariStagione: { societa: 4, tifosi_media: 4 },
    sprintFinale: false,
  });
  check(poolCap.length === 1 && poolCap[0] === 'giocatore', 'cap stagionale 4/4 → rare escluse');
  const poolSprint = poolCategorie({
    ultimeCategorie: [],
    fiduciaSocieta: 80,
    fiduciaTifosi: 75,
    strisciaNegativa: false,
    eventiRariStagione: { societa: 2, tifosi_media: 1 },
    sprintFinale: true,
  });
  check(poolSprint.includes('societa'), 'sprint finale → società sbloccata anche senza crisi');
  const poolCooldown = poolCategorie({
    ultimeCategorie: ['giocatore', 'giocatore'],
    fiduciaSocieta: 30,
    fiduciaTifosi: 25,
    strisciaNegativa: true,
    eventiRariStagione: { societa: 0, tifosi_media: 0 },
    sprintFinale: false,
  });
  check(!poolCooldown.includes('giocatore'), 'cooldown: giocatore usata 2 turni di fila → esclusa');

  // ---------- Pesca pesata ----------
  console.log('Pesca categorie pesata:');
  const poolPieno = ['giocatore', 'societa', 'tifosi_media'] as const;
  let g = 0;
  let rare = 0;
  for (let s = 1; s <= 1000; s++) {
    const e = pescaCategorie(`c1|${s}`, 1, [...poolPieno]);
    if (e[0] === 'giocatore') g++;
    else rare++;
  }
  check(g / 1000 > 0.7, `giocatore domina la pesca (${((g / 1000) * 100).toFixed(1)}%)`);
  const dueEstratte = pescaCategorie('x|1', 2, ['giocatore', 'societa', 'tifosi_media']);
  check(new Set(dueEstratte).size === dueEstratte.length, 'categorie distinte nella stessa settimana');
  check(pescaCategorie('x|1', 0, ['giocatore']).length === 0, 'count 0 = nessuna categoria');
  check(pescaCategorie('x|1', 2, ['giocatore']).length === 1, 'pool con 1 sola categoria → 1 evento');

  // ---------- Fase stagione ----------
  console.log('Fase stagione:');
  check(faseStagione(2, 38) === 'avvio', 'settimana 2/38 = avvio');
  check(faseStagione(20, 38) === 'lotta', 'settimana 20/38 = lotta');
  check(faseStagione(34, 38) === 'sprint_finale', 'settimana 34/38 = sprint finale');
  check(faseStagione(5, 0) === 'avvio', 'nessuna giornata → avvio');

  // ---------- Nomi ----------
  console.log('Normalizzazione nomi:');
  check(normalizzaNome('Marco Rossi') === normalizzaNome('ROSSI Marco'), 'accenti/case: "Marco Rossi" = "ROSSI Marco"');
  check(nomiEquivalenti('Federico Chiesa', 'Chiesa Federico'), 'ordine invertito riconosciuto');
  check(nomiEquivalenti('Luca D\'Ambrosio', "D'Ambrosio Luca"), 'apostrofo e ordine invertito');
  check(!nomiEquivalenti('Marco Rossi', 'Marco Bianchi'), 'nomi diversi non matchano');

  // ---------- Similarità ----------
  console.log('Similarità testi:');
  check(similaritaTesti('Il capitano chiede un colloquio con l\'allenatore', 'Il capitano chiede un colloquio urgente') >= 0.6, 'testi simili sopra soglia');
  check(similaritaTesti('Il capitano chiede un colloquio con l\'allenatore', 'La società annuncia i nuovi abbonamenti') < 0.3, 'testi diversi sotto soglia');

  // ---------- Validazione proposta ----------
  console.log('Validazione proposta:');
  const rosa = [
    giocatoreFinto('Marco Rossi', { morale: 20 }),
    giocatoreFinto('Luca Bianchi', { minutiStagione: 120, overall: 82 }),
    giocatoreFinto('Paolo Verdi', { giovane: true, eta: 18 }),
  ];
  const validi = validaPropostaEventi(
    {
      eventi: [
        {
          categoria: 'giocatore',
          tipo: 'punto_decisionale',
          titolo: 'Caos in allenamento',
          testo: 'Marco Rossi contesta le scelte',
          giocatoriCoinvolti: ['rossi marco'], // ordine invertito: deve matcheare
          opzioni: [
            { testo: 'A', effettiProposti: { moraleGiocatori: 50, fiduciaGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 } },
            { testo: 'B', effettiProposti: { moraleGiocatori: -50, fiduciaGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 } },
            { testo: 'C', effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 } },
            { testo: 'D', effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 } },
            { testo: 'E', effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 } },
          ],
        },
        {
          categoria: 'societa', // non richiesta: scartato
          tipo: 'scenario_emergente',
          titolo: 'Il presidente parla',
          testo: 'Comunicato della società',
          giocatoriCoinvolti: [],
          opzioni: [
            { testo: 'A', effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 } },
            { testo: 'B', effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 } },
          ],
        },
        {
          categoria: 'giocatore',
          tipo: 'punto_decisionale',
          titolo: 'Il mistero del fantasma',
          testo: 'Un giocatore inesistente crea un caso',
          giocatoriCoinvolti: ['Giocatore Fantasma'],
          opzioni: [
            { testo: 'A', effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 } },
            { testo: 'B', effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 } },
          ],
        },
      ],
      notizie: ['Prima notizia.', '', 'Seconda notizia.', 'Terza notizia.', 'Quarta notizia.'],
    },
    {
      categorieRichieste: ['giocatore'],
      rosa: rosa.map((g) => g.nome),
      ultimiEventi: [],
    },
  );
  check(validi.eventi.length === 1, 'solo l\'evento della categoria richiesta e con giocatori in rosa');
  check(validi.eventi[0]?.giocatoriCoinvolti[0] === 'Marco Rossi', 'nome riscritto in forma canonica');
  check(validi.eventi[0]?.opzioni.length === 4, 'opzioni troncate a 4');
  check(validi.eventi[0]?.opzioni[0]?.effettiProposti.moraleGiocatori === 10, 'effetto clampato a +10');
  check(validi.eventi[0]?.opzioni[1]?.effettiProposti.moraleGiocatori === -10, 'effetto clampato a -10');
  check(validi.notizie.length === 3, 'notizie: vuote filtrate, max 3');

  // effetti_fisici (infortuni narrativi): validazione e clamp
  const conInfortunio = validaPropostaEventi(
    {
      eventi: [
        {
          categoria: 'giocatore',
          tipo: 'scenario_emergente',
          titolo: 'Stop in allenamento',
          testo: 'Luca Bianchi si ferma in allenamento',
          giocatoriCoinvolti: ['Luca Bianchi'],
          effettiFisici: [
            { giocatore: 'bianchi luca', settimane: 99 }, // clamp a 4 + canonico
            { giocatore: 'Giocatore Fantasma', settimane: 2 }, // scartato
          ],
          opzioni: [
            { testo: 'A', effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 } },
            { testo: 'B', effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 } },
          ],
        },
      ],
      notizie: [],
    },
    {
      categorieRichieste: ['giocatore'],
      rosa: rosa.map((g) => g.nome),
      ultimiEventi: [],
    },
  );
  check(
    conInfortunio.eventi[0]?.effettiFisici?.length === 1 && conInfortunio.eventi[0]?.effettiFisici[0]?.giocatore === 'Luca Bianchi',
    'effetti_fisici: fantasma scartato, nome canonico',
  );
  check(conInfortunio.eventi[0]?.effettiFisici?.[0]?.settimane === 4, 'effetti_fisici: settimane clampate a 4');

  // conseguenzeInfortuni: applica davvero l'infortunio
  const infortuni = conseguenzeInfortuni(
    [
      {
        effettiFisici: [
          { giocatore: 'Luca Bianchi', settimane: 2 },
          { giocatore: 'Paolo Verdi', settimane: 4 },
        ],
      },
    ],
    rosa,
    5,
  );
  check(infortuni.get('lucabianchi') === 7, 'infortunio: settimana 5 + 2 = 7');
  check(infortuni.get('paoloverdi') === 9, 'infortunio: settimana 5 + 4 = 9');
  check(!infortuni.has('marcorossi'), 'infortunio: non citato = non toccato');

  const scartoSimili = validaPropostaEventi(
    {
      eventi: [{
        categoria: 'giocatore',
        tipo: 'punto_decisionale',
        titolo: 'Il capitano chiede un colloquio con l\'allenatore',
        testo: 'Il capitano chiede un colloquio urgente con l\'allenatore per i minuti',
        giocatoriCoinvolti: ['Marco Rossi'],
        opzioni: [
          { testo: 'A', effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 } },
          { testo: 'B', effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 } },
        ],
      }],
      notizie: [],
    },
    {
      categorieRichieste: ['giocatore'],
      rosa: rosa.map((g) => g.nome),
      ultimiEventi: [eventoFinto(3, 'giocatore', 'Il capitano chiede un colloquio con l\'allenatore', 'Il capitano chiede un colloquio urgente per i minuti')],
    },
  );
  check(scartoSimili.eventi.length === 0, 'evento simile all\'archivio scartato');

  // ---------- Candidati e hint ----------
  console.log('Candidati e selezione per hint:');
  const candidati = candidatiPerCategoria(rosa);
  check(candidati.length > 0, 'pool candidati non vuoto');
  check(candidati.some((c) => c.nome === 'Marco Rossi' && c.motivo.includes('crisi')), 'crisi morale etichettata');
  check(selezionaPerHint(rosa, 'crisi_morale', 's1')?.nome === 'Marco Rossi', 'hint crisi_morale → morale più basso');
  check(selezionaPerHint(rosa, 'panchinaro', 's1')?.nome === 'Luca Bianchi', 'hint panchinaro → overall alto, pochi minuti');
  check(selezionaPerHint(rosa, 'giovane', 's1')?.nome === 'Paolo Verdi', 'hint giovane → vivaio');
  check(selezionaPerHint([], 'casuale', 's1') === null, 'rosa vuota → null');

  // ---------- Applicazione effetti ----------
  console.log('Applicazione effetti:');
  const stato: StatoClub = {
    id: 'c1',
    fiduciaSocieta: 70,
    fiduciaTifosi: 65,
    obiettivo: 'salvezza',
    budget: 10_000_000,
    reputazioneAllenatore: 50,
    settimanaCorrente: 5,
  };
  const eventoMorale = eventoFinto(5, 'giocatore', 'X', 'Y');
  eventoMorale.giocatoriCoinvolti = ['Marco Rossi'];
  eventoMorale.opzioni[0]!.effettiProposti = { moraleGiocatori: -8, fiduciaSocieta: 3, fiduciaTifosi: 2, reputazione: 1 };
  const applicato = applicaEffettiEvento(stato, rosa, eventoMorale, 0);
  check(applicato.giocatori.find((g) => g.nome === 'Marco Rossi')?.morale === 12, 'morale citato: 20 - 8 = 12');
  check(applicato.giocatori.find((g) => g.nome === 'Luca Bianchi')?.morale === 50, 'non citato: morale invariato');
  check(applicato.stato.fiduciaSocieta === 73 && applicato.stato.fiduciaTifosi === 67 && applicato.stato.reputazioneAllenatore === 51, 'StatoClub aggiornato');
  check(applicato.stato.settimanaCorrente === 5, 'settimana non toccata');

  // ---------- Notizie offline ----------
  console.log('Notizie offline:');
  const partite: Partita[] = [
    { id: 'p1', carrieraId: 'c1', competizioneId: 'cp1', giornata: 4, casa: 'sqMia', trasferta: 'sqAvv', golCasa: 2, golTrasferta: 1, marcatori: ['Rossi', 'Bianchi'], giocata: true },
    { id: 'p2', carrieraId: 'c1', competizioneId: 'cp1', giornata: 4, casa: 'sqC', trasferta: 'sqD', golCasa: 0, golTrasferta: 4, giocata: true },
    { id: 'p3', carrieraId: 'c1', competizioneId: 'cp1', giornata: 4, casa: 'sqE', trasferta: 'sqF', golCasa: 1, golTrasferta: 1, giocata: true },
  ];
  const notizie = notizieOfflineDaTurno({
    miaPartita: partite[0]!,
    turno: partite,
    miaSquadraId: 'sqMia',
    nomeSquadra: (id) => ({ sqMia: 'La Mia', sqAvv: 'Avversaria', sqC: 'Casa C', sqD: 'Ospiti D', sqE: 'Eta', sqF: 'Effe' })[id] ?? id,
  });
  check(notizie.length >= 2 && notizie.length <= 3, `2-3 notizie (${notizie.length})`);
  check(notizie[0]?.includes('2-1') ?? false, 'notizia della tua partita col risultato reale');
  check(notizie.some((n) => n.includes('0-4')), 'evidenza CPU dal risultato reale');

  // ---------- Tabelle precaricate ----------
  console.log('Tabelle fallback e casi reali:');
  check(EVENTI_FALLBACK.length >= 30, `almeno 30 eventi fallback (${EVENTI_FALLBACK.length})`);
  check(EVENTI_FALLBACK.filter((e) => e.categoria === 'giocatore').length >= 12, '≥12 eventi giocatore');
  check(EVENTI_FALLBACK.filter((e) => e.categoria === 'societa').length >= 9, '≥9 eventi societa');
  check(EVENTI_FALLBACK.filter((e) => e.categoria === 'tifosi_media').length >= 9, '≥9 eventi tifosi_media');
  check(
    EVENTI_FALLBACK.every((e) => e.opzioni.length >= 2 && e.opzioni.length <= 4),
    'ogni fallback ha 2-4 opzioni',
  );
  check(
    EVENTI_FALLBACK.every((e) =>
      e.opzioni.every(
        (o) =>
          Math.abs(o.effettiProposti.moraleGiocatori) <= 10 &&
          Math.abs(o.effettiProposti.fiduciaSocieta) <= 10 &&
          Math.abs(o.effettiProposti.fiduciaTifosi) <= 10 &&
          Math.abs(o.effettiProposti.reputazione) <= 10,
      ),
    ),
    'effetti fallback tutti entro ±10',
  );
  check(CASI_REALI.length >= 15, `almeno 15 casi reali verificati (${CASI_REALI.length})`);
  check(
    CASI_REALI.every((c) => c.fonte.length > 0 && c.situazione.length > 20),
    'ogni caso ha fonte e situazione',
  );

  // ---------- Smoke: DB reale (seed demo) ----------
  console.log('Smoke DB:');
  try {
    await seedDemo();
    const carriere = await db.carriere.toArray();
    const carriera = carriere[0];
    if (carriera) {
      await eliminaCarriera(carriera.id);
      console.log('  ok  seed demo + elimina carriera');
    } else {
      check(false, 'seed demo non ha creato carriere');
    }
  } catch (e) {
    check(false, `smoke DB fallito: ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log(falliti === 0 ? '\nTUTTI I CHECK SUPERATI' : `\n${falliti} CHECK FALLITI`);
  process.exit(falliti === 0 ? 0 : 1);
}

void main();
