import { useEffect, useMemo, useState } from 'react';

import { api, BASEMAPS, type PreparedMap } from './api';
import { MapEditor } from './MapEditor';
import { preparedMapStore } from './mapStore';

/**
 * Onglet « Cartes » : la bibliothèque de terrains.
 *
 * Une carte se dessine une fois et sert à toutes les parties jouées au même
 * endroit. Elle appartient à son auteur et survit aux parties qu'elle a
 * servi à monter.
 */
export function MapsPanel() {
  const [cartes, setCartes] = useState<PreparedMap[]>([]);
  const [ouverte, setOuverte] = useState<PreparedMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recharger = () =>
    api
      .maps()
      .then((liste) => {
        setCartes(liste);
        // Garde à jour la carte ouverte (compteurs, fond).
        setOuverte((o) => (o ? (liste.find((m) => m.id === o.id) ?? null) : o));
      })
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void recharger();
  }, []);

  async function creer() {
    const nom = prompt('Nom de la carte', 'Nouveau terrain');
    if (nom == null || !nom.trim()) return;
    setError(null);
    try {
      const carte = await api.createMap(nom.trim(), 'ortho_ign');
      await recharger();
      setOuverte(carte);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function supprimer(carte: PreparedMap) {
    if (
      !confirm(
        `Supprimer « ${carte.name} » ? Les parties déjà montées avec elle ` +
          'gardent leur contenu — il avait été recopié.',
      )
    ) {
      return;
    }
    try {
      await api.deleteMap(carte.id);
      if (ouverte?.id === carte.id) setOuverte(null);
      await recharger();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Un store par carte ouverte : le recréer à chaque rendu relancerait le
  // chargement en boucle.
  const store = useMemo(
    () =>
      ouverte
        ? preparedMapStore(ouverte.id, ouverte.basemap, () => void recharger())
        : null,
    [ouverte?.id, ouverte?.basemap],
  );

  if (ouverte && store) {
    return (
      <div className="editor">
        <div className="row editor-head">
          <button onClick={() => setOuverte(null)}>← Mes cartes</button>
          <strong className="grow">{ouverte.name}</strong>
          <span className="muted">
            {ouverte.objectCount} dessin(s) · {ouverte.objectiveCount} drapeau(x)
          </span>
        </div>
        <MapEditor store={store} />
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="row">
        <h2 className="grow">Mes cartes</h2>
        <button className="primary" onClick={creer}>
          + Nouvelle carte
        </button>
      </div>
      <p className="muted">
        Un terrain se dessine une fois. L’associer à une partie y recopie ses
        dessins et ses drapeaux — ce qui se passe en partie ne remonte jamais
        dans la carte.
      </p>
      {error && <div className="error">{error}</div>}

      <div className="list" style={{ marginTop: 12 }}>
        {cartes.length === 0 && (
          <p className="muted">
            Aucune carte. Créez-en une, dessinez le terrain, puis associez-la
            à vos parties.
          </p>
        )}
        {cartes.map((c) => (
          <div className="item" key={c.id}>
            <span className="grow">
              {c.name}
              <br />
              <span className="muted">
                {BASEMAPS.find((b) => b.key === c.basemap)?.label ?? c.basemap}
                {' · '}
                {c.objectCount} dessin(s) · {c.objectiveCount} drapeau(x)
              </span>
            </span>
            <button onClick={() => setOuverte(c)}>Ouvrir</button>
            <button className="danger" onClick={() => supprimer(c)}>
              Supprimer
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Choix d'une carte pour une partie — utilisé par l'onglet « Carte ». */
export function MapPicker({
  gameId,
  currentMapId,
  onAttached,
}: {
  gameId: string;
  currentMapId: string | null;
  onAttached: () => void;
}) {
  const [cartes, setCartes] = useState<PreparedMap[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.maps().then(setCartes).catch((e: Error) => setError(e.message));
  }, []);

  async function associer(carte: PreparedMap) {
    if (
      !confirm(
        `Recopier « ${carte.name} » dans cette partie ? ` +
          `${carte.objectCount} dessin(s) et ${carte.objectiveCount} ` +
          'drapeau(x) s’ajouteront à ce qui s’y trouve déjà.',
      )
    ) {
      return;
    }
    setError(null);
    try {
      const res = await api.attachMap(gameId, carte.id);
      setMessage(
        `${res?.objects ?? 0} dessin(s) et ${res?.objectives ?? 0} ` +
          'drapeau(x) recopiés.',
      );
      onAttached();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <h3>Partir d’une carte préparée</h3>
      <p className="muted">
        Son contenu est <strong>recopié</strong> dans la partie. La modifier
        ensuite ne changera pas cette partie — elle ne doit pas bouger sous les
        pieds de ceux qui la jouent.
      </p>
      {error && <div className="error">{error}</div>}
      {message && <div className="item">{message}</div>}
      <div className="list" style={{ marginTop: 8 }}>
        {cartes.length === 0 && (
          <p className="muted">
            Aucune carte préparée. L’onglet « Cartes » sert à en créer.
          </p>
        )}
        {cartes.map((c) => (
          <div className="item" key={c.id}>
            <span className="grow">
              {c.name}
              <br />
              <span className="muted">
                {c.objectCount} dessin(s) · {c.objectiveCount} drapeau(x)
                {c.id === currentMapId ? ' · déjà utilisée ici' : ''}
              </span>
            </span>
            <button onClick={() => associer(c)}>Recopier</button>
          </div>
        ))}
      </div>
    </>
  );
}
