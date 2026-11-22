import { request } from './apiClient';
import type { UserDto } from './types';

interface UserResponse {
  user: UserDto;
}

/** Creates the account. The server sets the session cookie; the response carries only the user. */
export async function register(email: string, password: string): Promise<UserDto> {
  const res = await request<UserResponse>('POST', '/auth/register', { email, password });
  return res.user;
}

/** Logs in. The server sets the session cookie; the response carries only the user. */
export async function login(email: string, password: string): Promise<UserDto> {
  const res = await request<UserResponse>('POST', '/auth/login', { email, password });
  return res.user;
}

/** Clears the session cookie on the server. */
export function logout(): Promise<void> {
  return request<void>('POST', '/auth/logout');
}

/** Returns the signed-in user for the current cookie. Rejects with 401 when there is no valid session. */
export async function me(): Promise<UserDto> {
  const res = await request<UserResponse>('GET', '/auth/me');
  return res.user;
}
