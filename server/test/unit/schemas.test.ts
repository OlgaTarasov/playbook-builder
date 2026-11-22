import { describe, expect, it } from 'vitest';
import { email, passwordPolicy, playbookBody, registerBody } from '../../src/schemas';

const UUID_A = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const UUID_B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const UUID_C = '9b2e1f3a-7c4d-4e5f-8a6b-1c2d3e4f5a6b';
const UUID_D = '0f8fad5b-d9cb-469f-a165-8c2d1d3a4b5c';

const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }): string[] =>
  r.success ? [] : (r.error?.issues ?? []).map((i) => i.message);

describe('email', () => {
  it('trims and lowercases', () => {
    expect(email.parse('  Alice@Example.COM ')).toBe('alice@example.com');
  });

  it('rejects malformed addresses', () => {
    expect(email.safeParse('not-an-email').success).toBe(false);
    expect(email.safeParse('').success).toBe(false);
  });
});

describe('password policy', () => {
  it('accepts a letter and a digit with at least 8 characters', () => {
    expect(passwordPolicy.safeParse('abc12345').success).toBe(true);
  });

  it('rejects fewer than 8 characters', () => {
    expect(messages(passwordPolicy.safeParse('abc1234'))).toContain(
      'Password must be at least 8 characters',
    );
  });

  it('rejects a password without a letter', () => {
    expect(messages(passwordPolicy.safeParse('12345678'))).toContain(
      'Password must include a letter and a digit',
    );
  });

  it('rejects a password without a digit', () => {
    expect(messages(passwordPolicy.safeParse('abcdefgh'))).toContain(
      'Password must include a letter and a digit',
    );
  });

  it('accepts exactly 72 bytes', () => {
    expect(passwordPolicy.safeParse('a'.repeat(70) + '12').success).toBe(true);
  });

  it('rejects 73 bytes', () => {
    expect(messages(passwordPolicy.safeParse('a'.repeat(71) + '12'))).toContain(
      'Password must be at most 72 bytes',
    );
  });

  it('counts bytes, not characters', () => {
    // 37 two-byte characters (74 bytes) plus "a1" is 76 bytes but only 39 characters.
    expect(messages(passwordPolicy.safeParse('é'.repeat(37) + 'a1'))).toContain(
      'Password must be at most 72 bytes',
    );
  });

  it('is applied through registerBody', () => {
    const r = registerBody.safeParse({ email: 'a@b.com', password: 'short' });
    expect(r.success).toBe(false);
  });
});

describe('playbook body', () => {
  const base = { name: 'Critical Response', triggerId: UUID_A, actionIds: [UUID_B] };

  it('trims the name', () => {
    expect(playbookBody.parse({ ...base, name: '  Response  ' }).name).toBe('Response');
  });

  it('rejects a blank name after trimming', () => {
    expect(playbookBody.safeParse({ ...base, name: '     ' }).success).toBe(false);
  });

  it('accepts a 100-character name and rejects 101', () => {
    expect(playbookBody.safeParse({ ...base, name: 'a'.repeat(100) }).success).toBe(true);
    expect(playbookBody.safeParse({ ...base, name: 'a'.repeat(101) }).success).toBe(false);
  });

  it('requires between 1 and 3 actions', () => {
    expect(playbookBody.safeParse({ ...base, actionIds: [] }).success).toBe(false);
    expect(playbookBody.safeParse({ ...base, actionIds: [UUID_B] }).success).toBe(true);
    expect(
      playbookBody.safeParse({ ...base, actionIds: [UUID_B, UUID_C, UUID_D] }).success,
    ).toBe(true);
    expect(
      playbookBody.safeParse({ ...base, actionIds: [UUID_B, UUID_C, UUID_D, UUID_A] }).success,
    ).toBe(false);
  });

  it('requires distinct action ids', () => {
    const r = playbookBody.safeParse({ ...base, actionIds: [UUID_B, UUID_B] });
    expect(r.success).toBe(false);
    expect(messages(r)).toContain('Action ids must be distinct');
  });

  it('requires a UUID triggerId', () => {
    expect(playbookBody.safeParse({ ...base, triggerId: 'nope' }).success).toBe(false);
  });
});
