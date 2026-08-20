// FLM — Impostazioni: configurazione LLM (PRD 4.5 / 7.8)
// Provider-agnostic: base URL + chiave + due modelli (narrativo, visione).
// Persistenza solo via Dexie (regola 1); la chiave è mascherata in UI,
// mai nei log. Test di connessione: ping sul modello narrativo.
// Modelli: lista dinamica da /models — utente cambia ogni giorno senza blocco.

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  IMPOSTAZIONI_LLM_DEFAULT,
  impostazioniLlm,
  salvaImpostazioniLlm,
} from '../db';
import { elencaModelliDisponibili, testaConnessione, testaVisione, type EsitoTestConnessione } from '../llm';
import type { ImpostazioniRecord } from '../types/entities';

interface ImpostazioniProps {
  onHome: () => void;
}

interface PresetProvider {
  nome: string;
  baseUrl: string;
  modelloNarrativo: string;
  /** Se assente, il preset non tocca il modello visione (resta quello attuale). */
  modelloVisione?: string;
}

/**
 * Preset rapidi (PRD 7.8: cambio provider in cinque minuti; i modelli si editano).
 * "Opencode Zen (modelli free)": endpoint /zen/v1 (stessa chiave opencode),
 * modelli gratuiti per un periodo limitato (opencode.ai/docs/zen).
 * Visione su mimo-v2.5-free: MiMo V2.5 è multimodale nativo (legge immagini,
 * video e audio), quindi copre anche l'OCR screenshot a costo zero.
 */
