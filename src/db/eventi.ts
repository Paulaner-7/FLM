// FLM — Persistenza motore eventi (PRD 4.2/4.3, 8.2 online-first).
// Regola 1 AGENTS.md: ogni dato persistente passa da qui (Dexie).
// Regola 2 AGENTS.md: l'LLM si chiama SOLO tramite src/llm (generaEventiSettimanali).
// Regola 3 AGENTS.md: tutte le meccaniche (pesca, cooldown, validazione, effetti)
// vengono da src/engine/eventi.ts — qui solo orchestrazione e transazioni.
// PRD 8.2: online-first — nessun fallback offline; LLM irraggiungibile = errore visibile + retry.
//
// generaContenutiTurno: DOPO la conferma del referto (fuori dalla sua
// transazione, la chiamata LLM non deve mai tenere un lock sul DB). La scrittura
// finale è una transazione che ri-legge partita.giocata: se il referto è stato
// annullato nel frattempo, non salva nulla (niente eventi orfani).

import { db, newId } from './database';
import { rosaDellaCarriera } from './referti';
import { calcolaClassifica } from '../engine/classifica';
import {
  applicaEffettiEvento,
  candidatiPerCategoria,
  conseguenzeInfortuni,
  faseStagione,
  normalizzaNome,
  pescaCategorie,
  pescaCountEventi,
  poolCategorie,
  settimaneConsecutiveConDueEventi,
  validaPropostaEventi,
} from '../engine/eventi';
import { assertLLMDisponibile } from '../llm/connectivity';
import { giocatoriInCrisi, moraleSpogliatoio } from '../engine/morale';
import {
  FINESTRA_ANTI_RIPETIZIONE,
  STRISCIA_NEGATIVA_CATEGORIA_RARA,
} from '../engine/rules';
import { generaEventiSettimanali } from '../llm';
import type { PropostaEventi } from '../llm';
import { tutteLeSituazioni } from '../data/casi-reali';
import type { Evento, Giocatore, Id, Notizia, Partita, Squadra } from '../types/entities';

export interface EsitoGenerazioneContenuti {
  eventi: Evento[];
  notizie: Notizia[];
  /** true se la generazione è stata scartata perché il referto non era più valido */
  scartata: boolean;
}

/** Consegna in formato archivio (per l'anti-ripetizione del prompt). */
function riepilogoEvento(e: Evento): string {
  return `S${e.settimana} [${e.categoria}] ${e.titolo}`;
}

/** Le ultime N partite della tua squadra in formato "V 2-1 vs Avversario". */
function ultimePartite(
  partite: Partita[],
  squadraId: Id,
  nomeSquadra: (id: Id) => string,
  quante = 5,
): string[] {
  const mie = partite
    .filter((p) => p.giocata && (p.casa === squadraId || p.trasferta === squadraId))
    .sort((a, b) => b.giornata - a.giornata)
    .slice(0, quante)
    .reverse();
  return mie.map((p) => {
    const inCasa = p.casa === squadraId;
    const golMiei = inCasa ? p.golCasa : p.golTrasferta;
    const golLoro = inCasa ? p.golTrasferta : p.golCasa;
    const avversario = nomeSquadra(inCasa ? p.trasferta : p.casa);
    const segno = golMiei > golLoro ? 'V' : golMiei === golLoro ? 'P' : 'S';
    return `${segno} ${golMiei}-${golLoro} vs ${avversario}`;
  });
}

/**
 * Genera gli eventi narrativi e le notizie del turno appena giocato.
 * PRD 8.2 (online-first): richiede LLM; offline = throw prima di qualsiasi scrittura.
 * Salvataggio atomico con guardia anti-race su partita.giocata.
 */
