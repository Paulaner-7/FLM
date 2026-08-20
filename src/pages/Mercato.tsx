// FLM — Mercato broadcast (PRD 7.3) — stile Carriera hub
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  avanzaGiornoMercato,
  creaOffertaAcquisto,
  db,
  eseguiPrestitoUtente,
  firmaSvincolato,
  statoMercato,
  type StatoMercato,
} from '../db';
import { valoreMercato, formattaCifra, nomeFinestra } from '../engine/mercato';
import HubTopbar from '../components/hub/HubTopbar';
import { accentiDaColori } from '../components/hub/accento';
import MovimentiContenuto from './Movimenti';
import styles from './Mercato.module.css';
import type { Carriera, Giocatore, Notizia, Squadra, StatoClub, Trattativa } from '../types/entities';

interface DatiMercato {
  carriera: Carriera;
  stato: StatoClub;
  mercato: StatoMercato;
  squadra: Squadra;
  squadre: Map<string, Squadra>;
  giocatori: Giocatore[];
  notizie: Notizia[];
  acquistabili: Array<Giocatore & { club: Squadra; valore: number }>;
  mieiGiocatori: Array<Giocatore & { valore: number }>;
}

interface MercatoProps {
  carrieraId: string;
  onBack: () => void;
  onMail: () => void;
}

const REPARTI = ['tutti', 'portiere', 'difensore', 'centrocampista', 'attaccante'] as const;

function repartoDi(ruolo: string): string {
  const r = ruolo.toLowerCase();
  if (r.includes('portiere')) return 'portiere';
  if (r.includes('difensore') || r.includes('terzino') || r.includes('centrale')) return 'difensore';
  if (r.includes('attaccante') || r.includes('ala') || r.includes('punta')) return 'attaccante';
  return 'centrocampista';
}

