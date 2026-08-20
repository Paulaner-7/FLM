// FLM — Persistenza competizioni (PRD 7.1): creazione stagione completa,
// avanzamento settimana (simulazione CPU a blocco), progressione tabelloni,
// fine stagione e rollover. Regola 1 AGENTS.md: solo Dexie.

import { db, newId } from './database';
import {
  generaStagione,
  SQUADRA_DA_ASSEGNARE,
  classificaLeaguePhase,
  puntiDisciplinari,
  sorteggioPlayoffEliminazione,
  sorteggioOttavi,
  sorteggioLeaguePhase,
  calendarioLeaguePhase,
  seedSorteggio,
  seedCalendarioLeaguePhase,
  vincitriceSfida,
  completaConRigori,
  simulaEventiGiocatori,
  coefficienteDaAssociazione,
  coefficienteDaRating,
  CONFIG_PER_TIPO,
  nomeFaseLeggibile,
} from '../engine/competizioni';
import { settimanaDiData } from '../engine/competizioni/calendarioStagione';
import { STAGIONE_2026_27, ancoreStagioneSuccessiva } from '../data/calendarioStagioni';
import type { AccessoEuropeo } from '../data/accessi';
import { ratingEffettivo, simulaRisultato } from '../engine/referto';
import { aggiornaRating, ELO_INIZIALE } from '../engine/rating';
import { calcolaClassifica, type RigaClassifica } from '../engine/classifica';
import { finestraDiSettimana } from '../engine/mercato';
import { accessiStagioneSuccessiva, resetStagionaleGiocatore, prossimaStagione } from '../engine/competizioni/fineStagione';
import { eseguiRitiri, applicaCrescitaStagionale, generaIntake } from './vivaio';
import type {
  Competizione,
  Giocatore,
  Id,
  Partita,
  PrestazionePartita,
  Squadra,
} from '../types/entities';

// ---------------------------------------------------------------------------
// Creazione stagione completa
// ---------------------------------------------------------------------------

export interface InputStagioneCompleta {
  carrieraId: Id;
  stagione: string;
  legaUtente: string;
  nazioneUtente: string;
  squadraUtenteId: Id;
  /** Ancore della stagione (2026/27 = dati reali; oltre = shift) */
  ancore: typeof STAGIONE_2026_27;
  /** Accessi europei (seme reale 2025/26 per la prima stagione) */
  accessi: AccessoEuropeo[];
  vincitriciCoppe: Record<string, string>;
  campioniNazionali: Record<string, string>;
  campioneUcl: string;
  campioneUel: string;
}

/**
 * Crea TUTTE le competizioni della stagione in una transazione atomica:
 * 12 campionati UEFA, coppe nazionali, supercoppe, UCL/UEL/UECL.
 * Le squadre sono le copie di carriera già clonate dal chiamante.
 */
export async function creaStagioneCompleta(input: InputStagioneCompleta): Promise<{
  competizioni: number;
  partite: number;
}> {
  return db.transaction('rw', [db.competizioni, db.partite, db.squadre], async () => {
    const squadre = await db.squadre.where('carrieraId').equals(input.carrieraId).toArray();
    const giocatori = await db.giocatori.where('carrieraId').equals(input.carrieraId).toArray();
    const assegnazioni = await db.squadAssignments.where('carrieraId').equals(input.carrieraId).toArray();

    const rosaUtente = giocatori.filter((g) =>
      assegnazioni.some(
        (a) => a.squadraId === input.squadraUtenteId && a.giocatoreId === g.id && a.tipo === 'proprieta' && a.al === undefined,
      ),
    );

    // Coefficienti iniziali (decisione utente: derivati dal rating Elo)
    const coefficienteIniziale = (s: Squadra): number => coefficienteDaRating(s.rating);
    for (const s of squadre) {
      if (s.coefficiente > 0) continue;
      await db.squadre.put({ ...s, coefficiente: coefficienteIniziale(s) });
    }
    const squadreConCoeff = squadre.map((s) => ({ ...s, coefficiente: s.coefficiente > 0 ? s.coefficiente : coefficienteIniziale(s) }));

    const pool = { perNazione: new Map<string, Squadra[]>() };
    for (const s of squadreConCoeff) {
      if (s.ombra || s.nazionale) continue;
      const lista = pool.perNazione.get(s.nazione) ?? [];
      lista.push(s);
      pool.perNazione.set(s.nazione, lista);
    }

    const output = generaStagione({
      carrieraId: input.carrieraId,
      stagione: input.stagione,
      ancore: input.ancore,
      nazioneUtente: input.nazioneUtente,
      legaUtente: input.legaUtente,
      squadre: squadreConCoeff,
      rosaUtente,
      accessi: input.accessi,
      vincitriciCoppe: input.vincitriciCoppe,
      campioniNazionali: input.campioniNazionali,
      campioneUcl: input.campioneUcl,
      campioneUel: input.campioneUel,
      poolPlayoff: pool,
      squadraUtenteId: input.squadraUtenteId,
    });

    await db.competizioni.bulkAdd(output.competizioni);
    const partiteConId = output.partite.map((p) => ({ ...p, id: p.id || newId() }));
    await db.partite.bulkAdd(partiteConId);
    return { competizioni: output.competizioni.length, partite: partiteConId.length };
  });
}

// ---------------------------------------------------------------------------
// Avanzamento settimana (unità atomica del tempo — decisione utente)
// ---------------------------------------------------------------------------

