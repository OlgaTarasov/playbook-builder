import { describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  hasTestDatabase,
  registerUser,
  seededActionIds,
  seededTriggerId,
  useTestDatabase,
} from '../helpers/testApp';

describe.skipIf(!hasTestDatabase)('playbooks', () => {
  const db = useTestDatabase();

  const UNKNOWN_UUID = '11111111-2222-4333-8444-555555555555';

  async function setupUser(email: string) {
    const user = await registerUser(db.app, email);
    const auth = { Cookie: user.cookie };
    const triggerId = await seededTriggerId(db.prisma, 'Malware Detected');
    await request(db.app).post('/triggers/added').set(auth).send({ triggerId });
    const actionIds = await seededActionIds(db.prisma);
    return { user, auth, triggerId, actionIds };
  }

  it('creates a playbook with 201 and the list DTO shape', async () => {
    const { auth, triggerId, actionIds } = await setupUser('create@example.com');
    const res = await request(db.app)
      .post('/playbooks')
      .set(auth)
      .send({ name: 'Critical Malware Response', triggerId, actionIds: [actionIds[0], actionIds[1]] });

    expect(res.status).toBe(201);
    const p = res.body.playbook;
    expect(p.name).toBe('Critical Malware Response');
    expect(p.trigger).toEqual({ id: triggerId, name: 'Malware Detected' });
    expect(p.actions.map((a: { id: string }) => a.id)).toEqual([actionIds[0], actionIds[1]]);
    expect(new Date(p.createdAt).toISOString()).toBe(p.createdAt);
  });

  it('stores actions in the order sent', async () => {
    const { auth, triggerId, actionIds } = await setupUser('order@example.com');
    const reversed = [...actionIds].reverse();
    const res = await request(db.app)
      .post('/playbooks')
      .set(auth)
      .send({ name: 'Reversed', triggerId, actionIds: reversed });

    expect(res.status).toBe(201);
    expect(res.body.playbook.actions.map((a: { id: string }) => a.id)).toEqual(reversed);
  });

  it('duplicate name for the same user returns 409 PLAYBOOK_NAME_TAKEN', async () => {
    const { auth, triggerId, actionIds } = await setupUser('dupname@example.com');
    const body = { name: 'Same Name', triggerId, actionIds: [actionIds[0]] };

    expect((await request(db.app).post('/playbooks').set(auth).send(body)).status).toBe(201);
    const res = await request(db.app).post('/playbooks').set(auth).send(body);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PLAYBOOK_NAME_TAKEN');
  });

  it('zero actions returns 400', async () => {
    const { auth, triggerId } = await setupUser('zero@example.com');
    const res = await request(db.app)
      .post('/playbooks')
      .set(auth)
      .send({ name: 'Empty', triggerId, actionIds: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('four actions returns 400', async () => {
    const { auth, triggerId, actionIds } = await setupUser('four@example.com');
    const res = await request(db.app)
      .post('/playbooks')
      .set(auth)
      .send({ name: 'Too many', triggerId, actionIds: [...actionIds, UNKNOWN_UUID] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('duplicate action ids return 400', async () => {
    const { auth, triggerId, actionIds } = await setupUser('dupaction@example.com');
    const res = await request(db.app)
      .post('/playbooks')
      .set(auth)
      .send({ name: 'Dup', triggerId, actionIds: [actionIds[0], actionIds[0]] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('trigger not added returns 403 TRIGGER_NOT_ADDED', async () => {
    const user = await registerUser(db.app, 'notadded@example.com');
    const triggerId = await seededTriggerId(db.prisma, 'Phishing Alert');
    const actionIds = await seededActionIds(db.prisma);
    const res = await request(db.app)
      .post('/playbooks')
      .set('Cookie', user.cookie)
      .send({ name: 'No trigger', triggerId, actionIds: [actionIds[0]] });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TRIGGER_NOT_ADDED');
  });

  it('unknown action id returns 400', async () => {
    const { auth, triggerId } = await setupUser('unknownaction@example.com');
    const res = await request(db.app)
      .post('/playbooks')
      .set(auth)
      .send({ name: 'Ghost action', triggerId, actionIds: [UNKNOWN_UUID] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([{ path: 'actionIds', message: 'Unknown action' }]);
  });

  it('list returns only the caller playbooks', async () => {
    const a = await setupUser('lista@example.com');
    const b = await setupUser('listb@example.com');
    await request(db.app)
      .post('/playbooks')
      .set(a.auth)
      .send({ name: 'A only', triggerId: a.triggerId, actionIds: [a.actionIds[0]] });

    const listA = await request(db.app).get('/playbooks').set(a.auth);
    const listB = await request(db.app).get('/playbooks').set(b.auth);

    expect(listA.body.playbooks.map((p: { name: string }) => p.name)).toEqual(['A only']);
    expect(listB.body.playbooks).toEqual([]);
  });

  it('two users may use the same playbook name', async () => {
    const a = await setupUser('sameA@example.com');
    const b = await setupUser('sameB@example.com');
    const body = (s: { triggerId: string; actionIds: string[] }) => ({
      name: 'Shared name',
      triggerId: s.triggerId,
      actionIds: [s.actionIds[0]],
    });

    expect((await request(db.app).post('/playbooks').set(a.auth).send(body(a))).status).toBe(201);
    expect((await request(db.app).post('/playbooks').set(b.auth).send(body(b))).status).toBe(201);
  });

  it('delete returns 204 and removes the playbook', async () => {
    const { auth, triggerId, actionIds } = await setupUser('del@example.com');
    const created = await request(db.app)
      .post('/playbooks')
      .set(auth)
      .send({ name: 'To delete', triggerId, actionIds: [actionIds[0]] });
    const id = created.body.playbook.id;

    const res = await request(db.app).delete(`/playbooks/${id}`).set(auth);
    expect(res.status).toBe(204);

    const list = await request(db.app).get('/playbooks').set(auth);
    expect(list.body.playbooks).toEqual([]);
  });

  it("deleting another user's playbook returns 404 and leaves it in place", async () => {
    const a = await setupUser('owner@example.com');
    const b = await setupUser('intruder@example.com');
    const created = await request(db.app)
      .post('/playbooks')
      .set(a.auth)
      .send({ name: 'Mine', triggerId: a.triggerId, actionIds: [a.actionIds[0]] });

    const res = await request(db.app).delete(`/playbooks/${created.body.playbook.id}`).set(b.auth);
    expect(res.status).toBe(404);

    const list = await request(db.app).get('/playbooks').set(a.auth);
    expect(list.body.playbooks).toHaveLength(1);
  });

  it('deleting an unknown id returns 404', async () => {
    const { auth } = await setupUser('unknowndel@example.com');
    const res = await request(db.app).delete(`/playbooks/${UNKNOWN_UUID}`).set(auth);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
