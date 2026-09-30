import { useState } from 'react';

import { api, ROLE_LABELS, type Member, type TeamEntry } from './api';

/**
 * Onglet « Équipes » : les factions et leurs couleurs.
 *
 * Bleu et rouge d'abord, parce que c'est la convention OTAN — bleu ami,
 * rouge hostile — et que la carte du terrain s'appuie dessus. Les autres
 * couleurs servent aux parties à plus de deux camps.
 */
const COULEURS_FACTION = [
  { hex: '#2196F3', label: 'Bleu', otan: true },
  { hex: '#F44336', label: 'Rouge', otan: true },
  { hex: '#4CAF50', label: 'Vert', otan: false },
  { hex: '#FFC107', label: 'Jaune', otan: false },
  { hex: '#9C27B0', label: 'Violet', otan: false },
  { hex: '#FF9800', label: 'Orange', otan: false },
  { hex: '#795548', label: 'Marron', otan: false },
  { hex: '#607D8B', label: 'Gris', otan: false },
];

export function TeamsPanel({
  gameId,
  teams,
  members,
  canManage,
  onChange,
}: {
  gameId: string;
  teams: TeamEntry[];
  members: Member[];
  canManage: boolean;
  onChange: () => void;
}) {
  const [nom, setNom] = useState('');
  const [couleur, setCouleur] = useState(COULEURS_FACTION[0].hex);
  const [error, setError] = useState<string | null>(null);

  // La couleur déjà prise ne se repropose pas : deux camps de la même
  // couleur rendraient la carte illisible.
  const prises = new Set(teams.map((t) => t.color?.toUpperCase()));

  async function creer() {
    const propre = nom.trim();
    if (propre.length < 1) return;
    setError(null);
    try {
      await api.createTeam(gameId, propre, couleur);
      setNom('');
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function ajouterEscouade(teamId: string) {
    const n = prompt('Nom de l’escouade', 'Alpha');
    if (n == null || !n.trim()) return;
    try {
      await api.createSquad(gameId, teamId, n.trim());
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="panel">
      <h2>Équipes</h2>
      <p className="muted">
        Bleu et rouge suivent la convention OTAN : bleu ami, rouge hostile.
        C’est sur elle que s’appuie la symbologie de la carte.
      </p>
      {error && <div className="error">{error}</div>}

      <div className="row" style={{ marginTop: 12 }}>
        <input
          className="grow"
          value={nom}
          placeholder="Nom de la faction"
          onChange={(e) => setNom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && creer()}
        />
        <button
          className="primary"
          onClick={creer}
          disabled={!nom.trim() || !canManage}
        >
          + Faction
        </button>
      </div>
      <div className="swatches" style={{ marginTop: 8 }}>
        {COULEURS_FACTION.map((c) => (
          <button
            key={c.hex}
            title={prises.has(c.hex) ? `${c.label} — déjà pris` : c.label}
            disabled={prises.has(c.hex)}
            className={`swatch ${couleur === c.hex ? 'selected' : ''}`}
            style={{ background: c.hex, opacity: prises.has(c.hex) ? 0.3 : 1 }}
            onClick={() => setCouleur(c.hex)}
          />
        ))}
      </div>

      <div className="list" style={{ marginTop: 16 }}>
        {teams.length === 0 && (
          <p className="muted">
            Aucune faction. Sans camp, personne ne peut être affecté ni
            recevoir d’invitation ciblée.
          </p>
        )}
        {teams.map((t) => (
          <div className="item" key={t.id}>
            <span
              className="swatch-dot"
              style={{ background: t.color, width: 16, height: 16 }}
            />
            <span className="grow">
              {t.name}
              <br />
              <span className="muted">
                {t.squads.length === 0
                  ? 'aucune unité'
                  : t.squads.map((s) => s.name).join(' · ')}
              </span>
            </span>
            {canManage && (
              <button onClick={() => ajouterEscouade(t.id)}>+ unité</button>
            )}
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 24 }}>Membres ({members.length})</h2>
      <div className="list">
        {members.length === 0 && (
          <p className="muted">Personne n’a encore rejoint.</p>
        )}
        {members.map((m) => (
          <div className="item" key={m.membershipId}>
            <span className="grow">
              {m.pseudo ?? m.email?.split('@')[0] ?? 'Joueur'}
              <br />
              <span className="muted">
                {ROLE_LABELS[m.role] ?? m.role}
                {m.squadId
                  ? ` · ${nomUnite(teams, m.squadId)}`
                  : m.teamId
                    ? ` · ${nomCamp(teams, m.teamId)}`
                    : ' · non affecté'}
              </span>
            </span>
            {canManage && (
              <select
                value={m.squadId ?? m.teamId ?? ''}
                onChange={async (e) => {
                  const valeur = e.target.value;
                  const estUnite = teams.some((t) =>
                    t.squads.some((s) => s.id === valeur),
                  );
                  await api.assign(gameId, m.membershipId, {
                    teamId: estUnite ? null : valeur || null,
                    squadId: estUnite ? valeur : null,
                  });
                  onChange();
                }}
              >
                <option value="">—</option>
                {teams.map((t) => (
                  <optgroup key={t.id} label={t.name}>
                    <option value={t.id}>{t.name} (sans unité)</option>
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
    </div>
  );
}

const nomCamp = (teams: TeamEntry[], id: string) =>
  teams.find((t) => t.id === id)?.name ?? 'camp';

const nomUnite = (teams: TeamEntry[], id: string) =>
  teams.flatMap((t) => t.squads).find((s) => s.id === id)?.name ?? 'unité';
