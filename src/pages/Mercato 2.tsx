// FLM — Pagina Mercato (PRD 7.3): finestre a 30 giorni, trattative, acquisti.
// Il calendario è CONGELATO durante la finestra (decisione utente M4):
// qui si avanza giorno per giorno. I numeri (valori, cifre, soglie) arrivano
// dall'engine; l'LLM scrive solo i testi (mail). Pagina di sola orchestrazione:
// tutte le scritture passano da src/db (regola 1 AGENTS.md).

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
import MovimentiContenuto from './Movimenti';
import type { Carriera, Giocatore, Notizia, Squadra, StatoClub, Trattativa } from '../types/entities';

interface DatiMercato {
  carriera: Carriera;
  stato: StatoClub;
  mercato: StatoMercato;
  squadra: Squadra;
  squadre: Map<string, Squadra>;
  giocatori: Giocatore[];
  notizie: Notizia[];
  /** Tutti i giocatori del mondo carriera con club proprietario (per la ricerca) */
  acquistabili: Array<Giocatore & { club: Squadra; valore: number }>;
  /** I tuoi giocatori (proprietà attiva) — per i prestiti dei non-giovani */
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
  /** Offerta in corso: giocatoreId → cifra proposta */
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

  useEffect(() => {
    void carica();
  }, [carica]);

