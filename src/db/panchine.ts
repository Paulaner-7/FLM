// FLM — Transazioni carriera lunga: risoluzione fine stagione, offerte, cambio squadra (PRD 7.7)
// Regola 1 AGENTS.md: ogni scrittura passa da qui.

import { db, newId } from './database';
import { concludiStagione } from './competizioni';
import {
  deltaReputazione,
  giudizioCaroselloClub,
  generaOfferte,
  obiettivoPerPrestigio,
} from '../engine/panchine';
import { posizioneTarget } from '../engine/societa';
import { calcolaClassifica } from '../engine/classifica';
import {
  FIDUCIA_SOCIETA_INIZIALE,
  FIDUCIA_TIFOSI_INIZIALE,
} from '../engine/rules';
import type {
  Giocatore,
  Id,
  OffertaPanchina,
  ObiettivoStagionale,
  VoceStoricoStagione,
} from '../types/entities';
import type { RiepilogoStagione } from './competizioni';

// ---------- Risoluzione fine stagione ----------

/** Esito della risoluzione fine stagione per la UI (Fase 2). */
export interface EsitoRisoluzione {
  /** Riepilogo vincitori + accessi (da concludiStagione) */
  riepilogo: RiepilogoStagione;
  /** Delta reputazione applicato */
  reputazioneDelta: number;
  /** Nuova reputazione */
  nuovaReputazione: number;
  /** Voce scritta nello storico */
  storico: VoceStoricoStagione;
  /** Offerte generate (vuote se esonerato senza offerte disponibili) */
  offerte: OffertaPanchina[];
  /** Carosello: notizie dei movimenti CPU */
  carosello: string[];
  /** true se l'utente è esonerato */
  esonerato: boolean;
}

/**
 * Risolvi l'intera fine stagione: concludi competizioni, calcola reputazione,
 * scrivi storico, esegui carosello CPU/CT, genera offerte.
 * Chiamata dal pulsante "Concludi stagione" in Carriera.tsx (sostituisce il flusso
 * esistente: concludiStagione → iniziaStagioneSuccessiva).
 */
