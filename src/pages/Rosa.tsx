// FLM — Pagina Rosa (PRD 3.2, modulo morale & spogliatoio).
// Master-detail broadcast: lista rosa a sinistra (gruppi per ruolo, volti),
// scheda giocatore sticky a destra. Stessa topbar e accento club del hub (D8).
// Nessun dato scritto qui: ogni azione passa da src/db (regola 1 AGENTS.md).

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
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
import { formattaCifra } from '../engine/mercato';
import { deltaOverallDaForma, etichettaForma, overallEffettivo } from '../engine/forma';
import { LEADER_MAX, LEADER_MIN, PROMESSE_MAX_ATTIVE } from '../engine/rules';
import HubTopbar from '../components/hub/HubTopbar';
import { accentiDaColori } from '../components/hub/accento';
import { AvatarGiocatore, LogoSquadra } from '../media/componenti';
import styles from './Rosa.module.css';
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
  onHome: () => void;
  onStorico: () => void;
}

/** Ordine di lettura della rosa: dal portiere all'attacco. */
const ORDINE_RUOLI = ['POR', 'DIF', 'CEN', 'ATT'];

const ETICHETTA_RUOLO: Record<string, string> = {
  POR: 'Portieri',
  DIF: 'Difensori',
  CEN: 'Centrocampisti',
  ATT: 'Attaccanti',
};

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
  if (v < 30) return 'var(--accent-strong)';
  if (v < 60) return 'var(--paper-muted)';
  return 'var(--mint)';
}

