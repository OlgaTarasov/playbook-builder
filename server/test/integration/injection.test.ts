import { describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  hasTestDatabase,
  registerUser,
  seededActionIds,
  seededTriggerId,
  useTestDatabase,
} from '../helpers/testApp';

describe.skipIf(!hasTestDatabase)('injection', () => {
  const db = useTestDatabase();

  it('SQL-style payload in login email is rejected without a session', async () => {
    const res = await request(db.app)
      .post('/auth/login')
      .send({ email: "' OR 1=1--", password: 'abc12345' });

    expect([400, 401]).toContain(res.status);
    expect(res.body.token).toBeUndefined();
  });

  it('SQL-style payload in login password does not authenticate', async () => {
    await registerUser(db.app, 'victim@example.com');
    const res = await request(db.app)
      .post('/auth/login')
      .send({ email: 'victim@example.com', password: "' OR 1=1--" });

    expect([400, 401]).toContain(res.status);
    expect(res.body.token).toBeUndefined();
  });

  it('SQL-style payload in register email is rejected', async () => {
    const res = await request(db.app)
      .post('/auth/register')
      .send({ email: "' OR 1=1--", password: 'abc12345' });

    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });

  it('script tag in a playbook name is stored as plain text', async () => {
    const user = await registerUser(db.app, 'xss@example.com');
    const auth = { Cookie: user.cookie };
    const triggerId = await seededTriggerId(db.prisma, 'Malware Detected');
    const [actionId] = await seededActionIds(db.prisma);
    await request(db.app).post('/triggers/added').set(auth).send({ triggerId });

    const name = '<script>alert(1)</script>';
    const created = await request(db.app)
      .post('/playbooks')
      .set(auth)
      .send({ name, triggerId, actionIds: [actionId] });

    expect(created.status).toBe(201);
    expect(created.body.playbook.name).toBe(name);

    const list = await request(db.app).get('/playbooks').set(auth);
    expect(list.body.playbooks[0].name).toBe(name);
  });
});
