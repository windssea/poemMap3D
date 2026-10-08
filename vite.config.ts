import { execSync } from 'node:child_process'
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

/** 版本指纹：提交号（工作区有未提交改动时末尾带 +；部署环境没有 .git 时取环境变量 BUILD_COMMIT）、构建时间（北京时间）、世界构建号 */
function buildInfo(world: string): { commit: string; builtAt: string; world: string } {
  const git = (args: string): string => {
    try {
      return execSync(`git ${args}`, { cwd: import.meta.dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      return ''
    }
  }
  const sha = process.env.BUILD_COMMIT?.slice(0, 7) || git('rev-parse --short HEAD') || 'unknown'
  const dirty = !process.env.BUILD_COMMIT && git('status --porcelain --untracked-files=no') ? '+' : ''
  const builtAt = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')
  return { commit: sha + dirty, builtAt, world }
}

const WORLD = worldBuild()
const BUILD = buildInfo(WORLD)

/** 把版本指纹写进页面 meta，并输出 version.json——线上打开就知道对应哪个提交，不必猜打包文件名 */
function buildStamp(): Plugin {
  return {
    name: 'build-stamp',
    transformIndexHtml: (html) => html.replace('</head>', `  <meta name="build" content="${BUILD.commit} ${BUILD.builtAt} world:${BUILD.world}" />\n  </head>`),
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(BUILD, null, 2) + '\n' })
    },
  }
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
  plugins: [react(), worldCacheReset(), buildStamp()],
  worker: { format: 'es' },
  define: { __WORLD_BUILD__: JSON.stringify(WORLD), __BUILD_INFO__: JSON.stringify(BUILD) },
  server: { port: 5188 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
