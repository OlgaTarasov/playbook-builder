// DTOs mirroring the backend contract (see the API overview in README.md).

export interface UserDto {
  id: string;
  email: string;
}

export interface TriggerDto {
  id: string;
  name: string;
}

export interface ActionDto {
  id: string;
  name: string;
}

export interface PlaybookDto {
  id: string;
  name: string;
  trigger: TriggerDto;
  actions: ActionDto[];
  createdAt: string;
}

export interface SimulationMatchDto {
  playbook: { id: string; name: string };
  actions: ActionDto[];
}

export interface SimulationDto {
  trigger: TriggerDto;
  matches: SimulationMatchDto[];
}

export interface ErrorDetail {
  path: string;
  message: string;
}
