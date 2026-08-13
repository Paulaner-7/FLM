// FLM — Pagina Rosa (PRD 3.2, modulo morale & spogliatoio).
// Morale e fiducia per giocatore, leader, promesse attive con progresso live,
// storico promesse e creazione manuale (flusso secondario: la richiesta del
// giocatore è il flusso primario, vedi dashboard). Nessun dato scritto qui:
// ogni azione passa da src/db (regola 1 AGENTS.md).

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  db,
  creaPromessa,
  promesseAttive,
  rosaDellaCarriera,
  setLeader,
} from '../db';
import {
  fasciaSpogliatoio,
  giocatoriInCrisi,
  minutiFinestra,
  moraleSpogliatoio,
  partiteGiocateFinestra,
  presenzeTitolareFinestra,
} from '../engine/morale';
import { LEADER_MAX, LEADER_MIN, PROMESSE_MAX_ATTIVE } from '../engine/rules';
import type { Carriera, Giocatore, Id, Partita, Promessa, Squadra, StatoClub } from '../types/entities';

interface DatiRosa {
  carriera: Carriera;
  squadra: Squadra;
  stato: StatoClub;
  rosa: Giocatore[];
  /** Partite GIÀ giocate della tua squadra (finestre promesse) */
  partiteSquadra: Partita[];
}

interface RosaProps {
  carrieraId: string;
  onBack: () => void;
}

/** Progresso live di una promessa attiva (trasparenza del binario mantenuta/tradita). */
function progressoPromessa(p: Promessa, g: Giocatore, partite: Partita[]): string {
  if (p.tipo === 'minuti') {
    const min = minutiFinestra(g.id, p.creata, p.scadenza, partite);
    return `${min} / ${p.soglia} minuti`;
  }
  const giocate = partiteGiocateFinestra(p.creata, p.scadenza, partite);
  const presenze = presenzeTitolareFinestra(g.id, p.creata, p.scadenza, partite);
  return `${presenze} / ${giocate} presenze da titolare (soglia ${p.soglia}%)`;
}

function coloreMorale(v: number): string {
  if (v < 30) return 'var(--signal)';
  if (v < 60) return 'var(--signal-light)';
  return 'var(--mint)';
}

function BarraStato({ valore }: { valore: number }): ReactElement {
  return (
    <span className="morale-bar" aria-hidden="true">
      <span
        className="morale-bar-fill"
        style={{ width: `${Math.max(0, Math.min(100, valore))}%`, background: coloreMorale(valore) }}
      />
    </span>
  );
}

