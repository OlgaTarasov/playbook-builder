import { request } from './apiClient';
import type { SimulationDto } from './types';

export function run(triggerId: string): Promise<SimulationDto> {
  return request<SimulationDto>('POST', '/simulateTrigger', { triggerId });
}
