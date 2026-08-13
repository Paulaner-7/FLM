// FLM — Regole deterministiche del gioco (PRD 3.1, 4.1, 6.1)
// Regola 3 AGENTS.md: classifica, morale, fiducia, budget e ogni numero di gioco
// sono calcolati SOLO qui, con funzioni pure. L'LLM produce solo testo e proposte.
// Costanti di bilanciamento centralizzate: si tarano qui dopo una stagione di prova (PRD 6.1).

import type { CategoriaEvento } from '../types/entities';

/** Intervallo degli indicatori di stato (morale, fiducia) 0-100 */
export const MIN_STATO = 0;
export const MAX_STATO = 100;

/** Effetti risultati sul morale (PRD 6.1: intervalli suggeriti ±5) */
export const EFFETTO_VITTORIA_MORALE = 5;
export const EFFETTO_PAREGGIO_MORALE = 0;
export const EFFETTO_SCONFITTA_MORALE = -5;

/** Limiti degli effetti proposti per un evento (PRD 4.2: tra -10 e +10) */
export const EFFETTO_EVENTO_MIN = -10;
export const EFFETTO_EVENTO_MAX = 10;

/** Soglia sotto cui lo spogliatoio è in crisi (PRD 3.2, modulo morale) */
export const SOGLIA_MORALE_CRISI = 30;

// ---------- Motore eventi (PRD 4.2/4.3/4.6) ----------
// Taratura concordata (revisione): le categorie rare (società, tifosi/media) sono
// riservate a situazioni estreme e cappate a MAX_EVENTI_RARI_STAGIONE a stagione
// (nel calcio reale: 2-4 momenti decisivi a stagione, mai rumore settimanale).
// Frequenza turno ridotta: 40% nessun evento, 50% uno, 10% due.

/** Probabilità di 0 eventi in un turno */
export const PROB_ZERO_EVENTI = 0.4;
/** Probabilità di 1 evento in un turno (dopo lo zero) */
export const PROB_UN_EVENTO = 0.5;
/** Massimo eventi-decisione per turno */
export const MAX_EVENTI_TURNO = 2;
/** Settimane consecutive con 2 eventi oltre cui si forza ≤1 (mai 3 di fila) */
export const MAX_CONSECUTIVI_DUE_EVENTI = 2;
/** Cooldown categoria: mai la stessa per più di N turni di fila (PRD 4.3) */
export const COOLDOWN_CATEGORIA_TURNI = 2;
/** Pesi di pesca per categoria (giocatore di gran lunga dominante) */
export const PESO_CATEGORIA_EVENTO: Record<CategoriaEvento, number> = {
  giocatore: 6,
  societa: 1,
  tifosi_media: 1,
};
/** Cap stagionale delle categorie rare (società, tifosi/media): mai oltre */
export const MAX_EVENTI_RARI_STAGIONE = 4;
/** Sotto questa fiducia la categoria rara "si sblocca" (situazione estrema) */
export const SOGLIA_FIDUCIA_CATEGORIA_RARA = 50;
/** Striscia negativa minima per sbloccare i tifosi/media (es. dopo 2 sconfitte) */
export const STRISCIA_NEGATIVA_CATEGORIA_RARA = 2;
/** Quota di stagione da cui parte lo sprint finale (fase nel prompt, PRD 4.3) */
export const QUOTA_SPRINT_FINALE = 0.75;
/** Soglia Jaccard oltre cui un evento è "troppo simile" all'archivio (PRD 4.2) */
export const SOGLIA_ANTI_RIPETIZIONE = 0.6;
/** Finestra di eventi passati confrontata per l'anti-ripetizione (PRD 4.3: 10-15) */
export const FINESTRA_ANTI_RIPETIZIONE = 15;
/** Un template fallback non viene ripescato per N settimane (PRD 4.6) */
export const FALLBACK_NO_RIPETI_SETTIMANE = 5;
/** Numero massimo di notizie del turno (PRD 4.2: 2-3) */
export const MAX_NOTIZIE = 3;
/** Minimo opzioni per evento (PRD 4.2: 2-4; sotto si scarta) */
export const OPZIONI_EVENTO_MIN = 2;
/** Massimo opzioni per evento (oltre si tronca) */
export const OPZIONI_EVENTO_MAX = 4;
/** Minuti stagionali sotto cui un giocatore è "panchinaro" per i candidati */
export const MINUTI_PANCHINARO = 270;
/** Overall minimo perché un giocatore entri nel pool "panchinaro" */
export const OVERALL_PANCHINARO = 74;
/** Max settimane di infortunio dichiarabili da un evento narrativo (PRD: effetti piccoli) */
export const MAX_SETTIMANE_INFORTUNIO_EVENTO = 4;
/** Settimane di infortunio standard per un evento narrativo senza durata esplicita */
export const SETTIMANE_INFORTUNIO_EVENTO = 2;

