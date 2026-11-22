import { request } from './apiClient';
import type { TriggerDto } from './types';

export async function listAdded(): Promise<TriggerDto[]> {
  const body = await request<{ triggers: TriggerDto[] }>('GET', '/triggers');
  return body.triggers;
}

export async function listAvailable(): Promise<TriggerDto[]> {
  const body = await request<{ triggers: TriggerDto[] }>('GET', '/triggers/available');
  return body.triggers;
}

export async function add(triggerId: string): Promise<TriggerDto> {
  const body = await request<{ trigger: TriggerDto }>('POST', '/triggers/added', { triggerId });
  return body.trigger;
}
