// FLM — Accessi alle coppe europee (PRD 7.1: "piazzamenti determinano gli accessi").
//
// FONTI (verifica web, agosto 2026 — docs/verifica-web.md):
// - Access list reale 2026/27: en.wikipedia.org/wiki/2026–27_UEFA_Champions_League,
//   .../2026–27_UEFA_Europa_League, .../2026–27_UEFA_Conference_League.
// - Classifiche finali reali 2025/26: derivate dagli accessi europei 2026/27
//   (verifica-web.md §7 e §12); i primi 7-8 posti sono verificati, oltre si completa
//   con l'ordine del dataset FL26 (non usato dagli accessi).
// - Vincitori coppe nazionali 2025/26: verifica-web.md §10.
// - Coefficienti associazione 2026/27 (finestre 2020/21–2024/25): verifica-web.md §2.
//
// REGOLE (reali, semplificate al perimetro del motore):
// - Slot fissi per lega (access list UEFA reale 2026/27).
// - Vincitrice coppa nazionale: entra in UEL league phase; se già qualificata via
//   campionato, il posto scorre alla posizione successiva (riallocazione reale).
// - Campioni in carica UCL/UEL/UECL: posto extra se non qualificati via campionato.
// - EPS: 2 associazioni col miglior coefficiente stagionale hanno un posto UCL extra
//   (2026/27: Inghilterra e Spagna — 5ª classificata).
// - England: vincitrice EFL Cup → playoff UECL (regola speciale reale).

import type { TipoCompetizione } from '../types/entities';

/** Accesso di un club a una competizione europea. */
export interface AccessoEuropeo {
  nazione: string;
  squadra: string;
  competizione: 'champions_league' | 'europa_league' | 'conference_league';
  /** 'league_phase' = entra direttamente; 'playoff' = entra all'ultimo turno di qualificazione */
  turno: 'league_phase' | 'playoff';
  /** Etichetta di come si è qualificato (per il report sorteggio) */
  motivo: string;
}

/** Configurazione accessi di una lega UEFA giocabile. */
export interface AccessiLega {
  nazione: string;
  /** Nome lega come in LEGHE_CURATE */
  lega: string;
  /**
   * Slot UCL per posizione: array [pos, turno] — pos N = 'league_phase', pos M = 'playoff'.
   * EPS inclusa quando la nazione ce l'ha (es. Inghilterra: 5ª in league phase).
   */
  champions: Array<{ posizione: number; turno: 'league_phase' | 'playoff' }>;
  /** Slot UEL per posizione (oltre alla vincitrice coppa) */
  europa: Array<{ posizione: number; turno: 'league_phase' | 'playoff' }>;
  /** Slot UECL per posizione */
  conference: Array<{ posizione: number; turno: 'league_phase' | 'playoff' }>;
  /** La vincitrice della coppa nazionale entra in UEL league phase (regola reale) */
  coppaNazionaleInUel: boolean;
}

/**
 * Slot reali 2026/27 (fonte: access list UEFA 2026/27, verifica-web.md §2).
 * Semplificazione dichiarata: si modellano solo league phase e playoff (ultimo
 * turno), come da decisione utente ("solo l'ultimo turno di qualificazione").
 * Le posizioni "playoff" delle leghe minori replicano il percorso reale ridotto.
 */
