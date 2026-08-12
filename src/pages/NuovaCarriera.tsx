// FLM — Flusso "Nuova Carriera" (wizard: campionato → squadra → obiettivo → creazione → benvenuto).
// UI placeholder: struttura pronta a future modifiche grafiche (animazioni, stile preciso).
// Tutti i numeri vengono dal motore (src/engine): qui solo presentazione e input.

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { creaCarriera, squadreTemplate, type EsitoCreazioneCarriera } from '../db';
import { BOOTSTRAP_STAGIONE_DEFAULT } from '../db/bootstrap';
import { budgetCarriera, campionatiDisponibili, posizioniInLega, ratingInizialeCompleto, squadreDellaLega } from '../engine';
import type { Carriera, ObiettivoStagionale, Squadra } from '../types/entities';

const OBIETTIVI: ReadonlyArray<{ valore: ObiettivoStagionale; titolo: string; descrizione: string }> = [
  { valore: 'salvezza', titolo: 'Salvezza', descrizione: 'Resta in categoria: il presidente chiede sicurezza.' },
  { valore: 'meta_classifica', titolo: 'Metà classifica', descrizione: 'Un campionato tranquillo, senza patemi né sogni.' },
  { valore: 'coppe', titolo: 'Coppe', descrizione: 'La società vuole l\'Europa: zona coppe come obiettivo.' },
  { valore: 'titolo', titolo: 'Titolo', descrizione: 'Solo vincere: tutto il resto è deludente.' },
];

const ETICHETTA_OBIETTIVO: Record<ObiettivoStagionale, string> = {
  salvezza: 'Salvezza',
  meta_classifica: 'Metà classifica',
  coppe: 'Coppe',
  titolo: 'Titolo',
};

type Step = 'campionato' | 'squadra' | 'obiettivo' | 'benvenuto';

interface NuovaCarrieraProps {
  onCancel: () => void;
  onComplete: (carriera: Carriera) => void;
}

