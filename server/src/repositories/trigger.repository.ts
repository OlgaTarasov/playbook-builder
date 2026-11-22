import type { PrismaClient, Trigger, UserTrigger } from '@prisma/client';

/** Trigger catalogue reads and the per-user UserTrigger grant rows. */
export class TriggerRepository {
  constructor(private readonly db: PrismaClient) {}

  findTriggerById(id: string): Promise<Trigger | null> {
    return this.db.trigger.findUnique({ where: { id } });
  }

  listUserTriggers(userId: string): Promise<Trigger[]> {
    return this.db.trigger.findMany({
      where: { grants: { some: { userId } } },
      orderBy: { name: 'asc' },
    });
  }

  listAvailableTriggers(userId: string): Promise<Trigger[]> {
    return this.db.trigger.findMany({
      where: { grants: { none: { userId } } },
      orderBy: { name: 'asc' },
    });
  }

  findGrant(userId: string, triggerId: string): Promise<UserTrigger | null> {
    return this.db.userTrigger.findUnique({
      where: { userId_triggerId: { userId, triggerId } },
    });
  }

  /** Throws a Prisma P2002 error if the grant already exists. */
  createGrant(userId: string, triggerId: string): Promise<UserTrigger> {
    return this.db.userTrigger.create({ data: { userId, triggerId } });
  }
}
