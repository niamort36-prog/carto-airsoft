import { createClient } from '@supabase/supabase-js';

/**
 * La console est « un client parmi d'autres » (§2.2) : elle ne touche jamais
 * la base, tout passe par la même API que l'app mobile.
 */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/v1';

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
  useCount: number;
  maxUses: number | null;
  active: boolean;
  token?: string;
  url?: string;
}

export interface MapObject {
  id: string;
  kind: string;
  lat: number;
  lng: number;
  geometry: Record<string, unknown> | null;
  properties: Record<string, unknown>;
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
  createInvite: (gameId: string, role: string, squadId?: string) =>
    request<Invite>('POST', `/games/${gameId}/invites`, {
      role,
      ...(squadId ? { squadId } : {}),
    }),
  revokeInvite: (gameId: string, inviteId: string) =>
    request<unknown>('DELETE', `/games/${gameId}/invites/${inviteId}`),
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
};

export const ROLE_LABELS: Record<string, string> = {
  commandant: 'Commandant',
  capitaine: 'Capitaine',
  chef_escouade: 'Chef d’escouade',
  joueur: 'Joueur',
};
