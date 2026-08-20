// FLM — AlertStrip: strisce di allerta sopra la griglia (crisi spogliatoio,
// panchina a rischio). Compaiono solo quando servono, mai spazio sprecato.

import type { ReactElement } from 'react';
import styles from './AlertStrip.module.css';

export interface Alerta {
  id: string;
  titolo: string;
  testo: string;
  azione?: { etichetta: string; onClick: () => void };
}

export default function AlertStrip({ alerts }: { alerts: Alerta[] }): ReactElement | null {
  if (alerts.length === 0) return null;
  return (
    <div className={styles.strip} role="alert">
      {alerts.map((a) => (
        <div className={styles.alert} key={a.id}>
          <span className={styles.dot} aria-hidden="true" />
          <p className={styles.testo}>
            <strong>{a.titolo}</strong> {a.testo}
          </p>
          {a.azione && (
            <button type="button" className={styles.bottone} onClick={a.azione.onClick}>
              {a.azione.etichetta}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
