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

// ───────────────────────────────────────────────────────────
// A10: 商談ナビ — 素人が読み上げられる言葉が出て、押し売りに倒れない
// ───────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(origin)
  await page.waitForSelector('button')
  await page.getByRole('button', { name: '商談ナビをひらく' }).click()
  await page.waitForTimeout(300)
  const rail = page.getByRole('navigation', { name: '商談の進み方' })

  // 導入に、そのまま声に出せる言葉が出るか
  await rail.getByRole('button', { name: '導入' }).click()
  await page.waitForTimeout(200)
  const opening = await page.innerText('body')
  check('A10', '商談ナビに、そのまま読める言葉が出る', /このまま読めます/.test(opening) && /3分/.test(opening))

  // 台本に「なぜそう言うのか」が必ず添うか（棒読みを防ぐ）
  check('A10b', '台本に「なぜ」が添えられている', /なぜ：/.test(opening))

  // 押し売りの型に倒れていないか
  await rail.getByRole('button', { name: '手続き' }).click()
  await page.waitForTimeout(200)
  const closing = await page.innerText('body')
  check('A10c', 'クロージングに「決めるのはお客様」が入っている', /お決めになるのはお客様/.test(closing))
  check(
    'A10d',
    '「今日だけ」など期限を作らないよう戒めている',
    /「今日だけ」「今なら」と期限を作ること/.test(closing)
  )

  // おうかがいに個人情報の項目が無いか（ルール9）
  await rail.getByRole('button', { name: '聞く' }).click()
  await page.waitForTimeout(200)
  const hearing = await page.innerText('body')
  const pii = ['お名前', '氏名', 'ご住所', '電話番号', 'メールアドレス', 'お客様番号'].filter(w =>
    hearing.includes(w)
  )
  check('A10e', 'おうかがいに個人情報の項目が無い', pii.length === 0, pii.join(' / '))
  await ctx.close()
}

// ───────────────────────────────────────────────────────────
// A11: 商談ナビ → 試算 → 商談ナビ が一周する（戻れないと商談が止まる）
// ───────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(origin)
  await page.waitForSelector('button')
  await page.getByRole('button', { name: '商談ナビをひらく' }).click()
  await page.waitForTimeout(300)
  const rail = page.getByRole('navigation', { name: '商談の進み方' })

  await rail.getByRole('button', { name: '試算' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: '検針票から試算する' }).click()
  await page.waitForTimeout(250)
  await page.selectOption('#scenario', 'chugoku_juryo_a')
  await page.waitForTimeout(150)
  for (const el of await page.$$('input[type=number]:visible')) {
    if (!(await el.inputValue())) await el.fill('600')
  }
  await page.getByRole('button', { name: '詳しい結果を見る' }).click()
  await page.waitForSelector('.hero-figure')

  const back = page.getByRole('button', { name: '商談ナビにもどる' })
  check('A11', '試算のあと商談ナビに戻れる', (await back.count()) > 0)
  await back.click()
  await page.waitForTimeout(300)

  // 戻ってきた先で、試算の結果が確度に効いているか
  await rail.getByRole('button', { name: '振返' }).click()
  await page.waitForTimeout(200)
  const review = await page.innerText('body')
  check('A11b', 'ふりかえりに確度と次にいつ行くかが出る', /確度/.test(review) && /次に行くのは/.test(review))
  check('A11c', '次に行くときの口実が出る', /次に行くときの口実/.test(review))

  // 書き出す1行に、名簿へ書き写すぶんが入っているか
  const row = await page.locator('[aria-label="書き出す記録"]').innerText()
  const pii = ['様', '町', '丁目', '@']
  check('A11d', '書き出す1行に個人を特定できるものが入らない',
    pii.every(w => !row.includes(w)) && !row.includes('600'), row.slice(0, 60))

  // お断りを選んだら、点数に関係なく打ち切るか
  await page.getByRole('button', { name: /今後の訪問はご遠慮したい/ }).click()
  await page.waitForTimeout(200)
  const refused = await page.innerText('body')
  check('A11e', '訪問をお断りされたら、再訪の口実を出さない',
    /訪問不可/.test(refused) && !/次に行くときの口実/.test(refused))
  await ctx.close()
}

