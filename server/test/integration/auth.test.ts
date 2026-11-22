import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { hasTestDatabase, registerUser, useTestDatabase } from '../helpers/testApp';

/** Returns the session Set-Cookie header, or undefined when none was sent. */
function sessionSetCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown;
  const list = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  return list.find((c) => c.startsWith('playbook_session='));
}

describe.skipIf(!hasTestDatabase)('auth', () => {
  const db = useTestDatabase();

  it('register returns 201 with the lowercased user, sets an HttpOnly session cookie, and no token in the body', async () => {
    const res = await request(db.app)
      .post('/auth/register')
      .send({ email: '  Alice@Example.com ', password: 'abc12345' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeUndefined();
    expect(res.body.user.email).toBe('alice@example.com');
    expect(res.body.user.id).toEqual(expect.any(String));
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookie = sessionSetCookie(res);
    expect(cookie).toMatch(/^playbook_session=[^;]+/);
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Strict/i);
    expect(cookie).toMatch(/;\s*Path=\//i);
    expect(cookie).toMatch(/;\s*Max-Age=86400/i);
    expect(cookie).not.toMatch(/;\s*Secure/i);
  });

  it('duplicate email returns 409 EMAIL_TAKEN, ignoring case', async () => {
    await request(db.app).post('/auth/register').send({ email: 'dup@example.com', password: 'abc12345' });
    const res = await request(db.app)
      .post('/auth/register')
      .send({ email: 'DUP@example.com', password: 'abc12345' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('weak password returns 400 VALIDATION_ERROR with details', async () => {
    const res = await request(db.app)
      .post('/auth/register')
      .send({ email: 'weak@example.com', password: 'abcdefgh' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ path: 'password', message: 'Password must include a letter and a digit' }),
    ]);
  });

  it('login returns 200 with the user and a session cookie, and no token in the body', async () => {
    await request(db.app).post('/auth/register').send({ email: 'log@example.com', password: 'abc12345' });
    const res = await request(db.app)
      .post('/auth/login')
      .send({ email: 'log@example.com', password: 'abc12345' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeUndefined();
    expect(res.body.user.email).toBe('log@example.com');
    expect(sessionSetCookie(res)).toMatch(/^playbook_session=[^;]+/);
  });

  it('wrong password and unknown email both return 401 with the same message', async () => {
    await request(db.app).post('/auth/register').send({ email: 'same@example.com', password: 'abc12345' });

    const wrongPassword = await request(db.app)
      .post('/auth/login')
      .send({ email: 'same@example.com', password: 'wrong12345' });
    const unknownEmail = await request(db.app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong12345' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body.error).toEqual(wrongPassword.body.error);
    expect(sessionSetCookie(wrongPassword)).toBeUndefined();
  });

  it('malformed JSON returns 400 VALIDATION_ERROR', async () => {
    const res = await request(db.app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'Malformed JSON' });
  });

  it('GET /auth/me returns the user for a valid session cookie', async () => {
    const user = await registerUser(db.app, 'me@example.com');
    const res = await request(db.app).get('/auth/me').set('Cookie', user.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: user.user.id, email: 'me@example.com' } });
  });

  it('GET /auth/me without a session returns 401', async () => {
    const res = await request(db.app).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('logout returns 204 and clears the session cookie', async () => {
    const res = await request(db.app).post('/auth/logout');

    expect(res.status).toBe(204);
    const cookie = sessionSetCookie(res);
    expect(cookie).toMatch(/^playbook_session=;/);
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect(cookie).toMatch(/;\s*HttpOnly/i);
  });
});
