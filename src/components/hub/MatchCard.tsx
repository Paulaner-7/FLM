// FLM — MatchCard: tile dominante della bento (D4/D14), firma broadcast.
// Tre stati: partita in programma (scoreboard VS) / finestra mercato (countdown
// dominante, calendario in pausa) / stagione conclusa (riepilogo + CTA).

import type { ReactElement } from 'react';
import { LogoSquadra } from '../../media/componenti';
import type { Partita, Squadra } from '../../types/entities';
import styles from './MatchCard.module.css';

interface MatchCardProps {
  squadra: Squadra;
  prossima: Partita | null;
  avversaria: Squadra | null;
  competizioneNome: string;
  matchday: number;
  giornoMercato: number;
  onReferto: () => void;
  onMercato: () => void;
  onConcludiStagione: () => void;
}

export default function MatchCard({
  squadra,
  prossima,
  avversaria,
  competizioneNome,
  matchday,
  giornoMercato,
  onReferto,
  onMercato,
  onConcludiStagione,
}: MatchCardProps): ReactElement {
  // D14.2 — finestra mercato: la card dominante diventa il mercato.
  if (giornoMercato > 0) {
    return (
      <section className={`${styles.card} ${styles.cardMercato}`} aria-label="Finestra di mercato">
        <p className={styles.eyebrow}>Calciomercato · finestra aperta</p>
        <div className={styles.mercatoCountdown}>
          <strong>{giornoMercato}</strong>
          <span>/ 30 giorni</span>
        </div>
        <p className={styles.mercatoNote}>Il calendario è in pausa: le partite riprendono a finestra chiusa.</p>
        <div className={styles.azioni}>
          <button className={styles.cta} type="button" onClick={onMercato}>
            Apri il mercato <span>→</span>
          </button>
        </div>
      </section>
    );
  }

  // D14.3 — stagione conclusa: riepilogo + CTA finale.
  if (!prossima || !avversaria) {
    return (
      <section className={`${styles.card} ${styles.cardFine}`} aria-label="Stagione conclusa">
        <p className={styles.eyebrow}>Stagione conclusa</p>
        <h2 className={styles.fineTitolo}>
          Tutti i match giocati.
          <br />
          <em>Ora i verdetti.</em>
        </h2>
        <p className={styles.mercatoNote}>Registra i vincitori, chiudi il bilancio e prepara la prossima stagione.</p>
        <div className={styles.azioni}>
          <button className={styles.cta} type="button" onClick={onConcludiStagione}>
            Concludi stagione <span>→</span>
          </button>
        </div>
      </section>
    );
  }

  const inCasa = prossima.casa === squadra.id;
  const casa = inCasa ? squadra : avversaria;
  const ospite = inCasa ? avversaria : squadra;

  return (
    <section className={styles.card} aria-label="Prossima partita">
      <p className={styles.eyebrow}>
        {competizioneNome} · Giornata {matchday} · {prossima.slot === 'weekend' ? 'Weekend' : 'Infrasettimanale'}
      </p>

      <div className={styles.scoreboard}>
        <div className={styles.squadra}>
          <LogoSquadra nome={casa.nome} nazione={casa.nazione} colori={casa.colori} className={styles.logo} />
          <strong className={styles.nome}>{casa.nome}</strong>
          <span className={styles.sede}>Casa</span>
        </div>
        <span className={styles.vs}>VS</span>
        <div className={styles.squadra}>
          <LogoSquadra nome={ospite.nome} nazione={ospite.nazione} colori={ospite.colori} className={styles.logo} />
          <strong className={styles.nome}>{ospite.nome}</strong>
          <span className={styles.sede}>Trasferta</span>
        </div>
      </div>

      <div className={styles.meta}>
        <span className={`${styles.pill} ${styles.pillSede}`}>{inCasa ? 'Giochi in casa' : 'Giochi in trasferta'}</span>
        <span className={styles.pill}>Rating avversario {avversaria.rating}</span>
      </div>

      <div className={styles.azioni}>
        <button className={styles.cta} type="button" onClick={onReferto}>
          Inserisci referto <span>→</span>
        </button>
      </div>
    </section>
  );
}
