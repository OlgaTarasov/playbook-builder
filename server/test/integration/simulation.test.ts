import { describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  hasTestDatabase,
  registerUser,
  seededActionIds,
  seededTriggerId,
  useTestDatabase,
} from '../helpers/testApp';

describe.skipIf(!hasTestDatabase)('simulation', () => {
  const db = useTestDatabase();

  it('matches only the caller playbooks that use the given trigger, with actions in stored order', async () => {
    const a = await registerUser(db.app, 'simA@example.com');
    const b = await registerUser(db.app, 'simB@example.com');
    const malware = await seededTriggerId(db.prisma, 'Malware Detected');
    const login = await seededTriggerId(db.prisma, 'Login Attempt');
    const [isolate, notify, block] = await seededActionIds(db.prisma);
    const authA = { Cookie: a.cookie };
    const authB = { Cookie: b.cookie };

    await request(db.app).post('/triggers/added').set(authA).send({ triggerId: malware });
    await request(db.app).post('/triggers/added').set(authA).send({ triggerId: login });
    await request(db.app).post('/triggers/added').set(authB).send({ triggerId: malware });

    // A: malware playbook (match), login playbook (different trigger, no match)
    await request(db.app).post('/playbooks').set(authA).send({
      name: 'A malware', triggerId: malware, actionIds: [block, isolate, notify],
    });
    await request(db.app).post('/playbooks').set(authA).send({
      name: 'A login', triggerId: login, actionIds: [notify],
    });
    // B: malware playbook (must not appear for A)
    await request(db.app).post('/playbooks').set(authB).send({
      name: 'B malware', triggerId: malware, actionIds: [isolate],
    });

    const res = await request(db.app)
      .post('/simulateTrigger')
      .set(authA)
      .send({ triggerId: malware });

    expect(res.status).toBe(200);
    expect(res.body.trigger).toEqual({ id: malware, name: 'Malware Detected' });
    expect(res.body.matches).toHaveLength(1);
    expect(res.body.matches[0].playbook.name).toBe('A malware');
    expect(res.body.matches[0].actions.map((x: { id: string }) => x.id)).toEqual([block, isolate, notify]);
  });

  it('no matching playbook returns an empty matches array', async () => {
    const a = await registerUser(db.app, 'nomatch@example.com');
    const phishing = await seededTriggerId(db.prisma, 'Phishing Alert');
    const auth = { Cookie: a.cookie };
    await request(db.app).post('/triggers/added').set(auth).send({ triggerId: phishing });

    const res = await request(db.app).post('/simulateTrigger').set(auth).send({ triggerId: phishing });
    expect(res.status).toBe(200);
    expect(res.body.matches).toEqual([]);
  });

  it('trigger not added returns 403 TRIGGER_NOT_ADDED', async () => {
    const a = await registerUser(db.app, 'simnoadd@example.com');
    const triggerId = await seededTriggerId(db.prisma, 'Login Attempt');
    const res = await request(db.app)
      .post('/simulateTrigger')
      .set('Cookie', a.cookie)
      .send({ triggerId });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TRIGGER_NOT_ADDED');
  });
});