export default function NuovaCarriera({ onCancel, onComplete }: NuovaCarrieraProps): ReactElement {
  const [template, setTemplate] = useState<Squadra[] | null>(null);
  const [lega, setLega] = useState<string | null>(null);
  const [squadraId, setSquadraId] = useState<string | null>(null);
  const [obiettivo, setObiettivo] = useState<ObiettivoStagionale | null>(null);
  const [creata, setCreata] = useState<EsitoCreazioneCarriera | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void squadreTemplate().then((s) => {
      if (alive) setTemplate(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const campionati = useMemo(() => (template ? campionatiDisponibili(template) : null), [template]);
  const squadreLega = useMemo(
    () => (template && lega ? squadreDellaLega(template, lega) : []),
    [template, lega],
  );
  // Piazzamento stimato (forza rosa) → budget differenziato per squadra
  const posizioni = useMemo(() => posizioniInLega(squadreLega), [squadreLega]);
  const squadra = squadreLega.find((s) => s.id === squadraId);

  // Passo corrente: dopo la scelta dell'obiettivo si resta qui (pulsante crea)
  const step: Step = creata ? 'benvenuto' : lega === null ? 'campionato' : squadraId === null ? 'squadra' : 'obiettivo';

  const crea = async (): Promise<void> => {
    if (!lega || !squadraId || !obiettivo) return;
    setErrore(null);
    try {
      const esito = await creaCarriera({
        squadraTemplateId: squadraId,
        obiettivo,
        campionato: lega,
        stagione: BOOTSTRAP_STAGIONE_DEFAULT,
      });
      setCreata(esito);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Creazione fallita');
    }
  };

  if (!template) {
    return <main className="page-shell loading-page"><p>Caricamento registri…</p></main>;
  }

  if (step === 'benvenuto' && creata) {
    return <BenvenutoMister esito={creata} onStart={() => onComplete(creata.carriera)} />;
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={onCancel}>FLM <span>/ Nuova carriera</span></button>
        <span className="topbar-note">Passo {step === 'campionato' ? 1 : step === 'squadra' ? 2 : 3} di 3</span>
      </header>

      <section className="content-wrap wizard-layout">
        <aside className="wizard-rail">
          <p className="eyebrow">Nuova carriera</p>
          <h1>Dal mondo FL26 alla tua panchina.</h1>
          <p className="rail-copy">Scegli campionato e squadra, dichiara l'obiettivo: il motore crea calendario, stato e settimana 1.</p>
          <ol className="step-list">
            <li className={`step-item ${lega ? 'step-done' : 'step-active'}`}>
              <button type="button" onClick={() => setLega(null)}><span>01</span><strong>Campionato</strong></button>
            </li>
            <li className={`step-item ${!lega ? '' : squadraId ? 'step-done' : 'step-active'}`}>
              <button type="button" onClick={() => setSquadraId(null)}><span>02</span><strong>Squadra</strong></button>
            </li>
            <li className={`step-item ${!squadraId ? '' : obiettivo ? 'step-done' : 'step-active'}`}>
              <button type="button" onClick={() => setObiettivo(null)}><span>03</span><strong>Obiettivo</strong></button>
            </li>
          </ol>
          <p className="rail-footnote">Ogni carriera è un salvataggio indipendente: stesso mondo, stato separato.</p>
        </aside>

        <div className="wizard-panel">
          {step === 'campionato' && (
            <div>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Passo 1 · Campionato</p>
                  <h2>Dove vuoi allenare?</h2>
                  <p>Solo i campionati europei con roster completo in FL26 (più Brasileirão, Liga Profesional, J1 League e Saudi Pro League). Le leghe con poche squadre nel gioco e i campionati extra-europei minori non sono selezionabili.</p>
                </div>
              </div>
              <div className="pick-list" role="listbox" aria-label="Campionati disponibili">
                {(campionati?.campionati ?? []).map((c) => (
                  <button key={c.nome} className="pick-row" type="button" onClick={() => setLega(c.nome)}>
                    <span className="team-row-mark">{c.demo ? 'D' : 'L'}</span>
                    <span>
                      <strong>{c.nome}</strong>
                      <small>{c.squadre.length} squadre{c.demo ? ' · lega demo' : ''}
                        {c.squadre.length < c.attese && ` · solo ${c.squadre.length}/${c.attese} in FL26`}
                      </small>
                    </span>
                    <span className="pick-arrow">→</span>
                  </button>
                ))}
                {(campionati?.campionati.length ?? 0) === 0 && (
                  <p className="empty-copy">Nessun campionato disponibile. Importa prima il database FL26 (Home → Importa database).</p>
                )}
              </div>
              {(campionati?.nazionali.length ?? 0) > 0 && (
                <div className="pick-list pick-list-nazionali">
                  <p className="eyebrow">Nazionali · {campionati?.nazionali.length ?? 0} selezionabili solo per la carriera internazionale</p>
                  {campionati?.nazionali.slice(0, 12).map((s) => (
                    <div key={s.id} className="pick-row pick-row-disabled" aria-disabled="true">
                      <span className="team-row-mark">N</span>
                      <span><strong>{s.nome}</strong><small>Europei e Mondiali in arrivo con la carriera da commissario tecnico</small></span>
                    </div>
                  ))}
                  {(campionati?.nazionali.length ?? 0) > 12 && <p className="empty-copy">… e altre {(campionati?.nazionali.length ?? 0) - 12} nazionali nel registro.</p>}
                </div>
              )}
            </div>
          )}

          {step === 'squadra' && lega && (
            <div>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Passo 2 · Squadra</p>
                  <h2>{lega}</h2>
                  <p>Seleziona il club: budget iniziale e fiducia dipendono da reputazione e campionato.</p>
                </div>
              </div>
              <div className="pick-list" role="listbox" aria-label="Squadre del campionato">
                {squadreLega.map((s) => (
                  <button key={s.id} className="pick-row" type="button" onClick={() => setSquadraId(s.id)}>
                    <span className="team-row-mark">{ratingInizialeCompleto(s.nome, s.mediaOverall, lega)}</span>
                    <span><strong>{s.nome}</strong><small>media rosa {Math.round(s.mediaOverall ?? 0)} · {budgetCarriera(s, lega, posizioni.get(s.id) ?? 1).toLocaleString('it-IT')} € di budget</small></span>
                    <span className="pick-arrow">→</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'obiettivo' && squadra && (
            <div>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Passo 3 · Obiettivo stagionale</p>
                  <h2>Che stagione prometti?</h2>
                  <p>L'obiettivo viene memorizzato sulla carriera: le attese del presidente misureranno i tuoi risultati dal motore fiducia.</p>
                </div>
              </div>
              <div className="pick-list" role="listbox" aria-label="Obiettivo stagionale">
                {OBIETTIVI.map((o) => (
                  <button key={o.valore} className="pick-row" type="button" onClick={() => setObiettivo(o.valore)}>
                    <span className="team-row-mark">{o.valore === 'titolo' ? '★' : o.valore === 'coppe' ? 'C' : o.valore === 'meta_classifica' ? '≈' : '↓'}</span>
                    <span><strong>{o.titolo}</strong><small>{o.descrizione}</small></span>
                    <span className="pick-arrow">→</span>
                  </button>
                ))}
              </div>
              <div className="wizard-actions">
                <button className="button button-quiet" type="button" onClick={() => setSquadraId(null)}>← Indietro</button>
                <button className="button button-primary button-large" type="button" onClick={() => void crea()}>Crea la carriera <span>→</span></button>
              </div>
              {errore && <p className="feedback feedback-error">{errore}</p>}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function BenvenutoMister({ esito, onStart }: { esito: EsitoCreazioneCarriera; onStart: () => void }): ReactElement {
  const { carriera } = esito;
  return (
    <main className="page-shell">
      <header className="topbar">
        <button className="brand-button" type="button">FLM <span>/ Nuova carriera</span></button>
        <span className="topbar-note">Carriera creata</span>
      </header>
      <section className="content-wrap result-page">
        <p className="eyebrow">Benvenuto mister</p>
        <h1>La panchina è tua, <em style={{ color: 'var(--signal-light)' }}>{carriera.nome.split(' · ')[0]}</em>.</h1>
        <p className="intro">Il salvataggio è pronto: calendario completo, spogliatoio al lavoro, settimana 1. In FL26 scegli la partita veloce e torna a inserire il referto.</p>

        <div className="summary-grid">
          <div className="summary-card"><strong>{carriera.campionato}</strong><span>Campionato</span></div>
          <div className="summary-card"><strong>{ETICHETTA_OBIETTIVO[carriera.obiettivo]}</strong><span>Obiettivo stagionale</span></div>
          <div className="summary-card"><strong>{esito.partite}</strong><span>Partite di stagione</span></div>
          <div className="summary-card"><strong>{esito.budget.toLocaleString('it-IT')} €</strong><span>Budget iniziale</span></div>
          <div className="summary-card"><strong>70</strong><span>Fiducia società</span></div>
          <div className="summary-card"><strong>Sett. 1</strong><span>Stato della carriera</span></div>
        </div>

        <div className="summary-detail">
          <span><strong style={{ color: 'var(--paper)' }}>Prima partita:</strong> {esito.primaPartita ? (esito.primaPartita.inCasa ? `${esito.primaPartita.casa} — ${esito.primaPartita.trasferta} (in casa)` : `${esito.primaPartita.trasferta} — ${esito.primaPartita.casa} (in trasferta)`) : 'alla giornata 1 del calendario'}.</span>
          <span><strong style={{ color: 'var(--paper)' }}>Rosa:</strong> {esito.giocatori} giocatori clonati ({esito.assegnazioni} assegnazioni).</span>
        </div>

        <button className="button button-primary button-large" type="button" onClick={onStart}>Inizia la stagione <span>→</span></button>
      </section>
    </main>
  );
}
