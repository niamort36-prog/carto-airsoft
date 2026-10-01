import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import {
  api,
  API,
  definirUrlServeur,
  isMixedContent,
  MIXED_CONTENT_HINT,
  ROLE_LABELS,
  supabase,
  type GameEntry,
  type InvitePreview,
  type Member,
  type TeamEntry,
} from './api';
import { Login } from './Login';
import { MapEditor } from './MapEditor';
import { MapPicker, MapsPanel } from './MapsPanel';
import { gameStore } from './mapStore';
import { Replay } from './Replay';
import { SettingsPanel } from './SettingsPanel';
import { SharePanel } from './SharePanel';
import { TeamsPanel } from './TeamsPanel';

export function App() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!session) return <Login />;
  return <Console />;
}

/** Les deux grandes sections, comme deux tiroirs distincts. */
type Section = 'cartes' | 'parties';

/** Ce qu'on règle dans une partie. */
type Onglet = 'carte' | 'reglages' | 'equipes' | 'partage' | 'bilan';

const ONGLETS: Array<{ key: Onglet; label: string }> = [
  { key: 'carte', label: 'Carte' },
  { key: 'reglages', label: 'Réglages' },
  { key: 'equipes', label: 'Équipes' },
  { key: 'partage', label: 'Partage' },
  { key: 'bilan', label: 'Bilan' },
];

function Console() {
  const [section, setSection] = useState<Section>('parties');
  const [games, setGames] = useState<GameEntry[]>([]);
  const [selected, setSelected] = useState<GameEntry | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [onglet, setOnglet] = useState<Onglet>('carte');
  const [error, setError] = useState<string | null>(null);

  // Rejoindre depuis le navigateur : la console n'est pas réservée à
  // l'organisateur, un joueur peut y entrer avec le code qu'on lui donne.
  const [codeSaisi, setCodeSaisi] = useState('');
  const [apercu, setApercu] = useState<InvitePreview | null>(null);

  const rechargerParties = () =>
    api
      .games()
      .then(setGames)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void rechargerParties();
  }, []);

  useEffect(() => {
    if (!selected) return;
    void rafraichir(selected.game.id);
  }, [selected?.game.id]);

  async function rafraichir(gameId: string) {
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
    const nom = prompt('Nom de la partie', 'Op Fontainebleau');
    if (nom == null || nom.trim().length < 3) return;
    setError(null);
    try {
      await api.createGame(nom.trim());
      const liste = await api.games();
      setGames(liste);
      setSelected(liste.find((g) => g.game.name === nom.trim()) ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Un store par partie : le recréer à chaque rendu relancerait le
  // chargement en boucle.
  const storeCarte = useMemo(
    () => (selected ? gameStore(selected.game.id, 'ortho_ign') : null),
    [selected?.game.id],
  );

  const peutGerer = selected?.permissions.includes('game:manage') ?? false;
  const peutEquipes = selected?.permissions.includes('teams:manage') ?? false;
  const peutInviter = selected?.permissions.includes('invites:manage') ?? false;

  return (
    <div className="app">
      <header className="topbar">
        <strong className="grow">Carto Airsoft</strong>
        <nav className="tabs">
          <button
            className={section === 'cartes' ? 'selected' : ''}
            onClick={() => setSection('cartes')}
          >
            Cartes
          </button>
          <button
            className={section === 'parties' ? 'selected' : ''}
            onClick={() => setSection('parties')}
          >
            Mes parties
          </button>
        </nav>
        <button
          title={`Serveur : ${API}`}
          onClick={() => {
            const saisie = prompt(
              'Adresse du serveur.\n\n' +
                'Collez ici l’adresse HTTPS de votre tunnel — la console la ' +
                'retient et n’a pas besoin d’être reconstruite.',
              API,
            );
            if (saisie != null) definirUrlServeur(saisie);
          }}
        >
          Serveur
        </button>
        <button onClick={() => supabase.auth.signOut()}>Quitter</button>
      </header>

      {isMixedContent && (
        <div className="error">
          {MIXED_CONTENT_HINT} Le bouton « Serveur », en haut, l’enregistre
          sans rien reconstruire.
        </div>
      )}
      {error && <div className="error">{error}</div>}

      {section === 'cartes' ? (
        <MapsPanel />
      ) : (
        <div className="split">
          <aside className="sidebar">
            <h2>Parties</h2>
            <div className="list">
              {games.length === 0 && (
                <p className="muted">Aucune partie pour l’instant.</p>
              )}
              {games.map((g) => (
                <button
                  key={g.game.id}
                  className={`item ${
                    selected?.game.id === g.game.id ? 'selected' : ''
                  }`}
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
              <button
                onClick={previewCode}
                disabled={codeSaisi.trim().length < 8}
              >
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
          </aside>

          <main className="main">
            {!selected ? (
              <div className="center">
                <p className="muted">
                  Sélectionnez une partie, ou créez-en une.
                </p>
              </div>
            ) : (
              <>
                <div className="tabs sous-onglets">
                  {ONGLETS.map((o) => (
                    <button
                      key={o.key}
                      className={onglet === o.key ? 'selected' : ''}
                      onClick={() => setOnglet(o.key)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>

                {onglet === 'carte' && storeCarte && (
                  <div className="editor">
                    {peutGerer && (
                      <div className="panel panel-compact">
                        <MapPicker
                          gameId={selected.game.id}
                          currentMapId={selected.game.preparedMapId ?? null}
                          onAttached={() => void rechargerParties()}
                        />
                      </div>
                    )}
                    <MapEditor key={selected.game.id} store={storeCarte} />
                  </div>
                )}

                {onglet === 'reglages' && (
                  <SettingsPanel gameId={selected.game.id} />
                )}

                {onglet === 'equipes' && (
                  <TeamsPanel
                    gameId={selected.game.id}
                    teams={teams}
                    members={members}
                    canManage={peutEquipes}
                    onChange={() => void rafraichir(selected.game.id)}
                  />
                )}

                {onglet === 'partage' &&
                  (peutInviter ? (
                    <SharePanel gameId={selected.game.id} teams={teams} />
                  ) : (
                    <div className="panel">
                      <p className="muted">
                        Votre grade ne permet pas de générer d’invitation.
                      </p>
                    </div>
                  ))}

                {onglet === 'bilan' && (
                  <Replay key={selected.game.id} gameId={selected.game.id} />
                )}
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
