// FLM — Referto broadcast (PRD 3.3) — stile Carriera hub
import { useState, type ReactElement } from 'react';
import { confermaReferto, type EsitoConfermaReferto } from '../db';
import { XI_TOTALE } from '../engine/referto';
import HubTopbar from '../components/hub/HubTopbar';
import { accentiDaColori } from '../components/hub/accento';
import RefertoScreenshot, { type DatiPrefillScreenshot } from '../components/RefertoScreenshot';
import styles from './Referto.module.css';
import type { Competizione, Giocatore, Id, Partita, Squadra } from '../types/entities';
import { useEffect } from 'react';

export interface DraftReferto {
  golMiei: number;
  golAvversario: number;
  marcatori: string[];
  titolari: string[];
  infortunati: string[];
  espulsi: string[];
  prestazioni?: Record<Id, { voto: number }>;
  autogolAvversari: number;
  supplementari: boolean;
  rigori?: { casa: number; trasferta: number };
}

export type ModalitaNota = 'infortunio' | 'espulsione';
type Modalita = 'gol' | 'titolare' | ModalitaNota;

interface RefertoProps {
  carrieraId: string;
  partita: Partita;
  squadra: Squadra;
  avversaria: Squadra;
  competizione: Competizione;
  giocatori: Giocatore[];
  initial: DraftReferto;
  onConfermato: (esito: EsitoConfermaReferto) => void;
  onAnnulla: () => void;
}

const RUOLI_ETICHETTA: Record<string, string> = {
  portiere: 'POR',
  difensore: 'DIF',
  centrocampista: 'CEN',
  attaccante: 'ATT',
};

const MODALITA_LABEL: Array<{ id: Modalita; titolo: string; descrizione: string }> = [
  { id: 'gol', titolo: 'Gol', descrizione: 'Tap = gol' },
  { id: 'titolare', titolo: 'Titolare', descrizione: 'XI iniziale' },
  { id: 'infortunio', titolo: 'Infortunio', descrizione: '2 settimane' },
  { id: 'espulsione', titolo: 'Espulsione', descrizione: 'Note' },
];

function eliminazioneDiretta(competizione: Competizione, partita: Partita): boolean {
  return (
    competizione.formato === 'eliminazione_diretta' ||
    competizione.formato === 'partita_secca' ||
    (competizione.formato === 'league_phase' && partita.fase !== 'league_phase')
  );
}

