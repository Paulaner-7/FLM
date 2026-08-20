// FLM — Persistenza mercato (PRD 7.3): orchestrazione transazionale.
// Regola 1 AGENTS.md: ogni dato persistente passa da qui (Dexie).
// Regola 2 AGENTS.md: l'LLM si chiama SOLO tramite src/llm.
// Regola 3 AGENTS.md: i NUMERI (soglie, cifre, bisogni, validazione) vengono da
// src/engine/mercato.ts e src/engine/invariants.ts — qui solo orchestrazione.
//
// La finestra di mercato (decisione utente M4): modalità a 30 giorni che CONGELA
// il calendario. Avanza con "Avanza giorno". Ogni avanzamento processa:
// 1. risposte CPU alle mosse dell'utente (round-trip = 1 giorno)
// 2. scadenze delle offerte in entrata (4 giorni)
// 3. deadline day (giorno 30): must-respond + offerta lampo
// 4. nuove offerte in entrata (3-5 estate, 1-3 gennaio, max 1/giorno)
// 5. mercato CPU-to-CPU (8-12 movimenti/giorno estate, ~40% gennaio)
// 6. notizie del giorno (LLM o fallback engine)

import { db, newId } from './database';
import { eseguiTrasferimento } from './transfers';
import { applicaPrestitoNelContesto } from './vivaio';
import {
  pianificaTrasferimento,
  validaTrasferimento,
  type ContestoTrasferimento,
  type ParametriTrasferimento,
  type PianoTrasferimento,
} from '../engine/invariants';
import {
  appetibilita,
  bisogniRosa,
  cifraOfferta,
  effettiAcquisto,
  effettiCessione,
  eleggibilePerOfferta,
  finestraDiSettimana,
  formattaCifra,
  ingaggioDaValore,
  migliorGiocatoreRuolo,
  nomeFinestra,
  nuovaScadenzaContratto,
  repartoDi,
  rispostaCpu,
  sogliaCpu,
  testoNotiziaMercato,
  testoOffertaInEntrata,
  testoReazioneCessione,
  testoRispostaCpu,
  valoreMercato,
  type FinestraMercato,
} from '../engine/mercato';
import { prng } from '../engine/random';
import {
  GIORNI_FINESTRA,
  GIORNI_SCADENZA_OFFERTA,
  GIORNI_GIRO_CPU,
  MOVIMENTI_GIORNO_MIN,
  MOVIMENTI_GIORNO_MAX,
  NOTIZIA_MERCATO_CIFRA_MIN,
  NOTIZIA_MERCATO_OVERALL_MIN,
  OFFERTA_LAMPO_FATTORE_MAX,
  OFFERTA_LAMPO_FATTORE_MIN,
  OFFERTA_LAMPO_PROBABILITA,
  OFFERTE_ENTRATA_ESTATE,
  OFFERTE_ENTRATA_INVERNO,
  VOLUME_INVERNO_FRAZIONE,
  MAX_GIOCATORI_VENDITA_ANNO,
  PRESTITI_QUOTA_MOVIMENTI,
  clamp,
} from '../engine/rules';
import { generaCronacaMercato, generaOffertaInEntrata, generaScenariMercatoCpu } from '../llm';
import type {
  Evento,
  Giocatore,
  Id,
  Notizia,
  Squadra,
  SquadAssignment,
  StatoClub,
  Trattativa,
} from '../types/entities';

/** Marker per i movimenti da/verso il pool svincolati nel ledger. */
export const SQUADRA_SVINCOLATI = 'svincolati';

/** Leghe top-5 per il filtro delle notizie (decisione Q5b). */
const LEGHE_TOP5 = new Set(['Premier League', 'Serie A', 'La Liga', 'Ligue 1', 'Bundesliga']);

export interface StatoMercato {
  attiva: boolean;
  finestra: FinestraMercato | null;
  giorno: number;
  giorniTotali: number;
  /** Trattative attive (proposta/trattativa/accordo), acquisto e vendita */
  trattative: Trattativa[];
  /** Giocatori svincolati firmabili (assegnazione chiusa, nessuna attiva) */
  svincolati: Giocatore[];
}

/** Stato di mercato per la UI (pagina Mercato + Mail). */
export async function statoMercato(carrieraId: Id): Promise<StatoMercato> {
  const [stato, trattative, giocatori, assegnazioni] = await Promise.all([
    db.statoClub.get(carrieraId),
    db.trattative.where('carrieraId').equals(carrieraId).toArray(),
    db.giocatori.where('carrieraId').equals(carrieraId).toArray(),
    db.squadAssignments.where('carrieraId').equals(carrieraId).toArray(),
  ]);
  if (!stato) return { attiva: false, finestra: null, giorno: 0, giorniTotali: GIORNI_FINESTRA, trattative: [], svincolati: [] };

  const finestra = stato.giornoMercato > 0 ? finestraDiSettimana(stato.settimanaCorrente) : null;
  const attive = trattative
    .filter((t) => ['proposta', 'trattativa', 'accordo'].includes(t.stato))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const conClubAttivo = new Set(
    assegnazioni
      .filter((a) => a.tipo === 'proprieta' && a.al === undefined)
      .map((a) => a.giocatoreId),
  );
  const svincolati = giocatori.filter((g) => !g.giovane && !conClubAttivo.has(g.id));

  return {
    attiva: stato.giornoMercato > 0 && finestra !== null,
    finestra,
    giorno: stato.giornoMercato,
    giorniTotali: GIORNI_FINESTRA,
    trattative: attive,
    svincolati,
  };
}

// ---------------------------------------------------------------------------
// Applicazione interna di un trasferimento (dentro una transazione già aperta)
// ---------------------------------------------------------------------------

interface ContestoInterno {
  carriera: { id: Id; squadraId: Id; stagione: string };
  stato: StatoClub;
  giocatori: Giocatore[];
  squadre: Squadra[];
  assegnazioni: SquadAssignment[];
}

/** Applica un piano già validato (scritture dirette, transazione del chiamante). */
async function applicaPiano(
  p: ParametriTrasferimento,
  piano: PianoTrasferimento,
  interno: ContestoInterno,
): Promise<void> {
  await db.squadAssignments.put(piano.chiusura);
  await db.squadAssignments.add(piano.nuovaAssegnazione);
  await db.transferLedger.add(piano.voceLedger);
  await db.squadre.update(p.aSquadraId, { budget: piano.budgetAggiornato });
  await db.squadre.update(p.daSquadraId, { budget: piano.budgetCedenteAggiornato });

  // Nuovo contratto (decisione Q7): scadenza +3 anni, ingaggio ancorato al valore
  const giocatore = interno.giocatori.find((g) => g.id === p.giocatoreId);
  if (giocatore) {
    const valore = valoreMercato(giocatore, interno.carriera.stagione);
    await db.giocatori.put({
      ...giocatore,
      scadenzaContratto: nuovaScadenzaContratto(interno.carriera.stagione),
      ingaggioAnnuo: ingaggioDaValore(valore),
    });
  }

  // Budget UI (StatoClub) sincronizzato se coinvolge la squadra utente (decisione Q3)
  if (p.aSquadraId === interno.carriera.squadraId || p.daSquadraId === interno.carriera.squadraId) {
    const mia = interno.squadre.find((s) => s.id === interno.carriera.squadraId);
    if (mia) {
      await db.statoClub.put({ ...interno.stato, budget: mia.budget });
    }
  }
}

/**
 * Valida un trasferimento nel contesto della carriera e applica il piano.
 * Rilegge lo stato dal DB a ogni chiamata (dentro la transazione aperta le
 * letture riflettono le scritture appena fatte): mai contesti stantii.
 */
