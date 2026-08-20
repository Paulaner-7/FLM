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

type View = 'home' | 'bootstrap' | 'database' | 'nuova-carriera' | 'carriera' | 'fine-stagione' | 'nazionale' | 'storico' | 'rosa' | 'classifica' | 'calendario' | 'competizioni' | 'mercato' | 'mail' | 'vivaio' | 'impostazioni';

export default function App(): ReactElement {
  const [view, setView] = useState<View>('home');
  const [carrieraId, setCarrieraId] = useState<string | null>(null);
  const [risoluzioneData, setRisoluzioneData] = useState<EsitoRisoluzione | null>(null);

  // Backfill vivaio una tantum: attributi 151 colonne + numeri maglia per le
  // carriere create prima del vivaio (idempotente, mai bloccante).
  useEffect(() => {
    void backfillAttributiENumeri();
    void backfillColoriSquadre();
  }, []);

  if (view === 'impostazioni') {
    return <Impostazioni onHome={() => setView('home')} />;
  }
  if (view === 'bootstrap') {
    return <BootstrapImport onCancel={() => setView('home')} onComplete={() => setView('database')} />;
  }
  if (view === 'database') {
    return <Database onHome={() => setView('home')} onImport={() => setView('bootstrap')} />;
  }
  if (view === 'nuova-carriera') {
    return (
      <NuovaCarriera
        onCancel={() => setView('home')}
        onComplete={(carriera) => {
          setCarrieraId(carriera.id);
          setView('home');
        }}
      />
    );
  }
  if (view === 'carriera' && carrieraId) {
    return (
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
      />
    );
  }
  if (view === 'vivaio' && carrieraId) {
    return <Vivaio carrieraId={carrieraId} onBack={() => setView('carriera')} />;
  }
  if (view === 'fine-stagione' && carrieraId && risoluzioneData) {
    return (
      <FineStagione
        carrieraId={carrieraId}
        esito={risoluzioneData}
        onComplete={() => { setRisoluzioneData(null); setView('carriera'); }}
        onHome={() => { setRisoluzioneData(null); setView('home'); }}
      />
    );
  }
  if (view === 'nazionale' && carrieraId) {
    return <Nazionale carrieraId={carrieraId} onBack={() => setView('carriera')} />;
  }
  if (view === 'storico' && carrieraId) {
    return <Storico carrieraId={carrieraId} onBack={() => setView('carriera')} />;
  }
  if (view === 'mercato' && carrieraId) {
    return <Mercato carrieraId={carrieraId} onBack={() => setView('carriera')} onMail={() => setView('mail')} />;
  }
  if (view === 'mail' && carrieraId) {
    return <Mail carrieraId={carrieraId} onBack={() => setView('carriera')} onMercato={() => setView('mercato')} />;
  }
  if (view === 'rosa' && carrieraId) {
    return (
      <Rosa
        carrieraId={carrieraId}
        onBack={() => setView('carriera')}
        onHome={() => setView('home')}
        onStorico={() => setView('storico')}
      />
    );
  }
  if (view === 'classifica' && carrieraId) {
    return <Classifica carrieraId={carrieraId} onBack={() => setView('carriera')} />;
  }
  if (view === 'calendario' && carrieraId) {
    return <Calendario carrieraId={carrieraId} onBack={() => setView('carriera')} />;
  }
  if (view === 'competizioni' && carrieraId) {
    return <Competizioni carrieraId={carrieraId} onBack={() => setView('carriera')} />;
  }
  return (
    <Home
      onNuovaCarriera={() => setView('nuova-carriera')}
      onImport={() => setView('bootstrap')}
      onDatabase={() => setView('database')}
      onImpostazioni={() => setView('impostazioni')}
      onContinua={(id) => {
        setCarrieraId(id);
        setView('carriera');
      }}
    />
  );
}
