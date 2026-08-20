// FLM — Attributi PES: template per ruolo, generazione e crescita (PRD 7.5).
// Regola 3 AGENTS.md: funzioni PURE e deterministiche (PRNG seminato).
// Pattern VERIFICATI sul CSV reale (docs/Players - PES 2021 - Edit.csv):
// - POS: 0=GK, 1=CB, 2=LB, 3=RB, 4=DMF, 5=CMF, 6=LMF, 7=RMF, 8=AMF, 9=LWF,
//   10=RWF, 11=SS, 12=CF; proficiency posizioni 0-2 (2 = registrato).
// - Skill 40-99; media skill dei 15-18enni nel DB: 61.
// - PlayingStyle 0-21; WeakFoot 1-4; Form 1-8; InjuryResistance 1-3;
//   Reputation 1-8; CornerKicks 1-10; FreeKicks 1-20; PenaltyKick 1-7;
//   DribblingHunching 1-5; DribblingArmMove 1-10; RunningHunching 1-6;
//   RunningArmMovement 1-10; PlayingAttitude/DribbleMotion sempre 0;
//   Hand/Legend sempre False; Value2 sempre 0 (changelog v0.12).
// L'editor ricalcola l'overall con formula propria: i template mirano alla
// media pesata per posizione (approssimazione formula PES 2021), tolleranza
// ±1-2 punti da calibrare al primo import reale (decisione utente).

import type { AttributiPes } from '../types/entities';
import { prng } from './random';
import {
  FORMA_FINESTRA_ATTRIBUTI,
  PES_ID_BASE,
  SOFFITTO_MAX_FATTORE,
  SOFFITTO_MIN_FATTORE,
} from './rules';

/** Le 13 posizioni PES (ordine = codici POS) */
export const POSIZIONI_PES = [
  'portiere', 'difensore centrale', 'terzino sinistro', 'terzino destro', 'mediano',
  'centrocampista centrale', 'esterno sinistro', 'esterno destro', 'trequartista',
  'ala sinistra', 'ala destra', 'seconda punta', 'centravanti',
] as const;

/** Nome italiano della posizione dal codice POS */
export function nomePosizionePes(pos: number): string {
  return POSIZIONI_PES[pos] ?? 'centrocampista';
}

/** Categoria FLM (ruolo su Giocatore) dalla posizione PES */
export function categoriaDaPos(pos: number): string {
  if (pos === 0) return 'portiere';
  if (pos >= 1 && pos <= 4) return 'difensore';
  if (pos >= 5 && pos <= 8) return 'centrocampista';
  return 'attaccante';
}

/** Posizioni PES candidate per categoria FLM (per i rigenerati che non hanno attributi) */
export const POS_PER_CATEGORIA: Readonly<Record<string, readonly number[]>> = {
  portiere: [0],
  difensore: [1, 2, 3, 4],
  centrocampista: [5, 6, 7, 8],
  attaccante: [9, 10, 11, 12],
};

/**
 * Pesi per il calcolo dell'overall (approssimazione formula PES 2021 per posizione).
 * Le 25 skill: OffensiveAwareness, BallControl, Dribbling, TightPossession, LowPass,
 * LoftedPass, Finishing, Heading, PlaceKicking, Curl, Speed, Acceleration,
 * KickingPower, Jump, PhysicalContact, Balance, Stamina, DefensiveAwareness,
 * BallWinning, Aggression, GKAwareness, GKCatching, GKClearing, GKReflexes, GKReach.
 * Pesi 0-3: 3 = decisivo per la posizione, 1 = utile, 0 = irrilevante.
 */