export default function Mercato({ carrieraId, onBack, onMail }: MercatoProps): ReactElement {
  const [dati, setDati] = useState<DatiMercato | null>(null);
  const [tab, setTab] = useState<'mercato' | 'movimenti'>('mercato');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'error'; testo: string } | null>(null);
  const [ricerca, setRicerca] = useState('');
  const [reparto, setReparto] = useState<(typeof REPARTI)[number]>('tutti');
  const [overallMin, setOverallMin] = useState(60);
  const [etaMax, setEtaMax] = useState(35);
  const [salta, setSalta] = useState(1);
  const [offertaCifra, setOffertaCifra] = useState<Record<string, string>>({});
  const [offertaAperta, setOffertaAperta] = useState<string | null>(null);

  const carica = useCallback(async (): Promise<void> => {
    const [carriera, stato, mercato, squadreArr, giocatoriArr, notizieArr] = await Promise.all([
      db.carriere.get(carrieraId),
      db.statoClub.get(carrieraId),
      statoMercato(carrieraId),
      db.squadre.toArray(),
      db.giocatori.where('carrieraId').equals(carrieraId).toArray(),
      db.notizie.where('carrieraId').equals(carrieraId).toArray(),
    ]);
    if (!carriera || !stato) return;
    const squadra = squadreArr.find((s) => s.id === carriera.squadraId);
    if (!squadra) return;
    const mappaSquadre = new Map(squadreArr.map((s) => [s.id, s]));
    const assegnazioni = await db.squadAssignments.where('carrieraId').equals(carrieraId).toArray();
    const proprieta = new Map<string, string>();
    for (const a of assegnazioni) {
      if (a.tipo === 'proprieta' && a.al === undefined) proprieta.set(a.giocatoreId, a.squadraId);
    }
    const acquistabili = giocatoriArr
      .filter((g) => {
        const clubId = proprieta.get(g.id);
        return clubId !== undefined && clubId !== squadra.id;
      })
      .map((g) => ({
        ...g,
        club: mappaSquadre.get(proprieta.get(g.id)!)!,
        valore: valoreMercato(g, carriera.stagione),
      }))
      .sort((a, b) => b.valore - a.valore);
    const mieiGiocatori = giocatoriArr
      .filter((g) => proprieta.get(g.id) === squadra.id)
      .map((g) => ({ ...g, valore: valoreMercato(g, carriera.stagione) }))
      .sort((a, b) => b.valore - a.valore);
    setDati({
      carriera,
      stato,
      mercato,
      squadra,
      squadre: mappaSquadre,
      giocatori: giocatoriArr,
      notizie: notizieArr
        .filter((n) => n.giornoMercato !== undefined && n.settimana === stato.settimanaCorrente)
        .sort((a, b) => (b.giornoMercato ?? 0) - (a.giornoMercato ?? 0) || a.id.localeCompare(b.id)),
      acquistabili,
      mieiGiocatori,
    });
  }, [carrieraId]);

  useEffect(() => { void carica(); }, [carica]);

  const mandaInPrestito = async (g: Giocatore): Promise<void> => {
    setBusy(true);
    setFeedback(null);
    const esito = await eseguiPrestitoUtente(carrieraId, g.id);
    if (esito.ok) {
      setFeedback({ tipo: 'ok', testo: `${g.nome} va in prestito al ${esito.club} (rientro a fine stagione).` });
    } else {
      setFeedback({ tipo: 'error', testo: esito.errori?.[0] ?? 'Prestito non riuscito' });
    }
    setBusy(false);
    await carica();
  };

  const avanza = async (giorni: number): Promise<void> => {
    setBusy(true);
    setFeedback(null);
    try {
      for (let i = 0; i < giorni; i++) {
        const esito = await avanzaGiornoMercato(carrieraId);
        if (esito.esito === 'chiusa') {
          setFeedback({ tipo: 'ok', testo: 'Finestra chiusa: il calendario riprende.' });
          break;
        }
        if (esito.esito === 'non_attiva') break;
      }
      await carica();
    } catch (e) {
      setFeedback({ tipo: 'error', testo: e instanceof Error ? e.message : 'Errore avanzamento' });
    } finally {
      setBusy(false);
    }
  };

  const faiOfferta = async (giocatore: Giocatore): Promise<void> => {
    const cifra = Number((offertaCifra[giocatore.id] ?? '').replace(',', '.'));
    if (!Number.isFinite(cifra) || cifra <= 0) {
      setFeedback({ tipo: 'error', testo: 'Inserisci cifra valida' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const esito = await creaOffertaAcquisto(carrieraId, giocatore.id, Math.round(cifra));
      if (!esito.ok) {
        setFeedback({ tipo: 'error', testo: esito.errori?.join(' ') ?? 'Offerta rifiutata' });
      } else {
        setFeedback({ tipo: 'ok', testo: `Offerta per ${giocatore.nome}: risposta il giorno dopo in Mail.` });
        setOffertaAperta(null);
      }
      await carica();
    } catch (e) {
      setFeedback({ tipo: 'error', testo: e instanceof Error ? e.message : 'Errore' });
    } finally {
      setBusy(false);
    }
  };

  const risultati = useMemo(() => {
    if (!dati) return [];
    const q = ricerca.trim().toLowerCase();
    return dati.acquistabili.filter((g) => {
      if (reparto !== 'tutti' && repartoDi(g.ruolo) !== reparto) return false;
      if (g.overall < overallMin) return false;
      if (g.eta > etaMax) return false;
      if (q && !g.nome.toLowerCase().includes(q) && !g.club.nome.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [dati, ricerca, reparto, overallMin, etaMax]);

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

  if (!dati) return <main className="page-shell loading-page"><p>Caricamento mercato…</p></main>;

  const { mercato, squadra, squadre } = dati;
  const inFinestra = mercato.attiva;
  const etichettaFinestra = mercato.finestra ? nomeFinestra(mercato.finestra) : '—';

  return (
    <main className="page-shell">
      <HubTopbar
        sezione="Mercato"
        onBrand={onBack}
        onStorico={() => {}}
        onEsporta={() => {}}
        onHome={onBack}
        squadra={{ nome: squadra.nome, nazione: squadra.nazione, colori: squadra.colori }}
      >
        <nav className="topbar-nav" aria-label="Navigazione mercato" style={{ display: 'flex', gap: 8 }}>
          <button className={`button button-small ${tab === 'mercato' ? 'button-primary' : 'button-outline'}`} type="button" onClick={() => setTab('mercato')}>Mercato</button>
          <button className={`button button-small ${tab === 'movimenti' ? 'button-primary' : 'button-outline'}`} type="button" onClick={() => setTab('movimenti')}>Movimenti</button>
          <button className="button button-outline button-small" type="button" onClick={onMail}>Mail</button>
        </nav>
      </HubTopbar>

      {tab === 'movimenti' ? (
        <section className="content-wrap">
          <MovimentiContenuto carrieraId={carrieraId} />
        </section>
      ) : (
        <div className={styles.hub}>
          <div className={styles.heading}>
            <p className="eyebrow">Finestra a 30 giorni · calendario congelato</p>
            <h1>Mercato</h1>
            <p>Compra, presta e avanza giorno per giorno. Le risposte CPU arrivano il giorno dopo in Mail. Valori e soglie dall&apos;engine, testi LLM.</p>
          </div>

          <section className={styles.kpiStrip}>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Finestra</span>
              {inFinestra ? (
                <>
                  <div className={styles.countdown}><strong>{mercato.giorno}</strong><span>/ {mercato.giorniTotali}</span></div>
                  <span className={styles.kpiVal} style={{ fontSize: 14 }}>{etichettaFinestra}</span>
                  <span className={styles.kpiHint}>Giorno {mercato.giorno} di {mercato.giorniTotali}</span>
                </>
              ) : (
                <>
                  <strong className={styles.kpiVal}>Chiusa</strong>
                  <span className={styles.kpiHint}>Calendario in corso — prossima finestra automatica</span>
                </>
              )}
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Budget</span>
              <strong className={styles.kpiVal}>{squadra.budget.toLocaleString('it-IT')}<em>€</em></strong>
              <span className={styles.kpiHint}>Disponibile per acquisti · ingaggi inclusi</span>
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Trattative</span>
              <strong className={styles.kpiVal}>{mercato.trattative.length}<em>in corso</em></strong>
              <span className={styles.kpiHint}>{mercato.trattative.length === 0 ? 'Nessuna aperta' : `${mercato.trattative.filter((t:Trattativa)=>t.stato==='accordo').length} in accordo`}</span>
            </div>
          </section>

          {inFinestra && (
            <div className={styles.actionsCard}>
              <div>
                <p className={styles.eyebrow} style={{ marginBottom: 6 }}>Giorno {mercato.giorno} di {mercato.giorniTotali} — risposte il giorno dopo</p>
                <p style={{ color: 'var(--paper-muted)', fontSize: 12, margin: 0 }}>Avanzamento giorno per giorno. Il calendario resta congelato.</p>
              </div>
              <div className={styles.actionsLeft}>
                <button className={styles.primary} type="button" disabled={busy} onClick={() => void avanza(1)}>
                  {busy ? 'Avanzamento…' : `Avanza → G${Math.min(mercato.giorno + 1, mercato.giorniTotali + 1)}`}
                </button>
                <select className={styles.select} value={salta} onChange={(e) => setSalta(Number(e.target.value))} aria-label="Salta giorni">
                  {[1, 2, 3, 5, 10].map((n) => (
                    <option key={n} value={n}>Salta {n}g</option>
                  ))}
                </select>
                <button className={styles.outline} type="button" disabled={busy || salta <= 1} onClick={() => void avanza(salta)}>
                  Vai
                </button>
              </div>
            </div>
          )}

          {feedback && <p className={`feedback ${feedback.tipo === 'ok' ? 'feedback-ok' : 'feedback-error'}`} style={{ marginTop: 12 }}>{feedback.testo}</p>}

          {!inFinestra && (
            <div className={styles.empty}>
              <strong>Mercato chiuso</strong>
              <span>La prossima finestra si aprirà da sola (estate / gennaio).</span>
            </div>
          )}

          {inFinestra && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2>Compra — cerca nel mondo</h2>
                <span>{risultati.length} risultati · max 50 mostrati</span>
              </div>
              <div className={styles.filters}>
                <input className={styles.search} placeholder="Cerca giocatore o club…" value={ricerca} onChange={(e) => setRicerca(e.target.value)} />
                <select className={styles.select} value={reparto} onChange={(e) => setReparto(e.target.value as typeof reparto)} aria-label="Reparto">
                  {REPARTI.map((r) => (
                    <option key={r} value={r}>{r === 'tutti' ? 'Tutti i ruoli' : r}</option>
                  ))}
                </select>
                <label className={styles.filterLabel}>
                  OVR ≥ <input type="number" className={styles.num} value={overallMin} min={40} max={95} onChange={(e) => setOverallMin(Number(e.target.value))} />
                </label>
                <label className={styles.filterLabel}>
                  Età ≤ <input type="number" className={styles.num} value={etaMax} min={16} max={45} onChange={(e) => setEtaMax(Number(e.target.value))} />
                </label>
              </div>

              {risultati.length === 0 ? (
                <div className={styles.empty}><span>Nessun giocatore trovato.</span></div>
              ) : (
                <div className={styles.list}>
                  {risultati.slice(0, 50).map((g) => (
                    <div className={styles.row} key={g.id}>
                      <div className={styles.rowMain}>
                        <strong>{g.nome} <span className={styles.pill} style={{ marginLeft: 8 }}>{g.ruolo}</span></strong>
                        <span className={styles.meta}>{g.club.nome} · {g.eta} anni · OVR {g.overall}</span>
                        <span className={styles.meta}>Valore <span className={styles.metaAccent}>{formattaCifra(g.valore)}</span> · Ingaggio {formattaCifra(g.ingaggioAnnuo)}/anno</span>
                      </div>
                      {offertaAperta === g.id ? (
                        <div className={styles.rowActions}>
                          <input className={styles.inlineInput} value={offertaCifra[g.id] ?? String(Math.round(g.valore * 0.8))} onChange={(e) => setOffertaCifra((m) => ({ ...m, [g.id]: e.target.value }))} aria-label={`Cifra per ${g.nome}`} />
                          <button className={styles.primary} type="button" disabled={busy} onClick={() => void faiOfferta(g)}>Invia</button>
                          <button className={styles.outline} type="button" onClick={() => setOffertaAperta(null)}>Annulla</button>
                        </div>
                      ) : (
                        <button className={styles.outline} type="button" onClick={() => setOffertaAperta(g.id)}>Offerta</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {dati.mieiGiocatori.filter((g) => !g.creatoDaFlm).length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}><h2>Prestiti — i tuoi</h2><span>destinazione engine</span></div>
              <div className={styles.list}>
                {dati.mieiGiocatori.filter((g) => !g.creatoDaFlm).slice(0, 12).map((g) => (
                  <div className={styles.row} key={g.id}>
                    <div className={styles.rowMain}>
                      <strong>{g.nome}</strong>
                      <span className={styles.meta}>{g.eta} anni · {g.ruolo} · OVR {g.overall} · {formattaCifra(g.valore)}</span>
                    </div>
                    <button className={styles.outline} type="button" disabled={busy} onClick={() => void mandaInPrestito(g)}>Presta</button>
                  </div>
                ))}
              </div>
              <p className={styles.kpiHint} style={{ marginTop: 8 }}>Giovani FLM in Vivaio · prestito 1 stagione, rientro auto.</p>
            </section>
          )}

          {mercato.trattative.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}><h2>Le mie trattative</h2><span>{mercato.trattative.length} attive</span></div>
              <div className={styles.list}>
                {mercato.trattative.map((t: Trattativa) => {
                  const g = dati.giocatori.find((x) => x.id === t.giocatoreId);
                  const club = squadre.get(t.clubId);
                  const ultimo = t.messaggi[t.messaggi.length - 1];
                  return (
                    <div className={styles.row} key={t.id}>
                      <div className={styles.rowMain}>
                        <strong>{g?.nome ?? '—'} <span className={styles.pill}>{t.direzione === 'acquisto' ? 'Acquisto' : 'Vendita'}</span></strong>
                        <span className={styles.meta}>{t.direzione === 'acquisto' ? 'da ' : 'al '}{club?.nome ?? '—'} · giro {t.giro}/4 {t.finalOffer ? '· FINAL' : ''} {ultimo?.cifra ? `· ${formattaCifra(ultimo.cifra)}` : ''}</span>
                        <span className={styles.meta} style={{ opacity: 0.9 }}>{ultimo?.testo.slice(0, 110)}{ultimo && ultimo.testo.length > 110 ? '…' : ''}</span>
                      </div>
                      <button className={styles.primary} type="button" onClick={onMail}>Mail →</button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {mercato.svincolati.length > 0 && inFinestra && (
            <section className={styles.section}>
              <div className={styles.sectionHead}><h2>Svincolati</h2><span>contratti scaduti</span></div>
              <div className={styles.list}>
                {mercato.svincolati.slice(0, 20).map((g) => (
                  <div className={styles.row} key={g.id}>
                    <div className={styles.rowMain}>
                      <strong>{g.nome}</strong>
                      <span className={styles.meta}>{g.ruolo} · {g.eta} anni · OVR {g.overall} · {formattaCifra(g.ingaggioAnnuo)}/anno</span>
                    </div>
                    <button
                      className={styles.primary}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        void firmaSvincolato(carrieraId, g.id).then((esito) => {
                          setFeedback(esito.ok ? { tipo: 'ok', testo: `${g.nome} firmato.` } : { tipo: 'error', testo: esito.errori?.join(' ') ?? 'Errore' });
                          void carica().then(() => setBusy(false));
                        });
                      }}
                    >
                      Firma 0€
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {dati.notizie.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}><h2>Notizie dal mondo</h2><span>giornata mercato</span></div>
              <ul className={styles.newsList}>
                {dati.notizie.slice(0, 8).map((n) => (
                  <li key={n.id} className={styles.newsItem}>
                    <span className={styles.newsDay}>G{n.giornoMercato}</span>
                    <span>{n.testo}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
