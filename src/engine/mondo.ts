// FLM — Motore world news (mondo fuori dalla tua squadra).
// Regola 3 AGENTS.md: numeri via engine puro, LLM solo testo.
// Generazione deterministica + fallback: ogni turno 3-5 notizie dal mondo
// formattate come post X di giornalista sportivo. Nessuna notizia riguarda
// la squadra utente: performance CPU, derby, infortuni, sorteggi, mercato CPU.

import { hashString, prng } from './random';
import type { CategoriaMondo } from '../types/entities';

// ---------------------------------------------------------------------------
// Pool giornalisti (fittizi ma credibili, stile X italiano)
// ---------------------------------------------------------------------------
const GIORNALISTI: Array<{ nome: string; handle: string }> = [
  { nome: 'Luca Bianchi', handle: '@CalcioLive_LB' },
  { nome: 'Sara Ferri', handle: '@SaraFerri_Sport' },
  { nome: 'Davide Riva', handle: '@Riva_SkyCalcio' },
  { nome: 'Giulia Neri', handle: '@GiuliaNeri_SM' },
  { nome: 'Andrea Russo', handle: '@Russo_GazzettaX' },
  { nome: 'Martina Galli', handle: '@MGalli_TuttoSport' },
  { nome: 'Fabio Conti', handle: '@Conti_CalcioMercato' },
];

const CATEGORIE_BASE: CategoriaMondo[] = ['performance', 'derby', 'infortunio', 'mercato', 'sorteggio'];

// Derby noti (per narrativa realistica, anche se squadre in leghe diverse)
// Usiamo solo leghe presenti in FL26 (Premier, LaLiga, Serie A, Bundesliga...)
const DERBY_FAMOSI: Array<{ casa: string; trasferta: string; lega: string; nomeDerby: string }> = [
  { casa: 'Inter', trasferta: 'Milan', lega: 'Serie A', nomeDerby: 'Derby di Milano' },
  { casa: 'Roma', trasferta: 'Lazio', lega: 'Serie A', nomeDerby: 'Derby della Capitale' },
  { casa: 'Arsenal', trasferta: 'Tottenham Hotspur', lega: 'Premier League', nomeDerby: 'North London Derby' },
  { casa: 'Manchester City', trasferta: 'Manchester United', lega: 'Premier League', nomeDerby: 'Derby di Manchester' },
  { casa: 'Barcelona', trasferta: 'Real Madrid', lega: 'La Liga', nomeDerby: 'El Clásico' },
  { casa: 'Atlético Madrid', trasferta: 'Real Madrid', lega: 'La Liga', nomeDerby: 'Derby di Madrid' },
  { casa: 'Bayern Munich', trasferta: 'Borussia Dortmund', lega: 'Bundesliga', nomeDerby: 'Der Klassiker' },
  { casa: 'Paris Saint-Germain', trasferta: 'Marseille', lega: 'Ligue 1', nomeDerby: 'Le Classique' },
  { casa: 'Ajax', trasferta: 'Feyenoord', lega: 'Eredivisie', nomeDerby: 'De Klassieker' },
  { casa: 'Benfica', trasferta: 'Porto', lega: 'Primeira Liga', nomeDerby: 'O Clássico' },
  { casa: 'Celtic', trasferta: 'Rangers', lega: 'Scottish Premiership', nomeDerby: 'Old Firm' },
];

const NOMI_GIOCATORI_ESTERO: string[] = [
  'Kylian Mbappé', 'Erling Haaland', 'Jude Bellingham', 'Vinícius Jr.', 'Lamine Yamal',
  'Florian Wirtz', 'Jamal Musiala', 'Bukayo Saka', 'Rodri', 'Lautaro Martínez',
  'Rafael Leão', 'Khvicha Kvaratskhelia', 'Victor Osimhen', 'Pedri', 'Cole Palmer',
];

