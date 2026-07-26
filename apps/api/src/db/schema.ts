import {
  boolean,
  geometry,
  index,
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