export const ACCESSI_LEGHE: AccessiLega[] = [
  {
    nazione: 'Italia',
    lega: 'Serie A',
    champions: [{ posizione: 1, turno: 'league_phase' }, { posizione: 2, turno: 'league_phase' }, { posizione: 3, turno: 'league_phase' }, { posizione: 4, turno: 'league_phase' }],
    europa: [{ posizione: 5, turno: 'league_phase' }, { posizione: 6, turno: 'league_phase' }],
    conference: [{ posizione: 7, turno: 'league_phase' }],
    coppaNazionaleInUel: true,
  },
  {
    nazione: 'Inghilterra',
    lega: 'Premier League',
    champions: [
      { posizione: 1, turno: 'league_phase' }, { posizione: 2, turno: 'league_phase' },
      { posizione: 3, turno: 'league_phase' }, { posizione: 4, turno: 'league_phase' },
      { posizione: 5, turno: 'league_phase' }, // EPS reale 2026/27
    ],
    europa: [{ posizione: 6, turno: 'league_phase' }, { posizione: 7, turno: 'league_phase' }],
    conference: [{ posizione: 8, turno: 'playoff' }], // EFL Cup slot: qui 8ª (City già in UCL)
    coppaNazionaleInUel: true,
  },
  {
    nazione: 'Spagna',
    lega: 'La Liga',
    champions: [
      { posizione: 1, turno: 'league_phase' }, { posizione: 2, turno: 'league_phase' },
      { posizione: 3, turno: 'league_phase' }, { posizione: 4, turno: 'league_phase' },
      { posizione: 5, turno: 'league_phase' }, // EPS reale 2026/27
    ],
    europa: [{ posizione: 6, turno: 'league_phase' }],
    conference: [{ posizione: 7, turno: 'league_phase' }],
    coppaNazionaleInUel: true,
  },
  {
    nazione: 'Germania',
    lega: 'Bundesliga',
    champions: [
      { posizione: 1, turno: 'league_phase' }, { posizione: 2, turno: 'league_phase' },
      { posizione: 3, turno: 'league_phase' }, { posizione: 4, turno: 'league_phase' },
    ],
    europa: [{ posizione: 5, turno: 'league_phase' }, { posizione: 6, turno: 'league_phase' }],
    conference: [{ posizione: 7, turno: 'playoff' }], // reale: 7ª entra al playoff UECL
    coppaNazionaleInUel: true,
  },
  {
    nazione: 'Francia',
    lega: 'Ligue 1',
    champions: [
      { posizione: 1, turno: 'league_phase' }, { posizione: 2, turno: 'league_phase' },
      { posizione: 3, turno: 'league_phase' }, { posizione: 4, turno: 'playoff' }, // reale: 4ª al Q3 → semplificato al playoff
    ],
    europa: [{ posizione: 5, turno: 'league_phase' }, { posizione: 6, turno: 'league_phase' }],
    conference: [{ posizione: 7, turno: 'playoff' }],
    coppaNazionaleInUel: true,
  },
  {
    nazione: 'Paesi Bassi',
    lega: 'Eredivisie',
    champions: [
      { posizione: 1, turno: 'league_phase' }, { posizione: 2, turno: 'league_phase' },
      { posizione: 3, turno: 'playoff' }, // reale: 3ª al Q3 LP → semplificato
    ],
    europa: [{ posizione: 4, turno: 'playoff' }],
    conference: [{ posizione: 5, turno: 'playoff' }],
    coppaNazionaleInUel: true, // reale: vincitrice KNVB in UEL league phase
  },
  {
    nazione: 'Portogallo',
    lega: 'Primeira Liga',
    champions: [
      { posizione: 1, turno: 'league_phase' }, { posizione: 2, turno: 'league_phase' },
      { posizione: 3, turno: 'playoff' },
    ],
    europa: [{ posizione: 4, turno: 'playoff' }],
    conference: [{ posizione: 5, turno: 'playoff' }],
    coppaNazionaleInUel: true,
  },
  {
    nazione: 'Belgio',
    lega: 'Belgian Pro League',
    champions: [
      { posizione: 1, turno: 'league_phase' }, { posizione: 2, turno: 'playoff' },
      { posizione: 3, turno: 'playoff' },
    ],
    europa: [{ posizione: 4, turno: 'playoff' }],
    conference: [{ posizione: 5, turno: 'playoff' }],
    coppaNazionaleInUel: false, // reale: vincitrice Belgian Cup → UEL playoff (semplificato: playoff)
  },
  {
    nazione: 'Repubblica Ceca',
    lega: 'Czech First League',
    champions: [
      { posizione: 1, turno: 'league_phase' }, { posizione: 2, turno: 'playoff' },
    ],
    europa: [{ posizione: 3, turno: 'playoff' }],
    conference: [{ posizione: 4, turno: 'playoff' }, { posizione: 5, turno: 'playoff' }],
    coppaNazionaleInUel: false,
  },
  {
    nazione: 'Turchia',
    lega: 'Süper Lig',
    champions: [
      { posizione: 1, turno: 'league_phase' }, { posizione: 2, turno: 'playoff' },
    ],
    europa: [{ posizione: 3, turno: 'playoff' }, { posizione: 4, turno: 'playoff' }],
    conference: [{ posizione: 5, turno: 'playoff' }],
    coppaNazionaleInUel: false, // reale: vincitrice Turkish Cup → UEL playoff
  },
  {
    nazione: 'Scozia',
    lega: 'Scottish Premiership',
    champions: [
      { posizione: 1, turno: 'playoff' }, { posizione: 2, turno: 'playoff' },
    ],
    europa: [{ posizione: 3, turno: 'playoff' }],
    conference: [{ posizione: 4, turno: 'playoff' }, { posizione: 5, turno: 'playoff' }],
    coppaNazionaleInUel: false,
  },
  {
    nazione: 'Grecia',
    lega: 'Greek Super League',
    champions: [
      { posizione: 1, turno: 'playoff' }, { posizione: 2, turno: 'playoff' },
    ],
    europa: [{ posizione: 3, turno: 'playoff' }],
    conference: [{ posizione: 4, turno: 'playoff' }],
    coppaNazionaleInUel: false, // reale: vincitrice Greek Cup → UEL playoff
  },
  {
    nazione: 'Danimarca',
    lega: 'Danish Superliga',
    champions: [{ posizione: 1, turno: 'playoff' }],
    europa: [],
    conference: [{ posizione: 2, turno: 'playoff' }, { posizione: 3, turno: 'playoff' }],
    coppaNazionaleInUel: false, // reale: vincitrice Danish Cup → UEL Q2 → semplificato: playoff
  },
];

