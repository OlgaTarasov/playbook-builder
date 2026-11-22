import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, ValidationError, type ErrorDetail } from '../errors';

interface ErrorBody {
  error: { code: string; message: string; details?: ErrorDetail[] };
}

function send(res: Parameters<ErrorRequestHandler>[2], status: number, body: ErrorBody): void {
  res.status(status).json(body);
}

/** Body-parser errors carry a `type` such as 'entity.parse.failed'. */
function bodyParserType(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'type' in err
    ? String((err as { type: unknown }).type)
    : undefined;
}

/**
 * Single place that turns errors into the JSON error shape. Internal details
 * (stack traces, Prisma messages) are logged on the server only.
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    const body: ErrorBody = { error: { code: err.code, message: err.message } };
    if (err.details) body.error.details = err.details;
    return send(res, err.status, body);
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }));
    const v = new ValidationError('Request validation failed', details);
    return send(res, v.status, { error: { code: v.code, message: v.message, details } });
  }

  const type = bodyParserType(err);
  if (type === 'entity.parse.failed') {
    return send(res, 400, { error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON' } });
  }
  if (type === 'entity.too.large') {
    return send(res, 400, { error: { code: 'VALIDATION_ERROR', message: 'Request body too large' } });
  }

  console.error(err);
  return send(res, 500, { error: { code: 'INTERNAL', message: 'Unexpected error' } });
};