const PESI_OVERALL: Readonly<Record<number, readonly number[]>> = {
  // GK: le 5 skill da portiere pesano 3, le altre 1 (le skill di movimento contano poco)
  0: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 3],
  1: [1, 1, 1, 1, 2, 2, 1, 2, 1, 1, 2, 1, 1, 2, 3, 1, 2, 3, 3, 2, 0, 0, 0, 0, 0], // CB
  2: [1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 3, 2, 1, 1, 2, 2, 3, 2, 2, 2, 0, 0, 0, 0, 0], // LB
  3: [1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 3, 2, 1, 1, 2, 2, 3, 2, 2, 2, 0, 0, 0, 0, 0], // RB
  4: [1, 2, 1, 2, 3, 3, 1, 1, 1, 1, 2, 1, 2, 1, 3, 2, 3, 3, 3, 2, 0, 0, 0, 0, 0], // DMF
  5: [2, 3, 2, 3, 3, 3, 1, 1, 1, 2, 2, 2, 2, 1, 2, 2, 3, 2, 2, 2, 0, 0, 0, 0, 0], // CMF
  6: [2, 2, 3, 3, 3, 3, 1, 1, 1, 2, 3, 3, 2, 1, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0], // LMF
  7: [2, 2, 3, 3, 3, 3, 1, 1, 1, 2, 3, 3, 2, 1, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0], // RMF
  8: [3, 3, 3, 3, 3, 2, 2, 1, 2, 2, 2, 2, 2, 1, 1, 3, 2, 1, 1, 1, 0, 0, 0, 0, 0], // AMF
  9: [3, 3, 3, 3, 2, 2, 2, 1, 1, 2, 3, 3, 2, 1, 1, 3, 2, 1, 1, 1, 0, 0, 0, 0, 0], // LWF
  10: [3, 3, 3, 3, 2, 2, 2, 1, 1, 2, 3, 3, 2, 1, 1, 3, 2, 1, 1, 1, 0, 0, 0, 0, 0], // RWF
  11: [3, 3, 3, 3, 2, 2, 3, 1, 2, 2, 2, 2, 2, 1, 1, 2, 2, 1, 1, 1, 0, 0, 0, 0, 0], // SS
  12: [3, 3, 3, 3, 2, 2, 3, 2, 1, 2, 2, 2, 3, 2, 2, 2, 2, 1, 1, 2, 0, 0, 0, 0, 0], // CF
};

/** Nomi delle 25 skill (indice = posizione nel vettore pesi) */
export const SKILL_NAMES = [
  'OffensiveAwareness', 'BallControl', 'Dribbling', 'TightPossession', 'LowPass',
  'LoftedPass', 'Finishing', 'Heading', 'PlaceKicking', 'Curl', 'Speed', 'Acceleration',
  'KickingPower', 'Jump', 'PhysicalContact', 'Balance', 'Stamina', 'DefensiveAwareness',
  'BallWinning', 'Aggression', 'GKAwareness', 'GKCatching', 'GKClearing', 'GKReflexes', 'GKReach',
] as const;

/** Legge una skill per nome dall'oggetto AttributiPes */
export function skillDaNome(a: AttributiPes, nome: string): number {
  return (a as unknown as Record<string, number>)[nome] ?? 50;
}

/** Scrive una skill per nome */
export function scriviSkill(a: AttributiPes, nome: string, valore: number): void {
  (a as unknown as Record<string, number>)[nome] = valore;
}

/** Clamp attributo al range PES 40-99 */
export function clampSkill(v: number): number {
  return Math.min(99, Math.max(40, Math.round(v)));
}

/**
 * Overall approssimato dalla media pesata per posizione (formula PES 2021,
 * approssimazione: l'editor usa una formula propria, tolleranza ±1-2).
 */
export function overallDaAttributi(a: AttributiPes, pos: number): number {
  const pesi = PESI_OVERALL[pos] ?? PESI_OVERALL[5]!;
  let somma = 0;
  let peso = 0;
  for (let i = 0; i < SKILL_NAMES.length; i++) {
    const p = pesi[i]!;
    if (p === 0) continue;
    somma += skillDaNome(a, SKILL_NAMES[i]!) * p;
    peso += p;
  }
  return peso === 0 ? 50 : Math.round(somma / peso);
}

/** Profilo base per posizione: media e deviazione tipica delle skill (verificato su calcio reale) */
interface ProfiloSkill {
  media: number;
  dev: number;
}

