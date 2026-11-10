import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    exclude: ['node_modules', '.next', 'e2e', 'cloudflare', '.claude'],
    hookTimeout: 30000,
    testTimeout: 15000,
    // Integration tests share one real (test) database and reset it via TRUNCATE in
    // beforeEach — running test files in parallel races concurrent truncates against
    // concurrent inserts from other files (unique-constraint collisions, flaky reads).
    // Must run sequentially since all files share the same physical DB with no per-file
    // isolation (schema-per-worker would be the alternative, not worth the complexity here).
    fileParallelism: false,
  },
});