export default function Rosa({ carrieraId, onBack }: RosaProps): ReactElement {
  const [dati, setDati] = useState<DatiRosa | null>(null);
  const [selezionato, setSelezionato] = useState<Id | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useCallback(async (): Promise<void> => {
    const [carriera, stato, partite] = await Promise.all([
      db.carriere.get(carrieraId),
      db.statoClub.get(carrieraId),
      db.partite.where('carrieraId').equals(carrieraId).toArray(),
    ]);
    if (!carriera || !stato) return;
    const squadra = await db.squadre.get(carriera.squadraId);
    if (!squadra) return;
    const rosa = (await rosaDellaCarriera(carrieraId, squadra.id)).sort(
      (a, b) => a.ruolo.localeCompare(b.ruolo, 'it') || b.overall - a.overall,
    );
    const partiteSquadra = partite.filter(
      (p) => p.giocata && (p.casa === squadra.id || p.trasferta === squadra.id),
    );
    setDati({ carriera, squadra, stato, rosa, partiteSquadra });
  }, [carrieraId]);

  useEffect(() => {
    let vivo = true;
    void carica().then(() => {
      if (vivo) setErrore(null);
    });
    return () => {
      vivo = false;
    };
  }, [carica]);

  if (!dati) {
    return <main className="page-shell loading-page"><p>Caricamento rosa…</p></main>;
  }

  const { carriera, squadra, stato, rosa, partiteSquadra } = dati;
  const medio = moraleSpogliatoio(rosa);
  const fascia = fasciaSpogliatoio(medio);
  const inCrisi = giocatoriInCrisi(rosa);
  const numeroLeader = rosa.filter((g) => g.leader).length;
  const totalePromesseAttive = rosa.reduce((acc, g) => acc + promesseAttive(g), 0);
  const selez = rosa.find((g) => g.id === selezionato) ?? null;

  const azione = async (fn: () => Promise<void>): Promise<void> => {
    setErrore(null);
    try {
      await fn();
      await carica();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Operazione fallita');
    }
  };

  return (
    <main className="page-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={onBack}>FLM <span>/ Rosa</span></button>
        <div className="topbar-actions">
          <span className="topbar-note">{carriera.campionato} · {carriera.stagione} · settimana {stato.settimanaCorrente}</span>
        </div>
      </header>

      <section className="content-wrap result-page carriera-page">
        <p className="eyebrow">Salvataggio attivo</p>
        <h1>{squadra.nome}</h1>
        <p className="intro">Morale, fiducia e promesse dei tuoi giocatori. La parola data pesa: le promesse scadute vengono valutate automaticamente.</p>

        <div className="summary-grid">
          <div className="summary-card">
            <strong>{medio}</strong>
            <span>Morale spogliatoio · {fascia}</span>
          </div>
          <div className="summary-card">
            <strong>{numeroLeader}/{LEADER_MAX}</strong>
            <span>Leader</span>
          </div>
          <div className="summary-card">
            <strong>{inCrisi.length}</strong>
            <span>Giocatori in crisi</span>
          </div>
          <div className="summary-card">
            <strong>{totalePromesseAttive}</strong>
            <span>Promesse attive</span>
          </div>
        </div>

        {errore && <p className="form-error">{errore}</p>}

        <div className="roster-table-wrap" style={{ marginTop: 28 }}>
          <table className="roster-table">
            <thead>
              <tr>
                <th>Giocatore</th>
                <th>Ruolo</th>
                <th>Età</th>
                <th>OVR</th>
                <th>Morale</th>
                <th>Fiducia</th>
                <th>Minuti</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {rosa.map((g) => (
                <tr
                  key={g.id}
                  className={selezionato === g.id ? 'rosa-riga-selezionata' : undefined}
                  onClick={() => setSelezionato(selezionato === g.id ? null : g.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <strong>{g.nome}</strong>
                    <small>{g.nazionalita}</small>
                  </td>
                  <td><span className="role-tag">{g.ruolo}</span></td>
                  <td>{g.eta}</td>
                  <td><strong className="overall">{g.overall}</strong></td>
                  <td>
                    <span className="stato-numero" style={{ color: coloreMorale(g.morale) }}>{g.morale}</span>
                    <BarraStato valore={g.morale} />
                  </td>
                  <td>
                    <span className="stato-numero">{g.fiducia}</span>
                    <BarraStato valore={g.fiducia} />
                  </td>
                  <td>{g.minutiStagione}</td>
                  <td>
                    <span className="rosa-badge-wrap">
                      {g.leader && <span className="status-pill status-leader">C</span>}
                      {g.morale < 30 && <span className="status-pill status-crisi">Crisi</span>}
                      {promesseAttive(g) > 0 && <span className="status-pill status-promessa">Promessa</span>}
                      {g.infortunioFinoA !== undefined && (
                        <span className="status-pill status-infortunio">Inf. fino a sett. {g.infortunioFinoA}</span>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selez && (
          <DettaglioGiocatore
            giocatore={selez}
            partiteSquadra={partiteSquadra}
            numeroLeader={numeroLeader}
            onAzione={azione}
          />
        )}

        <button className="button button-outline" type="button" onClick={onBack}>← Torna alla dashboard</button>
      </section>
    </main>
  );
}

function DettaglioGiocatore({
  giocatore: g,
  partiteSquadra,
  numeroLeader,
  onAzione,
}: {
  giocatore: Giocatore;
  partiteSquadra: Partita[];
  numeroLeader: number;
  onAzione: (fn: () => Promise<void>) => Promise<void>;
}): ReactElement {
  const attive = g.promesse.filter((p) => p.stato === 'attiva');
  const storiche = g.promesse.filter((p) => p.stato !== 'attiva');
  const puoiPromuovere = numeroLeader < LEADER_MAX;
  const puoiRevocare = numeroLeader > LEADER_MIN;
  const puoiCreare = promesseAttive(g) < PROMESSE_MAX_ATTIVE;

  return (
    <div className="giocatore-dettaglio">
      <div className="giocatore-dettaglio-head">
        <div>
          <p className="eyebrow">Dettaglio giocatore</p>
          <h2>{g.nome}</h2>
        </div>
        <div className="giocatore-dettaglio-ruoli">
          <span className="role-tag">{g.ruolo}</span>
          {g.leader && <span className="status-pill status-leader">Leader</span>}
          {g.morale < 30 && <span className="status-pill status-crisi">In crisi</span>}
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-card"><strong>{g.overall}</strong><span>Overall</span></div>
        <div className="summary-card"><strong style={{ color: coloreMorale(g.morale) }}>{g.morale}</strong><span>Morale</span></div>
        <div className="summary-card"><strong>{g.fiducia}</strong><span>Fiducia</span></div>
        <div className="summary-card"><strong>{g.forma}</strong><span>Forma</span></div>
        <div className="summary-card"><strong>{g.minutiStagione}</strong><span>Minuti stagione</span></div>
        <div className="summary-card"><strong>{g.eta}</strong><span>Età</span></div>
      </div>

      <div className="giocatore-dettaglio-sezione">
        <h3>Ruolo nello spogliatoio</h3>
        <p className="giocatore-dettaglio-copy">
          I leader amplificano il loro peso sul morale medio (×1,5). Spogliatoio tra {LEADER_MIN} e {LEADER_MAX} leader.
        </p>
        {g.leader ? (
          <button
            type="button"
            className="button button-outline button-small"
            disabled={!puoiRevocare}
            title={puoiRevocare ? undefined : `Minimo ${LEADER_MIN} leader`}
            onClick={() => void onAzione(() => setLeader(g.id, false))}
          >
            Revoca leader
          </button>
        ) : (
          <button
            type="button"
            className="button button-primary button-small"
            disabled={!puoiPromuovere}
            title={puoiPromuovere ? undefined : `Massimo ${LEADER_MAX} leader`}
            onClick={() => void onAzione(() => setLeader(g.id, true))}
          >
            Nomina leader
          </button>
        )}
      </div>

      <div className="giocatore-dettaglio-sezione">
        <h3>Promesse attive ({attive.length}/{PROMESSE_MAX_ATTIVE})</h3>
        {attive.length === 0 ? (
          <p className="giocatore-dettaglio-copy">Nessuna promessa attiva. I giocatori chiedono la maglia in dashboard; qui puoi promettere tu.</p>
        ) : (
          <ul className="promesse-lista">
            {attive.map((p) => (
              <li key={p.id}>
                <div className="promessa-riga">
                  <strong>{p.testo}</strong>
                  <span className="promessa-scadenza">scade settimana {p.scadenza}</span>
                </div>
                <span className="promessa-progresso">{progressoPromessa(p, g, partiteSquadra)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="promesse-crea">
          <span className="promesse-crea-label">Prometti tu (opzione secondaria):</span>
          <button
            type="button"
            className="button button-outline button-small"
            disabled={!puoiCreare}
            onClick={() => void onAzione(() => creaPromessa(g.id, 'titolare'))}
          >
            Sarai titolare
          </button>
          <button
            type="button"
            className="button button-outline button-small"
            disabled={!puoiCreare}
            onClick={() => void onAzione(() => creaPromessa(g.id, 'minuti'))}
          >
            Avrai i tuoi minuti
          </button>
          {!puoiCreare && <span className="promessa-limite">Massimo {PROMESSE_MAX_ATTIVE} attive</span>}
        </div>
      </div>

      {storiche.length > 0 && (
        <div className="giocatore-dettaglio-sezione">
          <h3>Storico promesse</h3>
          <ul className="promesse-lista">
            {[...storiche].reverse().map((p) => (
              <li key={p.id}>
                <div className="promessa-riga">
                  <strong>{p.testo}</strong>
                  <span className="promessa-scadenza">scaduta settimana {p.scadenza}</span>
                </div>
                <span className={`promessa-esito promessa-esito-${p.stato}`}>
                  {p.stato === 'mantenuta' ? 'Mantenuta' : 'Tradita'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
