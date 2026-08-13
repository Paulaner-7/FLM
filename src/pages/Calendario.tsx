// FLM — Pagina Calendario (PRD 3.2): le tue partite di campionato per giornata,
// con risultato se giocate, più gli slot infrasettimanali vuoti pronti per le
// coppe (M4). Solo consultazione: nessuna scrittura qui (regola 1 AGENTS.md).
// Il segno V/N/P di una partita viene dall'engine (segnoPartita, pura).

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { db } from '../db';
import { segnoPartita } from '../engine/classifica';
import type { Carriera, Competizione, Partita, Squadra, StatoClub } from '../types/entities';

interface DatiCalendario {
  carriera: Carriera;
  squadra: Squadra;
  stato: StatoClub;
  competizione: Competizione;
  squadre: Map<string, Squadra>;
  /** Le tue partite di campionato, in ordine di giornata */
  partiteMie: Partita[];
  /** Ultima giornata del girone (limite dello scheletro stagionale) */
  maxGiornata: number;
  /** Giornata della prossima partita da giocare (evidenziata), null se stagione finita */
  prossimaGiornata: number | null;
}

interface CalendarioProps {
  carrieraId: string;
  onBack: () => void;
}

function coloreEsito(segno: 'V' | 'N' | 'P'): string {
  if (segno === 'V') return 'var(--mint)';
  if (segno === 'N') return 'var(--paper-muted)';
  return 'var(--signal)';
}

export default function Calendario({ carrieraId, onBack }: CalendarioProps): ReactElement {
  const [dati, setDati] = useState<DatiCalendario | null>(null);

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
    const partiteMie = partiteCompetizione
      .filter((p) => p.casa === squadra.id || p.trasferta === squadra.id)
      .sort((a, b) => a.giornata - b.giornata);
    const maxGiornata = partiteCompetizione.reduce((max, p) => Math.max(max, p.giornata), 0);
    const prossima = partiteMie.find((p) => !p.giocata);
    setDati({
      carriera,
      squadra,
      stato,
      competizione,
      squadre: new Map(squadreArr.map((s) => [s.id, s])),
      partiteMie,
      maxGiornata,
      prossimaGiornata: prossima?.giornata ?? null,
    });
  }, [carrieraId]);

  useEffect(() => {
    void carica();
  }, [carica]);

  if (!dati) {
    return <main className="page-shell loading-page"><p>Caricamento calendario…</p></main>;
  }

  const { carriera, squadra, stato, competizione, squadre, partiteMie, maxGiornata, prossimaGiornata } = dati;
  const nome = (id: string): string => squadre.get(id)?.nome ?? '—';

  // Una riga per giornata: in un girone all'italiana hai al più una partita per
  // turno; gestiamo comunque il caso di più partite (difensivo, M4 coppe).
  const perGiornata = (g: number): Partita[] => partiteMie.filter((p) => p.giornata === g);

  return (
    <main className="page-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={onBack}>FLM <span>/ Calendario</span></button>
        <div className="topbar-actions">
          <span className="topbar-note">{carriera.campionato} · {carriera.stagione} · settimana {stato.settimanaCorrente}</span>
        </div>
      </header>

      <section className="content-wrap result-page carriera-page">
        <p className="eyebrow">Salvataggio attivo</p>
        <h1>Calendario</h1>
        <p className="intro">{competizione.nome} · {competizione.stagione}. La giornata evidenziata è la prossima da giocare; gli slot infrasettimanali ospiteranno le coppe (M4).</p>

        {maxGiornata === 0 ? (
          <div className="empty-roster">
            <strong>Nessuna partita</strong>
            <span>Il calendario non è ancora stato generato per questa carriera.</span>
          </div>
        ) : (
          <div className="calendario-list">
            {Array.from({ length: maxGiornata }, (_, i) => i + 1).map((g) => {
              const partite = perGiornata(g);
              const corrente = g === prossimaGiornata;
              return (
                <div key={g}>
                  {partite.length === 0 ? (
                    <div className={`cal-row ${corrente ? 'cal-corrente' : ''}`}>
                      <span className="cal-giornata">G {g}</span>
                      <span className="cal-avversario cal-avversario-senza">Turno di riposo</span>
                    </div>
                  ) : (
                    partite.map((p) => {
                      const inCasa = p.casa === squadra.id;
                      const avversaria = inCasa ? p.trasferta : p.casa;
                      const golMiei = inCasa ? p.golCasa : p.golTrasferta;
                      const golAvversari = inCasa ? p.golTrasferta : p.golCasa;
                      const segno = segnoPartita(p, squadra.id);
                      const esitoLabel = segno === 'V' ? 'Vittoria' : segno === 'N' ? 'Pareggio' : 'Sconfitta';
                      return (
                        <div key={p.id} className={`cal-row ${corrente ? 'cal-corrente' : ''}`}>
                          <span className="cal-giornata">G {g}</span>
                          <span className="cal-sede cal-sede-casa" aria-hidden="true">{inCasa ? 'Casa' : 'Trasferta'}</span>
                          <span className="cal-avversario">{nome(avversaria)}</span>
                          {p.giocata ? (
                            <span
                              className="cal-esito"
                              style={{ color: coloreEsito(segno) }}
                              title={`${esitoLabel} ${golMiei}–${golAvversari}`}
                            >
                              {golMiei}–{golAvversari}
                            </span>
                          ) : (
                            <span className="cal-da-giocare">Da giocare</span>
                          )}
                        </div>
                      );
                    })
                  )}
                  {g < maxGiornata && (
                    <div className="cal-midweek" aria-hidden="true">
                      Infrasettimana · Coppa nazionale — disponibile da M4
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button className="button button-outline" type="button" onClick={onBack}>← Torna alla dashboard</button>
      </section>
    </main>
  );
}
