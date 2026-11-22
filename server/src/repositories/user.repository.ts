import type { PrismaClient, User } from '@prisma/client';

export class UserRepository {
  constructor(private readonly db: PrismaClient) {}

  findByEmail(email: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  create(data: { email: string; passwordHash: string }): Promise<User> {
    return this.db.user.create({ data });
  }
}
