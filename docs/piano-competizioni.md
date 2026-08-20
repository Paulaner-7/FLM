# Piano — Motore Competizioni Multi-torneo (template parametrico PRD 7.1)

Stato: decisioni concordate con l'utente (grilling completato). Fonte di verità: `docs/PRD.md` §7.1.
Questo piano è il contratto di implementazione della milestone; ogni scostamento va riportato qui.

## Decisioni chiave (riepilogo vincolante)

| # | Decisione |
|---|---|
| D1 | Date reali nel calendario (non settimane astratte). File ancore per stagione. |
| D2 | Multi-competizione solo per leghe UEFA; extra-UEFA (Brasileirão, Liga Profesional, J1, Saudi) e lega demo restano solo-campionato. |
| D3 | Prima carriera = stagione **2026/27**; seed da dati reali **2025/26** (classifiche finali, vincitori coppe, campioni in carica). |
| D4 | Ancora date: big-5 (Serie A, PL, La Liga, Bundesliga, Ligue 1) + UEFA esatte; leghe UEFA minori = template generico con stesse pause FIFA. |
| D5 | Settimana atomica: `Partita.settimana` + slot (`weekend`/`infrasettimanale`). Avanza quando tutte le mie partite della settimana sono giocate; settimane vuote auto-simulate a salti. CPU simulate in blocco all'avanzamento. |
| D6 | Competizioni in milestone: Campionato (refactor), Coppa nazionale (12 nazioni, girano tutte), Supercoppa, UCL, UEL, UECL. Nazionali fuori (M5). |
| D7 | Qualificazioni: SOLO l'ultimo turno (playoff andata/ritorno) per UCL/UEL/UECL, giocabile se mi coinvolge. Zero squadre ombra: i club reali assenti da FL26 vengono sostituiti con club FL26 giocabili (nazione prima, forza dopo). |
| D8 | League phase reale 2024+: 36 squadre, 8 partite (UCL/UEL) / 6 (UECL), fasce per coefficiente, vincoli nazione (mai stessa nazione, max 2 avversarie da stessa altra nazione), top 8 dirette / 9-24 playoff / 25-36 eliminate, tabellone a posizioni, niente retrocessioni tra coppe. Algoritmi e formule studiati su fonti reali. |
| D9 | Eliminazione diretta: andata/ritorno in Europa (finale secca, neutra), coppa nazionale secca (top 8 per piazzamento reale 2025/26 agli ottavi). Niente gol in trasferta: pari 180' → supplementari + rigori. Rigori CPU = 50/50 con seme deterministico. |
| D10 | Coefficiente: init derivato dal rating Elo; aggiornamento reale semplificato (league phase 2/1 pt, tabellone 1/0,5 pt, bonus turno per competizione, finestra 5 stagioni). Coppa nazionale non alimenta. |
| D11 | Sorteggi automatici deterministici + schermata report. Tutti generati upfront alla creazione stagione. |
| D12 | Referto **immutabile** dopo l'invio: `annullaReferto` e rollback ELIMINATI; "torna indietro" solo dalla schermata referto prima dell'invio. Validazione bloccante (elenco §4). |
| D13 | Eventi giocatore CPU: perimetro = mia lega + coppe europee + mia coppa nazionale (altre leghe e altre coppe: solo livello squadra). Gol/assist/gialli/rossi/voti con minuti, tabella `PrestazionePartita`. Formula su dati reali. Passivi ora; attivi su overall in milestone futura. |
| D14 | Fine stagione: vincitori registrati su `Competizione`, riepilogo + accessi stagione dopo + rollover. Promozioni/retrocessioni → prossima milestone. Invecchiamento/vivaio → sua milestone. |
| D15 | UI: Home (prossima partita cross-competizione con date), Referto esteso, Hub Competizioni (+ classifiche speciali), Calendario stagionale, RisultatiTurno (senza annulla), Fine stagione. |

## 0. Verifica web preliminare (regola 6 AGENTS.md — OBBLIGATORIA prima del codice)

Ogni voce = dati reali + fonte registrata nel file dati corrispondente.

