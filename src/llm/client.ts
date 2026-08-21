// FLM — Client HTTP OpenAI-compatible (chat completions)
// PRD 4.5 / 7.8: provider-agnostic — base URL + chiave + modelli dalle
// impostazioni (src/db/impostazioni.ts). Nessun adattatore per provider:
// endpoint standard /chat/completions con auth Bearer.
//
// Gestione errori (regola ferrea): rete, timeout o HTTP → MAI eccezioni dal client.
// Il client restituisce un esito tipizzato; PRD 8.2 (online-first): le funzioni di gioco
// che richiedono LLM lanciano errore bloccante via assertLLMDisponibile(), mai fallback silenzioso.

import { impostazioniLlm, normalizzaBaseUrl } from '../db/impostazioni';
import type { ImpostazioniRecord } from '../types/entities';

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
  | { esito: 'rete'; latenzaMs: number; timeout: boolean; cors: boolean }
  | { esito: 'http'; status: number; latenzaMs: number; body?: string }
  | { esito: 'non_json'; status: number; latenzaMs: number }
  | { esito: 'non_configurato' };

export type EsitoListaModelli =
  | { esito: 'ok'; modelli: string[]; latenzaMs: number }
  | { esito: 'rete'; latenzaMs: number; timeout: boolean; cors: boolean }
  | { esito: 'http'; status: number; latenzaMs: number; body?: string }
  | { esito: 'non_json'; status: number; latenzaMs: number }
  | { esito: 'non_configurato' };

export interface LlmHttpClient {
  chat(opzioni: OpzioniChat): Promise<EsitoChat>;
  elencaModelli(timeoutMs?: number): Promise<EsitoListaModelli>;
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
export function creaLlmClient(
  fetchImpl: typeof fetch = fetch,
  getImpostazioni: () => Promise<ImpostazioniRecord> = impostazioniLlm,
): LlmHttpClient {
  return {
    async elencaModelli(timeoutMs = 15000): Promise<EsitoListaModelli> {
      const impostazioni = await getImpostazioni();
      if (
        !impostazioni.llmAttivo ||
        impostazioni.apiKey.trim() === '' ||
        impostazioni.baseUrl.trim() === ''
      ) {
        return { esito: 'non_configurato' };
      }
      const baseUrl = normalizzaBaseUrl(impostazioni.baseUrl);
      const url = `${baseUrl.replace(/\/+$/, '')}/models`;
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: `Bearer ${impostazioni.apiKey}`,
      };
      const inizio = Date.now();
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const timeout = error instanceof DOMException && error.name === 'TimeoutError';
        const cors = !timeout && error instanceof TypeError;
        return { esito: 'rete', latenzaMs: Date.now() - inizio, timeout, cors };
      }
      const latenzaMs = Date.now() - inizio;
      if (!response.ok) {
        let body: string | undefined;
        try { body = (await response.text()).slice(0, 600); } catch { body = undefined; }
        return { esito: 'http', status: response.status, latenzaMs, body };
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) return { esito: 'non_json', status: response.status, latenzaMs };
      let data: unknown;
      try {
        data = (await response.json()) as unknown;
      } catch {
        return { esito: 'non_json', status: response.status, latenzaMs };
      }
      const modelli = estraiListaModelli(data);
      if (modelli === null) return { esito: 'non_json', status: response.status, latenzaMs };
      return { esito: 'ok', modelli, latenzaMs };
    },
    async chat({ ruolo, messaggi, responseSchema, maxTokens = 1024, timeoutMs = 30000 }): Promise<EsitoChat> {
      const impostazioni = await getImpostazioni();
      if (
        !impostazioni.llmAttivo ||
        impostazioni.apiKey.trim() === '' ||
        impostazioni.baseUrl.trim() === ''
      ) {
        return { esito: 'non_configurato' };
      }
      const modello = ruolo === 'narrativo' ? impostazioni.modelloNarrativo : impostazioni.modelloVisione;
      if (modello.trim() === '') return { esito: 'non_configurato' };

      // Opencode Go/Zen non inviano header CORS: un URL assoluto su opencode.ai
      // verrebbe chiamato direttamente dal browser e bloccato. Riscrive sempre
      // sul path relativo del proxy di sviluppo (PRD 7.8), anche quando il
      // baseUrl arriva dal form della pagina Impostazioni (test bypassa Dexie).
      const baseUrl = normalizzaBaseUrl(impostazioni.baseUrl);
      const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
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
          // In browser un fetch fallito per CORS o host irraggiungibile lancia
          // TypeError ("Failed to fetch"): non è un timeout, ma va segnalato
          // come blocco di rete perché la UI suggerisca proxy/config giuste.
          const cors = !timeout && error instanceof TypeError;
          return { esito: 'rete', latenzaMs: Date.now() - inizio, timeout, cors };
        }
        const latenzaMs = Date.now() - inizio;

