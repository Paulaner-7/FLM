// FLM — Schema e parsing delle risposte LLM (PRD 4.2)
// Wire format: snake_case, copia esatta dello schema del PRD 4.2
// (additionalProperties: false). I tipi pubblici del modulo sono camelCase:
// la mappatura vive qui, in un punto solo.
//
// Regola 3 AGENTS.md: qui si valida SOLO la forma (struttura e tipi).
// La semantica (giocatori esistenti, clamp effetti, anti-ripetizione)
// è di competenza dell'engine (src/engine).

import type { CategoriaEvento, EffettiProposti, TipoEvento } from '../types/entities';

// ---------------------------------------------------------------------------
// Tipi wire (snake_case, risposta grezza del modello)
// ---------------------------------------------------------------------------

export interface EffettiPropostiWire {
  morale_giocatori: number;
  fiducia_societa: number;
  fiducia_tifosi: number;
  reputazione: number;
}

export interface OpzioneWire {
  testo: string;
  effetti_proposti: EffettiPropostiWire;
}

export interface EventoWire {
  categoria: CategoriaEvento;
  tipo: TipoEvento;
  titolo: string;
  testo: string;
  giocatori_coinvolti: string[];
  /** Opzionale: infortunio NARRATIVO da applicare davvero alla rosa (engine) */
  effetti_fisici?: Array<{ giocatore: string; settimane: number }>;
  opzioni: OpzioneWire[];
}

export interface PropostaEventiWire {
  eventi: EventoWire[];
  notizie: string[];
}

// ---------------------------------------------------------------------------
// Tipi pubblici (camelCase)
// ---------------------------------------------------------------------------

/** Risposta conforme allo schema structured output del PRD 4.2 */
export interface PropostaEventi {
  eventi: Array<{
    categoria: CategoriaEvento;
    tipo: TipoEvento;
    titolo: string;
    testo: string;
    giocatoriCoinvolti: string[];
    effettiFisici?: Array<{ giocatore: string; settimane: number }>;
    opzioni: Array<{ testo: string; effettiProposti: EffettiProposti }>;
  }>;
  notizie: string[];
}

// ---------------------------------------------------------------------------
// JSON Schema per response_format (PRD 4.2, verbatim)
// ---------------------------------------------------------------------------

export const SCHEMA_EVENTI_JSON = {
  name: 'proposta_eventi',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      eventi: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            categoria: { type: 'string', enum: ['giocatore', 'societa', 'tifosi_media'] },
            tipo: { type: 'string', enum: ['scenario_emergente', 'punto_decisionale'] },
            titolo: { type: 'string' },
            testo: { type: 'string' },
            giocatori_coinvolti: { type: 'array', items: { type: 'string' } },
            effetti_fisici: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  giocatore: { type: 'string' },
                  settimane: { type: 'integer', minimum: 1, maximum: 4 },
                },
                required: ['giocatore', 'settimane'],
                additionalProperties: false,
              },
            },
            opzioni: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  testo: { type: 'string' },
                  effetti_proposti: {
                    type: 'object',
                    properties: {
                      morale_giocatori: { type: 'integer' },
                      fiducia_societa: { type: 'integer' },
                      fiducia_tifosi: { type: 'integer' },
                      reputazione: { type: 'integer' },
                    },
                    required: ['morale_giocatori', 'fiducia_societa', 'fiducia_tifosi', 'reputazione'],
                    additionalProperties: false,
                  },
                },
                required: ['testo', 'effetti_proposti'],
                additionalProperties: false,
              },
            },
          },
          required: ['categoria', 'tipo', 'titolo', 'testo', 'giocatori_coinvolti', 'opzioni'],
          additionalProperties: false,
        },
      },
      notizie: { type: 'array', items: { type: 'string' } },
    },
    required: ['eventi', 'notizie'],
    additionalProperties: false,
  },
} as const;

// ---------------------------------------------------------------------------
// Parsing robusto: estrae il primo oggetto JSON bilanciato da un testo
// (gestisce fence ```json, testo prima/dopo il JSON, commenti casuali).
// ---------------------------------------------------------------------------

