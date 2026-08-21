// FLM — Persistenza vivaio (PRD 7.5): ritiri, intake, crescita, prestiti, backfill.
// Regola 1 AGENTS.md: ogni dato persistente passa da qui (Dexie).
// Regola 2: l'LLM si chiama SOLO tramite src/llm (nomi intake, narrativa).
// Regola 3: i NUMERI (profili, ritiri, crescita, destinazioni) vengono da
// src/engine/vivaio.ts e src/engine/attributi.ts — qui solo orchestrazione.
//
// Flusso concordato (intervista): intake all-or-nothing con nomi SOLO LLM
// (offline → 'in_attesa' su StatoClub, avviso + Riprova), ritiri processati
// comunque, mondo che invecchia +1, crescita con code di distribuzione,
// verifica forma ogni 5 partite, prestiti per tutti con rientro automatico.

import { db, newId } from './database';
import { parseBootstrapCsv, attributiDaRiga, type CsvParseResult } from './bootstrap';
import { DOCS_CSV } from './autoimport';
import { generaNarrativaProspetto, generaNomiIntake } from '../llm';
import { assertLLMDisponibile } from '../llm/connectivity';
import { prng } from '../engine/random';
import {
  applicaDeltaOverall,
  applicaVerificaForma,
  prossimoPesId,
  nomePosizionePes,
} from '../engine/attributi';
import {
  deltaCrescitaAnnuale,
  giocatoreDaProfilo,
  mediaVotiFinestra,
  minutiPrestitoSimulati,
  profiloProspetto,
  profiloRigenerato,
  ritiroDeciso,
  scegliClubPrestito,
} from '../engine/vivaio';
import { prossimaStagione } from '../engine/competizioni/fineStagione';
import {
  FORMA_FINESTRA_GIU,
  FORMA_FINESTRA_SU,
  FORMA_FINESTRA_VOTI,
  REGEN_TUO_INTAKE_PROB,
  clamp,
} from '../engine/rules';
import { dataFineStagioneEditor, DATA_VUOTA_EDITOR } from '../bridge/csv';
import type { Giocatore, Id, Notizia, SquadAssignment, Squadra } from '../types/entities';

// ---------------------------------------------------------------------------
// Backfill (carriere esistenti create prima del vivaio)
// ---------------------------------------------------------------------------

function urlDoc(kind: keyof typeof DOCS_CSV): string {
  const base = import.meta.env.BASE_URL;
  const radice = base.endsWith('/') ? base : `${base}/`;
  return `${radice}docs/${encodeURIComponent(DOCS_CSV[kind])}`;
}

/**
 * Backfill idempotente: attributi 151 colonne per i giocatori che non li hanno
 * (carriere esistenti create prima del vivaio) + numeri maglia dalle rose.
 * Si lancia una volta all'avvio dell'app; i CSV in docs/ sono sempre disponibili.
 */
