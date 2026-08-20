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
import { diffRateMaster, renderDiffReport, RateMasterLike } from './rateMasterDiff.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CURRENT = resolve(ROOT, 'data/rate_master.json')

const args = process.argv.slice(2)
const outIndex = args.indexOf('--out')
const outPath = outIndex >= 0 ? args[outIndex + 1] : null
const baselinePath = args.find((a, i) => !a.startsWith('--') && i !== outIndex + 1)

function loadBaseline(): RateMasterLike {
  if (baselinePath) return JSON.parse(readFileSync(resolve(baselinePath), 'utf-8'))
  // 基準を指定しなければ、コミット済みの版と比べる。改定PRの差分がそのまま出る
  const committed = execFileSync('git', ['show', 'HEAD:data/rate_master.json'], {
    cwd: ROOT,
    encoding: 'utf-8'
  })
  return JSON.parse(committed)
}

const report = renderDiffReport(diffRateMaster(loadBaseline(), JSON.parse(readFileSync(CURRENT, 'utf-8'))))

if (outPath) {
  writeFileSync(resolve(outPath), report)
  console.log(`✓ 差分レポートを ${outPath} に書き出しました`)
} else {
  console.log(report)
}
