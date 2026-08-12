// FLM — Wizard bootstrap CSV ejogc327.

import { useState, type ChangeEvent, type ReactElement } from 'react';
import {
  BOOTSTRAP_STAGIONE_DEFAULT,
  importaBootstrap,
  parseBootstrapFile,
} from '../db';
import type {
  BootstrapFileKind,
  BootstrapImportSummary,
  BootstrapInput,
  CsvParseResult,
} from '../db';

interface BootstrapImportProps {
  onCancel: () => void;
  onComplete: () => void;
}

const STEPS: Array<{
  kind: BootstrapFileKind;
  number: string;
  label: string;
  title: string;
  hint: string;
}> = [
  {
    kind: 'giocatori',
    number: '01',
    label: 'Giocatori',
    title: 'Carica anagrafica giocatori',
    hint: 'Export Players di ejogc327. PES ID, ruolo, età e overall entrano nel Player Registry.',
  },
  {
    kind: 'squadre',
    number: '02',
    label: 'Squadre',
    title: 'Carica registro squadre',
    hint: 'Export Teams. Ogni squadra FL26 riceve un ID interno stabile collegato al PES ID.',
  },
  {
    kind: 'assegnazioni',
    number: '03',
    label: 'Assegnazioni',
    title: 'Carica rose e assegnazioni',
    hint: 'Export Teams-Players. Il bootstrap usa Id Club; Id National resta fuori dalle rose di club.',
  },
];

function labelFor(kind: BootstrapFileKind): string {
  return STEPS.find((step) => step.kind === kind)?.label ?? kind;
}

function formatIssue(result: CsvParseResult, index: number): string {
  const issue = result.issues[index];
  if (!issue) return '';
  return `${issue.row === 0 ? 'Struttura' : `Riga ${issue.row}`}: ${issue.message}`;
}

function FileStatus({ result }: { result: CsvParseResult | undefined }): ReactElement | null {
  if (!result) return null;
  const validLabel = result.rows.length === 1 ? 'riga valida' : 'righe valide';
  return (
    <div className="file-status" aria-live="polite">
      <div>
        <strong>{result.fileName}</strong>
        <span>{result.rows.length.toLocaleString('it-IT')} {validLabel}</span>
      </div>
      <span className={result.headerErrors.length > 0 ? 'status-pill status-error' : 'status-pill status-ok'}>
        {result.headerErrors.length > 0 ? 'Header da correggere' : 'Header verificato'}
      </span>
    </div>
  );
}

function Issues({ result }: { result: CsvParseResult | undefined }): ReactElement | null {
  if (!result) return null;
  const messages = [
    ...result.headerErrors.map((message) => `Struttura: ${message}`),
    ...result.issues.slice(0, 25).map((_, index) => formatIssue(result, index)),
  ];
  if (messages.length === 0) {
    return <p className="feedback feedback-ok">Nessuna riga malformata rilevata.</p>;
  }
  return (
    <div className="issue-box" role="status">
      <div className="issue-heading">
        <strong>{messages.length > 25 ? `${result.issues.length + result.headerErrors.length} segnalazioni` : `${messages.length} segnalazioni`}</strong>
        <span>Righe valide restano importabili.</span>
      </div>
      <ul>
        {messages.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}
      </ul>
      {result.issues.length > 25 && <p>Visualizzate prime 25 segnalazioni.</p>}
    </div>
  );
}

