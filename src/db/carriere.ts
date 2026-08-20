// FLM — Persistenza carriere (Dexie): creazione e eliminazione.
// Regola 1 AGENTS.md: ogni dato persistente passa da qui.
// "Una carriera = un salvataggio": creaCarriera esegue lo snapshot completo
// del mondo europeo (lega utente + seconde divisioni + club delle coppe europee)
// e genera TUTTE le competizioni della stagione (PRD 7.1), in un'unica
// transazione atomica.

import { db, newId } from './database';
import { creaStagioneCompleta } from './competizioni';
import { generaIntake } from './vivaio';
import { budgetCarriera, legaPerSquadra, posizioniInLega, statoClubIniziale } from '../engine/carriera';
import { finestraDiSettimana } from '../engine/mercato';
import { scegliLeader } from '../engine/morale';
import { NUM_LEADER, SETTIMANA_INIZIALE } from '../engine/rules';
import { ratingInizialeCompleto } from '../engine/storico';
import { STAGIONE_2026_27 } from '../data/calendarioStagioni';
import { ACCESSI_STAGIONE_SEME, VINCITORI_COPPE_2025_26, CAMPIONI_NAZIONALI_2025_26 } from '../data/accessi';
import { eNazionalePerNome } from '../data/leagues';
import type {
  Carriera,
  Giocatore,
  Id,
  ObiettivoStagionale,
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
  competizioni: number;
  /** Budget reale della carriera appena creata (StatoClub) */
  budget: number;
  /** Prima partita della stagione con nomi squadre */
  primaPartita: { casa: string; trasferta: string; inCasa: boolean; competizione: string; data: string } | null;
}

/** Template del registro: squadre/giocatori/assegnazioni senza carrieraId. */
export async function squadreTemplate(): Promise<Squadra[]> {
  const tutte = await db.squadre.toArray();
  return tutte.filter((s) => s.carrieraId === undefined);
}

/**
 * Crea una nuova carriera: clona l'intero mondo europeo (club UEFA del DB),
 * genera le competizioni della stagione 2026/27 (campionati, coppe nazionali,
 * supercoppe, UCL/UEL/UECL), crea StatoClub iniziale e riga Carriera.
 * Fallisce (transazione interrotta) se la squadra scelta non è nel campionato
 * o il campionato ha meno di 2 squadre.
 */
