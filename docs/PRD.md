# Dashboard Allenatore per Football Life 26 — Analisi completa e progetto del sistema

**Un motore di carriera esterno per FL26: design dei moduli, integrazione LLM, architettura tecnica e roadmap di sviluppo con AI coding tools**

---

## Risposta diretta (TL;DR)

**Sì, l'idea è buona ed è la strada giusta**, per tre motivi: (1) la Master League di FL26 è strutturalmente basilare — regolamenti del 2019 hardcoded, gestione ridotta a trasferimenti e poco altro — e non è moddabile, quindi una "carriera ricca" dentro il gioco non arriverà mai  [(reddit.com)](https://www.reddit.com/r/SPFootballLife/comments/1gajp0x/faq_guide_the_football_life_common_questions_read/) ; (2) esiste già una comunità che costruisce companion app e tracker per le carriere di FIFA/EA FC, segno che il pattern "gioco per le partite + app per la gestione" funziona e crea dipendenza  [(reddit.com)](https://www.reddit.com/r/seriousfifacareers/comments/1uumaco/now_you_can_also_track_your_player_career_mode/) ; (3) l'uso di un LLM come "direttore narrativo" risolve esattamente il punto debole storico delle carriere manageriali — eventi e dialoghi scriptati che diventano ripetitivi dopo poche settimane di gioco  [(sports-interactive.com)](https://community.sports-interactive.com/forums/topic/578796-does-anyone-actually-enjoy-the-media-and-player-interactions/) . Il segreto per non fallire è uno solo: **i numeri (classifiche, morale, budget) devono gestirli il codice con regole deterministiche, l'LLM deve solo scrivere storie e proporre eventi** che il motore valida. Con questa architettura, il costo dell'API è irrisorio — da **0,15 a 1,80 dollari al mese** a seconda del modello scelto — e lo sviluppo con AI coding tools è realisticamente alla portata di un principiante, a condizione di lavorare con un PRD strutturato e per milestone  [(chatprd.ai)](https://www.chatprd.ai/learn/PRD-for-Cursor) .

---

## 1. Valutazione dell'idea

### 1.1 Perché il progetto ha senso (e perché ora)

Football Life 26 è un progetto encomiabile: database aggiornato alla stagione 2025/26 con squadre promosse/retrocesse, edit mode completamente funzionale, telecronaca v8 e un sistema di contratti riscritto su base 2025 che ha risolto uno dei bug storici delle modalità carriera  [(SmokePatch)](https://www.pessmokepatch.com/2025/10/spfl26.html) . Il punto è che tutto questo sforzo va sul **contenuto**, non sulla **struttura** della carriera. La community stessa è esplicita: la Master League eredita da Konami regolamenti del 2019 non modificabili e una gestione ridotta all'osso — trasferimenti, qualche giovane, e si gioca — e la risposta ufficiale alla domanda "vale la pena per la Master League?" è un "non proprio"  [(reddit.com)](https://www.reddit.com/r/SPFootballLife/comments/1gajp0x/faq_guide_the_football_life_common_questions_read/) . SmokePatch lavora a FL27 con miglioramenti al sistema di competizioni e calendari  [(SmokePatch)](https://www.pessmokepatch.com/2026/07/FL27.html) , ma anche nella migliore delle ipotesi si tratterà di evoluzioni della stessa struttura, non di una carriera allenatore moderna.

La tua idea ribalta il problema: invece di aspettare che la ML diventi profonda (non succederà), si tiene FL26 per quello che sa fare meglio — il **gameplay in campo**, che la community considera ancora il miglior calcistico esistente  [(PESTeam.it)](https://www.pesteam.it/forum/threads/football-life-2026.43769/)  — e si sposta tutto il resto (stagione, obiettivi, morale, mercato, narrativa) in un'app esterna che fa da "cervello". Non è un'idea campata in aria: su Reddit esistono community intere (r/seriousfifacareers, r/FifaCareers) in cui gli utenti tracciano le carriere prima con spreadsheet, poi con app dedicate per iOS/Android e desktop, una delle quali integra già un "AI tactics analyser"  [(reddit.com)](https://www.reddit.com/r/seriousfifacareers/comments/1uumaco/now_you_can_also_track_your_player_career_mode/) . La domanda per questo tipo di strumento è reale e dimostrata.

L'elemento che rende il tuo progetto diverso e potenzialmente migliore di quei tracker è il **motore LLM**. Un tracker registra ciò che fai; un motore di carriera **reagisce** a ciò che fai: genera eventi, tensioni nello spogliatoio, pressione dei media, offerte di mercato, crisi e trionfi narrativi. La letteratura sull'uso degli LLM nei giochi conferma che i due ruoli in cui eccellono sono proprio quelli che ti servono: il **commentatore/narratore** (trasforma eventi di gioco strutturati in racconto) e l'assistente del **game master** (genera scenari e contenuto dinamico mantenendo la coerenza col contesto fornito)  [(arXiv.org)](https://arxiv.org/html/2402.18659v5) . È esattamente il salto da "registro" a "carriera vissuta".

### 1.2 I vincoli da accettare fin da subito

Il progetto ha un confine invalicabile che devi interiorizzare come scelta di design, non come limite temporaneo: **non esiste alcun canale automatico tra l'app e FL26**. Il database di FL26 è sbloccato per la community, ma modificare i file binari è sconsigliato dagli stessi autori perché può causare errori gravi e conflitti con gli aggiornamenti futuri  [(SmokePatch)](https://www.pessmokepatch.com/2025/10/spfl26.html) . Quindi ogni dato scorre in una sola direzione e passa da te: dopo la partita veloce, inserisci manualmente il referto (risultato, marcatori, eventuali note) nella dashboard, e la dashboard elabora tutto il resto. Questo significa che l'esperienza d'uso dell'inserimento deve essere **velocissima** — 30-60 secondi a partita — altrimenti diventerà la ragione per cui abbandonerai il progetto dopo due settimane.

Il secondo vincolo è di bilanciamento del realismo. Senza un collegamento al motore di gioco, gli effetti "concreti" delle meccaniche gestionali (morale che influenza le prestazioni, fiducia della società, crescita dei giovani) non possono agire direttamente sulle partite che giochi in FL26. Il sistema deve quindi tradurre lo stato in **vincoli e suggerimenti autoimposti** che poi applichi tu in partita veloce: per esempio, un giocatore con morale basso e forma scarsa "dovrebbe" partire dalla panchina; una rosa stanca a fine stagione suggerisce il turnover; gli obiettivi della società definiscono il metro del tuo successo. È la stessa logica delle "house rules" che la community delle carriere usa da anni per rendere realistiche le modalità carriera  [(reddit.com)](https://www.reddit.com/r/seriousfifacareers/comments/1lqmpl5/looking_for_a_realistic_career_mode_spreadsheet/) : la disciplina del giocatore è parte del gioco, e una buona dashboard la rende naturale invece che faticosa.

Il terzo vincolo riguarda l'LLM: è un narratore brillante ma **inaffidabile sui numeri**. Se gli lasci decidere di quanto cambia il morale o quanti punti vale una vittoria, prima o poi produrrà incoerenze. Il caso documentato di WSC Sport — che genera telecronache per NBA e Premier League con LLM — mostra la soluzione standard del settore: i dati sugli eventi vengono forniti al modello in forma strutturata, esplicitamente, "invece di farglieli indovinare", proprio per ridurre le allucinazioni  [(zenml.io)](https://www.zenml.io/llmops-database/automated-sports-commentary-generation-using-llms) . La tua app deve fare lo stesso: il codice calcola lo stato, l'LLM lo racconta.

### 1.3 Le alternative considerate e scartate

Prima di progettare, vale la pena chiudere il discorso "è l'idea migliore?" confrontando le alternative realistiche. La tabella seguente riassume il confronto.

| Alternativa | Cosa offre | Perché non basta (o non conviene) |
|---|---|---|
| **Master League di FL26 così com'è** | Carriera integrata nel gioco, zero attrito | Regolamenti 2019 hardcoded, gestione "base, non aspettarti più di trasferimenti e qualche giovane"  [(reddit.com)](https://www.reddit.com/r/SPFootballLife/comments/1gajp0x/faq_guide_the_football_life_common_questions_read/) ; è il motivo per cui stai leggendo questo documento |
| **Spreadsheet manuale** | Gratis, flessibile, nessuno sviluppo | È il punto di partenza storico della community, ma gli utenti migrano sistematicamente verso app dedicate perché i fogli diventano faticosi  [(reddit.com)](https://www.reddit.com/r/seriousfifacareers/comments/1uo5fof/i_got_tired_of_spreadsheets_so_i_built_a_desktop/) ; zero narrativa, zero eventi |
| **Companion app esistenti per FIFA/FC** | Pronte, curate, alcune con AI | Sono **tracker**, non motori: registrano risultati e statistiche ma non generano la carriera  [(reddit.com)](https://www.reddit.com/r/seriousfifacareers/comments/1uumaco/now_you_can_also_track_your_player_career_mode/) ; e sono pensate per EA FC, non per la tua rosa FL26 |
| **Giocare a Football Manager** | La profondità gestionale massima sul mercato | Cambi gioco, non risolvi il problema: perdi il gameplay di FL26 che ti piace, e FM è notoriamente "troppo" per chi vuole equilibrio tra semplicità e realismo — le sue interazioni scriptate sono percepite come clickwork ripetitivo  [(sports-interactive.com)](https://community.sports-interactive.com/forums/topic/578796-does-anyone-actually-enjoy-the-media-and-player-interactions/)  |
| **Dashboard esterna + LLM (la tua idea)** | Gameplay FL26 + carriera profonda e narrativa, su misura | Richiede sviluppo e inserimento manuale dei referti: è il trade-off corretto per il tuo obiettivo |

Il verdetto è netto: per quello che vuoi tu — **partite su FL26, carriera stile EA FC ma più intelligente** — la dashboard con motore LLM è l'unica opzione che unisce i due mondi senza compromessi sul gameplay. Le alternative o rinunciano alla profondità (ML, spreadsheet, tracker) o rinunciano al campo (FM).

---

## 2. Benchmark: cosa prendere (e cosa evitare) dai giochi di riferimento

### 2.1 EA FC 26: il modello narrativo da copiare

EA FC 26 è il riferimento dichiarato, e la sua carriera 2025/26 offre tre sistemi direttamente "rubabili" per il tuo progetto. Il primo è il **Manager Market**: per la prima volta gli allenatori — tu incluso — si muovono durante la stagione, vengono esonerati, corteggiati da altri club, e ogni club valuta i candidati con un sistema di "pedigree" che confronta storia, stile di gioco e livello della carriera del tecnico con le attese della società  [(Electronic Arts)](https://www.ea.com/en/games/ea-sports-fc/fc-26/features/fc-26-career-mode) . Tradotto nella tua dashboard: un indicatore di **reputazione allenatore** e uno di **fiducia/job security**, con offerte di altre squadre generate dall'LLM a fine stagione o nei momenti di crisi/trionfo. È il meccanismo che trasforma una "stagione" in una "carriera".

Il secondo sistema è gli **Unexpected Events**, ed è la descrizione esatta di ciò che un LLM sa fare bene. EA li divide in due famiglie: gli *Emerging Scenarios* (cose che accadono e a cui decidi se/come reagire: un giocatore chiave che torna infortunato dalla nazionale, voci di mercato, problemi logistici prima di una gara) e i *Decision Points* (problemi che richiedono una scelta netta con conseguenze: un giocatore nostalgico di casa, un conflitto con lo staff, un dilemma tra felicità del giocatore e bilancio)  [(Electronic Arts)](https://www.ea.com/en/games/ea-sports-fc/fc-26/news/pitch-notes-fc26-career-mode-deep-dive) . Le categorie sono tre: eventi legati ai **giocatori**, alla **società/proprietà**, e a **tifosi e media**  [(Electronic Arts)](https://www.ea.com/en/games/ea-sports-fc/fc-26/news/pitch-notes-fc26-career-mode-deep-dive) . Ogni evento interrompe il flusso con una schermata dedicata e le scelte hanno effetti misurabili (morale in su ma autorità in giù, soluzione rapida ma conseguenze a lungo termine)  [(GAMES.GG)](https://games.gg/ea-sports-fc-26/guides/ea-fc-26-career-mode-guide/) . Questa tassonomia è oro per il tuo prompt design: invece di chiedere all'LLM "genera qualcosa", gli chiedi "genera un Decision Point della categoria giocatori, coerente con questo stato".

Il terzo spunto è la **Deeper Simulation**: FC 26 simula fino a cinque leghe aggiuntive in background per arricchire mercato, storyline e scouting  [(ClutchPoints)](https://clutchpoints.com/gaming/ea-sports-fc-26-career-mode) . Per il tuo progetto non serve simulare cinque leghe intere — basta una **colonna "notizie dal mondo"** in cui l'LLM genera risultati e avvenimenti delle altre squadre della tua lega (la classifica la calcoli tu inserendo/simulando i risultati avversari) e occasionale "rumore" di mercato. Attenzione però a una nota di onestà: in partita veloce non c'è una stagione CPU reale dietro, quindi i risultati delle altre squadre li dovrai generare tu (regola semplice basata sulla forza delle squadre, più narrativa LLM sopra). Questo è uno dei punti in cui il progetto richiede più design, e ci torneremo nella sezione 3.

### 2.2 Football Manager: i sistemi umani da adattare (e la trappola da evitare)

Football Manager resta il dizionario di riferimento per la gestione "umana" di una squadra, e tre suoi sistemi meritano di entrare nel tuo scheletro semplificato. Il **morale** in FM è un sistema a impatto diretto: una squadra felice rende sopra le proprie qualità, una infelice sotto; lo muovono risultati, minuti giocati, promesse mantenute o tradite, team talk e carichi di allenamento  [(FootballGPT)](https://footballgpt.co/fm/fm-morale) . Le **gerarchie dello spogliatoio** sono il secondo pilastro: capitano e leader influenzano il gruppo, se sono scontenti trascinano gli altri, e i giocatori con personalità "temperamentali" richiedono gestione separata — critiche pubbliche li fanno esplodere, quelle private funzionano  [(FootballGPT)](https://footballgpt.co/fm/fm-morale) . Il terzo è il sistema delle **promesse**: promettere a un giocatore lo status di titolare e poi mandarlo in panchina distrugge fiducia e morale entro pochi mesi; è la meccanica che dà peso reale alle tue parole  [(FootballGPT)](https://footballgpt.co/fm/fm-morale) . Tutte e tre sono perfettamente implementabili come stato numerico + testo LLM, con complessità minima: morale 0-100 per giocatore, un flag "leader", un registro delle promesse con scadenza.

Altrettanto importante è sapere cosa **non** copiare. La lamentela più ricorrente della community di FM è che conferenze stampa e interazioni con i giocatori diventano un clickwork ripetitivo — le stesse domande, la stessa "seconda risposta da sinistra" sempre positiva, conversazioni che si ripetono identiche per mesi  [(sports-interactive.com)](https://community.sports-interactive.com/forums/topic/578796-does-anyone-actually-enjoy-the-media-and-player-interactions/) . Il problema non è l'idea delle conferenze stampa, è che il contenuto è **scriptato e finito**. Qui il tuo progetto ha un vantaggio strutturale: con un LLM che genera domande e scenari a partire dal tuo stato di gioco reale (ultimi risultati, giocatore in crisi, voce di mercato aperta), la ripetitività si riduce drasticamente, soprattutto se implementi la memoria anti-ripetizione descritta nella sezione 4. La lezione di FM è quindi duplice: copia i sistemi umani, ma progetta fin da subito la **variabilità del contenuto** come requisito, non come optional.

C'è infine un prestito di interfaccia: FM26 ha introdotto il **Portal**, una home che fonde inbox e dashboard — messaggi, compiti da svolgere, calendario delle prossime due settimane, risultati e notizie in un'unica schermata a "tiles and cards"  [(Football Manager)](https://www.footballmanager.com/fm26/features/fm26s-reimagined-user-interface) . Per una dashboard allenatore questo è il pattern perfetto: la tua home dovrebbe essere esattamente questo, un portale che risponde in un colpo d'occhio a "cosa è successo, cosa devi decidere, cosa c'è dopo". Niente menu profondi: la profondità sta nei sistemi, non nella navigazione.

### 2.3 PES Master League classica e manageriali minimalisti: il cuore e la misura

Dalla Master League d'epoca — quella che la community rimpiange, di PES 2013 e dintorni  [(reddit.com)](https://www.reddit.com/r/SPFootballLife/comments/1gajp0x/faq_guide_the_football_life_common_questions_read/)  — arrivano due meccaniche semplicissime e potentissime che costano poco implementare e danno grandissima soddisfazione: il **settore giovanile che sforna promesse** e i **rigenerati** (i campioni ritirati che riappaiono come sedicenni da ricostruire, meccanica storica della ML che i giocatori cacciano ancora oggi)  [(fandom.com)](https://pes-theorist.fandom.com/wiki/Master_League) . Nel tuo sistema si traducono in una funzione "vivaio": a ogni stagione l'LLM genera 2-4 prospetti con nome, ruolo, potenziale e una mini-storia; e occasionalmente, quando un tuo giocatore "si ritira", può riapparire come giovane rigenerato. Sono content generation pura, territorio ideale dell'LLM, e riproducono una delle gioie più citate della ML classica.

Dai manageriali minimalisti — Football Chairman su tutti, con il suo loop "poche decisioni, rapide, consequenziali" che ne ha fatto un benchmark di longevità su mobile — arriva la **misura di cosa tenere acceso e cosa no**  [(sortitoutsi.net)](https://sortitoutsi.net/content/71008/5-best-football-manager-mobile-games) . Football Chairman funziona con pochissimi indicatori (felicità di tifosi e società in percentuale, budget, risultati) e un flusso di decisioni binarie a ripetizione: prezzi dei biglietti, acquisto sì/no dell'obiettivo di mercato, esonero sì/no  [(sortitoutsi.net)](https://sortitoutsi.net/content/71008/5-best-football-manager-mobile-games) . La lezione è che **non servono trenta schermate per creare tensione decisionale**: ne bastano cinque-sei indicatori ben visibili e un flusso costante di piccoli bivi. Il rischio del tuo progetto non è fare troppo poco, è fare troppo: ogni modulo aggiuntivo va giustificato da una domanda precisa — "genera decisioni interessanti ogni settimana?".

### 2.4 Sintesi del benchmark: adotta, adatta, evita

| Sistema / gioco di origine | Verdetto | Come entra nel progetto |
|---|---|---|
| **Unexpected Events** (FC 26) | **Adotta** | Tassonomia eventi in 3 categorie × 2 tipi (scenari emergenti / punti decisionali), generati dall'LLM sul tuo stato  [(Electronic Arts)](https://www.ea.com/en/games/ea-sports-fc/fc-26/news/pitch-notes-fc26-career-mode-deep-dive)  |
| **Manager Market / reputazione** (FC 26) | **Adatta** | Reputazione + fiducia società + offerte da altri club; niente tattiche degli altri allenatori (non misurabili in partita veloce)  [(Eldorado.gg)](https://www.eldorado.gg/blog/fc-26-career-mode-deep-dive/)  |
| **Live Challenges / scenari** (FC 26/27) | **Adatta** | "Sfide stagionali" auto-generate dall'LLM (es. "vinci il derby", "sopravvivi a -20"): obiettivi opzionali con ricompense narrative  [(Electronic Arts)](https://www.ea.com/en/games/ea-sports-fc/fc-26/news/pitch-notes-fc26-career-mode-deep-dive)  |
| **Morale, promesse, leader** (FM) | **Adotta** | Morale 0-100 per giocatore, registro promesse, 2-3 leader di spogliatoio con influenza amplificata  [(FootballGPT)](https://footballgpt.co/fm/fm-morale)  |
| **Conferenze stampa e chat** (FM) | **Adatta** | Solo "momenti stampa" chiave (pre big match, post crisi), contenuto generato dall'LLM: mai routine ripetitiva  [(sports-interactive.com)](https://community.sports-interactive.com/forums/topic/578796-does-anyone-actually-enjoy-the-media-and-player-interactions/)  |
| **Portal / home hub** (FM26) | **Adotta** | Home unica a schede: inbox decisioni + prossimi impegni + classifica + morale  [(Football Manager)](https://www.footballmanager.com/fm26/features/fm26s-reimagined-user-interface)  |
| **Vivaio e rigenerati** (PES ML classica) | **Adotta** | 2-4 prospetti a stagione generati dall'LLM + rigenerati dei ritirati  [(fandom.com)](https://pes-theorist.fandom.com/wiki/Master_League)  |
| **Loop decisionale minimal** (Football Chairman) | **Adotta** | 5-6 indicatori chiave, decisioni binarie frequenti, zero burocrazia  [(sortitoutsi.net)](https://sortitoutsi.net/content/71008/5-best-football-manager-mobile-games)  |
| **Tattica in campo, ruoli, istruzioni** (FC 26/FM) | **Evita** | Le tattiche le imposti in FL26: la dashboard registra solo il "piano gara" come testo, senza simulare nulla |
| **Staff numerico, allenamenti granulari, finanza complessa** (FM) | **Evita (MVP)** | Sono la via verso il "troppo enorme": staff ridotto a 3 figure narrative, finanza ridotta a budget + ingaggi, allenamento a un indicatore di forma |

---

## 3. Il design del sistema

### 3.1 Principi guida: come si bilancia semplicità e realismo

Il bilanciamento che cerchi non si ottiene tagliando sistemi a caso, ma applicando tre principi precisi. Il primo è la **separazione numeri/storie**: ogni quantità del gioco (punti, morale, fiducia, budget, forma) è calcolata da regole deterministiche nel codice, mentre l'LLM produce solo testo e proposte — il che rende il sistema sempre coerente e al tempo stesso narrativamente ricco, ed è la stessa architettura usata dai sistemi professionali di commento sportivo automatico  [(zenml.io)](https://www.zenml.io/llmops-database/automated-sports-commentary-generation-using-llms) . Il secondo principio è la **regola della decisione settimanale**: un sistema entra nel progetto solo se genera una decisione interessante almeno una volta a settimana di gioco. Il morale sì (decidi chi schierare, chi consolare, a chi promettere minuti), la finanza dettagliata no (decidi qualcosa due volte l'anno). Il terzo principio è la **profondità a strati**: il nucleo (MVP) è volutamente piccolo — sei moduli — e i livelli successivi si accendono dopo, così inizi a giocare presto e il progetto non muore di ambizione. È la stessa filosofia dei manageriali minimalisti, dove pochi indicatori ben calibrati creano più tensione di trenta schermate  [(sortitoutsi.net)](https://sortitoutsi.net/content/71008/5-best-football-manager-mobile-games) .

Un quarto principio, trasversale, riguarda la tua disciplina di gioco: la dashboard propone **vincoli autoimposti** che tu rispetti in partita veloce (formazioni coerenti con morale e forma, turnover quando serve, rigore sulle promesse). Questo non è un difetto del sistema, è la sua anima: è lo stesso patto implicito con cui la community gioca le carriere "realistiche" da anni  [(reddit.com)](https://www.reddit.com/r/seriousfifacareers/comments/1lqmpl5/looking_for_a_realistic_career_mode_spreadsheet/) , e la dashboard lo rende strutturato e misurabile invece che affidato alla memoria.

Un quinto principio, **tra i più importanti dell'intero documento**, è il **radicamento nel calcio reale**. Prima di implementare qualsiasi meccanica o dinamica calcistica — valore e valutazione dei calciatori, budget e monte ingaggi, trattative e clausole, parametri di morale, fiducia e forma, dinamiche di mercato, infortuni, età di picco, curve di crescita, tempistiche e scadenze dei trasferimenti — il modello di sviluppo deve fare una **verifica su internet**: cercare eventi moderni del calcio, situazioni realmente accadute e informazioni pratiche e dettagliate sul mondo del calcio di oggi (cifre reali di mercato, scale salariali, regole, casi concreti, cronache). Nessuna meccanica va implementata "a memoria" o "di testa": ogni valore e ogni dinamica devono fondarsi su dati e casi reali verificati, così che la carriera allenatore risulti la più moderna e realistica possibile. La verifica va registrata nella feature (fonte + data di consultazione), e se i dati reali contraddicono l'implementazione prevista, prevale la realtà verificata. Il principio vale per ogni decisione di implementazione: calciatori, squadre, budget, trattative e ogni altra dinamica del mondo del calcio.

### 3.2 La mappa dei moduli

![Mappa dei moduli della dashboard allenatore: nucleo MVP, secondo livello e opzionali](assets/mappa_moduli.png)

Il sistema si organizza attorno al **Motore Carriera** — la combinazione di stato di gioco, regole deterministiche e servizio LLM — con tredici moduli divisi in tre strati. Il **nucleo (verde)** è il minimo indispensabile per sentirsi allenatore: rosa, calendario con inserimento referti, classifica, morale dello spogliatoio, società con obiettivi e fiducia, e il motore eventi LLM. Il **secondo livello (blu)** aggiunge il realismo gestionale: mercato, media e narrativa, infortuni e forma, settore giovanile. Gli **opzionali (ambra)** sono la profondità extra da attivare in una v2: finanze, carriera dell'allenatore con reputazione ed esonero, staff.

La tabella seguente dettaglia ogni modulo con le meccaniche essenziali e il ruolo dell'LLM: è la checklist funzionale da trasformare in PRD per lo sviluppo.

| Modulo | Strato | Meccaniche essenziali (deterministiche) | Cosa ci fa l'LLM |
|---|---|---|---|
| **Rosa & giocatori** | Nucleo | Anagrafica giocatore: nome, ruolo, età, overall (copiato da FL26), stato (morale, forma, minuti, promesse attive) | Mini-biografie e tratti caratteriali all'importazione della rosa |
| **Calendario & referti** | Nucleo | Calendario della tua lega; form referto in <60 secondi (risultato, marcatori, note); generazione risultati CPU delle altre squadre con regola basata sulla forza | — (pura regola) |
| **Classifica & statistiche** | Nucleo | Classifica aggiornata, marcatori/assistman della tua squadra, strisce (vittorie/sconfitte), forma ultime 5 | — (pura regola) |
| **Morale & spogliatoio** | Nucleo | Morale 0-100 per giocatore influenzato da risultati, minuti, promesse; 2-3 leader con effetto amplificato; crisi sotto soglia | Frasi e stati d'animo dei giocatori, richieste di colloquio, reazioni alle tue scelte  [(FootballGPT)](https://footballgpt.co/fm/fm-morale)  |
| **Società, obiettivi & fiducia** | Nucleo | Obiettivo stagionale (scelto a inizio), fiducia 0-100 aggiornata su risultati vs attese, soglia esonero | Comunicati del presidente, ultimatum, elogi; tono calibrato sulla fiducia |
| **Motore eventi & decisioni** | Nucleo | Trigger settimanali (1-2 eventi), tassonomia FC 26 (3 categorie × 2 tipi), effetti proposti→validati→applicati | Generazione completa: testo evento, opzioni di risposta, conseguenze narrative  [(Electronic Arts)](https://www.ea.com/en/games/ea-sports-fc/fc-26/news/pitch-notes-fc26-career-mode-deep-dive)  |
| **Mercato & contratti** | 2° livello | Finestre (estate/gennaio), budget, lista obiettivi, offerte in entrata generate con regole su valore e stato rosa | Offerte con motivazioni, trattative narrate, reazioni dei giocatori ceduti |
| **Media, tifosi & narrativa** | 2° livello | Umore tifosi 0-100; "momento stampa" solo su trigger (big match, crisi, strisce) | Domande dei giornalisti, titoli di giornale, post social dei tifosi |
| **Infortuni, forma & condizione** | 2° livello | Forma (ultime prestazioni da te valutate), rischio infortunio casuale ponderato, condizione stagionale | Descrizione infortuni e rientri, dibattiti su chi è fuori forma |
| **Settore giovanile** | 2° livello | 2-4 prospetti a stagione con potenziale nascosto; crescita annuale; rigenerati dei ritirati | Nomi, storie e pareri dello scout sui giovani  [(fandom.com)](https://pes-theorist.fandom.com/wiki/Master_League)  |
| **Finanze & budget** | Opzionale | Budget unico + monte ingaggi semplificato; premi piazzamento | — |
| **Carriera allenatore** | Opzionale | Reputazione, storico panchine, offerte da altri club a fine stagione | Colloqui di ingaggio narrati, voci di panchine in pericolo  [(Eldorado.gg)](https://www.eldorado.gg/blog/fc-26-career-mode-deep-dive/)  |
| **Staff & assistenti** | Opzionale | 3 figure (vice, scout, preparatore) con un bonus ciascuno | Consigli settimanali contestuali dello staff |

Nota di design importante sul **calendario avversario**: in partita veloce non esiste una stagione CPU dietro le quinte, quindi la dashboard deve inventarla in modo onesto. La soluzione consigliata è una regola semplice (ogni squadra ha una "forza" stimata; i risultati delle altre partite vengono estratti con probabilità basate sullo scontro di forze, più un tocco di varianza) e poi l'LLM racconta i risultati degni di nota nella colonna notizie. Tu giochi solo le tue partite; il resto del mondo esiste statisticamente e narrativamente. Questo è il compromesso più grande rispetto a una carriera vera, ma è anche ciò che rende il progetto fattibile — e in pratica è quello che già fai mentalmente quando giochi una stagione "fai da te".

### 3.3 Il game loop settimanale

![Il ciclo settimanale: la dashboard è il motore, FL26 è il campo da gioco](assets/game_loop.png)

Il cuore dell'esperienza è un ciclo a sei passaggi che si ripete per ogni turno di campionato. Si comincia in campo: giochi la partita in FL26 in partita veloce, con la formazione coerente con lo stato della rosa. Poi rientri nella dashboard e inserisci il referto — questo passaggio deve essere velocissimo, un form con risultato, marcatori e al massimo un paio di note (espulsioni, infortuni, prestazione eccezionale). Il motore aggiorna automaticamente classifica, statistiche, morale e fiducia applicando le regole deterministiche, e genera i risultati delle altre squadre. A quel punto si accende il motore LLM: uno o due eventi settimanali (un colloquio richiesto da un giocatore, una notizia di mercato, una domanda scomoda in conferenza), più il "giornale del giorno dopo" con la cronaca del turno. Tu prendi le tue decisioni — ogni evento ha 2-4 opzioni con conseguenze dichiarate — e prepari la gara successiva: controlli morale e forma, sistemi la formazione, leggi il pre-partita. Poi si ricomincia, in campo.

La sessione tipo dura così: **15-25 minuti di partita in FL26 + 5-10 minuti di dashboard**. È un ritmo sostenibile perché il tempo gestionale è contenuto e tutto il contenuto testuale arriva fresco dall'LLM invece che da tabelle ripetute. Se un giorno hai fretta, puoi saltare gli eventi opzionali e restare sul minimo sindacale: referto, classifica, formazione. Il sistema non ti punisce per la fretta, ma ti premia per l'attenzione — che è esattamente il rapporto giusto tra semplicità e profondità.

### 3.4 Il modello dei dati: poche entità, tutte utili

Lo schema dati deve stare su una mano: la tentazione di modellare ogni dettaglio è la prima causa di morte dei progetti personali. Cinque entità bastano per l'MVP e il secondo livello.

| Entità | Campi chiave | Note |
|---|---|---|
| `Squadra` | id, nome, forza (1-5), giocatori[] | La tua + le avversarie della lega (per le avversarie serve solo nome e forza) |
| `Giocatore` | id, nome, ruolo, età, overall, morale (0-100), forma (0-100), minuti stagione, promesse[], leader (bool), infortunio_fino_a | L'overall si copia da FL26 all'inizio e si aggiorna tra stagioni |
| `Partita` | id, giornata, casa, trasferta, gol, marcatori[], giocata (bool), note | Le tue giocate da te; le altre simulate dalla regola |
| `StatoClub` | fiducia_societa, fiducia_tifosi, obiettivo, budget, reputazione_allenatore, settimana_corrente | Un record solo, aggiornato a ogni turno |
| `Evento` | id, settimana, categoria (giocatore/societa/media), tipo (scenario/decisione), testo, opzioni[], scelta_fatta, effetti_applicati | Archivio permanente: serve per l'anti-ripetizione dei prompt |

Con queste cinque entità copri classifica, morale, obiettivi, eventi e mercato essenziale. Il settore giovanile è un array dentro `Squadra` (o giocatori con flag `giovane`), le finanze opzionali aggiungono due campi a `StatoClub`, la carriera allenatore aggiunge `storico_panchine[]`. Tutto il resto — nomi delle competizioni, testi, dialoghi — vive nei contenuti generati, non nello schema. Questa disciplina sul modello dati è anche ciò che rende il progetto digeribile per un AI coding tool: schema piccolo, regole esplicite, meno ambiguità da interpretare  [(chatprd.ai)](https://www.chatprd.ai/learn/PRD-for-Cursor) .

---

## 4. Il motore LLM: il "direttore narrativo" della tua carriera

### 4.1 Ruolo e confini: cosa fa e cosa non deve mai fare

L'LLM nel tuo sistema ha un mestiere preciso: è il **direttore di gara narrativo**, non l'arbitro. Decide *cosa raccontare* — quale evento scoppia questa settimana, cosa dice il presidente, come reagisce lo spogliatoio, quali voci girano — ma non decide *i numeri*: morale, fiducia, budget e classifica restano di competenza del codice. I contenuti che genera devono comunque **ispirarsi al calcio reale**: situazioni realmente accadute nel calcio moderno (trattative saltate, tensioni di spogliatoio, crisi societarie, casi veri di mercato, infortuni in nazionale), mai cliché generici — i numeri applicati restano quelli del motore, calibrati sui dati reali verificati secondo il principio della sezione 3.1. Questa separazione non è un vezzo architetturale: è la difesa contro il difetto noto degli LLM, cioè la tendenza a produrre numeri plausibili ma incoerenti (le "allucinazioni"), che nei giochi narrativi può essere perfino un pregio ma nei sistemi a stato persistente è un disastro  [(arXiv.org)](https://arxiv.org/html/2402.18659v5) . Il pattern industriale di riferimento è quello di WSC Sport: fornire al modello tutti i dati dell'evento in forma strutturata ed esplicita, invece di lasciare che li deduca da solo  [(zenml.io)](https://www.zenml.io/llmops-database/automated-sports-commentary-generation-using-llms) .

In pratica, ogni chiamata all'LLM funziona così: il codice raccoglie uno **stato sintetico** (settimana, posizione in classifica, ultime 5 partite, giocatori con morale basso, promesse in scadenza, fiducia società, ultimi 10 eventi già usati) e lo impacchetta in JSON; il prompt di sistema definisce il mondo ("sei il direttore narrativo di una carriera allenatore, genera eventi realistici da calcio moderno, categorie ammesse, tono, vincoli"); l'LLM risponde con un **JSON conforme a uno schema** che contiene testo e *proposte* di effetti; il game engine valida il JSON, fissa gli effetti dentro i limiti ammessi (clamp), li applica allo stato e salva l'evento nell'archivio. Se la chiamata fallisce o il JSON non valida, il sistema ripiega su un evento casuale da tabelle precaricate: la carriera non si ferma mai per colpa della rete o del modello.

### 4.2 Anatomia di una chiamata: prompt e schema pronti da copiare

Il modo più affidabile per ottenere JSON corretto da un LLM è usare gli **Structured Outputs** (JSON Schema vincolante), supportati dalle API OpenAI, Gemini e xAI: lo schema garantisce che la risposta rispetti la struttura richiesta, eliminando la classe di errori "JSON malformato o chiavi mancanti"  [(openai.com)](https://developers.openai.com/api/docs/guides/structured-outputs) . A questo si aggiunge il **few-shot prompting**: includere nel prompt uno o due esempi completi di input→output migliora sensibilmente l'aderenza al formato e allo stile desiderato  [(DEV Community)](https://dev.to/maanu07/reliable-llm-json-output-few-shot-prompting-robust-parsing-2f11) . Ecco lo schema consigliato per la generazione eventi — è già pronto da incollare nel PRD:

```json
{
  "type": "object",
  "properties": {
    "eventi": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "categoria": {"type": "string", "enum": ["giocatore", "societa", "tifosi_media"]},
          "tipo": {"type": "string", "enum": ["scenario_emergente", "punto_decisionale"]},
          "titolo": {"type": "string"},
          "testo": {"type": "string"},
          "giocatori_coinvolti": {"type": "array", "items": {"type": "string"}},
          "opzioni": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "testo": {"type": "string"},
                "effetti_proposti": {
                  "type": "object",
                  "properties": {
                    "morale_giocatori": {"type": "integer"},
                    "fiducia_societa": {"type": "integer"},
                    "fiducia_tifosi": {"type": "integer"},
                    "reputazione": {"type": "integer"}
                  },
                  "required": ["morale_giocatori", "fiducia_societa", "fiducia_tifosi", "reputazione"],
                  "additionalProperties": false
                }
              },
              "required": ["testo", "effetti_proposti"],
              "additionalProperties": false
            }
          }
        },
        "required": ["categoria", "tipo", "titolo", "testo", "giocatori_coinvolti", "opzioni"],
        "additionalProperties": false
      }
    },
    "notizie": {"type": "array", "items": {"type": "string"}}
  },
  "required": ["eventi", "notizie"],
  "additionalProperties": false
}
```

Il prompt di sistema companion (da affinare in sviluppo) suona più o meno così: *"Sei il direttore narrativo di una carriera da allenatore di calcio. Ricevi lo stato della stagione in JSON e generi: (1) 1-2 eventi realistici della settimana, ispirati a situazioni realmente accadute nel calcio moderno (casi veri di mercato, spogliatoio, società, trattative, infortuni), scelti tra le categorie indicate, coerenti con lo stato (non inventare giocatori o squadre non presenti; non ripetere eventi simili a quelli nell'archivio fornito); ogni evento ha 2-4 opzioni di risposta con effetti proposti piccoli (tra -10 e +10); (2) 2-3 brevi notizie di cronaca sul turno appena giocato. Tono da cronaca sportiva italiana, concreto, mai enfatico."* Nota come i vincoli anti-incoerenza sono scritti direttamente nel prompt: niente entità inventate, niente ripetizioni, effetti piccoli. Il codice poi applica un secondo giro di vite: clamp degli effetti in [-10, +10], verifica che i giocatori citati esistano nella rosa, scarto degli eventi troppo simili ai recenti. È la doppia rete di sicurezza raccomandata anche dalla ricerca sulla generazione di contenuti sportivi con LLM  [(MDPI)](https://www.mdpi.com/2227-7390/13/17/2738) .

### 4.3 Anti-ripetizione e memoria: il problema n°1 delle carriere narrative

La ripetitività è ciò che uccide le conferenze stampa di FM e gli eventi scriptati in generale  [(sports-interactive.com)](https://community.sports-interactive.com/forums/topic/578796-does-anyone-actually-enjoy-the-media-and-player-interactions/) , ed è anche il rischio principale di un motore LLM mal progettato: senza memoria, il modello riproporrà le stesse situazioni perché sono statisticamente "tipiche" (il giocatore scontento dei minuti, la voce di mercato, l'infortunio in nazionale). La difesa ha tre strati. Primo: **l'archivio eventi** — l'entità `Evento` del modello dati conserva titolo e categoria di ogni evento passato, e ogni prompt include un riassunto degli ultimi 10-15 con l'istruzione esplicita di non ripetere situazioni analoghe. Secondo: **la tassonomia con cooldown** — il codice pesca a caso (con pesi) la categoria dell'evento prima di chiamare l'LLM, evitando che la stessa categoria si ripeta per più di due settimane consecutive; l'LLM riempie la categoria, non la sceglie, il che lo costringe a variare. Terzo: **la progressione stagionale** — il prompt dichiara la fase della stagione (avvio, lotta per l'obiettivo, sprint finale, mercato), perché gli eventi credibili a ottobre ("ambiente da conquistare") sono diversi da quelli di aprile ("nervi tesi, promesse da onorare").

C'è un quarto accorgimento, quasi gratuito: la **varietà di formato**. Gli eventi non devono essere tutti "schede con opzioni": alterna il colloquio col giocatore (dialogo a due battute), il titolo di giornale (solo testo, nessuna scelta, puro colore), la voce di spogliatoio, il comunicato societario. FC 26 usa lo stesso trucco distinguendo scenari emergenti e punti decisionali  [(Electronic Arts)](https://www.ea.com/en/games/ea-sports-fc/fc-26/news/pitch-notes-fc26-career-mode-deep-dive) ; tu puoi spingerlo oltre perché l'LLM genera il formato che gli chiedi. Con questi quattro strati attivi, la ripetizione percepita crolla: il contenuto è legato al tuo stato reale, filtrato dalla memoria, forzato a cambiare categoria e presentato in forme diverse.

### 4.4 Quando chiamare l'LLM: i trigger e il budget di chiamate

Non serve un'chiamata continua: bastano pochi punti di contatto ben scelti. La tabella seguente definisce i trigger consigliati e il consumo associato — è la base per la stima dei costi della sezione successiva.

| Trigger | Frequenza | Contenuto generato | Token stimati (in/out) |
|---|---|---|---|
| **Post-partita** | 1× per turno | Cronaca del turno + reazione spogliatoio/società al risultato | ~3.500 / ~1.200 |
| **Evento settimanale** | 1-2× per turno | Evento con opzioni (schema sopra) | ~4.500 / ~1.800 |
| **Momento stampa** | Solo su trigger (big match, crisi, striscia) | 2-3 domande con toni diversi | ~3.000 / ~1.000 |
| **Finestra di mercato** | 4-8× a finestra | Offerte, motivazioni, reazioni | ~4.000 / ~1.500 |
| **Milestone stagionali** | 3-4× a stagione | Obiettivi, bilancio di fine anno, prospetti del vivaio, offerte di panchina | ~5.000 / ~2.500 |

Sommando: una sessione di gioco tipica (2-3 turni di campionato) consuma **10-14 chiamate**, ovvero circa 50.000 token in ingresso e 20.000 in uscita. Con tre sessioni a settimana sei nell'ordine dei **620.000 token input e 230.000 output al mese** — numeri piccolissimi per gli standard API, come mostra la stima dei costi qui sotto.

### 4.5 Costi e modelli consigliati

![Costo stimato del motore LLM al mese e a stagione per i principali modelli API](assets/costi_llm.png)

I prezzi API di agosto 2026 rendono questo progetto economicamente irrilevante: i modelli "piccoli" di ultima generazione sono più che sufficienti per scrivere cronaca e dialoghi di qualità. I Gemini Flash-Lite costano tra 0,10-0,25 $/milione di token in ingresso (2,5 Flash-Lite a $0,10/$0,40, 3,1 Flash-Lite a $0,25/$1,50), DeepSeek V4 Flash è a $0,14/$0,28, mentre i tier superiori come GPT-5.4 mini ($0,75/$4,50) e Claude Haiku 4.5 ($1,00/$5,00) restano comunque sotto i 2 dollari al mese per il tuo carico  [(Morph AI)](https://www.morphllm.com/llm-api) . In stagione (6 mesi) parliamo di **meno di un dollaro con i modelli economici e meno di 11 dollari con i più costosi**. Inoltre Google offre un **free tier** con rate limit sui modelli Flash, sufficiente per sviluppare e probabilmente per giocare gratis le prime stagioni  [(No Code MBA)](https://www.nocode.mba/articles/google-ai-studio-pricing) .

| Modello | Prezzo (in/out per 1M token) | Costo stagionale stimato | Verdetto |
|---|---|---|---|
| **Gemini 2.5 Flash-Lite** | $0,10 / $0,40  [(CostGoat)](https://costgoat.com/pricing/gemini-api)  | ~$0,94 | **Start qui**: gratis nel free tier, qualità già buona per cronaca |
| **DeepSeek V4 Flash** | $0,14 / $0,28  [(spheron.network)](https://www.spheron.network/blog/llm-api-pricing-comparison-gpt-claude-gemini-deepseek-2026/)  | ~$0,92 | Alternativa economica, italiano discreto |
| **Gemini 3.1 Flash-Lite** | $0,25 / $1,50  [(Morph AI)](https://www.morphllm.com/llm-api)  | ~$3,04 | Upgrade qualitativo contenuto |
| **GPT-5.4 mini** | $0,75 / $4,50  [(spheron.network)](https://www.spheron.network/blog/llm-api-pricing-comparison-gpt-claude-gemini-deepseek-2026/)  | ~$9,12 | **Upgrade di qualità**: narrativa più naturale in italiano |
| **Claude Haiku 4.5** | $1,00 / $5,00  [(spheron.network)](https://www.spheron.network/blog/llm-api-pricing-comparison-gpt-claude-gemini-deepseek-2026/)  | ~$10,76 | Ottimo per dialoghi; da valutare in A/B |

Due consigli pratici. Primo: progetta il servizio LLM **provider-agnostic** (un unico modulo con la chiave API nelle impostazioni e un selettore del modello), così cambi modello senza toccare il resto — i prezzi e le classifiche di qualità cambiano ogni pochi mesi, e la flessibilità vale più di qualsiasi scelta fatta oggi. Secondo: sfrutta la **separazione dei compiti** — le chiamate "meccaniche" (riassunti, classificazioni) possono restare sul modello economico anche quando passerai a un modello migliore per gli eventi narrativi, dimezzando di fatto il costo dell'upgrade.

### 4.6 Modalità offline e fallback: la carriera non deve mai fermarsi

Ultimo mattone del motore: il **piano B**. L'app deve funzionare anche senza API (rete assente, chiave non configurata, budget esaurito): il codice contiene tabelle precaricate di eventi generici per categoria — una trentina bastano, scritti una volta da te o generati in batch dall'LLM durante lo sviluppo — e quando la chiamata fallisce, il motore pesca da quelle applicando lo stesso schema di effetti. La differenza di esperienza c'è (gli eventi offline si ripetono prima), ma la struttura regge: classifiche, morale, obiettivi e decisioni funzionano identici. Questo design "LLM come potenziamento, non come dipendenza" è anche ciò che ti permette di sviluppare l'MVP interamente offline e accendere la parte LLM come milestone successiva, senza rischio di blocco.

---

## 5. Stack tecnico e sviluppo con AI coding tools

### 5.1 L'architettura consigliata: tutto nel browser, niente server

![Architettura tecnica consigliata: frontend React, game engine deterministico, servizio LLM e database locale](assets/architettura.png)

Per il tuo profilo — principiante che sviluppa con AI coding tools — l'architettura giusta è quella con **il minor numero possibile di pezzi in movimento**: un'app web che gira interamente nel browser, senza backend da mantenere. Lo stack consigliato è **Vite + React + TypeScript + Tailwind** per l'interfaccia, **Dexie.js** come database locale (è il wrapper più semplice e documentato sopra IndexedDB, ideale per storage strutturato senza server  [(CSS Author)](https://cssauthor.com/offline-first-tech-stack/) ), e un piccolo modulo `llm-service` che chiama l'API del provider scelto con la chiave salvata nelle impostazioni dell'app. Vite è il build tool standard del 2026 per questo genere di progetti e React resta l'ecosistema con più materiale e migliore supporto da parte degli AI coding tools  [(CSS Author)](https://cssauthor.com/offline-first-tech-stack/) . L'app si avvia in locale con un doppio click (`npm run dev`) oppure, in una fase successiva, puoi pubblicarla gratis come sito statico (GitHub Pages, Netlify, Vercel) per giocarci anche da altro dispositivo.

Tre note su decisioni che potresti mettere in discussione. **Perché non un backend**: un server aggiungerebbe deploy, manutenzione e concetti (autenticazione, hosting) che per un progetto personale single-player sono peso morto; i dati della carriera vivono benissimo nel browser, con export/import JSON del salvataggio per backup e per passare da un PC all'altro. **Attenzione alla chiave API**: salvandola nel browser la espanni solo al tuo PC — accettabile per uso personale; se un giorno pubblicassi l'app per altri utenti, servirebbe un mini-proxy lato server per non esporre la chiave, ma è un problema di una fase 2 che oggi non ti riguarda. **Perché TypeScript**: per un principiante sembra una complicazione, ma con gli AI coding tools è il contrario — i tipi danno all'AI un contesto preciso sul modello dati e riducono gli errori che genera, come confermano le guide di stack per sviluppo AI-assistito  [(CSS Author)](https://cssauthor.com/offline-first-tech-stack/) .

### 5.2 Il workflow vincente con gli AI coding tools: PRD + regole + milestone

La ricerca sullo sviluppo assistito converge su un punto: con strumenti come Cursor, la differenza tra un progetto che decolla e uno che deraglia è la **documentazione di specifica**  [(chatprd.ai)](https://www.chatprd.ai/learn/PRD-for-Cursor) . Il pattern consigliato si chiama PRD-driven development: scrivi un `PRD.md` (Product Requirements Document) nella repo, lo tieni aggiornato, e gli dai un ruolo attivo in ogni prompt ("implementa la User Story 7 come da PRD, sezione Mercato"). Il PRD per questo progetto è già mezzo scritto: le sezioni 3 e 4 di questo documento contengono moduli, meccaniche, schema dati, schema JSON e prompt di sistema — il lavoro iniziale è tradurle in formato checklist.

Le regole pratiche da seguire, distillate dalle best practice 2026  [(chatprd.ai)](https://www.chatprd.ai/learn/PRD-for-Cursor) :

1. **Verifica il calcio reale prima di implementare** — per ogni meccanica o dinamica calcistica (valori calciatori, budget, trattative, morale, infortuni, mercato) il modello fa prima una verifica su internet: eventi moderni del calcio, situazioni realmente accadute, informazioni pratiche e dettagliate (cifre reali, scale salariali, regole, casi concreti). Si implementa solo ciò che è fondato su dati reali verificati, registrando la fonte con la feature. È il principio più importante per il realismo (sezione 3.1).
2. **Struttura il PRD in user story con criteri di accettazione** — non "il sistema gestisce il morale" ma "US-14: dopo ogni referto, il morale dei titolari varia di +5/-5 in base al risultato; criterio: visibile nella schermata rosa entro un turno".
3. **Crea un file di regole per l'AI** (`.cursor/rules/` o equivalente, o `AGENTS.md`): stack fissato, convenzioni ("usa sempre Dexie per la persistenza", "mai chiamate LLM fuori dal modulo llm-service", "tutti gli effetti numerici passano dal game engine"). Senza regole, l'AI suggerirà pattern incoerenti tra loro  [(chatprd.ai)](https://www.chatprd.ai/learn/PRD-for-Cursor) .
4. **Una milestone alla volta, mai il progetto intero in un prompt**: chiedi "implementa il modello dati e la schermata rosa", verifica, poi prosegui. Gli errori si correggono a livello di storia, non di sistema.
5. **Verifica sempre**: l'output dell'AI è una bozza da testare, anche solo a mano ("inserisco un referto 3-1, controllo che la classifica si muova"). Puoi chiedere allo stesso tool di generare i test per i criteri di accettazione  [(chatprd.ai)](https://www.chatprd.ai/learn/PRD-for-Cursor) .
6. **Tieni il PRD nel repo e aggiornato**: se cambi una decisione, aggiorna il documento prima di continuare a generare codice, altrimenti l'AI lavorerà su requisiti obsoleti  [(chatprd.ai)](https://www.chatprd.ai/learn/PRD-for-Cursor) .

### 5.3 Roadmap: da zero alla carriera in cinque milestone

La roadmap è pensata per darti qualcosa di giocabile **presto** e per accendere l'LLM solo quando lo scheletro regge. I tempi sono indicativi per un principiante con AI coding tools, lavorando a ritmo rilassato nei weekend.

| Milestone | Contenuto | Esito giocabile | Impegno stimato |
|---|---|---|---|
| **M0 — Fondamenta** | Setup progetto (Vite+React+TS+Tailwind+Dexie), PRD.md, file di regole, modello dati | L'app si avvia, dati di esempio nel DB | 1 weekend |
| **M1 — Tracker** | Rosa, calendario, form referto, classifica, statistiche base | **Tracker funzionante senza LLM**: puoi già giocare una stagione "registrata" | 2-3 weekend |
| **M2 — Stato e decisioni** | Morale, forma, promesse, obiettivo società, fiducia; home stile Portal | Le tue scelte di formazione hanno peso; compare la tensione obiettivo | 2-3 weekend |
| **M3 — Motore LLM** | Modulo llm-service, structured output, eventi settimanali, notizie, archivio anti-ripetizione, fallback offline | **La carriera si anima**: eventi e cronaca generati | 2-4 weekend |
| **M4 — Mondo attorno** | Mercato, media/tifosi, infortuni, settore giovanile con rigenerati | La stagione ha finestre, drammi e futuro | 3-4 weekend |
| **M5 — Carriera lunga (v2)** | Reputazione, esonero/offerte, finanze, staff, storico stagioni, export | Da stagione a carriera pluriennale | a piacere |

Due indicazioni strategiche sulla roadmap. La prima: **resisti alla tentazione di partire da M3**. L'LLM è la parte più divertente ma anche quella che maschera i problemi dello scheletro: se morale e classifica non funzionano, nessuna narrativa ti salverà. La seconda: al termine di M1 hai già un prodotto utile (equivalente ai tracker della community, che la gente usa volentieri  [(reddit.com)](https://www.reddit.com/r/seriousfifacareers/comments/1uo5fof/i_got_tired_of_spreadsheets_so_i_built_a_desktop/) ), quindi ogni milestone successiva è valore aggiunto, non un passaggio obbligato per iniziare a divertirti. Questo è il modo corretto di gestire il rischio progettuale da principiante: nessun big bang, valore a ogni passo.

---

## 6. Rischi, limiti e consigli finali

### 6.1 I rischi veri del progetto (e le contromisure)

Il primo rischio è l'**attrito dell'inserimento manuale**: se compilare il referto richiede più di un minuto, smetterai di usarlo. Contromisura: progetta il form referto come la schermata più curata dell'app — valori precompilati, tap sui marcatori, niente campi obbligatori oltre al risultato; le note fini sono opzionali. Il secondo rischio è la **deriva di coerenza tra rosa FL26 e rosa dashboard**: se in FL26 fai un mercato estivo selvaggio in edit mode, la dashboard si disallinea. Contromisura: una procedura "sincronizza rosa" guidata (re-import da lista testuale o modifica rapida), da fare solo quando decidi tu — il mercato dentro la carriera dovrebbe vivere nella dashboard, mentre l'edit mode di FL26 resta per i ritocchi estetici (maglie, volti), visto anche che modificare i binari è sconsigliato  [(SmokePatch)](https://www.pessmokepatch.com/2025/10/spfl26.html) .

Il terzo rischio è il **bilanciamento**: se gli effetti di morale e fiducia sono troppo timidi non li percepirai, troppo aggressivi renderanno ogni settimana una crisi. Contromisura: parti con gli intervalli suggeriti (±5 per risultati, ±10 massimo per eventi) e rendili costanti di configurazione modificabili in un pannello impostazioni — dopo una stagione di prova saprai come tararli sul tuo gusto. Il quarto rischio, già discusso, è la **ripetizione LLM**: mitigata con archivio eventi, cooldown di categoria e varietà di formato (sezione 4.3). Il quinto è la **morte per ambizione**: tredici moduli sono tanti; la roadmap a milestone esiste apposta per farti giocare dopo poche settimane e completare il resto per gradi. Il sesto, tecnico: **perdita del salvataggio** — il database vive nel browser, quindi implementa fin da M1 l'export JSON con promemoria settimanale; è una riga di codice che salva la carriera.

### 6.2 Consigli finali e prossimi passi concreti

Riassumendo in tre righe il giudizio complessivo: **l'idea è valida, il momento è quello giusto, e il design che conta è quello descritto qui — scheletro deterministico piccolo, narrativa LLM sopra, sviluppo per milestone con PRD**. I pezzi che rendono il progetto speciale rispetto a qualsiasi tracker esistente sono il motore eventi con la tassonomia di FC 26  [(Electronic Arts)](https://www.ea.com/en/games/ea-sports-fc/fc-26/news/pitch-notes-fc26-career-mode-deep-dive) , la gestione umana alla FM (morale, promesse, leader)  [(FootballGPT)](https://footballgpt.co/fm/fm-morale)  e la carriera lunga con reputazione e mercato allenatori  [(Eldorado.gg)](https://www.eldorado.gg/blog/fc-26-career-mode-deep-dive/) : tre sistemi che nessun prodotto commerciale offre oggi per FL26, e che un LLM rende finalmente realizzabili da un singolo appassionato.

I prossimi passi concreti, in ordine: (1) decidi la squadra e la lega della prima carriera e butta giù l'elenco squadre con le forze — sarà il dataset di prova; (2) trasforma le sezioni 3-4 di questo documento in `PRD.md` con user story e criteri di accettazione; (3) crea la API key del provider scelto (parti dal free tier di Gemini  [(No Code MBA)](https://www.nocode.mba/articles/google-ai-studio-pricing) ) e fai un piccolo test manuale del prompt eventi in AI Studio prima ancora di scrivere codice — vedere l'LLM generare il primo evento sulla tua rosa è la migliore motivazione per continuare; (4) apri il progetto nel tuo AI coding tool, incolla il file di regole e parti da M0. Se vorrai, in un secondo momento potremo trasformare questo documento direttamente nel PRD strutturato, nello schema del database, o in un prototipo funzionante della dashboard già costruito qui.

---

*Documento redatto ad agosto 2026. Prezzi e disponibilità dei modelli LLM cambiano rapidamente: verifica le tariffe aggiornate del provider prima di impostare il budget. Football Life è un progetto amatoriale della community SmokePatch: questa dashboard è un progetto personale non affiliato.*

 [(SmokePatch)](https://www.pessmokepatch.com/2025/07/contractsfix.html) : https://www.pessmokepatch.com/2025/07/contractsfix.html
 [(PESTeam.it)](https://www.pesteam.it/forum/threads/football-life-2026.43769/) : https://www.pesteam.it/forum/threads/football-life-2026.43769/
 [(SmokePatch)](https://www.pessmokepatch.com/2025/10/spfl26.html) : https://www.pessmokepatch.com/2025/10/spfl26.html
 [(reddit.com)](https://www.reddit.com/r/SPFootballLife/comments/1gajp0x/faq_guide_the_football_life_common_questions_read/) : https://www.reddit.com/r/SPFootballLife/comments/1gajp0x/faq_guide_the_football_life_common_questions_read/
 [(SmokePatch)](https://www.pessmokepatch.com/2026/07/FL27.html) : https://www.pessmokepatch.com/2026/07/FL27.html
 [(GAMES.GG)](https://games.gg/ea-sports-fc-26/guides/ea-fc-26-career-mode-guide/) : https://games.gg/ea-sports-fc-26/guides/ea-fc-26-career-mode-guide/
 [(Electronic Arts)](https://www.ea.com/en/games/ea-sports-fc/fc-26/features/fc-26-career-mode) : https://www.ea.com/en/games/ea-sports-fc/fc-26/features/fc-26-career-mode
 [(ClutchPoints)](https://clutchpoints.com/gaming/ea-sports-fc-26-career-mode) : https://clutchpoints.com/gaming/ea-sports-fc-26-career-mode
 [(Electronic Arts)](https://www.ea.com/games/ea-sports-fc/fc-27/news/pitch-notes-fc27-career-mode-deep-dive) : https://www.ea.com/games/ea-sports-fc/fc-27/news/pitch-notes-fc27-career-mode-deep-dive
 [(Electronic Arts)](https://www.ea.com/en/games/ea-sports-fc/fc-26/news/pitch-notes-fc26-career-mode-deep-dive) : https://www.ea.com/en/games/ea-sports-fc/fc-26/news/pitch-notes-fc26-career-mode-deep-dive
 [(Eldorado.gg)](https://www.eldorado.gg/blog/fc-26-career-mode-deep-dive/) : https://www.eldorado.gg/blog/fc-26-career-mode-deep-dive/
 [(Football Manager)](https://www.footballmanager.com/fm26/features/fm26s-reimagined-user-interface) : https://www.footballmanager.com/fm26/features/fm26s-reimagined-user-interface
 [(FootballGPT)](https://footballgpt.co/fm/fm-morale) : https://footballgpt.co/fm/fm-morale
 [(sports-interactive.com)](https://community.sports-interactive.com/forums/topic/578796-does-anyone-actually-enjoy-the-media-and-player-interactions/) : https://community.sports-interactive.com/forums/topic/578796-does-anyone-actually-enjoy-the-media-and-player-interactions/
 [(reddit.com)](https://www.reddit.com/r/seriousfifacareers/comments/1uumaco/now_you_can_also_track_your_player_career_mode/) : https://www.reddit.com/r/seriousfifacareers/comments/1uumaco/now_you_can_also_track_your_player_career_mode/
 [(reddit.com)](https://www.reddit.com/r/WEPES/comments/digko6/master_league_tips_good_signings_starting_team/) : https://www.reddit.com/r/WEPES/comments/digko6/master_league_tips_good_signings_starting_team/
 [(reddit.com)](https://www.reddit.com/r/FifaCareers/comments/1osgwfl/career_mode_companion_app_ios_and_android/) : https://www.reddit.com/r/FifaCareers/comments/1osgwfl/career_mode_companion_app_ios_and_android/
 [(reddit.com)](https://www.reddit.com/r/seriousfifacareers/comments/1uo5fof/i_got_tired_of_spreadsheets_so_i_built_a_desktop/) : https://www.reddit.com/r/seriousfifacareers/comments/1uo5fof/i_got_tired_of_spreadsheets_so_i_built_a_desktop/
 [(reddit.com)](https://www.reddit.com/r/seriousfifacareers/comments/1lqmpl5/looking_for_a_realistic_career_mode_spreadsheet/) : https://www.reddit.com/r/seriousfifacareers/comments/1lqmpl5/looking_for_a_realistic_career_mode_spreadsheet/
 [(fandom.com)](https://pes-theorist.fandom.com/wiki/Master_League) : https://pes-theorist.fandom.com/wiki/Master_League
 [(MDPI)](https://www.mdpi.com/2227-7390/13/17/2738) : https://www.mdpi.com/2227-7390/13/17/2738
 [(zenml.io)](https://www.zenml.io/llmops-database/automated-sports-commentary-generation-using-llms) : https://www.zenml.io/llmops-database/automated-sports-commentary-generation-using-llms
 [(DEV Community)](https://dev.to/maanu07/reliable-llm-json-output-few-shot-prompting-robust-parsing-2f11) : https://dev.to/maanu07/reliable-llm-json-output-few-shot-prompting-robust-parsing-2f11
 [(Codecademy)](https://www.codecademy.com/article/prompt-engineering-101-understanding-zero-shot-one-shot-and-few-shot) : https://www.codecademy.com/article/prompt-engineering-101-understanding-zero-shot-one-shot-and-few-shot
 [(arXiv.org)](https://arxiv.org/html/2402.18659v5) : https://arxiv.org/html/2402.18659v5
 [(spheron.network)](https://www.spheron.network/blog/llm-api-pricing-comparison-gpt-claude-gemini-deepseek-2026/) : https://www.spheron.network/blog/llm-api-pricing-comparison-gpt-claude-gemini-deepseek-2026/
 [(No Code MBA)](https://www.nocode.mba/articles/google-ai-studio-pricing) : https://www.nocode.mba/articles/google-ai-studio-pricing
 [(CostGoat)](https://costgoat.com/pricing/gemini-api) : https://costgoat.com/pricing/gemini-api
 [(Morph AI)](https://www.morphllm.com/llm-api) : https://www.morphllm.com/llm-api
 [(CSS Author)](https://cssauthor.com/offline-first-tech-stack/) : https://cssauthor.com/offline-first-tech-stack/
 [(discretelogix.com)](https://www.discretelogix.com/web-development-tools/) : https://www.discretelogix.com/web-development-tools/
 [(sortitoutsi.net)](https://sortitoutsi.net/content/71008/5-best-football-manager-mobile-games) : https://sortitoutsi.net/content/71008/5-best-football-manager-mobile-games
 [(x.ai)](https://docs.x.ai/developers/model-capabilities/text/structured-outputs) : https://docs.x.ai/developers/model-capabilities/text/structured-outputs
 [(chatprd.ai)](https://www.chatprd.ai/learn/PRD-for-Cursor) : https://www.chatprd.ai/learn/PRD-for-Cursor
 [(openai.com)](https://developers.openai.com/api/docs/guides/structured-outputs) : https://developers.openai.com/api/docs/guides/structured-outputs

---

## 7. Design avanzato (v2): competizioni, database europeo, mercato globale e integrazione con FL26

*Questa sezione amplia il progetto in seguito all'analisi dei sette requisiti aggiuntivi. Dove le indicazioni divergono dalle sezioni precedenti (in particolare la scelta dei modelli LLM della sezione 4.5 e il perimetro del mondo di gioco della sezione 3), prevale quanto scritto qui.*

### 7.1 Il motore delle competizioni: tutto il calcio, non solo il campionato

Il requisito "oltre la stagione del campionato" trasforma il cuore del progetto: non un motore di lega singola, ma un **motore multi-competizione** che replica l'intero ecosistema calcistico. La buona notizia è che tutte le competizioni condividono lo stesso scheletro — squadre partecipanti, sorteggio, calendario, risultati, classifica/tabellone, vincitore — quindi il codice implementa **un unico template di competizione parametrico** e le singole coppe sono istanze con parametri diversi. Questa scelta architetturale è ciò che rende il requisito fattibile senza far esplodere la complessità: la differenza tra una coppa nazionale e la Champions League, per il motore, è solo configurazione (numero di squadre, turni, regole di sorteggio, seeding), non codice nuovo.

Le competizioni gestite, con il loro formato consigliato:

| Competizione | Quando | Formato nel simulatore | Note di design |
|---|---|---|---|
| **Campionato** | ago–mag | Girone all'italiana, calendario completo | Il tuo torneo principale |
| **Coppa nazionale** | set–mag, infrasettimanale | Eliminazione diretta, turni predefiniti | Entri a turno avanzato se sei una big |
| **Supercoppa** | agosto | Partita secca | Solo se hai vinto qualcosa l'anno prima |
| **Champions League** | set–mag | League phase a 36 squadre (8 partite) + playoff + tabellone | Formato UEFA reale 2024+ |
| **Europa League** | set–mag | Come UCL | Stesso template, seeding diverso |
| **Conference League** | set–mag | Come UCL, league phase ridotta (6 partite) | Stesso template |
| **Mondiale / Europeo** | giugno–luglio, anni alterni | Gironi + tabellone con le nazionali | I tuoi giocatori partono per la nazionale |
| **Qualificazioni europee** | luglio–agosto | Turni preliminari andata/ritorno | Solo se il tuo piazzamento lo richiede |

Il **motore del calendario** è il componente che rende tutto credibile: la stagione è una sequenza di settimane, ognuna con slot weekend (campionato) e slot infrasettimanale (coppe), più le soste per le nazionali in cui i tuoi giocatori convocati accumulano fatica e rischio infortuni (uno degli scenari classici di FC 26  [(Electronic Arts)](https://www.ea.com/en/games/ea-sports-fc/fc-26/news/pitch-notes-fc26-career-mode-deep-dive) ). Le partite che ti riguardano le giochi in FL26 in partita veloce — la dashboard ti dice esattamente cosa impostare: squadre, maglie, stadio, turno — mentre **tutte le altre partite del mondo vengono simulate dal motore** con la regola basata sulla forza, e raccontate dall'LLM nella cronaca del turno. Per i sorteggi europei il motore usa un **coefficiente per club** aggiornato ogni stagione sui risultati continentali (una versione semplificata del ranking UEFA), che determina fasce, teste di serie e accessi alle coppe: è il meccanismo che fa sì che la quinta stagione della tua carriera abbia un'Europa plausibilmente diversa dalla prima.

Due regole di coerenza col vincolo "si gioca solo ciò che esiste in FL26". Primo: **i tabelloni europei si popolano solo con squadre presenti nel database di FL26** — che include, oltre ai principali campionati, una ricca selezione di club europei minori e tutte le nazionali, aggiornate fino alle convocazioni del Mondiale 2026  [(SmokePatch)](https://www.pessmokepatch.com/2025/10/spfl26.html) . Se il sorteggio pescasse una squadra assente dal gioco, non potresti mai giocarci contro: il motore quindi restringe il "pool giocabile" alle squadre FL26 e usa le altre solo come *squadre ombra* (nome, nazione, forza) per riempire qualificazioni e coefficienti — ci sono, fanno risultati, ma non le incontri mai sul campo. Secondo: per le nazionali il discorso è identico — FL26 le include tutte  [(SmokePatch)](https://www.pessmokepatch.com/2026/06/FL26WC.html)  — e il torneo estivo funziona così: i tuoi giocatori convocati partono (effetti su fatica e morale al rientro), i risultati del torneo sono simulati e narrati, e in una v2 puoi persino accettare una panchina di nazionale e giocare tu stesso il Mondiale in partita veloce.

### 7.2 Il database europeo unico: una sola fonte di verità

Il requisito di coerenza — niente giocatori comprati due volte, niente doppioni in due squadre — si risolve con una decisione architetturale netta: **il database della dashboard è l'unica fonte di verità del mondo calcistico, e ogni cambiamento passa da transazioni validate dal codice**. Non è l'LLM a "ricordarsi" chi gioca dove: è il database a impedire fisicamente le incoerenze, perché le regole di integrità sono vincoli applicati a ogni scrittura. L'LLM propone (offerte, trattative, voci), il motore dispone (valida e applica): è l'estensione naturale del principio numeri/storie della sezione 4.1 al dominio più delicato, quello delle rose.

Il modello dati si estende con tre registri. Il **Player Registry** è l'anagrafica globale: ogni calciatore esiste una sola volta, con ID univoco interno, nome, nazionalità, età, attributi, valore di mercato e — fondamentale per il ponte con FL26 — il **mapping con l'ID PES** del giocatore nel database del gioco. Il **Team Registry** contiene tutte le squadre (campionati top europei, club minori presenti in FL26, nazionali, più le squadre ombra), ciascuna con forza, coefficiente, budget e reputazione. La tabella **Squad Assignment** collega giocatori e squadre con validità temporale (dal/al), di modo che lo storico dei passaggi sia ricostruibile e che in ogni istante valga l'invariante principale. Le regole di integrità applicate dal codice a ogni transazione:

| Invariante | Regola applicata dal motore |
|---|---|
| **Unicità del club** | Un giocatore ha al massimo un club proprietario (più eventuale prestito a un secondo club) |
| **Niente doppioni** | L'ID giocatore è chiave primaria: non può esistere due volte, né nel DB né nei CSV verso l'editor |
| **Rosa entro i limiti** | Max 25 giocatori di movimento + portieri + lista B giovani; un acquisto oltre limite viene bloccato |
| **Budget** | Una squadra non può spendere oltre budget + ingaggi disponibili |
| **Atomicità** | Un trasferimento aggiorna entrambe le rose in una sola operazione: o tutto o niente |
| **Coerenza editor** | Ogni giocatore esportato verso FL26 ha un PES ID valido e univoco nella mappatura |

Il **bootstrap del database** — riempirlo la prima volta — non si fa a mano e non si fa inventare all'LLM: si esporta direttamente da FL26. L'editor ejogc327 esporta in CSV squadre, giocatori e assegnazioni dell'intero database di PES 2021/FL26  [(ejogc327.blogspot.com)](https://ejogc327.blogspot.com/p/features.html) ; la dashboard importa quei CSV e costruisce il proprio mondo come **fotografia esatta del tuo FL26**: stesse squadre, stessi giocatori, stessi overall, e gli ID PES già mappati. Questo risolve elegantemente anche il requisito delle "squadre europee poco conosciute": il perimetro del tuo mondo è quello di FL26, che è molto più ampio dei soli campionati maggiori, ed è garantito giocabile perché esiste nel gioco. Le squadre reali assenti da FL26 (i campionati davvero minori) esistono solo come squadre ombra per la logica dei sorteggi, con un profilo sintetico generato una tantum — e se un giorno vorrai renderle giocabili, il percorso è quello documentato dalla community: crearle nell'editor sopra uno slot editabile  [(reddit.com)](https://www.reddit.com/r/SPFootballLife/comments/1gajp0x/faq_guide_the_football_life_common_questions_read/)  e poi importarle nella dashboard.

### 7.3 Il motore di mercato coerente: transazioni, non racconti

Il calciomercato è il sistema dove l'incoerenza farebbe più danni, quindi è progettato come un **registro transazionale** prima ancora che come narrativa. Ogni movimento — tuo o della CPU — segue una macchina a stati rigorosa: *proposta* (un club manifesta interesse per un giocatore del Player Registry) → *trattativa* (contro-offerte su cifra e ingaggio, con un numero limitato di giri) → *accordo* (condizioni fissate) → *ufficialità* → **applicazione atomica**: il motore verifica tutte le invarianti della tabella precedente e solo allora sposta il giocatore, aggiorna i budget delle due squadre e scrive il movimento nel **ledger dei trasferimenti**, lo storico permanente che alimenta narrativa e anti-ripetizione. Se una qualsiasi verifica fallisce — rosa piena, budget insufficiente, giocatore già ceduto in quella finestra — la transazione abortisce interamente e l'evento viene registrato come "trattativa saltata", che è a sua volta materiale narrativo (i giornali adorano le trattative fallite).

Il realismo del mercato nasce dalla divisione dei compiti ormai consolidata. Le **cifre sono deterministiche**: il valore di mercato di un giocatore deriva da una formula su overall, età, ruolo e contratto residuo; l'offerta di una squadra CPU deriva da valore × fattore di bisogno (quanto il ruolo scoperto pesa nella sua rosa) × fattore di ricchezza del club; l'ingaggio è ancorato al valore. L'**LLM rende tutto vivo**: genera le motivazioni dell'interesse ("il club cerca un esterno dopo la cessione di X"), i messaggi dell'agente, le indiscrezioni di mercato sul tuo telefonino, le reazioni dello spogliatoio alle cessioni eccellenti, e il dramma del deadline day — eventi speciali con trattative lampo a tempo. Il **mercato CPU-to-CPU**, quello tra squadre che non ti riguardano, usa lo stesso identico canale: il motore genera i bisogni delle rose, l'LLM propone uno scenario di movimenti plausibili per la finestra, il codice ne valida ogni singola transazione contro le invarianti e applica solo quelle valide, poi l'LLM le racconta come notizie. Così l'Europa si muove a ogni finestra, il tuo mondo invecchia e cambia, e nessun giocatore può mai finire in due posti contemporaneamente — perché a decidere gli spostamenti è il registro, non la fantasia del modello.

L'ultimo anello della catena è la **sincronizzazione con FL26**: i trasferimenti decisi nella dashboard devono riflettersi nel gioco dove poi li "vedi" in campo. Qui il mercato incontra il ponte dati della sezione seguente: a fine finestra (o quando preferisci), la dashboard genera il CSV delle nuove assegnazioni nel formato dell'editor, tu lo importi in PES Editor e salvi l'EDIT file — e alla prossima accensione di FL26 le rose sono aggiornate alla tua carriera. Il mercato che gestisci nella dashboard diventa così il mercato che esiste davvero sul campo, chiudendo il cerchio tra gestione e gameplay.

### 7.4 Il ponte dati con PES Editor e FL26

![Il ponte dati: la dashboard esporta CSV verso PES Editor, che salva l'EDIT file letto da FL26; MiMo V2.5 legge gli screenshot del referto](assets/ponte_editor.png)

La risposta alla domanda "è possibile condividere i dati del progetto con PES Editor?" è **sì, ed è la scoperta tecnica più importante di questa revisione**: l'editor ejogc327 — compatibile con i file bin di PES 2021, cioè la base di FL26 — importa ed esporta **CSV di giocatori, squadre, allenatori, assegnazioni/rose e formazioni**  [(ejogc327.blogspot.com)](https://ejogc327.blogspot.com/p/features.html) . Il CSV diventa quindi il formato di scambio ufficiale del progetto: la dashboard produce file con gli header esatti che l'editor si aspetta (l'ordine delle colonne non conta, gli header sì, e il file deve essere UTF-8 con separatore punto e virgola  [(ejogc327.blogspot.com)](https://ejogc327.blogspot.com/) ), l'editor li importa e salva nel file **EDIT00000000**, che FL26 legge all'avvio dalla cartella dei salvataggi  [(SmokePatch)](https://www.pessmokepatch.com/2026/06/FL26WC.html) . Il flusso di ritorno è simmetrico: l'editor esporta CSV dello stato reale del gioco, la dashboard li confronta col proprio database e segnala eventuali disallineamenti — la tua "procedura di sincronizzazione" periodica diventa un controllo automatico invece che un esercizio di memoria.

I vincoli tecnici da rispettare, tutti gestibili con regole chiare nel PRD. Primo: **si lavora solo sull'EDIT file, mai sui bin del database** — modificare i bin di FL26 è esplicitamente sconsigliato perché confligge con gli aggiornamenti ufficiali del database  [(SmokePatch)](https://www.pessmokepatch.com/2025/10/spfl26.html) , mentre l'EDIT file è tuo e gli update di FL26 lo rispettano. Secondo: la modifica dell'EDIT file (a differenza dei bin) richiede la **versione donatore** dell'editor, sbloccata con una donazione di circa 4$/mese su Patreon  [(patreon.com)](https://www.patreon.com/ejogc327)  — un costo trascurabile che va messo a budget del progetto. Terzo: i nuovi giocatori creati in EDIT mode devono avere **ID superiore a 2147483648 (0x80000000)**  [(ejogc327.blogspot.com)](https://ejogc327.blogspot.com/) , e la dashboard gestisce questo vincolo automaticamente, assegnando a ogni giocatore creato (i giovani del vivaio, sezione 7.5) un PES ID libero in quel range e registrandolo nella mappatura. Quarto: **backup dell'EDIT file prima di ogni import** — la dashboard lo ricorda a ogni esportazione e, se le dai la cartella dei salvataggi, può farlo lei stessa copiando il file con timestamp.

La seconda gamba del ponte è il **multimodale di MiMo V2.5**, che trasforma il momento più fragile dell'esperienza — l'inserimento del referto — nel più comodo: finita la partita in FL26, fai uno screenshot della schermata del risultato, lo trascini nella dashboard, e MiMo V2.5 (che accetta immagini in input  [(deepinfra.com)](https://deepinfra.com/blog/best-mimo-v2-5-api-providers) ) estrae risultato, marcatori e statistiche e pre-compila il referto per la tua conferma. Lo stesso meccanismo serve in altri due punti: la **verifica della rosa** (screenshot della schermata rosa di FL26 → controllo incrociato col database) e l'importazione iniziale assistita. Il referto manuale resta disponibile come percorso primario — lo screenshot è un acceleratore opzionale — ma riduce l'attrito settimanale a una manciata di secondi, che era il rischio n°1 del progetto.

### 7.5 Il vivaio: giocatori che esistono davvero

Il vivaio merita un design speciale perché nel tuo progetto ha una proprietà che nessun managerial commerciale può offrire: **i giovani generati possono essere creati veramente in FL26** tramite l'editor, quindi li vedi in campo, ci giochi, li mandi in prestito. Il ciclo annuale funziona così. A inizio estate il motore produce lo **youth intake**: 3-5 prospetti per la tua squadra (più un pool per le altre, che alimenta il mercato futuro). Per ciascuno, il codice genera il profilo sportivo da template per ruolo — overall iniziale tra 55 e 68 a seconda del livello del tuo settore giovanile, potenziale nascosto, curva di crescita — mentre l'LLM genera l'identità: nome e nazionalità coerenti col vivaio della squadra, la mini-storia ("terzino arrivato a 14 anni dal settore provinciale, idolo Cafu"), e il parere dello scout con pregi e dubbi. La dashboard produce automaticamente il **CSV del nuovo giocatore nel formato dell'editor** — con ID nel range consentito, attributi, età, ruolo — e quello dell'assegnazione alla tua squadra; un unico import in PES Editor e il ragazzo esiste davvero in FL26, pronto a essere schierato in partita veloce.

La crescita nel tempo segue la stessa divisione numeri/storie. Il **progresso dell'overall è deterministico**: a fine stagione il motore aggiorna attributi e overall in base a minuti giocati (che traccia dai tuoi referti), età e potenziale, e produce il CSV di aggiornamento attributi da reimportare nell'editor — così il giocatore in gioco cresce insieme al giocatore nella carriera, e la mappatura ID garantisce che sia sempre lo stesso. L'**LLM narra lo sviluppo**: il resoconto di fine anno sul vivaio, il paragone azzardato dello scout, la notizia dell'esordio in prima squadra. I **rigenerati** chiudono il cerchio alla maniera della Master League classica  [(fandom.com)](https://pes-theorist.fandom.com/wiki/Master_League) : quando un giocatore si ritira, la stagione successiva il motore può far apparire nel tuo intake (o in quello di un'altra squadra) la sua versione sedicenne — stesso nome e ruolo, attributi da ricostruire — creata fisicamente in FL26 come qualsiasi altro giovane. Tra i moduli opzionali di v2, il **prestito** dei giovani a squadre minori (con crescita accelerata se giocano) è quello che dà più profondità al minor costo, perché riusa interamente la macchina transazionale del mercato.

### 7.6 Hosting: locale o Vercel?

La risposta breve è: **parti in locale, e forse non ti servirà mai altro**. L'architettura della sezione 5.1 è già local-first: l'app gira sul tuo PC (`npm run dev` in sviluppo, poi una build servita da un piccolo comando), i dati vivono in IndexedDB nel tuo browser, la chiave API di Opencode Go resta salvata solo sulla tua macchina. Per un simulatore di carriera single-player questa è la configurazione corretta: zero costi di hosting, zero manutenzione, nessun account, e il salvataggio/export JSON ti mette al riparo da tutto. L'unica accortezza pratica è usare **sempre lo stesso browser** (IndexedDB è per-browser) e fare export di backup periodici, che l'app ti ricorda.

Vercel diventa interessante solo in uno scenario: **giocare da più dispositivi** (PC di casa, laptop, magari un tablet a letto). In quel caso la pubblicazione come sito statico è gratuita e banale, ma devi accettare due compromessi e gestirli consapevolmente. Il primo è che IndexedDB non si sincronizza tra dispositivi: la carriera viaggia tramite export/import JSON del salvataggio (opzione accettabile: esporti a fine sessione, importi all'inizio della successiva), oppure richiede un vero backend con database — che è la strada "fase 2" da valutare solo se il multi-dispositivo diventa un'esigenza reale. Il secondo compromesso è la **chiave API**: in un'app statica la chiave viaggia nel browser, quindi sarebbe visibile a chiunque apra gli strumenti sviluppatore del sito. Per uso strettamente personale su un sito non indicizzato il rischio è contenuto (e i limiti di spesa dell'abbonamento Go fanno da argine  [(Docker Documentation)](https://docs.docker.com/ai/docker-agent/providers/opencode-go/) ), ma la prassi corretta è un **piccolo proxy serverless** (una Vercel Function di trenta righe che tiene la chiave lato server e inoltra le chiamate) — da far scrivere all'AI coding tool quando serve. Verdetto operativo per il PRD: **M0-M4 in locale; Vercel opzionale in M5**, decidi quando il progetto già funziona.

### 7.7 Il grado di autonomia del simulatore

Il requisito finale — "un simulatore di carriera allenatore che agisce autonomamente, dove solo le partite si giocano altrove" — è esattamente il principio su cui è costruito tutto il design, e vale la pena fissarlo in forma esplicita come contratto del sistema: **il mondo va avanti da solo; tu giochi le tue partite e prendi le tue decisioni; tutto il resto accade**. Quando avanzi di settimana, il motore processa in autonomia una catena completa di sistemi, e l'LLM li rende leggibili e vivi. La tabella seguente è il confine definitivo tra automatico e manuale, da includere nel PRD come requisito trasversale.

| Sistema | Chi lo muove | Come |
|---|---|---|
| Le **tue partite** (tutte le competizioni) | **Tu** | Partita veloce in FL26 → referto (manuale o via screenshot) |
| Le tue **decisioni** (formazione, eventi, mercato, promesse) | **Tu** | Dalla dashboard, con conseguenze deterministiche |
| Risultati di **tutte le altre partite** del mondo | Motore | Regola su forza squadre + varianza, per ogni competizione attiva |
| Classifiche, marcatori, tabelloni, qualificazioni | Motore | Derivati dai risultati, sempre coerenti |
| **Mercato CPU** tra club e scadenze/ingaggi | Motore + LLM | Transazioni validate; LLM propone scenari e racconta |
| **Carosello allenatori**: esoneri e panchine che cambiano | Motore + LLM | Sulla fiducia dei club; può generare offerte per te |
| **Invecchiamento, ritiri, rigenerati, crescita giovani** | Motore | Fine stagione, con CSV di aggiornamento per l'editor |
| **Nazionali**: convocazioni, soste, tornei estivi | Motore + LLM | Effetti su fatica/morale dei tuoi giocatori |
| Premi individuali, XI ideale, cronache, umori di piazza | Motore + LLM | Da statistiche reali del salvataggio |
| Coefficienti, fasce, accessi alle coppe della stagione successiva | Motore | Da risultati pluriennali, tutto tracciato |

In altre parole la dashboard è un vero simulatore: se una settimana ti limitassi ad avanzare senza fare nulla, la stagione proseguirebbe comunque — la tua squadra giocherebbe (risultato simulato, con penalità perché non l'hai preparata), il mercato si muoverebbe, gli allenatori saltarebbero, i giovani crescerebbero. La tua presenza è ciò che dà direzione, non ciò che tiene acceso il mondo. Questo principio ha anche un risvolto pratico importante: rende possibile la **modalità "vacanza"** (simula N settimane) e soprattutto rende ogni stagione successiva un mondo diverso generato dalla storia precedente, che è la definizione stessa di carriera lunga.

### 7.8 Configurazione LLM definitiva: Opencode Go con MiMo V2.5 e DeepSeek V4 Flash

La scelta dei modelli si aggiorna così, e sostituisce la tabella della sezione 4.5. **Opencode Go è utilizzabile dalla tua app**: l'abbonamento (5$ il primo mese, poi 10$/mese) espone un'API **OpenAI-compatibile** all'endpoint `https://opencode.ai/zen/go/v1` con autenticazione Bearer, verificata come funzionante anche da client esterni ad opencode  [(Docker Documentation)](https://docs.docker.com/ai/docker-agent/providers/opencode-go/) . Per il tuo `llm-service` significa una sola cosa: base URL + chiave + ID modello, esattamente il design provider-agnostic già previsto — nessun adattatore speciale. I limiti d'uso dell'abbonamento sono espressi in dollari (12$ per 5 ore, 30$ a settimana, 60$ al mese  [(Docker Documentation)](https://docs.docker.com/ai/docker-agent/providers/opencode-go/) ): il tuo consumo stimato di 1-3$/mese ci sta dentro con un margine di 20-50 volte, quindi il costo reale del progetto è semplicemente l'abbonamento flat, senza pensieri di budget per chiamata.

Il routing dei compiti sui due modelli:

| Compito | Modello | Perché |
|---|---|---|
| Eventi settimanali, cronache, dialoghi, stampa | **DeepSeek V4 Flash** (`deepseek-v4-flash`, $0,07/$0,14 per 1M  [(source database of AI models)](https://models.dev/providers/opencode-go) ) | Il più economico del catalogo, supporta structured output e tool call  [(source database of AI models)](https://models.dev/providers/opencode-go) , perfetto per testi brevi frequenti |
| Screenshot referto / rosa (OCR visivo) | **MiMo V2.5** (`mimo-v2.5`, $0,14/$0,28) | Omnimodale nativo: legge immagini, video e audio oltre al testo  [(deepinfra.com)](https://deepinfra.com/blog/best-mimo-v2-5-api-providers)  |
| Generazioni stagionali pesanti (mercato estivo europeo, youth intake, preview di stagione) | **MiMo V2.5** | Contesto 1M token: gli puoi passare l'intero stato del mondo in un colpo solo  [(deepinfra.com)](https://deepinfra.com/blog/best-mimo-v2-5-api-providers)  |
| (Opzionale) qualità massima su compiti delicati | MiMo V2.5 Pro (`mimo-v2.5-pro`, $0,43/$0,87  [(Julien.cloud)](https://julien.cloud/opencode-go-models/) ) | Da attivare nelle impostazioni se vuoi |

Una nota di cautela onesta: Opencode Go nasce come servizio per agenti di coding  [(opencode.ai)](https://opencode.ai/docs/go/) , non come API generalista per applicazioni — tecnicamente funziona ovunque (è un endpoint OpenAI-compatibile standard), ma tieni il design provider-agnostic come assicurazione: se domani i termini o il catalogo cambiassero, sposti base URL e modello nelle impostazioni e punti a Gemini o DeepSeek diretto in cinque minuti, senza toccare il codice. Questa flessibilità, già raccomandata nella sezione 4.5, con la tua scelta diventa un requisito esplicito del PRD.

### 7.9 Roadmap aggiornata (v2)

L'ampliamento del perimetro ridisegna la coda della roadmap; il principio resta identico — giocabile presto, valore a ogni passo — ma ora le milestone tengono conto del bootstrap da FL26 e del ponte con l'editor.

| Milestone | Contenuto | Esito giocabile |
|---|---|---|
| **M0 — Fondamenta** | Setup, PRD v2, regole, modello dati esteso (registry + assignments + ledger) | App avviata |
| **M1 — Bootstrap + Tracker** | Export CSV da PES Editor → import database europeo; rosa, calendario campionato, referto, classifica | Tracker sulla **vera** rosa FL26 |
| **M2 — Stato e decisioni** | Morale, promesse, fiducia, obiettivi; home stile Portal | Le scelte pesano |
| **M3 — Motore LLM** | llm-service su Opencode Go, eventi, cronache, anti-ripetizione, fallback; referto via screenshot MiMo | La carriera si anima |
| **M4 — Mondo e mercato** | Coppe nazionali + competizioni UEFA con sorteggi; motore transazionale di mercato; **esportazione CSV → editor → FL26**; mercato CPU | La stagione è completa e il mercato è reale in campo |
| **M5 — Carriera lunga** | Vivaio con creazione reale dei giocatori, rigenerati, reputazione/esonero, nazionali e tornei estivi, storico, export/backup; (opzionale Vercel + proxy) | Il simulatore di carriera completo |

Il suggerimento operativo più importante di questa revisione riguarda M1: **il bootstrap dal CSV di FL26 è la prima cosa da costruire dopo le fondamenta**, perché trasforma il progetto da "app generica" a "il tuo mondo" fin dal primo giorno, e perché il formato CSV dell'editor va catturato una sola volta (esporti un file di esempio, gli header diventano il template del PRD) e poi riusato in entrambe le direzioni per tutta la vita del progetto.

---

### Aggiornamento dei rischi (v2)

Ai rischi della sezione 6.1 se ne aggiungono quattro, tutti con contromisura chiara. Il **rischio formato CSV** (gli header dell'editor devono combaciare esattamente  [(ejogc327.blogspot.com)](https://ejogc327.blogspot.com/) ) si neutralizza nel PRD: il template si cattura una volta da un export reale e si testa su una rosa finta prima di toccare il tuo salvataggio. Il **rischio aggiornamenti FL26** — SmokePatch aggiorna rose e database periodicamente  [(SmokePatch)](https://www.pessmokepatch.com/2025/10/spfl26.html)  — si gestisce con una regola di condotta: gli update ufficiali si installano solo tra una carriera e l'altra, mai a stagione in corso, perché un update può cambiare gli ID sottostanti e disallineare la mappatura. Il **rischio errore umano nell'editor** si riduce con il backup automatico dell'EDIT file prima di ogni import e con l'esportazione di controllo post-import (la dashboard verifica che ciò che è nel gioco corrisponda a ciò che doveva succedere). Infine il **rischio dipendenza da Opencode Go** è già coperto dal design provider-agnostic della sezione 7.8: il servizio LLM resta intercambiabile per configurazione, non per riscrittura.

### Conclusione della revisione

Con questi sette punti integrati, il progetto assume la sua forma definitiva: **un simulatore di carriera allenatore completo e autonomo, che usa FL26 come motore di campo e l'editor come ponte bidirezionale verso di esso**. Il mondo contiene tutto il calcio — campionato, coppe nazionali, tre competizioni UEFA con sorteggi e coefficienti, nazionali e tornei estivi — popolato da un database europeo unico importato dal tuo FL26 reale, dove ogni trasferimento è una transazione validata che nessun LLM può rendere incoerente. Il mercato si muove in tutta Europa e le sue conseguenze arrivano fisicamente in campo tramite i CSV; il vivaio genera ragazzi che esistono davvero e crescono dentro il gioco; MiMo V2.5 ti libera perfino dall'inserimento manuale dei referti. Il costo totale dell'infrastruttura resta domestico: l'abbonamento Opencode Go (10$/mese), la donazione per la versione completa dell'editor (~4$/mese finché ti serve), zero hosting finché resti in locale. Il passo successivo consigliato è la conversione di questo documento nel `PRD.md` strutturato per l'AI coding tool, con il template CSV dell'editor allegato come artefatto tecnico di M1.

---

*Aggiornamento v2 di agosto 2026. L'endpoint Opencode Go, il catalogo modelli e le capacità dell'editor ejogc327 sono verificati alle fonti indicate; prima della milestone M3 ripeti il test dell'endpoint con la tua chiave, perché cataloghi e termini dei servizi API cambiano rapidamente.*

 [(opencode.ai)](https://opencode.ai/docs/go/) : https://opencode.ai/docs/go/
 [(Julien.cloud)](https://julien.cloud/opencode-go-models/) : https://julien.cloud/opencode-go-models/
 [(Docker Documentation)](https://docs.docker.com/ai/docker-agent/providers/opencode-go/) : https://docs.docker.com/ai/docker-agent/providers/opencode-go/
 [(deepinfra.com)](https://deepinfra.com/blog/best-mimo-v2-5-api-providers) : https://deepinfra.com/blog/best-mimo-v2-5-api-providers
 [(Github)](https://github.com/posit-dev/positron/issues/13662) : https://github.com/posit-dev/positron/issues/13662
 [(source database of AI models)](https://models.dev/providers/opencode-go) : https://models.dev/providers/opencode-go
 [(Github)](https://github.com/craft-ai-agents/craft-agents-oss/issues/668) : https://github.com/craft-ai-agents/craft-agents-oss/issues/668
 [(Flash | Xiaomi)](https://mimo.xiaomi.com/mimo-v2-5/) : https://mimo.xiaomi.com/mimo-v2-5/
 [(ejogc327.blogspot.com)](https://ejogc327.blogspot.com/p/features.html) : https://ejogc327.blogspot.com/p/features.html
 [(implyingrigged.info)](https://implyingrigged.info/wiki/Pro_Evolution_Soccer_2021/Edit_file) : https://implyingrigged.info/wiki/Pro_Evolution_Soccer_2021/Edit_file
 [(youtube.com)](https://www.youtube.com/watch?v=VOrWBA5tM4s) : https://www.youtube.com/watch?v=VOrWBA5tM4s
 [(PESNewupdate)](https://pesnewupdate.com/pes-2020-editor-by-ejogc327/) : https://pesnewupdate.com/pes-2020-editor-by-ejogc327/
 [(ejogc327.blogspot.com)](https://ejogc327.blogspot.com/) : https://ejogc327.blogspot.com/
 [(SmokePatch)](https://www.pessmokepatch.com/2026/06/FL26WC.html) : https://www.pessmokepatch.com/2026/06/FL26WC.html
 [(patreon.com)](https://www.patreon.com/ejogc327) : https://www.patreon.com/ejogc327
