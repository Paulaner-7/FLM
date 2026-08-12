// FLM — Pagina Referto (PRD 3.3: inserimento <60 secondi).
// Nessuna tastiera: stepper ± per i gol, tap sui giocatori per marcatori,
// titolari e note. Unico campo "obbligatorio" = il risultato (PRD, sezione rischi).

import { useState, type ReactElement } from 'react';
import { confermaReferto, type EsitoConfermaReferto } from '../db';
import { XI_TOTALE } from '../engine/referto';
import type { Competizione, Giocatore, Partita, Squadra } from '../types/entities';

export interface DraftReferto {
  golMiei: number;
  golAvversario: number;
  /** ID marcatori in ordine di tap (ripetuti per ogni gol) */
  marcatori: string[];
  titolari: string[];
  infortunati: string[];
  prestazioniEccezionali: string[];
  espulsi: string[];
}

export type ModalitaNota = 'infortunio' | 'prestazione' | 'espulsione';

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
  { id: 'gol', titolo: 'Gol', descrizione: 'Un tap = un gol del giocatore' },
  { id: 'titolare', titolo: 'Titolare', descrizione: 'Chi è partito in campo (minuti +90)' },
  { id: 'infortunio', titolo: 'Infortunio', descrizione: 'Stop di 2 settimane' },
  { id: 'prestazione', titolo: 'Prestazione', descrizione: 'Forma +10' },
  { id: 'espulsione', titolo: 'Espulsione', descrizione: 'Registrata nelle note' },
];

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

  const inCasa = partita.casa === squadra.id;
  const golGiocatore = (id: string): number =>
    draft.marcatori.filter((m) => m === id).length;
  const totaleMarcatori = draft.marcatori.length;
  const mismatch = draft.golMiei !== totaleMarcatori;

  const toggleIn = (lista: string[], id: string): string[] =>
    lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];

  const toccaGiocatore = (id: string): void => {
    setErrore(null);
    setDraft((d) => {
      if (modalita === 'gol') {
        return { ...d, marcatori: [...d.marcatori, id] };
      }
      if (modalita === 'titolare') {
        if (d.titolari.includes(id)) {
          return { ...d, titolari: d.titolari.filter((x) => x !== id) };
        }
        if (d.titolari.length >= XI_TOTALE) return d; // max 11
        return { ...d, titolari: [...d.titolari, id] };
      }
      if (modalita === 'infortunio') {
        return { ...d, infortunati: toggleIn(d.infortunati, id) };
      }
      if (modalita === 'prestazione') {
        return { ...d, prestazioniEccezionali: toggleIn(d.prestazioniEccezionali, id) };
      }
      return { ...d, espulsi: toggleIn(d.espulsi, id) };
    });
  };

  const rimuoviGol = (id: string): void => {
    const indice = draft.marcatori.lastIndexOf(id);
    if (indice === -1) return;
    setDraft((d) => ({ ...d, marcatori: d.marcatori.filter((_, i) => i !== indice) }));
  };

  const conferma = async (): Promise<void> => {
    setSalvataggio(true);
    setErrore(null);
    try {
      const esito = await confermaReferto({
        carrieraId,
        partitaId: partita.id,
        golMiei: draft.golMiei,
        golAvversario: draft.golAvversario,
        marcatori: draft.marcatori,
        titolari: draft.titolari,
        infortunati: draft.infortunati,
        prestazioniEccezionali: draft.prestazioniEccezionali,
        espulsi: draft.espulsi,
      });
      onConfermato(esito);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore durante il salvataggio del referto');
      setSalvataggio(false);
    }
  };

  return (
    <main className="page-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={onAnnulla}>FLM <span>/ Referto</span></button>
        <div className="topbar-actions">
          <span className="topbar-note">{competizione.nome} · giornata {partita.giornata}</span>
        </div>
      </header>

      <section className="content-wrap referto-page">
        <p className="eyebrow">Partita da giocare in FL26</p>
        <h1>Referto</h1>

        {/* Scheda partita */}
        <div className="match-card">
          <div className={`match-team ${inCasa ? 'match-team-user' : ''}`}>
            <span className="match-side-label">{inCasa ? 'Casa' : 'Trasferta'}</span>
            <strong>{inCasa ? squadra.nome : avversaria.nome}</strong>
            <small>Potenza {inCasa ? squadra.rating : avversaria.rating}</small>
          </div>
          <div className="match-versus">VS</div>
          <div className={`match-team ${inCasa ? '' : 'match-team-user'}`}>
            <span className="match-side-label">{inCasa ? 'Trasferta' : 'Casa'}</span>
            <strong>{inCasa ? avversaria.nome : squadra.nome}</strong>
            <small>Potenza {inCasa ? avversaria.rating : squadra.rating}</small>
          </div>
        </div>

        {/* Risultato: stepper senza tastiera */}
        <div className="score-panel">
          <div className="score-side">
            <span className="score-label">I tuoi gol</span>
            <div className="score-stepper">
              <button type="button" aria-label="Togli un gol" disabled={draft.golMiei <= 0}
                onClick={() => setDraft((d) => ({ ...d, golMiei: Math.max(0, d.golMiei - 1) }))}>−</button>
              <strong>{draft.golMiei}</strong>
              <button type="button" aria-label="Aggiungi un gol" disabled={draft.golMiei >= 30}
                onClick={() => setDraft((d) => ({ ...d, golMiei: d.golMiei + 1 }))}>+</button>
            </div>
          </div>
          <div className="score-side">
            <span className="score-label">Gol avversario</span>
            <div className="score-stepper">
              <button type="button" aria-label="Togli un gol avversario" disabled={draft.golAvversario <= 0}
                onClick={() => setDraft((d) => ({ ...d, golAvversario: Math.max(0, d.golAvversario - 1) }))}>−</button>
              <strong>{draft.golAvversario}</strong>
              <button type="button" aria-label="Aggiungi un gol avversario" disabled={draft.golAvversario >= 30}
                onClick={() => setDraft((d) => ({ ...d, golAvversario: d.golAvversario + 1 }))}>+</button>
            </div>
          </div>
        </div>

        {/* Modalità tap */}
        <div className="mode-row" role="group" aria-label="Modalità tap sui giocatori">
          {MODALITA_LABEL.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`mode-chip ${modalita === m.id ? 'mode-chip-active' : ''}`}
              onClick={() => setModalita(m.id)}
            >
              <strong>{m.titolo}</strong>
              <span>{m.descrizione}</span>
            </button>
          ))}
        </div>

        {/* Rosa: tap = azione della modalità attiva */}
        <div className="player-grid" role="list" aria-label="Rosa">
          {giocatori.map((g) => {
            const gol = golGiocatore(g.id);
            const titolare = draft.titolari.includes(g.id);
            const infortunio = draft.infortunati.includes(g.id);
            const prestazione = draft.prestazioniEccezionali.includes(g.id);
            const espulso = draft.espulsi.includes(g.id);
            return (
              <div
                key={g.id}
                role="listitem"
                className={`player-tile ${modalita === 'titolare' && titolare ? 'player-tile-titolare' : ''} ${infortunio ? 'player-tile-infortunio' : ''} ${prestazione ? 'player-tile-prestazione' : ''} ${espulso ? 'player-tile-espulso' : ''}`}
              >
                <button type="button" className="player-tile-main" onClick={() => toccaGiocatore(g.id)}>
                  <span className="role-tag">{RUOLI_ETICHETTA[g.ruolo] ?? g.ruolo}</span>
                  <span className="player-tile-nome">
                    <strong>{g.nome}</strong>
                    <small>Overall {g.overall}</small>
                  </span>
                  <span className="overall-mini">{g.overall}</span>
                </button>
                <div className="player-tile-badge">
                  {titolare && <span className="badge badge-xi">XI</span>}
                  {infortunio && <span className="badge badge-inf">INF</span>}
                  {prestazione && <span className="badge badge-pre">★</span>}
                  {espulso && <span className="badge badge-esp">ESP</span>}
                  {gol > 0 && (
                    <span className="badge badge-gol">
                      {gol}
                      <button type="button" aria-label="Togli un gol" onClick={() => rimuoviGol(g.id)}>×</button>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Stato selezione + avviso morbido */}
        <div className="referto-footer">
          <p className="referto-hint">
            Titolari {draft.titolari.length}/11 · Marcatori {totaleMarcatori}/{draft.golMiei}
          </p>
          {mismatch && (
            <p className="feedback feedback-warn">
              {totaleMarcatori < draft.golMiei
                ? `Mancano ${draft.golMiei - totaleMarcatori} marcatori (facoltativo)`
                : `${totaleMarcatori - draft.golMiei} gol marcati senza gol nel risultato (facoltativo)`}
            </p>
          )}
          {errore && <p className="feedback feedback-error">{errore}</p>}
          <div className="referto-actions">
            <button type="button" className="button button-outline" onClick={onAnnulla}>Annulla</button>
            <button type="button" className="button button-primary button-large" disabled={salvataggio} onClick={() => void conferma()}>
              {salvataggio ? 'Salvataggio…' : 'Conferma referto'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
