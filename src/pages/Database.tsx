// FLM — Database browser: Team Registry → rosa attiva.

import { useEffect, useState, type ReactElement } from 'react';
import { db } from '../db';
import type { Giocatore, SquadAssignment, Squadra } from '../types/entities';

interface DatabaseProps {
  onImport: () => void;
  onHome: () => void;
}

interface DatabaseState {
  squadre: Squadra[];
  giocatori: Giocatore[];
  assegnazioni: SquadAssignment[];
}

const SVINCOLATI_ID = '__svincolati__';

export default function Database({ onImport, onHome }: DatabaseProps): ReactElement {
  const [state, setState] = useState<DatabaseState | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    // Nota: orderBy('nome') su giocatori NON è indicizzato (SchemaError):
    // si carica e si ordina in memoria. A 10k+ giocatori è comunque immediato.
    void Promise.all([
      db.squadre.orderBy('nome').toArray(),
      db.giocatori.toArray(),
      db.squadAssignments.toArray(),
    ]).then(([squadre, giocatori, assegnazioni]) => {
      if (!alive) return;
      giocatori.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
      setState({ squadre, giocatori, assegnazioni });
      setSelectedId((current) => current ?? squadre[0]?.id ?? SVINCOLATI_ID);
    }).catch((error: unknown) => {
      if (!alive) return;
      setErrore(error instanceof Error ? error.message : 'Caricamento database fallito');
    });
    return () => {
      alive = false;
    };
  }, []);

  if (errore) {
    return (
      <main className="page-shell loading-page">
        <p className="feedback feedback-error" role="alert">Errore di caricamento: {errore}</p>
      </main>
    );
  }

  if (!state) {
    return <main className="page-shell loading-page"><p>Caricamento database…</p></main>;
  }

  const activeAssignments = state.assegnazioni.filter((assignment) => assignment.tipo === 'proprieta' && assignment.al === undefined);
  const playerById = new Map(state.giocatori.map((player) => [player.id, player]));
  const assignedIds = new Set(activeAssignments.map((assignment) => assignment.giocatoreId));
  const svincolati = state.giocatori.filter((player) => !assignedIds.has(player.id));
  const normalizedSearch = search.trim().toLocaleLowerCase('it-IT');
  const filteredTeams = state.squadre.filter((team) => {
    if (!normalizedSearch) return true;
    return team.nome.toLocaleLowerCase('it-IT').includes(normalizedSearch) || String(team.pesId).includes(normalizedSearch);
  });
  const selectedTeam = state.squadre.find((team) => team.id === selectedId);
  const selectedRoster = selectedId === SVINCOLATI_ID
    ? svincolati
    : activeAssignments
      .filter((assignment) => assignment.squadraId === selectedId)
      .map((assignment) => playerById.get(assignment.giocatoreId))
      .filter((player): player is Giocatore => player !== undefined)
      .sort((left, right) => right.overall - left.overall || left.nome.localeCompare(right.nome, 'it'));

  return (
    <main className="page-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={onHome}>FLM <span>/ Database</span></button>
        <div className="topbar-actions">
          <span className="topbar-note">Fonte: export ejogc327</span>
          <button className="button button-small" type="button" onClick={onImport}>Nuovo bootstrap</button>
        </div>
      </header>

      <section className="content-wrap database-page">
        <div className="database-heading">
          <div>
            <p className="eyebrow">Team Registry · Player Registry</p>
            <h1>Il mondo, squadra per squadra.</h1>
            <p className="intro">Fotografia locale di FL26. Seleziona una squadra per aprire la rosa; gli svincolati restano visibili separatamente.</p>
          </div>
          <div className="database-stats">
            <span><strong>{state.squadre.length.toLocaleString('it-IT')}</strong> squadre</span>
            <span><strong>{state.giocatori.length.toLocaleString('it-IT')}</strong> giocatori</span>
            <span><strong>{svincolati.length.toLocaleString('it-IT')}</strong> svincolati</span>
          </div>
        </div>

        <div className="database-layout">
          <aside className="team-browser">
            <label className="search-label" htmlFor="team-search">Cerca nel registro</label>
            <input id="team-search" className="text-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome o PES ID" />
            <div className="team-list" role="listbox" aria-label="Squadre importate">
              <button className={selectedId === SVINCOLATI_ID ? 'team-row team-row-active' : 'team-row'} type="button" onClick={() => setSelectedId(SVINCOLATI_ID)}>
                <span className="team-row-mark">—</span>
                <span><strong>Svincolati</strong><small>{svincolati.length.toLocaleString('it-IT')} giocatori</small></span>
              </button>
              {filteredTeams.map((team) => {
                const count = activeAssignments.filter((assignment) => assignment.squadraId === team.id).length;
                return (
                  <button key={team.id} className={selectedId === team.id ? 'team-row team-row-active' : 'team-row'} type="button" onClick={() => setSelectedId(team.id)}>
                    <span className="team-row-mark">{team.nazionale ? 'N' : 'C'}</span>
                    <span><strong>{team.nome}</strong><small>{count.toLocaleString('it-IT')} giocatori · PES {team.pesId ?? '—'}</small></span>
                  </button>
                );
              })}
              {filteredTeams.length === 0 && <p className="empty-copy">Nessuna squadra corrisponde alla ricerca.</p>}
            </div>
          </aside>

          <section className="roster-panel" aria-live="polite">
            {selectedTeam ? (
              <>
                <div className="roster-heading">
                  <div>
                    <p className="eyebrow">{selectedTeam.nazionale ? 'Nazionale' : 'Club'} · {selectedTeam.nazione}</p>
                    <h2>{selectedTeam.nome}</h2>
                    <p>PES ID {selectedTeam.pesId ?? '—'} · forza {selectedTeam.forza}/5 · {selectedRoster.length.toLocaleString('it-IT')} giocatori assegnati</p>
                  </div>
                  <span className="team-id-badge">{selectedTeam.nazionale ? 'NAZ' : 'CLB'}</span>
                </div>
                <RosterTable roster={selectedRoster} />
              </>
            ) : (
              <>
                <div className="roster-heading">
                  <div><p className="eyebrow">Player Registry</p><h2>Svincolati</h2><p>Giocatori senza proprietà club attiva nel bootstrap.</p></div>
                  <span className="team-id-badge">FREE</span>
                </div>
                <RosterTable roster={selectedRoster} />
              </>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function RosterTable({ roster }: { roster: Giocatore[] }): ReactElement {
  if (roster.length === 0) return <div className="empty-roster"><strong>Nessun giocatore in questa rosa.</strong><span>Assegnazioni club non presenti nello snapshot.</span></div>;
  return (
    <div className="roster-table-wrap">
      <table className="roster-table">
        <thead><tr><th>Giocatore</th><th>Ruolo</th><th>Età</th><th>OVR</th><th>PES ID</th></tr></thead>
        <tbody>
          {roster.map((player) => (
            <tr key={player.id}>
              <td><strong>{player.nome}</strong><small>{player.nazionalita}</small></td>
              <td><span className="role-tag">{player.ruolo}</span></td>
              <td>{player.eta}</td>
              <td><strong className="overall">{player.overall}</strong></td>
              <td className="pes-id">{player.pesId ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