/** Template per posizione: skill decisive alte, irrilevanti basse (40). */
function templatePerPos(pos: number): ProfiloSkill[] {
  const pesi = PESI_OVERALL[pos] ?? PESI_OVERALL[5]!;
  return pesi.map((p) => {
    if (p >= 3) return { media: 68, dev: 6 };
    if (p === 2) return { media: 62, dev: 7 };
    if (p === 1) return { media: 56, dev: 8 };
    return { media: 43, dev: 4 };
  });
}

/** Ritorna la media del template (per scalare verso l'overall target) */
function mediaTemplate(pos: number): number {
  const pesi = PESI_OVERALL[pos] ?? PESI_OVERALL[5]!;
  const t = templatePerPos(pos);
  let somma = 0;
  let peso = 0;
  for (let i = 0; i < SKILL_NAMES.length; i++) {
    const p = pesi[i]!;
    if (p === 0) continue;
    somma += t[i]!.media * p;
    peso += p;
  }
  return peso === 0 ? 50 : somma / peso;
}

/** Fisico tipico per posizione (altezza cm / peso kg), calibri reali per fascia d'età */
const FISICO_PER_POS: Readonly<Record<number, { altezza: [number, number]; pesoBase: number }>> = {
  0: { altezza: [185, 200], pesoBase: 82 },
  1: { altezza: [182, 196], pesoBase: 82 },
  2: { altezza: [170, 185], pesoBase: 71 },
  3: { altezza: [170, 185], pesoBase: 71 },
  4: { altezza: [175, 190], pesoBase: 76 },
  5: { altezza: [172, 188], pesoBase: 74 },
  6: { altezza: [168, 182], pesoBase: 70 },
  7: { altezza: [168, 182], pesoBase: 70 },
  8: { altezza: [168, 183], pesoBase: 70 },
  9: { altezza: [165, 180], pesoBase: 67 },
  10: { altezza: [165, 180], pesoBase: 67 },
  11: { altezza: [170, 185], pesoBase: 72 },
  12: { altezza: [178, 195], pesoBase: 79 },
};

/** Peso da altezza e età (IMC realistico 22-25, i 16enni più leggeri) */
function pesoDaAltezza(altezza: number, eta: number, rand: () => number): number {
  const imc = eta <= 17 ? 21.5 + rand() * 2 : 22.5 + rand() * 2.5;
  return Math.round(imc * (altezza / 100) ** 2);
}

/** Trait per posizione: probabilità per skill booleana (indice = ordine SKILL_TRAIT) */
const TRAIT_PER_POS: Readonly<Record<number, Readonly<Record<string, number>>>> = {
  0: { GKLowPunt: 0.7, GKHighPunt: 0.7, GKLongThrow: 0.3, GKPenaltySaver: 0.2, FightingSpirit: 0.4 },
  1: { ManMarking: 0.6, Interception: 0.6, AcrobaticClear: 0.4, FightingSpirit: 0.5, Captaincy: 0.2, HeadingSpecial: 0.2, TrackBack: 0.3 },
  2: { TrackBack: 0.5, EarlyCross: 0.4, PinpointCrossing: 0.2, ManMarking: 0.4, LongThrow: 0.2 },
  3: { TrackBack: 0.5, EarlyCross: 0.4, PinpointCrossing: 0.2, ManMarking: 0.4, LongThrow: 0.2 },
  4: { LongBallExpert: 0.4, ManMarking: 0.4, Interception: 0.5, FightingSpirit: 0.5, Captaincy: 0.2 },
  5: { OneTouchPass: 0.4, ThroughPassing: 0.3, WeightedPass: 0.3, LongBallExpert: 0.2, FightingSpirit: 0.4, Captaincy: 0.2 },
  6: { OneTouchPass: 0.4, ThroughPassing: 0.3, PinpointCrossing: 0.3, EarlyCross: 0.3, OutsideCurler: 0.2 },
  7: { OneTouchPass: 0.4, ThroughPassing: 0.3, PinpointCrossing: 0.3, EarlyCross: 0.3, OutsideCurler: 0.2 },
  8: { ThroughPassing: 0.4, WeightedPass: 0.3, OneTouchPass: 0.4, FirstTimeShot: 0.3, LongRangeDrive: 0.2, Captaincy: 0.1 },
  9: { SpeedingBullet: 0.3, IncisiveRun: 0.4, MazingRun: 0.3, DoubleTouch: 0.3, ScissorsFeint: 0.3, FlipFlap: 0.2, Chipshotcontrol: 0.2 },
  10: { SpeedingBullet: 0.3, IncisiveRun: 0.4, MazingRun: 0.3, DoubleTouch: 0.3, ScissorsFeint: 0.3, FlipFlap: 0.2, Chipshotcontrol: 0.2 },
  11: { FirstTimeShot: 0.4, AcrobaticFinishing: 0.3, HeelTrick: 0.3, Sombrero: 0.2, MarseilleTurn: 0.2, LongRangeDrive: 0.2, Captaincy: 0.2 },
  12: { AcrobaticFinishing: 0.4, FirstTimeShot: 0.4, HeadingSpecial: 0.3, LongRangeDrive: 0.2, KnuckleShot: 0.1, Captaincy: 0.2, FightingSpirit: 0.3 },
};

