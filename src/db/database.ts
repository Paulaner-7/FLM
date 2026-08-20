// FLM — Database locale (Dexie / IndexedDB)
// Regola 1 AGENTS.md: ogni dato persistente passa da qui. Mai localStorage diretto.
// Schema allineato alle entità del PRD (sezione 3.4 e 7.2).

import Dexie, { type EntityTable } from 'dexie';

import { ELO_INIZIALE, ratingInizialeDaMedia } from '../engine/rating';
import { scegliLeader } from '../engine/morale';
import { ingaggioDaValore, nuovaScadenzaContratto } from '../engine/mercato';
import { NUM_LEADER } from '../engine/rules';

import type {
  Giocatore,
  Squadra,
  SquadAssignment,
  Partita,
  Competizione,
  StatoClub,
  Evento,
  Notizia,
  MondoNotizia,
  PrestazionePartita,
  TransferLedgerEntry,
  Carriera,
  ImpostazioniRecord,
  Trattativa,
  VoceStoricoStagione,
  OffertaPanchina,
  MediaRecord,
} from '../types/entities';

export const DB_NAME = 'flm';

/** Genera un ID univoco per le chiavi primarie delle entità */
export function newId(): string {
  return crypto.randomUUID();
}

export class FlmDatabase extends Dexie {
  carriere!: EntityTable<Carriera, 'id'>;
  squadre!: EntityTable<Squadra, 'id'>;
  giocatori!: EntityTable<Giocatore, 'id'>;
  squadAssignments!: EntityTable<SquadAssignment, 'id'>;
  partite!: EntityTable<Partita, 'id'>;
  competizioni!: EntityTable<Competizione, 'id'>;
  statoClub!: EntityTable<StatoClub, 'id'>;
  eventi!: EntityTable<Evento, 'id'>;
  notizie!: EntityTable<Notizia, 'id'>;
  prestazioni!: EntityTable<PrestazionePartita, 'id'>;
  transferLedger!: EntityTable<TransferLedgerEntry, 'id'>;
  trattative!: EntityTable<Trattativa, 'id'>;
  storicoStagioni!: EntityTable<VoceStoricoStagione, 'id'>;
  offerte!: EntityTable<OffertaPanchina, 'id'>;
  impostazioni!: EntityTable<ImpostazioniRecord, 'id'>;
  media!: EntityTable<MediaRecord, 'id'>;
  mondoNotizie!: EntityTable<MondoNotizia, 'id'>;