/** Tutte le partite non giocate di una settimana (qualsiasi competizione). */
async function partiteDellaSettimana(carrieraId: Id, settimana: number): Promise<Partita[]> {
  return db.partite.where('carrieraId').equals(carrieraId).and((p) => p.settimana === settimana).toArray();
}

/** Partite della squadra utente non ancora giocate, in ordine cronologico. */
export async function prossimePartiteUtente(carrieraId: Id, squadraId: Id): Promise<Partita[]> {
  const tutte = await db.partite.where('carrieraId').equals(carrieraId).toArray();
  return tutte
    .filter((p) => !p.giocata && (p.casa === squadraId || p.trasferta === squadraId))
    .sort((a, b) => a.settimana - b.settimana || (a.slot === 'infrasettimanale' ? 0 : 1) - (b.slot === 'infrasettimanale' ? 0 : 1) || a.id.localeCompare(b.id));
}

/** La prossima partita dell'utente (cross-competizione). */
export async function prossimaPartita(carrieraId: Id, squadraId: Id): Promise<Partita | null> {
  const prossime = await prossimePartiteUtente(carrieraId, squadraId);
  return prossime[0] ?? null;
}

/** Tutte le partite della settimana corrente dell'utente (giocate o meno). */
export async function partiteSettimanaCorrente(carrieraId: Id, settimana: number): Promise<Partita[]> {
  return partiteDellaSettimana(carrieraId, settimana);
}

interface ContestoSimulazione {
  carrieraId: Id;
  squadraUtenteId: Id;
  legaUtenteId: Id;
  coppaUtenteId: Id;
  giocatori: Map<Id, Giocatore[]>;
  squadre: Map<Id, Squadra>;
  competizioni: Map<Id, Competizione>;
}

async function caricaContesto(carrieraId: Id): Promise<ContestoSimulazione> {
  const [squadre, giocatori, assegnazioni, competizioni] = await Promise.all([
    db.squadre.where('carrieraId').equals(carrieraId).toArray(),
    db.giocatori.where('carrieraId').equals(carrieraId).toArray(),
    db.squadAssignments.where('carrieraId').equals(carrieraId).toArray(),
    db.competizioni.where('carrieraId').equals(carrieraId).toArray(),
  ]);
  const carriera = await db.carriere.get(carrieraId);
  const rosa = new Map<Id, Giocatore[]>();
  for (const s of squadre) {
    const ids = new Set(
      assegnazioni.filter((a) => a.squadraId === s.id && a.tipo === 'proprieta' && a.al === undefined).map((a) => a.giocatoreId),
    );
    rosa.set(s.id, giocatori.filter((g) => ids.has(g.id)));
  }
  const lega = competizioni.find((c) => c.tipo === 'campionato' && c.squadre.includes(carriera!.squadraId));
  const coppa = competizioni.find((c) => c.tipo === 'coppa_nazionale' && c.squadre.includes(carriera!.squadraId));
  return {
    carrieraId,
    squadraUtenteId: carriera!.squadraId,
    legaUtenteId: lega?.id ?? '',
    coppaUtenteId: coppa?.id ?? '',
    giocatori: rosa,
    squadre: new Map(squadre.map((s) => [s.id, s])),
    competizioni: new Map(competizioni.map((c) => [c.id, c])),
  };
}

/** Nel perimetro degli eventi giocatore? (decisione utente: mia lega + coppe europee + mia coppa) */
function eventiGiocatorePer(contesto: ContestoSimulazione, competizioneId: Id): boolean {
  const comp = contesto.competizioni.get(competizioneId);
  if (!comp) return false;
  if (comp.id === contesto.legaUtenteId || comp.id === contesto.coppaUtenteId) return true;
  return comp.tipo === 'champions_league' || comp.tipo === 'europa_league' || comp.tipo === 'conference_league';
}

/**
 * Simula una partita CPU: risultato (rating Elo + Poisson), eventuali rigori
 * (eliminazione diretta), eventi giocatore se nel perimetro, rating aggiornato.
 */
