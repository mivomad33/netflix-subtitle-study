import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    // 에뮬레이터가 필요한 통합 테스트는 npm run test:emulator로 따로 돌린다.
    exclude: [...configDefaults.exclude, '**/*.emulator.test.ts', 'e2e/**'],
  },
});
