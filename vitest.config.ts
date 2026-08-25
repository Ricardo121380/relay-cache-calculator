import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // 多个 jsdom 工作进程会争抢 CPU，导致正常交互用例误触 5 秒超时。
    // 限制并发不改变断言或测试超时，只让整套测试在本机与 CI 中稳定复现。
    maxWorkers: 4,
  },
})