const PRESET_PROVIDER: PresetProvider[] = [
  { nome: 'Opencode Go', baseUrl: '/zen/go/v1', modelloNarrativo: 'deepseek-v4-flash', modelloVisione: 'mimo-v2.5' },
  { nome: 'Opencode Zen (modelli free)', baseUrl: '/zen/v1', modelloNarrativo: 'deepseek-v4-flash-free', modelloVisione: 'mimo-v2.5-free' },
  { nome: 'OpenAI', baseUrl: 'https://api.openai.com/v1', modelloNarrativo: 'gpt-5.4-mini', modelloVisione: 'gpt-5.4-mini' },
  { nome: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', modelloNarrativo: 'gemini-3.1-flash-lite', modelloVisione: 'gemini-3.1-flash-lite' },
  { nome: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', modelloNarrativo: 'deepseek-v4-flash', modelloVisione: 'deepseek-v4-flash' },
];

const FORMA_BASE_URL = /^(https?:\/\/.+|\/.+)$/;

type StatoSalvataggio = 'iniziale' | 'salvato' | 'errore';
type StatoLista = 'idle' | 'caricamento' | 'ok' | 'errore';

export default function Impostazioni({ onHome }: ImpostazioniProps): ReactElement {
  const [form, setForm] = useState<Omit<ImpostazioniRecord, 'id'> | null>(null);
  const [mostraChiave, setMostraChiave] = useState(false);
  const [presetScelto, setPresetScelto] = useState('');
  const [salvataggio, setSalvataggio] = useState<StatoSalvataggio>('iniziale');
  const [messaggioSalvataggio, setMessaggioSalvataggio] = useState('');
  const [test, setTest] = useState<EsitoTestConnessione | null>(null);
  const [testInCorso, setTestInCorso] = useState(false);
  const [testVisione, setTestVisione] = useState<EsitoTestConnessione | null>(null);
  const [testVisioneInCorso, setTestVisioneInCorso] = useState(false);

  // Lista dinamica modelli dal provider (GET /models) — sblocca cambio giornaliero opencode go
  const [modelliDisponibili, setModelliDisponibili] = useState<string[]>([]);
  const [statoLista, setStatoLista] = useState<StatoLista>('idle');
  const [erroreLista, setErroreLista] = useState<string | null>(null);
  const [latenzaLista, setLatenzaLista] = useState<number | null>(null);
  const [filtroLista, setFiltroLista] = useState('');

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
    // Reset feedback salvataggio appena tocchi qualcosa — evita falso "salvato" con valori vecchi
    setSalvataggio('iniziale');
    setMessaggioSalvataggio('');
  }, []);

  const applicaPreset = useCallback((nome: string): void => {
    setPresetScelto(nome);
    const preset = PRESET_PROVIDER.find((p) => p.nome === nome);
    if (!preset || !form) return;
    setForm((attuale) => {
      if (!attuale) return attuale;
      const aggiornato: Omit<ImpostazioniRecord, 'id'> = {
        ...attuale,
        baseUrl: preset.baseUrl,
        modelloNarrativo: preset.modelloNarrativo,
      };
      if (preset.modelloVisione !== undefined) aggiornato.modelloVisione = preset.modelloVisione;
      return aggiornato;
    });
    setSalvataggio('iniziale');
    setMessaggioSalvataggio('');
    // Reset lista: va ricaricata sul nuovo baseUrl
    setStatoLista('idle');
    setModelliDisponibili([]);
    setErroreLista(null);
    setLatenzaLista(null);
  }, [form]);

  const salva = useCallback(async (): Promise<void> => {
    if (!form) return;
    if (!FORMA_BASE_URL.test(form.baseUrl)) {
      setSalvataggio('errore');
      setMessaggioSalvataggio('Base URL non valida: deve iniziare con http://, https:// o / (proxy locale).');
      return;
    }
    // Modelli sempre liberi: qualsiasi stringa non vuota è valida. Il provider decide se esiste.
    // Trim per evitare spazi invisibili che rompono la chiamata.
    const daSalvare = {
      ...form,
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey.trim(),
      modelloNarrativo: form.modelloNarrativo.trim(),
      modelloVisione: form.modelloVisione.trim(),
    };
    if (daSalvare.llmAttivo && daSalvare.apiKey === '') {
      setSalvataggio('errore');
      setMessaggioSalvataggio('LLM attivo ma chiave vuota: incolla la chiave opencode o disattiva il direttore.');
      return;
    }
    await salvaImpostazioniLlm(daSalvare);
    setForm(daSalvare);
    setSalvataggio('salvato');
    setMessaggioSalvataggio('Impostazioni salvate in locale (IndexedDB). Cambio modello attivo subito — prossimo evento usa già il nuovo modello.');
    setTest(null);
    setTestVisione(null);
  }, [form]);

  const eseguiTest = useCallback(async (): Promise<void> => {
    if (!form) return;
    setTestInCorso(true);
    setTest(null);
    const esito = await testaConnessione({ ...form, baseUrl: form.baseUrl.trim(), apiKey: form.apiKey.trim(), modelloNarrativo: form.modelloNarrativo.trim(), modelloVisione: form.modelloVisione.trim() });
    setTest(esito);
    setTestInCorso(false);
  }, [form]);

  /** Genera un'immagine di prova (canvas): numero "42" su sfondo scuro. */
  const immagineTestVisione = useCallback((): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = '#101418';
    ctx.fillRect(0, 0, 320, 200);
    ctx.fillStyle = '#e8f0f3';
    ctx.font = 'bold 96px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('42', 160, 100);
    return canvas.toDataURL('image/jpeg', 0.9);
  }, []);

  const eseguiTestVisione = useCallback(async (): Promise<void> => {
    if (!form) return;
    setTestVisioneInCorso(true);
    setTestVisione(null);
    const immagine = immagineTestVisione();
    if (!immagine) {
      setTestVisione({ ok: false, errore: 'Impossibile generare l\'immagine di prova nel browser.' });
      setTestVisioneInCorso(false);
      return;
    }
    const esito = await testaVisione(immagine, { ...form, baseUrl: form.baseUrl.trim(), apiKey: form.apiKey.trim(), modelloNarrativo: form.modelloNarrativo.trim(), modelloVisione: form.modelloVisione.trim() });
    setTestVisione(esito);
    setTestVisioneInCorso(false);
  }, [form, immagineTestVisione]);

  const caricaModelli = useCallback(async (): Promise<void> => {
    if (!form) return;
    setStatoLista('caricamento');
    setErroreLista(null);
    const esito = await elencaModelliDisponibili({ ...form, baseUrl: form.baseUrl.trim(), apiKey: form.apiKey.trim(), modelloNarrativo: form.modelloNarrativo.trim(), modelloVisione: form.modelloVisione.trim() });
    if (esito.ok && esito.modelli) {
      setModelliDisponibili(esito.modelli);
      setStatoLista('ok');
      setLatenzaLista(esito.latenzaMs ?? null);
      setErroreLista(null);
    } else {
      setStatoLista('errore');
      setErroreLista(esito.errore ?? 'Errore sconosciuto lista modelli.');
      setLatenzaLista(null);
    }
  }, [form]);

  const modelliFiltrati = useMemo(() => {
    if (!filtroLista.trim()) return modelliDisponibili;
    const q = filtroLista.toLowerCase();
    return modelliDisponibili.filter((m) => m.toLowerCase().includes(q));
  }, [modelliDisponibili, filtroLista]);

  const modelloNarrativoInLista = useMemo(() => {
    if (!form) return false;
    return modelliDisponibili.includes(form.modelloNarrativo.trim());
  }, [form, modelliDisponibili]);
  const modelloVisioneInLista = useMemo(() => {
    if (!form) return false;
    return modelliDisponibili.includes(form.modelloVisione.trim());
  }, [form, modelliDisponibili]);

  if (!form) {
    return <main className="page-shell loading-page"><p>Caricamento impostazioni…</p></main>;
  }

  const chiaveMascherata = form.apiKey === ''
    ? ''
    : `••••${form.apiKey.slice(-4)}`;

  const listaPronta = statoLista === 'ok' && modelliDisponibili.length > 0;

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
          <p className="intro">Base URL, chiave e modelli — tutto locale, mai nel repository. Senza chiave il gioco funziona comunque: eventi dal fallback offline (PRD 4.6). <strong>Puoi cambiare i due modelli ogni giorno</strong>: basta editare, salvare — il prossimo evento usa subito il nuovo.</p>
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
              <p className="settings-hint">Shortcut comodo; <strong>non blocca i modelli</strong>: dopo il preset puoi riscrivere i due campi modello a mano o dalla lista qui sotto. "Opencode Zen (modelli free)": stessa chiave opencode, narrazione a costo zero (eventi, mercato, cronache) con deepseek-v4-flash-free e OCR screenshot con mimo-v2.5-free.</p>
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
              <p className="settings-hint">Endpoint OpenAI-compatibile. Path che inizia con / = proxy di sviluppo Vite (necessario per Opencode Go e Zen: niente CORS browser).</p>
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

          {/* Lista modelli disponibili — risolve blocco opencode go che ruota i modelli */}
          <div className="settings-row">
            <label className="settings-label" htmlFor="lista-modelli-btn">Modelli disponibili</label>
            <div className="settings-control">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  id="lista-modelli-btn"
                  className="button button-small button-outline"
                  type="button"
                  onClick={() => void caricaModelli()}
                  disabled={statoLista === 'caricamento' || form.apiKey.trim() === '' || form.baseUrl.trim() === ''}
                  title={form.apiKey.trim() === '' ? 'Serve chiave per listare i modelli' : 'GET /models sul baseUrl corrente'}
                >
                  {statoLista === 'caricamento' ? 'Carico…' : listaPronta ? 'Aggiorna lista' : 'Carica lista modelli'}
                </button>
                {listaPronta && <span className="settings-hint" style={{ margin: 0 }}><span className="modelli-count">{modelliDisponibili.length} modelli</span> · {latenzaLista} ms</span>}
                {statoLista === 'idle' && <span className="settings-hint" style={{ margin: 0 }}>Carica per vedere cosa offre oggi la tua iscrizione Opencode Go. Poi un click applica il modello.</span>}
              </div>

              {statoLista === 'errore' && erroreLista && (
                <p className="feedback feedback-error" role="alert" style={{ marginTop: 8 }}>{erroreLista}</p>
              )}

              {listaPronta && (
                <div className="modelli-box">
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                    <input
                      className="text-input"
                      type="text"
                      placeholder="Filtra modelli… (es. deepseek, mimo, muse, flash)"
                      value={filtroLista}
                      onChange={(e) => setFiltroLista(e.target.value)}
                      style={{ flex: 1, minWidth: 0 }}
                    />
                    {filtroLista && (
                      <button type="button" className="button button-small button-outline" onClick={() => setFiltroLista('')}>Pulisci</button>
                    )}
                  </div>
                  <p className="settings-hint" style={{ marginBottom: 8, color: 'var(--paper-muted)' }}>Click su un modello per applicarlo al volo:</p>
                  <div className="modelli-grid">
                    {modelliFiltrati.length === 0 && <span className="settings-hint">Nessun modello col filtro.</span>}
                    {modelliFiltrati.map((m) => {
                      const isNarr = form.modelloNarrativo.trim() === m;
                      const isVis = form.modelloVisione.trim() === m;
                      const selected = isNarr || isVis;
                      return (
                        <span
                          key={m}
                          title={m}
                          className={`modelli-chip ${selected ? 'modelli-chip-selected' : ''}`}
                        >
                          <span className="modelli-chip-nome">{m}</span>
                          <span className="modelli-chip-actions">
                            <button
                              type="button"
                              className="modelli-chip-btn"
                              onClick={() => aggiorna('modelloNarrativo', m)}
                              title="Usa come modello narrativo"
                            >
                              N
                            </button>
                            <button
                              type="button"
                              className="modelli-chip-btn"
                              onClick={() => aggiorna('modelloVisione', m)}
                              title="Usa come modello visione"
                            >
                              V
                            </button>
                          </span>
                          {selected && (
                            <span className="modelli-chip-badge">
                              {isNarr && isVis ? 'N+V' : isNarr ? 'N' : 'V'}
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                  <p className="settings-hint" style={{ marginTop: 10, marginBottom: 0 }}>N = imposta narrativo · V = imposta visione · poi <strong className="modelli-hint-strong">Salva</strong> per persistere. Modelli free di Zen con suffisso <em>-free</em>.</p>
                </div>
              )}
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
                list="datalist-modelli-narrativo"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => aggiorna('modelloNarrativo', event.target.value)}
              />
              <datalist id="datalist-modelli-narrativo">
                {modelliDisponibili.map((m) => <option key={m} value={m} />)}
              </datalist>
              <p className="settings-hint">
                Eventi, cronache, dialoghi, mercato, stampa. Editabile sempre; salva per applicare subito.
                {listaPronta && (
                  <span style={{ marginLeft: 6 }}>
                    {modelloNarrativoInLista ? (
                      <span style={{ color: 'var(--ok, #16a34a)' }}>✓ presente nella lista di oggi</span>
                    ) : form.modelloNarrativo.trim() !== '' ? (
                      <span style={{ color: 'var(--warn, #d97706)' }}>⚠ custom / non in lista (ok se provider lo accetta)</span>
                    ) : null}
                  </span>
                )}
              </p>
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
                list="datalist-modelli-visione"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => aggiorna('modelloVisione', event.target.value)}
              />
              <datalist id="datalist-modelli-visione">
                {modelliDisponibili.map((m) => <option key={m} value={m} />)}
              </datalist>
              <p className="settings-hint">
                Screenshot referto/rosa (OCR) + generazioni pesanti. Serve modello multimodale/reasoning (es. mimo-v2.5, mimo-v2.5-free, gpt-4o).
                {listaPronta && (
                  <span style={{ marginLeft: 6 }}>
                    {modelloVisioneInLista ? (
                      <span style={{ color: 'var(--ok, #16a34a)' }}>✓ presente nella lista</span>
                    ) : form.modelloVisione.trim() !== '' ? (
                      <span style={{ color: 'var(--warn, #d97706)' }}>⚠ custom — test visione per verificare supporto immagini</span>
                    ) : null}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="settings-actions">
            <button className="button button-primary" type="button" onClick={() => void salva()}>Salva impostazioni</button>
            <button className="button button-outline" type="button" onClick={() => void eseguiTest()} disabled={testInCorso}>
              {testInCorso ? 'Invio ping…' : 'Test narrativo'}
            </button>
            <button className="button button-outline" type="button" onClick={() => void eseguiTestVisione()} disabled={testVisioneInCorso}>
              {testVisioneInCorso ? 'Invio immagine…' : 'Test visione'}
            </button>
          </div>

          {salvataggio === 'salvato' && <p className="feedback feedback-ok" role="status">{messaggioSalvataggio}</p>}
          {salvataggio === 'errore' && <p className="feedback feedback-error" role="alert">{messaggioSalvataggio}</p>}

          {test && (
            <div className={test.ok ? 'test-result test-result-ok' : 'test-result test-result-error'} role="status">
              {test.ok ? (
                <>
                  <p className="eyebrow">Ping narrativo riuscito</p>
                  <p><strong>{test.modelloUsato}</strong> · {test.latenzaMs} ms</p>
                  <p className="test-risposta">Risposta: “{test.testo}”</p>
                </>
              ) : (
                <>
                  <p className="eyebrow">Ping narrativo fallito</p>
                  <p>{test.errore}</p>
                </>
              )}
            </div>
          )}

          {testVisione && (
            <div className={testVisione.ok ? 'test-result test-result-ok' : 'test-result test-result-error'} role="status">
              {testVisione.ok ? (
                <>
                  <p className="eyebrow">Test visione riuscito</p>
                  <p><strong>{testVisione.modelloUsato}</strong> · {testVisione.latenzaMs} ms</p>
                  <p className="test-risposta">Risposta: “{testVisione.testo}”</p>
                  <p className="settings-hint">L'immagine di prova mostra il numero 42: se il modello lo riconosce, la lettura screenshot funzionerà.</p>
                </>
              ) : (
                <>
                  <p className="eyebrow">Test visione fallito</p>
                  <p>{testVisione.errore}</p>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