export default function Rosa({ carrieraId, onBack, onHome, onStorico }: RosaProps): ReactElement {
  const [dati, setDati] = useState<DatiRosa | null>(null);
  const [selezionato, setSelezionato] = useState<Id | null>(null);
  const [soloCrisi, setSoloCrisi] = useState(false);
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

  // D8 — accento dinamico: la pagina prende i colori del club (come il hub).
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

  const gruppi = useMemo(() => {
    if (!dati) return [];
    const perRuolo = new Map<string, Giocatore[]>();
    for (const g of dati.rosa) {
      if (soloCrisi && g.morale >= 30) continue;
      const lista = perRuolo.get(g.ruolo) ?? [];
      lista.push(g);
      perRuolo.set(g.ruolo, lista);
    }
    const noti = ORDINE_RUOLI.filter((r) => perRuolo.has(r));
    const altri = [...perRuolo.keys()].filter((r) => !ORDINE_RUOLI.includes(r)).sort();
    return [...noti, ...altri].map((ruolo) => ({
      ruolo,
      giocatori: perRuolo.get(ruolo) ?? [],
    }));
  }, [dati, soloCrisi]);

  if (!dati) {
    return <main className="page-shell loading-page"><p>Caricamento rosa…</p></main>;
  }

  const { carriera, squadra, stato, rosa, partiteSquadra } = dati;
  const medio = moraleSpogliatoio(rosa);
  const fascia = fasciaSpogliatoio(medio);
  const inCrisi = giocatoriInCrisi(rosa);
  const numeroLeader = rosa.filter((g) => g.leader).length;
  const totalePromesseAttive = rosa.reduce((acc, g) => acc + promesseAttive(g), 0);
  // Mai stato vuoto: senza selezione esplicita mostra il miglior OVR.
  const migliore = rosa.length > 0 ? rosa.reduce((m, g) => (g.overall > m.overall ? g : m)) : null;
  const selez = rosa.find((g) => g.id === selezionato) ?? migliore;

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
      <HubTopbar
        sezione="Rosa"
        contesto={`${carriera.campionato} · ${carriera.stagione} · Settimana ${stato.settimanaCorrente}`}
        onBrand={onBack}
        onStorico={onStorico}
        onEsporta={() => void (async () => {
          const { esportaSalvataggio } = await import('../db');
          const { scaricaFile } = await import('../bridge');
          const json = await esportaSalvataggio(carrieraId);
          scaricaFile(JSON.stringify(json, null, 2), `flm-${carrieraId}.json`);
        })()}
        onHome={onHome}
        squadra={{ nome: squadra.nome, nazione: squadra.nazione, colori: squadra.colori }}
      />

      <div className={styles.pagina}>
        <header className={styles.testata}>
          <LogoSquadra nome={squadra.nome} nazione={squadra.nazione} colori={squadra.colori} className={styles.logoClub} />
          <div className={styles.testataTesto}>
            <p className={styles.eyebrow}>Rosa · {carriera.campionato}</p>
            <h1 className={styles.nomeClub}>{squadra.nome}</h1>
          </div>
          <dl className={styles.kpi}>
            <div>
              <dt>Morale</dt>
              <dd>{medio}<small>{fascia}</small></dd>
            </div>
            <div>
              <dt>Leader</dt>
              <dd>{numeroLeader}/{LEADER_MAX}</dd>
            </div>
            <div className={inCrisi.length > 0 ? styles.kpiAllarme : undefined}>
              <dt>In crisi</dt>
              <dd>{inCrisi.length}</dd>
            </div>
            <div>
              <dt>Promesse</dt>
              <dd>{totalePromesseAttive}</dd>
            </div>
          </dl>
        </header>

        {errore && <p className={styles.errore} role="alert">{errore}</p>}

        <div className={styles.colonne}>
          <div>
            <div className={styles.listaTesta}>
              <span className={styles.listaConteggio}>
                {soloCrisi ? `${inCrisi.length} in crisi` : `${rosa.length} giocatori`}
              </span>
              {inCrisi.length > 0 && (
                <button
                  type="button"
                  className={`${styles.chipCrisi} ${soloCrisi ? styles.chipCrisiAttiva : ''}`}
                  aria-pressed={soloCrisi}
                  onClick={() => setSoloCrisi((v) => !v)}
                >
                  Solo in crisi
                </button>
              )}
            </div>

            <div className={styles.lista}>
              {gruppi.length === 0 && (
                <p className={styles.listaVuota}>Nessun giocatore in crisi: lo spogliatoio è sereno.</p>
              )}
              {gruppi.map(({ ruolo, giocatori }) => (
                <section key={ruolo} aria-label={ETICHETTA_RUOLO[ruolo] ?? ruolo}>
                  <h2 className={styles.gruppoRuolo}>{ETICHETTA_RUOLO[ruolo] ?? ruolo}</h2>
                  {giocatori.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className={`${styles.riga} ${selez?.id === g.id ? styles.rigaAttiva : ''}`}
                      aria-current={selez?.id === g.id}
                      onClick={() => setSelezionato(g.id)}
                    >
                      <AvatarGiocatore
                        nome={g.nome}
                        nomeSquadra={squadra.nome}
                        colori={squadra.colori}
                        className={styles.volto}
                      />
                      <span className={styles.rigaTesto}>
                        <span className={styles.rigaNome}>
                          {g.nome}
                          {g.leader && <span className={styles.badgeLeader} title="Leader">C</span>}
                          {g.morale < 30 && <span className={styles.puntoCrisi} title="In crisi" />}
                        </span>
                        <span className={styles.rigaSub}>
                          {g.nazionalita} · {g.eta} anni
                          <span className={styles.miniBarra} aria-hidden="true">
                            <span
                              className={styles.miniBarraFill}
                              style={{ width: `${Math.max(0, Math.min(100, g.morale))}%`, background: coloreMorale(g.morale) }}
                            />
                          </span>
                          <span className={styles.miniMorale} style={{ color: coloreMorale(g.morale) }}>
                            {g.morale}
                          </span>
                        </span>
                      </span>
                      <span className={styles.rigaOvr}>{g.overall}</span>
                    </button>
                  ))}
                </section>
              ))}
            </div>
          </div>

          <div className={styles.colScheda}>
            {selez ? (
              <SchedaGiocatore
                key={selez.id}
                giocatore={selez}
                squadra={squadra}
                partiteSquadra={partiteSquadra}
                numeroLeader={numeroLeader}
                onAzione={azione}
              />
            ) : (
              <p className={styles.listaVuota}>Nessun giocatore in rosa.</p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function BarraCondizione({ etichetta, valore, colorata }: { etichetta: string; valore: number; colorata?: boolean }): ReactElement {
  const colore = colorata ? coloreMorale(valore) : 'var(--paper)';
  return (
    <li>
      <span className={styles.barraEtichetta}>{etichetta}</span>
      <span className={styles.barra} aria-hidden="true">
        <span
          className={styles.barraFill}
          style={{ width: `${Math.max(0, Math.min(100, valore))}%`, background: colore }}
        />
      </span>
      <span className={styles.barraNumero} style={{ color: colore }}>{valore}</span>
    </li>
  );
}

function SchedaGiocatore({
  giocatore: g,
  squadra,
  partiteSquadra,
  numeroLeader,
  onAzione,
}: {
  giocatore: Giocatore;
  squadra: Squadra;
  partiteSquadra: Partita[];
  numeroLeader: number;
  onAzione: (fn: () => Promise<void>) => Promise<void>;
}): ReactElement {
  const attive = g.promesse.filter((p) => p.stato === 'attiva');
  const storiche = g.promesse.filter((p) => p.stato !== 'attiva');
  const puoiPromuovere = numeroLeader < LEADER_MAX;
  const puoiRevocare = numeroLeader > LEADER_MIN;
  const puoiCreare = promesseAttive(g) < PROMESSE_MAX_ATTIVE;
  const voti = g.votiFinestra ?? [];

  return (
    <article className={styles.scheda} aria-label={`Scheda di ${g.nome}`}>
      <header className={styles.hero}>
        <div className={styles.heroVoltoWrap}>
          <AvatarGiocatore
            nome={g.nome}
            nomeSquadra={squadra.nome}
            colori={squadra.colori}
            className={styles.heroVolto}
          />
        </div>
        <div className={styles.heroInfo}>
          <div className={styles.heroOvr}>
            <span className={styles.heroOvrNumero}>{g.overall}</span>
            <span className={styles.heroOvrEtichetta}>Overall</span>
          </div>
          <h2 className={styles.heroNome}>{g.nome}</h2>
          <p className={styles.heroMeta}>{g.ruolo} · {g.nazionalita} · {g.eta} anni</p>
          <div className={styles.heroBadge}>
            {g.leader && <span className={`${styles.badge} ${styles.badgeLeaderBig}`}>Leader</span>}
            {g.morale < 30 && <span className={`${styles.badge} ${styles.badgeCrisi}`}>In crisi</span>}
            {g.infortunioFinoA !== undefined && (
              <span className={`${styles.badge} ${styles.badgeInfortunio}`}>Infortunio · sett. {g.infortunioFinoA}</span>
            )}
            {g.giovane && <span className={`${styles.badge} ${styles.badgeGiovane}`}>Vivaio</span>}
            {attive.length > 0 && <span className={styles.badge}>{attive.length} promess{attive.length === 1 ? 'a' : 'e'}</span>}
          </div>
        </div>
      </header>

      <ul className={styles.barre}>
        <BarraCondizione etichetta="Morale" valore={g.morale} colorata />
        <BarraCondizione etichetta="Fiducia" valore={g.fiducia} />
        <BarraCondizione etichetta={`Forma · ${etichettaForma(g.forma)}`} valore={g.forma} />
      </ul>
      <p className={styles.sezioneCopy} style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
        Forma unificata: morale 30% + fiducia 20% + prestazione (voto/gol/assist/cartellini) 50% → inerzia 68%.{' '}
        Overall effettivo: <strong>{overallEffettivo(g)}</strong> (base {g.overall} {deltaOverallDaForma(g.forma) > 0 ? `+${deltaOverallDaForma(g.forma)}` : deltaOverallDaForma(g.forma) < 0 ? `${deltaOverallDaForma(g.forma)}` : '±0'}) — {deltaOverallDaForma(g.forma) === 0 ? 'in linea' : deltaOverallDaForma(g.forma) > 0 ? 'in forma' : 'appannato'}
      </p>

      <dl className={styles.stripDati}>
        <div>
          <dt>Minuti stagione</dt>
          <dd>{g.minutiStagione.toLocaleString('it-IT')}</dd>
        </div>
        <div>
          <dt>Valore</dt>
          <dd>{formattaCifra(g.valoreMercato)}</dd>
        </div>
        <div>
          <dt>Scadenza</dt>
          <dd>{g.scadenzaContratto}</dd>
        </div>
        <div>
          <dt>Ingaggio</dt>
          <dd>{formattaCifra(g.ingaggioAnnuo)}/anno</dd>
        </div>
      </dl>

      {voti.length > 0 && (
        <section className={styles.sezione}>
          <h3>Forma recente</h3>
          <ul className={styles.voti}>
            {voti.map((v, i) => (
              <li
                key={`${v}-${i}`}
                className={`${styles.voto} ${v >= 7 ? styles.votoAlta : v < 6 ? styles.votoBassa : ''}`}
                title={`Voto ${v}`}
              >
                {v}
              </li>
            ))}
          </ul>
          <p className={styles.votiNota}>Ultimi {voti.length} voti FL26</p>
        </section>
      )}

      <section className={styles.sezione}>
        <h3>Ruolo nello spogliatoio</h3>
        <p className={styles.sezioneCopy}>
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
      </section>

      <section className={styles.sezione}>
        <h3>Promesse attive ({attive.length}/{PROMESSE_MAX_ATTIVE})</h3>
        {attive.length === 0 ? (
          <p className={styles.sezioneCopy}>Nessuna promessa attiva. I giocatori chiedono la maglia in dashboard; qui puoi promettere tu.</p>
        ) : (
          <ul className={styles.promesseLista}>
            {attive.map((p) => (
              <li key={p.id}>
                <div className={styles.promessaRiga}>
                  <strong>{p.testo}</strong>
                  <span className={styles.promessaScadenza}>scade sett. {p.scadenza}</span>
                </div>
                <span className={styles.promessaProgresso}>{progressoPromessa(p, g, partiteSquadra)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.promesseCrea}>
          <span className={styles.promesseCreaLabel}>Prometti tu (opzione secondaria):</span>
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
          {!puoiCreare && <span className={styles.promessaLimite}>Max {PROMESSE_MAX_ATTIVE} attive</span>}
        </div>
      </section>

      {storiche.length > 0 && (
        <details className={styles.storico}>
          <summary>Storico promesse ({storiche.length})</summary>
          <ul className={styles.promesseLista}>
            {[...storiche].reverse().map((p) => (
              <li key={p.id}>
                <div className={styles.promessaRiga}>
                  <strong>{p.testo}</strong>
                  <span className={styles.promessaScadenza}>scaduta sett. {p.scadenza}</span>
                </div>
                <span className={`${styles.promessaEsito} ${p.stato === 'mantenuta' ? styles.promessaEsitoMantenuta : styles.promessaEsitoTradita}`}>
                  {p.stato === 'mantenuta' ? 'Mantenuta' : 'Tradita'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {(g.miniStoria || g.parereScout) && (
        <section className={styles.sezione}>
          <h3>Dal vivaio</h3>
          {g.miniStoria && <p className={styles.vivaioNota}><strong>La sua storia</strong>{g.miniStoria}</p>}
          {g.parereScout && <p className={styles.vivaioNota}><strong>Parere dello scout</strong>{g.parereScout}</p>}
        </section>
      )}
    </article>
  );
}
