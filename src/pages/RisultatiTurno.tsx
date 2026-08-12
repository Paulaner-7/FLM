// FLM — Pagina "Risultati del turno" (PRD 3.3): risultati della giornata appena
// confermata + classifica aggiornata. Qui vive anche il pulsante "Torna indietro":
// annulla il referto entro lo stesso turno (rollback totale, PRD + task).

import { useState, type ReactElement } from 'react';
import { annullaReferto, type EsitoConfermaReferto } from '../db';
import type { Id, Squadra } from '../types/entities';

interface RisultatiTurnoProps {
  carrieraId: string;
  esito: EsitoConfermaReferto;
  squadraId: Id;
  squadre: Map<Id, Squadra>;
  /** Giornata del turno appena giocato */
  giornata: number;
  competizioneNome: string;
  onTornaIndietro: () => void;
  onDashboard: () => void;
}

export default function RisultatiTurno({
  carrieraId,
  esito,
  squadraId,
  squadre,
  giornata,
  competizioneNome,
  onTornaIndietro,
  onDashboard,
}: RisultatiTurnoProps): ReactElement {
  const [annullamento, setAnnullamento] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const nome = (id: Id): string => squadre.get(id)?.nome ?? '—';

  const tornaIndietro = async (): Promise<void> => {
    setAnnullamento(true);
    setErrore(null);
    try {
      await annullaReferto({ carrieraId, partitaId: esito.partita.id });
      onTornaIndietro();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore durante l\'annullamento');
      setAnnullamento(false);
    }
  };

  return (
    <main className="page-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={onDashboard}>FLM <span>/ Risultati</span></button>
        <div className="topbar-actions">
          <span className="topbar-note">{competizioneNome} · giornata {giornata}</span>
        </div>
      </header>

      <section className="content-wrap risultati-page">
        <p className="eyebrow">Turno concluso</p>
        <h1>Risultati del turno</h1>
        <p className="intro">La tua partita è in evidenza. Il resto del turno è stato simulato sulla potenza delle squadre (rating Elo), con un tocco di varianza.</p>

        {/* Risultati */}
        <div className="results-list">
          {esito.turno.map((p) => {
            const mia = p.casa === squadraId || p.trasferta === squadraId;
            return (
              <div key={p.id} className={`result-row ${mia ? 'result-row-mia' : ''}`}>
                <div className="result-teams">
                  <span className={p.casa === squadraId ? 'result-user' : ''}>{nome(p.casa)}</span>
                  <span className="result-sep">–</span>
                  <span className={p.trasferta === squadraId ? 'result-user' : ''}>{nome(p.trasferta)}</span>
                </div>
                <div className="result-score">
                  <strong>{p.golCasa}</strong>
                  <span>–</span>
                  <strong>{p.golTrasferta}</strong>
                </div>
                {mia && <span className="status-pill status-ok">La tua partita</span>}
              </div>
            );
          })}
        </div>

        {/* Classifica */}
        <h2 className="risultati-h2">Classifica</h2>
        <div className="standings-wrap">
          <table className="standings-table">
            <thead>
              <tr>
                <th>#</th><th>Squadra</th><th>G</th><th>V</th><th>N</th><th>P</th><th>GF</th><th>GS</th><th>DR</th><th>Punti</th>
              </tr>
            </thead>
            <tbody>
              {esito.classifica.map((r) => (
                <tr key={r.squadraId} className={r.squadraId === squadraId ? 'standings-user' : ''}>
                  <td>{r.posizione}</td>
                  <td className="standings-nome">{nome(r.squadraId)}</td>
                  <td>{r.giocate}</td>
                  <td>{r.vinte}</td>
                  <td>{r.pareggiate}</td>
                  <td>{r.perse}</td>
                  <td>{r.golFatti}</td>
                  <td>{r.golSubiti}</td>
                  <td>{r.differenzaReti > 0 ? `+${r.differenzaReti}` : r.differenzaReti}</td>
                  <td className="standings-punti">{r.punti}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {errore && <p className="feedback feedback-error">{errore}</p>}
        <div className="referto-actions risultati-actions">
          <button type="button" className="button button-outline" disabled={annullamento} onClick={() => void tornaIndietro()}>
            {annullamento ? 'Annullamento…' : '← Torna indietro'}
          </button>
          <button type="button" className="button button-primary button-large" onClick={onDashboard}>
            Torna alla dashboard
          </button>
        </div>
      </section>
    </main>
  );
}