async function simulaPartitaCpu(
  contesto: ContestoSimulazione,
  partita: Partita,
  stagione: string,
  partiteGiocateCompetizione: Partita[],
): Promise<Partita> {
  // Segnaposto del tabellone (turni non ancora determinati): mai simulati.
  if (partita.casa === SQUADRA_DA_ASSEGNARE || partita.trasferta === SQUADRA_DA_ASSEGNARE) {
    return partita;
  }
  const casa = contesto.squadre.get(partita.casa);
  const trasferta = contesto.squadre.get(partita.trasferta);
  const rc = casa ? ratingEffettivo(casa, contesto.carrieraId, stagione, partiteGiocateCompetizione) : ELO_INIZIALE;
  const rt = trasferta ? ratingEffettivo(trasferta, contesto.carrieraId, stagione, partiteGiocateCompetizione) : ELO_INIZIALE;
  const { golCasa, golTrasferta } = simulaRisultato(partita.id, rc, rt);
  let salvata: Partita = { ...partita, golCasa, golTrasferta, giocata: true };

  const comp = contesto.competizioni.get(partita.competizioneId);
  const eliminazione =
    comp?.formato === 'eliminazione_diretta' ||
    (comp?.formato === 'league_phase' && partita.fase !== 'league_phase');
  if (eliminazione && golCasa === golTrasferta) {
    salvata = completaConRigori(salvata);
  }

  // Rating Elo
  if (casa && trasferta) {
    const nuovo = aggiornaRating(golCasa, golTrasferta, casa.rating, trasferta.rating);
    await db.squadre.put({ ...casa, rating: nuovo.ratingCasa });
    await db.squadre.put({ ...trasferta, rating: nuovo.ratingTrasferta });
    contesto.squadre.set(casa.id, { ...casa, rating: nuovo.ratingCasa });
    contesto.squadre.set(trasferta.id, { ...trasferta, rating: nuovo.ratingTrasferta });
  }

  // Eventi giocatore (perimetro decisione utente)
  if (eventiGiocatorePer(contesto, partita.competizioneId)) {
    const rosaCasa = contesto.giocatori.get(partita.casa) ?? [];
    const rosaTrasferta = contesto.giocatori.get(partita.trasferta) ?? [];
    if (rosaCasa.length > 0 && rosaTrasferta.length > 0) {
      const eventi = simulaEventiGiocatori(
        partita.id,
        { squadraId: partita.casa, rosa: rosaCasa, gol: golCasa, subiti: golTrasferta },
        { squadraId: partita.trasferta, rosa: rosaTrasferta, gol: golTrasferta, subiti: golCasa },
      );
      const righe: PrestazionePartita[] = [...eventi.casa, ...eventi.trasferta].map((e) => ({
        ...e,
        id: newId(),
        carrieraId: contesto.carrieraId,
        competizioneId: partita.competizioneId,
      }));
      await db.prestazioni.bulkAdd(righe);
      const nomi = new Map([...rosaCasa, ...rosaTrasferta].map((g) => [g.id, g.nome]));
      const noteCpu: string[] = [];
      for (const squadra of [eventi.casa, eventi.trasferta]) {
        const marcatori = squadra.filter((e) => e.gol > 0).map((e) => nomi.get(e.giocatoreId) ?? '—');
        if (marcatori.length > 0) noteCpu.push(`Marcatori: ${marcatori.join(', ')}.`);
      }
      salvata = { ...salvata, note: noteCpu.join(' ') || salvata.note };
    }
  }
  return salvata;
}

/**
 * Riempie i segnaposto del turno successivo di un'eliminazione diretta quando
 * il turno corrente è completo (tutte le sfide decise).
 */
async function avanzaTabellone(contesto: ContestoSimulazione, competizione: Competizione): Promise<void> {
  const partite = await db.partite.where('competizioneId').equals(competizione.id).toArray();
  const fasi = ['playoff_qualificazione', 'playoff', 'ottavi', 'quarti', 'semifinali', 'finale'];

  for (let i = 0; i < fasi.length; i++) {
    const fase = fasi[i]!;
    const prossima = fasi[i + 1];
    if (!prossima) continue;
    const dellaFase = partite
      .filter((p) => p.fase === fase && p.giornata === Math.min(...partite.filter((x) => x.fase === fase).map((x) => x.giornata)))
      .sort((a, b) => a.giornata - b.giornata || a.id.localeCompare(b.id));
    const tutteGiocate = dellaFase.every((p) => p.giocata);
    if (!tutteGiocate) continue;

    // Determina le vincitrici delle sfide (andata+ritorno o secca)
    const vincitrici: Id[] = [];
    const perSfida = new Map<number, Partita[]>();
    for (const p of dellaFase) {
      const lista = perSfida.get(p.giornata) ?? [];
      lista.push(p);
      perSfida.set(p.giornata, lista);
    }
    for (const [, sfidaPartite] of [...perSfida.entries()].sort((a, b) => a[0] - b[0])) {
      const andata = sfidaPartite.find((p) => p.gamba === 1) ?? sfidaPartite[0]!;
      const ritorno = sfidaPartite.find((p) => p.gamba === 2) ?? sfidaPartite[0]!;
      const v = vincitriceSfida(andata, ritorno, { testaSerie: andata.casa, avversaria: andata.trasferta });
      if (!v) return; // sfida in parità senza rigori: dati incompleti, fermati
      vincitrici.push(v);
    }

    // Riempi i segnaposto del turno successivo.
    // Caso speciale: ottavi dopo il playoff europeo → sorteggio reale per
    // posizioni (teste di serie 1-8 vs vincitrici delle sezioni).
    const segnaposto = partite
      .filter((p) => p.fase === prossima && (p.casa === SQUADRA_DA_ASSEGNARE || p.trasferta === SQUADRA_DA_ASSEGNARE))
      .sort((a, b) => a.giornata - b.giornata || a.gamba! - b.gamba! || a.id.localeCompare(b.id));

    if (fase === 'playoff' && prossima === 'ottavi' && competizione.formato === 'league_phase') {
      // Vincitrici per sezione (ordine del sorteggio playoff: S1,S2,S3,S4)
      const sezioni = new Map<number, [Id, Id]>();
      const sezioniPlayoff = [1, 1, 2, 2, 3, 3, 4, 4];
      vincitrici.forEach((v, i) => {
        const s = sezioniPlayoff[i] ?? 1;
        const attuale = sezioni.get(s);
        if (!attuale) sezioni.set(s, [v, v]);
        else sezioni.set(s, [attuale[0], v]);
      });
      if (competizione.classifica && sezioni.size === 4) {
        const posizioni = new Map(competizione.classifica.map((r) => [r.squadraId, r.posizione]));
        const seed = seedSorteggio(contesto.carrieraId, competizione.stagione, `${competizione.tipo}-r16`);
        const sfideOttavi = sorteggioOttavi(posizioni, sezioni, seed);
        let idx = 0;
        for (const p of segnaposto) {
          const sfida = sfideOttavi[idx];
          if (!sfida) continue;
          const gamba1 = p.gamba === 1;
          await db.partite.put({
            ...p,
            casa: gamba1 ? sfida.avversaria : sfida.testaSerie,
            trasferta: gamba1 ? sfida.testaSerie : sfida.avversaria,
          });
          if (p.gamba === 2 || p.gamba === undefined) idx++;
        }
        continue;
      }
    }

    // Caso generico: accoppiamenti adiacenti nel bracket
    let idx = 0;
    for (const p of segnaposto) {
      const v1 = vincitrici[idx * 2];
      const v2 = vincitrici[idx * 2 + 1];
      if (v1 === undefined || v2 === undefined) continue;
      const gamba1 = p.gamba === 1;
      const casa = gamba1 ? v1 : v2;
      const trasferta = gamba1 ? v2 : v1;
      await db.partite.put({ ...p, casa, trasferta });
      if (p.gamba === 2) idx++;
      if (p.gamba === undefined) idx++;
    }
  }
}