// ---------- Morale & spogliatoio (PRD 2.2, 3.2) ----------
// Bilanciamento derivato dal modello FM citato nel PRD 2.2 (FootballGPT):
// - morale settimanale ±5 (PRD 6.1: intervalli suggeriti) → 4-5 sconfitte di fila
//   da 50 = zona crisi: un mese e mezzo di disastri, realistico.
// - promessa tradita "distrugge fiducia e morale in pochi mesi": colpo duro su
//   fiducia (−12), moderato su morale (−6). Due tradite da 50 = 26: zona sfiducia.
// - mantenuta ricostruisce piano: ~8 promesse mantenute per 50→100 (una stagione).
// - rifiuto onesto costa poco (−2/−3): tradimento molto più di un no secco.

/** Malus per non titolare con promessa 'titolare' attiva (PRD 2.2: peso delle parole) */
export const PANCHINA_PROMESSO_MORALE = -2;
/** Bonus marcatore: FLAT se ≥1 gol, cumula con l'effetto risultato (no per-gol) */
export const BONUS_MARCATORE_MORALE = 2;
/** Promessa mantenuta */
export const PROMESSA_MANTENUTA_MORALE = 4;
export const PROMESSA_MANTENUTA_FIDUCIA = 6;
/** Promessa tradita */
export const PROMESSA_TRADITA_MORALE = -6;
export const PROMESSA_TRADITA_FIDUCIA = -12;
/** Rifiuto di una richiesta promessa (colloquio onesto) */
export const RIFIUTO_RICHIESTA_MORALE = -2;
export const RIFIUTO_RICHIESTA_FIDUCIA = -3;
/** Peso dei leader nella media spogliatoio (PRD 3.2: "effetto amplificato") */
export const LEADER_PESO_MORALE = 1.5;
/** Vincoli numero leader nello spogliatoio */
export const LEADER_MIN = 2;
export const LEADER_MAX = 3;
/** Fasce del morale spogliatoio (indicatore UI) */
export const FASCIA_SPOGLIATOIO_SERENO = 60;
export const FASCIA_SPOGLIATOIO_CRISI = 40;
/** Massimo promesse ATTIVE per giocatore (anti-spam) */
export const PROMESSE_MAX_ATTIVE = 2;
/** Preset promesse manuali (dettaglio giocatore) */
export const PROMESSA_PRESET_TITOLARE_SOGLIA = 50; // % presenze da titolare
/** Minuti richiesti per la promessa 'minuti' (5 turni × 90' = 450: una da titolare sì) */
export const PROMESSA_PRESET_MINUTI_SOGLIA = 450;
/** Durata standard di una promessa (turni) */
export const PROMESSA_DURATA_DEFAULT = 5;
/** Richieste dei giocatori (engine sceglie il candidato, LLM scrive il testo in M3) */
export const OVERALL_MIN_RICHIESTA = 75;
export const OVERALL_TITOLARE_RICHIESTA = 78;
/** Minuti attesi = partite giocate × 90 × fattore: sotto → candidato */
export const MINUTI_ATTESI_FATTORE_RICHIESTA = 0.6;
export const RICHIESTA_COOLDOWN_SETTIMANE = 8;
/** Un evento richiesta non deciso dopo N settimane = rifiuto implicito */
export const EVENTO_RICHIESTA_SCADENZA_SETTIMANE = 2;
/** Leader al bootstrap carriera (capitano + senatori: età e status, calcio reale) */
export const ETA_MIN_LEADER = 26;
export const NUM_LEADER = 3;

