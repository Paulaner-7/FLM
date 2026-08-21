// FLM — Pannello "Referto da screenshot" (PRD 7.4)
// Un singolo dropzone per la schermata pagelle: estrae solo i voti.
// Goal e assist si inseriscono manualmente nel form sotto.
// Il referto si conferma solo col pulsante esistente della pagina Referto.

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { analizzaScreenshotReferto, type DatiScreenshotVoti } from '../llm';
import { llmConfigurato } from '../db/impostazioni';
import { mappaNomiRosa } from '../engine/referto';
import type { Giocatore, Id } from '../types/entities';

export interface DatiPrefillScreenshot {
  prestazioni: Record<Id, { voto: number }>;
  /** Nomi letti ma non mappati alla rosa (avvisi, non bloccano) */
  nonMappati: string[];
}

interface Zona<R> {
  dataUrl: string;
  stato: 'pronto' | 'analisi' | 'ok' | 'errore';
  dati?: R;
  errore?: string;
  /** Modello che ha letto lo screenshot (diagnostica) */
  modello?: string;
}

interface RefertoScreenshotProps {
  giocatori: Giocatore[];
  squadraNome: string;
  onApplica: (dati: DatiPrefillScreenshot) => void;
}

const MAX_LATO_IMMAGINE = 1600;

/** Ridimensiona l'immagine a MAX_LATO_IMMAGINE px e la converte in JPEG
 * (qualità 0.85): un PNG di screenshot di gioco può pesare megabyte e mandare
 * in timeout o superare i limiti del provider. Il JPEG resta nitido per l'OCR. */
