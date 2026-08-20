/**
 * 試算表と実装の突合を実行する。
 *
 *   npm run rate-intake                    … archive/ の試算表と突合
 *   npm run rate-intake -- <dir>           … 別のディレクトリの試算表と突合
 *   npm run rate-intake -- --out <path>    … 結果をファイルに書く（PR本文用）
 *
 * 元資料は読むだけ。書き込み先はレポートのみ（CLAUDE.md ルール3）。
 */
import ExcelJS from 'exceljs'
import { readdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Decimal } from '@ja-denki-simulator/calc-core'
import { ALL_PLANS } from '../apps/web/src/data/rates.js'
import { CellRange, PlanUnderCheck, renderIntakeReport, runIntake } from './rateIntake.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const outIndex = args.indexOf('--out')
const outPath = outIndex >= 0 ? args[outIndex + 1] : null
const dir = resolve(args.find((a, i) => !a.startsWith('--') && i !== outIndex + 1) ?? join(ROOT, 'archive'))

if (!existsSync(dir)) {
  console.error(`試算表のディレクトリが見つかりません: ${dir}`)
  process.exit(1)
}

/**
 * 出典に書かれたファイル名と、手元のファイル名を突き合わせる。
 * Drive からコピーする過程で括弧や中黒がアンダースコアに置き換わるため、
 * 記号を落として比較する。
 */
function normalize(name: string): string {
  return name.replace(/\.xlsx$/i, '').replace(/[()（）・_\-\s]/g, '')
}

const files = readdirSync(dir).filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'))
const byNormalized = new Map(files.map(f => [normalize(f), join(dir, f)]))

function findFile(document: string): string | null {
  return byNormalized.get(normalize(document)) ?? null
}

/** 読み込んだブックを使い回す。1ファイル1回で足りる */
const books = new Map<string, ExcelJS.Workbook>()

async function loadBook(path: string): Promise<ExcelJS.Workbook> {
  const cached = books.get(path)
  if (cached) return cached
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  books.set(path, wb)
  return wb
}

/** 試算表に出てくるすべてのファイルを先に読む。RangeReader を同期にするため */
async function loadAllBooks(): Promise<void> {
  const needed = new Set<string>()
  for (const plan of ALL_PLANS) {
    for (const source of plan.sources) {
      const path = findFile(source.document)
      if (path) needed.add(path)
    }
  }
  for (const path of needed) await loadBook(path)
}

function cellValue(cell: ExcelJS.Cell): number | null {
  const v = cell.value
  if (typeof v === 'number') return v
  // 数式セルは計算結果（result）を見る。openpyxl の data_only=True と同じ扱い
  if (v && typeof v === 'object' && 'result' in v && typeof v.result === 'number') return v.result
  return null
}

/**
 * 数式の中に定数として書かれている数値を拾う。
 * 単価が数式に埋まっているセルがあるため（`=IF(I13+I16<1844.7,1845,...)`）、
 * 計算結果だけを見ると実装の値が見つからず誤検知になる。
 * セル参照（I13）や関数名に紛れないよう、数字だけの並びに限る。
 */
function formulaNumbers(cell: ExcelJS.Cell): number[] {
  const v = cell.value
  const formula =
    v && typeof v === 'object' && 'formula' in v && typeof v.formula === 'string' ? v.formula : null
  if (!formula) return []
  return (formula.match(/(?<![A-Za-z$\d.])\d+(?:\.\d+)?/g) ?? [])
    .map(Number)
    .filter(n => Number.isFinite(n))
}

function readRange(document: string, sheet: string, range: string): CellRange | null {
  const path = findFile(document)
  if (!path) return null
  const wb = books.get(path)
  if (!wb) return null
  const ws = wb.getWorksheet(sheet)
  if (!ws) return null

  const [from, to] = range.includes(':') ? range.split(':') : [range, range]
  const at = (ref: string) => {
    const m = ref.match(/^([A-Z]+)(\d+)$/)
    if (!m) return null
    let col = 0
    for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
    return { col, row: Number(m[2]) }
  }
  const a = at(from)
  const b = at(to)
  if (!a || !b) return null

  const values: number[] = []
  const formulaLiterals: number[] = []
  for (let row = Math.min(a.row, b.row); row <= Math.max(a.row, b.row); row++) {
    for (let col = Math.min(a.col, b.col); col <= Math.max(a.col, b.col); col++) {
      const cell = ws.getRow(row).getCell(col)
      const v = cellValue(cell)
      if (v !== null) values.push(v)
      formulaLiterals.push(...formulaNumbers(cell))
    }
  }
  // 範囲に数値が1つも無いのは、番地がずれている可能性が高い。推測せず解決不能とする
  return values.length > 0 ? { sheet, values, formulaLiterals } : null
}

/** プランが持つ金額をすべて拾う。ネストの深さも構造ごとに違うので再帰で集める */
function moneyValues(plan: object): string[] {
  const out: string[] = []
  const walk = (v: unknown) => {
    if (v instanceof Decimal) {
      out.push(v.toString())
    } else if (Array.isArray(v)) {
      v.forEach(walk)
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk)
    }
  }
  walk(plan)
  return Array.from(new Set(out))
}

const plans: PlanUnderCheck[] = ALL_PLANS.map(plan => {
  const { sources, ...rest } = plan
  return {
    planId: plan.planId,
    planName: plan.planName,
    values: moneyValues(rest),
    sources: sources.map(s => ({ document: s.document, locator: s.locator }))
  }
})

async function main(): Promise<never> {
  await loadAllBooks()
  const report = runIntake(plans, readRange)
  const rendered = renderIntakeReport(report, `${files.length}ファイル / ${dir.replace(ROOT + '/', '')}`)

  if (outPath) {
    writeFileSync(resolve(outPath), rendered)
    console.log(`✓ 突合レポートを ${outPath} に書き出しました`)
  } else {
    console.log(rendered)
  }

  // 不一致・番地不明があれば非ゼロで終える。改定に気づかず素通りしないため
  process.exit(report.mismatched + report.unresolvable > 0 ? 2 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
