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
  fiducia_giocatori: number;
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
// Screenshot referto (PRD 7.4): wire format delle due schermate FL26
// ---------------------------------------------------------------------------

/** Schermata risultato: punteggio finale + espulsi + marcatori con minuti. */
export interface ScreenshotRisultatoWire {
  gol_casa: number;
  gol_trasferta: number;
  espulsi: string[];
  marcatori: Array<{ nome: string; minuti: number[] }>;
}

/** Schermata voti: per ogni giocatore voto PES (4.0-10.0). */
export interface ScreenshotVotiWire {
  giocatori: Array<{ nome: string; voto: number }>;
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
// Tipi pubblici screenshot referto (camelCase)
// ---------------------------------------------------------------------------

/** Dati estratti dalla schermata risultato FL26 (nomi come da schermata). */
export interface DatiScreenshotRisultato {
  golCasa: number;
  golTrasferta: number;
  espulsi: string[];
  marcatori: Array<{ nome: string; minuti: number[] }>;
}

/** Dati estratti dalla schermata voti FL26 (nomi come da schermata). */
export interface DatiScreenshotVoti {
  giocatori: Array<{ nome: string; voto: number }>;
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
                      fiducia_giocatori: { type: 'integer' },
                      fiducia_societa: { type: 'integer' },
                      fiducia_tifosi: { type: 'integer' },
                      reputazione: { type: 'integer' },
                    },
                    required: ['morale_giocatori', 'fiducia_giocatori', 'fiducia_societa', 'fiducia_tifosi', 'reputazione'],
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
// JSON Schema per gli screenshot del referto (PRD 7.4)
// ---------------------------------------------------------------------------

/** Schermata risultato FL26: punteggio, espulsi, marcatori con minuti. */
export const SCHEMA_SCREENSHOT_RISULTATO = {
  name: 'screenshot_risultato',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      gol_casa: { type: 'integer', minimum: 0, maximum: 30 },
      gol_trasferta: { type: 'integer', minimum: 0, maximum: 30 },
      espulsi: { type: 'array', items: { type: 'string' } },
      marcatori: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nome: { type: 'string' },
            minuti: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 120 } },
          },
          required: ['nome', 'minuti'],
          additionalProperties: false,
        },
      },
    },
    required: ['gol_casa', 'gol_trasferta', 'espulsi', 'marcatori'],
    additionalProperties: false,
  },
} as const;

/** Schermata voti FL26: voto (scala 4-10, si arrotonda a 0.5 nel parsing).
 * Minimo 4: in FL26 una prestazione pessima può valere 4.5, il modello va
 * lasciato libero di leggerla (il filtro riga sta nel parsing). */
export const SCHEMA_SCREENSHOT_VOTI = {
  name: 'screenshot_voti',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      giocatori: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nome: { type: 'string' },
            voto: { type: 'number', minimum: 4, maximum: 10 },
          },
          required: ['nome', 'voto'],
          additionalProperties: false,
        },
      },
    },
    required: ['giocatori'],
    additionalProperties: false,
  },
} as const;

// ---------------------------------------------------------------------------
// Validazione forma screenshot (struttura + tipi; la semantica è dell'engine)
// ---------------------------------------------------------------------------

export function validaScreenshotRisultatoWire(dato: unknown): dato is ScreenshotRisultatoWire {
  if (typeof dato !== 'object' || dato === null) return false;
  const r = dato as Record<string, unknown>;
  if (!Number.isInteger(r.gol_casa) || !Number.isInteger(r.gol_trasferta)) return false;
  if ((r.gol_casa as number) < 0 || (r.gol_casa as number) > 30) return false;
  if ((r.gol_trasferta as number) < 0 || (r.gol_trasferta as number) > 30) return false;
  if (!Array.isArray(r.espulsi) || !r.espulsi.every((e) => typeof e === 'string')) return false;
  if (!Array.isArray(r.marcatori)) return false;
  return r.marcatori.every((m) => {
    if (typeof m !== 'object' || m === null) return false;
    const mm = m as Record<string, unknown>;
    return (
      typeof mm.nome === 'string' &&
      Array.isArray(mm.minuti) &&
      mm.minuti.every((x) => Number.isInteger(x) && (x as number) >= 1 && (x as number) <= 120)
    );
  });
}

