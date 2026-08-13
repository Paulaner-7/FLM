// FLM — Vista carriera: hub del game loop settimanale (PRD 3.3).
// Tre viste: dashboard (prossima partita + stato club) → Referto → RisultatiTurno.
// Il draft del referto vive qui: sopravvive a conferma e annullo ("torna indietro"
// riapre il referto già compilato) e muore solo uscendo dalla dashboard.

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import Referto, { type DraftReferto } from './Referto';
import RisultatiTurno from './RisultatiTurno';
import { db, decidiEvento, decidiRichiestaPromessa, generaContenutiTurno, promesseAttive, rosaDellaCarriera, type EsitoConfermaReferto } from '../db';
import { calcolaClassifica, type RigaClassifica } from '../engine/classifica';
import { fasciaSpogliatoio, giocatoriInCrisi, moraleSpogliatoio } from '../engine/morale';
import { PROMESSE_MAX_ATTIVE, SOGLIA_FIDUCIA_ESONERO } from '../engine/rules';
import { xiDefault } from '../engine/referto';
import { posizioneTarget, progressoObiettivo, stimaFineStagione } from '../engine/societa';
import type { Carriera, Competizione, Evento, Giocatore, Notizia, ObiettivoStagionale, Partita, Squadra, StatoClub } from '../types/entities';

const ETICHETTA_OBIETTIVO: Record<ObiettivoStagionale, string> = {
  salvezza: 'Salvezza',
  meta_classifica: 'Metà classifica',
  coppe: 'Coppe',
  titolo: 'Titolo',
};

const ETICHETTA_CATEGORIA: Record<Evento['categoria'], string> = {
  giocatore: 'Giocatore',
  societa: 'Società',
  tifosi_media: 'Tifosi & media',
};

type Vista = 'dashboard' | 'referto' | 'risultati';

interface CarrieraProps {
  carrieraId: string;
  onHome: () => void;
  onRosa: () => void;
  onClassifica: () => void;
  onCalendario: () => void;
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
  classifica: RigaClassifica[];
  rigaMia: RigaClassifica | undefined;
  giornateTotali: number;
}

const DRAFT_VUOTO: Omit<DraftReferto, 'titolari'> = {
  golMiei: 0,
  golAvversario: 0,
  marcatori: [],
  infortunati: [],
  prestazioniEccezionali: [],
  espulsi: [],
};

