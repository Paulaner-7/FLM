// FLM — Ancore del calendario reale per stagione (PRD 7.1, regola 6).
//
// FONTI (verifica web, agosto 2026 — docs/verifica-web.md):
// - Date UEFA 2026/27 ESATTE: en.wikipedia.org/wiki/2026–27_UEFA_Champions_League,
//   .../2026–27_UEFA_Europa_League, .../2026–27_UEFA_Conference_League (sezioni Schedule).
// - Date campionati nazionali 2026/27: decisione utente per la Serie A — la
//   stagione inizia il TERZO weekend di agosto e finisce all'ULTIMO weekend di
//   maggio (2026/27: sab 15 ago 2026 → dom 30 mag 2027); 42 weekend di fila meno
//   le 4 pause FIFA = 38 giornate esatte. Bundesliga apertura 22 ago; Premier
//   chiusura ~24 mag. Le date ufficiali 2026/27 saranno sostituite quando
//   pubblicate. Le pause seguono il calendario internazionale FIFA (finestre
//   settembre/ottobre/novembre/marzo).
// - Turni coppa nazionale: pattern reale Coppa Italia 2025/26 (fonte:
//   en.wikipedia.org/wiki/2025–26_Coppa_Italia), traslato al 2026/27.
//
// Il motore usa queste ancore per assegnare le partite alle settimane; le date
// esatte di singole partite (sab/dom, mar/mer/gio) vengono derivate.

/** Una competizione UEFA: date dei matchday e del tabellone (ISO yyyy-mm-dd). */
export interface DateUefa {
  /** Sorteggio league phase */
  sorteggioLeaguePhase: string;
  /** Date league phase (UCL/UEL: 8; UECL: 6) */
  matchdays: string[];
  /** Sorteggio playoff eliminazione */
  sorteggioPlayoff: string;
  /** Playoff eliminazione: andata / ritorno */
  playoffAndata: string;
  playoffRitorno: string;
  /** Sorteggio ottavi */
  sorteggioOttavi: string;
  ottaviAndata: string;
  ottaviRitorno: string;
  quartiAndata: string;
  quartiRitorno: string;
  semifinaliAndata: string;
  semifinaliRitorno: string;
  finale: string;
}

/** Playoff di qualificazione (ultimo turno, unico nel motore semplificato — decisione utente). */
export interface PlayoffQualificazione {
  sorteggio: string;
  andata: string;
  ritorno: string;
}

/** Finestra di un campionato nazionale. */
export interface FinestraCampionato {
  /** Big-5 con date esatte (pattern reale); le altre leghe UEFA usano il template. */
  inizio: string;
  fine: string;
}

/** Turni della coppa nazionale di una nazione (pattern Coppa Italia reale). */
export interface TurniCoppaNazionale {
  /** Turni preliminari (infrasettimanali/settembrini, riducono i non-teste-di-serie a 8) */
  preliminari: string[];
  ottavi: string;
  quarti: string;
  semifinali: string;
  finale: string;
}

export interface AncoraStagione {
  stagione: string;
  /** Apertura ufficiale (1 luglio) — la settimana 1 parte da qui */
  inizio: string;
  /** Chiusura (dopo l'ultima finale europea) */
  fine: string;
  /** Pause per nazionali: weekend SENZA campionato */
  pauseFifa: string[];
  campionatiBig5: Record<string, FinestraCampionato>;
  uefa: {
    supercoppaUefa: string;
    ucl: { playoff: PlayoffQualificazione; fase: DateUefa };
    uel: { playoff: PlayoffQualificazione; fase: DateUefa };
    uecl: { playoff: PlayoffQualificazione; fase: DateUefa };
  };
  /**
   * Coppe nazionali: per nazione, i turni. Le nazioni non elencate usano il
   * template (stesse date del pattern). Supercoppe nazionali: metà agosto.
   */
  coppeNazionali: Record<string, TurniCoppaNazionale>;
  supercoppeNazionali: string;
}

/** Template turni coppa nazionale (pattern Coppa Italia 2025/26 traslato). */
const COPPA_TEMPLATE: TurniCoppaNazionale = {
  // 44 club → preliminare (8), primo (32), secondo (16), ottavi (8 teste di serie + 8)
  preliminari: ['2026-08-12', '2026-08-19', '2026-09-23'],
  ottavi: '2026-12-02',
  quarti: '2027-02-10',
  semifinali: '2027-04-21',
  finale: '2027-05-12',
};

