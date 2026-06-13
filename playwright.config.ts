import { defineConfig } from '@playwright/test'

// Default to a locally served build so the specs run against the code in this
// repo, not a stale deploy. Point at a deployment with PLAYWRIGHT_BASE_URL for
// a prod smoke run (the feature specs only pass there once that work is live).
const LOCAL_URL = 'http://localhost:4188'
const external = process.env.PLAYWRIGHT_BASE_URL
if (!external) process.env.PLAYWRIGHT_BASE_URL = LOCAL_URL
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  // the lazy-chunk pages get flaky past two parallel browsers on a laptop,
  // and the ci runner gives us two workers anyway
  workers: 2,
  use: {
    baseURL: BASE_URL,
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: external
    ? undefined
    : {
        // preview serves dist, so run npm run build first (ci already does).
        // the dev server is too slow cold: the first lazy-modal click can
        // take 30s while deps optimize, which reads as a test failure.
        command: 'npx vite preview --port 4188 --strictPort',
        url: LOCAL_URL,
        timeout: 120000,
        reuseExistingServer: true,
      },
})
