// FLM — Statistiche reali per la simulazione degli eventi giocatore (PRD 7.1 esteso).
//
// FONTI (regola 6): distribuzioni medie nei top campionati europei, valori pubblicati
// da Opta/FBref e ripresi dai riepiloghi stagionali (es. Premier League 2023/24-2025/26,
// Serie A 2024/25). Verifica web registrata in docs/verifica-web.md §14.
// Script di calibra consigliato: scripts/calibra-sim.ts esteso per confrontare le
// distribuzioni simulate con questi benchmark.
//
// Note di calibrazione:
// - Gol per ruolo: gli attaccanti segnano la quota dominante; media sui top-5
//   campionati ~65% attaccanti, ~27% centrocampisti, ~8% difensori (autogol esclusi).
// - Rigori: ~0,28 a partita nei top campionati; li tira quasi sempre un attaccante.
// - Gialli: ~2,1 a squadra a partita (Serie A 2024/25: ~4,4 totali/partita);
//   distribuzione per ruolo: centrocampisti > difensori > attaccanti.
// - Rossi: ~0,15 a squadra a partita (1 rosso ogni ~7 partite per squadra).
// - Assistenze: ~3 gol su 4 nascono da assist; gli assist arrivano soprattutto
//   da esterni/trequartisti (attaccanti e centrocampisti in quota simile).
// - Porta inviolata: ~25-30% delle partite finisce con clean sheet per una squadra.
// - Voti: media ~6,4 con deviazione ~0,7 (scala PES 1-10); bonus/pénalités reali
//   osservati: gol +0,5/1,0, assist +0,3/0,5, porta inviolata +0,5 (portieri/difensori),
//   giallo −0,2/0,3, rosso −1,0/1,5.

/** Pesi di marcatura per ruolo (sommano ~1; gli autogol sono a parte). */
export const PESI_GOL_RUOLO = {
  attaccante: 0.65,
  centrocampista: 0.27,
  difensore: 0.08,
} as const;

/** Probabilità che un gol sia un rigore (top-5 media reale ~0,11 per gol). */
export const PROB_RIGORE = 0.11;

/** Pesi di assist per ruolo (chi rifinisce: attaccanti e centrocampisti quasi pari). */
export const PESI_ASSIST_RUOLO = {
  attaccante: 0.42,
  centrocampista: 0.45,
  difensore: 0.13,
} as const;

/** Frazione di gol con assist (~3 su 4). */
export const FRAZIONE_GOL_CON_ASSIST = 0.75;

/** Gialli attesi per squadra per partita (~2,1 reale top-5). */
export const GIALLI_MEDIA_SQUADRA = 2.1;

/** Pesi giallo per ruolo (centrocampisti > difensori > attaccanti, reale). */
export const PESI_GIALLI_RUOLO = {
  centrocampista: 0.44,
  difensore: 0.36,
  attaccante: 0.2,
} as const;

/** Rossi attesi per squadra per partita (~0,15 reale). */
export const ROSSI_MEDIA_SQUADRA = 0.15;

/** Pesi rosso per ruolo (difensori e centrocampisti dominano, reale). */
export const PESI_ROSSI_RUOLO = {
  difensore: 0.45,
  centrocampista: 0.4,
  attaccante: 0.15,
} as const;

/** Probabilità di clean sheet per la squadra (quando subisce 0 gol è certo; qui la quota di 0-0 e 1-0). */
export const PROB_CLEAN_SHEET = 0.28;

// ---------- Voti (scala PES 1.0-10.0, passo 0.5) ----------

/** Voto medio di una partita (distribuzione reale centrata ~6,4). */
export const VOTO_MEDIO = 6.4;
/** Deviazione standard del voto base. */
export const VOTO_SIGMA = 0.7;
/** Voto minimo/massimo prodotti dal motore. */
export const VOTO_MIN = 4.0;
export const VOTO_MAX = 9.5;

/** Bonus/pénalités del voto (osservati nelle valutazioni reali). */
export const BONUS_VOTO = {
  gol: 0.7,
  assist: 0.4,
  cleanSheetPortiere: 0.8,
  cleanSheetDifensore: 0.4,
  giallo: -0.25,
  rosso: -1.2,
  rigoreParato: 0.6,
} as const;

/** Minuti tipici: titolare 90, subentrante ~20-35. */
export const MINUTI_TITOLARE = 90;
export const MINUTI_SUBENTRATO_MIN = 10;
export const MINUTI_SUBENTRATO_MAX = 40;

/**
 * Distribuzione dei minuti dei gol: più gol nella ripresa (reale ~55%),
 * picco tra il 60' e l'80' quando entrano i cambi.
 */
export const GOL_PRIMO_TEMPO = 0.45;