export default function Referto({
  carrieraId,
  partita,
  squadra,
  avversaria,
  competizione,
  giocatori,
  initial,
  onConfermato,
  onAnnulla,
}: RefertoProps): ReactElement {
  const [draft, setDraft] = useState<DraftReferto>(initial);
  const [modalita, setModalita] = useState<Modalita>('gol');
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [notaOk, setNotaOk] = useState<string | null>(null);
  const [confermaArmata, setConfermaArmata] = useState(false);

  // accento dinamico
  useEffect(() => {
    const root = document.documentElement;
    const { accent, accentStrong, onAccent } = accentiDaColori(squadra.colori ? { primario: squadra.colori.primario, secondario: squadra.colori.secondario } : undefined);
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-strong', accentStrong);
    root.style.setProperty('--on-accent', onAccent);
    return () => {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-strong');
      root.style.removeProperty('--on-accent');
    };
  }, [squadra.colori]);

  const inCasa = partita.casa === squadra.id;
  const elimDiretta = eliminazioneDiretta(competizione, partita);
  const pareggio = draft.golMiei === draft.golAvversario;
  const golGiocatore = (id: string): number => draft.marcatori.filter((m) => m === id).length;
  const totaleMarcatori = draft.marcatori.length;
  const toggleIn = (lista: string[], id: string): string[] => lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
  const toccaGiocatore = (id: string): void => {
    setErrore(null);
    setDraft((d) => {
      if (modalita === 'gol') return { ...d, marcatori: [...d.marcatori, id] };
      if (modalita === 'titolare') {
        if (d.titolari.includes(id)) return { ...d, titolari: d.titolari.filter((x) => x !== id) };
        if (d.titolari.length >= XI_TOTALE) return d;
        return { ...d, titolari: [...d.titolari, id] };
      }
      if (modalita === 'infortunio') return { ...d, infortunati: toggleIn(d.infortunati, id) };
      return { ...d, espulsi: toggleIn(d.espulsi, id) };
    });
  };
  const rimuoviGol = (id: string): void => {
    const indice = draft.marcatori.lastIndexOf(id);
    if (indice === -1) return;
    setDraft((d) => ({ ...d, marcatori: d.marcatori.filter((_, i) => i !== indice) }));
  };
  const valida = (): string[] => {
    const errori: string[] = [];
    if (draft.titolari.length !== XI_TOTALE) errori.push(`Titolari: devono essere esattamente 11 (trovati ${draft.titolari.length})`);
    if (totaleMarcatori > draft.golMiei) errori.push(`Marcatori (${totaleMarcatori}) superano i gol segnati (${draft.golMiei})`);
    if (totaleMarcatori + draft.autogolAvversari !== draft.golMiei) errori.push(`Conto: ${totaleMarcatori} marcatori + ${draft.autogolAvversari} autogol = ${totaleMarcatori + draft.autogolAvversari}, attesi ${draft.golMiei} gol`);
    if (elimDiretta && pareggio && !draft.rigori) errori.push('Eliminazione diretta in pareggio: indica rigori');
    if (draft.rigori && draft.rigori.casa === draft.rigori.trasferta) errori.push('Rigori: serve vincitrice');
    return errori;
  };
  const conferma = async (): Promise<void> => {
    const errori = valida();
    if (errori.length > 0) { setErrore(errori.join(' · ')); return; }
    setSalvataggio(true); setErrore(null);
    try {
      const esito = await confermaReferto({
        carrieraId, partitaId: partita.id,
        golMiei: draft.golMiei, golAvversario: draft.golAvversario,
        marcatori: draft.marcatori, titolari: draft.titolari,
        infortunati: draft.infortunati, espulsi: draft.espulsi,
        prestazioni: draft.prestazioni, autogolAvversari: draft.autogolAvversari,
        supplementari: draft.supplementari, rigori: draft.rigori,
      });
      onConfermato(esito);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore salvataggio referto');
      setSalvataggio(false);
    }
  };
  const applicaScreenshot = (dati: DatiPrefillScreenshot): void => {
    setErrore(null); setNotaOk(null);
    const quanti = Object.keys(dati.prestazioni).length;
    setDraft((d) => ({ ...d, prestazioni: { ...(d.prestazioni ?? {}), ...dati.prestazioni } }));
    setNotaOk(quanti === 1 ? 'Voto applicato a 1 giocatore: controlla i badge.' : `Voti applicati a ${quanti} giocatori.`);
    if (dati.nonMappati.length > 0) setErrore(`Non riconosciuti: ${dati.nonMappati.join(', ')}`);
  };

  const faseLeggibile = partita.fase === 'andata' || partita.fase === 'ritorno' ? `giornata ${partita.giornata}` : partita.fase.replace(/_/g, ' ');
  const gambaLabel = partita.gamba === 1 ? ' · andata' : partita.gamba === 2 ? ' · ritorno' : '';

  return (
    <main className="page-shell">
      <HubTopbar
        sezione="Referto"
        onBrand={onAnnulla}
        onStorico={() => {}}
        onEsporta={() => {}}
        onHome={onAnnulla}
        squadra={{ nome: squadra.nome, nazione: squadra.nazione, colori: squadra.colori }}
      />

      <div className={styles.hub}>
        <div className={styles.heading}>
          <p className="eyebrow">Partita da giocare in FL26 · {competizione.nome} · {faseLeggibile}{gambaLabel}{partita.neutra ? ' · neutro' : ''}</p>
          <h1>Referto</h1>
          <p>Inserisci il risultato in meno di 60 secondi. Stepper per i gol, tap sui giocatori per marcatori e XI. L&apos;immissione è definitiva.</p>
        </div>

        <RefertoScreenshot giocatori={giocatori} squadraNome={squadra.nome} onApplica={applicaScreenshot} />

        <div className={styles.matchCard}>
          <div className={styles.team}>
            <span className={styles.teamLabel}>{inCasa ? 'Casa · Tu' : 'Trasferta · Tu'}</span>
            <strong className={styles.teamName}>{inCasa ? squadra.nome : avversaria.nome}</strong>
            <small className={styles.teamMeta}>Rating {inCasa ? squadra.rating : avversaria.rating}</small>
          </div>
          <div className={styles.vs}>VS</div>
          <div className={styles.team} style={{ alignItems: inCasa ? 'flex-end' : 'flex-start', textAlign: inCasa ? 'right' : 'left' }}>
            <span className={styles.teamLabel}>{inCasa ? 'Trasferta' : 'Casa'}</span>
            <strong className={styles.teamName}>{inCasa ? avversaria.nome : squadra.nome}</strong>
            <small className={styles.teamMeta}>Rating {inCasa ? avversaria.rating : squadra.rating}</small>
          </div>
        </div>

        <div className={styles.scoreGrid}>
          <div className={styles.scoreCard}>
            <span className={styles.scoreLabel}>I tuoi gol</span>
            <div className={styles.stepper}>
              <button type="button" aria-label="Togli gol" disabled={draft.golMiei <= 0} onClick={() => setDraft((d) => ({ ...d, golMiei: Math.max(0, d.golMiei - 1) }))}>−</button>
              <strong>{draft.golMiei}</strong>
              <button type="button" aria-label="Aggiungi gol" disabled={draft.golMiei >= 30} onClick={() => setDraft((d) => ({ ...d, golMiei: d.golMiei + 1 }))}>+</button>
            </div>
          </div>
          <div className={styles.scoreCard}>
            <span className={styles.scoreLabel}>Gol avversario</span>
            <div className={styles.stepper}>
              <button type="button" aria-label="Togli gol avv" disabled={draft.golAvversario <= 0} onClick={() => setDraft((d) => ({ ...d, golAvversario: Math.max(0, d.golAvversario - 1) }))}>−</button>
              <strong>{draft.golAvversario}</strong>
              <button type="button" aria-label="Aggiungi gol avv" disabled={draft.golAvversario >= 30} onClick={() => setDraft((d) => ({ ...d, golAvversario: d.golAvversario + 1 }))}>+</button>
            </div>
          </div>
          <div className={styles.scoreCard}>
            <span className={styles.scoreLabel}>Autogol avversari</span>
            <div className={styles.stepper}>
              <button type="button" aria-label="Togli autogol" disabled={draft.autogolAvversari <= 0} onClick={() => setDraft((d) => ({ ...d, autogolAvversari: Math.max(0, d.autogolAvversari - 1) }))}>−</button>
              <strong>{draft.autogolAvversari}</strong>
              <button type="button" aria-label="Aggiungi autogol" disabled={draft.autogolAvversari >= 30} onClick={() => setDraft((d) => ({ ...d, autogolAvversari: d.autogolAvversari + 1 }))}>+</button>
            </div>
          </div>
        </div>

        {elimDiretta && (
          <div className={styles.koCard}>
            <p className={styles.koHead}>Eliminazione diretta</p>
            <label className={styles.koToggle}>
              <input type="checkbox" checked={draft.supplementari} onChange={(e) => setDraft((d) => ({ ...d, supplementari: e.target.checked }))} />
              <span>Supplementari giocati</span>
            </label>
            <div className={styles.koGrid}>
              <div className={styles.scoreCard}>
                <span className={styles.scoreLabel}>Rigori casa</span>
                <div className={styles.stepper}>
                  <button type="button" disabled={(draft.rigori?.casa ?? 0) <= 0} onClick={() => setDraft((d) => ({ ...d, rigori: { casa: Math.max(0, (d.rigori?.casa ?? 0) - 1), trasferta: d.rigori?.trasferta ?? 0 } }))}>−</button>
                  <strong>{draft.rigori?.casa ?? 0}</strong>
                  <button type="button" onClick={() => setDraft((d) => ({ ...d, rigori: { casa: (d.rigori?.casa ?? 0) + 1, trasferta: d.rigori?.trasferta ?? 0 } }))}>+</button>
                </div>
              </div>
              <div className={styles.scoreCard}>
                <span className={styles.scoreLabel}>Rigori trasferta</span>
                <div className={styles.stepper}>
                  <button type="button" disabled={(draft.rigori?.trasferta ?? 0) <= 0} onClick={() => setDraft((d) => ({ ...d, rigori: { casa: d.rigori?.casa ?? 0, trasferta: Math.max(0, (d.rigori?.trasferta ?? 0) - 1) } }))}>−</button>
                  <strong>{draft.rigori?.trasferta ?? 0}</strong>
                  <button type="button" onClick={() => setDraft((d) => ({ ...d, rigori: { casa: d.rigori?.casa ?? 0, trasferta: (d.rigori?.trasferta ?? 0) + 1 } }))}>+</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className={styles.modeRow} role="group" aria-label="Modalità tap">
          {MODALITA_LABEL.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`${styles.modeChip} ${modalita === m.id ? styles.modeActive : ''}`}
              onClick={() => setModalita(m.id)}
            >
              <strong>{m.titolo}</strong>
              <span>{m.descrizione}</span>
            </button>
          ))}
        </div>

        <div className={styles.grid} role="list" aria-label="Rosa">
          {giocatori.map((g) => {
            const gol = golGiocatore(g.id);
            const titolare = draft.titolari.includes(g.id);
            const inf = draft.infortunati.includes(g.id);
            const esp = draft.espulsi.includes(g.id);
            const voto = draft.prestazioni?.[g.id]?.voto;
            const tileClass = `${styles.tile} ${modalita === 'titolare' && titolare ? styles.tileTitolare : ''} ${inf ? styles.tileInfortunio : ''} ${esp ? styles.tileEspulso : ''}`;
            return (
              <div key={g.id} role="listitem" className={tileClass}>
                <button type="button" className={styles.tileMain} onClick={() => toccaGiocatore(g.id)}>
                  <span className={styles.roleTag}>{RUOLI_ETICHETTA[g.ruolo] ?? g.ruolo.slice(0,3).toUpperCase()}</span>
                  <span className={styles.nome}>
                    <strong>{g.nome}</strong>
                    <small>OVR {g.overall}</small>
                  </span>
                  <span className={styles.overall}>{g.overall}</span>
                </button>
                <div className={styles.badges}>
                  {titolare && <span className={`${styles.badge} ${styles.badgeXi}`}>XI</span>}
                  {inf && <span className={`${styles.badge} ${styles.badgeInf}`}>INF</span>}
                  {esp && <span className={`${styles.badge} ${styles.badgeEsp}`}>ESP</span>}
                  {voto !== undefined && <span className={`${styles.badge} ${styles.badgeVoto}`}>{voto.toFixed(1)}</span>}
                  {gol > 0 && (
                    <span className={`${styles.badge} ${styles.badgeGol}`}>
                      {gol}
                      <button type="button" aria-label="Togli gol" onClick={() => rimuoviGol(g.id)}>×</button>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.footer}>
          <p className={styles.hint}>
            Titolari {draft.titolari.length}/11 · Marcatori {totaleMarcatori} + autogol {draft.autogolAvversari} = {totaleMarcatori + draft.autogolAvversari}/{draft.golMiei}
            {draft.prestazioni && Object.keys(draft.prestazioni).length > 0 && <> · Voti {Object.keys(draft.prestazioni).length}</>}
          </p>
          {notaOk && <p className={styles.feedbackOk} role="status">{notaOk}</p>}
          {errore && <p className={styles.feedbackErr} role="alert">{errore}</p>}
          {confermaArmata && !errore && <p className={styles.feedbackWarn}>Invio definitivo: dopo l&apos;invio non potrai modificare questo referto.</p>}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cta}
              disabled={salvataggio}
              onClick={() => {
                if (!confermaArmata) {
                  const errori = valida();
                  setErrore(errori.length > 0 ? errori.join(' · ') : null);
                  if (errori.length === 0) setConfermaArmata(true);
                  return;
                }
                void conferma();
              }}
            >
              {salvataggio ? 'Salvataggio…' : confermaArmata ? 'Conferma: invio definitivo' : 'Invio definitivo'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
