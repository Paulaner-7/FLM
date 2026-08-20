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

// ---------- Referto da screenshot: voti, bonus, fiducia (PRD 7.4) ----------
// Decisioni concordate con l'utente (revisione): i voti PES/FL26 vanno da 5.0 a
// 10.0 a passi di 0.5 (verificato: 6.0-6.5 = normale, 7+ richiede gol/assist,
// 10.0 = hat-trick o portiere strepitoso). deltaForma lineare col punto neutro
// 6.5, moltiplicatore ASIMMETRICO: sotto il neutro pesa 1.5× (un disastro costa
// più di quanto una bella gara renda). Il tap manuale "prestazione eccezionale"
// resta = +10, equivalente a voto 9.0 con questa formula.

/** Voto neutro: nessun effetto sulla forma */
export const VOTO_NEUTRO = 6.5;
/** Moltiplicatore del delta forma sopra il neutro (voto 9.0 → +10) */
export const K_VOTO_SU = 4;
/** Moltiplicatore del delta forma sotto il neutro (penalità 1.5×: voto 5.0 → −9) */
export const K_VOTO_GIU = 6;
/** Bonus forma per gol segnato (tap manuale o screenshot) */
export const BONUS_FORMA_GOL = 3;
/** Bonus forma per assist (solo da screenshot) */
export const BONUS_FORMA_ASSIST = 2;
/** Cap del delta forma per giocatore per partita (voto + bonus, mai oltre) */
export const CAP_FORMA_PARTITA = 15;
/** Δ fiducia del giocatore per i minuti: titolare (90') */
export const FIDUCIA_MINUTI_TITOLARE = 1;
/** Δ fiducia del giocatore per i minuti: non titolare (0', infortunati esenti) */
export const FIDUCIA_MINUTI_PANCHINA = -1;

// ---------- Forma UNIFICATA (morale + fiducia + prestazione → forma → overall) ----------
// Realismo: voto Gazzetta 6.5 = sufficienza, gol/assist/cartellini impattano.
// Verifiche calcio reale (2024/25 Serie A: voto medio 6.0-6.5, hat-trick = 8-10,
// rosso = crollo). Pesi bilanciati: prestazione domina (50%), morale 30%,
// fiducia 20%. Inerzia 68% evita oscillazioni rotte: servono 3-4 gare per
// scalare da 50 a 75, come in FM e nei dati reali di forma.
/** Peso morale nel composite forma */
export const FORMA_PESO_MORALE = 0.3;
/** Peso fiducia nel composite */
export const FORMA_PESO_FIDUCIA = 0.2;
/** Peso prestazione nel composite */
export const FORMA_PESO_PRESTAZIONE = 0.5;
/** Inerzia forma: peso forma vecchia (1 - peso composite) */
export const FORMA_INERZIA = 0.68;
/** Peso composite nella nuova forma */
export const FORMA_PESO_NUOVO = 0.32;
/** Score fittizio panchinaro (nessun voto, ritmo perso) */
export const FORMA_PANCHINA_SCORE = 35;
/** Pendenza voto → score: (voto-6.5)*20 (5.0→20, 6.5→50, 8→80, 9→100) */
export const FORMA_VOTO_SLOPE = 20;
/** Bonus forma per gol: per-gol, cap 16 (2 gol) */
export const FORMA_GOL_BONUS = 8;
export const FORMA_GOL_CAP = 16;
/** Bonus assist */
export const FORMA_ASSIST_BONUS = 6;
export const FORMA_ASSIST_CAP = 12;
/** Malus cartellini */
export const FORMA_GIALLO_MALUS = 10;
export const FORMA_ROSSO_MALUS = 28;
/** Decay forma per settimana da infortunato */
export const FORMA_DECAY_INFORTUNIO = 1;
/** Bonus porta inviolata (portiere/difensore titolare) */
export const FORMA_CLEAN_SHEET_BONUS = 5;
/** Divisore overall effettivo: (forma-50)/12 → ±4 (50=0, 74=+2, 98=+4, 26=-2) */
export const FORMA_OVERALL_DIVISORE = 12;
export const FORMA_OVERALL_MAX = 4;
export const FORMA_OVERALL_MIN = -4;

// ---------- Classifica (regola Serie A reale, Wikipedia "Serie A" — criteri ufficiali) ----------

