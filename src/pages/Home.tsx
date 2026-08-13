// FLM — Home: hub dei salvataggi ("una carriera = un salvataggio").
// UI placeholder: struttura pronta a future modifiche grafiche.

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { eliminaCarriera, importaBootstrapDaDocs, listaCarriere, squadreTemplate, descrizioneProgresso, type AutoImportProgress, type CarrieraConDettagli } from '../db';

interface HomeProps {
  onNuovaCarriera: () => void;
  onImport: () => void;
  onDatabase: () => void;
  onContinua: (carrieraId: string) => void;
}

const ETICHETTA_OBIETTIVO: Record<string, string> = {
  salvezza: 'Salvezza',
  meta_classifica: 'Metà classifica',
  coppe: 'Coppe',
  titolo: 'Titolo',
};

type AutoImportStato = 'idle' | 'attivo' | 'fatto' | 'errore';

export default function Home({ onNuovaCarriera, onImport, onDatabase, onContinua }: HomeProps): ReactElement {
  const [carriere, setCarriere] = useState<CarrieraConDettagli[] | null>(null);
  const [databasePronto, setDatabasePronto] = useState(false);
  const [daEliminare, setDaEliminare] = useState<string | null>(null);
  const [autoImportStato, setAutoImportStato] = useState<AutoImportStato>('idle');
  const [autoImportTesto, setAutoImportTesto] = useState('');
  const [autoImportErrore, setAutoImportErrore] = useState<string | null>(null);
  const autoImportAvviato = useRef(false);

  const avviaAutoImport = useCallback((): void => {
    autoImportAvviato.current = true;
    setAutoImportStato('attivo');
    setAutoImportErrore(null);
    void importaBootstrapDaDocs({
      onProgress: (progresso: AutoImportProgress) => setAutoImportTesto(descrizioneProgresso(progresso)),
    })
      .then(() => {
        setAutoImportStato('fatto');
        setDatabasePronto(true);
      })
      .catch((error: unknown) => {
        setAutoImportStato('errore');
        setAutoImportErrore(error instanceof Error ? error.message : 'Importazione automatica fallita');
      });
  }, []);

  const ricarica = useCallback((): void => {
    void listaCarriere().then(setCarriere);
    void squadreTemplate().then((s) => {
      const pronto = s.length > 0;
      setDatabasePronto(pronto);
      if (!pronto && !autoImportAvviato.current) avviaAutoImport();
    });
  }, [avviaAutoImport]);

  useEffect(ricarica, [ricarica]);

  const confermaEliminazione = async (): Promise<void> => {
    if (!daEliminare) return;
    await eliminaCarriera(daEliminare);
    setDaEliminare(null);
    ricarica();
  };

  if (!carriere) {
    return <main className="page-shell loading-page"><p>Caricamento salvataggi…</p></main>;
  }

  return (
    <main className="page-shell home-page">
      <header className="topbar">
        <button className="brand-button" type="button">FLM <span>/ Portal</span></button>
        <div className="topbar-actions">
          <span className="topbar-note">Football Life Manager · locale-first</span>
          <button className="button button-small" type="button" onClick={onImport}>Importa database</button>
          <button className="button button-small button-outline" type="button" onClick={onDatabase}>Database</button>
        </div>
      </header>

      <section className="content-wrap home-content">
        <div className="home-kicker"><span className="signal-dot" /> Le tue carriere, i tuoi salvataggi</div>
        <h1>Il gioco si gioca.<br /><em>La carriera si costruisce.</em></h1>
        <p className="home-lead">Ogni carriera è un salvataggio indipendente: mondo, calendario e stato separati. Parti dalla fotografia reale del tuo FL26.</p>

        <div className="home-actions">
          <button className="button button-primary button-large" type="button" onClick={onNuovaCarriera} disabled={!databasePronto} title={databasePronto ? undefined : 'Importa prima il database FL26'}>Nuova carriera <span>→</span></button>
        </div>
        {!databasePronto && autoImportStato === 'idle' && <p className="feedback">Nessun database importato: vai su “Importa database” per caricare la fotografia FL26, poi crea la prima carriera.</p>}
        {!databasePronto && autoImportStato === 'attivo' && (
          <div className="import-status" aria-live="polite">
            <strong>Bootstrap automatico dal tuo FL26 in corso…</strong>
            <span>{autoImportTesto || 'Preparazione…'}</span>
            <span className="import-status-bar"><span /></span>
          </div>
        )}
        {autoImportStato === 'fatto' && <p className="feedback feedback-ok">Database FL26 importato automaticamente dai CSV in docs/. Ora puoi creare la prima carriera.</p>}
        {autoImportStato === 'errore' && (
          <div className="import-status import-status-error" role="alert">
            <strong>Bootstrap automatico non riuscito.</strong>
            <span>{autoImportErrore}</span>
            <div className="import-status-actions">
              <button className="button button-small" type="button" onClick={avviaAutoImport}>Riprova</button>
              <button className="button button-small button-outline" type="button" onClick={onImport}>Importa manualmente</button>
            </div>
          </div>
        )}

        <div className="save-section">
          <p className="eyebrow">Salvataggi ({carriere.length})</p>
          {carriere.length === 0 && (
            <div className="empty-roster">
              <strong>Nessuna carriera ancora.</strong>
              <span>Crea il primo salvataggio: scegli squadra e obiettivo, il motore genera calendario e stato.</span>
            </div>
          )}
          <div className="save-list">
            {carriere.map(({ carriera, squadra, settimanaCorrente }) => (
              <article key={carriera.id} className="save-card">
                <div className="save-card-main">
                  <p className="eyebrow">{carriera.campionato} · {carriera.stagione}</p>
                  <h2>{squadra?.nome ?? carriera.nome}</h2>
                  <p className="save-meta">
                    <span>Obiettivo: <strong>{ETICHETTA_OBIETTIVO[carriera.obiettivo] ?? carriera.obiettivo}</strong></span>
                    <span>Settimana <strong>{settimanaCorrente}</strong></span>
                  </p>
                </div>
                <div className="save-actions">
                  <button className="button button-primary" type="button" onClick={() => onContinua(carriera.id)}>Continua</button>
                  <button className="button button-quiet" type="button" onClick={() => setDaEliminare(carriera.id)}>Elimina</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {daEliminare && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Elimina salvataggio">
          <div className="modal-card">
            <p className="eyebrow">Elimina salvataggio</p>
            <h2>Perdere la panchina?</h2>
            <p>La carriera e tutto il suo stato (calendario, rosa clonata, eventi, mercato) verranno eliminati. Il database importato resta intatto.</p>
            <div className="modal-actions">
              <button className="button button-quiet" type="button" onClick={() => setDaEliminare(null)}>Annulla</button>
              <button className="button button-danger" type="button" onClick={() => void confermaEliminazione()}>Elimina per sempre</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
