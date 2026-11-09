import { defineConfig } from 'vitest/config';

// 빌드한 확장 프로그램을 Playwright로 띄우는 E2E(npm run test:e2e). 로컬에서만 돌린다(CI에는 넣지 않는다).
// Playwright는 PLAYWRIGHT_MODULE(기본 ~/.cache/design-tools의 playwright)에서 불러온다.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/**/*.e2e.test.ts'],
    testTimeout: 120000,
    hookTimeout: 120000,
    fileParallelism: false,
  },
});
