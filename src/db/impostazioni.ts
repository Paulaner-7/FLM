// FLM — Impostazioni globali (config LLM, PRD 4.5 e 7.8, 8.2 online-first)
// Regola 1 AGENTS.md: persistenza solo via Dexie. Record unico id 'llm'.
// Record assente = LLM disattivo: il gioco è in pausa, avanza solo con retry (PRD 8.2).

import { db } from './database';
import type { ImpostazioniRecord } from '../types/entities';

export const IMPOSTAZIONI_LLM_ID = 'llm';

/**
 * Default provider (PRD 7.8): Opencode Go — modelli DeepSeek V4 Flash e MiMo V2.5.
 * baseUrl relativo (/zen/go/v1): Opencode Go non supporta CORS browser
 * (preflight 404, verificato) → la chiamata passa dal proxy di sviluppo Vite
 * (vite.config.ts), che inoltra a https://opencode.ai/zen/go/v1.
 * Endpoint alternativo: /zen/v1 (OpenCode Zen) per i modelli free
 * (es. deepseek-v4-flash-free), stesso proxy, stessa chiave opencode.
 * I provider con CORS (OpenAI, Gemini, DeepSeek) usano URL assoluti.
 */
export const IMPOSTAZIONI_LLM_DEFAULT: Omit<ImpostazioniRecord, 'id'> = {
  baseUrl: '/zen/go/v1',
  apiKey: '',
  modelloNarrativo: 'deepseek-v4-flash',
  modelloVisione: 'mimo-v2.5',
  llmAttivo: true,
};

/**
 * Normalizza il base URL perché il browser non chiami mai opencode.ai in
 * modo diretto (CORS: preflight 404, verificato). Qualsiasi URL assoluto su
 * opencode.ai (con o senza https, con o senza slash finale, /zen/go o /zen/v1)
 * viene riscritto sul path relativo del proxy Vite (/zen/go/v1 o /zen/v1).
 * I provider con CORS (OpenAI, Gemini, DeepSeek) restano su URL assoluto.
 * Usata sia in lettura che nel client LLM, così il test (che bypassa Dexie)
 * e il gioco ottengono sempre il path proxy-corretto.
 */
export function normalizzaBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  // Solo Opencode Go/Zen necessitano del proxy relativo (niente CORS browser).
  if (!/opencode\.ai/i.test(trimmed)) return trimmed;
  // Già relativo: è il path del proxy di sviluppo, lascialo passare.
  if (trimmed.startsWith('/')) return trimmed;
  // Assoluto su opencode.ai: mappa sul path relativo del proxy Vite.
  // /zen/go = endpoint Go (a pagamento), /zen/v1 = endpoint Zen (free).
  if (trimmed.includes('/zen/go')) return '/zen/go/v1';
  if (trimmed.includes('/zen/v1')) return '/zen/v1';
  return '/zen/go/v1';
}

/**
 * Legge le impostazioni LLM. Se il record non esiste restituisce i default
 * (PRD 7.8): il salvataggio esplicito crea il record. La chiave vuota e/o
 * llmAttivo false equivalgono a LLM disattivo per il servizio (src/llm).
 * Normalizza il base URL: i record salvati prima del proxy (agosto 2026)
 * contengono l'URL assoluto di Opencode Go, che in browser fallisce per CORS.
 */
export async function impostazioniLlm(): Promise<ImpostazioniRecord> {
  const record = await db.impostazioni.get(IMPOSTAZIONI_LLM_ID);
  if (!record) return { id: IMPOSTAZIONI_LLM_ID, ...IMPOSTAZIONI_LLM_DEFAULT };
  const normalizzato = normalizzaBaseUrl(record.baseUrl);
  if (normalizzato !== record.baseUrl) return { ...record, baseUrl: normalizzato };
  return record;
}

/** Salva (o crea) le impostazioni LLM. Sovrascrittura completa del record. */
export async function salvaImpostazioniLlm(impostazioni: Omit<ImpostazioniRecord, 'id'>): Promise<void> {
  await db.impostazioni.put({ id: IMPOSTAZIONI_LLM_ID, ...impostazioni, baseUrl: normalizzaBaseUrl(impostazioni.baseUrl) });
}

/** true se la configurazione è utilizzabile (chiave presente e LLM attivo). */
export async function llmConfigurato(): Promise<boolean> {
  const impostazioni = await impostazioniLlm();
  return impostazioni.llmAttivo && impostazioni.apiKey.trim() !== '' && impostazioni.baseUrl.trim() !== '';
}
