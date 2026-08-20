// FLM — Pagina Calendario (PRD 7.1): vista stagionale cronologica in stile Carriera hub broadcast.
// Bento con KPI strip + timeline a card, accento dinamico.

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { db } from '../db';
import { segnoPartita } from '../engine/classifica';
import HubTopbar from '../components/hub/HubTopbar';
import { accentiDaColori } from '../components/hub/accento';
import { LogoSquadra } from '../media/componenti';
import styles from './Calendario.module.css';
import type { Carriera, Competizione, Partita, Squadra, StatoClub } from '../types/entities';

interface DatiCalendario {
  carriera: Carriera;
  squadra: Squadra;
  stato: StatoClub;
  squadre: Map<string, Squadra>;
  competizioni: Map<string, Competizione>;
  partiteMie: Array<Partita & { matchday: number }>;
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
      db.competizioni.where('carrieraId').equals(carrieraId).toArray(),
      db.partite.where('carrieraId').equals(carrieraId).toArray(),
      db.squadre.toArray(),
    ]);
    if (!carriera || !stato) return;
    const squadra = squadreArr.find((s) => s.id === carriera.squadraId);
    if (!squadra) return;
    const partiteMie = partite
      .filter((p) => p.casa === squadra.id || p.trasferta === squadra.id)
      .sort((a, b) => a.settimana - b.settimana || a.slot.localeCompare(b.slot) || a.giornata - b.giornata || a.id.localeCompare(b.id));
    const progressivi = new Map<string, number>();
    const partiteNumerate = partiteMie.map((p) => {
      const n = (progressivi.get(p.competizioneId) ?? 0) + 1;
      progressivi.set(p.competizioneId, n);
      return { ...p, matchday: n };
    });
    setDati({
      carriera,
      squadra,
      stato,
      squadre: new Map(squadreArr.map((s) => [s.id, s])),
      competizioni: new Map(competizioni.map((c) => [c.id, c])),
      partiteMie: partiteNumerate,
    });
  }, [carrieraId]);

  useEffect(() => { void carica(); }, [carica]);

  const primario = dati?.squadra.colori?.primario;
  const secondario = dati?.squadra.colori?.secondario;
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

  if (!dati) {
    return <main className="page-shell loading-page"><p>Caricamento calendario…</p></main>;
  }

  const { carriera, squadra, stato, squadre, competizioni, partiteMie } = dati;
  const nome = (id: string): string => squadre.get(id)?.nome ?? '—';
  const nomeComp = (id: string): string => competizioni.get(id)?.nome ?? '—';
  const prossima = partiteMie.find((p) => !p.giocata);

  const giocate = partiteMie.filter((p) => p.giocata);
  const vinte = giocate.filter((p) => segnoPartita(p, squadra.id) === 'V').length;
  const pari = giocate.filter((p) => segnoPartita(p, squadra.id) === 'N').length;
  const perse = giocate.filter((p) => segnoPartita(p, squadra.id) === 'P').length;
  const progresso = giocate.length > 0 ? Math.round((vinte * 3 + pari) / (giocate.length * 3) * 100) : 0;

  const giocateCount = giocate.length;
  const totali = partiteMie.length;

  return (
    <main className="page-shell">
      <HubTopbar
        sezione="Calendario"
        onBrand={onBack}
        onStorico={() => {}}
        onEsporta={() => {}}
        onHome={onBack}
        squadra={{ nome: squadra.nome, nazione: squadra.nazione, colori: squadra.colori }}
      />

      <div className={styles.hub}>
        <div className={styles.heading}>
          <p className="eyebrow">Salvataggio attivo · Settimana {stato.settimanaCorrente}</p>
          <h1>Calendario</h1>
          <p>
            Tutte le tue partite della stagione <strong>{carriera.stagione}</strong> — campionato, coppa ed Europa — in ordine cronologico.
            La card con bordo acceso è la prossima da giocare in FL26.
          </p>
        </div>

        <section className={styles.kpiStrip} aria-label="Riepilogo stagione">
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Stagione</span>
            <strong className={styles.kpiVal}>{carriera.stagione}<em>{carriera.campionato}</em></strong>
            <span className={styles.kpiBar}><span className={`${styles.kpiFill} ${styles.kpiFillAccent}`} style={{ width: `${Math.round((giocateCount/totali)*100)}%` }} /></span>
            <span className={styles.kpiHint}>{giocateCount} / {totali} giornate giocate</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Prossima</span>
            <strong className={styles.kpiVal}>{prossima ? nome(prossima.casa === squadra.id ? prossima.trasferta : prossima.casa) : '—'}<em>{prossima ? nomeComp(prossima.competizioneId) : 'Stagione conclusa'}</em></strong>
            <span className={styles.kpiBar}><span className={`${styles.kpiFill} ${styles.kpiFillMint}`} style={{ width: `${prossima ? 72 : 0}%` }} /></span>
            <span className={styles.kpiHint}>{prossima ? `Matchday ${prossima.giornata} · ${prossima.neutra ? 'neutro' : prossima.casa === squadra.id ? 'in casa' : 'trasferta'}` : 'Nessun impegno'}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Bilancio</span>
            <strong className={styles.kpiVal}>{vinte}V <span style={{ color: 'var(--paper-muted)' }}>{pari}N</span> {perse}P<em>{progresso}% efficienza</em></strong>
            <span className={styles.kpiBar}><span className={`${styles.kpiFill} ${styles.kpiFillPaper}`} style={{ width: `${progresso}%` }} /></span>
            <span className={styles.kpiHint}>{vinte} vittorie · {pari} pareggi · {perse} sconfitte</span>
          </div>
        </section>

        {partiteMie.length === 0 ? (
          <div className={styles.empty}>
            <strong>Nessuna partita</strong>
            <span>Il calendario non è ancora stato generato per questa carriera.</span>
          </div>
        ) : (
          <div className={styles.list} role="list" aria-label="Partite">
            {partiteMie.map((p) => {
              const inCasa = p.casa === squadra.id;
              const avId = inCasa ? p.trasferta : p.casa;
              const golMiei = inCasa ? p.golCasa : p.golTrasferta;
              const golAvv = inCasa ? p.golTrasferta : p.golCasa;
              const isCurrent = p.id === prossima?.id;
              const segno = p.giocata ? segnoPartita(p, squadra.id) : undefined;
              const gambaLabel = p.gamba === 1 ? 'andata' : p.gamba === 2 ? 'ritorno' : '';
              const comp = competizioni.get(p.competizioneId);
              return (
                <div key={p.id} role="listitem" className={`${styles.row} ${isCurrent ? styles.rowCurrent : ''}`}>
                  {isCurrent && <span className={styles.rowCurrentBadge}>Prossima</span>}
                  <div className={styles.matchday}>
                    <span className={styles.compPill}>{nomeComp(p.competizioneId)}</span>
                    <span className={styles.matchdayNum}>MD {p.matchday}<em>{p.fase.replace(/_/g,' ')} {gambaLabel}</em></span>
                    {comp?.tipo !== 'campionato' && p.slot === 'infrasettimanale' && <span className={styles.phase}>infrasettimanale</span>}
                    <span className={`${styles.venue} ${inCasa ? styles.venueCasa : ''}`}>
                      {p.neutra ? '⊜ neutro' : inCasa ? '⌂ casa' : '✈ trasferta'}
                    </span>
                  </div>

                  <div className={styles.opponent}>
                    <LogoSquadra
                      nome={squadre.get(avId)?.nome ?? ''}
                      nazione={squadre.get(avId)?.nazione}
                      colori={squadre.get(avId)?.colori}
                      className={styles.logo}
                    />
                    <div className={styles.oppText}>
                      <span className={styles.oppName}>{nome(avId)}</span>
                      <span className={styles.oppMeta}>
                        {comp?.nome ?? ''} · {p.giocata ? 'giocata' : 'da giocare'}
                        {p.neutra ? ' · neutro' : ''}
                      </span>
                    </div>
                  </div>

                  {p.giocata ? (
                    <span
                      className={`${styles.result} ${segno === 'V' ? styles.resultV : segno === 'N' ? styles.resultN : styles.resultP}`}
                      title={`${golMiei}–${golAvv}${p.rigori ? ` (${p.rigori.casa}-${p.rigori.trasferta} rig.)` : ''}`}
                      style={segno ? { color: coloreEsito(segno) } : undefined}
                    >
                      {golMiei}–{golAvv}
                      {p.rigori && <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.85 }}>({p.rigori.casa}-{p.rigori.trasferta} r.)</span>}
                    </span>
                  ) : (
                    <span className={styles.daGiocare}>Da giocare</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
