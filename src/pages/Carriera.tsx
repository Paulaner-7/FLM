// FLM — Vista carriera (placeholder).
// La dashboard vera (calendario settimanale, referti, classifica, morale) arriva
// con la prossima milestone: qui solo il guscio con i dati del salvataggio.

import { useEffect, useState, type ReactElement } from 'react';
import { db } from '../db';
import type { Carriera, Squadra, StatoClub } from '../types/entities';

interface CarrieraProps {
  carrieraId: string;
  onHome: () => void;
}

export default function Carriera({ carrieraId, onHome }: CarrieraProps): ReactElement {
  const [dati, setDati] = useState<{ carriera: Carriera; squadra: Squadra | undefined; stato: StatoClub | undefined } | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([db.carriere.get(carrieraId), db.squadre.toArray(), db.statoClub.get(carrieraId)]).then(
      ([carriera, squadre, stato]) => {
        if (!alive || !carriera) return;
        setDati({ carriera, squadra: squadre.find((s) => s.id === carriera.squadraId), stato });
      },
    );
    return () => {
      alive = false;
    };
  }, [carrieraId]);

  if (!dati) {
    return <main className="page-shell loading-page"><p>Caricamento carriera…</p></main>;
  }

  const { carriera, squadra, stato } = dati;

  return (
    <main className="page-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={onHome}>FLM <span>/ Carriera</span></button>
        <div className="topbar-actions">
          <span className="topbar-note">{carriera.campionato} · {carriera.stagione} · settimana {stato?.settimanaCorrente ?? 1}</span>
        </div>
      </header>
      <section className="content-wrap result-page">
        <p className="eyebrow">Salvataggio attivo</p>
        <h1>{squadra?.nome ?? carriera.nome}</h1>
        <p className="intro">La dashboard della carriera arriva con la prossima milestone: calendario settimanale, referti, classifica, morale e fiducia vivranno qui.</p>
        <div className="summary-grid">
          <div className="summary-card"><strong>{carriera.campionato}</strong><span>Campionato</span></div>
          <div className="summary-card"><strong>{stato?.budget.toLocaleString('it-IT') ?? '—'} €</strong><span>Budget</span></div>
          <div className="summary-card"><strong>{stato?.fiduciaSocieta ?? '—'}</strong><span>Fiducia società</span></div>
          <div className="summary-card"><strong>{stato?.fiduciaTifosi ?? '—'}</strong><span>Fiducia tifosi</span></div>
          <div className="summary-card"><strong>{stato?.settimanaCorrente ?? 1}</strong><span>Settimana</span></div>
          <div className="summary-card"><strong>{stato?.reputazioneAllenatore ?? '—'}</strong><span>Reputazione mister</span></div>
        </div>
        <button className="button button-outline button-large" type="button" onClick={onHome}>← Torna alla home</button>
      </section>
    </main>
  );
}
