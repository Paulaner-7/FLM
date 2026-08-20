// FLM — Ponte dati con PES Editor (PRD 7.4/7.5): CSV nel formato REALE dell'editor.
// Vincoli verificati online (blog ejogc327, agosto 2026) e sui file in docs/:
// - separatore punto e virgola o tabulazione (virgola NO); file .csv;
// - encoding UNICODE/UTF-8 (BOM iniziale per gli accenti);
// - header ESATTI dell'export reale: l'ordine non conta, gli header non si cambiano;
// - EDIT mode: nuovi giocatori SOLO con ID > 2147483648 (0x80000000);
// - colonna Value2 deve essere FALSE/0 all'import (changelog v0.12);
// - l'editor ricalcola l'overall con formula propria (tolleranza ±1-2, PRD 7.5);
// - backup dell'EDIT file prima di ogni import (reminder nella UI).

import type { AttributiPes, Giocatore, Squadra, SquadAssignment } from '../types/entities';
import { pesCountryIdDaNome } from '../data/countries';

export const SEPARATORE_CSV = ';';

/** Header ESATTI del CSV Players dell'editor (151 colonne, ordine dell'export reale). */
export const HEADERS_PLAYERS = [
  'Id', 'Name', 'JapName', 'Shirt', 'ShirtNational', 'Commentary', 'Country', 'Country2',
  'Height', 'Weight', 'Age', 'Foot', 'PlayingStyle', 'POS', 'GK', 'CB', 'LB', 'RB', 'DMF',
  'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF', 'OffensiveAwareness', 'BallControl',
  'Dribbling', 'TightPossession', 'LowPass', 'LoftedPass', 'Finishing', 'Heading',
  'PlaceKicking', 'Curl', 'Speed', 'Acceleration', 'KickingPower', 'Jump', 'PhysicalContact',
  'Balance', 'Stamina', 'DefensiveAwareness', 'BallWinning', 'Aggression', 'GKAwareness',
  'GKCatching', 'GKClearing', 'GKReflexes', 'GKReach', 'WeakFootUsage', 'WeakFootAcc', 'Form',
  'InjuryResistance', 'Reputation', 'PlayingAttitude', 'Trickster', 'MazingRun',
  'SpeedingBullet', 'IncisiveRun', 'LongBallExpert', 'EarlyCross', 'LongRanger',
  'ScissorsFeint', 'DoubleTouch', 'FlipFlap', 'MarseilleTurn', 'Sombrero', 'CrossOverTurn',
  'CutBehindAndTurn', 'ScotchMove', 'StepOnSkillcontrol', 'HeadingSpecial', 'LongRangeDrive',
  'Chipshotcontrol', 'LongRangeShot', 'KnuckleShot', 'DippingShots', 'RisingShots',
  'AcrobaticFinishing', 'HeelTrick', 'FirstTimeShot', 'OneTouchPass', 'ThroughPassing',
  'WeightedPass', 'PinpointCrossing', 'OutsideCurler', 'Rabona', 'NoLookPass', 'LowLoftedPass',
  'GKLowPunt', 'GKHighPunt', 'LongThrow', 'GKLongThrow', 'PenaltySpecialist', 'GKPenaltySaver',
  'Gamesmanship', 'ManMarking', 'TrackBack', 'Interception', 'AcrobaticClear', 'Captaincy',
  'SuperSub', 'FightingSpirit', 'Celebration1', 'Celebration2', 'DribblingHunching',
  'DribblingArmMove.', 'RunningHunching', 'RunningArmMovement', 'CornerKicks', 'FreeKicks',
  'PenaltyKick', 'DribbleMotion', 'YouthClub', 'OwnerClub', 'ContractUntil', 'LoanUntil',
  'MarketValue', 'NationalCaps', 'Legend', 'Hand', 'WinnerGoldenBall', 'EditName', 'EditBasics',
  'EditPosition', 'EditPositions', 'EditAbilities', 'EditPlayerSkills', 'EditPlayingStyle',
  'EditCOMPlayingStyles', 'EditMovements', 'Edit1', 'Edit2', 'Edit3', 'Edit4', 'Edit5',
  'Edit6', 'Edit7', 'Value1', 'Value2', 'Value3', 'Value2020_1', 'Value2020_2', 'Appearance',
  'ListBoots', 'ListGloves', 'InEditFile', 'OverallStats',
] as const;

/** Header ESATTI del CSV Teams-Players (assegnazioni, formato export reale). */
export const HEADERS_TEAMS_PLAYERS = ['Id', 'Name', 'Id Club', 'Club', 'Id National', 'National'] as const;