export async function backfillAttributiENumeri(): Promise<{ giocatori: number; rose: number }> {
  let aggiornati = 0;
  let rose = 0;

  // 1. Attributi mancanti (carriere create prima del vivaio)
  const senzaAttributi = (await db.giocatori.toArray()).filter((g) => !g.attributi);
  if (senzaAttributi.length > 0) {
    const response = await fetch(urlDoc('giocatori'));
    if (response.ok) {
      const parsed: CsvParseResult = parseBootstrapCsv(await response.text(), 'giocatori', DOCS_CSV.giocatori);
      if (parsed.headerErrors.length === 0) {
        const attributiPerPesId = new Map<number, ReturnType<typeof attributiDaRiga>>();
        for (const row of parsed.rows) {
          const pesId = Number(row.values['Id']);
          if (Number.isFinite(pesId)) {
            attributiPerPesId.set(pesId, attributiDaRiga(row, Number(row.values['OverallStats']) || 60));
          }
        }
        const daScrivere: Giocatore[] = [];
        for (const g of senzaAttributi) {
          if (g.pesId === null) continue;
          const attributi = attributiPerPesId.get(g.pesId);
          if (attributi) {
            daScrivere.push({ ...g, attributi });
            aggiornati++;
          }
        }
        const CHUNK = 2000;
        for (let i = 0; i < daScrivere.length; i += CHUNK) {
          await db.giocatori.bulkPut(daScrivere.slice(i, i + CHUNK));
        }
      }
    }
  }

  // 2. Numeri maglia dal Roster originale (slot → numero)
  const senzaNumeri = (await db.squadAssignments.toArray()).filter((a) => a.numeroMaglia === undefined);
  if (senzaNumeri.length > 0) {
    const nomeRoster = 'Roster - PES 2021 - Edit.csv';
    const base = import.meta.env.BASE_URL;
    const radice = base.endsWith('/') ? base : `${base}/`;
    const response = await fetch(`${radice}docs/${encodeURIComponent(nomeRoster)}`);
    if (response.ok) {
      const parsedR = parseBootstrapCsv(await response.text(), 'roster', nomeRoster);
      if (parsedR.headerErrors.length === 0) {
        const giocatori = await db.giocatori.toArray();
        const squadre = await db.squadre.toArray();
        const pesIdGiocatore = new Map(giocatori.map((g) => [g.pesId, g.id]));
        const pesIdSquadra = new Map(squadre.map((s) => [s.pesId, s.id]));
        const daScrivere: SquadAssignment[] = [];
        for (const row of parsedR.rows) {
          const teamPesId = Number(row.values['Id']);
          const squadraId = pesIdSquadra.get(teamPesId);
          if (!squadraId) continue;
          for (let slot = 1; slot <= 40; slot++) {
            const playerPesId = Number(row.values[`Player${slot}`]);
            const numero = Number(row.values[`Number${slot}`]);
            if (!Number.isFinite(playerPesId) || playerPesId === 0) continue;
            const giocatoreId = pesIdGiocatore.get(playerPesId);
            if (!giocatoreId || !Number.isFinite(numero) || numero === 0) continue;
            const a = senzaNumeri.find((x) => x.giocatoreId === giocatoreId && x.squadraId === squadraId);
            if (a) {
              daScrivere.push({ ...a, numeroMaglia: numero });
              rose++;
            }
          }
        }
        const CHUNK = 2000;
        for (let i = 0; i < daScrivere.length; i += CHUNK) {
          await db.squadAssignments.bulkPut(daScrivere.slice(i, i + CHUNK));
        }
      }
    }
  }

  return { giocatori: aggiornati, rose };
}

// ---------------------------------------------------------------------------
// Ritiri (fine stagione: tabella probabilità × condizione, decisione utente)
// ---------------------------------------------------------------------------

export interface EsitoRitiri {
  ritirati: Giocatore[];
  notizie: number;
}

/** Processa i ritiri della stagione appena conclusa; i rigenerati li fa l'intake. */
export async function eseguiRitiri(carrieraId: Id): Promise<EsitoRitiri> {
  return db.transaction('rw', [db.giocatori, db.notizie], async () => {
    const carriera = await db.carriere.get(carrieraId);
    if (!carriera) throw new Error('Carriera inesistente');
    const giocatori = await db.giocatori.where('carrieraId').equals(carrieraId).toArray();
    const stagioneRegen = prossimaStagione(carriera.stagione);

    const ritirati: Giocatore[] = [];
    const daScrivere: Giocatore[] = [];
    for (const g of giocatori) {
      if (g.eta < 33 || g.ritiratoIn) continue;
      const rand = prng(hashSeed(`${carrieraId}|ritiro|${g.id}|${stagioneRegen}`));
      if (ritiroDeciso({ eta: g.eta, forma: g.forma, rand })) {
        daScrivere.push({ ...g, ritiratoIn: stagioneRegen });
        ritirati.push(g);
      }
    }
    await db.giocatori.bulkPut(daScrivere);

    // Notizie: elenchi brevi (una notizia ogni 8 nomi)
    const notizie: Notizia[] = [];
    for (let i = 0; i < ritirati.length; i += 8) {
      const fetta = ritirati.slice(i, i + 8);
      notizie.push({
        id: newId(),
        carrieraId,
        settimana: 1,
        testo: `Fine carriera: ${fetta.map((g) => `${g.nome} (${g.eta} anni, ${g.ruolo})`).join(', ')}${fetta.length < ritirati.length - i ? ', ...' : ''} salutano il calcio giocato.`,
        origine: 'engine',
      });
    }
    if (notizie.length > 0) await db.notizie.bulkAdd(notizie);

    return { ritirati, notizie: notizie.length };
  });
}

