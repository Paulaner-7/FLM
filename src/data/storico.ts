// FLM — Storico risultati reali (posizioni finali di campionato).
// Regola 6 AGENTS.md: dati reali verificati con fonte.
// Fonte: classifiche finali Wikipedia (template "2024–25 Serie A table" ecc.,
// pagine delle stagioni 2020/21-2024/25), consultate per questa feature.
// Le stagioni mancanti (squadra in Serie C o inesistente) sono semplicemente
// assenti: la media pesata per recency usa solo le stagioni disponibili.
// I nomi sono quelli delle rose FL26 (src/data/leagues.ts).

export type DivisioneStorica = 'serie_a' | 'serie_b';

export interface StagioneStorica {
  stagione: string;
  divisione: DivisioneStorica;
  /** Posizione finale nella classifica di quella stagione */
  posizione: number;
}

export const STORICO: Record<string, StagioneStorica[]> = {
  // ---------- Serie A (rosa 2025/26) ----------
  Atalanta: [
    { stagione: '2020/21', divisione: 'serie_a', posizione: 3 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 8 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 5 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 4 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 3 },
  ],
  Bologna: [
    { stagione: '2020/21', divisione: 'serie_a', posizione: 12 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 13 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 9 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 5 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 9 },
  ],
  Cagliari: [
    { stagione: '2020/21', divisione: 'serie_a', posizione: 16 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 18 },
    { stagione: '2022/23', divisione: 'serie_b', posizione: 5 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 16 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 15 },
  ],
  Como: [
    { stagione: '2021/22', divisione: 'serie_b', posizione: 13 },
    { stagione: '2022/23', divisione: 'serie_b', posizione: 13 },
    { stagione: '2023/24', divisione: 'serie_b', posizione: 2 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 10 },
  ],
  Cremonese: [
    { stagione: '2020/21', divisione: 'serie_b', posizione: 13 },
    { stagione: '2021/22', divisione: 'serie_b', posizione: 2 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 19 },
    { stagione: '2023/24', divisione: 'serie_b', posizione: 4 },
    { stagione: '2024/25', divisione: 'serie_b', posizione: 4 },
  ],
  Fiorentina: [
    { stagione: '2020/21', divisione: 'serie_a', posizione: 13 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 7 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 8 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 8 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 6 },
  ],
  Genoa: [
    { stagione: '2020/21', divisione: 'serie_a', posizione: 11 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 19 },
    { stagione: '2022/23', divisione: 'serie_b', posizione: 2 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 11 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 13 },
  ],
  'Hellas Verona': [
    { stagione: '2020/21', divisione: 'serie_a', posizione: 10 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 9 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 18 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 13 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 14 },
  ],
  Inter: [
    { stagione: '2020/21', divisione: 'serie_a', posizione: 1 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 2 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 3 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 1 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 2 },
  ],
  Juventus: [
    { stagione: '2020/21', divisione: 'serie_a', posizione: 4 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 4 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 7 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 3 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 4 },
  ],
  Lazio: [
    { stagione: '2020/21', divisione: 'serie_a', posizione: 6 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 5 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 2 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 7 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 6 },
  ],
  Lecce: [
    { stagione: '2020/21', divisione: 'serie_b', posizione: 4 },
    { stagione: '2021/22', divisione: 'serie_b', posizione: 1 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 16 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 14 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 17 },
  ],
  Milan: [
    { stagione: '2020/21', divisione: 'serie_a', posizione: 2 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 1 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 4 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 2 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 8 },
  ],
  Napoli: [
    { stagione: '2020/21', divisione: 'serie_a', posizione: 5 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 3 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 1 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 10 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 1 },
  ],
  Parma: [
    { stagione: '2020/21', divisione: 'serie_a', posizione: 20 },
    { stagione: '2021/22', divisione: 'serie_b', posizione: 12 },
    { stagione: '2022/23', divisione: 'serie_b', posizione: 4 },
    { stagione: '2023/24', divisione: 'serie_b', posizione: 1 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 16 },
  ],
  Pisa: [
    { stagione: '2020/21', divisione: 'serie_b', posizione: 14 },
    { stagione: '2021/22', divisione: 'serie_b', posizione: 3 },
    { stagione: '2022/23', divisione: 'serie_b', posizione: 11 },
    { stagione: '2023/24', divisione: 'serie_b', posizione: 13 },
    { stagione: '2024/25', divisione: 'serie_b', posizione: 2 },
  ],
  Roma: [
    { stagione: '2020/21', divisione: 'serie_a', posizione: 7 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 6 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 6 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 6 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 5 },
  ],
  Sassuolo: [
    { stagione: '2020/21', divisione: 'serie_a', posizione: 8 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 11 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 13 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 19 },
    { stagione: '2024/25', divisione: 'serie_b', posizione: 1 },
  ],
  Torino: [
    { stagione: '2020/21', divisione: 'serie_a', posizione: 17 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 10 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 10 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 9 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 11 },
  ],
  Udinese: [
    { stagione: '2020/21', divisione: 'serie_a', posizione: 14 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 12 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 12 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 15 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 12 },
  ],

  // ---------- Serie B (rosa 2025/26) ----------
  Bari: [
    { stagione: '2022/23', divisione: 'serie_b', posizione: 3 },
    { stagione: '2023/24', divisione: 'serie_b', posizione: 17 },
    { stagione: '2024/25', divisione: 'serie_b', posizione: 9 },
  ],
  Catanzaro: [
    { stagione: '2023/24', divisione: 'serie_b', posizione: 5 },
    { stagione: '2024/25', divisione: 'serie_b', posizione: 6 },
  ],
  Carrarese: [
    { stagione: '2024/25', divisione: 'serie_b', posizione: 12 },
  ],
  Cesena: [
    { stagione: '2024/25', divisione: 'serie_b', posizione: 7 },
  ],
  Empoli: [
    { stagione: '2020/21', divisione: 'serie_b', posizione: 1 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 14 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 14 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 17 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 18 },
  ],
  Frosinone: [
    { stagione: '2020/21', divisione: 'serie_b', posizione: 10 },
    { stagione: '2021/22', divisione: 'serie_b', posizione: 9 },
    { stagione: '2022/23', divisione: 'serie_b', posizione: 1 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 18 },
    { stagione: '2024/25', divisione: 'serie_b', posizione: 15 },
  ],
  'Juve Stabia': [
    { stagione: '2024/25', divisione: 'serie_b', posizione: 5 },
  ],
  Mantova: [
    { stagione: '2024/25', divisione: 'serie_b', posizione: 13 },
  ],
  Modena: [
    { stagione: '2022/23', divisione: 'serie_b', posizione: 10 },
    { stagione: '2023/24', divisione: 'serie_b', posizione: 10 },
    { stagione: '2024/25', divisione: 'serie_b', posizione: 11 },
  ],
  Monza: [
    { stagione: '2020/21', divisione: 'serie_b', posizione: 3 },
    { stagione: '2021/22', divisione: 'serie_b', posizione: 4 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 11 },
    { stagione: '2023/24', divisione: 'serie_a', posizione: 12 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 20 },
  ],
  Palermo: [
    { stagione: '2022/23', divisione: 'serie_b', posizione: 9 },
    { stagione: '2023/24', divisione: 'serie_b', posizione: 6 },
    { stagione: '2024/25', divisione: 'serie_b', posizione: 8 },
  ],
  Pescara: [
    { stagione: '2020/21', divisione: 'serie_b', posizione: 19 },
  ],
  Reggiana: [
    { stagione: '2020/21', divisione: 'serie_b', posizione: 18 },
    { stagione: '2023/24', divisione: 'serie_b', posizione: 11 },
    { stagione: '2024/25', divisione: 'serie_b', posizione: 14 },
  ],
  Sampdoria: [
    { stagione: '2020/21', divisione: 'serie_a', posizione: 9 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 15 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 20 },
    { stagione: '2023/24', divisione: 'serie_b', posizione: 7 },
    { stagione: '2024/25', divisione: 'serie_b', posizione: 17 },
  ],
  Spezia: [
    { stagione: '2020/21', divisione: 'serie_a', posizione: 15 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 16 },
    { stagione: '2022/23', divisione: 'serie_a', posizione: 17 },
    { stagione: '2023/24', divisione: 'serie_b', posizione: 15 },
    { stagione: '2024/25', divisione: 'serie_b', posizione: 3 },
  ],
  'Südtirol': [
    { stagione: '2022/23', divisione: 'serie_b', posizione: 6 },
    { stagione: '2023/24', divisione: 'serie_b', posizione: 12 },
    { stagione: '2024/25', divisione: 'serie_b', posizione: 10 },
  ],
  Venezia: [
    { stagione: '2020/21', divisione: 'serie_b', posizione: 5 },
    { stagione: '2021/22', divisione: 'serie_a', posizione: 20 },
    { stagione: '2022/23', divisione: 'serie_b', posizione: 8 },
    { stagione: '2023/24', divisione: 'serie_b', posizione: 3 },
    { stagione: '2024/25', divisione: 'serie_a', posizione: 19 },
  ],
  'Virtus Entella': [
    { stagione: '2020/21', divisione: 'serie_b', posizione: 20 },
  ],
  // Avellino, Padova: nessuna stagione in A/B nella finestra 2020/21-2024/25
  // (Serie C) → rating dal solo roster.
};
