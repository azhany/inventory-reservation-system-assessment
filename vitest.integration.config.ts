import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'node',
    include: [
      'tests/integration/**/*.test.ts',
      'tests/concurrency/**/*.test.ts',
    ],
    testTimeout: 15_000,
  },
});
