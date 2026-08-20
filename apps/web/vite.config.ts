import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * public/sw.js のプレースホルダを実際のビルド成果物で埋める。
 *
 * アセット名はハッシュ付きなので、プリキャッシュ一覧はビルド後にしか分からない。
 * キャッシュ名も成果物のハッシュから作り、内容が変わったときだけ更新が走るようにする。
 */
/**
 * 置かれているロゴファイル。無ければ null。
 *
 * 実行時に読みに行って 404 を握りつぶす作りにすると、毎回コンソールに
 * エラーが2件出る。営業や職員が開発者ツールを開いたときに不安を与えるので、
 * ビルド時に決めてしまう。
 */
function findLogo(): string | null {
  for (const logo of ['/logo.svg', '/logo.png']) {
    if (existsSync(resolve(__dirname, 'public' + logo))) return logo
  }
  return null
}

const LOGO_SRC = findLogo()

function serviceWorkerManifest(): Plugin {
  const ALWAYS = ['/', '/index.html', '/manifest.json', '/icon-192x192.png', '/icon-512x512.png']
  // 存在しないURLを入れると cache.addAll が 404 で落ち、Service Worker が
  // 黙って入らなくなる（オフライン動作と更新バナーが死ぬ）
  if (LOGO_SRC) ALWAYS.push(LOGO_SRC)
  // ビルドごとに作り直す。使い回すと watch や連続ビルドで前回のハッシュ付き
  // ファイル名が残り、cache.addAll がその404で失敗して SW が入らなくなる。
  // 登録エラーは握りつぶしているので、オフライン動作と更新バナーが黙って死ぬ
  let precache = new Set<string>(ALWAYS)
  return {
    name: 'sw-manifest',
    apply: 'build',
    buildStart() {
      precache = new Set<string>(ALWAYS)
    },
    generateBundle(_options, bundle) {
      for (const file of Object.keys(bundle)) {
        if (file !== 'sw.js') precache.add('/' + file)
      }
    },
    closeBundle() {
      const swPath = resolve(__dirname, 'dist/sw.js')
      const urls = Array.from(precache).sort()
      const version = createHash('sha256').update(urls.join('|')).digest('hex').slice(0, 12)
      const source = readFileSync(swPath, 'utf-8')
        .replace('__CACHE_VERSION__', `ja-denki-${version}`)
        .replace('__PRECACHE_MANIFEST__', JSON.stringify(urls, null, 2))
      writeFileSync(swPath, source)
    }
  }
}

export default defineConfig({
  plugins: [react(), serviceWorkerManifest()],
  define: {
    __LOGO_SRC__: JSON.stringify(LOGO_SRC)
  },
  publicDir: 'public',
  server: {
    port: 5173,
    strictPort: false
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser'
  }
})