1. **Calendario UEFA 2026/27**: date matchday 1-8 league phase (UCL/UEL/UECL), playoff, ottavi→finale; sedi finali.
2. **Date campionati big-5 2026/27**: inizio/fine; pause (FIFA windows settembre/ottobre/novembre/marzo, sosta invernale dove esiste).
3. **Regolamento UEFA 2024+**: struttura league phase, vincoli sorteggio, criteri classifica league phase (ordine esatto tiebreaker), tabellone posizioni, regole andata/ritorno e finali.
4. **Algoritmo sorteggio league phase reale** (come avviene il draw vincolato: fasce, vincoli nazione, max 2 da stessa nazione): documentare la procedura esatta da riprodurre con backtracking deterministico.
5. **Coefficienti UEFA reali**: punti per risultato per fase e competizione, bonus di turno, finestra 5 anni.
6. **Access list 2026/27** per ciascuna delle 12 leghe UEFA giocabili (slot per posizione, ruolo vincitrice coppa nazionale, campioni in carica, riallocazioni).
7. **Partecipanti reali playoff 2026/27** UCL/UEL/UECL (nomi + nazioni) → input per la sostituzione con club FL26.
8. **Classifiche finali reali 2025/26** + vincitori coppe nazionali 2025/26 + campioni europei 2025/26 (12 leghe) → seed della prima stagione.
9. **Distribuzioni statistiche reali** per la formula eventi giocatore: % gol per ruolo (att/mid/dif), % assist per ruolo, gialli medi a squadra/partita, rossi medi a squadra/partita, frequenza rigori, distribuzione voti, bonus voto reali (gol/assist/porta inviolata). Fonti: dataset pubblici (FBref, Opta/StatsBomb summary, Wikipedia stagioni).
10. **Formato coppe nazionali reali 2025/26** (verifica incrociata della struttura uniforme scelta: top 8 agli ottavi, secca).

## 1. Modello dati — `src/types/entities.ts` + schema Dexie v10

### 1.1 `Partita` — campi nuovi

```ts
/** Settimana di stagione (unità atomica del tempo, D5). */
settimana: number;
/** Slot della settimana (D5). */
slot: 'weekend' | 'infrasettimanale';
/** Fase/turno leggibile: 'andata'|'ritorno'|'league_phase'|'playoff'|'ottavi'|... */
fase: string;
/** Gamba dell'andata/ritorno (solo turni a doppia sfida). */
gamba?: 1 | 2;
/** Esito rigori (solo eliminazione diretta; D9). */
rigori?: { casa: number; trasferta: number };
/** Supplementari giocati (D9). */
supplementari?: boolean;
/** Partita in campo neutro (finali). */
neutra: boolean;
/** Autogol avversari (referto utente, D12). */
autogolAvversari?: number;
```

RIMOSSI (rollback eliminato, D12): `statoPrima`, `ratingPrima`, `contenutiGeneratiDopoReferto`, `refertoV2`.
La vincitrice di un turno a eliminazione si DERIVA da gol aggregati + rigori (funzione pura, nessun campo).

### 1.2 `Competizione` — campi nuovi

```ts
/** Vincitore registrato a fine stagione (D14). */
vincitoreId?: Id;
/** Snapshot fasce del sorteggio league phase (per il report, D11). */
fasce?: Id[][];
```

### 1.3 Nuova entità `PrestazionePartita` (D13)

```ts
export interface PrestazionePartita {
  id: Id;
  carrieraId: string;
  partitaId: Id;
  competizioneId: Id;
  squadraId: Id;
  giocatoreId: Id;
  gol: number;
  assist: number;
  giallo: boolean;
  rosso: boolean;
  /** Voto 1.0-10.0 (passo 0.5), formula su dati reali (§3.5). */
  voto: number;
  portaInviolata: boolean;
  minuti: number; // 0-120
  titolare: boolean;
}
```

### 1.4 Schema Dexie v10

- Nuova tabella `prestazioni: 'id, carrieraId, partitaId, competizioneId, squadraId, giocatoreId'`.
- Indici nuovi su `partite`: `settimana, slot, fase, carrieraId` (mantenendo i precedenti).
- **Compatibilità carriere esistenti**: backfill `settimana = giornata`, `slot = 'weekend'`, `fase = 'andata'|'ritorno'` (da giornata ≤ metà). Le vecchie carriere restano solo-campionato (nessuna competizione europea retroattiva); le nuove feature valgono per le carriere create dopo la migrazione.

## 2. Dati statici — `src/data/`

