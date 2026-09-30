import { useEffect, useState } from 'react';

import { api, type PerkDefinition } from './api';
import { PermissionsPanel } from './PermissionsPanel';

/**
 * Onglet « Réglages » : ce que la partie autorise.
 *
 * Deux questions distinctes s'y répondent — quels bonus existent, et qui a
 * le droit de faire quoi. La seconde est la matrice de permissions (§5),
 * qui décide notamment *qui peut inviter qui*.
 */

/** Réglages par défaut d'un bonus, repris de la doc du §7.7. */
const BONUS = [
  {
    type: 'drone' as const,
    label: 'Drone',
    aide:
      'Révèle les hostiles dans un rayon, le temps d’un survol. Les ' +
      'positions adverses ne quittent le serveur que pendant ce survol.',
    defauts: {
      radiusMeters: 400,
      durationSeconds: 60,
      cooldownSeconds: 300,
      stockPerTeam: 3,
    },
  },
  {
    type: 'jammer' as const,
    label: 'Brouilleur',
    aide: 'Coupe les drones adverses pendant sa durée.',
    defauts: {
      radiusMeters: 500,
      durationSeconds: 30,
      cooldownSeconds: 600,
      stockPerTeam: 2,
    },
  },
];

export function SettingsPanel({ gameId }: { gameId: string }) {
  const [perks, setPerks] = useState<PerkDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recharger = () =>
    api
      .perks(gameId)
      .then(setPerks)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void recharger();
  }, [gameId]);

  async function activer(bonus: (typeof BONUS)[number]) {
    setError(null);
    try {
      await api.createPerk(gameId, { type: bonus.type, ...bonus.defauts });
      await recharger();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="panel">
      <h2>Bonus</h2>
      <p className="muted">
        Un bonus absent de cette liste n’existe pas dans la partie : rien ne
        l’active côté joueur. Tout est arbitré par le serveur (§7.7).
      </p>
      {error && <div className="error">{error}</div>}

      <div className="list" style={{ marginTop: 12 }}>
        {BONUS.map((b) => {
          const pose = perks.find((p) => p.type === b.type);
          return (
            <div className="item" key={b.type}>
              <span className="grow">
                {b.label}
                <br />
                <span className="muted">
                  {pose
                    ? `${pose.radiusMeters} m · ${pose.durationSeconds} s · ` +
                      `recharge ${pose.cooldownSeconds} s · ` +
                      (pose.stockPerTeam == null
                        ? 'illimité'
                        : `${pose.stockPerTeam} par équipe`)
                    : b.aide}
                </span>
              </span>
              {pose ? (
                <span className="muted">actif</span>
              ) : (
                <button onClick={() => activer(b)}>Activer</button>
              )}
            </div>
          );
        })}
      </div>

      <h2 style={{ marginTop: 24 }}>Qui peut faire quoi</h2>
      <p className="muted">
        La matrice décide, pas le grade : « la permission dit quoi, le grade
        dit sur qui ». C’est ici qu’on autorise un capitaine à inviter
        lui-même — il ne pourra jamais le faire au-dessus de son propre
        grade, le serveur le refuse.
      </p>
      <PermissionsPanel gameId={gameId} />
    </div>
  );
}