async function trasferisciNelContesto(
  p: ParametriTrasferimento,
  interno: ContestoInterno,
): Promise<{ ok: boolean; errori?: string[]; giocatore?: Giocatore }> {
  const [giocatori, squadre, assegnazioni] = await Promise.all([
    db.giocatori.where('carrieraId').equals(interno.carriera.id).toArray(),
    db.squadre.where('carrieraId').equals(interno.carriera.id).toArray(),
    db.squadAssignments.where('carrieraId').equals(interno.carriera.id).toArray(),
  ]);
  interno.giocatori = giocatori;
  interno.squadre = squadre;
  interno.assegnazioni = assegnazioni;

  const contesto: ContestoTrasferimento = { giocatori, squadre, assignments: assegnazioni };
  const esito = pianificaTrasferimento(
    p,
    contesto,
    { assegnazioneId: newId(), voceId: newId() },
  );
  if (!esito.ok) return { ok: false, errori: esito.errori };
  await applicaPiano(p, esito.piano, interno);
  return { ok: true, giocatore: giocatori.find((g) => g.id === p.giocatoreId) };
}

// ---------------------------------------------------------------------------
// Acquisto utente: crea una trattativa (proposta → risposta CPU il giorno dopo)
// ---------------------------------------------------------------------------

export interface EsitoOffertaAcquisto {
  ok: boolean;
  errori?: string[];
  trattativa?: Trattativa;
}

export async function creaOffertaAcquisto(
  carrieraId: Id,
  giocatoreId: Id,
  cifra: number,
): Promise<EsitoOffertaAcquisto> {
  return db.transaction(
    'rw',
    [db.statoClub, db.carriere, db.giocatori, db.squadre, db.squadAssignments, db.trattative],
    async () => {
      const [carriera, stato] = await Promise.all([db.carriere.get(carrieraId), db.statoClub.get(carrieraId)]);
      if (!carriera || !stato) return { ok: false, errori: ['Carriera inesistente'] };
      if (stato.giornoMercato <= 0) return { ok: false, errori: ['Finestra di mercato chiusa'] };
      if (!Number.isFinite(cifra) || cifra <= 0) return { ok: false, errori: ['Cifra non valida'] };

      const giocatori = await db.giocatori.where('carrieraId').equals(carrieraId).toArray();
      const squadre = await db.squadre.where('carrieraId').equals(carrieraId).toArray();
      const assegnazioni = await db.squadAssignments.where('carrieraId').equals(carrieraId).toArray();

      const giocatore = giocatori.find((g) => g.id === giocatoreId);
      if (!giocatore) return { ok: false, errori: ['Giocatore inesistente'] };

      const proprieta = assegnazioni.find(
        (a) => a.giocatoreId === giocatoreId && a.tipo === 'proprieta' && a.al === undefined,
      );
      if (!proprieta) return { ok: false, errori: ['Giocatore senza club: usa la firma da svincolato'] };
      if (proprieta.squadraId === carriera.squadraId) return { ok: false, errori: ['Il giocatore è già nella tua rosa'] };

      const esistente = (await db.trattative.where('carrieraId').equals(carrieraId).toArray()).some(
        (t) => t.giocatoreId === giocatoreId && ['proposta', 'trattativa', 'accordo'].includes(t.stato),
      );
      if (esistente) return { ok: false, errori: ['Trattativa già in corso per questo giocatore'] };

      // Validazione preventiva (invarianti reali, PRD 7.2): budget e rosa
      const pre = validaTrasferimento(
        { giocatoreId, daSquadraId: proprieta.squadraId, aSquadraId: carriera.squadraId, cifra, stagione: carriera.stagione, settimana: stato.settimanaCorrente, giornoMercato: stato.giornoMercato },
        { giocatori, squadre, assignments: assegnazioni },
      );
      if (!pre.ok) return { ok: false, errori: pre.errori };

      const valore = valoreMercato(giocatore, carriera.stagione);
      const seed = `${carrieraId}|${giocatore.id}|trattativa`;
      const trattativa: Trattativa = {
        id: newId(),
        carrieraId,
        giocatoreId,
        clubId: proprieta.squadraId,
        direzione: 'acquisto',
        stato: 'proposta',
        giro: 0,
        cifraUtente: cifra,
        cifraCpu: 0,
        sogliaCpu: sogliaCpu(valore, seed),
        tettoCpu: undefined,
        giornoCreato: stato.giornoMercato,
        scadenzaRisposta: stato.giornoMercato + 1,
        finalOffer: false,
        messaggi: [
          {
            id: newId(),
            mittente: 'utente',
            testo: `Offerta di ${formattaCifra(cifra)} per ${giocatore.nome}.`,
            cifra,
            giorno: stato.giornoMercato,
          },
        ],
        updatedAt: Date.now(),
      };
      await db.trattative.add(trattativa);
      return { ok: true, trattativa };
    },
  );
}

// ---------------------------------------------------------------------------
// Firma di uno svincolato (decisione Q11: cifra zero, solo ingaggio)
// ---------------------------------------------------------------------------

export async function firmaSvincolato(carrieraId: Id, giocatoreId: Id): Promise<{ ok: boolean; errori?: string[] }> {
  return db.transaction(
    'rw',
    [db.statoClub, db.carriere, db.giocatori, db.squadre, db.squadAssignments, db.transferLedger],
    async () => {
      const [carriera, stato] = await Promise.all([db.carriere.get(carrieraId), db.statoClub.get(carrieraId)]);
      if (!carriera || !stato) return { ok: false, errori: ['Carriera inesistente'] };
      if (stato.giornoMercato <= 0) return { ok: false, errori: ['Finestra di mercato chiusa'] };

      const giocatori = await db.giocatori.where('carrieraId').equals(carrieraId).toArray();
      const assegnazioni = await db.squadAssignments.where('carrieraId').equals(carrieraId).toArray();
      const squadre = await db.squadre.where('carrieraId').equals(carrieraId).toArray();

      const giocatore = giocatori.find((g) => g.id === giocatoreId);
      if (!giocatore) return { ok: false, errori: ['Giocatore inesistente'] };
      if (giocatore.giovane) return { ok: false, errori: ['I giovani del vivaio non si firmano da svincolati'] };
      const attiva = assegnazioni.some(
        (a) => a.giocatoreId === giocatoreId && a.tipo === 'proprieta' && a.al === undefined,
      );
      if (attiva) return { ok: false, errori: ['Il giocatore ha già un club'] };

      const mia = squadre.find((s) => s.id === carriera.squadraId);
      if (!mia) return { ok: false, errori: ['Squadra utente inesistente'] };

      // Limite rosa (invariante PRD 7.2): il giocatore entra se non è portiere
      if (giocatore.ruolo !== 'portiere' && !giocatore.giovane) {
        const movimento = assegnazioni.filter(
          (a) => a.squadraId === mia.id && a.tipo === 'proprieta' && a.al === undefined,
        ).length;
        if (movimento >= 25) return { ok: false, errori: ['Rosa piena (max 25 di movimento)'] };
      }

      await db.squadAssignments.add({
        id: newId(),
        carrieraId,
        giocatoreId,
        squadraId: mia.id,
        tipo: 'proprieta',
        dal: carriera.stagione,
      });
      await db.transferLedger.add({
        id: newId(),
        carrieraId,
        giocatoreId,
        daSquadraId: SQUADRA_SVINCOLATI,
        aSquadraId: mia.id,
        cifra: 0,
        stagione: carriera.stagione,
        settimana: stato.settimanaCorrente,
        giornoMercato: stato.giornoMercato,
        esito: 'completato',
      });
      const valore = valoreMercato(giocatore, carriera.stagione);
      await db.giocatori.put({
        ...giocatore,
        scadenzaContratto: nuovaScadenzaContratto(carriera.stagione),
        ingaggioAnnuo: ingaggioDaValore(valore),
      });

      // Acquisto top: effetto morale (decisione Q8)
      const rosa = giocatori.filter((g) =>
        assegnazioni.some((a) => a.squadraId === mia.id && a.giocatoreId === g.id && a.tipo === 'proprieta' && a.al === undefined),
      );
      const effetto = effettiAcquisto(giocatore, rosa);
      if (effetto.moraleTutti !== 0 || effetto.fiduciaTifosi !== 0) {
        await db.giocatori.bulkPut(
          rosa.map((g) => ({ ...g, morale: clamp(g.morale + effetto.moraleTutti) })),
        );
        await db.statoClub.put({ ...stato, fiduciaTifosi: clamp(stato.fiduciaTifosi + effetto.fiduciaTifosi) });
      }
      return { ok: true };
    },
  );
}

