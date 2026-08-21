// FLM — Persistenza referto (PRD 3.3, decisione utente: referto IMMUTABILE).
// Regola 1 AGENTS.md: ogni dato persistente passa da qui (Dexie).
// Niente rollback: la validazione bloccante impedisce i referti incoerenti,
// e l'invio è definitivo (conferma esplicita in UI).
//
// Conferma: salva la partita, applica minuti/forma/morale/promesse ai miei
// giocatori, simula le prestazioni della squadra AVVERSARIA (decisione utente:
// il form resta veloce, solo i miei dati), aggiorna il rating Elo, fa avanzare
// il tabellone, e se è l'ultima partita della settimana avanza la settimana
// (simulazione CPU a blocco in src/db/competizioni.ts).

import { db, newId } from './database';
import { prossimePartiteUtente, avanzaSettimana } from './competizioni';
import { assertLLMDisponibile } from '../llm/connectivity';
import { registraVotoFinestra } from './vivaio';
import {
  applicaConseguenze,
  candidatoRichiestaPromessa,
  effettiMoraleReferto,
  testoRichiestaPromessa,
  valutaPromesseScadute,
} from '../engine/morale';
import { aggiornaRating } from '../engine/rating';
import { testoNoteReferto, deltaFiduciaDaMinuti } from '../engine/referto';
import { effettiFiduciaReferto } from '../engine/societa';
import { calcolaNuovaForma, prestazioneScore } from '../engine/forma';
import {
  simulaEventiSquadra,
  vincitriceSfida,
  SQUADRA_DA_ASSEGNARE,
} from '../engine/competizioni';
import {
  EVENTO_RICHIESTA_SCADENZA_SETTIMANE,
  RICHIESTA_COOLDOWN_SETTIMANE,
  RIFIUTO_RICHIESTA_FIDUCIA,
  RIFIUTO_RICHIESTA_MORALE,
  SETTIMANE_INFORTUNIO,
  clamp,
} from '../engine/rules';
import type { Evento, Giocatore, Id, Partita, PrestazionePartita } from '../types/entities';

export interface InputConfermaReferto {
  carrieraId: Id;
  partitaId: Id;
  /** Gol della TUA squadra (normalizzati casa/trasferta dal motore) */
  golMiei: number;
  golAvversario: number;
  /** ID dei marcatori in ordine di tap (ripetuti per ogni gol) */
  marcatori: Id[];
  titolari: Id[];
  infortunati: Id[];
  /** Solo per referti legacy: tap "prestazione eccezionale" (+10 forma) */
  prestazioniEccezionali?: Id[];
  espulsi: Id[];
  /**
   * Dati per giocatore dallo screenshot FL26: voto 1.0-10.0 a passi 0.5.
   * Se assente valgono tap manuali e bonus gol dai marcatori.
   */
  prestazioni?: Record<Id, { voto: number }>;
  /** Marcatori con minuti (schermata risultato): SOLO narrativa nelle note */
  marcatoriConMinuti?: Array<{ id: Id; minuti: number[] }>;
  /**
   * Autogol avversari (decisione utente): marcatori + autogol = gol miei.
   * Blocco duro se il conto non torna.
   */
  autogolAvversari?: number;
  /** Supplementari giocati (solo eliminazione diretta) */
  supplementari?: boolean;
  /** Rigori (OBBLIGATORI in pareggio a eliminazione diretta) */
  rigori?: { casa: number; trasferta: number };
}

export interface EsitoConfermaReferto {
  /** La tua partita salvata */
  partita: Partita;
  /** Settimana corrente dopo l'avanzamento */
  settimana: number;
}

