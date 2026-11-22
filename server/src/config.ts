import { z } from 'zod';

export interface Config {
  databaseUrl: string;
  jwtSecret: string;
  port: number;
  cookieSecure: boolean;
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z
    .string({ required_error: 'JWT_SECRET is required' })
    .min(32, 'JWT_SECRET must be at least 32 characters'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
});

/**
 * Parses and validates environment variables. Throws at startup when a
 * required value is missing or invalid. Nothing else in the server reads
 * process.env.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid configuration: ${problems}`);
  }
  return {
    databaseUrl: parsed.data.DATABASE_URL,
    jwtSecret: parsed.data.JWT_SECRET,
    port: parsed.data.PORT,
    cookieSecure: parsed.data.COOKIE_SECURE === 'true',
  };
}
