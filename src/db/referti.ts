// FLM — Persistenza referto (PRD 3.3): conferma e annullamento entro lo stesso turno.
// Regola 1 AGENTS.md: ogni dato persistente passa da qui (Dexie).
// Ogni conferma/annullo è UNA transazione atomica: o tutto o niente.
//
// Conferma: salva la tua partita, applica minuti/forma/infortuni ai giocatori,
// simula i risultati CPU del turno (rating Elo + varianza, PRD 3.2), aggiorna il
// rating di TUTTE le squadre del turno e avanza la settimana. Annullo (solo entro
// lo stesso turno): rollback totale di tutto. La simulazione è seminata dall'ID
// partita: rigenerare = stesso risultato.

import { db, newId } from './database';
import { calcolaClassifica, type RigaClassifica } from '../engine/classifica';
import {
  applicaConseguenze,
  candidatoRichiestaPromessa,
  effettiMoraleReferto,
  testoRichiestaPromessa,
  valutaPromesseScadute,
} from '../engine/morale';
import { aggiornaRating, ELO_INIZIALE } from '../engine/rating';
import { ratingEffettivo, simulaRisultato, testoNoteReferto } from '../engine/referto';
import { effettiFiduciaReferto } from '../engine/societa';
import {
  BONUS_FORMA_PRESTAZIONE,
  EVENTO_RICHIESTA_SCADENZA_SETTIMANE,
  RICHIESTA_COOLDOWN_SETTIMANE,
  RIFIUTO_RICHIESTA_FIDUCIA,
  RIFIUTO_RICHIESTA_MORALE,
  SETTIMANE_INFORTUNIO,
  clamp,
} from '../engine/rules';
import type { Evento, Giocatore, Id, Partita, Squadra, StatoClub } from '../types/entities';

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
  prestazioniEccezionali: Id[];
  espulsi: Id[];
}

