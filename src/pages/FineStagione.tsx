// FLM — Pagina sequenza fine stagione: bilancio → carosello → offerte → esonero (PRD 7.7).
// Flusso guidato, riprendibile (stato su StatoClub.fineStagioneAperta).

import { useEffect, useState, type ReactElement } from 'react';
import {
  accettaOfferta,
  rifiutaOfferta,
  confermaFineStagione,
  iniziaStagioneSuccessiva,
  db,
  type EsitoRisoluzione,
} from '../db';
import HubTopbar from '../components/hub/HubTopbar';
import { accentiDaColori } from '../components/hub/accento';
import type { Squadra } from '../types/entities';

interface FineStagioneProps {
  carrieraId: string;
  esito: EsitoRisoluzione;
  onComplete: () => void;
  onHome: () => void;
}

type Step = 'bilancio' | 'carosello' | 'offerte' | 'completato';

export default function FineStagione({ carrieraId, esito, onComplete, onHome }: FineStagioneProps): ReactElement {
  const [step, setStep] = useState<Step>('bilancio');
  const [offerteRimaste, setOfferteRimaste] = useState(esito.offerte);
  const [inCorso, setInCorso] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [squadra, setSquadra] = useState<Squadra | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      const c = await db.carriere.get(carrieraId);
      if (c) {
        const sq = await db.squadre.get(c.squadraId);
        setSquadra(sq ?? undefined);
      }
    })();
  }, [carrieraId]);

  const prossimoStep = (): void => {
    if (step === 'bilancio') setStep('carosello');
    else if (step === 'carosello') setStep('offerte');
    else if (step === 'offerte') setStep('completato');
  };

  const handleAccetta = async (offertaId: string): Promise<void> => {
    setInCorso(true);
    setFeedback(null);
    try {
      await accettaOfferta(carrieraId, offertaId);
      setFeedback('Offerta accettata! Benvenuto nella nuova panchina.');
      // Dopo breve pausa, chiudi e vai alla home (la carriera continua con la nuova squadra)
      setTimeout(onComplete, 1500);
    } catch (e) {
      setFeedback(`Errore: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setInCorso(false);
    }
  };

  const handleRifiuta = async (offertaId: string): Promise<void> => {
    setInCorso(true);
    setFeedback(null);
    try {
      const gameOver = await rifiutaOfferta(carrieraId, offertaId);
      if (gameOver) {
        setFeedback('Carriera conclusa. Nessuna altra offerta disponibile.');
        setStep('completato');
      } else {
        setOfferteRimaste((prev) => prev.filter((o) => o.id !== offertaId));
      }
    } catch (e) {
      setFeedback(`Errore: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setInCorso(false);
    }
  };

  const handleConferma = async (): Promise<void> => {
    setInCorso(true);
    try {
      await confermaFineStagione(carrieraId);
      await iniziaStagioneSuccessiva(carrieraId);
      onComplete();
    } catch (e) {
      setFeedback(`Errore: ${e instanceof Error ? e.message : String(e)}`);
      setInCorso(false);
    }
  };

  // D8 — accento dinamico
  const primario = squadra?.colori?.primario;
  const secondario = squadra?.colori?.secondario;
  useEffect(() => {
    const root = document.documentElement;
    const { accent, accentStrong, onAccent } = accentiDaColori(
      primario && secondario ? { primario, secondario } : undefined,
    );
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-strong', accentStrong);
    root.style.setProperty('--on-accent', onAccent);
    return () => {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-strong');
      root.style.removeProperty('--on-accent');
    };
  }, [primario, secondario]);

  return (
    <main className="page-shell">
      <HubTopbar
        sezione="Fine Stagione"
        contesto={esito.storico.stagione}
        onBrand={onHome}
        onStorico={() => {}}
        onEsporta={() => {}}
        onHome={onHome}
        squadra={squadra ? { nome: squadra.nome, nazione: squadra.nazione, colori: squadra.colori } : undefined}
      />

      <section className="content-wrap result-page">
      <p className="eyebrow">Fine stagione</p>
      <h1>Fine stagione {esito.storico.stagione}</h1>

      {/* Step indicator */}
      <div className="step-indicator">
        {(['bilancio', 'carosello', 'offerte'] as Step[]).map((s, i) => (
          <span key={s} className={`step ${step === s ? 'step-active' : i < ['bilancio', 'carosello', 'offerte'].indexOf(step) ? 'step-done' : ''}`}>
            {i + 1}. {s === 'bilancio' ? 'Bilancio' : s === 'carosello' ? 'Carosello' : 'Offerte'}
          </span>
        ))}
      </div>

      {/* Step 1: Bilancio */}
      {step === 'bilancio' && (
        <section className="step-content">
          <h2>Bilancio stagionale</h2>
          <div className="bilancio-grid">
            <div className="summary-card">
              <strong>{esito.storico.piazzamento ?? '—'}ª</strong>
              <span>Posizione finale</span>
            </div>
            <div className="summary-card">
              <strong style={{ color: esito.reputazioneDelta >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                {esito.reputazioneDelta >= 0 ? '+' : ''}{esito.reputazioneDelta}
              </strong>
              <span>Reputazione ({esito.nuovaReputazione}/100)</span>
            </div>
            <div className="summary-card">
              <strong>{esito.storico.obiettivoCentrato ? '✓ Sì' : '✗ No'}</strong>
              <span>Obiettivo "{esito.storico.obiettivo}"</span>
            </div>
          </div>

          {esito.storico.trofeiVinti.length > 0 && (
            <div className="trofei-list">
              <h3>Trofei vinti</h3>
              <ul>
                {esito.storico.trofeiVinti.map((t) => (
                  <li key={t.competizione}>🏆 {t.competizione} ({t.nome})</li>
                ))}
              </ul>
            </div>
          )}

          <div className="albo-doro">
            <h3>Albo d'oro {esito.storico.stagione}</h3>
            <ul>
              {esito.storico.alboDoro.map((a) => (
                <li key={a.competizione}><strong>{a.competizione}</strong>: {a.vincitore}</li>
              ))}
            </ul>
          </div>

          <button className="button button-primary" type="button" onClick={prossimoStep}>
            Prossimo →
          </button>
        </section>
      )}

      {/* Step 2: Carosello */}
      {step === 'carosello' && (
        <section className="step-content">
          <h2>Carosello panchine</h2>
          {esito.carosello.length > 0 ? (
            <ul className="carosello-list">
              {esito.carosello.map((notizia, i) => (
                <li key={i}>📰 {notizia}</li>
              ))}
            </ul>
          ) : (
            <p>Nessun movimento degno di nota tra le altre squadre.</p>
          )}
          <button className="button button-primary" type="button" onClick={prossimoStep}>
            Prossimo →
          </button>
        </section>
      )}

      {/* Step 3: Offerte */}
      {step === 'offerte' && (
        <section className="step-content">
          <h2>
            {esito.esonerato ? 'Scegli una nuova panchina' : 'Offerte ricevute'}
          </h2>
          {esito.esonerato && (
            <p className="warning-text">
              La società ha deciso di esonerarti. Devi accettare una delle seguenti offerte per continuare la carriera.
            </p>
          )}

          {offerteRimaste.length > 0 ? (
            <div className="offerte-grid">
              {offerteRimaste.map((o) => (
                <div key={o.id} className={`offerta-card ${o.tipo === 'forzata' ? 'offerta-forzata' : ''}`}>
                  <h3>{o.obiettivoProposto}</h3>
                  <p className="offerta-meta">
                    Prestigio: {o.prestigio} · Tipo: {o.tipo}
                  </p>
                  <div className="offerta-azioni">
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={inCorso}
                      onClick={() => void handleAccetta(o.id)}
                    >
                      Accetta
                    </button>
                    {!esito.esonerato && (
                      <button
                        className="button button-outline"
                        type="button"
                        disabled={inCorso}
                        onClick={() => void handleRifiuta(o.id)}
                      >
                        Rifiuta
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>Nessuna offerta disponibile.</p>
          )}

          {feedback && <p className="feedback-text">{feedback}</p>}
        </section>
      )}

      {/* Step 4: Completato */}
      {step === 'completato' && (
        <section className="step-content">
          <h2>Stagione conclusa</h2>
          {feedback && <p className="feedback-text">{feedback}</p>}
          <button className="button button-primary" type="button" disabled={inCorso} onClick={handleConferma}>
            Avvia nuova stagione
          </button>
          <button className="button button-outline" type="button" onClick={onHome}>
            Torna alla home
          </button>
        </section>
      )}
      </section>
    </main>
  );
}
