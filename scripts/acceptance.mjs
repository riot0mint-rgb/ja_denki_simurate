/**
 * 受け入れテスト（フェーズ9）。
 *
 *   npm install --no-save playwright   # 一度だけ
 *   npm run build
 *   npm run accept
 *
 * 単体テストは部品が正しいことを見ます。ここは**配る物そのもの**を、
 * 本物のブラウザで、HTTP 経由で、Service Worker を動かした状態で通します。
 * 単体テストでは絶対に捕まらないもの（オフライン動作・印刷の見た目・
 * 実画面に出る金額）だけを対象にします。
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
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
}

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

const results = []
const check = (id, title, ok, detail = '') => {
  results.push({ id, title, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${id}  ${title}${detail ? `  — ${detail}` : ''}`)
}

const browser = await chromium.launch(
  existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}
)

/** 検針票から試算して結果画面まで進む */
async function runDetailed(page, scenario, usage = '348', period) {
  await page.goto(origin)
  await page.waitForSelector('button')
  await page.getByRole('button', { name: '検針票から試算する' }).click()
  await page.waitForTimeout(250)
  await page.selectOption('#scenario', scenario)
  if (period) await page.selectOption('#period', period)
  await page.waitForTimeout(150)
  for (const el of await page.$$('input[type=number]:visible')) {
    if (!(await el.inputValue())) await el.fill(usage)
  }
  const go = page.getByRole('button', { name: '詳しい結果を見る' })
  if (await go.isDisabled()) return false
  await go.click()
  await page.waitForTimeout(300)
  return true
}

// ───────────────────────────────────────────────────────────
// A1: 公式試算表の基準ケースが、画面にそのまま出る
// ───────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  await runDetailed(page, 'chugoku_juryo_a', '348', '2026-4')
  const table = await page.getByRole('table', { name: '料金比較表' }).innerText()
  // 出典: ①26年4月適用「シミュレーション結果」AI13 / AO13 / AR13
  const expected = [
    ['中国電力 従量電灯A', '10,711'],
    ['JAでんき 従量電灯A', '10,275'],
    ['JAでんき 従量電灯S', '10,515']
  ]
  const missing = expected.filter(([, yen]) => !table.includes(yen))
  check(
    'A1',
    '公式試算表 348kWh（26年4月適用）の金額が画面に出る',
    missing.length === 0,
    missing.length ? `画面に無い: ${missing.map(m => m.join(' ')).join(' / ')}` : '3プランとも一致'
  )
  await ctx.close()
}

// ───────────────────────────────────────────────────────────
// A2: 全シナリオが結果まで到達し、「計算できません」を出さない
// ───────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(origin)
  await page.waitForSelector('button')
  await page.getByRole('button', { name: '検針票から試算する' }).click()
  await page.waitForTimeout(250)
  const scenarios = await page.$$eval('#scenario option', os =>
    os.map(o => ({ value: o.value, label: o.textContent }))
  )
  const failed = []
  for (const s of scenarios) {
    const reached = await runDetailed(page, s.value)
    if (!reached) {
      failed.push(`${s.label}（入力が埋まらない）`)
      continue
    }
    const body = await page.innerText('body')
    if (!/年間の想定|年間の料金は同額/.test(body)) failed.push(`${s.label}（年額が出ない）`)
    if (/自動計算に対応していません/.test(body)) failed.push(`${s.label}（unsupported）`)
  }
  check('A2', `全${scenarios.length}シナリオが結果まで到達する`, failed.length === 0, failed.join(' / '))
  await ctx.close()
}

