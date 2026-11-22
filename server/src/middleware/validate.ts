import type { RequestHandler } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ValidationError, type ErrorDetail } from '../errors';

export interface ValidateSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
}

function toDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Validates body and/or params. Failures from both are merged into one
 * ValidationError so the error handler sees a single path. A valid body is
 * replaced by its parsed (trimmed, stripped) value.
 */
export function validate(schemas: ValidateSchemas): RequestHandler {
  return (req, _res, next) => {
    const details: ErrorDetail[] = [];

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) details.push(...toDetails(result.error));
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (result.success) {
        req.body = result.data;
      } else {
        details.push(...toDetails(result.error));
      }
    }

    if (details.length > 0) {
      return next(new ValidationError('Request validation failed', details));
    }
    next();
  };
}