export function estraiJson(testo: string): unknown {
  if (!testo) return null;
  let s = testo.trim();
  // Fence markdown ```json ... ```
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1]!.trim();
  // Primo oggetto { ... } bilanciato, ignorando stringhe e caratteri escapati
  const start = s.indexOf('{');
  if (start < 0) return null;
  let profondita = 0;
  let inStringa = false;
  let escapato = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStringa) {
      if (escapato) escapato = false;
      else if (ch === '\\') escapato = true;
      else if (ch === '"') inStringa = false;
      continue;
    }
    if (ch === '"') {
      inStringa = true;
      continue;
    }
    if (ch === '{') profondita++;
    else if (ch === '}') {
      profondita--;
      if (profondita === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1)) as unknown;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validazione della forma (struttura + tipi; niente semantica)
// ---------------------------------------------------------------------------

const CATEGORIE_AMMESSE: readonly CategoriaEvento[] = ['giocatore', 'societa', 'tifosi_media'];
const TIPI_AMMESSI: readonly TipoEvento[] = ['scenario_emergente', 'punto_decisionale'];

export function validaPropostaEventiWire(dato: unknown): dato is PropostaEventiWire {
  if (typeof dato !== 'object' || dato === null) return false;
  const proposta = dato as Record<string, unknown>;
  if (!Array.isArray(proposta.eventi) || !Array.isArray(proposta.notizie)) return false;
  if (!proposta.notizie.every((n) => typeof n === 'string')) return false;
  return proposta.eventi.every(validaEventoWire);
}

function validaEventoWire(dato: unknown): boolean {
  if (typeof dato !== 'object' || dato === null) return false;
  const evento = dato as Record<string, unknown>;
  if (!CATEGORIE_AMMESSE.includes(evento.categoria as CategoriaEvento)) return false;
  if (!TIPI_AMMESSI.includes(evento.tipo as TipoEvento)) return false;
  if (typeof evento.titolo !== 'string' || typeof evento.testo !== 'string') return false;
  if (!Array.isArray(evento.giocatori_coinvolti) || !evento.giocatori_coinvolti.every((g) => typeof g === 'string')) return false;
  if (evento.effetti_fisici !== undefined) {
    if (!Array.isArray(evento.effetti_fisici)) return false;
    if (
      !evento.effetti_fisici.every(
        (f) =>
          typeof f === 'object' &&
          f !== null &&
          typeof (f as Record<string, unknown>).giocatore === 'string' &&
          Number.isInteger((f as Record<string, unknown>).settimane),
      )
    ) {
      return false;
    }
  }
  if (!Array.isArray(evento.opzioni) || evento.opzioni.length === 0) return false;
  return evento.opzioni.every(validaOpzioneWire);
}

function validaOpzioneWire(dato: unknown): boolean {
  if (typeof dato !== 'object' || dato === null) return false;
  const opzione = dato as Record<string, unknown>;
  if (typeof opzione.testo !== 'string') return false;
  const effetti = opzione.effetti_proposti;
  if (typeof effetti !== 'object' || effetti === null) return false;
  const ef = effetti as Record<string, unknown>;
  return (
    Number.isInteger(ef.morale_giocatori) &&
    Number.isInteger(ef.fiducia_societa) &&
    Number.isInteger(ef.fiducia_tifosi) &&
    Number.isInteger(ef.reputazione)
  );
}

// ---------------------------------------------------------------------------
// Mapping snake_case → camelCase
// ---------------------------------------------------------------------------

export function daWirePropostaEventi(wire: PropostaEventiWire): PropostaEventi {
  return {
    eventi: wire.eventi.map((evento) => ({
      categoria: evento.categoria,
      tipo: evento.tipo,
      titolo: evento.titolo,
      testo: evento.testo,
      giocatoriCoinvolti: evento.giocatori_coinvolti,
      effettiFisici: evento.effetti_fisici?.map((f) => ({ giocatore: f.giocatore, settimane: f.settimane })),
      opzioni: evento.opzioni.map((opzione) => ({
        testo: opzione.testo,
        effettiProposti: {
          moraleGiocatori: opzione.effetti_proposti.morale_giocatori,
          fiduciaSocieta: opzione.effetti_proposti.fiducia_societa,
          fiduciaTifosi: opzione.effetti_proposti.fiducia_tifosi,
          reputazione: opzione.effetti_proposti.reputazione,
        },
      })),
    })),
    notizie: wire.notizie,
  };
}