export function validaScreenshotVotiWire(dato: unknown): dato is ScreenshotVotiWire {
  if (typeof dato !== 'object' || dato === null) return false;
  const r = dato as Record<string, unknown>;
  if (!Array.isArray(r.giocatori)) return false;
  return r.giocatori.every((g) => {
    if (typeof g !== 'object' || g === null) return false;
    const gg = g as Record<string, unknown>;
    return (
      typeof gg.nome === 'string' &&
      typeof gg.voto === 'number' &&
      Number.isFinite(gg.voto) &&
      (gg.voto as number) >= 4 &&
      (gg.voto as number) <= 10
    );
  });
}

// ---------------------------------------------------------------------------
// Mapping snake_case → camelCase (screenshot)
// ---------------------------------------------------------------------------

export function daWireScreenshotRisultato(wire: ScreenshotRisultatoWire): DatiScreenshotRisultato {
  return {
    golCasa: wire.gol_casa,
    golTrasferta: wire.gol_trasferta,
    espulsi: wire.espulsi,
    marcatori: wire.marcatori.map((m) => ({ nome: m.nome, minuti: m.minuti })),
  };
}

/** Arrotonda il voto PES al passo 0.5 più vicino, nel range 4.0-10.0. */
export function votoArrotondato(voto: number): number {
  if (!Number.isFinite(voto)) return 5;
  return Math.min(10, Math.max(4, Math.round(voto * 2) / 2));
}

export function daWireScreenshotVoti(wire: ScreenshotVotiWire): DatiScreenshotVoti {
  return {
    giocatori: wire.giocatori.map((g) => ({ nome: g.nome, voto: votoArrotondato(g.voto) })),
  };
}

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
// Mercato (PRD 7.3): offerte in entrata, risposte trattativa, scenari CPU, cronaca
// ---------------------------------------------------------------------------

/** Offerta in entrata: email della squadra CPU con motivazione (PRD 7.3: l'LLM rende vivo). */
export interface OffertaInEntrataWire {
  /** Oggetto della mail (es. "Offerta per Lautaro Martinez") */
  oggetto: string;
  /** Corpo della mail: presentazione, cifra, motivazione del bisogno */
  testo: string;
}

/** Risposta CPU a una mossa dell'utente: solo testo (le cifre sono dell'engine). */
export interface RispostaTrattativaWire {
  testo: string;
}

/** Scenari CPU proposti dall'LLM: il motore valida e applica solo i validi (PRD 7.3). */
export interface ScenariMercatoCpuWire {
  movimenti: Array<{
    /** Nome giocatore (verificato dal motore contro il registry) */
    giocatore: string;
    /** Nome club cedente (verificato) */
    da: string;
    /** Nome club acquirente (verificato) */
    a: string;
    /** Cifra proposta (il motore la ricalcola entro i limiti reali) */
    cifra: number;
    /** Motivazione (per la notizia) */
    motivo: string;
  }>;
}

/** Cronaca della giornata di mercato: 2-4 notizie dai movimenti validi (top-5). */
export interface CronacaMercatoWire {
  notizie: string[];
}

// Tipi pubblici (camelCase)

export interface OffertaInEntrata {
  oggetto: string;
  testo: string;
}

export interface ScenariMercatoCpu {
  movimenti: Array<{
    giocatore: string;
    da: string;
    a: string;
    cifra: number;
    motivo: string;
  }>;
}

// JSON Schema

export const SCHEMA_OFFERTA_IN_ENTRATA = {
  name: 'offerta_in_entrata',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      oggetto: { type: 'string' },
      testo: { type: 'string' },
    },
    required: ['oggetto', 'testo'],
    additionalProperties: false,
  },
} as const;

export const SCHEMA_RISPOSTA_TRATTATIVA = {
  name: 'risposta_trattativa',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      testo: { type: 'string' },
    },
    required: ['testo'],
    additionalProperties: false,
  },
} as const;

export const SCHEMA_SCENARI_MERCATO_CPU = {
  name: 'scenari_mercato_cpu',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      movimenti: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            giocatore: { type: 'string' },
            da: { type: 'string' },
            a: { type: 'string' },
            cifra: { type: 'number', minimum: 0 },
            motivo: { type: 'string' },
          },
          required: ['giocatore', 'da', 'a', 'cifra', 'motivo'],
          additionalProperties: false,
        },
      },
    },
    required: ['movimenti'],
    additionalProperties: false,
  },
} as const;