export async function creaCarriera(input: InputCreazioneCarriera): Promise<EsitoCreazioneCarriera> {
  const { squadraTemplateId, obiettivo, campionato } = input;
  const stagione = input.stagione || '2026/27';

  const esito = await db.transaction(
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

      // Club del campionato scelto (validazione). Stessa risoluzione del wizard
      // (legaPerSquadra): il CSV dell'editor non ha la colonna League, quindi il
      // campionato arriva dal match per nome (src/data/leagues.ts), non dal campo.
      const legaScelta = templateSquadre.filter((s) => !s.nazionale && !s.ombra && legaPerSquadra(s) === campionato);
      if (legaScelta.length < 2) {
        throw new Error(`Campionato "${campionato}" con meno di 2 squadre (${legaScelta.length})`);
      }
      if (!legaScelta.some((s) => s.id === squadraTemplateId)) {
        throw new Error(`"${squadraScelta.nome}" non appartiene al campionato "${campionato}"`);
      }

      // Snapshot: TUTTI i club UEFA del DB (leghe giocabili, non ombra, non
      // nazionali) — servono per coppe nazionali di tutte le nazioni e per i
      // pool europei (decisione utente: si gioca solo ciò che esiste in FL26).
      const clubMondo = templateSquadre.filter((s) => {
        if (s.nazionale || s.ombra) return false;
        const lega = legaPerSquadra(s);
        // Solo leghe reali: niente nazionali né gruppi fallback per nazione.
        return lega !== 'Nazionali' && !lega.startsWith('Squadre di ');
      });
      // Nazionali FL26 per torneo estivo, carosello CT e forza nazione (PRD 7.7)
      const nazionaliMondo = templateSquadre.filter(
        (s) => !s.ombra && (s.nazionale || eNazionalePerNome(s.nome)),
      );

      const carrieraId = newId();
      const idPerTemplate = new Map<Id, Id>();
      const posizioni = posizioniInLega(legaScelta);
      const squadreClub: Squadra[] = clubMondo.map((s) => {
        const nuovoId = newId();
        idPerTemplate.set(s.id, nuovoId);
        const lega = legaPerSquadra(s); // materializzata sul clone: il motore ci lavora sopra
        const nellaLega = lega === campionato;
        const rating = ratingInizialeCompleto(s.nome, s.mediaOverall, lega);
        return {
          ...s,
          id: nuovoId,
          carrieraId,
          campionato: lega,
          budget: nellaLega ? budgetCarriera(s, campionato, posizioni.get(s.id) ?? 1) : s.budget,
          rating,
          ratingInizioStagione: rating,
        };
      });

      // Nazionali FL26: solo righe Squadra (nessuna assegnazione — rosa derivata per nazionalità)
      const squadreNazionali: Squadra[] = nazionaliMondo.map((s) => {
        const nuovoId = newId();
        idPerTemplate.set(s.id, nuovoId);
        const rating = s.mediaOverall ?? 60;
        return {
          ...s,
          id: nuovoId,
          carrieraId,
          rating,
          ratingInizioStagione: rating,
        };
      });
      const squadreClonate: Squadra[] = [...squadreClub, ...squadreNazionali];

      const templateAssegnazioni = (await db.squadAssignments.toArray())
        .filter((a) => a.carrieraId === undefined);
      const assegnazioniMondo = templateAssegnazioni.filter(
        (a) => a.tipo === 'proprieta' && a.al === undefined && idPerTemplate.has(a.squadraId),
      );
      const giocatoriTemplate = (await db.giocatori.toArray())
        .filter((g) => g.carrieraId === undefined);

      const mappaGiocatori = new Map<Id, Id>();
      const giocatoriClonati: Giocatore[] = [];
      for (const a of assegnazioniMondo) {
        const template = giocatoriTemplate.find((g) => g.id === a.giocatoreId);
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
          leader: false,
        });
      }

      const assegnazioniClonate: SquadAssignment[] = assegnazioniMondo.map((a) => {
        const giocatoreId = mappaGiocatori.get(a.giocatoreId);
        const squadraId = idPerTemplate.get(a.squadraId);
        if (!giocatoreId || !squadraId) {
          throw new Error('Stato incoerente durante lo snapshot della carriera');
        }
        return { ...a, id: newId(), carrieraId, giocatoreId, squadraId };
      });

      // Leader di spogliatoio (PRD 3.2): la TUA rosa al bootstrap.
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

      const stato = statoClubIniziale(
        carrieraId,
        squadraScelta,
        campionato,
        obiettivo,
        posizioni.get(squadraTemplateId) ?? 1,
      );

      const carriera: Carriera = {
        id: carrieraId,
        nome: `${squadraScelta.nome} · ${stagione}`,
        squadraId: squadraUtenteId ?? squadraScelta.id,
        campionato,
        obiettivo,
        stagione,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        storicoPanchine: [],
      };

      await db.carriere.add(carriera);
      await db.squadre.bulkAdd(squadreClonate);
      await db.giocatori.bulkAdd(giocatoriClonati);
      await db.squadAssignments.bulkAdd(assegnazioniClonate);
      await db.statoClub.add(stato);

      // Stagione completa (PRD 7.1): tutte le competizioni della 2026/27.
      const esitoStagione = await creaStagioneCompleta({
        carrieraId,
        stagione,
        legaUtente: campionato,
        nazioneUtente: squadraScelta.nazione,
        squadraUtenteId: carriera.squadraId,
        ancore: STAGIONE_2026_27,
        accessi: ACCESSI_STAGIONE_SEME,
        vincitriciCoppe: VINCITORI_COPPE_2025_26,
        campioniNazionali: CAMPIONI_NAZIONALI_2025_26,
        campioneUcl: 'Paris Saint-Germain',
        campioneUel: 'Aston Villa',
      });

      // Prima partita (cross-competizione)
      const tuttePartite = await db.partite.where('carrieraId').equals(carrieraId).toArray();
      const prossime = tuttePartite
        .filter((p) => !p.giocata && (p.casa === carriera.squadraId || p.trasferta === carriera.squadraId))
        .sort((a, b) => a.settimana - b.settimana || (a.slot === 'infrasettimanale' ? 0 : 1) - (b.slot === 'infrasettimanale' ? 0 : 1) || a.id.localeCompare(b.id));
      const partita1 = prossime[0] ?? null;
      const primaPartita = partita1
        ? {
            casa: squadreClonate.find((s) => s.id === partita1.casa)?.nome ?? '—',
            trasferta: squadreClonate.find((s) => s.id === partita1.trasferta)?.nome ?? '—',
            inCasa: partita1.casa === carriera.squadraId,
            competizione: '',
            data: '',
          }
        : null;
      if (primaPartita) {
        const comp = await db.competizioni.get(partita1!.competizioneId);
        primaPartita!.competizione = comp?.nome ?? '';
        const ancore = STAGIONE_2026_27;
        const data = new Date(`${ancore.inizio}T12:00:00Z`);
        data.setUTCDate(data.getUTCDate() + (partita1!.settimana - 1) * 7);
        primaPartita!.data = data.toISOString().slice(0, 10);
      }

      // Settimana iniziale: settimana della prima partita (o 1)
      const settimanaIniziale = partita1?.settimana ?? SETTIMANA_INIZIALE;
      // Finestra estiva (decisione M4): se la stagione parte in finestra
      // (settimane 1-9), la modalità mercato è attiva fin dal giorno 1.
      const giornoIniziale = finestraDiSettimana(settimanaIniziale) !== null ? 1 : 0;
      await db.statoClub.put({ ...stato, settimanaCorrente: settimanaIniziale, giornoMercato: giornoIniziale });

      return {
        carriera,
        squadre: squadreClonate.length,
        giocatori: giocatoriClonati.length,
        assegnazioni: assegnazioniClonate.length,
        partite: esitoStagione.partite,
        competizioni: esitoStagione.competizioni,
        budget: stato.budget,
        primaPartita,
      };
    },
  );

  // Intake vivaio della PRIMA stagione (PRD 7.5): 1 prospetto per club reale.
  // Se l'LLM è offline l'intake resta 'in_attesa' (avviso + Riprova in Vivaio):
  // mai bloccare la creazione della carriera per l'LLM.
  try {
    await generaIntake(esito.carriera.id, stagione);
  } catch {
    // intake non bloccante: il Vivaio mostra il banner e consente il retry
  }
  return esito;
}

/**
 * Elimina una carriera e TUTTO il suo stato in cascata (un salvataggio = tutto
 * o niente): carriera, squadre/giocatori/assegnazioni clonati, competizioni,
 * partite, prestazioni, StatoClub, eventi, notizie, ledger.
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
      db.prestazioni,
      db.statoClub,
      db.eventi,
      db.notizie,
      db.transferLedger,
    ],
    async () => {
      await db.carriere.delete(carrieraId);
      await db.squadre.where('carrieraId').equals(carrieraId).delete();
      await db.giocatori.where('carrieraId').equals(carrieraId).delete();
      await db.squadAssignments.where('carrieraId').equals(carrieraId).delete();
      await db.competizioni.where('carrieraId').equals(carrieraId).delete();
      await db.partite.where('carrieraId').equals(carrieraId).delete();
      await db.prestazioni.where('carrieraId').equals(carrieraId).delete();
      await db.statoClub.delete(carrieraId);
      await db.eventi.where('carrieraId').equals(carrieraId).delete();
      await db.notizie.where('carrieraId').equals(carrieraId).delete();
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
