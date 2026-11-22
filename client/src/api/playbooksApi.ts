import { request } from './apiClient';
import type { PlaybookDto } from './types';

export async function list(): Promise<PlaybookDto[]> {
  const body = await request<{ playbooks: PlaybookDto[] }>('GET', '/playbooks');
  return body.playbooks;
}

export async function create(input: {
  name: string;
  triggerId: string;
  actionIds: string[];
}): Promise<PlaybookDto> {
  const body = await request<{ playbook: PlaybookDto }>('POST', '/playbooks', input);
  return body.playbook;
}

export function remove(id: string): Promise<void> {
  return request<void>('DELETE', `/playbooks/${encodeURIComponent(id)}`);
}
