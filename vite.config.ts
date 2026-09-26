import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  // 构建号：浏览器里的区块缓存按它作废（每次构建、每次启动开发服务器都换新）
  define: { __WORLD_BUILD__: JSON.stringify(String(Date.now())) },
  server: { port: 5188 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