// ───────────────────────────────────────────────────────────
// A3: かんたん試算（電気料金だけで試算できる）
// ───────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(origin)
  await page.waitForSelector('button')
  await page.getByRole('button', { name: /かんたん試算/ }).click()
  await page.waitForTimeout(250)
  await page.fill('#simple-bill', '9000')
  await page.getByRole('button', { name: '詳しい結果を見る' }).click()
  await page.waitForTimeout(350)
  const body = await page.innerText('body')
  const gotAnnual = /年間/.test(body) && /kWh/.test(body)
  const saysEstimate = /およそ|目安|概算|逆算/.test(body)
  check('A3', 'かんたん試算が電気料金だけで年額を出す', gotAnnual && saysEstimate,
    !gotAnnual ? '年額または使用量が出ない' : saysEstimate ? '概算である旨も表示' : '⚠ 概算である旨の表示が無い')
  await ctx.close()
}

// ───────────────────────────────────────────────────────────
// A4: オフラインでも試算できる（Service Worker）
// ───────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(origin)
  await page.waitForSelector('button')
  // Service Worker が制御を取るまで待つ
  const controlled = await page.waitForFunction(
    () => navigator.serviceWorker?.controller != null,
    null,
    { timeout: 15000 }
  ).then(() => true).catch(() => false)

  let offlineOk = false
  if (controlled) {
    await ctx.setOffline(true)
    await page.reload().catch(() => {})
    await page.waitForTimeout(800)
    offlineOk = await runDetailed(page, 'chugoku_juryo_a', '348').catch(() => false)
    if (offlineOk) {
      const body = await page.innerText('body')
      offlineOk = /年間の想定/.test(body)
    }
    await ctx.setOffline(false)
  }
  check('A4', '電波が無くても試算できる', controlled && offlineOk,
    !controlled ? 'Service Worker が制御を取らなかった' : offlineOk ? 'オフラインで結果まで到達' : 'オフラインで結果が出ない')
  await ctx.close()
}

// ───────────────────────────────────────────────────────────
// A5: 紙に単価の出典と試算日が載り、操作用の部品は載らない
// ───────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  await runDetailed(page, 'chugoku_juryo_a', '348')
  await page.emulateMedia({ media: 'print' })
  // 印刷用スタイルが当たるまで待つ。選ばれていない側が消えたら適用済み
  await page
    .waitForFunction(() => {
      const off = document.querySelector('.segmented-btn:not(.is-on)')
      return off === null || getComputedStyle(off).display === 'none'
    }, null, { timeout: 5000 })
    .catch(() => {})
  // 印刷用スタイルの再計算を1フレーム待つ。直後に読むと古い値が返ることがある
  await page.evaluate(
    () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  )
  await page.waitForTimeout(200)
  const printed = await page.evaluate(() => {
    // offsetParent が null なら祖先ごと隠れている。
    // 結果画面の裏で入力画面を display:none で保持しているので、そこを数えない
    const shown = el => el.offsetParent !== null
    const texts = [...document.querySelectorAll('body *')]
      .filter(shown)
      .map(el => el.textContent ?? '')
      .join(' ')
    // 選ばれている見積もり方だけは「情報」として紙に残す。それ以外の操作部品は出さない
    const controls = [...document.querySelectorAll('button')].filter(
      el => shown(el) && !el.classList.contains('is-on')
    )
    const chosen = document.querySelector('.segmented-btn.is-on')
    const chosenStyle = chosen ? getComputedStyle(chosen) : null
    return {
      texts,
      controls: controls.map(el => (el.textContent ?? '').trim()),
      inputs: [...document.querySelectorAll('input, select')].filter(shown).length,
      chosenLooksLikeText:
        chosenStyle === null ||
        (chosenStyle.backgroundColor === 'rgba(0, 0, 0, 0)' &&
          chosenStyle.borderTopWidth === '0px'),
      chosenStyleSeen: chosenStyle
        ? `背景=${chosenStyle.backgroundColor} 枠線=${chosenStyle.borderTopWidth}`
        : '切り替えが出ていない'
    }
  })
  check('A5', '紙に単価の出典が載る', printed.texts.includes('単価の出典'))
  check('A5b', '紙に操作用のボタン・入力欄が出ない', printed.controls.length === 0 && printed.inputs === 0,
    `ボタン ${printed.controls.length} 個（${printed.controls.join(' / ')}）／入力欄 ${printed.inputs} 個`)
  check('A5c', '選んだ見積もり方は紙に文字として残る', printed.chosenLooksLikeText, printed.chosenStyleSeen)
  await ctx.close()
}