/** Accessi della stagione seme 2025/26 → stagione 2026/27 (fonte: verifica-web.md §3, §10, §12). */
export const ACCESSI_STAGIONE_SEME: AccessoEuropeo[] = [
  // --- Campioni in carica ---
  { nazione: 'Francia', squadra: 'Paris Saint-Germain', competizione: 'champions_league', turno: 'league_phase', motivo: 'Campione UCL in carica' },
  { nazione: 'Inghilterra', squadra: 'Aston Villa', competizione: 'champions_league', turno: 'league_phase', motivo: 'Campione UEL in carica' },
  { nazione: 'Inghilterra', squadra: 'Crystal Palace', competizione: 'europa_league', turno: 'league_phase', motivo: 'Campione UECL in carica' },

  // --- Premier League 2025/26 ---
  { nazione: 'Inghilterra', squadra: 'Arsenal', competizione: 'champions_league', turno: 'league_phase', motivo: '1ª classificata' },
  { nazione: 'Inghilterra', squadra: 'Manchester City', competizione: 'champions_league', turno: 'league_phase', motivo: '2ª classificata' },
  { nazione: 'Inghilterra', squadra: 'Manchester United', competizione: 'champions_league', turno: 'league_phase', motivo: '3ª classificata' },
  { nazione: 'Inghilterra', squadra: 'Liverpool', competizione: 'champions_league', turno: 'league_phase', motivo: '5ª classificata (EPS)' },
  { nazione: 'Inghilterra', squadra: 'AFC Bournemouth', competizione: 'europa_league', turno: 'league_phase', motivo: '6ª classificata (riallocazione FA Cup)' },
  { nazione: 'Inghilterra', squadra: 'Sunderland', competizione: 'europa_league', turno: 'league_phase', motivo: '7ª classificata (riallocazione FA Cup)' },
  { nazione: 'Inghilterra', squadra: 'Brighton & Hove Albion', competizione: 'conference_league', turno: 'playoff', motivo: '8ª classificata (riallocazione EFL Cup)' },

  // --- Serie A 2025/26 ---
  { nazione: 'Italia', squadra: 'Inter Milan', competizione: 'champions_league', turno: 'league_phase', motivo: '1ª classificata (campione)' },
  { nazione: 'Italia', squadra: 'Napoli', competizione: 'champions_league', turno: 'league_phase', motivo: '2ª classificata' },
  { nazione: 'Italia', squadra: 'Roma', competizione: 'champions_league', turno: 'league_phase', motivo: '3ª classificata' },
  { nazione: 'Italia', squadra: 'Como', competizione: 'champions_league', turno: 'league_phase', motivo: '4ª classificata' },
  { nazione: 'Italia', squadra: 'AC Milan', competizione: 'europa_league', turno: 'league_phase', motivo: '5ª classificata (riallocazione Coppa Italia)' },
  { nazione: 'Italia', squadra: 'Juventus', competizione: 'europa_league', turno: 'league_phase', motivo: '6ª classificata' },
  { nazione: 'Italia', squadra: 'Atalanta', competizione: 'conference_league', turno: 'playoff', motivo: '7ª classificata' },

  // --- La Liga 2025/26 ---
  { nazione: 'Spagna', squadra: 'Barcelona', competizione: 'champions_league', turno: 'league_phase', motivo: '1ª classificata (campione)' },
  { nazione: 'Spagna', squadra: 'Real Madrid', competizione: 'champions_league', turno: 'league_phase', motivo: '2ª classificata' },
  { nazione: 'Spagna', squadra: 'Villarreal', competizione: 'champions_league', turno: 'league_phase', motivo: '3ª classificata' },
  { nazione: 'Spagna', squadra: 'Atlético Madrid', competizione: 'champions_league', turno: 'league_phase', motivo: '4ª classificata' },
  { nazione: 'Spagna', squadra: 'Real Betis', competizione: 'champions_league', turno: 'league_phase', motivo: '5ª classificata (EPS)' },
  { nazione: 'Spagna', squadra: 'Real Sociedad', competizione: 'europa_league', turno: 'league_phase', motivo: 'Vincitrice Copa del Rey' },
  { nazione: 'Spagna', squadra: 'Celta Vigo', competizione: 'europa_league', turno: 'league_phase', motivo: '6ª classificata' },
  { nazione: 'Spagna', squadra: 'Getafe', competizione: 'conference_league', turno: 'playoff', motivo: '7ª classificata' },

  // --- Bundesliga 2025/26 ---
  { nazione: 'Germania', squadra: 'Bayern Munich', competizione: 'champions_league', turno: 'league_phase', motivo: '1ª classificata (campione)' },
  { nazione: 'Germania', squadra: 'Borussia Dortmund', competizione: 'champions_league', turno: 'league_phase', motivo: '2ª classificata' },
  { nazione: 'Germania', squadra: 'RB Leipzig', competizione: 'champions_league', turno: 'league_phase', motivo: '3ª classificata' },
  { nazione: 'Germania', squadra: 'VfB Stuttgart', competizione: 'champions_league', turno: 'league_phase', motivo: '4ª classificata' },
  { nazione: 'Germania', squadra: 'TSG Hoffenheim', competizione: 'europa_league', turno: 'league_phase', motivo: '5ª classificata' },
  { nazione: 'Germania', squadra: 'Bayer Leverkusen', competizione: 'europa_league', turno: 'league_phase', motivo: '6ª classificata (riallocazione DFB-Pokal)' },
  { nazione: 'Germania', squadra: 'SC Freiburg', competizione: 'conference_league', turno: 'playoff', motivo: '7ª classificata (riallocazione DFB-Pokal)' },

  // --- Ligue 1 2025/26 ---
  { nazione: 'Francia', squadra: 'Lens', competizione: 'champions_league', turno: 'league_phase', motivo: '2ª classificata (vincitrice Coupe de France)' },
  { nazione: 'Francia', squadra: 'Lille', competizione: 'champions_league', turno: 'league_phase', motivo: '3ª classificata' },
  { nazione: 'Francia', squadra: 'Lyon', competizione: 'champions_league', turno: 'playoff', motivo: '4ª classificata' },
  { nazione: 'Francia', squadra: 'Marseille', competizione: 'europa_league', turno: 'league_phase', motivo: '5ª classificata' },
  { nazione: 'Francia', squadra: 'Rennes', competizione: 'europa_league', turno: 'league_phase', motivo: '6ª classificata (riallocazione Coupe de France)' },
  { nazione: 'Francia', squadra: 'Monaco', competizione: 'conference_league', turno: 'playoff', motivo: '7ª classificata' },

  // --- Eredivisie 2025/26 ---
  { nazione: 'Paesi Bassi', squadra: 'PSV Eindhoven', competizione: 'champions_league', turno: 'league_phase', motivo: '1ª classificata (campione)' },
  { nazione: 'Paesi Bassi', squadra: 'Feyenoord', competizione: 'champions_league', turno: 'league_phase', motivo: '2ª classificata' },
  { nazione: 'Paesi Bassi', squadra: 'NEC', competizione: 'champions_league', turno: 'playoff', motivo: '3ª classificata' },
  { nazione: 'Paesi Bassi', squadra: 'AZ', competizione: 'europa_league', turno: 'league_phase', motivo: 'Vincitrice KNVB Cup' },
  { nazione: 'Paesi Bassi', squadra: 'Twente', competizione: 'europa_league', turno: 'playoff', motivo: '4ª classificata' },
  { nazione: 'Paesi Bassi', squadra: 'Ajax', competizione: 'conference_league', turno: 'playoff', motivo: 'Vincitrice play-off UECL' },

  // --- Primeira Liga 2025/26 ---
  { nazione: 'Portogallo', squadra: 'Porto', competizione: 'champions_league', turno: 'league_phase', motivo: '1ª classificata (campione)' },
  { nazione: 'Portogallo', squadra: 'Sporting CP', competizione: 'champions_league', turno: 'league_phase', motivo: '2ª classificata (rebalancing UEL TH)' },
  { nazione: 'Portogallo', squadra: 'Benfica', competizione: 'europa_league', turno: 'playoff', motivo: '3ª classificata' },
  { nazione: 'Portogallo', squadra: 'Torreense', competizione: 'europa_league', turno: 'league_phase', motivo: 'Vincitrice Taça de Portugal' },
  { nazione: 'Portogallo', squadra: 'Braga', competizione: 'conference_league', turno: 'playoff', motivo: '4ª classificata' },

  // --- Belgian Pro League 2025/26 ---
  { nazione: 'Belgio', squadra: 'Club Brugge', competizione: 'champions_league', turno: 'league_phase', motivo: '1ª classificata (campione)' },
  { nazione: 'Belgio', squadra: 'Union Saint-Gilloise', competizione: 'champions_league', turno: 'playoff', motivo: '2ª classificata' },
  { nazione: 'Belgio', squadra: 'Sint-Truiden', competizione: 'europa_league', turno: 'playoff', motivo: '3ª classificata' },
  { nazione: 'Belgio', squadra: 'Anderlecht', competizione: 'europa_league', turno: 'playoff', motivo: '4ª classificata' },
  { nazione: 'Belgio', squadra: 'Gent', competizione: 'conference_league', turno: 'playoff', motivo: 'Vincitrice play-off UECL' },

  // --- Czech First League 2025/26 ---
  { nazione: 'Repubblica Ceca', squadra: 'Slavia Prague', competizione: 'champions_league', turno: 'league_phase', motivo: '1ª classificata (campione)' },
  { nazione: 'Repubblica Ceca', squadra: 'Sparta Prague', competizione: 'champions_league', turno: 'playoff', motivo: '2ª classificata' },
  { nazione: 'Repubblica Ceca', squadra: 'Viktoria Plzeň', competizione: 'europa_league', turno: 'playoff', motivo: '3ª classificata (posto coppa riallocato)' },
  { nazione: 'Repubblica Ceca', squadra: 'Hradec Králové', competizione: 'conference_league', turno: 'playoff', motivo: '4ª classificata' },
  { nazione: 'Repubblica Ceca', squadra: 'Jablonec', competizione: 'conference_league', turno: 'playoff', motivo: '5ª classificata' },

  // --- Süper Lig 2025/26 ---
  { nazione: 'Turchia', squadra: 'Galatasaray', competizione: 'champions_league', turno: 'league_phase', motivo: '1ª classificata (campione)' },
  { nazione: 'Turchia', squadra: 'Fenerbahçe', competizione: 'champions_league', turno: 'playoff', motivo: '2ª classificata' },
  { nazione: 'Turchia', squadra: 'Trabzonspor', competizione: 'europa_league', turno: 'playoff', motivo: 'Vincitrice Turkish Cup' },
  { nazione: 'Turchia', squadra: 'Beşiktaş', competizione: 'europa_league', turno: 'playoff', motivo: '4ª classificata' },
  { nazione: 'Turchia', squadra: 'İstanbul Başakşehir', competizione: 'conference_league', turno: 'playoff', motivo: '5ª classificata' },

  // --- Scottish Premiership 2025/26 ---
  { nazione: 'Scozia', squadra: 'Celtic', competizione: 'champions_league', turno: 'playoff', motivo: '1ª classificata (campione)' },
  { nazione: 'Scozia', squadra: 'Heart of Midlothian', competizione: 'champions_league', turno: 'playoff', motivo: '2ª classificata' },
  { nazione: 'Scozia', squadra: 'Rangers', competizione: 'conference_league', turno: 'playoff', motivo: '3ª classificata' },
  { nazione: 'Scozia', squadra: 'Motherwell', competizione: 'conference_league', turno: 'playoff', motivo: '4ª classificata' },
  { nazione: 'Scozia', squadra: 'Hibernian', competizione: 'conference_league', turno: 'playoff', motivo: '5ª classificata' },

  // --- Greek Super League 2025/26 ---
  { nazione: 'Grecia', squadra: 'AEK Athens', competizione: 'champions_league', turno: 'playoff', motivo: '1ª classificata (campione)' },
  { nazione: 'Grecia', squadra: 'Olympiacos', competizione: 'champions_league', turno: 'playoff', motivo: '2ª classificata' },
  { nazione: 'Grecia', squadra: 'PAOK', competizione: 'conference_league', turno: 'playoff', motivo: '3ª classificata' },
  { nazione: 'Grecia', squadra: 'Panathinaikos', competizione: 'conference_league', turno: 'playoff', motivo: '4ª classificata' },
  { nazione: 'Grecia', squadra: 'OFI', competizione: 'europa_league', turno: 'playoff', motivo: 'Vincitrice Greek Cup' },

  // --- Danish Superliga 2025/26 ---
  { nazione: 'Danimarca', squadra: 'AGF', competizione: 'champions_league', turno: 'playoff', motivo: '1ª classificata (campione)' },
  { nazione: 'Danimarca', squadra: 'Midtjylland', competizione: 'conference_league', turno: 'playoff', motivo: 'Vincitrice Danish Cup' },
  { nazione: 'Danimarca', squadra: 'Nordsjælland', competizione: 'conference_league', turno: 'playoff', motivo: '3ª classificata' },
  { nazione: 'Danimarca', squadra: 'Copenhagen', competizione: 'conference_league', turno: 'playoff', motivo: 'Vincitrice play-off UECL' },

  // --- Norvegia 2025 (stagione solare) ---
  { nazione: 'Norvegia', squadra: 'Viking', competizione: 'champions_league', turno: 'playoff', motivo: '1ª classificata (campione)' },
  { nazione: 'Norvegia', squadra: 'Bodø/Glimt', competizione: 'champions_league', turno: 'playoff', motivo: '2ª classificata' },
  { nazione: 'Norvegia', squadra: 'Tromsø', competizione: 'conference_league', turno: 'playoff', motivo: '3ª classificata' },
  { nazione: 'Norvegia', squadra: 'Brann', competizione: 'conference_league', turno: 'playoff', motivo: '4ª classificata' },
  { nazione: 'Norvegia', squadra: 'Lillestrøm', competizione: 'europa_league', turno: 'playoff', motivo: 'Vincitrice Norwegian Cup' },

  // --- Austria 2025/26 ---
  { nazione: 'Austria', squadra: 'LASK', competizione: 'champions_league', turno: 'playoff', motivo: '1ª classificata (campione)' },
  { nazione: 'Austria', squadra: 'Sturm Graz', competizione: 'champions_league', turno: 'playoff', motivo: '2ª classificata' },
  { nazione: 'Austria', squadra: 'Red Bull Salzburg', competizione: 'europa_league', turno: 'playoff', motivo: '3ª classificata' },
  { nazione: 'Austria', squadra: 'Austria Wien', competizione: 'conference_league', turno: 'playoff', motivo: '4ª classificata' },

  // --- Polonia 2025/26 ---
  { nazione: 'Polonia', squadra: 'Lech Poznań', competizione: 'champions_league', turno: 'playoff', motivo: '1ª classificata (campione)' },
  { nazione: 'Polonia', squadra: 'Górnik Zabrze', competizione: 'champions_league', turno: 'playoff', motivo: '2ª classificata' },
  { nazione: 'Polonia', squadra: 'Jagiellonia Białystok', competizione: 'europa_league', turno: 'playoff', motivo: '3ª classificata' },
  { nazione: 'Polonia', squadra: 'Raków Częstochowa', competizione: 'conference_league', turno: 'playoff', motivo: '4ª classificata' },
  { nazione: 'Polonia', squadra: 'GKS Katowice', competizione: 'conference_league', turno: 'playoff', motivo: '5ª classificata' },

  // --- Svizzera 2025/26 ---
  { nazione: 'Svizzera', squadra: 'Thun', competizione: 'champions_league', turno: 'playoff', motivo: '1ª classificata (campione)' },
  { nazione: 'Svizzera', squadra: 'St. Gallen', competizione: 'europa_league', turno: 'playoff', motivo: 'Vincitrice Swiss Cup' },
  { nazione: 'Svizzera', squadra: 'Lugano', competizione: 'conference_league', turno: 'playoff', motivo: '3ª classificata' },
  { nazione: 'Svizzera', squadra: 'Sion', competizione: 'conference_league', turno: 'playoff', motivo: '4ª classificata' },

  // --- Ucraina (associazione 23, rebalancing Russia) ---
  { nazione: 'Ucraina', squadra: 'Shakhtar Donetsk', competizione: 'champions_league', turno: 'league_phase', motivo: '1ª classificata (rebalancing TH)' },
  { nazione: 'Ucraina', squadra: 'Dynamo Kyiv', competizione: 'conference_league', turno: 'playoff', motivo: 'Vincitrice Ukrainian Cup' },

  // --- Croazia 2025/26 ---
  { nazione: 'Croazia', squadra: 'Dinamo Zagreb', competizione: 'champions_league', turno: 'playoff', motivo: '1ª classificata (campione)' },
  { nazione: 'Croazia', squadra: 'Hajduk Split', competizione: 'conference_league', turno: 'playoff', motivo: '2ª classificata' },

  // --- Serbia 2025/26 ---
  { nazione: 'Serbia', squadra: 'Red Star Belgrade', competizione: 'europa_league', turno: 'playoff', motivo: '1ª classificata' },
  { nazione: 'Serbia', squadra: 'Vojvodina', competizione: 'conference_league', turno: 'playoff', motivo: '2ª classificata' },
  { nazione: 'Serbia', squadra: 'Partizan', competizione: 'conference_league', turno: 'playoff', motivo: '3ª classificata' },

  // --- Cipro 2025/26 ---
  { nazione: 'Cipro', squadra: 'Omonia', competizione: 'champions_league', turno: 'playoff', motivo: '1ª classificata (campione)' },
  { nazione: 'Cipro', squadra: 'Pafos', competizione: 'europa_league', turno: 'playoff', motivo: 'Vincitrice Cypriot Cup' },
  { nazione: 'Cipro', squadra: 'AEK Larnaca', competizione: 'conference_league', turno: 'playoff', motivo: '2ª classificata' },

  // --- Ungheria 2025/26 ---
  { nazione: 'Ungheria', squadra: 'ETO Győr', competizione: 'conference_league', turno: 'playoff', motivo: '1ª classificata (campione)' },
  { nazione: 'Ungheria', squadra: 'Ferencváros', competizione: 'europa_league', turno: 'playoff', motivo: 'Vincitrice Magyar Kupa' },

  // --- Romania 2025/26 ---
  { nazione: 'Romania', squadra: 'Universitatea Craiova', competizione: 'europa_league', turno: 'playoff', motivo: '1ª classificata (campione)' },

  // --- Slovacchia 2025/26 ---
  { nazione: 'Slovacchia', squadra: 'Slovan Bratislava', competizione: 'champions_league', turno: 'playoff', motivo: '1ª classificata (campione, promosso per coefficiente)' },

  // --- Bulgaria / Azerbaijan / Slovenia / Israele / Moldavia / Islanda (playoff reali) ---
  { nazione: 'Bulgaria', squadra: 'Levski Sofia', competizione: 'champions_league', turno: 'playoff', motivo: '1ª classificata (campione)' },
  { nazione: 'Azerbaijan', squadra: 'Sabah', competizione: 'champions_league', turno: 'playoff', motivo: '1ª classificata (campione)' },
  { nazione: 'Slovenia', squadra: 'Celje', competizione: 'champions_league', turno: 'playoff', motivo: '1ª classificata (campione, promosso per coefficiente)' },
  { nazione: 'Israele', squadra: 'Hapoel Be\'er Sheva', competizione: 'champions_league', turno: 'playoff', motivo: '1ª classificata (campione)' },
  { nazione: 'Kazakistan', squadra: 'Kairat', competizione: 'europa_league', turno: 'playoff', motivo: '1ª classificata (campione)' },
];

