import type { Request, RequestHandler } from 'express';
import { UnauthorizedError } from '../errors';
import type { UserRepository } from '../repositories/user.repository';
import type { TokenService } from '../services/token.service';
import { readSessionToken } from './sessionCookie';

export interface AuthUser {
  id: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Verifies the session cookie, then reloads the user from the database so a
 * deleted user is rejected on the next request. Sets req.user from the row.
 */
export function createAuthenticate(deps: {
  tokens: TokenService;
  users: UserRepository;
}): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token = readSessionToken(req);
      if (!token) throw new UnauthorizedError();

      const userId = deps.tokens.verify(token);
      const user = await deps.users.findById(userId);
      if (!user) throw new UnauthorizedError();

      req.user = { id: user.id, email: user.email };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Returns the authenticated user. Only call on routes behind authenticate. */
export function requireUser(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}