export interface EsitoConfermaReferto {
  /** La tua partita salvata */
  partita: Partita;
  /** Tutte le partite del turno (la tua + le simulate CPU), ordinate per coppia */
  turno: Partita[];
  /** Classifica aggiornata dell'intera competizione */
  classifica: RigaClassifica[];
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

function validaInput(
  input: InputConfermaReferto,
  partita: Partita,
  rosa: Giocatore[],
  squadraId: Id,
): string[] {
  const errori: string[] = [];
  if (!Number.isInteger(input.golMiei) || input.golMiei < 0 || input.golMiei > 30) {
    errori.push(`Gol miei non validi: ${input.golMiei}`);
  }
  if (!Number.isInteger(input.golAvversario) || input.golAvversario < 0 || input.golAvversario > 30) {
    errori.push(`Gol avversario non validi: ${input.golAvversario}`);
  }
  const inRosa = new Set(rosa.map((g) => g.id));
  if (input.titolari.length > 11) errori.push(`Titolari: massimo 11 (${input.titolari.length})`);
  for (const id of input.titolari) {
    if (!inRosa.has(id)) errori.push(`Titolare fuori rosa: ${id}`);
  }
  for (const id of input.marcatori) {
    if (!inRosa.has(id)) errori.push(`Marcatore fuori rosa: ${id}`);
  }
  for (const id of [...input.infortunati, ...input.prestazioniEccezionali, ...input.espulsi]) {
    if (!inRosa.has(id)) errori.push(`Giocatore nota fuori rosa: ${id}`);
  }
  if (partita.casa !== squadraId && partita.trasferta !== squadraId) {
    errori.push('La partita non coinvolge la tua squadra');
  }
  return errori;
}

/**
 * Conferma il referto della prossima partita: un'unica transazione atomica.
 * - salva la partita (gol, marcatori, note, titolari, note strutturate)
 * - applica minuti (+90 ai titolari), forma (+10 prestazione), infortuni (+2 settimane)
 * - simula e salva i risultati CPU delle altre partite del turno (seme = ID partita)
 * - avanza la settimana corrente
 */
export async function confermaReferto(input: InputConfermaReferto): Promise<EsitoConfermaReferto> {
  return db.transaction(
    'rw',
    [db.partite, db.giocatori, db.squadre, db.squadAssignments, db.competizioni, db.statoClub, db.carriere, db.eventi],
    async () => {
      const carriera = await db.carriere.get(input.carrieraId);
      const stato = await db.statoClub.get(input.carrieraId);
      const partita = await db.partite.get(input.partitaId);
      const competizione = partita ? await db.competizioni.get(partita.competizioneId) : undefined;
      if (!carriera || !stato || !partita || !competizione) {
        throw new Error('Stato carriera incompleto: impossibile confermare il referto');
      }
      if (partita.giocata) {
        throw new Error('Partita già giocata: impossibile confermare due volte');
      }

      // Guardia "prossima partita": solo la prima non giocata della tua squadra è confermabile
      const prossime = await db.partite
        .where('competizioneId')
        .equals(competizione.id)
        .toArray();
      const nonGiocate = prossime
        .filter((p) => !p.giocata && (p.casa === carriera.squadraId || p.trasferta === carriera.squadraId))
        .sort((a, b) => a.giornata - b.giornata);
      if (nonGiocate[0]?.id !== partita.id) {
        throw new Error('Referto non valido: la partita non è la prossima da giocare');
      }

      const rosa = await rosaDellaCarriera(input.carrieraId, carriera.squadraId);
      const errori = validaInput(input, partita, rosa, carriera.squadraId);
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
        prestazioni: input.prestazioniEccezionali.map(nome),
      });

      // ---------- Morale (PRD 2.2, 3.2) ----------
      // 1. Δ morale dal referto: titolari ±5/0 per risultato (+2 flat se marcatore),
      //    non titolari con promessa 'titolare' attiva −2, infortunati esenti.
      // 2. Valutazione promesse scadute alla settimana appena giocata (la partita
      //    della settimana di scadenza conta: titolari già nel referto).
      // 3. Richieste promessa: sweep rifiuto implicito delle scadute + eventuale
      //    nuova richiesta (candidato deterministico dall'engine, testo offline).
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
        ...prossime.filter(
          (p) => p.giocata && (p.casa === carriera.squadraId || p.trasferta === carriera.squadraId),
        ),
        partitaCorrente,
      ];
      const valutazione = valutaPromesseScadute(rosa, partiteSquadra, stato.settimanaCorrente);
      // ---------- Fiducia società & tifosi (PRD 3.2) ----------
      // Δ deterministici dall'engine: risultato × attesa (banda Elo, rating PRIMA
      // della partita), per i tifosi + sconfitta in casa e strisce. Applicati a
      // StatoClub con clamp 0-100; snapshot in statoPrima per il rollback.
      const mappaSquadre = new Map<Id, Squadra>((await db.squadre.toArray()).map((s) => [s.id, s]));
      const mia = mappaSquadre.get(carriera.squadraId);
      const avversarioId = inCasa ? partita.trasferta : partita.casa;
      const avversaria = mappaSquadre.get(avversarioId);
      const effettiFiducia = effettiFiduciaReferto({
        vittoria,
        pareggio,
        inCasa,
        ratingMio: mia?.rating ?? ELO_INIZIALE,
        ratingAvversario: avversaria?.rating ?? ELO_INIZIALE,
        partiteSquadra,
        squadraId: carriera.squadraId,
      });

