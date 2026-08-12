// FLM — Motore di gioco (Opzione A: moduli di funzioni pure)
// Regola 3 AGENTS.md: qui vivono TUTTE le regole deterministiche del gioco.
// Le funzioni sono pure: stato in ingresso → nuovo stato in uscita, nessuno stato interno.
// In M0 esiste solo il nucleo di regole e validazione; i moduli di calcolo
// (classifica, morale, fiducia) arrivano con M1/M2.

export * from './rules';
export * from './invariants';
export * from './calendario';
export * from './carriera';
export * from './classifica';
export * from './referto';
export * from './rating';
export * from './storico';