/** Header ESATTI del CSV Roster (rosa per squadra, EDIT mode): 122 colonne. */
export const HEADERS_ROSTER = [
  'Id', 'Player1', 'Player2', 'Player3', 'Player4', 'Player5', 'Player6', 'Player7', 'Player8',
  'Player9', 'Player10', 'Player11', 'Player12', 'Player13', 'Player14', 'Player15', 'Player16',
  'Player17', 'Player18', 'Player19', 'Player20', 'Player21', 'Player22', 'Player23', 'Player24',
  'Player25', 'Player26', 'Player27', 'Player28', 'Player29', 'Player30', 'Player31', 'Player32',
  'Player33', 'Player34', 'Player35', 'Player36', 'Player37', 'Player38', 'Player39', 'Player40',
  'Number1', 'Number2', 'Number3', 'Number4', 'Number5', 'Number6', 'Number7', 'Number8',
  'Number9', 'Number10', 'Number11', 'Number12', 'Number13', 'Number14', 'Number15', 'Number16',
  'Number17', 'Number18', 'Number19', 'Number20', 'Number21', 'Number22', 'Number23', 'Number24',
  'Number25', 'Number26', 'Number27', 'Number28', 'Number29', 'Number30', 'Number31', 'Number32',
  'Number33', 'Number34', 'Number35', 'Number36', 'Number37', 'Number38', 'Number39', 'Number40',
  'Value1', 'Value2', 'Value3', 'Value4', 'Value5', 'Value6', 'Value7', 'Value8', 'Value9',
  'Value10', 'Value11', 'Value12', 'Value13', 'Value14', 'Value15', 'Value16', 'Value17',
  'Value18', 'Value19', 'Value20', 'Value21', 'Value22', 'Value23', 'Value24', 'Value25',
  'Value26', 'Value27', 'Value28', 'Value29', 'Value30', 'Value31', 'Value32', 'Value33',
  'Value34', 'Value35', 'Value36', 'Value37', 'Value38', 'Value39', 'Value40', 'TotalPlayers',
] as const;

