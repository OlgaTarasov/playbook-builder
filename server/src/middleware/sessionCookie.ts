import type { Request, Response } from 'express';

/** Name of the HttpOnly cookie that carries the session JWT. */
export const SESSION_COOKIE = 'playbook_session';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function cookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure,
    path: '/',
  };
}

export function setSessionCookie(res: Response, token: string, secure: boolean): void {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(secure), maxAge: MAX_AGE_MS });
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions(secure));
}

/**
 * Reads the session token from the Cookie header. A small parser keeps the
 * dependency list unchanged. JWTs contain no characters that need decoding.
 */
export function readSessionToken(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      return part.slice(eq + 1).trim() || undefined;
    }
  }
  return undefined;
}
