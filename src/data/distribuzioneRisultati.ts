// FLM — Distribuzione empirica dei punteggi per fascia di forza.
// Idea da SimpleFootie (campionamento da risultati storici invece di doppio
// Poisson indipendente), ricostruita su dati reali e sull'Elo di rating.ts.
//
// FONTE (regola 6): football-data.co.uk — risultati top-5 campionati europei
// (Serie A, Premier League, LaLiga, Bundesliga, Ligue 1), stagioni 2015/16-2024/25,
// 18.011 partite (2014/15 usata solo come burn-in Elo).
// Metodo: Elo pre-partita ricalcolato con la formula esatta di src/engine/rating.ts
// (K=20, +100 casa, fattore G standard, squadre da 1500; neopromosse da 1500).
// Fascia: dr = ratingCasa + VANTAGGIO_CASA_ELO - ratingTrasferta, bin da 50 punti;
// code oltre -300 e +400 aggregate nel bin estremo.
// Gol per squadra cappati a CAP_GOL_TABELLA (le goleade oltre cadono nella cella 7).
// Rigenerazione: scripts/genera-distribuzione-risultati.py
//
// Perche': il doppio Poisson indipendente assume gol casa/trasferta scorrelati;
// nella realta' i punteggi bassi (0-0, 1-1) sono piu' frequenti e le code piu'
// pesanti (effetto Dixon-Coles). Campionando dalla distribuzione congiunta reale
// si eredita gratis la microstruttura vera dei punteggi, a parita' di condizionamento.

/** Gol massimo per cella: i punteggi oltre sono aggregati in questa cella. */
export const CAP_GOL_TABELLA = 7;

/** Numero minimo di partite in una fascia per fidarsi del campionamento (sotto: fallback Poisson). */
export const CAMPIONI_MIN_FASCIA = 30;

export interface FasciaRisultati {
  /** Estremo inferiore della fascia di dr = ratingCasa + 100 - ratingTrasferta (bin da 50). */
  minDr: number;
  /** Partite reali nella fascia. */
  campioni: number;
  /** Conteggi punteggi: indice = golCasa * 8 + golTrasferta (64 celle, 0..7 cappati). */
  conteggi: number[];
}

