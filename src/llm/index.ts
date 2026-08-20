// FLM — Servizio LLM (regola 2 AGENTS.md)
// Le chiamate a API LLM vivono SOLO in questo modulo; il resto dell'app
// usa esclusivamente le funzioni esposte qui. Provider-agnostic (PRD 4.5/7.8):
// base URL + chiave + modelli da impostazioni (src/db), mai hardcoded.
//
// Regola 3 AGENTS.md: l'LLM produce SOLO proposte — qui si valida la forma
// (schema PRD 4.2); la semantica (giocatori esistenti, clamp degli effetti,
// anti-ripetizione) è dell'engine. Ogni funzione ritorna null in caso di
// errore: il chiamante ha sempre un fallback offline (PRD 4.6).

import { creaLlmClient, type EsitoChat, type MessaggioChat, type ResponseSchema, type RispostaChatPubblica, type RuoloModello } from './client';
import {
  SCHEMA_EVENTI_JSON,
  SCHEMA_SCREENSHOT_VOTI,
  SCHEMA_OFFERTA_IN_ENTRATA,
  SCHEMA_RISPOSTA_TRATTATIVA,
  SCHEMA_SCENARI_MERCATO_CPU,
  SCHEMA_CRONACA_MERCATO,
  SCHEMA_NOMI_INTAKE,
  SCHEMA_PROSPETTO_NARRATIVA,
  SCHEMA_MONDO_NOTIZIE,
  daWirePropostaEventi,
  daWireScreenshotVoti,
  daWireOffertaInEntrata,
  daWireScenariMercatoCpu,
  daWireProspettoNarrativa,
  daWirePropostaMondo,
  estraiJson,
  validaPropostaEventiWire,
  validaScreenshotVotiWire,
  validaOffertaInEntrataWire,
  validaRispostaTrattativaWire,
  validaScenariMercatoCpuWire,
  validaCronacaMercatoWire,
  validaNomiIntakeWire,
  validaProspettoNarrativaWire,
  validaPropostaMondoWire,
  type DatiScreenshotVoti,
  type OffertaInEntrata,
  type PropostaEventi,
  type PropostaMondo,
  type ScenariMercatoCpu,
  type ScreenshotVotiWire,
  type NomiIntake,
  type ProspettoNarrativa,
} from './schema';
import { impostazioniLlm } from '../db/impostazioni';
import type { ImpostazioniRecord } from '../types/entities';

export type { PropostaEventi, PropostaMondo } from './schema';
export type { DatiScreenshotVoti } from './schema';
export type { OffertaInEntrata, ScenariMercatoCpu } from './schema';
export type { NomiIntake, ProspettoNarrativa } from './schema';
export type { EsitoChat, EsitoListaModelli, MessaggioChat, ResponseSchema, RuoloModello } from './client';

/** Token massimi di default per le generazioni narrative (PRD 4.4: ~1.800 out). */
const MAX_TOKEN_EVENTI = 2048;

/**
 * Stato sintetico passato al modello a ogni chiamata (PRD 4.1):
 * il codice raccoglie lo stato, l'LLM lo racconta — mai numeri finali.
 */
export interface ContestoGenerazione {
  settimana: number;
  posizioneClassifica: number;
  ultimePartite: string[];
  giocatoriMoraleBasso: string[];
  /** Morale medio pesato dello spogliatoio (engine/morale.ts), 0-100 */
  moraleSpogliatoio?: number;
  promesseInScadenza: string[];
  fiduciaSocieta: number;
  /** Ultimi 10-15 eventi già usati, per l'anti-ripetizione (PRD 4.3) */
  ultimiEventi: string[];
  /** Categorie pescate dall'engine: l'LLM riempie, non sceglie (PRD 4.3) */
  categorieRichieste?: string[];
  /** Pool di giocatori della rosa con etichetta motivo (PRD 4.1) */
  candidati?: Array<{ nome: string; motivo: string }>;
  /** Casi reali come ispirazione (situazioni, mai nomi reali — src/data/casi-reali.ts) */
  casiReali?: string[];
  /** Fase della stagione (avvio/lotta/sprint_finale): guida la credibilità (PRD 4.3) */
  faseStagione?: string;
}

