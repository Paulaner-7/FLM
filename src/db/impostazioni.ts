// FLM — Impostazioni globali (config LLM, PRD 4.5 e 7.8)
// Regola 1 AGENTS.md: persistenza solo via Dexie. Record unico id 'llm'.
// Record assente = LLM disattivo: il motore usa il fallback offline (PRD 4.6).

import { db } from './database';
import type { ImpostazioniRecord } from '../types/entities';

export const IMPOSTAZIONI_LLM_ID = 'llm';

/**
 * Default provider (PRD 7.8): Opencode Go — modelli DeepSeek V4 Flash e MiMo V2.5.
 * baseUrl relativo (/zen/go/v1): Opencode Go non supporta CORS browser
 * (preflight 404, verificato) → la chiamata passa dal proxy di sviluppo Vite
 * (vite.config.ts), che inoltra a https://opencode.ai/zen/go/v1.
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
 * Legge le impostazioni LLM. Se il record non esiste restituisce i default
 * (PRD 7.8): il salvataggio esplicito crea il record. La chiave vuota e/o
 * llmAttivo false equivalgono a LLM disattivo per il servizio (src/llm).
 */
export async function impostazioniLlm(): Promise<ImpostazioniRecord> {
  const record = await db.impostazioni.get(IMPOSTAZIONI_LLM_ID);
  if (!record) return { id: IMPOSTAZIONI_LLM_ID, ...IMPOSTAZIONI_LLM_DEFAULT };
  // Normalizzazione legacy: i record salvati prima del proxy (agosto 2026)
  // contengono l'URL assoluto di Opencode Go, che in browser fallisce per CORS.
  if (record.baseUrl === 'https://opencode.ai/zen/go/v1') {
    return { ...record, baseUrl: IMPOSTAZIONI_LLM_DEFAULT.baseUrl };
  }
  return record;
}

/** Salva (o crea) le impostazioni LLM. Sovrascrittura completa del record. */
export async function salvaImpostazioniLlm(impostazioni: Omit<ImpostazioniRecord, 'id'>): Promise<void> {
  await db.impostazioni.put({ id: IMPOSTAZIONI_LLM_ID, ...impostazioni });
}

/** true se la configurazione è utilizzabile (chiave presente e LLM attivo). */
export async function llmConfigurato(): Promise<boolean> {
  const impostazioni = await impostazioniLlm();
  return impostazioni.llmAttivo && impostazioni.apiKey.trim() !== '' && impostazioni.baseUrl.trim() !== '';
}
