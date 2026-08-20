// FLM — Pagina storico carriera: albo d'oro, mie stagioni, palmares personale (PRD 7.7).

import { useEffect, useState, type ReactElement } from 'react';
import { db } from '../db';
import HubTopbar from '../components/hub/HubTopbar';
import { accentiDaColori } from '../components/hub/accento';
import type { Carriera, Squadra, VoceStoricoStagione } from '../types/entities';

interface StoricoProps {
  carrieraId: string;
  onBack: () => void;
}

interface Palmares {
  tipo: string;
  count: number;
  dettagli: Array<{ stagione: string; nome: string }>;
}

export default function Storico({ carrieraId, onBack }: StoricoProps): ReactElement {
  const [voci, setVoci] = useState<VoceStoricoStagione[]>([]);
  const [carriera, setCarriera] = useState<Carriera | null>(null);
  const [squadra, setSquadra] = useState<Squadra | undefined>(undefined);
  const [caricamento, setCaricamento] = useState(true);

  useEffect(() => {
    void (async () => {
      const c = await db.carriere.get(carrieraId);
      setCarriera(c ?? null);
      if (c) {
        const sq = await db.squadre.get(c.squadraId);
        setSquadra(sq ?? undefined);
      }
      const vociDb = await db.storicoStagioni
        .where('carrieraId')
        .equals(carrieraId)
        .sortBy('stagione');
      setVoci(vociDb);
      setCaricamento(false);
    })();
  }, [carrieraId]);

  // Palmares personale aggregato
  const palmares: Palmares[] = [];
  for (const v of voci) {
    for (const t of v.trofeiVinti) {
      const esistente = palmares.find((p) => p.tipo === t.competizione);
      if (esistente) {
        esistente.count++;
        esistente.dettagli.push({ stagione: v.stagione, nome: t.nome });
      } else {
        palmares.push({
          tipo: t.competizione,
          count: 1,
          dettagli: [{ stagione: v.stagione, nome: t.nome }],
        });
      }
    }
  }
  palmares.sort((a, b) => b.count - a.count);

  // Albo d'oro (vincitori per competizione per stagione)
  const alboDoro = new Map<string, Array<{ stagione: string; vincitore: string }>>();
  for (const v of voci) {
    for (const a of v.alboDoro) {
      const lista = alboDoro.get(a.competizione) ?? [];
      lista.push({ stagione: v.stagione, vincitore: a.vincitore });
      alboDoro.set(a.competizione, lista);
    }
  }

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

  if (caricamento) return <div className="page-shell loading-page"><p>Caricamento…</p></div>;

  return (
    <main className="page-shell">
      <HubTopbar
        sezione="Storico"
        contesto={carriera?.stagione ?? ''}
        onBrand={onBack}
        onStorico={() => {}}
        onEsporta={() => {}}
        onHome={onBack}
        squadra={squadra ? { nome: squadra.nome, nazione: squadra.nazione, colori: squadra.colori } : undefined}
      />

      <section className="content-wrap">
      <p className="eyebrow">Storico carriera</p>
      <h1>Storico carriera</h1>
      {carriera?.conclusa && <p style={{color:'var(--signal-light)',fontSize:13}}>Carriera conclusa — visualizzazione in sola lettura.</p>}

      {/* Palmares personale */}
      <section className="palmares-section">
        <h2>Palmares personale</h2>
        {palmares.length > 0 ? (
          <div className="palmares-grid">
            {palmares.map((p) => (
              <div key={p.tipo} className="summary-card">
                <strong>{p.count}× {p.tipo.replace(/_/g, ' ')}</strong>
                <span>{p.dettagli.map((d) => d.stagione).join(', ')}</span>
              </div>
            ))}
          </div>
        ) : (
          <p>Nessun trofeo vinto ancora.</p>
        )}
      </section>

      {/* Mie stagioni */}
      <section className="stagioni-section">
        <h2>Le mie stagioni</h2>
        {voci.length > 0 ? (
          <table className="storico-table">
            <thead>
              <tr>
                <th>Stagione</th>
                <th>Squadra</th>
                <th>Campionato</th>
                <th>Pos.</th>
                <th>Obiettivo</th>
                <th>Rep.</th>
                <th>Esito</th>
              </tr>
            </thead>
            <tbody>
              {voci.map((v) => (
                <tr key={v.id}>
                  <td>{v.stagione}</td>
                  <td>{v.squadraNome}</td>
                  <td>{v.campionato}</td>
                  <td>{v.piazzamento ?? '—'}</td>
                  <td>{v.obiettivo} {v.obiettivoCentrato ? '✓' : '✗'}</td>
                  <td>{v.reputazioneFine}</td>
                  <td>{v.esito}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Nessuna stagione registrata ancora.</p>
        )}
      </section>

      {/* Albo d'oro */}
      <section className="albo-section">
        <h2>Albo d'oro</h2>
        {alboDoro.size > 0 ? (
          <div className="albo-grid">
            {[...alboDoro.entries()].map(([comp, lista]) => (
              <div key={comp} className="albo-card">
                <h3>{comp.replace(/_/g, ' ')}</h3>
                <ul>
                  {lista.map((l) => (
                    <li key={l.stagione}><strong>{l.stagione}</strong>: {l.vincitore}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p>Nessun vincitore registrato ancora.</p>
        )}
      </section>
      </section>
    </main>
  );
}
