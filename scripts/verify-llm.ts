// FLM — Verifica del servizio LLM (M3)
// Offline: fetch mock iniettato via creaServizioLlm(fetchImpl) — nessuna
// chiave API, nessuna rete. Copre: parsing robusto, validazione forma,
// mapping snake→camel, retry structured output→prompt-mode, errori (rete,
// timeout, HTTP), non_configurato, visione.
// Avvio: npm run verify:llm
import 'fake-indexeddb/auto';

import { IMPOSTAZIONI_LLM_DEFAULT, salvaImpostazioniLlm } from '../src/db/impostazioni';
import { creaServizioLlm, type ContestoGenerazione } from '../src/llm';
import { daWirePropostaEventi, estraiJson, validaPropostaEventiWire, type PropostaEventiWire } from '../src/llm/schema';

let falliti = 0;

function check(nome: string, ok: boolean, dettaglio = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${nome}${dettaglio ? ` — ${dettaglio}` : ''}`);
  if (!ok) falliti++;
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const contesto: ContestoGenerazione = {
  settimana: 7,
  posizioneClassifica: 3,
  ultimePartite: ['V 2-1', 'P 0-2', 'V 1-0'],
  giocatoriMoraleBasso: ['Marco Rossi'],
  moraleSpogliatoio: 64,
  promesseInScadenza: [],
  fiduciaSocieta: 68,
  ultimiEventi: ['Crisi di spogliatoio', 'Voce di mercato'],
};

const wireValido: PropostaEventiWire = {
  eventi: [
    {
      categoria: 'giocatore',
      tipo: 'punto_decisionale',
      titolo: 'Il capitano vuole garanzie',
      testo: 'Marco Rossi chiede più minuti e un chiarimento sullo spogliatoio.',
      giocatori_coinvolti: ['Marco Rossi'],
      opzioni: [
        { testo: 'Prometti titolarità', effetti_proposti: { morale_giocatori: 8, fiducia_societa: 0, fiducia_tifosi: -2, reputazione: 1 } },
        { testo: 'Rifiuta e chiudi', effetti_proposti: { morale_giocatori: -6, fiducia_societa: 0, fiducia_tifosi: 0, reputazione: 0 } },
      ],
    },
  ],
  notizie: ['Il derby va al Falco', 'Sosta nazionali: tre convocati'],
};

interface ChiamataRegistrata {
  url: string;
  body: {
    model: string;
    messages: unknown;
    max_tokens: number;
    response_format?: { type: string; json_schema: { name: string } };
  };
}

function fabRisposta(testo: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: testo } }] }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Risposta HTML (SPA fallback di Vite quando il proxy non è attivo). */
function fabRispostaHtml(): Response {
  return new Response('<!DOCTYPE html><html><body>index</body></html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

/** Mock fetch a sequenza: ogni chiamata consuma l'elemento successivo (ultimo ripetuto). */
function fabMockFetch(sequenza: Array<Response | (() => Promise<Response> | Response)>): { fetchImpl: typeof fetch; chiamate: ChiamataRegistrata[] } {
  const chiamate: ChiamataRegistrata[] = [];
  let indice = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    chiamate.push({ url: String(input), body: JSON.parse(String(init?.body)) as ChiamataRegistrata['body'] });
    const prossimo = sequenza[Math.min(indice, sequenza.length - 1)];
    indice++;
    if (typeof prossimo === 'function') return prossimo();
    return prossimo;
  }) as typeof fetch;
  return { fetchImpl, chiamate };
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // ---------- PARSING ROBUSTO ----------
  check('estraiJson: fence ```json', JSON.stringify(estraiJson('```json\n{"a": 1}\n```')) === '{"a":1}');
  check('estraiJson: fence senza lingua', JSON.stringify(estraiJson('```\n{"a": 1}\n```')) === '{"a":1}');
  check('estraiJson: testo prima e dopo', JSON.stringify(estraiJson('Ecco il JSON: {"a": 1} fine.')) === '{"a":1}');
  check('estraiJson: stringa con parentesi', JSON.stringify(estraiJson('{"a": "}"}')) === '{"a":"}"}');
  check('estraiJson: JSON annidato', JSON.stringify(estraiJson('{"a": {"b": [1, 2]}}')) === '{"a":{"b":[1,2]}}');
  check('estraiJson: vuoto → null', estraiJson('') === null);
  check('estraiJson: sbilanciato → null', estraiJson('{"a":') === null);
  check('estraiJson: niente JSON → null', estraiJson('solo testo') === null);

  // ---------- VALIDAZIONE FORMA ----------
  check('valida: payload valido', validaPropostaEventiWire(wireValido));
  check('valida: categoria fuori enum', !validaPropostaEventiWire({ ...wireValido, eventi: [{ ...wireValido.eventi[0]!, categoria: 'mercato' }] }));
  check('valida: tipo fuori enum', !validaPropostaEventiWire({ ...wireValido, eventi: [{ ...wireValido.eventi[0]!, tipo: 'crisi' }] }));
  check('valida: effetti non interi', !validaPropostaEventiWire({
    ...wireValido,
    eventi: [{ ...wireValido.eventi[0]!, opzioni: [{ testo: 'x', effetti_proposti: { morale_giocatori: 1.5, fiducia_societa: 0, fiducia_tifosi: 0, reputazione: 0 } }] }],
  }));
  check('valida: opzioni vuote', !validaPropostaEventiWire({ ...wireValido, eventi: [{ ...wireValido.eventi[0]!, opzioni: [] }] }));
  check('valida: notizie non stringhe', !validaPropostaEventiWire({ ...wireValido, notizie: ['ok', 42] }));
  check('valida: non-oggetto', !validaPropostaEventiWire('testo'));
  check('valida: chiavi mancanti', !validaPropostaEventiWire({ eventi: [] }));

  // ---------- MAPPING snake → camel ----------
  const mappata = daWirePropostaEventi(wireValido);
  check('mapping: giocatoriCoinvolti', mappata.eventi[0]?.giocatoriCoinvolti[0] === 'Marco Rossi');
  check('mapping: effettiProposti camelCase', mappata.eventi[0]?.opzioni[0]?.effettiProposti.moraleGiocatori === 8 && mappata.eventi[0]?.opzioni[0]?.effettiProposti.fiduciaTifosi === -2);
  check('mapping: notizie', mappata.notizie.length === 2);

  // ---------- CONFIGURAZIONE ----------
  await salvaImpostazioniLlm({ ...IMPOSTAZIONI_LLM_DEFAULT, apiKey: 'chiave-di-test' });

  // ---------- CHAT OK ----------
  {
    const { fetchImpl, chiamate } = fabMockFetch([fabRisposta('pong')]);
    const servizio = creaServizioLlm(fetchImpl);
    const risposta = await servizio.chatCompletions({ ruolo: 'narrativo', messaggi: [{ role: 'user', content: 'ping' }] });
    check('chat: risposta ok', risposta?.testo === 'pong', risposta?.testo ?? 'null');
    check('chat: URL via proxy di sviluppo (base relativo)', chiamate[0]?.url === '/zen/go/v1/chat/completions', chiamate[0]?.url ?? 'nessuna chiamata');
    check('chat: modello narrativo di default', chiamate[0]?.body.model === 'deepseek-v4-flash', chiamate[0]?.body.model ?? 'nessuna chiamata');
    check('chat: niente response_format senza schema', chiamate[0]?.body.response_format === undefined);
  }

  // ---------- GENERAZIONE EVENTI: structured output ----------
  {
    const { fetchImpl, chiamate } = fabMockFetch([fabRisposta(JSON.stringify(wireValido))]);
    const servizio = creaServizioLlm(fetchImpl);
    const proposta = await servizio.generaEventiSettimanali(contesto);
    check('eventi: proposta valida da json_schema', proposta?.eventi.length === 1 && proposta.eventi[0]?.titolo === 'Il capitano vuole garanzie');
    check('eventi: response_format con schema PRD', chiamate[0]?.body.response_format?.type === 'json_schema' && chiamate[0]?.body.response_format.json_schema.name === 'proposta_eventi');
    check('eventi: 1 sola chiamata', chiamate.length === 1, String(chiamate.length));
    check('eventi: modello narrativo', chiamate[0]?.body.model === 'deepseek-v4-flash');
    const userMsg = chiamate[0]?.body.messages?.[1] as { content?: string } | undefined;
    check('eventi: stato sintetico nel prompt', typeof userMsg?.content === 'string' && userMsg.content.includes('posizione_classifica'));
  }

  // ---------- GENERAZIONE EVENTI: JSON invalido → retry prompt-mode ----------
  {
    const { fetchImpl, chiamate } = fabMockFetch([fabRisposta('non sono JSON'), fabRisposta(JSON.stringify(wireValido))]);
    const servizio = creaServizioLlm(fetchImpl);
    const proposta = await servizio.generaEventiSettimanali(contesto);
    check('eventi: retry dopo JSON invalido', proposta !== null && proposta.notizie.length === 2);
    check('eventi: retry senza response_format', chiamate[1]?.body.response_format === undefined);
    check('eventi: 2 chiamate totali', chiamate.length === 2, String(chiamate.length));
  }

  // ---------- GENERAZIONE EVENTI: JSON invalido due volte → null ----------
  {
    const { fetchImpl, chiamate } = fabMockFetch([fabRisposta('non sono JSON'), fabRisposta('nemmeno questo')]);
    const servizio = creaServizioLlm(fetchImpl);
    const proposta = await servizio.generaEventiSettimanali(contesto);
    check('eventi: doppio JSON invalido → null', proposta === null);
    check('eventi: max 2 chiamate', chiamate.length === 2, String(chiamate.length));
  }

  // ---------- GENERAZIONE EVENTI: 400 su json_schema → retry senza schema ----------
  {
    const { fetchImpl, chiamate } = fabMockFetch([fabRisposta('', 400), fabRisposta(JSON.stringify(wireValido))]);
    const servizio = creaServizioLlm(fetchImpl);
    const proposta = await servizio.generaEventiSettimanali(contesto);
    check('eventi: 400 su schema → retry prompt-mode ok', proposta !== null);
    check('eventi: secondo tentativo senza response_format', chiamate[1]?.body.response_format === undefined);
    check('eventi: 2 chiamate', chiamate.length === 2, String(chiamate.length));
  }

  // ---------- GENERAZIONE EVENTI: 400 poi JSON invalido → null, MAI terza chiamata ----------
  {
    const { fetchImpl, chiamate } = fabMockFetch([fabRisposta('', 400), fabRisposta('JSON rotto')]);
    const servizio = creaServizioLlm(fetchImpl);
    const proposta = await servizio.generaEventiSettimanali(contesto);
    check('eventi: 400 + invalido → null (niente terza chiamata)', proposta === null && chiamate.length === 2, `chiamate: ${chiamate.length}`);
  }

  // ---------- VISIONE ----------
  {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const { fetchImpl, chiamate } = fabMockFetch([fabRisposta('Rosa: 11 titolari, nessun infortunato')]);
    const servizio = creaServizioLlm(fetchImpl);
    const testo = await servizio.analizzaImmagine({ immagineBase64: dataUrl, istruzioni: 'Leggi il referto' });
    check('visione: testo restituito', testo === 'Rosa: 11 titolari, nessun infortunato');
    check('visione: modello mimo-v2.5', chiamate[0]?.body.model === 'mimo-v2.5', chiamate[0]?.body.model ?? 'nessuna');
    const contenuto = chiamate[0]?.body.messages?.[0] as { content?: Array<{ type: string; image_url?: { url: string }; text?: string }> } | undefined;
    const imageMsg = Array.isArray(contenuto?.content) ? contenuto.content.find((c) => c.type === 'image_url') : undefined;
    check('visione: contenuto image_url con data URL', imageMsg?.image_url?.url === dataUrl);
  }

  // ---------- ERRORI: rete, timeout, HTTP ----------
  {
    const fetchRete = (async (): Promise<Response> => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    const servizio = creaServizioLlm(fetchRete);
    check('rete: chatCompletions → null', (await servizio.chatCompletions({ ruolo: 'narrativo', messaggi: [{ role: 'user', content: 'x' }] })) === null);
    check('rete: generaEventiSettimanali → null', (await servizio.generaEventiSettimanali(contesto)) === null);
    const esitoTest = await servizio.testaConnessione();
    check('rete: test mostra errore leggibile', !esitoTest.ok && (esitoTest.errore ?? '').includes('rete'), esitoTest.errore ?? '');
  }
  {
    const fetchTimeout = (async (): Promise<Response> => { throw new DOMException('The operation timed out.', 'TimeoutError'); }) as typeof fetch;
    const servizio = creaServizioLlm(fetchTimeout);
    const esitoTest = await servizio.testaConnessione();
    check('timeout: test segnala timeout', !esitoTest.ok && (esitoTest.errore ?? '').includes('Timeout'), esitoTest.errore ?? '');
  }
  {
    const { fetchImpl } = fabMockFetch([fabRisposta('', 401)]);
    const servizio = creaServizioLlm(fetchImpl);
    const esitoTest = await servizio.testaConnessione();
    check('http 401: test segnala chiave non valida', !esitoTest.ok && (esitoTest.errore ?? '').includes('chiave'), esitoTest.errore ?? '');
  }

  // ---------- PROXY NON ATTIVO (HTML al posto di JSON) ----------
  {
    const { fetchImpl } = fabMockFetch([fabRispostaHtml()]);
    const servizio = creaServizioLlm(fetchImpl);
    check('proxy assente: chatCompletions → null', (await servizio.chatCompletions({ ruolo: 'narrativo', messaggi: [{ role: 'user', content: 'x' }] })) === null);
    check('proxy assente: eventi → null', (await servizio.generaEventiSettimanali(contesto)) === null);
    const esitoTest = await servizio.testaConnessione();
    check('proxy assente: test suggerisce il restart di npm run dev', !esitoTest.ok && (esitoTest.errore ?? '').includes('npm run dev'), esitoTest.errore ?? '');
  }

  // ---------- NON CONFIGURATO ----------
  await salvaImpostazioniLlm({ ...IMPOSTAZIONI_LLM_DEFAULT, apiKey: '', llmAttivo: false });
  {
    const { fetchImpl, chiamate } = fabMockFetch([fabRisposta(JSON.stringify(wireValido))]);
    const servizio = creaServizioLlm(fetchImpl);
    check('non configurato: eventi → null senza chiamate', (await servizio.generaEventiSettimanali(contesto)) === null && chiamate.length === 0);
    const esitoTest = await servizio.testaConnessione();
    check('non configurato: test spiega la causa', !esitoTest.ok && (esitoTest.errore ?? '').includes('chiave'), esitoTest.errore ?? '');
  }

  console.log(falliti === 0 ? '\nTUTTI I CHECK PASSATI' : `\n${falliti} CHECK FALLITI`);
  process.exit(falliti === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('ERRORE', e);
  process.exit(1);
});
