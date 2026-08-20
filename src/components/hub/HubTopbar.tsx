// FLM — Topbar carriera slim (D3): brand + menu kebab + logo PNG centrato sul bordo.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { LogoSquadra } from '../../media/componenti';
import type { ColoriSquadra } from '../../media/hooks';
import styles from './HubTopbar.module.css';

interface HubTopbarProps {
  sezione?: string;
  onBrand?: () => void;
  /** @deprecated contesto centrale rimosso — mantenuto per compat */
  contesto?: string;
  onStorico: () => void;
  onEsporta: () => void;
  onHome: () => void;
  squadra?: { nome: string; nazione?: string; colori?: ColoriSquadra };
  children?: ReactElement;
}

export default function HubTopbar({ sezione = 'Carriera', onBrand, onStorico, onEsporta, onHome, squadra, children }: HubTopbarProps): ReactElement {
  const [aperto, setAperto] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aperto) return undefined;
    const chiudi = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setAperto(false);
    };
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setAperto(false);
    };
    document.addEventListener('mousedown', chiudi);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', chiudi);
      document.removeEventListener('keydown', esc);
    };
  }, [aperto]);

  return (
    <header className={styles.topbar}>
      <button className={styles.brand} type="button" onClick={onBrand ?? onHome}>
        FLM <span>/ {sezione}</span>
      </button>
      {children && <div className={styles.actions}>{children}</div>}
      <div className={styles.kebabWrap} ref={wrapRef}>
        <button
          className={styles.kebab}
          type="button"
          aria-label="Azioni carriera"
          aria-expanded={aperto}
          onClick={() => setAperto((a) => !a)}
        >
          ⋯
        </button>
        {aperto && (
          <div className={styles.menu} role="menu">
            <button type="button" role="menuitem" onClick={() => { setAperto(false); onStorico(); }}>Storico carriera</button>
            <button type="button" role="menuitem" onClick={() => { setAperto(false); onEsporta(); }}>Esporta salvataggio</button>
            <button type="button" role="menuitem" onClick={() => { setAperto(false); onHome(); }}>Torna alla home</button>
          </div>
        )}
      </div>
      {squadra && (
        <div className={styles.logoStrip}>
          <button type="button" className={styles.logoButton} onClick={onBrand ?? onHome} aria-label="Torna alla dashboard carriera">
            <LogoSquadra
              nome={squadra.nome}
              nazione={squadra.nazione}
              colori={squadra.colori}
              className={styles.logoClub}
            />
          </button>
        </div>
      )}
    </header>
  );
}
