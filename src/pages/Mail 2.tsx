// FLM — Pagina Mail (decisione utente M4): inbox dell'allenatore stile client email.
// Entrano: eventi settimanali (con opzioni inline), offerte in entrata e thread
// delle trattative. NON entrano: cronache di giornale, notizie mercato (restano
// nelle loro pagine). Stato letto/non letto: campo `letta` su Evento; per le
// trattative conta l'azione pendente (è il tuo turno → non letta).

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { db, decidiEvento, decidiRichiestaPromessa, rispondiTrattativa } from '../db';
import { formattaCifra } from '../engine/mercato';
import type { Carriera, Evento, Squadra, Trattativa } from '../types/entities';

interface DatiMail {
  carriera: Carriera;
  squadre: Map<string, Squadra>;
  eventi: Evento[];
  trattative: Trattativa[];
}

interface MailProps {
  carrieraId: string;
  onBack: () => void;
  onMercato: () => void;
}

interface VoceMail {
  id: string;
  tipo: 'evento' | 'trattativa' | 'offerta';
  /** Ordinamento: giorno/settimana decrescente */
  data: number;
  mittente: string;
  oggetto: string;
  anteprima: string;
  nonLetta: boolean;
  /** Riferimento per il pannello di lettura */
  ref: Evento | Trattativa;
}

const ETICHETTA_CATEGORIA: Record<Evento['categoria'], string> = {
  giocatore: 'Giocatore',
  societa: 'Società',
  tifosi_media: 'Tifosi & media',
};

