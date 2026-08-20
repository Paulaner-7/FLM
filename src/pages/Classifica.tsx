// FLM — Pagina Classifica (PRD 3.2, modulo "Classifica & statistiche").
// Solo consultazione: i numeri vengono da calcolaClassifica (src/engine),
// la UI non scrive nulla (regola 1 e 3 AGENTS.md).
// Colonna forma = ultime 5 partite giocate (pallini V/N/P, engine formaUltime5).

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { db } from '../db';
import { calcolaClassifica, formaUltime5, type SegnoForma } from '../engine/classifica';
import HubTopbar from '../components/hub/HubTopbar';
import { accentiDaColori } from '../components/hub/accento';
import { LogoSquadra } from '../media/componenti';
import type { Carriera, Competizione, Partita, Squadra, StatoClub } from '../types/entities';
import styles from './Classifica.module.css';

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

/** Icona filled: casa (home) */
function IconaCasa(): ReactElement {
  return (
    <span className={`${styles.sedeIcona} ${styles.sedeCasa}`} title="In casa">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 3L2 12h3v8h5v-5h4v5h5v-8h3L12 3z" />
      </svg>
    </span>
  );
}

/** Icona filled: aereo (trasferta) */
function IconaAereo(): ReactElement {
  return (
    <span className={`${styles.sedeIcona} ${styles.sedeTrasferta}`} title="In trasferta">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0011.5 2 1.5 1.5 0 0010 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
      </svg>
    </span>
  );
}