// ---------------------------------------------------------------------------
// Intake annuale (all-or-nothing: nomi SOLO LLM, decisione utente)
// ---------------------------------------------------------------------------

export type EsitoIntake =
  | { esito: 'generato'; nuovi: number; regen: number; narrativa: number }
  | { esito: 'in_attesa'; motivo: string }
  | { esito: 'gia_fatto' };

export async function generaIntake(carrieraId: Id, stagioneRiferimento?: string): Promise<EsitoIntake> {
  await assertLLMDisponibile();
  // ---------- Fase A: profili + nomi LLM (fuori transazione: rete) ----------
  const carriera = await db.carriere.get(carrieraId);
  const stato = await db.statoClub.get(carrieraId);
  if (!carriera || !stato) return { esito: 'in_attesa', motivo: 'Carriera incompleta' };
  const stagione = stagioneRiferimento ?? carriera.stagione;
  if (stato.intakeStato === 'generato' && stato.intakeStagione === stagione) return { esito: 'gia_fatto' };

  const [squadre, giocatori, assegnazioni] = await Promise.all([
    db.squadre.where('carrieraId').equals(carrieraId).toArray(),
    db.giocatori.where('carrieraId').equals(carrieraId).toArray(),
    db.squadAssignments.where('carrieraId').equals(carrieraId).toArray(),
  ]);
  const clubReali = squadre.filter((s) => !s.ombra && !s.nazionale && s.pesId !== null);
  const ritirati = giocatori.filter((g) => g.ritiratoIn === stagione);

  // Profili prospetti: 1 per club reale (decisione utente: la tua squadra come le altre)
  const profili = clubReali.map((club) => profiloProspetto({ carrieraId, stagione, club, indice: 0 }));

  // Profili rigenerati: 1:1 coi ritirati, distribuiti (50% nel tuo intake se era tuo)
  const squadraUtenteId = carriera.squadraId;
  const regenClub = new Map<Id, Array<{ profilo: import('../engine/vivaio').ProfiloVivaio; ritirato: Giocatore }>>();
  for (let ri = 0; ri < ritirati.length; ri++) {
    const ritirato = ritirati[ri]!;
    const rand = prng(hashSeed(`${carrieraId}|regen|${stagione}|${ri}`));
    const eraTuo = assegnazioni.some(
      (a) => a.giocatoreId === ritirato.id && a.squadraId === squadraUtenteId && a.tipo === 'proprieta' && a.al === undefined,
    );
    let club: Squadra | null = null;
    if (eraTuo && rand() < REGEN_TUO_INTAKE_PROB) {
      club = clubReali.find((s) => s.id === squadraUtenteId) ?? null;
    }
    if (!club) {
      club = clubReali[Math.floor(rand() * clubReali.length)] ?? null;
    }
    if (!club) continue;
    const profilo = profiloRigenerato({ carrieraId, stagione, ritirato, club, indice: ri });
    const lista = regenClub.get(club.id) ?? [];
    lista.push({ profilo, ritirato });
    regenClub.set(club.id, lista);
  }

  // PES ID: univoci in TUTTO il DB (l'EDIT file è condiviso tra carriere)
  const tuttiPesId = (await db.giocatori.toArray()).map((g) => g.pesId);
  const nuoviProfili: Array<{ profilo: import('../engine/vivaio').ProfiloVivaio; club: Squadra; pesId: number }> = [];
  for (let i = 0; i < profili.length; i++) {
    const club = clubReali[i]!;
    nuoviProfili.push({ profilo: profili[i]!, club, pesId: prossimoPesId(tuttiPesId) });
    tuttiPesId.push(nuoviProfili[nuoviProfili.length - 1]!.pesId);
  }
  for (const [clubId, lista] of regenClub) {
    const club = clubReali.find((s) => s.id === clubId);
    if (!club) continue;
    for (const item of lista) {
      nuoviProfili.push({ profilo: item.profilo, club, pesId: prossimoPesId(tuttiPesId) });
      tuttiPesId.push(nuoviProfili[nuoviProfili.length - 1]!.pesId);
    }
  }

  // Nomi: SOLO LLM (decisione utente). Un chunk fallito = intake in attesa.
  const richieste = nuoviProfili.map((p) => ({
    id: `pes-player-${p.pesId}`,
    nazione: p.profilo.nazionalita,
    eta: p.profilo.eta,
    ruolo: p.profilo.ruolo,
    posizione: nomePosizionePes(p.profilo.pos),
  }));
  const nomiEsistenti = giocatori.map((g) => g.nome);
  const nomi = await generaNomiIntake(richieste, nomiEsistenti);
  if (nomi === null) {
    await db.statoClub.put({
      ...stato,
      intakeStato: 'in_attesa',
      intakeStagione: stagione,
      intakeMotivo: 'LLM non raggiungibile: intake in attesa. Riprova quando torna online.',
    });
    return { esito: 'in_attesa', motivo: 'LLM offline' };
  }

  // Unicità nomi: collisioni con nomi esistenti → un retry per i soli collisionati
  const esistenti = new Set(nomiEsistenti);
  const collisionati: number[] = [];
  nomi.giocatori.forEach((g, i) => {
    if (esistenti.has(g.nome) || g.nome === '') collisionati.push(i);
  });
  let nomiFinali = nomi.giocatori;
  if (collisionati.length > 0) {
    const retry = await generaNomiIntake(
      collisionati.map((i) => ({ ...richieste[i]!, id: `retry-${i}` })),
      nomiEsistenti,
    );
    if (retry) {
      const perId = new Map(retry.giocatori.map((g) => [g.id, g.nome]));
      nomiFinali = nomi.giocatori.map((g, i) =>
        collisionati.includes(i) ? { id: g.id, nome: perId.get(`retry-${i}`) ?? g.nome } : g,
      );
    }
  }

  // Narrativa per il prospetto della TUA squadra + rigenerati arrivati a te
  const narrativa = new Map<string, { miniStoria: string; parereScout: string }>();
  const miei = nuoviProfili.filter((p) => p.club.id === squadraUtenteId);
  for (const p of miei.slice(0, 3)) {
    const nome = nomiFinali.find((n) => n.id === `pes-player-${p.pesId}`)?.nome ?? '';
    if (!nome) continue;
    const testo = await generaNarrativaProspetto({
      nome,
      eta: p.profilo.eta,
      nazione: p.profilo.nazionalita,
      posizione: nomePosizionePes(p.profilo.pos),
      overall: p.profilo.overall,
      club: clubReali.find((s) => s.id === squadraUtenteId)?.nome ?? '',
      potenziale: p.profilo.potenziale >= 85 ? 'alto' : p.profilo.potenziale >= 78 ? 'buono' : 'medio',
      origine: 'prospetto del vivaio',
    });
    if (testo) narrativa.set(`pes-player-${p.pesId}`, testo);
  }

  // ---------- Fase B: applicazione (transazione breve) ----------
  return db.transaction('rw', [db.statoClub, db.giocatori, db.squadAssignments, db.notizie], async () => {
    const statoCorrente = await db.statoClub.get(carrieraId);
    if (!statoCorrente) return { esito: 'in_attesa', motivo: 'Stato carriera mancante' };
    if (statoCorrente.intakeStato === 'generato' && statoCorrente.intakeStagione === stagione) {
      return { esito: 'gia_fatto' };
    }

    const daCreare: Giocatore[] = [];
    const assegnazioniNuove: SquadAssignment[] = [];
    let regen = 0;
    for (let i = 0; i < nuoviProfili.length; i++) {
      const p = nuoviProfili[i]!;
      const nome = nomiFinali[i]?.nome ?? '';
      if (!nome) continue;
      const g = giocatoreDaProfilo({
        carrieraId,
        profilo: p.profilo,
        pesId: p.pesId,
        nome,
        stagione,
        club: p.club,
        indice: i,
      });
      const narr = narrativa.get(`pes-player-${p.pesId}`);
      if (narr) {
        g.miniStoria = narr.miniStoria;
        g.parereScout = narr.parereScout;
      }
      if (regenClub.has(p.club.id) && i >= profili.length) regen++;
      daCreare.push(g);
      assegnazioniNuove.push({
        id: newId(),
        carrieraId,
        giocatoreId: g.id,
        squadraId: p.club.id,
        tipo: 'proprieta',
        dal: stagione,
      });
    }

    const CHUNK = 2000;
    for (let i = 0; i < daCreare.length; i += CHUNK) {
      await db.giocatori.bulkAdd(daCreare.slice(i, i + CHUNK));
      await db.squadAssignments.bulkAdd(assegnazioniNuove.slice(i, i + CHUNK));
    }

    // Notizia intake (la tua squadra in evidenza)
    const mieiNomi = daCreare
      .filter((g) => assegnazioniNuove.some((a) => a.giocatoreId === g.id && a.squadraId === squadraUtenteId))
      .map((g) => g.nome);
    const notizia: Notizia = {
      id: newId(),
      carrieraId,
      settimana: 1,
      testo:
        `Settore giovanile: ${daCreare.length} nuovi prospetti entrano nei vivai di tutto il mondo${mieiNomi.length > 0 ? `, ${mieiNomi.length} nel tuo: ${mieiNomi.join(', ')}` : ''}. ${regen > 0 ? `${regen} rigenerati pronti a rinascere.` : ''}`,
      origine: 'engine',
    };
    await db.notizie.add(notizia);

    await db.statoClub.put({ ...statoCorrente, intakeStato: 'generato', intakeStagione: stagione, intakeMotivo: undefined });
    return { esito: 'generato', nuovi: daCreare.length, regen, narrativa: narrativa.size };
  });
}

