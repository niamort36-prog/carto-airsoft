/**
 * Matrice de permissions (§5). Le principe : les rôles ne sont PAS codés en
 * dur dans la logique métier — chaque contrôle interroge une clé de
 * permission, et la correspondance rôle → permissions est une donnée,
 * surchargeable par partie sans redéploiement.
 */

/** Clés canoniques. Ajouter une capacité = ajouter une clé ici. */
export const PERMISSIONS = {
  GAME_MANAGE: 'game:manage',
  MEMBERS_PROMOTE: 'members:promote',
  MEMBERS_KICK: 'members:kick',
  MEMBERS_BADGE: 'members:badge',
  INVITES_MANAGE: 'invites:manage',
  MARKERS_DELETE_ANY: 'markers:delete_any',
  CHAT_COMMAND: 'chat:command',
  TEAMS_MANAGE: 'teams:manage',
  SQUADS_MANAGE: 'squads:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/** Libellés français, pour la console web et l'app. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  [PERMISSIONS.GAME_MANAGE]: 'Gérer la partie',
  [PERMISSIONS.MEMBERS_PROMOTE]: 'Nommer les grades',
  [PERMISSIONS.MEMBERS_KICK]: 'Exclure un membre',
  [PERMISSIONS.MEMBERS_BADGE]: 'Attribuer les insignes',
  [PERMISSIONS.INVITES_MANAGE]: 'Gérer les invitations QR',
  [PERMISSIONS.MARKERS_DELETE_ANY]: 'Supprimer tout marqueur',
  [PERMISSIONS.CHAT_COMMAND]: 'Accès au canal commandement',
  [PERMISSIONS.TEAMS_MANAGE]: 'Gérer les camps',
  [PERMISSIONS.SQUADS_MANAGE]: 'Former les escouades et affecter les hommes',
};

/**
 * Matrice par défaut. Un chef d'escouade commande ses hommes (insignes) sans
 * toucher à l'organisation de la partie ; le capitaine relaie le commandant
 * sur le terrain ; le commandant décide de tout.
 *
 * Former une escouade et découper les camps sont deux choses différentes :
 * un capitaine compose ses groupes et prend des hommes sous ses ordres, mais
 * ne crée pas de camp — cela reviendrait à redécouper la partie.
 */
export const DEFAULT_MATRIX: Record<string, Permission[]> = {
  commandant: [...ALL_PERMISSIONS],
  capitaine: [
    PERMISSIONS.MEMBERS_BADGE,
    PERMISSIONS.INVITES_MANAGE,
    PERMISSIONS.CHAT_COMMAND,
    PERMISSIONS.MARKERS_DELETE_ANY,
    PERMISSIONS.SQUADS_MANAGE,
  ],
  chef_escouade: [PERMISSIONS.MEMBERS_BADGE, PERMISSIONS.CHAT_COMMAND],
  joueur: [],
};

/** Surcharges enregistrées dans `games.settings.permissions`. */
export type PermissionOverrides = Record<string, Partial<Record<Permission, boolean>>>;

/** Matrice effective d'un rôle = défauts, corrigés par les surcharges. */
export function effectivePermissions(
  role: string,
  overrides?: PermissionOverrides,
): Permission[] {
  const base = new Set<Permission>(DEFAULT_MATRIX[role] ?? []);
  for (const [key, granted] of Object.entries(overrides?.[role] ?? {})) {
    if (!ALL_PERMISSIONS.includes(key as Permission)) continue;
    if (granted) base.add(key as Permission);
    else base.delete(key as Permission);
  }
  return ALL_PERMISSIONS.filter((p) => base.has(p));
}

export function hasPermission(
  role: string,
  permission: Permission,
  overrides?: PermissionOverrides,
): boolean {
  return effectivePermissions(role, overrides).includes(permission);
}

/** Matrice complète de la partie, pour l'affichage et la configuration. */
export function fullMatrix(
  overrides?: PermissionOverrides,
): Record<string, Permission[]> {
  return Object.fromEntries(
    Object.keys(DEFAULT_MATRIX).map((role) => [
      role,
      effectivePermissions(role, overrides),
    ]),
  );
}
