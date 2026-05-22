/**
 * Webview 패키지 Vitest 실행 범위를 정의함.
 * @file packages/webview/vitest.config.ts
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
