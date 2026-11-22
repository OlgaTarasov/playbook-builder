import type { ErrorDetail } from './types';

const BASE_PATH = '/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(fn: () => void): void {
  unauthorizedHandler = fn;
}

/**
 * Sends a JSON request under /api. Resolves to undefined for 204.
 * Authentication is the HttpOnly session cookie, which the browser sends
 * automatically on same-origin requests. No token is read or stored here.
 * The unauthorised handler runs for a 401 on any non-auth endpoint. Auth
 * endpoints are excluded, so a wrong password or a missing session on
 * /auth/me never triggers the expired-session flow.
 */
export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(BASE_PATH + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) {
      unauthorizedHandler?.();
    }

    const error = (payload as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null)?.error;
    if (!error || typeof error.code !== 'string' || typeof error.message !== 'string') {
      throw new ApiError(response.status, 'INTERNAL', 'Unexpected error');
    }

    const details = Array.isArray(error.details) ? (error.details as ErrorDetail[]) : [];
    throw new ApiError(response.status, error.code, error.message, details);
  }

  return payload as T;
}