/** Giocatori della rosa dell'utente nella carriera (proprietà attiva). */
export async function rosaDellaCarriera(carrieraId: Id, squadraId: Id): Promise<Giocatore[]> {
  const [giocatori, assegnazioni] = await Promise.all([
    db.giocatori.where('carrieraId').equals(carrieraId).toArray(),
    db.squadAssignments.where('carrieraId').equals(carrieraId).toArray(),
  ]);
  const ids = new Set(
    assegnazioni
      .filter((a) => a.squadraId === squadraId && a.tipo === 'proprieta' && a.al === undefined)
      .map((a) => a.giocatoreId),
  );
  return giocatori.filter((g) => ids.has(g.id));
}

/**
 * Validazione BLOCCANTE del referto (decisione utente): ogni errore impedisce
 * l'invio con un messaggio esplicito. L'invio è immutabile: meglio bloccare.
 */
function validaInput(
  input: InputConfermaReferto,
  partita: Partita,
  rosa: Giocatore[],
  squadraId: Id,
  eliminazioneDiretta: boolean,
): string[] {
  const errori: string[] = [];
  if (!Number.isInteger(input.golMiei) || input.golMiei < 0 || input.golMiei > 30) {
    errori.push(`Gol miei non validi: ${input.golMiei}`);
  }
  if (!Number.isInteger(input.golAvversario) || input.golAvversario < 0 || input.golAvversario > 30) {
    errori.push(`Gol avversario non validi: ${input.golAvversario}`);
  }
  const inRosa = new Set(rosa.map((g) => g.id));
  if (input.titolari.length !== 11) {
    errori.push(`Titolari: devono essere esattamente 11 (trovati ${input.titolari.length})`);
  }
  for (const id of input.titolari) {
    if (!inRosa.has(id)) errori.push(`Titolare fuori rosa: ${id}`);
  }
  for (const id of input.marcatori) {
    if (!inRosa.has(id)) errori.push(`Marcatore fuori rosa: ${id}`);
  }
  for (const id of [...input.infortunati, ...(input.prestazioniEccezionali ?? []), ...input.espulsi]) {
    if (!inRosa.has(id)) errori.push(`Giocatore nota fuori rosa: ${id}`);
  }
  if (input.prestazioni) {
    for (const [id, p] of Object.entries(input.prestazioni)) {
      if (!inRosa.has(id)) errori.push(`Prestazione fuori rosa: ${id}`);
      if (!Number.isFinite(p.voto) || p.voto < 1 || p.voto > 10 || Math.abs(p.voto * 2 - Math.round(p.voto * 2)) > 1e-9) {
        errori.push(`Voto non valido per ${id}: ${p.voto} (atteso 1.0-10.0 a passi 0.5)`);
      }
    }
  }
  for (const m of input.marcatoriConMinuti ?? []) {
    if (!inRosa.has(m.id)) errori.push(`Marcatore (minuti) fuori rosa: ${m.id}`);
    if (!m.minuti.every((x) => Number.isInteger(x) && x >= 1 && x <= 120)) {
      errori.push(`Minuti marcatore non validi: ${m.id}`);
    }
  }
  // Marcatori ≤ gol (decisione utente: blocco duro)
  if (input.marcatori.length > input.golMiei) {
    errori.push(`Marcatori (${input.marcatori.length}) superano i gol segnati (${input.golMiei})`);
  }
  // marcatori + autogol = gol miei (decisione utente: campo autogol)
  const autogol = input.autogolAvversari ?? 0;
  if (input.marcatori.length + autogol !== input.golMiei) {
    errori.push(
      `Il conto non torna: ${input.marcatori.length} marcatori + ${autogol} autogol = ${input.marcatori.length + autogol}, attesi ${input.golMiei} gol`,
    );
  }
  // Eliminazione diretta in pareggio: rigori OBBLIGATORI (decisione utente)
  if (eliminazioneDiretta && input.golMiei === input.golAvversario && !input.rigori) {
    errori.push('Partita a eliminazione diretta in pareggio: indicare i rigori (o i supplementari)');
  }
  if (input.rigori) {
    const r = input.rigori;
    if (!Number.isInteger(r.casa) || !Number.isInteger(r.trasferta) || r.casa < 0 || r.trasferta < 0 || r.casa === r.trasferta) {
      errori.push(`Rigori non validi: ${r.casa}-${r.trasferta} (deve esserci una vincitrice)`);
    }
  }
  if (partita.casa !== squadraId && partita.trasferta !== squadraId) {
    errori.push('La partita non coinvolge la tua squadra');
  }
  return errori;
}

