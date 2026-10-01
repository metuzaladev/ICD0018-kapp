import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit + HTTP tests run everywhere without a database; integration tests are opt-in.
    include: process.env.INTEGRATION ? ['test/integration/**/*.test.ts'] : ['test/unit/**/*.test.ts', 'test/http/**/*.test.ts'],
    env: { NODE_ENV: 'test' },
  },
});