  constructor() {
    super(DB_NAME);
    // v1 (M0): fondamenta iniziali
    this.version(1).stores({
      squadre: 'id, nome',
      giocatori: 'id, squadraId, ruolo',
      partite: 'id, giornata, giocata',
      statoClub: 'id',
      eventi: 'id, settimana, categoria, tipo',
    });
    // v2 (M0.5): modello dati completo PRD 3.4 + 7.2 — 8 tabelle.
    // L'upgrade svuota i dati v1 (non esistevano dati reali: il seed ripopola).
    this.version(2)
      .stores({
        squadre: 'id, nome',
        giocatori: 'id, ruolo, giovane',
        squadAssignments: 'id, giocatoreId, squadraId, tipo',
        partite: 'id, competizioneId, giornata, giocata',
        competizioni: 'id, tipo, stagione',
        statoClub: 'id',
        eventi: 'id, settimana, categoria, tipo',
        transferLedger: 'id, giocatoreId, aSquadraId, stagione, esito',
      })
      .upgrade(async (tx) => {
        await tx.table('squadre').clear();
        await tx.table('giocatori').clear();
        await tx.table('partite').clear();
        await tx.table('statoClub').clear();
        await tx.table('eventi').clear();
      });
    // v3 (M1): mapping PES ID necessario per bootstrap editor idempotente.
    this.version(3).stores({
      squadre: 'id, pesId, nome',
      giocatori: 'id, pesId, ruolo, giovane',
      squadAssignments: 'id, giocatoreId, squadraId, tipo',
      partite: 'id, competizioneId, giornata, giocata',
      competizioni: 'id, tipo, stagione',
      statoClub: 'id',
      eventi: 'id, settimana, categoria, tipo',
      transferLedger: 'id, giocatoreId, aSquadraId, stagione, esito',
    });
    // v4 (M1.5): carriere multiple — "una carriera = un salvataggio".
    // Nuova tabella carriere; carrieraId su tutte le tabelle di carriera;
    // carrieraId/campionato opzionali su squadre, giocatori, assegnazioni
    // (undefined = template del registro globale).
    // L'upgrade svuota SOLO le tabelle di carriera (contenevano dati demo del
    // seed: nessuna carriera reale esisteva); i registri importati restano intatti.
    this.version(4).stores({
      carriere: 'id, squadraId, stagione',
      squadre: 'id, pesId, nome, carrieraId',
      giocatori: 'id, pesId, ruolo, giovane, carrieraId',
      squadAssignments: 'id, giocatoreId, squadraId, tipo, carrieraId',
      partite: 'id, competizioneId, giornata, giocata, carrieraId',
      competizioni: 'id, tipo, stagione, carrieraId',
      statoClub: 'id',
      eventi: 'id, settimana, categoria, tipo, carrieraId',
      transferLedger: 'id, giocatoreId, aSquadraId, stagione, esito, carrieraId',
    }).upgrade(async (tx) => {
      await tx.table('competizioni').clear();
      await tx.table('partite').clear();
      await tx.table('statoClub').clear();
      await tx.table('eventi').clear();
      await tx.table('transferLedger').clear();
    });
    // v5: indice createdAt su carriere (orderBy in listaCarriere).
    // La v4 è già stata distribuita con lo schema senza indice: si dichiara
    // identica (compatibilità con i DB esistenti) e si aggiunge la v5.
    this.version(5).stores({
      carriere: 'id, squadraId, stagione, createdAt',
      squadre: 'id, pesId, nome, carrieraId',
      giocatori: 'id, pesId, ruolo, giovane, carrieraId',
      squadAssignments: 'id, giocatoreId, squadraId, tipo, carrieraId',
      partite: 'id, competizioneId, giornata, giocata, carrieraId',
      competizioni: 'id, tipo, stagione, carrieraId',
      statoClub: 'id',
      eventi: 'id, settimana, categoria, tipo, carrieraId',
      transferLedger: 'id, giocatoreId, aSquadraId, stagione, esito, carrieraId',
    });
    // v6: rating Elo continuo al posto della forza 1-5 (PRD 3.2, engine/rating.ts).
    // Schema identico (rating non indicizzato): upgrade ricalcola il rating delle
    // squadre esistenti da mediaOverall (se presente) o dalla vecchia forza.
    this.version(6).stores({
      carriere: 'id, squadraId, stagione, createdAt',
      squadre: 'id, pesId, nome, carrieraId',
      giocatori: 'id, pesId, ruolo, giovane, carrieraId',
      squadAssignments: 'id, giocatoreId, squadraId, tipo, carrieraId',
      partite: 'id, competizioneId, giornata, giocata, carrieraId',
      competizioni: 'id, tipo, stagione, carrieraId',
      statoClub: 'id',
      eventi: 'id, settimana, categoria, tipo, carrieraId',
      transferLedger: 'id, giocatoreId, aSquadraId, stagione, esito, carrieraId',
    }).upgrade(async (tx) => {
      const squadre = await tx.table('squadre').toArray();
      // Mappa della vecchia forza (1-5) verso il rating iniziale demo (seed).
      // I vecchi record hanno forza, i nuovi rating: il tipo loose copre l'upgrade.
      const ratingPerForza = new Map<number, number>([
        [1, 1460], [2, 1580], [3, 1700], [4, 1820], [5, 1940],
      ]);
      type VecchiaSquadra = { rating?: number; ratingInizioStagione?: number; mediaOverall?: number; forza?: number };
      for (const s of squadre as unknown as VecchiaSquadra[]) {
        if (typeof s.rating === 'number') {
          // già migrata: manca solo il base stagionale (se assente = rating attuale)
          if (typeof s.ratingInizioStagione !== 'number') {
            await tx.table('squadre').put({ ...s, ratingInizioStagione: s.rating });
          }
          continue;
        }
        const rating = s.mediaOverall !== undefined
          ? ratingInizialeDaMedia(s.mediaOverall)
          : (ratingPerForza.get(s.forza ?? -1) ?? ELO_INIZIALE);
        await tx.table('squadre').put({ ...s, rating, ratingInizioStagione: rating, forza: undefined });
      }
    });
    // v7 (M2): morale & spogliatoio — campo fiducia giocatore + Promessa estesa.
    // Schema identico (fiducia/promesse non indicizzate): upgrade backfill fiducia
    // a 50, normalizza le promesse al nuovo shape (le vecchie {testo, scadenza}
    // senza id/tipo/stato non sono valutabili: vengono scartate) e nomina i
    // leader alle carriere esistenti (il bootstrap li assegna solo alle nuove).
    this.version(7).stores({
      carriere: 'id, squadraId, stagione, createdAt',
      squadre: 'id, pesId, nome, carrieraId',
      giocatori: 'id, pesId, ruolo, giovane, carrieraId',
      squadAssignments: 'id, giocatoreId, squadraId, tipo, carrieraId',
      partite: 'id, competizioneId, giornata, giocata, carrieraId',
      competizioni: 'id, tipo, stagione, carrieraId',
      statoClub: 'id',
      eventi: 'id, settimana, categoria, tipo, carrieraId',
      transferLedger: 'id, giocatoreId, aSquadraId, stagione, esito, carrieraId',
    }).upgrade(async (tx) => {
      const giocatori = await tx.table('giocatori').toArray();
      // Map per id: un giocatore può avere più modifiche (fiducia + leader)
      const daScrivere = new Map<string, Record<string, unknown>>();
      for (const g of giocatori as unknown as Array<{
        id: string;
        carrieraId?: string;
        fiducia?: number;
        promesse?: Array<{ id?: unknown; tipo?: unknown; stato?: unknown }>;
      }>) {
        const promesseValide = (g.promesse ?? []).filter((p) => p.id && p.tipo && p.stato);
        const mancaFiducia = typeof g.fiducia !== 'number';
        const promesseCambiate = promesseValide.length !== (g.promesse ?? []).length;
        if (mancaFiducia || promesseCambiate) {
          daScrivere.set(g.id, { ...g, fiducia: 50, promesse: promesseValide });
        }
      }
      // Leader alle carriere esistenti: regola engine identica al bootstrap
      const carriere = await tx.table('carriere').toArray();
      const assegnazioni = await tx.table('squadAssignments').toArray();
      for (const carriera of carriere as unknown as Array<{ id: string; squadraId: string }>) {
        const rosa = (giocatori as unknown as Array<{ id: string; carrieraId?: string; leader: boolean }>)
          .filter((g) => g.carrieraId === carriera.id)
          .filter((g) =>
            assegnazioni.some(
              (a: { carrieraId?: string; squadraId: string; giocatoreId: string; tipo: string; al?: string }) =>
                a.carrieraId === carriera.id && a.squadraId === carriera.squadraId && a.giocatoreId === g.id && a.tipo === 'proprieta' && a.al === undefined,
            ),
          );
        if (rosa.length === 0) continue;
        const leaderIds = new Set(scegliLeader(rosa as unknown as Giocatore[], NUM_LEADER));
        for (const g of rosa) {
          if (leaderIds.has(g.id)) {
            daScrivere.set(g.id, { ...(daScrivere.get(g.id) ?? g), leader: true });
          }
        }
      }
      if (daScrivere.size > 0) {
        await tx.table('giocatori').bulkPut([...daScrivere.values()]);
      }
    });
    // v8 (M3): impostazioni globali dell'app (config LLM, PRD 4.5/7.8).
    // Record unico id 'llm'; assente = LLM disattivo (fallback offline, PRD 4.6).
    // Schema identico alle versioni precedenti + nuova tabella: nessun upgrade dati.
    this.version(8).stores({
      carriere: 'id, squadraId, stagione, createdAt',
      squadre: 'id, pesId, nome, carrieraId',
      giocatori: 'id, pesId, ruolo, giovane, carrieraId',
      squadAssignments: 'id, giocatoreId, squadraId, tipo, carrieraId',
      partite: 'id, competizioneId, giornata, giocata, carrieraId',
      competizioni: 'id, tipo, stagione, carrieraId',
      statoClub: 'id',
      eventi: 'id, settimana, categoria, tipo, carrieraId',
      transferLedger: 'id, giocatoreId, aSquadraId, stagione, esito, carrieraId',
      impostazioni: 'id',
    });
    // v9 (M3): motore eventi — archivo notizie del turno (PRD 4.2, "Il giornale
    // del giorno dopo"). Nuova tabella notizie (id, carrieraId, settimana):
    // nessun upgrade dati, i campi aggiuntivi di Evento/Partita non sono indicizzati.
    this.version(9).stores({
      carriere: 'id, squadraId, stagione, createdAt',
      squadre: 'id, pesId, nome, carrieraId',
      giocatori: 'id, pesId, ruolo, giovane, carrieraId',
      squadAssignments: 'id, giocatoreId, squadraId, tipo, carrieraId',
      partite: 'id, competizioneId, giornata, giocata, carrieraId',
      competizioni: 'id, tipo, stagione, carrieraId',
      statoClub: 'id',
      eventi: 'id, settimana, categoria, tipo, carrieraId',
      notizie: 'id, carrieraId, settimana',
      transferLedger: 'id, giocatoreId, aSquadraId, stagione, esito, carrieraId',
      impostazioni: 'id',
    });
    // v10 (M4): motore competizioni multi-torneo (PRD 7.1).
    // Nuova tabella prestazioni (eventi giocatore); backfill dei campi
    // settimana/slot/fase/neutra sulle partite delle carriere esistenti
    // (restano solo-campionato: le nuove competizioni valgono per le nuove carriere).
    this.version(10)
      .stores({
        carriere: 'id, squadraId, stagione, createdAt',
        squadre: 'id, pesId, nome, carrieraId',
        giocatori: 'id, pesId, ruolo, giovane, carrieraId',
        squadAssignments: 'id, giocatoreId, squadraId, tipo, carrieraId',
        partite: 'id, competizioneId, giornata, giocata, carrieraId, settimana, slot, fase',
        competizioni: 'id, tipo, stagione, carrieraId',
        statoClub: 'id',
        eventi: 'id, settimana, categoria, tipo, carrieraId',
        notizie: 'id, carrieraId, settimana',
        prestazioni: 'id, carrieraId, partitaId, competizioneId, squadraId, giocatoreId',
        transferLedger: 'id, giocatoreId, aSquadraId, stagione, esito, carrieraId',
        impostazioni: 'id',
      })
      .upgrade(async (tx) => {
        const partite = await tx.table('partite').toArray();
        type VecchiaPartita = { id: string; carrieraId: string; competizioneId: string; giornata: number; settimana?: number; slot?: string; fase?: string; neutra?: boolean };
        for (const p of partite as unknown as VecchiaPartita[]) {
          if (typeof p.settimana === 'number') continue;
          const meta = Math.max(1, Math.round((p.giornata ?? 1) / 2));
          await tx.table('partite').put({
            ...p,
            settimana: p.giornata ?? 1,
            slot: 'weekend',
            fase: p.giornata <= meta ? 'andata' : 'ritorno',
            neutra: false,
          });
        }
      });
    // v11 (M4): mercato — tabella trattative, campi contratto su giocatori,
    // giornoMercato su StatoClub, giornoMercato nel ledger, letta sugli eventi.
    // Upgrade: backfill contratti deterministici sui giocatori esistenti e
    // giornoMercato=0 (nessuna finestra attiva) sugli StatiClub esistenti.
    this.version(11)
      .stores({
        carriere: 'id, squadraId, stagione, createdAt',
        squadre: 'id, pesId, nome, carrieraId',
        giocatori: 'id, pesId, ruolo, giovane, carrieraId',
        squadAssignments: 'id, giocatoreId, squadraId, tipo, carrieraId',
        partite: 'id, competizioneId, giornata, giocata, carrieraId, settimana, slot, fase',
        competizioni: 'id, tipo, stagione, carrieraId',
        statoClub: 'id',
        eventi: 'id, settimana, categoria, tipo, carrieraId',
        notizie: 'id, carrieraId, settimana',
        prestazioni: 'id, carrieraId, partitaId, competizioneId, squadraId, giocatoreId',
        transferLedger: 'id, giocatoreId, aSquadraId, stagione, esito, carrieraId',
        trattative: 'id, carrieraId, giocatoreId, stato',
        impostazioni: 'id',
      })
      .upgrade(async (tx) => {
        const giocatori = await tx.table('giocatori').toArray();
        const daScrivere: unknown[] = [];
        const stagioneCorrente = '2026/27';
        for (const g of giocatori as unknown as Array<{ id: string; scadenzaContratto?: string; ingaggioAnnuo?: number; valoreMercato: number; eta: number }>) {
          if (typeof g.scadenzaContratto === 'string' && typeof g.ingaggioAnnuo === 'number') continue;
          const anni = 2 + Math.abs(g.eta % 3);
          const scadenza = nuovaScadenzaContratto(stagioneCorrente, anni);
          const ingaggio = ingaggioDaValore(g.valoreMercato ?? 0);
          daScrivere.push({ ...g, scadenzaContratto: scadenza, ingaggioAnnuo: ingaggio });
        }
        if (daScrivere.length > 0) await tx.table('giocatori').bulkPut(daScrivere);
        const stati = await tx.table('statoClub').toArray();
        for (const s of stati as unknown as Array<{ id: string; giornoMercato?: number }>) {
          if (typeof s.giornoMercato !== 'number') {
            await tx.table('statoClub').put({ ...s, giornoMercato: 0 });
          }
        }
      });
    // v12: carriera lunga — storico stagionale, offerte panchina (PRD 7.7).
    // Nuove tabelle storicoStagioni, offerte; schema identico v11 + i campi
    // aggiuntivi su Carriera/StatoClub/Impostazioni non sono indicizzati.
    this.version(12)
      .stores({
        carriere: 'id, squadraId, stagione, createdAt',
        squadre: 'id, pesId, nome, carrieraId',
        giocatori: 'id, pesId, ruolo, giovane, carrieraId',
        squadAssignments: 'id, giocatoreId, squadraId, tipo, carrieraId',
        partite: 'id, competizioneId, giornata, giocata, carrieraId, settimana, slot, fase',
        competizioni: 'id, tipo, stagione, carrieraId',
        statoClub: 'id',
        eventi: 'id, settimana, categoria, tipo, carrieraId',
        notizie: 'id, carrieraId, settimana',
        prestazioni: 'id, carrieraId, partitaId, competizioneId, squadraId, giocatoreId',
        transferLedger: 'id, giocatoreId, aSquadraId, stagione, esito, carrieraId',
        trattative: 'id, carrieraId, giocatoreId, stato',
        storicoStagioni: 'id, carrieraId, stagione',
        offerte: 'id, carrieraId, stagione, stato',
        impostazioni: 'id',
      });
    // v13 (UI): cache media — mapping nome→URL per loghi squadre, volti
    // giocatori e loghi competizione (provider esterno, src/media).
    // Nuova tabella media: nessun upgrade dati.
    this.version(13)
      .stores({
        carriere: 'id, squadraId, stagione, createdAt',
        squadre: 'id, pesId, nome, carrieraId',
        giocatori: 'id, pesId, ruolo, giovane, carrieraId',
        squadAssignments: 'id, giocatoreId, squadraId, tipo, carrieraId',
        partite: 'id, competizioneId, giornata, giocata, carrieraId, settimana, slot, fase',
        competizioni: 'id, tipo, stagione, carrieraId',
        statoClub: 'id',
        eventi: 'id, settimana, categoria, tipo, carrieraId',
        notizie: 'id, carrieraId, settimana',
        prestazioni: 'id, carrieraId, partitaId, competizioneId, squadraId, giocatoreId',
        transferLedger: 'id, giocatoreId, aSquadraId, stagione, esito, carrieraId',
        trattative: 'id, carrieraId, giocatoreId, stato',
        storicoStagioni: 'id, carrieraId, stagione',
        offerte: 'id, carrieraId, stagione, stato',
        impostazioni: 'id',
        media: 'id, tipo, chiave',
      });
    // v14: world news — notizie dal mondo (fuori dalla tua squadra), X-style.
    // Nuova tabella mondoNotizie: nessun upgrade dati.
    this.version(14)
      .stores({
        carriere: 'id, squadraId, stagione, createdAt',
        squadre: 'id, pesId, nome, carrieraId',
        giocatori: 'id, pesId, ruolo, giovane, carrieraId',
        squadAssignments: 'id, giocatoreId, squadraId, tipo, carrieraId',
        partite: 'id, competizioneId, giornata, giocata, carrieraId, settimana, slot, fase',
        competizioni: 'id, tipo, stagione, carrieraId',
        statoClub: 'id',
        eventi: 'id, settimana, categoria, tipo, carrieraId',
        notizie: 'id, carrieraId, settimana',
        prestazioni: 'id, carrieraId, partitaId, competizioneId, squadraId, giocatoreId',
        transferLedger: 'id, giocatoreId, aSquadraId, stagione, esito, carrieraId',
        trattative: 'id, carrieraId, giocatoreId, stato',
        storicoStagioni: 'id, carrieraId, stagione',
        offerte: 'id, carrieraId, stagione, stato',
        impostazioni: 'id',
        media: 'id, tipo, chiave',
        mondoNotizie: 'id, carrieraId, settimana, categoria',
      });
  }
}

export const db = new FlmDatabase();
