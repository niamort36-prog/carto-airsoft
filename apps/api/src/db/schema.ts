import {
  boolean,
  geometry,
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
    role: text('role', { enum: ['orga', 'player'] })
      .notNull()
      .default('player'),
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
