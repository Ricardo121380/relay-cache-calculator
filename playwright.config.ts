import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export default defineConfig({
  testDir: './tests',
  timeout: 45000,
  fullyParallel: true,
  forbidOnly: true,
  retries: 1,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    browserName: 'chromium',
    launchOptions: existsSync(localChrome) ? { executablePath: localChrome } : {},
  },
  webServer: {
    command: 'pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 30000,
  },
  projects: [{ name: 'chromium' }],
})
