import { request } from './apiClient';
import type { ActionDto } from './types';

export async function list(): Promise<ActionDto[]> {
  const body = await request<{ actions: ActionDto[] }>('GET', '/actions');
  return body.actions;
}