// ───────────────────────────────────────────────────────────
// A6: 個人情報の入力欄がどこにも無い
// ───────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  const PII = ['お名前', '氏名', '住所', '電話', 'メール', 'お客様番号', '供給地点']
  const hits = []
  for (const nav of ['検針票から試算する', /かんたん試算/]) {
    await page.goto(origin)
    await page.waitForSelector('button')
    await page.getByRole('button', { name: nav }).click()
    await page.waitForTimeout(250)
    const body = await page.innerText('body')
    for (const p of PII) if (body.includes(p)) hits.push(p)
    // 自由記述の入力欄があってはいけない
    const free = await page.$$eval('input, textarea', els =>
      els.filter(e => e.tagName === 'TEXTAREA' || ['text', 'email', 'tel'].includes(e.type)).length
    )
    if (free > 0) hits.push(`自由記述の入力欄 ${free} 個`)
  }
  check('A6', '個人情報の入力欄・表記がどこにも無い', hits.length === 0, hits.join(' / '))
  await ctx.close()
}

// ───────────────────────────────────────────────────────────
// A7: 狭いスマホ（320px）で横スクロールも文字切れも起きない
// ───────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 320, height: 800 } })
  const page = await ctx.newPage()
  await runDetailed(page, 'chugoku_low_voltage', '9000')
  for (const d of await page.$$('details')) await d.evaluate(x => (x.open = true))
  await page.waitForTimeout(200)
  const overflow = await page.evaluate(() => {
    const de = document.documentElement
    const scrollable = el => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX
        if (ox === 'auto' || ox === 'scroll') return true
      }
      return false
    }
    const page = de.scrollWidth > de.clientWidth
    let clipped = 0
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length) continue
      const cs = getComputedStyle(el)
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.textOverflow === 'ellipsis') continue
      if (!scrollable(el) && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) clipped++
    }
    return { page, clipped }
  })
  check('A7', '320px で横スクロール・文字切れが無い', !overflow.page && overflow.clipped === 0,
    `横スクロール ${overflow.page ? 'あり' : 'なし'} / 文字切れ ${overflow.clipped} 箇所`)
  await ctx.close()
}

// ───────────────────────────────────────────────────────────
// A8: 安くならない場合も正直に表示する
// ───────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  // auでんきの燃調は中国エリアと別建てで、月によって有利不利が入れ替わる。
  // JAのほうが高くなることが分かっている 2026年7月で確かめる
  await runDetailed(page, 'au_m_plan', '348', '2026-7')
  const body = await page.innerText('body')
  check('A8', '高くなる場合は「ご負担増」と明示する（auでんき・26年7月）', /ご負担増/.test(body))
  await ctx.close()
}

// ───────────────────────────────────────────────────────────
// A9: 検索避けと社内向け表記
// ───────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(origin)
  await page.waitForSelector('button')
  const robots = await page.getAttribute('meta[name="robots"]', 'content')
  const body = await page.innerText('body')
  check('A9', 'noindex が入っている', /noindex/.test(robots ?? ''), robots ?? 'meta が無い')
  check('A9b', '画面に「JA職員向け」と書いてある', body.includes('JA職員向け'))
  const txt = await page.goto(`${origin}/robots.txt`).then(r => r.text()).catch(() => '')
  check('A9c', 'robots.txt が Disallow を返す', /Disallow:\s*\/\s*$/m.test(txt))
  await ctx.close()
}

await browser.close()
server.close()

const failed = results.filter(r => !r.ok)
console.log('')
console.log(`${results.length - failed.length}/${results.length} 件合格`)
if (failed.length) {
  console.log('')
  console.log('不合格:')
  for (const f of failed) console.log(`  ${f.id} ${f.title} — ${f.detail}`)
}
process.exit(failed.length ? 1 : 0)
