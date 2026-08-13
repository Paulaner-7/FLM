// FLM — Persistenza carriere (Dexie): creazione e eliminazione.
// Regola 1 AGENTS.md: ogni dato persistente passa da qui.
// "Una carriera = un salvataggio": creaCarriera esegue lo snapshot completo del
// campionato scelto in un'unica transazione atomica (PRD 7.2: o tutto o niente).

import { db, newId } from './database';
import { generaCalendario } from '../engine/calendario';
import { budgetCarriera, posizioniInLega, squadreDellaLega, statoClubIniziale } from '../engine/carriera';
import { scegliLeader } from '../engine/morale';
import { NUM_LEADER } from '../engine/rules';
import { ratingInizialeCompleto } from '../engine/storico';
import type {
  Carriera,
  Competizione,
  Giocatore,
  Id,
  ObiettivoStagionale,
  Partita,
  SquadAssignment,
  Squadra,
} from '../types/entities';

export interface InputCreazioneCarriera {
  /** id della squadra template scelta (registro globale) */
  squadraTemplateId: Id;
  obiettivo: ObiettivoStagionale;
  campionato: string;
  stagione: string;
}

export interface EsitoCreazioneCarriera {
  carriera: Carriera;
  squadre: number;
  giocatori: number;
  assegnazioni: number;
  partite: number;
  /** Budget reale della carriera appena creata (StatoClub) */
  budget: number;
  /** Prima partita della stagione (giornata 1) con nomi squadre */
  primaPartita: { casa: string; trasferta: string; inCasa: boolean } | null;
}

/** Template del registro: squadre/giocatori/assegnazioni senza carrieraId. */
export async function squadreTemplate(): Promise<Squadra[]> {
  const tutte = await db.squadre.toArray();
  return tutte.filter((s) => s.carrieraId === undefined);
}

/**
 * Crea una nuova carriera: clona squadre, giocatori e assegnazioni dell'intero
 * campionato scelto (snapshot), genera la competizione e il calendario completo
 * (girone all'italiana andata/ritorno), crea StatoClub iniziale e riga Carriera.
 * Fallisce (transazione interrotta) se la squadra scelta non è nel campionato
 * o il campionato ha meno di 2 squadre.
 */
