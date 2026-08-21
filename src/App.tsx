import { useEffect, useState, type ReactElement } from 'react';
import BootstrapImport from './pages/BootstrapImport';
import Calendario from './pages/Calendario';
import Carriera from './pages/Carriera';
import Classifica from './pages/Classifica';
import Competizioni from './pages/Competizioni';
import Database from './pages/Database';
import FineStagione from './pages/FineStagione';
import Home from './pages/Home';
import Impostazioni from './pages/Impostazioni';
import Mail from './pages/Mail';
import Mercato from './pages/Mercato';
import Nazionale from './pages/Nazionale';
import NuovaCarriera from './pages/NuovaCarriera';
import Rosa from './pages/Rosa';
import Storico from './pages/Storico';
import Vivaio from './pages/Vivaio';
import { backfillAttributiENumeri, backfillColoriSquadre } from './db';
import type { EsitoRisoluzione } from './db';
import { getStato, probe, subscribe } from './llm/connectivity';

type View = 'home' | 'bootstrap' | 'database' | 'nuova-carriera' | 'carriera' | 'fine-stagione' | 'nazionale' | 'storico' | 'rosa' | 'classifica' | 'calendario' | 'competizioni' | 'mercato' | 'mail' | 'vivaio' | 'impostazioni';

function BannerOffline(): ReactElement | null {
  const [online, setOnline] = useState<boolean>(() => getStato().online);
  useEffect(() => {
    const unsub = subscribe(() => setOnline(getStato().online));
    void probe(true);
    return unsub;
  }, []);
  if (online) return null;
  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#dc2626',
        color: 'white',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      <span>Sei offline — FLM è in pausa. Il gioco riprende appena torna la connessione.</span>
      <button
        type="button"
        onClick={() => void probe(true)}
        style={{
          background: 'white',
          color: '#dc2626',
          border: 'none',
          borderRadius: 6,
          padding: '6px 12px',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Riprova ora
      </button>
    </div>
  );
}

export default function App(): ReactElement {
  const [view, setView] = useState<View>('home');
  const [carrieraId, setCarrieraId] = useState<string | null>(null);
  const [risoluzioneData, setRisoluzioneData] = useState<EsitoRisoluzione | null>(null);
  const [online, setOnline] = useState<boolean>(() => getStato().online);

  // Backfill vivaio una tantum: attributi 151 colonne + numeri maglia per le
  // carriere create prima del vivaio (idempotente, mai bloccante).
  useEffect(() => {
    void backfillAttributiENumeri();
    void backfillColoriSquadre();
  }, []);
  useEffect(() => {
    const unsub = subscribe(() => setOnline(getStato().online));
    return unsub;
  }, []);

  const shell = (contenuto: ReactElement): ReactElement => (
    <>
      <BannerOffline />
      <div style={{ paddingTop: online ? 0 : 42 }}>{contenuto}</div>
    </>
  );

  if (view === 'impostazioni') {
    return shell(<Impostazioni onHome={() => setView('home')} />);
  }
  if (view === 'bootstrap') {
    return shell(<BootstrapImport onCancel={() => setView('home')} onComplete={() => setView('database')} />);
  }
  if (view === 'database') {
    return shell(<Database onHome={() => setView('home')} onImport={() => setView('bootstrap')} />);
  }
  if (view === 'nuova-carriera') {
    return shell(
      <NuovaCarriera
        onCancel={() => setView('home')}
        onComplete={(carriera) => {
          setCarrieraId(carriera.id);
          setView('home');
        }}
      />,
    );
  }
  if (view === 'carriera' && carrieraId) {
    return shell(
      <Carriera
        carrieraId={carrieraId}
        onHome={() => setView('home')}
        onRosa={() => setView('rosa')}
        onClassifica={() => setView('classifica')}
        onCalendario={() => setView('calendario')}
        onCompetizioni={() => setView('competizioni')}
        onMercato={() => setView('mercato')}
        onMail={() => setView('mail')}
        onVivaio={() => setView('vivaio')}
        onNazionale={() => setView('nazionale')}
        onFineStagione={(esito) => { setRisoluzioneData(esito); setView('fine-stagione'); }}
        onStorico={() => setView('storico')}
      />,
    );
  }
  if (view === 'vivaio' && carrieraId) {
    return shell(<Vivaio carrieraId={carrieraId} onBack={() => setView('carriera')} />);
  }
  if (view === 'fine-stagione' && carrieraId && risoluzioneData) {
    return shell(
      <FineStagione
        carrieraId={carrieraId}
        esito={risoluzioneData}
        onComplete={() => { setRisoluzioneData(null); setView('carriera'); }}
        onHome={() => { setRisoluzioneData(null); setView('home'); }}
      />,
    );
  }
  if (view === 'nazionale' && carrieraId) {
    return shell(<Nazionale carrieraId={carrieraId} onBack={() => setView('carriera')} />);
  }
  if (view === 'storico' && carrieraId) {
    return shell(<Storico carrieraId={carrieraId} onBack={() => setView('carriera')} />);
  }
  if (view === 'mercato' && carrieraId) {
    return shell(<Mercato carrieraId={carrieraId} onBack={() => setView('carriera')} onMail={() => setView('mail')} />);
  }
  if (view === 'mail' && carrieraId) {
    return shell(<Mail carrieraId={carrieraId} onBack={() => setView('carriera')} onMercato={() => setView('mercato')} />);
  }
  if (view === 'rosa' && carrieraId) {
    return shell(
      <Rosa
        carrieraId={carrieraId}
        onBack={() => setView('carriera')}
        onHome={() => setView('home')}
        onStorico={() => setView('storico')}
      />,
    );
  }
  if (view === 'classifica' && carrieraId) {
    return shell(<Classifica carrieraId={carrieraId} onBack={() => setView('carriera')} />);
  }
  if (view === 'calendario' && carrieraId) {
    return shell(<Calendario carrieraId={carrieraId} onBack={() => setView('carriera')} />);
  }
  if (view === 'competizioni' && carrieraId) {
    return shell(<Competizioni carrieraId={carrieraId} onBack={() => setView('carriera')} />);
  }
  return shell(
    <Home
      onNuovaCarriera={() => setView('nuova-carriera')}
      onImport={() => setView('bootstrap')}
      onDatabase={() => setView('database')}
      onImpostazioni={() => setView('impostazioni')}
      onContinua={(id) => {
        setCarrieraId(id);
        setView('carriera');
      }}
    />,
  );
}