export const PUNTI_VITTORIA = 3;
export const PUNTI_PAREGGIO = 1;
export const PUNTI_SCONFITTA = 0;

// ---------- Mercato (PRD 7.3, decisioni utente M4) ----------
// Fonti verificate (docs/verifica-web.md, agosto 2026): Transfermarkt finestre
// estive 2025/26 top-5 ≈ 1.870 arrivi (Premier 414, Serie A 314, LaLiga 361,
// Ligue 1 351, Bundesliga 431) → ≈19 a club a finestra (metà definitivi).
// Il nostro mondo è più piccolo (30 giorni vs 60, solo definitivi, ~600 club):
// volume target estivo 240-360 (8-12/giorno), inverno ~40%.

/** Finestra estiva: settimane 1-9 (1 lug - 31 ago, date reali 2026/27) */
export const FINESTRA_ESTATE = { da: 1, a: 9 } as const;
/** Finestra invernale: settimane 27-31 (1 - 31 gen, date reali 2026/27) */
export const FINESTRA_INVERNO = { da: 27, a: 31 } as const;
/** Durata della finestra in giorni di mercato (decisione utente: 30 giorni) */
export const GIORNI_FINESTRA = 30;
/** Volume target movimenti per finestra estiva (decisione utente Q5b) */
export const VOLUME_ESTIVO_MIN = 240;
export const VOLUME_ESTIVO_MAX = 360;
/** Volume invernale = frazione dell'estivo */
export const VOLUME_INVERNO_FRAZIONE = 0.4;
/** Movimenti CPU al giorno (derivati dal volume) */
export const MOVIMENTI_GIORNO_MIN = 8;
export const MOVIMENTI_GIORNO_MAX = 12;
/** Notizie LLM di mercato al giorno (top-5 filtrate) */
export const NOTIZIE_MERCATO_GIORNO = 3;
/** Cifra minima (€) per una notizia "interessante" (top-5, decisione Q5b) */
export const NOTIZIA_MERCATO_CIFRA_MIN = 10_000_000;
/** Overall minimo per una notizia "interessante" (top-5) */
export const NOTIZIA_MERCATO_OVERALL_MIN = 78;
/** Numero massimo di notizie LLM per finestra (PRD 4.4: 4-8 chiamate) */
export const NOTIZIE_MERCATO_MAX = 8;

// ---------- Trattative (PRD 7.3, decisioni Q7: max 4 giri, FM-verified) ----------

/** Giri massimi di trattativa (verificato FM: la volontà limita i giri, in pratica 2-4) */
export const GIORNI_GIRO_CPU = 4;
/** Offerta iniziale consigliata: 80% del valore (FM26: 20-30% sotto) */
export const OFFERTA_INIZIALE_FATTORE = 0.8;
/** Concessione CPU a ogni giro: 25% del gap */
export const CONCESSIONE_FATTORE = 0.25;
/** Soglia CPU: accetta se offerta ≥ valore × [0.9, 1.1] */
export const SOGLIA_CPU_MIN = 0.9;
export const SOGLIA_CPU_MAX = 1.1;
/** Tetto CPU per vendita: accetta richieste ≤ valore × 1.4 */
export const TETTO_CPU = 1.4;
/** Scadenza offerta in entrata: 4 giorni di mercato (decisione Q6) */
export const GIORNI_SCADENZA_OFFERTA = 4;
/** Offerte in entrata per finestra (decisione Q6: 3-5 estate, 1-3 gennaio) */
export const OFFERTE_ENTRATA_ESTATE = { min: 3, max: 5 } as const;
export const OFFERTE_ENTRATA_INVERNO = { min: 1, max: 3 } as const;
/** Max 1 offerta in entrata al giorno */
export const OFFERTE_ENTRATA_MAX_GIORNO = 1;
/** Deadline day: offerta lampo (50%, prezzo premium 1.15-1.3×) */
export const OFFERTA_LAMPO_PROBABILITA = 0.5;
export const OFFERTA_LAMPO_FATTORE_MIN = 1.15;
export const OFFERTA_LAMPO_FATTORE_MAX = 1.3;
/** Requisiti offerte in entrata */
export const VALORE_MIN_OFFERTA = 2_000_000;
export const ETA_MAX_VENDITA = 32;
/** Giocatori venduti da un club CPU in un anno (realismo: 2-3 definitivi a club) */
export const MAX_GIOCATORI_VENDITA_ANNO = 3;