/** Lista completa delle skill booleane (colonne 59-106 del CSV) */
const SKILL_TRAIT = [
  'Trickster', 'MazingRun', 'SpeedingBullet', 'IncisiveRun', 'LongBallExpert', 'EarlyCross',
  'LongRanger', 'ScissorsFeint', 'DoubleTouch', 'FlipFlap', 'MarseilleTurn', 'Sombrero',
  'CrossOverTurn', 'CutBehindAndTurn', 'ScotchMove', 'StepOnSkillcontrol', 'HeadingSpecial',
  'LongRangeDrive', 'Chipshotcontrol', 'LongRangeShot', 'KnuckleShot', 'DippingShots',
  'RisingShots', 'AcrobaticFinishing', 'HeelTrick', 'FirstTimeShot', 'OneTouchPass',
  'ThroughPassing', 'WeightedPass', 'PinpointCrossing', 'OutsideCurler', 'Rabona',
  'NoLookPass', 'LowLoftedPass', 'GKLowPunt', 'GKHighPunt', 'LongThrow', 'GKLongThrow',
  'PenaltySpecialist', 'GKPenaltySaver', 'Gamesmanship', 'ManMarking', 'TrackBack',
  'Interception', 'AcrobaticClear', 'Captaincy', 'SuperSub', 'FightingSpirit',
] as const;

/** Proficiency posizione: 2 = registrato, 1 = secondaria, 0 = nessuna (verificato CSV reale) */
function proficienciesPerPos(pos: number): Pick<AttributiPes, 'GK' | 'CB' | 'LB' | 'RB' | 'DMF' | 'CMF' | 'LMF' | 'RMF' | 'AMF' | 'LWF' | 'RWF' | 'SS' | 'CF'> {
  const base: Record<string, number> = { GK: 0, CB: 0, LB: 0, RB: 0, DMF: 0, CMF: 0, LMF: 0, RMF: 0, AMF: 0, LWF: 0, RWF: 0, SS: 0, CF: 0 };
  const nomi = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF'];
  base[nomi[pos]!] = 2;
  // Secondarie tipiche per posizione (pattern dal CSV reale: Kimmich RB/DMF/CMF 2-1-2, ecc.)
  const secondarie: Readonly<Record<number, readonly string[]>> = {
    1: ['DMF'], 2: ['CB', 'RMF'], 3: ['CB', 'LMF'], 4: ['CMF', 'CB'], 5: ['DMF', 'AMF'],
    6: ['RMF', 'AMF', 'LWF'], 7: ['LMF', 'AMF', 'RWF'], 8: ['CMF', 'LWF', 'RWF', 'SS'],
    9: ['RWF', 'RMF', 'AMF', 'SS'], 10: ['LWF', 'LMF', 'AMF', 'SS'], 11: ['AMF', 'CF', 'LWF', 'RWF'],
    12: ['SS'],
  };
  for (const s of secondarie[pos] ?? []) base[s] = 1;
  return base as Pick<AttributiPes, 'GK' | 'CB' | 'LB' | 'RB' | 'DMF' | 'CMF' | 'LMF' | 'RMF' | 'AMF' | 'LWF' | 'RWF' | 'SS' | 'CF'>;
}

