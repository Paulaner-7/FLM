// FLM — Movimenti (PRD 7.3): TransferLedger visibile, "Ultimi movimenti in
// tutta Europa". Tab dentro Mercato (D11): solo contenuto, niente chrome di
// pagina. Consultazione + export CSV/report per PES Editor (ponte PRD 7.4).

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { db, SQUADRA_SVINCOLATI, esportaPacchettoEditor } from '../db';
import { formattaCifra } from '../engine/mercato';
import { scaricaFile } from '../bridge';
import type { Carriera, Giocatore, Squadra, TransferLedgerEntry } from '../types/entities';

interface DatiMovimenti {
  carriera: Carriera;
  squadre: Map<string, Squadra>;
  giocatori: Map<string, Giocatore>;
  ledger: TransferLedgerEntry[];
}

type Filtro = 'tutti' | 'miei' | 'completati' | 'saltati';

export default function MovimentiContenuto({ carrieraId }: { carrieraId: string }): ReactElement {
  const [dati, setDati] = useState<DatiMovimenti | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('tutti');
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const carica = useCallback(async (): Promise<void> => {
    const [carriera, squadreArr, giocatoriArr, ledgerArr] = await Promise.all([
      db.carriere.get(carrieraId),
      db.squadre.toArray(),
      db.giocatori.where('carrieraId').equals(carrieraId).toArray(),
      db.transferLedger.where('carrieraId').equals(carrieraId).toArray(),
    ]);
    if (!carriera) return;
    setDati({
      carriera,
      squadre: new Map(squadreArr.map((s) => [s.id, s])),
      giocatori: new Map(giocatoriArr.map((g) => [g.id, g])),
      ledger: [...ledgerArr].sort(
        (a, b) => (b.giornoMercato ?? 99) - (a.giornoMercato ?? 99) || b.settimana - a.settimana || b.id.localeCompare(a.id),
      ),
    });
  }, [carrieraId]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const nomeSquadra = (id: string): string =>
    id === SQUADRA_SVINCOLATI ? 'Svincolati' : (dati?.squadre.get(id)?.nome ?? '—');

  const filtrati = useMemo(() => {
    if (!dati) return [];
    return dati.ledger.filter((v) => {
      if (filtro === 'miei') return v.daSquadraId === dati.carriera.squadraId || v.aSquadraId === dati.carriera.squadraId;
      if (filtro === 'completati') return v.esito === 'completato';
      if (filtro === 'saltati') return v.esito === 'saltato';
      return true;
    });
  }, [dati, filtro]);

  const esporta = async (): Promise<void> => {
    if (!dati) return;
    try {
      // Pacchetto coordinato (PRD 7.5, decisione utente): un'unica azione genera
      // i 3 file dell'editor (Players completo + Roster + Teams-Players).
      const pacchetto = await esportaPacchettoEditor(carrieraId);
      for (const file of pacchetto.files) {
        scaricaFile(file.nome, file.contenuto, 'text/csv');
      }

      // Report leggibile dei movimenti di mercato della stagione (fallback manuale)
      const righe: string[] = [];
      righe.push(`# FLM — Movimenti di mercato ${dati.carriera.stagione} (${dati.carriera.nome})`);
      righe.push('');
      righe.push('Applica i trasferimenti a PES Editor (pacchetto CSV) o a mano:');
      righe.push('');
      const ledger = await db.transferLedger.where('carrieraId').equals(carrieraId).toArray();
      for (const v of [...ledger].sort((a, b) => (a.giornoMercato ?? 0) - (b.giornoMercato ?? 0) || a.settimana - b.settimana)) {
        const g = dati.giocatori.get(v.giocatoreId);
        const nome = g?.nome ?? v.giocatoreId;
        const esito = v.esito === 'completato' ? (v.tipoMovimento === 'prestito' ? 'prestito' : 'completato') : `SALTATO (${v.motivo ?? ''})`;
        righe.push(`- ${nome}: ${nomeSquadra(v.daSquadraId)} → ${nomeSquadra(v.aSquadraId)} · ${v.cifra > 0 ? formattaCifra(v.cifra) : 'prestito a costo zero'} · ${esito}`);
      }
      scaricaFile(`flm-${dati.carriera.nome.replace(/\s+/g, '-')}-movimenti.txt`, righe.join('\n'));

      setExportMsg(
        `Esportato il pacchetto completo (${pacchetto.riepilogo.giocatoriTotali} giocatori, di cui ${pacchetto.riepilogo.giocatoriNuovi} nuovi e ${pacchetto.riepilogo.giocatoriAggiornati} aggiornati; ${pacchetto.riepilogo.prestitiAttivi} prestiti attivi) + report movimenti. Assicurati di aver fatto il BACKUP dell'EDIT file prima dell'import.`,
      );
    } catch (e) {
      setExportMsg(e instanceof Error ? `Errore export: ${e.message}` : 'Errore export');
    }
  };

  if (!dati) return <section className="content-wrap" />;

  return (
    <>
        <div className="mercato-azioni">
          <p className="eyebrow">TransferLedger · tutta Europa ({filtrati.length} movimenti)</p>
          <div className="richiesta-azioni">
            {(['tutti', 'miei', 'completati', 'saltati'] as Filtro[]).map((f) => (
              <button
                key={f}
                type="button"
                className={`button button-small ${filtro === f ? 'button-primary' : 'button-outline'}`}
                onClick={() => setFiltro(f)}
              >
                {f === 'tutti' ? 'Tutti' : f === 'miei' ? 'Il mio club' : f === 'completati' ? 'Completati' : 'Saltati'}
              </button>
            ))}
            <button className="button button-outline button-small" type="button" onClick={() => void esporta()}>
              Esporta per PES Editor
            </button>
          </div>
          {exportMsg && <p className="feedback feedback-ok">{exportMsg}</p>}
        </div>

        {filtrati.length === 0 ? (
          <p className="empty-copy">Nessun movimento. Il mercato CPU e le tue trattative finiranno qui.</p>
        ) : (
          <div className="standings-wrap">
            <table className="standings-table">
              <thead>
                <tr>
                  <th>Giorno</th>
                  <th>Giocatore</th>
                  <th>Da</th>
                  <th>A</th>
                  <th>Cifra</th>
                  <th>Esito</th>
                </tr>
              </thead>
              <tbody>
                {filtrati.slice(0, 200).map((v) => {
                  const g = dati.giocatori.get(v.giocatoreId);
                  return (
                    <tr key={v.id} className={v.daSquadraId === dati.carriera.squadraId || v.aSquadraId === dati.carriera.squadraId ? 'mov-riga-mia' : ''}>
                      <td>{v.giornoMercato !== undefined ? `g. ${v.giornoMercato}` : `sett. ${v.settimana}`}</td>
                      <td>{g?.nome ?? v.giocatoreId} <small className="mov-eta">{g ? `${g.eta} a · ov ${g.overall}` : ''}</small></td>
                      <td>{nomeSquadra(v.daSquadraId)}</td>
                      <td>{nomeSquadra(v.aSquadraId)}</td>
                      <td>{v.cifra > 0 ? formattaCifra(v.cifra) : '—'}</td>
                      <td>
                        {v.esito === 'completato' ? (
                          <span className="status-pill status-ok">completato</span>
                        ) : (
                          <span className="status-pill status-crisi" title={v.motivo}>saltato</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </>
  );
}