/** Vincitori coppe nazionali 2025/26 (seme delle coppe 2026/27 come detentrici). */
export const VINCITORI_COPPE_2025_26: Record<string, string> = {
  Italia: 'Inter Milan', // Coppa Italia, 10º titolo (13 mag 2026)
  Inghilterra: 'Manchester City', // FA Cup, 8º titolo (16 mag 2026)
  Spagna: 'Real Sociedad', // Copa del Rey
  Germania: 'Bayern Munich', // DFB-Pokal, 21º titolo (23 mag 2026)
  Francia: 'Lens', // Coupe de France, 1º titolo (22 mag 2026)
  'Paesi Bassi': 'AZ', // KNVB Cup
  Portogallo: 'Torreense', // Taça de Portugal
  Belgio: '', // da verificare al bootstrap (posto UEL playoff nel reale)
  'Repubblica Ceca': '', // Karviná squalificata (scandalo combine) → Plzeň promossa
  Turchia: 'Trabzonspor', // Turkish Cup
  Scozia: '', // da verificare al bootstrap
  Grecia: 'OFI', // Greek Cup
  Danimarca: 'Midtjylland', // Danish Cup
};

/** Campioni nazionali 2025/26 (seme per le supercoppe nazionali 2026). */
export const CAMPIONI_NAZIONALI_2025_26: Record<string, string> = {
  Italia: 'Inter Milan',
  Inghilterra: 'Arsenal',
  Spagna: 'Barcelona',
  Germania: 'Bayern Munich',
  Francia: 'Paris Saint-Germain',
  'Paesi Bassi': 'PSV Eindhoven',
  Portogallo: 'Porto',
  Belgio: 'Club Brugge',
  'Repubblica Ceca': 'Slavia Prague',
  Turchia: 'Galatasaray',
  Scozia: 'Celtic',
  Grecia: 'AEK Athens',
  Danimarca: 'AGF',
};

