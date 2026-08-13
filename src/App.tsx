import { useState, type ReactElement } from 'react';
import BootstrapImport from './pages/BootstrapImport';
import Calendario from './pages/Calendario';
import Carriera from './pages/Carriera';
import Classifica from './pages/Classifica';
import Database from './pages/Database';
import Home from './pages/Home';
import Impostazioni from './pages/Impostazioni';
import NuovaCarriera from './pages/NuovaCarriera';
import Rosa from './pages/Rosa';

type View = 'home' | 'bootstrap' | 'database' | 'nuova-carriera' | 'carriera' | 'rosa' | 'classifica' | 'calendario' | 'impostazioni';

export default function App(): ReactElement {
  const [view, setView] = useState<View>('home');
  const [carrieraId, setCarrieraId] = useState<string | null>(null);

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
      />
    );
  }
  if (view === 'rosa' && carrieraId) {
    return <Rosa carrieraId={carrieraId} onBack={() => setView('carriera')} />;
  }
  if (view === 'classifica' && carrieraId) {
    return <Classifica carrieraId={carrieraId} onBack={() => setView('carriera')} />;
  }
  if (view === 'calendario' && carrieraId) {
    return <Calendario carrieraId={carrieraId} onBack={() => setView('carriera')} />;
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
