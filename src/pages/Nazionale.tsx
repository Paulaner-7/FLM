// FLM — Sezione CT: rosa nazionale, torneo estivo, referti (PRD 7.7).
// Appare in estate quando l'utente è CT e c'è un torneo Mondiale/Europeo.

import { useEffect, useState, type ReactElement } from 'react';
import {
  generaTorneoEstivo,
  convocatiDellaRosa,
  rosaNazionaleSnapshot,
  applicaEffettiRitorno,
  db,
} from '../db';
import HubTopbar from '../components/hub/HubTopbar';
import { accentiDaColori } from '../components/hub/accento';
import type { Giocatore, Squadra } from '../types/entities';
import type { StatoTorneo } from '../db';

interface NazionaleProps {
  carrieraId: string;
  onBack: () => void;
}

export default function Nazionale({ carrieraId, onBack }: NazionaleProps): ReactElement {
  const [torneo, setTorneo] = useState<StatoTorneo | null>(null);
  const [rosaNT, setRosaNT] = useState<Giocatore[]>([]);
  const [convocatiRosa, setConvocatiRosa] = useState<Giocatore[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [squadra, setSquadra] = useState<Squadra | undefined>(undefined);
  const [stagione, setStagione] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        // Carica stato
        const stato = await db.statoClub.get(carrieraId);
        const carriera = await db.carriere.get(carrieraId);
        if (!stato?.nazionaleId || !carriera) {
          setCaricamento(false);
          return;
        }

        // Trova la nazionale
        const tutteSquadre = await db.squadre.where('carrieraId').equals(carrieraId).toArray();
        const squadraCarriera = tutteSquadre.find((s) => s.id === carriera.squadraId);
        setSquadra(squadraCarriera);
        setStagione(carriera.stagione);
        const nazionale = tutteSquadre.find((s) => s.id === stato.nazionaleId);
        if (!nazionale) {
          setCaricamento(false);
          return;
        }

        // Rosa NT (top N per overall dalla nazionalità)
        const rosa = await rosaNazionaleSnapshot(carrieraId, nazionale.nome, 30);
        setRosaNT(rosa);

        // Convocati dalla tua rosa di club
        const conv = await convocatiDellaRosa(carrieraId, carriera.squadraId, tutteSquadre.filter((s) => s.nazionale));
        setConvocatiRosa(conv);

        // Genera torneo se non esiste già
        const compTorneo = (await db.competizioni.where('carrieraId').equals(carrieraId).toArray())
          .find((c) => c.tipo === 'mondiale' || c.tipo === 'europeo');
        if (!compTorneo) {
          const statoTorneo = await generaTorneoEstivo(carrieraId, carriera.stagione);
          setTorneo(statoTorneo);
        } else {
          // Carica stato esistente
          setTorneo({
            competizione: compTorneo,
            gironi: [],
            classifiche: new Map(),
            fase: compTorneo.fase,
            tuaNazionale: stato.nazionaleId
              ? { id: stato.nazionaleId, nome: nazionale.nome, eliminata: false }
              : undefined,
          });
        }
      } finally {
        setCaricamento(false);
      }
    })();
  }, [carrieraId]);

  const handleEffettiRitorno = async (): Promise<void> => {
    try {
      const carriera = await db.carriere.get(carrieraId);
      if (!carriera) return;
      const tutteSquadre = await db.squadre.where('carrieraId').equals(carrieraId).toArray();
      const nazionali = tutteSquadre.filter((s) => s.nazionale);
      const effetti = await applicaEffettiRitorno(carrieraId, carriera.squadraId, nazionali, {
        vittorie: 3,
        sconfitte: 1,
        eliminato: false,
      });
      setFeedback(`Rientro: ${effetti.convocati} giocatori convocati, forma media ${effetti.formaDelta}, morale ${effetti.moraleDelta}`);
    } catch (e) {
      setFeedback(`Errore: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // D8 — accento dinamico
  const primario = squadra?.colori?.primario;
  const secondario = squadra?.colori?.secondario;
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

  if (caricamento) return <div className="page-shell loading-page"><p>Caricamento…</p></div>;

  return (
    <main className="page-shell">
      <HubTopbar
        sezione="Nazionale"
        contesto={stagione}
        onBrand={onBack}
        onStorico={() => {}}
        onEsporta={() => {}}
        onHome={onBack}
        squadra={squadra ? { nome: squadra.nome, nazione: squadra.nazione, colori: squadra.colori } : undefined}
      />

      <section className="content-wrap">
      <p className="eyebrow">Sezione Nazionale</p>
      <h1>Sezione Nazionale</h1>

      {torneo ? (
        <>
          <div className="torneo-header">
            <h2>{torneo.competizione.nome} — {torneo.fase}</h2>
            {torneo.tuaNazionale && (
              <p>La tua nazionale: <strong>{torneo.tuaNazionale.nome}</strong></p>
            )}
          </div>

          {/* Gironi */}
          {torneo.gironi.length > 0 && (
            <section className="gironi-section">
              <h3>Gironi</h3>
              <div className="gironi-grid">
                {torneo.gironi.map((g) => (
                  <div key={g.nome} className="girone-card">
                    <h4>{g.nome}</h4>
                    <ol>
                      {g.squadre.map((s) => (
                        <li key={s.id}>{s.nome}</li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <p>Nessun torneo estivo in corso.</p>
      )}

      {/* Rosa nazionale */}
      <section className="rosa-nt-section">
        <h3>Rosa nazionale ({rosaNT.length} giocatori)</h3>
        <ul className="rosa-list">
          {rosaNT.map((g) => (
            <li key={g.id}>
              <span className="giocatore-nome">{g.nome}</span>
              <span className="giocatore-ruolo">{g.ruolo}</span>
              <span className="giocatore-overall">{g.overall}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Convocati dalla tua rosa di club */}
      {convocatiRosa.length > 0 && (
        <section className="convocati-section">
          <h3>Convocati dalla tua rosa ({convocatiRosa.length})</h3>
          <ul className="rosa-list">
            {convocatiRosa.map((g) => (
              <li key={g.id}>
                <span className="giocatore-nome">{g.nome}</span>
                <span className="giocatore-ruolo">{g.ruolo}</span>
                <span className="giocatore-overall">{g.overall}</span>
              </li>
            ))}
          </ul>
          <button className="button button-outline" type="button" onClick={() => void handleEffettiRitorno()}>
            Applica effetti ritorno
          </button>
        </section>
      )}

      {feedback && <p className="feedback-text">{feedback}</p>}
      </section>
    </main>
  );
}
