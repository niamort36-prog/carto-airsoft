import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Parcours de la console, bouton par bouton.
 *
 * Ces tests existent parce qu'un bouton peut « ne rien faire » de trois
 * façons, et qu'aucune ne se voit à la compilation : l'appel part et
 * échoue sans que personne l'annonce, le handler lève avant d'agir, ou la
 * condition qui le déclenche n'est jamais vraie.
 *
 * Ils vérifient donc deux choses pour chaque geste : que l'API est bien
 * appelée, et qu'un refus du serveur finit à l'écran.
 */

const appels: Array<{ nom: string; args: unknown[] }> = [];
let echoue = false;

/** Note l'appel, et échoue sur commande — c'est le second cas à couvrir. */
function espion<T>(nom: string, valeur: T) {
  return vi.fn(async (...args: unknown[]) => {
    appels.push({ nom, args });
    if (echoue) throw new Error(`refus du serveur (${nom})`);
    return valeur;
  });
}

const PARTIE = {
  game: { id: 'g1', name: 'Op Test', status: 'draft', preparedMapId: null },
  role: 'commandant',
  permissions: [
    'game:manage',
    'teams:manage',
    'squads:manage',
    'invites:manage',
  ],
};

const CAMPS = [
  {
    id: 't1',
    name: 'Bleu',
    color: '#2196F3',
    squads: [{ id: 's1', name: 'Alpha', echelon: 'groupe' }],
  },
];

const MEMBRES = [
  {
    membershipId: 'm1',
    pseudo: 'Testeur',
    email: null,
    role: 'commandant',
    unitType: 'infantry',
    teamId: null,
    squadId: null,
  },
];

const INVITATIONS = [
  {
    id: 'i1',
    role: 'joueur',
    code: 'ABCD-EFGH',
    useCount: 0,
    maxUses: null,
    active: true,
  },
];

const BONUS = [
  {
    id: 'p1',
    type: 'drone' as const,
    radiusMeters: 400,
    durationSeconds: 60,
    cooldownSeconds: 300,
    stockPerTeam: 3,
    allowedRoles: [],
    orbit: true,
    sweepSeconds: 10,
    concealment: 'none' as const,
    concealedCovers: [] as string[],
  },
];

vi.mock('./api', async () => {
  const reel = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...reel,
    API: 'http://test/v1',
    isMixedContent: false,
    definirUrlServeur: vi.fn(),
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: {} } } }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe() {} } },
        }),
        signOut: vi.fn(),
      },
    },
    api: {
      games: espion('games', [PARTIE]),
      createGame: espion('createGame', PARTIE.game),
      members: espion('members', MEMBRES),
      teams: espion('teams', CAMPS),
      createTeam: espion('createTeam', CAMPS[0]),
      createSquad: espion('createSquad', CAMPS[0].squads[0]),
      assign: espion('assign', null),
      invites: espion('invites', INVITATIONS),
      createInvite: espion('createInvite', INVITATIONS[0]),
      revokeInvite: espion('revokeInvite', null),
      previewInvite: espion('previewInvite', {
        gameName: 'Op Test',
        role: 'joueur',
        teamName: 'Bleu',
        squadName: null,
      }),
      joinByCode: espion('joinByCode', { gameId: 'g1' }),
      maps: espion('maps', [
        {
          id: 'c1',
          name: 'Terrain',
          basemap: 'ortho_ign',
          objectCount: 2,
          objectiveCount: 1,
        },
      ]),
      createMap: espion('createMap', {
        id: 'c1',
        name: 'Terrain',
        basemap: 'ortho_ign',
        objectCount: 0,
        objectiveCount: 0,
      }),
      map: espion('map', { content: { objects: [], objectives: [] } }),
      updateMap: espion('updateMap', {}),
      deleteMap: espion('deleteMap', null),
      attachMap: espion('attachMap', { objects: 0, objectives: 0 }),
      perks: espion('perks', BONUS),
      createPerk: espion('createPerk', BONUS[0]),
      updatePerk: espion('updatePerk', BONUS[0]),
      deletePerk: espion('deletePerk', null),
      permissions: espion('permissions', {
        catalogue: [{ key: 'game:manage', label: 'Gérer la partie' }],
        matrix: { commandant: ['game:manage'] },
        myRole: 'commandant',
        mine: ['game:manage'],
      }),
      sync: espion('sync', { objects: [] }),
      pushObjects: espion('pushObjects', []),
      objectives: espion('objectives', []),
      createObjective: espion('createObjective', {}),
      setPermission: espion('setPermission', {
        matrix: { commandant: ['game:manage'], joueur: ['game:manage'] },
      }),
      replay: espion('replay', {
        game: { id: 'g1', name: 'Op Test', status: 'ended' },
        from: 1000,
        to: 2000,
        units: [],
        events: [],
      }),
      stats: espion('stats', {
        game: { id: 'g1', name: 'Op Test', status: 'ended' },
        players: [],
        teams: [],
      }),
    },
  };
});

