// FLM — Invarianti di integrità del database (PRD 7.2, tabella "Regole di integrità")
// Funzioni PURE e deterministiche: ricevono lo stato e restituiscono un verdetto.
// Nessuna scrittura qui: l'applicazione avviene nel layer transazionale (src/db/transfers).
// Regola 3 AGENTS.md: le regole del gioco vivono solo in src/engine.

import type { Giocatore, Id, Squadra, SquadAssignment, TransferLedgerEntry } from '../types/entities';

/** Limite rosa di movimento (PRD 7.2: max 25 + portieri + lista B giovani) */
export const MAX_ROSA_MOVIMENTO = 25;
export const RUOLO_PORTIERE = 'portiere';

export interface Verifica {
  ok: boolean;
  errori: string[];
}

export function verificaOk(): Verifica {
  return { ok: true, errori: [] };
}

export function verificaKo(...errori: string[]): Verifica {
  return { ok: false, errori };
}

/** Un'assegnazione è attiva se non ha data di fine (PRD 7.2: validità dal/al) */
export function assegnazioneAttiva(a: SquadAssignment): boolean {
  return a.al === undefined;
}

/** Proprietà attiva di un giocatore, se esiste */
export function proprietaAttivaDi(giocatoreId: Id, assignments: SquadAssignment[]): SquadAssignment | undefined {
  return assignments.find(
    (a) => a.giocatoreId === giocatoreId && a.tipo === 'proprieta' && assegnazioneAttiva(a),
  );
}

/** Giocatori di movimento (né portieri né giovani) con proprietà attiva nella squadra */
export function giocatoriMovimento(
  squadraId: Id,
  giocatori: Giocatore[],
  assignments: SquadAssignment[],
): Giocatore[] {
  const attivi = new Set(
    assignments
      .filter((a) => a.squadraId === squadraId && a.tipo === 'proprieta' && assegnazioneAttiva(a))
      .map((a) => a.giocatoreId),
  );
  return giocatori.filter(
    (g) => attivi.has(g.id) && g.ruolo !== RUOLO_PORTIERE && !g.giovane,
  );
}

/**
 * Invariante "Unicità del club": un giocatore ha al massimo un club proprietario
 * (più eventuale prestito a un secondo club — logica prestiti in M4).
 */
export function validaUnicitaClub(giocatoreId: Id, assignments: SquadAssignment[]): Verifica {
  const attive = assignments.filter(
    (a) => a.giocatoreId === giocatoreId && a.tipo === 'proprieta' && assegnazioneAttiva(a),
  );
  return attive.length <= 1
    ? verificaOk()
    : verificaKo(`Giocatore ${giocatoreId}: ${attive.length} proprietà attive (massimo 1)`);
}

/**
 * Invariante "Niente doppioni" (parte editor): il PES ID è univoco nella mappatura.
 * Il vincolo dei giocatori creati (ID > 0x80000000, PRD 7.4) arriva in M4 con il vivaio.
 */
export function validaPesIdUnivoco(
  pesId: number | null,
  giocatori: Giocatore[],
  escludiId?: Id,
): Verifica {
  if (pesId === null) return verificaOk();
  const duplicato = giocatori.find((g) => g.id !== escludiId && g.pesId === pesId);
  return duplicato
    ? verificaKo(`PES ID ${pesId} già assegnato a ${duplicato.nome}`)
    : verificaOk();
}

/** Invariante "Rosa entro i limiti": max 25 di movimento, portieri e giovani esclusi (PRD 7.2) */
export function validaRosa(
  squadraId: Id,
  giocatori: Giocatore[],
  assignments: SquadAssignment[],
  max: number = MAX_ROSA_MOVIMENTO,
): Verifica {
  const movimento = giocatoriMovimento(squadraId, giocatori, assignments).length;
  return movimento <= max
    ? verificaOk()
    : verificaKo(`Rosa di movimento a ${movimento}/${max} giocatori: limite superato`);
}

/** Invariante "Budget": una squadra non può spendere oltre budget + ingaggi disponibili */
export function validaBudget(squadra: Squadra, cifra: number): Verifica {
  if (cifra < 0) return verificaKo(`Cifra negativa: ${cifra}`);
  if (cifra > squadra.budget) {
    return verificaKo(
      `Budget insufficiente: ${cifra.toLocaleString('it-IT')} > ${squadra.budget.toLocaleString('it-IT')} (${squadra.nome})`,
    );
  }
  return verificaOk();
}

/** Parametri di un movimento di mercato (PRD 7.3: macchina a stati proposta → trattativa → accordo → applicazione) */
export interface ParametriTrasferimento {
  giocatoreId: Id;
  daSquadraId: Id;
  aSquadraId: Id;
  cifra: number;
  stagione: string;
  settimana: number;
}

