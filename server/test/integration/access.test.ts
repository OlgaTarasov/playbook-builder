import { describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import {
  cookieFor,
  hasTestDatabase,
  registerUser,
  TEST_JWT_SECRET,
  useTestDatabase,
} from '../helpers/testApp';

describe.skipIf(!hasTestDatabase)('access', () => {
  const db = useTestDatabase();

  const expectUnauthorized = (res: request.Response) => {
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  };

  it('no session cookie returns 401', async () => {
    expectUnauthorized(await request(db.app).get('/triggers'));
  });

  it('empty session cookie returns 401', async () => {
    expectUnauthorized(await request(db.app).get('/triggers').set('Cookie', 'playbook_session='));
  });

  it('a cookie with another name returns 401', async () => {
    expectUnauthorized(await request(db.app).get('/triggers').set('Cookie', 'other=abc'));
  });

  it('a valid token sent as a Bearer header is not accepted', async () => {
    const user = await registerUser(db.app, 'bearer@example.com');
    const token = jwt.sign({ sub: user.user.id }, TEST_JWT_SECRET, { algorithm: 'HS256' });
    expectUnauthorized(await request(db.app).get('/triggers').set('Authorization', `Bearer ${token}`));
  });

  it('garbage session cookie returns 401', async () => {
    expectUnauthorized(await request(db.app).get('/triggers').set('Cookie', 'playbook_session=not.a.jwt'));
  });

  it('expired token returns 401', async () => {
    const user = await registerUser(db.app, 'expired@example.com');
    const expired = jwt.sign(
      { sub: user.user.id, exp: Math.floor(Date.now() / 1000) - 60 },
      TEST_JWT_SECRET,
      { algorithm: 'HS256' },
    );
    expectUnauthorized(
      await request(db.app).get('/triggers').set('Cookie', `playbook_session=${expired}`),
    );
  });

  it('token signed with the wrong secret returns 401', async () => {
    const user = await registerUser(db.app, 'wrongsig@example.com');
    const forged = jwt.sign({ sub: user.user.id }, 'a-different-secret-that-is-also-32-chars', {
      algorithm: 'HS256',
    });
    expectUnauthorized(
      await request(db.app).get('/triggers').set('Cookie', `playbook_session=${forged}`),
    );
  });

  it('token signed with a disallowed algorithm returns 401', async () => {
    const user = await registerUser(db.app, 'hs512@example.com');
    const hs512 = jwt.sign({ sub: user.user.id }, TEST_JWT_SECRET, { algorithm: 'HS512' });
    expectUnauthorized(
      await request(db.app).get('/triggers').set('Cookie', `playbook_session=${hs512}`),
    );
  });

  it('valid cookie for a deleted user returns 401 on the next request', async () => {
    const user = await registerUser(db.app, 'deleted@example.com');
    expect((await request(db.app).get('/triggers').set('Cookie', user.cookie)).status).toBe(200);

    await db.prisma.user.delete({ where: { id: user.user.id } });

    expectUnauthorized(await request(db.app).get('/triggers').set('Cookie', user.cookie));
  });

  it('a valid session cookie for an existing user is accepted', async () => {
    const user = await registerUser(db.app, 'ok@example.com');
    const res = await request(db.app).get('/triggers').set('Cookie', cookieFor(user.user.id));
    expect(res.status).toBe(200);
  });
});
