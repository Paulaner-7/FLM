// FLM — Vista carriera: hub del game loop settimanale (PRD 3.3), UI broadcast.
// Tre viste: dashboard bento (match card + status + decisioni + tile vivi)
// → Referto (takeover) → RisultatiTurno. La navigazione è il tile hub (D3);
// azioni secondarie nel kebab della topbar (D11). Accento = colore club (D8).

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import Referto, { type DraftReferto } from './Referto';
import RisultatiTurno from './RisultatiTurno';
import { db, risolviFineStagione, generaContenutiTurno, generaMondoContenutiTurno, assicuratiMondoNotizie, prossimaPartita, rosaDellaCarriera, type EsitoRisoluzione, type EsitoConfermaReferto } from '../db';
import { calcolaClassifica, type RigaClassifica } from '../engine/classifica';
import { fasciaSpogliatoio, giocatoriInCrisi, moraleSpogliatoio } from '../engine/morale';
import { SOGLIA_FIDUCIA_ESONERO } from '../engine/rules';
import { xiDefault } from '../engine/referto';
import { posizioneTarget, progressoObiettivo, stimaFineStagione } from '../engine/societa';
import HubTopbar from '../components/hub/HubTopbar';
import MatchCard from '../components/hub/MatchCard';
import WorldNewsBoard from '../components/hub/WorldNewsBoard';
import TileGrid, { type TileDef } from '../components/hub/TileGrid';
import AlertStrip, { type Alerta } from '../components/hub/AlertStrip';
import { useEntrataHub } from '../components/hub/useEntrataHub';
import { accentiDaColori } from '../components/hub/accento';

import styles from './Carriera.module.css';
import type { Carriera, Competizione, Evento, Giocatore, MondoNotizia, Notizia, ObiettivoStagionale, Partita, Squadra, StatoClub } from '../types/entities';

const ETICHETTA_OBIETTIVO: Record<ObiettivoStagionale, string> = {
  salvezza: 'Salvezza',
  meta_classifica: 'Metà classifica',
  coppe: 'Coppe',
  titolo: 'Titolo',
};

type Vista = 'dashboard' | 'referto' | 'risultati';

interface CarrieraProps {
  carrieraId: string;
  onHome: () => void;
  onRosa: () => void;
  onClassifica: () => void;
  onCalendario: () => void;
  onCompetizioni: () => void;
  onMercato: () => void;
  onMail: () => void;
  onVivaio: () => void;
  onNazionale: () => void;
  onFineStagione: (esito: EsitoRisoluzione) => void;
  onStorico: () => void;
}

interface ImpegnoVivo {
  avversarioNome: string;
  inCasa: boolean;
  competizioneNome: string;
  settimana: number;
}

interface DatiCarriera {
  carriera: Carriera;
  squadra: Squadra;
  stato: StatoClub;
  competizione: Competizione;
  competizioniAttive: string[];
  campionatoId: string;
  campionatoNome: string;
  squadre: Map<string, Squadra>;
  giocatori: Giocatore[];
  prossima: Partita | null;
  avversaria: Squadra | null;
  eventiPendenti: Evento[];
  classifica: RigaClassifica[];
  rigaMia: RigaClassifica | undefined;
  giornateTotali: number;
  matchdayProssima: number;
  prossimiImpegni: ImpegnoVivo[];
  mailDaLeggere: number;
  trattativeAttive: number;
  giovaniInVivaio: number;
}

const DRAFT_VUOTO: Omit<DraftReferto, 'titolari'> = {
  golMiei: 0,
  golAvversario: 0,
  marcatori: [],
  infortunati: [],
  espulsi: [],
  autogolAvversari: 0,
  supplementari: false,
};