/**
 * Quando i playoff di qualificazione di una coppa europea si concludono:
 * determina le vincitrici, aggiunge i trasferimenti reali (perdenti UCL PO →
 * UEL LP, perdenti UEL PO → UECL LP) e genera la league phase (sorteggio +
 * calendario). Ritorna true se la league phase è stata generata.
 */
async function generaLeaguePhaseSePronta(
  contesto: ContestoSimulazione,
  competizione: Competizione,
): Promise<boolean> {
  if (competizione.formato !== 'league_phase') return false;
  const config = CONFIG_PER_TIPO[competizione.tipo];
  const partite = await db.partite.where('competizioneId').equals(competizione.id).toArray();
  const lpEsistente = partite.some((p) => p.fase === 'league_phase');
  if (lpEsistente) return false;

  const playoff = partite.filter((p) => p.fase === 'playoff_qualificazione');
  if (playoff.some((p) => !p.giocata)) return false;

  // Vincitrici playoff
  const vincitrici: Id[] = [];
  const perSfida = new Map<number, Partita[]>();
  for (const p of playoff) {
    const lista = perSfida.get(p.giornata) ?? [];
    lista.push(p);
    perSfida.set(p.giornata, lista);
  }
  for (const [, sfidaPartite] of [...perSfida.entries()].sort((a, b) => a[0] - b[0])) {
    const andata = sfidaPartite.find((p) => p.gamba === 1) ?? sfidaPartite[0]!;
    const ritorno = sfidaPartite.find((p) => p.gamba === 2) ?? sfidaPartite[0]!;
    const v = vincitriceSfida(andata, ritorno, { testaSerie: andata.casa, avversaria: andata.trasferta });
    if (!v) return false;
    vincitrici.push(v);
  }

  // Perdenti: trasferimenti reali tra coppe
  const perdenti: Id[] = [];
  for (const [, sfidaPartite] of perSfida) {
    const andata = sfidaPartite.find((p) => p.gamba === 1) ?? sfidaPartite[0]!;
    const ritorno = sfidaPartite.find((p) => p.gamba === 2) ?? sfidaPartite[0]!;
    const v = vincitriceSfida(andata, ritorno, { testaSerie: andata.casa, avversaria: andata.trasferta });
    if (v) perdenti.push(v === andata.casa ? andata.trasferta : andata.casa);
  }
  if (competizione.tipo === 'champions_league') {
    const uel = [...contesto.competizioni.values()].find((c) => c.tipo === 'europa_league' && c.stagione === competizione.stagione);
    if (uel) {
      const attuali = new Set(uel.squadre);
      const nuovi = [...attuali, ...perdenti.filter((p) => !attuali.has(p))];
      const aggiornata = { ...uel, squadre: nuovi };
      await db.competizioni.put(aggiornata);
      contesto.competizioni.set(uel.id, aggiornata);
    }
  } else if (competizione.tipo === 'europa_league') {
    const uecl = [...contesto.competizioni.values()].find((c) => c.tipo === 'conference_league' && c.stagione === competizione.stagione);
    if (uecl) {
      const attuali = new Set(uecl.squadre);
      const nuovi = [...attuali, ...perdenti.filter((p) => !attuali.has(p))];
      const aggiornata = { ...uecl, squadre: nuovi };
      await db.competizioni.put(aggiornata);
      contesto.competizioni.set(uecl.id, aggiornata);
    }
  }

  // Pool league phase: diretti (già in competizione.squadre) + vincitrici
  const pool = [...new Set([...competizione.squadre, ...vincitrici])];
  if (pool.length < 36) return false; // aspetta i trasferimenti dall'altra coppa
  if (pool.length > 36) throw new Error(`Pool league phase ${competizione.nome}: ${pool.length} squadre (attese 36)`);

  const squadreSorteggio = pool.map((id) => {
    const s = contesto.squadre.get(id)!;
    return {
      id: s.id,
      nome: s.nome,
      nazione: s.nazione,
      coefficiente: s.coefficiente > 0 ? s.coefficiente : coefficienteDaAssociazione(s.nazione),
    };
  });

  const numeroFasce = config.numeroFasce ?? 4;
  const seed = seedSorteggio(contesto.carrieraId, competizione.stagione, competizione.tipo);
  const sorteggio = sorteggioLeaguePhase(squadreSorteggio, {
    partite: config.partiteLeaguePhase ?? 8,
    avversariePerFascia: config.avversariePerFascia ?? 2,
    numeroFasce,
  }, seed);
  const calendario = calendarioLeaguePhase(sorteggio, config.partiteLeaguePhase ?? 8, seedCalendarioLeaguePhase(contesto.carrieraId, competizione.id));

  // Date dei matchday dall'ancora attiva
  const ancore = await ancoreCorrenti();
  const date = competizione.tipo === 'champions_league'
    ? ancore.uefa.ucl.fase.matchdays
    : competizione.tipo === 'europa_league'
      ? ancore.uefa.uel.fase.matchdays
      : ancore.uefa.uecl.fase.matchdays;

  const partiteLP: Partita[] = calendario.map((m) => {
    const data = date[m.matchday - 1] ?? date[date.length - 1]!;
    return {
      id: newId(),
      carrieraId: contesto.carrieraId,
      competizioneId: competizione.id,
      giornata: m.matchday,
      casa: m.casa,
      trasferta: m.trasferta,
      golCasa: 0,
      golTrasferta: 0,
      marcatori: [],
      giocata: false,
      settimana: settimanaDiData(data, ancore.inizio),
      slot: 'infrasettimanale',
      fase: 'league_phase',
      neutra: false,
    };
  });
  await db.partite.bulkAdd(partiteLP);
  await db.competizioni.put({ ...competizione, fase: 'league_phase', fasce: sorteggio.fasce, squadre: pool });
  contesto.competizioni.set(competizione.id, { ...competizione, fase: 'league_phase', fasce: sorteggio.fasce, squadre: pool });
  return true;
}