function escapeCsv(valore: string): string {
  return /[";\n\r]/.test(valore) ? `"${valore.replace(/"/g, '""')}"` : valore;
}

function b(value: boolean): string {
  return value ? 'True' : 'False';
}

/** Data vuota nel formato editor ("01/01/0001 00:00:00") — valore di default del CSV reale. */
export const DATA_VUOTA_EDITOR = '01/01/0001 00:00:00';

/** Data prestito a fine stagione (formato editor dd/MM/yyyy HH:mm:ss, "30/06/20XX"). */
export function dataFineStagioneEditor(stagione: string): string {
  const anno = Number(stagione.split('/')[0]);
  if (!Number.isFinite(anno)) return DATA_VUOTA_EDITOR;
  return `30/06/${anno} 00:00:00`;
}

/**
 * Serializza un giocatore in una riga del CSV Players (151 colonne, formato reale).
 * attributi assenti → riga di default (dopo il backfill non dovrebbe succedere).
 */
export function rigaGiocatore(g: Giocatore, a: AttributiPes): string[] {
  const country = pesCountryIdDaNome(g.nazionalita) ?? 0;
  return [
    g.pesId ?? 0, g.nome, a.JapName, a.Shirt, a.ShirtNational, a.Commentary, country, a.Country2,
    a.Height, a.Weight, g.eta, b(a.Foot), a.PlayingStyle, a.POS, a.GK, a.CB, a.LB, a.RB, a.DMF,
    a.CMF, a.LMF, a.RMF, a.AMF, a.LWF, a.RWF, a.SS, a.CF, a.OffensiveAwareness, a.BallControl,
    a.Dribbling, a.TightPossession, a.LowPass, a.LoftedPass, a.Finishing, a.Heading,
    a.PlaceKicking, a.Curl, a.Speed, a.Acceleration, a.KickingPower, a.Jump, a.PhysicalContact,
    a.Balance, a.Stamina, a.DefensiveAwareness, a.BallWinning, a.Aggression, a.GKAwareness,
    a.GKCatching, a.GKClearing, a.GKReflexes, a.GKReach, a.WeakFootUsage, a.WeakFootAcc, a.Form,
    a.InjuryResistance, a.Reputation, a.PlayingAttitude, b(a.Trickster), b(a.MazingRun),
    b(a.SpeedingBullet), b(a.IncisiveRun), b(a.LongBallExpert), b(a.EarlyCross), b(a.LongRanger),
    b(a.ScissorsFeint), b(a.DoubleTouch), b(a.FlipFlap), b(a.MarseilleTurn), b(a.Sombrero),
    b(a.CrossOverTurn), b(a.CutBehindAndTurn), b(a.ScotchMove), b(a.StepOnSkillcontrol),
    b(a.HeadingSpecial), b(a.LongRangeDrive), b(a.Chipshotcontrol), b(a.LongRangeShot),
    b(a.KnuckleShot), b(a.DippingShots), b(a.RisingShots), b(a.AcrobaticFinishing),
    b(a.HeelTrick), b(a.FirstTimeShot), b(a.OneTouchPass), b(a.ThroughPassing), b(a.WeightedPass),
    b(a.PinpointCrossing), b(a.OutsideCurler), b(a.Rabona), b(a.NoLookPass), b(a.LowLoftedPass),
    b(a.GKLowPunt), b(a.GKHighPunt), b(a.LongThrow), b(a.GKLongThrow), b(a.PenaltySpecialist),
    b(a.GKPenaltySaver), b(a.Gamesmanship), b(a.ManMarking), b(a.TrackBack), b(a.Interception),
    b(a.AcrobaticClear), b(a.Captaincy), b(a.SuperSub), b(a.FightingSpirit), a.Celebration1,
    a.Celebration2, a.DribblingHunching, a.DribblingArmMove, a.RunningHunching,
    a.RunningArmMovement, a.CornerKicks, a.FreeKicks, a.PenaltyKick, a.DribbleMotion,
    a.YouthClub, a.OwnerClub, a.ContractUntil, a.LoanUntil, a.MarketValue, a.NationalCaps,
    b(a.Legend), a.Hand, b(a.WinnerGoldenBall), b(a.EditName), b(a.EditBasics), b(a.EditPosition),
    b(a.EditPositions), b(a.EditAbilities), b(a.EditPlayerSkills), b(a.EditPlayingStyle),
    b(a.EditCOMPlayingStyles), b(a.EditMovements), b(a.Edit1), b(a.Edit2), b(a.Edit3), b(a.Edit4),
    b(a.Edit5), b(a.Edit6), b(a.Edit7), a.Value1, a.Value2, a.Value3, a.Value2020_1,
    a.Value2020_2, a.Appearance, a.ListBoots, a.ListGloves, b(a.InEditFile), a.OverallStats,
  ].map((v) => String(v)).map(escapeCsv);
}

/**
 * CSV Players COMPLETO (tutto il database giocatori, PRD 7.5 decisione utente):
 * i creati FLM hanno flag Edit* a True, gli intoccati escono con i valori della
 * sorgente (l'import è un no-op per loro). Idempotente e self-healing.
 */
export function giocatoriACsv(giocatori: Giocatore[]): string {
  const righe: string[] = [HEADERS_PLAYERS.join(SEPARATORE_CSV)];
  for (const g of giocatori) {
    if (g.pesId === null) continue;
    const a = g.attributi ?? attributiDefault(g);
    righe.push(rigaGiocatore(g, a).join(SEPARATORE_CSV));
  }
  return `\uFEFF${righe.join('\r\n')}`;
}

/** Attributi di default per i giocatori senza backfill (difensivo, mai righe vuote). */
function attributiDefault(g: Giocatore): AttributiPes {
  const base = {
    JapName: '', Shirt: g.nome.toUpperCase(), ShirtNational: '', Commentary: g.pesId ?? 0,
    Country2: 0, Height: 178, Weight: 74, Foot: false, PlayingStyle: 5, POS: 5,
    GK: 0, CB: 0, LB: 0, RB: 0, DMF: 0, CMF: 0, LMF: 0, RMF: 0, AMF: 0, LWF: 0, RWF: 0, SS: 0, CF: 0,
    WeakFootUsage: 2, WeakFootAcc: 2, Form: 4, InjuryResistance: 2, Reputation: 2, PlayingAttitude: 0,
    Celebration1: 1, Celebration2: 1, DribblingHunching: 2, DribblingArmMove: 2, RunningHunching: 2,
    RunningArmMovement: 2, CornerKicks: 1, FreeKicks: 1, PenaltyKick: 1, DribbleMotion: 0,
    YouthClub: 0, OwnerClub: 0, ContractUntil: DATA_VUOTA_EDITOR, LoanUntil: DATA_VUOTA_EDITOR,
    MarketValue: 0, NationalCaps: 0, Legend: false, Hand: 0, WinnerGoldenBall: false,
    EditName: false, EditBasics: false, EditPosition: false, EditPositions: false,
    EditAbilities: false, EditPlayerSkills: false, EditPlayingStyle: false,
    EditCOMPlayingStyles: false, EditMovements: false, Edit1: false, Edit2: false, Edit3: false,
    Edit4: false, Edit5: false, Edit6: false, Edit7: false, Value1: 0, Value2: 0, Value3: 0,
    Value2020_1: 0, Value2020_2: 0, Appearance: 0, ListBoots: 0, ListGloves: 0, InEditFile: false,
  };
  const skill = ['OffensiveAwareness', 'BallControl', 'Dribbling', 'TightPossession', 'LowPass',
    'LoftedPass', 'Finishing', 'Heading', 'PlaceKicking', 'Curl', 'Speed', 'Acceleration',
    'KickingPower', 'Jump', 'PhysicalContact', 'Balance', 'Stamina', 'DefensiveAwareness',
    'BallWinning', 'Aggression', 'GKAwareness', 'GKCatching', 'GKClearing', 'GKReflexes', 'GKReach'];
  const a: Record<string, string | number | boolean> = { ...base };
  for (const s of skill) a[s] = s.startsWith('GK') ? 40 : g.overall;
  return { ...a, OverallStats: g.overall } as unknown as AttributiPes;
}

/**
 * CSV Teams-Players COMPLETO (formato reale: Id;Name;Id Club;Club;Id National;National).
 * Le assegnazioni attive (proprietà + prestiti): chi è in prestito risulta al club
 * destinatario. I giocatori senza PES ID escono marcati 0 (mai righe rotte).
 */
export function assegnazioniACsv(
  assegnazioni: SquadAssignment[],
  giocatori: Giocatore[],
  squadre: Squadra[],
): string {
  const gPerId = new Map(giocatori.map((g) => [g.id, g]));
  const sPerId = new Map(squadre.map((s) => [s.id, s]));
  const righe: string[] = [HEADERS_TEAMS_PLAYERS.join(SEPARATORE_CSV)];
  const visti = new Set<string>();
  // Prima le proprietà, poi i prestiti: il prestito sovrascrive la squadra nel gioco
  const ordinate = [...assegnazioni].sort((x, y) => (x.tipo === 'prestito' ? 1 : 0) - (y.tipo === 'prestito' ? 1 : 0));
  for (const a of ordinate) {
    if (a.al !== undefined) continue;
    if (visti.has(a.giocatoreId)) continue;
    const g = gPerId.get(a.giocatoreId);
    const s = sPerId.get(a.squadraId);
    if (!g || g.pesId === null || !s || s.pesId === null) continue;
    visti.add(a.giocatoreId);
    righe.push(
      [g.pesId, g.nome, s.pesId, s.nome, 0, ''].map(String).map(escapeCsv).join(SEPARATORE_CSV),
    );
  }
  return `\uFEFF${righe.join('\r\n')}`;
}

/**
 * CSV Roster COMPLETO (assegnazioni EDIT mode: slot 1-40 + numeri maglia).
 * Le colonne Value1-40 sono sempre 0 (verificato: 749/749 righe a zero).
 * I numeri maglia arrivano da SquadAssignment.numeroMaglia (backfill dal Roster
 * originale); i nuovi giocatori ricevono il primo numero libero.
 */
export function rosterACsv(
  squadre: Squadra[],
  giocatori: Giocatore[],
  assegnazioni: SquadAssignment[],
): string {
  const gPerId = new Map(giocatori.map((g) => [g.id, g]));
  const righe: string[] = [HEADERS_ROSTER.join(SEPARATORE_CSV)];
  for (const s of squadre) {
    if (s.pesId === null) continue;
    // Giocatori attivi: proprietà prima, poi prestiti (un giocatore in prestito
    // qui va al club di prestito: il roster del gioco riflette la rosa reale)
    const attivi = assegnazioni
      .filter((a) => a.al === undefined && a.squadraId === s.id)
      .sort((x, y) => (x.tipo === 'prestito' ? 1 : 0) - (y.tipo === 'prestito' ? 1 : 0));
    const slots: Array<{ pesId: number; numero: number }> = [];
    const numeriUsati = new Set<number>();
    for (const a of attivi) {
      const g = gPerId.get(a.giocatoreId);
      if (!g || g.pesId === null) continue;
      const numero = a.numeroMaglia && a.numeroMaglia >= 1 && a.numeroMaglia <= 40
        ? a.numeroMaglia
        : primoNumeroLibero(numeriUsati);
      numeriUsati.add(numero);
      slots.push({ pesId: g.pesId, numero });
      if (slots.length >= 40) break;
    }
    const celle: Array<string | number> = [s.pesId];
    for (let i = 0; i < 40; i++) celle.push(slots[i]?.pesId ?? 0);
    for (let i = 0; i < 40; i++) celle.push(slots[i]?.numero ?? 0);
    for (let i = 0; i < 40; i++) celle.push(0); // Value1-40
    celle.push(slots.length); // TotalPlayers
    righe.push(celle.map(String).map(escapeCsv).join(SEPARATORE_CSV));
  }
  return `\uFEFF${righe.join('\r\n')}`;
}

function primoNumeroLibero(usati: Set<number>): number {
  for (let n = 1; n <= 40; n++) {
    if (!usati.has(n)) return n;
  }
  return 1;
}