export default function Carriera({ carrieraId, onHome, onRosa, onClassifica, onCalendario, onCompetizioni, onMercato, onMail, onVivaio, onNazionale, onFineStagione, onStorico }: CarrieraProps): ReactElement {
  const [dati, setDati] = useState<DatiCarriera | null>(null);
  const [vista, setVista] = useState<Vista>('dashboard');
  const [draft, setDraft] = useState<DraftReferto | null>(null);
  const [esito, setEsito] = useState<EsitoConfermaReferto | null>(null);
  const [versioneDraft, setVersioneDraft] = useState(0);
  const [notizie, setNotizie] = useState<Notizia[] | null>(null);
  const [mondoNotizie, setMondoNotizie] = useState<MondoNotizia[] | null>(null);

  const carica = useCallback(async (): Promise<void> => {
    const [carriera, squadre, stato, competizioni, partite, eventiTutti, trattative] = await Promise.all([
      db.carriere.get(carrieraId),
      db.squadre.toArray(),
      db.statoClub.get(carrieraId),
      db.competizioni.toArray(),
      db.partite.toArray(),
      db.eventi.where('carrieraId').equals(carrieraId).toArray(),
      db.trattative.where('carrieraId').equals(carrieraId).toArray(),
    ]);
    if (!carriera || !stato) return;
    const squadra = squadre.find((s) => s.id === carriera.squadraId);
    if (!squadra) return;
    const campionato =
      competizioni.find((c) => c.carrieraId === carrieraId && c.tipo === 'campionato' && c.squadre.includes(squadra.id))
      ?? competizioni.find((c) => c.carrieraId === carrieraId && c.tipo === 'campionato');
    if (!campionato) return;
    const rosa = await rosaDellaCarriera(carrieraId, squadra.id);
    const prossima = await prossimaPartita(carrieraId, squadra.id);
    const competizione = prossima
      ? competizioni.find((c) => c.id === prossima.competizioneId) ?? campionato
      : campionato;
    const avversaria = prossima
      ? squadre.find((s) => s.id === (prossima.casa === squadra.id ? prossima.trasferta : prossima.casa)) ?? null
      : null;
    const eventiPendenti = eventiTutti.filter((e) => e.sceltaFatta === undefined);
    const partiteCampionato = partite.filter((p) => p.competizioneId === competizione.id);
    const classifica = calcolaClassifica(partiteCampionato, competizione.squadre);
    const rigaMia = classifica.find((r) => r.squadraId === squadra.id);
    const giornateTotali = partiteCampionato.filter(
      (p) => p.casa === squadra.id || p.trasferta === squadra.id,
    ).length;
    const matchdayProssima = prossima
      ? partite
          .filter(
            (p) => p.carrieraId === carrieraId && p.competizioneId === prossima.competizioneId
              && (p.casa === squadra.id || p.trasferta === squadra.id),
          )
          .sort((a, b) => a.settimana - b.settimana || a.slot.localeCompare(b.slot) || a.giornata - b.giornata || a.id.localeCompare(b.id))
          .findIndex((p) => p.id === prossima.id) + 1
      : 0;

    const nomeCompetizione = new Map(competizioni.filter((c) => c.carrieraId === carrieraId).map((c) => [c.id, c.nome]));
    const prossimiImpegni: ImpegnoVivo[] = partite
      .filter((p) => p.carrieraId === carrieraId && !p.giocata && (p.casa === squadra.id || p.trasferta === squadra.id))
      .sort((a, b) => a.settimana - b.settimana || a.slot.localeCompare(b.slot) || a.giornata - b.giornata)
      .slice(0, 3)
      .map((p) => ({
        avversarioNome: squadre.find((s) => s.id === (p.casa === squadra.id ? p.trasferta : p.casa))?.nome ?? '—',
        inCasa: p.casa === squadra.id,
        competizioneNome: nomeCompetizione.get(p.competizioneId) ?? '',
        settimana: p.settimana,
      }));

    setDati({
      carriera,
      squadra,
      stato,
      competizione,
      competizioniAttive: [...new Set(competizioni.filter((c) => c.carrieraId === carrieraId).map((c) => c.nome))],
      campionatoId: campionato.id,
      campionatoNome: campionato.nome,
      squadre: new Map(squadre.map((s) => [s.id, s])),
      giocatori: rosa.sort((a, b) => a.ruolo.localeCompare(b.ruolo, 'it') || b.overall - a.overall),
      prossima,
      avversaria,
      eventiPendenti,
      classifica,
      rigaMia,
      giornateTotali,
      matchdayProssima,
      prossimiImpegni,
      mailDaLeggere: eventiTutti.filter((e) => e.letta !== true).length,
      trattativeAttive: trattative.filter((t) => t.stato === 'proposta' || t.stato === 'trattativa' || t.stato === 'accordo').length,
      giovaniInVivaio: rosa.filter((g) => g.giovane).length,
    });
    // Mondo news non blocca il caricamento principale (ex loading infinito se LLM lento/fallisce)
    void assicuratiMondoNotizie(carrieraId)
      .then(setMondoNotizie)
      .catch((e) => {
        console.error('mondo news load fail', e);
        setMondoNotizie([]);
      });
  }, [carrieraId]);

  useEffect(() => {
    let alive = true;
    void carica()
      .then(() => {
        if (alive) setVista('dashboard');
      })
      .catch((e) => {
        console.error('carica carriera fail', e);
        // sblocca comunque per evitare loading infinito — dati potrebbe esser già null
        if (alive) setVista('dashboard');
      });
    return () => {
      alive = false;
    };
  }, [carica]);

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

  useEntrataHub(dati !== null && vista === 'dashboard');

  if (!dati) {
    return <main className="page-shell loading-page"><p>Caricamento carriera…</p></main>;
  }

  const { carriera, squadra, stato, competizione, giocatori, prossima, avversaria, eventiPendenti, classifica, rigaMia, giornateTotali, matchdayProssima } = dati;
  const moraleMedio = moraleSpogliatoio(giocatori);
  const inCrisi = giocatoriInCrisi(giocatori);
  const nSquadre = competizione.squadre.length;
  const progresso = progressoObiettivo({
    posizione: rigaMia?.posizione ?? nSquadre,
    giocate: rigaMia?.giocate ?? 0,
    obiettivo: carriera.obiettivo,
    nSquadre,
  });
  // targetObiettivo / stima non mostrati (sottotesto rimosso su richiesta)
  void posizioneTarget;
  void stimaFineStagione;
  void giornateTotali;
  void classifica;
  const panchinaARischio = stato.fiduciaSocieta < SOGLIA_FIDUCIA_ESONERO;

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
          void generaContenutiTurno({ carrieraId, partitaId: e.partita.id }).then((esitoGen) => {
            if (!esitoGen.scartata) setNotizie(esitoGen.notizie);
          });
          // World news: genera per la settimana appena chiusa (non blocca UI)
          void generaMondoContenutiTurno({ carrieraId, settimana: e.partita.settimana }).then((batch) => {
            if (batch.length) setMondoNotizie((prev) => [...batch, ...(prev ?? [])].slice(0, 12));
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
        squadre={dati.squadre}
        campionatoId={dati.campionatoId}
        campionatoNome={dati.campionatoNome}
        notizie={notizie}
        onDashboard={() => {
          void carica().then(() => {
            setDraft(null);
            setEsito(null);
            setVista('dashboard');
          });
        }}
        onCompetizioni={onCompetizioni}
      />
    );
  }

  // --- Hub dashboard (vista 'dashboard') ---

  const alerts: Alerta[] = [];
  if (eventiPendenti.length > 0) {
    alerts.push({
      id: 'decisioni',
      titolo: `${eventiPendenti.length} decision${eventiPendenti.length === 1 ? 'e' : 'i'} in sospeso.`,
      testo: `Hai scelte da prendere nello spogliatoio. Apri la posta per rispondere.`,
      azione: { etichetta: 'Apri Mail', onClick: onMail },
    });
  }
  if (panchinaARischio) {
    alerts.push({
      id: 'panchina',
      titolo: 'Panchina a rischio.',
      testo: `La fiducia della società è a ${stato.fiduciaSocieta}, sotto la soglia di ${SOGLIA_FIDUCIA_ESONERO}. Il presidente ha acceso i riflettori.`,
    });
  }
  if (inCrisi.length > 0) {
    alerts.push({
      id: 'crisi',
      titolo: `${inCrisi.length} giocatore${inCrisi.length === 1 ? '' : 'i'} in crisi.`,
      testo: `Morale sotto 30: ${inCrisi.map((g) => g.nome).join(', ')}.`,
      azione: { etichetta: 'Vai alla Rosa', onClick: onRosa },
    });
  }

  const mercatoAperto = stato.giornoMercato > 0;
  const tiles: TileDef[] = [
    {
      id: 'rosa',
      etichetta: 'Rosa',
      valore: moraleMedio,
      nota: `Morale ${fasciaSpogliatoio(moraleMedio).toLowerCase()}${inCrisi.length > 0 ? ` · ${inCrisi.length} in crisi` : ''} · ${giocatori.length} giocatori`,
      onApri: onRosa,
    },
    {
      id: 'classifica',
      etichetta: 'Classifica',
      valore: rigaMia ? `${rigaMia.posizione}ª` : '—',
      nota: `${rigaMia?.punti ?? 0} pt · ${dati.campionatoNome}`,
      onApri: onClassifica,
    },
    {
      id: 'calendario',
      etichetta: 'Calendario',
      valore: dati.prossimiImpegni[0]?.avversarioNome ?? '—',
      nota: dati.prossimiImpegni.length > 1
        ? `poi ${dati.prossimiImpegni.slice(1).map((i) => i.avversarioNome).join(', ')}`
        : (dati.prossimiImpegni[0] ? `${dati.prossimiImpegni[0].competizioneNome} · settimana ${dati.prossimiImpegni[0].settimana}` : 'Nessun impegno'),
      onApri: onCalendario,
    },
    {
      id: 'competizioni',
      etichetta: 'Competizioni',
      valore: dati.competizioniAttive.length,
      nota: dati.competizioniAttive.slice(0, 2).join(' · '),
      onApri: onCompetizioni,
    },
    {
      id: 'mercato',
      etichetta: 'Mercato',
      valore: mercatoAperto ? `G${stato.giornoMercato}` : 'Chiuso',
      nota: mercatoAperto
        ? `Finestra aperta · ${dati.trattativeAttive} trattative attive`
        : 'La finestra estiva apre a giugno',
      acceso: mercatoAperto,
      onApri: onMercato,
    },
    {
      id: 'vivaio',
      etichetta: 'Vivaio',
      valore: dati.giovaniInVivaio,
      nota: dati.giovaniInVivaio > 0 ? 'prospetti in rosa' : 'Nessun giovane: valuta il vivaio',
      onApri: onVivaio,
    },
  ];
  if (stato.nazionaleId) {
    tiles.push({
      id: 'nazionale',
      etichetta: 'Nazionale',
      valore: 'CT',
      nota: 'Convocazioni e torneo estivo',
      onApri: onNazionale,
    });
  }



  return (
    <main className="page-shell">
      <HubTopbar
        sezione="Carriera"
        onBrand={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
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

      <div className={styles.hub}>

        {/* KPI orizzontale: 3 fiducia + meta budget/reputazione */}
        <section className={styles.kpiStrip} data-hub-tile aria-label="Fiducia e obiettivo">
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiHead}>
                <span className={styles.kpiLabel}>Fiducia società</span>
                <strong className={styles.kpiVal}>{stato.fiduciaSocieta}</strong>
              </div>
              <span className={styles.kpiBarra} role="progressbar" aria-valuenow={stato.fiduciaSocieta} aria-valuemin={0} aria-valuemax={100}>
                <span className={`${styles.kpiFill} ${styles.kpiFillAccent}`} style={{ width: `${stato.fiduciaSocieta}%` }} />
              </span>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiHead}>
                <span className={styles.kpiLabel}>Fiducia tifosi</span>
                <strong className={styles.kpiVal}>{stato.fiduciaTifosi}</strong>
              </div>
              <span className={styles.kpiBarra} role="progressbar" aria-valuenow={stato.fiduciaTifosi} aria-valuemin={0} aria-valuemax={100}>
                <span className={`${styles.kpiFill} ${styles.kpiFillMint}`} style={{ width: `${stato.fiduciaTifosi}%` }} />
              </span>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiHead}>
                <span className={styles.kpiLabel}>Obiettivo · {ETICHETTA_OBIETTIVO[carriera.obiettivo]}</span>
                <strong className={styles.kpiVal}>{rigaMia?.posizione !== undefined ? `${rigaMia.posizione}ª` : '—'}<em>/{nSquadre} · {rigaMia?.punti ?? 0} pt</em></strong>
              </div>
              <span className={styles.kpiBarra} role="progressbar" aria-valuenow={progresso} aria-valuemin={0} aria-valuemax={100}>
                <span className={`${styles.kpiFill} ${styles.kpiFillPaper}`} style={{ width: `${progresso}%` }} />
              </span>
            </div>
          </div>

          <button type="button" className={styles.mailBox} onClick={onMail} aria-label={`Mail ${dati.mailDaLeggere > 0 ? `· ${dati.mailDaLeggere} non lette` : ''}`}>
            <svg className={styles.mailIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
            </svg>
            {dati.mailDaLeggere > 0 && <span className={styles.mailBadge}>{dati.mailDaLeggere}</span>}
          </button>
        </section>

        <AlertStrip alerts={alerts} />

        <div className={styles.bento}>
          <div className={styles.areaMatch} data-hub-tile>
            <MatchCard
              squadra={squadra}
              prossima={prossima}
              avversaria={avversaria}
              competizioneNome={competizione.nome}
              matchday={matchdayProssima}
              giornoMercato={stato.giornoMercato}
              onReferto={apriReferto}
              onMercato={onMercato}
              onConcludiStagione={() => void risolviFineStagione(carrieraId).then(onFineStagione)}
            />
          </div>

          <aside className={styles.areaNews} data-hub-tile aria-label="News dal mondo">
            <div className={styles.newsHead}>
              <span className={styles.newsTitle}>Dal mondo</span>
              <span className={`${styles.newsCount} ${(mondoNotizie?.length ?? 0) === 0 ? styles.newsCountVuoto : ''}`}>{mondoNotizie?.length ?? 0}</span>
            </div>
            <div className={styles.newsBody}>
              {mondoNotizie === null ? (
                <div className={styles.newsLoading} aria-live="polite">
                  <span className={styles.newsLoadingBar}><span /></span>
                  <span>Il giornale si sta stampando…</span>
                </div>
              ) : mondoNotizie.length === 0 ? (
                <div className={styles.newsEmpty}>
                  <strong>Edizione in preparazione</strong>
                  <span>Le notizie dal mondo (fuori dalla tua squadra) arriveranno dopo il prossimo turno.</span>
                </div>
              ) : (
                <WorldNewsBoard notizie={mondoNotizie} />
              )}
            </div>
          </aside>

          <div className={styles.areaTile} data-hub-tile>
            <TileGrid tiles={tiles} />
          </div>
        </div>
      </div>
    </main>
  );
}
