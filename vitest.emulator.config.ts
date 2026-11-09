import { defineConfig } from 'vitest/config';

// 에뮬레이터에 붙는 통합 테스트(npm run test:emulator). 에뮬레이터는 firebase emulators:exec가 띄운다.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.emulator.test.ts', 'scripts/**/*.emulator.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
