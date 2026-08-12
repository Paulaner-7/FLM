# FLM — Football Life Manager

Simulatore di carriera allenatore **local-first** per Football Life 26 (FL26):
le partite si giocano in FL26, FLM gestisce tutto il resto (stagione, morale, mercato,
eventi, narrativa via LLM).

**Fonte di verità: `docs/PRD.md`** — prevale su qualsiasi altra interpretazione.
Prima di implementare una feature, rileggi la sezione del PRD relativa.

## Regole permanenti

1. **Persistenza solo via Dexie** — ogni dato persistente passa da Dexie (IndexedDB) in `src/db`.
   Mai `localStorage`/`sessionStorage` diretto.
2. **LLM isolato in `src/llm`** — le chiamate a API LLM vivono SOLO in `src/llm`.
   Il resto dell'app usa esclusivamente le funzioni esposte da quel modulo.
3. **Numeri solo da `src/engine`** — classifica, morale, fiducia, budget e ogni numero di gioco
   sono calcolati SOLO da `src/engine`, con funzioni pure e regole deterministiche.
   L'LLM produce solo testo e proposte: gli effetti proposti vengono validati e applicati dall'engine.
4. **Schema dati = PRD** — ogni tabella e tipo corrisponde alle entità del PRD (sezione 3.4 e 7.2):
   `Squadra`, `Giocatore`, `Partita`, `StatoClub`, `Evento` (+ registri v2 quando previsti).
   Tipi in `src/types/entities.ts`, schema Dexie in `src/db/database.ts`.
5. **TypeScript strict** — `strict: true` sempre attivo; ogni entità del modello dati ha un tipo
   esplicito; vietato `any` sul modello dati.

## Convenzioni

- UI in italiano; identificatori di codice in inglese (camelCase); nomi delle entità come nel PRD.
- Nessun backend, nessun routing esterno, nessun account: tutto gira nel browser.
- Il ponte dati con PES Editor (CSV formato editor + report leggibili per il fallback manuale)
  vive in `src/bridge`: legge da Dexie, non scrive (PRD 7.4).
- L'LLM non decide mai valori finali: numeri coerenti garantiti dal motore (PRD 3.1).
- `npm run dev` per avviare l'app; `npm run build` per verificare tipi e build.