/** Ancore della stagione corrente (2026/27 reale, oltre = shift). */
async function ancoreCorrenti(): Promise<typeof STAGIONE_2026_27> {
  // Prima stagione: ancore reali 2026/27. Le stagioni successive usano lo shift
  // (ancoreStagioneSuccessiva) — il rollover passa le ancore esplicitamente.
  return STAGIONE_2026_27;
}

/** Quando la league phase termina: classifica + accoppiamenti playoff/ottavi. */
async function avanzaLeaguePhase(contesto: ContestoSimulazione, competizione: Competizione): Promise<void> {
  const config = CONFIG_PER_TIPO[competizione.tipo];
  const partite = await db.partite.where('competizioneId').equals(competizione.id).toArray();
  const lp = partite.filter((p) => p.fase === 'league_phase');
  if (lp.length === 0 || lp.some((p) => !p.giocata)) return;

  const playoffGiaFatti = partite.some((p) => p.fase === 'playoff' && p.giocata);
  if (playoffGiaFatti) return;

  const coefficienti = new Map<string, number>();
  const disciplinari = new Map<string, number>();
  const prestazioni = await db.prestazioni.where('competizioneId').equals(competizione.id).toArray();
  for (const s of competizione.squadre) {
    const squadra = contesto.squadre.get(s);
    coefficienti.set(s, squadra?.coefficiente ?? 0);
  }
  const perGiocatore = new Map<string, number>();
  for (const p of prestazioni) {
    perGiocatore.set(p.giocatoreId, (perGiocatore.get(p.giocatoreId) ?? 0) + puntiDisciplinari(p));
  }
  // Disciplinari per squadra (somma dei giocatori della rosa)
  for (const [squadraId, rosa] of contesto.giocatori) {
    let tot = 0;
    for (const g of rosa) tot += perGiocatore.get(g.id) ?? 0;
    disciplinari.set(squadraId, tot);
  }

  const classifica = classificaLeaguePhase(lp, competizione.squadre, coefficienti, disciplinari);
  const posizioni = new Map(classifica.map((r) => [r.squadraId, r.posizione]));
  await db.competizioni.put({
    ...competizione,
    fase: 'playoff',
    classifica: classifica.map((r) => ({ squadraId: r.squadraId, posizione: r.posizione })),
  });
  contesto.competizioni.set(competizione.id, {
    ...competizione,
    fase: 'playoff',
    classifica: classifica.map((r) => ({ squadraId: r.squadraId, posizione: r.posizione })),
  });

  const seed = seedSorteggio(contesto.carrieraId, competizione.stagione, `${competizione.tipo}-ko`);
  const sfidePlayoff = sorteggioPlayoffEliminazione(posizioni, seed);
  // Riempi i segnaposto playoff (8 sfide andata/ritorno)
  const segnaposto = partite
    .filter((p) => p.fase === 'playoff' && p.casa === SQUADRA_DA_ASSEGNARE)
    .sort((a, b) => a.giornata - b.giornata || a.gamba! - b.gamba!);
  let idx = 0;
  for (const p of segnaposto) {
    const sfida = sfidePlayoff[idx];
    if (!sfida) continue;
    const gamba1 = p.gamba === 1;
    await db.partite.put({
      ...p,
      casa: gamba1 ? sfida.nonTestaSerie : sfida.testaSerie,
      trasferta: gamba1 ? sfida.testaSerie : sfida.nonTestaSerie,
    });
    if (p.gamba === 2 || p.gamba === undefined) idx++;
  }
  void config;
}