export const SCHEMA_CRONACA_MERCATO = {
  name: 'cronaca_mercato',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      notizie: { type: 'array', items: { type: 'string' } },
    },
    required: ['notizie'],
    additionalProperties: false,
  },
} as const;

// Validazione forma

export function validaOffertaInEntrataWire(dato: unknown): dato is OffertaInEntrataWire {
  if (typeof dato !== 'object' || dato === null) return false;
  const r = dato as Record<string, unknown>;
  return typeof r.oggetto === 'string' && typeof r.testo === 'string';
}

export function validaRispostaTrattativaWire(dato: unknown): dato is RispostaTrattativaWire {
  if (typeof dato !== 'object' || dato === null) return false;
  return typeof (dato as Record<string, unknown>).testo === 'string';
}

export function validaScenariMercatoCpuWire(dato: unknown): dato is ScenariMercatoCpuWire {
  if (typeof dato !== 'object' || dato === null) return false;
  const r = dato as Record<string, unknown>;
  if (!Array.isArray(r.movimenti)) return false;
  return r.movimenti.every((m) => {
    if (typeof m !== 'object' || m === null) return false;
    const mm = m as Record<string, unknown>;
    return (
      typeof mm.giocatore === 'string' &&
      typeof mm.da === 'string' &&
      typeof mm.a === 'string' &&
      typeof mm.cifra === 'number' &&
      Number.isFinite(mm.cifra) &&
      (mm.cifra as number) >= 0 &&
      typeof mm.motivo === 'string'
    );
  });
}

export function validaCronacaMercatoWire(dato: unknown): dato is CronacaMercatoWire {
  if (typeof dato !== 'object' || dato === null) return false;
  const r = dato as Record<string, unknown>;
  return Array.isArray(r.notizie) && r.notizie.every((n) => typeof n === 'string');
}

// Mapping snake_case → camelCase

export function daWireOffertaInEntrata(wire: OffertaInEntrataWire): OffertaInEntrata {
  return { oggetto: wire.oggetto, testo: wire.testo };
}

export function daWireScenariMercatoCpu(wire: ScenariMercatoCpuWire): ScenariMercatoCpu {
  return {
    movimenti: wire.movimenti.map((m) => ({
      giocatore: m.giocatore,
      da: m.da,
      a: m.a,
      cifra: m.cifra,
      motivo: m.motivo,
    })),
  };
}

// ---------------------------------------------------------------------------
// Vivaio (PRD 7.5, decisioni utente: nomi SOLO LLM, niente fallback)
// ---------------------------------------------------------------------------

/** Batch identità intake: l'engine decide nazionalità/ruolo, l'LLM inventa i nomi. */
export interface NomiIntakeWire {
  giocatori: Array<{
    /** id stabile (es. pes-player-2147483649): l'engine lo usa per mappare */
    id: string;
    /** Nome + cognome inventati, coerenti con la nazione richiesta */
    nome: string;
  }>;
}

export interface NomiIntake {
  giocatori: Array<{ id: string; nome: string }>;
}

export const SCHEMA_NOMI_INTAKE = {
  name: 'nomi_intake',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      giocatori: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            nome: { type: 'string' },
          },
          required: ['id', 'nome'],
          additionalProperties: false,
        },
      },
    },
    required: ['giocatori'],
    additionalProperties: false,
  },
} as const;

export function validaNomiIntakeWire(dato: unknown): dato is NomiIntakeWire {
  if (typeof dato !== 'object' || dato === null) return false;
  const r = dato as Record<string, unknown>;
  if (!Array.isArray(r.giocatori) || r.giocatori.length === 0) return false;
  return r.giocatori.every((g) => {
    if (typeof g !== 'object' || g === null) return false;
    const gg = g as Record<string, unknown>;
    return typeof gg.id === 'string' && gg.id.trim() !== '' && typeof gg.nome === 'string' && gg.nome.trim() !== '';
  });
}

export function daWireNomiIntake(wire: NomiIntakeWire): NomiIntake {
  return { giocatori: wire.giocatori.map((g) => ({ id: g.id, nome: g.nome.trim() })) };
}

/** Narrativa del prospetto: mini-storia + parere dello scout (testo, mai numeri). */
export interface ProspettoNarrativaWire {
  mini_storia: string;
  parere_scout: string;
}