export interface OpzioniChatCompletions {
  ruolo: RuoloModello;
  messaggi: MessaggioChat[];
  /** Presente = structured output (json_schema); assente = prompt-mode. */
  responseSchema?: ResponseSchema | null;
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * Chat completions generica (OpenAI-compatible). Il chiamante usa i ruoli
 * ('narrativo' | 'visione'), mai ID modello: la risoluzione sta qui dentro.
 * Ritorna null per qualsiasi errore (rete, timeout, HTTP, JSON invalido):
 * il flusso di gioco non deve mai fallire per colpa dell'LLM (PRD 4.6).
 */
export async function chatCompletions(opzioni: OpzioniChatCompletions): Promise<RispostaChatPubblica | null> {
  return (await servizio()).chatCompletions(opzioni);
}

/**
 * Genera gli eventi settimanali e le notizie del turno (PRD 4.2).
 * Tentativo 1: structured output con lo schema del PRD; se il JSON non
 * valida, un retry in prompt-mode con istruzioni esplicite; poi null
 * (il motore pesca dal fallback offline, PRD 4.6).
 */
export async function generaEventiSettimanali(contesto: ContestoGenerazione): Promise<PropostaEventi | null> {
  return (await servizio()).generaEventiSettimanali(contesto);
}

/**
 * Offerta in entrata (PRD 7.3): email del club CPU con motivazione. Le cifre
 * arrivano dall'engine nel contesto: l'LLM scrive solo il testo. null = fallback
 * template engine (PRD 4.6).
 */
export async function generaOffertaInEntrata(contesto: ContestoOffertaInEntrata): Promise<OffertaInEntrata | null> {
  return (await servizio()).generaOffertaInEntrata(contesto);
}

/** Risposta CPU a una mossa dell'utente: solo testo (la cifra è dell'engine). */
export async function generaRispostaTrattativa(contesto: ContestoRispostaTrattativa): Promise<string | null> {
  return (await servizio()).generaRispostaTrattativa(contesto);
}

/** Scenari CPU-to-CPU proposti dall'LLM: l'engine valida e applica solo i validi (PRD 7.3). */
export async function generaScenariMercatoCpu(contesto: ContestoScenariMercato): Promise<ScenariMercatoCpu | null> {
  return (await servizio()).generaScenariMercatoCpu(contesto);
}

/** Cronaca della giornata di mercato: 2-4 notizie dai movimenti validi (top-5). */
export async function generaCronacaMercato(contesto: ContestoCronacaMercato): Promise<string[] | null> {
  return (await servizio()).generaCronacaMercato(contesto);
}

/**
 * Nomi dell'intake vivaio (PRD 7.5, decisione utente: SOLO LLM, niente fallback).
 * Batch chunked (~150 per chiamata): l'engine decide nazione/età/ruolo per ogni
 * id, l'LLM inventa nome+cognome coerenti. ALL-OR-NOTHING: se anche un solo
 * chunk fallisce dopo il retry, ritorna null → l'intake resta in attesa.
 */
export async function generaNomiIntake(
  richieste: Array<{ id: string; nazione: string; eta: number; ruolo: string; posizione: string }>,
  nomiEsistenti: string[],
): Promise<NomiIntake | null> {
  return (await servizio()).generaNomiIntake(richieste, nomiEsistenti);
}

/** Mini-storia e parere dello scout per il prospetto della squadra utente. */
export async function generaNarrativaProspetto(contesto: ContestoNarrativaProspetto): Promise<ProspettoNarrativa | null> {
  return (await servizio()).generaNarrativaProspetto(contesto);
}

/** Notizie dal mondo (X-style) — fuori dalla tua squadra. null = fallback engine. */
export async function generaMondoNotizie(contesto: ContestoMondoNotizie): Promise<PropostaMondo | null> {
  return (await servizio()).generaMondoNotizie(contesto);
}

/**
 * Analizza un'immagine col modello visione (screenshot referto/rosa, OCR —
 * PRD 7.8). immagineBase64: data URL completo (es. data:image/png;base64,...).
 * Ritorna il testo grezzo, o null in caso di errore.
 */
export async function analizzaImmagine(opzioni: {
  immagineBase64: string;
  istruzioni: string;
  maxTokens?: number;
}): Promise<string | null> {
  return (await servizio()).analizzaImmagine(opzioni);
}

/**
 * Esito dell'analisi screenshot: 'ok' con dati, oppure un errore con
 * dettaglio leggibile per la UI (mai eccezioni, PRD 4.6).
 */
export type EsitoScreenshotVoti =
  | { esito: 'ok'; dati: DatiScreenshotVoti; modelloUsato: string }
  /** Errore del servizio LLM (config, rete, HTTP): dettaglio per la UI */
  | { esito: 'errore_llm'; dettaglio: string }
  /** Risposta ricevuta ma non interpretabile come voti: quale modello ha risposto */
  | { esito: 'non_legibile'; modello: string; testo?: string };

/**
 * Estrae i voti dello screenshot FL26 (PRD 7.4): voto per ogni giocatore.
 * nomiRosa: vincolo nel prompt — il modello deve restituire nomi ESATTI dalla
 * lista (o omettere la riga): niente invenzioni, il matching è dell'engine.
 * Parsing tollerante: voto accettato anche come stringa "6,5", arrotondato a
 * 0.5 dall'engine. La UI mostra il dettaglio in caso di errore (PRD 4.6).
 */
export async function analizzaScreenshotReferto(opzioni: {
  immagineBase64: string;
  nomiRosa: string[];
  squadraNome: string;
}): Promise<EsitoScreenshotVoti> {
  return (await servizio()).analizzaScreenshotReferto(opzioni);
}

/** Contesto per un'offerta in entrata (PRD 7.3): l'LLM scrive la mail, il motore la cifra. */
export interface ContestoOffertaInEntrata {
  giocatore: string;
  ruolo: string;
  overall: number;
  eta: number;
  clubAcquirente: string;
  cifra: number;
  /** Bisogno del club (dal motore, es. "cerca un esterno dopo la cessione di X") */
  bisogno: string;
}

/** Contesto per la risposta CPU a una mossa dell'utente (solo testo: le cifre sono dell'engine). */
export interface ContestoRispostaTrattativa {
  giocatore: string;
  club: string;
  direzione: 'acquisto' | 'vendita';
  /** Esito della risposta: accettata, controproposta, final offer */
  esito: string;
  cifraCpu: number;
  cifraUtente: number;
  giro: number;
}

/** Contesto per gli scenari CPU (PRD 7.3: l'LLM propone, l'engine valida). */
export interface ContestoScenariMercato {
  finestra: string;
  giorno: number;
  bisogni: Array<{ club: string; ruolo: string; motivo: string }>;
  disponibili: Array<{ nome: string; club: string; ruolo: string; overall: number; eta: number; valore: number }>;
}

/** Contesto per la cronaca di giornata (solo movimenti validi e interessanti, top-5). */
export interface ContestoCronacaMercato {
  finestra: string;
  giorno: number;
  movimenti: Array<{ giocatore: string; da: string; a: string; cifra: number; motivo?: string }>;
}

/** Contesto narrativa prospetto vivaio (i numeri sono dell'engine, l'LLM scrive solo testo). */
export interface ContestoNarrativaProspetto {
  nome: string;
  eta: number;
  nazione: string;
  posizione: string;
  overall: number;
  club: string;
  /** Fascia di potenziale (indizio, mai il numero esatto) */
  potenziale: string;
  /** Es. "rigenerato di [nome ritirato]" oppure "prospetto del vivaio" */
  origine: string;
}

/** Contesto world news: la tua squadra è esclusa, il mondo parla d'altro. */
export interface ContestoMondoNotizie {
  settimana: number;
  stagione: string;
  squadraUtente: string;
  campionatoUtente: string;
  squadreCampionato: string[];
  /** Ultimi risultati della tua lega (per contestualizzare) */
  ultimiRisultati?: string[];
}

/** Override di config per i test della pagina Impostazioni (form corrente). */
type ImpostazioniOverride = Omit<ImpostazioniRecord, 'id'>;

export interface EsitoTestConnessione {
  ok: boolean;
  testo?: string;
  modelloUsato?: string;
  latenzaMs?: number;
  /** Messaggio leggibile per la UI (mai la chiave API nei messaggi). */
  errore?: string;
}

/**
 * Ping di test (pagina Impostazioni): invia un messaggio minimo sul modello
 * narrativo e riporta risposta grezza, latenza e modello usato.
 * Timeout breve (10s) per una UX reattiva.
 */
export async function testaConnessione(impostazioni?: ImpostazioniOverride): Promise<EsitoTestConnessione> {
  return (await servizio(impostazioni)).testaConnessione();
}

/**
 * Test del modello VISIONE (pagina Impostazioni): invia un'immagine di prova
 * generata al volo e chiede cosa raffigura. Verifica che il modello visione
 * configurato accetti davvero immagini (es. mimo-v2.5) e restituisca testo.
 */
export async function testaVisione(immagineBase64: string, impostazioni?: ImpostazioniOverride): Promise<EsitoTestConnessione> {
  return (await servizio(impostazioni)).testaVisione(immagineBase64);
}

export interface EsitoListaModelliUi {
  ok: boolean;
  modelli?: string[];
  latenzaMs?: number;
  errore?: string;
}

/**
 * Elenca i modelli disponibili sul provider configurato (GET /models).
 * Usa le impostazioni del form se fornite (bypassa Dexie, come i test),
 * altrimenti quelle salvate. Ritorna errore leggibile per la UI.
 */
export async function elencaModelliDisponibili(
  impostazioni?: ImpostazioniOverride,
): Promise<EsitoListaModelliUi> {
  return (await servizio(impostazioni)).elencaModelli();
}

export interface ServizioLlm {
  chatCompletions(opzioni: OpzioniChatCompletions): Promise<RispostaChatPubblica | null>;
  generaEventiSettimanali(contesto: ContestoGenerazione): Promise<PropostaEventi | null>;
  generaMondoNotizie(contesto: ContestoMondoNotizie): Promise<PropostaMondo | null>;
  analizzaImmagine(opzioni: { immagineBase64: string; istruzioni: string; maxTokens?: number }): Promise<string | null>;
  analizzaScreenshotReferto(opzioni: {
    immagineBase64: string;
    nomiRosa: string[];
    squadraNome: string;
  }): Promise<EsitoScreenshotVoti>;
  testaConnessione(): Promise<EsitoTestConnessione>;
  testaVisione(immagineBase64: string): Promise<EsitoTestConnessione>;
  elencaModelli(): Promise<EsitoListaModelliUi>;
  generaOffertaInEntrata(contesto: ContestoOffertaInEntrata): Promise<OffertaInEntrata | null>;
  generaRispostaTrattativa(contesto: ContestoRispostaTrattativa): Promise<string | null>;
  generaScenariMercatoCpu(contesto: ContestoScenariMercato): Promise<ScenariMercatoCpu | null>;
  generaCronacaMercato(contesto: ContestoCronacaMercato): Promise<string[] | null>;
  generaNomiIntake(
    richieste: Array<{ id: string; nazione: string; eta: number; ruolo: string; posizione: string }>,
    nomiEsistenti: string[],
  ): Promise<NomiIntake | null>;
  generaNarrativaProspetto(contesto: ContestoNarrativaProspetto): Promise<ProspettoNarrativa | null>;
}

/**
 * Fabbrica del servizio: fetchImpl iniettabile per i test offline
 * (scripts/verify-llm.ts, nessuna chiave API richiesta).
 */
export function creaServizioLlm(fetchImpl: typeof fetch = fetch, getImpostazioni: () => Promise<ImpostazioniRecord> = impostazioniLlm): ServizioLlm {
  const client = creaLlmClient(fetchImpl, getImpostazioni);
  return {
    async chatCompletions(opzioni): Promise<RispostaChatPubblica | null> {
      const esito = await client.chat(opzioni);
      if (esito.esito !== 'ok') return null;
      return { testo: esito.testo, modelloUsato: esito.modelloUsato, latenzaMs: esito.latenzaMs };
    },

    async generaEventiSettimanali(contesto): Promise<PropostaEventi | null> {
      const messaggi = costruisciMessaggiEventi(contesto);

      const primo = await client.chat({ ruolo: 'narrativo', messaggi, responseSchema: SCHEMA_EVENTI_JSON, maxTokens: MAX_TOKEN_EVENTI });
      if (primo.esito !== 'ok') return null;

      const wire = estraiJson(primo.testo);
      if (validaPropostaEventiWire(wire)) return daWirePropostaEventi(wire);

      // JSON invalido: un solo retry in prompt-mode, ma solo se il primo tentativo
      // usava lo schema (se era già prompt-mode dopo un 4xx, niente terza chiamata).
      if (!primo.conSchema) return null;
      const secondo = await client.chat({ ruolo: 'narrativo', messaggi, responseSchema: null, maxTokens: MAX_TOKEN_EVENTI });
      if (secondo.esito !== 'ok') return null;
      const wire2 = estraiJson(secondo.testo);
      if (validaPropostaEventiWire(wire2)) return daWirePropostaEventi(wire2);
      return null;
    },

    async analizzaImmagine(opzioni): Promise<string | null> {
      const messaggi: MessaggioChat[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: opzioni.istruzioni },
            { type: 'image_url', image_url: { url: opzioni.immagineBase64 } },
          ],
        },
      ];
      const esito = await client.chat({ ruolo: 'visione', messaggi, maxTokens: opzioni.maxTokens ?? 1024 });
      return esito.esito === 'ok' ? esito.testo : null;
    },

    async analizzaScreenshotReferto(opzioni): Promise<EsitoScreenshotVoti> {
      const messaggi = costruisciMessaggiScreenshot(opzioni);
      // Timeout lungo (60s) e token abbondanti (4096): i modelli reasoning
      // (MiMo) consumano token nel ragionamento e devono avere margine per
      // il JSON finale, altrimenti la risposta arriva troncata/illeggibile.
      const chiama = (): Promise<EsitoChat> =>
        client.chat({ ruolo: 'visione', messaggi, responseSchema: SCHEMA_SCREENSHOT_VOTI, maxTokens: 4096, timeoutMs: 60_000 });

      // Primo tentativo + un solo retry sui guasti di rete (transitori).
      let primo = await chiama();
      if (primo.esito === 'rete') primo = await chiama();
      if (primo.esito !== 'ok') {
        return { esito: 'errore_llm', dettaglio: dettaglioErroreLlm(primo) };
      }

      const wire = estraiJson(primo.testo);
      let normalizzato = normalizzaWireVoti(wire);
      // Fallback tollerante: se il JSON è troncato o sporco ma contiene coppie
      // complete {nome, voto}, le estrae comunque (leggi il massimo possibile).
      if (!normalizzato) normalizzato = estraiVotiConRegex(primo.testo);
      if (normalizzato && validaScreenshotVotiWire(normalizzato)) {
        return { esito: 'ok', dati: daWireScreenshotVoti(normalizzato), modelloUsato: primo.modelloUsato };
      }

      // JSON invalido: un solo retry in prompt-mode (stessa logica degli eventi).
      if (!primo.conSchema) {
        console.warn('FLM: risposta visione illeggibile (modello ' + primo.modelloUsato + '):', primo.testo.slice(0, 1000));
        return { esito: 'non_legibile', modello: primo.modelloUsato, testo: primo.testo.slice(0, 600) };
      }
      const secondo = await client.chat({ ruolo: 'visione', messaggi, responseSchema: null, maxTokens: 4096, timeoutMs: 60_000 });
      if (secondo.esito !== 'ok') {
        return { esito: 'errore_llm', dettaglio: dettaglioErroreLlm(secondo) };
      }
      const wire2 = estraiJson(secondo.testo);
      let normalizzato2 = normalizzaWireVoti(wire2);
      if (!normalizzato2) normalizzato2 = estraiVotiConRegex(secondo.testo);
      if (normalizzato2 && validaScreenshotVotiWire(normalizzato2)) {
        return { esito: 'ok', dati: daWireScreenshotVoti(normalizzato2), modelloUsato: secondo.modelloUsato };
      }
      console.warn('FLM: risposta visione illeggibile (modello ' + secondo.modelloUsato + '):', secondo.testo.slice(0, 1000));
      return { esito: 'non_legibile', modello: secondo.modelloUsato, testo: secondo.testo.slice(0, 600) };
    },

    async testaConnessione(): Promise<EsitoTestConnessione> {
      const impostazioni = await impostazioniLlm();
      if (!impostazioni.llmAttivo || impostazioni.apiKey.trim() === '') {
        return { ok: false, errore: 'LLM disattivo o chiave API mancante: salva le impostazioni prima del test.' };
      }
      const esito = await client.chat({
        ruolo: 'narrativo',
        messaggi: [{ role: 'user', content: 'ping' }],
        // Budget ampio: mimo-v2.5 (e altri modelli reasoning) consumano token
        // sulla parte di ragionamento prima di emettere `content`; con pochi
        // token restituiscono content:null e finish_reason=length.
        maxTokens: 512,
        timeoutMs: 20_000,
      });
      switch (esito.esito) {
        case 'ok':
          return { ok: true, testo: esito.testo, modelloUsato: esito.modelloUsato, latenzaMs: esito.latenzaMs };
        case 'non_configurato':
          return { ok: false, errore: 'LLM disattivo o chiave API mancante: salva le impostazioni prima del test.' };
        case 'rete':
          return {
            ok: false,
            errore: esito.timeout
              ? 'Timeout: nessuna risposta in 10 secondi. Controlla rete o base URL.'
              : 'Errore di rete: endpoint irraggiungibile o CORS bloccato. Se il base URL è assoluto e il provider non supporta CORS browser (es. Opencode Go), usa il proxy di sviluppo: base URL che inizia con / (es. /zen/go/v1).',
          };
        case 'http': {
          const extra = esito.body ? ` — ${esito.body.slice(0, 280)}` : '';
          if (esito.status === 401 || esito.status === 403) {
            return { ok: false, errore: `HTTP ${esito.status}: chiave API non valida o senza permessi.${extra}` };
          }
          if (esito.status === 404) {
            return { ok: false, errore: `HTTP 404: base URL non valido (${impostazioni.baseUrl}).${extra}` };
          }
          return { ok: false, errore: `HTTP ${esito.status}: il provider ha rifiutato la richiesta.${extra}` };
        }
        case 'non_json':
          return {
            ok: false,
            errore: esito.status === 200
              ? 'Risposta non JSON: il proxy di sviluppo non è attivo. Riavvia completamente npm run dev (le modifiche a vite.config.ts richiedono il restart) e riprova.'
              : `Risposta non JSON (HTTP ${esito.status}): l'endpoint non è OpenAI-compatible o il proxy non è attivo.`,
          };
      }
    },

    async testaVisione(immagineBase64): Promise<EsitoTestConnessione> {
      const impostazioni = await impostazioniLlm();
      if (!impostazioni.llmAttivo || impostazioni.apiKey.trim() === '') {
        return { ok: false, errore: 'LLM disattivo o chiave API mancante: salva le impostazioni prima del test.' };
      }
      const esito = await client.chat({
        ruolo: 'visione',
        messaggi: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Questa è un\'immagine di prova. Rispondi con una sola parola: cosa rappresenta il numero grande disegnato al centro?',
              },
              { type: 'image_url', image_url: { url: immagineBase64 } },
            ],
          },
        ],
        // Budget ampio: i modelli reasoning (mimo, muse, ecc.) consumano token nel pensiero
        // prima di emettere content; con pochi token torna content=null e il test fallisce.
        maxTokens: 1024,
        timeoutMs: 40_000,
      });
      switch (esito.esito) {
        case 'ok':
          return { ok: true, testo: esito.testo, modelloUsato: esito.modelloUsato, latenzaMs: esito.latenzaMs };
        case 'non_configurato':
          return { ok: false, errore: 'LLM disattivo o chiave API mancante: salva le impostazioni prima del test.' };
        case 'rete':
          return {
            ok: false,
            errore: esito.timeout
              ? 'Timeout: nessuna risposta in 40s dal modello visione. Riprova: i modelli reasoning/visione sono più lenti.'
              : esito.cors
                ? 'Blocco di rete (probabile CORS): con Opencode usa un base URL relativo: /zen/go/v1 (Go) o /zen/v1 (Zen free) — proxy di sviluppo.'
                : 'Errore di rete: endpoint irraggiungibile.',
          };
        case 'http': {
          const extra = esito.body ? ` — ${esito.body.slice(0, 320)}` : '';
          if (esito.status === 400 || esito.status === 422) {
            // Molti provider rispondono 400 se il modello è text-only e riceve image_url:
            // il body contiene "does not support vision" o "invalid image". Lo mostriamo.
            const hint = /vision|image|support|multimodal/i.test(esito.body ?? '')
              ? ` Il modello (${impostazioni.modelloVisione}) sembra non supportare immagini. Usa un modello multimodale (mimo-v2.5, mimo-v2.5-free, gpt-4o, gemini, ecc.). Puoi comunque salvarlo: il gioco userà il fallback OCR se la visione fallisce.`
              : ` Verifica nome modello e base URL.${extra}`;
            return { ok: false, errore: `HTTP ${esito.status}: il modello visione ha rifiutato la richiesta.${hint}${extra && !/vision/i.test(esito.body ?? '') ? '' : ''}` };
          }
          if (esito.status === 401 || esito.status === 403) {
            return { ok: false, errore: `HTTP ${esito.status}: chiave API non valida o senza permessi.${extra}` };
          }
          if (esito.status === 404) {
            return { ok: false, errore: `HTTP 404: modello visione non trovato (${impostazioni.modelloVisione}). Verifica nome esatto nella lista modelli.${extra}` };
          }
          return { ok: false, errore: `HTTP ${esito.status}: il provider ha rifiutato la richiesta.${extra}` };
        }
        case 'non_json':
          return { ok: false, errore: 'Risposta non JSON dal provider (proxy non attivo?).' };
      }
    },

    async generaOffertaInEntrata(contesto): Promise<OffertaInEntrata | null> {
      const messaggi = costruisciMessaggiOffertaInEntrata(contesto);
      const esito = await chiamaConSchemaRaw(client, messaggi, SCHEMA_OFFERTA_IN_ENTRATA, validaOffertaInEntrataWire);
      return esito === null ? null : daWireOffertaInEntrata(esito);
    },

    async generaRispostaTrattativa(contesto): Promise<string | null> {
      const messaggi = costruisciMessaggiRispostaTrattativa(contesto);
      const esito = await chiamaConSchemaRaw(client, messaggi, SCHEMA_RISPOSTA_TRATTATIVA, validaRispostaTrattativaWire);
      return esito?.testo ?? null;
    },

    async generaScenariMercatoCpu(contesto): Promise<ScenariMercatoCpu | null> {
      const messaggi = costruisciMessaggiScenariMercato(contesto);
      const esito = await chiamaConSchemaRaw(client, messaggi, SCHEMA_SCENARI_MERCATO_CPU, validaScenariMercatoCpuWire);
      return esito === null ? null : daWireScenariMercatoCpu(esito);
    },

    async generaCronacaMercato(contesto): Promise<string[] | null> {
      const messaggi = costruisciMessaggiCronacaMercato(contesto);
      const esito = await chiamaConSchemaRaw(client, messaggi, SCHEMA_CRONACA_MERCATO, validaCronacaMercatoWire);
      return esito?.notizie ?? null;
    },

    async generaNomiIntake(richieste, nomiEsistenti): Promise<NomiIntake | null> {
      const CHUNK = 150;
      const risultati = new Map<string, string>();
      for (let inizio = 0; inizio < richieste.length; inizio += CHUNK) {
        const fetta = richieste.slice(inizio, inizio + CHUNK);
        const messaggi = costruisciMessaggiNomiIntake(fetta, nomiEsistenti);
        const esito = await chiamaConSchemaRaw(client, messaggi, SCHEMA_NOMI_INTAKE, validaNomiIntakeWire, 4096);
        if (esito === null) return null; // all-or-nothing (decisione utente)
        for (const g of esito.giocatori) risultati.set(g.id, g.nome);
      }
      if (risultati.size !== richieste.length) return null;
      return { giocatori: richieste.map((r) => ({ id: r.id, nome: risultati.get(r.id) ?? '' })).filter((g) => g.nome !== '') };
    },

    async generaNarrativaProspetto(contesto): Promise<ProspettoNarrativa | null> {
      const messaggi = costruisciMessaggiNarrativaProspetto(contesto);
      const esito = await chiamaConSchemaRaw(client, messaggi, SCHEMA_PROSPETTO_NARRATIVA, validaProspettoNarrativaWire);
      return esito === null ? null : daWireProspettoNarrativa(esito);
    },

    async generaMondoNotizie(contesto): Promise<PropostaMondo | null> {
      const messaggi = costruisciMessaggiMondo(contesto);
      const esito = await chiamaConSchemaRaw(client, messaggi, SCHEMA_MONDO_NOTIZIE, validaPropostaMondoWire, 2048);
      return esito === null ? null : daWirePropostaMondo(esito);
    },

    async elencaModelli(): Promise<EsitoListaModelliUi> {
      const esito = await client.elencaModelli();
      switch (esito.esito) {
        case 'ok':
          return { ok: true, modelli: esito.modelli, latenzaMs: esito.latenzaMs };
        case 'non_configurato':
          return { ok: false, errore: 'LLM disattivo o chiave mancante: imposta base URL e chiave prima di listare i modelli.' };
        case 'rete':
          return {
            ok: false,
            errore: esito.timeout
              ? 'Timeout lista modelli: nessuna risposta in 15s.'
              : esito.cors
                ? 'Blocco rete (CORS): con Opencode usa base URL relativo /zen/go/v1 o /zen/v1 (proxy dev).'
                : 'Errore rete: endpoint irraggiungibile.',
          };
        case 'http':
          if (esito.status === 401 || esito.status === 403) return { ok: false, errore: `HTTP ${esito.status}: chiave non valida.` };
          if (esito.status === 404) return { ok: false, errore: 'HTTP 404: endpoint /models non trovato su questo provider.' };
          return { ok: false, errore: `HTTP ${esito.status}: provider rifiuta lista modelli.` };
        case 'non_json':
          return { ok: false, errore: 'Risposta non JSON su /models (proxy non attivo?).' };
      }
    },
  };
}