/** Finestre campionati big-5 2026/27 (Serie A: decisione utente — 3° weekend di
 * agosto → ultimo weekend di maggio; le altre: pattern reale 2025/26 — fonte
 * verifica-web.md §14). */
const FINESTRE_BIG5: Record<string, FinestraCampionato> = {
  'Serie A': { inizio: '2026-08-15', fine: '2027-05-30' },
  'Premier League': { inizio: '2026-08-15', fine: '2027-05-23' },
  'La Liga': { inizio: '2026-08-15', fine: '2027-05-23' },
  Bundesliga: { inizio: '2026-08-21', fine: '2027-05-22' },
  'Ligue 1': { inizio: '2026-08-15', fine: '2027-05-22' },
};

/** Pause FIFA 2026/27 (pattern reale: settembre, ottobre, novembre, marzo).
 * Date = inizio finestra internazionale (lunedì); il motore salta il sabato
 * interno a ciascuna finestra (es. 31 ago → si salta sab 5 set). */
const PAUSE_FIFA: string[] = [
  '2026-08-31',
  '2026-10-05',
  '2026-11-09',
  '2027-03-22',
];

// ---------------------------------------------------------------------------
// Date UEFA 2026/27 — ESATTE (fonte: Wikipedia, sezioni Schedule, agosto 2026)
// ---------------------------------------------------------------------------

const UCL: { playoff: PlayoffQualificazione; fase: DateUefa } = {
  playoff: { sorteggio: '2026-08-03', andata: '2026-08-18', ritorno: '2026-08-25' },
  fase: {
    sorteggioLeaguePhase: '2026-08-27',
    matchdays: [
      '2026-09-08', '2026-10-13', '2026-10-20', '2026-11-03',
      '2026-11-24', '2026-12-08', '2027-01-19', '2027-01-27',
    ],
    sorteggioPlayoff: '2027-01-29',
    playoffAndata: '2027-02-16',
    playoffRitorno: '2027-02-23',
    sorteggioOttavi: '2027-02-26',
    ottaviAndata: '2027-03-09',
    ottaviRitorno: '2027-03-16',
    quartiAndata: '2027-04-06',
    quartiRitorno: '2027-04-13',
    semifinaliAndata: '2027-04-27',
    semifinaliRitorno: '2027-05-04',
    finale: '2027-06-05', // Metropolitano, Madrid
  },
};

const UEL: { playoff: PlayoffQualificazione; fase: DateUefa } = {
  playoff: { sorteggio: '2026-08-03', andata: '2026-08-20', ritorno: '2026-08-27' },
  fase: {
    sorteggioLeaguePhase: '2026-08-28',
    matchdays: [
      '2026-09-16', '2026-10-15', '2026-10-22', '2026-11-05',
      '2026-11-26', '2026-12-10', '2027-01-21', '2027-01-28',
    ],
    sorteggioPlayoff: '2027-01-29',
    playoffAndata: '2027-02-18',
    playoffRitorno: '2027-02-25',
    sorteggioOttavi: '2027-02-26',
    ottaviAndata: '2027-03-11',
    ottaviRitorno: '2027-03-18',
    quartiAndata: '2027-04-08',
    quartiRitorno: '2027-04-15',
    semifinaliAndata: '2027-04-29',
    semifinaliRitorno: '2027-05-06',
    finale: '2027-05-26', // Waldstadion, Francoforte
  },
};

const UECL: { playoff: PlayoffQualificazione; fase: DateUefa } = {
  playoff: { sorteggio: '2026-08-03', andata: '2026-08-20', ritorno: '2026-08-27' },
  fase: {
    sorteggioLeaguePhase: '2026-08-28',
    matchdays: [
      '2026-10-15', '2026-10-22', '2026-11-05', '2026-11-26', '2026-12-10', '2026-12-17',
    ],
    sorteggioPlayoff: '2027-01-15',
    playoffAndata: '2027-02-18',
    playoffRitorno: '2027-02-25',
    sorteggioOttavi: '2027-02-26',
    ottaviAndata: '2027-03-11',
    ottaviRitorno: '2027-03-18',
    quartiAndata: '2027-04-08',
    quartiRitorno: '2027-04-15',
    semifinaliAndata: '2027-04-29',
    semifinaliRitorno: '2027-05-06',
    finale: '2027-06-02', // Beşiktaş Stadium, Istanbul
  },
};