| File | Contenuto | Fonte |
|---|---|---|
| `calendarioStagioni.ts` | Ancore reali 2026/27: finestre campionati big-5 + pause FIFA; date UEFA (matchday LP, playoff, tabellone, finali); date turni coppe nazionali; date supercoppe. Template di shift per stagioni future (2027/28+: stessi pattern weekday; da sostituire con date reali quando pubblicate). | Verifica §0.1-0.2 |
| `accessi.ts` | Per lega UEFA: slot fissi (posizioni → UCL/UEL/UECL), ruolo vincitrice coppa, campioni in carica 2025/26 (nomi), classifiche finali reali 2025/26 (ordine 1..N), vincitori coppe nazionali 2025/26, partecipanti supercoppe 2025/26. | Verifica §0.6, §0.8 |
| `playoffReali.ts` | Partecipanti reali playoff 2026/27 per competizione (nome, nazione) + regola di sostituzione: club FL26 stessa nazione con forza più vicina; se nazione senza club FL26 → nazione più vicina per ranking UEFA con club, poi forza. Funzione pura di mapping (D7). | Verifica §0.7 |
| `statisticheReali.ts` | Costanti calibrate: pesi gol/assist per ruolo, tassi gialli/rossi, distribuzione voti, bonus voto. | Verifica §0.9 |

Nota: il coefficiente iniziale NON è dato statico — deriva dal rating Elo (`coefficienteDaRating`, §3.6, D10).

## 3. Engine — `src/engine/competizioni/` (funzioni pure, regola 3)

Nuova cartella dedicata; i moduli esistenti (`calendario.ts`, `classifica.ts`) vengono rifattorizzati dentro il template.

### 3.1 `config.ts` — template parametrico

Config dichiarativa per tipo competizione: fasi, numero squadre per fase, regole (gironi/eliminazione/league_phase/secca), regole accesso. Le istanze: campionato (girone A/R), coppa_nazionale (tabellone secco, entrate scaglionate: top 8 agli ottavi, D9), supercoppa (secca neutra), champions_league / europa_league (LP 8 partite), conference_league (LP 6 partite), playoff_qualificazione (A/R, D7).

### 3.2 `calendarioStagione.ts` — motore calendario (D1, D4, D5)

Input: stagione, lega scelta, squadre, accessi, ancore date. Output: mappa `settimana → partite` con slot per TUTTE le competizioni della stagione. Regole:
- Giornate campionato = weekend liberi dentro la finestra (pause FIFA escluse).
- Turni coppa nazionale = slot infrasettimanali nelle date configurate.
- Matchday europei = date UEFA reali; playoff qualificazione = date reali di luglio/agosto.
- Supercoppa = agosto.
- Vincolo: mai due partite della STESSA squadra nello stesso slot; al massimo weekend + infrasettimanale per settimana.
- Deterministico: seme da carriera+stagione per gli accoppiamenti (il calendario campionato esistente già lo è).

### 3.3 `sorteggio.ts` — sorteggi vincolati (D8, D11)

- **League phase**: fasce per coefficiente (4×9 per UCL/UEL, 6×6 per UECL); ogni squadra affronta 2 avversarie per fascia (1 casa/1 fuori; UECL: 1 per fascia, 3 casa/3 fuori); vincoli: mai stessa nazione, max 2 avversarie dalla stessa altra nazione. Algoritmo backtracking deterministico seminato (riproduce la procedura reale documentata in §0.4).
- **Tabellone europeo**: playoff 9-24 accoppiati per posizioni reali; ottavi: teste di serie top-8 vs vincitrici playoff (regole posizionali reali); QF/SF con sorteggio vincolato reale.
- **Coppa nazionale**: tabellone con entrate scaglionate (D9) e teste di serie.
- **Playoff qualificazione**: fasce per coefficiente, andata/ritorno (D7).

### 3.4 `leaguePhase.ts` + `tabellone.ts`

- Classifica league phase con criteri UEFA REALI (ordine tiebreaker verificato, §0.3).
- Progressione tabellone: aggregato 180' + rigori (D9); funzione pura `vincitriceSfida(andata, ritorno, rigori)`.

### 3.5 `simulazioneGiocatori.ts` — eventi giocatore CPU (D13)

Per ogni partita CPU nel perimetro (D13): gol di squadra dal Poisson esistente → distribuzione marcatori per ruolo con pesi reali; rigorista designato (top attaccante per overall); assist correlati; gialli/rossi con tassi reali e pesi per ruolo (cc > dc > at); voti = base da overall + bonus (gol, assist, porta inviolata per portieri/difensori) − penalità (giallo, rosso) + rumore deterministico. Minuti degli eventi distribuiti in modo realistico. Tutto seminato dall'ID partita (stesso risultato a ogni rigenerazione).

**Partite utente**: i miei voti/marcatori arrivano dal referto; le prestazioni della squadra AVVERSARIA (marcatori, assist, gialli, rossi, voti) vengono SIMULATE dal motore con la stessa formula (il form referto resta veloce: solo i miei dati, D12).

