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
 * 取得元とページの解析は `monthlyRatesParse.ts`（2026-10-14 に実ページで構造を確認）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { CHUGOKU_FUEL, AU_FUEL, RENEWABLE_LEVY } from '../packages/calc-core/src/monthlyRatesData.js'
import { diffFuelEntries, diffLevyEntries, FetchedFuelEntry, FetchedLevyEntry } from './monthlyRatesDiff.js'
import { insertFuelEntries, insertLevyEntries } from './monthlyRatesInsert.js'
import { parseEnergiaFuelPage, parseAuFuelPage, findLevyNoticeLinks, parseLevyNotice } from './monthlyRatesParse.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = join(__dirname, '../packages/calc-core/src/monthlyRatesData.ts')

const ENERGIA_FUEL_URL = 'https://www.energia.co.jp/elec/seido/nencho/'
const AU_FUEL_URL = 'https://www.au.com/energy/denki/other/adjust/detail/'
const ENERGIA_INFO_URL = 'https://www.energia.co.jp/info/index.html'

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': 'ja-denki-simulator rate fetcher (+GitHub Actions)' } })
  if (!res.ok) throw new Error(`取得に失敗しました: ${url} (HTTP ${res.status})`)
  return res.text()
}

/**
 * 収録の起点より古い月は足さない。過去にさかのぼって行を増やしても
 * 画面では選べず（賦課金の表が無い）、差分のノイズになるだけ。
 */
function notOlderThan(table: Record<string, unknown>) {
  const earliest = Object.keys(table).sort()[0]
  return (e: { period: string }) => earliest === undefined || e.period >= earliest
}

async function fetchChugokuFuelPage(): Promise<FetchedFuelEntry[]> {
  return parseEnergiaFuelPage(await fetchText(ENERGIA_FUEL_URL)).filter(notOlderThan(CHUGOKU_FUEL))
}

async function fetchAuFuelPage(): Promise<FetchedFuelEntry[]> {
  return parseAuFuelPage(await fetchText(AU_FUEL_URL)).filter(notOlderThan(AU_FUEL))
}

/**
 * 再エネ賦課金は経済産業省が年度ごとに告示する全国一律の単価。
 * 中国電力のお知らせ（告示を受けて毎年3月ごろ掲載）から取る。
 * 一覧に新年度のお知らせが無い時期は、何も足さない（例外にはしない）。
 */
async function fetchRenewableLevyNotice(): Promise<FetchedLevyEntry[]> {
  const links = findLevyNoticeLinks(await fetchText(ENERGIA_INFO_URL))
  const entries: FetchedLevyEntry[] = []
  for (const link of links) {
    const url = new URL(link.href, ENERGIA_INFO_URL).toString()
    entries.push(...parseLevyNotice(await fetchText(url), link.fromYear))
  }
  return entries.filter(notOlderThan(RENEWABLE_LEVY))
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
