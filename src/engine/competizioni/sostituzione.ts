// FLM — Sostituzione dei club reali assenti con club FL26 giocabili
// (decisione utente: pool = solo squadre nel DB importato, nazione prima, forza poi).
//
// Per ogni club reale del playoff (src/data/playoffReali.ts): cerca un club FL26
// della stessa nazione con rating più vicino; se la nazione non ha club nel DB,
// passa alla nazione più vicina per ranking UEFA con club disponibili.

import type { Squadra } from '../../types/entities';
import { COEFFICIENTI_ASSOCIAZIONE_2026_27 } from '../../data/accessi';
import type { ClubPlayoffReale } from '../../data/playoffReali';

/** Nazioni in ordine di ranking UEFA (per la ricerca del vicino più prossimo). */
const NAZIONI_IN_ORDINE = Object.entries(COEFFICIENTI_ASSOCIAZIONE_2026_27)
  .sort((a, b) => b[1] - a[1])
  .map(([nazione]) => nazione);

/**
 * Club FL26 (non ombra, non nazionale) raggruppati per nazione.
 * `nazioneSquadra` deve già risolvere il nome nazione del club (CSV o dataset).
 */
export interface PoolSostituzione {
  perNazione: Map<string, Squadra[]>;
}

export function creaPoolSostituzione(squadreTemplate: Squadra[]): PoolSostituzione {
  const perNazione = new Map<string, Squadra[]>();
  for (const s of squadreTemplate) {
    if (s.ombra || s.nazionale) continue;
    const lista = perNazione.get(s.nazione) ?? [];
    lista.push(s);
    perNazione.set(s.nazione, lista);
  }
  return { perNazione };
}

/** Rating di riferimento di una squadra (rating o mediaOverall mappata). */
function ratingDi(s: Squadra): number {
  return s.rating ?? 1500 + (s.mediaOverall ?? 60 - 60) * 20;
}

/**
 * Sostituto FL26 per un club reale: stessa nazione → rating più vicino;
 * nazione senza club → nazione più vicina nel ranking UEFA con club → rating
 * più vicino. Ritorna undefined se il pool è vuoto (dovrebbe essere impossibile
 * con un DB importato).
 */
export function sostituisciClub(
  reale: ClubPlayoffReale,
  pool: PoolSostituzione,
): Squadra | undefined {
  const candidatiNazione = pool.perNazione.get(reale.nazione) ?? [];
  const stessaNazione = candidatiNazione.length > 0;
  let candidati = candidatiNazione;

  if (!stessaNazione) {
    const indice = NAZIONI_IN_ORDINE.indexOf(reale.nazione);
    for (let raggio = 1; raggio <= NAZIONI_IN_ORDINE.length; raggio++) {
      const prima = NAZIONI_IN_ORDINE[indice - raggio];
      const dopo = NAZIONI_IN_ORDINE[indice + raggio];
      const daPrima = prima ? (pool.perNazione.get(prima) ?? []) : [];
      const daDopo = dopo ? (pool.perNazione.get(dopo) ?? []) : [];
      if (daPrima.length > 0 || daDopo.length > 0) {
        candidati = daPrima.length >= daDopo.length ? daPrima : daDopo;
        break;
      }
    }
  }

  if (candidati.length === 0) return undefined;
  // Rating più vicino: ma per i club reali minori cerchiamo un livello simile.
  // Il rating del club reale non è noto: si usa la posizione nel ranking UEFA
  // della nazione come proxy del livello. Semplificazione: prendiamo il club
  // FL26 con rating più basso se la nazione reale è fuori dalle top-15 (club
  // minori), altrimenti il più vicino alla media.
  const livelloNazione = NAZIONI_IN_ORDINE.indexOf(reale.nazione);
  const ordinati = [...candidati].sort((a, b) => ratingDi(a) - ratingDi(b));
  if (livelloNazione > 14) {
    // Campioni di leghe minori → sostituto tra i più deboli della nazione vicina
    return ordinati[Math.min(ordinati.length - 1, 0)] ?? ordinati[0];
  }
  const media = ordinati.reduce((s, x) => s + ratingDi(x), 0) / ordinati.length;
  return [...ordinati].sort((a, b) => Math.abs(ratingDi(a) - media) - Math.abs(ratingDi(b) - media))[0];
}

/**
 * Sostituzione dell'intero playoff: mappa i nomi reali ai club FL26.
 * I club FL26 già in elenco con lo stesso nome (es. Celtic, Atalanta) restano
 * se stessi. Ritorna anche i nomi reali per il report sorteggio.
 */
export function sostituisciPlayoff(
  reali: ClubPlayoffReale[],
  pool: PoolSostituzione,
  giaUsati: Set<string>,
): Array<{ reale: ClubPlayoffReale; club: Squadra }> {
  const perNome = new Map<string, Squadra>();
  for (const lista of pool.perNazione.values()) {
    for (const s of lista) {
      const chiave = s.nome.toLowerCase();
      if (!perNome.has(chiave)) perNome.set(chiave, s);
    }
  }

  const esito: Array<{ reale: ClubPlayoffReale; club: Squadra }> = [];
  for (const r of reali) {
    // 1. Match esatto per nome nel pool (il club reale ESISTE in FL26)
    const esatto = perNome.get(r.nome.toLowerCase());
    if (esatto && !giaUsati.has(esatto.id)) {
      giaUsati.add(esatto.id);
      esito.push({ reale: r, club: esatto });
      continue;
    }
    // 2. Sostituzione: stessa nazione, rating più vicino (o nazione vicina)
    let candidato = sostituisciClub(r, pool);
    // Evita doppioni: se già usato, prova il successivo per rating
    if (candidato && giaUsati.has(candidato.id)) {
      const alternativi = (pool.perNazione.get(candidato.nazione) ?? [])
        .filter((s) => !giaUsati.has(s.id))
        .sort((a, b) => ratingDi(a) - ratingDi(b));
      candidato = alternativi[0] ?? candidato;
    }
    if (!candidato) {
      // Pool esaurito: salta (il motore riempirà con le squadre FL26 rimanenti)
      continue;
    }
    giaUsati.add(candidato.id);
    esito.push({ reale: r, club: candidato });
  }
  return esito;
}
