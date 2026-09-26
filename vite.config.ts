import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

/** 区块生成用到的源码与数据（地点锚来自诗词数据）：它们一变，浏览器里缓存的区块就作废 */
const WORLD_SOURCES = ['src/world', 'src/workers', 'src/config', 'src/utils', 'public/data/landmask.bin', 'public/data/poems.json'].map((p) => resolve(import.meta.dirname, p))

const walk = (p: string): string[] => (statSync(p).isDirectory() ? readdirSync(p).sort().flatMap((n) => walk(join(p, n))) : [p])

/** 构建号：世界生成源码的内容指纹（源码不变，缓存跨构建、跨重启一直有效；改了一行就全部重算） */
function worldBuild(): string {
  const h = createHash('sha1')
  for (const f of WORLD_SOURCES.flatMap(walk)) h.update(relative(import.meta.dirname, f)).update(readFileSync(f))
  return h.digest('hex').slice(0, 12)
}

/**
 * 开发时改了世界生成源码：构建号是编译期常量、热更新换不掉，
 * 于是重启开发服务器（重新读配置、算新构建号），页面随之整页刷新——否则浏览器会一直用改动前缓存的旧区块。
 */
function worldCacheReset(): Plugin {
  return {
    name: 'world-cache-reset',
    apply: 'serve',
    configureServer(server) {
      let timer: ReturnType<typeof setTimeout> | null = null
      server.watcher.on('change', (file) => {
        const f = resolve(file)
        if (!WORLD_SOURCES.some((p) => f === p || f.startsWith(p + '\\') || f.startsWith(p + '/'))) return
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => void server.restart(), 300)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), worldCacheReset()],
  worker: { format: 'es' },
  define: { __WORLD_BUILD__: JSON.stringify(worldBuild()) },
  server: { port: 5188 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
