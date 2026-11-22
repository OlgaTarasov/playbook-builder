import type { Prisma, PrismaClient } from '@prisma/client';

/** Shared include so every playbook read has the same shape. */
export const playbookInclude = {
  trigger: true,
  actions: {
    orderBy: { position: 'asc' },
    include: { action: true },
  },
} satisfies Prisma.PlaybookInclude;

export type PlaybookWithRelations = Prisma.PlaybookGetPayload<{ include: typeof playbookInclude }>;

export interface PlaybookCreateData {
  userId: string;
  name: string;
  triggerId: string;
  actions: { actionId: string; position: number }[];
}

/** Every method takes userId where ownership matters. */
export class PlaybookRepository {
  constructor(private readonly db: PrismaClient) {}

  listByUser(userId: string): Promise<PlaybookWithRelations[]> {
    return this.db.playbook.findMany({
      where: { userId },
      include: playbookInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  listByUserAndTrigger(userId: string, triggerId: string): Promise<PlaybookWithRelations[]> {
    return this.db.playbook.findMany({
      where: { userId, triggerId },
      include: playbookInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** One nested create, so the playbook and its actions succeed or fail together. */
  create(data: PlaybookCreateData): Promise<PlaybookWithRelations> {
    return this.db.playbook.create({
      data: {
        userId: data.userId,
        name: data.name,
        triggerId: data.triggerId,
        actions: { create: data.actions },
      },
      include: playbookInclude,
    });
  }

  /** deleteMany keeps the owner check in the same statement. Returns the row count. */
  async deleteByIdForUser(id: string, userId: string): Promise<number> {
    const result = await this.db.playbook.deleteMany({ where: { id, userId } });
    return result.count;
  }
}
