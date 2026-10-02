import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

import { api, ROLE_LABELS, type Invite, type TeamEntry } from './api';

/**
 * Onglet « Partage » : les QR et les codes qui font entrer les joueurs.
 *
 * Deux façons d'entrer, et les deux comptent : le QR qu'on scanne sur une
 * feuille imprimée, et le code court qu'on dicte à la voix sur un parking.
 * Le grade est écrit en clair sous le QR pour qu'on sache lequel
 * distribuer ; le code encodé, lui, reste opaque — c'est le serveur qui
 * attribue le grade au scan.
 */

/**
 * Copie un texte, avec un repli.
 *
 * `navigator.clipboard` n'existe PAS hors contexte sécurisé : servie en
 * `http://192.168.x.x`, la console n'y a pas droit. Le bouton ne faisait
 * alors rien, sans un mot — ce qui ressemble exactement à une panne.
 */
async function copier(
  texte: string,
  signaler: (m: string) => void,
): Promise<void> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(texte);
      return;
    }
    // Repli universel : une zone de texte hors écran, sélectionnée puis
    // copiée par la commande historique du navigateur.
    const champ = document.createElement('textarea');
    champ.value = texte;
    champ.style.position = 'fixed';
    champ.style.opacity = '0';
    document.body.appendChild(champ);
    champ.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(champ);
    if (!ok) throw new Error('copie refusée');
  } catch {
    signaler(`Copie impossible — le code est : ${texte}`);
  }
}

/** Formats d'impression, et ce qu'on peut y mettre. */
const FORMATS = [
  { key: 'A3', label: 'A3', mm: [297, 420] as const },
  { key: 'A4', label: 'A4', mm: [210, 297] as const },
  { key: 'A5', label: 'A5', mm: [148, 210] as const },
];

/** Combien de QR sur une page. */
const DISPOSITIONS = [
  { key: 1, label: '1 par page' },
  { key: 2, label: '2 par page' },
  { key: 4, label: '4 par page' },
  { key: 6, label: '6 par page' },
  { key: 9, label: '9 par page' },
];

export function SharePanel({
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

  // Impression : ce qu'on sort, et sur quoi.
  const [format, setFormat] = useState('A4');
  const [parPage, setParPage] = useState(2);
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [apercu, setApercu] = useState(false);

  const recharger = () =>
    api
      .invites(gameId)
      .then(setInvites)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void recharger();
  }, [gameId]);

  async function creer() {
    setError(null);
    try {
      await api.createInvite(
        gameId,
        role,
        teamId || undefined,
        squadId || undefined,
      );
      await recharger();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const squads = teams.flatMap((t) =>
    t.squads.map((s) => ({ ...s, team: t.name })),
  );
  const actives = invites.filter((i) => i.active);
  const aImprimer = actives.filter((i) => choisis.has(i.id));

  const basculer = (id: string) =>
    setChoisis((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="panel">
      <h2>Partage</h2>
      <p className="muted">
        Un code par camp et par grade : chacun rejoint du bon côté sans que
        personne ait à l’affecter ensuite.
      </p>
      {error && <div className="error">{error}</div>}

      <div className="row" style={{ marginTop: 12 }}>
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
          <option value="">Sans unité</option>
          {squads.map((s) => (
            <option key={s.id} value={s.id}>
              {s.team} · {s.name}
            </option>
          ))}
        </select>
        <button className="primary" onClick={creer}>
          Générer
        </button>
      </div>

      <div className="list" style={{ marginTop: 12 }}>
        {invites.length === 0 && (
          <p className="muted">Aucune invitation générée.</p>
        )}
        {invites.map((i) => (
          <div className="item" key={i.id}>
            {i.active && (
              <input
                type="checkbox"
                checked={choisis.has(i.id)}
                onChange={() => basculer(i.id)}
                title="À imprimer"
              />
            )}
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
              onClick={() => void copier(i.code, setError)}
              title="Copier le code"
            >
              Copier
            </button>
            {i.active && (
              <button
                className="danger"
                onClick={async () => {
                  setError(null);
                  try {
                    await api.revokeInvite(gameId, i.id);
                    await recharger();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Révoquer
              </button>
            )}
          </div>
        ))}
      </div>

      {actives.length > 0 && (
        <div className="row" style={{ marginTop: 16 }}>
          <strong>Imprimer</strong>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            {FORMATS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            value={parPage}
            onChange={(e) => setParPage(Number(e.target.value))}
          >
            {DISPOSITIONS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setChoisis(new Set(actives.map((i) => i.id)))}
          >
            Tout cocher
          </button>
          <button
            className="primary"
            disabled={aImprimer.length === 0}
            onClick={() => setApercu(true)}
          >
            Aperçu ({aImprimer.length})
          </button>
        </div>
      )}

      {apercu && (
        <PlancheImpression
          invites={aImprimer}
          format={format}
          parPage={parPage}
          onClose={() => setApercu(false)}
        />
      )}
    </div>
  );
}

/**
 * La planche à imprimer.
 *
 * Elle occupe tout l'écran et masque le reste à l'impression : une feuille
 * qui sortirait avec la barre latérale de la console serait inutilisable.
 */
function PlancheImpression({
  invites,
  format,
  parPage,
  onClose,
}: {
  invites: Invite[];
  format: string;
  parPage: number;
  onClose: () => void;
}) {
  const conteneur = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Une feuille de style dédiée : `@page` fixe le format papier, que le
    // navigateur ne devine pas.
    const f = FORMATS.find((x) => x.key === format)!;
    const style = document.createElement('style');
    style.id = 'impression-qr';
    style.textContent = `
      @page { size: ${f.mm[0]}mm ${f.mm[1]}mm; margin: 8mm; }
      @media print {
        body > *:not(.planche) { display: none !important; }
        .planche { position: static !important; overflow: visible !important; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.getElementById('impression-qr')?.remove();
    };
  }, [format]);

  useEffect(() => {
    // Un canvas par invitation, dessiné après le rendu.
    invites.forEach((i) => {
      const canvas = conteneur.current?.querySelector<HTMLCanvasElement>(
        `canvas[data-id="${i.id}"]`,
      );
      if (canvas) {
        // Le QR encode le CODE : c'est lui qui se relit plus tard, là où le
        // jeton du QR d'origine n'existe qu'une fois (§7.2).
        void QRCode.toCanvas(canvas, i.code, { width: 320, margin: 1 });
      }
    });
  }, [invites, parPage, format]);

  // Deux colonnes dès qu'il y a plus d'un QR : au-delà, on empile.
  const colonnes = parPage === 1 ? 1 : parPage <= 4 ? 2 : 3;

  return (
    <div className="planche" ref={conteneur}>
      <div className="planche-barre no-print">
        <span className="grow">
          {invites.length} QR · {format} · {parPage} par page
        </span>
        <button className="primary" onClick={() => window.print()}>
          Imprimer
        </button>
        <button onClick={onClose}>Fermer</button>
      </div>
      <div
        className="planche-grille"
        style={{ gridTemplateColumns: `repeat(${colonnes}, 1fr)` }}
      >
        {invites.map((i, n) => (
          <figure
            key={i.id}
            className="planche-case"
            // Saut de page quand la feuille est pleine.
            style={{
              breakAfter:
                (n + 1) % parPage === 0 && n < invites.length - 1
                  ? 'page'
                  : 'auto',
            }}
          >
            <canvas data-id={i.id} />
            <figcaption>
              <strong>
                {(ROLE_LABELS[i.role] ?? i.role).toUpperCase()}
              </strong>
              <span className="code">{i.code}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