// ---------------------------------------------------------------------------
// Crescita stagionale + invecchiamento + rientro prestiti
// ---------------------------------------------------------------------------

/**
 * Applica a fine stagione: rientro prestiti (minuti simulati + chiusura),
 * invecchiamento +1 per tutti, crescita/declino con code di distribuzione.
 * I numeri (minuti simulati CPU, forma stagionale) sono deterministici.
 */
export async function applicaCrescitaStagionale(carrieraId: Id): Promise<void> {
  await db.transaction('rw', [db.giocatori, db.squadre, db.squadAssignments, db.partite, db.prestazioni], async () => {
    const carriera = await db.carriere.get(carrieraId);
    if (!carriera) throw new Error('Carriera inesistente');
    const [giocatori, squadre, assegnazioni, partite, prestazioni] = await Promise.all([
      db.giocatori.where('carrieraId').equals(carrieraId).toArray(),
      db.squadre.where('carrieraId').equals(carrieraId).toArray(),
      db.squadAssignments.where('carrieraId').equals(carrieraId).toArray(),
      db.partite.where('carrieraId').equals(carrieraId).toArray(),
      db.prestazioni.where('carrieraId').equals(carrieraId).toArray(),
    ]);

    const gPerId = new Map(giocatori.map((g) => [g.id, g]));
    const sPerId = new Map(squadre.map((s) => [s.id, s]));

    // 1. Rientro prestiti: minuti simulati + chiusura assegnazioni + LoanUntil pulito
    const prestitiAttivi = assegnazioni.filter((a) => a.tipo === 'prestito' && a.al === undefined);
    const daAggiornare = new Map<Id, Giocatore>();
    for (const a of prestitiAttivi) {
      const g = gPerId.get(a.giocatoreId);
      const club = sPerId.get(a.squadraId);
      if (!g || !club) continue;
      const rand = prng(hashSeed(`${carrieraId}|prestito|${g.id}|${carriera.stagione}`));
      const rosaClub = giocatori.filter((x) =>
        assegnazioni.some((as) => as.squadraId === club.id && as.giocatoreId === x.id && as.tipo === 'proprieta' && as.al === undefined),
      );
      const mediaClub = rosaClub.length === 0 ? 65 : rosaClub.reduce((s, x) => s + x.overall, 0) / rosaClub.length;
      const minuti = minutiPrestitoSimulati({ overall: g.overall, mediaOverallClub: mediaClub, rand });
      const aggiornato: Giocatore = {
        ...g,
        minutiPrestitoStagione: minuti,
        attributi: g.attributi ? { ...g.attributi, LoanUntil: DATA_VUOTA_EDITOR } : g.attributi,
      };
      daAggiornare.set(g.id, aggiornato);
      await db.squadAssignments.put({ ...a, al: carriera.stagione });
    }

    // 2. Risultati squadre per la forma stagionale CPU (win rate)
    const partiteGiocate = partite.filter((p) => p.giocata);
    const winRate = new Map<Id, number>();
    for (const s of squadre) {
      const proprie = partiteGiocate.filter((p) => p.casa === s.id || p.trasferta === s.id);
      if (proprie.length === 0) continue;
      const punti = proprie.reduce((tot, p) => {
        if (p.casa === s.id) return tot + (p.golCasa > p.golTrasferta ? 3 : p.golCasa === p.golTrasferta ? 1 : 0);
        return tot + (p.golTrasferta > p.golCasa ? 3 : p.golTrasferta === p.golCasa ? 1 : 0);
      }, 0);
      winRate.set(s.id, punti / (proprie.length * 3));
    }

    // 3. Crescita per giocatore (no ritirati, no creati quest'anno)
    const votiPerGiocatore = new Map<Id, number[]>();
    for (const pr of prestazioni) {
      const lista = votiPerGiocatore.get(pr.giocatoreId) ?? [];
      lista.push(pr.voto);
      votiPerGiocatore.set(pr.giocatoreId, lista);
    }

    const daScrivere: Giocatore[] = [];
    for (const g of giocatori) {
      if (g.ritiratoIn) continue;
      const rand = prng(hashSeed(`${carrieraId}|crescita|${g.id}|${carriera.stagione}`));
      const inPrestito = daAggiornare.get(g.id);
      let minuti = (inPrestito?.minutiPrestitoStagione ?? 0) + g.minutiStagione;

      // Minuti SIMULATI per i giocatori del mondo CPU (nessun referto reale):
      // titolare se overall ≥ media rosa della sua squadra, altrimenti panchina.
      // I giocatori della TUA squadra usano i minuti reali dai referti.
      const miaSquadraAssegnazione = assegnazioni.find(
        (a) => a.giocatoreId === g.id && a.tipo === 'proprieta' && a.al === undefined && a.squadraId === carriera.squadraId,
      );
      if (!miaSquadraAssegnazione && !inPrestito && minuti === 0) {
        const clubAssegnazione = assegnazioni.find(
          (a) => a.giocatoreId === g.id && a.tipo === 'proprieta' && a.al === undefined,
        );
        const club = clubAssegnazione ? sPerId.get(clubAssegnazione.squadraId) : undefined;
        if (club) {
          const rosaClub = giocatori.filter((x) =>
            assegnazioni.some((as) => as.squadraId === club.id && as.giocatoreId === x.id && as.tipo === 'proprieta' && as.al === undefined),
          );
          const mediaClub = rosaClub.length === 0 ? 65 : rosaClub.reduce((s, x) => s + x.overall, 0) / rosaClub.length;
          minuti = minutiPrestitoSimulati({ overall: g.overall, mediaOverallClub: mediaClub, rand });
        }
      }

      // Forma stagionale: voti reali (tua squadra) o simulata (mondo CPU)
      let formaMedia: number;
      const voti = votiPerGiocatore.get(g.id);
      if (voti && voti.length > 0) {
        const mediaVoto = voti.reduce((s, v) => s + v, 0) / voti.length;
        formaMedia = clamp(Math.round(50 + (mediaVoto - 6.5) * 15), 20, 90);
      } else {
        const miaSquadra = assegnazioni.find(
          (a) => a.giocatoreId === g.id && (a.tipo === 'proprieta' || a.tipo === 'prestito') && a.al === undefined,
        );
        const squadra = miaSquadra ? sPerId.get(miaSquadra.squadraId) : undefined;
        const wr = squadra ? (winRate.get(squadra.id) ?? 0.4) : 0.4;
        formaMedia = Math.round(clamp(38 + wr * 30 + (rand() * 2 - 1) * 10, 25, 80));
      }

      // Potenziale/soffitto: nascosti per i creati FLM, sintetizzati per gli altri
      let potenziale = g.potenziale;
      let soffittoReale = g.soffittoReale;
      if (potenziale === undefined || soffittoReale === undefined) {
        potenziale = Math.min(92, Math.max(68, g.overall + 8 + Math.round(rand() * 10)));
        soffittoReale = Math.min(99, Math.max(potenziale, Math.round(potenziale * (0.9 + rand() * 0.15))));
      }

      const delta = deltaCrescitaAnnuale({
        eta: g.eta,
        minuti,
        overall: g.overall,
        potenziale,
        soffittoReale,
        formaMedia,
        rand,
      });

      let overall = Math.min(99, Math.max(40, g.overall + delta));
      let attributi = g.attributi;
      if (g.attributi) {
        const pos = g.attributi.POS;
        const randAttr = prng(hashSeed(`${carrieraId}|attr|${g.id}|${carriera.stagione}|${delta}`));
        attributi = applicaDeltaOverall(g.attributi, pos, delta, randAttr);
        overall = attributi.OverallStats;
      }

      const aggiornato: Giocatore = {
        ...(inPrestito ?? g),
        eta: g.eta + 1,
        overall,
        attributi,
        potenziale,
        soffittoReale,
        formaMediaStagione: formaMedia,
        minutiPrestitoStagione: 0,
      };
      daScrivere.push(aggiornato);
    }

    const CHUNK = 2000;
    for (let i = 0; i < daScrivere.length; i += CHUNK) {
      await db.giocatori.bulkPut(daScrivere.slice(i, i + CHUNK));
    }
  });
}

