import { describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  hasTestDatabase,
  registerUser,
  seededActionIds,
  seededTriggerId,
  useTestDatabase,
} from '../helpers/testApp';

describe.skipIf(!hasTestDatabase)('triggers', () => {
  const db = useTestDatabase();

  it('a new user has no added triggers', async () => {
    const user = await registerUser(db.app, 'new@example.com');
    const res = await request(db.app).get('/triggers').set('Cookie', user.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ triggers: [] });
  });

  it('available lists all seeded triggers for a new user', async () => {
    const user = await registerUser(db.app, 'avail@example.com');
    const res = await request(db.app)
      .get('/triggers/available')
      .set('Cookie', user.cookie);

    expect(res.status).toBe(200);
    expect(res.body.triggers.map((t: { name: string }) => t.name).sort()).toEqual([
      'Login Attempt',
      'Malware Detected',
      'Phishing Alert',
    ]);
  });

  it('adding a trigger returns 201 and moves it from available to added', async () => {
    const user = await registerUser(db.app, 'add@example.com');
    const triggerId = await seededTriggerId(db.prisma, 'Malware Detected');
    const auth = { Cookie: user.cookie };

    const add = await request(db.app).post('/triggers/added').set(auth).send({ triggerId });
    expect(add.status).toBe(201);
    expect(add.body.trigger).toEqual({ id: triggerId, name: 'Malware Detected' });

    const added = await request(db.app).get('/triggers').set(auth);
    expect(added.body.triggers).toEqual([{ id: triggerId, name: 'Malware Detected' }]);

    const available = await request(db.app).get('/triggers/available').set(auth);
    expect(available.body.triggers.map((t: { id: string }) => t.id)).not.toContain(triggerId);
  });

  it('adding the same trigger again returns 409 TRIGGER_ALREADY_ADDED', async () => {
    const user = await registerUser(db.app, 'twice@example.com');
    const triggerId = await seededTriggerId(db.prisma, 'Login Attempt');
    const auth = { Cookie: user.cookie };

    await request(db.app).post('/triggers/added').set(auth).send({ triggerId });
    const again = await request(db.app).post('/triggers/added').set(auth).send({ triggerId });

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('TRIGGER_ALREADY_ADDED');
  });

  it('adding an unknown trigger id returns 404', async () => {
    const user = await registerUser(db.app, 'unknown@example.com');
    const res = await request(db.app)
      .post('/triggers/added')
      .set('Cookie', user.cookie)
      .send({ triggerId: '11111111-2222-4333-8444-555555555555' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('adding with a non-UUID triggerId returns 400', async () => {
    const user = await registerUser(db.app, 'nouuid@example.com');
    const res = await request(db.app)
      .post('/triggers/added')
      .set('Cookie', user.cookie)
      .send({ triggerId: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('a revoked grant row blocks playbook creation on the next request', async () => {
    const user = await registerUser(db.app, 'revoke@example.com');
    const triggerId = await seededTriggerId(db.prisma, 'Phishing Alert');
    const actionIds = await seededActionIds(db.prisma);
    const auth = { Cookie: user.cookie };

    await request(db.app).post('/triggers/added').set(auth).send({ triggerId });
    const ok = await request(db.app)
      .post('/playbooks')
      .set(auth)
      .send({ name: 'Before revoke', triggerId, actionIds: [actionIds[0]] });
    expect(ok.status).toBe(201);

    await db.prisma.userTrigger.delete({
      where: { userId_triggerId: { userId: user.user.id, triggerId } },
    });

    const blocked = await request(db.app)
      .post('/playbooks')
      .set(auth)
      .send({ name: 'After revoke', triggerId, actionIds: [actionIds[0]] });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('TRIGGER_NOT_ADDED');
  });
});