/** Soglia di fiducia società sotto cui scatta il rischio esonero (PRD 3.2, M2: solo avviso) */
export const SOGLIA_FIDUCIA_ESONERO = 20;

// ---------- Società, obiettivi & fiducia (PRD 3.2) ----------
// Bande di attesa dallo scarto di rating Elo (mio − avversario): vincente contro
// una squadra più forte vale più fiducia che contro una più debole (PRD 3.2).
// Bilanciamento PRD 6.1 (±5 risultati, ±10 eventi), verificato sul calcio reale:
// 6 sconfitte di fila da favorito portano la fiducia società da 70 a ~22 (zona
// esonero: un paio di mesi di disastri a un grande club); 10 vittorie da
// sfavorito a ~88 (la rimonta di fiducia è lenta).

/** Scarto Elo (mio − avversario) oltre cui la partita è da favorito/sfavorito */
export const SCARTO_ATTESA_ELO = 100;

/** Δ fiducia società per risultato (chiave = banda di attesa) */
export const FIDUCIA_SOCIETA_VITTORIA = { sfavorito: 6, equilibrio: 4, favorito: 2 } as const;
export const FIDUCIA_SOCIETA_PAREGGIO = { sfavorito: 2, equilibrio: 0, favorito: -2 } as const;
export const FIDUCIA_SOCIETA_SCONFITTA = { sfavorito: -2, equilibrio: -5, favorito: -8 } as const;

/** Δ fiducia tifosi per risultato (chiave = banda di attesa) */
export const FIDUCIA_TIFOSI_VITTORIA = { sfavorito: 5, equilibrio: 4, favorito: 3 } as const;
export const FIDUCIA_TIFOSI_PAREGGIO = { sfavorito: 1, equilibrio: 0, favorito: -1 } as const;
export const FIDUCIA_TIFOSI_SCONFITTA = { sfavorito: -1, equilibrio: -3, favorito: -5 } as const;

// I tifosi sono più sensibili delle società: soffrono di più le sconfitte in casa
// e le strisce (PRD 3.2). Da 65 iniziale: prima sconfitta in casa vs pari livello
// → 59; tre sconfitte casalinghe di fila → ~53; sei disastri casalinghi consecutivi
// → pavimento 0. L'alternanza di risultati tiene la piazza 50-70: volubile ma non isterica.

/** Penale extra per sconfitta in casa (i tifosi soffrono di più al proprio stadio) */
export const FIDUCIA_TIFOSI_SCONFITTA_CASA = -3;
/** Malus per striscia di sconfitte: −2 × (n−1), n = sconfitta consecutiva (cap −6) */
export const FIDUCIA_TIFOSI_STRISCIA_SCONFITTE = -2;
export const FIDUCIA_TIFOSI_STRISCIA_SCONFITTE_CAP = -6;
/** Bonus per striscia di vittorie: +1 × (n−2), n = vittoria consecutiva (cap +3) */
export const FIDUCIA_TIFOSI_STRISCIA_VITTORIE = 1;
export const FIDUCIA_TIFOSI_STRISCIA_VITTORIE_CAP = 3;

// ---------- Obiettivo stagionale: posizioni target (PRD 3.2) ----------
// Verificato sul calcio reale: titolo = 1°; zona coppe = 4 posti nelle leghe
// 16-18 (Champions League 3-4 posti), 6 nelle leghe 20+ (5 Champions + Europa);
// metà classifica = N/2; salvezza = N−3 (tre retrocessioni, come Serie A e Premier).

export const OBIETTIVO_TITOLO = 1;
/** Zona coppe per leghe piccole (N ≤ 18) */
export const OBIETTIVO_COPPE_LEGA_PICCOLA = 4;
/** Zona coppe per leghe grandi (N ≥ 20) */
export const OBIETTIVO_COPPE_LEGA_GRANDE = 6;
/** Retrocessioni per la salvezza (N − 3) */
export const OBIETTIVO_SALVEZZA_RETROCESSI = 3;