// ---------------------------------------------------------------------------
// Risposta dell'utente a una trattativa (accetta / rifiuta / controproposta)
// ---------------------------------------------------------------------------

export type AzioneTrattativa =
  | { tipo: 'accetta' }
  | { tipo: 'rifiuta' }
  | { tipo: 'controproposta'; cifra: number };

export interface EsitoRisposta {
  ok: boolean;
  errori?: string[];
  /** Id dell'evento reazione creato (cessione eccellente), se presente */
  eventoReazioneId?: Id;
}

export async function rispondiTrattativa(
  carrieraId: Id,
  trattativaId: Id,
  azione: AzioneTrattativa,
): Promise<EsitoRisposta> {
  return db.transaction(
    'rw',
    [db.statoClub, db.carriere, db.giocatori, db.squadre, db.squadAssignments, db.trattative, db.transferLedger, db.eventi],
    async () => {
      const [carriera, stato, trattativa] = await Promise.all([
        db.carriere.get(carrieraId),
        db.statoClub.get(carrieraId),
        db.trattative.get(trattativaId),
      ]);
      if (!carriera || !stato || !trattativa) return { ok: false, errori: ['Trattativa inesistente'] };
      if (trattativa.carrieraId !== carrieraId) return { ok: false, errori: ['Trattativa di altra carriera'] };
      if (!['proposta', 'trattativa'].includes(trattativa.stato)) {
        return { ok: false, errori: [`Trattativa non più aperta (${trattativa.stato})`] };
      }

      // L'utente può rispondere solo quando è il SUO turno (ultimo messaggio CPU)
      const ultimo = trattativa.messaggi[trattativa.messaggi.length - 1];
      if (!ultimo || ultimo.mittente !== 'cpu') {
        return { ok: false, errori: ['Non è il tuo turno: la risposta della CPU arriva il giorno dopo'] };
      }

      const giocatori = await db.giocatori.where('carrieraId').equals(carrieraId).toArray();
      const squadre = await db.squadre.where('carrieraId').equals(carrieraId).toArray();
      const assegnazioni = await db.squadAssignments.where('carrieraId').equals(carrieraId).toArray();
      const giocatore = giocatori.find((g) => g.id === trattativa.giocatoreId);
      if (!giocatore) return { ok: false, errori: ['Giocatore inesistente'] };

      const interni: ContestoInterno = { carriera, stato, giocatori, squadre, assegnazioni };

      if (azione.tipo === 'accetta') {
        if (trattativa.tipoMovimento === 'prestito') {
          // Prestito (PRD 7.5): cifra 0, rientro automatico a fine stagione
          const prestito = await applicaPrestitoNelContesto({
            carrieraId,
            giocatoreId: trattativa.giocatoreId,
            daSquadraId: trattativa.direzione === 'acquisto' ? trattativa.clubId : carriera.squadraId,
            aSquadraId: trattativa.direzione === 'acquisto' ? carriera.squadraId : trattativa.clubId,
            stagione: carriera.stagione,
            settimana: stato.settimanaCorrente,
            giornoMercato: stato.giornoMercato,
          });
          if (!prestito.ok) return { ok: false, errori: prestito.errori ?? ['Prestito non valido'] };
          await db.trattative.put({
            ...trattativa,
            stato: 'applicata',
            messaggi: [
              ...trattativa.messaggi,
              { id: newId(), mittente: 'utente', testo: 'Accettato: accordo per il prestito.', giorno: stato.giornoMercato },
            ],
            updatedAt: Date.now(),
          });
          return { ok: true };
        }
        // Accordo → applicazione atomica con la cifra corrente (CPU o utente)
        const cifraFinale = trattativa.cifraCpu;
        const daSquadraId = trattativa.direzione === 'acquisto' ? trattativa.clubId : carriera.squadraId;
        const aSquadraId = trattativa.direzione === 'acquisto' ? carriera.squadraId : trattativa.clubId;
        const trasf = await trasferisciNelContesto(
          { giocatoreId: trattativa.giocatoreId, daSquadraId, aSquadraId, cifra: cifraFinale, stagione: carriera.stagione, settimana: stato.settimanaCorrente, giornoMercato: stato.giornoMercato },
          interni,
        );
        if (!trasf.ok) return { ok: false, errori: trasf.errori ?? ['Trasferimento non valido'] };

        await db.trattative.put({
          ...trattativa,
          stato: 'applicata',
          messaggi: [
            ...trattativa.messaggi,
            {
              id: newId(),
              mittente: 'utente',
              testo: azione.tipo === 'accetta' ? 'Accettato: chiudiamo l\'accordo.' : '',
              giorno: stato.giornoMercato,
            },
          ],
          updatedAt: Date.now(),
        });

        // Effetti morale/tifosi (decisione Q8) + evento reazione per cessioni eccellenti
        const mioGiocatore = trattativa.direzione === 'vendita';
        let eventoReazioneId: Id | undefined;
        if (mioGiocatore) {
          const rosa = giocatori.filter((g) =>
            assegnazioni.some((a) => a.squadraId === carriera.squadraId && a.giocatoreId === g.id && a.tipo === 'proprieta' && a.al === undefined),
          );
          const partiteCarriera = await db.partite.where('carrieraId').equals(carrieraId).toArray();
          const partiteGiocate = partiteCarriera.filter(
            (p) => p.giocata && (p.casa === carriera.squadraId || p.trasferta === carriera.squadraId),
          ).length;
          const presenzeTitolare = new Set(
            partiteCarriera.filter((p) => p.giocata && p.titolari).flatMap((p) => p.titolari ?? []),
          );
          const effetto = effettiCessione(
            giocatore,
            rosa,
            (gid: Id): number => (presenzeTitolare.has(gid) ? partiteCarriera.filter((p) => p.giocata && p.titolari?.includes(gid)).length : 0),
            partiteGiocate,
          );
          if (effetto.moraleTutti !== 0 || effetto.fiduciaTifosi !== 0) {
            await db.giocatori.bulkPut(
              rosa.map((g) => ({ ...g, morale: clamp(g.morale + effetto.moraleTutti) })),
            );
            await db.statoClub.put({ ...stato, fiduciaTifosi: clamp(stato.fiduciaTifosi + effetto.fiduciaTifosi) });
          }
          if (effetto.eventoReazione) {
            const clubAcquirente = squadre.find((s) => s.id === trattativa.clubId)?.nome ?? 'il nuovo club';
            const evento: Evento = {
              id: newId(),
              carrieraId,
              settimana: stato.settimanaCorrente,
              categoria: 'giocatore',
              tipo: 'scenario_emergente',
              titolo: 'Reazione alla cessione',
              testo: testoReazioneCessione(giocatore, clubAcquirente),
              giocatoriCoinvolti: [giocatore.nome],
              opzioni: [
                {
                  testo: 'Spiegare le ragioni sportive',
                  effettiProposti: { moraleGiocatori: 3, fiduciaGiocatori: 2, fiduciaSocieta: 0, fiduciaTifosi: 0, reputazione: 0 },
                },
                {
                  testo: 'Chiarire che la cifra era irrinunciabile',
                  effettiProposti: { moraleGiocatori: 1, fiduciaGiocatori: 0, fiduciaSocieta: 0, fiduciaTifosi: 1, reputazione: 0 },
                },
                {
                  testo: 'Non commentare',
                  effettiProposti: { moraleGiocatori: -2, fiduciaGiocatori: -2, fiduciaSocieta: 0, fiduciaTifosi: -2, reputazione: 0 },
                },
              ],
              effettiApplicati: false,
              origine: 'fallback',
            };
            await db.eventi.add(evento);
            eventoReazioneId = evento.id;
          }
        }
        return { ok: true, eventoReazioneId };
      }

      if (azione.tipo === 'rifiuta') {
        await db.trattative.put({ ...trattativa, stato: 'rifiutata', updatedAt: Date.now() });
        await db.transferLedger.add({
          id: newId(),
          carrieraId,
          giocatoreId: trattativa.giocatoreId,
          daSquadraId: trattativa.direzione === 'acquisto' ? trattativa.clubId : carriera.squadraId,
          aSquadraId: trattativa.direzione === 'acquisto' ? carriera.squadraId : trattativa.clubId,
          cifra: trattativa.cifraCpu,
          stagione: carriera.stagione,
          settimana: stato.settimanaCorrente,
          giornoMercato: stato.giornoMercato,
          esito: 'saltato',
          motivo: 'Offerta rifiutata',
        });
        return { ok: true };
      }

      // Controproposta dell'utente
      const cifra = azione.cifra;
      if (!Number.isFinite(cifra) || cifra <= 0) return { ok: false, errori: ['Cifra non valida'] };
      if (trattativa.finalOffer) {
        await db.trattative.put({ ...trattativa, stato: 'saltata', updatedAt: Date.now() });
        await db.transferLedger.add({
          id: newId(),
          carrieraId,
          giocatoreId: trattativa.giocatoreId,
          daSquadraId: trattativa.direzione === 'acquisto' ? trattativa.clubId : carriera.squadraId,
          aSquadraId: trattativa.direzione === 'acquisto' ? carriera.squadraId : trattativa.clubId,
          cifra,
          stagione: carriera.stagione,
          settimana: stato.settimanaCorrente,
          giornoMercato: stato.giornoMercato,
          esito: 'saltato',
          motivo: 'Final offer rifiutata: trattativa chiusa',
        });
        return { ok: true };
      }

      await db.trattative.put({
        ...trattativa,
        stato: 'trattativa',
        cifraUtente: cifra,
        scadenzaRisposta: stato.giornoMercato + 1,
        messaggi: [
          ...trattativa.messaggi,
          { id: newId(), mittente: 'utente', testo: `Controproposta: ${formattaCifra(cifra)}.`, cifra, giorno: stato.giornoMercato },
        ],
        updatedAt: Date.now(),
      });
      return { ok: true };
    },
  );
}