        if (!response.ok) {
          // 4xx su json_schema = provider senza structured output: ritenta senza.
          if (tentativo.conSchema && (response.status === 400 || response.status === 422)) continue;
          let body: string | undefined;
          try { body = (await response.clone().text()).slice(0, 600); } catch { body = undefined; }
          return { esito: 'http', status: response.status, latenzaMs, body };
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
        if (testo === null) return { esito: 'rete', latenzaMs, timeout: false, cors: false };
        return { esito: 'ok', testo, modelloUsato: modello, latenzaMs, conSchema: tentativo.conSchema };
      }
      return { esito: 'http', status: 0, latenzaMs: 0 };
    },
  };
}

/** Estrae choices[0].message.content dalla risposta OpenAI-compatible.
 * content può essere stringa oppure array di parti (formato multimodale di
 * alcuni provider): in quel caso concatena le parti di testo. */
function estraiTestoRisposta(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const primo = choices[0];
  if (typeof primo !== 'object' || primo === null) return null;
  const message = (primo as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) return null;
  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const testo = content
      .map((parte) => {
        if (typeof parte === 'string') return parte;
        if (typeof parte === 'object' && parte !== null && typeof (parte as { text?: unknown }).text === 'string') {
          return (parte as { text: string }).text;
        }
        return '';
      })
      .join('');
    if (testo.length > 0) return testo;
  }
  // Modelli reasoning (es. mimo-v2.5): la risposta può stare nel campo
  // `reasoning` quando `content` è nullo (budget token esaurito sulla sola
  // parte di pensiero). Fallback così il test di connessione non segnala
  // un falso errore di rete su una risposta 200 valida.
  const reasoning = (message as { reasoning?: unknown }).reasoning;
  if (typeof reasoning === 'string' && reasoning.trim() !== '') return reasoning.trim();
  return null;
}

/** Estrae lista id modelli da risposta OpenAI /models (tollerante a varianti). */
function estraiListaModelli(data: unknown): string[] | null {
  if (typeof data !== 'object' || data === null) return null;
  const obj = data as Record<string, unknown>;
  // Forma standard OpenAI: { data: [{id}...] }
  const candidates: unknown[] = [];
  if (Array.isArray(obj.data)) candidates.push(...obj.data);
  // Alcuni proxy usano { models: [...] } o { data: { models: [...] } }
  if (Array.isArray(obj.models)) candidates.push(...obj.models);
  // Risposta diretta array
  if (Array.isArray(data)) candidates.push(...(data as unknown[]));
  // Se data è { data: { data: [...] } } (doppio nesting raro)
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    const inner = (obj.data as Record<string, unknown>);
    if (Array.isArray(inner.data)) candidates.push(...inner.data);
    if (Array.isArray(inner.models)) candidates.push(...inner.models);
  }
  if (candidates.length === 0) return null;
  const ids: string[] = [];
  for (const item of candidates) {
    if (typeof item === 'string' && item.trim() !== '') ids.push(item.trim());
    else if (typeof item === 'object' && item !== null) {
      const r = item as Record<string, unknown>;
      if (typeof r.id === 'string' && r.id.trim() !== '') ids.push(r.id.trim());
      else if (typeof r.name === 'string' && r.name.trim() !== '') ids.push(r.name.trim());
      else if (typeof r.model === 'string' && r.model.trim() !== '') ids.push(r.model.trim());
    }
  }
  if (ids.length === 0) return null;
  // Dedup + sort stabile
  const unici = [...new Set(ids)];
  unici.sort((a, b) => a.localeCompare(b));
  return unici;
}