// Istanza di default per l'app (fetch reale). Lo stato resta condiviso:
// un solo client, le impostazioni si leggono a ogni chiamata.
// Se si passa un override (form della pagina Impostazioni), si crea un
// servizio dedicato che usa quella config invece di quella salvata in Dexie.
let servizioSingleton: ServizioLlm | null = null;
function servizio(override?: ImpostazioniOverride): ServizioLlm {
  if (override) return creaServizioLlm(fetch, () => Promise.resolve(override as ImpostazioniRecord));
  servizioSingleton ??= creaServizioLlm();
  return servizioSingleton;
}

// ---------------------------------------------------------------------------
// Costruzione prompt (PRD 4.1/4.2: stato sintetico in JSON + vincoli nel prompt)
// ---------------------------------------------------------------------------

function costruisciMessaggiEventi(contesto: ContestoGenerazione): MessaggioChat[] {
  const stato = {
    settimana: contesto.settimana,
    posizione_classifica: contesto.posizioneClassifica,
    ultime_partite: contesto.ultimePartite,
    giocatori_morale_basso: contesto.giocatoriMoraleBasso,
    morale_spogliatoio: contesto.moraleSpogliatoio ?? null,
    promesse_in_scadenza: contesto.promesseInScadenza,
    fiducia_societa: contesto.fiduciaSocieta,
    ultimi_eventi_gia_usati: contesto.ultimiEventi,
    categorie_richieste: contesto.categorieRichieste ?? [],
    giocatori_disponibili: contesto.candidati ?? [],
    fase_stagione: contesto.faseStagione ?? 'lotta',
  };
  return [
    {
      role: 'system',
      content:
        'Sei il direttore narrativo di una carriera da allenatore di calcio. ' +
        'Ricevi lo stato della stagione in JSON e generi: (1) eventi realistici della settimana, ' +
        'ispirati a situazioni realmente accadute nel calcio moderno (casi veri di mercato, spogliatoio, ' +
        'società, trattative, infortuni), scelti tra le categorie indicate, coerenti con lo stato ' +
        '(non inventare giocatori o squadre non presenti; non ripetere eventi simili a quelli nell\'archivio fornito); ' +
        'ogni evento ha 2-4 opzioni di risposta con effetti proposti piccoli (tra -10 e +10); ' +
        '(2) 2-3 brevi notizie di cronaca sul turno appena giocato. ' +
        'PRIMA DI OGNI EVENTO FAI QUESTA VERIFICA DI REALISMO: chiediti "è effettivamente realistico ' +
        'che questo evento accada ORA, con questa classifica, questo morale, questa fiducia, questa ' +
        'fase di stagione e questi risultati?" Se la risposta è NO, OMETTI l\'evento: meglio meno ' +
        'eventi che eventi inverosimili. Non inventare mai per riempire una categoria. ' +
        'Le categorie società e tifosi/media sono riservate a situazioni estreme (crisi di fiducia, ' +
        'strisce negative, sprint finale, tensioni reali): non proporle in contesti tranquilli. ' +
        'Le richieste di cessione sono realistiche soprattutto nelle finestre di mercato (inizio ' +
        'stagione e gennaio): fuori da quelle servono motivazioni forti (panchina prolungata, rottura). ' +
        'VINCOLI: genera AL MASSIMO un evento per ognuna delle categorie_richieste; ' +
        'se un evento coinvolge giocatori, usa SOLO i nomi da giocatori_disponibili (sono i soli ' +
        'che esistono nella rosa) e nessun altro nome; le situazioni reali elencate sotto sono ' +
        'SOLO ispirazione per il tipo di situazione: MAI usare i nomi reali o i club reali che le ' +
        'hanno vissute, adatta sempre alla tua rosa e al tuo stato. ' +
        'INFORTUNI: se l\'evento descrive un infortunio NUOVO e specifico di un giocatore (es. in ' +
        'allenamento o fuori dal campo), dichiaralo in effetti_fisici come [{giocatore, settimane}] ' +
        '(1-4 settimane): il motore lo applicherà DAVVERO alla rosa. Non usare effetti_fisici per ' +
        'infortuni passati, rientri o timori ipotetici: solo fatti nuovi e concreti. ' +
        'Tono da cronaca sportiva italiana, concreto, mai enfatico. ' +
        'Rispondi SOLO con un singolo oggetto JSON valido, senza testo aggiuntivo, con chiavi esattamente: ' +
        'eventi (array di oggetti {categoria, tipo, titolo, testo, giocatori_coinvolti, effetti_fisici, opzioni}) e ' +
        'notizie (array di stringhe); ogni opzione ha {testo, effetti_proposti} con effetti_proposti = ' +
        '{morale_giocatori, fiducia_giocatori, fiducia_societa, fiducia_tifosi, reputazione} (interi).',
    },
    {
      role: 'user',
      content:
        `Stato della stagione:\n${JSON.stringify(stato, null, 2)}\n\n` +
        `Situazioni reali di riferimento (solo ispirazione, MAI nomi reali):\n${(contesto.casiReali ?? []).join('\n')}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Costruzione prompt screenshot referto (PRD 7.4)
// ---------------------------------------------------------------------------

function costruisciMessaggiScreenshot(opzioni: {
  immagineBase64: string;
  nomiRosa: string[];
  squadraNome: string;
}): MessaggioChat[] {
  const rosa = opzioni.nomiRosa.length > 0 ? opzioni.nomiRosa.join('\n') : '(nessun nome disponibile)';
  const istruzioni =
    `Sei un OCR preciso per screenshot del calcio (PES/FL26).\n` +
    `La schermata è quella delle PAGELLE (voti) post-partita della squadra "${opzioni.squadraNome}": una tabella con i giocatori e il loro voto (scala 4.0-10.0, in genere passi di 0.5, es. 6.5).\n` +
    `Estrai TUTTI i giocatori visibili della squadra "${opzioni.squadraNome}" con il loro voto. I giocatori della squadra avversaria vanno IGNORATI.\n` +
    `VINCOLO NOMI: i nomi DEVONO essere scelti VERBATIM dalla lista della rosa qui sotto. Se un nome non è in lista, OMETTI la riga (non inventare, non approssimare).\n` +
    `Il voto va scritto come NUMERO nel JSON (non come stringa): usa il punto decimale (6.5), anche se nello screenshot vedi la virgola (6,5).\n` +
    `Rispondi SOLO con un oggetto JSON valido con chiavi esattamente: giocatori (array di {nome, voto}).\n\n` +
    `Rosa di "${opzioni.squadraNome}":\n${rosa}`;
  return [
    {
      role: 'user',
      content: [
        { type: 'text', text: istruzioni },
        { type: 'image_url', image_url: { url: opzioni.immagineBase64 } },
      ],
    },
  ];
}

/**
 * Normalizza la risposta grezza del modello in ScreenshotVotiWire tollerante:
 * - accetta anche una radice ARRAY ({"giocatori": [...]} implicito)
 * - voto numerico O stringa ("6,5" o "6.5": virgola decimale italiana)
 * - scarta righe senza nome o con voto non interpretabile
 * Ritorna null se non c'è alcuna struttura di voti.
 */
function normalizzaWireVoti(dato: unknown): ScreenshotVotiWire | null {
  let radice: unknown = dato;
  if (Array.isArray(radice)) radice = { giocatori: radice };
  if (typeof radice !== 'object' || radice === null) return null;
  const lista = (radice as Record<string, unknown>).giocatori;
  if (!Array.isArray(lista)) return null;
  const giocatori: Array<{ nome: string; voto: number }> = [];
  for (const item of lista) {
    if (typeof item !== 'object' || item === null) continue;
    const g = item as Record<string, unknown>;
    if (typeof g.nome !== 'string' || g.nome.trim() === '') continue;
    const voto = typeof g.voto === 'number' ? g.voto : typeof g.voto === 'string' ? Number(g.voto.replace(',', '.')) : NaN;
    if (!Number.isFinite(voto)) continue;
    giocatori.push({ nome: g.nome.trim(), voto });
  }
  return giocatori.length > 0 ? { giocatori } : null;
}

/**
 * Fallback ultimo per risposte JSON troncate o sporche: estrae dal testo
 * tutte le coppie complete {nome, voto} con una regex tollerante (spazi,
 * ordine nome→voto, numeri decimali). Non richiede JSON valido: basta che
 * le singole coppie siano integre. Ritorna null se non trova nulla.
 */
function estraiVotiConRegex(testo: string): ScreenshotVotiWire | null {
  if (!testo) return null;
  const giocatori: Array<{ nome: string; voto: number }> = [];
  const re = /\{\s*["']?nome["']?\s*:\s*["']([^"']{1,60})["']\s*,\s*["']?voto["']?\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(testo)) !== null) {
    const nome = m[1]?.trim();
    const voto = Number(m[2]);
    if (nome && Number.isFinite(voto)) giocatori.push({ nome, voto });
  }
  return giocatori.length > 0 ? { giocatori } : null;
}

/** Traduce un esito di rete/HTTP in un dettaglio leggibile per la UI. */
function dettaglioErroreLlm(esito: EsitoChat): string {
  switch (esito.esito) {
    case 'non_configurato':
      return 'LLM non configurato: salva chiave API e modello in Impostazioni.';
    case 'rete':
      return esito.timeout
        ? 'Timeout: nessuna risposta dal provider entro il limite di attesa. Con immagini grandi può servire più tempo: riprova.'
        : esito.cors
          ? 'Blocco di rete (probabile CORS): con Opencode Go usa il base URL relativo /zen/go/v1 (proxy di sviluppo), oppure un provider con CORS abilitato. Verifica in Impostazioni → Test connessione.'
          : 'Errore di rete: endpoint irraggiungibile. Verifica che il server di sviluppo sia attivo e la connessione internet funzioni.';
    case 'http': {
      const extra = (esito as { body?: string }).body ? ` — ${(esito as { body?: string }).body!.slice(0, 300)}` : '';
      return esito.status === 0
        ? 'Il provider ha rifiutato lo schema JSON.'
        : `HTTP ${esito.status}: il provider ha rifiutato la richiesta.${extra}`;
    }
    case 'non_json':
      return 'Risposta non JSON dal provider.';
    default:
      return 'Errore sconosciuto.';
  }
}

// ---------------------------------------------------------------------------
// Helper mercato (schema-chat con retry prompt-mode, come generaEventiSettimanali)
// ---------------------------------------------------------------------------

/** Esito generico da schema-chat: il tipo wire validato (o null). */
async function chiamaConSchemaRaw<W>(
  client: import('./client').LlmHttpClient,
  messaggi: MessaggioChat[],
  responseSchema: ResponseSchema,
  valida: (dato: unknown) => dato is W,
  maxTokens = 1024,
): Promise<W | null> {
  const primo = await client.chat({ ruolo: 'narrativo', messaggi, responseSchema, maxTokens });
  if (primo.esito !== 'ok') return null;
  const wire = estraiJson(primo.testo);
  if (valida(wire)) return wire;
  if (!primo.conSchema) return null;
  const secondo = await client.chat({ ruolo: 'narrativo', messaggi, responseSchema: null, maxTokens });
  if (secondo.esito !== 'ok') return null;
  const wire2 = estraiJson(secondo.testo);
  if (valida(wire2)) return wire2;
  return null;
}

// ---------------------------------------------------------------------------
// Costruzione prompt mercato (PRD 7.3: stato strutturato, l'LLM scrive solo testo)
// ---------------------------------------------------------------------------

function costruisciMessaggiOffertaInEntrata(contesto: ContestoOffertaInEntrata): MessaggioChat[] {
  return [
    {
      role: 'system',
      content:
        'Sei il direttore sportivo di un club di calcio. Scrivi una MAIL formale ma ' +
        'concreta all\'allenatore di un altro club per fare un\'offerta per un suo giocatore. ' +
        'Tono da cronaca sportiva italiana, concreto, mai enfatico. La cifra e i dati del ' +
        'giocatore sono GIA\' DECISI: usali esattamente, non inventarne di nuovi. ' +
        'La motivazione deve essere tecnica e realistica (bisogno di reparto, profilo che ' +
        'manca in rosa). Rispondi SOLO con un oggetto JSON valido con chiavi esattamente: ' +
        'oggetto (stringa), testo (stringa).',
    },
    {
      role: 'user',
      content: `Offerta per il giocatore:\n${JSON.stringify(contesto, null, 2)}`,
    },
  ];
}

function costruisciMessaggiRispostaTrattativa(contesto: ContestoRispostaTrattativa): MessaggioChat[] {
  return [
    {
      role: 'system',
      content:
        'Sei il direttore sportivo di un club di calcio in trattativa con un altro club. ' +
        'Rispondi alla mossa dell\'allenatore avversario con una mail breve e realistica. ' +
        'Le cifre e l\'esito sono GIA\' DECISI (esito: accettata, controproposta, final_offer, rifiuto): ' +
        'usali esattamente. Se è una controproposta, la cifra è quella indicata; se è una ' +
        'final_offer, il tono è definitivo ("prendere o lasciare"); se accettata, chiudi con ' +
        'frasi da accordo. Tono da cronaca sportiva italiana, concreto, mai enfatico. ' +
        'Rispondi SOLO con un oggetto JSON valido con chiave esattamente: testo (stringa).',
    },
    {
      role: 'user',
      content: `Stato della trattativa:\n${JSON.stringify(contesto, null, 2)}`,
    },
  ];
}

function costruisciMessaggiScenariMercato(contesto: ContestoScenariMercato): MessaggioChat[] {
  return [
    {
      role: 'system',
      content:
        'Sei il direttore di un mercato di calcio europeo. Ti vengono dati i bisogni dei ' +
        'club e i giocatori disponibili con valore di mercato. Proponi 1-3 trasferimenti ' +
        'PLAUSIBILI che soddisfino i bisogni: usa SOLO nomi di giocatori e club presenti ' +
        'nelle liste (nessuna invenzione), cifre vicine al valore di mercato (mai oltre ' +
        '1.5x, mai sotto 0.5x). Ogni movimento ha una motivazione tecnica breve. ' +
        'Rispondi SOLO con un oggetto JSON valido con chiave esattamente: movimenti ' +
        '(array di {giocatore, da, a, cifra, motivo}).',
    },
    {
      role: 'user',
      content: `Finestra ${contesto.finestra}, giorno ${contesto.giorno}:\n${JSON.stringify(
        { bisogni: contesto.bisogni.slice(0, 25), disponibili: contesto.disponibili.slice(0, 40) },
        null,
        2,
      )}`,
    },
  ];
}

function costruisciMessaggiCronacaMercato(contesto: ContestoCronacaMercato): MessaggioChat[] {
  return [
    {
      role: 'system',
      content:
        'Sei un giornalista di calciomercato. Scrivi 2-4 brevi notizie di cronaca di ' +
        'mercato (una riga ciascuna, tono da gazzetta sportiva italiana, concreto) sui ' +
        'movimenti del giorno che ti vengono dati. Usa SOLO i movimenti in lista, con le ' +
        'cifre esatte. Non inventare nulla. Rispondi SOLO con un oggetto JSON valido con ' +
        'chiave esattamente: notizie (array di stringhe).',
    },
    {
      role: 'user',
      content: `Finestra ${contesto.finestra}, giorno ${contesto.giorno}:\n${JSON.stringify(contesto.movimenti, null, 2)}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Costruzione prompt vivaio (PRD 7.5: nomi SOLO LLM, narrativa solo testo)
// ---------------------------------------------------------------------------

function costruisciMessaggiNomiIntake(
  richieste: Array<{ id: string; nazione: string; eta: number; ruolo: string; posizione: string }>,
  nomiEsistenti: string[],
): MessaggioChat[] {
  const campione = nomiEsistenti.slice(-400);
  return [
    {
      role: 'system',
      content:
        'Sei uno scopritore di talenti del calcio mondiale. Ti vengono dati i nuovi ' +
        'giocatori del vivaio di una stagione: per ognuno devi INVENTARE un nome e un ' +
        'cognome (nome completo, formato "Nome Cognome") che sia: ' +
        '(1) coerente con la nazionalità indicata (un brasiliano suona brasiliano, un ' +
        'giapponese suona giapponese); (2) originale e vario: mai uguale o troppo simile ' +
        'ai nomi nella lista dei nomi già esistenti; (3) plausibile come nome di persona ' +
        'reale, niente nomi buffi o inventati di sana pianta (combina nomi e cognomi ' +
        'comuni di quel paese). Ogni nome deve essere unico nella risposta. ' +
        'Non usare nomi di calciatori famosi. ' +
        'Rispondi SOLO con un oggetto JSON valido con chiavi esattamente: giocatori ' +
        '(array di {id, nome}), con UN ELEMENTO PER OGNI id ricevuto, nello stesso ordine.',
    },
    {
      role: 'user',
      content:
        `Nuovi giocatori (id, nazione, età, posizione):\n${JSON.stringify(
          richieste.map((r) => ({ id: r.id, nazione: r.nazione, eta: r.eta, posizione: r.posizione })),
          null,
          2,
        )}\n\n` +
        `Nomi già esistenti nel mondo (evita ripetizioni e somiglianze):\n${campione.join('\n')}`,
    },
  ];
}

function costruisciMessaggiNarrativaProspetto(contesto: ContestoNarrativaProspetto): MessaggioChat[] {
  return [
    {
      role: 'system',
      content:
        'Sei il capo osservatore del settore giovanile di un club di calcio. Scrivi per ' +
        'il nuovo prospetto: (1) mini_storia: una breve storia realistica del ragazzo ' +
        '(da dove arriva, come è cresciuto, un aneddoto calcistico credibile, ispirata a ' +
        'storie vere di giovani calciatori ma mai copiata); (2) parere_scout: la tua ' +
        'valutazione tecnica con pregi e dubbi, concreta e senza enfasi, tono da cronaca ' +
        'sportiva italiana. I dati (nome, età, nazione, posizione, overall, potenziale) ' +
        'sono GIA\' DECISI: usali esattamente, non inventarne di nuovi; il potenziale è una ' +
        'fascia (es. "alto", "medio"), mai un numero. Rispondi SOLO con un oggetto JSON ' +
        'valido con chiavi esattamente: mini_storia (stringa), parere_scout (stringa).',
    },
    {
      role: 'user',
      content: `Prospetto del vivaio:\n${JSON.stringify(contesto, null, 2)}`,
    },
  ];
}

function costruisciMessaggiMondo(contesto: ContestoMondoNotizie): MessaggioChat[] {
  return [
    {
      role: 'system',
      content:
        'Sei un giornalista sportivo italiano che scrive per X (Twitter). Generi 3-4 NOTIZIE DAL MONDO calcistico FUORI dalla squadra utente: mai nominare la squadra utente. ' +
        'Categorie: performance (tripletta, parate), derby (risultato big match), infortunio (stop lungo), sorteggio (Champions/Coppa), mercato (trasferimento CPU). ' +
        'Ogni notizia è un POST X realistico ma che narra una storia: titolo breve (headline), estratto (tweet 220-260 char che stuzzica), corpo (2 paragrafi narrativi: cronaca + contesto/classifica/reazioni, tono Gazzetta, concreto, mai enfatico), autore (nome + handle X credibile). ' +
        'VINCOLI: squadra e giocatore possono essere inventati ma PLAUSIBILI (club reali europei, giocatori credibili); non usare la squadra utente; varia le leghe (Serie A, Premier, La Liga, Bundesliga, Ligue 1); un infortunio deve avere durata realistica; un mercato deve avere cifra coerente (10-90M). ' +
        'Rispondi SOLO con oggetto JSON valido: { notizie: array di {categoria, titolo, estratto, corpo, autore_nome, autore_handle, squadra?, giocatore?} }.',
    },
    {
      role: 'user',
      content: `Contesto stagione: settimana ${contesto.settimana}, stagione ${contesto.stagione}, squadra utente ${contesto.squadraUtente} (${contesto.campionatoUtente}), squadre del campionato: ${contesto.squadreCampionato.join(', ')}${contesto.ultimiRisultati?.length ? `\nUltimi risultati lega: ${contesto.ultimiRisultati.join(' | ')}` : ''}`,
    },
  ];
}
