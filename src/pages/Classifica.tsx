// FLM — Pagina Classifica (PRD 3.2, modulo "Classifica & statistiche").
// Solo consultazione: i numeri vengono da calcolaClassifica (src/engine),
// la UI non scrive nulla (regola 1 e 3 AGENTS.md).
// Colonna forma = ultime 5 partite giocate (pallini V/N/P, engine formaUltime5).

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { db } from '../db';
import { calcolaClassifica, formaUltime5, type SegnoForma } from '../engine/classifica';
import type { Carriera, Competizione, Squadra, StatoClub } from '../types/entities';

interface DatiClassifica {
  carriera: Carriera;
  squadra: Squadra;
  stato: StatoClub;
  competizione: Competizione;
  squadre: Map<string, Squadra>;
  /** Classifica calcolata dall'engine (pura, deterministico) */
  righe: ReturnType<typeof calcolaClassifica>;
  /** Partite della competizione: servono ai pallini forma */
  partiteCompetizione: Parameters<typeof formaUltime5>[0];
}

interface ClassificaProps {
  carrieraId: string;
  onBack: () => void;
}

function coloreForma(segno: SegnoForma): string {
  if (segno === 'V') return 'var(--mint)';
  if (segno === 'N') return '#70828a';
  return 'var(--signal)';
}

export default function Classifica({ carrieraId, onBack }: ClassificaProps): ReactElement {
  const [dati, setDati] = useState<DatiClassifica | null>(null);

  const carica = useCallback(async (): Promise<void> => {
    const [carriera, stato, competizioni, partite, squadreArr] = await Promise.all([
      db.carriere.get(carrieraId),
      db.statoClub.get(carrieraId),
      db.competizioni.toArray(),
      db.partite.where('carrieraId').equals(carrieraId).toArray(),
      db.squadre.toArray(),
    ]);
    if (!carriera || !stato) return;
    const squadra = squadreArr.find((s) => s.id === carriera.squadraId);
    if (!squadra) return;
    const competizione = competizioni.find((c) => c.carrieraId === carrieraId && c.tipo === 'campionato');
    if (!competizione) return;
    const partiteCompetizione = partite.filter((p) => p.competizioneId === competizione.id);
    setDati({
      carriera,
      squadra,
      stato,
      competizione,
      squadre: new Map(squadreArr.map((s) => [s.id, s])),
      righe: calcolaClassifica(partiteCompetizione, competizione.squadre),
      partiteCompetizione,
    });
  }, [carrieraId]);

  useEffect(() => {
    void carica();
  }, [carica]);

  if (!dati) {
    return <main className="page-shell loading-page"><p>Caricamento classifica…</p></main>;
  }

  const { carriera, squadra, stato, competizione, squadre, righe, partiteCompetizione } = dati;
  const nome = (id: string): string => squadre.get(id)?.nome ?? '—';

  return (
    <main className="page-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={onBack}>FLM <span>/ Classifica</span></button>
        <div className="topbar-actions">
          <span className="topbar-note">{carriera.campionato} · {carriera.stagione} · settimana {stato.settimanaCorrente}</span>
        </div>
      </header>

      <section className="content-wrap result-page carriera-page">
        <p className="eyebrow">Salvataggio attivo</p>
        <h1>Classifica</h1>
        <p className="intro">{competizione.nome} · {competizione.stagione}. La tua squadra è in evidenza; i pallini mostrano la forma delle ultime 5 partite giocate (V vittoria, N pareggio, P sconfitta).</p>

        <div className="standings-wrap">
          <table className="standings-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Squadra</th>
                <th>G</th>
                <th>V</th>
                <th>N</th>
                <th>P</th>
                <th>GF</th>
                <th>GS</th>
                <th>DR</th>
                <th>Punti</th>
                <th>Forma</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => {
                const forma = formaUltime5(partiteCompetizione, r.squadraId);
                return (
                  <tr key={r.squadraId} className={r.squadraId === squadra.id ? 'standings-user' : ''}>
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
                    <td>
                      <span className="forma-dots" role="img" aria-label={`Forma: ${forma.join(' ')}`} title={forma.join(' ')}>
                        {forma.map((segno, i) => (
                          <span
                            key={i}
                            className="forma-dot"
                            style={{ background: coloreForma(segno) }}
                            aria-hidden="true"
                          />
                        ))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button className="button button-outline" type="button" onClick={onBack}>← Torna alla dashboard</button>
      </section>
    </main>
  );
}
