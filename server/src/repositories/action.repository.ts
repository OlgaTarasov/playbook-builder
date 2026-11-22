import type { Action, PrismaClient } from '@prisma/client';

export class ActionRepository {
  constructor(private readonly db: PrismaClient) {}

  listActions(): Promise<Action[]> {
    return this.db.action.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  findActionsByIds(ids: string[]): Promise<Action[]> {
    return this.db.action.findMany({ where: { id: { in: ids } } });
  }
}
