import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  api,
  ROLE_LABELS,
  supabase,
  type GameEntry,
  type InvitePreview,
  type Member,
  type TeamEntry,
} from './api';
import { InvitesPanel } from './InvitesPanel';
import { Login } from './Login';
import { PermissionsPanel } from './PermissionsPanel';
import { PrepMap } from './PrepMap';
import { Replay } from './Replay';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="center">Chargement…</div>;
  if (!session) return <Login />;
  return <Console />;
}

function Console() {
  const [games, setGames] = useState<GameEntry[]>([]);
  const [selected, setSelected] = useState<GameEntry | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  // La console sert à deux moments distincts : avant la partie pour la
  // préparer, après pour la relire.
  const [view, setView] = useState<'prep' | 'replay'>('prep');
  // Rejoindre depuis le navigateur : la console n'est plus réservée à
  // l'organisateur, un joueur peut y entrer avec le code qu'on lui donne.
  const [codeSaisi, setCodeSaisi] = useState('');
  const [apercu, setApercu] = useState<InvitePreview | null>(null);

  useEffect(() => {
    api.games().then(setGames).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    void refreshGame(selected.game.id);
  }, [selected?.game.id]);

  async function refreshGame(gameId: string) {
    try {
      const [m, t] = await Promise.all([
        api.members(gameId),
        api.teams(gameId),
      ]);
      setMembers(m);
      setTeams(t);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Montre ce à quoi le code engage avant d'inscrire : se tromper de
  // caractère et atterrir chez l'adversaire serait pénible à défaire.
  async function previewCode() {
    setError(null);
    setApercu(null);
    try {
      setApercu(await api.previewInvite(codeSaisi));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function joinByCode() {
    setError(null);
    try {
      const rejointe = await api.joinByCode(codeSaisi);
      const liste = await api.games();
      setGames(liste);
      setSelected(liste.find((g) => g.game.id === rejointe.gameId) ?? null);
      setCodeSaisi('');
      setApercu(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function createGame() {
    // Une seule partie créée à la fois : on annonce la suppression avant.
    const existante = games.find((g) => g.role === 'commandant');
    if (
      existante &&
      !confirm(
        `« ${existante.game.name} » sera définitivement supprimée, avec ses ` +
          'marqueurs, messages et invitations. Continuer ?',
      )
    ) {
      return;
    }
    const name = prompt('Nom de la partie ?');
    if (!name || name.length < 3) return;
    try {
      await api.createGame(name);
      setGames(await api.games());
      setSelected(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addTeam() {
    if (!selected) return;
    const name = prompt('Nom de l’équipe ?');
    if (!name) return;
    const color = name.toLowerCase().includes('rouge') ? '#F44336' : '#2196F3';
    await api.createTeam(selected.game.id, name, color);
    void refreshGame(selected.game.id);
  }

  async function addSquad(teamId: string) {
    if (!selected) return;
    const name = prompt('Nom de l’escouade ?');
    if (!name) return;
    await api.createSquad(selected.game.id, teamId, name);
    void refreshGame(selected.game.id);
  }

  const canManageTeams = selected?.permissions.includes('teams:manage');
  const canManageInvites = selected?.permissions.includes('invites:manage');

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="row">
          <h1 className="grow">Console</h1>
          <button onClick={() => supabase.auth.signOut()}>Quitter</button>
        </div>

        {error && <div className="error">{error}</div>}

        <h2>Parties</h2>
        <div className="list">
          {games.map((g) => (
            <button
              key={g.game.id}
              className={`item ${selected?.game.id === g.game.id ? 'selected' : ''}`}
              onClick={() => setSelected(g)}
            >
              <span className="grow">
                {g.game.name}
                <br />
                <span className="muted">
                  {ROLE_LABELS[g.role] ?? g.role} · {g.game.status}
                </span>
              </span>
            </button>
          ))}
        </div>
        <button style={{ marginTop: 8 }} onClick={createGame}>
          + Nouvelle partie
        </button>

        <h2 style={{ marginTop: 16 }}>Rejoindre</h2>
        <div className="row">
          <input
            className="grow"
            value={codeSaisi}
            placeholder="ABCD-EFGH"
            onChange={(e) => {
              setCodeSaisi(e.target.value.toUpperCase());
              setApercu(null);
            }}
          />
          <button onClick={previewCode} disabled={codeSaisi.trim().length < 8}>
            Vérifier
          </button>
        </div>
        {apercu && (
          <div className="item" style={{ marginTop: 8 }}>
            <span className="grow">
              {apercu.gameName}
              <br />
              <span className="muted">
                {ROLE_LABELS[apercu.role] ?? apercu.role}
                {apercu.teamName ? ` · camp ${apercu.teamName}` : ''}
                {apercu.squadName ? ` · ${apercu.squadName}` : ''}
              </span>
            </span>
            <button className="primary" onClick={joinByCode}>
              Rejoindre
            </button>
          </div>
        )}

        {selected && (
          <>
            <h2>Organisation</h2>
            <div className="list">
              {teams.length === 0 && (
                <p className="muted">Aucune équipe pour l’instant.</p>
              )}
              {teams.map((t) => (
                <div className="item" key={t.id}>
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: t.color,
                    }}
                  />
                  <span className="grow">
                    {t.name}
                    <br />
                    <span className="muted">
                      {t.squads.length === 0
                        ? 'sans escouade'
                        : t.squads.map((s) => s.name).join(', ')}
                    </span>
                  </span>
                  {canManageTeams && (
                    <button onClick={() => addSquad(t.id)}>+ escouade</button>
                  )}
                </div>
              ))}
            </div>
            {canManageTeams && (
              <button style={{ marginTop: 8 }} onClick={addTeam}>
                + Équipe
              </button>
            )}

            <h2>Membres ({members.length})</h2>
            <div className="list">
              {members.map((m) => (
                <div className="item" key={m.membershipId}>
                  <span className="grow">
                    {m.pseudo ?? m.email?.split('@')[0] ?? 'Joueur'}
                    <br />
                    <span className="muted">
                      {ROLE_LABELS[m.role] ?? m.role}
                      {m.squadId
                        ? ` · ${squadName(teams, m.squadId)}`
                        : m.teamId
                          ? ` · ${teamName(teams, m.teamId)}`
                          : ' · non affecté'}
                    </span>
                  </span>
                  {canManageTeams && (
                    <select
                      value={m.squadId ?? m.teamId ?? ''}
                      onChange={async (e) => {
                        const value = e.target.value;
                        const isSquad = teams.some((t) =>
                          t.squads.some((s) => s.id === value),
                        );
                        await api.assign(selected.game.id, m.membershipId, {
                          teamId: isSquad ? null : value || null,
                          squadId: isSquad ? value : null,
                        });
                        void refreshGame(selected.game.id);
                      }}
                    >
                      <option value="">—</option>
                      {teams.map((t) => (
                        <optgroup key={t.id} label={t.name}>
                          <option value={t.id}>{t.name} (sans escouade)</option>
                          {t.squads.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>

            {canManageInvites && (
              <InvitesPanel gameId={selected.game.id} teams={teams} />
            )}

            {selected.permissions.includes('game:manage') && (
              <PermissionsPanel gameId={selected.game.id} />
            )}
          </>
        )}
      </aside>

      <main className="main">
        {selected ? (
          <>
            <div className="tabs">
              <button
                className={view === 'prep' ? 'selected' : ''}
                onClick={() => setView('prep')}
              >
                Préparation
              </button>
              <button
                className={view === 'replay' ? 'selected' : ''}
                onClick={() => setView('replay')}
                title={
                  selected.game.status === 'finished'
                    ? undefined
                    : 'Disponible une fois la partie terminée'
                }
              >
                Rejeu et bilan
              </button>
            </div>
            {view === 'prep' ? (
              <PrepMap key={selected.game.id} gameId={selected.game.id} />
            ) : (
              <Replay key={selected.game.id} gameId={selected.game.id} />
            )}
          </>
        ) : (
          <div className="center">
            <p className="muted">
              Sélectionnez une partie pour préparer sa carte.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

const teamName = (teams: TeamEntry[], id: string) =>
  teams.find((t) => t.id === id)?.name ?? 'équipe';

const squadName = (teams: TeamEntry[], id: string) =>
  teams.flatMap((t) => t.squads).find((s) => s.id === id)?.name ?? 'escouade';
