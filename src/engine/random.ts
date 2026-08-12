// FLM — PRNG deterministico condiviso (semi dagli ID, mai Math.random).
// Regola 3 AGENTS.md: funzioni PURE e deterministiche.
// Stesso PRNG per calendario (shuffle) e simulazione risultati CPU (Poisson):
// a parità di input, stesso output — risultati rigenerabili e testabili.

/** Hash numerico stabile da stringa (FNV-1a) — non crittografico, solo seeding. */
export function hashString(valore: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < valore.length; i++) {
    hash ^= valore.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** PRNG deterministico (mulberry32): ritorna un generatore di uniformi in [0,1). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Campiona un numero di gol da una distribuzione di Poisson con media lambda.
 * Implementazione inverse-CDF: uniforme u → trova il minimo k con CDF(k) ≥ u.
 * Deterministico se il generatore lo è. Cap a 9 gol: oltre è trascurabile
 * (P(X≥10) con λ=3 ≈ 0.0003, e il cap rende finito il ciclo).
 */
export function poisson(rand: () => number, lambda: number): number {
  if (lambda <= 0) return 0;
  const cap = 9;
  const u = rand();
  let p = Math.exp(-lambda);
  let cdf = p;
  if (u <= cdf) return 0;
  for (let k = 1; k < cap; k++) {
    p *= lambda / k;
    cdf += p;
    if (u <= cdf) return k;
  }
  return cap;
}