// ---------- Simulazione risultati CPU (PRD 3.2: rating Elo + varianza) ----------
// Calibrati sul calcio reale verificato (regola 6 AGENTS.md):
// - Media gol per partita nei top campionati europei: Serie A 2024/25 = 973 gol /
//   380 partite = 2.56 a partita (Wikipedia, stagione completa) → 1.28 per squadra.
// - Vantaggio casa storico ~0.3-0.5 gol a partita (dataset football-data.co.uk,
//   medie su decenni di campionati europei) → 0.35 netto, applicato in modo
//   SIMMETRICO (±0.175): così la media totale resta ancorata a 2.56 (un bonus
//   solo alla squadra in casa gonfiava la media a ~2.87, calibrazione corretta
//   con scripts/calibra-sim.ts contro la stagione reale 2024/25).
// - Scarto dal rating Elo: 1 punto = 1/350 di gol attesi (tarato con
//   calibra-sim.ts: spread finale ~61 punti vs 64 reali).

/** Gol attesi base per squadra in una partita (metà della media reale ~2.56) */
export const GOL_MEDIA_SQUADRA = 1.28;
/** Vantaggio casa NETTO in gol attesi (applicato ±metà in casa/trasferta) */
export const VANTAGGIO_CASA_GOL = 0.35;
/** Divisore dello scarto rating → gol attesi (Δ/350) */
export const DIVISORE_SCARTO_RATING = 350;

// ---------- Forma (momentum settimanale, PRD 3.2: cluster in classifica) ----------
// Una squadra su una striscia positiva gioca con un bonus di rating effettivo
// (e viceversa in crisi): crea i cluster tipici dei campionati reali (gruppi che
// si staccano e si ricompattano). Tarato con calibra-sim.ts: ±10 per risultato
// consecutivo, cap ±50 (~+1.5 livelli di forza al massimo).

/** Bonus di rating per vittoria/sconfitta consecutiva (0 = disattivo) */
export const BONUS_FORMA_STREAK = 10;
/** Cap del bonus forma (positivo e negativo) */
export const CAP_FORMA_STREAK = 50;

// ---------- Variabilità tra stagioni (calibra-sim.ts, ultimi 10 anni Serie A) ----------
// Due leve per riprodurre le stagioni reali (campione 82-95, gap 1ª-2ª 1-19,
// ultima 17-25):
// 1. SCARTO_STAGIONALE: ogni squadra rende ±40 di rating per stagione (seme
//    deterministico carriera+stagione+squadra) — modella il "quest'anno rendiamo
//    più/meno dell'overall" (mercato, allenatore, infortuni).
// 2. REVERSIONE_DRIFT: dentro la stagione solo metà della deriva Elo conta per
//    la simulazione (l'altra metà è rumore che rientra): evita le stagioni
//    irreali da 100+ punti del campione.

/** Scostamento stagionale massimo per squadra (0 = disattivo) */
export const SCARTO_STAGIONALE = 40;
/** Frazione della deriva Elo intra-stagione che conta per la sim (1 = tutta) */
export const REVERSIONE_DRIFT = 0.5;

// ---------- Rating iniziale dallo storico reale (src/engine/storico.ts) ----------
// La posizione finale si converte in rating: 1500 + (10.5 − pos) × PUNTI_POSIZIONE.
// Taratura: campione di A ≈ 1671, 20° di A ≈ 1330, campione di B ≈ 1411.

/** Punti Elo per posizione di classifica (18 = spread ~340 tra 1° e 20° di A) */
export const PUNTI_POSIZIONE_RATING = 18;
/** Sconto per la seconda divisione (campione di B ≈ 15° di A) */
export const OFFSET_SECONDA_DIVISIONE = 260;
/** Peso dello storico nel rating iniziale completo (1 − peso = rosa attuale) */
export const PESO_RATING_STORICO = 0.5;

// ---------- Referto (PRD 3.3) ----------

/** Minuti stagionali attribuiti a ogni titolare per partita giocata (90', recupero non contato) */
export const MINUTI_PARTITA = 90;
/** Settimane di infortunio registrato nel referto (infortunio breve, costante regolabile) */
export const SETTIMANE_INFORTUNIO = 2;
/** Bonus forma per prestazione eccezionale registrata nel referto (clamp 0-100) */
export const BONUS_FORMA_PRESTAZIONE = 10;

// ---------- Classifica (regola Serie A reale, Wikipedia "Serie A" — criteri ufficiali) ----------

export const PUNTI_VITTORIA = 3;
export const PUNTI_PAREGGIO = 1;
export const PUNTI_SCONFITTA = 0;

