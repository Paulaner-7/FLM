// FLM — Impostazioni: configurazione LLM (PRD 4.5 / 7.8)
// Provider-agnostic: base URL + chiave + due modelli (narrativo, visione).
// Persistenza solo via Dexie (regola 1); la chiave è mascherata in UI,
// mai nei log. Test di connessione: ping sul modello narrativo.

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  IMPOSTAZIONI_LLM_DEFAULT,
  impostazioniLlm,
  salvaImpostazioniLlm,
} from '../db';
import { testaConnessione, type EsitoTestConnessione } from '../llm';
import type { ImpostazioniRecord } from '../types/entities';

interface ImpostazioniProps {
  onHome: () => void;
}

interface PresetProvider {
  nome: string;
  baseUrl: string;
  modelloNarrativo: string;
  modelloVisione: string;
}

/** Preset rapidi (PRD 7.8: cambio provider in cinque minuti; i modelli si editano). */
const PRESET_PROVIDER: PresetProvider[] = [
  { nome: 'Opencode Go', baseUrl: '/zen/go/v1', modelloNarrativo: 'deepseek-v4-flash', modelloVisione: 'mimo-v2.5' },
  { nome: 'OpenAI', baseUrl: 'https://api.openai.com/v1', modelloNarrativo: 'gpt-5.4-mini', modelloVisione: 'gpt-5.4-mini' },
  { nome: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', modelloNarrativo: 'gemini-3.1-flash-lite', modelloVisione: 'gemini-3.1-flash-lite' },
  { nome: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', modelloNarrativo: 'deepseek-v4-flash', modelloVisione: 'deepseek-v4-flash' },
];

const FORMA_BASE_URL = /^(https?:\/\/.+|\/.+)$/;

type StatoSalvataggio = 'iniziale' | 'salvato' | 'errore';

export default function Impostazioni({ onHome }: ImpostazioniProps): ReactElement {
  const [form, setForm] = useState<Omit<ImpostazioniRecord, 'id'> | null>(null);
  const [mostraChiave, setMostraChiave] = useState(false);
  const [presetScelto, setPresetScelto] = useState('');
  const [salvataggio, setSalvataggio] = useState<StatoSalvataggio>('iniziale');
  const [messaggioSalvataggio, setMessaggioSalvataggio] = useState('');
  const [test, setTest] = useState<EsitoTestConnessione | null>(null);
  const [testInCorso, setTestInCorso] = useState(false);

  useEffect(() => {
    void impostazioniLlm().then((impostazioni) => setForm({
      baseUrl: impostazioni.baseUrl,
      apiKey: impostazioni.apiKey,
      modelloNarrativo: impostazioni.modelloNarrativo,
      modelloVisione: impostazioni.modelloVisione,
      llmAttivo: impostazioni.llmAttivo,
    }));
  }, []);

  const aggiorna = useCallback(<K extends keyof Omit<ImpostazioniRecord, 'id'>>(campo: K, valore: Omit<ImpostazioniRecord, 'id'>[K]): void => {
    setForm((attuale) => (attuale ? { ...attuale, [campo]: valore } : attuale));
  }, []);

  const applicaPreset = useCallback((nome: string): void => {
    setPresetScelto(nome);
    const preset = PRESET_PROVIDER.find((p) => p.nome === nome);
    if (!preset || !form) return;
    setForm((attuale) => (attuale ? { ...attuale, baseUrl: preset.baseUrl, modelloNarrativo: preset.modelloNarrativo, modelloVisione: preset.modelloVisione } : attuale));
  }, [form]);

  const salva = useCallback(async (): Promise<void> => {
    if (!form) return;
    if (!FORMA_BASE_URL.test(form.baseUrl)) {
      setSalvataggio('errore');
      setMessaggioSalvataggio('Base URL non valida: deve iniziare con http://, https:// o / (proxy locale).');
      return;
    }
    await salvaImpostazioniLlm(form);
    setSalvataggio('salvato');
    setMessaggioSalvataggio('Impostazioni salvate in locale (IndexedDB).');
    setTest(null);
  }, [form]);

  const eseguiTest = useCallback(async (): Promise<void> => {
    setTestInCorso(true);
    setTest(null);
    const esito = await testaConnessione();
    setTest(esito);
    setTestInCorso(false);
  }, []);

  if (!form) {
    return <main className="page-shell loading-page"><p>Caricamento impostazioni…</p></main>;
  }

  const chiaveMascherata = form.apiKey === ''
    ? ''
    : `••••${form.apiKey.slice(-4)}`;

  return (
    <main className="page-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={onHome}>FLM <span>/ Impostazioni</span></button>
        <div className="topbar-actions">
          <span className="topbar-note">Direttore narrativo · PRD 4.5/7.8</span>
        </div>
      </header>

      <section className="content-wrap settings-page">
        <div className="settings-heading">
          <p className="eyebrow">Motore LLM</p>
          <h1>Il narratore si configura.</h1>
          <p className="intro">Base URL, chiave e modelli — tutto locale, mai nel repository. Senza chiave il gioco funziona comunque: eventi dal fallback offline (PRD 4.6).</p>
        </div>

        <div className="settings-form">
          <div className="settings-row">
            <label className="settings-label" htmlFor="llm-attivo">Direttore narrativo LLM</label>
            <div className="settings-control">
              <label className="switch-label">
                <input
                  id="llm-attivo"
                  className="switch-input"
                  type="checkbox"
                  checked={form.llmAttivo}
                  onChange={(event) => aggiorna('llmAttivo', event.target.checked)}
                />
                <span className="switch-track" aria-hidden="true" />
                <span className="switch-copy">{form.llmAttivo ? 'Attivo' : 'Disattivo — solo fallback offline'}</span>
              </label>
            </div>
          </div>

          <div className="settings-row">
            <label className="settings-label" htmlFor="preset-provider">Preset provider</label>
            <div className="settings-control">
              <select
                id="preset-provider"
                className="text-input"
                value={presetScelto}
                onChange={(event) => applicaPreset(event.target.value)}
              >
                <option value="">— scegli un preset (poi modifica i campi) —</option>
                {PRESET_PROVIDER.map((preset) => (
                  <option key={preset.nome} value={preset.nome}>{preset.nome}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="settings-row">
            <label className="settings-label" htmlFor="base-url">Base URL</label>
            <div className="settings-control">
              <input
                id="base-url"
                className="text-input"
                type="url"
                value={form.baseUrl}
                placeholder={IMPOSTAZIONI_LLM_DEFAULT.baseUrl}
                onChange={(event) => aggiorna('baseUrl', event.target.value)}
              />
              <p className="settings-hint">Endpoint OpenAI-compatibile. Path che inizia con / = proxy di sviluppo Vite (necessario per Opencode Go: niente CORS browser).</p>
            </div>
          </div>

          <div className="settings-row">
            <label className="settings-label" htmlFor="api-key">API key</label>
            <div className="settings-control">
              <div className="settings-key-wrap">
                <input
                  id="api-key"
                  className="text-input"
                  type={mostraChiave ? 'text' : 'password'}
                  value={form.apiKey}
                  placeholder={chiaveMascherata || 'Incolla la chiave…'}
                  autoComplete="off"
                  onChange={(event) => aggiorna('apiKey', event.target.value)}
                />
                <button
                  className="button button-small button-outline"
                  type="button"
                  onClick={() => setMostraChiave((attuale) => !attuale)}
                >
                  {mostraChiave ? 'Nascondi' : 'Mostra'}
                </button>
              </div>
              <p className="settings-hint">Salvata solo in IndexedDB locale (mai in repo, mai nei log). Se lasci vuota, LLM disattivo.</p>
            </div>
          </div>

          <div className="settings-row">
            <label className="settings-label" htmlFor="modello-narrativo">Modello narrativo</label>
            <div className="settings-control">
              <input
                id="modello-narrativo"
                className="text-input"
                type="text"
                value={form.modelloNarrativo}
                placeholder={IMPOSTAZIONI_LLM_DEFAULT.modelloNarrativo}
                onChange={(event) => aggiorna('modelloNarrativo', event.target.value)}
              />
              <p className="settings-hint">Eventi settimanali, cronache, dialoghi, stampa (PRD 7.8).</p>
            </div>
          </div>

          <div className="settings-row">
            <label className="settings-label" htmlFor="modello-visione">Modello visione</label>
            <div className="settings-control">
              <input
                id="modello-visione"
                className="text-input"
                type="text"
                value={form.modelloVisione}
                placeholder={IMPOSTAZIONI_LLM_DEFAULT.modelloVisione}
                onChange={(event) => aggiorna('modelloVisione', event.target.value)}
              />
              <p className="settings-hint">Screenshot referto / rosa (OCR visivo), generazioni stagionali pesanti (PRD 7.8).</p>
            </div>
          </div>

          <div className="settings-actions">
            <button className="button button-primary" type="button" onClick={() => void salva()}>Salva impostazioni</button>
            <button className="button button-outline" type="button" onClick={() => void eseguiTest()} disabled={testInCorso}>
              {testInCorso ? 'Invio ping…' : 'Test connessione'}
            </button>
          </div>

          {salvataggio === 'salvato' && <p className="feedback feedback-ok" role="status">{messaggioSalvataggio}</p>}
          {salvataggio === 'errore' && <p className="feedback feedback-error" role="alert">{messaggioSalvataggio}</p>}

          {test && (
            <div className={test.ok ? 'test-result test-result-ok' : 'test-result test-result-error'} role="status">
              {test.ok ? (
                <>
                  <p className="eyebrow">Ping riuscito</p>
                  <p><strong>{test.modelloUsato}</strong> · {test.latenzaMs} ms</p>
                  <p className="test-risposta">Risposta: “{test.testo}”</p>
                </>
              ) : (
                <>
                  <p className="eyebrow">Ping fallito</p>
                  <p>{test.errore}</p>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
