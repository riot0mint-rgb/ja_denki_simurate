/**
 * data/rate_master.json を apps/web/src/data/rates.ts から生成する。
 *
 * 正本は TypeScript 側（rates.ts と calc-core の monthlyRates.ts）。
 * この JSON は監査・フェーズ6の改定レビュー画面が読むための書き出しであり、
 * 手で編集しても計算には反映されない。CI が drift を検知する。
 *
 * CLAUDE.md ルール4: すべての単価が出典（ファイル名・シート名・セル番地）を伴う。
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Decimal, RatePlan, availablePeriods, lookupFuelAdjustment, lookupRenewableLevy } from '@ja-denki-simulator/calc-core'
import { ALL_PLANS, REVISED_PLANS, SCENARIOS } from '../apps/web/src/data/rates.js'

/**
 * 監査に載せるプラン一覧。改定後の単価も含める。
 * 改定を JSON に出さないと、監査側からは値下げが起きたことが見えない。
 */
const MASTER_PLANS = [...ALL_PLANS, ...REVISED_PLANS]

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'data/rate_master.json')

/** Decimal は文字列で書き出す。JSON の number にすると浮動小数に戻ってしまう（ルール2）。 */
function serialize(value: unknown): unknown {
  if (value instanceof Decimal) return value.toString()
  if (Array.isArray(value)) return value.map(serialize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]))
  }
  return value
}

function planEntry(plan: RatePlan) {
  const { sources, ...rest } = plan
  return { ...(serialize(rest) as object), sources: serialize(sources) }
}

function monthlyTable() {
  const rows: Record<string, unknown>[] = []
  for (const provider of ['chugoku', 'au'] as const) {
    for (const period of availablePeriods(provider)) {
      const fuel = lookupFuelAdjustment(period, provider)
      const levy = lookupRenewableLevy(period)
      if (!fuel) continue
      rows.push({
        provider,
        period: `${period.year}-${String(period.month).padStart(2, '0')}`,
        fuel_minimum_charge_yen: fuel.value.minimumCharge.toString(),
        fuel_unit_price_yen_per_kwh: fuel.value.unitPriceYenPerKwh.toString(),
        renewable_levy_yen_per_kwh: levy ? levy.value.unitPriceYenPerKwh.toString() : null,
        source: serialize(fuel.source)
      })
    }
  }
  return rows
}

const master = {
  metadata: {
    version: '1.0.0',
    generated_from: 'apps/web/src/data/rates.ts + packages/calc-core/src/monthlyRates.ts',
    generator: 'scripts/generate-rate-master.ts',
    warning:
      'このファイルは生成物です。編集しても計算には反映されません。単価を直すには正本の TypeScript を変更してください。',
    plan_count: MASTER_PLANS.length,
    scenario_count: SCENARIOS.length
  },
  plans: MASTER_PLANS.map(planEntry),
  scenarios: SCENARIOS.map(s => ({
    scenario_id: s.scenarioId,
    label: s.label,
    current_plan_id: s.current.planId,
    candidate_plan_ids: s.candidates.map(c => c.planId),
    usage_form: s.usageForm,
    contract: s.contract,
    fuel_provider: s.fuelProvider,
    candidate_usage: s.candidateUsage,
    source_document: s.sourceDocument
  })),
  monthly_rates: monthlyTable()
}

const json = JSON.stringify(master, null, 2) + '\n'

const check = process.argv.includes('--check')
if (check) {
  if (!existsSync(OUT)) {
    console.error(`data/rate_master.json が存在しません。npm run rate-master:generate を実行してください。`)
    process.exit(1)
  }
  if (readFileSync(OUT, 'utf-8') !== json) {
    console.error(
      'data/rate_master.json が正本（rates.ts / monthlyRates.ts）と食い違っています。\n' +
        'npm run rate-master:generate を実行して差分をコミットしてください。'
    )
    process.exit(1)
  }
  console.log(`✓ data/rate_master.json は正本と一致しています（${MASTER_PLANS.length}プラン）`)
} else {
  writeFileSync(OUT, json)
  console.log(`✓ data/rate_master.json を生成しました（${MASTER_PLANS.length}プラン / ${master.monthly_rates.length}か月分）`)
}
