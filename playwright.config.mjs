import { defineConfig } from '@playwright/test';

// Extensions need a real browser and a persistent profile, so these run headed
// and one at a time. They are slower than `npm test` on purpose: they are the
// only thing that sees what a browser actually does with this code.
export default defineConfig({
  testDir: './smoke',
  testMatch: '**/*.smoke.mjs',
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list']],
  use: { trace: 'retain-on-failure' }
});