/**
 * Conferma il referto della prossima partita (IMMUTABILE, decisione utente):
 * un'unica transazione atomica. Se è l'ultima partita della settimana,
 * fa avanzare la settimana (simulazione CPU a blocco).
 */
export async function confermaReferto(input: InputConfermaReferto): Promise<EsitoConfermaReferto> {
  // PRD 8.2: avanzaSettimana richiede LLM; verifica prima di qualsiasi scrittura
  // in modo che il referto non venga salvato a metà se la settimana è bloccata.
  const carrieraCheck = await db.carriere.get(input.carrieraId);
  const statoCheck = await db.statoClub.get(input.carrieraId);
  if (carrieraCheck && statoCheck) {
    const prossime = await prossimePartiteUtente(input.carrieraId, carrieraCheck.squadraId);
    const partitaCheck = await db.partite.get(input.partitaId);
    if (partitaCheck && prossime[0]?.id === partitaCheck.id) {
      const rimanentiCheck = (await db.partite.where('carrieraId').equals(input.carrieraId).toArray()).filter(
        (p) => !p.giocata && p.settimana === partitaCheck.settimana && (p.casa === carrieraCheck.squadraId || p.trasferta === carrieraCheck.squadraId) && p.id !== partitaCheck.id,
      );
      if (rimanentiCheck.length === 0) {
        await assertLLMDisponibile();
      }
    }
  }
  const votiDaRegistrare: Array<{ giocatoreId: Id; voto: number }> = [];
  const esito = await db.transaction(
    'rw',
    [db.partite, db.giocatori, db.squadre, db.squadAssignments, db.competizioni, db.statoClub, db.carriere, db.eventi, db.prestazioni],
    async () => {
      const carriera = await db.carriere.get(input.carrieraId);
      const stato = await db.statoClub.get(input.carrieraId);
      const partita = await db.partite.get(input.partitaId);
      const competizione = partita ? await db.competizioni.get(partita.competizioneId) : undefined;
      if (!carriera || !stato || !partita || !competizione) {
        throw new Error('Stato carriera incompleto: impossibile confermare il referto');
      }
      if (partita.giocata) {
        throw new Error('Partita già giocata: il referto è immutabile');
      }

      // Guardia "prossima partita" cross-competizione (decisione utente D5)
      const prossime = await prossimePartiteUtente(input.carrieraId, carriera.squadraId);
      if (prossime[0]?.id !== partita.id) {
        throw new Error('Referto non valido: la partita non è la prossima da giocare');
      }

      const rosa = await rosaDellaCarriera(input.carrieraId, carriera.squadraId);
      const eliminazione =
        competizione.formato === 'eliminazione_diretta' ||
        (competizione.formato === 'league_phase' && partita.fase !== 'league_phase') ||
        competizione.formato === 'partita_secca';
      const errori = validaInput(input, partita, rosa, carriera.squadraId, eliminazione);
      if (errori.length > 0) {
        throw new Error(`Referto non valido: ${errori.join('; ')}`);
      }

      const inCasa = partita.casa === carriera.squadraId;
      const golCasa = inCasa ? input.golMiei : input.golAvversario;
      const golTrasferta = inCasa ? input.golAvversario : input.golMiei;

      const giocatori = new Map(rosa.map((g) => [g.id, g]));
      const nome = (id: Id): string => giocatori.get(id)?.nome ?? '—';
      const note = testoNoteReferto({
        espulsi: input.espulsi.map(nome),
        infortunati: input.infortunati.map(nome),
        prestazioni: (input.prestazioniEccezionali ?? []).map(nome),
        marcatori: (input.marcatoriConMinuti ?? []).map((m) => ({ nome: nome(m.id), minuti: m.minuti })),
      });

      // ---------- Morale (PRD 2.2, 3.2) ----------
      const vittoria = input.golMiei > input.golAvversario;
      const pareggio = input.golMiei === input.golAvversario;
      const deltasMorale = effettiMoraleReferto({
        giocatori: rosa,
        titolari: input.titolari,
        marcatori: input.marcatori,
        vittoria,
        pareggio,
        settimana: stato.settimanaCorrente,
      });

      const partitaCorrente: Partita = {
        ...partita,
        golCasa,
        golTrasferta,
        giocata: true,
        titolari: input.titolari,
      };
      const partiteSquadra = [
        ...(await db.partite.where('carrieraId').equals(input.carrieraId).toArray()).filter(
          (p) => p.giocata && (p.casa === carriera.squadraId || p.trasferta === carriera.squadraId),
        ),
        partitaCorrente,
      ];
      const valutazione = valutaPromesseScadute(rosa, partiteSquadra, stato.settimanaCorrente);

      // ---------- Fiducia società & tifosi ----------
      const mappaSquadre = new Map<Id, typeof carriera.squadraId extends never ? never : { rating: number }>();
      const squadre = await db.squadre.toArray();
      for (const s of squadre) mappaSquadre.set(s.id, { rating: s.rating });
      const mia = mappaSquadre.get(carriera.squadraId);
      const avversarioId = inCasa ? partita.trasferta : partita.casa;
      const avversaria = mappaSquadre.get(avversarioId);
      const effettiFiducia = effettiFiduciaReferto({
        vittoria,
        pareggio,
        inCasa,
        ratingMio: mia?.rating ?? 1500,
        ratingAvversario: avversaria?.rating ?? 1500,
        partiteSquadra,
        squadraId: carriera.squadraId,
      });

      // ---------- Eventi richiesta promessa (come oggi, senza rollback) ----------
      const eventiCarriera = await db.eventi.where('carrieraId').equals(input.carrieraId).toArray();
      const penalitaRifiuto = new Map<Id, { morale: number; fiducia: number }>();
      for (const e of eventiCarriera) {
        if (
          !e.promessaProposta ||
          e.sceltaFatta !== undefined ||
          e.settimana + EVENTO_RICHIESTA_SCADENZA_SETTIMANE > stato.settimanaCorrente
        ) {
          continue;
        }
        penalitaRifiuto.set(e.promessaProposta.giocatoreId, {
          morale: RIFIUTO_RICHIESTA_MORALE,
          fiducia: RIFIUTO_RICHIESTA_FIDUCIA,
        });
        await db.eventi.put({ ...e, sceltaFatta: 1, effettiApplicati: true });
      }
      const pending = eventiCarriera.some(
        (e) =>
          e.promessaProposta &&
          e.sceltaFatta === undefined &&
          e.settimana + EVENTO_RICHIESTA_SCADENZA_SETTIMANE > stato.settimanaCorrente,
      );
      const richiesteRecenti = new Set(
        eventiCarriera
          .filter((e) => e.promessaProposta && e.settimana > stato.settimanaCorrente - RICHIESTA_COOLDOWN_SETTIMANE)
          .map((e) => e.promessaProposta!.giocatoreId),
      );
      const proposta = candidatoRichiestaPromessa({
        giocatori: rosa,
        settimana: stato.settimanaCorrente,
        partiteGiocateSquadra: Math.max(0, partiteSquadra.length - 1),
        richiesteRecenti,
        pendingEsistente: pending,
      });
      if (proposta) {
        const nomeGiocatore = giocatori.get(proposta.giocatoreId)?.nome ?? '—';
        const evento: Evento = {
          id: newId(),
          carrieraId: input.carrieraId,
          settimana: stato.settimanaCorrente,
          categoria: 'giocatore',
          tipo: 'scenario_emergente',
          titolo: 'Richiesta di colloquio',
          testo: testoRichiestaPromessa(nomeGiocatore, proposta.tipo),
          giocatoriCoinvolti: [nomeGiocatore],
          opzioni: [
            {
              testo: 'Prometti',
              effettiProposti: { moraleGiocatori: 0, fiduciaGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 },
            },
            {
              testo: 'Rifiuta',
              effettiProposti: {
                moraleGiocatori: RIFIUTO_RICHIESTA_MORALE,
                fiduciaGiocatori: RIFIUTO_RICHIESTA_FIDUCIA,
                fiduciaSocieta: 0,
                fiduciaTifosi: 0,
                reputazione: 0,
              },
            },
          ],
          promessaProposta: proposta,
          effettiApplicati: false,
        };
        await db.eventi.add(evento);
      }

      // ---------- Effetti giocatori MIEI ----------
      const daAggiornare = new Map<Id, Giocatore>();
      const tocca = (id: Id, fn: (g: Giocatore) => Giocatore): void => {
        const g = daAggiornare.get(id) ?? giocatori.get(id);
        if (g) daAggiornare.set(id, fn(g));
      };
      for (const id of input.titolari) {
        tocca(id, (g) => ({ ...g, minutiStagione: g.minutiStagione + 90 }));
      }
      const esentiFiducia = new Set(input.infortunati);
      for (const g of rosa) {
        tocca(g.id, (pg) => ({
          ...pg,
          fiducia: clamp(
            pg.fiducia +
              deltaFiduciaDaMinuti({
                titolare: input.titolari.includes(g.id),
                infortunato: esentiFiducia.has(g.id),
              }),
          ),
        }));
      }
      const golDaMarcatori = new Map<Id, number>();
      for (const id of input.marcatori) golDaMarcatori.set(id, (golDaMarcatori.get(id) ?? 0) + 1);
      // Infortuni: applica subito prima della forma (così la forma decade)
      for (const id of input.infortunati) {
        tocca(id, (g) => ({ ...g, infortunioFinoA: stato.settimanaCorrente + SETTIMANE_INFORTUNIO }));
      }
      for (const [id, delta] of deltasMorale) {
        tocca(id, (g) => ({ ...g, morale: clamp(g.morale + delta) }));
      }
      for (const [id, promesse] of new Map(valutazione.giocatori.map((g) => [g.id, g.promesse]))) {
        tocca(id, (g) => ({ ...g, promesse }));
      }
      for (const [id, conseg] of valutazione.conseguenze) {
        tocca(id, (g) => applicaConseguenze(g, conseg));
      }
      for (const [id, conseg] of penalitaRifiuto) {
        tocca(id, (g) => applicaConseguenze(g, conseg));
      }
      // ---------- Forma UNIFICATA: morale + fiducia + prestazione → forma → overall ----------
      // Bilanciata: prestazione 50%, morale 30%, fiducia 20%, inerzia 68%
      // Ogni giocatore della rosa ricalcola forma (titolari + panchina + infortunati)
      const setInfortunatiNuovi = new Set(input.infortunati);
      const setEspulsi = new Set(input.espulsi);
      const isCleanSheet = input.golAvversario === 0;
      for (const g of rosa) {
        const giaInfortunato = g.infortunioFinoA !== undefined && g.infortunioFinoA >= stato.settimanaCorrente;
        const appenaInfortunato = setInfortunatiNuovi.has(g.id);
        const infortunato = giaInfortunato || appenaInfortunato;
        const titolare = input.titolari.includes(g.id);
        // Morale/fiducia aggiornati (se pending in daAggiornare)
        const gAgg = daAggiornare.get(g.id) ?? g;
        const moraleNew = gAgg.morale;
        const fiduciaNew = gAgg.fiducia;
        const gol = golDaMarcatori.get(g.id) ?? 0;
        let votoEff = input.prestazioni?.[g.id]?.voto;
        if (votoEff === undefined && input.prestazioniEccezionali?.includes(g.id)) votoEff = 8.5;
        const rosso = setEspulsi.has(g.id);
        // Giallo: non tracciato nel referto base (solo rosso), placeholder false
        const prestScore = infortunato
          ? 0
          : prestazioneScore({
              voto: votoEff,
              gol,
              assist: 0,
              giallo: false,
              rosso,
              titolare,
              portaInviolata: isCleanSheet,
              ruolo: g.ruolo,
            });
        const formaNew = calcolaNuovaForma({
          formaPrecedente: g.forma,
          morale: moraleNew,
          fiducia: fiduciaNew,
          prestazioneScore: prestScore,
          infortunato,
        });
        tocca(g.id, (pg) => ({ ...pg, forma: formaNew }));
      }
      if (daAggiornare.size > 0) {
        await db.giocatori.bulkPut([...daAggiornare.values()]);
      }

      // ---------- Partita salvata (IMMUTABILE) ----------
      const partitaSalvata: Partita = {
        ...partita,
        golCasa,
        golTrasferta,
        marcatori: input.marcatori.map(nome),
        giocata: true,
        note,
        titolari: input.titolari,
        prestazioniEccezionali: input.prestazioniEccezionali,
        infortunati: input.infortunati,
        espulsi: input.espulsi,
        prestazioni: input.prestazioni,
        marcatoriConMinuti: input.marcatoriConMinuti,
        autogolAvversari: input.autogolAvversari ?? 0,
        supplementari: input.supplementari,
        rigori: input.rigori
          ? { casa: inCasa ? input.rigori.casa : input.rigori.trasferta, trasferta: inCasa ? input.rigori.trasferta : input.rigori.casa }
          : undefined,
      };
      await db.partite.put(partitaSalvata);

      // ---------- Prestazioni: le MIE dal referto, le AVVERSARIE simulate ----------
      const prestazioniDaSalvare: PrestazionePartita[] = [];
      const base = (giocatoreId: Id, titolare: boolean): PrestazionePartita => ({
        id: newId(),
        carrieraId: input.carrieraId,
        partitaId: partita.id,
        competizioneId: partita.competizioneId,
        squadraId: carriera.squadraId,
        giocatoreId,
        gol: golDaMarcatori.get(giocatoreId) ?? 0,
        assist: 0,
        giallo: false,
        rosso: input.espulsi.includes(giocatoreId),
        voto: input.prestazioni?.[giocatoreId]?.voto ?? 0,
        portaInviolata: golTrasferta === 0,
        minuti: titolare ? 90 : 0,
        titolare,
      });
      for (const g of rosa) {
        prestazioniDaSalvare.push(base(g.id, input.titolari.includes(g.id)));
      }
      // Squadra avversaria: eventi simulati (decisione utente)
      const rosaAvversaria = await rosaDellaCarriera(input.carrieraId, avversarioId);
      if (rosaAvversaria.length > 0) {
        const eventiAvversari = simulaEventiSquadra(
          partita.id,
          avversarioId,
          rosaAvversaria,
          input.golAvversario,
          input.golMiei,
        );
        prestazioniDaSalvare.push(
          ...eventiAvversari.map((e) => ({
            ...e,
            id: newId(),
            carrieraId: input.carrieraId,
            competizioneId: partita.competizioneId,
          })),
        );
      }
      await db.prestazioni.bulkAdd(prestazioniDaSalvare);

      // ---------- Rating Elo ----------
      const casa = squadre.find((s) => s.id === partita.casa);
      const trasferta = squadre.find((s) => s.id === partita.trasferta);
      if (casa && trasferta) {
        const nuovo = aggiornaRating(golCasa, golTrasferta, casa.rating, trasferta.rating);
        await db.squadre.put({ ...casa, rating: nuovo.ratingCasa });
        await db.squadre.put({ ...trasferta, rating: nuovo.ratingTrasferta });
      }

      // ---------- Fiducia club ----------
      await db.statoClub.put({
        ...stato,
        fiduciaSocieta: clamp(stato.fiduciaSocieta + effettiFiducia.fiduciaSocieta),
        fiduciaTifosi: clamp(stato.fiduciaTifosi + effettiFiducia.fiduciaTifosi),
      });

      // ---------- Progressione tabellone della competizione ----------
      await avanzaTabelloneLocale(input.carrieraId, competizione.id, partita.id);

      // ---------- Avanzamento settimana (unità atomica) ----------
      const rimanentiSettimana = (await db.partite.where('carrieraId').equals(input.carrieraId).toArray())
        .filter(
          (p) =>
            !p.giocata &&
            p.settimana === partita.settimana &&
            (p.casa === carriera.squadraId || p.trasferta === carriera.squadraId) &&
            p.id !== partita.id,
        );
      let settimana = stato.settimanaCorrente;
      if (rimanentiSettimana.length === 0) {
        // L'ultima partita della settimana: avanza (simula CPU a blocco).
        // L'avanzamento è in una transazione separata per non annidare.
        const esito = await avanzaSettimana(input.carrieraId);
        settimana = esito.settimana;
      }

      // Voti per la verifica forma ogni 5 partite (PRD 7.5): registrati DOPO
      // la transazione (niente transazioni annidate).
      for (const p of prestazioniDaSalvare) {
        if (p.voto > 0) votiDaRegistrare.push({ giocatoreId: p.giocatoreId, voto: p.voto });
      }

      return { partita: partitaSalvata, settimana };
    },
  );

  // Verifica forma (finestra 5 voti): transazioni separate, mai bloccanti
  for (const v of votiDaRegistrare) {
    await registraVotoFinestra(input.carrieraId, v.giocatoreId, v.voto, esito.settimana);
  }
  return esito;
}

