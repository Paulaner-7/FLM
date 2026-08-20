// FLM — Transazioni nazionali: convocazioni, torneo estivo, effetti ritorno (PRD 7.7).
// Regola 1 AGENTS.md: ogni scrittura passa da qui.

import { db, newId } from './database';
import {
  annoDiTorneo,
  partecipantiTorneo,
  selezionaPartecipanti,
  generaGironi,
  creaCompetizioneTorneo,
  simulaPartitaNt,
} from '../engine/competizioni/torneoEstivo';
import { sogliaConvocazione, effettiSosta } from '../engine/panchine';
import { calcolaClassifica } from '../engine/classifica';
import type { Competizione, Giocatore, Id, Partita, Squadra } from '../types/entities';

// ---------- Convocazioni ----------

/** Trova i giocatori convocati per la nazionale dalla tua rosa. */
export async function convocatiDellaRosa(
  carrieraId: Id,
  squadraUtenteId: Id,
  nazionali: Squadra[],
): Promise<Giocatore[]> {
  const tuttiGiocatori = await db.giocatori.where('carrieraId').equals(carrieraId).toArray();
  const assegnazioni = await db.squadAssignments.where('carrieraId').equals(carrieraId).toArray();

  const rosaIds = new Set(
    assegnazioni
      .filter((a) => a.squadraId === squadraUtenteId && a.tipo === 'proprieta' && a.al === undefined)
      .map((a) => a.giocatoreId),
  );

  const miaRosa = tuttiGiocatori.filter((g) => rosaIds.has(g.id));

  const convocati: Giocatore[] = [];
  for (const g of miaRosa) {
    const nt = nazionali.find(
      (n) => n.nome === g.nazionalita || n.nazione === g.nazionalita,
    );
    if (!nt) continue;
    const soglia = sogliaConvocazione(nt.rating ?? 1500);
    if (g.overall >= soglia) {
      convocati.push(g);
    }
  }

  return convocati;
}

// ---------- Torneo estivo ----------

/** Stato del torneo per la UI CT */
export interface StatoTorneo {
  competizione: Competizione;
  gironi: Array<{ nome: string; squadre: Array<{ id: Id; nome: string }> }>;
  classifiche: Map<string, Array<{ posizione: number; squadraId: Id; nome: string; punti: number }>>;
  fase: string;
  tuaNazionale?: { id: Id; nome: string; eliminata: boolean };
}

/**
 * Genera e avvia il torneo estivo (Mondiale/Europeo).
 * Restituisce lo stato per la UI CT.
 */
export async function generaTorneoEstivo(
  carrieraId: Id,
  stagione: string,
): Promise<StatoTorneo | null> {
  const tipo = annoDiTorneo(stagione);
  if (!tipo) return null;

  const nPartecipanti = partecipantiTorneo(tipo);
  const carriera = await db.carriere.get(carrieraId);
  if (!carriera) return null;

  const stato = await db.statoClub.get(carrieraId);
  const nazionaleUtenteId = stato?.nazionaleId;

  // Trova tutte le nazionali nello snapshot
  const tutteSquadre = await db.squadre.where('carrieraId').equals(carrieraId).toArray();
  const nazionali = tutteSquadre.filter((s) => s.nazionale);

  const partecipanti = selezionaPartecipanti(nazionali, nPartecipanti, nazionaleUtenteId);

  // Genera gironi
  const nGironi = tipo === 'mondiale' ? 4 : 6;
  const gironi = generaGironi(partecipanti, nGironi);

  const comp = creaCompetizioneTorneo({
    carrieraId,
    stagione,
    tipo,
    squadre: partecipanti.map((s) => s.id),
  });

  await db.competizioni.add(comp);

  // Crea partite dei gironi
  for (const girone of gironi) {
    const squadre = girone.squadre;
    for (let i = 0; i < squadre.length; i++) {
      for (let j = i + 1; j < squadre.length; j++) {
        const casa = tutteSquadre.find((s) => s.id === squadre[i]);
        const trasferta = tutteSquadre.find((s) => s.id === squadre[j]);
        if (!casa || !trasferta) continue;

        const risultato = simulaPartitaNt(casa, trasferta);

        const partita: Partita = {
          id: newId(),
          carrieraId,
          competizioneId: comp.id,
          giornata: 1,
          settimana: 99,
          slot: 'weekend',
          fase: 'gironi',
          casa: squadre[i]!,
          trasferta: squadre[j]!,
          golCasa: risultato.golCasa,
          golTrasferta: risultato.golTrasferta,
          marcatori: [],
          giocata: true,
          neutra: true,
        };
        await db.partite.add(partita);
      }
    }
  }

  // Calcola classifiche girone
  const classifiche = new Map<string, Array<{ posizione: number; squadraId: Id; nome: string; punti: number }>>();
  for (const girone of gironi) {
    const partiteGirone = await db.partite
      .where('competizioneId')
      .equals(comp.id)
      .toArray();
    const filtered = partiteGirone.filter(
      (p) => girone.squadre.includes(p.casa) && girone.squadre.includes(p.trasferta),
    );
    const classifica = calcolaClassifica(filtered, girone.squadre);
    classifiche.set(
      girone.nome,
      classifica.map((r) => ({
        posizione: r.posizione,
        squadraId: r.squadraId,
        nome: tutteSquadre.find((s) => s.id === r.squadraId)?.nome ?? '—',
        punti: r.punti,
      })),
    );
  }

  const tuaNazionale = nazionaleUtenteId
    ? { id: nazionaleUtenteId, nome: nazionali.find((n) => n.id === nazionaleUtenteId)?.nome ?? '—', eliminata: false }
    : undefined;

  return {
    competizione: comp,
    gironi: gironi.map((g) => ({
      nome: g.nome,
      squadre: g.squadre.map((id) => ({ id, nome: tutteSquadre.find((s) => s.id === id)?.nome ?? '—' })),
    })),
    classifiche,
    fase: 'gironi',
    tuaNazionale,
  };
}

// ---------- Effetti ritorno ----------

/**
 * Applica gli effetti del torneo estivo ai giocatori della tua rosa che erano convocati.
 */
export async function applicaEffettiRitorno(
  carrieraId: Id,
  squadraUtenteId: Id,
  nazionali: Squadra[],
  esitoTorneo: { vittorie: number; sconfitte: number; eliminato: boolean },
): Promise<{ convocati: number; formaDelta: number; moraleDelta: number }> {
  const convocati = await convocatiDellaRosa(carrieraId, squadraUtenteId, nazionali);

  let formaDelta = 0;
  let moraleDelta = 0;

  for (const g of convocati) {
    const effetti = effettiSosta({
      vittoriaSquadra: esitoTorneo.vittorie > esitoTorneo.sconfitte,
      minuti: 90,
      eraTitolare: true,
    });

    const faticaTorneo = esitoTorneo.vittorie + esitoTorneo.sconfitte;
    const faticaExtra = Math.min(8, faticaTorneo * 2);

    await db.giocatori.put({
      ...g,
      forma: Math.max(0, g.forma + effetti.forma - faticaExtra),
      morale: Math.min(100, Math.max(0, g.morale + effetti.morale)),
    });

    formaDelta += effetti.forma - faticaExtra;
    moraleDelta += effetti.morale;
  }

  return {
    convocati: convocati.length,
    formaDelta: convocati.length > 0 ? Math.round(formaDelta / convocati.length) : 0,
    moraleDelta: convocati.length > 0 ? Math.round(moraleDelta / convocati.length) : 0,
  };
}
