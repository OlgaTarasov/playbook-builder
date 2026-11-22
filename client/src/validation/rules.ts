import { MESSAGES } from './messages';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
export const PLAYBOOK_NAME_MAX = 100;
export const ACTIONS_MAX = 3;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return MESSAGES.emailRequired;
  if (!EMAIL_PATTERN.test(email)) return MESSAGES.emailInvalid;
  return undefined;
}

export function validatePasswordLogin(value: string): string | undefined {
  if (!value) return MESSAGES.passwordRequired;
  return undefined;
}

/** Mirrors the server rule: 8+ characters, a letter, a digit, at most 72 bytes. */
export function validatePasswordPolicy(value: string): string | undefined {
  if (!value) return MESSAGES.passwordRequired;
  if (value.length < PASSWORD_MIN_LENGTH) return MESSAGES.passwordTooShort;
  if (!/[A-Za-z]/.test(value)) return MESSAGES.passwordNeedsLetter;
  if (!/[0-9]/.test(value)) return MESSAGES.passwordNeedsDigit;
  if (new TextEncoder().encode(value).length > PASSWORD_MAX_BYTES) return MESSAGES.passwordTooLong;
  return undefined;
}

export function validatePlaybookName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return MESSAGES.nameRequired;
  if (name.length > PLAYBOOK_NAME_MAX) return MESSAGES.nameTooLong;
  return undefined;
}

export function validateTrigger(triggerId: string): string | undefined {
  if (!triggerId) return MESSAGES.triggerRequired;
  return undefined;
}

export function validateActions(actionIds: string[]): string | undefined {
  if (actionIds.length === 0) return MESSAGES.actionsRequired;
  if (actionIds.length > ACTIONS_MAX) return MESSAGES.actionsTooMany;
  return undefined;
}
