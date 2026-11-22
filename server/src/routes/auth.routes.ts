import { Router, type RequestHandler } from 'express';
import { requireUser } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { clearSessionCookie, setSessionCookie } from '../middleware/sessionCookie';
import { loginBody, registerBody, type LoginBody, type RegisterBody } from '../schemas';
import type { AuthService } from '../services/auth.service';

export interface AuthRouterOptions {
  /** Sets the Secure flag on the session cookie. Turn on when served over HTTPS. */
  cookieSecure: boolean;
  /** Guards GET /auth/me. */
  authenticate: RequestHandler;
}

/**
 * Register and login set the HttpOnly session cookie and return only the user.
 * The token never appears in a response body.
 */
export function createAuthRouter(auth: AuthService, options: AuthRouterOptions): Router {
  const router = Router();
  const { cookieSecure, authenticate } = options;

  router.post('/register', validate({ body: registerBody }), async (req, res) => {
    const { token, user } = await auth.register(req.body as RegisterBody);
    setSessionCookie(res, token, cookieSecure);
    res.status(201).json({ user });
  });

  router.post('/login', validate({ body: loginBody }), async (req, res) => {
    const { token, user } = await auth.login(req.body as LoginBody);
    setSessionCookie(res, token, cookieSecure);
    res.status(200).json({ user });
  });

  router.post('/logout', (_req, res) => {
    clearSessionCookie(res, cookieSecure);
    res.status(204).end();
  });

  router.get('/me', authenticate, (req, res) => {
    res.status(200).json({ user: requireUser(req) });
  });

  return router;
}
