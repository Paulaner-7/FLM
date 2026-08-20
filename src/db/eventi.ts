// FLM — Persistenza motore eventi (PRD 4.2/4.3/4.6).
// Regola 1 AGENTS.md: ogni dato persistente passa da qui (Dexie).
// Regola 2 AGENTS.md: l'LLM si chiama SOLO tramite src/llm (generaEventiSettimanali).
// Regola 3 AGENTS.md: tutte le meccaniche (pesca, cooldown, validazione, effetti)
// vengono da src/engine/eventi.ts — qui solo orchestrazione e transazioni.
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
  notizieOfflineDaTurno,
  pescaCategorie,
  pescaCountEventi,
  poolCategorie,
  selezionaPerHint,
  settimaneConsecutiveConDueEventi,
  validaPropostaEventi,
} from '../engine/eventi';
import { fallbackDisponibili, type FallbackEventoTemplate } from '../engine/fallback-events';
import { giocatoriInCrisi, moraleSpogliatoio } from '../engine/morale';
import {
  FALLBACK_NO_RIPETI_SETTIMANE,
  FINESTRA_ANTI_RIPETIZIONE,
  MAX_SETTIMANE_INFORTUNIO_EVENTO,
  STRISCIA_NEGATIVA_CATEGORIA_RARA,
  clamp,
} from '../engine/rules';
import { generaEventiSettimanali } from '../llm';
import type { PropostaEventi } from '../llm';
import { tutteLeSituazioni } from '../data/casi-reali';
import type { CategoriaEvento, Evento, Giocatore, Id, Notizia, Partita, Squadra } from '../types/entities';

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
 * LLM attivo → proposta validata (engine); fallisce o tutto scartato → tabelle
 * offline (PRD 4.6). Notizie offline sempre dai risultati reali se l'LLM non
 * le produce. Salvataggio atomico con guardia anti-race su partita.giocata.
 */
export async function generaContenutiTurno(input: { carrieraId: Id; partitaId: Id }): Promise<EsitoGenerazioneContenuti> {
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

  // ---------- Tentativo LLM (regola 2: solo tramite src/llm) ----------
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

  // ---------- Validazione (engine) ----------
  let validi: PropostaEventi = { eventi: [], notizie: [] };
  if (proposta) {
    validi = validaPropostaEventi(proposta, {
      categorieRichieste: categorie,
      rosa: rosa.map((g) => g.nome),
      ultimiEventi,
    });
  }

  // ---------- Fallback offline (PRD 4.6): SOLO se LLM fallito o tutto scartato.
  // Se l'LLM ha risposto ma ha omesso una categoria (verifica di realismo:
  // "meglio meno eventi che eventi inverosimili"), l'omissione è rispettata. ----------
  const templateUsatiDiRecent = new Set(
    eventiArchivio
      .filter((e) => e.templateId && e.settimana > settimanaTurno - FALLBACK_NO_RIPETI_SETTIMANE)
      .map((e) => e.templateId as string),
  );

  const eventiDaSalvare: Array<Omit<Evento, 'id' | 'carrieraId' | 'settimana' | 'sceltaFatta' | 'effettiApplicati'>> = [];
  if (proposta === null || validi.eventi.length === 0) {
    for (const categoria of categorie) {
      const template = pescaTemplateFallback(categoria, templateUsatiDiRecent, seed);
      if (!template) continue;
      eventiDaSalvare.push(concretezzaTemplate(template, rosa, seed));
    }
  } else {
    // Gli eventi LLM validi si salvano con origine 'llm'
    for (const e of validi.eventi) {
      eventiDaSalvare.push({ ...e, origine: 'llm' });
    }
  }

  let notizie: string[];
  if (validi.notizie.length > 0) {
    notizie = validi.notizie;
  } else {
    const turno = partiteCampionato.filter((p) => p.giornata === partita.giornata);
    notizie = notizieOfflineDaTurno({
      miaPartita: partita,
      turno: turno.length > 0 ? turno : [partita],
      miaSquadraId: carriera.squadraId,
      nomeSquadra,
    });
  }

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
        origine: validi.notizie.length > 0 ? 'llm' : 'engine',
      };
      await db.notizie.add(notizia);
      notizieSalvate.push(notizia);
    }

    // Referto immutabile (decisione utente): niente rollback, i contenuti
    // generati restano nell'archivio senza tracciamento sulla partita.
    return { eventi: salvati, notizie: notizieSalvate, scartata: false };
  });
}

/** Pesca un template di fallback per categoria: no-repeat recente, seme stabile. */
function pescaTemplateFallback(
  categoria: CategoriaEvento,
  usatiDiRecent: Set<string>,
  seed: string,
): FallbackEventoTemplate | null {
  const disponibili = fallbackDisponibili(categoria, usatiDiRecent);
  const pool = disponibili.length > 0 ? disponibili : fallbackDisponibili(categoria, new Set());
  if (pool.length === 0) return null;
  // hash dell'id: scelta stabile e distribuita anche con pool che cambia
  const indice = Math.abs(hashId(seed + categoria) % pool.length);
  return pool[indice] ?? null;
}

/** Hash stabile piccolo (FNV-1a è in engine/random, qui evito dipendenze extra). */
function hashId(valore: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < valore.length; i++) {
    h ^= valore.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Concretizza un template: sostituisce {giocatore} col candidato per hint. */
function concretezzaTemplate(
  template: FallbackEventoTemplate,
  rosa: Giocatore[],
  seed: string,
): Omit<Evento, 'id' | 'carrieraId' | 'settimana' | 'sceltaFatta' | 'effettiApplicati'> {
  const giocatore = template.hint ? selezionaPerHint(rosa, template.hint, seed) : null;
  const nome = giocatore?.nome ?? null;
  const sostituisci = (testo: string): string => (nome ? testo.replaceAll('{giocatore}', nome) : testo.replaceAll('{giocatore}', 'un giocatore'));
  return {
    categoria: template.categoria,
    tipo: template.tipo,
    titolo: sostituisci(template.titolo),
    testo: sostituisci(template.testo),
    giocatoriCoinvolti: nome ? [nome] : [],
    // Infortunio narrativo: applicato davvero alla rosa alla creazione
    effettiFisici:
      nome && template.infortunioSettimane !== undefined
        ? [{ giocatore: nome, settimane: clamp(template.infortunioSettimane, 1, MAX_SETTIMANE_INFORTUNIO_EVENTO) }]
        : undefined,
    opzioni: template.opzioni.map((o) => ({
      testo: sostituisci(o.testo),
      effettiProposti: {
        moraleGiocatori: clamp(o.effettiProposti.moraleGiocatori, -10, 10),
        fiduciaGiocatori: clamp(o.effettiProposti.fiduciaGiocatori, -10, 10),
        fiduciaSocieta: clamp(o.effettiProposti.fiduciaSocieta, -10, 10),
        fiduciaTifosi: clamp(o.effettiProposti.fiduciaTifosi, -10, 10),
        reputazione: clamp(o.effettiProposti.reputazione, -10, 10),
      },
    })),
    origine: 'fallback',
    templateId: template.id,
  };
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