export async function generaContenutiTurno(input: { carrieraId: Id; partitaId: Id }): Promise<EsitoGenerazioneContenuti> {
  await assertLLMDisponibile();
  // ---------- Lettura stato (fuori transazione: serve per la chiamata LLM) ----------
  const [carriera, stato, partita] = await Promise.all([
    db.carriere.get(input.carrieraId),
    db.statoClub.get(input.carrieraId),
    db.partite.get(input.partitaId),
  ]);
  if (!carriera || !stato || !partita) {
    return { eventi: [], notizie: [], scartata: true };
  }

  const [squadre, rosa, eventiArchivio, competizioni, partite] = await Promise.all([
    db.squadre.toArray(),
    rosaDellaCarriera(input.carrieraId, carriera.squadraId),
    db.eventi.where('carrieraId').equals(input.carrieraId).toArray(),
    db.competizioni.toArray(),
    db.partite.toArray(),
  ]);
  const mappaSquadre = new Map<Id, Squadra>(squadre.map((s) => [s.id, s]));
  const nomeSquadra = (id: Id): string => mappaSquadre.get(id)?.nome ?? '—';

  // Settimana del turno = quella della partita (convenzione archivio: come le
  // richieste promessa create in confermaReferto). Guardia: una partita "del
  // futuro" (es. giornata di coppa non ancora giocata) non è il turno appena
  // confermato — nessuna generazione.
  const settimanaTurno = stato.settimanaCorrente - 1;
  if (partita.giornata > settimanaTurno) {
    return { eventi: [], notizie: [], scartata: true };
  }

  const seed = `${input.carrieraId}|${settimanaTurno}`;
  const archivioOrdinato = [...eventiArchivio].sort((a, b) => b.settimana - a.settimana || a.id.localeCompare(b.id));
  const ultimiEventi = archivioOrdinato.slice(0, FINESTRA_ANTI_RIPETIZIONE);
  const ultimeCategorie = archivioOrdinato.map((e) => e.categoria);
  const consecutiveConDue = settimaneConsecutiveConDueEventi(eventiArchivio);

  const count = pescaCountEventi(seed, consecutiveConDue);

  const competizione = competizioni.find((c) => c.carrieraId === input.carrieraId && c.tipo === 'campionato');
  const partiteCampionato = competizione ? partite.filter((p) => p.competizioneId === competizione.id) : [];
  const classifica = competizione ? calcolaClassifica(partiteCampionato, competizione.squadre) : [];
  const rigaMia = classifica.find((r) => r.squadraId === carriera.squadraId);
  const settimanaCorrente = stato.settimanaCorrente;

  // Categorie del turno: pool pesato con gating (categorie rare = situazioni
  // estreme, cap stagionale) — engine puro, PRD 4.3
  const mie = partiteCampionato
    .filter((p) => p.giocata && (p.casa === carriera.squadraId || p.trasferta === carriera.squadraId))
    .sort((a, b) => b.giornata - a.giornata);
  const ultimiDue = mie.slice(0, 2);
  const strisciaNegativa =
    ultimiDue.length >= STRISCIA_NEGATIVA_CATEGORIA_RARA &&
    ultimiDue.every((p) => {
      const inCasa = p.casa === carriera.squadraId;
      return inCasa ? p.golCasa < p.golTrasferta : p.golTrasferta < p.golCasa;
    });
  const giornateTotali = competizione
    ? partiteCampionato.filter((p) => p.casa === carriera.squadraId || p.trasferta === carriera.squadraId).length
    : 0;
  const pool = poolCategorie({
    ultimeCategorie,
    fiduciaSocieta: stato.fiduciaSocieta,
    fiduciaTifosi: stato.fiduciaTifosi,
    strisciaNegativa,
    eventiRariStagione: {
      societa: eventiArchivio.filter((e) => e.categoria === 'societa' && e.settimana <= settimanaTurno).length,
      tifosi_media: eventiArchivio.filter((e) => e.categoria === 'tifosi_media' && e.settimana <= settimanaTurno).length,
    },
    sprintFinale: faseStagione(settimanaTurno, giornateTotali) === 'sprint_finale',
  });
  const categorie = pescaCategorie(seed, count, pool);

  const promesseInScadenza = rosa
    .filter((g) => g.promesse.some((p) => p.stato === 'attiva' && p.scadenza <= settimanaCorrente + 2))
    .map((g) => g.nome);

  // ---------- Tentativo LLM (regola 2: solo tramite src/llm, 8.2 online-first) ----------
  const contesto = {
    settimana: settimanaCorrente,
    posizioneClassifica: rigaMia?.posizione ?? 0,
    ultimePartite: ultimePartite(partiteCampionato, carriera.squadraId, nomeSquadra),
    giocatoriMoraleBasso: giocatoriInCrisi(rosa).map((g) => g.nome),
    moraleSpogliatoio: moraleSpogliatoio(rosa),
    promesseInScadenza,
    fiduciaSocieta: stato.fiduciaSocieta,
    ultimiEventi: ultimiEventi.map(riepilogoEvento),
    categorieRichieste: categorie,
    candidati: candidatiPerCategoria(rosa),
    casiReali: tutteLeSituazioni(),
    faseStagione: faseStagione(settimanaTurno, giornateTotali),
  };
  const proposta = await generaEventiSettimanali(contesto);
  if (!proposta) {
    throw new Error('LLM non disponibile: impossibile generare eventi/notizie. Riprova quando torna la connessione.');
  }

  // ---------- Validazione (engine) ----------
  const validi: PropostaEventi = validaPropostaEventi(proposta, {
    categorieRichieste: categorie,
    rosa: rosa.map((g) => g.nome),
    ultimiEventi,
  });

  // PRD 8.2: nessun fallback — se la validazione scarta tutto, si salva ciò che resta (anche zero eventi),
  // ma mai contenuto precaricato. Notizie richieste da LLM: se vuote, errore bloccante.
  if (validi.notizie.length === 0) {
    throw new Error('LLM non disponibile: notizie non generate. Riprova quando torna la connessione.');
  }

  const eventiDaSalvare: Array<Omit<Evento, 'id' | 'carrieraId' | 'settimana' | 'sceltaFatta' | 'effettiApplicati'>> = [];
  for (const e of validi.eventi) {
    eventiDaSalvare.push({ ...e, origine: 'llm' });
  }

  const notizie: string[] = validi.notizie;

  // ---------- Salvataggio atomico con guardia anti-race ----------
  return db.transaction('rw', [db.eventi, db.notizie, db.partite, db.giocatori], async () => {
    const riletta = await db.partite.get(input.partitaId);
    if (!riletta?.giocata) {
      return { eventi: [], notizie: [], scartata: true };
    }

    // Infortuni narrativi: applicati DAVVERO alla rosa (richiesta utente).
    // Pre-stato registrato sull'evento per il rollback secco in annullaReferto.
    const giocatoriCarriera = await db.giocatori.where('carrieraId').equals(input.carrieraId).toArray();
    const mappaGiocatori = new Map(giocatoriCarriera.map((g) => [g.id, g]));
    const infortuni = conseguenzeInfortuni(eventiDaSalvare, giocatoriCarriera, settimanaTurno);
    const daAggiornare = new Map<Id, Giocatore>();
    for (const [giocatoreId, nuovo] of infortuni) {
      const g = mappaGiocatori.get(giocatoreId);
      if (g) daAggiornare.set(giocatoreId, { ...g, infortunioFinoA: nuovo });
    }

    const salvati: Evento[] = [];
    for (const bozza of eventiDaSalvare) {
      const infortuniApplicati: Array<{ giocatoreId: Id; infortunioFinoAPrima?: number }> = [];
      for (const f of bozza.effettiFisici ?? []) {
        const g = giocatoriCarriera.find((x) => normalizzaNome(x.nome) === normalizzaNome(f.giocatore));
        if (g) infortuniApplicati.push({ giocatoreId: g.id, infortunioFinoAPrima: g.infortunioFinoA });
      }
      const evento: Evento = {
        id: newId(),
        carrieraId: input.carrieraId,
        settimana: settimanaTurno,
        sceltaFatta: undefined,
        effettiApplicati: false,
        ...bozza,
        infortuniApplicati: infortuniApplicati.length > 0 ? infortuniApplicati : undefined,
      };
      await db.eventi.add(evento);
      salvati.push(evento);
    }
    if (daAggiornare.size > 0) {
      await db.giocatori.bulkPut([...daAggiornare.values()]);
    }

    const notizieSalvate: Notizia[] = [];
    for (const testo of notizie) {
      const notizia: Notizia = {
        id: newId(),
        carrieraId: input.carrieraId,
        settimana: settimanaTurno,
        testo,
        origine: 'llm',
      };
      await db.notizie.add(notizia);
      notizieSalvate.push(notizia);
    }

    // Referto immutabile (decisione utente): niente rollback, i contenuti
    // generati restano nell'archivio senza tracciamento sulla partita.
    return { eventi: salvati, notizie: notizieSalvate, scartata: false };
  });
}

