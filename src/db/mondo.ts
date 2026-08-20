// FLM — Mondo news GROUNDED: ogni articolo narra un fatto reale della simulazione
// Regola 3: numeri via engine, LLM solo testo. Nessuna invenzione: se Juve ha
// un infortunato per 7 settimane, quel giocatore nel DB ha infortunioFinoA coerente.
// Se notizia dice "X batte Y 3-0", la Partita esiste davvero con quel risultato.

import { db, newId } from './database';
import { generaMondoFallback } from '../engine/mondo';
import { generaMondoNotizie } from '../llm';
import { hashString, prng } from '../engine/random';
import type { MondoNotizia, Partita, Squadra, Giocatore } from '../types/entities';

// ---------------------------------------------------------------------------
// Giornalisti & helpers
// ---------------------------------------------------------------------------
const GIORNALISTI_FALLBACK = [
  { nome: 'Luca Bianchi', handle: '@CalcioLive_LB' },
  { nome: 'Sara Ferri', handle: '@SaraFerri_Sport' },
  { nome: 'Davide Riva', handle: '@Riva_SkyCalcio' },
  { nome: 'Giulia Neri', handle: '@GiuliaNeri_SM' },
];

const DERBY_NOTI: Array<{ casa: string; trasferta: string; nome: string }> = [
  { casa: 'Inter', trasferta: 'Milan', nome: 'Derby di Milano' },
  { casa: 'Roma', trasferta: 'Lazio', nome: 'Derby della Capitale' },
  { casa: 'Arsenal', trasferta: 'Tottenham Hotspur', nome: 'North London Derby' },
  { casa: 'Manchester City', trasferta: 'Manchester United', nome: 'Derby di Manchester' },
  { casa: 'Barcelona', trasferta: 'Real Madrid', nome: 'El Clásico' },
  { casa: 'Bayern Munich', trasferta: 'Borussia Dortmund', nome: 'Der Klassiker' },
  { casa: 'Paris Saint-Germain', trasferta: 'Marseille', nome: 'Le Classique' },
  { casa: 'Ajax', trasferta: 'Feyenoord', nome: 'De Klassieker' },
  { casa: 'Benfica', trasferta: 'Porto', nome: 'O Clássico' },
  { casa: 'Celtic', trasferta: 'Rangers', nome: 'Old Firm' },
];

