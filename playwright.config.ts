import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// 若当前 Playwright 需要的浏览器未安装，则回退到本机已缓存的其他版本 Chromium，
// 保证 CI/本机没有下载权限时 E2E 仍可运行。
const cacheRoot = join(homedir(), 'Library', 'Caches', 'ms-playwright')
const expected = join(cacheRoot, 'chromium-1234')
const fallbackCandidates = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  join(cacheRoot, 'chromium-1208', 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
  join(cacheRoot, 'chromium-1208', 'chrome-mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
  join(cacheRoot, 'chromium-1148', 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
]
const fallback = fallbackCandidates.find((p) => existsSync(p))
const useExecutable = !existsSync(expected) && Boolean(fallback)

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
    launchOptions: useExecutable && fallback ? { executablePath: fallback } : {},
  },
  webServer: {
    command: 'pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 30000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
})
