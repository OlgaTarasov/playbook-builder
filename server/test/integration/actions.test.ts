import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { hasTestDatabase, registerUser, useTestDatabase } from '../helpers/testApp';

describe.skipIf(!hasTestDatabase)('actions', () => {
  const db = useTestDatabase();

  it('lists the three seeded actions in sortOrder', async () => {
    const user = await registerUser(db.app, 'actions@example.com');
    const res = await request(db.app).get('/actions').set('Cookie', user.cookie);

    expect(res.status).toBe(200);
    expect(res.body.actions.map((a: { name: string }) => a.name)).toEqual([
      'Isolate Host',
      'Notify Admin',
      'Block IP',
    ]);
    expect(Object.keys(res.body.actions[0]).sort()).toEqual(['id', 'name']);
  });

  it('requires authentication', async () => {
    const res = await request(db.app).get('/actions');
    expect(res.status).toBe(401);
  });
});
