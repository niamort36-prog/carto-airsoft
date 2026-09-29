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
  const [teamId, setTeamId] = useState('');
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
        teamId || undefined,
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
      <h2>Invitations</h2>
      <p className="muted">
        Un code par camp et par grade : chacun rejoint du bon côté sans que
        personne ait à l’affecter ensuite.
      </p>
      {error && <div className="error">{error}</div>}
      <div className="list">
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="capitaine">Capitaine</option>
          <option value="chef_escouade">Chef d’escouade</option>
          <option value="joueur">Joueur</option>
        </select>
        <select
          value={teamId}
          onChange={(e) => {
            setTeamId(e.target.value);
            setSquadId('');
          }}
        >
          <option value="">Sans camp</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={squadId} onChange={(e) => setSquadId(e.target.value)}>
          <option value="">Sans escouade</option>
          {squads.map((s) => (
            <option key={s.id} value={s.id}>
              {s.team} · {s.name}
            </option>
          ))}
        </select>
        <button className="primary" onClick={create}>
          Générer
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
              {' — '}
              <code className="code">{i.code}</code>
              <br />
              <span className="muted">
                {i.active ? 'active' : 'inactive'} · {i.useCount} entrée(s)
              </span>
            </span>
            <button
              onClick={() => navigator.clipboard?.writeText(i.code)}
              title="Copier le code"
            >
              Copier
            </button>
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
          <p style={{ marginTop: 12, textAlign: 'center' }}>
            ou code à dicter :{' '}
            <code className="code code-big">{shown.code}</code>
          </p>
          <p className="muted" style={{ maxWidth: 280, marginTop: 12 }}>
            Le QR ne sera plus affichable ensuite : le serveur n’en garde
            qu’une empreinte. Le code, lui, reste lisible dans la liste.
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
