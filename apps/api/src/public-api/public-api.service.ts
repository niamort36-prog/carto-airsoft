import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../db/db.module';
import {
  games,
  memberships,
  objectiveCaptures,
  objectives,
  teams,
  users,
} from '../db/schema';

/**
 * Lectures ouvertes aux intégrations (§7.11).
 *
 * Requêtes écrites ici plutôt que réutilisées des services de jeu : ceux-ci
 * partent d'une appartenance à la partie, notion qui n'existe pas pour une
 * clé. Surtout, cela rend visible en un seul endroit ce qui sort vraiment
 * par cette porte — et ce qui n'en sort jamais : aucune position.
 */
@Injectable()
export class PublicApiService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async game(gameId: string) {
    const [game] = await this.db
      .select()
      .from(games)
      .where(eq(games.id, gameId));
    if (!game) throw new NotFoundException('Partie introuvable');
    return {
      id: game.id,
      name: game.name,
      status: game.status,
      startsAt: game.startsAt,
      endsAt: game.endsAt,
      createdAt: game.createdAt,
    };
  }

  /** Tableau des scores — la donnée type d'un affichage de club. */
  scores(gameId: string) {
    return this.db
      .select({
        id: teams.id,
        name: teams.name,
        color: teams.color,
        score: teams.score,
      })
      .from(teams)
      .where(eq(teams.gameId, gameId))
      .orderBy(desc(teams.score));
  }

  /**
   * Objectifs et détenteur du moment. Le jeton du QR physique n'en fait pas
   * partie : le divulguer permettrait de capturer un drapeau sans y aller.
   */
  async objectivesOf(gameId: string) {
    const rows = await this.db
      .select({
        id: objectives.id,
        name: objectives.name,
        position: objectives.position,
        captureOrder: objectives.captureOrder,
        holderTeamId: objectives.holderTeamId,
        lastCapturedAt: objectives.lastCapturedAt,
        reward: objectives.reward,
      })
      .from(objectives)
      .where(eq(objectives.gameId, gameId))
      .orderBy(objectives.captureOrder, objectives.createdAt);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      lat: r.position.y,
      lng: r.position.x,
      captureOrder: r.captureOrder,
      holderTeamId: r.holderTeamId,
      lastCapturedAt: r.lastCapturedAt,
      reward: r.reward,
    }));
  }

  /**
   * Composition des équipes. Volontairement SANS position ni statut de vie :
   * une clé de lecture donnerait sinon un avantage de terrain à qui la
   * détient, ce que le §2.1 interdit. La règle ne dépend d'aucune portée —
   * même une clé d'administration n'obtient pas de coordonnées ici.
   */
  membersOf(gameId: string) {
    return this.db
      .select({
        membershipId: memberships.id,
        pseudo: users.pseudo,
        role: memberships.role,
        teamId: memberships.teamId,
        squadId: memberships.squadId,
        isConnected: memberships.isConnected,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(
        and(
          eq(memberships.gameId, gameId),
          isNull(memberships.leftAt),
          isNull(memberships.kickedAt),
        ),
      );
  }

  /** Historique des captures — de quoi rejouer une partie après coup. */
  captures(gameId: string) {
    return this.db
      .select({
        objectiveId: objectiveCaptures.objectiveId,
        objectiveName: objectives.name,
        teamId: objectiveCaptures.teamId,
        pointsAwarded: objectiveCaptures.pointsAwarded,
        capturedAt: objectiveCaptures.capturedAt,
      })
      .from(objectiveCaptures)
      .innerJoin(objectives, eq(objectiveCaptures.objectiveId, objectives.id))
      .where(eq(objectives.gameId, gameId))
      .orderBy(desc(objectiveCaptures.capturedAt));
  }

  /**
   * Changement d'état de la partie (portée « write ») : c'est ce qui permet
   * à un pupitre extérieur de lancer et d'arrêter le jeu.
   */
  async setStatus(gameId: string, status: 'draft' | 'live' | 'finished') {
    const [row] = await this.db
      .update(games)
      .set({
        status,
        startsAt: status === 'live' ? new Date() : undefined,
        endsAt: status === 'finished' ? new Date() : undefined,
      })
      .where(eq(games.id, gameId))
      .returning();
    if (!row) throw new NotFoundException('Partie introuvable');
    return { id: row.id, status: row.status };
  }
}
