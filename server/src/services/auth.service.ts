import bcrypt from 'bcryptjs';
import { ConflictError, InvalidCredentialsError, isUniqueViolation } from '../errors';
import type { LoginBody, RegisterBody } from '../schemas';
import type { UserRepository } from '../repositories/user.repository';
import type { TokenService } from './token.service';

const BCRYPT_COST = 12;

/** Compared against when the email is unknown so both paths cost the same. */
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-only', BCRYPT_COST);

export interface UserDto {
  id: string;
  email: string;
}

export interface AuthResult {
  token: string;
  user: UserDto;
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly tokens: TokenService,
  ) {}

  async register(input: RegisterBody): Promise<AuthResult> {
    if (await this.users.findByEmail(input.email)) {
      throw new ConflictError('EMAIL_TAKEN', 'Email is already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    let user;
    try {
      user = await this.users.create({ email: input.email, passwordHash });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('EMAIL_TAKEN', 'Email is already registered');
      }
      throw err;
    }

    return this.toResult(user.id, user.email);
  }

  async login(input: LoginBody): Promise<AuthResult> {
    // Registration caps passwords at 72 bytes, and bcrypt would silently ignore the rest.
    // Such a password cannot be correct, so reject it without revealing anything about the account.
    if (Buffer.byteLength(input.password, 'utf8') > 72) {
      throw new InvalidCredentialsError();
    }

    const user = await this.users.findByEmail(input.email);
    const matches = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !matches) {
      throw new InvalidCredentialsError();
    }
    return this.toResult(user.id, user.email);
  }

  private toResult(id: string, email: string): AuthResult {
    return { token: this.tokens.sign(id), user: { id, email } };
  }
}
