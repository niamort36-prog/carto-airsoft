import { useEffect, useState } from 'react';

import {
  api,
  COVERS,
  type Concealment,
  type PerkDefinition,
  type PerkSettings,
} from './api';
import { PermissionsPanel } from './PermissionsPanel';

/**
 * Onglet « Réglages » : ce que la partie autorise.
 *
 * Deux questions distinctes s'y répondent — quels bonus existent et
 * comment ils se comportent, et qui a le droit de faire quoi. La seconde
 * est la matrice de permissions (§5), qui décide notamment *qui peut
 * inviter qui*.
 */

const DEFAUTS: Record<'drone' | 'jammer', PerkSettings> = {
  drone: {
    radiusMeters: 400,
    durationSeconds: 60,
    cooldownSeconds: 300,
    stockPerTeam: 3,
    orbit: true,
    sweepSeconds: 10,
    concealment: 'none',
    concealedCovers: [],
  },
  jammer: {
    radiusMeters: 500,
    durationSeconds: 30,
    cooldownSeconds: 600,
    stockPerTeam: 2,
  },
};

const DISSIMULATIONS: Array<{
  key: Concealment;
  label: string;
  aide: string;
}> = [
  {
    key: 'none',
    label: 'Le drone voit tout',
    aide: 'Aucun couvert ne protège.',
  },
  {
    key: 'intermittent',
    label: 'Apparition par intermittence',
    aide:
      'Sous couvert, on n’apparaît qu’à certains balayages. On finit par ' +
      'savoir qu’il y a quelqu’un — jamais exactement où, ni combien.',
  },
  {
    key: 'hidden',
    label: 'Invisible sous couvert',
    aide: 'Tant qu’on y reste, le drone ne voit rien.',
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

  async function activer(type: 'drone' | 'jammer') {
    setError(null);
    try {
      await api.createPerk(gameId, { type, ...DEFAUTS[type] });
      await recharger();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function retirer(perk: PerkDefinition) {
    if (!confirm('Retirer ce bonus de la partie ?')) return;
    setError(null);
    try {
      await api.deletePerk(gameId, perk.id);
      await recharger();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const drone = perks.find((p) => p.type === 'drone');
  const brouilleur = perks.find((p) => p.type === 'jammer');

  return (
    <div className="panel">
      <h2>Bonus</h2>
      <p className="muted">
        Un bonus absent de cette liste n’existe pas dans la partie : rien ne
        l’active côté joueur. Tout est arbitré par le serveur (§7.7).
      </p>
      {error && <div className="error">{error}</div>}

      {drone ? (
        <PerkForm
          gameId={gameId}
          perk={drone}
          onChange={recharger}
          onRemove={() => retirer(drone)}
        />
      ) : (
        <div className="item" style={{ marginTop: 12 }}>
          <span className="grow">
            Drone
            <br />
            <span className="muted">
              Révèle les hostiles d’un rayon, le temps d’un survol.
            </span>
          </span>
          <button onClick={() => activer('drone')}>Activer</button>
        </div>
      )}

      {brouilleur ? (
        <PerkForm
          gameId={gameId}
          perk={brouilleur}
          onChange={recharger}
          onRemove={() => retirer(brouilleur)}
        />
      ) : (
        <div className="item" style={{ marginTop: 12 }}>
          <span className="grow">
            Brouilleur
            <br />
            <span className="muted">
              Coupe les drones adverses pendant sa durée.
            </span>
          </span>
          <button onClick={() => activer('jammer')}>Activer</button>
        </div>
      )}

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

/** Le formulaire d'un bonus posé. */
function PerkForm({
  gameId,
  perk,
  onChange,
  onRemove,
}: {
  gameId: string;
  perk: PerkDefinition;
  onChange: () => void;
  onRemove: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function regler(patch: PerkSettings) {
    setError(null);
    setEnCours(true);
    try {
      await api.updatePerk(gameId, perk.id, patch);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnCours(false);
    }
  }

  const estDrone = perk.type === 'drone';
  const nombre = (
    label: string,
    champ: keyof PerkSettings,
    valeur: number,
    aide: string,
  ) => (
    <label className="reglage">
      <span>{label}</span>
      <input
        type="number"
        defaultValue={valeur}
        disabled={enCours}
        // À la sortie du champ, pas à chaque frappe : taper « 400 »
        // enverrait sinon 4, puis 40, puis 400.
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n !== valeur) void regler({ [champ]: n });
        }}
      />
      <small className="muted">{aide}</small>
    </label>
  );

  return (
    <div className="perk-form">
      <div className="row">
        <strong className="grow">{estDrone ? 'Drone' : 'Brouilleur'}</strong>
        <button className="danger" onClick={onRemove}>
          Retirer
        </button>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="reglages">
        {nombre('Rayon (m)', 'radiusMeters', perk.radiusMeters, 'Zone couverte')}
        {nombre(
          'Durée (s)',
          'durationSeconds',
          perk.durationSeconds,
          'Temps où il reste en l’air',
        )}
        {nombre(
          'Recharge (s)',
          'cooldownSeconds',
          perk.cooldownSeconds,
          'Attente avant de pouvoir le relancer',
        )}
        {nombre(
          'Par équipe',
          'stockPerTeam',
          perk.stockPerTeam ?? 0,
          '0 = illimité',
        )}
        {estDrone &&
          nombre(
            'Balayage (s)',
            'sweepSeconds',
            perk.sweepSeconds,
            '0 = un seul instantané',
          )}
      </div>

      {estDrone && (
        <>
          <label className="row" style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              checked={perk.orbit}
              disabled={enCours}
              onChange={(e) => void regler({ orbit: e.target.checked })}
            />
            <span>
              Tourne autour du point visé
              <br />
              <small className="muted">
                Plutôt que d’y rester fixe. C’est ce qui rend lisible la zone
                qu’il couvre.
              </small>
            </span>
          </label>

          <h3 style={{ marginTop: 16 }}>Ce que le couvert lui cache</h3>
          <p className="muted">
            Le serveur n’a aucune carte d’occupation du sol : ce sont{' '}
            <strong>vos zones dessinées</strong> qui le disent. Marquez une
            zone « Forêt » ou « Zone urbaine » dans l’onglet Carte.
          </p>
          <div className="list">
            {DISSIMULATIONS.map((d) => (
              <label className="item" key={d.key}>
                <input
                  type="radio"
                  name={`concealment-${perk.id}`}
                  checked={perk.concealment === d.key}
                  disabled={enCours}
                  onChange={() => void regler({ concealment: d.key })}
                />
                <span className="grow">
                  {d.label}
                  <br />
                  <span className="muted">{d.aide}</span>
                </span>
              </label>
            ))}
          </div>

          {perk.concealment !== 'none' && (
            <>
              <h3 style={{ marginTop: 12 }}>Quels couverts dissimulent</h3>
              <div className="row">
                {COVERS.map((c) => {
                  const actif = perk.concealedCovers.includes(c.key);
                  return (
                    <label className="item" key={c.key}>
                      <input
                        type="checkbox"
                        checked={actif}
                        disabled={enCours}
                        onChange={() =>
                          void regler({
                            concealedCovers: actif
                              ? perk.concealedCovers.filter((x) => x !== c.key)
                              : [...perk.concealedCovers, c.key],
                          })
                        }
                      />
                      <span>{c.label}</span>
                    </label>
                  );
                })}
              </div>
              {perk.concealedCovers.length === 0 && (
                <p className="muted">
                  Aucun couvert coché : le drone voit tout, quel que soit le
                  réglage ci-dessus.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