/**
 * Progressione tabellone locale alla competizione della partita appena
 * confermata (riempie i segnaposto del turno successivo quando la sfida o il
 * turno si completano). La logica condivisa vive in db/competizioni.ts.
 */
async function avanzaTabelloneLocale(_carrieraId: Id, competizioneId: Id, partitaId: Id): Promise<void> {
  const competizione = await db.competizioni.get(competizioneId);
  if (!competizione) return;
  if (competizione.formato !== 'eliminazione_diretta' && competizione.formato !== 'league_phase') return;
  const partite = await db.partite.where('competizioneId').equals(competizioneId).toArray();
  const faseAttuale = partite.find((p) => p.id === partitaId)?.fase;
  if (!faseAttuale || faseAttuale === 'league_phase' || faseAttuale === 'finale') return;

  const fasi = ['playoff_qualificazione', 'playoff', 'ottavi', 'quarti', 'semifinali', 'finale'];
  const idx = fasi.indexOf(faseAttuale);
  if (idx === -1 || idx === fasi.length - 1) return;
  const prossimaFase = fasi[idx + 1]!;

  const dellaFase = partite.filter((p) => p.fase === faseAttuale);
  if (dellaFase.some((p) => !p.giocata)) return; // turno non completo

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
    if (!v) return;
    vincitrici.push(v);
  }

  const segnaposto = partite
    .filter((p) => p.fase === prossimaFase && (p.casa === SQUADRA_DA_ASSEGNARE || p.trasferta === SQUADRA_DA_ASSEGNARE))
    .sort((a, b) => a.giornata - b.giornata || (a.gamba ?? 0) - (b.gamba ?? 0) || a.id.localeCompare(b.id));
  let i = 0;
  for (const p of segnaposto) {
    const v1 = vincitrici[i * 2];
    const v2 = vincitrici[i * 2 + 1];
    if (v1 === undefined || v2 === undefined) continue;
    const gamba1 = p.gamba === 1;
    await db.partite.put({ ...p, casa: gamba1 ? v1 : v2, trasferta: gamba1 ? v2 : v1 });
    if (p.gamba === 2 || p.gamba === undefined) i++;
  }
}

export { SQUADRA_DA_ASSEGNARE };