// ---------- Contratti (decisione Q1/Q7: scadenza + ingaggio ancorato al valore) ----------

/** Ingaggio annuo = 5% del valore di mercato (PRD 7.3: ancorato, non negoziato) */
export const INGAGGIO_FATTORE = 0.05;
/** Anni di contratto alla firma (trasferimento o svincolato) */
export const ANNI_CONTRATTO = 3;
/** Scadenza di default al bootstrap: 2-4 anni dalla stagione corrente */
export const CONTRATTO_DEFAULT_MIN = 2;
export const CONTRATTO_DEFAULT_MAX = 4;

// ---------- Effetti cessioni eccellenti (decisione Q8, bound ±5 risultati/±10 eventi) ----------

/** Vendita di un leader: morale −4 a tutti, tifosi −5 (peso leader 1.5× già in regola) */
export const CESSIONE_LEADER_MORALE = -4;
export const CESSIONE_LEADER_TIFOSI = -5;
/** Vendita di un titolare fisso (≥70% presenze): −2 morale, −2 tifosi */
export const CESSIONE_TITOLARE_MORALE = -2;
export const CESSIONE_TITOLARE_TIFOSI = -2;
/** Acquisto top (overall ≥ media rosa + scarto): +3 morale, +3 tifosi */
export const ACQUISTO_TOP_MORALE = 3;
export const ACQUISTO_TOP_TIFOSI = 3;
/** Scarto overall per considerare un acquisto "top" */
export const ACQUISTO_TOP_SCARTO = 3;

// ---------- Svincolati (decisione Q11: fine stagione, cifra zero, niente pre-contract) ----------

/** Età minima per il ritiro automatico degli svincolati non firmati (fuori scope M4: solo avviso) */
export const ETA_RITIRO = 37;

// ---------- Vivaio (PRD 7.5, decisioni utente intervista) ----------
// Modello concordato: intake annuale al rollover, 1 prospetto per OGNI club reale
// (la squadra utente è come le altre), rigenerati 1:1 coi ritiri, mondo che
// invecchia +1 anno, nomi SOLO LLM (intake all-or-nothing, avviso + riprova),
// crescita non garantita (soffitto reale < potenziale), code di distribuzione
// (annata di svolta / crollo), export completo coordinato 151 colonne.

/** Età dei prospetti normali dell'intake */
export const INTAKE_ETA_MIN = 16;
export const INTAKE_ETA_MAX = 18;
/** Età fissa dei rigenerati (PRD: "sedicenne") */
export const REGEN_ETA = 16;

/** Overall iniziale: 48 + (reputazione − 35) × 0.3 ± varianza (club piccoli ~48-56, top ~58-68) */
export const INTAKE_OVERALL_BASE = 48;
export const INTAKE_OVERALL_REP_OFFSET = 35;
export const INTAKE_OVERALL_REP_FATTORE = 0.3;
export const INTAKE_OVERALL_VARIANZA = 4;
/** Probabilità "gemma" (potenziale 85-92) a prescindere dalla reputazione */
export const PROB_GEMMA = 0.09;
export const GEMMA_POTENZIALE_MIN = 85;
export const GEMMA_POTENZIALE_MAX = 92;
/** Probabilità "flop" (potenziale 68-74) anche nei top club */
export const PROB_FLOP = 0.12;
export const FLOP_POTENZIALE_MAX = 74;

/** Potenziale nascosto: fascia normale (correlata all'overall iniziale) */
export const POTENZIALE_MIN = 68;
export const POTENZIALE_MAX = 92;
/** Il soffitto reale è potenziale × [0.85, 1.05]: molti non arrivano al pieno potenziale */
export const SOFFITTO_MIN_FATTORE = 0.85;
export const SOFFITTO_MAX_FATTORE = 1.05;

/** Nazionalità prospetti: paese del club con piccola quota stranieri (vivai reali) */
export const PROB_NAZIONE_CLUB = 0.87;

