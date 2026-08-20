// FLM — DecisionDeck: "cosa devi decidere" (Portal FM26, PRD 4).
// Card decisione: richieste promessa + eventi narrativi con opzioni.

import type { ReactElement } from 'react';
import { promesseAttive } from '../../db';
import { PROMESSE_MAX_ATTIVE } from '../../engine/rules';
import type { Evento, Giocatore } from '../../types/entities';
import styles from './DecisionDeck.module.css';

const ETICHETTA_CATEGORIA: Record<Evento['categoria'], string> = {
  giocatore: 'Giocatore',
  societa: 'Società',
  tifosi_media: 'Tifosi & media',
};

interface DecisionDeckProps {
  eventi: Evento[];
  giocatori: Giocatore[];
  onPromessa: (evento: Evento, scelta: 0 | 1) => void;
  onNarrativo: (evento: Evento, scelta: number) => void;
}

export default function DecisionDeck({ eventi, giocatori, onPromessa, onNarrativo }: DecisionDeckProps): ReactElement | null {
  if (eventi.length === 0) return null;

  return (
    <section className={styles.deck} aria-label="Decisioni da prendere">
      <p className={styles.titolo}>
        Da decidere <span className={styles.badge}>{eventi.length}</span>
      </p>
      <div className={styles.lista}>
        {eventi.map((evento) => {
          if (evento.promessaProposta !== undefined) {
            const giocatore = giocatori.find((g) => g.id === evento.promessaProposta?.giocatoreId);
            const pieno = giocatore !== undefined && promesseAttive(giocatore) >= PROMESSE_MAX_ATTIVE;
            return (
              <article className={styles.card} key={evento.id}>
                <span className={styles.pill}>Richiesta giocatore</span>
                <strong className={styles.cardTitolo}>{evento.titolo}</strong>
                <p className={styles.testo}>{evento.testo}</p>
                {pieno && <small className={styles.limite}>Massimo {PROMESSE_MAX_ATTIVE} promesse attive: rifiuta o attendi la scadenza.</small>}
                <div className={styles.azioni}>
                  <button type="button" className={styles.primaria} disabled={pieno} onClick={() => onPromessa(evento, 0)}>
                    Prometti
                  </button>
                  <button type="button" className={styles.secondaria} onClick={() => onPromessa(evento, 1)}>
                    Rifiuta
                  </button>
                </div>
              </article>
            );
          }
          return (
            <article className={styles.card} key={evento.id}>
              <span className={styles.pill}>{ETICHETTA_CATEGORIA[evento.categoria]}</span>
              <strong className={styles.cardTitolo}>{evento.titolo}</strong>
              <p className={styles.testo}>{evento.testo}</p>
              {evento.giocatoriCoinvolti.length > 0 && (
                <small className={styles.coinvolti}>Coinvolti: {evento.giocatoriCoinvolti.join(', ')}</small>
              )}
              <div className={styles.azioni}>
                {evento.opzioni.map((opzione, indice) => (
                  <button
                    key={indice}
                    type="button"
                    className={indice === 0 ? styles.primaria : styles.secondaria}
                    onClick={() => onNarrativo(evento, indice)}
                  >
                    {opzione.testo}
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