// ───────────────────────────────────────────────────────────
// A12: 集計は管理者向けに切り離されている（お客様の前で開かない）
// ───────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } })
  const page = await ctx.newPage()
  const requested = []
  page.on('request', r => requested.push(r.url()))

  await page.goto(origin)
  await page.waitForSelector('button')
  const staff = await page.innerText('body')
  check('A12', '職員向けの画面から集計へ行けない',
    !/営業の集計/.test(staff) && (await page.locator('a[href*="admin"]').count()) === 0)
  check('A12b', '職員向けの画面が admin のコードを読み込まない',
    requested.every(u => !/admin/.test(u)))

  // 管理者向けは単独で開き、職員向けとは別の名乗りをする
  await page.goto(`${origin}/admin.html`)
  await page.waitForSelector('textarea')
  const admin = await page.innerText('body')
  check('A12c', '管理者向けの画面はそれと分かる名乗りをする',
    /管理者向け/.test(admin) && !/JA職員向け/.test(admin))
  check('A12d', '管理者向けの画面から職員向けの試算へ行けない',
    !/試算をはじめる/.test(admin) && !/商談ナビをひらく/.test(admin))

  // Service Worker が職員の端末に管理者向けを持たせていないこと
  const sw = await (await fetch(`${origin}/sw.js`)).text()
  check('A12e', 'Service Worker が管理者向けを先読みしない', !/admin/.test(sw))
  await ctx.close()
}

// ───────────────────────────────────────────────────────────
// A13: 商談ナビと集計も 320px で崩れない
// ───────────────────────────────────────────────────────────
{
  const measure = async page => {
    for (const d of await page.$$('details')) await d.evaluate(x => (x.open = true))
    await page.waitForTimeout(200)
    return page.evaluate(() => {
      const de = document.documentElement
      const scrollable = el => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX
          if (ox === 'auto' || ox === 'scroll') return true
        }
        return false
      }
      let clipped = 0
      for (const el of document.querySelectorAll('body *')) {
        if (el.children.length) continue
        const cs = getComputedStyle(el)
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.textOverflow === 'ellipsis') continue
        if (!scrollable(el) && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) clipped++
      }
      return { page: de.scrollWidth > de.clientWidth, clipped }
    })
  }

  const ctx = await browser.newContext({ viewport: { width: 320, height: 800 } })
  const page = await ctx.newPage()
  await page.goto(origin)
  await page.waitForSelector('button')
  await page.getByRole('button', { name: '商談ナビをひらく' }).click()
  await page.waitForTimeout(300)
  const rail = page.getByRole('navigation', { name: '商談の進み方' })
  const bad = []
  for (const stage of ['聞く', '説明', '不安', '手続き', '振返']) {
    await rail.getByRole('button', { name: stage }).click()
    await page.waitForTimeout(200)
    const o = await measure(page)
    if (o.page || o.clipped > 0) bad.push(`${stage}(横${o.page ? 'あり' : 'なし'}/切れ${o.clipped})`)
  }
  check('A13', '商談ナビが 320px で崩れない', bad.length === 0, bad.join(' '))

  await page.goto(`${origin}/admin.html`)
  await page.waitForSelector('textarea')
  await page.fill('textarea', [
    '日付\t到達段階\t年間差額帯\t確度\t結果',
    ...Array.from({ length: 6 }, () => '2026-08-22\tclosing\t3千〜1万円\tB\tapplied')
  ].join('\n'))
  await page.waitForTimeout(300)
  const o = await measure(page)
  check('A13b', '集計が 320px で崩れない', !o.page && o.clipped === 0,
    `横スクロール ${o.page ? 'あり' : 'なし'} / 文字切れ ${o.clipped} 箇所`)
  await ctx.close()
}