// ---------------------------------------------------------------------------
// Prestiti (tutti i giocatori, destinazione scelta dall'engine, rientro automatico)
// ---------------------------------------------------------------------------

export interface EsitoPrestito {
  ok: boolean;
  errori?: string[];
  club?: string;
}

/** Prestito del giocatore scelto: l'engine sceglie la destinazione (decisione utente). */
export async function eseguiPrestitoUtente(carrieraId: Id, giocatoreId: Id): Promise<EsitoPrestito> {
  return db.transaction('rw', [db.statoClub, db.carriere, db.giocatori, db.squadre, db.squadAssignments, db.transferLedger], async () => {
    const [carriera, stato, giocatori, squadre, assegnazioni] = await Promise.all([
      db.carriere.get(carrieraId),
      db.statoClub.get(carrieraId),
      db.giocatori.where('carrieraId').equals(carrieraId).toArray(),
      db.squadre.where('carrieraId').equals(carrieraId).toArray(),
      db.squadAssignments.where('carrieraId').equals(carrieraId).toArray(),
    ]);
    if (!carriera || !stato) return { ok: false, errori: ['Carriera inesistente'] };
    const g = giocatori.find((x) => x.id === giocatoreId);
    if (!g) return { ok: false, errori: ['Giocatore inesistente'] };

    const proprieta = assegnazioni.find(
      (a) => a.giocatoreId === giocatoreId && a.tipo === 'proprieta' && a.al === undefined,
    );
    if (!proprieta || proprieta.squadraId !== carriera.squadraId) {
      return { ok: false, errori: ['Puoi prestare solo i tuoi giocatori'] };
    }
    const giaInPrestito = assegnazioni.some(
      (a) => a.giocatoreId === giocatoreId && a.tipo === 'prestito' && a.al === undefined,
    );
    if (giaInPrestito) return { ok: false, errori: ['Giocatore già in prestito'] };

    const proprietario = squadre.find((s) => s.id === carriera.squadraId);
    if (!proprietario) return { ok: false, errori: ['Squadra utente inesistente'] };
    const rand = prng(hashSeed(`${carrieraId}|prestito|${g.id}|${carriera.stagione}`));
    const club = scegliClubPrestito({ giocatore: g, clubProprietario: proprietario, squadre, giocatori, assignments: assegnazioni, rand });
    if (!club) return { ok: false, errori: ['Nessuna squadra adatta per il prestito (stesso paese, rating inferiore, rosa con posto)'] };

    await db.squadAssignments.add({
      id: newId(),
      carrieraId,
      giocatoreId,
      squadraId: club.id,
      tipo: 'prestito',
      dal: carriera.stagione,
    });
    await db.transferLedger.add({
      id: newId(),
      carrieraId,
      giocatoreId,
      daSquadraId: carriera.squadraId,
      aSquadraId: club.id,
      cifra: 0,
      stagione: carriera.stagione,
      settimana: stato.settimanaCorrente,
      esito: 'completato',
      tipoMovimento: 'prestito',
    });
    if (g.attributi) {
      await db.giocatori.put({
        ...g,
        attributi: { ...g.attributi, OwnerClub: club.pesId ?? 0, LoanUntil: dataFineStagioneEditor(carriera.stagione) },
      });
    }
    return { ok: true, club: club.nome };
  });
}

