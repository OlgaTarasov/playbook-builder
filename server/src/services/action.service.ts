import type { ActionRepository } from '../repositories/action.repository';

export interface ActionDto {
  id: string;
  name: string;
}

export class ActionService {
  constructor(private readonly actions: ActionRepository) {}

  async list(): Promise<ActionDto[]> {
    const rows = await this.actions.listActions();
    return rows.map((a) => ({ id: a.id, name: a.name }));
  }
}
