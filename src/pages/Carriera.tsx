// FLM — Vista carriera: hub del game loop settimanale (PRD 3.3).
// Tre viste: dashboard (prossima partita + stato club) → Referto → RisultatiTurno.
// Il draft del referto vive qui: sopravvive a conferma e annullo ("torna indietro"
// riapre il referto già compilato) e muore solo uscendo dalla dashboard.

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import Referto, { type DraftReferto } from './Referto';
import RisultatiTurno from './RisultatiTurno';
import { db, decidiRichiestaPromessa, promesseAttive, rosaDellaCarriera, type EsitoConfermaReferto } from '../db';
import { fasciaSpogliatoio, giocatoriInCrisi, moraleSpogliatoio } from '../engine/morale';
import { PROMESSE_MAX_ATTIVE } from '../engine/rules';
import { xiDefault } from '../engine/referto';
import type { Carriera, Competizione, Evento, Giocatore, Partita, Squadra, StatoClub } from '../types/entities';

type Vista = 'dashboard' | 'referto' | 'risultati';

interface CarrieraProps {
  carrieraId: string;
  onHome: () => void;
  onRosa: () => void;
}

interface DatiCarriera {
  carriera: Carriera;
  squadra: Squadra;
  stato: StatoClub;
  competizione: Competizione;
  squadre: Map<string, Squadra>;
  giocatori: Giocatore[];
  prossima: Partita | null;
  avversaria: Squadra | null;
  eventiPendenti: Evento[];
}

const DRAFT_VUOTO: Omit<DraftReferto, 'titolari'> = {
  golMiei: 0,
  golAvversario: 0,
  marcatori: [],
  infortunati: [],
  prestazioniEccezionali: [],
  espulsi: [],
};

