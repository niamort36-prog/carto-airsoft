import { api, type Basemap, type MapObject, type Objective } from './api';

/**
 * Ce que l'éditeur de carte sait faire, indépendamment de ce qu'il édite.
 *
 * Deux choses très différentes se dessinent de la même façon : une CARTE
 * PRÉPARÉE, qui est un modèle appartenant à son auteur, et la carte d'une
 * PARTIE en cours, qui est arbitrée par le serveur et vue par les joueurs.
 * Le geste est identique, la destination non — d'où cette interface plutôt
 * que deux éditeurs qui divergeraient.
 */
export interface MapStore {
  /** Ce qui s'affiche déjà. */
  load(): Promise<{ objects: MapObject[]; objectives: Objective[] }>;
  addObject(o: DraftObject): Promise<void>;
  addObjective(o: { name: string; lat: number; lng: number }): Promise<void>;
  /** Fond de carte courant, et comment le changer quand c'est possible. */
  basemap: Basemap;
  setBasemap?(b: Basemap): Promise<void>;
  /** Mémorise la vue, pour rouvrir la carte là où on l'a laissée. */
  rememberView?(view: {
    centerLat: number;
    centerLng: number;
    zoom: number;
  }): void;
}

export interface DraftObject {
  kind: 'marker' | 'line' | 'zone';
  lat: number;
  lng: number;
  geometry?: GeoJSON.Geometry;
  properties: Record<string, unknown>;
}

/**
 * La carte d'une partie : chaque geste part tout de suite au serveur, qui
 * la diffuse aux joueurs. Le fond n'y est pas modifiable — chacun choisit
 * le sien sur son téléphone.
 */
export function gameStore(gameId: string, basemap: Basemap): MapStore {
  return {
    basemap,
    async load() {
      const [res, flags] = await Promise.all([
        api.sync(gameId),
        api.objectives(gameId).catch(() => [] as Objective[]),
      ]);
      return {
        objects: res.objects.filter(
          (o) => !('deletedAt' in o && o.deletedAt),
        ),
        objectives: flags,
      };
    },
    async addObject(o) {
      await api.pushObjects(gameId, [
        {
          id: crypto.randomUUID(),
          kind: o.kind,
          markerType: o.kind === 'marker' ? 'waypoint' : 'poi',
          lat: o.lat,
          lng: o.lng,
          ...(o.kind === 'marker' ? {} : { geometry: o.geometry }),
          properties: o.properties,
          createdAt: new Date().toISOString(),
        },
      ]);
    },
    async addObjective(o) {
      await api.createObjective(gameId, o);
    },
  };
}

/**
 * Une carte préparée : tout vit dans un bloc JSON qu'on réécrit en entier.
 *
 * Réécrire plutôt qu'ajouter évite d'inventer une API d'édition fine pour
 * un objet que personne ne modifie à plusieurs en même temps — une carte
 * se dessine seul, avant la partie.
 */
export function preparedMapStore(
  mapId: string,
  basemap: Basemap,
  onChange: () => void,
): MapStore {
  let objets: DraftObject[] = [];
  let drapeaux: Array<{ name: string; lat: number; lng: number }> = [];

  const sauver = async () => {
    await api.updateMap(mapId, {
      content: { objects: objets, objectives: drapeaux },
    });
    onChange();
  };

  return {
    basemap,
    async load() {
      const carte = await api.map(mapId);
      objets = (carte.content.objects ?? []) as DraftObject[];
      drapeaux = (carte.content.objectives ?? []) as typeof drapeaux;
      return {
        // L'éditeur attend la forme d'un objet de partie ; on la fabrique.
        objects: objets.map((o, i) => ({
          id: `local-${i}`,
          kind: o.kind,
          lat: o.lat,
          lng: o.lng,
          geometry: o.geometry ?? null,
          properties: o.properties,
        })) as unknown as MapObject[],
        objectives: drapeaux.map((d, i) => ({
          id: `local-${i}`,
          name: d.name,
          lat: d.lat,
          lng: d.lng,
          captureOrder: null,
          holderTeamId: null,
        })),
      };
    },
    async addObject(o) {
      objets = [...objets, o];
      await sauver();
    },
    async addObjective(o) {
      drapeaux = [...drapeaux, o];
      await sauver();
    },
    async setBasemap(b) {
      await api.updateMap(mapId, { basemap: b });
      onChange();
    },
    rememberView(view) {
      // Sans attendre : perdre ce réglage n'a aucune conséquence, et
      // bloquer la carte pour l'enregistrer en aurait une.
      void api.updateMap(mapId, view).catch(() => {});
    },
  };
}
