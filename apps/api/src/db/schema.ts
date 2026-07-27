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
     * Hiérarchie §5 (version jouable ; la matrice complète arrive en
     * Phase 3) : le créateur de la partie est commandant, il nomme les
     * capitaines et chefs d'escouade. L'icône d'unité est l'insigne du
     * joueur sur la carte, modifiable par les gradés sur les rangs
     * strictement inférieurs.
     */
    role: text('role', {
      enum: ['commandant', 'capitaine', 'chef_escouade', 'joueur'],
    })
      .notNull()
      .default('joueur'),
    unitType: text('unit_type').notNull().default('infantry'),
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
  /** Rang maximal (inclus) requis pour lire/écrire ; null = tout le monde. */
  minRoleRank: integer('min_role_rank'),
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
