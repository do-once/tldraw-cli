import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '__tests__/e2e-browser',
  timeout: 30000,
  retries: 0,
  // 单 worker：所有测试共用同一个 Host，串行执行避免多个 Runtime 并发导致状态污染
  workers: 1,
  use: {
    headless: false,
    viewport: { width: 1280, height: 720 },
  },
  globalSetup: './__tests__/e2e-browser/global-setup.ts',
  globalTeardown: './__tests__/e2e-browser/global-teardown.ts',
})