export const DISTRIBUZIONE_RISULTATI: FasciaRisultati[] = [
  { minDr: -300, campioni: 431, conteggi: [18, 46, 48, 33, 26, 19, 2, 2, 13, 31, 52, 31, 16, 4, 5, 0, 4, 21, 16, 14, 9, 3, 2, 0, 1, 2, 5, 1, 1, 0, 0, 0, 0, 0, 1, 0, 3, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0] },
  { minDr: -250, campioni: 393, conteggi: [19, 52, 40, 27, 15, 7, 1, 2, 11, 33, 41, 30, 19, 2, 2, 1, 11, 9, 27, 13, 2, 1, 1, 0, 2, 5, 5, 6, 1, 2, 0, 0, 0, 0, 3, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { minDr: -200, campioni: 604, conteggi: [22, 55, 54, 44, 20, 9, 4, 2, 28, 65, 68, 37, 23, 7, 5, 0, 14, 38, 31, 20, 7, 5, 0, 0, 4, 6, 14, 9, 2, 0, 0, 0, 0, 5, 2, 1, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { minDr: -150, campioni: 853, conteggi: [71, 100, 82, 48, 19, 9, 3, 2, 42, 84, 86, 38, 19, 11, 3, 1, 21, 49, 42, 28, 12, 6, 3, 1, 15, 14, 11, 11, 5, 1, 0, 0, 2, 5, 5, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { minDr: -100, campioni: 1059, conteggi: [73, 120, 90, 41, 26, 6, 6, 0, 71, 103, 100, 41, 25, 9, 2, 1, 37, 83, 62, 31, 17, 6, 1, 0, 23, 33, 14, 12, 6, 1, 2, 0, 6, 4, 3, 1, 1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { minDr: -50, campioni: 1448, conteggi: [107, 152, 94, 49, 24, 5, 1, 1, 114, 197, 131, 60, 32, 10, 0, 0, 60, 97, 71, 52, 21, 3, 1, 0, 30, 41, 27, 13, 6, 1, 0, 0, 17, 8, 11, 4, 3, 1, 0, 0, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { minDr: 0, campioni: 1892, conteggi: [152, 163, 101, 66, 13, 2, 0, 1, 180, 265, 148, 69, 20, 10, 0, 0, 110, 174, 98, 46, 14, 3, 2, 0, 62, 47, 47, 21, 4, 2, 1, 0, 21, 13, 14, 6, 0, 0, 0, 0, 5, 7, 1, 1, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { minDr: 50, campioni: 2288, conteggi: [192, 177, 119, 53, 11, 2, 0, 0, 223, 342, 153, 72, 22, 6, 0, 0, 156, 197, 127, 45, 10, 2, 3, 0, 74, 85, 63, 28, 12, 0, 0, 0, 31, 35, 13, 7, 0, 0, 0, 0, 8, 5, 5, 2, 2, 0, 0, 0, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { minDr: 100, campioni: 2270, conteggi: [163, 165, 88, 28, 12, 1, 1, 1, 253, 312, 148, 62, 13, 1, 1, 0, 173, 229, 137, 48, 14, 1, 1, 0, 96, 99, 53, 24, 2, 0, 0, 0, 26, 35, 17, 14, 2, 1, 0, 0, 12, 15, 9, 2, 0, 0, 0, 0, 3, 3, 2, 0, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 0, 0] },
  { minDr: 150, campioni: 1847, conteggi: [133, 93, 77, 21, 10, 2, 0, 0, 201, 249, 98, 43, 7, 2, 0, 0, 165, 179, 118, 27, 5, 1, 0, 0, 83, 95, 54, 18, 4, 0, 0, 0, 37, 46, 19, 8, 2, 0, 0, 0, 12, 18, 6, 3, 0, 0, 0, 0, 4, 2, 1, 0, 1, 0, 0, 0, 1, 2, 0, 0, 0, 0, 0, 0] },
  { minDr: 200, campioni: 1479, conteggi: [94, 74, 37, 17, 1, 0, 0, 0, 166, 185, 82, 23, 8, 0, 0, 0, 133, 162, 76, 18, 6, 2, 0, 0, 82, 91, 37, 16, 3, 0, 0, 0, 39, 46, 19, 9, 4, 0, 0, 0, 11, 15, 6, 2, 1, 0, 0, 0, 4, 3, 2, 1, 0, 0, 0, 0, 2, 1, 0, 1, 0, 0, 0, 0] },
  { minDr: 250, campioni: 1094, conteggi: [65, 44, 25, 4, 2, 0, 0, 0, 113, 114, 52, 14, 3, 2, 0, 0, 126, 107, 59, 8, 3, 0, 0, 0, 70, 81, 33, 7, 1, 1, 0, 0, 46, 27, 16, 6, 1, 0, 0, 0, 15, 16, 10, 2, 1, 0, 0, 0, 12, 5, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0] },
  { minDr: 300, campioni: 857, conteggi: [48, 23, 18, 7, 1, 0, 0, 0, 97, 71, 26, 6, 2, 2, 0, 0, 94, 94, 31, 13, 0, 1, 0, 0, 78, 63, 22, 4, 2, 0, 0, 0, 35, 31, 13, 8, 0, 0, 0, 0, 26, 16, 1, 2, 0, 0, 0, 0, 4, 7, 2, 2, 0, 0, 0, 0, 2, 2, 3, 0, 0, 0, 0, 0] },
  { minDr: 350, campioni: 584, conteggi: [26, 9, 7, 2, 1, 0, 0, 0, 73, 49, 19, 4, 2, 0, 0, 0, 70, 60, 25, 3, 2, 1, 0, 0, 53, 40, 14, 5, 0, 1, 0, 0, 36, 19, 6, 1, 1, 0, 0, 0, 17, 14, 7, 1, 0, 0, 0, 0, 5, 2, 3, 2, 0, 0, 0, 0, 1, 3, 0, 0, 0, 0, 0, 0] },
  { minDr: 400, campioni: 912, conteggi: [29, 23, 5, 0, 0, 0, 0, 0, 88, 50, 22, 3, 1, 0, 0, 0, 112, 86, 28, 4, 0, 1, 0, 0, 81, 76, 32, 9, 1, 0, 0, 0, 60, 39, 22, 10, 0, 0, 0, 0, 36, 24, 15, 2, 0, 0, 0, 0, 15, 13, 4, 0, 0, 0, 0, 0, 13, 6, 2, 0, 0, 0, 0, 0] },
];
