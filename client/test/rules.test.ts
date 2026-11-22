import { describe, it, expect } from 'vitest';
import {
  validateActions,
  validateEmail,
  validatePasswordLogin,
  validatePasswordPolicy,
  validatePlaybookName,
  validateTrigger,
} from '../src/validation/rules';

describe('validateEmail', () => {
  it('requires a value', () => {
    expect(validateEmail('')).toBe('Email is required');
    expect(validateEmail('   ')).toBe('Email is required');
  });

  it('rejects a malformed address', () => {
    expect(validateEmail('not-an-email')).toBe('Enter a valid email address');
    expect(validateEmail('a@b')).toBe('Enter a valid email address');
    expect(validateEmail('a b@c.com')).toBe('Enter a valid email address');
  });

  it('accepts a well-formed address', () => {
    expect(validateEmail('alice@example.com')).toBeUndefined();
  });
});

describe('validatePasswordLogin', () => {
  it('requires a value but does not apply the policy', () => {
    expect(validatePasswordLogin('')).toBe('Password is required');
    expect(validatePasswordLogin('x')).toBeUndefined();
  });
});

describe('validatePasswordPolicy', () => {
  it('requires a value', () => {
    expect(validatePasswordPolicy('')).toBe('Password is required');
  });

  it('enforces at least 8 characters', () => {
    expect(validatePasswordPolicy('abc1')).toBe('Password must be at least 8 characters');
  });

  it('requires a letter', () => {
    expect(validatePasswordPolicy('12345678')).toBe('Password must include a letter');
  });

  it('requires a digit', () => {
    expect(validatePasswordPolicy('abcdefgh')).toBe('Password must include a digit');
  });

  it('allows 72 bytes and rejects more', () => {
    const atLimit = 'a1'.repeat(36);
    expect(new TextEncoder().encode(atLimit).length).toBe(72);
    expect(validatePasswordPolicy(atLimit)).toBeUndefined();

    const overLimit = 'a1'.repeat(36) + 'a';
    expect(validatePasswordPolicy(overLimit)).toBe('Password must be 72 bytes or fewer');
  });

  it('counts bytes, not characters, for multi-byte input', () => {
    // 38 characters but 74 bytes: each accented letter is two bytes in UTF-8.
    const password = 'a1' + 'é'.repeat(36);
    expect(validatePasswordPolicy(password)).toBe('Password must be 72 bytes or fewer');
  });

  it('accepts a valid password', () => {
    expect(validatePasswordPolicy('secret123')).toBeUndefined();
  });
});

describe('validatePlaybookName', () => {
  it('trims and requires a non-blank name', () => {
    expect(validatePlaybookName('')).toBe('Name is required');
    expect(validatePlaybookName('   ')).toBe('Name is required');
    expect(validatePlaybookName('  Contain  ')).toBeUndefined();
  });

  it('allows 100 characters and rejects 101', () => {
    expect(validatePlaybookName('a'.repeat(100))).toBeUndefined();
    expect(validatePlaybookName('a'.repeat(101))).toBe('Name must be 100 characters or fewer');
  });
});

describe('validateTrigger', () => {
  it('requires a trigger', () => {
    expect(validateTrigger('')).toBe('Choose a trigger');
    expect(validateTrigger('t1')).toBeUndefined();
  });
});

describe('validateActions', () => {
  it('requires at least one action', () => {
    expect(validateActions([])).toBe('Choose at least one action');
  });

  it('accepts one to three actions', () => {
    expect(validateActions(['a1'])).toBeUndefined();
    expect(validateActions(['a1', 'a2'])).toBeUndefined();
    expect(validateActions(['a1', 'a2', 'a3'])).toBeUndefined();
  });

  it('rejects more than three actions', () => {
    expect(validateActions(['a1', 'a2', 'a3', 'a4'])).toBe('Choose up to 3 actions');
  });
});
