import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/helpers/globalSetup.ts'],
    // Integration files share one database and truncate it between tests.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
