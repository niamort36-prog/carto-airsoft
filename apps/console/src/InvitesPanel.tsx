import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api, ROLE_LABELS, type Invite, type TeamEntry } from './api';

/**
 * Génération des QR imprimables (§8) : le grade est écrit sous le code, mais
 * le code lui-même reste opaque — c'est le serveur qui attribue le grade.
 */
export function InvitesPanel({
  gameId,
  teams,
}: {
  gameId: string;
  teams: TeamEntry[];
}) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [role, setRole] = useState('joueur');
  const [squadId, setSquadId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Invite | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const reload = () =>
    api
      .invites(gameId)
      .then(setInvites)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    reload();
  }, [gameId]);

  useEffect(() => {
    const payload = shown?.url ?? shown?.token;
    if (payload && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, payload, { width: 260, margin: 1 });
    }
  }, [shown]);

  async function create() {
    setError(null);
    try {
      const invite = await api.createInvite(
        gameId,
        role,
        squadId || undefined,
      );
      setShown(invite);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const squads = teams.flatMap((t) =>
    t.squads.map((s) => ({ ...s, team: t.name })),
  );

  return (
    <>
      <h2>Invitations QR</h2>
      {error && <div className="error">{error}</div>}
      <div className="list">
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="capitaine">Capitaine</option>
          <option value="chef_escouade">Chef d’escouade</option>
          <option value="joueur">Joueur</option>
        </select>
        <select value={squadId} onChange={(e) => setSquadId(e.target.value)}>
          <option value="">Sans affectation</option>
          {squads.map((s) => (
            <option key={s.id} value={s.id}>
              {s.team} · {s.name}
            </option>
          ))}
        </select>
        <button className="primary" onClick={create}>
          Générer un QR
        </button>
      </div>

      <div className="list" style={{ marginTop: 12 }}>
        {invites.length === 0 && (
          <p className="muted">Aucune invitation générée.</p>
        )}
        {invites.map((i) => (
          <div className="item" key={i.id}>
            <span className="grow">
              {ROLE_LABELS[i.role] ?? i.role}
              <br />
              <span className="muted">
                {i.active ? 'active' : 'inactive'} · {i.useCount} scan(s)
              </span>
            </span>
            {i.active && (
              <button
                className="danger"
                onClick={async () => {
                  await api.revokeInvite(gameId, i.id);
                  reload();
                }}
              >
                Révoquer
              </button>
            )}
          </div>
        ))}
      </div>

      {shown && (
        <dialog open>
          <h1>QR {ROLE_LABELS[shown.role] ?? shown.role}</h1>
          <div className="qr-print">
            <canvas ref={canvasRef} />
            <strong>
              {(ROLE_LABELS[shown.role] ?? shown.role).toUpperCase()}
            </strong>
          </div>
          <p className="muted" style={{ maxWidth: 280, marginTop: 12 }}>
            Ce QR ne sera plus affichable ensuite : le serveur n’en garde
            qu’une empreinte.
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <button onClick={() => window.print()}>Imprimer</button>
            <button className="primary" onClick={() => setShown(null)}>
              Fermer
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