export default function Carriera({ carrieraId, onHome, onRosa }: CarrieraProps): ReactElement {
  const [dati, setDati] = useState<DatiCarriera | null>(null);
  const [vista, setVista] = useState<Vista>('dashboard');
  const [draft, setDraft] = useState<DraftReferto | null>(null);
  const [esito, setEsito] = useState<EsitoConfermaReferto | null>(null);
  const [versioneDraft, setVersioneDraft] = useState(0);

  const carica = useCallback(async (): Promise<void> => {
    const [carriera, squadre, stato, competizioni, partite] = await Promise.all([
      db.carriere.get(carrieraId),
      db.squadre.toArray(),
      db.statoClub.get(carrieraId),
      db.competizioni.toArray(),
      db.partite.toArray(),
    ]);
    if (!carriera || !stato) return;
    const squadra = squadre.find((s) => s.id === carriera.squadraId);
    if (!squadra) return;
    const competizione = competizioni.find((c) => c.carrieraId === carrieraId && c.tipo === 'campionato');
    if (!competizione) return;
    const rosa = await rosaDellaCarriera(carrieraId, squadra.id);
    const prossima = partite
      .filter((p) => p.competizioneId === competizione.id && !p.giocata && (p.casa === squadra.id || p.trasferta === squadra.id))
      .sort((a, b) => a.giornata - b.giornata)[0] ?? null;
    const avversaria = prossima
      ? squadre.find((s) => s.id === (prossima.casa === squadra.id ? prossima.trasferta : prossima.casa)) ?? null
      : null;
    const eventiPendenti = (await db.eventi.where('carrieraId').equals(carrieraId).toArray()).filter(
      (e) => e.promessaProposta !== undefined && e.sceltaFatta === undefined,
    );
    setDati({
      carriera,
      squadra,
      stato,
      competizione,
      squadre: new Map(squadre.map((s) => [s.id, s])),
      giocatori: rosa.sort((a, b) => a.ruolo.localeCompare(b.ruolo, 'it') || b.overall - a.overall),
      prossima,
      avversaria,
      eventiPendenti,
    });
  }, [carrieraId]);

  useEffect(() => {
    let alive = true;
    void carica().then(() => {
      if (alive) setVista('dashboard');
    });
    return () => {
      alive = false;
    };
  }, [carica]);

  if (!dati) {
    return <main className="page-shell loading-page"><p>Caricamento carriera…</p></main>;
  }

  const { carriera, squadra, stato, competizione, squadre, giocatori, prossima, avversaria, eventiPendenti } = dati;
  const inCasa = prossima !== null && prossima.casa === squadra.id;
  const moraleMedio = moraleSpogliatoio(giocatori);
  const inCrisi = giocatoriInCrisi(giocatori);

  const decidi = async (evento: Evento, scelta: 0 | 1): Promise<void> => {
    try {
      await decidiRichiestaPromessa(evento.id, scelta);
      await carica();
    } catch (e) {
      // La decisione non è andata a buon fine: la richiesta resta in attesa
      console.error(e);
    }
  };

  const apriReferto = (): void => {
    if (!prossima) return;
    setDraft((d) => d ?? { ...DRAFT_VUOTO, titolari: xiDefault(giocatori) });
    setVersioneDraft((v) => v + 1);
    setVista('referto');
  };

  if (vista === 'referto' && prossima && draft && avversaria) {
    return (
      <Referto
        key={`referto-${versioneDraft}`}
        carrieraId={carrieraId}
        partita={prossima}
        squadra={squadra}
        avversaria={avversaria}
        competizione={competizione}
        giocatori={giocatori}
        initial={draft}
        onConfermato={(e) => {
          setEsito(e);
          setVista('risultati');
        }}
        onAnnulla={() => setVista('dashboard')}
      />
    );
  }

  if (vista === 'risultati' && esito) {
    return (
      <RisultatiTurno
        carrieraId={carrieraId}
        esito={esito}
        squadraId={squadra.id}
        squadre={squadre}
        giornata={prossima?.giornata ?? 1}
        competizioneNome={competizione.nome}
        onTornaIndietro={() => {
          void carica().then(() => {
            setVista('referto');
            setVersioneDraft((v) => v + 1);
          });
        }}
        onDashboard={() => {
          void carica().then(() => {
            setDraft(null);
            setEsito(null);
            setVista('dashboard');
          });
        }}
      />
    );
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={onHome}>FLM <span>/ Carriera</span></button>
        <div className="topbar-actions">
          <span className="topbar-note">{carriera.campionato} · {carriera.stagione} · settimana {stato.settimanaCorrente}</span>
          <button className="button button-outline button-small" type="button" onClick={onRosa}>Rosa</button>
        </div>
      </header>

      <section className="content-wrap result-page carriera-page">
        <p className="eyebrow">Salvataggio attivo</p>
        <h1>{squadra.nome}</h1>
        <p className="intro">Il gioco settimanale: gioca la partita in FL26, torna qui per il referto.</p>

        <div className="summary-grid">
          <div className="summary-card"><strong>{carriera.campionato}</strong><span>Campionato</span></div>
          <div className="summary-card"><strong>{stato.budget.toLocaleString('it-IT')} €</strong><span>Budget</span></div>
          <div className="summary-card"><strong>{stato.settimanaCorrente}</strong><span>Settimana</span></div>
          <div className="summary-card"><strong>{stato.fiduciaSocieta}</strong><span>Fiducia società</span></div>
          <div className="summary-card"><strong>{stato.fiduciaTifosi}</strong><span>Fiducia tifosi</span></div>
          <div className="summary-card"><strong>{stato.reputazioneAllenatore}</strong><span>Reputazione mister</span></div>
          <div className="summary-card"><strong>{moraleMedio}</strong><span>Morale spogliatoio · {fasciaSpogliatoio(moraleMedio)}</span></div>
        </div>

        {inCrisi.length > 0 && (
          <div className="crisi-alert">
            <span className="signal-dot" aria-hidden="true" />
            <p><strong>{inCrisi.length} giocatore{inCrisi.length === 1 ? '' : 'i'} in crisi</strong> (morale sotto 30): {inCrisi.map((g) => g.nome).join(', ')}.</p>
            <button className="button button-outline button-small" type="button" onClick={onRosa}>Vai alla Rosa</button>
          </div>
        )}

        {eventiPendenti.length > 0 && (
          <div className="richieste-sezione">
            <p className="eyebrow">Spogliatoio</p>
            {eventiPendenti.map((e) => {
              const giocatore = giocatori.find((g) => g.id === e.promessaProposta?.giocatoreId);
              const pieno = giocatore !== undefined && promesseAttive(giocatore) >= PROMESSE_MAX_ATTIVE;
              return (
                <div className="richiesta-card" key={e.id}>
                  <div>
                    <strong>{e.titolo}</strong>
                    <p>{e.testo}</p>
                    {pieno && <small>Massimo {PROMESSE_MAX_ATTIVE} promesse attive: rifiuta o attendi la scadenza.</small>}
                  </div>
                  <div className="richiesta-azioni">
                    <button
                      type="button"
                      className="button button-primary button-small"
                      disabled={pieno}
                      onClick={() => void decidi(e, 0)}
                    >
                      Prometti
                    </button>
                    <button type="button" className="button button-outline button-small" onClick={() => void decidi(e, 1)}>
                      Rifiuta
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="next-match">
          {prossima && avversaria ? (
            <>
              <p className="eyebrow">Prossima partita · {competizione.nome} · giornata {prossima.giornata}</p>
              <div className="next-match-card">
                <div className="next-match-teams">
                  <span className={inCasa ? 'next-match-user' : ''}>{inCasa ? squadra.nome : avversaria.nome}</span>
                  <span className="next-match-vs">VS</span>
                  <span className={inCasa ? '' : 'next-match-user'}>{inCasa ? avversaria.nome : squadra.nome}</span>
                </div>
                <div className="next-match-meta">
                  <span className="status-pill status-ok">{inCasa ? 'In casa' : 'In trasferta'}</span>
                  <span>Potenza avversaria: {avversaria.rating}</span>
                </div>
              </div>
              <button type="button" className="button button-primary button-large" onClick={apriReferto}>
                Inserisci referto<span>→</span>
              </button>
            </>
          ) : (
            <div className="empty-roster">
              <strong>Stagione completata</strong>
              <span>Hai giocato tutte le giornate. La nuova stagione arriverà in una milestone futura.</span>
            </div>
          )}
        </div>

        <button className="button button-outline" type="button" onClick={onHome}>← Torna alla home</button>
      </section>
    </main>
  );
}
