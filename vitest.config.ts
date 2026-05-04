import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Tests that depend on local BMS fixture libraries (e.g. S:/BMS Library/...)
// are skipped by default so CI on machines without those drives passes.
// Set INTEGRATION=1 to include them locally.
const INTEGRATION_TEST_FILES = [
  'tests/writer.test.ts',
  'tests/parser.test.ts',
  'tests/extreme.test.ts',
  'tests/stress.test.ts',
];

const isIntegration = process.env.INTEGRATION === '1';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: isIntegration
      ? ['node_modules/**', 'dist/**']
      : ['node_modules/**', 'dist/**', ...INTEGRATION_TEST_FILES],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
