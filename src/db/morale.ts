// FLM — Persistenza morale & spogliatoio (PRD 2.2, 3.2).
// Regola 1 AGENTS.md: ogni dato persistente passa da qui (Dexie).
// Azioni dell'allenatore: nomina/revoca leader, promessa manuale, decisione
// su una richiesta del giocatore. Ogni azione è UNA transazione atomica.
// Gli effetti sul referto (morale, valutazione promesse, richieste) vivono in
// db/referti.ts: qui solo le decisioni tra un turno e l'altro.

import { db, newId } from './database';
import { rosaDellaCarriera } from './referti';
import {
  LEADER_MAX,
  LEADER_MIN,
  PROMESSA_DURATA_DEFAULT,
  PROMESSE_MAX_ATTIVE,
  PROMESSA_PRESET_MINUTI_SOGLIA,
  PROMESSA_PRESET_TITOLARE_SOGLIA,
  RIFIUTO_RICHIESTA_FIDUCIA,
  RIFIUTO_RICHIESTA_MORALE,
} from '../engine/rules';
import { applicaConseguenze } from '../engine/morale';
import type { Giocatore, Id, TipoPromessa } from '../types/entities';

/** Preset manuali: stessa soglia/durata delle richieste dei giocatori (rules.ts). */
export interface PresetPromessa {
  tipo: TipoPromessa;
  soglia: number;
  durataTurni: number;
  testo: string;
}

export const PRESET_PROMESSE: Record<'titolare' | 'minuti', PresetPromessa> = {
  titolare: {
    tipo: 'titolare',
    soglia: PROMESSA_PRESET_TITOLARE_SOGLIA,
    durataTurni: PROMESSA_DURATA_DEFAULT,
    testo: 'Sarai titolare',
  },
  minuti: {
    tipo: 'minuti',
    soglia: PROMESSA_PRESET_MINUTI_SOGLIA,
    durataTurni: PROMESSA_DURATA_DEFAULT,
    testo: 'Avrai i tuoi minuti',
  },
};

/** Promesse attive di un giocatore. */
export function promesseAttive(g: Giocatore): number {
  return g.promesse.filter((p) => p.stato === 'attiva').length;
}

/**
 * Nomina o revoca un leader (PRD 3.2: capitano e leader influenzano il gruppo).
 * Vincoli: mai sotto LEADER_MIN, mai sopra LEADER_MAX.
 */
export async function setLeader(giocatoreId: Id, leader: boolean): Promise<void> {
  await db.transaction('rw', [db.giocatori, db.carriere, db.squadAssignments], async () => {
    const giocatore = await db.giocatori.get(giocatoreId);
    if (!giocatore) throw new Error('Giocatore inesistente');
    const carrieraId = giocatore.carrieraId;
    if (!carrieraId) throw new Error('Solo giocatori di una carriera');
    if (giocatore.leader === leader) return;

    const carriera = await db.carriere.get(carrieraId);
    if (!carriera) throw new Error('Carriera inesistente');
    const rosa = await rosaDellaCarriera(carrieraId, carriera.squadraId);
    const numeroLeader = rosa.filter((g) => g.leader).length;
    if (leader && numeroLeader >= LEADER_MAX) {
      throw new Error(`Spogliatoio al massimo (${LEADER_MAX} leader)`);
    }
    if (!leader && numeroLeader <= LEADER_MIN) {
      throw new Error(`Spogliatoio al minimo (${LEADER_MIN} leader)`);
    }
    await db.giocatori.put({ ...giocatore, leader });
  });
}

/**
 * Promessa manuale dal dettaglio giocatore (opzione secondaria: il flusso
 * primario è la richiesta del giocatore, db/referti.ts). Limite attive.
 */
export async function creaPromessa(giocatoreId: Id, tipo: 'titolare' | 'minuti'): Promise<void> {
  await db.transaction('rw', [db.giocatori, db.statoClub], async () => {
    const giocatore = await db.giocatori.get(giocatoreId);
    if (!giocatore) throw new Error('Giocatore inesistente');
    const carrieraId = giocatore.carrieraId;
    if (!carrieraId) throw new Error('Solo giocatori di una carriera');
    const stato = await db.statoClub.get(carrieraId);
    if (!stato) throw new Error('Carriera inesistente');
    if (promesseAttive(giocatore) >= PROMESSE_MAX_ATTIVE) {
      throw new Error(`Massimo ${PROMESSE_MAX_ATTIVE} promesse attive`);
    }

    const preset = PRESET_PROMESSE[tipo];
    await db.giocatori.put({
      ...giocatore,
      promesse: [
        ...giocatore.promesse,
        {
          id: newId(),
          tipo: preset.tipo,
          testo: preset.testo,
          creata: stato.settimanaCorrente,
          scadenza: stato.settimanaCorrente + preset.durataTurni - 1,
          soglia: preset.soglia,
          stato: 'attiva',
        },
      ],
    });
  });
}

/**
 * Decisione su una richiesta promessa (evento della dashboard):
 * scelta 0 = accetta → l'engine crea la promessa con i parametri PROPOSTI
 * (regola 3 AGENTS.md: l'LLM propone, il motore valida e applica).
 * scelta 1 = rifiuta → piccola conseguenza su morale e fiducia.
 */
export async function decidiRichiestaPromessa(eventoId: Id, scelta: 0 | 1): Promise<void> {
  await db.transaction('rw', [db.eventi, db.giocatori, db.statoClub], async () => {
    const evento = await db.eventi.get(eventoId);
    if (!evento?.promessaProposta) throw new Error('Richiesta inesistente');
    if (evento.sceltaFatta !== undefined) throw new Error('Richiesta già decisa');

    const proposta = evento.promessaProposta;
    const giocatore = await db.giocatori.get(proposta.giocatoreId);
    if (!giocatore) throw new Error('Giocatore inesistente');
    const stato = await db.statoClub.get(evento.carrieraId);
    if (!stato) throw new Error('Carriera inesistente');

    if (scelta === 0) {
      if (promesseAttive(giocatore) >= PROMESSE_MAX_ATTIVE) {
        throw new Error(`Massimo ${PROMESSE_MAX_ATTIVE} promesse attive`);
      }
      await db.giocatori.put({
        ...giocatore,
        promesse: [
          ...giocatore.promesse,
          {
            id: newId(),
            tipo: proposta.tipo,
            testo: proposta.tipo === 'titolare' ? 'Sarai titolare' : 'Avrai i tuoi minuti',
            creata: stato.settimanaCorrente,
            scadenza: stato.settimanaCorrente + proposta.durataTurni - 1,
            soglia: proposta.soglia,
            stato: 'attiva',
          },
        ],
      });
    } else {
      await db.giocatori.put(
        applicaConseguenze(giocatore, {
          morale: RIFIUTO_RICHIESTA_MORALE,
          fiducia: RIFIUTO_RICHIESTA_FIDUCIA,
        }),
      );
    }

    await db.eventi.put({ ...evento, sceltaFatta: scelta, effettiApplicati: true });
  });
}