export interface ProspettoNarrativa {
  miniStoria: string;
  parereScout: string;
}

export const SCHEMA_PROSPETTO_NARRATIVA = {
  name: 'prospetto_narrativa',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      mini_storia: { type: 'string' },
      parere_scout: { type: 'string' },
    },
    required: ['mini_storia', 'parere_scout'],
    additionalProperties: false,
  },
} as const;

export function validaProspettoNarrativaWire(dato: unknown): dato is ProspettoNarrativaWire {
  if (typeof dato !== 'object' || dato === null) return false;
  const r = dato as Record<string, unknown>;
  return typeof r.mini_storia === 'string' && r.mini_storia.trim() !== '' && typeof r.parere_scout === 'string' && r.parere_scout.trim() !== '';
}

export function daWireProspettoNarrativa(wire: ProspettoNarrativaWire): ProspettoNarrativa {
  return { miniStoria: wire.mini_storia.trim(), parereScout: wire.parere_scout.trim() };
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
    Number.isInteger(ef.fiducia_giocatori) &&
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
          fiduciaGiocatori: opzione.effetti_proposti.fiducia_giocatori,
          fiduciaSocieta: opzione.effetti_proposti.fiducia_societa,
          fiduciaTifosi: opzione.effetti_proposti.fiducia_tifosi,
          reputazione: opzione.effetti_proposti.reputazione,
        },
      })),
    })),
    notizie: wire.notizie,
  };
}

// ---------------------------------------------------------------------------
// Mondo news (X-style) — 3-5 notizie dal mondo fuori dalla tua squadra
// ---------------------------------------------------------------------------

export type CategoriaMondoWire = 'performance' | 'derby' | 'infortunio' | 'sorteggio' | 'mercato' | 'coppe' | 'altro';

export interface MondoNotiziaWire {
  categoria: CategoriaMondoWire;
  titolo: string;
  estratto: string;
  corpo: string;
  autore_nome: string;
  autore_handle: string;
  squadra?: string;
  giocatore?: string;
}

export interface PropostaMondoWire {
  notizie: MondoNotiziaWire[];
}

export interface PropostaMondo {
  notizie: Array<{
    categoria: CategoriaMondoWire;
    titolo: string;
    estratto: string;
    corpo: string;
    autoreNome: string;
    autoreHandle: string;
    squadra?: string;
    giocatore?: string;
  }>;
}

export const SCHEMA_MONDO_NOTIZIE = {
  name: 'proposta_mondo',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      notizie: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            categoria: { type: 'string', enum: ['performance', 'derby', 'infortunio', 'sorteggio', 'mercato', 'coppe', 'altro'] },
            titolo: { type: 'string' },
            estratto: { type: 'string' },
            corpo: { type: 'string' },
            autore_nome: { type: 'string' },
            autore_handle: { type: 'string' },
            squadra: { type: 'string' },
            giocatore: { type: 'string' },
          },
          required: ['categoria', 'titolo', 'estratto', 'corpo', 'autore_nome', 'autore_handle'],
          additionalProperties: false,
        },
      },
    },
    required: ['notizie'],
    additionalProperties: false,
  },
} as const;

export function validaPropostaMondoWire(dato: unknown): dato is PropostaMondoWire {
  if (typeof dato !== 'object' || dato === null) return false;
  const r = dato as Record<string, unknown>;
  if (!Array.isArray(r.notizie)) return false;
  return r.notizie.every((n) => {
    if (typeof n !== 'object' || n === null) return false;
    const nn = n as Record<string, unknown>;
    return (
      typeof nn.categoria === 'string' &&
      typeof nn.titolo === 'string' &&
      typeof nn.estratto === 'string' &&
      typeof nn.corpo === 'string' &&
      typeof nn.autore_nome === 'string' &&
      typeof nn.autore_handle === 'string'
    );
  });
}

export function daWirePropostaMondo(wire: PropostaMondoWire): PropostaMondo {
  return {
    notizie: wire.notizie.map((n) => ({
      categoria: n.categoria,
      titolo: n.titolo,
      estratto: n.estratto,
      corpo: n.corpo,
      autoreNome: n.autore_nome,
      autoreHandle: n.autore_handle,
      squadra: n.squadra,
      giocatore: n.giocatore,
    })),
  };
}
