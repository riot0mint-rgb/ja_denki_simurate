/**
 * 現在の正本（rates.ts / monthlyRates.ts）が、指定した基準の料金マスターから
 * どう変わったかを人が読める形で出す。フェーズ6の改定レビュー用。
 *
 *   npm run rate-master:diff                 … git HEAD の rate_master.json と比較
 *   npm run rate-master:diff -- <baseline>   … 任意の JSON と比較
 *   npm run rate-master:diff -- --out <path> … 結果をファイルに書く（PR本文用）
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from './cliArgs.js'
import { diffRateMaster, renderDiffReport, RateMasterLike } from './rateMasterDiff.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CURRENT = resolve(ROOT, 'data/rate_master.json')

const { outPath, positional } = parseArgs(process.argv.slice(2))
const baselinePath = positional[0]

/** 料金マスターの形になっていることを確かめる。違えば読める文言で落とす */
function asRateMaster(parsed: unknown, where: string): RateMasterLike {
  const m = parsed as Partial<RateMasterLike>
  if (!m || !Array.isArray(m.plans) || !Array.isArray(m.monthly_rates)) {
    console.error(
      `${where} は料金マスターの形ではありません（plans と monthly_rates の配列が必要）。\n` +
        'npm run rate-master:generate で生成したファイルを指定してください。'
    )
    process.exit(1)
  }
  return m as RateMasterLike
}

function loadBaseline(): RateMasterLike {
  if (baselinePath) {
    const path = resolve(baselinePath)
    return asRateMaster(JSON.parse(readFileSync(path, 'utf-8')), path)
  }
  // 基準を指定しなければ、コミット済みの版と比べる。改定PRの差分がそのまま出る
  const committed = execFileSync('git', ['show', 'HEAD:data/rate_master.json'], {
    cwd: ROOT,
    encoding: 'utf-8'
  })
  return asRateMaster(JSON.parse(committed), 'HEAD:data/rate_master.json')
}

const report = renderDiffReport(
  diffRateMaster(loadBaseline(), asRateMaster(JSON.parse(readFileSync(CURRENT, 'utf-8')), CURRENT))
)

if (outPath) {
  writeFileSync(resolve(outPath), report)
  console.log(`✓ 差分レポートを ${outPath} に書き出しました`)
} else {
  console.log(report)
}
