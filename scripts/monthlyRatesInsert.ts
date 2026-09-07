/**
 * `packages/calc-core/src/monthlyRatesData.ts` への新しい年月の追記（フェーズ6-b）。
 *
 * 既存の値・コメントは一切書き換えない。対象の `export const XXX = { ... };` ブロックの
 * 閉じ括弧の直前に、新しい年月の行を追記するだけの**テキスト挿入**にとどめる。
 * オブジェクトを一度JSに読み込んで丸ごと再生成する方式は、手で書いたコメントを
 * 消してしまうため採らない。
 *
 * 挿入位置が見つからない（ファイルの体裁が変わった）場合は、**推測で別の場所に
 * 差し込まず例外を投げる**（CLAUDE.md ルール8）。
 */

/** 挿入対象の定数ブロックを名前で探し、"}" の直前（挿入すべき行頭位置）を返す。 */
export function findInsertionPoint(source: string, constName: string): number {
  const startPattern = new RegExp(`export const ${constName}[^=]*=\\s*\\{`)
  const startMatch = startPattern.exec(source)
  if (!startMatch) {
    throw new Error(`挿入先が見つかりません: export const ${constName} ... = { が見当たりません`)
  }
  const blockStart = startMatch.index + startMatch[0].length

  // 対応する閉じ括弧を、ネストした { } を数えながら探す（値の中に { を含まない前提。
  // このファイルの値はすべて文字列・数値なので安全）。
  let depth = 1
  let i = blockStart
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  if (depth !== 0) {
    throw new Error(`挿入先の閉じ括弧が見つかりません: export const ${constName} のブロックが閉じていません`)
  }

  // 閉じ括弧がある行の行頭まで戻る（そこへ新しい行を挿し込む）
  const lineStart = source.lastIndexOf('\n', i) + 1
  return lineStart
}

/**
 * 追記する行を作る。直前の最終行に末尾カンマが無ければ付け、新しい行を追加する。
 * `source` と `insertAt` は `findInsertionPoint` の戻り値をそのまま渡す。
 */
export function insertLines(source: string, insertAt: number, lines: string[]): string {
  if (lines.length === 0) return source

  const before = source.slice(0, insertAt)
  const after = source.slice(insertAt)

  // 直前の非空行末に カンマ が無ければ補う（最後のエントリの後に挿入するケース）
  const trimmedBefore = before.replace(/\s+$/, '')
  const needsComma = trimmedBefore.length > 0 && !trimmedBefore.endsWith(',') && !trimmedBefore.endsWith('{')
  const fixedBefore = needsComma ? `${trimmedBefore},\n` : before

  const inserted = lines.map(l => `  ${l}`).join('\n')
  return `${fixedBefore}${inserted}\n${after}`
}

export interface FuelEntry {
  period: string
  minimumCharge: string
  unitPriceYenPerKwh: string
  from?: string
}

/** 燃調1行分のTSソース断片を作る。出典キー（from）があれば併記する。 */
export function formatFuelEntry(entry: FuelEntry): string {
  const from = entry.from ? `, from: '${entry.from}'` : ''
  return `'${entry.period}': { minimumCharge: '${entry.minimumCharge}', unitPriceYenPerKwh: '${entry.unitPriceYenPerKwh}'${from} },`
}

/** 再エネ賦課金1行分のTSソース断片を作る。 */
export function formatLevyEntry(period: string, unitPriceYenPerKwh: string): string {
  return `'${period}': '${unitPriceYenPerKwh}',`
}

/**
 * 燃調テーブル（CHUGOKU_FUEL / AU_FUEL）へ新しい年月を追記する。
 * `existingPeriods` に既にある年月は**追記しない**（呼び出し側で新規分だけに絞ること）。
 */
export function insertFuelEntries(source: string, constName: string, entries: FuelEntry[]): string {
  if (entries.length === 0) return source
  const insertAt = findInsertionPoint(source, constName)
  const lines = entries
    .slice()
    .sort((a, b) => a.period.localeCompare(b.period))
    .map(e => formatFuelEntry(e))
  return insertLines(source, insertAt, lines)
}

/** 再エネ賦課金テーブル（RENEWABLE_LEVY）へ新しい年月を追記する。 */
export function insertLevyEntries(
  source: string,
  entries: Array<{ period: string; unitPriceYenPerKwh: string }>
): string {
  if (entries.length === 0) return source
  const insertAt = findInsertionPoint(source, 'RENEWABLE_LEVY')
  const lines = entries
    .slice()
    .sort((a, b) => a.period.localeCompare(b.period))
    .map(e => formatLevyEntry(e.period, e.unitPriceYenPerKwh))
  return insertLines(source, insertAt, lines)
}