/** Applica un prestito nel contesto del mercato (CPU→te, CPU che chiede i tuoi). */
export async function applicaPrestitoNelContesto(input: {
  carrieraId: Id;
  giocatoreId: Id;
  daSquadraId: Id;
  aSquadraId: Id;
  stagione: string;
  settimana: number;
  giornoMercato?: number;
}): Promise<{ ok: boolean; errori?: string[] }> {
  const { carrieraId, giocatoreId, daSquadraId, aSquadraId, stagione, settimana, giornoMercato } = input;
  const [giocatori, squadre, assegnazioni] = await Promise.all([
    db.giocatori.where('carrieraId').equals(carrieraId).toArray(),
    db.squadre.where('carrieraId').equals(carrieraId).toArray(),
    db.squadAssignments.where('carrieraId').equals(carrieraId).toArray(),
  ]);
  const g = giocatori.find((x) => x.id === giocatoreId);
  const a = squadre.find((s) => s.id === aSquadraId);
  if (!g || !a) return { ok: false, errori: ['Giocatore o club inesistente'] };
  const proprieta = assegnazioni.find(
    (x) => x.giocatoreId === giocatoreId && x.tipo === 'proprieta' && x.al === undefined,
  );
  if (!proprieta || proprieta.squadraId !== daSquadraId) {
    return { ok: false, errori: ['Proprietà non corrispondente'] };
  }
  const giaInPrestito = assegnazioni.some(
    (x) => x.giocatoreId === giocatoreId && x.tipo === 'prestito' && x.al === undefined,
  );
  if (giaInPrestito) return { ok: false, errori: ['Già in prestito'] };
  // Posto rosa: conta anche chi è in prestito (occupa uno slot)
  const movimento = assegnazioni.filter(
    (x) => x.squadraId === aSquadraId && x.al === undefined,
  ).length;
  if (movimento >= 30) return { ok: false, errori: ['Rosa piena'] };

  await db.squadAssignments.add({
    id: newId(),
    carrieraId,
    giocatoreId,
    squadraId: aSquadraId,
    tipo: 'prestito',
    dal: stagione,
  });
  await db.transferLedger.add({
    id: newId(),
    carrieraId,
    giocatoreId,
    daSquadraId,
    aSquadraId,
    cifra: 0,
    stagione,
    settimana,
    giornoMercato,
    esito: 'completato',
    tipoMovimento: 'prestito',
  });
  if (g.attributi) {
    await db.giocatori.put({
      ...g,
      attributi: { ...g.attributi, OwnerClub: a.pesId ?? 0, LoanUntil: dataFineStagioneEditor(stagione) },
    });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Verifica forma ogni 5 partite (decisione utente: tua squadra, dati reali)
// ---------------------------------------------------------------------------

/** Chiamata dopo la conferma del referto: accumula i voti e scatta a 5. */
export async function registraVotoFinestra(carrieraId: Id, giocatoreId: Id, voto: number, settimana: number): Promise<void> {
  await db.transaction('rw', db.giocatori, async () => {
    const g = await db.giocatori.get(giocatoreId);
    if (!g || g.carrieraId !== carrieraId) return;
    const voti = [...(g.votiFinestra ?? []), voto].slice(-FORMA_FINESTRA_VOTI);
    if (voti.length < FORMA_FINESTRA_VOTI || !g.attributi) {
      await db.giocatori.put({ ...g, votiFinestra: voti });
      return;
    }
    const media = mediaVotiFinestra(voti);
    if (media < FORMA_FINESTRA_GIU || media >= FORMA_FINESTRA_SU) {
      const rand = prng(hashSeed(`${carrieraId}|forma|${g.id}|${settimana}`));
      const attributi = applicaVerificaForma(g.attributi, g.attributi.POS, media, rand);
      await db.giocatori.put({
        ...g,
        attributi,
        overall: attributi.OverallStats,
        votiFinestra: [],
        ultimaVerificaFormaSettimana: settimana,
      });
      return;
    }
    await db.giocatori.put({ ...g, votiFinestra: [], ultimaVerificaFormaSettimana: settimana });
  });
}

/** Hash stabile locale (stesso algoritmo di engine/random). */
export function hashSeed(valore: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < valore.length; i++) {
    h ^= valore.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