      const eventiCarriera = await db.eventi.where('carrieraId').equals(input.carrieraId).toArray();
      // Rifiuto implicito: richiesta non decisa dopo EVENTO_RICHIESTA_SCADENZA_SETTIMANE
      const eventiRisolti: Id[] = [];
      const penalitaRifiuto = new Map<Id, { morale: number; fiducia: number }>();
      for (const e of eventiCarriera) {
        if (
          !e.promessaProposta ||
          e.sceltaFatta !== undefined ||
          e.settimana + EVENTO_RICHIESTA_SCADENZA_SETTIMANE > stato.settimanaCorrente
        ) {
          continue;
        }
        eventiRisolti.push(e.id);
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
          !eventiRisolti.includes(e.id) &&
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
      const eventiCreati: Id[] = [];
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
              effettiProposti: { moraleGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 },
            },
            {
              testo: 'Rifiuta',
              effettiProposti: {
                moraleGiocatori: RIFIUTO_RICHIESTA_MORALE,
                fiduciaSocieta: 0,
                fiduciaTifosi: 0,
                reputazione: 0,
              },
            },
          ],
          promessaProposta: proposta,
          effettiApplicati: false,
        };
        eventiCreati.push(evento.id);
        await db.eventi.add(evento);
      }

      // Snapshot PRIMA di ogni modifica (rollback secco in annullaReferto)
      const toccati = new Set<Id>([
        ...deltasMorale.keys(),
        ...valutazione.conseguenze.keys(),
        ...penalitaRifiuto.keys(),
      ]);
      const statoPrima: NonNullable<Partita['statoPrima']> = {
        giocatori: {},
        eventiCreati,
        eventiRisolti,
        clubFiducia: { fiduciaSocieta: stato.fiduciaSocieta, fiduciaTifosi: stato.fiduciaTifosi },
      };
      for (const id of toccati) {
        const g = giocatori.get(id);
        if (g) {
          statoPrima.giocatori[id] = { morale: g.morale, fiducia: g.fiducia, promesse: g.promesse };
        }
      }

      // Accumula TUTTI gli effetti per giocatore in un unico oggetto
      // (un giocatore può essere insieme titolare e in nota: no sovrascritture).
      const daAggiornare = new Map<Id, Giocatore>();
      const tocca = (id: Id, fn: (g: Giocatore) => Giocatore): void => {
        const g = daAggiornare.get(id) ?? giocatori.get(id);
        if (g) daAggiornare.set(id, fn(g));
      };
      for (const id of input.titolari) {
        tocca(id, (g) => ({ ...g, minutiStagione: g.minutiStagione + 90 }));
      }
      for (const id of input.prestazioniEccezionali) {
        tocca(id, (g) => ({ ...g, forma: clamp(g.forma + BONUS_FORMA_PRESTAZIONE) }));
      }
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
      if (daAggiornare.size > 0) {
        await db.giocatori.bulkPut([...daAggiornare.values()]);
      }

      let partitaSalvata: Partita = {
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
        statoPrima,
      };
      await db.partite.put(partitaSalvata);

      // Risultati CPU delle altre partite del turno (seme = ID: deterministico).
      // Il rating effettivo include: mean reversion della deriva stagionale,
      // bonus forma dalla striscia, scostamento stagionale della squadra.
      const giocate = prossime.filter((p) => p.giocata);
      const simulate = new Map<Id, Partita>();
      for (const p of prossime) {
        if (p.giocata || p.giornata !== partita.giornata || p.id === partita.id) continue;
        const casa = mappaSquadre.get(p.casa);
        const trasferta = mappaSquadre.get(p.trasferta);
        const rc = casa
          ? ratingEffettivo(casa, input.carrieraId, carriera.stagione, giocate)
          : ELO_INIZIALE;
        const rt = trasferta
          ? ratingEffettivo(trasferta, input.carrieraId, carriera.stagione, giocate)
          : ELO_INIZIALE;
        const { golCasa: gc, golTrasferta: gt } = simulaRisultato(p.id, rc, rt);
        const salvata = { ...p, golCasa: gc, golTrasferta: gt, giocata: true };
        simulate.set(p.id, salvata);
        await db.partite.put(salvata);
      }

      // Rating Elo: ogni partita del turno (la tua + le CPU) muove entrambe le
      // squadre. I rating PRIMA della partita restano salvati sulla partita
      // (ratingPrima) per il rollback del referto entro lo stesso turno.
      const partiteDelTurno: Partita[] = [partitaSalvata, ...simulate.values()];
      const squadreDaAggiornare = new Map<Id, Squadra>();
      for (const p of partiteDelTurno) {
        const casa = mappaSquadre.get(p.casa);
        const trasferta = mappaSquadre.get(p.trasferta);
        if (!casa || !trasferta) continue;
        const nuovo = aggiornaRating(p.golCasa, p.golTrasferta, casa.rating, trasferta.rating);
        const conRatingPrima: Partita = { ...p, ratingPrima: { casa: casa.rating, trasferta: trasferta.rating } };
        await db.partite.put(conRatingPrima);
        if (p.id === partita.id) partitaSalvata = conRatingPrima;
        simulate.set(p.id, conRatingPrima);
        squadreDaAggiornare.set(casa.id, { ...casa, rating: nuovo.ratingCasa });
        squadreDaAggiornare.set(trasferta.id, { ...trasferta, rating: nuovo.ratingTrasferta });
      }
      if (squadreDaAggiornare.size > 0) {
        await db.squadre.bulkPut([...squadreDaAggiornare.values()]);
      }

      await db.statoClub.put({
        ...stato,
        fiduciaSocieta: clamp(stato.fiduciaSocieta + effettiFiducia.fiduciaSocieta),
        fiduciaTifosi: clamp(stato.fiduciaTifosi + effettiFiducia.fiduciaTifosi),
        settimanaCorrente: stato.settimanaCorrente + 1,
      });
      await db.carriere.put({ ...carriera, updatedAt: Date.now() });

      const delTurno = prossime.filter((p) => p.giornata === partita.giornata);
      const turno = delTurno
        .map((p) => (p.id === partita.id ? partitaSalvata : (simulate.get(p.id) ?? p)))
        .sort((a, b) => a.casa.localeCompare(b.casa, 'it'));
      const aggiornate = delTurno.map((p) => (p.id === partita.id ? partitaSalvata : (simulate.get(p.id) ?? p)));
      const classifica = calcolaClassifica(
        [...prossime.filter((p) => p.giocata && !delTurno.some((t) => t.id === p.id)), ...aggiornate],
        competizione.squadre,
      );
      return { partita: partitaSalvata, turno, classifica };
    },
  );
}