// Rigenerati: nazionalità casuale pesata (decisione utente)
/** Top 5 nazioni (vivai più forti, più presenti nel DB FL26) */
export const REGEN_NAZIONI_TOP5 = ['Brasile', 'Argentina', 'Francia', 'Spagna', 'Italia'] as const;
export const REGEN_PROB_TOP5 = 0.55;
/** Altre nazioni europee */
export const REGEN_NAZIONI_EUROPA = [
  'Inghilterra', 'Germania', 'Portogallo', 'Paesi Bassi', 'Belgio', 'Croazia', 'Serbia',
  'Ucraina', 'Turchia', 'Polonia', 'Danimarca', 'Svezia', 'Norvegia', 'Svizzera', 'Austria',
  'Scozia', 'Romania', 'Grecia', 'Repubblica Ceca', 'Ungheria', 'Russia', 'Slovacchia',
  'Slovenia', 'Bosnia ed Erzegovina', 'Galles', 'Irlanda', 'Islanda', 'Finlandia', 'Albania',
  'Montenegro', 'Macedonia del Nord', 'Kosovo', 'Georgia', 'Armenia', 'Azerbaigian',
] as const;
export const REGEN_PROB_EUROPA = 0.3;

// Ritiri (tabella concordata: probabilità per età × modificatore condizione)
/** Probabilità base di ritiro per età */
export const RITIRO_PROB_PER_ETA: Readonly<Record<number, number>> = {
  33: 0.08, 34: 0.18, 35: 0.32, 36: 0.5, 37: 0.7, 38: 0.88,
};
/** Sopra quest'età la probabilità resta quella di 38 (88%) */
export const RITIRO_ETA_CAP = 38;
/** Modificatore condizione: forma sotto la soglia → più probabile */
export const RITIRO_FORMA_BASSA_SOGLIA = 40;
export const RITIRO_FORMA_BASSA_FATTORE = 1.5;
/** Forma sopra la soglia → meno probabile */
export const RITIRO_FORMA_ALTA_SOGLIA = 70;
export const RITIRO_FORMA_ALTA_FATTORE = 0.7;
/** Un rigenerato arriva nel tuo intake con questa probabilità (se il ritirato era tuo) */
export const REGEN_TUO_INTAKE_PROB = 0.5;

// Crescita stagionale (minuti + età + potenziale + forma, con code di distribuzione)
/** Minuti sotto cui un giovane non cresce quasi (panchina in prestito) */
export const CRESCITA_MINUTI_MIN = 270;
/** Minuti oltre cui la crescita è piena (titolare fisso) */
export const CRESCITA_MINUTI_MAX = 1500;
/** Crescita base per anno al pieno potenziale (16-21 anni, minuti pieni) */
export const CRESCITA_MAX_ANNO = 6;
/** Età di picco crescita */
export const ETA_PICCO_CRESCITA = 17;
/** Oltre quest'età la crescita cala (curva) */
export const ETA_FINE_CRESCITA = 23;
/** Declino annuale oltre quest'età (base) */
export const ETA_INIZIO_DECLINO = 30;
export const DECLINO_MAX_ANNO = 2;
/** Probabilità annata di svolta (delta +5/+7) */
export const PROB_SVOLTA = 0.1;
export const SVOLTA_MIN = 5;
export const SVOLTA_MAX = 7;
/** Probabilità crollo (delta −4/−6) */
export const PROB_CROLLO = 0.08;
export const CROLLO_MIN = -6;
export const CROLLO_MAX = -4;
/** Cap del delta overall annuale per un giovane */
export const DELTA_ANNUO_CAP = 7;

// Verifica forma ogni 5 partite (decisione utente): media voti finestra → ±1 attributi chiave
/** Numero di voti nella finestra per scattare la verifica */
export const FORMA_FINESTRA_VOTI = 5;
/** Media voti sopra cui il giovane guadagna +1 sugli attributi chiave */
export const FORMA_FINESTRA_SU = 7.0;
/** Sotto cui perde −1 */
export const FORMA_FINESTRA_GIU = 5.5;
/** Attributi chiave toccati dalla verifica forma per ruolo */
export const FORMA_FINESTRA_ATTRIBUTI = 3;

// Prestiti (PRD 7.5, decisioni utente: tutti i giocatori, engine sceglie, mercato CPU completo)
/** Quota prestiti sui movimenti di mercato (calcio reale: ~1/3 dei trasferimenti) */
export const PRESTITI_QUOTA_MOVIMENTI = 0.3;
/** Minuti simulati da titolare al club di prestito (overall ≥ media rosa) */
export const PRESTITO_MINUTI_TITOLARE_MIN = 1500;
export const PRESTITO_MINUTI_TITOLARE_MAX = 2500;
/** Minuti simulati da panchina in prestito */
export const PRESTITO_MINUTI_PANCHINA_MIN = 300;
export const PRESTITO_MINUTI_PANCHINA_MAX = 900;
/** Il club di prestito deve avere rating inferiore a questo scarto rispetto al proprietario */
export const PRESTITO_RATING_SCARTO = 80;

