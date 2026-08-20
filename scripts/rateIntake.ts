/**
 * 試算表と実装の突合（フェーズ6の取り込み）。
 *
 * 新しい適用月の試算表が出たとき、実装の単価がどこで食い違うかを機械的に洗い出す。
 * 各プランは `RateSource.locator` に元資料のシート名とセル番地を持っているので、
 * そこを読みに行って値を突き合わせる。
 *
 * 設計上の判断:
 *
 * - **並び順では照合しない。** 同じ範囲に単価が3回繰り返されるシート
 *   （シンプルコースの E52:E55 = 1844.7 / 38.21 / 38.21 / 38.21）があり、
 *   「n番目の値がn番目のフィールド」という対応が成り立たない。集合で照合する。
 * - **番地が解決できなければ落とす。** シートが無い・範囲に数値が無い場合、
 *   近くのセルを探しに行くようなことはしない。書式が変わったなら人が読むべき場面である
 *   （CLAUDE.md ルール8）。
 * - **数式のリテラルも読む。** 最低月額料金の請求額のように、セルの計算結果ではなく
 *   数式の中に定数として埋まっている値がある
 *   （`=IF(I13+I16<1844.7,1845,ROUNDDOWN(...))` の 1844.7 と 1845）。
 *   計算結果だけを見ると、その月の試算額と比べてしまい誤検知になる。
 * - **書き換えはしない。** 出力は差分の報告だけ。rates.ts の更新は人が行い、
 *   Pull Request のレビューで承認する（ルール10）。
 */

export interface CellRange {
  sheet: string
  /** 範囲に含まれるセルの値。数値以外は除いてある */
  values: number[]
  /** 範囲内の数式に定数として現れる数値。単価が数式に埋まっている場合に要る */
  formulaLiterals: number[]
}

export type RangeReader = (document: string, sheet: string, range: string) => CellRange | null

export interface PlanUnderCheck {
  planId: string
  planName: string
  /** プランが持つ金額。Decimal を文字列にしたもの */
  values: string[]
  sources: Array<{ document: string; locator: string }>
}

export interface LocatorResult {
  document: string
  locator: string
  status: 'read' | 'unresolvable' | 'not-a-spreadsheet'
  sheetValues: number[]
  formulaLiterals: number[]
}

export interface PlanIntakeResult {
  planId: string
  planName: string
  status: 'match' | 'mismatch' | 'unresolvable' | 'no-spreadsheet-source'
  locators: LocatorResult[]
  /** 実装にあるのに試算表に見当たらない値 */
  missingInSheet: string[]
  /** 試算表にあるのに実装に見当たらない値 */
  extraInSheet: number[]
}

export interface IntakeReport {
  plans: PlanIntakeResult[]
  matched: number
  mismatched: number
  unresolvable: number
  skipped: number
}

/** `基本項目!E8:E11` / `'シミュレーション結果明細 VSシンプル'!I20` を分解する */
export function parseLocator(locator: string): { sheet: string; range: string } | null {
  // 補足（括弧書き）は番地ではないので落とす
  const head = locator.split(/[（(]/)[0].trim()
  const m = head.match(/^'([^']+)'!([A-Z]+\d+(?::[A-Z]+\d+)?)$/) ?? head.match(/^([^!']+)!([A-Z]+\d+(?::[A-Z]+\d+)?)$/)
  if (!m) return null
  return { sheet: m[1].trim(), range: m[2] }
}

/** 1円未満の桁で無用な不一致を出さないため、小数2桁までで比べる */
function key(value: number | string): string {
  const n = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(n) ? n.toFixed(2) : String(value)
}

export function checkPlan(plan: PlanUnderCheck, read: RangeReader): PlanIntakeResult {
  const locators: LocatorResult[] = []
  const sheetValues: number[] = []
  const formulaLiterals: number[] = []

  for (const source of plan.sources) {
    const parsed = parseLocator(source.locator)
    if (!parsed) {
      // URL や書名だけの出典。試算表ではないので突合の対象外
      locators.push({ ...source, status: 'not-a-spreadsheet', sheetValues: [], formulaLiterals: [] })
      continue
    }
    const cells = read(source.document, parsed.sheet, parsed.range)
    if (!cells) {
      locators.push({ ...source, status: 'unresolvable', sheetValues: [], formulaLiterals: [] })
      continue
    }
    locators.push({
      ...source,
      status: 'read',
      sheetValues: cells.values,
      formulaLiterals: cells.formulaLiterals
    })
    sheetValues.push(...cells.values)
    formulaLiterals.push(...cells.formulaLiterals)
  }

  const readable = locators.filter(l => l.status === 'read')
  if (readable.length === 0) {
    const anySpreadsheet = locators.some(l => l.status === 'unresolvable')
    return {
      planId: plan.planId,
      planName: plan.planName,
      status: anySpreadsheet ? 'unresolvable' : 'no-spreadsheet-source',
      locators,
      missingInSheet: [],
      extraInSheet: []
    }
  }

  // 単価はセルの値としても数式の定数としても現れうる。どちらかにあれば一致とみなす
  const sheetKeys = new Set([...sheetValues, ...formulaLiterals].map(key))
  const planKeys = new Set(plan.values.map(key))
  const missingInSheet = plan.values.filter(v => !sheetKeys.has(key(v)))
  // 数式の定数はその月の試算値も混ざるため、余剰の報告はセルの値だけを対象にする
  const extraInSheet = sheetValues.filter(v => !planKeys.has(key(v)))

  return {
    planId: plan.planId,
    planName: plan.planName,
    status: missingInSheet.length === 0 ? 'match' : 'mismatch',
    locators,
    missingInSheet: Array.from(new Set(missingInSheet)),
    extraInSheet: Array.from(new Set(extraInSheet))
  }
}