export async function creaCarriera(input: InputCreazioneCarriera): Promise<EsitoCreazioneCarriera> {
  const { squadraTemplateId, obiettivo, campionato, stagione } = input;

  return db.transaction(
    'rw',
    [
      db.carriere,
      db.squadre,
      db.giocatori,
      db.squadAssignments,
      db.competizioni,
      db.partite,
      db.statoClub,
    ],
    async () => {
      const templateSquadre = (await db.squadre.toArray()).filter((s) => s.carrieraId === undefined);
      const squadraScelta = templateSquadre.find((s) => s.id === squadraTemplateId);
      if (!squadraScelta) {
        throw new Error(`Squadra template inesistente: ${squadraTemplateId}`);
      }

      const lega = squadreDellaLega(templateSquadre, campionato);
      if (lega.length < 2) {
        throw new Error(`Campionato "${campionato}" con meno di 2 squadre (${lega.length})`);
      }
      if (!lega.some((s) => s.id === squadraTemplateId)) {
        throw new Error(`"${squadraScelta.nome}" non appartiene al campionato "${campionato}"`);
      }

      const carrieraId = newId();
      const idPerTemplate = new Map<Id, Id>();
      // Piazzamento stimato dell'anno precedente: budget differenziati per squadra
      const posizioni = posizioniInLega(lega);
      const squadreClonate: Squadra[] = lega.map((s) => {
        const nuovoId = newId();
        idPerTemplate.set(s.id, nuovoId);
        // Rating iniziale completo: 50% storico reale (ultime 5 stagioni) + 50% rosa
        // attuale. Unico per ogni squadra; per le squadre senza storico (demo,
        // promosse dalla C) vale il solo rating dalla rosa.
        const rating = ratingInizialeCompleto(s.nome, s.mediaOverall, campionato);
        return {
          ...s,
          id: nuovoId,
          carrieraId,
          campionato,
          pesId: s.pesId,
          budget: budgetCarriera(s, campionato, posizioni.get(s.id) ?? 1),
          rating,
          ratingInizioStagione: rating,
        };
      });

      const templateAssegnazioni = (await db.squadAssignments.toArray())
        .filter((a) => a.carrieraId === undefined);
      const assegnazioniLega = templateAssegnazioni.filter(
        (a) => a.tipo === 'proprieta' && a.al === undefined && idPerTemplate.has(a.squadraId),
      );
      const giocatoriDaClonare = (await db.giocatori.toArray())
        .filter((g) => g.carrieraId === undefined);

      const mappaGiocatori = new Map<Id, Id>();
      const giocatoriClonati: Giocatore[] = [];
      for (const a of assegnazioniLega) {
        const template = giocatoriDaClonare.find((g) => g.id === a.giocatoreId);
        if (!template) continue;
        const nuovoId = newId();
        mappaGiocatori.set(template.id, nuovoId);
        giocatoriClonati.push({
          ...template,
          id: nuovoId,
          carrieraId,
          minutiStagione: 0,
          promesse: [],
          infortunioFinoA: undefined,
          // Il flag del template (es. seed demo) non vale per la carriera:
          // i leader si nominano qui sotto con la regola engine (PRD 3.2)
          leader: false,
        });
      }

      const assegnazioniClonate: SquadAssignment[] = assegnazioniLega.map((a) => {
        const giocatoreId = mappaGiocatori.get(a.giocatoreId);
        const squadraId = idPerTemplate.get(a.squadraId);
        if (!giocatoreId || !squadraId) {
          throw new Error('Stato incoerente durante lo snapshot della carriera');
        }
        return { ...a, id: newId(), carrieraId, giocatoreId, squadraId };
      });

      // Leader di spogliatoio (PRD 3.2): la TUA rosa al bootstrap. Regola
      // deterministica (engine/morale.ts): veterani età ≥ 26 con overall più alto,
      // poi riempimento per overall. Il toggle nel dettaglio giocatore permette
      // di nominare/revocare (vincoli LEADER_MIN/LEADER_MAX in rules.ts).
      const squadraUtenteId = idPerTemplate.get(squadraTemplateId);
      if (squadraUtenteId) {
        const rosaUtente = giocatoriClonati.filter((g) =>
          assegnazioniClonate.some((a) => a.squadraId === squadraUtenteId && a.giocatoreId === g.id),
        );
        const leaderIds = new Set(scegliLeader(rosaUtente, NUM_LEADER));
        for (let i = 0; i < giocatoriClonati.length; i++) {
          const g = giocatoriClonati[i];
          if (g && leaderIds.has(g.id)) giocatoriClonati[i] = { ...g, leader: true };
        }
      }

      const competizione: Competizione = {
        id: newId(),
        carrieraId,
        nome: campionato,
        tipo: 'campionato',
        formato: 'girone',
        stagione,
        fase: 'andata',
        squadre: squadreClonate.map((s) => s.id),
      };

      const partite: Partita[] = generaCalendario(
        squadreClonate.map((s) => s.id),
        competizione.id,
        carrieraId,
      );

      const stato = statoClubIniziale(
        carrieraId,
        squadraScelta,
        campionato,
        obiettivo,
        posizioni.get(squadraTemplateId) ?? 1,
      );
      const partita1 = partite.find((p) => p.giornata === 1 &&
        (p.casa === idPerTemplate.get(squadraTemplateId) || p.trasferta === idPerTemplate.get(squadraTemplateId)));
      const squadraUtente = idPerTemplate.get(squadraTemplateId);
      const primaPartita = partita1 && squadraUtente
        ? {
            casa: squadreClonate.find((s) => s.id === partita1.casa)?.nome ?? '—',
            trasferta: squadreClonate.find((s) => s.id === partita1.trasferta)?.nome ?? '—',
            inCasa: partita1.casa === squadraUtente,
          }
        : null;
      const carriera: Carriera = {
        id: carrieraId,
        nome: `${squadraScelta.nome} · ${stagione}`,
        squadraId: idPerTemplate.get(squadraTemplateId) ?? squadraScelta.id,
        campionato,
        obiettivo,
        stagione,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await db.carriere.add(carriera);
      await db.squadre.bulkAdd(squadreClonate);
      await db.giocatori.bulkAdd(giocatoriClonati);
      await db.squadAssignments.bulkAdd(assegnazioniClonate);
      await db.competizioni.add(competizione);
      await db.partite.bulkAdd(partite);
      await db.statoClub.add(stato);

      return {
        carriera,
        squadre: squadreClonate.length,
        giocatori: giocatoriClonati.length,
        assegnazioni: assegnazioniClonate.length,
        partite: partite.length,
        budget: stato.budget,
        primaPartita,
      };
    },
  );
}

/**
 * Elimina una carriera e TUTTO il suo stato in cascata (un salvataggio = tutto
 * o niente): carriera, squadre/giocatori/assegnazioni clonati, competizione,
 * calendario, StatoClub, eventi, ledger.
 */
export async function eliminaCarriera(carrieraId: Id): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.carriere,
      db.squadre,
      db.giocatori,
      db.squadAssignments,
      db.competizioni,
      db.partite,
      db.statoClub,
      db.eventi,
      db.transferLedger,
    ],
    async () => {
      await db.carriere.delete(carrieraId);
      await db.squadre.where('carrieraId').equals(carrieraId).delete();
      await db.giocatori.where('carrieraId').equals(carrieraId).delete();
      await db.squadAssignments.where('carrieraId').equals(carrieraId).delete();
      await db.competizioni.where('carrieraId').equals(carrieraId).delete();
      await db.partite.where('carrieraId').equals(carrieraId).delete();
      await db.statoClub.delete(carrieraId);
      await db.eventi.where('carrieraId').equals(carrieraId).delete();
      await db.transferLedger.where('carrieraId').equals(carrieraId).delete();
    },
  );
}

/** Dati di una carriera per la lista salvataggi (con squadra e settimana corrente). */
export interface CarrieraConDettagli {
  carriera: Carriera;
  squadra: Squadra | undefined;
  settimanaCorrente: number;
}

export async function listaCarriere(): Promise<CarrieraConDettagli[]> {
  const [carriere, squadre, stati] = await Promise.all([
    db.carriere.orderBy('createdAt').reverse().toArray(),
    db.squadre.toArray(),
    db.statoClub.toArray(),
  ]);
  return carriere.map((carriera) => ({
    carriera,
    squadra: squadre.find((s) => s.id === carriera.squadraId),
    settimanaCorrente: stati.find((s) => s.id === carriera.id)?.settimanaCorrente ?? 1,
  }));
}
