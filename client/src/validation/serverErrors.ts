import type { ErrorDetail } from '../api/types';
import { ApiError } from '../api/apiClient';
import { MESSAGES } from './messages';

/** Text to show for any thrown value: the server message for ApiError, a generic fallback otherwise. */
export function messageFromError(error: unknown): string {
  return error instanceof ApiError ? error.message : MESSAGES.unexpectedError;
}

export interface MappedErrors {
  fieldErrors: Record<string, string>;
  unmatched: string[];
}

/**
 * Maps server validation details onto form fields by the first path segment.
 * Details whose path is not one of `fields` are returned as banner messages.
 */
export function mapDetailsToFields(details: ErrorDetail[], fields: readonly string[]): MappedErrors {
  const fieldErrors: Record<string, string> = {};
  const unmatched: string[] = [];
  for (const detail of details) {
    const field = detail.path.split('.')[0];
    if (fields.includes(field) && !fieldErrors[field]) {
      fieldErrors[field] = detail.message;
    } else if (!fields.includes(field)) {
      unmatched.push(detail.message);
    }
  }
  return { fieldErrors, unmatched };
}
