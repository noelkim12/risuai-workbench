import { configDefaults, defineConfig } from 'vitest/config';

const runsPerfTests = process.argv.some((argument) => argument.includes('tests/perf/'));

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, ...(runsPerfTests ? [] : ['tests/perf/**'])],
  },
});