/**
 * Avanza la settimana: simula TUTTE le partite CPU della settimana in tutte le
 * competizioni, aggiorna tabelloni/league phase, poi salta fino alla prossima
 * settimana con una partita dell'utente. Rende l'unità di tempo atomica.
 */
export async function avanzaSettimana(carrieraId: Id): Promise<{ settimana: number }> {
  return db.transaction(
    'rw',
    [db.partite, db.squadre, db.giocatori, db.prestazioni, db.competizioni, db.statoClub, db.carriere],
    async () => {
      const carriera = await db.carriere.get(carrieraId);
      const stato = await db.statoClub.get(carrieraId);
      if (!carriera || !stato) throw new Error('Carriera incompleta');

      const contesto = await caricaContesto(carrieraId);
      const stagione = carriera.stagione;

      // 1. Simula la settimana corrente (tutte le partite non giocate)
      let daSimulare = await partiteDellaSettimana(carrieraId, stato.settimanaCorrente);
      daSimulare = daSimulare.filter(
        (p) => !p.giocata && p.casa !== SQUADRA_DA_ASSEGNARE && p.trasferta !== SQUADRA_DA_ASSEGNARE,
      );
      const perCompetizione = new Map<Id, Partita[]>();
      for (const p of daSimulare) {
        const lista = perCompetizione.get(p.competizioneId) ?? [];
        lista.push(p);
        perCompetizione.set(p.competizioneId, lista);
      }
      for (const p of daSimulare) {
        const giocate = (perCompetizione.get(p.competizioneId) ?? []).filter((x) => x.giocata);
        await db.partite.put(await simulaPartitaCpu(contesto, p, stagione, giocate));
        const lista = perCompetizione.get(p.competizioneId)!;
        const agg = lista.find((x) => x.id === p.id)!;
        agg.giocata = true;
      }

      // 2. Progressione tabelloni + league phase (in ordine UCL → UEL → UECL)
      const ordine = ['champions_league', 'europa_league', 'conference_league'];
      const comps = [...contesto.competizioni.values()];
      for (const tipo of ordine) {
        for (const comp of comps.filter((c) => c.tipo === tipo)) {
          await generaLeaguePhaseSePronta(contesto, comp);
        }
      }
      for (const comp of comps) {
        if (comp.formato === 'league_phase') await avanzaLeaguePhase(contesto, comp);
        if (comp.formato === 'eliminazione_diretta' || comp.formato === 'league_phase') {
          await avanzaTabellone(contesto, comp);
        }
      }

      // 3. Salta fino alla prossima settimana con una partita dell'utente
      const prossime = await prossimePartiteUtente(carrieraId, carriera.squadraId);
      const prossimaSettimana = prossime[0]?.settimana;
      const ultimaSettimana = Math.max(0, ...(await db.partite.where('carrieraId').equals(carrieraId).toArray()).map((p) => p.settimana));
      let target = prossimaSettimana ?? ultimaSettimana + 1;
      if (!prossimaSettimana) target = ultimaSettimana + 1;

      // Simula le settimane intermedie vuote (nessuna partita utente)
      let corrente = stato.settimanaCorrente + 1;
      while (corrente < target) {
        const dellaSettimana = await partiteDellaSettimana(carrieraId, corrente);
        for (const p of dellaSettimana.filter(
          (x) => !x.giocata && x.casa !== SQUADRA_DA_ASSEGNARE && x.trasferta !== SQUADRA_DA_ASSEGNARE,
        )) {
          const lista = perCompetizione.get(p.competizioneId) ?? [];
          await db.partite.put(await simulaPartitaCpu(contesto, p, stagione, lista.filter((x) => x.giocata)));
          lista.push(p);
          perCompetizione.set(p.competizioneId, lista);
        }
        for (const tipo of ordine) {
          for (const comp of comps.filter((c) => c.tipo === tipo)) {
            await generaLeaguePhaseSePronta(contesto, comp);
          }
        }
        for (const comp of comps) {
          if (comp.formato === 'league_phase') await avanzaLeaguePhase(contesto, comp);
          if (comp.formato === 'eliminazione_diretta' || comp.formato === 'league_phase') {
            await avanzaTabellone(contesto, comp);
          }
        }
        corrente++;
      }

      // Finestra di mercato (decisione M4): se QUALSIASI settimana nel tratto
      // [corrente+1, target] cade in una finestra non ancora giocata, la modalità
      // mercato si attiva e il calendario resta congelato a quella settimana
      // (giorno 1). Il campionato riprende solo quando la finestra si chiude.
      // Nota: il tratto è già stato simulato sopra (settimane CPU vuote); la
      // finestra interrompe PRIMA delle partite dell'utente della settimana.
      let settimanaFinestra: number | null = null;
      for (let w = stato.settimanaCorrente + 1; w <= target; w++) {
        if (finestraDiSettimana(w) !== null) {
          settimanaFinestra = w;
          break;
        }
      }
      if (settimanaFinestra !== null && stato.giornoMercato === 0) {
        await db.statoClub.put({ ...stato, settimanaCorrente: settimanaFinestra, giornoMercato: 1 });
        await db.carriere.put({ ...carriera, updatedAt: Date.now() });
        return { settimana: settimanaFinestra, mercatoAttivo: true };
      }

      await db.statoClub.put({ ...stato, settimanaCorrente: target });
      await db.carriere.put({ ...carriera, updatedAt: Date.now() });
      return { settimana: target, mercatoAttivo: false };
    },
  );
}