/** Supercoppa UEFA 2026: PSG (UCL) vs Aston Villa (UEL) — data reale 12 agosto 2026 (Red Bull Arena). */
const SUPERCOPPA_UEFA = '2026-08-12';

/** Supercoppe nazionali 2026: metà agosto (pattern reale). */
const SUPERCOPPE_NAZIONALI = '2026-08-12';

/** Stagione 2026/27 — dati reali verificati (fonte: docs/verifica-web.md). */
export const STAGIONE_2026_27: AncoraStagione = {
  stagione: '2026/27',
  inizio: '2026-07-01',
  fine: '2027-06-05',
  pauseFifa: PAUSE_FIFA,
  campionatiBig5: FINESTRE_BIG5,
  uefa: {
    supercoppaUefa: SUPERCOPPA_UEFA,
    ucl: UCL,
    uel: UEL,
    uecl: UECL,
  },
  coppeNazionali: {
    // Big-5 con pattern esatto; le altre nazioni riusano COPPA_TEMPLATE.
    it: COPPA_TEMPLATE,
    eng: COPPA_TEMPLATE,
    esp: COPPA_TEMPLATE,
    ger: COPPA_TEMPLATE,
    fra: COPPA_TEMPLATE,
  },
  supercoppeNazionali: SUPERCOPPE_NAZIONALI,
};

/**
 * Ancora per una stagione generica FUTURA (dalla 2027/28 in poi): stesso schema
 * della 2026/27 traslato sul calendario dell'anno successivo (shift +52 settimane
 * con allineamento weekday). Da sostituire con date reali quando pubblicate.
 */
export function ancoreStagioneSuccessiva(precedente: AncoraStagione): AncoraStagione {
  const stagione = precedente.stagione === '2026/27' ? '2027/28' : precedente.stagione;
  const shift = (data: string): string => {
    const d = new Date(`${data}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 364); // 52 settimane esatte: stesso giorno della settimana
    return d.toISOString().slice(0, 10);
  };
  const shiftDateUefa = (d: DateUefa): DateUefa => ({
    sorteggioLeaguePhase: shift(d.sorteggioLeaguePhase),
    matchdays: d.matchdays.map(shift),
    sorteggioPlayoff: shift(d.sorteggioPlayoff),
    playoffAndata: shift(d.playoffAndata),
    playoffRitorno: shift(d.playoffRitorno),
    sorteggioOttavi: shift(d.sorteggioOttavi),
    ottaviAndata: shift(d.ottaviAndata),
    ottaviRitorno: shift(d.ottaviRitorno),
    quartiAndata: shift(d.quartiAndata),
    quartiRitorno: shift(d.quartiRitorno),
    semifinaliAndata: shift(d.semifinaliAndata),
    semifinaliRitorno: shift(d.semifinaliRitorno),
    finale: shift(d.finale),
  });
  const shiftPlayoff = (p: PlayoffQualificazione): PlayoffQualificazione => ({
    sorteggio: shift(p.sorteggio),
    andata: shift(p.andata),
    ritorno: shift(p.ritorno),
  });
  return {
    stagione,
    inizio: shift(precedente.inizio),
    fine: shift(precedente.fine),
    pauseFifa: precedente.pauseFifa.map(shift),
    campionatiBig5: Object.fromEntries(
      Object.entries(precedente.campionatiBig5).map(([n, f]) => [
        n,
        { inizio: shift(f.inizio), fine: shift(f.fine) },
      ]),
    ),
    uefa: {
      supercoppaUefa: shift(precedente.uefa.supercoppaUefa),
      ucl: { playoff: shiftPlayoff(precedente.uefa.ucl.playoff), fase: shiftDateUefa(precedente.uefa.ucl.fase) },
      uel: { playoff: shiftPlayoff(precedente.uefa.uel.playoff), fase: shiftDateUefa(precedente.uefa.uel.fase) },
      uecl: { playoff: shiftPlayoff(precedente.uefa.uecl.playoff), fase: shiftDateUefa(precedente.uefa.uecl.fase) },
    },
    coppeNazionali: Object.fromEntries(
      Object.entries(precedente.coppeNazionali).map(([n, t]) => [
        n,
        {
          preliminari: t.preliminari.map(shift),
          ottavi: shift(t.ottavi),
          quarti: shift(t.quarti),
          semifinali: shift(t.semifinali),
          finale: shift(t.finale),
        },
      ]),
    ),
    supercoppeNazionali: shift(precedente.supercoppeNazionali),
  };
}