const { App } = await import('./App');

/** Ouvre la partie et son onglet. */
async function ouvrir(onglet: string) {
  const u = userEvent.setup();
  render(<App />);
  await screen.findByText('Op Test');
  await u.click(screen.getByText('Op Test'));
  await u.click(await screen.findByRole('button', { name: onglet }));
  return u;
}

const aAppele = (nom: string) => appels.some((a) => a.nom === nom);

beforeEach(() => {
  appels.length = 0;
  echoue = false;
  vi.restoreAllMocks();
  vi.spyOn(window, 'prompt').mockReturnValue('Essai');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('la console répond à chaque bouton', () => {
  it('affiche les deux sections et les cinq onglets d’une partie', async () => {
    const u = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Cartes' })).toBeVisible();
    await u.click(await screen.findByText('Op Test'));
    for (const onglet of ['Carte', 'Réglages', 'Équipes', 'Partage', 'Bilan']) {
      expect(screen.getByRole('button', { name: onglet })).toBeVisible();
    }
  });

  it('crée une carte préparée', async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(await screen.findByRole('button', { name: 'Cartes' }));
    await u.click(await screen.findByRole('button', { name: /Nouvelle carte/ }));
    await waitFor(() => expect(aAppele('createMap')).toBe(true));
  });

  it('crée une partie', async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(await screen.findByRole('button', { name: /Nouvelle partie/ }));
    await waitFor(() => expect(aAppele('createGame')).toBe(true));
  });

  it('vérifie un code avant de rejoindre, puis rejoint', async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.type(await screen.findByPlaceholderText('ABCD-EFGH'), 'ABCDEFGH');
    await u.click(screen.getByRole('button', { name: 'Vérifier' }));
    await waitFor(() => expect(aAppele('previewInvite')).toBe(true));
    await u.click(await screen.findByRole('button', { name: 'Rejoindre' }));
    await waitFor(() => expect(aAppele('joinByCode')).toBe(true));
  });

  it('forme une faction', async () => {
    const u = await ouvrir('Équipes');
    await u.type(
      await screen.findByPlaceholderText('Nom de la faction'),
      'Rouge',
    );
    await u.click(screen.getByRole('button', { name: /\+ Faction/ }));
    await waitFor(() => expect(aAppele('createTeam')).toBe(true));
  });

  it('forme une unité dans une faction', async () => {
    const u = await ouvrir('Équipes');
    await u.click(await screen.findByRole('button', { name: /\+ unité/ }));
    await waitFor(() => expect(aAppele('createSquad')).toBe(true));
  });

  it('affecte un membre à un camp', async () => {
    const u = await ouvrir('Équipes');
    const liste = await screen.findByRole('combobox');
    await u.selectOptions(liste, 't1');
    await waitFor(() => expect(aAppele('assign')).toBe(true));
  });

  it('dit pourquoi quand le serveur refuse une affectation', async () => {
    // Le cas qui passait inaperçu : la liste revenait à l'état d'avant,
    // sans un mot, et le geste semblait ignoré.
    const u = await ouvrir('Équipes');
    echoue = true;
    await u.selectOptions(await screen.findByRole('combobox'), 't1');
    expect(await screen.findByText(/refus du serveur/)).toBeVisible();
  });

  it('génère une invitation', async () => {
    const u = await ouvrir('Partage');
    await u.click(await screen.findByRole('button', { name: 'Générer' }));
    await waitFor(() => expect(aAppele('createInvite')).toBe(true));
  });

  it('révoque une invitation, et le dit si le serveur refuse', async () => {
    const u = await ouvrir('Partage');
    echoue = true;
    await u.click(await screen.findByRole('button', { name: 'Révoquer' }));
    expect(await screen.findByText(/refus du serveur/)).toBeVisible();
  });

  it('prépare une planche de QR à imprimer', async () => {
    const u = await ouvrir('Partage');
    await u.click(await screen.findByRole('button', { name: /Tout cocher/ }));
    await u.click(await screen.findByRole('button', { name: /Aperçu/ }));
    expect(await screen.findByRole('button', { name: 'Imprimer' })).toBeVisible();
  });

  it('règle le drone sans créer de doublon', async () => {
    const u = await ouvrir('Réglages');
    const rayon = await screen.findByDisplayValue('400');
    await u.clear(rayon);
    await u.type(rayon, '250');
    await u.tab();
    await waitFor(() => expect(aAppele('updatePerk')).toBe(true));
    expect(aAppele('createPerk')).toBe(false);
  });

  it('change la dissimulation du drone', async () => {
    const u = await ouvrir('Réglages');
    await u.click(await screen.findByLabelText(/Invisible sous couvert/));
    await waitFor(() => {
      const appel = appels.find((a) => a.nom === 'updatePerk');
      expect(appel?.args[2]).toMatchObject({ concealment: 'hidden' });
    });
  });

  it('retire un bonus de la partie', async () => {
    const u = await ouvrir('Réglages');
    await u.click(await screen.findByRole('button', { name: 'Retirer' }));
    await waitFor(() => expect(aAppele('deletePerk')).toBe(true));
  });

  it('propose les outils de dessin dans l’onglet Carte', async () => {
    await ouvrir('Carte');
    for (const outil of ['Symbole', 'Ligne', 'Zone', 'Drapeau']) {
      expect(await screen.findByRole('button', { name: outil })).toBeVisible();
    }
  });

  it('refuse de valider une zone sans assez de points, et le dit', async () => {
    // Avant, « Valider » ne faisait rien et ne disait rien : exactement ce
    // qu'on prend pour un bouton cassé.
    const u = await ouvrir('Carte');
    await u.click(await screen.findByRole('button', { name: 'Zone' }));
    await u.click(await screen.findByRole('button', { name: 'Valider' }));
    expect(await screen.findByText(/au moins 3 points/)).toBeVisible();
  });

  it('ouvre le sélecteur de symboles', async () => {
    const u = await ouvrir('Carte');
    await u.click(await screen.findByRole('button', { name: 'Symbole' }));
    const bouton = await screen.findByRole('button', { name: /infantry/i });
    await u.click(bouton);
    expect(await screen.findByText('Choisir un symbole')).toBeVisible();
  });
  it('redemande un nom trop court au lieu d’abandonner en silence', async () => {
    // La panne signalée : valider « Op » refermait la boîte sans rien faire.
    const demandes = vi.spyOn(window, 'prompt');
    demandes.mockReturnValueOnce('Op').mockReturnValueOnce('Op Fontainebleau');
    const u = userEvent.setup();
    render(<App />);
    await u.click(await screen.findByRole('button', { name: /Nouvelle partie/ }));
    expect(demandes).toHaveBeenCalledTimes(2);
    expect(demandes.mock.calls[1][0]).toMatch(/au moins 3 caractères/);
    await waitFor(() => {
      expect(appels.find((a) => a.nom === 'createGame')?.args[0]).toBe(
        'Op Fontainebleau',
      );
    });
  });

  it('abandonne sans bruit si on annule la boîte de nom', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const u = userEvent.setup();
    render(<App />);
    await u.click(await screen.findByRole('button', { name: /Nouvelle partie/ }));
    expect(aAppele('createGame')).toBe(false);
  });

  it('ouvre puis referme une carte préparée', async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(await screen.findByRole('button', { name: 'Cartes' }));
    await u.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    await waitFor(() => expect(aAppele('map')).toBe(true));
    await u.click(await screen.findByRole('button', { name: /Mes cartes/ }));
    expect(await screen.findByRole('button', { name: 'Ouvrir' })).toBeVisible();
  });

  it('supprime une carte préparée après confirmation', async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(await screen.findByRole('button', { name: 'Cartes' }));
    await u.click(await screen.findByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(aAppele('deleteMap')).toBe(true));
  });

  it('recopie une carte dans la partie et annonce ce qui est entré', async () => {
    const u = await ouvrir('Carte');
    await u.click(await screen.findByRole('button', { name: 'Recopier' }));
    await waitFor(() => expect(aAppele('attachMap')).toBe(true));
    expect(await screen.findByText(/recopiés/)).toBeVisible();
  });

  it('active le brouilleur', async () => {
    const u = await ouvrir('Réglages');
    const boutons = await screen.findAllByRole('button', { name: 'Activer' });
    await u.click(boutons[boutons.length - 1]);
    await waitFor(() => expect(aAppele('createPerk')).toBe(true));
  });

  it('coche une permission, et dit si le serveur refuse', async () => {
    const u = await ouvrir('Réglages');
    const cases = await screen.findAllByRole('checkbox');
    const joueur = cases[cases.length - 1];
    await u.click(joueur);
    await waitFor(() => expect(aAppele('setPermission')).toBe(true));
  });

  it('charge le bilan et déroule la lecture', async () => {
    const u = await ouvrir('Bilan');
    await waitFor(() => expect(aAppele('replay')).toBe(true));
    expect(aAppele('stats')).toBe(true);
    const lecture = await screen.findByRole('button', { name: /Lecture/ });
    await u.click(lecture);
    expect(await screen.findByRole('button', { name: /Pause/ })).toBeVisible();
  });
});