// Export coordinato (decisione utente: un pacchetto, tutto il database giocatori)
/** Base PES ID per i giocatori creati in EDIT mode (vincolo editor, PRD 7.4) */
export const PES_ID_BASE = 2147483648;
/** Nome file CSV del pacchetto export */
export const EXPORT_PLAYERS_FILE = 'Players - FLM.csv';
export const EXPORT_ROSTER_FILE = 'Roster - FLM.csv';
export const EXPORT_ASSIGNMENTS_FILE = 'Teams-Players - FLM.csv';



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
  fiduciaGiocatori: number;
  fiduciaSocieta: number;
  fiduciaTifosi: number;
  reputazione: number;
}): {
  moraleGiocatori: number;
  fiduciaGiocatori: number;
  fiduciaSocieta: number;
  fiduciaTifosi: number;
  reputazione: number;
} {
  return {
    moraleGiocatori: clamp(proposti.moraleGiocatori, EFFETTO_EVENTO_MIN, EFFETTO_EVENTO_MAX),
    fiduciaGiocatori: clamp(proposti.fiduciaGiocatori, EFFETTO_EVENTO_MIN, EFFETTO_EVENTO_MAX),
    fiduciaSocieta: clamp(proposti.fiduciaSocieta, EFFETTO_EVENTO_MIN, EFFETTO_EVENTO_MAX),
    fiduciaTifosi: clamp(proposti.fiduciaTifosi, EFFETTO_EVENTO_MIN, EFFETTO_EVENTO_MAX),
    reputazione: clamp(proposti.reputazione, EFFETTO_EVENTO_MIN, EFFETTO_EVENTO_MAX),
  };
}

// ---------- Carriera lunga: reputazione, carosello, offerte (PRD 7.7) ----------
// Tarate dopo una stagione di prova (PRD 6.1).

/** Delta reputazione: obiettivo centrato */
export const REPUTAZIONE_OBIETTIVO_CENTRATO = 8;
/** Delta reputazione: campionato / UCL vinti */
export const REPUTAZIONE_TROFEO_MAGGIORE = 15;
/** Delta reputazione: UEL / UECL / Mondiale (da CT) */
export const REPUTAZIONE_TROFEO_MEDIORE = 10;
/** Delta reputazione: coppa nazionale */
export const REPUTAZIONE_TROFEO_MINORE = 5;
/** Delta reputazione: supercoppa */
export const REPUTAZIONE_SUPERCOPPA = 3;
/** Delta reputazione: Europeo (da CT) */
export const REPUTAZIONE_EUROPEO = 15;
/** Delta reputazione: over-achievement (range) */
export const REPUTAZIONE_OVER_ACHIEVEMENT = [2, 5] as const;
/** Delta reputazione: obiettivo fallito */
export const REPUTAZIONE_OBIETTIVO_FALLITO = -10;
/** Delta reputazione: retrocessione */
export const REPUTAZIONE_RETROCESSIONE = -20;
/** Penalty reputazione se esonerato */
export const REPUTAZIONE_PENALTY_ESONERO = -15;
/** Soglia reputazione per offerte volontarie */
export const SOGLIA_REPUTAZIONE_OFFERTE = 60;

/** Numero massimo di offerte volontarie */
export const OFFERTE_VOLONTARIE_MAX = 3;
/** Numero di offerte nella pool forzata (esonero) */
export const OFFERTE_FORZATE_COUNT = 4;
/** Soglia fiducia società per esonero (PRD 7.7) */// SOGLIA_FIDUCIA_ESONERO già definita sopra (= 20)

/** Percentuale di club CPU che cambiano allenatore nel carosello */
export const CAROSELLO_PERCENTUALE = 0.15;
/** Intervallo percentuale min-max del carosello */
export const CAROSELLO_RANGE = [0.10, 0.20] as const;

/** Numero massimo di riserve nella rosa CT */
export const ROSA_CT_TITOLARI = 23;
export const ROSA_CT_RISERVE = 7;

/** Banner backup: giorni trascorsi prima di mostrare l'avviso */
export const BACKUP_GIORNI_WARNING = 7;