/** Coefficienti associazione UEFA 2026/27 (finestre 2020/21–2024/25) — per la regola 20% club non rankati. */
export const COEFFICIENTI_ASSOCIAZIONE_2026_27: Record<string, number> = {
  Inghilterra: 115.196,
  Italia: 97.231,
  Spagna: 94.453,
  Germania: 86.331,
  Francia: 73.093,
  'Paesi Bassi': 67.15,
  Portogallo: 62.266,
  Belgio: 56.85,
  'Repubblica Ceca': 44.1,
  Turchia: 43.9,
  Norvegia: 39.687,
  Grecia: 39.312,
  Austria: 36.45,
  Scozia: 35.55,
  Polonia: 35.0,
  Danimarca: 33.981,
  Svizzera: 33.625,
  Israele: 31.625,
  Cipro: 27.537,
  Svezia: 27.125,
  Croazia: 27.025,
  Serbia: 25.5,
  Ucraina: 24.4,
  Ungheria: 24.0,
  Romania: 23.25,
  Slovacchia: 21.25,
  Slovenia: 20.343,
  Bulgaria: 19.875,
  Azerbaijan: 19.625,
  Irlanda: 14.968,
  Moldavia: 14.5,
  Islanda: 13.52,
  Bosnia: 13.031,
  Armenia: 12.25,
  Lettonia: 12.25,
  Kosovo: 12.041,
  Finlandia: 11.75,
  Kazakistan: 11.125,
  'Fær Øer': 10.75,
  Malta: 8.5,
  'Irlanda del Nord': 8.333,
  Lituania: 8.25,
  Liechtenstein: 8.0,
  Estonia: 7.957,
  Albania: 7.875,
  Montenegro: 7.208,
  Lussemburgo: 6.875,
  Galles: 6.791,
  Georgia: 6.625,
  'Macedonia del Nord': 6.166,
  Bielorussia: 6.0,
  Andorra: 5.498,
  Gibilterra: 5.457,
  'San Marino': 2.498,
};

/**
 * Posti per posizione della lega dell'utente: funzione di lookup negli
 * ACCESSI_LEGHE per il campionato scelto. Usata dal motore per gli accessi
 * delle stagioni simulate (dalla 2027/28 in poi).
 */
export function accessiPerLega(nomeLega: string): AccessiLega | undefined {
  return ACCESSI_LEGHE.find((a) => a.lega === nomeLega);
}

/** Le squadre della stagione seme per una data competizione e turno. */
export function accessiSemePer(
  competizione: TipoCompetizione,
  turno: 'league_phase' | 'playoff',
): AccessoEuropeo[] {
  return ACCESSI_STAGIONE_SEME.filter((a) => a.competizione === competizione && a.turno === turno);
}