// ---------------------------------------------------------------------------
// Fine stagione e rollover
// ---------------------------------------------------------------------------

/** Riepilogo di fine stagione (vincitori per competizione). */
export interface RiepilogoStagione {
  stagione: string;
  vincitori: Array<{ competizione: string; squadra: string }>;
  retrocesse?: string[];
  accessi: Array<{ squadra: string; competizione: string }>;
}

/** Conclude la stagione: registra i vincitori (fase 'conclusa'). */
export async function concludiStagione(carrieraId: Id): Promise<RiepilogoStagione> {
  return db.transaction('rw', [db.competizioni, db.partite, db.squadre], async () => {
    const carriera = await db.carriere.get(carrieraId);
    if (!carriera) throw new Error('Carriera inesistente');
    const contesto = await caricaContesto(carrieraId);
    const comps = [...contesto.competizioni.values()].filter((c) => c.stagione === carriera.stagione);
    const vincitori: RiepilogoStagione['vincitori'] = [];
    for (const comp of comps) {
      const partite = await db.partite.where('competizioneId').equals(comp.id).toArray();
      // Vincitrice: finale per le coppe, classifica per i gironi/league phase
      let vincitoreId: Id | null = null;
      if (comp.formato === 'girone') {
        const classifica = calcolaClassifica(partite.filter((p) => p.giocata), comp.squadre);
        vincitoreId = classifica[0]?.squadraId ?? null;
      } else if (comp.formato === 'league_phase') {
        const lp = partite.filter((p) => p.fase === 'league_phase' && p.giocata);
        const classifica = classificaLeaguePhase(lp, comp.squadre, new Map(comp.squadre.map((s) => [s, contesto.squadre.get(s)?.coefficiente ?? 0])), new Map());
        vincitoreId = classifica[0]?.squadraId ?? null;
      } else {
        const finale = partite.filter((p) => p.fase === 'finale' && p.giocata);
        const f = finale[0];
        if (f) {
          if (f.golCasa > f.golTrasferta) vincitoreId = f.casa;
          else if (f.golTrasferta > f.golCasa) vincitoreId = f.trasferta;
          else if (f.rigori) vincitoreId = f.rigori.casa > f.rigori.trasferta ? f.casa : f.trasferta;
        }
      }
      if (vincitoreId) {
        await db.competizioni.put({ ...comp, fase: 'conclusa', vincitoreId });
        vincitori.push({ competizione: comp.nome, squadra: contesto.squadre.get(vincitoreId)?.nome ?? '—' });
      } else {
        await db.competizioni.put({ ...comp, fase: 'conclusa' });
      }
    }

    // Accessi della prossima stagione (lega utente + vincitrici coppe)
    const legaComp = comps.find((c) => c.tipo === 'campionato' && c.squadre.includes(carriera.squadraId));
    const accessi: RiepilogoStagione['accessi'] = [];
    if (legaComp) {
      const partite = await db.partite.where('competizioneId').equals(legaComp.id).toArray();
      const classifica = calcolaClassifica(partite.filter((p) => p.giocata), legaComp.squadre);
      const coppaComp = comps.find((c) => c.tipo === 'coppa_nazionale' && c.squadre.includes(carriera.squadraId));
      const nomi = new Map(classifica.map((r) => [r.squadraId, contesto.squadre.get(r.squadraId)?.nome ?? '—']));
      const daCoppa = coppaComp?.vincitoreId ?? null;
      const prossimi = accessiStagioneSuccessiva({
        lega: legaComp.nome,
        classifica,
        vincitriceCoppaNazionale: daCoppa,
        campioneUcl: null,
        campioneUel: null,
        campioneUecl: null,
        nomi,
      });
      accessi.push(...prossimi.map((a) => ({ squadra: a.squadra, competizione: a.competizione })));
    }

    return { stagione: carriera.stagione, vincitori, accessi };
  });
}

/**
 * Avvia la stagione successiva: aggiorna i coefficienti (finestra 5 stagioni),
 * RITIRI (PRD 7.5: tabella probabilità × condizione), CRESCITA dei giocatori
 * (minuti + età + potenziale + forma, con code di distribuzione) e rientro
 * prestiti; poi reset stagionali, etichetta stagione, accessi europei e
 * generazione di TUTTE le competizioni della nuova stagione + intake vivaio
 * (1 prospetto per club reale + rigenerati 1:1, nomi SOLO LLM).
 */
