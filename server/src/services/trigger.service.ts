import { ConflictError, ForbiddenError, NotFoundError, isUniqueViolation } from '../errors';
import type { TriggerRepository } from '../repositories/trigger.repository';

export interface TriggerDto {
  id: string;
  name: string;
}

const toDto = (t: { id: string; name: string }): TriggerDto => ({ id: t.id, name: t.name });

export class TriggerService {
  constructor(private readonly triggers: TriggerRepository) {}

  async listAdded(userId: string): Promise<TriggerDto[]> {
    return (await this.triggers.listUserTriggers(userId)).map(toDto);
  }

  async listAvailable(userId: string): Promise<TriggerDto[]> {
    return (await this.triggers.listAvailableTriggers(userId)).map(toDto);
  }

  async add(userId: string, triggerId: string): Promise<TriggerDto> {
    const trigger = await this.triggers.findTriggerById(triggerId);
    if (!trigger) throw new NotFoundError('Trigger not found');

    try {
      await this.triggers.createGrant(userId, triggerId);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('TRIGGER_ALREADY_ADDED', 'Trigger already added');
      }
      throw err;
    }
    return toDto(trigger);
  }

  /** Reads the grant from the database on every call. */
  async assertAdded(userId: string, triggerId: string): Promise<void> {
    const grant = await this.triggers.findGrant(userId, triggerId);
    if (!grant) throw new ForbiddenError('Trigger has not been added');
  }
}