  const mandaInPrestito = async (g: Giocatore): Promise<void> => {
    setBusy(true);
    setFeedback(null);
    const esito = await eseguiPrestitoUtente(carrieraId, g.id);
    if (esito.ok) {
      setFeedback({ tipo: 'ok', testo: `${g.nome} va in prestito al ${esito.club} (rientro automatico a fine stagione).` });
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
          setFeedback({ tipo: 'ok', testo: 'Finestra di mercato chiusa: il calendario riprende.' });
          break;
        }
        if (esito.esito === 'non_attiva') break;
      }
      await carica();
    } catch (e) {
      setFeedback({ tipo: 'error', testo: e instanceof Error ? e.message : 'Errore durante l\'avanzamento' });
    } finally {
      setBusy(false);
    }
  };

  const faiOfferta = async (giocatore: Giocatore, _valore: number): Promise<void> => {
    const cifra = Number((offertaCifra[giocatore.id] ?? '').replace(',', '.'));
    if (!Number.isFinite(cifra) || cifra <= 0) {
      setFeedback({ tipo: 'error', testo: 'Inserisci una cifra valida' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const esito = await creaOffertaAcquisto(carrieraId, giocatore.id, Math.round(cifra));
      if (!esito.ok) {
        setFeedback({ tipo: 'error', testo: esito.errori?.join(' ') ?? 'Offerta rifiutata' });
      } else {
        setFeedback({ tipo: 'ok', testo: `Offerta inviata per ${giocatore.nome}: risposta il giorno dopo (in Mail).` });
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

  if (!dati) return <main className="page-shell" />;

  const { carriera, mercato, squadra, squadre } = dati;
  const inFinestra = mercato.attiva;
  const etichettaFinestra = mercato.finestra ? nomeFinestra(mercato.finestra) : '—';

  return (
    <main className="page-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={onBack}>FLM <span>/ Mercato</span></button>
        <div className="topbar-actions">
          <span className="topbar-note">{carriera.campionato} · {carriera.stagione}</span>
          <nav className="topbar-nav" aria-label="Navigazione mercato">
            <button className={`button button-small ${tab === 'mercato' ? 'button-primary' : 'button-outline'}`} type="button" onClick={() => setTab('mercato')}>Mercato</button>
            <button className={`button button-small ${tab === 'movimenti' ? 'button-primary' : 'button-outline'}`} type="button" onClick={() => setTab('movimenti')}>Movimenti</button>
            <button className="button button-outline button-small" type="button" onClick={onMail}>Mail</button>
            <button className="button button-outline button-small" type="button" onClick={onBack}>Carriera</button>
          </nav>
        </div>
      </header>

      {tab === 'movimenti' ? (
        <section className="content-wrap">
          <MovimentiContenuto carrieraId={carrieraId} />
        </section>
      ) : (
      <section className="content-wrap">
        {/* Stato finestra */}
        <section className="societa-grid">
          <div className="societa-card mercato-stato">
            <span className="societa-label">Finestra di mercato</span>
            {inFinestra ? (
              <strong className="fiducia-numero">{etichettaFinestra}<em>· giorno {mercato.giorno}/{mercato.giorniTotali}</em></strong>
            ) : (
              <strong className="fiducia-numero">Chiusa<em>· il calendario è in corso</em></strong>
            )}
          </div>
          <div className="societa-card">
            <span className="societa-label">Budget</span>
            <strong className="fiducia-numero">{squadra.budget.toLocaleString('it-IT')}<em>€</em></strong>
          </div>
          <div className="societa-card">
            <span className="societa-label">Trattative attive</span>
            <strong className="fiducia-numero">{mercato.trattative.length}<em>in corso</em></strong>
          </div>
        </section>

        {inFinestra && (
          <section className="mercato-azioni">
            <p className="eyebrow">Giorno {mercato.giorno} di {mercato.giorniTotali} — le risposte CPU arrivano il giorno dopo</p>
            <div className="richiesta-azioni">
              <button className="button button-primary" type="button" disabled={busy} onClick={() => void avanza(1)}>
                {busy ? 'Avanzamento…' : `Avanza giorno → giorno ${Math.min(mercato.giorno + 1, mercato.giorniTotali + 1)}`}
              </button>
              <select className="text-input mercato-salta" value={salta} onChange={(e) => setSalta(Number(e.target.value))} aria-label="Salta giorni">
                {[1, 2, 3, 5, 10].map((n) => (
                  <option key={n} value={n}>Salta {n} giorno{n === 1 ? '' : 'i'}</option>
                ))}
              </select>
              <button className="button button-outline" type="button" disabled={busy || salta <= 1} onClick={() => void avanza(salta)}>
                Vai avanti
              </button>
            </div>
            {feedback && <p className={`feedback feedback-${feedback.tipo}`}>{feedback.testo}</p>}
          </section>
        )}

        {!inFinestra && (
          <div className="empty-roster">
            <strong>Mercato chiuso</strong>
            <span>La prossima finestra si aprirà da sola (estate a inizio stagione, gennaio a metà).</span>
          </div>
        )}

        {/* Compra */}
        {inFinestra && (
          <section className="mercato-sezione">
            <p className="eyebrow">Compra — cerca nel mondo della carriera</p>
            <div className="mercato-filtri">
              <input
                className="text-input"
                placeholder="Cerca giocatore o club…"
                value={ricerca}
                onChange={(e) => setRicerca(e.target.value)}
              />
              <select className="text-input" value={reparto} onChange={(e) => setReparto(e.target.value as (typeof REPARTI)[number])} aria-label="Reparto">
                {REPARTI.map((r) => (
                  <option key={r} value={r}>{r === 'tutti' ? 'Tutti i ruoli' : r}</option>
                ))}
              </select>
              <label className="mercato-filtro-label">
                Overall ≥
                <input type="number" className="text-input mercato-num" value={overallMin} min={40} max={95} onChange={(e) => setOverallMin(Number(e.target.value))} />
              </label>
              <label className="mercato-filtro-label">
                Età ≤
                <input type="number" className="text-input mercato-num" value={etaMax} min={16} max={45} onChange={(e) => setEtaMax(Number(e.target.value))} />
              </label>
            </div>
            {risultati.length === 0 ? (
              <p className="empty-copy">Nessun giocatore trovato.</p>
            ) : (
              <div className="mercato-lista">
                {risultati.slice(0, 50).map((g) => (
                  <div className="mercato-riga" key={g.id}>
                    <div>
                      <strong>{g.nome}</strong>
                      <span className="mercato-meta">
                        {g.club.nome} · {g.ruolo} · {g.eta} anni · overall {g.overall}
                      </span>
                      <span className="mercato-meta">Valore: {formattaCifra(g.valore)} · ingaggio {formattaCifra(g.ingaggioAnnuo)}/anno</span>
                    </div>
                    {offertaAperta === g.id ? (
                      <div className="richiesta-azioni">
                        <input
                          className="text-input mercato-cifra"
                          value={offertaCifra[g.id] ?? String(Math.round(g.valore * 0.8))}
                          onChange={(e) => setOffertaCifra((m) => ({ ...m, [g.id]: e.target.value }))}
                          aria-label={`Cifra offerta per ${g.nome}`}
                        />
                        <button className="button button-primary button-small" type="button" disabled={busy} onClick={() => void faiOfferta(g, g.valore)}>
                          Invia
                        </button>
                        <button className="button button-outline button-small" type="button" onClick={() => setOffertaAperta(null)}>Annulla</button>
                      </div>
                    ) : (
                      <button className="button button-outline button-small" type="button" onClick={() => setOffertaAperta(g.id)}>
                        Fai un'offerta
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Prestiti (PRD 7.5): tutti i giocatori, destinazione scelta dall'engine */}
        {dati.mieiGiocatori.filter((g) => !g.creatoDaFlm).length > 0 && (
          <section className="mercato-sezione">
            <p className="eyebrow">Prestiti — i tuoi giocatori</p>
            <div className="mercato-lista">
              {dati.mieiGiocatori
                .filter((g) => !g.creatoDaFlm)
                .slice(0, 12)
                .map((g) => (
                  <div className="mercato-riga" key={g.id}>
                    <div>
                      <strong>{g.nome}</strong>
                      <span className="mercato-meta">
                        {g.eta} anni · {g.ruolo} · ov {g.overall} · {formattaCifra(g.valore)}
                      </span>
                    </div>
                    <button
                      className="button button-outline button-small"
                      type="button"
                      disabled={busy}
                      onClick={() => void mandaInPrestito(g)}
                    >
                      Manda in prestito
                    </button>
                  </div>
                ))}
            </div>
            <p className="mercato-meta">I giovani del vivaio (creati da FLM) si gestiscono dalla pagina Vivaio. Il prestito dura una stagione, destinazione scelta dall'engine, rientro automatico.</p>
          </section>
        )}

        {/* Trattative attive */}
        {mercato.trattative.length > 0 && (
          <section className="mercato-sezione">
            <p className="eyebrow">Le mie trattative</p>
            <div className="mercato-lista">
              {mercato.trattative.map((t: Trattativa) => {
                const g = dati.giocatori.find((x) => x.id === t.giocatoreId);
                const club = squadre.get(t.clubId);
                const ultimo = t.messaggi[t.messaggi.length - 1];
                return (
                  <div className="mercato-riga" key={t.id}>
                    <div>
                      <strong>{g?.nome ?? '—'} <span className="status-pill">{t.direzione === 'acquisto' ? 'Acquisto' : 'Vendita'}</span></strong>
                      <span className="mercato-meta">
                        {t.direzione === 'acquisto' ? 'da ' : 'al '}{club?.nome ?? '—'} · giro {t.giro}/{4}
                        {t.finalOffer ? ' · FINAL OFFER' : ''} · {ultimo?.cifra ? `ultima cifra ${formattaCifra(ultimo.cifra)}` : ''}
                      </span>
                      <span className="mercato-meta">{ultimo?.testo.slice(0, 90)}{ultimo && ultimo.testo.length > 90 ? '…' : ''}</span>
                    </div>
                    <button className="button button-outline button-small" type="button" onClick={onMail}>Rispondi in Mail →</button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Svincolati */}
        {mercato.svincolati.length > 0 && inFinestra && (
          <section className="mercato-sezione">
            <p className="eyebrow">Svincolati (contratti scaduti)</p>
            <div className="mercato-lista">
              {mercato.svincolati.slice(0, 20).map((g) => (
                <div className="mercato-riga" key={g.id}>
                  <div>
                    <strong>{g.nome}</strong>
                    <span className="mercato-meta">{g.ruolo} · {g.eta} anni · overall {g.overall} · ingaggio {formattaCifra(g.ingaggioAnnuo)}/anno</span>
                  </div>
                  <button
                    className="button button-primary button-small"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void firmaSvincolato(carrieraId, g.id).then((esito) => {
                        setFeedback(esito.ok
                          ? { tipo: 'ok', testo: `${g.nome} firmato.` }
                          : { tipo: 'error', testo: esito.errori?.join(' ') ?? 'Errore' });
                        void carica().then(() => setBusy(false));
                      });
                    }}
                  >
                    Firma (0 €)
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Notizie del giorno */}
        {dati.notizie.length > 0 && (
          <section className="mercato-sezione">
            <p className="eyebrow">Notizie di mercato dal mondo</p>
            <ul className="notizie-lista">
              {dati.notizie.slice(0, 8).map((n) => (
                <li key={n.id}>
                  <span className="status-pill">giorno {n.giornoMercato}</span> {n.testo}
                </li>
              ))}
            </ul>
          </section>
        )}

        <button className="button button-outline" type="button" onClick={onBack}>← Torna alla carriera</button>
      </section>
      )}
    </main>
  );
}