export function runIntake(plans: PlanUnderCheck[], read: RangeReader): IntakeReport {
  const results = plans.map(p => checkPlan(p, read))
  return {
    plans: results,
    matched: results.filter(r => r.status === 'match').length,
    mismatched: results.filter(r => r.status === 'mismatch').length,
    unresolvable: results.filter(r => r.status === 'unresolvable').length,
    skipped: results.filter(r => r.status === 'no-spreadsheet-source').length
  }
}

const MARK = {
  match: '✓',
  mismatch: '⚠',
  unresolvable: '✗',
  'no-spreadsheet-source': '–'
} as const

/** PR にそのまま貼れる形。人が判断するのに必要なものだけ出す */
export function renderIntakeReport(report: IntakeReport, label: string): string {
  const lines: string[] = [`## 試算表との突合（${label}）`, '']

  lines.push(
    `一致 **${report.matched}** / 不一致 **${report.mismatched}** / ` +
      `番地が解決できない **${report.unresolvable}** / 対象外 ${report.skipped}`,
    ''
  )

  const needsWork = report.plans.filter(p => p.status === 'mismatch' || p.status === 'unresolvable')
  if (needsWork.length === 0) {
    lines.push('実装の単価はすべて試算表と一致しています。改定は入っていません。', '')
  }

  for (const plan of needsWork) {
    lines.push(`### ${MARK[plan.status]} ${plan.planName} (\`${plan.planId}\`)`, '')

    if (plan.status === 'unresolvable') {
      lines.push(
        '出典のセル番地が読めません。**シートの書式が変わった可能性があります。**',
        '近い値を探しに行くようなことはしません。元資料を開いて番地を確認してください。',
        ''
      )
      for (const l of plan.locators.filter(x => x.status === 'unresolvable')) {
        lines.push(`- \`${l.locator}\` — ${l.document}`)
      }
      lines.push('')
      continue
    }

    // 読める番地が1つでもあれば不一致として扱うが、読めなかった番地は必ず挙げる。
    // 「番地が動いた」ことが原因のときは、そこが診断の要になる
    const broken = plan.locators.filter(l => l.status === 'unresolvable')
    if (broken.length > 0) {
      lines.push('**読めなかった番地があります。シートの書式が変わった可能性があります。**', '')
      for (const l of broken) lines.push(`- \`${l.locator}\` — ${l.document}`)
      lines.push('')
    }

    lines.push('| 実装の値 | 試算表の同じ番地にある値 |', '|---|---|')
    const sheet = plan.locators.flatMap(l => l.sheetValues)
    const literals = plan.locators.flatMap(l => l.formulaLiterals)
    const rows = Math.max(plan.missingInSheet.length, plan.extraInSheet.length)
    for (let i = 0; i < rows; i++) {
      lines.push(`| ${plan.missingInSheet[i] ?? '—'} | ${plan.extraInSheet[i] ?? '—'} |`)
    }
    lines.push('')
    lines.push(`読んだ番地: ${plan.locators.filter(l => l.status === 'read').map(l => `\`${l.locator}\``).join(' / ')}`)
    lines.push(`その範囲の全値: ${sheet.join(', ')}`)
    if (literals.length > 0) lines.push(`数式に現れる定数: ${literals.join(', ')}`)
    lines.push('')
  }

  lines.push('---', '')
  lines.push('この突合は `npm run rate-intake` が生成しました。**書き換えは行っていません。**')
  lines.push('単価を直すのは正本の TypeScript（`apps/web/src/data/rates.ts`）で、')
  lines.push('反映の可否は Pull Request のレビューで人が判断します（CLAUDE.md ルール10）。')
  lines.push('')
  return lines.join('\n')
}
