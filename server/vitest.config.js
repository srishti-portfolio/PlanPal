import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-that-is-long-enough-for-hs256-signing',
      BCRYPT_ROUNDS: '4',
      GEMINI_API_KEY: 'test-key',
    },
    coverage: { include: ['src/**'], exclude: ['src/index.js', 'src/db/migrate.js'] },
  },
});