export default function Carriera({ carrieraId, onHome, onRosa, onClassifica, onCalendario }: CarrieraProps): ReactElement {
  const [dati, setDati] = useState<DatiCarriera | null>(null);
  const [vista, setVista] = useState<Vista>('dashboard');
  const [draft, setDraft] = useState<DraftReferto | null>(null);
  const [esito, setEsito] = useState<EsitoConfermaReferto | null>(null);
  const [versioneDraft, setVersioneDraft] = useState(0);
  /** Notizie del turno: null = generazione in corso (il giornale si sta stampando) */
  const [notizie, setNotizie] = useState<Notizia[] | null>(null);

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
      (e) => e.sceltaFatta === undefined,
    );
    const partiteCampionato = partite.filter((p) => p.competizioneId === competizione.id);
    const classifica = calcolaClassifica(partiteCampionato, competizione.squadre);
    const rigaMia = classifica.find((r) => r.squadraId === squadra.id);
    const giornateTotali = partiteCampionato.filter(
      (p) => p.casa === squadra.id || p.trasferta === squadra.id,
    ).length;
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
      classifica,
      rigaMia,
      giornateTotali,
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

  const { carriera, squadra, stato, competizione, squadre, giocatori, prossima, avversaria, eventiPendenti, classifica, rigaMia, giornateTotali } = dati;
  const inCasa = prossima !== null && prossima.casa === squadra.id;
  const moraleMedio = moraleSpogliatoio(giocatori);
  const inCrisi = giocatoriInCrisi(giocatori);
  const nSquadre = competizione.squadre.length;
  const targetObiettivo = posizioneTarget(carriera.obiettivo, nSquadre);
  const progresso = progressoObiettivo({
    posizione: rigaMia?.posizione ?? nSquadre,
    giocate: rigaMia?.giocate ?? 0,
    obiettivo: carriera.obiettivo,
    nSquadre,
  });
  const stima = stimaFineStagione({
    squadraId: squadra.id,
    classifica,
    giornateTotali,
    obiettivo: carriera.obiettivo,
    nSquadre,
  });
  const panchinaARischio = stato.fiduciaSocieta < SOGLIA_FIDUCIA_ESONERO;

  const decidi = async (evento: Evento, scelta: 0 | 1): Promise<void> => {
    try {
      await decidiRichiestaPromessa(evento.id, scelta);
      await carica();
    } catch (e) {
      // La decisione non è andata a buon fine: la richiesta resta in attesa
      console.error(e);
    }
  };

  const decidiNarrativo = async (evento: Evento, scelta: number): Promise<void> => {
    try {
      await decidiEvento(evento.id, scelta);
      await carica();
    } catch (e) {
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
          setNotizie(null);
          setVista('risultati');
          // Generazione contenuti in background (PRD 4.2/4.6): mai dentro la
          // transazione del referto. Se il referto viene annullato nel frattempo,
          // la guardia interna scarta tutto (niente eventi orfani).
          void generaContenutiTurno({ carrieraId, partitaId: e.partita.id }).then((esitoGen) => {
            if (!esitoGen.scartata) setNotizie(esitoGen.notizie);
          });
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
        notizie={notizie}
        onTornaIndietro={() => {
          setNotizie(null);
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
          <nav className="topbar-nav" aria-label="Navigazione carriera">
            <button className="button button-outline button-small" type="button" onClick={onRosa}>Rosa</button>
            <button className="button button-outline button-small" type="button" onClick={onClassifica}>Classifica</button>
            <button className="button button-outline button-small" type="button" onClick={onCalendario}>Calendario</button>
          </nav>
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
          <div className="summary-card"><strong>{stato.reputazioneAllenatore}</strong><span>Reputazione mister</span></div>
          <div className="summary-card"><strong>{moraleMedio}</strong><span>Morale spogliatoio · {fasciaSpogliatoio(moraleMedio)}</span></div>
        </div>

        <section className="societa-block" aria-label="Società, obiettivi e fiducia">
          <p className="eyebrow">Società</p>
          {panchinaARischio && (
            <div className="crisi-alert" role="alert">
              <span className="signal-dot" aria-hidden="true" />
              <p><strong>Panchina a rischio.</strong> La fiducia della società è a {stato.fiduciaSocieta}, sotto la soglia di {SOGLIA_FIDUCIA_ESONERO}. L'esonero vero arriverà in una milestone futura, ma il presidente ha già acceso i riflettori.</p>
            </div>
          )}
          <div className="societa-grid">
            <div className="societa-card">
              <span className="societa-label">Fiducia società</span>
              <div className="fiducia-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stato.fiduciaSocieta} aria-label="Fiducia società"><span className="fiducia-fill fiducia-fill-societa" style={{ width: `${stato.fiduciaSocieta}%` }} /></div>
              <strong className="fiducia-numero">{stato.fiduciaSocieta}<em>/100</em></strong>
            </div>
            <div className="societa-card">
              <span className="societa-label">Fiducia tifosi</span>
              <div className="fiducia-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stato.fiduciaTifosi} aria-label="Fiducia tifosi"><span className="fiducia-fill fiducia-fill-tifosi" style={{ width: `${stato.fiduciaTifosi}%` }} /></div>
              <strong className="fiducia-numero">{stato.fiduciaTifosi}<em>/100</em></strong>
            </div>
            <div className="societa-card societa-card-obiettivo">
              <span className="societa-label">Obiettivo: {ETICHETTA_OBIETTIVO[carriera.obiettivo]} · {targetObiettivo}ª o meglio</span>
              <div className="fiducia-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso} aria-label="Avanzamento obiettivo stagionale"><span className="fiducia-fill fiducia-fill-obiettivo" style={{ width: `${progresso}%` }} /></div>
              <strong className="fiducia-numero">{rigaMia ? `${rigaMia.posizione}ª` : '—'}<em>/{nSquadre} · {rigaMia?.punti ?? 0} pt</em></strong>
              {stima ? (
                <span className={`fiducia-stima${stima.inTraiettoria ? ' fiducia-stima-ok' : ''}`}>
                  Stima fine stagione: {stima.posizioneStimata}ª ({stima.puntiProiettati} pt)
                </span>
              ) : (
                <span className="fiducia-stima">Nessuna partita giocata: nessuna stima.</span>
              )}
            </div>
          </div>
        </section>

        {inCrisi.length > 0 && (
          <div className="crisi-alert">
            <span className="signal-dot" aria-hidden="true" />
            <p><strong>{inCrisi.length} giocatore{inCrisi.length === 1 ? '' : 'i'} in crisi</strong> (morale sotto 30): {inCrisi.map((g) => g.nome).join(', ')}.</p>
            <button className="button button-outline button-small" type="button" onClick={onRosa}>Vai alla Rosa</button>
          </div>
        )}

        {eventiPendenti.length > 0 && (
          <div className="richieste-sezione">
            <p className="eyebrow">Decisioni da prendere</p>
            {eventiPendenti.map((e) => {
              if (e.promessaProposta !== undefined) {
                const giocatore = giocatori.find((g) => g.id === e.promessaProposta?.giocatoreId);
                const pieno = giocatore !== undefined && promesseAttive(giocatore) >= PROMESSE_MAX_ATTIVE;
                return (
                  <div className="richiesta-card" key={e.id}>
                    <div>
                      <span className="status-pill">Richiesta giocatore</span>
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
              }
              return (
                <div className="richiesta-card evento-card" key={e.id}>
                  <div>
                    <span className="status-pill">{ETICHETTA_CATEGORIA[e.categoria]}</span>
                    <strong>{e.titolo}</strong>
                    <p>{e.testo}</p>
                    {e.giocatoriCoinvolti.length > 0 && (
                      <small>Coinvolti: {e.giocatoriCoinvolti.join(', ')}</small>
                    )}
                  </div>
                  <div className="richiesta-azioni">
                    {e.opzioni.map((opzione, indice) => (
                      <button
                        key={indice}
                        type="button"
                        className={`button button-small ${indice === 0 ? 'button-primary' : 'button-outline'}`}
                        onClick={() => void decidiNarrativo(e, indice)}
                      >
                        {opzione.testo}
                      </button>
                    ))}
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
