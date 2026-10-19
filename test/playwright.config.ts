import { defineConfig, devices } from '@playwright/test'

// The app keeps a single SQLite portfolio, so e2e specs share state: they run serially, in file order.
export default defineConfig({
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  projects: [
    {
      name: 'e2e',
      testDir: './e2e',
      timeout: 30_000,
      expect: { timeout: 10_000 },
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.BASE_URL ?? 'http://localhost:8000',
        viewport: { width: 1600, height: 1000 },
        trace: 'retain-on-failure',
      },
    },
    { name: 'unit', testDir: './unit' },
  ],
})