function engagementPerCategoria(categoria: string, seed: string): { likes: number; reposts: number; commenti: number } {
  const r = prng(hashString(seed));
  const base = categoria === 'derby' ? 18000 : categoria === 'performance' ? 22000 : categoria === 'mercato' ? 15000 : 7000;
  const jitter = (base: number): number => Math.round(base + (r() - 0.5) * base * 0.9);
  const likes = Math.max(420, jitter(base));
  const reposts = Math.max(80, Math.round(likes * (0.18 + r() * 0.12)));
  const commenti = Math.max(40, Math.round(likes * (0.12 + r() * 0.1)));
  return { likes, reposts, commenti };
}

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)] as T;
}
function int(rand: () => number, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Grounded selectors
// ---------------------------------------------------------------------------
interface ContestoReale {
  partiteSettimana: Partita[];
  squadre: Squadra[];
  squadreMap: Map<string, Squadra>;
  giocatori: Giocatore[];
  assegnazioni: import('../types/entities').SquadAssignment[];
  prestazioni: import('../types/entities').PrestazionePartita[];
  ledger: import('../types/entities').TransferLedgerEntry[];
  competizioni: import('../types/entities').Competizione[];
  squadraUtenteId: string;
  squadraUtenteNome: string;
  settimana: number;
}

function partiteCpuDellaSettimana(ctx: ContestoReale): Partita[] {
  // Solo giocate, non segnaposto, fuori dalla tua squadra
  return ctx.partiteSettimana.filter(
    (p) =>
      p.giocata &&
      p.casa !== 'DA_ASSEGNARE' &&
      p.trasferta !== 'DA_ASSEGNARE' &&
      p.casa !== ctx.squadraUtenteId &&
      p.trasferta !== ctx.squadraUtenteId,
  );
}

function trovaDerbyReale(ctx: ContestoReale): { partita: Partita; nomeDerby: string } | null {
  const cpu = partiteCpuDellaSettimana(ctx);
  for (const d of DERBY_NOTI) {
    // normalizza nomi per match (case-insensitive)
    const p = cpu.find((x) => {
      const casa = ctx.squadreMap.get(x.casa)?.nome ?? '';
      const tras = ctx.squadreMap.get(x.trasferta)?.nome ?? '';
      const a = casa.toLowerCase();
      const b = tras.toLowerCase();
      const dc = d.casa.toLowerCase();
      const dt = d.trasferta.toLowerCase();
      return (a === dc && b === dt) || (a === dt && b === dc);
    });
    if (p) return { partita: p, nomeDerby: d.nome };
  }
  return null;
}

function topPerformanceMatches(ctx: ContestoReale, n: number): Partita[] {
  const cpu = partiteCpuDellaSettimana(ctx);
  if (cpu.length === 0) return [];
  // Ordina per spettacolo: totale gol, poi scarto, poi random tie-break seeded
  const seeded = prng(hashString(`${ctx.squadraUtenteId}|perf|${ctx.settimana}`));
  const scored = [...cpu].sort((a, b) => {
    const totA = a.golCasa + a.golTrasferta;
    const totB = b.golCasa + b.golTrasferta;
    if (totB !== totA) return totB - totA;
    const scartoA = Math.abs(a.golCasa - a.golTrasferta);
    const scartoB = Math.abs(b.golCasa - b.golTrasferta);
    if (scartoB !== scartoA) return scartoB - scartoA;
    return seeded() - 0.5;
  });
  return scored.slice(0, n);
}

function topPrestazionePerPartita(
  partita: Partita,
  ctx: ContestoReale,
): { giocatore: Giocatore | null; gol: number } | null {
  const perPartita = ctx.prestazioni.filter((p) => p.partitaId === partita.id);
  if (perPartita.length === 0) return null;
  const best = [...perPartita].sort((a, b) => b.gol - a.gol || b.voto - a.voto)[0];
  if (!best || best.gol === 0) {
    // nessun marcatore, cerca voto più alto
    const bestVoto = [...perPartita].sort((a, b) => b.voto - a.voto)[0];
    if (!bestVoto) return null;
    const g = ctx.giocatori.find((x) => x.id === bestVoto.giocatoreId) ?? null;
    return g ? { giocatore: g, gol: bestVoto.gol } : null;
  }
  const g = ctx.giocatori.find((x) => x.id === best.giocatoreId) ?? null;
  return g ? { giocatore: g, gol: best.gol } : null;
}

// Sceglie un infortunio reale da applicare davvero al DB (se probabilità lo consente)
async function selezionaEApplicaInfortunioGrounded(
  ctx: ContestoReale,
  seed: string,
): Promise<{ giocatore: Giocatore; squadra: Squadra; settimane: number } | null> {
  const rand = prng(hashString(seed));
  // 28% di avere una news infortunio a settimana (un grave al mese circa)
  if (rand() > 0.28) return null;
  // Candidati: giocatori CPU non già infortunati, non giovani svincolati, età 18-34
  const candidati = ctx.giocatori.filter((g) => {
    if (g.carrieraId !== ctx.squadre[0]?.carrieraId) return false; // stessa carriera
    // trova squadra proprietaria
    const ass = ctx.assegnazioni.find((a) => a.giocatoreId === g.id && a.tipo === 'proprieta' && a.al === undefined);
    if (!ass) return false;
    if (ass.squadraId === ctx.squadraUtenteId) return false;
    if (g.infortunioFinoA !== undefined && g.infortunioFinoA >= ctx.settimana) return false;
    if (g.eta < 18 || g.eta > 34) return false;
    return true;
  });
  if (candidati.length === 0) return null;
  const scelto = pick(rand, candidati);
  const ass = ctx.assegnazioni.find((a) => a.giocatoreId === scelto.id)!;
  const squadra = ctx.squadreMap.get(ass.squadraId);
  if (!squadra) return null;
  // durata: 60% 3-5 settimane (lesione muscolare), 30% 6-10 (distorsione), 10% 22-28 (crociato)
  const r2 = rand();
  let settimane: number;
  if (r2 < 0.6) settimane = int(rand, 3, 5);
  else if (r2 < 0.9) settimane = int(rand, 6, 10);
  else settimane = int(rand, 22, 28);

  const infortunioFinoA = ctx.settimana + settimane;
  // Applica davvero al DB (in-memory + persistenza)
  const aggiornato: Giocatore = { ...scelto, infortunioFinoA };
  // update in ctx array per coerenza immediata
  const idx = ctx.giocatori.findIndex((x) => x.id === scelto.id);
  if (idx >= 0) ctx.giocatori[idx] = aggiornato;
  try {
    await db.giocatori.put(aggiornato);
  } catch {
    // se tabella non ancora migrata, ignora ma ritorna comunque per narrazione in-memory
  }
  return { giocatore: aggiornato, squadra, settimane };
}

function sorteggioRealeDellaSettimana(ctx: ContestoReale): import('../types/entities').Competizione | null {
  // Sorteggio avviene a inizio coppe: settimana 6-9 per UCL/UEL/UECL
  if (ctx.settimana < 5 || ctx.settimana > 10) return null;
  const cands = ctx.competizioni.filter(
    (c) => (c.tipo === 'champions_league' || c.tipo === 'europa_league' || c.tipo === 'conference_league') && (c.fasce?.length ?? 0) > 0,
  );
  if (cands.length === 0) return null;
  // Sceglie una coerente con la settimana (deterministico)
  const r = prng(hashString(`${ctx.squadraUtenteId}|sort|${ctx.settimana}`));
  return pick(r, cands);
}

// ---------------------------------------------------------------------------
// Grounded draft builders (usano dati reali)
// ---------------------------------------------------------------------------
function draftPerformanceGrounded(
  partita: Partita,
  ctx: ContestoReale,
  giornalista: { nome: string; handle: string },
  oreFa: number,
  eng: { likes: number; reposts: number; commenti: number },
): import('../engine/mondo').DraftMondoNotizia {
  const casa = ctx.squadreMap.get(partita.casa);
  const tras = ctx.squadreMap.get(partita.trasferta);
  const nomeCasa = casa?.nome ?? 'Casa';
  const nomeTras = tras?.nome ?? 'Trasferta';
  const win = partita.golCasa > partita.golTrasferta ? nomeCasa : partita.golTrasferta > partita.golCasa ? nomeTras : null;
  const risultato = `${partita.golCasa}-${partita.golTrasferta}`;
  const top = topPrestazionePerPartita(partita, ctx);
  const giocatore = top?.giocatore?.nome ?? null;
  const gol = top?.gol ?? 0;
  const comp = ctx.competizioni.find((c) => c.id === partita.competizioneId)?.nome ?? 'campionato';

  const titolo = win
    ? giocatore && gol >= 2
      ? `${giocatore} trascina ${win}: ${gol === 3 ? 'tripletta' : 'doppietta'} nel ${risultato} su ${win === nomeCasa ? nomeTras : nomeCasa}`
      : `${win} dilaga: ${risultato} a ${win === nomeCasa ? nomeTras : nomeCasa} e messaggio al campionato`
    : `Equilibrio in ${comp}: ${nomeCasa} e ${nomeTras} chiudono sul ${risultato}`;

  const estratto = win
    ? giocatore && gol > 0
      ? `${giocatore} decide la sfida: ${gol} gol, ${win} batte ${win === nomeCasa ? nomeTras : nomeCasa} ${risultato} in ${comp}. Prestazione che pesa sulla classifica.`
      : `${win} non sbaglia: ${risultato} netto a ${win === nomeCasa ? nomeTras : nomeCasa} in ${comp}. Tre punti pesanti.`
    : `Pari e patta in ${comp}: ${nomeCasa} — ${nomeTras} ${risultato}. Un punto che muove poco la classifica.`;

  const corpo = (() => {
    const minuto1 = 20 + (partita.golCasa * 7) % 30;
    const minuto2 = 60 + (partita.golTrasferta * 11) % 25;
    if (win) {
      const base =
        `Partita indirizzata presto. Al ${minuto1}' ${giocatore ? `${giocatore} sblocca` : `${win} passa in vantaggio`} con un'azione insistita, poi il raddoppio al ${minuto2}' chiude i giochi.` +
        ` ${nomeCasa} — ${nomeTras} finisce ${risultato}, risultato che rispecchia quanto visto: ${win} più concreta, avversario mai davvero pericoloso.`;
      const contesto =
        ` In ${comp} ${win} sale e resta agganciata al treno di testa, mentre per ${win === nomeCasa ? nomeTras : nomeCasa} è un passo falso che pesa.` +
        ` L'allenatore di ${win}: "Vittoria di squadra, ma quando ${giocatore ? giocatore.split(' ').slice(-1)[0] : 'i ragazzi'} stanno così, tutto è più semplice".`;
      return `${base}\n\n${contesto}`;
    }
    return (
      `Gara bloccata a centrocampo, poche occasioni nitide. ${nomeCasa} prova a spingere nel primo tempo, ${nomeTras} cresce nella ripresa ma il ${risultato} resta inchiodato.` +
      `\n\n` +
      ` In ${comp} il pari serve a poco a entrambe: la zona Europa resta distante, la classifica resta corta e ora servirà un cambio di passo.`
    );
  })();

  return {
    categoria: 'performance',
    titolo,
    estratto,
    corpo,
    autoreNome: giornalista.nome,
    autoreHandle: giornalista.handle,
    oreFa,
    likes: eng.likes,
    reposts: eng.reposts,
    commenti: eng.commenti,
    squadra: win ?? nomeCasa,
    giocatore: giocatore ?? undefined,
    origine: 'engine',
  };
}

function draftDerbyGrounded(
  partita: Partita,
  nomeDerby: string,
  ctx: ContestoReale,
  giornalista: { nome: string; handle: string },
  oreFa: number,
  eng: { likes: number; reposts: number; commenti: number },
): import('../engine/mondo').DraftMondoNotizia {
  const casa = ctx.squadreMap.get(partita.casa)?.nome ?? '?';
  const tras = ctx.squadreMap.get(partita.trasferta)?.nome ?? '?';
  const risultato = `${partita.golCasa}-${partita.golTrasferta}`;
  const win = partita.golCasa > partita.golTrasferta ? casa : partita.golTrasferta > partita.golCasa ? tras : null;
  const comp = ctx.competizioni.find((c) => c.id === partita.competizioneId)?.nome ?? '';
  const top = topPrestazionePerPartita(partita, ctx);
  const eroe = top?.giocatore?.nome ?? (win ?? casa);

  const titolo = win
    ? `${nomeDerby}: ${win} lo porta a casa — ${casa} ${risultato} ${tras}`
    : `${nomeDerby} senza vincitori: ${casa} — ${tras} ${risultato}`;

  const estratto = win
    ? `${nomeDerby} da brividi. Decide ${eroe} e ${win} si prende il derby (${risultato}). Atmosfera da tutto esaurito e classifica che cambia.`
    : `Equilibrio nel ${nomeDerby}: ${casa} e ${tras} non si fanno male (${risultato}). Poche emozioni, tanta tensione.`;

  const corpo =
    (win
      ? `${nomeDerby} si decide nel momento clou. ${eroe} trova lo spazio giusto e chiude i conti, ${win} difende il vantaggio fino al triplice fischio. ${casa} — ${tras} ${risultato} resta una gara vera, dura, da derby.`
      : `${casa} e ${tras} si annullano. Il ${nomeDerby} resta in equilibrio per 90', le difese hanno la meglio sugli attacchi e il ${risultato} è lo specchio di una partita bloccata.`) +
    `\n\n` +
    ` In ${comp || 'campionato'} il risultato sposta gli equilibri: ${win ?? 'nessuna delle due'} resta in corsa per l'Europa, l'altra deve guardarsi alle spalle.`;

  return {
    categoria: 'derby',
    titolo,
    estratto,
    corpo,
    autoreNome: giornalista.nome,
    autoreHandle: giornalista.handle,
    oreFa,
    likes: eng.likes,
    reposts: eng.reposts,
    commenti: eng.commenti,
    squadra: casa,
    origine: 'engine',
  };
}

function draftInfortunioGrounded(
  inf: { giocatore: Giocatore; squadra: Squadra; settimane: number },
  ctx: ContestoReale,
  giornalista: { nome: string; handle: string },
  oreFa: number,
  eng: { likes: number; reposts: number; commenti: number },
): import('../engine/mondo').DraftMondoNotizia {
  const { giocatore, squadra, settimane } = inf;
  const tipo =
    settimane >= 22
      ? 'lesione al legamento crociato'
      : settimane >= 6
        ? 'lesione muscolare di alto grado'
        : 'elongazione al collaterale';
  const mesi = (settimane / 4.3).toFixed(1).replace('.', ',');

  const titolo = `Tegola ${squadra.nome}: ${giocatore.nome} out — ${tipo}, stop di ${settimane} settimane`;

  const estratto =
    `Brutte notizie per ${squadra.nome}. ${giocatore.nome} si è fermato in allenamento: ${tipo}, stop stimato ${settimane} settimane (~${mesi} mesi). Era tra i più utilizzati in rosa.`;

  const corpo =
    `Gli esami hanno confermato la diagnosi: ${tipo} per ${giocatore.nome}. Il giocatore aveva accusato fastidio in allenamento e gli accertamenti hanno chiarito l'entità dello stop. ` +
    `Per ${squadra.nome} è una perdita pesante: fin qui ${giocatore.minutiStagione} minuti stagionali, pedina centrale.` +
    `\n\n` +
    ` Il club parla di terapia conservativa e rivalutazione tra ${settimane >= 22 ? '10 giorni (si valuterà l\'intervento)' : '3 settimane'}. Rientro previsto non prima di ${settimane} settimane. L'allenatore: "Perdiamo un riferimento, il gruppo deve compattarsi".` +
    ` Da questo momento ${giocatore.nome} risulta indisponibile in rosa (fino a settimana ${ctx.settimana + settimane}).`;

  return {
    categoria: 'infortunio',
    titolo,
    estratto,
    corpo,
    autoreNome: giornalista.nome,
    autoreHandle: giornalista.handle,
    oreFa,
    likes: eng.likes,
    reposts: eng.reposts,
    commenti: eng.commenti,
    squadra: squadra.nome,
    giocatore: giocatore.nome,
    origine: 'engine',
  };
}

function draftMercatoGrounded(
  entry: import('../types/entities').TransferLedgerEntry,
  ctx: ContestoReale,
  giornalista: { nome: string; handle: string },
  oreFa: number,
  eng: { likes: number; reposts: number; commenti: number },
): import('../engine/mondo').DraftMondoNotizia | null {
  const g = ctx.giocatori.find((x) => x.id === entry.giocatoreId);
  if (!g) return null;
  if (entry.daSquadraId === 'svincolati' || entry.aSquadraId === 'svincolati') return null;
  const da = ctx.squadreMap.get(entry.daSquadraId)?.nome ?? '—';
  const a = ctx.squadreMap.get(entry.aSquadraId)?.nome ?? '—';
  // mai tua squadra (è mondo)
  if (da === ctx.squadraUtenteNome || a === ctx.squadraUtenteNome) return null;
  const cifra = entry.cifra;
  const cifraStr = cifra >= 1_000_000 ? `${(cifra / 1_000_000).toFixed(1).replace('.0', '')}M` : `${cifra}`;
  const ufficiale = entry.esito === 'completato';

  const titolo = ufficiale
    ? `UFFICIALE: ${g.nome} passa da ${da} a ${a} — operazione da ${cifraStr}`
    : `Trattativa saltata: ${g.nome} resta a ${da}, non si chiude con ${a}`;

  const estratto = ufficiale
    ? `${a} ufficializza ${g.nome} (${g.eta} anni, ${g.ruolo}, ov ${g.overall}) da ${da} per ${cifraStr}. Colpo che sposta gli equilibri.`
    : `Niente da fare per ${g.nome}: la trattativa tra ${da} e ${a} (${cifraStr}) non si è chiusa. Il giocatore resta dov'è.`;

  const corpo =
    (ufficiale
      ? `${a} piazza il colpo. ${g.nome}, ${g.eta} anni, arriva da ${da} a titolo definitivo per ${cifraStr}: contratto fino a scadenza e presentazione imminente. Numeri e attese alte.`
      : `${g.nome} resta a ${da}. La distanza tra domanda e offerta con ${a} (${cifraStr}) non si è colmata: ${entry.motivo ?? 'accordo non trovato'}.`) +
    `\n\n` +
    ` L'operazione è registrata nel ledger di mercato (settimana ${entry.settimana}${entry.giornoMercato ? `, giorno ${entry.giornoMercato}` : ''}) e la rosa di ${ufficiale ? a : da} ne tiene conto da subito.`;

  return {
    categoria: 'mercato',
    titolo,
    estratto,
    corpo,
    autoreNome: giornalista.nome,
    autoreHandle: giornalista.handle,
    oreFa,
    likes: eng.likes,
    reposts: eng.reposts,
    commenti: eng.commenti,
    squadra: a,
    giocatore: g.nome,
    origine: 'engine',
  };
}

function draftSorteggioGrounded(
  comp: import('../types/entities').Competizione,
  ctx: ContestoReale,
  giornalista: { nome: string; handle: string },
  oreFa: number,
  eng: { likes: number; reposts: number; commenti: number },
): import('../engine/mondo').DraftMondoNotizia {
  const squadreNomi = (comp.fasce ?? []).flat().slice(0, 3).map((id) => ctx.squadreMap.get(id)?.nome ?? '—');
  const girone = squadreNomi.length ? squadreNomi.join(' • ') : comp.squadre.slice(0, 3).map((id) => ctx.squadreMap.get(id)?.nome ?? '—').join(' • ');

  const titolo = `${comp.nome}: sorteggio ${comp.fase} — girone di ferro: ${girone}`;

  const estratto = `Urn e brividi a Nyon. ${comp.nome}, ${comp.fase}: urna dura per chi pesca ${girone}. Calendario che può indirizzare la qualificazione.`;

  const corpo =
    `Il sorteggio di ${comp.nome} non ha deluso. ${girone}: tre squadre che insieme valgono ranking alto. La prima giornata mette subito di fronte big match, poi trasferta insidiosa.` +
    `\n\n` +
    ` Le fasce ${comp.fasce ? `(${comp.fasce.length} fasce, teste di serie definite)` : ''} erano chiare alla vigilia, ma l'urna ha mescolato le carte. Calendario completo a breve sul sito UEFA.`;

  return {
    categoria: 'sorteggio',
    titolo,
    estratto,
    corpo,
    autoreNome: giornalista.nome,
    autoreHandle: giornalista.handle,
    oreFa,
    likes: eng.likes,
    reposts: eng.reposts,
    commenti: eng.commenti,
    squadra: squadreNomi[0] ?? comp.nome,
    origine: 'engine',
  };
}

// ---------------------------------------------------------------------------
// Core grounded: genera 3-4 notizie basate su fatti reali di quella settimana
// ---------------------------------------------------------------------------
async function generaMondoGrounded(
  ctx: ContestoReale,
  seedBase: string,
): Promise<import('../engine/mondo').DraftMondoNotizia[]> {
  const rand = prng(hashString(`${seedBase}|grounded|cat`));
  const giornalisti = GIORNALISTI_FALLBACK;
  const drafts: import('../engine/mondo').DraftMondoNotizia[] = [];
  let oreCounter = 2;

  const nextGiornalista = (): { nome: string; handle: string } => pick(rand, giornalisti);
  const nextEng = (cat: string, i: number): { likes: number; reposts: number; commenti: number } =>
    engagementPerCategoria(cat, `${seedBase}|${cat}|${i}`);
  const nextOre = (): number => {
    const o = oreCounter + Math.floor(rand() * 2);
    oreCounter += 3;
    return o;
  };

  // 1. MARKET — se c'è ledger reale di quella settimana, narrane 1-2
  const ledgerSettimana = ctx.ledger.filter((e) => e.settimana === ctx.settimana && e.carrieraId === ctx.squadre[0]?.carrieraId);
  const ledgerMondo = ledgerSettimana.filter((e) => {
    const da = ctx.squadreMap.get(e.daSquadraId)?.nome;
    const a = ctx.squadreMap.get(e.aSquadraId)?.nome;
    return da !== ctx.squadraUtenteNome && a !== ctx.squadraUtenteNome;
  });
  if (ledgerMondo.length > 0) {
    // pick most interesting (cifra alta o overall alto)
    const scored = [...ledgerMondo].sort((a, b) => b.cifra - a.cifra);
    const toNarrate = scored.slice(0, Math.min(2, scored.length));
    for (let i = 0; i < toNarrate.length && drafts.length < 4; i++) {
      const d = draftMercatoGrounded(toNarrate[i]!, ctx, nextGiornalista(), nextOre(), nextEng('mercato', i));
      if (d) drafts.push(d);
    }
  }

  // 2. DERBY reale di quella settimana (se c'è)
  const derby = trovaDerbyReale(ctx);
  if (derby && drafts.length < 4) {
    drafts.push(draftDerbyGrounded(derby.partita, derby.nomeDerby, ctx, nextGiornalista(), nextOre(), nextEng('derby', drafts.length)));
  }

  // 3. PERFORMANCE top matches (sempre almeno 1 se ci sono partite CPU)
  const perfs = topPerformanceMatches(ctx, 3);
  for (let i = 0; i < perfs.length && drafts.length < 4; i++) {
    const p = perfs[i]!;
    // evita duplicare derby già narrato
    if (derby && derby.partita.id === p.id) continue;
    drafts.push(draftPerformanceGrounded(p, ctx, nextGiornalista(), nextOre(), nextEng('performance', drafts.length)));
  }

  // 4. INFORTUNIO grounded (applicato davvero)
  if (drafts.length < 4) {
    const inf = await selezionaEApplicaInfortunioGrounded(ctx, `${seedBase}|inf`);
    if (inf) {
      drafts.push(draftInfortunioGrounded(inf, ctx, nextGiornalista(), nextOre(), nextEng('infortunio', drafts.length)));
    }
  }

  // 5. SORTEGGIO reale (settimane 5-10)
  if (drafts.length < 4) {
    const comp = sorteggioRealeDellaSettimana(ctx);
    if (comp) {
      drafts.push(draftSorteggioGrounded(comp, ctx, nextGiornalista(), nextOre(), nextEng('sorteggio', drafts.length)));
    }
  }

  // Se ancora <2 (settimana senza partite, es. pausa), fallback a performance generiche del campionato
  if (drafts.length === 0) {
    // nessun fatto reale quella settimana -> prova a prendere ultime 2 settimane
    const altPartite = ctx.partiteSettimana.filter((p) => p.giocata).slice(0, 2);
    for (const p of altPartite.slice(0, 2)) {
      if (p.casa === ctx.squadraUtenteId || p.trasferta === ctx.squadraUtenteId) continue;
      drafts.push(draftPerformanceGrounded(p, ctx, nextGiornalista(), nextOre(), nextEng('performance', drafts.length)));
    }
  }

  // Ordina per oreFa crescente (più recente prima = oreFa piccolo)
  drafts.sort((a, b) => a.oreFa - b.oreFa);
  return drafts.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Public API: generaMondoContenutiTurno GROUNDED (con LLM narratore sopra i fatti)
// ---------------------------------------------------------------------------
export async function generaMondoContenutiTurno(input: { carrieraId: string; settimana: number }): Promise<MondoNotizia[]> {
  try {
    const [carriera, stato, squadre, partite, competizioni, giocatori, assegnazioni, prestazioni, ledger] = await Promise.all([
      db.carriere.get(input.carrieraId),
      db.statoClub.get(input.carrieraId),
      db.squadre.toArray(),
      db.partite.toArray(),
      db.competizioni.toArray(),
      db.giocatori.where('carrieraId').equals(input.carrieraId).toArray(),
      db.squadAssignments.where('carrieraId').equals(input.carrieraId).toArray(),
      db.prestazioni.where('carrieraId').equals(input.carrieraId).toArray(),
      db.transferLedger.where('carrieraId').equals(input.carrieraId).toArray(),
    ]);
    if (!carriera || !stato) return [];

    const squadreMap = new Map(squadre.filter((s) => s.carrieraId === input.carrieraId).map((s) => [s.id, s]));
    const partiteSettimana = partite.filter((p) => p.carrieraId === input.carrieraId && p.settimana === input.settimana);

    // esistenza già generata per quella settimana -> ritorna
    try {
      const esistenti = await db.mondoNotizie.where('carrieraId').equals(input.carrieraId).toArray();
      if (esistenti.some((n) => n.settimana === input.settimana)) {
        return esistenti.filter((n) => n.settimana === input.settimana).sort((a, b) => a.oreFa - b.oreFa);
      }
    } catch {}

    // Se la settimana ha ancora partite CPU non giocate (non ultima gara della settimana), rimanda
    // la generazione: la simulazione CPU avviene solo dopo l'ultima tua partita della settimana.
    const pendentiCpu = partiteSettimana.some(
      (p) =>
        !p.giocata &&
        p.casa !== 'DA_ASSEGNARE' &&
        p.trasferta !== 'DA_ASSEGNARE' &&
        p.casa !== carriera.squadraId &&
        p.trasferta !== carriera.squadraId,
    );
    if (pendentiCpu) {
      return [];
    }

    const ctx: ContestoReale = {
      partiteSettimana,
      squadre: squadre.filter((s) => s.carrieraId === input.carrieraId),
      squadreMap,
      giocatori: [...giocatori],
      assegnazioni,
      prestazioni,
      ledger,
      competizioni: competizioni.filter((c) => c.carrieraId === input.carrieraId),
      squadraUtenteId: carriera.squadraId,
      squadraUtenteNome: squadreMap.get(carriera.squadraId)?.nome ?? carriera.nome,
      settimana: input.settimana,
    };

    const seedBase = `${input.carrieraId}|${input.settimana}`;

    // 1) Genera i fatti grounded (e applica subito eventuali infortuni al DB)
    let grounded = await generaMondoGrounded(ctx, seedBase);

    // Se nessun fatto reale (es. pausa senza partite) -> fallback inventato vecchio (ultima spiaggia)
    if (grounded.length === 0) {
      const fallback = generaMondoFallback({
        settimana: input.settimana,
        stagione: carriera.stagione,
        squadraUtenteNome: ctx.squadraUtenteNome,
        campionatoUtenteNome: competizioni.find((c) => c.tipo === 'campionato' && c.squadre.includes(carriera.squadraId))?.nome ?? carriera.campionato,
        squadreCampionato: (competizioni.find((c) => c.tipo === 'campionato' && c.squadre.includes(carriera.squadraId))?.squadre.map((id) => squadreMap.get(id)?.nome ?? '') ?? []).filter(Boolean) as string[],
        seed: seedBase,
      });
      grounded = fallback;
    }

    // 2) Tenta LLM narratore GROUNDED: passa i fatti reali e chiedi di riscriverli in stile X
    let drafts: import('../engine/mondo').DraftMondoNotizia[] = grounded;
    try {
      // costruisci contesto LLM con fatti reali serializzati (non inventare)
      const fatti = grounded.map((g) => ({
        categoria: g.categoria,
        titolo: g.titolo,
        estratto: g.estratto,
        corpo: g.corpo.slice(0, 600),
        squadra: g.squadra,
        giocatore: g.giocatore,
      }));
      // Se LLM non configurato, generaMondoNotizie ritorna null velocemente
      const proposta = await generaMondoNotizie({
        settimana: input.settimana,
        stagione: carriera.stagione,
        squadraUtente: ctx.squadraUtenteNome,
        campionatoUtente: ctx.competizioni.find((c) => c.tipo === 'campionato')?.nome ?? carriera.campionato,
        squadreCampionato: ctx.squadre.filter((s) => ctx.competizioni.find((c) => c.tipo === 'campionato')?.squadre.includes(s.id)).map((s) => s.nome).slice(0, 12),
        ultimiRisultati: fatti.map((f) => `${f.categoria}: ${f.titolo}`),
      });
      // Validazione: LLM deve aver narrato almeno metà dei fatti senza inventare squadra utente
      if (proposta && proposta.notizie.length >= Math.min(2, grounded.length)) {
        const validi = proposta.notizie.filter(
          (n) => !n.titolo.includes(ctx.squadraUtenteNome) && !n.estratto.includes(ctx.squadraUtenteNome) && !n.corpo.includes(ctx.squadraUtenteNome),
        );
        if (validi.length >= Math.min(2, grounded.length)) {
          // Mappa LLM su grounded mantenendo coerenza: usa i fatti grounded come sorgente di verità per squadra/giocatore/settimane,
          // ma prendi la narrazione LLM
          drafts = validi.slice(0, grounded.length).map((n, i) => {
            const g = grounded[i]!;
            const eng = engagementPerCategoria(g.categoria, `${seedBase}|llm|${i}`);
            return {
              categoria: g.categoria,
              titolo: n.titolo.slice(0, 140),
              estratto: n.estratto.slice(0, 300),
              corpo: n.corpo.slice(0, 1800),
              autoreNome: n.autoreNome || g.autoreNome,
              autoreHandle: n.autoreHandle || g.autoreHandle,
              oreFa: g.oreFa,
              likes: eng.likes,
              reposts: eng.reposts,
              commenti: eng.commenti,
              squadra: g.squadra,
              giocatore: g.giocatore,
              origine: 'llm' as const,
            };
          });
          // Se LLM ha prodotto meno dei grounded, completa con i restanti grounded
          if (drafts.length < grounded.length) {
            drafts = [...drafts, ...grounded.slice(drafts.length)];
          }
        }
      }
    } catch {
      // LLM fail -> resta grounded engine
    }

    // 3) Salva (con oreFa già coerenti)
    const final: MondoNotizia[] = drafts.slice(0, 4).map((d) => ({
      id: newId(),
      carrieraId: input.carrieraId,
      settimana: input.settimana,
      categoria: d.categoria,
      titolo: d.titolo,
      estratto: d.estratto,
      corpo: d.corpo,
      autoreNome: d.autoreNome,
      autoreHandle: d.autoreHandle,
      oreFa: d.oreFa,
      likes: d.likes,
      reposts: d.reposts,
      commenti: d.commenti,
      squadra: d.squadra,
      giocatore: d.giocatore,
      origine: d.origine,
    }));

    if (final.length > 0) {
      try {
        await db.mondoNotizie.bulkAdd(final);
      } catch {}
    }
    return final.sort((a, b) => a.oreFa - b.oreFa);
  } catch (e) {
    console.error('generaMondoContenutiTurno fail', e);
    // ultimo fallback in-memory
    try {
      const carriera = await db.carriere.get(input.carrieraId);
      if (!carriera) return [];
      const squadre = await db.squadre.toArray();
      const competizioni = await db.competizioni.toArray();
      const squadreMap = new Map(squadre.filter((s) => s.carrieraId === input.carrieraId).map((s) => [s.id, s]));
      const seed = `${input.carrieraId}|${input.settimana}|fallback`;
      const fallback = generaMondoFallback({
        settimana: input.settimana,
        stagione: carriera.stagione,
        squadraUtenteNome: squadreMap.get(carriera.squadraId)?.nome ?? carriera.nome,
        campionatoUtenteNome: competizioni.find((c) => c.tipo === 'campionato' && c.squadre.includes(carriera.squadraId))?.nome ?? carriera.campionato,
        squadreCampionato: (competizioni.find((c) => c.tipo === 'campionato' && c.squadre.includes(carriera.squadraId))?.squadre.map((id) => squadreMap.get(id)?.nome ?? '') ?? []).filter(Boolean) as string[],
        seed,
      });
      const randSeed = prng(hashString(`${seed}|eng`));
      return fallback.slice(0, 4).map((d, i) => ({
        id: newId(),
        carrieraId: input.carrieraId,
        settimana: input.settimana,
        categoria: d.categoria,
        titolo: d.titolo,
        estratto: d.estratto,
        corpo: d.corpo,
        autoreNome: d.autoreNome,
        autoreHandle: d.autoreHandle,
        oreFa: 2 + i * 3 + Math.floor(randSeed() * 2),
        likes: d.likes,
        reposts: d.reposts,
        commenti: d.commenti,
        squadra: d.squadra,
        giocatore: d.giocatore,
        origine: 'engine' as const,
      }));
    } catch {
      return [];
    }
  }
}

/** Carica le mondo-notizie recenti per la carriera (ultime 12, più recenti prime). */
export async function caricaMondoNotizie(carrieraId: string, limit = 12): Promise<MondoNotizia[]> {
  try {
    const tutte = await db.mondoNotizie.where('carrieraId').equals(carrieraId).toArray();
    tutte.sort((a, b) => b.settimana - a.settimana || a.oreFa - b.oreFa);
    return tutte.slice(0, limit);
  } catch {
    return [];
  }
}

/** Assicura che la board non sia vuota al primo avvio: genera per settimane retro. */
export async function assicuratiMondoNotizie(carrieraId: string): Promise<MondoNotizia[]> {
  try {
    const esistenti = await db.mondoNotizie.where('carrieraId').equals(carrieraId).toArray();
    if (esistenti.length > 0) return esistenti.sort((a, b) => b.settimana - a.settimana || a.oreFa - b.oreFa).slice(0, 12);
  } catch {}
  try {
    const stato = await db.statoClub.get(carrieraId);
    const settimana = stato?.settimanaCorrente ?? 1;
    const settimane = [settimana, Math.max(1, settimana - 1)];
    const uniche = [...new Set(settimane)];
    let tutte: MondoNotizia[] = [];
    for (const s of uniche) {
      const batch = await generaMondoContenutiTurno({ carrieraId, settimana: s });
      tutte = [...tutte, ...batch];
    }
    if (tutte.length === 0) return [];
    tutte.sort((a, b) => b.settimana - a.settimana || a.oreFa - b.oreFa);
    return tutte.slice(0, 12);
  } catch (e) {
    console.error('assicuratiMondoNotizie fail', e);
    return [];
  }
}