export default function Classifica({ carrieraId, onBack }: ClassificaProps): ReactElement {
  const [dati, setDati] = useState<DatiClassifica | null>(null);
  const [tab, setTab] = useState<'classifica' | 'giornate'>('classifica');

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
    const competizione = competizioni.find(
      (c) => c.carrieraId === carrieraId && c.tipo === 'campionato' && c.squadre.includes(carriera.squadraId),
    );
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

  // D8 — accento dinamico (prima del return per rules-of-hooks)
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
    return <main className="page-shell loading-page"><p>Caricamento classifica…</p></main>;
  }

  const { carriera, squadra, stato, competizione, squadre, righe, partiteCompetizione } = dati;

  const squadraById = (id: string): Squadra | undefined => squadre.get(id);

  // Giornate concluse del campionato
  const perGiornata = new Map<number, Partita[]>();
  for (const p of partiteCompetizione.filter((x) => x.giocata)) {
    const lista = perGiornata.get(p.giornata) ?? [];
    lista.push(p);
    perGiornata.set(p.giornata, lista);
  }
  const giornateConcluse = [...perGiornata.entries()]
    .filter(([, partite]) => partite.every((p) => p.giocata))
    .sort((a, b) => b[0] - a[0]);

  return (
    <main className="page-shell">
      <HubTopbar
        sezione="Classifica"
        contesto={`${carriera.campionato} · ${carriera.stagione} · Settimana ${stato.settimanaCorrente}`}
        onBrand={onBack}
        onStorico={() => {}}
        onEsporta={() => {}}
        onHome={onBack}
        squadra={{ nome: squadra.nome, nazione: squadra.nazione, colori: squadra.colori }}
      />

      <section className={styles.pagina}>
        <header className={styles.testata}>
          <LogoSquadra nome={competizione.nome} className={styles.logoComp} />
          <div className={styles.testataTesto}>
            <p className={styles.eyebrow}>Campionato</p>
            <h1 className={styles.nomeComp}>{competizione.nome}</h1>
          </div>
          <span className={styles.stagione}>{competizione.stagione}</span>
        </header>

        <div className={styles.tabRow} role="group" aria-label="Viste campionato">
          <button type="button" className={`${styles.tab} ${tab === 'classifica' ? styles.tabAttivo : ''}`} onClick={() => setTab('classifica')}>Classifica</button>
          <button type="button" className={`${styles.tab} ${tab === 'giornate' ? styles.tabAttivo : ''}`} onClick={() => setTab('giornate')}>Giornate</button>
        </div>

        {tab === 'classifica' && (
          <div className={styles.tabellaWrap}>
            <table className={styles.tabella}>
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
                  const s = squadraById(r.squadraId);
                  const forma = formaUltime5(partiteCompetizione, r.squadraId);
                  const utente = r.squadraId === squadra.id;
                  const top3 = r.posizione <= 3;
                  return (
                    <tr key={r.squadraId} className={utente ? styles.rigaUtente : ''}>
                      <td>
                        <span className={`${styles.posizione} ${top3 ? styles.posizioneTop : ''}`}>
                          {r.posizione}
                        </span>
                      </td>
                      <td>
                        <div className={styles.squadraCella}>
                          <LogoSquadra
                            nome={s?.nome ?? ''}
                            nazione={s?.nazione}
                            colori={s?.colori}
                            className={styles.logoSquadra}
                          />
                          <span className={styles.nomeSquadra}>{s?.nome ?? '—'}</span>
                        </div>
                      </td>
                      <td>{r.giocate}</td>
                      <td>{r.vinte}</td>
                      <td>{r.pareggiate}</td>
                      <td>{r.perse}</td>
                      <td>{r.golFatti}</td>
                      <td>{r.golSubiti}</td>
                      <td className={r.differenzaReti > 0 ? styles.drPos : r.differenzaReti < 0 ? styles.drNeg : ''}>
                        {r.differenzaReti > 0 ? `+${r.differenzaReti}` : r.differenzaReti}
                      </td>
                      <td className={styles.punti}>{r.punti}</td>
                      <td>
                        <span className={styles.formaDots} role="img" aria-label={`Forma: ${forma.join(' ')}`} title={forma.join(' ')}>
                          {forma.map((segno, i) => (
                            <span
                              key={i}
                              className={styles.formaDot}
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
        )}

        {tab === 'giornate' && (
          giornateConcluse.length === 0 ? (
            <div className={styles.vuoto}>
              Nessuna giornata conclusa: i risultati compariranno qui dopo il primo referto.
            </div>
          ) : (
            <div className={styles.giornateLista}>
              {giornateConcluse.map(([n, partite]) => (
                <section key={n} className={styles.giornataBlocco} aria-label={`Giornata ${n}`}>
                  <p className={styles.giornataIntestazione}>Giornata {n}</p>
                  <div className={styles.risultati}>
                    {partite
                      .sort((a, b) => a.slot.localeCompare(b.slot) || a.id.localeCompare(b.id))
                      .map((p) => {
                        const casa = squadraById(p.casa);
                        const trasferta = squadraById(p.trasferta);
                        const mia = p.casa === squadra.id || p.trasferta === squadra.id;
                        const rigori = p.rigori ? ` (${p.rigori.casa}-${p.rigori.trasferta} rig.)` : '';
                        return (
                          <div key={p.id} className={`${styles.risultatoRiga} ${mia ? styles.risultatoMia : ''}`}>
                            <div className={styles.risultatoSquadre}>
                              <div className={styles.risultatoSquadra}>
                                <LogoSquadra nome={casa?.nome ?? ''} nazione={casa?.nazione} colori={casa?.colori} className={styles.logoMini} />
                                <span className={`${styles.nomeAvversario} ${p.casa === squadra.id ? styles.nomeMio : ''}`}>
                                  {casa?.nome ?? '—'}
                                </span>
                                <IconaCasa />
                              </div>
                              <span className={styles.separatore}>–</span>
                              <div className={styles.risultatoSquadra}>
                                <LogoSquadra nome={trasferta?.nome ?? ''} nazione={trasferta?.nazione} colori={trasferta?.colori} className={styles.logoMini} />
                                <span className={`${styles.nomeAvversario} ${p.trasferta === squadra.id ? styles.nomeMio : ''}`}>
                                  {trasferta?.nome ?? '—'}
                                </span>
                                <IconaAereo />
                              </div>
                            </div>
                            <div className={styles.esito}>
                              <span
                                className={styles.esitoPunteggio}
                                style={{ color: mia ? 'var(--accent-strong)' : 'var(--paper-muted)' }}
                              >
                                <strong>{p.golCasa}</strong>
                                <span className={styles.separatore}> – </span>
                                <strong>{p.golTrasferta}</strong>
                              </span>
                              {rigori && <span className={styles.esitoRigori}>{rigori}</span>}
                              {mia && <span className={styles.pillMia}>La tua partita</span>}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </section>
              ))}
            </div>
          )
        )}
      </section>
    </main>
  );
}
