import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../errors';

const ALGORITHM = 'HS256' as const;
const EXPIRES_IN = '24h';

export class TokenService {
  constructor(private readonly secret: string) {}

  /** Token claims: sub (user id), iat and exp only. */
  sign(userId: string): string {
    return jwt.sign({ sub: userId }, this.secret, { algorithm: ALGORITHM, expiresIn: EXPIRES_IN });
  }

  /** Returns the subject. Any verification failure is a generic 401. */
  verify(token: string): string {
    try {
      const payload = jwt.verify(token, this.secret, { algorithms: [ALGORITHM] });
      if (typeof payload === 'object' && typeof payload.sub === 'string' && payload.sub.length > 0) {
        return payload.sub;
      }
    } catch {
      // fall through to the generic error below
    }
    throw new UnauthorizedError('Invalid or expired token');
  }
}
