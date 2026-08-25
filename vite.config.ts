import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // 本项目依赖 backdrop-filter、color-mix 与现代 AbortSignal；不再为旧浏览器
    // 生成无效兼容代码，减少主包体积并保持与实际支持矩阵一致。
    target: 'esnext',
    rollupOptions: {
      output: {
        // Decimal 是稳定、可长期缓存的计算依赖；拆分后业务主包保持轻量。
        manualChunks(id) {
          return id.includes('/decimal.js/') ? 'decimal' : undefined
        },
      },
    },
  },
})