/**
 * Decisione dell'allenatore su un evento narrativo (PRD 4.1): l'engine valida
 * gli effetti proposti (clamp ±10 già in engine/eventi.ts), li applica a
 * StatoClub e ai giocatori citati, e chiude l'evento. Transazione atomica.
 */
export async function decidiEvento(eventoId: Id, scelta: number): Promise<void> {
  await db.transaction('rw', [db.eventi, db.giocatori, db.statoClub, db.squadAssignments, db.carriere], async () => {
    const evento = await db.eventi.get(eventoId);
    if (!evento) throw new Error('Evento inesistente');
    if (evento.promessaProposta) throw new Error('Evento non valido: usare il flusso richieste');
    if (evento.sceltaFatta !== undefined) throw new Error('Evento già deciso');
    if (scelta < 0 || scelta >= evento.opzioni.length) throw new Error('Opzione non valida');

    const carriera = await db.carriere.get(evento.carrieraId);
    const stato = await db.statoClub.get(evento.carrieraId);
    if (!carriera || !stato) throw new Error('Carriera inesistente');

    const rosa = await rosaDellaCarriera(evento.carrieraId, carriera.squadraId);
    const esito = applicaEffettiEvento(stato, rosa, evento, scelta);

    if (esito.giocatori.some((g, i) => g !== rosa[i])) {
      await db.giocatori.bulkPut(esito.giocatori);
    }
    await db.statoClub.put(esito.stato);
    await db.eventi.put({ ...evento, sceltaFatta: scelta, effettiApplicati: true });
  });
}
