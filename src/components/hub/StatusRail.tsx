// FLM — StatusRail: i tre indicatori PRD (fiducia società, fiducia tifosi,
// obiettivo stagionale) con barre e numeri. Colonna destra della bento.

import type { ReactElement } from 'react';
import { ETICHETTA_FASCIA } from './etichette';
import styles from './StatusRail.module.css';

interface StatusRailProps {
  fiduciaSocieta: number;
  fiduciaTifosi: number;
  obiettivoLabel: string;
  targetLabel: string;
  posizione: number | null;
  nSquadre: number;
  punti: number;
  progresso: number;
  stima: string | null;
}

function Barra({ valore, variante }: { valore: number; variante: 'accent' | 'mint' | 'paper' }): ReactElement {
  return (
    <span className={styles.barra} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={valore}>
      <span className={`${styles.fill} ${styles[variante]}`} style={{ width: `${valore}%` }} />
    </span>
  );
}

export default function StatusRail(props: StatusRailProps): ReactElement {
  const { fiduciaSocieta, fiduciaTifosi, obiettivoLabel, targetLabel, posizione, nSquadre, punti, progresso, stima } = props;
  return (
    <aside className={styles.rail} aria-label="Stato del club">
      <div className={styles.blocco}>
        <div className={styles.testa}>
          <span className={styles.label}>Fiducia società</span>
          <strong className={styles.numero}>{fiduciaSocieta}<em>/100</em></strong>
        </div>
        <Barra valore={fiduciaSocieta} variante="accent" />
        <span className={styles.nota}>{ETICHETTA_FASCIA[fiduciaSocieta < 40 ? 'bassa' : fiduciaSocieta < 70 ? 'media' : 'alta']}</span>
      </div>

      <div className={styles.blocco}>
        <div className={styles.testa}>
          <span className={styles.label}>Fiducia tifosi</span>
          <strong className={styles.numero}>{fiduciaTifosi}<em>/100</em></strong>
        </div>
        <Barra valore={fiduciaTifosi} variante="mint" />
      </div>

      <div className={`${styles.blocco} ${styles.bloccoObiettivo}`}>
        <div className={styles.testa}>
          <span className={styles.label}>Obiettivo · {obiettivoLabel}</span>
          <strong className={styles.numero}>{posizione !== null ? `${posizione}ª` : '—'}<em>/{nSquadre} · {punti} pt</em></strong>
        </div>
        <Barra valore={progresso} variante="paper" />
        <span className={styles.nota}>{targetLabel}{stima ? ` · ${stima}` : ''}</span>
      </div>
    </aside>
  );
}