/** PlayingStyle tipici per posizione (range verificato 0-21) */
const STYLE_PER_POS: Readonly<Record<number, readonly number[]>> = {
  0: [8, 12, 13], 1: [2, 3, 6, 10], 2: [4, 6, 16], 3: [4, 6, 16], 4: [5, 6, 9, 11],
  5: [5, 9, 11, 14], 6: [6, 7, 11, 14], 7: [6, 7, 11, 14], 8: [7, 9, 11, 14, 15],
  9: [7, 9, 11, 15, 16, 18], 10: [7, 9, 11, 15, 16, 18], 11: [7, 14, 15, 16, 18], 12: [10, 14, 15, 17, 18, 19],
};

function scegli<T>(rand: () => number, lista: readonly T[]): T {
  return lista[Math.floor(rand() * lista.length)]!;
}

/** Seme stabile per la generazione (carriera + stagione + club + contatore) */
export function semeVivaio(carrieraId: string, stagione: string, clubId: string, indice: number): number {
  const s = `${carrieraId}|${stagione}|${clubId}|${indice}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Genera gli attributi completi per un nuovo giocatore (intake/rigenerato).
 * Le skill nascono dal template per posizione, scalate perché la media pesata
 * per posizione (overallDaAttributi) combaci con l'overall target.
 */
export function generaAttributi(opzioni: {
  pos: number;
  eta: number;
  overallTarget: number;
  rand: () => number;
  /** true = giocatore creato da FLM (flag Edit* a True, OwnerClub dal chiamante) */
  creatoDaFlm: boolean;
}): AttributiPes {
  const { pos, eta, overallTarget, rand, creatoDaFlm } = opzioni;
  const template = templatePerPos(pos);
  const base = mediaTemplate(pos);

  // Scala: ogni skill = template + (target − base) + rumore; poi clamp 40-99
  const skill: Record<string, number> = {};
  for (let i = 0; i < SKILL_NAMES.length; i++) {
    const nome = SKILL_NAMES[i]!;
    const t = template[i]!;
    // I 16enni hanno fisico in sviluppo: le skill fisiche sotto la media del template
    const correzioneEta = (nome === 'PhysicalContact' || nome === 'Stamina' || nome === 'Jump' || nome === 'KickingPower')
      ? (eta <= 17 ? -4 : eta === 18 ? -2 : 0)
      : 0;
    const rumore = (rand() * 2 - 1) * t.dev;
    skill[nome] = clampSkill(overallTarget - base + t.media + rumore + correzioneEta);
  }

  // Skill portiere: per i non-GK restano basse (40) come nel CSV reale
  if (pos !== 0) {
    for (const nome of ['GKAwareness', 'GKCatching', 'GKClearing', 'GKReflexes', 'GKReach']) skill[nome] = 40;
  }

  const fisico = FISICO_PER_POS[pos] ?? FISICO_PER_POS[5]!;  const altezza = Math.round(fisico.altezza[0] + rand() * (fisico.altezza[1] - fisico.altezza[0]));
  const peso = pesoDaAltezza(altezza, eta, rand);
  const traits: Record<string, boolean> = {};
  for (const t of SKILL_TRAIT) traits[t] = false;
  const traitPos = TRAIT_PER_POS[pos] ?? {};
  for (const [t, prob] of Object.entries(traitPos)) {
    traits[t] = rand() < prob;
  }
  // Portieri: le skill booleane da portiere se posizione GK
  if (pos === 0) {
    traits.GKLowPunt = rand() < 0.6;
    traits.GKHighPunt = rand() < 0.6;
    traits.GKLongThrow = rand() < 0.3;
  }

  const prof = proficienciesPerPos(pos);
  const attributi: AttributiPes = {
    JapName: '',
    Shirt: '',
    ShirtNational: '',
    Commentary: 0,
    Country2: 0,
    Height: altezza,
    Weight: peso,
    Foot: rand() < 0.25, // ~25% mancini (distribuzione reale)
    PlayingStyle: scegli(rand, STYLE_PER_POS[pos] ?? [5]),
    POS: pos,
    ...prof,
    ...skill,
    WeakFootUsage: 1 + Math.floor(rand() * 4),
    WeakFootAcc: 1 + Math.floor(rand() * 4),
    Form: 3 + Math.floor(rand() * 4), // 3-6, come la maggior parte del DB
    InjuryResistance: 1 + Math.floor(rand() * 3),
    Reputation: 1 + Math.floor(rand() * 3), // giovani: reputazione bassa
    PlayingAttitude: 0,
    ...traits,
    Celebration1: 1 + Math.floor(rand() * 240),
    Celebration2: 1 + Math.floor(rand() * 240),
    DribblingHunching: 1 + Math.floor(rand() * 5),
    DribblingArmMove: 1 + Math.floor(rand() * 10),
    RunningHunching: 1 + Math.floor(rand() * 5),
    RunningArmMovement: 1 + Math.floor(rand() * 10),
    CornerKicks: 1 + Math.floor(rand() * 10),
    FreeKicks: 1 + Math.floor(rand() * 20),
    PenaltyKick: 1 + Math.floor(rand() * 7),
    DribbleMotion: 0,
    YouthClub: 0,
    OwnerClub: 0,
    ContractUntil: '01/01/0001 00:00:00',
    LoanUntil: '01/01/0001 00:00:00',
    MarketValue: 0,
    NationalCaps: 0,
    Legend: false,
    Hand: 0,
    WinnerGoldenBall: false,
    EditName: creatoDaFlm,
    EditBasics: creatoDaFlm,
    EditPosition: creatoDaFlm,
    EditPositions: creatoDaFlm,
    EditAbilities: creatoDaFlm,
    EditPlayerSkills: creatoDaFlm,
    EditPlayingStyle: creatoDaFlm,
    EditCOMPlayingStyles: creatoDaFlm,
    EditMovements: creatoDaFlm,
    Edit1: creatoDaFlm,
    Edit2: creatoDaFlm,
    Edit3: creatoDaFlm,
    Edit4: creatoDaFlm,
    Edit5: creatoDaFlm,
    Edit6: creatoDaFlm,
    Edit7: creatoDaFlm,
    Value1: 0,
    Value2: 0,
    Value3: 0,
    Value2020_1: 0,
    Value2020_2: 0,
    Appearance: 0,
    ListBoots: 0,
    ListGloves: 0,
    InEditFile: false,
    OverallStats: overallTarget,
  } as AttributiPes;
  // Correzione a due passi: centra l'overall pesato sul target (tolleranza ±1)
  correggiOverall(attributi, pos, overallTarget);
  return attributi;
}

/** Attributi "vuoti" per i giocatori importati dal bootstrap (riempiti dal backfill) */
export function attributiVuotiDaRiga(overall: number): AttributiPes {
  return {
    JapName: '', Shirt: '', ShirtNational: '', Commentary: 0, Country2: 0,
    Height: 178, Weight: 74, Foot: false, PlayingStyle: 5, POS: 5,
    GK: 0, CB: 0, LB: 0, RB: 0, DMF: 0, CMF: 0, LMF: 0, RMF: 0, AMF: 0, LWF: 0, RWF: 0, SS: 0, CF: 0,
    OffensiveAwareness: 60, BallControl: 60, Dribbling: 60, TightPossession: 60, LowPass: 60,
    LoftedPass: 60, Finishing: 60, Heading: 60, PlaceKicking: 60, Curl: 60, Speed: 60,
    Acceleration: 60, KickingPower: 60, Jump: 60, PhysicalContact: 60, Balance: 60, Stamina: 60,
    DefensiveAwareness: 60, BallWinning: 60, Aggression: 60, GKAwareness: 40, GKCatching: 40,
    GKClearing: 40, GKReflexes: 40, GKReach: 40, WeakFootUsage: 2, WeakFootAcc: 2, Form: 4,
    InjuryResistance: 2, Reputation: 2, PlayingAttitude: 0, Trickster: false, MazingRun: false,
    SpeedingBullet: false, IncisiveRun: false, LongBallExpert: false, EarlyCross: false,
    LongRanger: false, ScissorsFeint: false, DoubleTouch: false, FlipFlap: false,
    MarseilleTurn: false, Sombrero: false, CrossOverTurn: false, CutBehindAndTurn: false,
    ScotchMove: false, StepOnSkillcontrol: false, HeadingSpecial: false, LongRangeDrive: false,
    Chipshotcontrol: false, LongRangeShot: false, KnuckleShot: false, DippingShots: false,
    RisingShots: false, AcrobaticFinishing: false, HeelTrick: false, FirstTimeShot: false,
    OneTouchPass: false, ThroughPassing: false, WeightedPass: false, PinpointCrossing: false,
    OutsideCurler: false, Rabona: false, NoLookPass: false, LowLoftedPass: false, GKLowPunt: false,
    GKHighPunt: false, LongThrow: false, GKLongThrow: false, PenaltySpecialist: false,
    GKPenaltySaver: false, Gamesmanship: false, ManMarking: false, TrackBack: false,
    Interception: false, AcrobaticClear: false, Captaincy: false, SuperSub: false,
    FightingSpirit: false, Celebration1: 1, Celebration2: 1, DribblingHunching: 2,
    DribblingArmMove: 2, RunningHunching: 2, RunningArmMovement: 2, CornerKicks: 1,
    FreeKicks: 1, PenaltyKick: 1, DribbleMotion: 0, YouthClub: 0, OwnerClub: 0,
    ContractUntil: '01/01/0001 00:00:00', LoanUntil: '01/01/0001 00:00:00', MarketValue: 0,
    NationalCaps: 0, Legend: false, Hand: 0, WinnerGoldenBall: false,
    EditName: false, EditBasics: false, EditPosition: false, EditPositions: false,
    EditAbilities: false, EditPlayerSkills: false, EditPlayingStyle: false,
    EditCOMPlayingStyles: false, EditMovements: false, Edit1: false, Edit2: false,
    Edit3: false, Edit4: false, Edit5: false, Edit6: false, Edit7: false,
    Value1: 0, Value2: 0, Value3: 0, Value2020_1: 0, Value2020_2: 0,
    Appearance: 0, ListBoots: 0, ListGloves: 0, InEditFile: false, OverallStats: overall,
  };
}

/**
 * Correzione a due passi: dopo la generazione/distribuzione, allinea le skill
 * all'overall target con uno shift uniforme (profilo invariato, media pesata
 * centrata). Ritorna l'overall effettivo (≈ target, ±1 per gli arrotondamenti).
 */
export function correggiOverall(a: AttributiPes, pos: number, target: number): number {
  let corrente = overallDaAttributi(a, pos);
  let guardia = 0;
  while (corrente !== target && guardia < 5) {
    const gap = target - corrente;
    if (Math.abs(gap) > 6) break; // guardia: mai shift selvaggi
    const pesi = PESI_OVERALL[pos] ?? PESI_OVERALL[5]!;
    for (let i = 0; i < SKILL_NAMES.length; i++) {
      if (pesi[i] === 0) continue;
      const nome = SKILL_NAMES[i]!;
      const v = clampSkill(skillDaNome(a, nome) + gap);
      scriviSkill(a, nome, v);
    }
    if (pos !== 0) {
      for (const nome of ['GKAwareness', 'GKCatching', 'GKClearing', 'GKReflexes', 'GKReach']) scriviSkill(a, nome, 40);
    }
    corrente = overallDaAttributi(a, pos);
    guardia++;
  }
  a.OverallStats = corrente;
  return corrente;
}

/**
 * Applica un delta overall distribuito sulle skill in proporzione ai pesi
 * di posizione + rumore: chi cresce di 3 punti non cresce ovunque uguale.
 * La correzione finale centra l'overall esattamente su vecchio + delta.
 */
export function applicaDeltaOverall(a: AttributiPes, pos: number, delta: number, rand: () => number): AttributiPes {
  if (delta === 0) return a;
  const pesi = PESI_OVERALL[pos] ?? PESI_OVERALL[5]!;
  const nuovo = { ...a };
  const pesoTotale = pesi.reduce((s, p) => s + p, 0);
  if (pos !== 0) {
    for (const nome of ['GKAwareness', 'GKCatching', 'GKClearing', 'GKReflexes', 'GKReach']) {
      scriviSkill(nuovo, nome, 40);
    }
  }
  for (let i = 0; i < SKILL_NAMES.length; i++) {
    const p = pesi[i]!;
    if (p === 0) continue;
    const quota = (p / pesoTotale) * delta;
    const rumore = (rand() * 2 - 1) * 0.6;
    const nuovoValore = clampSkill(skillDaNome(nuovo, SKILL_NAMES[i]!) + quota + rumore);
    scriviSkill(nuovo, SKILL_NAMES[i]!, nuovoValore);
  }
  const vecchio = a.OverallStats > 0 ? a.OverallStats : overallDaAttributi(a, pos);
  correggiOverall(nuovo, pos, vecchio + delta);
  return nuovo;
}

/** Attributi chiave per posizione (top N per peso): usati da verifica forma e crescita */
export function attributiChiave(pos: number, n: number): string[] {
  const pesi = PESI_OVERALL[pos] ?? PESI_OVERALL[5]!;
  const conPeso = SKILL_NAMES.map((nome, i) => ({ nome, peso: pesi[i]! }))
    .filter((x) => x.peso > 0)
    .sort((x, y) => y.peso - x.peso);
  return conPeso.slice(0, n).map((x) => x.nome);
}

/**
 * Verifica forma ogni 5 partite (decisione utente): media voti della finestra
 * → ±1 sugli attributi chiave del ruolo.
 */
export function applicaVerificaForma(
  a: AttributiPes,
  pos: number,
  mediaVoti: number,
  rand: () => number,
): AttributiPes {
  if (mediaVoti >= 7.0) {
    return applicaDeltaOverall(a, pos, 1, rand);
  }
  if (mediaVoti <= 5.5) {
    return applicaDeltaOverall(a, pos, -1, rand);
  }
  return a;
}

/**
 * PES ID per i nuovi giocatori: max(esistenti, base) + 1 — univoco in tutto il
 * DB (anche tra carriere: l'EDIT file è uno solo, PRD 7.4: ID > 0x80000000).
 */
export function prossimoPesId(pesIdEsistenti: readonly (number | null)[]): number {
  let max = PES_ID_BASE;
  for (const id of pesIdEsistenti) {
    if (id !== null && id > max) max = id;
  }
  return max + 1;
}

/** Soffitto reale nascosto: potenziale × [0.85, 1.05] — molti non arrivano al pieno potenziale */
export function soffittoDaPotenziale(potenziale: number, rand: () => number): number {
  const fattore = SOFFITTO_MIN_FATTORE + rand() * (SOFFITTO_MAX_FATTORE - SOFFITTO_MIN_FATTORE);
  return Math.min(99, Math.max(potenziale, Math.round(potenziale * fattore)));
}

/** PRNG da seme vivaio (helper condiviso) */
export function randDaSeme(carrieraId: string, stagione: string, clubId: string, indice: number): () => number {
  return prng(semeVivaio(carrieraId, stagione, clubId, indice));
}

export { FORMA_FINESTRA_ATTRIBUTI };
