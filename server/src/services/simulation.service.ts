import { NotFoundError } from '../errors';
import type { PlaybookRepository } from '../repositories/playbook.repository';
import type { TriggerRepository } from '../repositories/trigger.repository';
import type { TriggerService, TriggerDto } from './trigger.service';

export interface SimulationDto {
  trigger: TriggerDto;
  matches: {
    playbook: { id: string; name: string };
    actions: { id: string; name: string }[];
  }[];
}

export class SimulationService {
  constructor(
    private readonly playbooks: PlaybookRepository,
    private readonly triggers: TriggerRepository,
    private readonly triggerService: TriggerService,
  ) {}

  async run(userId: string, triggerId: string): Promise<SimulationDto> {
    await this.triggerService.assertAdded(userId, triggerId);

    const trigger = await this.triggers.findTriggerById(triggerId);
    if (!trigger) throw new NotFoundError('Trigger not found');

    const playbooks = await this.playbooks.listByUserAndTrigger(userId, triggerId);
    return {
      trigger: { id: trigger.id, name: trigger.name },
      matches: playbooks.map((p) => ({
        playbook: { id: p.id, name: p.name },
        actions: p.actions.map((pa) => ({ id: pa.action.id, name: pa.action.name })),
      })),
    };
  }
}
