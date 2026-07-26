import type { Database } from '../db/db.module';
import type { User } from '../db/schema';
import { UsersService } from './users.service';

const row: User = {
  id: '3f9d7a3e-0000-7000-8000-000000000001',
  authProviderId: 'supabase-uid-1',
  email: 'j@ex.fr',
  pseudo: null,
  createdAt: new Date('2026-07-22T10:00:00Z'),
};

const auth = { authProviderId: 'supabase-uid-1', email: 'j@ex.fr' };

/** Mock du chaînage insert().values().onConflictDoUpdate().returning(). */
function mockInsert(returned: User) {
  const returning = jest.fn().mockResolvedValue([returned]);
  const onConflictDoUpdate = jest.fn().mockReturnValue({ returning });
  const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
  return { insert: jest.fn().mockReturnValue({ values }), values };
}

describe('UsersService', () => {
  it('getOrCreate fait un upsert idempotent sur auth_provider_id', async () => {
    const { insert, values } = mockInsert(row);
    const db = { insert } as unknown as Database;

    const service = new UsersService(db);
    const user = await service.getOrCreate(auth);

    expect(user).toEqual(row);
    expect(values).toHaveBeenCalledWith({
      authProviderId: 'supabase-uid-1',
      email: 'j@ex.fr',
    });
  });

  it('updatePseudo crée le profil au besoin puis renvoie le profil mis à jour', async () => {
    const updated = { ...row, pseudo: 'Renard-06' };
    const { insert } = mockInsert(row);
    const returning = jest.fn().mockResolvedValue([updated]);
    const where = jest.fn().mockReturnValue({ returning });
    const set = jest.fn().mockReturnValue({ where });
    const db = {
      insert,
      update: jest.fn().mockReturnValue({ set }),
    } as unknown as Database;

    const service = new UsersService(db);
    await expect(service.updatePseudo(auth, 'Renard-06')).resolves.toEqual(
      updated,
    );
    expect(insert).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({ pseudo: 'Renard-06' });
  });
});
