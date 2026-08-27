import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  boolean,
  geometry,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Schéma PostgreSQL — source de vérité du jeu (§2.5).
 * Les tables des phases suivantes (games, memberships, map_objects…) s'ajouteront ici.
 */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Identifiant Supabase Auth (claim `sub` du JWT). L'API garde son propre `id`
  // pour rester découplée du fournisseur d'auth (remplaçable, cf. ARCHITECTURE §2).
  authProviderId: text('auth_provider_id').notNull().unique(),
  email: text('email'),
  pseudo: text('pseudo'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;

/**
 * La partie vit sur le serveur (§2.5) : aucun téléphone n'est « hôte ».
 * `settings` accueillera scoring, ressources, fréquence des positions…
 */
export const games = pgTable('games', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id),
  status: text('status', { enum: ['draft', 'live', 'finished'] })
    .notNull()
    .default('draft'),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  settings: jsonb('settings').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Game = typeof games.$inferSelect;

/**
 * Membre ≠ connecté (§2.4) : cette ligne est PERMANENTE (l'appartenance),
 * `isConnected`/`lastSeenAt` ne sont que le reflet temps réel du socket.
 * Une coupure réseau ne supprime jamais la ligne ; seuls leftAt/kickedAt
 * retirent un joueur. Rôles réduits en Phase 1 ; la matrice complète de
 * permissions arrive en Phase 3 (§5).
 */
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /**
     * Hiérarchie §5 : le créateur de la partie est commandant, il nomme les
     * capitaines et chefs d'escouade. Ce grade détermine la portée des
     * actions ; ce qu'il AUTORISE vient de la matrice de permissions.
     * L'icône d'unité est l'insigne du joueur sur la carte.
     */
    role: text('role', {
      enum: ['commandant', 'capitaine', 'chef_escouade', 'joueur'],
    })
      .notNull()
      .default('joueur'),
    unitType: text('unit_type').notNull().default('infantry'),
    /** Rattachement (§4) : camp, puis escouade au sein du camp. */
    teamId: uuid('team_id'),
    squadId: uuid('squad_id'),

    /**
     * Chaîne de commandement (§5) : à qui cet homme répond directement.
     *
     * Distinct de l'escouade à dessein — un capitaine peut avoir des hommes
     * sous ses ordres sans qu'ils portent un grade ni appartiennent à un
     * groupe. L'escouade est une unité de manœuvre, ce lien-ci est une
     * subordination.
     */
    reportsToMembershipId: uuid('reports_to_membership_id').references(
      (): AnyPgColumn => memberships.id,
    ),
    lifeStatus: text('life_status', {
      enum: ['alive', 'dead', 'medic_needed', 'support'],
    })
      .notNull()
      .default('alive'),
    lastPosition: geometry('last_position', {
      type: 'point',
      mode: 'xy',
      srid: 4326,
    }),
    lastPositionAt: timestamp('last_position_at', { withTimezone: true }),
    isConnected: boolean('is_connected').notNull().default(false),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    kickedAt: timestamp('kicked_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('memberships_game_user_unique').on(t.gameId, t.userId)],
);

export type Membership = typeof memberships.$inferSelect;

/**
 * Objets tactiques posés sur la carte (§7.6) — marqueurs en Phase 2,
 * lignes/zones ensuite. Les trois exigences offline-first :
 *  1. `id` généré CÔTÉ CLIENT → l'upsert est idempotent, aucun doublon
 *     quand l'app renvoie sa file d'attente après une coupure ;
 *  2. `createdAt` = horloge du téléphone (ordre chronologique réel),
 *     `serverReceivedAt` = horloge serveur ;
 *  3. `updatedAt` (serveur) sert de curseur de synchro delta et de
 *     résolution de conflit « le dernier qui synchronise gagne » ;
 *     `deletedAt` = tombstone, jamais de suppression physique.
 */
export const mapObjects = pgTable(
  'map_objects',
  {
    id: uuid('id').primaryKey(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    authorMembershipId: uuid('author_membership_id')
      .notNull()
      .references(() => memberships.id),
    kind: text('kind', { enum: ['marker', 'line', 'zone'] })
      .notNull()
      .default('marker'),
    markerType: text('marker_type', { enum: ['unit', 'waypoint', 'poi'] })
      .notNull()
      .default('unit'),
    /** Point du marqueur, ou premier sommet pour line/zone (référence). */
    position: geometry('position', { type: 'point', mode: 'xy', srid: 4326 })
      .notNull(),
    /** GeoJSON LineString/Polygon pour les kinds line/zone. */
    geometry: jsonb('geometry'),
    /** Libre : { icon: 'infantry_hostile', label?: '…' } — piloté par le pack d'icônes. */
    properties: jsonb('properties').notNull().default({}),
    visibility: text('visibility', { enum: ['global', 'team', 'squad'] })
      .notNull()
      .default('global'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    serverReceivedAt: timestamp('server_received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('map_objects_game_updated_idx').on(t.gameId, t.updatedAt)],
);

export type MapObject = typeof mapObjects.$inferSelect;

/**
 * Équipes (§4) : les camps qui s'affrontent. Une partie en a typiquement
 * deux, mais rien ne l'impose.
 */
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id')
    .notNull()
    .references(() => games.id),
  name: text('name').notNull(),
  /** Couleur d'affichage (#RRGGBB). */
  color: text('color').notNull().default('#4CAF50'),
  /**
   * Score (§7.8) : alimenté par les captures d'objectifs et les bonus.
   * Calculé serveur uniquement — un client ne peut pas s'attribuer de points.
   */
  score: integer('score').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Team = typeof teams.$inferSelect;

/** Escouades (§5) : subdivisions d'une équipe, menées par un chef. */
export const squads = pgTable('squads', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id),
  gameId: uuid('game_id')
    .notNull()
    .references(() => games.id),
  name: text('name').notNull(),

  /** Chef d'escouade — celui qui la commande sur le terrain. */
  leaderMembershipId: uuid('leader_membership_id').references(
    (): AnyPgColumn => memberships.id,
  ),

  /**
   * Capitaine (ou commandant) dont l'escouade dépend. Porté par l'escouade
   * et non par son chef : une escouade peut être rattachée avant d'avoir un
   * chef, et le rattachement survit au remplacement de celui-ci.
   */
  reportsToMembershipId: uuid('reports_to_membership_id').references(
    (): AnyPgColumn => memberships.id,
  ),

  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Squad = typeof squads.$inferSelect;

/**
 * Invitations par QR (§7.2). Règle impérative : le QR ne contient JAMAIS
 * le rôle en clair — il encode un jeton opaque aléatoire, et seul le
 * serveur sait à quel rôle il correspond. Le jeton lui-même n'est pas
 * stocké : seule son empreinte SHA-256 l'est (une fuite de la base ne
 * permet donc pas de rejouer une invitation).
 */
export const inviteTokens = pgTable(
  'invite_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    /** Rôle attribué au porteur du jeton — invisible du client. */
    role: text('role', {
      enum: ['commandant', 'capitaine', 'chef_escouade', 'joueur'],
    }).notNull(),
    /** Affectation portée par le QR : le scan place directement le joueur. */
    teamId: uuid('team_id'),
    squadId: uuid('squad_id'),
    tokenHash: text('token_hash').notNull().unique(),
    /** null = réutilisable sans limite (typiquement le rôle joueur). */
    maxUses: integer('max_uses'),
    useCount: integer('use_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdByMembershipId: uuid('created_by_membership_id')
      .notNull()
      .references(() => memberships.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('invite_tokens_game_idx').on(t.gameId)],
);

export type InviteToken = typeof inviteTokens.$inferSelect;

/** Journal des scans : auditable en cas de litige entre joueurs (§7.2). */
export const inviteRedemptions = pgTable('invite_redemptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  inviteTokenId: uuid('invite_token_id')
    .notNull()
    .references(() => inviteTokens.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Objectifs / drapeaux (§7.8). Conçus dans la console, joués sur le terrain :
 * un QR physique est fixé sur le drapeau, le joueur le scanne, et c'est le
 * SERVEUR qui décide si la capture est valide (grade, ordre, camp).
 */
export const objectives = pgTable(
  'objectives',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    name: text('name').notNull(),
    position: geometry('position', { type: 'point', mode: 'xy', srid: 4326 })
      .notNull(),
    /** Empreinte du jeton du QR physique — jamais le jeton lui-même. */
    tokenHash: text('token_hash').notNull().unique(),
    /**
     * Ordre de capture optionnel : un objectif de rang N n'est capturable
     * que si l'équipe détient déjà tous les rangs inférieurs.
     */
    captureOrder: integer('capture_order'),
    /** Grades habilités à capturer ; vide = tous. */
    allowedRoles: text('allowed_roles').array().notNull().default([]),
    /** Récompense libre : { points: 100 } ou toute ressource du créateur. */
    reward: jsonb('reward').notNull().default({}),
    holderTeamId: uuid('holder_team_id'),
    lastCapturedAt: timestamp('last_captured_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('objectives_game_idx').on(t.gameId)],
);

export type Objective = typeof objectives.$inferSelect;

/** Liens entre objectifs — tracés sur la carte, et prérequis d'ordre. */
export const objectiveLinks = pgTable('objective_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id')
    .notNull()
    .references(() => games.id),
  fromObjectiveId: uuid('from_objective_id')
    .notNull()
    .references(() => objectives.id),
  toObjectiveId: uuid('to_objective_id')
    .notNull()
    .references(() => objectives.id),
});

/** Historique complet des captures : auditable en cas de litige. */
export const objectiveCaptures = pgTable('objective_captures', {
  id: uuid('id').primaryKey().defaultRandom(),
  objectiveId: uuid('objective_id')
    .notNull()
    .references(() => objectives.id),
  membershipId: uuid('membership_id')
    .notNull()
    .references(() => memberships.id),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id),
  pointsAwarded: integer('points_awarded').notNull().default(0),
  capturedAt: timestamp('captured_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * QR bonus portés par des joueurs ou posés sur le terrain (§7.9) : points,
 * ressources, ou pièce jointe (image/document) délivrée par le serveur.
 */
export const bonusQrs = pgTable(
  'bonus_qrs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    reward: jsonb('reward').notNull().default({}),
    /** Contenu délivré au scan (image, document…). */
    attachmentUrl: text('attachment_url'),
    /** null = illimité. */
    maxScansTotal: integer('max_scans_total'),
    maxScansPerPlayer: integer('max_scans_per_player').default(1),
    scanCount: integer('scan_count').notNull().default(0),
    /** Joueur qui porte le QR, s'il est porté (§7.9). */
    carrierMembershipId: uuid('carrier_membership_id'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('bonus_qrs_game_idx').on(t.gameId)],
);

export type BonusQr = typeof bonusQrs.$inferSelect;

/** Journal des scans de bonus : anti-rejeu et audit. */
export const bonusScans = pgTable('bonus_scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  bonusQrId: uuid('bonus_qr_id')
    .notNull()
    .references(() => bonusQrs.id),
  membershipId: uuid('membership_id')
    .notNull()
    .references(() => memberships.id),
  pointsAwarded: integer('points_awarded').notNull().default(0),
  scannedAt: timestamp('scanned_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Perks (§7.7) — purement logiciels, calculés serveur. Le drone révèle les
 * positions hostiles d'une zone pendant un temps limité ; le brouilleur
 * annule les drones adverses. ⚠️ Brouillage du perk virtuel UNIQUEMENT :
 * jamais un brouilleur radio réel, ce serait illégal.
 */
export const perkDefinitions = pgTable('perk_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id')
    .notNull()
    .references(() => games.id),
  type: text('type', { enum: ['drone', 'jammer'] }).notNull(),
  /** Rayon (m), durée (s), cooldown (s) — réglés par l'organisateur. */
  radiusMeters: integer('radius_meters').notNull().default(300),
  durationSeconds: integer('duration_seconds').notNull().default(30),
  cooldownSeconds: integer('cooldown_seconds').notNull().default(300),
  /** Stock par équipe ; null = illimité. */
  stockPerTeam: integer('stock_per_team'),
  allowedRoles: text('allowed_roles').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PerkDefinition = typeof perkDefinitions.$inferSelect;

/** Activation d'un perk : qui, où, de quand à quand. */
export const perkInstances = pgTable(
  'perk_instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    definitionId: uuid('definition_id')
      .notNull()
      .references(() => perkDefinitions.id),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    casterMembershipId: uuid('caster_membership_id')
      .notNull()
      .references(() => memberships.id),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id),
    /** Centre de la zone visée (drone) ou du brouillage (jammer). */
    target: geometry('target', { type: 'point', mode: 'xy', srid: 4326 })
      .notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /** Renseigné quand un brouilleur adverse l'a interrompu. */
    jammedAt: timestamp('jammed_at', { withTimezone: true }),
  },
  (t) => [index('perk_instances_game_idx').on(t.gameId, t.endsAt)],
);

export type PerkInstance = typeof perkInstances.$inferSelect;

/**
 * Canaux de discussion (§7.4). Créés avec la partie :
 *  - `global`  : tous les membres ;
 *  - `command` : réservé aux gradés (cloisonnement par rang).
 * Les canaux `team`/`squad` arriveront avec les escouades (Phase 3) —
 * d'où `teamId`/`squadId` déjà prévus.
 */
export const chatChannels = pgTable('chat_channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id')
    .notNull()
    .references(() => games.id),
  scope: text('scope', { enum: ['global', 'command', 'team', 'squad'] })
    .notNull(),
  name: text('name').notNull(),
  teamId: uuid('team_id'),
  squadId: uuid('squad_id'),
  /** Rang maximal (inclus) requis — hérité, conservé pour compatibilité. */
  minRoleRank: integer('min_role_rank'),
  /**
   * Permission exigée pour lire/écrire ; null = ouvert à tous les membres.
   * Remplace le contrôle par rang : le cloisonnement devient configurable
   * comme le reste (§5).
   */
  requiredPermission: text('required_permission'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ChatChannel = typeof chatChannels.$inferSelect;

/**
 * Messages (§7.4) — mêmes règles offline-first que les objets carte (§7.6) :
 * id généré côté client (idempotence), horodatage de l'auteur, `updatedAt`
 * serveur comme curseur de synchro delta.
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => chatChannels.id),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    authorMembershipId: uuid('author_membership_id')
      .notNull()
      .references(() => memberships.id),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    serverReceivedAt: timestamp('server_received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('messages_channel_updated_idx').on(t.channelId, t.updatedAt)],
);

export type Message = typeof messages.$inferSelect;

/**
 * Clés d'API publiques (§7.11).
 *
 * Le secret n'est JAMAIS stocké : seule son empreinte SHA-256 l'est, comme
 * pour les jetons d'invitation. Il n'est affiché qu'une fois, à la création.
 * Le préfixe, lui, est en clair : il sert à retrouver la ligne sans divulguer
 * quoi que ce soit, et à reconnaître la clé dans une liste.
 *
 * Portée = ce que la clé peut faire (`scopes`) ET où (`gameIds`). Une liste
 * de parties vide vaut « toutes les parties de son propriétaire » ; la
 * vérification refait de toute façon le lien avec le propriétaire à chaque
 * appel, donc une clé ne peut jamais atteindre la partie d'un tiers.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    tokenHash: text('token_hash').notNull(),
    scopes: text('scopes').array().notNull().default([]),
    gameIds: uuid('game_ids').array().notNull().default([]),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('api_keys_prefix_idx').on(t.prefix),
    index('api_keys_owner_idx').on(t.ownerUserId),
  ],
);

export type ApiKey = typeof apiKeys.$inferSelect;

/**
 * Calques importés (§7.10) — une préparation faite ailleurs (map.army,
 * QGIS, Google Earth) déposée dans la partie.
 *
 * Les entités importées ne vivent pas dans une table à part : ce sont des
 * `map_objects` ordinaires, marqués du `layerId` de leur calque. Elles
 * empruntent donc telle quelle la synchronisation offline (§7.6), se
 * mélangent aux données temps réel comme l'exige le §7.10, et se suppriment
 * par les mêmes pierres tombales.
 */
export const mapLayers = pgTable(
  'map_layers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    name: text('name').notNull(),
    format: text('format', { enum: ['geojson', 'kml', 'cot'] }).notNull(),
    featureCount: integer('feature_count').notNull().default(0),
    importedByMembershipId: uuid('imported_by_membership_id')
      .notNull()
      .references(() => memberships.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('map_layers_game_idx').on(t.gameId)],
);

export type MapLayer = typeof mapLayers.$inferSelect;

/**
 * Trace des positions (§7.5, statistiques post-partie).
 *
 * Écrite au fil du jeu, relue seulement après coup : c'est elle qui permet
 * de rejouer une partie et d'en tirer des distances. Deux garde-fous
 * gouvernent son volume, appliqués à l'écriture — un point toutes les
 * quelques secondes au plus, et rien si le joueur n'a pas bougé.
 */
export const positionLogs = pgTable(
  'position_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id),
    position: geometry('position', { type: 'point', mode: 'xy', srid: 4326 })
      .notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('position_logs_game_time_idx').on(t.gameId, t.recordedAt)],
);

export type PositionLog = typeof positionLogs.$inferSelect;