function ridimensionaImmagine(file: File, maxLato = MAX_LATO_IMMAGINE): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lettura del file fallita'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('File immagine non valido'));
      img.onload = () => {
        const scala = Math.min(1, maxLato / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scala));
        canvas.height = Math.max(1, Math.round(img.height * scala));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function RefertoScreenshot({
  giocatori,
  squadraNome,
  onApplica,
}: RefertoScreenshotProps): ReactElement {
  const [aperto, setAperto] = useState(true);
  const [llmOk, setLlmOk] = useState<boolean | null>(null);
  const [voti, setVoti] = useState<Zona<DatiScreenshotVoti> | null>(null);
  const [mappatura, setMappatura] = useState<Record<string, Id | null>>({});
  const [trascinando, setTrascinando] = useState<boolean>(false);
  const inputVoti = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void llmConfigurato().then(setLlmOk);
  }, []);

  const nomiRosa = giocatori.map((g) => g.nome);

  const analizza = useCallback(
    async (dataUrl: string): Promise<void> => {
      setVoti({ dataUrl, stato: 'analisi' });
      let esito: Awaited<ReturnType<typeof analizzaScreenshotReferto>>;
      try {
        esito = await analizzaScreenshotReferto({ immagineBase64: dataUrl, nomiRosa, squadraNome });
      } catch (e) {
        setVoti({ dataUrl, stato: 'errore', errore: e instanceof Error ? e.message : 'LLM non disponibile: riprova quando torna la connessione.' });
        return;
      }
      if (esito.esito === 'errore_llm') {
        setVoti({ dataUrl, stato: 'errore', errore: `Errore del servizio di visione: ${esito.dettaglio}` });
        return;
      }
      if (esito.esito === 'non_legibile') {
        setVoti({
          dataUrl,
          stato: 'errore',
          errore:
            `Il modello ${esito.modello} ha risposto ma non ha restituito voti leggibili. ` +
            (esito.testo ? `Risposta grezza: "${esito.testo}". ` : '') +
            'Se il modello non è MiMo V2.5, correggi il modello visione in Impostazioni; altrimenti usa Impostazioni → Test visione per verificare che accetti le immagini.',
        });
        return;
      }
      if (esito.dati.giocatori.length === 0) {
        setVoti({
          dataUrl,
          stato: 'errore',
          errore:
            'Ho letto lo screenshot ma non ho riconosciuto nessun giocatore della tua rosa. Controlla che sia la schermata pagelle della tua squadra e riprova.',
        });
        return;
      }
      const mappa = mappaNomiRosa(esito.dati.giocatori.map((g) => g.nome), giocatori);
      setMappatura((prec) => ({ ...prec, ...Object.fromEntries(mappa) }));
      setVoti({ dataUrl, stato: 'ok', dati: esito.dati, modello: esito.modelloUsato });
    },
    [giocatori, nomiRosa, squadraNome],
  );

  const accettaFile = useCallback(
    async (file: File | undefined): Promise<void> => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setVoti({ dataUrl: '', stato: 'errore', errore: 'Il file non è un\'immagine. Trascina uno screenshot PNG o JPG.' });
        return;
      }
      try {
        const dataUrl = await ridimensionaImmagine(file);
        await analizza(dataUrl);
      } catch (e) {
        setVoti({ dataUrl: '', stato: 'errore', errore: e instanceof Error ? e.message : 'Impossibile leggere l\'immagine.' });
      }
    },
    [analizza],
  );

  const dragOver = (e: React.DragEvent): void => {
    e.preventDefault();
    setTrascinando(true);
  };
  const dragLeave = (): void => setTrascinando(false);
  const drop = (e: React.DragEvent): void => {
    e.preventDefault();
    setTrascinando(false);
    void accettaFile(e.dataTransfer.files[0]);
  };

  const righeVoti = voti?.stato === 'ok' && voti.dati ? voti.dati.giocatori : [];
  const mappati = (nome: string): Id | null => mappatura[nome] ?? null;
  const nonMappati = righeVoti.map((g) => g.nome).filter((nome) => mappati(nome) === null);

  const applica = (): void => {
    const prestazioni: Record<Id, { voto: number }> = {};
    for (const g of righeVoti) {
      const id = mappati(g.nome);
      if (!id) continue;
      prestazioni[id] = { voto: g.voto };
    }
    onApplica({ prestazioni, nonMappati });
  };

  const scarta = (): void => {
    setVoti(null);
    setMappatura({});
  };

  const haDati = voti?.stato === 'ok';

  return (
    <section className="screenshot-panel">
      <button type="button" className="screenshot-toggle" onClick={() => setAperto((a) => !a)} aria-expanded={aperto}>
        <strong>Referto da screenshot</strong>
        <span>{aperto ? 'Chiudi' : 'Apri'} · leggi i voti da FL26 con MiMo</span>
      </button>

      {aperto && (
        <div className="screenshot-body">
          {llmOk === false && (
            <p className="feedback feedback-warn">
              LLM non configurato: apri Impostazioni e salva chiave API e modello (default: Opencode Go con
              MiMo V2.5). Nel frattempo inserisci il referto a mano, come sempre.
            </p>
          )}
          {llmOk !== false && (
            <>
              <div
                className={`dropzone ${trascinando ? 'dropzone-active' : ''} ${llmOk === null ? 'dropzone-disabled' : ''}`}
                onDragOver={dragOver}
                onDragLeave={dragLeave}
                onDrop={drop}
                onClick={() => inputVoti.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Trascina qui lo screenshot delle pagelle"
              >
                <input
                  ref={inputVoti}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    void accettaFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <strong>Pagelle giocatori</strong>
                <span>Voto (4.0–10.0) per giocatore</span>
                <small>Trascina l'immagine o clicca per scegliere</small>
              </div>

              {voti && (
                <div className="screenshot-zone-list">
                  <div className="screenshot-zona">
                    <div className="screenshot-zona-testata">
                      <strong>Screenshot pagelle</strong>
                      {voti.stato === 'analisi' && <span className="screenshot-stato">Analisi in corso…</span>}
                      {voti.stato === 'ok' && (
                        <span className="screenshot-stato screenshot-stato-ok">
                          Letto{voti.modello ? ` con ${voti.modello}` : ''}
                        </span>
                      )}
                      {voti.stato === 'errore' && <span className="screenshot-stato screenshot-stato-err">Errore</span>}
                      {voti.stato === 'pronto' && <span className="screenshot-stato">Pronto</span>}
                    </div>
                    {voti.dataUrl && <img className="screenshot-anteprima" src={voti.dataUrl} alt="Anteprima screenshot" />}
                    {voti.stato === 'errore' && voti.errore && <p className="feedback feedback-warn">{voti.errore}</p>}
                  </div>
                </div>
              )}
            </>
          )}

          {haDati && (
            <div className="screenshot-riepilogo-card">
              <h3>Voti letti — controlla e assegna ai giocatori</h3>
              {voti.modello && (
                <p className="screenshot-riepilogo">Modello usato: {voti.modello}</p>
              )}
              {righeVoti.length > 0 && (
                <table className="screenshot-tabella">
                  <thead>
                    <tr>
                      <th>Letto</th>
                      <th>Voto</th>
                      <th>Giocatore</th>
                    </tr>
                  </thead>
                  <tbody>
                    {righeVoti.map((g) => (
                      <tr key={g.nome} className={mappati(g.nome) === null ? 'screenshot-riga-non-mappata' : ''}>
                        <td>{g.nome}</td>
                        <td>{g.voto.toFixed(1)}</td>
                        <td>
                          <select
                            value={mappati(g.nome) ?? ''}
                            onChange={(e) =>
                              setMappatura((m) => ({ ...m, [g.nome]: e.target.value || null }))
                            }
                            aria-label={`Assegna ${g.nome} a un giocatore`}
                          >
                            <option value="">— non assegnato —</option>
                            {giocatori.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nome}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {nonMappati.length > 0 && (
                <p className="feedback feedback-warn">
                  {nonMappati.join(', ')} non {nonMappati.length === 1 ? 'è stato' : 'sono stati'} riconosciuti
                  nella rosa: assegna {nonMappati.length === 1 ? 'lo' : 'li'} dal selettore o ignora — il referto
                  resta comunque confermabile.
                </p>
              )}
              <div className="screenshot-azioni">
                <button type="button" className="button button-outline" onClick={scarta}>
                  Scarta
                </button>
                <button type="button" className="button button-primary" onClick={applica}>
                  Applica al referto
                </button>
              </div>
              <p className="screenshot-nota">
                Niente viene salvato: i voti pre-compilano il form sotto, gol e assist li aggiungi tu.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
