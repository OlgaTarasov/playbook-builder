import { execSync } from 'node:child_process';

/**
 * Runs once before the test run. Applies migrations (including the seed) to
 * TEST_DATABASE_URL. When the variable is unset, integration suites are
 * skipped and a warning is printed.
 */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn(
      '\n[integration] TEST_DATABASE_URL is not set. Integration tests are SKIPPED. ' +
        'Set it to a MySQL database dedicated to tests (for example playbooks_test).\n',
    );
    return;
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
  });
}
