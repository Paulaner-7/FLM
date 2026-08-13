// FLM — Client HTTP OpenAI-compatible (chat completions)
// PRD 4.5 / 7.8: provider-agnostic — base URL + chiave + modelli dalle
// impostazioni (src/db/impostazioni.ts). Nessun adattatore per provider:
// endpoint standard /chat/completions con auth Bearer.
//
// Gestione errori (regola ferrea): rete, timeout o HTTP → MAI eccezioni verso
// il chiamante, l'LLM è un potenziamento non una dipendenza (PRD 4.6).
// Il client restituisce un esito tipizzato; le funzioni pubbliche di
// src/llm/index.ts lo traducono in null per i flussi di gioco.

import { impostazioniLlm } from '../db/impostazioni';

/** Ruolo logico del modello: i chiamanti non conoscono mai gli ID reali. */
export type RuoloModello = 'narrativo' | 'visione';

/** Messaggio chat compatibile OpenAI (testo o contenuto multimodale per visione). */
export type ContenutoMessaggio =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;

export interface MessaggioChat {
  role: 'system' | 'user' | 'assistant';
  content: ContenutoMessaggio;
}

/** JSON Schema per response_format (campo json_schema di OpenAI). */
export interface ResponseSchema {
  name: string;
  strict: boolean;
  schema: unknown;
}

export interface OpzioniChat {
  ruolo: RuoloModello;
  messaggi: MessaggioChat[];
  /** Presente = primo tentativo con structured output; assente/null = prompt-mode. */
  responseSchema?: ResponseSchema | null;
  maxTokens?: number;
  /** Timeout per singolo tentativo (default 30s, PRD: timeout 30s). */
  timeoutMs?: number;
}

/**
 * Esito tipizzato di una chiamata: mai eccezioni. Il chiamante decide
 * come trattare ogni caso (i flussi di gioco mappano tutto su null).
 */
export type EsitoChat =
  | { esito: 'ok'; testo: string; modelloUsato: string; latenzaMs: number; conSchema: boolean }
  | { esito: 'rete'; latenzaMs: number; timeout: boolean }
  | { esito: 'http'; status: number; latenzaMs: number }
  | { esito: 'non_json'; status: number; latenzaMs: number }
  | { esito: 'non_configurato' };

export interface LlmHttpClient {
  chat(opzioni: OpzioniChat): Promise<EsitoChat>;
}

/** Forma pubblica di una risposta riuscita (mappa l'esito ok, nasconde il resto). */
export interface RispostaChatPubblica {
  testo: string;
  modelloUsato: string;
  latenzaMs: number;
}

/**
 * Costruisce il client LLM. fetchImpl è iniettabile per i test offline
 * (scripts/verify-llm.ts): la logica HTTP resta pura e senza rete.
 */
export function creaLlmClient(fetchImpl: typeof fetch = fetch): LlmHttpClient {
  return {
    async chat({ ruolo, messaggi, responseSchema, maxTokens = 1024, timeoutMs = 30000 }): Promise<EsitoChat> {
      const impostazioni = await impostazioniLlm();
      if (
        !impostazioni.llmAttivo ||
        impostazioni.apiKey.trim() === '' ||
        impostazioni.baseUrl.trim() === ''
      ) {
        return { esito: 'non_configurato' };
      }
      const modello = ruolo === 'narrativo' ? impostazioni.modelloNarrativo : impostazioni.modelloVisione;
      if (modello.trim() === '') return { esito: 'non_configurato' };

      const url = `${impostazioni.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${impostazioni.apiKey}`,
      };

      // Al più due tentativi di rete (PRD / decisione): 1° con structured output,
      // 2° senza (prompt-mode) SOLO se il provider rifiuta lo schema (400/422):
      // rilevamento automatico del supporto, nessuna configurazione.
      const tentativi: Array<{ schema: ResponseSchema | null; conSchema: boolean }> = responseSchema
        ? [
            { schema: responseSchema, conSchema: true },
            { schema: null, conSchema: false },
          ]
        : [{ schema: null, conSchema: false }];

      for (const tentativo of tentativi) {
        const body: Record<string, unknown> = {
          model: modello,
          messages: messaggi,
          max_tokens: maxTokens,
        };
        if (tentativo.schema) {
          body.response_format = { type: 'json_schema', json_schema: tentativo.schema };
        }

        const inizio = Date.now();
        let response: Response;
        try {
          response = await fetchImpl(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (error) {
          const timeout = error instanceof DOMException && error.name === 'TimeoutError';
          return { esito: 'rete', latenzaMs: Date.now() - inizio, timeout };
        }
        const latenzaMs = Date.now() - inizio;

        if (!response.ok) {
          // 4xx su json_schema = provider senza structured output: ritenta senza.
          if (tentativo.conSchema && (response.status === 400 || response.status === 422)) continue;
          return { esito: 'http', status: response.status, latenzaMs };
        }

        // Risposta non JSON (es. index.html del SPA fallback quando il proxy di
        // sviluppo non è attivo): esito dedicato, il test lo spiega all'utente.
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) {
          return { esito: 'non_json', status: response.status, latenzaMs };
        }

        let data: unknown;
        try {
          data = (await response.json()) as unknown;
        } catch {
          return { esito: 'non_json', status: response.status, latenzaMs };
        }
        const testo = estraiTestoRisposta(data);
        if (testo === null) return { esito: 'rete', latenzaMs, timeout: false };
        return { esito: 'ok', testo, modelloUsato: modello, latenzaMs, conSchema: tentativo.conSchema };
      }
      return { esito: 'http', status: 0, latenzaMs: 0 };
    },
  };
}

/** Estrae choices[0].message.content (stringa) dalla risposta OpenAI-compatible. */
function estraiTestoRisposta(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const primo = choices[0];
  if (typeof primo !== 'object' || primo === null) return null;
  const message = (primo as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content : null;
}
