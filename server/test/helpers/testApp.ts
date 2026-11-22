import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createDb } from '../../src/db';
import { SESSION_COOKIE } from '../../src/middleware/sessionCookie';
import { TokenService } from '../../src/services/token.service';

export const TEST_JWT_SECRET = 'integration-test-secret-that-is-long-enough-32';
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const hasTestDatabase = Boolean(TEST_DATABASE_URL);

/** Refuses to truncate anything that does not look like a dedicated test database. */
function assertTestDatabase(url: string): void {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(name)) {
    throw new Error(`Refusing to run integration tests against non-test database "${name}"`);
  }
}

/**
 * Creates a Prisma client and app for the test database, resets user data
 * before each test, and disconnects after the suite. Seed tables (Trigger,
 * Action) are kept.
 */
export function useTestDatabase(): { readonly app: Express; readonly prisma: PrismaClient } {
  let prisma!: PrismaClient;
  let app!: Express;

  beforeAll(() => {
    assertTestDatabase(TEST_DATABASE_URL as string);
    prisma = createDb(TEST_DATABASE_URL as string);
    app = createApp({ prisma, jwtSecret: TEST_JWT_SECRET });
  });

  beforeEach(async () => {
    // Child rows first: MySQL rejects TRUNCATE on tables that foreign keys reference.
    await prisma.playbookAction.deleteMany();
    await prisma.playbook.deleteMany();
    await prisma.userTrigger.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  return {
    get app() {
      return app;
    },
    get prisma() {
      return prisma;
    },
  };
}

export interface RegisteredUser {
  /** Value for the Cookie request header, e.g. `playbook_session=...`. */
  cookie: string;
  user: { id: string; email: string };
}

/** Pulls the session cookie pair out of a Set-Cookie response header. */
function sessionCookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : [String(raw ?? '')];
  const pair = list.map((c) => String(c).split(';')[0]).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!pair) throw new Error('no session cookie in response');
  return pair;
}

export async function registerUser(
  app: Express,
  email: string,
  password = 'abc12345',
): Promise<RegisteredUser> {
  const res = await request(app).post('/auth/register').send({ email, password });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { cookie: sessionCookieFrom(res), user: res.body.user as RegisteredUser['user'] };
}

/** A Cookie header value for a user id, signed with the test secret. */
export function cookieFor(userId: string): string {
  return `${SESSION_COOKIE}=${new TokenService(TEST_JWT_SECRET).sign(userId)}`;
}

/** Loads the seeded catalogue rows by name. */
export async function seededTriggerId(prisma: PrismaClient, name: string): Promise<string> {
  const row = await prisma.trigger.findUniqueOrThrow({ where: { name } });
  return row.id;
}

export async function seededActionIds(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.action.findMany({ orderBy: { sortOrder: 'asc' } });
  return rows.map((r) => r.id);
}
