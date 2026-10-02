import { useEffect, useState } from 'react';
import { api, ROLE_LABELS } from './api';

const ROLES = ['commandant', 'capitaine', 'chef_escouade', 'joueur'];

/**
 * Réglage de la matrice (§5) : ce que chaque grade a le droit de faire, pour
 * CETTE partie. Le serveur reste l'arbitre — cocher une case ne fait
 * qu'enregistrer une intention, chaque action est revérifiée à l'appel.
 */
export function PermissionsPanel({ gameId }: { gameId: string }) {
  const [catalogue, setCatalogue] = useState<
    Array<{ key: string; label: string }>
  >([]);
  const [matrix, setMatrix] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .permissions(gameId)
      .then((p) => {
        setCatalogue(p.catalogue);
        setMatrix(p.matrix);
      })
      .catch((e: Error) => setError(e.message));
  }, [gameId]);

  async function toggle(role: string, key: string, granted: boolean) {
    setBusy(`${role}/${key}`);
    setError(null);
    try {
      const res = await api.setPermission(gameId, role, { [key]: granted });
      setMatrix(res.matrix);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Le vide se dit. Renvoyer `null` ici faisait disparaître la matrice
  // sans un mot dès que son chargement échouait — et l'erreur, rendue plus
  // bas, ne s'affichait jamais. Il restait un titre suivi de rien.
  if (catalogue.length === 0) {
    return (
      <>
        {error ? (
          <div className="error">{error}</div>
        ) : (
          <p className="muted">Chargement des permissions…</p>
        )}
      </>
    );
  }

  return (
    <>
      {error && <div className="error">{error}</div>}
      <div className="list">
        {catalogue.map((perm) => (
          <div className="item" key={perm.key} style={{ display: 'block' }}>
            <div style={{ marginBottom: 6 }}>{perm.label}</div>
            <div className="row wrap">
              {ROLES.map((role) => {
                const granted = matrix[role]?.includes(perm.key) ?? false;
                const id = `${role}/${perm.key}`;
                return (
                  <label
                    key={role}
                    className="muted"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      opacity: busy === id ? 0.5 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={granted}
                      disabled={busy !== null}
                      onChange={(e) =>
                        toggle(role, perm.key, e.target.checked)
                      }
                    />
                    {ROLE_LABELS[role]}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
