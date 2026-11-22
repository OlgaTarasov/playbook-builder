import { ConflictError, NotFoundError, ValidationError, isUniqueViolation } from '../errors';
import type { PlaybookBody } from '../schemas';
import type { ActionRepository } from '../repositories/action.repository';
import type { PlaybookRepository, PlaybookWithRelations } from '../repositories/playbook.repository';
import type { TriggerDto, TriggerService } from './trigger.service';

export interface PlaybookDto {
  id: string;
  name: string;
  trigger: TriggerDto;
  actions: { id: string; name: string }[];
  createdAt: string;
}

export function toPlaybookDto(p: PlaybookWithRelations): PlaybookDto {
  return {
    id: p.id,
    name: p.name,
    trigger: { id: p.trigger.id, name: p.trigger.name },
    actions: p.actions.map((pa) => ({ id: pa.action.id, name: pa.action.name })),
    createdAt: p.createdAt.toISOString(),
  };
}

export class PlaybookService {
  constructor(
    private readonly playbooks: PlaybookRepository,
    private readonly actions: ActionRepository,
    private readonly triggerService: TriggerService,
  ) {}

  async list(userId: string): Promise<PlaybookDto[]> {
    return (await this.playbooks.listByUser(userId)).map(toPlaybookDto);
  }

  async create(userId: string, input: PlaybookBody): Promise<PlaybookDto> {
    await this.triggerService.assertAdded(userId, input.triggerId);

    const found = await this.actions.findActionsByIds(input.actionIds);
    if (found.length !== input.actionIds.length) {
      throw new ValidationError('Request validation failed', [
        { path: 'actionIds', message: 'Unknown action' },
      ]);
    }

    try {
      const created = await this.playbooks.create({
        userId,
        name: input.name,
        triggerId: input.triggerId,
        // Position is the index in the request, so stored order matches what was sent.
        actions: input.actionIds.map((actionId, position) => ({ actionId, position })),
      });
      return toPlaybookDto(created);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('PLAYBOOK_NAME_TAKEN', 'Playbook name already exists');
      }
      throw err;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    const count = await this.playbooks.deleteByIdForUser(id, userId);
    if (count === 0) throw new NotFoundError('Playbook not found');
  }
}
