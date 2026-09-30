import { createClient } from '@supabase/supabase-js';

/**
 * La console est « un client parmi d'autres » (§2.2) : elle ne touche jamais
 * la base, tout passe par la même API que l'app mobile.
 */
// Valeurs de repli identiques à celles de l'application mobile. Elles sont
// PUBLIQUES par conception — une clé « publishable » part dans le bundle du
// navigateur, c'est son rôle. Sans ce repli, un déploiement sans variables
// d'environnement planterait au chargement au lieu d'afficher l'écran de
// connexion.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ??
  'https://rcgrwhayagadsaqnjufj.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'sb_publishable_1tA1CkejeoRzHqvXqnLgwA_nZ3eadsb';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/v1';

/**
 * Vrai quand la page est servie en HTTPS mais vise une API en HTTP clair.
 * Le navigateur bloque alors TOUS les appels — c'est le piège du site publié
 * pointant vers un serveur local, et il ressemble à une panne réseau.
 */
export const isMixedContent =
  typeof location !== 'undefined' &&
  location.protocol === 'https:' &&
  API.startsWith('http://');

export const MIXED_CONTENT_HINT =
  'Cette page est servie en HTTPS et ne peut pas appeler un serveur en ' +
  'HTTP. Exposez l’API en HTTPS (cloudflared tunnel --url ' +
  'http://localhost:3000) et reconstruisez le site avec VITE_API_BASE_URL.';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const payload = (await res.json()) as { message?: string };
      if (payload.message) message = payload.message;
    } catch {
      /* réponse sans corps JSON */
    }
    throw new ApiError(message, res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export interface Game {
  id: string;
  name: string;
  status: string;
  /** Carte préparée dont la partie est issue, pour mémoire. */
  preparedMapId?: string | null;
}

export interface GameEntry {
  game: Game;
  role: string;
  permissions: string[];
}

export interface Member {
  membershipId: string;
  pseudo: string | null;
  email: string | null;
  role: string;
  unitType: string;
  teamId: string | null;
  squadId: string | null;
  lifeStatus: string;
  isConnected: boolean;
}

export interface TeamEntry {
  id: string;
  name: string;
  color: string;
  squads: Array<{ id: string; name: string }>;
}

export interface Invite {
  id: string;
  role: string;
  /**
   * Code court à dicter (« ABCD-EFGH »). Réaffichable, contrairement au
   * jeton du QR que le serveur ne garde que haché (§7.2).
   */
  code: string;
  useCount: number;
  maxUses: number | null;
  active: boolean;
  token?: string;
  url?: string;
}

/** Fonds de carte servis par l'API. */
export const BASEMAPS = [
  { key: 'ortho_ign', label: 'Satellite' },
  { key: 'plan_ign', label: 'Plan IGN' },
  { key: 'osm', label: 'OpenStreetMap' },
  { key: 'relief', label: 'Relief' },
] as const;
export type Basemap = (typeof BASEMAPS)[number]['key'];

/** Une carte préparée : un terrain dessiné une fois, réutilisable. */
export interface PreparedMap {
  id: string;
  name: string;
  basemap: Basemap;
  centerLat: number | null;
  centerLng: number | null;
  zoom: number | null;
  objectCount: number;
  objectiveCount: number;
  updatedAt: string;
}

export interface PreparedMapDetail extends PreparedMap {
  content: { objects?: unknown[]; objectives?: unknown[] };
}

/** Un bonus arbitré par le serveur (§7.7). */
export interface PerkDefinition {
  id: string;
  type: 'drone' | 'jammer';
  radiusMeters: number;
  durationSeconds: number;
  cooldownSeconds: number;
  stockPerTeam: number | null;
  allowedRoles: string[];
}

/** Un drapeau à capturer (§7.8). */
export interface Objective {
  id: string;
  name: string;
  lat: number;
  lng: number;
  captureOrder: number | null;
  holderTeamId: string | null;
}

/** Ce qu'une invitation donnerait, sans rejoindre. */
export interface InvitePreview {
  gameName: string;
  role: string;
  teamName: string | null;
  squadName: string | null;
}

export interface MapObject {
  id: string;
  kind: string;
  lat: number;
  lng: number;
  geometry: Record<string, unknown> | null;
  properties: Record<string, unknown>;
}

export interface TrackPoint {
  t: number;
  lat: number;
  lng: number;
}

export interface ReplayUnit {
  membershipId: string;
  pseudo: string | null;
  role: string;
  unitType: string;
  teamId: string | null;
  teamColor: string | null;
  track: TrackPoint[];
}

export interface ReplayEvent {
  t: number;
  kind: 'capture' | 'marker';
  label: string;
  lat: number;
  lng: number;
  teamId?: string | null;
}

export interface Replay {
  game: { id: string; name: string; status: string };
  from: number;
  to: number;
  units: ReplayUnit[];
  events: ReplayEvent[];
}

export interface PlayerStats {
  membershipId: string;
  pseudo: string | null;
  role: string;
  unitType: string;
  teamId: string | null;
  distanceMeters: number;
  activeSeconds: number;
  captures: number;
  pointsAwarded: number;
  markersPlaced: number;
}

export interface GameStats {
  game: { id: string; name: string; status: string };
  players: PlayerStats[];
  teams: Array<{
    teamId: string;
    name: string;
    color: string;
    score: number;
    captures: number;
    distanceMeters: number;
  }>;
}

export const api = {
  games: () => request<GameEntry[]>('GET', '/games'),
  createGame: (name: string) => request<Game>('POST', '/games', { name }),
  members: (gameId: string) =>
    request<Member[]>('GET', `/games/${gameId}/members`),
  teams: (gameId: string) =>
    request<TeamEntry[]>('GET', `/games/${gameId}/teams`),
  createTeam: (gameId: string, name: string, color: string) =>
    request<unknown>('POST', `/games/${gameId}/teams`, { name, color }),
  createSquad: (gameId: string, teamId: string, name: string) =>
    request<unknown>('POST', `/games/${gameId}/squads`, { teamId, name }),
  assign: (
    gameId: string,
    membershipId: string,
    assignment: { teamId?: string | null; squadId?: string | null },
  ) =>
    request<unknown>(
      'PATCH',
      `/games/${gameId}/members/${membershipId}/assignment`,
      assignment,
    ),
  invites: (gameId: string) =>
    request<Invite[]>('GET', `/games/${gameId}/invites`),
  createInvite: (
    gameId: string,
    role: string,
    teamId?: string,
    squadId?: string,
  ) =>
    request<Invite>('POST', `/games/${gameId}/invites`, {
      role,
      ...(teamId ? { teamId } : {}),
      ...(squadId ? { squadId } : {}),
    }),
  /** Aperçu avant de s'engager : partie, grade, camp. */
  previewInvite: (code: string) =>
    request<InvitePreview>('POST', '/join/preview', { token: code.trim() }),
  joinByCode: (code: string) =>
    request<{ gameId: string; gameName: string; role: string }>(
      'POST',
      '/join',
      { token: code.trim() },
    ),
  revokeInvite: (gameId: string, inviteId: string) =>
    request<unknown>('DELETE', `/games/${gameId}/invites/${inviteId}`),
  /** Drapeaux de la partie (§7.8). */
  objectives: (gameId: string) =>
    request<Objective[]>('GET', `/games/${gameId}/objectives`),
  createObjective: (
    gameId: string,
    body: { name: string; lat: number; lng: number; captureOrder?: number },
  ) => request<Objective>('POST', `/games/${gameId}/objectives`, body),
  // --- Cartes préparées ---------------------------------------------
  maps: () => request<PreparedMap[]>('GET', '/maps'),
  createMap: (name: string, basemap: Basemap) =>
    request<PreparedMapDetail>('POST', '/maps', { name, basemap }),
  map: (mapId: string) => request<PreparedMapDetail>('GET', `/maps/${mapId}`),
  updateMap: (
    mapId: string,
    body: Partial<{
      name: string;
      basemap: Basemap;
      content: unknown;
      centerLat: number;
      centerLng: number;
      zoom: number;
    }>,
  ) => request<PreparedMapDetail>('PATCH', `/maps/${mapId}`, body),
  deleteMap: (mapId: string) => request<unknown>('DELETE', `/maps/${mapId}`),
  /** Recopie une carte dans une partie ; `null` detache. */
  attachMap: (gameId: string, mapId: string | null) =>
    request<{ objects: number; objectives: number } | null>(
      'POST',
      `/games/${gameId}/map`,
      { mapId },
    ),

  // --- Bonus ---------------------------------------------------------
  perks: (gameId: string) =>
    request<PerkDefinition[]>('GET', `/games/${gameId}/perks`),
  createPerk: (
    gameId: string,
    body: {
      type: 'drone' | 'jammer';
      radiusMeters?: number;
      durationSeconds?: number;
      cooldownSeconds?: number;
      stockPerTeam?: number;
    },
  ) => request<PerkDefinition>('POST', `/games/${gameId}/perks`, body),

  permissions: (gameId: string) =>
    request<{
      catalogue: Array<{ key: string; label: string }>;
      matrix: Record<string, string[]>;
      myRole: string;
      mine: string[];
    }>('GET', `/games/${gameId}/permissions`),
  setPermission: (
    gameId: string,
    role: string,
    changes: Record<string, boolean>,
  ) =>
    request<{ matrix: Record<string, string[]> }>(
      'PATCH',
      `/games/${gameId}/permissions`,
      { role, changes },
    ),
  sync: (gameId: string) =>
    request<{ serverTime: string; objects: MapObject[] }>(
      'GET',
      `/games/${gameId}/sync`,
    ),
  pushObjects: (gameId: string, objects: unknown[]) =>
    request<MapObject[]>('POST', `/games/${gameId}/map-objects/batch`, {
      objects,
    }),
  replay: (gameId: string) =>
    request<Replay>('GET', `/games/${gameId}/replay`),
  stats: (gameId: string) => request<GameStats>('GET', `/games/${gameId}/stats`),
};

export const ROLE_LABELS: Record<string, string> = {
  commandant: 'Commandant',
  capitaine: 'Capitaine',
  chef_escouade: 'Chef d’escouade',
  joueur: 'Joueur',
};