// ───────────────────────────────────────────────────────────
// A14: 動作確認シート（docs/SMOKE_TEST.md）の期待値が、まだ本当か
//
// あのシートは「決まった数字を入れて決まった数字が出るか」を人が確かめる
// ためのもの。単価が変わったのにシートが古いままだと、現場が「不具合だ」と
// 報告してくる。改定のときに必ずここが落ちるようにしておく。
// ───────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } })
  const page = await ctx.newPage()
  const hero = () => page.locator('.hero-figure').first().innerText()
  const flat = t => t.replace(/\s+/g, '')

  // 2-1 従量電灯A / 2026年4月 / 348kWh
  await runDetailed(page, 'chugoku_juryo_a', '348', '2026-4')
  check('A14', 'SMOKE 2-1 の年間おトク額', flat(await hero()).includes('5,230'), flat(await hero()))

  // 2-2 見積もり方の切り替え（既定の検針月・600kWh）
  await runDetailed(page, 'chugoku_juryo_a', '600')
  const smokeFlatYen = flat(await hero())
  await page.getByRole('button', { name: '季節で変わる' }).click()
  await page.waitForTimeout(300)
  const smokeSeasonal = flat(await hero())
  check(
    'A14b',
    'SMOKE 2-2 の毎月おなじ／季節で変わる',
    smokeFlatYen.includes('13,428') && smokeSeasonal.includes('10,184'),
    `${smokeFlatYen} / ${smokeSeasonal}`
  )

  // 2-3 auでんき / 2026年7月 / 348kWh
  await runDetailed(page, 'au_m_plan', '348', '2026-7')
  check('A14c', 'SMOKE 2-3 のご負担増の額', flat(await hero()).includes('9,504'), flat(await hero()))

  // 2-4 かんたん試算 8,000円
  await page.goto(origin)
  await page.waitForSelector('button')
  await page.getByRole('button', { name: /かんたん試算/ }).click()
  await page.waitForTimeout(250)
  await page.fill('#simple-bill', '8000')
  await page.getByRole('button', { name: '詳しい結果を見る' }).click()
  await page.waitForSelector('.hero-figure')
  const simpleBody = await page.innerText('body')
  check(
    'A14d',
    'SMOKE 2-4 の推定使用量とおトク額',
    /275\s*kWh/.test(simpleBody) && flat(await hero()).includes('3,252'),
    flat(await hero())
  )

  // 3-2 確度（600kWhで試算した直後は C、約束を控えると A）
  await page.goto(origin)
  await page.waitForSelector('button')
  await page.getByRole('button', { name: '商談ナビをひらく' }).click()
  await page.waitForTimeout(300)
  const smokeRail = page.getByRole('navigation', { name: '商談の進み方' })
  await smokeRail.getByRole('button', { name: '試算' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: '検針票から試算する' }).click()
  await page.waitForTimeout(250)
  await page.selectOption('#scenario', 'chugoku_juryo_a')
  await page.waitForTimeout(200)
  for (const el of await page.$$('input[type=number]:visible')) {
    if (!(await el.inputValue())) await el.fill('600')
  }
  await page.getByRole('button', { name: '詳しい結果を見る' }).click()
  await page.waitForSelector('.hero-figure')
  await page.getByRole('button', { name: '商談ナビにもどる' }).click()
  await page.waitForTimeout(300)
  await smokeRail.getByRole('button', { name: '振返' }).click()
  await page.waitForTimeout(250)
  const rank = () => page.locator('.card-title').filter({ hasText: '確度' }).first().innerText()
  const before = await rank()
  await page.getByRole('button', { name: /次回うかがう話ができた/ }).click()
  await page.waitForTimeout(250)
  const after = await rank()
  check(
    'A14e',
    'SMOKE 3-2 の確度（C → 約束を控えると A）',
    /確度\s*C/.test(before) && /確度\s*A/.test(after),
    `${flat(before)} → ${flat(after)}`
  )

  // 4-2 サンプルデータを貼ったときの集計
  const sample = readFileSync(resolve(ROOT, 'docs/samples/visit-log-sample.tsv'), 'utf-8').trim()
  await page.goto(`${origin}/admin.html`)
  await page.waitForSelector('textarea')
  await page.fill('textarea', sample)
  await page.waitForTimeout(400)
  const adminBody = await page.innerText('body')
  check(
    'A14f',
    'SMOKE 4-2 のサンプル集計（33件・36.4%）',
    /商談 33 件/.test(adminBody) && /36\.4/.test(adminBody),
    (adminBody.match(/商談 \d+ 件/) ?? ['件数が出ない'])[0]
  )
  await ctx.close()
}

