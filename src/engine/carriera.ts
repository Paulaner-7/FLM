// FLM — Regole di creazione carriera (flusso "Nuova Carriera").
// Regola 3 AGENTS.md: funzioni PURE e deterministiche, nessuna scrittura qui.
// La creazione vera (transazione Dexie) vive in src/db/carriere.ts.

import { eNazionalePerNome, legaCurataPerNome, LEGHE_CURATE } from '../data/leagues';
import type { Id, ObiettivoStagionale, Squadra, StatoClub } from '../types/entities';
import {
  BUDGET_BASE_DIVISORE,
  BUDGET_MAX,
  BUDGET_MIN,
  FATTORI_BUDGET_LEGA,
  FATTORE_BUDGET_DEFAULT,
  FIDUCIA_SOCIETA_INIZIALE,
  FIDUCIA_TIFOSI_INIZIALE,
  REPUTAZIONE_ALLENATORE_INIZIALE,
  SETTIMANA_INIZIALE,
  clamp,
} from './rules';

/**
 * Budget di base dalla reputazione squadra e dal campionato.
 * Formula calibrata sui budget reali 2025/26 (vedi src/engine/rules.ts):
 *   budget = round(rep³ / 6000 × 1M) × fattore lega, clamp [1M, 300M].
 * Esempi: City (90, PL) → 194M · Arsenal (80, PL) → 137M · Inter (85, Serie A) → 112M ·
 * Juve (80, Serie A) → 85M · Atletico (75, La Liga) → 77M · Brighton (65, PL) → 73M ·
 * Bournemouth (55, PL) → 44M · top Serie B (50) → 8M.
 */
export function budgetDaReputazione(reputazione: number, campionato?: string): number {
  const base = (Math.pow(reputazione, 3) / BUDGET_BASE_DIVISORE) * 1_000_000;
  const fattore = FATTORI_BUDGET_LEGA.find(({ pattern }) =>
    campionato !== undefined && pattern.test(campionato),
  )?.fattore ?? FATTORE_BUDGET_DEFAULT;
  return Math.round(clamp(base * fattore, BUDGET_MIN, BUDGET_MAX));
}

/**
 * Reputazione della squadra dalla media overall della rosa (bootstrap):
 * più forte la rosa, più alto il budget di partenza. La vecchia reputazione
 * derivata dalla sola forza (5 valori possibili) appiattiva i budget:
 * ora ogni squadra ha la sua media overall → budget differenziati.
 */
export function reputazioneDaMedia(mediaOverall: number): number {
  return Math.round(clamp(mediaOverall * 1.1 - 15, 10, 95));
}

/**
 * Fattore piazzamento (stima dell'anno precedente): la prima squadra della
 * lega parte con il budget più alto, l'ultima con il più basso — ogni squadra
 * in base al piazzamento riceve budget diversi (richiesta utente, PRD 6.1).
 */
export function fattorePiazzamento(posizione: number): number {
  return clamp(1.45 - (posizione - 1) * 0.032, 0.85, 1.45);
}

/**
 * Budget di carriera COMPLETO: reputazione dalla media overall × fattore lega
 * × fattore piazzamento (posizione stimata nella lega per forza rosa).
 */
export function budgetCarriera(squadra: Squadra, campionato: string, posizione: number): number {
  const rep = reputazioneDaMedia(squadra.mediaOverall ?? 65);
  return Math.round(
    clamp(budgetDaReputazione(rep, campionato) * fattorePiazzamento(posizione), BUDGET_MIN, BUDGET_MAX),
  );
}

/**
 * Piazzamento stimato delle squadre di una lega (anno precedente): ordinate
 * per media overall decrescente. Map id squadra → posizione (1 = più forte).
 */
export function posizioniInLega(squadre: Squadra[]): Map<Id, number> {
  const ordinate = [...squadre].sort(
    (a, b) => (b.mediaOverall ?? 0) - (a.mediaOverall ?? 0) || a.nome.localeCompare(b.nome, 'it'),
  );
  return new Map(ordinate.map((s, index) => [s.id, index + 1]));
}

/** StatoClub iniziale di una nuova carriera (id = carrieraId). */
export function statoClubIniziale(
  carrieraId: Id,
  squadra: Squadra,
  campionato: string,
  obiettivo: ObiettivoStagionale,
  posizione: number,
): StatoClub {
  return {
    id: carrieraId,
    fiduciaSocieta: FIDUCIA_SOCIETA_INIZIALE,
    fiduciaTifosi: FIDUCIA_TIFOSI_INIZIALE,
    obiettivo,
    budget: budgetCarriera(squadra, campionato, posizione),
    reputazioneAllenatore: REPUTAZIONE_ALLENATORE_INIZIALE,
    settimanaCorrente: SETTIMANA_INIZIALE,
  };
}

