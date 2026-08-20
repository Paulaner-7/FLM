// FLM — Pagina "Risultati del turno" (PRD 3.3): dopo il referto, i risultati
// della GIORNATA DI CAMPIONATO appena conclusa (solo la tua lega, es. Serie A).
// Gli altri campionati, coppe e classifiche speciali restano nella pagina
// Competizioni. Niente "torna indietro": il referto è immutabile (decisione utente).

import { useEffect, useState, type ReactElement } from 'react';
import { db } from '../db';
import type { EsitoConfermaReferto } from '../db';
import type { Id, Notizia, Partita, Squadra } from '../types/entities';

interface RisultatiTurnoProps {
  carrieraId: string;
  esito: EsitoConfermaReferto;
  squadraId: Id;
  squadre: Map<Id, Squadra>;
  /** Il campionato dell'utente (es. Serie A): solo i suoi risultati qui */
  campionatoId: Id;
  campionatoNome: string;
  /** Notizie del turno: null = generazione in corso, undefined = non richieste */
  notizie?: Notizia[] | null;
  onDashboard: () => void;
  /** Naviga all'hub Competizioni (tutti gli altri risultati e classifiche) */
  onCompetizioni: () => void;
}

export default function RisultatiTurno({
  carrieraId,
  esito,
  squadraId,
  squadre,
  campionatoId,
  campionatoNome,
  notizie,
  onDashboard,
  onCompetizioni,
}: RisultatiTurnoProps): ReactElement {
  const [partiteSettimana, setPartiteSettimana] = useState<Partita[]>([]);

  useEffect(() => {
    let attivo = true;
    void db.partite
      .where('carrieraId')
      .equals(carrieraId)
      .and((p) => p.settimana === esito.partita.settimana)
      .toArray()
      .then((tutte) => {
        if (attivo) {
          setPartiteSettimana(
            tutte.sort((a, b) => a.slot.localeCompare(b.slot) || a.id.localeCompare(b.id)),
          );
        }
      });
    return () => {
      attivo = false;
    };
  }, [carrieraId, esito]);

  const nome = (id: Id): string => squadre.get(id)?.nome ?? '—';

  // Solo il campionato dell'utente: una settimana = una giornata.
  const partiteCampionato = partiteSettimana.filter((p) => p.competizioneId === campionatoId);
  const giocate = partiteCampionato.filter((p) => p.giocata);
  const giornata = partiteCampionato.length > 0
    ? Math.max(...partiteCampionato.map((p) => p.giornata))
    : null;
  const miaInCampionato = giocate.some((p) => p.id === esito.partita.id);

  return (
    <main className="page-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={onDashboard}>FLM <span>/ Risultati</span></button>
        <div className="topbar-actions">
          <span className="topbar-note">Settimana {esito.partita.settimana}</span>
        </div>
      </header>

      <section className="content-wrap risultati-page">
        <p className="eyebrow">
          {giornata !== null ? `Giornata ${giornata} · ${campionatoNome}` : 'Settimana conclusa'}
        </p>
        <h1>Risultati della giornata</h1>
        <p className="intro">
          {miaInCampionato ? 'La tua partita è in evidenza. ' : 'Il tuo referto è registrato. '}
          {campionatoNome}
          {giornata !== null ? `, giornata ${giornata}` : ''}: gli altri risultati sono stati simulati
          sulla potenza delle squadre (rating Elo), con un tocco di varianza. Tutti gli altri campionati,
          coppe e classifiche speciali restano nella pagina Competizioni.
        </p>

        {/* Risultati della giornata di campionato */}
        {partiteCampionato.length === 0 ? (
          <div className="giornale-vuoto">
            Questa settimana non c'è una giornata di {campionatoNome}: tutte le altre partite
            (coppe e altri campionati) sono in pagina Competizioni.
          </div>
        ) : giocate.length === 0 ? (
          <div className="giornale-vuoto">
            La giornata di {campionatoNome} non è ancora conclusa: la tua partita di campionato è in
            programma più avanti in questa settimana. I risultati arriveranno dopo il tuo referto;
            nel frattempo trovi tutto il resto nella pagina Competizioni.
          </div>
        ) : (
          <div className="results-list">
            {giocate.map((p) => {
              const mia = p.casa === squadraId || p.trasferta === squadraId;
              const rigori = p.rigori ? ` (${p.rigori.casa}-${p.rigori.trasferta} rig.)` : '';
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
                    {rigori}
                  </div>
                  <div className="result-meta">
                    <span className="result-comp">{campionatoNome}</span>
                    {mia && <span className="status-pill status-ok">La tua partita</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Il giornale del giorno dopo (PRD 4.2): notizie del turno */}
        {notizie !== undefined && (
          <section className="giornale-sezione" aria-label="Il giornale del giorno dopo">
            <p className="eyebrow">Il giornale del giorno dopo</p>
            {notizie === null ? (
              <div className="giornale-loading" aria-live="polite">
                <span className="import-status-bar"><span /></span>
                <span>Il giornale si sta stampando…</span>
              </div>
            ) : notizie.length === 0 ? (
              <div className="giornale-vuoto">Nessuna notizia per questa settimana.</div>
            ) : (
              <ul className="giornale-lista">
                {notizie.map((n) => (
                  <li key={n.id} className="giornale-notizia">{n.testo}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        <div className="referto-actions risultati-actions">
          <button type="button" className="button button-primary button-large" onClick={onCompetizioni}>
            Tutte le altre competizioni<span>→</span>
          </button>
        </div>
      </section>
    </main>
  );
}