export async function iniziaStagioneSuccessiva(carrieraId: Id): Promise<void> {
  const carriera = await db.carriere.get(carrieraId);
  if (!carriera) throw new Error('Carriera incompleta');
  const nuovaStagione = prossimaStagione(carriera.stagione);

  // Vivaio (PRD 7.5): ritiri (processati sempre) → crescita mondo → intake (all-or-nothing)
  await eseguiRitiri(carrieraId);
  await applicaCrescitaStagionale(carrieraId);

  await db.transaction('rw', [db.carriere, db.statoClub, db.giocatori, db.squadre, db.squadAssignments], async () => {
    const stato = await db.statoClub.get(carrieraId);
    if (!stato) throw new Error('Carriera incompleta');

    // Reset stagionale giocatori
    const giocatori = await db.giocatori.where('carrieraId').equals(carrieraId).toArray();
    const resettati = giocatori.map((g) => {
      const r = resetStagionaleGiocatore(g.morale, g.fiducia, g.forma);
      return { ...g, minutiStagione: r.minutiStagione, morale: r.morale, fiducia: r.fiducia, forma: r.forma };
    });
    await db.giocatori.bulkPut(resettati);

    // Svincolati (decisione Q11): i contratti scaduti alla fine della stagione
    // appena conclusa vengono chiusi — il giocatore resta firmabile a zero.
    const assegnazioni = await db.squadAssignments.where('carrieraId').equals(carrieraId).toArray();
    for (const g of resettati) {
      if (g.scadenzaContratto !== carriera.stagione) continue;
      const proprieta = assegnazioni.find(
        (a) => a.giocatoreId === g.id && a.tipo === 'proprieta' && a.al === undefined,
      );
      if (proprieta) {
        await db.squadAssignments.put({ ...proprieta, al: carriera.stagione });
      }
    }

    await db.carriere.put({ ...carriera, stagione: nuovaStagione, updatedAt: Date.now() });
    await db.statoClub.put({ ...stato, settimanaCorrente: 1, giornoMercato: 0 });
  });

  // Intake vivaio: tenta subito (se LLM offline resta 'in_attesa' con avviso).
  // Mai bloccare l'avvio della stagione: un errore dell'intake non tocca il resto.
  try {
    await generaIntake(carrieraId, nuovaStagione);
  } catch {
    // intake non bloccante: il Vivaio mostra il banner e consente il retry
  }

  // Seconda fase: calcola gli accessi dalla stagione appena conclusa e genera
  // la nuova stagione (transazione separata: legge lo stato finale).
  await db.transaction('rw', [db.competizioni, db.partite, db.squadre], async () => {
    const carriera = await db.carriere.get(carrieraId);
    if (!carriera) throw new Error('Carriera incompleta');
    const contesto = await caricaContesto(carrieraId);
    const comps = [...contesto.competizioni.values()].filter((c) => c.fase === 'conclusa');

    // Campioni in carica (dalla stagione conclusa)
    const vincitore = (tipo: string): string | null => {
      const comp = comps.find((c) => c.tipo === tipo);
      if (!comp?.vincitoreId) return null;
      return contesto.squadre.get(comp.vincitoreId)?.nome ?? null;
    };
    const campioneUcl = vincitore('champions_league') ?? 'Paris Saint-Germain';
    const campioneUel = vincitore('europa_league') ?? 'Aston Villa';

    // Campioni e vincitrici coppe nazionali (dalla stagione conclusa)
    const campioniNazionali: Record<string, string> = {};
    const vincitriciCoppe: Record<string, string> = {};
    for (const comp of comps) {
      if (!comp.vincitoreId) continue;
      const nome = contesto.squadre.get(comp.vincitoreId)?.nome ?? '';
      if (comp.tipo === 'campionato') {
        const nazione = contesto.squadre.get(comp.vincitoreId)?.nazione ?? '';
        if (nazione) campioniNazionali[nazione] = nome;
      } else if (comp.tipo === 'coppa_nazionale') {
        const nazione = comp.nome.replace(/^Coppa /, '');
        vincitriciCoppe[nazione] = nome;
      }
    }

    // Accessi europei per TUTTE le leghe (piazzamenti finali simulati)
    const accessi: AccessoEuropeo[] = [];
    const leghe = comps.filter((c) => c.tipo === 'campionato');
    for (const lega of leghe) {
      const partite = await db.partite.where('competizioneId').equals(lega.id).toArray();
      const classifica = calcolaClassifica(partite.filter((p) => p.giocata), lega.squadre);
      const nazione = contesto.squadre.get(lega.squadre[0]!)?.nazione ?? '';
      const coppaNazionale = comps.find(
        (c) => c.tipo === 'coppa_nazionale' && c.squadre.some((s) => lega.squadre.includes(s)),
      );
      const nomi = new Map(classifica.map((r) => [r.squadraId, contesto.squadre.get(r.squadraId)?.nome ?? '—']));
      const prossimi = accessiStagioneSuccessiva({
        lega: lega.nome,
        classifica,
        vincitriceCoppaNazionale: coppaNazionale?.vincitoreId ?? null,
        campioneUcl: null,
        campioneUel: null,
        campioneUecl: null,
        nomi,
      });
      accessi.push(...prossimi);
      if (nazione && lega.squadre.includes(carriera.squadraId)) {
        campioniNazionali[nazione] = nomi.get(classifica[0]?.squadraId ?? '') ?? '';
      }
    }

    // Ancore della nuova stagione (shift dalle date reali 2026/27)
    let ancore = STAGIONE_2026_27;
    const indiceStagione = Number(carriera.stagione.split('/')[0]) - 2026;
    for (let i = 0; i < Math.max(0, indiceStagione); i++) ancore = ancoreStagioneSuccessiva(ancore);

    await creaStagioneCompleta({
      carrieraId,
      stagione: carriera.stagione,
      legaUtente: carriera.campionato,
      nazioneUtente: contesto.squadre.get(carriera.squadraId)?.nazione ?? '',
      squadraUtenteId: carriera.squadraId,
      ancore,
      accessi,
      vincitriciCoppe,
      campioniNazionali,
      campioneUcl,
      campioneUel,
    });
  });
}

// Ri-esporta per comodità di UI
export { nomeFaseLeggibile };
export type { RigaClassifica };
