export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIALS'
  | 'TRIGGER_NOT_ADDED'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'TRIGGER_ALREADY_ADDED'
  | 'PLAYBOOK_NAME_TAKEN'
  | 'INTERNAL';

export interface ErrorDetail {
  path: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: ErrorDetail[]) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Trigger has not been added') {
    super(403, 'TRIGGER_NOT_ADDED', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ConflictError extends AppError {
  constructor(
    code: 'EMAIL_TAKEN' | 'TRIGGER_ALREADY_ADDED' | 'PLAYBOOK_NAME_TAKEN',
    message: string,
  ) {
    super(409, code, message);
  }
}

/** True when an error is a Prisma unique-constraint violation (P2002). */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}
