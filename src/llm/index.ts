// FLM — Servizio LLM (regola 2 AGENTS.md)
// Le chiamate a API LLM vivono SOLO in questo modulo; il resto dell'app
// usa esclusivamente le funzioni esposte qui. Provider-agnostic (PRD 4.5/7.8):
// base URL + chiave + modelli da impostazioni (src/db), mai hardcoded.
//
// Regola 3 AGENTS.md: l'LLM produce SOLO proposte — qui si valida la forma
// (schema PRD 4.2); la semantica (giocatori esistenti, clamp degli effetti,
// anti-ripetizione) è dell'engine. Ogni funzione ritorna null in caso di
// errore: il chiamante ha sempre un fallback offline (PRD 4.6).

import { creaLlmClient, type MessaggioChat, type ResponseSchema, type RispostaChatPubblica, type RuoloModello } from './client';
import { SCHEMA_EVENTI_JSON, daWirePropostaEventi, estraiJson, validaPropostaEventiWire, type PropostaEventi } from './schema';
import { impostazioniLlm } from '../db/impostazioni';

export type { PropostaEventi } from './schema';
export type { EsitoChat, MessaggioChat, ResponseSchema, RuoloModello } from './client';

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
export async function testaConnessione(): Promise<EsitoTestConnessione> {
  return (await servizio()).testaConnessione();
}

export interface ServizioLlm {
  chatCompletions(opzioni: OpzioniChatCompletions): Promise<RispostaChatPubblica | null>;
  generaEventiSettimanali(contesto: ContestoGenerazione): Promise<PropostaEventi | null>;
  analizzaImmagine(opzioni: { immagineBase64: string; istruzioni: string; maxTokens?: number }): Promise<string | null>;
  testaConnessione(): Promise<EsitoTestConnessione>;
}

/**
 * Fabbrica del servizio: fetchImpl iniettabile per i test offline
 * (scripts/verify-llm.ts, nessuna chiave API richiesta).
 */
export function creaServizioLlm(fetchImpl: typeof fetch = fetch): ServizioLlm {
  const client = creaLlmClient(fetchImpl);
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

    async testaConnessione(): Promise<EsitoTestConnessione> {
      const impostazioni = await impostazioniLlm();
      if (!impostazioni.llmAttivo || impostazioni.apiKey.trim() === '') {
        return { ok: false, errore: 'LLM disattivo o chiave API mancante: salva le impostazioni prima del test.' };
      }
      const esito = await client.chat({
        ruolo: 'narrativo',
        messaggi: [{ role: 'user', content: 'ping' }],
        maxTokens: 16,
        timeoutMs: 10_000,
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
        case 'http':
          if (esito.status === 401 || esito.status === 403) {
            return { ok: false, errore: `HTTP ${esito.status}: chiave API non valida o senza permessi.` };
          }
          if (esito.status === 404) {
            return { ok: false, errore: `HTTP 404: base URL non valido (${impostazioni.baseUrl}).` };
          }
          return { ok: false, errore: `HTTP ${esito.status}: il provider ha rifiutato la richiesta.` };
        case 'non_json':
          return {
            ok: false,
            errore: esito.status === 200
              ? 'Risposta non JSON: il proxy di sviluppo non è attivo. Riavvia completamente npm run dev (le modifiche a vite.config.ts richiedono il restart) e riprova.'
              : `Risposta non JSON (HTTP ${esito.status}): l'endpoint non è OpenAI-compatible o il proxy non è attivo.`,
          };
      }
    },
  };
}

// Istanza di default per l'app (fetch reale). Lo stato resta condiviso:
// un solo client, le impostazioni si leggono a ogni chiamata.
let servizioSingleton: ServizioLlm | null = null;
function servizio(): ServizioLlm {
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
        '{morale_giocatori, fiducia_societa, fiducia_tifosi, reputazione} (interi).',
    },
    {
      role: 'user',
      content:
        `Stato della stagione:\n${JSON.stringify(stato, null, 2)}\n\n` +
        `Situazioni reali di riferimento (solo ispirazione, MAI nomi reali):\n${(contesto.casiReali ?? []).join('\n')}`,
    },
  ];
}
