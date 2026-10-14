/**
 * 燃料費調整額・再エネ賦課金の取得元ページの解析（フェーズ6-b）。
 *
 * 取得元（2026-10-14 に実ページの構造を確認し、抜粋を scripts/fixtures/monthly-rates/ に保存）:
 *
 * - 中国電力「燃料費等調整制度のご案内〔中国電力エリア〕」
 *   https://www.energia.co.jp/elec/seido/nencho/
 *   「電気サービス約款および選択約款」「電気特定小売供給約款」の2表に、
 *   月ごとの「15kWhまで」「15kWhをこえる1kWhにつき」「1kWhにつき（左記以外）」が並ぶ。
 * - auでんき「燃料費調整単価」 https://www.au.com/energy/denki/other/adjust/detail/
 *   前月分と当月分の2列。（ ）内が税込で、試算は税込を使う。
 * - 中国電力のお知らせ「YYYY年5月分からYYYY年4月分までの『再生可能エネルギー発電促進賦課金単価』について」
 *
 * 想定と違う構造に出会ったら**推測で値を埋めず例外を投げる**（CLAUDE.md ルール8・ルール10の例外条項）。
 * ワークフローが赤くなること自体が、人が見に行くきっかけになる。
 *
 * ネットワークに触れない純粋関数だけを置く（取得は fetch-monthly-rates.ts）。
 */
import type { FetchedFuelEntry, FetchedLevyEntry } from './monthlyRatesDiff.js'

/** HTMLをセルの並びに崩す。表の行・列構造はページ改修で変わりやすいため、文字の並び順だけに頼る。 */
export function htmlToTokens(html: string): string[] {
  const withoutCode = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, '')
  return withoutCode
    .split(/<[^>]+>/)
    .map(decodeEntities)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 0)
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
}

function periodOf(year: string, month: string): string {
  return `${year}-${month.padStart(2, '0')}`
}

/** 「▲12.93」「-12.93」「+0.26」を "-12.93" / "0.26" の形にそろえる。書式の検査は呼び出し側で済ませておく */
function normalizeYen(raw: string): string {
  return raw.replace(/^▲/, '-').replace(/^\+/, '')
}

const YEN_CELL = /^[▲+-]?\d+\.\d{2}$/

interface EnergiaRow {
  period: string
  minimumCharge: string
  unitFirstTier: string
  unitOther: string
}

/** 1表ぶん。各行は「◯月分」の見出しで始まり、燃料費等調整単価表へのリンク「YYYY年M月分」で終わる */
function parseEnergiaTable(tokens: string[]): EnergiaRow[] {
  const rows: EnergiaRow[] = []
  let rowStart = 0
  tokens.forEach((token, i) => {
    const end = /^(\d{4})年(\d{1,2})月分$/.exec(token)
    if (!end) return
    const yen = tokens.slice(rowStart, i).filter(t => YEN_CELL.test(t))
    rowStart = i + 1
    if (yen.length !== 3) {
      throw new Error(`中国電力 燃調 ${token}: 単価の列数が想定（3列）と違います（${yen.length}列）`)
    }
    rows.push({
      period: periodOf(end[1], end[2]),
      minimumCharge: normalizeYen(yen[0]),
      unitFirstTier: normalizeYen(yen[1]),
      unitOther: normalizeYen(yen[2])
    })
  })
  return rows
}

const ENERGIA_SERVICE_HEADING = '電気サービス約款および選択約款のお客さま'
const ENERGIA_REGULATED_HEADING = '電気特定小売供給約款のお客さま'

/**
 * 中国電力の燃料費等調整単価一覧。
 *
 * このアプリは中国エリアの燃調を1本のテーブルで持ち、JAでんき・中国電力の
 * 規制料金・自由料金のすべてに当てている（2026-09-07 プロジェクト管理者確認）。
 * その前提が崩れた月（2表の値が違う／同じ表の中で15kWh超と左記以外が違う）は
 * どちらを採るか機械では決められないので、失敗させて人に回す。
 */
export function parseEnergiaFuelPage(html: string): FetchedFuelEntry[] {
  const tokens = htmlToTokens(html)
  const service = tokens.findIndex(t => t.startsWith(ENERGIA_SERVICE_HEADING))
  const regulated = tokens.findIndex(t => t.startsWith(ENERGIA_REGULATED_HEADING))
  if (service < 0 || regulated < 0 || regulated < service) {
    throw new Error('中国電力 燃調: 「燃料費等調整単価一覧」の2つの表が見つかりません（ページ構造が変わった可能性）')
  }
  // 一覧の後ろの「推移」の節にも同じ見出しが繰り返されるため、そこで打ち切る
  const trend = tokens.findIndex((t, i) => i > regulated && t === '燃料費等調整単価の推移')
  const serviceRows = parseEnergiaTable(tokens.slice(service + 1, regulated))
  const regulatedRows = parseEnergiaTable(tokens.slice(regulated + 1, trend < 0 ? undefined : trend))
  if (serviceRows.length === 0 || regulatedRows.length === 0) {
    throw new Error('中国電力 燃調: 表から1行も読み取れませんでした（ページ構造が変わった可能性）')
  }

  const regulatedByPeriod = new Map(regulatedRows.map(r => [r.period, r]))
  return serviceRows.map(row => {
    if (row.unitFirstTier !== row.unitOther) {
      throw new Error(
        `中国電力 燃調 ${row.period}: 15kWh超の単価 ${row.unitFirstTier} と左記以外の単価 ${row.unitOther} が違います。` +
          '燃調テーブルを分ける必要があるか人が判断してください'
      )
    }
    const other = regulatedByPeriod.get(row.period)
    if (
      !other ||
      other.minimumCharge !== row.minimumCharge ||
      other.unitFirstTier !== row.unitFirstTier ||
      other.unitOther !== row.unitOther
    ) {
      throw new Error(
        `中国電力 燃調 ${row.period}: 自由料金と規制料金の表で値が一致しません。人が確認してください`
      )
    }
    return {
      period: row.period,
      minimumCharge: row.minimumCharge,
      unitPriceYenPerKwh: row.unitFirstTier,
      from: 'energia'
    }
  })
}