// ───────────────────────────────────────────────────────────
// A15: 試算 → ナビに戻ったあと、台本が試算の数字を使っているか
//      と、決まらない場面で手続きを飛ばすか
// ───────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } })
  const page = await ctx.newPage()

  // 商談ナビ → 試算（600kWh）→ ナビに戻る
  await page.goto(origin)
  await page.waitForSelector('button')
  await page.getByRole('button', { name: '商談ナビをひらく' }).click()
  await page.waitForTimeout(300)
  const talkRail = page.getByRole('navigation', { name: '商談の進み方' })
  await talkRail.getByRole('button', { name: '試算' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: '検針票から試算する' }).click()
  await page.waitForTimeout(250)
  await page.selectOption('#scenario', 'chugoku_juryo_a')
  await page.waitForTimeout(200)
  for (const el of await page.$$('input[type=number]:visible')) {
    if (!(await el.inputValue())) await el.fill('600')
  }
  await page.getByRole('button', { name: '詳しい結果を見る' }).click()
  await page.waitForSelector('.hero-figure')
  await page.getByRole('button', { name: '商談ナビにもどる' }).click()
  await page.waitForTimeout(300)

  // 帯に金額が出ているか（どの段階にいても分かる）
  check('A15', '戻った先の帯に、試算の金額が出る', /年間 13,428円 おトク/.test(await page.innerText('body')))

  // 説明の台本が、実際の金額を読める形で持っているか
  await talkRail.getByRole('button', { name: '説明' }).click()
  await page.waitForTimeout(250)
  const explain = await page.innerText('body')
  check(
    'A15b',
    '説明の台本に、試算の実数が入っている',
    /今日の試算を、そのまま読む/.test(explain) &&
      explain.includes('231,624円') &&
      explain.includes('13,428円'),
    explain.includes('231,624円') ? '年額・差額とも一致' : '年間の料金が出ていない'
  )

  // 解約金を聞かれたときに、差額の側から話せるか
  await talkRail.getByRole('button', { name: '不安' }).click()
  await page.waitForTimeout(200)
  await page.getByText('「解約金がかかるのでは」').click()
  await page.waitForTimeout(250)
  check(
    'A15c',
    '解約金の反論に、今日の差額から言える一言が出る',
    /1年で取り返せる/.test(await page.innerText('body'))
  )
  // 前向きな質問が出ているので、手続きへは進める
  check(
    'A15d',
    '解約金の質問が出ていれば、手続きへ進める',
    (await page.getByRole('button', { name: 'お手続きのご案内へ' }).count()) > 0
  )

  // 「検討します」だけの商談では、手続きを飛ばす
  await page.goto(origin)
  await page.waitForSelector('button')
  await page.getByRole('button', { name: '商談ナビをひらく' }).click()
  await page.waitForTimeout(300)
  await talkRail.getByRole('button', { name: '不安' }).click()
  await page.waitForTimeout(200)
  await page.getByText('「検討します／家族に相談します」').click()
  await page.waitForTimeout(250)
  const objected = await page.innerText('body')
  check(
    'A15e',
    '「検討します」が出たら、手続きに進まない場面だと出す',
    /今日はお手続きに進まない場面です/.test(objected)
  )
  check(
    'A15f',
    '次へのボタンが、手続きを飛ばしてふりかえりへ変わる',
    (await page.getByRole('button', { name: 'お手続きのご案内へ' }).count()) === 0 &&
      (await page.getByRole('button', { name: 'ふりかえりへ' }).count()) > 0
  )
  await page.getByRole('button', { name: 'ふりかえりへ進む' }).click()
  await page.waitForTimeout(250)
  check('A15g', 'その場からふりかえりへ進める', /今日のふりかえり/.test(await page.innerText('body')))
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
