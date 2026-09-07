#!/usr/bin/env tsx
/**
 * 燃料費調整額・再エネ賦課金の月次自動取得（フェーズ6-b）。
 *
 * CLAUDE.md ルール10の限定的な例外により、この2値（燃調・再エネ賦課金）に限り
 * **取得から本番反映までを無人で回してよい**（2026-09-07・プロジェクト管理者承認）。
 * ただし以下は必ず守る。
 *
 * - 新しい年月の追加のみを行う。既存の年月の値を書き換えることはしない
 *   （書き換えが必要な食い違いを見つけたら conflict として報告し、中断する）
 * - 取得元ページの構造が想定と異なり解析できない場合は、推測で値を埋めず失敗させる
 * - ここでは「新しい `monthlyRatesData.ts` の中身を用意する」ところまでを行う。
 *   実際に本番へ反映してよいかの検証（build・test・rate-master:check）と
 *   コミット・pushは、この後に続くワークフロー側のステップが担う
 *   （CIの品質ゲートを必ず通してから反映するため）。
 *
 * ⚠️ 取得元ページの実際のURL・HTML構造は未確定（2026-09-07時点）。
 * `fetchChugokuFuelPage` / `fetchAuFuelPage` はプレースホルダで、
 * 呼ぶと明示的に失敗する。本番のURL・ページ構造が分かり次第、実装する。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { CHUGOKU_FUEL, AU_FUEL, RENEWABLE_LEVY } from '../packages/calc-core/src/monthlyRatesData.js'
import { diffFuelEntries, diffLevyEntries, FetchedFuelEntry, FetchedLevyEntry } from './monthlyRatesDiff.js'
import { insertFuelEntries, insertLevyEntries } from './monthlyRatesInsert.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = join(__dirname, '../packages/calc-core/src/monthlyRatesData.ts')

/**
 * ⚠️ 未実装（プレースホルダ）。中国電力の規制料金側・燃料費等調整制度のご案内ページ
 * （想定: https://www.energia.co.jp/elec/seido/nencho/ 付近）から、
 * 月別の燃料費調整額（15kWhまでの定額・15kWh超の単価）を取得する。
 *
 * 本セッションのサンドボックスはネットワークが遮断されており、実際のページ構造を
 * 確認できていない。プロジェクト管理者からURL・ページ内容の共有を受けてから実装する
 * （CLAUDE.md ルール8: 見たことのない構造を推測で解析しない）。
 */
async function fetchChugokuFuelPage(): Promise<FetchedFuelEntry[]> {
  throw new Error(
    '未実装: 中国電力の燃料費調整額ページの取得・解析。' +
      'docs/IMPLEMENTATION_PLAN.md「フェーズ6-b」参照。URL・ページ構造の確認が先に必要。'
  )
}

/** ⚠️ 未実装（プレースホルダ）。auでんき公式サイトの燃料費調整単価ページから取得する。 */
async function fetchAuFuelPage(): Promise<FetchedFuelEntry[]> {
  throw new Error(
    '未実装: auでんきの燃料費調整額ページの取得・解析。' + 'docs/IMPLEMENTATION_PLAN.md「フェーズ6-b」参照。'
  )
}

/**
 * ⚠️ 未実装（プレースホルダ）。再エネ賦課金は経済産業省が年度単位で告示する
 * 全国一律の単価。事業者サイトではなく告示そのものを出典にするのが望ましい。
 */
async function fetchRenewableLevyNotice(): Promise<FetchedLevyEntry[]> {
  throw new Error('未実装: 再エネ賦課金の告示の取得・解析。' + 'docs/IMPLEMENTATION_PLAN.md「フェーズ6-b」参照。')
}

interface Report {
  added: string[]
  conflicts: string[]
  unchanged: string[]
}

async function main() {
  const report: Report = { added: [], conflicts: [], unchanged: [] }
  let source = readFileSync(DATA_FILE, 'utf-8')
  let hasConflict = false

  // --- 中国電力 ---
  {
    const fetched = await fetchChugokuFuelPage()
    const diff = diffFuelEntries(CHUGOKU_FUEL, fetched)
    if (diff.conflicts.length > 0) {
      hasConflict = true
      for (const c of diff.conflicts) {
        report.conflicts.push(
          `中国電力 燃調 ${c.period}: 現在 ${JSON.stringify(c.current)} → 取得値 ${JSON.stringify(c.fetched)}`
        )
      }
    }
    if (diff.toAdd.length > 0) {
      source = insertFuelEntries(source, 'CHUGOKU_FUEL', diff.toAdd)
      report.added.push(...diff.toAdd.map(e => `中国電力 燃調 ${e.period}`))
    }
    report.unchanged.push(...diff.unchanged.map(p => `中国電力 燃調 ${p}`))
  }

  // --- auでんき ---
  {
    const fetched = await fetchAuFuelPage()
    const diff = diffFuelEntries(AU_FUEL, fetched)
    if (diff.conflicts.length > 0) {
      hasConflict = true
      for (const c of diff.conflicts) {
        report.conflicts.push(
          `auでんき 燃調 ${c.period}: 現在 ${JSON.stringify(c.current)} → 取得値 ${JSON.stringify(c.fetched)}`
        )
      }
    }
    if (diff.toAdd.length > 0) {
      source = insertFuelEntries(source, 'AU_FUEL', diff.toAdd)
      report.added.push(...diff.toAdd.map(e => `auでんき 燃調 ${e.period}`))
    }
    report.unchanged.push(...diff.unchanged.map(p => `auでんき 燃調 ${p}`))
  }

  // --- 再エネ賦課金 ---
  {
    const fetched = await fetchRenewableLevyNotice()
    const diff = diffLevyEntries(RENEWABLE_LEVY, fetched)
    if (diff.conflicts.length > 0) {
      hasConflict = true
      for (const c of diff.conflicts) {
        report.conflicts.push(`再エネ賦課金 ${c.period}: 現在 ${c.current} → 取得値 ${c.fetched}`)
      }
    }
    if (diff.toAdd.length > 0) {
      source = insertLevyEntries(source, diff.toAdd)
      report.added.push(...diff.toAdd.map(e => `再エネ賦課金 ${e.period}`))
    }
    report.unchanged.push(...diff.unchanged.map(p => `再エネ賦課金 ${p}`))
  }

  console.log(`変更なし: ${report.unchanged.length}件`)

  if (hasConflict) {
    console.error('⚠️ 既存の年月と値が食い違う項目があります。自動反映せず中断します。')
    for (const c of report.conflicts) console.error(`  - ${c}`)
    console.error('人が確認してください（CLAUDE.md ルール10・ルール4）。')
    process.exit(2)
  }

  if (report.added.length === 0) {
    console.log('追加する年月はありません。')
    process.exit(0)
  }

  writeFileSync(DATA_FILE, source, 'utf-8')
  console.log(`追加しました:`)
  for (const a of report.added) console.log(`  - ${a}`)
  console.log('このあと npm run build / npm test / npm run rate-master:check が通ることを確認してから反映してください。')
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
