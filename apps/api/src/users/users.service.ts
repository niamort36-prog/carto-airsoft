import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/supabase-auth.guard';
import { DRIZZLE, type Database } from '../db/db.module';
import { users, type User } from '../db/schema';

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Premier appel authentifié = création implicite du profil (upsert idempotent
   * sur l'identifiant Supabase). Les appels suivants rafraîchissent l'email.
   */
  async getOrCreate(auth: AuthenticatedUser): Promise<User> {
    const [user] = await this.db
      .insert(users)
      .values({ authProviderId: auth.authProviderId, email: auth.email ?? null })
      .onConflictDoUpdate({
        target: users.authProviderId,
        set: { email: auth.email ?? null },
      })
      .returning();
    return user;
  }

  async updatePseudo(auth: AuthenticatedUser, pseudo: string): Promise<User> {
    // Crée le profil au besoin : premier appel possible avant tout GET /me.
    await this.getOrCreate(auth);
    const [user] = await this.db
      .update(users)
      .set({ pseudo })
      .where(eq(users.authProviderId, auth.authProviderId))
      .returning();
    if (!user) {
      throw new NotFoundException('Profil introuvable');
    }
    return user;
  }
}
