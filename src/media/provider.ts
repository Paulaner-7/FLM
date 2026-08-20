// FLM — Provider media esterni (TheSportsDB, free key pubblica).
// Lookup per nome (decisione D5/D6): nessun mapping pesId. Solo LETTURA remota;
// la persistenza del mapping passa da src/db (tabella media, regola 1 AGENTS.md).
// Verifica fonte: API v1 TheSportsDB, CORS aperto, testata 2026-08 (curl, 200).

const API = 'https://www.thesportsdb.com/api/v1/json/3';
const TIMEOUT_MS = 8000;

/** Nazioni FLM (italiano) → paese provider (inglese), per disambiguazione. */
const PAESE_PROVIDER: Record<string, string> = {
  italia: 'Italy',
  spagna: 'Spain',
  inghilterra: 'England',
  germania: 'Germany',
  francia: 'France',
  portogallo: 'Portugal',
  'paesi bassi': 'Netherlands',
  belgio: 'Belgium',
  turchia: 'Turkey',
  scozia: 'Scotland',
  austria: 'Austria',
  svizzera: 'Switzerland',
  grecia: 'Greece',
  danimarca: 'Denmark',
  norvegia: 'Norway',
  svezia: 'Sweden',
  polonia: 'Poland',
  'repubblica ceca': 'Czech Republic',
  croazia: 'Croatia',
  serbia: 'Serbia',
  ucraina: 'Ukraine',
  russia: 'Russia',
  argentina: 'Argentina',
  brasile: 'Brazil',
  'stati uniti': 'United States',
  messico: 'Mexico',
  'arabia saudita': 'Saudi Arabia',
  giappone: 'Japan',
  'corea del sud': 'South Korea',
  australia: 'Australia',
};

export interface MediaTrovato {
  url: string;
  nomeProvider: string;
}

/** Normalizza per chiave cache e confronti: minuscole, senza diacritici. */
export function normalizzaChiave(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function paeseProvider(nazione?: string): string | null {
  if (!nazione) return null;
  return PAESE_PROVIDER[normalizzaChiave(nazione)] ?? null;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null; // offline, timeout, provider down: il chiamante usa il fallback
  }
}

interface TsdbTeam {
  strTeam?: string;
  strCountry?: string;
  strBadge?: string;
}

interface TsdbPlayer {
  strPlayer?: string;
  strTeam?: string;
  strCutout?: string;
  strThumb?: string;
}

interface TsdbLeague {
  strLeague?: string;
  strBadge?: string;
}

/** Alias manuali per squadre con nome export diverso dal provider (es. Pisa SC → Pisa). */
const ALIAS_SQUADRA: Record<string, string> = {
  'pisa sporting club': 'Pisa',
  'pisa sc': 'Pisa',
  'acf fiorentina': 'Fiorentina',
  'fiorentina acf': 'Fiorentina',
};

/** Varianti di ricerca: nome pieno, alias, poi senza prefissi societari comuni. */
function variantiNomeSquadra(nome: string): string[] {
  const chiave = normalizzaChiave(nome);
  const alias = ALIAS_SQUADRA[chiave];
  const varianti: string[] = [nome];
  if (alias && alias !== nome) varianti.push(alias);
  const pulito = nome.replace(/\b(FC|AC|AS|SS|SC|UD|US|CF|AFC|SSC)\b\.?/gi, '').replace(/\s+/g, ' ').trim();
  if (pulito && pulito !== nome && !varianti.includes(pulito)) varianti.push(pulito);
  if (alias) {
    const pulitoAlias = alias.replace(/\b(FC|AC|AS|SS|SC|UD|US|CF|AFC|SSC)\b\.?/gi, '').replace(/\s+/g, ' ').trim();
    if (pulitoAlias && !varianti.includes(pulitoAlias)) varianti.push(pulitoAlias);
  }
  // Fallback aggiuntivo: prova solo prima parola significativa (es. "Pisa" da "Pisa Sporting Club")
  const primaParola = nome.split(/\s+/)[0]?.trim();
  if (primaParola && primaParola.length >= 3 && !varianti.includes(primaParola)) varianti.push(primaParola);
  return varianti;
}

function scegliSquadra(risultati: TsdbTeam[], nome: string, paese: string | null): TsdbTeam | null {
  const target = normalizzaChiave(nome);
  const conBadge = risultati.filter((t) => t.strBadge);
  if (conBadge.length === 0) return null;
  const esatto = conBadge.filter((t) => normalizzaChiave(t.strTeam ?? '') === target);
  const candidati = esatto.length > 0 ? esatto : conBadge;
  if (paese) {
    const delPaese = candidati.filter((t) => normalizzaChiave(t.strCountry ?? '') === normalizzaChiave(paese));
    if (delPaese.length > 0) return delPaese[0] ?? null;
  }
  return candidati[0] ?? null;
}

/** Logo squadra per nome (+ nazione per disambiguare omonimi). null = non trovato. */
export async function cercaLogoSquadra(nome: string, nazione?: string): Promise<MediaTrovato | null> {
  const paese = paeseProvider(nazione);
  for (const variante of variantiNomeSquadra(nome)) {
    const data = await getJson<{ teams?: TsdbTeam[] | null }>(
      `${API}/searchteams.php?t=${encodeURIComponent(variante)}`,
    );
    const scelta = scegliSquadra(data?.teams ?? [], nome, paese);
    if (scelta?.strBadge) return { url: scelta.strBadge, nomeProvider: scelta.strTeam ?? nome };
  }
  return null;
}

/** Volto giocatore (cutout PNG trasparente). null = non trovato. */
export async function cercaVoltoGiocatore(nome: string, nomeSquadra?: string): Promise<MediaTrovato | null> {
  const data = await getJson<{ player?: TsdbPlayer[] | null }>(
    `${API}/searchplayers.php?p=${encodeURIComponent(nome)}`,
  );
  const conFoto = (data?.player ?? []).filter((p) => p.strCutout || p.strThumb);
  if (conFoto.length === 0) return null;
  let scelta: TsdbPlayer | undefined;
  if (nomeSquadra) {
    const target = normalizzaChiave(nomeSquadra);
    scelta = conFoto.find((p) => {
      const teamProvider = normalizzaChiave(p.strTeam ?? '');
      return teamProvider === target || teamProvider.includes(target) || target.includes(teamProvider);
    });
  }
  scelta ??= conFoto[0];
  const url = scelta?.strCutout || scelta?.strThumb;
  return url ? { url, nomeProvider: scelta?.strPlayer ?? nome } : null;
}

/**
 * Logo competizione. I nomi FLM sono brevi ("Serie A"), il provider usa
 * "Italian Serie A": si cerca per paese e si matcha per suffisso/prefisso.
 */
export async function cercaLogoCompetizione(nome: string, nazione?: string): Promise<MediaTrovato | null> {
  const paese = paeseProvider(nazione);
  if (!paese) return null;
  const data = await getJson<{ countries?: TsdbLeague[] | null }>(
    `${API}/search_all_leagues.php?c=${encodeURIComponent(paese)}&s=Soccer`,
  );
  const leghe = (data?.countries ?? []).filter((l) => l.strBadge);
  const target = normalizzaChiave(nome);
  const match = leghe.find((l) => {
    const candidato = normalizzaChiave(l.strLeague ?? '');
    return candidato === target || candidato.endsWith(target) || candidato.includes(target);
  });
  return match?.strBadge ? { url: match.strBadge, nomeProvider: match.strLeague ?? nome } : null;
}