export async function risolviFineStagione(carrieraId: Id): Promise<EsitoRisoluzione> {
  // Fase 1: concludi competizioni (transazione esistente, non modificata)
  const riepilogo = await concludiStagione(carrieraId);

  // Fase 2: leggi stato e calcola tutto in una transazione
  const esito = await db.transaction(
    'rw',
    [db.carriere, db.squadre, db.giocatori, db.statoClub, db.competizioni, db.partite, db.storicoStagioni, db.offerte, db.notizie],
    async () => {
      const carriera = await db.carriere.get(carrieraId);
      if (!carriera) throw new Error('Carriera inesistente');

      const stato = await db.statoClub.get(carrieraId);
      if (!stato) throw new Error('StatoClub inesistente');

      const tutteSquadre = await db.squadre.where('carrieraId').equals(carrieraId).toArray();

      // Trova la tua squadra e il campionato
      const miaSquadra = tutteSquadre.find((s) => s.id === carriera.squadraId);
      if (!miaSquadra) throw new Error('Squadra utente non trovata');

      // Trova la competizione del tuo campionato
      const comps = await db.competizioni.where('carrieraId').equals(carrieraId).toArray();
      const compLega = comps.find(
        (c) => c.tipo === 'campionato' && c.squadre.includes(carriera.squadraId),
      );

      // Classifica finale del tuo campionato
      let piazzamento = 1;
      let nSquadre = 1;
      if (compLega) {
        const partiteComp = await db.partite
          .where('competizioneId')
          .equals(compLega.id)
          .toArray();
        const classifica = calcolaClassifica(
          partiteComp.filter((p) => p.giocata),
          compLega.squadre,
        );
        nSquadre = classifica.length;
        const riga = classifica.find((r) => r.squadraId === carriera.squadraId);
        piazzamento = riga?.posizione ?? nSquadre;
      }

      // Posizione attesa dal rating Elo (proxy come carosello CPU)
      const posizioneAttesa = Math.round(
        1 + (1500 - miaSquadra.rating) / 50,
      );

      // Trofei vinti dalla tua squadra
      const trofei = riepilogo.vincitori
        .filter((v) => {
          const squadra = tutteSquadre.find((s) => s.nome === v.squadra);
          return squadra?.id === carriera.squadraId;
        })
        .map((v) => {
          const comp = comps.find((c) => c.nome === v.competizione);
          return { competizione: v.competizione, tipo: comp?.tipo ?? 'campionato', nome: v.squadra };
        });

      const retrocessione = piazzamento >= nSquadre - 1; // ultime 2 posizioni
      const obiettivoCentrato = piazzamento <= posizioneTarget(stato.obiettivo as ObiettivoStagionale, nSquadre);

      // Delta reputazione
      const delta = deltaReputazione({
        obiettivo: stato.obiettivo as ObiettivoStagionale,
        obiettivoCentrato,
        trofei,
        piazzamento,
        posizioneAttesa,
        retrocessione,
        penaltyEsonero: false, // applicato dopo, se esonerato
      });

      let nuovaReputazione = clamp(stato.reputazioneAllenatore + delta, 0, 100);

      // Carosello CPU: giudica i club della tua lega
      const caroselloNotizie: string[] = [];
      const clubLega = compLega
        ? tutteSquadre.filter(
            (s) =>
              !s.nazionale &&
              compLega.squadre.includes(s.id),
          )
        : [];

      // Posizioni finali dal campionato (per il carosello)
      const posizioniFinali = new Map<Id, number>();
      if (compLega) {
        const partiteComp = await db.partite
          .where('competizioneId')
          .equals(compLega.id)
          .toArray();
        const classifica = calcolaClassifica(
          partiteComp.filter((p) => p.giocata),
          compLega.squadre,
        );
        classifica.forEach((r) => posizioniFinali.set(r.squadraId, r.posizione));
      }

      // Determina esonero
      const esonerato = stato.fiduciaSocieta < 20; // SOGLIA_FIDUCIA_ESONERO
      if (esonerato) {
        nuovaReputazione = clamp(nuovaReputazione + (-15), 0, 100); // penalty esonero
      }

      // Voci carosello (tutti i club della lega, non solo la tua)
      for (const club of clubLega) {
        const posReale = posizioniFinali.get(club.id) ?? 1;
        const deveCambiare = giudizioCaroselloClub({
          posizioneReale: posReale,
          nSquadre,
          rating: club.rating,
          trofeiVinti: riepilogo.vincitori
            .filter((v) => {
              const sq = tutteSquadre.find((s) => s.nome === v.squadra);
              return sq?.id === club.id;
            })
            .map((v) => {
              const comp = comps.find((c) => c.nome === v.competizione);
              return comp?.tipo ?? 'campionato';
            }),
          retrocesso: posReale >= nSquadre - 1,
        });
        if (deveCambiare && club.id !== carriera.squadraId) {
          caroselloNotizie.push(`${club.nome} esonera il suo allenatore dopo una stagione al di sotto delle aspettative.`);
        }
      }

      // Genera offerte
      const squadreCandidate = clubLega
        .filter((s) => s.id !== carriera.squadraId)
        .map((s) => ({
          id: s.id,
          nome: s.nome,
          rating: s.rating,
          campionato: s.campionato ?? '',
        }));

      const offerte = generaOfferte({
        reputazione: nuovaReputazione,
        esonerato,
        squadreCandidate,
        ntCandidate: [], // TODO: carosello CT se anno di torneo
        stagione: carriera.stagione,
        carrieraId,
      });

      // Voce storico
      const voceStorico: VoceStoricoStagione = {
        id: newId(),
        carrieraId,
        stagione: carriera.stagione,
        squadraNome: miaSquadra.nome,
        campionato: miaSquadra.campionato ?? carriera.campionato,
        piazzamento,
        obiettivo: stato.obiettivo,
        obiettivoCentrato,
        trofeiVinti: trofei.map((t) => ({ competizione: t.tipo, nome: t.competizione })),
        reputazioneFine: nuovaReputazione,
        esito: esonerato ? 'esonero' : 'confermato',
        alboDoro: riepilogo.vincitori.map((v) => ({
          competizione: v.competizione,
          vincitore: v.squadra,
        })),
        data: Date.now(),
      };

      // Persisti tutto
      await db.statoClub.put({
        ...stato,
        reputazioneAllenatore: nuovaReputazione,
        fineStagioneAperta: true,
        esitoFineStagione: esonerato ? 'esonerato' : 'game_over',
      });

      await db.storicoStagioni.add(voceStorico);

      // Salva offerte
      for (const o of offerte) {
        await db.offerte.add({ ...o, id: newId() });
      }

      // Notizie carosello
      for (const notizia of caroselloNotizie) {
        await db.notizie.add({
          id: newId(),
          carrieraId,
          settimana: stato.settimanaCorrente,
          testo: notizia,
        });
      }

      return {
        riepilogo,
        reputazioneDelta: delta,
        nuovaReputazione,
        storico: voceStorico,
        offerte,
        carosello: caroselloNotizie,
        esonerato,
      };
    },
  );

  return esito;
}

// ---------- Accetta / Rifiuta offerta ----------

