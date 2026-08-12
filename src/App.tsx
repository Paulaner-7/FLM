import { useState, type ReactElement } from 'react';
import BootstrapImport from './pages/BootstrapImport';
import Carriera from './pages/Carriera';
import Database from './pages/Database';
import Home from './pages/Home';
import NuovaCarriera from './pages/NuovaCarriera';

type View = 'home' | 'bootstrap' | 'database' | 'nuova-carriera' | 'carriera';

export default function App(): ReactElement {
  const [view, setView] = useState<View>('home');
  const [carrieraId, setCarrieraId] = useState<string | null>(null);

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
    return <Carriera carrieraId={carrieraId} onHome={() => setView('home')} />;
  }
  return (
    <Home
      onNuovaCarriera={() => setView('nuova-carriera')}
      onImport={() => setView('bootstrap')}
      onDatabase={() => setView('database')}
      onContinua={(id) => {
        setCarrieraId(id);
        setView('carriera');
      }}
    />
  );
}
