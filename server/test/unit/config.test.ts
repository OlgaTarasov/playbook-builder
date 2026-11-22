import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';

const VALID_SECRET = 'x'.repeat(32);

describe('loadConfig', () => {
  it('throws when JWT_SECRET is missing', () => {
    expect(() => loadConfig({ DATABASE_URL: 'mysql://u:p@h/db' })).toThrow(/JWT_SECRET/);
  });

  it('throws when JWT_SECRET is shorter than 32 characters', () => {
    expect(() =>
      loadConfig({ DATABASE_URL: 'mysql://u:p@h/db', JWT_SECRET: 'x'.repeat(31) }),
    ).toThrow(/at least 32 characters/);
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => loadConfig({ JWT_SECRET: VALID_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('defaults PORT to 4000', () => {
    const config = loadConfig({ DATABASE_URL: 'mysql://u:p@h/db', JWT_SECRET: VALID_SECRET });
    expect(config.port).toBe(4000);
  });

  it('parses PORT as an integer', () => {
    const config = loadConfig({
      DATABASE_URL: 'mysql://u:p@h/db',
      JWT_SECRET: VALID_SECRET,
      PORT: '8080',
    });
    expect(config.port).toBe(8080);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() =>
      loadConfig({ DATABASE_URL: 'mysql://u:p@h/db', JWT_SECRET: VALID_SECRET, PORT: 'abc' }),
    ).toThrow(/PORT/);
  });
});
