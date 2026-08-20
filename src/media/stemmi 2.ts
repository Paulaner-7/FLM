// FLM — Stemmi e avatar generati (fallback deterministico, zero rete).
// Scudo SVG dai colori sociali reali (Squadra.colori dal CSV FL26) + monogramma.
// Copre: squadre fittizie FL26, miss del provider, offline (decisione D15).

const COLORI_DEFAULT = { primario: '#d96943', secondario: '#0b1722' };

/** Luminanza relativa 0-1 (WCAG): per scegliere il colore del testo sopra. */
export function luminanza(hex: string): number {
  const canali = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lineari = canali.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (lineari[0] ?? 0) + 0.7152 * (lineari[1] ?? 0) + 0.0722 * (lineari[2] ?? 0);
}

/** Testo leggibile sopra un colore: carta chiara o inchiostro scuro. */
export function testoSu(hex: string): string {
  return luminanza(hex) > 0.35 ? '#0b1722' : '#e9e6dc';
}

/** Monogramma da nome squadra: iniziali delle parole significative, max 3. */
export function monogramma(nome: string): string {
  const stop = new Set(['fc', 'ac', 'as', 'ss', 'sc', 'ud', 'us', 'cf', 'afc', 'ssc', 'de', 'del', 'della', 'di']);
  const parole = nome
    .split(/\s+/)
    .map((p) => p.replace(/[^A-Za-zÀ-ÿ]/g, ''))
    .filter((p) => p.length > 0 && !stop.has(p.toLowerCase()));
  const base = parole.length > 0 ? parole : [nome];
  return base
    .slice(0, 3)
    .map((p) => (p[0] ?? '').toUpperCase())
    .join('');
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Stemma scudo: fondo secondario, banda verticale primaria, monogramma.
 * Forma classica da crest calcistico: scudo con punta.
 */
export function stemmaSquadra(nome: string, colori?: { primario: string; secondario: string }): string {
  const primario = colori?.primario ?? COLORI_DEFAULT.primario;
  const secondario = colori?.secondario ?? COLORI_DEFAULT.secondario;
  const sigla = monogramma(nome);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 112">
  <path d="M48 4 90 16v44c0 26-18.6 42.6-42 48C24.6 102.6 6 86 6 60V16Z" fill="${secondario}"/>
  <path d="M48 4 90 16v44c0 26-18.6 42.6-42 48Z" fill="${primario}"/>
  <path d="M48 4 90 16v44c0 26-18.6 42.6-42 48C24.6 102.6 6 86 6 60V16Z" fill="none" stroke="${primario}" stroke-width="4"/>
  <text x="48" y="66" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="${sigla.length > 2 ? 26 : 32}" font-weight="800" letter-spacing="1" fill="${testoSu(secondario)}">${sigla}</text>
</svg>`;
  return svgDataUri(svg);
}

/**
 * Avatar giocatore: tondo colori squadra + iniziali (stile maglia broadcast).
 * Nessun volto finto: monogramma, mai fotorealismo inventato (decisione D5).
 */
export function avatarGiocatore(nome: string, colori?: { primario: string; secondario: string }): string {
  const primario = colori?.primario ?? COLORI_DEFAULT.primario;
  const secondario = colori?.secondario ?? COLORI_DEFAULT.secondario;
  const parti = nome.trim().split(/\s+/);
  const iniziali = `${parti[0]?.[0] ?? ''}${parti.length > 1 ? (parti[parti.length - 1]?.[0] ?? '') : ''}`.toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <circle cx="48" cy="48" r="46" fill="${secondario}" stroke="${primario}" stroke-width="4"/>
  <text x="48" y="61" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="34" font-weight="800" fill="${testoSu(secondario)}">${iniziali}</text>
</svg>`;
  return svgDataUri(svg);
}

/** Coccarda competizione: cerchio con sigla (fallback loghi di lega/coppa). */
export function stemmaCompetizione(nome: string): string {
  const sigla = monogramma(nome);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <circle cx="48" cy="48" r="44" fill="none" stroke="#d96943" stroke-width="5"/>
  <circle cx="48" cy="48" r="34" fill="#142838"/>
  <text x="48" y="59" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="${sigla.length > 2 ? 20 : 26}" font-weight="800" fill="#e9e6dc">${sigla}</text>
</svg>`;
  return svgDataUri(svg);
}
