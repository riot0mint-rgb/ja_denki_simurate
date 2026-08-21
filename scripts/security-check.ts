/**
 * 「入力した数字が端末の外に出ない」をコードで検査する（フェーズ9）。
 *
 *   npm run security:check
 *
 * ソース・ビルド成果物・Service Worker を見る。ビルド成果物が無いときは
 * その検査だけ省略する（CI では build のあとに走らせること）。
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, relative, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SourceFile,
  Finding,
  scanSource,
  scanBundle,
  scanHtml,
  scanServiceWorker,
  renderReport,
  hasBlocking
} from './securityCheck.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function walk(dir: string, match: (path: string) => boolean): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full, match))
    else if (match(full)) out.push(full)
  }
  return out
}

function load(paths: string[]): SourceFile[] {
  return paths.map(p => ({ path: relative(ROOT, p), content: readFileSync(p, 'utf-8') }))
}

const findings: Finding[] = []

// 1. アプリのソース
const sourceDirs = [resolve(ROOT, 'apps/web/src'), resolve(ROOT, 'packages/calc-core/src')]
const sources = load(sourceDirs.flatMap(d => walk(d, p => /\.[tj]sx?$/.test(p))))
findings.push(...scanSource(sources))
console.log(`ソース ${sources.length} ファイルを検査`)

// 2. Service Worker（fetch を使う唯一の場所なので個別の規則で見る）
const swPath = resolve(ROOT, 'apps/web/public/sw.js')
if (existsSync(swPath)) {
  findings.push(...scanServiceWorker(load([swPath])[0]))
  console.log('Service Worker の同一オリジン判定を確認')
}

// 3. ビルド成果物
const dist = resolve(ROOT, 'apps/web/dist')
if (existsSync(dist)) {
  const bundles = load(walk(join(dist, 'assets'), p => p.endsWith('.js')))
  findings.push(...scanBundle(bundles))
  const html = resolve(dist, 'index.html')
  if (existsSync(html)) findings.push(...scanHtml(load([html])[0]))
  console.log(`配布物 ${bundles.length} ファイルと index.html を検査`)
} else {
  console.log('※ apps/web/dist が無いため、配布物の検査は省略しました')
}

console.log('')
console.log(renderReport(findings))
process.exit(hasBlocking(findings) ? 1 : 0)