/** Stato letto dal DB necessario alla validazione (snapshot coerente dentro la transazione) */
export interface ContestoTrasferimento {
  giocatori: Giocatore[];
  squadre: Squadra[];
  assignments: SquadAssignment[];
}

/**
 * Validazione completa di un trasferimento: compone tutte le invarianti della tabella 7.2
 * (unicità club, squadre distinte, appartenenza reale, rosa entro i limiti, budget).
 */
export function validaTrasferimento(p: ParametriTrasferimento, c: ContestoTrasferimento): Verifica {
  const errori: string[] = [];
  const giocatore = c.giocatori.find((g) => g.id === p.giocatoreId);
  const da = c.squadre.find((s) => s.id === p.daSquadraId);
  const a = c.squadre.find((s) => s.id === p.aSquadraId);

  if (!giocatore) errori.push(`Giocatore inesistente: ${p.giocatoreId}`);
  if (!da) errori.push(`Squadra cedente inesistente: ${p.daSquadraId}`);
  if (!a) errori.push(`Squadra acquirente inesistente: ${p.aSquadraId}`);
  if (da && a && da.id === a.id) errori.push('Squadra cedente e acquirente coincidono');
  if (p.cifra < 0) errori.push(`Cifra negativa: ${p.cifra}`);

  if (giocatore && da) {
    const proprieta = proprietaAttivaDi(giocatore.id, c.assignments);
    if (!proprieta) {
      errori.push(`Nessuna proprietà attiva per ${giocatore.nome}`);
    } else if (proprieta.squadraId !== da.id) {
      errori.push(`${giocatore.nome} non appartiene a ${da.nome}: la proprietà è di un altro club`);
    }
  }

  if (giocatore && a) {
    const vBudget = validaBudget(a, p.cifra);
    if (!vBudget.ok) errori.push(...vBudget.errori);
    // L'ingresso conta per la rosa solo se il giocatore è di movimento
    if (giocatore.ruolo !== RUOLO_PORTIERE && !giocatore.giovane) {
      const movimento = giocatoriMovimento(a.id, c.giocatori, c.assignments).length;
      if (movimento >= MAX_ROSA_MOVIMENTO) {
        errori.push(
          `Rosa piena: ${a.nome} ha già ${movimento} giocatori di movimento (max ${MAX_ROSA_MOVIMENTO})`,
        );
      }
    }
  }

  return errori.length === 0 ? verificaOk() : verificaKo(...errori);
}

/**
 * Pianificazione pura di un trasferimento: valida e, se ok, produce TUTTE le scritture
 * necessarie (chiusura della vecchia proprietà, nuova assegnazione, voce ledger, budget
 * aggiornato). Chi chiama applica il piano in un'unica transazione Dexie (atomicità, PRD 7.2).
 * Gli ID delle nuove scritture arrivano dal chiamante per restare deterministici.
 */
export interface PianoTrasferimento {
  chiusura: SquadAssignment;
  nuovaAssegnazione: SquadAssignment;
  voceLedger: TransferLedgerEntry;
  budgetAggiornato: number;
}

export type EsitoPianificazione =
  | { ok: true; piano: PianoTrasferimento }
  | { ok: false; errori: string[] };

export function pianificaTrasferimento(
  p: ParametriTrasferimento,
  c: ContestoTrasferimento,
  ids: { assegnazioneId: Id; voceId: Id },
): EsitoPianificazione {
  const v = validaTrasferimento(p, c);
  if (!v.ok) return { ok: false, errori: v.errori };

  const giocatore = c.giocatori.find((g) => g.id === p.giocatoreId);
  const a = c.squadre.find((s) => s.id === p.aSquadraId);
  const proprieta = proprietaAttivaDi(p.giocatoreId, c.assignments);
  if (!giocatore || !a || !proprieta) {
    // Copertura difensiva: validaTrasferimento ha già garantito la presenza
    return { ok: false, errori: ['Stato incoerente durante la pianificazione'] };
  }

  return {
    ok: true,
    piano: {
      chiusura: { ...proprieta, al: p.stagione },
      nuovaAssegnazione: {
        id: ids.assegnazioneId,
        giocatoreId: p.giocatoreId,
        squadraId: p.aSquadraId,
        tipo: 'proprieta',
        dal: p.stagione,
      },
      voceLedger: {
        id: ids.voceId,
        giocatoreId: p.giocatoreId,
        daSquadraId: p.daSquadraId,
        aSquadraId: p.aSquadraId,
        cifra: p.cifra,
        stagione: p.stagione,
        settimana: p.settimana,
        esito: 'completato',
      },
      budgetAggiornato: a.budget - p.cifra,
    },
  };
}
