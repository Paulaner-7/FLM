// FLM — Connettività LLM (PRD 8.2, online-first)
// Stato condiviso { online, ultimoCheck } con probe TTL 30s, retry 15s quando offline,
// pattern subscribe/notify per la UI. Probe riusa le funzioni esistenti in src/llm.

export interface StatoConnettivita {
  online: boolean;
  ultimoCheck: number;
}

const TTL_MS = 30_000;
const RETRY_OFFLINE_MS = 15_000;

let stato: StatoConnettivita = { online: true, ultimoCheck: 0 };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<boolean> | null = null;

export function getStato(): StatoConnettivita {
  return { ...stato };
}

export function isOnline(): boolean {
  return stato.online;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const l of listeners) l();
}

function scheduleNext(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  const delay = stato.online ? TTL_MS : RETRY_OFFLINE_MS;
  timer = setInterval(() => {
    void probe(true);
  }, delay);
}

/**
 * Probe leggero che riusa le funzioni esistenti in src/llm (elencaModelliDisponibili).
 * Evita import statico circolare tramite import dinamico.
 */
export async function probe(force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && stato.ultimoCheck !== 0 && now - stato.ultimoCheck < TTL_MS) {
    return stato.online;
  }
  if (inFlight) return inFlight;
  inFlight = (async (): Promise<boolean> => {
    try {
      // Import dinamico per riusare funzione esistente senza ciclo statico
      const { elencaModelliDisponibili } = await import('./index');
      const esito = await elencaModelliDisponibili();
      const online = esito.ok;
      stato = { online, ultimoCheck: Date.now() };
      notify();
      scheduleNext();
      return online;
    } catch {
      stato = { online: false, ultimoCheck: Date.now() };
      notify();
      scheduleNext();
      return false;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Guardia online-first (PRD 8.2): verifica connettività prima di qualsiasi
 * scrittura che avanza il gioco. TTL 30s: se scaduto, forza un probe.
 * Offline = throw prima di toccare Dexie, la UI mostra il banner.
 */
export async function assertLLMDisponibile(): Promise<void> {
  const now = Date.now();
  if (stato.ultimoCheck === 0 || now - stato.ultimoCheck > TTL_MS) {
    await probe(true);
  }
  if (!stato.online) {
    throw new Error('LLM non disponibile: FLM è in pausa. Riprova quando torna la connessione.');
  }
}

/** Avvia il polling automatico (chiamato da App.tsx al mount). */
export function avviaMonitoraggio(): void {
  void probe(true);
}

/** Ferma il polling (per test). */
export function fermaMonitoraggio(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Forza stato per test (scripts/verify-*.ts). */
export function _setStatoForTest(s: StatoConnettivita): void {
  stato = { ...s };
  notify();
  scheduleNext();
}

export function _resetForTest(): void {
  stato = { online: true, ultimoCheck: 0 };
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  inFlight = null;
  listeners.clear();
}