// ---------- Stato iniziale di una nuova carriera (flusso "Nuova Carriera") ----------
// Fissati con l'utente: fiducia società 70, budget dalla reputazione squadra.

/** Fiducia società iniziale alla creazione della carriera */
export const FIDUCIA_SOCIETA_INIZIALE = 70;
/** Fiducia tifosi iniziale (tiepidi ma non ostili) */
export const FIDUCIA_TIFOSI_INIZIALE = 65;
/** Reputazione allenatore iniziale (mezza classifica, cresce coi risultati) */
export const REPUTAZIONE_ALLENATORE_INIZIALE = 50;
/** Prima settimana di gioco */
export const SETTIMANA_INIZIALE = 1;


// ---------- Budget iniziale: budget = round(rep³ / 6000) × fattore lega ----------
// Calibrato sui budget reali delle principali squadre europee (finestra 2025/26):
// City ~250M, PSG ~180M, Arsenal ~160M, Bayern ~150M, Real ~130M, Inter ~100M,
// Juve/Milan ~80-90M, Atletico/Dortmund/OM ~90M, medio PL ~40-60M,
// piccolo Serie A ~10-20M, top Serie B ~5-10M, Championship medio ~10-20M.
// Costanti centralizzate: si tarano dopo una stagione di prova (PRD 6.1).

export const BUDGET_BASE_DIVISORE = 6000;
export const BUDGET_MIN = 1_000_000;
export const BUDGET_MAX = 300_000_000;

/**
 * Fattore ricchezza per campionato (a parità di reputazione la Premier paga
 * più della Liga). Match sul nome del campionato (colonna CSV `League` o
 * dataset curato src/data/leagues.ts): primo pattern che matcha vince.
 */
export const FATTORI_BUDGET_LEGA: ReadonlyArray<{ pattern: RegExp; fattore: number }> = [
  { pattern: /premier\s*league/i, fattore: 1.6 },
  { pattern: /ligue\s*1/i, fattore: 1.3 },
  { pattern: /serie\s*a/i, fattore: 1.1 },
  { pattern: /liga/i, fattore: 1.1 },
  { pattern: /bundesliga/i, fattore: 1.1 },
  { pattern: /championship|serie\s*b|2\.?\s*bundesliga|ligue\s*2|segunda/i, fattore: 0.35 },
  { pattern: /first\s*league|1\.\s*lig|eerste|liga\s*portugal\s*2|challenger|challenge\s*league/i, fattore: 0.35 },
];

/** Fattore default per campionati non riconosciuti (es. lega demo) */
export const FATTORE_BUDGET_DEFAULT = 1.0;

/** Limita un valore all'intervallo [min, max] */
export function clamp(valore: number, min: number = MIN_STATO, max: number = MAX_STATO): number {
  return Math.min(max, Math.max(min, valore));
}

/** Limita un valore a un passo discreto (es. morale intero 0-100) */
export function arrotonda(valore: number): number {
  return Math.round(valore);
}

/**
 * Valida e limita gli effetti PROPOSTI (dall'LLM o da tabelle di fallback) prima
 * che vengano applicati allo stato (PRD 4.1: "il game engine valida il JSON, fissa
 * gli effetti dentro i limiti ammessi (clamp), li applica allo stato").
 */
export function validaEffetti(proposti: {
  moraleGiocatori: number;
  fiduciaSocieta: number;
  fiduciaTifosi: number;
  reputazione: number;
}): {
  moraleGiocatori: number;
  fiduciaSocieta: number;
  fiduciaTifosi: number;
  reputazione: number;
} {
  return {
    moraleGiocatori: clamp(proposti.moraleGiocatori, EFFETTO_EVENTO_MIN, EFFETTO_EVENTO_MAX),
    fiduciaSocieta: clamp(proposti.fiduciaSocieta, EFFETTO_EVENTO_MIN, EFFETTO_EVENTO_MAX),
    fiduciaTifosi: clamp(proposti.fiduciaTifosi, EFFETTO_EVENTO_MIN, EFFETTO_EVENTO_MAX),
    reputazione: clamp(proposti.reputazione, EFFETTO_EVENTO_MIN, EFFETTO_EVENTO_MAX),
  };
}