### 3.6 `coefficiente.ts` (D10)

- `coefficienteDaRating(rating)`: mappa Elo 1500-2100 → scala coefficiente (~10-130).
- `aggiornaCoefficienti(risultati, competizioni)`: punti reali semplificati + bonus turno, finestra 5 stagioni (le prime stagioni cumulano; la storia pre-carriera è approssimata dall'init da rating).

### 3.7 `classificheSpeciali.ts` (D13)

Aggregazioni pure da `PrestazionePartita`: marcatori, assist, voto medio (min. presenze), G+A, porta inviolata, cartellini rossi. Per qualsiasi competizione.

### 3.8 `fineStagione.ts` (D14)

- Vincitori registrati per competizione.
- Accessi stagione successiva: `accessi.ts` applicato alle classifiche finali simulate (mia lega e tutte le leghe UEFA) + vincitrici coppe + campioni in carica.
- Aggiornamento coefficienti.
- Reset stagionali: `settimanaCorrente`, minuti=0, morale/fiducia/forma riequilibrate verso 50.
- Generazione nuova stagione: nuove istanze Competizione + calendari + sorteggi (stesso codice della creazione).

### 3.9 Refactor moduli esistenti

- `generaCalendario` → istanza del generatore `girone` dentro il template (il metodo del cerchio resta).
- `creaCarriera` (db) → crea TUTTE le competizioni della stagione, non solo il campionato.
- `calcolaClassifica` resta per il girone; la league phase usa criteri UEFA (§3.4).

## 4. DB — transazioni (`src/db/`)

### 4.1 `competizioni.ts` (nuovo)

- `creaStagione(carrieraId, stagione)`: snapshot squadre partecipanti (lega + pool europee + coppa nazionale), istanze Competizione, calendario completo con settimane/slot, sorteggi upfront (D11), salvataggio atomico.
- `avanzaSettimana(carrieraId)`: simula in blocco tutte le partite CPU della settimana corrente (risultati + prestazioni giocatore + rating + tabelloni), poi salta alle settimane vuote simulandole, fino alla prossima settimana con una mia partita (D5).

### 4.2 `referti.ts` (refactor, D12)

- `confermaReferto`: validazione bloccante (§4.3), salvataggio partita + prestazioni mie (da referto) + prestazioni avversarie (simulate, §3.5) + avanzamento settimana (se è l'ultima mia partita della settimana).
- `annullaReferto`: **ELIMINATO**.
- Guardia "prossima partita": cross-competizione, ordinata per settimana+slot.

### 4.3 Validazione bloccante del referto (D12)

Blocchi duri (messaggio esplicito, invio impossibile):
1. Gol non interi o fuori 0-30.
2. Titolari esattamente 11, tutti in rosa.
3. ID (marcatori/infortunati/espulsi/prestazioni) non in rosa.
4. Voti fuori 1.0-10.0 o fuori passo 0.5.
5. Marcatori > gol segnati.
6. `gol miei ≠ marcatori + autogolAvversari` → bloccato (campo autogol nel form).
7. Pareggio in partita a eliminazione diretta: supplementari/rigori OBBLIGATORI (serve la vincitrice per il tabellone).
8. Aggregato andata/ritorno calcolato e mostrato dal motore (non inseribile).

Ultimo passo del form: conferma esplicita "Invio definitivo: dopo l'invio non potrai modificare questo referto".

## 5. UI (`src/pages/`)

| Schermata | Contenuto |
|---|---|
| `Home.tsx` (aggiorna) | Card "prossima partita" cross-competizione (data reale, slot, competizione, avversaria, campo) + prossime 2-3; riepilogo settimana corrente. |
| `Referto.tsx` (estende) | Campi rigori/supplementari (solo eliminazione diretta), autogol avversari, validazione bloccante con messaggi, conferma irreversibile, aggregato andata/ritorno post-invio. |
| `Competizioni.tsx` (nuovo Hub) | Lista competizioni attive; dentro: campionato → classifica; coppe → tabella league phase (36) + tabellone a fasi; report sorteggio (fasce, accoppiamenti, vincoli); classifiche speciali (marcatori, assist, voto medio, G+A, porta inviolata, rossi). |
| `Calendario.tsx` (estende) | Vista stagionale cronologica con date reali: tue partite (giocate/da giocare) + turni di coppa; navigazione settimane. |
| `RisultatiTurno.tsx` (estende) | Risultati della settimana per tutte le competizioni; NIENTE "torna indietro" (D12). |
| `FineStagione.tsx` (nuovo) | Vincitori per competizione, accessi europei stagione successiva, coefficienti aggiornati, pulsante "Inizia 2027/28". |

## 6. Ordine di implementazione

1. **Verifica web §0** → fonti registrate nei data files.
2. **Tipi + schema v10** (migration con backfill carriere esistenti).
3. **Engine core**: `config.ts` + `calendarioStagione.ts` + `sorteggio.ts` + `leaguePhase.ts` + `tabellone.ts` (pure, con test/script di calibra).
4. **Engine eventi giocatore**: `simulazioneGiocatori.ts` tarata su `statisticheReali.ts` (script di verifica distribuzioni contro i dati reali).
5. **DB**: `creaStagione` completa + `avanzaSettimana` + refactor `confermaReferto` immutabile.
6. **Engine fine stagione**: `coefficiente.ts` + `fineStagione.ts` + rollover.
7. **UI core**: Home + Referto + Hub Competizioni.
8. **UI resto**: Calendario + RisultatiTurno + Fine stagione.
9. **Test end-to-end** + simulazione di una stagione completa (script di calibra: coerenza classifiche/tabelloni/accessi).

## 7. Follow-up registrati per milestone future

- **Promozioni/retrocessioni** tra divisioni (prossima milestone — promessa esplicita).
- **Invecchiamento giocatori / aggiornamento overall / vivaio** (sua milestone — promessa esplicita).
- **Eventi giocatore attivi** sugli overall in base alla forma (ora passivi in `PrestazionePartita`).
- **Modalità vacanza** (PRD 7.7): struttura slot già compatibile.
- **Cerimonia sorteggio interattiva** (oggi report statico).
- **Nazionali e tornei estivi** (M5).


---

## 8. Stato implementazione (aggiornamento agosto 2026)

**Fatto:**
- Verifica web completa (docs/verifica-web.md): date UEFA 2026/27 esatte, formati reali, access list, playoff reali, vincitori 2025/26, regole coefficiente.
- Dati statici: `calendarioStagioni.ts` (ancore 2026/27 + shift stagioni future), `accessi.ts` (slot per lega + seme reale), `playoffReali.ts` (sostituzione FL26), `statisticheReali.ts` (distribuzioni eventi giocatore).
- Engine puro `src/engine/competizioni/`: config parametrica, coefficiente (regole UEFA reali), sorteggio league phase (backtracking con budget nodi + retry, vincoli nazione), calendario matchday (MRV + budget), classifica league phase (tiebreaker Art. 18), tabellone (aggregato, rigori CPU 50/50 deterministici, bracket a posizioni), calendario stagionale (settimane/slot/date), classifiche speciali, fine stagione (vincitori + accessi), simulazione eventi giocatore, sostituzione playoff, generazione stagione completa.
- Schema Dexie v10: tabella `prestazioni`, campi Partita (settimana/slot/fase/gamba/rigori/supplementari/neutra/autogol), Competizione (vincitoreId/fasce/classifica); backfill carriere esistenti (solo-campionato).
- DB: `creaStagioneCompleta`, `avanzaSettimana` (simulazione CPU a blocco, progressione tabelloni, generazione league phase a playoff conclusi, trasferimenti reali UCL→UEL→UECL), `concludiStagione`, `iniziaStagioneSuccessiva` (rollover con accessi dai piazzamenti finali).
- Referto IMMUTABILE: `annullaReferto` rimosso, validazione bloccante (gol 0-30, titolari = 11, voti 1.0-10.0 passo 0.5, marcatori ≤ gol, marcatori + autogol = gol, rigori obbligatori in pareggio KO), prestazioni avversarie simulate, conferma in due passi.
- UI: Hub Competizioni (classifica/league phase/tabelloni/sorteggio/classifiche speciali), Calendario stagionale con date, Referto esteso (autogol/rigori/supplementari/conferma irreversibile), RisultatiTurno settimanale multi-competizione (senza "torna indietro"), fine stagione in dashboard (riepilogo + inizia stagione), navigazione Competizioni.
- Test: `verify:competizioni` (sorteggi, league phase, tabellone, eventi giocatore, generazione stagione) e `verify:referto` riscritto per il nuovo flusso (immutabilità, validazione, avanzamento settimana) — tutti verdi; verify-morale/societa/screenshot aggiornati al flusso immutabile.

**Nota onestà:** test di runtime completi con fake-indexeddb sui flussi demo; da fare la prova manuale nel browser con il database FL26 reale importato (creazione carriera → stagione → coppe).
