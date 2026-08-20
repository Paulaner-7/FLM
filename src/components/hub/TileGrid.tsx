// FLM — TileGrid: le 7 sezioni della carriera come tile vivi (D3/D10).
// Ogni tile = porta alla sezione + snapshot del dato chiave (FM26 Tile→Card).

import type { ReactElement, ReactNode } from 'react';
import styles from './TileGrid.module.css';

export interface TileDef {
  id: string;
  etichetta: string;
  /** Snapshot principale: numero/valore grande */
  valore: ReactNode;
  /** Contesto sotto il valore */
  nota: string;
  /** Badge numerico (es. mail non lette): attira l'occhio */
  badge?: number;
  /** Evidenza accento (es. mercato aperto) */
  acceso?: boolean;
  onApri: () => void;
}

export default function TileGrid({ tiles }: { tiles: TileDef[] }): ReactElement {
  return (
    <section className={styles.grid} aria-label="Sezioni della carriera">
      {tiles.map((tile) => (
        <button
          key={tile.id}
          type="button"
          data-hub-tile
          className={`${styles.tile} ${tile.acceso ? styles.acceso : ''}`}
          onClick={tile.onApri}
        >
          <span className={styles.testa}>
            <span className={styles.etichetta}>{tile.etichetta}</span>
            {tile.badge !== undefined && tile.badge > 0 && <span className={styles.badge}>{tile.badge}</span>}
          </span>
          <span className={styles.valore}>{tile.valore}</span>
          <span className={styles.nota}>{tile.nota}</span>
          <span className={styles.freccia} aria-hidden="true">→</span>
        </button>
      ))}
    </section>
  );
}