const SQUADRE_ESTERE_PER_LEGA: Record<string, string[]> = {
  'Premier League': ['Arsenal', 'Liverpool', 'Manchester City', 'Chelsea', 'Newcastle United'],
  'La Liga': ['Barcelona', 'Real Madrid', 'Atlético Madrid', 'Athletic Bilbao', 'Real Sociedad'],
  'Serie A': ['Inter', 'Napoli', 'Juventus', 'Atalanta', 'Milan'],
  'Bundesliga': ['Bayern Munich', 'Bayer Leverkusen', 'Borussia Dortmund', 'RB Leipzig'],
  'Ligue 1': ['Paris Saint-Germain', 'Marseille', 'Monaco', 'Lyon'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)] as T;
}
function int(rand: () => number, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function jitter(rand: () => number, base: number, spread: number): number {
  return base + Math.round((rand() - 0.5) * 2 * spread);
}

// ---------------------------------------------------------------------------
// Draft (senza id/carrera/settimana)
// ---------------------------------------------------------------------------
export interface DraftMondoNotizia {
  categoria: CategoriaMondo;
  titolo: string;
  estratto: string;
  corpo: string;
  autoreNome: string;
  autoreHandle: string;
  oreFa: number;
  likes: number;
  reposts: number;
  commenti: number;
  squadra?: string;
  giocatore?: string;
  origine: 'llm' | 'engine';
}

export interface InputGeneraMondo {
  settimana: number;
  stagione: string;
  squadraUtenteNome: string;
  /** Nome campionato utente (per filtrare news "nostro campionato") */
  campionatoUtenteNome: string;
  /** Squadre del campionato utente (per derby/performance locali) */
  squadreCampionato: string[];
  /** Seed deterministico: carrieraId|settimana */
  seed: string;
  /** Count override (fallback usa 3-4) */
  count?: number;
}

// ---------------------------------------------------------------------------
// Engine fallback: genera 3-4 notizie realistiche, mai sulla squadra utente
// ---------------------------------------------------------------------------
export function generaMondoFallback(input: InputGeneraMondo): DraftMondoNotizia[] {
  const rand = prng(hashString(`${input.seed}|mondo|${input.settimana}`));
  const count = input.count ?? (rand() < 0.55 ? 4 : 3);

  // Escludi utente dalle scelte
  const squadreLegaSenzaUtente = input.squadreCampionato.filter((n) => n !== input.squadraUtenteNome);
  const categorie = [...CATEGORIE_BASE];
  // Shuffle deterministico (Fisher-Yates)
  for (let i = categorie.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = categorie[i]!;
    categorie[i] = categorie[j]!;
    categorie[j] = tmp;
  }
  const scelte = categorie.slice(0, count);

  const drafts: DraftMondoNotizia[] = [];
  for (let i = 0; i < scelte.length; i++) {
    const cat = scelte[i]!;
    const giornalista = pick(rand, GIORNALISTI);
    const oreFa = int(rand, 1, 14);
    // Engagement realistico: performance/derby più virali
    const baseLikes = cat === 'derby' ? 18000 : cat === 'performance' ? 22000 : cat === 'mercato' ? 15000 : 7000;
    const likes = jitter(rand, baseLikes, Math.round(baseLikes * 0.55));
    const reposts = Math.round(likes * (0.18 + rand() * 0.12));
    const commenti = Math.round(likes * (0.12 + rand() * 0.1));

    const draft = costruisciPerCategoria(cat, {
      rand,
      giornalista,
      oreFa,
      likes: Math.max(420, likes),
      reposts: Math.max(80, reposts),
      commenti: Math.max(40, commenti),
      input,
      squadreLegaSenzaUtente,
    });
    drafts.push(draft);
  }
  // Ordina per oreFa (più recenti prima)
  drafts.sort((a, b) => a.oreFa - b.oreFa);
  return drafts;
}

interface CtxCostruzione {
  rand: () => number;
  giornalista: { nome: string; handle: string };
  oreFa: number;
  likes: number;
  reposts: number;
  commenti: number;
  input: InputGeneraMondo;
  squadreLegaSenzaUtente: string[];
}

function costruisciPerCategoria(cat: CategoriaMondo, ctx: CtxCostruzione): DraftMondoNotizia {
  switch (cat) {
    case 'performance':
      return draftPerformance(ctx);
    case 'derby':
      return draftDerby(ctx);
    case 'infortunio':
      return draftInfortunio(ctx);
    case 'sorteggio':
      return draftSorteggio(ctx);
    case 'mercato':
      return draftMercato(ctx);
    default:
      return draftPerformance(ctx);
  }
}

// ---------------------------------------------------------------------------
// PERFORMANCE — ecclatante in campionato (nostro o estero)
// ---------------------------------------------------------------------------
function draftPerformance(ctx: CtxCostruzione): DraftMondoNotizia {
  const { rand, input } = ctx;
  const estero = rand() < 0.62; // 60% estero per varietà
  let lega: string;
  let squadra: string;
  let giocatore: string;

  if (!estero && ctx.squadreLegaSenzaUtente.length >= 2) {
    lega = input.campionatoUtenteNome;
    squadra = pick(rand, ctx.squadreLegaSenzaUtente);
    giocatore = pick(rand, NOMI_GIOCATORI_ESTERO);
  } else {
    const leghe = Object.keys(SQUADRE_ESTERE_PER_LEGA).filter((l) => l !== input.campionatoUtenteNome);
    lega = pick(rand, leghe.length ? leghe : Object.keys(SQUADRE_ESTERE_PER_LEGA));
    const pool = SQUADRE_ESTERE_PER_LEGA[lega] ?? ['Arsenal'];
    squadra = pick(rand, pool);
    if (squadra === input.squadraUtenteNome) squadra = pool.find((s) => s !== squadra) ?? squadra;
    giocatore = pick(rand, NOMI_GIOCATORI_ESTERO);
  }

  const gol = int(rand, 2, 3);
  const assist = gol === 3 ? int(rand, 0, 1) : int(rand, 0, 2);
  const voto = gol === 3 ? '9.5' : gol === 2 && assist >= 1 ? '9' : '8.5';
  const avversaria = pick(
    rand,
    (SQUADRE_ESTERE_PER_LEGA[lega] ?? ['Tottenham Hotspur']).filter((s) => s !== squadra),
  );
  const risultato = gol === 3 ? `${int(rand, 3, 4)}-0` : `${int(rand, 2, 3)}-${int(rand, 0, 1)}`;

  const titoli = [
    `${giocatore} si prende la scena: ${gol === 3 ? 'tripletta' : 'doppietta'} e show totale per ${squadra}`,
    `Serata da ${voto} per ${giocatore}: ${squadra} travolge ${avversaria} (${risultato})`,
    `${lega}: ${giocatore} incontenibile, ${squadra} vince e convince`,
  ];
  const titolo = pick(rand, titoli);

  const estratto =
    `Che notte per ${giocatore}. ${gol} gol` +
    (assist > 0 ? ` + ${assist} assist` : '') +
    `, voto ${voto} e ${squadra} che vola in ${lega} (${risultato} a ${avversaria}). ` +
    `Prestazione che sposta gli equilibri — e il messaggio alla prossima avversaria è chiaro.`;

  const corpo =
    `Non era una partita qualunque e ${giocatore} lo sapeva. Primo tempo di studio, poi al ${int(rand, 38, 52)}' la sblocca con un destro a giro dal limite — classico movimento a rientrare, portiere immobile. ` +
    `Il raddoppio arriva al ${int(rand, 58, 74)}': transizione fulminea di ${squadra}, ${giocatore} attacca la profondità e chiude di prima. ` +
    (gol === 3
      ? `La tripletta al ${int(rand, 78, 88)}' su rigore procurato da lui stesso chiude i conti e fa esplodere lo stadio. `
      : `Nel mezzo anche l'assist per il ${gol === 2 && assist > 0 ? 'terzo gol' : 'raddoppio'}: palla filtrante da applausi. `) +
    `\n\n` +
    `Numeri alla mano: ${int(rand, 6, 9)} tiri, ${int(rand, 42, 58)} tocchi, ${int(rand, 82, 94)}% passaggi riusciti. ` +
    `Ma è l'impatto sulla classifica che conta: ${squadra} sale a quota ${int(rand, 14, 28)} e resta agganciata al treno ${rand() < 0.5 ? 'Champions' : 'vertice'}. ` +
    `In conferenza l'allenatore è lapidario: "Quando sta così, sposta le partite da solo. Oggi ha deciso lui". E sui social già impazzano i paragoni — qualcuno ha scritto: "Sembra di rivedere ${pick(rand, ['Henry', 'Del Piero', 'Robben'])} nei giorni migliori".`;

  return {
    categoria: 'performance',
    titolo,
    estratto,
    corpo,
    autoreNome: ctx.giornalista.nome,
    autoreHandle: ctx.giornalista.handle,
    oreFa: ctx.oreFa,
    likes: ctx.likes,
    reposts: ctx.reposts,
    commenti: ctx.commenti,
    squadra,
    giocatore,
    origine: 'engine',
  };
}

// ---------------------------------------------------------------------------
// DERBY — risultato importante
// ---------------------------------------------------------------------------
function draftDerby(ctx: CtxCostruzione): DraftMondoNotizia {
  const { rand, input } = ctx;
  // 55% derby del tuo campionato (se possibile), 45% estero
  const vuoiLocale = rand() < 0.55 && ctx.squadreLegaSenzaUtente.length >= 4;
  let derby = pick(rand, DERBY_FAMOSI);

  if (vuoiLocale) {
    // Cerca derby famoso nella lega utente
    const locali = DERBY_FAMOSI.filter((d) => d.lega === input.campionatoUtenteNome);
    if (locali.length) derby = pick(rand, locali);
    // Se non trovato, inventa con due squadre locali casuali (senza utente)
    else {
      const a = pick(rand, ctx.squadreLegaSenzaUtente);
      let b = pick(rand, ctx.squadreLegaSenzaUtente);
      while (b === a) b = pick(rand, ctx.squadreLegaSenzaUtente);
      derby = { casa: a, trasferta: b, lega: input.campionatoUtenteNome, nomeDerby: `Derby di ${input.campionatoUtenteNome.split(' ')[0]}` };
    }
    // Se derby contiene utente, sostituisci
    if (derby.casa === input.squadraUtenteNome) derby = { ...derby, casa: pick(rand, ctx.squadreLegaSenzaUtente) };
    if (derby.trasferta === input.squadraUtenteNome) derby = { ...derby, trasferta: pick(rand, ctx.squadreLegaSenzaUtente) };
  }

  // Assicura non sia utente
  if (derby.casa === input.squadraUtenteNome || derby.trasferta === input.squadraUtenteNome) {
    derby = pick(
      rand,
      DERBY_FAMOSI.filter((d) => d.casa !== input.squadraUtenteNome && d.trasferta !== input.squadraUtenteNome),
    );
  }

  const vincente = rand() < 0.48 ? derby.casa : rand() < 0.75 ? derby.trasferta : null; // 25% pareggio
  const golCasa = vincente === derby.casa ? int(rand, 1, 3) : vincente === derby.trasferta ? int(rand, 0, 1) : int(rand, 1, 2);
  const golTrasferta = vincente === derby.trasferta ? int(rand, 1, 3) : vincente === derby.casa ? int(rand, 0, 1) : golCasa;
  // Evita 0-0 noioso spesso
  const finale = vincente ? `${golCasa}-${golTrasferta}` : `${golCasa}-${golCasa}`;
  const minutoDecisivo = int(rand, 67, 93);
  const eroe = pick(rand, NOMI_GIOCATORI_ESTERO);

  const titolo = vincente
    ? `${derby.nomeDerby}: ${vincente} lo vince al ${minutoDecisivo}' — ${derby.casa} ${golCasa}-${golTrasferta} ${derby.trasferta}`
    : `${derby.nomeDerby} senza vincitori: ${derby.casa} e ${derby.trasferta} si fermano sul ${finale}`;

  const estratto = vincente
    ? `${derby.nomeDerby} da brividi. Decide ${eroe} al ${minutoDecisivo}' e ${vincente} si prende il derby (${finale}). ` +
      `Atmosfera da stadio pieno, tensione altissima fino all'ultimo — e ora la classifica cambia faccia.`
    : `Equilibrio totale nel ${derby.nomeDerby}: ${derby.casa} e ${derby.trasferta} non si fanno male (${finale}). ` +
      `Partita nervosa, poche occasioni nitide e un punto che serve a poco a entrambe.`;

  const corpo =
    (vincente
      ? `Il derby si decide quando sembrava avviato al pareggio. Al ${minutoDecisivo}' ${eroe} sfrutta una palla vagante in area e la piazza sotto la traversa: boato assordante, panchina in piedi. ` +
        `Prima di allora, gara bloccata: ${derby.casa} meglio nel primo tempo, ${derby.trasferta} cresce nella ripresa e sfiora il gol con un palo al ${int(rand, 54, 68)}'. `
      : `Poche emozioni ma tanta intensità. ${derby.casa} parte forte, ${derby.trasferta} risponde con ordine e alla lunga il pareggio sembra il risultato più giusto. ` +
        `L'occasione più grande capita a ${eroe} all'${int(rand, 71, 85)}', ma il tiro esce di un soffio. `) +
    `\n\n` +
    `Effetto classifica: ${vincente ?? 'nessuna delle due'} resta in piena lotta per ${rand() < 0.5 ? "l'Europa" : 'le posizioni di vertice'}, l'altra deve guardarsi alle spalle. ` +
    `Sui social impazza il dibattito sull'arbitraggio — un contatto in area al ${int(rand, 28, 44)}' ha fatto discutere, ma il Var ha confermato la decisione di campo. ` +
    `L'allenatore di ${vincente ?? derby.casa}: "I derby non si giocano, si vincono. Oggi i ragazzi hanno avuto cuore".`;

  return {
    categoria: 'derby',
    titolo,
    estratto,
    corpo,
    autoreNome: ctx.giornalista.nome,
    autoreHandle: ctx.giornalista.handle,
    oreFa: ctx.oreFa,
    likes: ctx.likes,
    reposts: ctx.reposts,
    commenti: ctx.commenti,
    squadra: derby.casa,
    origine: 'engine',
  };
}

// ---------------------------------------------------------------------------
// INFORTUNIO — grave, fuori 6-10 settimane
// ---------------------------------------------------------------------------
function draftInfortunio(ctx: CtxCostruzione): DraftMondoNotizia {
  const { rand, input } = ctx;
  const estero = rand() < 0.6;
  let squadra: string;
  let lega: string;
  if (!estero && ctx.squadreLegaSenzaUtente.length) {
    squadra = pick(rand, ctx.squadreLegaSenzaUtente);
    lega = input.campionatoUtenteNome;
  } else {
    const leghe = Object.keys(SQUADRE_ESTERE_PER_LEGA);
    lega = pick(rand, leghe);
    const pool = SQUADRE_ESTERE_PER_LEGA[lega]!;
    squadra = pick(rand, pool);
    if (squadra === input.squadraUtenteNome) squadra = pool.find((s) => s !== squadra) ?? squadra;
  }
  const giocatore = pick(rand, NOMI_GIOCATORI_ESTERO);
  const tipo = pick(rand, ['lesione al legamento crociato', 'distorsione grave alla caviglia', 'lesione muscolare di alto grado', 'frattura composta del metatarso', 'elongazione del collaterale'] as const);
  const settimane = tipo.includes('crociato') ? int(rand, 22, 30) : int(rand, 6, 12);
  const mesi = (settimane / 4.3).toFixed(1).replace('.', ',');
  const quando = pick(rand, ['in allenamento', 'nel finale di partita', 'in uno scontro di gioco', 'durante un allungo'] as const);

  const titolo = `Tegola ${squadra}: ${giocatore} out ${tipo} — stop di ${settimane} settimane`;

  const estratto =
    `Brutte notizie per ${squadra}. ${giocatore} si è fermato ${quando}: gli esami confermano ${tipo}, stop stimato ${settimane} settimane (~${mesi} mesi). ` +
    `Stagione fin qui da ${int(rand, 6, 11)} gol in ${int(rand, 8, 14)} presenze — assenza pesantissima.`;

  const corpo =
    `La diagnosi è arrivata in serata dopo gli accertamenti: ${tipo}. ` +
    `${giocatore} aveva accusato il problema ${quando} e aveva lasciato il campo zoppicando, ma nessuno immaginava uno stop così lungo. ` +
    `Per ${squadra} è una mazzata: il giocatore era centrale nel progetto — ${int(rand, 70, 92)}% minuti giocati, leader tecnico del reparto. ` +
    `\n\n` +
    `Il club ha già comunicato che non ci sarà intervento chirurgico immediato (${tipo.includes('crociato') ? 'si valuterà tra 10 giorni' : 'terapia conservativa e rivalutazione tra 3 settimane'}), ma il rientro è previsto non prima di ${pick(rand, ['fine dicembre', 'febbraio', 'primavera inoltrata', 'dopo la sosta'])}. ` +
    `L'allenatore, visibilmente scosso: "Perdiamo un riferimento, ma il gruppo deve compattarsi. Abbiamo soluzioni interne e — se serve — guarderemo al mercato". ` +
    `Intanto in ${lega} la notizia rimbalza ovunque: sui social i tifosi di ${squadra} chiedono un sostituto, gli avversari ritrovano un filo di speranza.`;

  return {
    categoria: 'infortunio',
    titolo,
    estratto,
    corpo,
    autoreNome: ctx.giornalista.nome,
    autoreHandle: ctx.giornalista.handle,
    oreFa: ctx.oreFa,
    likes: ctx.likes,
    reposts: ctx.reposts,
    commenti: ctx.commenti,
    squadra,
    giocatore,
    origine: 'engine',
  };
}

// ---------------------------------------------------------------------------
// SORTEGGIO — coppe europee / nazionali
// ---------------------------------------------------------------------------
function draftSorteggio(ctx: CtxCostruzione): DraftMondoNotizia {
  const { rand } = ctx;
  const competizioni = [
    { nome: 'Champions League', fase: 'league phase' },
    { nome: 'Europa League', fase: 'league phase' },
    { nome: 'Conference League', fase: 'playoff' },
    { nome: 'Coppa Italia', fase: 'ottavi di finale' },
    { nome: 'FA Cup', fase: 'quarto turno' },
  ];
  const comp = pick(rand, competizioni);
  // Usa squadre reali per sorteggio
  const team1 = pick(rand, ['Inter', 'Napoli', 'Arsenal', 'Real Madrid', 'Bayern Munich', 'Paris Saint-Germain']);
  const team2 = pick(rand, ['Barcelona', 'Manchester City', 'Juventus', 'Atalanta', 'Benfica', 'Bayer Leverkusen']);
  const team3 = pick(rand, ['Milan', 'Liverpool', 'Atlético Madrid', 'Borussia Dortmund', 'Ajax']);
  const gironeDiFerro = `${team1} • ${team2} • ${team3}`;

  const titolo = `${comp.nome}: sorteggio ${comp.fase} — girone di ferro: ${gironeDiFerro}`;

  const estratto =
    `Urn e brividi a Nyon. ${comp.nome}, ${comp.fase}: urna beffarda per ${team1}, che pesca ${team2} e ${team3}. ` +
    `Subito big match alla $1ª giornata — calendario che può già indirizzare la qualificazione.`;

  const corpo =
    `Il sorteggio di ${comp.nome} non ha deluso le attese. ${team1} — tra le favorite della vigilia — si ritrova in un raggruppamento durissimo con ${team2} e ${team3}: tre squadre che, messe insieme, valgono oltre ${int(rand, 28, 45)} punti di ranking UEFA negli ultimi cinque anni. ` +
    `La prima giornata mette subito di fronte ${team1}-${team2}, poi trasferta a ${team3} alla seconda: insomma, partenza in salita. ` +
    `\n\n` +
    `Reazioni a caldo: l'allenatore di ${team1} sorride ma non nasconde la tensione — "Girone tosto, ma è la Champions: se vuoi andare lontano devi battere tutti". ` +
    `Dall'altra parte, il tecnico di ${team2}: "Affrontiamo una grande, sarà una bella sfida di livello europeo". ` +
    `Calendario completo alle 15:00 sul sito UEFA, prevendita già presa d'assalto. Per le italiane, sorteggio ${rand() < 0.5 ? 'abbordabile' : 'in chiaroscuro'} — ma come sempre, conterà il campo.`;

  return {
    categoria: 'sorteggio',
    titolo,
    estratto,
    corpo,
    autoreNome: ctx.giornalista.nome,
    autoreHandle: ctx.giornalista.handle,
    oreFa: ctx.oreFa,
    likes: ctx.likes,
    reposts: ctx.reposts,
    commenti: ctx.commenti,
    squadra: team1,
    origine: 'engine',
  };
}

// ---------------------------------------------------------------------------
// MERCATO CPU — trasferimento/rumeur
// ---------------------------------------------------------------------------
function draftMercato(ctx: CtxCostruzione): DraftMondoNotizia {
  const { rand, input } = ctx;
  const giocatore = pick(rand, NOMI_GIOCATORI_ESTERO);
  // Squadre CPU (mai utente)
  const leghe = Object.keys(SQUADRE_ESTERE_PER_LEGA);
  const legaDa = pick(rand, leghe);
  const legaA = pick(rand, leghe.filter((l) => l !== legaDa));
  const poolDa = SQUADRE_ESTERE_PER_LEGA[legaDa]!;
  const poolA = SQUADRE_ESTERE_PER_LEGA[legaA]!;
  let da = pick(rand, poolDa);
  let a = pick(rand, poolA);
  if (da === input.squadraUtenteNome) da = poolDa.find((s) => s !== da) ?? da;
  if (a === input.squadraUtenteNome) a = poolA.find((s) => s !== a) ?? a;
  if (da === a) a = pick(rand, poolA.filter((s) => s !== da));

  const cifra = pick(rand, [12, 18, 25, 34, 42, 58, 65, 78, 90]);
  const ufficiale = rand() < 0.38;
  const stato = ufficiale ? 'UFFICIALE' : pick(rand, ['Trattativa avanzata', 'Ci siamo', 'Affare in chiusura'] as const);
  const dettaglioCifra = `${cifra}M${rand() < 0.5 ? ' + 5 di bonus' : ''}`;

  const titolo = ufficiale
    ? `UFFICIALE: ${giocatore} è un nuovo giocatore di ${a} — da ${da} per ${dettaglioCifra}`
    : `${stato}: ${a} vicina a ${giocatore} (${da}) — le cifre dell'affare: ${dettaglioCifra}`;

  const estratto = ufficiale
    ? `Colpo ${a}. ${giocatore} lascia ${da} e firma fino al ${2030 + int(rand, 0, 2)}: operazione da ${dettaglioCifra}. ` +
      `Visite già completate, annuncio social con video emozionale — e la piazza esplode.`
    : `Asse caldo ${da}-${a}. ${giocatore} ha detto sì: intesa di massima sui ${cifra}M, ` +
      `mancano gli ultimi dettagli su bonus e commissioni. Chiusura attesa ${pick(rand, ['in 48 ore', 'entro il weekend', 'a inizio settimana'])}.`;

  const corpo =
    (ufficiale
      ? `${a} piazza il colpo. ${giocatore}, ${int(rand, 21, 27)} anni, arriva da ${da} a titolo definitivo per ${dettaglioCifra}: contratto fino al ${2030 + int(rand, 0, 2)} e presentazione domani alle ${int(rand, 11, 15)}:00. ` +
        `Numeri dell'ultima stagione: ${int(rand, 8, 18)} gol e ${int(rand, 4, 11)} assist in ${int(rand, 28, 38)} presenze. ` +
        `L'allenatore lo voleva da mesi — "ci dà soluzioni diverse, può giocare sia largo che dentro il campo". `
      : `La trattativa entra nel vivo. ${a} ha alzato l'offerta a ${dettaglioCifra}, ${da} ha aperto alla cessione dopo il colloquio tra giocatore e dirigenza. ` +
        `${giocatore} spinge per la nuova destinazione: gradisce il progetto tecnico e l'idea di giocare la ${pick(rand, ['Champions', 'Europa League', 'Coppa nazionale'])} da protagonista. ` +
        `Sullo sfondo resta l'inserimento di ${pick(rand, ['un club di Premier', 'una big spagnola', 'un top club tedesco'])}, ma ${a} è nettamente avanti. `) +
    `\n\n` +
    `Reazioni immediate: i tifosi di ${a} celebrano sui social ("finalmente un colpo vero"), quelli di ${da} dividono tra delusione e comprensione — ` +
    `"Dispiace perderlo, ma con quei soldi possiamo rifare la squadra" scrive un tifoso storico. ` +
    `Per ${giocatore} si apre un capitolo nuovo: in ${legaA} troverà ${pick(rand, ['più spazio', 'un contesto più esigente', 'un allenatore che lo conosce dai tempi delle giovanili'])} e la chance di consacrarsi definitivamente.`;

  return {
    categoria: 'mercato',
    titolo,
    estratto,
    corpo,
    autoreNome: ctx.giornalista.nome,
    autoreHandle: ctx.giornalista.handle,
    oreFa: ctx.oreFa,
    likes: ctx.likes,
    reposts: ctx.reposts,
    commenti: ctx.commenti,
    squadra: a,
    giocatore,
    origine: 'engine',
  };
}

// ---------------------------------------------------------------------------
// Validation helper (LLM): clamp semplice
// ---------------------------------------------------------------------------
export function validaDraft(draft: unknown): draft is DraftMondoNotizia {
  if (typeof draft !== 'object' || draft === null) return false;
  const d = draft as Record<string, unknown>;
  return (
    typeof d.titolo === 'string' &&
    typeof d.estratto === 'string' &&
    typeof d.corpo === 'string' &&
    typeof d.categoria === 'string' &&
    typeof d.autoreNome === 'string' &&
    typeof d.autoreHandle === 'string'
  );
}
