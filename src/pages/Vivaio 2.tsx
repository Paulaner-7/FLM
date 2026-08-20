// FLM — Pagina Vivaio (PRD 7.5): intake dell'anno, i tuoi giovani, prestiti,
// export coordinato per PES Editor, banner LLM offline con Riprova.
// I numeri arrivano dall'engine; l'LLM scrive solo identità e narrativa.

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { db, eseguiPrestitoUtente, esportaPacchettoEditor, generaIntake } from '../db';
import { nomePosizionePes } from '../engine/attributi';
import { scaricaFile } from '../bridge';
import type { Carriera, Giocatore, Squadra, SquadAssignment, StatoClub } from '../types/entities';

interface DatiVivaio {
  carriera: Carriera;
  stato: StatoClub;
  squadra: Squadra | undefined;
  squadre: Map<string, Squadra>;
  giocatori: Giocatore[];
  assegnazioni: SquadAssignment[];
}

interface VivaioProps {
  carrieraId: string;
  onBack: () => void;
}

export default function Vivaio({ carrieraId, onBack }: VivaioProps): ReactElement {
  const [dati, setDati] = useState<DatiVivaio | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; testo: string } | null>(null);
  const [occupato, setOccupato] = useState(false);

  const carica = useCallback(async (): Promise<void> => {
    const [carriera, stato, squadreArr, giocatoriArr, assegnazioniArr] = await Promise.all([
      db.carriere.get(carrieraId),
      db.statoClub.get(carrieraId),
      db.squadre.where('carrieraId').equals(carrieraId).toArray(),
      db.giocatori.where('carrieraId').equals(carrieraId).toArray(),
      db.squadAssignments.where('carrieraId').equals(carrieraId).toArray(),
    ]);
    if (!carriera || !stato) return;
    setDati({
      carriera,
      stato,
      squadra: squadreArr.find((s) => s.id === carriera.squadraId),
      squadre: new Map(squadreArr.map((s) => [s.id, s])),
      giocatori: giocatoriArr,
      assegnazioni: assegnazioniArr,
    });
  }, [carrieraId]);

  useEffect(() => {
    void carica();
  }, [carica]);

  if (!dati) return <main className="page-shell" />;

  const { carriera, stato, squadre, giocatori, assegnazioni } = dati;
  const squadraId = carriera.squadraId;

  // I miei giocatori: proprietà attiva nella mia squadra
  const mieiIds = new Set(
    assegnazioni
      .filter((a) => a.squadraId === squadraId && a.tipo === 'proprieta' && a.al === undefined)
      .map((a) => a.giocatoreId),
  );
  const miei = giocatori.filter((g) => mieiIds.has(g.id));

  // Intake dell'anno: creati da FLM quest'anno, in rosa con me (o in prestito da me)
  const intake = miei.filter((g) => g.creatoDaFlm && g.stagioneCreazione === carriera.stagione);
  // I miei giovani FLM (tutte le stagioni)
  const giovani = miei.filter((g) => g.creatoDaFlm);
  // In prestito DA me (ora)
  const inPrestito = assegnazioni
    .filter((a) => a.squadraId !== squadraId && a.tipo === 'prestito' && a.al === undefined && mieiIds.has(a.giocatoreId))
    .map((a) => ({ a, g: giocatori.find((x) => x.id === a.giocatoreId) }))
    .filter((x): x is { a: SquadAssignment; g: Giocatore } => x.g !== undefined);
  // Prestiti IN entrata verso di me
  const inEntrata = assegnazioni
    .filter((a) => a.squadraId === squadraId && a.tipo === 'prestito' && a.al === undefined)
    .map((a) => giocatori.find((x) => x.id === a.giocatoreId))
    .filter((g): g is Giocatore => g !== undefined);
  // Ritirati che genereranno rigenerati in questa stagione
  const ritirati = giocatori.filter((g) => g.ritiratoIn === carriera.stagione);

  const riprovaIntake = async (): Promise<void> => {
    setOccupato(true);
    try {
      const esito = await generaIntake(carrieraId);
      if (esito.esito === 'generato') {
        setMsg({ tipo: 'ok', testo: `Intake generato: ${esito.nuovi} nuovi prospetti (${esito.regen} rigenerati).` });
      } else if (esito.esito === 'in_attesa') {
        setMsg({ tipo: 'err', testo: `Intake ancora in attesa: ${esito.motivo}` });
      }
    } catch (e) {
      setMsg({ tipo: 'err', testo: e instanceof Error ? e.message : 'Errore generazione intake' });
    }
    setOccupato(false);
    await carica();
  };

  const mandaInPrestito = async (g: Giocatore): Promise<void> => {
    setOccupato(true);
    const esito = await eseguiPrestitoUtente(carrieraId, g.id);
    if (esito.ok) {
      setMsg({ tipo: 'ok', testo: `${g.nome} va in prestito al ${esito.club}. Rientro automatico a fine stagione.` });
    } else {
      setMsg({ tipo: 'err', testo: esito.errori?.[0] ?? 'Prestito non riuscito' });
    }
    setOccupato(false);
    await carica();
  };

  const esporta = async (): Promise<void> => {
    setOccupato(true);
    try {
      const pacchetto = await esportaPacchettoEditor(carrieraId);
      for (const file of pacchetto.files) {
        scaricaFile(file.nome, file.contenuto, 'text/csv');
      }
      setMsg({
        tipo: 'ok',
        testo:
          `Pacchetto esportato: ${pacchetto.riepilogo.giocatoriTotali} giocatori (${pacchetto.riepilogo.giocatoriNuovi} nuovi, ${pacchetto.riepilogo.giocatoriAggiornati} aggiornati), ${pacchetto.riepilogo.prestitiAttivi} prestiti. ` +
          'RICORDA: backup dell\'EDIT file prima di importare in PES Editor.',
      });
    } catch (e) {
      setMsg({ tipo: 'err', testo: e instanceof Error ? e.message : 'Errore export' });
    }
    setOccupato(false);
  };

  const posizione = (g: Giocatore): string => (g.attributi ? nomePosizionePes(g.attributi.POS) : g.ruolo);

  return (
    <main className="page-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={onBack}>FLM <span>/ Vivaio</span></button>
        <div className="topbar-actions">
          <span className="topbar-note">{carriera.campionato} · {carriera.stagione}</span>
          <nav className="topbar-nav" aria-label="Navigazione vivaio">
            <button className="button button-outline button-small" type="button" onClick={onBack}>Carriera</button>
          </nav>
        </div>
      </header>

      <section className="content-wrap">
        {/* Banner intake in attesa (LLM offline) */}
        {stato.intakeStato === 'in_attesa' && (
          <div className="feedback feedback-err" role="alert">
            <strong>Intake in attesa.</strong> {stato.intakeMotivo ?? 'LLM non raggiungibile: i nomi nascono solo dall\'LLM.'}
            <button
              type="button"
              className="button button-primary button-small"
              disabled={occupato}
              onClick={() => void riprovaIntake()}
            >
              {occupato ? 'Genero…' : 'Riprova'}
            </button>
          </div>
        )}

        <div className="mercato-azioni">
          <p className="eyebrow">Settore giovanile · {carriera.nome}</p>
          <div className="richiesta-azioni">
            <button
              type="button"
              className="button button-primary button-small"
              disabled={occupato}
              onClick={() => void esporta()}
            >
              Esporta per PES Editor (pacchetto completo)
            </button>
          </div>
          {msg && <p className={`feedback ${msg.tipo === 'ok' ? 'feedback-ok' : 'feedback-err'}`}>{msg.testo}</p>}
        </div>

        {/* Intake dell'anno */}
        <h2 className="section-title">Intake {carriera.stagione}</h2>
        {intake.length === 0 ? (
          <p className="empty-copy">
            {stato.intakeStato === 'in_attesa'
              ? 'Nessun prospetto ancora: l\'intake è in attesa dell\'LLM.'
              : 'Nessun prospetto per quest\'anno (l\'intake nasce al rollover di stagione).'}
          </p>
        ) : (
          <div className="giovani-grid">
            {intake.map((g) => (
              <article className="card giovane-card" key={g.id}>
                <h3>{g.nome}</h3>
                <p className="giovane-meta">
                  {g.eta} anni · {posizione(g)} · {g.nazionalita} · ov {g.overall}
                </p>
                {g.rigeneratoDi && <p className="giovane-regen">Rigenerato di {g.rigeneratoDi}</p>}
                {g.miniStoria && <p className="giovane-storia">{g.miniStoria}</p>}
                {g.parereScout && (
                  <p className="giovane-scout"><strong>Parere dello scout:</strong> {g.parereScout}</p>
                )}
              </article>
            ))}
          </div>
        )}

        {/* Ritirati (rigenerati in arrivo) */}
        {ritirati.length > 0 && (
          <>
            <h2 className="section-title">Ritirati a fine stagione ({ritirati.length})</h2>
            <p className="empty-copy">
              {ritirati.slice(0, 12).map((g) => `${g.nome} (${g.eta}a)`).join(', ')}
              {ritirati.length > 12 ? '…' : ''} — da loro nasceranno i rigenerati di quest'anno.
            </p>
          </>
        )}

        {/* I miei giovani (tutte le stagioni) */}
        <h2 className="section-title">I tuoi giovani del vivaio ({giovani.length})</h2>
        {giovani.length === 0 ? (
          <p className="empty-copy">I giocatori creati da FLM (intake e rigenerati) compariranno qui.</p>
        ) : (
          <div className="standings-wrap">
            <table className="standings-table">
              <thead>
                <tr>
                  <th>Giocatore</th>
                  <th>Età</th>
                  <th>Ruolo</th>
                  <th>Overall</th>
                  <th>Minuti stagione</th>
                  <th>Forma</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {giovani.map((g) => {
                  const inPrestitoOra = inPrestito.some((x) => x.g.id === g.id);
                  return (
                    <tr key={g.id}>
                      <td>
                        {g.nome}
                        {g.rigeneratoDi && <small className="mov-eta"> (regen di {g.rigeneratoDi})</small>}
                      </td>
                      <td>{g.eta}</td>
                      <td>{posizione(g)}</td>
                      <td>{g.overall}</td>
                      <td>{g.minutiStagione + (g.minutiPrestitoStagione ?? 0)}</td>
                      <td>{g.forma}</td>
                      <td>
                        {inPrestitoOra ? (
                          <span className="status-pill status-ok">in prestito</span>
                        ) : (
                          <button
                            type="button"
                            className="button button-outline button-small"
                            disabled={occupato}
                            onClick={() => void mandaInPrestito(g)}
                          >
                            Prestito
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* In prestito altrove */}
        {inPrestito.length > 0 && (
          <>
            <h2 className="section-title">In prestito ({inPrestito.length})</h2>
            <p className="empty-copy">
              {inPrestito.map(({ a, g }) => `${g.nome} → ${squadre.get(a.squadraId)?.nome ?? '—'}`).join(' · ')}
              {' '}— rientro automatico a fine stagione.
            </p>
          </>
        )}

        {/* Prestiti in entrata */}
        {inEntrata.length > 0 && (
          <>
            <h2 className="section-title">In prestito da altri club ({inEntrata.length})</h2>
            <p className="empty-copy">{inEntrata.map((g) => `${g.nome} (${posizione(g)}, ov ${g.overall})`).join(' · ')}</p>
          </>
        )}

        <button className="button button-outline" type="button" onClick={onBack}>← Torna alla carriera</button>
      </section>
    </main>
  );
}