export default function BootstrapImport({ onCancel, onComplete }: BootstrapImportProps): ReactElement {
  const [stepIndex, setStepIndex] = useState(0);
  const [season, setSeason] = useState(BOOTSTRAP_STAGIONE_DEFAULT);
  const [results, setResults] = useState<Partial<Record<BootstrapFileKind, CsvParseResult>>>({});
  const [reading, setReading] = useState<BootstrapFileKind | null>(null);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<BootstrapImportSummary | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const current = STEPS[stepIndex] ?? STEPS[0]!;
  const currentResult = results[current.kind];
  const canContinue = Boolean(
    currentResult && currentResult.headerErrors.length === 0 && currentResult.rows.length > 0 && reading === null,
  );

  async function readFile(file: File, kind: BootstrapFileKind): Promise<void> {
    setReading(kind);
    setFatalError(null);
    try {
      const result = await parseBootstrapFile(file, kind);
      setResults((previous) => ({ ...previous, [kind]: result }));
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : 'Lettura CSV fallita');
    } finally {
      setReading(null);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>, kind: BootstrapFileKind): void {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void readFile(file, kind);
  }

  function goNext(): void {
    if (!canContinue) return;
    if (stepIndex < STEPS.length - 1) setStepIndex((value) => value + 1);
  }

  function goBack(): void {
    if (stepIndex === 0) onCancel();
    else setStepIndex((value) => value - 1);
  }

  async function runImport(): Promise<void> {
    const giocatori = results.giocatori;
    const squadre = results.squadre;
    const assegnazioni = results.assegnazioni;
    if (!giocatori || !squadre || !assegnazioni) {
      setFatalError('Completa tutti e tre i file prima di importare.');
      return;
    }
    if (!season.trim()) {
      setFatalError('Inserisci stagione bootstrap, per esempio 2025/26.');
      return;
    }

    const input: BootstrapInput = { giocatori, squadre, assegnazioni };
    setImporting(true);
    setFatalError(null);
    try {
      setSummary(await importaBootstrap(input, season.trim()));
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : 'Importazione fallita');
    } finally {
      setImporting(false);
    }
  }

  if (summary) {
    return (
      <main className="page-shell">
        <header className="topbar">
          <button className="brand-button" type="button" onClick={onComplete}>FLM <span>/ Database</span></button>
          <span className="topbar-note">Snapshot FL26 acquisita</span>
        </header>
        <section className="content-wrap result-page">
          <p className="eyebrow">Bootstrap completato</p>
          <h1>Mondo FL26 pronto.</h1>
          <p className="intro">Fotografia importata in modo atomico. Rieseguire questo wizard sostituirà questo snapshot con quello nuovo.</p>
          <div className="summary-grid">
            <div className="summary-card"><strong>{summary.squadre.toLocaleString('it-IT')}</strong><span>Squadre importate</span></div>
            <div className="summary-card"><strong>{summary.giocatori.toLocaleString('it-IT')}</strong><span>Giocatori nel registry</span></div>
            <div className="summary-card"><strong>{summary.senzaSquadra.toLocaleString('it-IT')}</strong><span>Svincolati</span></div>
          </div>
          <div className="summary-detail">
            <span>{summary.assegnazioni.toLocaleString('it-IT')} assegnazioni club attive</span>
            <span>Stagione validità: {season.trim()}</span>
          </div>
          {summary.issues.length > 0 && (
            <div className="issue-box">
              <div className="issue-heading"><strong>{summary.issues.length} segnalazioni mantenute nel report</strong><span>Dati validi importati.</span></div>
              <ul>{summary.issues.slice(0, 25).map((issue, index) => <li key={`${issue.file}-${issue.row}-${index}`}>{labelFor(issue.file)} · riga {issue.row}: {issue.message}</li>)}</ul>
            </div>
          )}
          <button className="button button-primary" type="button" onClick={onComplete}>Apri Database</button>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={onCancel}>FLM <span>/ Bootstrap</span></button>
        <button className="text-button" type="button" onClick={onCancel}>Esci senza importare</button>
      </header>
      <section className="content-wrap wizard-layout">
        <aside className="wizard-rail" aria-label="Passi importazione">
          <p className="eyebrow">Ingresso dati</p>
          <h1>Porta FL26<br />dentro FLM.</h1>
          <p className="rail-copy">Tre export, un registro unico. Il CSV resta memoria del gioco; FLM aggiunge struttura, rose e continuità.</p>
          <ol className="step-list">
            {STEPS.map((item, index) => (
              <li key={item.kind} className={index === stepIndex ? 'step-item step-active' : index < stepIndex ? 'step-item step-done' : 'step-item'}>
                <button type="button" onClick={() => index <= stepIndex && setStepIndex(index)} aria-current={index === stepIndex ? 'step' : undefined}>
                  <span>{item.number}</span><strong>{item.label}</strong>
                </button>
              </li>
            ))}
          </ol>
          <p className="rail-footnote">Formato richiesto: UTF-8 · separatore punto e virgola · header editor originali.</p>
        </aside>

        <section className="wizard-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Passo {current.number} di 03</p>
              <h2>{current.title}</h2>
              <p>{current.hint}</p>
            </div>
            <span className="data-mark">{current.kind === 'assegnazioni' ? 'ROSTER' : current.kind === 'squadre' ? 'TEAMS' : 'PLAYERS'}</span>
          </div>

          <label
            className="dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file) void readFile(file, current.kind);
            }}
          >
            <input type="file" accept=".csv,text/csv" onChange={(event) => onFileChange(event, current.kind)} />
            <span className="dropzone-icon">+</span>
            <strong>{reading === current.kind ? 'Lettura in corso…' : 'Scegli file CSV'}</strong>
            <span>oppure trascinalo qui · file locale, nessun upload</span>
          </label>
          <FileStatus result={currentResult} />
          <Issues result={currentResult} />

          {stepIndex === 0 && (
            <label className="field-label" htmlFor="bootstrap-season">
              Stagione di validità assegnazioni
              <input id="bootstrap-season" className="text-input" value={season} onChange={(event) => setSeason(event.target.value)} placeholder="2025/26" />
            </label>
          )}

          {fatalError && <p className="feedback feedback-error" role="alert">{fatalError}</p>}

          <div className="wizard-actions">
            <button className="button button-quiet" type="button" onClick={goBack}>{stepIndex === 0 ? 'Annulla' : 'Indietro'}</button>
            {stepIndex < STEPS.length - 1 ? (
              <button className="button button-primary" type="button" disabled={!canContinue} onClick={goNext}>Continua</button>
            ) : (
              <button className="button button-primary" type="button" disabled={importing || !canContinue || !results.giocatori || !results.squadre} onClick={() => void runImport()}>
                {importing ? 'Importazione…' : 'Importa snapshot'}
              </button>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