/**
 * Nome del campionato di una squadra, in ordine di autorità:
 * 1. nazionale (flag CSV o nome): categoria "Nazionali" — non giocabile come
 *    campionato, riservata alla futura carriera internazionale (europei/mondiali);
 * 2. campo `campionato` (colonna CSV `League` o valorizzato dal seed);
 * 3. dataset curato (match per nome normalizzato, src/data/leagues.ts);
 * 4. fallback: raggruppamento per nazione (usato solo per squadre fuori da
 *    ogni campionato conosciuto).
 */
export function legaPerSquadra(squadra: Squadra): string {
  if (squadra.nazionale || eNazionalePerNome(squadra.nome)) return 'Nazionali';
  if (squadra.campionato) return squadra.campionato;
  const curata = legaCurataPerNome(squadra.nome);
  if (curata) return curata;
  return `Paese ${squadra.nazione}`;
}

/** Campionati disponibili nel registro (template, non copie di carriera), con le loro squadre. */
export interface CampionatoDisponibile {
  nome: string;
  squadre: Squadra[];
  /**
   * Squadre attese dal roster curato FL26 (src/data/leagues.ts). Se squadre.length
   * è minore, il match è incompleto: la UI mostra un avviso "X/Y squadre in FL26".
   */
  attese: number;
  /** true solo per la lega demo del seed ("Serie FLM", stato senza import CSV) */
  demo: boolean;
}

export interface CampionatiDisponibili {
  /** Campionati giocabili: solo leghe FL26 curate (europee + Brasileirão, Liga Profesional, J1, Saudi) */
  campionati: CampionatoDisponibile[];
  /** Nazionali: non selezionabili come campionato, riservate alla carriera internazionale */
  nazionali: Squadra[];
}

/**
 * Elenca i campionati giocabili — REGOLA: solo i campionati europei (più Brasileirão,
 * Liga Profesional, J1 League e Saudi Pro League) con roster completo in FL26
 * (src/data/leagues.ts). Sono escluse: le leghe con poche squadre in FL26 (Polonia,
 * Svizzera, Austria, ecc.), la Russian Premier League, i campionati extra-europei
 * minori, le squadre ombra e i gruppi fallback per nazione ("Paese PES-XXX").
 *
 * Eccezione esplicita: in stato demo (nessun CSV importato — tutte le squadre senza
 * PES ID) la lega demo del seed resta selezionabile per provare l'app.
 * Le nazionali (flag CSV o nome) finiscono nella categoria separata.
 */
export function campionatiDisponibili(squadreTemplate: Squadra[]): CampionatiDisponibili {
  const club = squadreTemplate.filter((s) => !s.ombra && !s.nazionale && !eNazionalePerNome(s.nome));
  const nazionali = squadreTemplate.filter((s) => !s.ombra && (s.nazionale || eNazionalePerNome(s.nome)));
  const attesePerLega = new Map(LEGHE_CURATE.map((l) => [l.nome, l.squadre.length]));
  // Stato demo: il seed crea squadre senza PES ID; l'import FL26 le assegna sempre.
  const statoDemo = club.length > 0 && club.every((s) => s.pesId === null);

  const perNome = new Map<string, Squadra[]>();
  for (const squadra of club) {
    const curata = legaCurataPerNome(squadra.nome);
    const esplicita = squadra.campionato !== undefined && attesePerLega.has(squadra.campionato);
    // In stato demo il campionato esplicito del seed ha la priorità: le squadre
    // finte non devono essere catturate dal match curato (es. "US Levante" → "Levante").
    const risolto = statoDemo
      ? (squadra.campionato ?? curata)
      : (curata ?? (esplicita ? squadra.campionato : undefined));
    if (!risolto) continue; // fuori dalle leghe giocabili: nascosta dal wizard
    const lista = perNome.get(risolto) ?? [];
    lista.push(squadra);
    perNome.set(risolto, lista);
  }

  return {
    campionati: [...perNome.entries()]
      .filter(([, squadre]) => squadre.length >= 2) // un campionato serve almeno 2 squadre
      .map(([nome, squadre]) => ({
        nome,
        squadre: squadre.sort((a, b) => a.nome.localeCompare(b.nome, 'it')),
        attese: attesePerLega.get(nome) ?? squadre.length,
        demo: !attesePerLega.has(nome),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'it')),
    nazionali: nazionali.sort((a, b) => a.nome.localeCompare(b.nome, 'it')),
  };
}

/** Squadre del registro template appartenenti a un campionato (stessa risoluzione di legaPerSquadra). */
export function squadreDellaLega(squadreTemplate: Squadra[], nomeLega: string): Squadra[] {
  return squadreTemplate.filter(
    (s) => !s.nazionale && !s.ombra && !eNazionalePerNome(s.nome) && legaPerSquadra(s) === nomeLega,
  );
}
