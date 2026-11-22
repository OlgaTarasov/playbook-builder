import { PrismaClient } from '@prisma/client';

/**
 * Creates the Prisma client. The composition root (index.ts) calls this once
 * per process; tests call it with the test database URL.
 */
export function createDb(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

export type Db = PrismaClient;