/** Accetta un'offerta e applica il cambio squadra (Q1). */
export async function accettaOfferta(carrieraId: Id, offertaId: Id): Promise<void> {
  await db.transaction(
    'rw',
    [db.carriere, db.squadre, db.statoClub, db.offerte],
    async () => {
      const carriera = await db.carriere.get(carrieraId);
      if (!carriera) throw new Error('Carriera inesistente');

      const offerta = await db.offerte.get(offertaId);
      if (!offerta || offerta.carrieraId !== carrieraId || offerta.stato !== 'in_attesa') {
        throw new Error('Offerta inesistente o già processata');
      }

      const stato = await db.statoClub.get(carrieraId);
      if (!stato) throw new Error('StatoClub inesistente');

      const nuovoClub = await db.squadre.get(offerta.squadraId);
      if (!nuovoClub) throw new Error('Club offertante inesistente');

      // Registra la transizione panchina
      const vecchiaSquadra = await db.squadre.get(carriera.squadraId);
      const storicoPanchine = [...(carriera.storicoPanchine ?? [])];
      if (vecchiaSquadra) {
        storicoPanchine.push({
          nome: vecchiaSquadra.nome,
          campionato: vecchiaSquadra.campionato ?? carriera.campionato,
          stagione: carriera.stagione,
          tipo: 'club',
        });
      }

      // Aggiorna Carriera: switch squadraId, aggiorna storico
      await db.carriere.put({
        ...carriera,
        squadraId: offerta.squadraId,
        campionato: nuovoClub.campionato ?? carriera.campionato,
        storicoPanchine,
        updatedAt: Date.now(),
      });

      // Reset StatoClub ai valori del nuovo club
      const budgetNuovoClub = nuovoClub.budget ?? 50_000_000;
      await db.statoClub.put({
        ...stato,
        fiduciaSocieta: FIDUCIA_SOCIETA_INIZIALE,
        fiduciaTifosi: FIDUCIA_TIFOSI_INIZIALE,
        obiettivo: obiettivoPerPrestigio(nuovoClub.rating),
        budget: budgetNuovoClub,
        fineStagioneAperta: false,
        esitoFineStagione: undefined,
        nazionaleId: undefined,
      });

      // Marca offerta accettata, rifiuta le altre in attesa
      await db.offerte.where('carrieraId').equals(carrieraId).modify((o) => {
        if (o.id === offertaId) o.stato = 'accettata';
        else if (o.stato === 'in_attesa') o.stato = 'rifiutata';
      });
    },
  );
}

/** Rifiuta un'offerta. Se è l'ultima in attesa e l'utente è esonerato → game over. */
export async function rifiutaOfferta(carrieraId: Id, offertaId: Id): Promise<boolean> {
  // Ritorna true se è game over (rifiuto totale da esonerato)
  return db.transaction(
    'rw',
    [db.carriere, db.statoClub, db.offerte],
    async () => {
      const offerta = await db.offerte.get(offertaId);
      if (!offerta || offerta.carrieraId !== carrieraId || offerta.stato !== 'in_attesa') {
        throw new Error('Offerta inesistente o già processata');
      }

      await db.offerte.put({ ...offerta, stato: 'rifiutata' });

      // Conta rimanenti in attesa
      const rimanenti = await db.offerte
        .where('carrieraId')
        .equals(carrieraId)
        .filter((o) => o.stato === 'in_attesa')
        .count();

      if (rimanenti === 0) {
        const stato = await db.statoClub.get(carrieraId);
        if (stato?.esitoFineStagione === 'esonerato') {
          // Game over
          await db.carriere.where('id').equals(carrieraId).modify({ conclusa: true });
          await db.statoClub.put({ ...stato, esitoFineStagione: 'game_over', fineStagioneAperta: false });
          return true;
        }
      }

      return false;
    },
  );
}

/** Conferma fine stagione: chiudi il flusso (dopo le scelte dell'utente). */
export async function confermaFineStagione(carrieraId: Id): Promise<void> {
  await db.statoClub.where('id').equals(carrieraId).modify({
    fineStagioneAperta: false,
    esitoFineStagione: undefined,
  });
  // Pulisci offerte processate
  await db.offerte.where('carrieraId').equals(carrieraId).delete();
}

// ---------- Nazionali ----------

/** Leggi la rosa nazionale dallo snapshot (top N per overall dalla nazionalità). */
export async function rosaNazionaleSnapshot(
  carrieraId: Id,
  nomeNazionalita: string,
  max: number,
): Promise<Giocatore[]> {
  const tuttiGiocatori = await db.giocatori.where('carrieraId').equals(carrieraId).toArray();
  return tuttiGiocatori
    .filter((g) => g.nazionalita === nomeNazionalita)
    .sort((a, b) => b.overall - a.overall)
    .slice(0, max);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