// ---------------------------------------------------------------------------
// Avanzamento del giorno di mercato (il cuore dell'orchestrazione)
// ---------------------------------------------------------------------------

export interface EsitoGiornoMercato {
  esito: 'avanzato' | 'chiusa' | 'non_attiva';
  giorno: number;
  finestra: FinestraMercato | null;
  movimentiCpu: number;
  offerteCreate: number;
  accordi: number;
  scadute: number;
  notizie: Notizia[];
}

export async function avanzaGiornoMercato(carrieraId: Id): Promise<EsitoGiornoMercato> {
  // ---------- Fase 1: transazione — giorno, risposte CPU, scadenze, deadline, offerte, CPU-to-CPU ----------
  const dati = await db.transaction(
    'rw',
    [db.statoClub, db.carriere, db.giocatori, db.squadre, db.squadAssignments, db.trattative, db.transferLedger, db.partite, db.eventi],
    async () => {
      const [carriera, stato] = await Promise.all([db.carriere.get(carrieraId), db.statoClub.get(carrieraId)]);
      if (!carriera || !stato) throw new Error('Carriera incompleta');
      if (stato.giornoMercato <= 0) {
        return { esito: 'non_attiva' as const, giorno: 0, movimentiCpu: 0, offerteCreate: 0, accordi: 0, scadute: 0, movimentiInteressanti: [] as Array<{ giocatore: string; da: string; a: string; cifra: number }> };
      }

      const finestra = finestraDiSettimana(stato.settimanaCorrente);
      const nuovoGiorno = stato.giornoMercato + 1;

      // Chiusura finestra: giorno 30 finito → must-respond + si torna al calendario
      if (nuovoGiorno > GIORNI_FINESTRA) {
        const trattative = await db.trattative.where('carrieraId').equals(carrieraId).toArray();
        for (const t of trattative) {
          if (!['proposta', 'trattativa', 'accordo'].includes(t.stato)) continue;
          await db.trattative.put({ ...t, stato: 'scaduta', updatedAt: Date.now() });
          const daSquadraId = t.direzione === 'acquisto' ? t.clubId : carriera.squadraId;
          const aSquadraId = t.direzione === 'acquisto' ? carriera.squadraId : t.clubId;
          await db.transferLedger.add({
            id: newId(),
            carrieraId,
            giocatoreId: t.giocatoreId,
            daSquadraId,
            aSquadraId,
            cifra: t.cifraCpu || t.cifraUtente,
            stagione: carriera.stagione,
            settimana: stato.settimanaCorrente,
            giornoMercato: GIORNI_FINESTRA,
            esito: 'saltato',
            motivo: 'Finestra chiusa (deadline day)',
          });
        }
        await db.statoClub.put({ ...stato, giornoMercato: 0 });
        return { esito: 'chiusa' as const, giorno: 0, movimentiCpu: 0, offerteCreate: 0, accordi: 0, scadute: trattative.length, movimentiInteressanti: [] };
      }

      const giocatori = await db.giocatori.where('carrieraId').equals(carrieraId).toArray();
      const squadre = await db.squadre.where('carrieraId').equals(carrieraId).toArray();
      const assegnazioni = await db.squadAssignments.where('carrieraId').equals(carrieraId).toArray();
      const trattative = await db.trattative.where('carrieraId').equals(carrieraId).toArray();
      const ledger = await db.transferLedger.where('carrieraId').equals(carrieraId).toArray();

      const interni: ContestoInterno = { carriera, stato, giocatori, squadre, assegnazioni };
      const mappaGiocatori = new Map(giocatori.map((g) => [g.id, g]));
      const rosaUtente = giocatori.filter((g) =>
        assegnazioni.some((a) => a.squadraId === carriera.squadraId && a.giocatoreId === g.id && a.tipo === 'proprieta' && a.al === undefined),
      );

      let accordi = 0;
      let offerteCreate = 0;
      let scadute = 0;
      let movimentiCpu = 0;
      const movimentiInteressanti: Array<{ giocatore: string; da: string; a: string; cifra: number }> = [];

      // 1. Risposte CPU alle mosse dell'utente (round-trip = 1 giorno)
      for (const t of trattative) {
        if (!['proposta', 'trattativa'].includes(t.stato)) continue;
        if (t.scadenzaRisposta > nuovoGiorno) continue;
        const ultimo = t.messaggi[t.messaggi.length - 1];
        if (!ultimo || ultimo.mittente !== 'utente') continue;

        const g = mappaGiocatori.get(t.giocatoreId);
        if (!g) continue;

        // Prestiti (PRD 7.5): la CPU accetta sempre la richiesta di prestito
        // (nessuna cifra in gioco): l'accordo si applica direttamente.
        if (t.tipoMovimento === 'prestito') {
          const prestito = await applicaPrestitoNelContesto({
            carrieraId,
            giocatoreId: t.giocatoreId,
            daSquadraId: t.direzione === 'acquisto' ? t.clubId : carriera.squadraId,
            aSquadraId: t.direzione === 'acquisto' ? carriera.squadraId : t.clubId,
            stagione: carriera.stagione,
            settimana: stato.settimanaCorrente,
            giornoMercato: nuovoGiorno,
          });
          if (prestito.ok) {
            accordi++;
            await db.trattative.put({
              ...t,
              stato: 'applicata',
              messaggi: [
                ...t.messaggi,
                {
                  id: newId(),
                  mittente: 'cpu',
                  testo: `Prestito concordato: ${g.nome} si trasferisce a titolo temporaneo per la stagione.`,
                  giorno: nuovoGiorno,
                },
              ],
              updatedAt: Date.now(),
            });
          }
          continue;
        }

        const valore = valoreMercato(g, carriera.stagione);
        const risposta = rispostaCpu(t, valore, t.cifraUtente, `${carrieraId}|${t.id}|risp`);

        if (risposta.accettata) {
          // La CPU accetta → accordo → applicazione atomica
          const daSquadraId = t.direzione === 'acquisto' ? t.clubId : carriera.squadraId;
          const aSquadraId = t.direzione === 'acquisto' ? carriera.squadraId : t.clubId;
          const trasf = await trasferisciNelContesto(
            { giocatoreId: t.giocatoreId, daSquadraId, aSquadraId, cifra: t.cifraUtente, stagione: carriera.stagione, settimana: stato.settimanaCorrente, giornoMercato: nuovoGiorno },
            interni,
          );
          if (trasf.ok) {
            accordi++;
            await db.trattative.put({
              ...t,
              stato: 'applicata',
              messaggi: [
                ...t.messaggi,
                {
                  id: newId(),
                  mittente: 'cpu',
                  testo: testoRispostaCpu('accettata', g, t.cifraUtente, `${carrieraId}|${t.id}|risp`),
                  cifra: t.cifraUtente,
                  giorno: nuovoGiorno,
                },
              ],
              updatedAt: Date.now(),
            });
            // Effetti cessione/acquisto sulla rosa utente (decisione Q8)
            const mioGiocatore = t.direzione === 'vendita';
            if (mioGiocatore) {
              const effetto = effettiCessione(g, rosaUtente, () => 0, 0);
              if (effetto.moraleTutti !== 0 || effetto.fiduciaTifosi !== 0) {
                await db.giocatori.bulkPut(rosaUtente.map((x) => ({ ...x, morale: clamp(x.morale + effetto.moraleTutti) })));
                await db.statoClub.put({ ...stato, fiduciaTifosi: clamp(stato.fiduciaTifosi + effetto.fiduciaTifosi) });
              }
            } else {
              const effetto = effettiAcquisto(g, rosaUtente);
              if (effetto.moraleTutti !== 0 || effetto.fiduciaTifosi !== 0) {
                await db.giocatori.bulkPut(rosaUtente.map((x) => ({ ...x, morale: clamp(x.morale + effetto.moraleTutti) })));
                await db.statoClub.put({ ...stato, fiduciaTifosi: clamp(stato.fiduciaTifosi + effetto.fiduciaTifosi) });
              }
            }
          }
        } else {
          // Controproposta o final offer
          const nuovoGiro = t.giro + 1;
          const final = risposta.finalOffer || nuovoGiro >= GIORNI_GIRO_CPU;
          const testo = testoRispostaCpu(final ? 'final_offer' : 'controproposta', g, risposta.cifraCpu, `${carrieraId}|${t.id}|risp`);
          await db.trattative.put({
            ...t,
            stato: 'trattativa',
            giro: nuovoGiro,
            cifraCpu: risposta.cifraCpu,
            finalOffer: final,
            scadenzaRisposta: nuovoGiorno + 1,
            messaggi: [
              ...t.messaggi,
              { id: newId(), mittente: 'cpu', testo, cifra: risposta.cifraCpu, giorno: nuovoGiorno },
            ],
            updatedAt: Date.now(),
          });
        }
      }

      // 2. Scadenze offerte in entrata (4 giorni, decisione Q6)
      for (const t of trattative) {
        if (!['proposta', 'trattativa'].includes(t.stato)) continue;
        const ultimo = t.messaggi[t.messaggi.length - 1];
        if (!ultimo || ultimo.mittente !== 'cpu') continue;
        if (t.scadenzaRisposta >= nuovoGiorno) continue;
        scadute++;
        await db.trattative.put({ ...t, stato: 'scaduta', updatedAt: Date.now() });
        await db.transferLedger.add({
          id: newId(),
          carrieraId,
          giocatoreId: t.giocatoreId,
          daSquadraId: t.direzione === 'acquisto' ? t.clubId : carriera.squadraId,
          aSquadraId: t.direzione === 'acquisto' ? carriera.squadraId : t.clubId,
          cifra: t.cifraCpu || t.cifraUtente,
          stagione: carriera.stagione,
          settimana: stato.settimanaCorrente,
          giornoMercato: nuovoGiorno,
          esito: 'saltato',
          motivo: 'Offerta scaduta',
        });
      }

      // 3. Deadline day (giorno 30): offerta lampo (decisione Q9)
      if (nuovoGiorno === GIORNI_FINESTRA) {
        const rand = prng(hashSeed(`${carrieraId}|dd`));
        if (rand() < OFFERTA_LAMPO_PROBABILITA) {
          const candidati = rosaUtente.filter((g) => eleggibilePerOfferta(g, stato.settimanaCorrente));
          if (candidati.length > 0) {
            const scelto = candidati[Math.floor(rand() * candidati.length)] ?? null;
            if (scelto) {
              const valore = valoreMercato(scelto, carriera.stagione);
              const fattore = OFFERTA_LAMPO_FATTORE_MIN + rand() * (OFFERTA_LAMPO_FATTORE_MAX - OFFERTA_LAMPO_FATTORE_MIN);
              const cifra = Math.round((valore * fattore) / 1_000_000) * 1_000_000;
              const club = squadre
                .filter((s) => s.id !== carriera.squadraId && s.budget >= cifra)
                .sort((a, b) => b.rating - a.rating)[0];
              if (club) {
                const t: Trattativa = {
                  id: newId(),
                  carrieraId,
                  giocatoreId: scelto.id,
                  clubId: club.id,
                  direzione: 'vendita',
                  stato: 'proposta',
                  giro: 0,
                  cifraUtente: 0,
                  cifraCpu: cifra,
                  sogliaCpu: 0,
                  tettoCpu: cifra,
                  giornoCreato: nuovoGiorno,
                  scadenzaRisposta: nuovoGiorno,
                  finalOffer: true,
                  messaggi: [
                    {
                      id: newId(),
                      mittente: 'cpu',
                      testo: `ULTIMO GIORNO: il ${club.nome} offre ${formattaCifra(cifra)} per ${scelto.nome}. Risposta entro oggi, poi l'offerta decade.`,
                      cifra,
                      giorno: nuovoGiorno,
                    },
                  ],
                  updatedAt: Date.now(),
                };
                await db.trattative.add(t);
                offerteCreate++;
              }
            }
          }
        }
      }

      // 4. Nuove offerte in entrata (decisione Q6: 3-5 estate, 1-3 gennaio, max 1/giorno)
      if (nuovoGiorno < GIORNI_FINESTRA) {
        const maxFinestra = finestra === 'estate' ? OFFERTE_ENTRATA_ESTATE.max : OFFERTE_ENTRATA_INVERNO.max;
        const create = trattative.filter((t) => t.direzione === 'vendita' && t.giornoCreato <= stato.giornoMercato && ['proposta', 'trattativa', 'accordo'].includes(t.stato)).length;
        const oggiGiaCreate = trattative.some((t) => t.direzione === 'vendita' && t.giornoCreato === nuovoGiorno);
        if (create < maxFinestra && !oggiGiaCreate) {
          const rand = prng(hashSeed(`${carrieraId}|off|${nuovoGiorno}`));
          const candidati = rosaUtente
            .filter((g) => eleggibilePerOfferta(g, stato.settimanaCorrente))
            .map((g) => ({ g, peso: appetibilita(g, valoreMercato(g, carriera.stagione)) }))
            .filter((x) => x.peso > 0)
            .sort((a, b) => b.peso - a.peso);

          // Offerta di PRESTITO (PRD 7.5): la CPU chiede un tuo giovane a titolo
          // temporaneo (quota dei movimenti reali ~30%). Cifra 0, 1 stagione.
          if (candidati.length > 0 && rand() < PRESTITI_QUOTA_MOVIMENTI) {
            const giovani = rosaUtente.filter(
              (g) => (g.giovane || g.eta <= 23) && g.overall <= 78 &&
                !assegnazioni.some((a) => a.giocatoreId === g.id && a.tipo === 'prestito' && a.al === undefined),
            );
            if (giovani.length > 0) {
              const scelto = giovani[Math.floor(rand() * giovani.length)];
              if (scelto) {
                const reparto = repartoDi(scelto.ruolo);
                const acquirenti = squadre
                  .filter((s) => s.id !== carriera.squadraId)
                  .map((s) => ({ s, bisogni: bisogniRosa(s, giocatori, assegnazioni, 1500) }))
                  .filter(({ bisogni }) => bisogni.some((b) => b.ruolo === reparto && b.intensita > 30))
                  .sort((a, b) => b.s.rating - a.s.rating);
                const sceltoClub = acquirenti[Math.floor(rand() * Math.min(2, acquirenti.length))]?.s ?? acquirenti[0]?.s ?? null;
                if (sceltoClub) {
                  const t: Trattativa = {
                    id: newId(),
                    carrieraId,
                    giocatoreId: scelto.id,
                    clubId: sceltoClub.id,
                    direzione: 'vendita',
                    tipoMovimento: 'prestito',
                    stato: 'proposta',
                    giro: 0,
                    cifraUtente: 0,
                    cifraCpu: 0,
                    sogliaCpu: 0,
                    tettoCpu: 0,
                    giornoCreato: nuovoGiorno,
                    scadenzaRisposta: nuovoGiorno + GIORNI_SCADENZA_OFFERTA,
                    finalOffer: false,
                    messaggi: [
                      {
                        id: newId(),
                        mittente: 'cpu',
                        testo: `Il ${sceltoClub.nome} chiede ${scelto.nome} in prestito per una stagione: gli servono minuti e noi lo faremmo giocare con continuità.`,
                        giorno: nuovoGiorno,
                      },
                    ],
                    updatedAt: Date.now(),
                  };
                  await db.trattative.add(t);
                  offerteCreate++;
                }
              }
            }
          } else if (rand() < PRESTITI_QUOTA_MOVIMENTI) {
            // Prestito IN ENTRATA: un club CPU ti offre un suo giovane a titolo
            // temporaneo (copertura di reparto, come nel calcio reale).
            const mieiRuoli = new Set(rosaUtente.map((g) => repartoDi(g.ruolo)));
            const candidatiPrestito = giocatori
              .filter(
                (g) =>
                  (g.giovane || g.eta <= 23) &&
                  g.overall >= 62 && g.overall <= 80 &&
                  !assegnazioni.some((a) => a.giocatoreId === g.id && a.tipo === 'prestito' && a.al === undefined) &&
                  !mieiRuoli.has(repartoDi(g.ruolo)),
              )
              .map((g) => {
                const a = assegnazioni.find((x) => x.giocatoreId === g.id && x.tipo === 'proprieta' && x.al === undefined);
                return { g, club: a ? squadre.find((s) => s.id === a.squadraId) : undefined };
              })
              .filter((x): x is { g: Giocatore; club: Squadra } => x.club !== undefined && x.club.id !== carriera.squadraId);
            if (candidatiPrestito.length > 0) {
              const scelto = candidatiPrestito[Math.floor(rand() * candidatiPrestito.length)];
              if (scelto) {
                const t: Trattativa = {
                  id: newId(),
                  carrieraId,
                  giocatoreId: scelto.g.id,
                  clubId: scelto.club.id,
                  direzione: 'acquisto',
                  tipoMovimento: 'prestito',
                  stato: 'proposta',
                  giro: 0,
                  cifraUtente: 0,
                  cifraCpu: 0,
                  sogliaCpu: 0,
                  tettoCpu: 0,
                  giornoCreato: nuovoGiorno,
                  scadenzaRisposta: nuovoGiorno + GIORNI_SCADENZA_OFFERTA,
                  finalOffer: false,
                  messaggi: [
                    {
                      id: newId(),
                      mittente: 'cpu',
                      testo: `Il ${scelto.club.nome} ti propone ${scelto.g.nome} (${scelto.g.eta} anni, ${scelto.g.ruolo}, ov ${scelto.g.overall}) in prestito per una stagione: copertura immediata per il reparto.`,
                      giorno: nuovoGiorno,
                    },
                  ],
                  updatedAt: Date.now(),
                };
                await db.trattative.add(t);
                offerteCreate++;
              }
            }
          } else if (candidati.length > 0) {
            const scelto = candidati[Math.floor(rand() * Math.min(3, candidati.length))]?.g ?? null;
            if (scelto) {
              const valore = valoreMercato(scelto, carriera.stagione);
              const reparto = repartoDi(scelto.ruolo);
              // Club acquirente: con bisogno del reparto e budget sufficiente
              const acquirenti = squadre
                .filter((s) => s.id !== carriera.squadraId && s.budget >= valore)
                .map((s) => ({ s, bisogni: bisogniRosa(s, giocatori, assegnazioni, 1500) }))
                .filter(({ bisogni }) => bisogni.some((b) => b.ruolo === reparto && b.intensita > 30))
                .sort((a, b) => b.s.rating - a.s.rating);
              const sceltoClub = (acquirenti[Math.floor(rand() * Math.min(2, acquirenti.length))]?.s ?? acquirenti[0]?.s) ?? null;
              if (sceltoClub) {
                const bisogno = bisogniRosa(sceltoClub, giocatori, assegnazioni, 1500).find((b) => b.ruolo === reparto);
                const intensita = (bisogno?.intensita ?? 50) / 100;
                const cifra = cifraOfferta(valore, intensita, rand);
                const t: Trattativa = {
                  id: newId(),
                  carrieraId,
                  giocatoreId: scelto.id,
                  clubId: sceltoClub.id,
                  direzione: 'vendita',
                  stato: 'proposta',
                  giro: 0,
                  cifraUtente: 0,
                  cifraCpu: cifra,
                  sogliaCpu: 0,
                  tettoCpu: cifra,
                  giornoCreato: nuovoGiorno,
                  scadenzaRisposta: nuovoGiorno + GIORNI_SCADENZA_OFFERTA,
                  finalOffer: false,
                  messaggi: [
                    {
                      id: newId(),
                      mittente: 'cpu',
                      testo: testoOffertaInEntrata(scelto, sceltoClub.nome, cifra, bisogno?.motivo ?? `Cerchiamo un ${reparto} di livello`),
                      cifra,
                      giorno: nuovoGiorno,
                    },
                  ],
                  updatedAt: Date.now(),
                };
                await db.trattative.add(t);
                offerteCreate++;
              }
            }
          }
        }
      }

      // 5. Mercato CPU-to-CPU (decisione Q5b: 8-12/giorno estate, ~40% gennaio)
      const randTarget = prng(hashSeed(`${carrieraId}|target|${nuovoGiorno}`));
      const target = Math.round(
        (MOVIMENTI_GIORNO_MIN + Math.floor(randTarget() * (MOVIMENTI_GIORNO_MAX - MOVIMENTI_GIORNO_MIN + 1))) *
          (finestra === 'inverno' ? VOLUME_INVERNO_FRAZIONE : 1),
      );
      const venditePerClub = new Map<Id, number>();
      for (const v of ledger.filter((v) => v.esito === 'completato' && v.settimana <= stato.settimanaCorrente)) {
        venditePerClub.set(v.daSquadraId, (venditePerClub.get(v.daSquadraId) ?? 0) + 1);
      }
      const randCpu = prng(hashSeed(`${carrieraId}|cpu|${nuovoGiorno}`));
      const acquirenti = [...squadre]
        .filter((s) => s.id !== carriera.squadraId)
        .sort((a, b) => b.rating - a.rating);
      const giaCoinvolti = new Set<Id>();
      let tentativi = 0;
      while (movimentiCpu < target && tentativi < target * 12) {
        tentativi++;
        const acquirente = acquirenti[Math.floor(randCpu() * acquirenti.length)];
        if (!acquirente) break;
        if (giaCoinvolti.has(acquirente.id)) continue;
        const bisogni = bisogniRosa(acquirente, giocatori, assegnazioni, 1500).sort((a, b) => b.intensita - a.intensita);
        if (bisogni.length === 0) { giaCoinvolti.add(acquirente.id); continue; }
        const bisogno = bisogni[0];
        if (bisogno === undefined) { giaCoinvolti.add(acquirente.id); continue; }

        // Candidato: miglior giocatore del reparto da un ALTRO club (mai dalla rosa utente)
        const cedenti = squadre.filter(
          (s) => s.id !== acquirente.id && s.id !== carriera.squadraId && (venditePerClub.get(s.id) ?? 0) < MAX_GIOCATORI_VENDITA_ANNO,
        );

        // Prestito CPU-to-CPU (PRD 7.5, quota ~30%): giovane sottoutilizzato
        // di un altro club → club con bisogno nello stesso reparto. Cifra 0.
        if (randCpu() < PRESTITI_QUOTA_MOVIMENTI) {
          const giovaniInPrestito = cedenti
            .map((s) =>
              giocatori
                .filter(
                  (g) =>
                    (g.giovane || g.eta <= 23) &&
                    !g.leader &&
                    (g.infortunioFinoA ?? 0) <= stato.settimanaCorrente &&
                    repartoDi(g.ruolo) === bisogno.ruolo &&
                    assegnazioni.some((a) => a.squadraId === s.id && a.giocatoreId === g.id && a.tipo === 'proprieta' && a.al === undefined) &&
                    !assegnazioni.some((a) => a.giocatoreId === g.id && a.tipo === 'prestito' && a.al === undefined),
                )
                .map((g) => ({ g, s })),
            )
            .flat();
          if (giovaniInPrestito.length > 0) {
            const scelto = giovaniInPrestito[Math.floor(randCpu() * giovaniInPrestito.length)];
            if (scelto) {
              const prestito = await applicaPrestitoNelContesto({
                carrieraId,
                giocatoreId: scelto.g.id,
                daSquadraId: scelto.s.id,
                aSquadraId: acquirente.id,
                stagione: carriera.stagione,
                settimana: stato.settimanaCorrente,
                giornoMercato: nuovoGiorno,
              });
              if (prestito.ok) {
                movimentiCpu++;
                giaCoinvolti.add(acquirente.id);
                giaCoinvolti.add(scelto.s.id);
              }
              continue;
            }
          }
        }

        let candidato: Giocatore | null = null;
        let cedente: Squadra | null = null;
        for (const s of cedenti.sort(() => randCpu() - 0.5)) {
          const g = migliorGiocatoreRuolo(bisogno.ruolo, giocatori, assegnazioni, s.id);
          if (!g || g.leader || (g.infortunioFinoA ?? 0) > stato.settimanaCorrente) continue;
          // Il cedente deve restare coperto nel reparto (almeno 1 altro giocatore)
          const altri = giocatori.filter(
            (x) =>
              x.id !== g.id &&
              assegnazioni.some((a) => a.squadraId === s.id && a.giocatoreId === x.id && a.tipo === 'proprieta' && a.al === undefined),
          );
          if (!altri.some((x) => repartoDi(x.ruolo) === bisogno.ruolo)) continue;
          const valore = valoreMercato(g, carriera.stagione);
          if (valore > acquirente.budget * 0.9) continue;
          candidato = g;
          cedente = s;
          break;
        }
        if (!candidato || !cedente) { giaCoinvolti.add(acquirente.id); continue; }

        const valore = valoreMercato(candidato, carriera.stagione);
        const cifra = Math.round((valore * (0.85 + randCpu() * 0.3)) / 1_000_000) * 1_000_000;
        const trasf = await trasferisciNelContesto(
          { giocatoreId: candidato.id, daSquadraId: cedente.id, aSquadraId: acquirente.id, cifra, stagione: carriera.stagione, settimana: stato.settimanaCorrente, giornoMercato: nuovoGiorno },
          interni,
        );
        if (!trasf.ok) { giaCoinvolti.add(acquirente.id); continue; }
        movimentiCpu++;
        venditePerClub.set(cedente.id, (venditePerClub.get(cedente.id) ?? 0) + 1);
        giaCoinvolti.add(acquirente.id);
        giaCoinvolti.add(cedente.id);

        // Notizia "interessante": club top-5 coinvolto E (cifra alta o overall alto)
        const leva = (s: Squadra | null): boolean => (s?.campionato ? LEGHE_TOP5.has(s.campionato) : false);
        const daTop = leva(cedente);
        const aTop = leva(acquirente);
        const cifraAlta = cifra >= NOTIZIA_MERCATO_CIFRA_MIN;
        const overallAlto = candidato.overall >= NOTIZIA_MERCATO_OVERALL_MIN;
        if ((daTop || aTop) && (cifraAlta || overallAlto)) {
          movimentiInteressanti.push({
            giocatore: candidato.nome,
            da: cedente.nome,
            a: acquirente.nome,
            cifra,
          });
        }
      }

      // Stato aggiornato (giorno + budget UI riletto dal DB: mai stantio)
      const miaAggiornata = await db.squadre.get(carriera.squadraId);
      await db.statoClub.put({
        ...stato,
        giornoMercato: nuovoGiorno,
        budget: miaAggiornata?.budget ?? stato.budget,
      });

      return {
        esito: 'avanzato' as const,
        giorno: nuovoGiorno,
        finestra,
        movimentiCpu,
        offerteCreate,
        accordi,
        scadute,
        target,
        movimentiInteressanti,
        trattativeNuove: (await db.trattative.where('carrieraId').equals(carrieraId).toArray()).filter(
          (t) => t.giornoCreato === nuovoGiorno,
        ),
      };
    },
  );

  if (dati.esito !== 'avanzato') {
    return { esito: dati.esito, giorno: 0, finestra: null, movimentiCpu: 0, offerteCreate: 0, accordi: 0, scadute: 0, notizie: [] };
  }

  // ---------- Fase 2 (fuori transazione): LLM — testi offerte, risposte, cronaca ----------
  const testoMerce = dati as typeof dati & {
    trattativeNuove: Trattativa[];
  };
  const stato = await db.statoClub.get(carrieraId);
  const carriera = await db.carriere.get(carrieraId);
  const notizie: Notizia[] = [];
  let movimentiExtra = 0;

  if (stato && carriera) {
    // Scenari LLM CPU-to-CPU (PRD 7.3: "l'LLM propone, l'engine valida e applica
    // solo transazioni valide"). Si tenta SOLO se la giornata ha ancora spazio
    // (target non raggiunto dall'engine deterministico) e l'LLM è configurato.
    // Ogni movimento proposto viene validato contro le invarianti (eseguiTrasferimento)
    // e applicato solo se le squadre e il giocatore esistono davvero.
    if ((dati as { movimentiCpu: number; target: number }).movimentiCpu < (dati as { target: number }).target) {
      const mappaSquadre = new Map((await db.squadre.where('carrieraId').equals(carrieraId).toArray()).map((s) => [s.id, s]));
      const giocatoriWorld = await db.giocatori.where('carrieraId').equals(carrieraId).toArray();
      const assegnazioniWorld = await db.squadAssignments.where('carrieraId').equals(carrieraId).toArray();
      const bisogni = await squadreConBisogni(carrieraId, giocatoriWorld, assegnazioniWorld, 8);
      const disponibili = giocatoriWorld
        .filter((g) => !g.leader && (g.infortunioFinoA ?? 0) <= stato.settimanaCorrente)
        .slice(0, 40)
        .map((g) => {
          const a = assegnazioniWorld.find((x) => x.giocatoreId === g.id && x.tipo === 'proprieta' && x.al === undefined);
          return {
            nome: g.nome,
            club: a ? (mappaSquadre.get(a.squadraId)?.nome ?? '—') : '—',
            ruolo: g.ruolo,
            overall: g.overall,
            eta: g.eta,
            valore: valoreMercato(g, carriera.stagione),
          };
        });
      if (bisogni.length > 0 && disponibili.length > 0 && dati.finestra) {
        const scenari = await generaScenariMercatoCpu({
          finestra: nomeFinestra(dati.finestra),
          giorno: dati.giorno,
          bisogni,
          disponibili,
        });
        if (scenari) {
          const normalizza = (nome: string): string => nome.trim().toLowerCase().replace(/\s+/g, ' ');
          const giocatorePerNome = new Map(giocatoriWorld.map((g) => [normalizza(g.nome), g]));
          const squadraPerNome = new Map([...mappaSquadre.values()].map((s) => [normalizza(s.nome), s]));
          for (const m of scenari.movimenti.slice(0, 3)) {
            const g = giocatorePerNome.get(normalizza(m.giocatore));
            const da = squadraPerNome.get(normalizza(m.da));
            const a = squadraPerNome.get(normalizza(m.a));
            if (!g || !da || !a || da.id === a.id || g.leader) continue;
            const proprieta = assegnazioniWorld.find(
              (x) => x.giocatoreId === g.id && x.tipo === 'proprieta' && x.al === undefined,
            );
            if (!proprieta || proprieta.squadraId !== da.id) continue;
            if (proprieta.squadraId === carriera.squadraId || a.id === carriera.squadraId) continue;
            // La cifra proposta dall'LLM è un suggerimento: l'engine la ricalcola
            // entro i limiti reali (0.85-1.3 × valore, mai oltre il budget)
            const valore = valoreMercato(g, carriera.stagione);
            const cifra = Math.max(0, Math.min(Math.round((m.cifra) / 1_000_000) * 1_000_000, a.budget));
            if (cifra <= 0 || cifra < valore * 0.5 || cifra > valore * 1.5) continue;
            const esito = await eseguiTrasferimento({
              giocatoreId: g.id,
              daSquadraId: da.id,
              aSquadraId: a.id,
              cifra,
              stagione: carriera.stagione,
              settimana: stato.settimanaCorrente,
              giornoMercato: dati.giorno,
            });
            if (esito.ok) {
              movimentiExtra++;
              const daTop = da.campionato !== undefined && LEGHE_TOP5.has(da.campionato);
              const aTop = a.campionato !== undefined && LEGHE_TOP5.has(a.campionato);
              if ((daTop || aTop) && (cifra >= NOTIZIA_MERCATO_CIFRA_MIN || g.overall >= NOTIZIA_MERCATO_OVERALL_MIN)) {
                const n: Notizia = {
                  id: newId(),
                  carrieraId,
                  settimana: stato.settimanaCorrente,
                  testo: testoNotiziaMercato(g.nome, da.nome, a.nome, cifra),
                  origine: 'llm',
                  giornoMercato: dati.giorno,
                };
                await db.notizie.add(n);
                notizie.push(n);
              }
            }
          }
        }
      }
    }

    // Cronaca del giorno: fallback engine ora, LLM se disponibile (PRD 4.6)
    const movimenti = (dati as { movimentiInteressanti: Array<{ giocatore: string; da: string; a: string; cifra: number }> }).movimentiInteressanti;
    if (movimenti.length > 0) {
      const fallbackTesti = movimenti.map((m) => testoNotiziaMercato(m.giocatore, m.da, m.a, m.cifra));
      let testi: string[] = fallbackTesti;
      let origine: 'engine' | 'llm' = 'engine';
      if (dati.finestra) {
        const cronaca = await generaCronacaMercato({
          finestra: nomeFinestra(dati.finestra),
          giorno: dati.giorno,
          movimenti: movimenti.slice(0, 8),
        });
        if (cronaca && cronaca.length > 0) {
          testi = cronaca;
          origine = 'llm';
        }
      }
      for (const testo of testi.slice(0, 4)) {
        const n: Notizia = {
          id: newId(),
          carrieraId,
          settimana: stato.settimanaCorrente,
          testo,
          origine,
          giornoMercato: dati.giorno,
        };
        await db.notizie.add(n);
        notizie.push(n);
      }
    }

    // Polish LLM dei testi delle nuove offerte in entrata (sostituisce il fallback)
    const giocatori = await db.giocatori.where('carrieraId').equals(carrieraId).toArray();
    const squadre = await db.squadre.where('carrieraId').equals(carrieraId).toArray();
    const mappaSquadre = new Map(squadre.map((s) => [s.id, s]));
    for (const t of testoMerce.trattativeNuove.filter((t) => t.direzione === 'vendita' && !t.finalOffer)) {
      const g = giocatori.find((x) => x.id === t.giocatoreId);
      const club = mappaSquadre.get(t.clubId);
      if (!g || !club) continue;
      const proposta = await generaOffertaInEntrata({
        giocatore: g.nome,
        ruolo: g.ruolo,
        overall: g.overall,
        eta: g.eta,
        clubAcquirente: club.nome,
        cifra: t.cifraCpu,
        bisogno: 'Il profilo ci manca in rosa',
      });
      if (proposta) {
        const aggiornata = await db.trattative.get(t.id);
        if (aggiornata && aggiornata.messaggi.length > 0) {
          const messaggi = [...aggiornata.messaggi];
          messaggi[messaggi.length - 1] = { ...messaggi[messaggi.length - 1]!, testo: proposta.testo };
          await db.trattative.put({ ...aggiornata, messaggi });
        }
      }
    }
  }

  return {
    esito: 'avanzato',
    giorno: (dati as { giorno: number }).giorno,
    finestra: dati.finestra,
    movimentiCpu: (dati as { movimentiCpu: number }).movimentiCpu + movimentiExtra,
    offerteCreate: dati.offerteCreate,
    accordi: dati.accordi,
    scadute: dati.scadute,
    notizie,
  };
}

function hashSeed(valore: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < valore.length; i++) {
    h ^= valore.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Bisogni delle top squadre (per il prompt scenari LLM): club, ruolo, motivo. */
async function squadreConBisogni(
  carrieraId: Id,
  giocatori: Giocatore[],
  assegnazioni: SquadAssignment[],
  max: number,
): Promise<Array<{ club: string; ruolo: string; motivo: string }>> {
  const squadre = await db.squadre.where('carrieraId').equals(carrieraId).toArray();
  const out: Array<{ club: string; ruolo: string; motivo: string }> = [];
  for (const s of [...squadre].sort((a, b) => b.rating - a.rating)) {
    const bisogni = bisogniRosa(s, giocatori, assegnazioni, 1500).sort((a, b) => b.intensita - a.intensita);
    const primo = bisogni[0];
    if (primo && out.length < max) {
      out.push({ club: s.nome, ruolo: primo.ruolo, motivo: primo.motivo });
    }
    if (out.length >= max) break;
  }
  return out;
}
