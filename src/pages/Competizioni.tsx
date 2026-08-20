// FLM — Hub Competizioni broadcast (PRD 7.1) — stile Carriera
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { db } from '../db';
import {
  classificaLeaguePhase,
  classificaMarcatori,
  classificaAssist,
  classificaGolAssist,
  classificaVotoMedio,
  classificaPortaInviolata,
  classificaRossi,
  nomeFaseLeggibile,
} from '../engine/competizioni';
import { calcolaClassifica, type RigaClassifica } from '../engine/classifica';
import HubTopbar from '../components/hub/HubTopbar';
import { accentiDaColori } from '../components/hub/accento';
import styles from './Competizioni.module.css';
import type { Carriera, Competizione, Giocatore, Id, Partita, PrestazionePartita, Squadra } from '../types/entities';

interface CompetizioniProps {
  carrieraId: string;
  onBack: () => void;
}

interface DatiHub {
  carriera: Carriera;
  squadra: Squadra | undefined;
  competizioni: Competizione[];
  squadre: Map<Id, Squadra>;
  giocatori: Map<Id, Giocatore>;
}

export default function Competizioni({ carrieraId, onBack }: CompetizioniProps): ReactElement {
  const [dati, setDati] = useState<DatiHub | null>(null);
  const [selezionata, setSelezionata] = useState<Id | null>(null);

  useEffect(() => {
    let attivo = true;
    void (async () => {
      const [carriera, competizioni, squadre, giocatori] = await Promise.all([
        db.carriere.get(carrieraId),
        db.competizioni.where('carrieraId').equals(carrieraId).toArray(),
        db.squadre.where('carrieraId').equals(carrieraId).toArray(),
        db.giocatori.where('carrieraId').equals(carrieraId).toArray(),
      ]);
      if (!attivo || !carriera) return;
      const squadreMap = new Map(squadre.map((s) => [s.id, s]));
      setDati({
        carriera,
        squadra: squadreMap.get(carriera.squadraId),
        competizioni: competizioni.sort((a, b) => {
          const ordine: Record<string, number> = { campionato: 0, supercoppa: 1, coppa_nazionale: 2, champions_league: 3, europa_league: 4, conference_league: 5 };
          return (ordine[a.tipo] ?? 9) - (ordine[b.tipo] ?? 9) || a.nome.localeCompare(b.nome, 'it');
        }),
        squadre: squadreMap,
        giocatori: new Map(giocatori.map((g) => [g.id, g])),
      });
    })();
    return () => { attivo = false; };
  }, [carrieraId]);

  const primario = dati?.squadra?.colori?.primario;
  const secondario = dati?.squadra?.colori?.secondario;
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
    return <main className="page-shell loading-page"><p>Caricamento competizioni…</p></main>;
  }

  const { carriera, squadra } = dati;
  const competizione = dati.competizioni.find((c) => c.id === selezionata) ?? null;

  const giocateTotali = useMemo(() => dati.competizioni.reduce((acc, c) => acc + c.squadre.length, 0), [dati.competizioni]);

  return (
    <main className="page-shell">
      <HubTopbar
        sezione="Competizioni"
        onBrand={onBack}
        onStorico={() => {}}
        onEsporta={() => {}}
        onHome={onBack}
        squadra={squadra ? { nome: squadra.nome, nazione: squadra.nazione, colori: squadra.colori } : undefined}
      />

      <div className={styles.hub}>
        {competizione === null ? (
          <>
            <div className={styles.heading}>
              <p className="eyebrow">Stagione {carriera.stagione} · {dati.competizioni.length} competizioni</p>
              <h1>Competizioni</h1>
              <p>Classifiche, league phase, tabelloni e classifiche speciali. Tocca una card per entrare nel dettaglio broadcast.</p>
            </div>

            <section className={styles.kpiStrip} aria-label="Riepilogo">
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Competizioni attive</span>
                <strong className={styles.kpiVal}>{dati.competizioni.length}<em>{dati.competizioni.filter((c)=>c.fase!=='conclusa').length} in corso</em></strong>
                <span className={styles.kpiHint}>{dati.competizioni.map(c=>c.nome).slice(0,2).join(' · ')}</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Squadre coinvolte</span>
                <strong className={styles.kpiVal}>{giocateTotali}<em>rose</em></strong>
                <span className={styles.kpiHint}>Campionato + coppe nazionali ed europee</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Club</span>
                <strong className={styles.kpiVal}>{squadra?.nome ?? '—'}<em>{carriera.campionato}</em></strong>
                <span className={styles.kpiHint}>Stagione {carriera.stagione}</span>
              </div>
            </section>

            <div className={styles.grid} role="list">
              {dati.competizioni.map((c) => {
                const conclusa = c.fase === 'conclusa';
                return (
                  <button key={c.id} type="button" className={styles.tile} onClick={() => setSelezionata(c.id)} role="listitem">
                    <span className={styles.tileMeta}>
                      <span className={`${styles.dot} ${conclusa ? styles.dotConclusa : ''}`} aria-hidden />
                      {conclusa ? 'Conclusa' : nomeFaseLeggibile(c.fase as never)}
                    </span>
                    <strong>{c.nome}</strong>
                    <span style={{ color: 'var(--paper-muted)', fontSize: 11 }}>{c.squadre.length} squadre · {c.formato.replace(/_/g,' ')}</span>
                    <div className={styles.tileFoot}>
                      <span>{conclusa && c.vincitoreId ? `Vincitrice: ${dati.squadre.get(c.vincitoreId)?.nome ?? '—'}` : 'Apri dettaglio →'}</span>
                      <span className={styles.tileArrow}>›</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <DettaglioCompetizione
            carrieraId={carrieraId}
            competizione={competizione}
            dati={dati}
            onIndietro={() => setSelezionata(null)}
          />
        )}
      </div>
    </main>
  );
}

function DettaglioCompetizione({
  carrieraId,
  competizione,
  dati,
  onIndietro,
}: {
  carrieraId: string;
  competizione: Competizione;
  dati: DatiHub;
  onIndietro: () => void;
}): ReactElement {
  const [partite, setPartite] = useState<Partita[]>([]);
  const [prestazioni, setPrestazioni] = useState<PrestazionePartita[]>([]);
  const [tab, setTab] = useState<'classifica' | 'tabellone' | 'sorteggio' | 'speciali'>('classifica');

  useEffect(() => {
    let attivo = true;
    void (async () => {
      const [p, pr] = await Promise.all([
        db.partite.where('competizioneId').equals(competizione.id).toArray(),
        db.prestazioni.where('competizioneId').equals(competizione.id).toArray(),
      ]);
      if (attivo) {
        setPartite(p.sort((a, b) => a.giornata - b.giornata || a.id.localeCompare(b.id)));
        setPrestazioni(pr);
      }
    })();
    return () => { attivo = false; };
  }, [carrieraId, competizione.id]);

  const nome = (id: Id): string => dati.squadre.get(id)?.nome ?? '—';
  const nomeGiocatore = (id: Id): string => dati.giocatori.get(id)?.nome ?? '—';
  const squadraGiocatore = new Map(prestazioni.map((p) => [p.giocatoreId, p.squadraId]));
  const nomiGiocatori = new Map<string, string>();
  for (const g of dati.giocatori.values()) nomiGiocatori.set(g.id, g.nome);
  const squadreGiocatori = new Map<string, Id>();
  for (const p of prestazioni) if (!squadreGiocatori.has(p.giocatoreId)) squadreGiocatori.set(p.giocatoreId, p.squadraId);
  const portieri = new Set([...dati.giocatori.values()].filter((g) => g.ruolo === 'portiere').map((g) => g.id));

  const giocate = partite.filter((p) => p.giocata);

  const classificaTipo = (): RigaClassifica[] | ReturnType<typeof classificaLeaguePhase> => {
    if (competizione.formato === 'league_phase') {
      const lp = giocate.filter((p) => p.fase === 'league_phase');
      const coefficienti = new Map(competizione.squadre.map((s) => [s, dati.squadre.get(s)?.coefficiente ?? 0]));
      const disciplinari = new Map<string, number>();
      const perGiocatore = new Map<string, number>();
      for (const p of prestazioni) {
        perGiocatore.set(p.giocatoreId, (perGiocatore.get(p.giocatoreId) ?? 0) + (p.giallo ? 1 : 0) + (p.rosso ? 3 : 0));
      }
      for (const [squadraId, rosa] of dati.giocatori) {
        let tot = 0;
        for (const g of [rosa]) tot += perGiocatore.get(g.id) ?? 0;
        disciplinari.set(squadraId, tot);
      }
      return classificaLeaguePhase(lp, competizione.squadre, coefficienti, disciplinari);
    }
    return calcolaClassifica(giocate, competizione.squadre);
  };

  const tabelloneFasi = ['playoff_qualificazione', 'playoff', 'ottavi', 'quarti', 'semifinali', 'finale'];
  const partiteKo = partite.filter((p) => tabelloneFasi.includes(p.fase));

  return (
    <>
      <button className={styles.back} type="button" onClick={onIndietro}>← Tutte le competizioni</button>
      <div className={styles.titleRow}>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:'clamp(32px,4vw,52px)', color:'var(--paper)', margin:0 }}>{competizione.nome}</h1>
        <span className={styles.titleBadge}>{competizione.tipo === 'campionato' ? 'Campionato' : nomeFaseLeggibile(competizione.fase as never)}</span>
      </div>
      <p style={{ color:'var(--paper-muted)', fontSize:13, margin:'6px 0 0' }}>{competizione.squadre.length} squadre · formato {competizione.formato.replace(/_/g,' ')}</p>

      <div className={styles.tabs} role="group" aria-label="Viste competizione">
        <button type="button" className={`${styles.tab} ${tab === 'classifica' ? styles.tabActive : ''}`} onClick={() => setTab('classifica')}>Classifica</button>
        {partiteKo.length > 0 && (
          <button type="button" className={`${styles.tab} ${tab === 'tabellone' ? styles.tabActive : ''}`} onClick={() => setTab('tabellone')}>Tabellone</button>
        )}
        {competizione.fasce && competizione.fasce.length > 0 && (
          <button type="button" className={`${styles.tab} ${tab === 'sorteggio' ? styles.tabActive : ''}`} onClick={() => setTab('sorteggio')}>Sorteggio</button>
        )}
        <button type="button" className={`${styles.tab} ${tab === 'speciali' ? styles.tabActive : ''}`} onClick={() => setTab('speciali')}>Speciali</button>
      </div>

      {tab === 'classifica' && (
        <div className={styles.wrap}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th><th>Squadra</th><th>G</th><th>V</th><th>N</th><th>P</th><th>GF</th><th>GS</th><th>DR</th><th>Punti</th>
                </tr>
              </thead>
              <tbody>
                {classificaTipo().map((r) => (
                  <tr key={r.squadraId} className={competizione.formato === 'league_phase' && (r as { qualificazione?: string }).qualificazione === 'eliminata' ? styles.out : ''}>
                    <td>{r.posizione}</td>
                    <td className={styles.nome}>{nome(r.squadraId)}</td>
                    <td>{r.giocate}</td>
                    <td>{r.vinte}</td>
                    <td>{r.pareggiate}</td>
                    <td>{r.perse}</td>
                    <td>{r.golFatti}</td>
                    <td>{r.golSubiti}</td>
                    <td>{r.differenzaReti > 0 ? `+${r.differenzaReti}` : r.differenzaReti}</td>
                    <td className={styles.punti}>{r.punti}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {competizione.formato === 'league_phase' && (
            <p className={styles.hint}>
              League phase: 1ª–8ª agli ottavi · 9ª–24ª ai playoff · 25ª–36ª eliminate.
              {competizione.fase === 'conclusa' && competizione.vincitoreId && (
                <> Vincitrice: <strong style={{ color:'var(--paper)' }}>{nome(competizione.vincitoreId)}</strong>.</>
              )}
            </p>
          )}
        </div>
      )}

      {tab === 'tabellone' && (
        <div className={styles.bracket}>
          {tabelloneFasi.map((fase) => {
            const dellaFase = partiteKo.filter((p) => p.fase === fase);
            if (dellaFase.length === 0) return null;
            const perSfida = new Map<number, Partita[]>();
            for (const p of dellaFase) {
              const lista = perSfida.get(p.giornata) ?? [];
              lista.push(p);
              perSfida.set(p.giornata, lista);
            }
            return (
              <section key={fase} className={styles.round}>
                <p className={styles.roundHead}>{nomeFaseLeggibile(fase as never)}</p>
                {[...perSfida.entries()].sort((a, b) => a[0] - b[0]).map(([n, sfida]) => {
                  const andata = sfida.find((p) => p.gamba === 1) ?? sfida[0]!;
                  const ritorno = sfida.find((p) => p.gamba === 2);
                  const totale1 = (andata.golCasa || 0) + (ritorno?.golCasa ?? 0);
                  const totale2 = (andata.golTrasferta || 0) + (ritorno?.golTrasferta ?? 0);
                  const rigori = ritorno?.rigori ?? andata.rigori;
                  return (
                    <div key={n} className={`${styles.tie} ${andata.giocata ? '' : styles.tieTbd}`}>
                      <strong className={styles.team}>{nome(andata.casa)}</strong>
                      <span className={styles.score}>
                        {andata.giocata ? `${totale1}–${totale2}` : '–'}
                        {rigori && ` (${rigori.casa}-${rigori.trasferta} rig.)`}
                      </span>
                      <strong className={styles.team}>{nome(andata.trasferta)}</strong>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      {tab === 'sorteggio' && competizione.fasce && (
        <div className={styles.draw}>
          {competizione.fasce.map((fascia, i) => (
            <section key={i} className={styles.pot}>
              <p className={styles.potTitle}>Fascia {i + 1}</p>
              <ul style={{ listStyle:'none', margin:0, padding:0 }}>
                {fascia.map((id) => (
                  <li key={id}><span>{nome(id)}</span> <small>coeff. {dati.squadre.get(id)?.coefficiente ?? '—'}</small></li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {tab === 'speciali' && (
        <div>
          <h2 style={{ fontFamily:'var(--font-display)', color:'var(--paper)', fontSize:'clamp(22px,3vw,30px)', margin:'6px 0 14px' }}>Classifiche speciali</h2>
          <div className={styles.specialiGrid}>
            <ClassificaSpeciale titolo="Marcatori" righe={classificaMarcatori(prestazioni, nomiGiocatori, squadreGiocatori).slice(0, 10)} nome={nomeGiocatore} squadra={(id) => nome(squadraGiocatore.get(id) ?? '')} valore={(r) => String(r.valore)} />
            <ClassificaSpeciale titolo="Assist" righe={classificaAssist(prestazioni, nomiGiocatori, squadreGiocatori).slice(0, 10)} nome={nomeGiocatore} squadra={(id) => nome(squadraGiocatore.get(id) ?? '')} valore={(r) => String(r.valore)} />
            <ClassificaSpeciale titolo="G+A" righe={classificaGolAssist(prestazioni, nomiGiocatori, squadreGiocatori).slice(0, 10)} nome={nomeGiocatore} squadra={(id) => nome(squadraGiocatore.get(id) ?? '')} valore={(r) => String(r.valore)} />
            <ClassificaSpeciale titolo="Voto medio" righe={classificaVotoMedio(prestazioni, nomiGiocatori, squadreGiocatori).slice(0, 10)} nome={nomeGiocatore} squadra={(id) => nome(squadraGiocatore.get(id) ?? '')} valore={(r) => r.valore.toFixed(2)} />
            <ClassificaSpeciale titolo="Porta inviolata" righe={classificaPortaInviolata(prestazioni, nomiGiocatori, squadreGiocatori, portieri).slice(0, 10)} nome={nomeGiocatore} squadra={(id) => nome(squadraGiocatore.get(id) ?? '')} valore={(r) => String(r.valore)} />
            <ClassificaSpeciale titolo="Cartellini rossi" righe={classificaRossi(prestazioni, nomiGiocatori, squadreGiocatori).slice(0, 10)} nome={nomeGiocatore} squadra={(id) => nome(squadraGiocatore.get(id) ?? '')} valore={(r) => String(r.valore)} />
          </div>
        </div>
      )}
    </>
  );
}

interface RigaSpeciale {
  giocatoreId: string;
  valore: number;
  presenze: number;
}

function ClassificaSpeciale({
  titolo,
  righe,
  nome,
  squadra,
  valore,
}: {
  titolo: string;
  righe: RigaSpeciale[];
  nome: (id: string) => string;
  squadra: (id: string) => string;
  valore: (r: RigaSpeciale) => string;
}): ReactElement {
  return (
    <section className={styles.card}>
      <p className={styles.cardHead}>{titolo}</p>
      {righe.length === 0 ? (
        <p className={styles.empty2}>Nessun dato.</p>
      ) : (
        <ol style={{ listStyle:'none', margin:0, padding:0 }}>
          {righe.map((r) => (
            <li key={r.giocatoreId} style={{ display:'flex', justifyContent:'space-between', gap:10, padding:'8px 0', borderBottom:'1px solid color-mix(in srgb, var(--line) 70%, transparent)' }}>
              <span className={styles.cardNome}><strong>{nome(r.giocatoreId)}</strong> <small>{squadra(r.giocatoreId)}</small></span>
              <span className={styles.cardVal}>{valore(r)}{titolo === 'Voto medio' ? '' : r.presenze > 0 ? ` (${r.presenze} pg)` : ''}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
