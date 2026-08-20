// FLM — Accento dinamico di club (decisione D8).
// L'accento della UI carriera = colore sociale reale dal CSV FL26.
// Guardrail contrasto: colori troppo scuri spariscono su navy → si schiariscono.

import { luminanza, testoSu } from '../../media/stemmi';

/** Mix hex1→hex2 (peso 0-1 verso hex2). */
export function mischia(hex1: string, hex2: string, peso: number): string {
  const c = (h: string, i: number): number => parseInt(h.slice(i, i + 2), 16);
  const canali = [1, 3, 5].map((i) => Math.round(c(hex1, i) + (c(hex2, i) - c(hex1, i)) * peso));
  return `#${canali.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Accento utilizzabile su fondo scuro: se il primario è quasi nero
 * (luminanza < 0.07) lo schiarisce verso carta; la variante "strong"
 * è sempre più chiara del 22% per hover/testo.
 */
export function accentiDaColori(colori?: { primario: string; secondario: string }): { accent: string; accentStrong: string; onAccent: string } {
  const DEFAULT = { accent: '#d96943', accentStrong: '#f08b5d', onAccent: '#0b1722' };
  if (!colori) return DEFAULT;
  let accent = colori.primario;
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) return DEFAULT;
  if (luminanza(accent) < 0.07) accent = mischia(accent, '#e9e6dc', 0.55);
  return { accent, accentStrong: mischia(accent, '#e9e6dc', 0.22), onAccent: testoSu(accent) };
}
