/**
 * 静的な検査（npm run security:check）は「書かれていないこと」しか言えない。
 * こちらは実際にブラウザで画面を操作し、「起きていないこと」を確かめる。
 *
 *   npm install --no-save playwright   # 一度だけ
 *   npm run security:runtime
 *
 * 見るもの:
 *   1. 自分のオリジン以外への通信が1本も出ないこと
 *   2. 操作しきったあとも localStorage / sessionStorage / IndexedDB が空であること
 *   3. コンソールに入力した数字が出ていないこと
 *
 * CI には入れていない。ブラウザの取得が重く、静的な検査で日々の退行は止まるため。
 * リリース前に手元で1回走らせる（DEPLOY.md の受け入れ手順）。
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = resolve(ROOT, 'apps/web/dist')

if (!existsSync(DIST)) {
  console.error('apps/web/dist がありません。先に npm run build を実行してください')
  process.exit(1)
}

let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  console.error('playwright が見つかりません: npm install --no-save playwright')
  process.exit(1)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
}

// Service Worker は http(s) でしか登録できないので、file:// ではなく実際に配信する
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const rel = url.pathname === '/' ? '/index.html' : url.pathname
  const file = join(DIST, rel)
  if (!file.startsWith(DIST) || !existsSync(file)) {
    res.writeHead(404).end('not found')
    return
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`

const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'
const browser = await chromium.launch(existsSync(executablePath) ? { executablePath } : {})
const context = await browser.newContext()
const page = await context.newPage()

const external = []
const consoleLines = []
page.on('request', r => {
  if (!r.url().startsWith(origin) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) {
    external.push(`${r.method()} ${r.url()}`)
  }
})
page.on('console', m => consoleLines.push(m.text()))

// 検針票にありそうな、見つけやすい数字を入れる
const SECRET_USAGE = '4173'
const SECRET_BILL = '13579'

await page.goto(origin)
await page.waitForSelector('button')

// 1. 詳細シミュレーション（全プランを一巡する）
await page.getByRole('button', { name: '検針票から試算する' }).click()
await page.waitForTimeout(300)
const scenarios = await page.$$eval('#scenario option', os => os.map(o => o.value))
for (const s of scenarios) {
  await page.selectOption('#scenario', s)
  await page.waitForTimeout(120)
  for (const el of await page.$$('input[type=number]:visible')) {
    if (!(await el.inputValue())) await el.fill(SECRET_USAGE)
  }
  const go = page.getByRole('button', { name: '詳しい結果を見る' })
  if (await go.isDisabled()) continue
  await go.click()
  await page.waitForTimeout(200)
  for (const d of await page.$$('details')) await d.evaluate(x => (x.open = true))
  // 見積もり方の切り替えと、ガスセット割も踏む
  const seasonal = page.getByRole('button', { name: '季節で変わる' })
  if (await seasonal.count()) await seasonal.click()
  await page.waitForTimeout(150)
  await page.getByRole('button', { name: /戻る|条件を変/ }).first().click()
  await page.waitForTimeout(200)
}

// 2. かんたん試算
await page.goto(origin)
await page.waitForSelector('button')
await page.getByRole('button', { name: /かんたん試算/ }).click()
await page.waitForTimeout(300)
for (let step = 0; step < 6; step++) {
  for (const el of await page.$$('input[type=number]:visible')) {
    if (!(await el.inputValue())) await el.fill(SECRET_BILL)
  }
  const next = page.locator('button:visible', { hasText: /試算|結果|次|進む/ }).last()
  if (!(await next.count())) break
  await next.click()
  await page.waitForTimeout(250)
}

// 3. リロード（Service Worker を通した経路も踏む）
await page.reload()
await page.waitForTimeout(600)

const storage = await page.evaluate(async () => {
  const dbs = indexedDB.databases ? await indexedDB.databases() : []
  return {
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    idb: dbs.map(d => d.name),
    cookie: document.cookie
  }
})

await browser.close()
server.close()

const problems = []
if (external.length) problems.push(['外部への通信', external])
if (storage.local.length) problems.push(['localStorage に残った', storage.local])
if (storage.session.length) problems.push(['sessionStorage に残った', storage.session])
if (storage.idb.length) problems.push(['IndexedDB が作られた', storage.idb])
if (storage.cookie) problems.push(['Cookie が書かれた', [storage.cookie]])
const leaked = consoleLines.filter(l => l.includes(SECRET_USAGE) || l.includes(SECRET_BILL))
if (leaked.length) problems.push(['コンソールに入力値が出た', leaked])

console.log(`検査したシナリオ: ${scenarios.length}件 ＋ かんたん試算`)
console.log(`ページからの通信: 自オリジンのみ（外部 ${external.length} 本）`)
console.log(`保存API: localStorage ${storage.local.length} / sessionStorage ${storage.session.length} / IndexedDB ${storage.idb.length} / Cookie ${storage.cookie ? 'あり' : 'なし'}`)
console.log(`コンソール出力 ${consoleLines.length} 行、うち入力値を含むもの ${leaked.length} 行`)
console.log('')

if (problems.length === 0) {
  console.log('✓ 入力した数字は端末の外に出ていません（CLAUDE.md ルール7・9）')
  process.exit(0)
}
for (const [label, items] of problems) {
  console.log(`✗ ${label}:`)
  for (const i of items) console.log(`   ${i}`)
}
process.exit(1)