/**
 * Annulla il referto entro lo stesso turno (pulsante "Torna indietro" dalla
 * schermata risultati): rollback TOTALE di ciò che la conferma ha fatto.
 * Dopo l'uscita dalla schermata risultati il referto diventa storia.
 */
export async function annullaReferto(input: { carrieraId: Id; partitaId: Id }): Promise<void> {
  await db.transaction(
    'rw',
    [db.partite, db.giocatori, db.statoClub, db.squadre, db.eventi, db.notizie],
    async () => {
      const stato = await db.statoClub.get(input.carrieraId);
      const partita = await db.partite.get(input.partitaId);
      if (!stato || !partita) throw new Error('Stato carriera incompleto: impossibile annullare');
      if (!partita.giocata) throw new Error('Partita non giocata: nulla da annullare');
      // "Entro lo stesso turno": la partita annullabile è solo quella dell'ultimo turno giocato
      if (partita.giornata !== stato.settimanaCorrente - 1) {
        throw new Error('Referto ormai storia: annullabile solo entro lo stesso turno');
      }

      // Snapshot morale/fiducia/promesse: ripristino secco (rollback del referto)
      const statoPrima = partita.statoPrima;

      // Rollback minuti/forma/infortuni (dai campi strutturati della partita).
      // Accumulo per giocatore: un titolare con prestazione eccezionale non deve
      // essere sovrascritto dalla seconda voce (stesso bug evitato in conferma).
      const giocatori = await db.giocatori.where('carrieraId').equals(input.carrieraId).toArray();
      const mappaGiocatori = new Map(giocatori.map((g) => [g.id, g]));
      const daRipristinare = new Map<Id, Giocatore>();
      const tocca = (id: Id, fn: (g: Giocatore) => Giocatore): void => {
        const g = daRipristinare.get(id) ?? mappaGiocatori.get(id);
        if (g) daRipristinare.set(id, fn(g));
      };
      for (const id of partita.titolari ?? []) {
        tocca(id, (g) => ({ ...g, minutiStagione: Math.max(0, g.minutiStagione - 90) }));
      }
      for (const id of partita.prestazioniEccezionali ?? []) {
        tocca(id, (g) => ({ ...g, forma: clamp(g.forma - BONUS_FORMA_PRESTAZIONE) }));
      }
      // Reset infortunio solo se impostato dalla conferma di QUESTO referto
      const sogliaInfortunio = partita.giornata + SETTIMANE_INFORTUNIO;
      for (const id of partita.infortunati ?? []) {
        tocca(id, (g) =>
          g.infortunioFinoA === sogliaInfortunio ? { ...g, infortunioFinoA: undefined } : g,
        );
      }
      // Ripristino morale/fiducia/promesse dallo snapshot (se presente)
      if (statoPrima) {
        for (const [id, s] of Object.entries(statoPrima.giocatori)) {
          tocca(id, (g) => ({ ...g, morale: s.morale, fiducia: s.fiducia, promesse: s.promesse }));
        }
      }
      if (daRipristinare.size > 0) await db.giocatori.bulkPut([...daRipristinare.values()]);

      // Rollback eventi del referto: cancella le richieste create, riapri le risolte
      if (statoPrima) {
        if (statoPrima.eventiCreati.length > 0) {
          await db.eventi.bulkDelete(statoPrima.eventiCreati);
        }
        for (const id of statoPrima.eventiRisolti) {
          const e = await db.eventi.get(id);
          if (e) await db.eventi.put({ ...e, sceltaFatta: undefined, effettiApplicati: false });
        }
      }

      // Rollback contenuti generati dopo la conferma (eventi narrativi + notizie,
      // PRD 4.2/4.6): l'LLM è stato chiamato fuori dalla transazione del referto,
      // gli ID sono salvati sulla partita. Race già gestita in generaContenutiTurno
      // (guardia su partita.giocata nella sua transazione finale).
      const generati = partita.contenutiGeneratiDopoReferto;
      if (generati && (generati.eventi.length > 0 || generati.notizie.length > 0)) {
        // Prima di cancellare gli eventi: ripristino degli infortuni narrativi
        // (pre-stato registrato sull'evento alla creazione, PRD 4.2 esteso)
        const infortuniDaRipristinare = new Map<Id, number | undefined>();
        for (const id of generati.eventi) {
          const e = await db.eventi.get(id);
          for (const inf of e?.infortuniApplicati ?? []) {
            infortuniDaRipristinare.set(inf.giocatoreId, inf.infortunioFinoAPrima);
          }
        }
        if (infortuniDaRipristinare.size > 0) {
          const giocatoriDaRipristinare = await db.giocatori.where('carrieraId').equals(input.carrieraId).toArray();
          const daScrivere = giocatoriDaRipristinare
            .filter((g) => infortuniDaRipristinare.has(g.id))
            .map((g) => ({ ...g, infortunioFinoA: infortuniDaRipristinare.get(g.id) }));
          if (daScrivere.length > 0) await db.giocatori.bulkPut(daScrivere);
        }
        if (generati.eventi.length > 0) await db.eventi.bulkDelete(generati.eventi);
        if (generati.notizie.length > 0) await db.notizie.bulkDelete(generati.notizie);
      }

      // Rollback partita utente
      await db.partite.put({
        ...partita,
        golCasa: 0,
        golTrasferta: 0,
        marcatori: [],
        giocata: false,
        note: undefined,
        titolari: undefined,
        prestazioniEccezionali: undefined,
        infortunati: undefined,
        espulsi: undefined,
        ratingPrima: undefined,
        statoPrima: undefined,
        contenutiGeneratiDopoReferto: undefined,
      });

      // Rollback risultati CPU del turno + rating Elo (da ratingPrima)
      const delTurno = await db.partite
        .where('competizioneId')
        .equals(partita.competizioneId)
        .toArray();
      const squadre = await db.squadre.toArray();
      const mappaSquadre = new Map<Id, Squadra>(squadre.map((s) => [s.id, s]));
      const squadreDaRipristinare = new Map<Id, Squadra>();
      for (const p of delTurno) {
        if (p.giornata !== partita.giornata || p.id === partita.id) continue;
        if (p.ratingPrima) {
          const casa = mappaSquadre.get(p.casa);
          const trasferta = mappaSquadre.get(p.trasferta);
          if (casa) squadreDaRipristinare.set(casa.id, { ...casa, rating: p.ratingPrima.casa });
          if (trasferta) squadreDaRipristinare.set(trasferta.id, { ...trasferta, rating: p.ratingPrima.trasferta });
        }
        if (p.giocata) {
          await db.partite.put({ ...p, golCasa: 0, golTrasferta: 0, marcatori: [], giocata: false, note: undefined, ratingPrima: undefined });
        }
      }
      // La partita utente conserva i rating precedenti nel suo ratingPrima
      if (partita.ratingPrima) {
        const casa = mappaSquadre.get(partita.casa);
        const trasferta = mappaSquadre.get(partita.trasferta);
        if (casa) squadreDaRipristinare.set(casa.id, { ...casa, rating: partita.ratingPrima.casa });
        if (trasferta) squadreDaRipristinare.set(trasferta.id, { ...trasferta, rating: partita.ratingPrima.trasferta });
      }
      if (squadreDaRipristinare.size > 0) {
        await db.squadre.bulkPut([...squadreDaRipristinare.values()]);
      }

      // Rollback fiducia società/tifosi (dal clubFiducia salvato nella conferma)
      const nuovoStato: StatoClub = statoPrima?.clubFiducia
        ? {
            ...stato,
            fiduciaSocieta: statoPrima.clubFiducia.fiduciaSocieta,
            fiduciaTifosi: statoPrima.clubFiducia.fiduciaTifosi,
            settimanaCorrente: stato.settimanaCorrente - 1,
          }
        : { ...stato, settimanaCorrente: stato.settimanaCorrente - 1 };
      await db.statoClub.put(nuovoStato);
    },
  );
}

/** La prossima partita non giocata della tua squadra nella competizione campionato. */
export async function prossimaPartita(squadraId: Id, competizioneId: Id): Promise<Partita | null> {
  const partite = await db.partite
    .where('competizioneId')
    .equals(competizioneId)
    .toArray();
  const prossime = partite
    .filter((p) => !p.giocata && (p.casa === squadraId || p.trasferta === squadraId))
    .sort((a, b) => a.giornata - b.giornata);
  return prossime[0] ?? null;
}