export default function Mail({ carrieraId, onBack, onMercato }: MailProps): ReactElement {
  const [dati, setDati] = useState<DatiMail | null>(null);
  const [selezionata, setSelezionata] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'error'; testo: string } | null>(null);
  /** Controproposta in corso: trattativaId → cifra */
  const [controcifra, setControcifra] = useState<Record<string, string>>({});
  const [apriContro, setApriContro] = useState<string | null>(null);

  const carica = useCallback(async (): Promise<void> => {
    const [carriera, squadreArr, eventiArr, trattativeArr] = await Promise.all([
      db.carriere.get(carrieraId),
      db.squadre.toArray(),
      db.eventi.where('carrieraId').equals(carrieraId).toArray(),
      db.trattative.where('carrieraId').equals(carrieraId).toArray(),
    ]);
    if (!carriera) return;
    setDati({
      carriera,
      squadre: new Map(squadreArr.map((s) => [s.id, s])),
      eventi: eventiArr.sort((a, b) => b.settimana - a.settimana || a.id.localeCompare(b.id)),
      trattative: trattativeArr.sort((a, b) => b.updatedAt - a.updatedAt),
    });
  }, [carrieraId]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const voci: VoceMail[] = [];
  if (dati) {
    for (const e of dati.eventi) {
      const nome = e.giocatoriCoinvolti[0] ?? (e.promessaProposta ? 'Giocatore' : 'Club');
      voci.push({
        id: `e:${e.id}`,
        tipo: 'evento',
        data: e.settimana,
        mittente: e.categoria === 'giocatore' ? nome : e.categoria === 'societa' ? 'Presidente' : 'Tifosi & media',
        oggetto: e.titolo,
        anteprima: e.testo,
        nonLetta: e.letta !== true,
        ref: e,
      });
    }
    for (const t of dati.trattative) {
      const ultimo = t.messaggi[t.messaggi.length - 1];
      const mioTurno = ultimo?.mittente === 'cpu';
      const club = dati.squadre.get(t.clubId)?.nome ?? 'Club';
      voci.push({
        id: `t:${t.id}`,
        tipo: t.direzione === 'vendita' ? 'offerta' : 'trattativa',
        data: t.giornoCreato,
        mittente: club,
        oggetto:
          t.direzione === 'vendita'
            ? `Offerta per il tuo giocatore`
            : `Trattativa in corso`,
        anteprima: ultimo?.testo ?? '',
        nonLetta: mioTurno,
        ref: t,
      });
    }
    voci.sort((a, b) => b.data - a.data || a.id.localeCompare(b.id));
  }

  const nonLette = voci.filter((v) => v.nonLetta).length;
  const selezionataVoce = voci.find((v) => v.id === selezionata) ?? null;

  const segnaLetta = async (voce: VoceMail): Promise<void> => {
    if (voce.tipo === 'evento' && !(voce.ref as Evento).letta) {
      await db.eventi.update((voce.ref as Evento).id, { letta: true });
      setDati((d) => (d ? { ...d, eventi: d.eventi.map((e) => (e.id === (voce.ref as Evento).id ? { ...e, letta: true } : e)) } : d));
    }
  };

  const decidi = async (evento: Evento, scelta: number): Promise<void> => {
    setBusy(true);
    setFeedback(null);
    try {
      if (evento.promessaProposta) {
        await decidiRichiestaPromessa(evento.id, scelta as 0 | 1);
      } else {
        await decidiEvento(evento.id, scelta);
      }
      setFeedback({ tipo: 'ok', testo: 'Decisione registrata.' });
      await carica();
    } catch (e) {
      setFeedback({ tipo: 'error', testo: e instanceof Error ? e.message : 'Errore' });
    } finally {
      setBusy(false);
    }
  };

  const azioneTrattativa = async (t: Trattativa, tipo: 'accetta' | 'rifiuta'): Promise<void> => {
    setBusy(true);
    setFeedback(null);
    try {
      const esito = await rispondiTrattativa(carrieraId, t.id, { tipo });
      if (!esito.ok) {
        setFeedback({ tipo: 'error', testo: esito.errori?.join(' ') ?? 'Azione rifiutata' });
      } else {
        setFeedback({
          tipo: 'ok',
          testo: tipo === 'accetta' ? 'Accordo chiuso: trasferimento applicato.' : 'Offerta rifiutata.',
        });
      }
      await carica();
    } catch (e) {
      setFeedback({ tipo: 'error', testo: e instanceof Error ? e.message : 'Errore' });
    } finally {
      setBusy(false);
    }
  };

  const controproposta = async (t: Trattativa): Promise<void> => {
    const cifra = Number((controcifra[t.id] ?? '').replace(',', '.'));
    if (!Number.isFinite(cifra) || cifra <= 0) {
      setFeedback({ tipo: 'error', testo: 'Inserisci una cifra valida' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const esito = await rispondiTrattativa(carrieraId, t.id, { tipo: 'controproposta', cifra: Math.round(cifra) });
      if (!esito.ok) {
        setFeedback({ tipo: 'error', testo: esito.errori?.join(' ') ?? 'Controproposta rifiutata' });
      } else {
        setFeedback({ tipo: 'ok', testo: 'Controproposta inviata: risposta il giorno dopo.' });
        setApriContro(null);
      }
      await carica();
    } catch (e) {
      setFeedback({ tipo: 'error', testo: e instanceof Error ? e.message : 'Errore' });
    } finally {
      setBusy(false);
    }
  };

  if (!dati) return <main className="page-shell" />;

  return (
    <main className="page-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={onBack}>FLM <span>/ Mail</span></button>
        <div className="topbar-actions">
          <span className="topbar-note">{dati.carriera.campionato} · {dati.carriera.stagione}</span>
          <nav className="topbar-nav" aria-label="Navigazione mail">
            <button className="button button-outline button-small" type="button" onClick={onMercato}>Mercato</button>
            <button className="button button-outline button-small" type="button" onClick={onBack}>Carriera</button>
          </nav>
        </div>
      </header>

      <section className="content-wrap mail-wrap">
        <div className="mail-layout">
          {/* Colonna inbox */}
          <aside className="mail-lista" aria-label="Casella di posta">
            <p className="eyebrow">Inbox {nonLette > 0 ? `· ${nonLette} non lette` : ''}</p>
            {voci.length === 0 && <p className="empty-copy">Nessuna mail. Gli eventi e le offerte di mercato arriveranno qui.</p>}
            {voci.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`mail-voce${selezionata === v.id ? ' mail-voce-attiva' : ''}${v.nonLetta ? ' mail-voce-nonletta' : ''}`}
                onClick={() => {
                  setSelezionata(v.id);
                  void segnaLetta(v);
                }}
              >
                <span className="mail-mittente">{v.mittente}</span>
                <span className="mail-oggetto">{v.oggetto}</span>
                <span className="mail-anteprima">{v.anteprima.slice(0, 80)}{v.anteprima.length > 80 ? '…' : ''}</span>
                <span className="mail-data">{v.tipo === 'evento' ? `sett. ${v.data}` : `giorno ${v.data}`}</span>
              </button>
            ))}
          </aside>

          {/* Pannello lettura */}
          <article className="mail-pannello" aria-label="Lettura mail">
            {!selezionataVoce && <p className="empty-copy">Seleziona una mail per leggerla.</p>}
            {selezionataVoce && selezionataVoce.tipo === 'evento' && (
              <div className="richiesta-card evento-card mail-corpo">
                <div>
                  <span className="status-pill">{ETICHETTA_CATEGORIA[(selezionataVoce.ref as Evento).categoria]}</span>
                  <strong>{selezionataVoce.oggetto}</strong>
                  <p className="mail-testo">{(selezionataVoce.ref as Evento).testo}</p>
                  {(selezionataVoce.ref as Evento).giocatoriCoinvolti.length > 0 && (
                    <small>Coinvolti: {(selezionataVoce.ref as Evento).giocatoriCoinvolti.join(', ')}</small>
                  )}
                </div>
                {(selezionataVoce.ref as Evento).sceltaFatta !== undefined ? (
                  <p className="feedback feedback-ok">Risposta inviata: {(selezionataVoce.ref as Evento).opzioni[(selezionataVoce.ref as Evento).sceltaFatta!]?.testo}</p>
                ) : (
                  <div className="richiesta-azioni">
                    {(selezionataVoce.ref as Evento).opzioni.map((opzione, indice) => (
                      <button
                        key={indice}
                        type="button"
                        disabled={busy}
                        className={`button button-small ${indice === 0 ? 'button-primary' : 'button-outline'}`}
                        onClick={() => void decidi(selezionataVoce.ref as Evento, indice)}
                      >
                        {opzione.testo}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {selezionataVoce && selezionataVoce.tipo !== 'evento' && (
              <div className="richiesta-card mail-corpo">
                <div>
                  <span className="status-pill">{selezionataVoce.tipo === 'offerta' ? 'Offerta in entrata' : 'Trattativa'}</span>
                  <strong>{selezionataVoce.oggetto}</strong>
                  <div className="mail-thread">
                    {(selezionataVoce.ref as Trattativa).messaggi.map((m) => (
                      <div key={m.id} className={`mail-msg mail-msg-${m.mittente}`}>
                        <span className="mail-msg-meta">{m.mittente === 'utente' ? 'Tu' : selezionataVoce.mittente} · giorno {m.giorno}</span>
                        <p>{m.testo}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {trattativaAzioni(selezionataVoce.ref as Trattativa)}
              </div>
            )}
            {feedback && <p className={`feedback feedback-${feedback.tipo}`}>{feedback.testo}</p>}
          </article>
        </div>
        <button className="button button-outline" type="button" onClick={onBack}>← Torna alla carriera</button>
      </section>
    </main>
  );

  function trattativaAzioni(t: Trattativa): ReactElement | null {
    if (['applicata', 'rifiutata', 'scaduta', 'saltata'].includes(t.stato)) {
      return <p className={`feedback ${t.stato === 'applicata' ? 'feedback-ok' : 'feedback-warn'}`}>Trattativa {t.stato === 'applicata' ? 'conclusa con accordo' : `chiusa: ${t.stato}`}.</p>;
    }
    const ultimo = t.messaggi[t.messaggi.length - 1];
    const mioTurno = ultimo?.mittente === 'cpu';
    if (!mioTurno) {
      return <p className="feedback feedback-warn">In attesa della risposta della controparte (arriva il giorno dopo).</p>;
    }
    return (
      <div className="richiesta-azioni">
        <button className="button button-primary button-small" type="button" disabled={busy} onClick={() => void azioneTrattativa(t, 'accetta')}>
          Accetta {t.cifraCpu > 0 ? `(${formattaCifra(t.cifraCpu)})` : ''}
        </button>
        <button className="button button-outline button-small" type="button" disabled={busy} onClick={() => void azioneTrattativa(t, 'rifiuta')}>
          Rifiuta
        </button>
        {apriContro === t.id ? (
          <>
            <input
              className="text-input mercato-cifra"
              value={controcifra[t.id] ?? String(t.cifraCpu)}
              onChange={(e) => setControcifra((m) => ({ ...m, [t.id]: e.target.value }))}
              aria-label={`Controproposta per ${t.giocatoreId}`}
            />
            <button className="button button-outline button-small" type="button" disabled={busy} onClick={() => void controproposta(t)}>
              Invia
            </button>
          </>
        ) : (
          !t.finalOffer && (
            <button className="button button-outline button-small" type="button" onClick={() => setApriContro(t.id)}>
              Controproposta
            </button>
          )
        )}
      </div>
    );
  }
}