/** 「-162.86（-179.02）」の（ ）内＝税込を取り出す。書式は AU_CELL で検査済みのセルだけを渡す */
function taxIncluded(cell: string): string {
  return normalizeYen(cell.slice(cell.indexOf('（') + 1, -1))
}

const AU_CELL = /^[+-]?\d+\.\d{2}（[+-]?\d+\.\d{2}）$/

/**
 * auでんき 中国電力エリア（でんきMプラン〔中国〕）の燃料費調整単価。
 * ページには前月分・当月分の2か月だけが載る。
 */
export function parseAuFuelPage(html: string): FetchedFuelEntry[] {
  const tokens = htmlToTokens(html)
  const header = tokens.findIndex(t => t === '区分')
  const periods: string[] = []
  for (let i = header + 1; header >= 0 && i < tokens.length && periods.length < 2; i++) {
    const m = /^(\d{4})年(\d{1,2})月分$/.exec(tokens[i])
    if (m) periods.push(periodOf(m[1], m[2]))
  }
  if (periods.length !== 2) {
    throw new Error('auでんき 燃調: 表の見出し（YYYY年M月分 ×2）が見つかりません（ページ構造が変わった可能性）')
  }

  const row = tokens.findIndex((t, i) => t === '中国' && tokens[i - 1] === 'でんきMプラン')
  if (row < 0) throw new Error('auでんき 燃調: でんきMプラン〔中国〕の行が見つかりません')
  const minimumLabel = tokens.findIndex((t, i) => i > row && t.startsWith('最初の'))
  if (minimumLabel < 0 || tokens[minimumLabel] !== '最初の15kWhまで') {
    throw new Error('auでんき 燃調: 中国エリアの「最初の15kWhまで」の行が見つかりません')
  }
  const overLabel = tokens.findIndex((t, i) => i > minimumLabel && t.startsWith('上記を超える'))
  if (overLabel < 0) throw new Error('auでんき 燃調: 中国エリアの「上記を超える 1kWhあたり」の行が見つかりません')

  const minimumCells = tokens.slice(minimumLabel + 1, overLabel).filter(t => AU_CELL.test(t))
  const overCells = tokens.slice(overLabel + 1, overLabel + 4).filter(t => AU_CELL.test(t))
  // 3列目は前月との差。使わないが、列がずれていないことの確認に3列そろっていることを求める
  if (minimumCells.length !== 3 || overCells.length !== 3) {
    throw new Error('auでんき 燃調: 中国エリアの単価が3列（前月・当月・差）そろっていません')
  }
  return periods.map((period, i) => ({
    period,
    minimumCharge: taxIncluded(minimumCells[i]),
    unitPriceYenPerKwh: taxIncluded(overCells[i]),
    from: 'au-site'
  }))
}

const LEVY_TITLE = /(\d{4})年5月分から(\d{4})年4月分までの「再生可能エネルギー発電促進賦課金単価」について/

/** お知らせ一覧から、賦課金単価のお知らせへのリンクを拾う。見つからなければ空（新年度の告示前） */
export function findLevyNoticeLinks(indexHtml: string): Array<{ href: string; fromYear: number }> {
  const links: Array<{ href: string; fromYear: number }> = []
  const anchor = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  for (let m = anchor.exec(indexHtml); m; m = anchor.exec(indexHtml)) {
    const title = htmlToTokens(m[2]).join('')
    const t = LEVY_TITLE.exec(title)
    if (t && Number(t[2]) === Number(t[1]) + 1) links.push({ href: m[1], fromYear: Number(t[1]) })
  }
  return links
}

/**
 * 賦課金のお知らせ本文。「適用期間」の表の右列（新年度）の単価を、
 * その年の5月分から翌年4月分までの12か月に展開する。
 */
export function parseLevyNotice(html: string, fromYear: number): FetchedLevyEntry[] {
  const tokens = htmlToTokens(html)
  const header = tokens.findIndex(t => t === '適用期間')
  const expected = [`${fromYear - 1}年5月分から`, `${fromYear}年4月分`, `${fromYear}年5月分から`, `${fromYear + 1}年4月分`]
  if (header < 0 || expected.some((e, i) => tokens[header + 1 + i] !== e)) {
    throw new Error(`再エネ賦課金: ${fromYear}年度の「適用期間」の表が想定の形ではありません`)
  }
  const label = tokens.findIndex((t, i) => i > header && t === '発電促進賦課金単価')
  const value = String(tokens[label + 2])
  if (label < 0 || !/^\d+\.\d{2}$/.test(value)) {
    throw new Error(`再エネ賦課金: ${fromYear}年度の単価が読み取れません`)
  }
  const entries: FetchedLevyEntry[] = []
  for (let i = 0; i < 12; i++) {
    const month = ((4 + i) % 12) + 1
    const year = month >= 5 ? fromYear : fromYear + 1
    entries.push({ period: periodOf(String(year), String(month)), unitPriceYenPerKwh: value })
  }
  return entries
}
