import { describe, it, expect } from 'vitest'
import {
  BillingCalculator,
  Decimal,
  RatePlan,
  RatePeriod,
  UsageInput,
  lookupFuelAdjustment,
  lookupRenewableLevy
} from '@ja-denki-simulator/calc-core'
import { ALL_PLANS, jaDenkiJuryoA, jaDenkiJuryoS } from './rates'
import * as F from '../../../../packages/calc-core/tests/fixtures'
import lookup from '../../../../packages/calc-core/tests/excel-lookup.fixture.json'

/**
 * 出荷される料金表そのものを検証する。
 *
 * calc-core 側の回帰テストは `tests/fixtures.ts` の**写し**に対して回っており、
 * 本番の `rates.ts` を書き換えても早見表1201点の関門は素通りしてしまう。
 * 「根拠のない単価変更はテストを通らない」を成り立たせるには、
 * 出荷される値そのものを見るテストが要る。
 */

const calculator = new BillingCalculator()
const JULY: RatePeriod = { year: 2026, month: 7 }
/** ①の早見表は26年4月適用 */
const APRIL: RatePeriod = { year: 2026, month: 4 }

function bill(plan: RatePlan, usage: UsageInput, period: RatePeriod = JULY) {
  const fuel = lookupFuelAdjustment(period)!
  const levy = lookupRenewableLevy(period)!
  const r = calculator.calculate({ usage, plan, fuelAdjustment: fuel.value, renewableLevy: levy.value })
  if (r.status !== 'ok') throw new Error(`計算不能: ${r.reason}`)
  return r.bill
}

/** プランが持つ金額をすべて拾う。構造ごとにネストの深さが違うので再帰で集める */
function money(plan: object): string[] {
  const out: string[] = []
  const walk = (v: unknown) => {
    if (v instanceof Decimal) out.push(v.toString())
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(plan)
  return out.sort()
}

const fixtureById = new Map(
  Object.values(F)
    .filter((v): v is RatePlan => !!v && typeof v === 'object' && 'planId' in (v as object))
    .map(p => [p.planId, p])
)

describe('出荷される料金表とテスト用フィクスチャが一致する', () => {
  it.each(ALL_PLANS.map(p => [p.planName, p] as const))(
    '%s の金額がすべて一致する',
    (_name, plan) => {
      const fixture = fixtureById.get(plan.planId)
      expect(fixture, `fixtures.ts に ${plan.planId} が無い`).toBeDefined()
      const { sources: _s, ...shipped } = plan
      const { sources: _f, ...copied } = fixture!
      expect(money(shipped)).toEqual(money(copied))
    }
  )

  it('丸めの定義も一致する', () => {
    for (const plan of ALL_PLANS) {
      expect(plan.rounding, plan.planId).toEqual(fixtureById.get(plan.planId)!.rounding)
    }
  })
})

/**
 * ①の早見表 0〜1200kWh 全点。calc-core 側と同じデータを、
 * 出荷される `rates.ts` のプランに対して流す。早見表は 26年4月適用。
 */
describe('①早見表との回帰（出荷される単価で）', () => {
  const tables = (lookup as unknown as { plans: Record<string, Record<string, number>> }).plans

  /** Excel の浮動小数点誤差で本実装が1円高くなる点（calc-core 側と同じ一覧） */
  const EXCEL_FLOAT_DISCREPANCY_KWH = new Set([
    18, 33, 38, 48, 58, 68, 113, 125, 225, 250, 275, 300, 320, 340, 360, 400, 420, 440, 480, 500,
    520, 540, 580, 600, 620, 640, 680, 700, 720, 740, 760, 780, 800, 820, 840, 860, 880, 920, 940,
    960, 980, 1000, 1020, 1040, 1060, 1080, 1100, 1120, 1140, 1160, 1180, 1200
  ])

  it('従量電灯A は 1201 点すべて差異 0 円', () => {
    const expected = tables.ja_denki_juryo_a
    const points = Object.keys(expected).map(Number)
    expect(points).toHaveLength(1201)
    const mismatches = points.filter(
      kwh => !bill(jaDenkiJuryoA, { totalKwh: kwh }, APRIL).total.equals(expected[String(kwh)])
    )
    expect(mismatches).toEqual([])
  })

  it('従量電灯S は誤差点を除き差異 0 円', () => {
    const expected = tables.ja_denki_juryo_s
    const mismatches = Object.keys(expected)
      .map(Number)
      .filter(kwh => !EXCEL_FLOAT_DISCREPANCY_KWH.has(kwh))
      .filter(kwh => !bill(jaDenkiJuryoS, { totalKwh: kwh }, APRIL).total.equals(expected[String(kwh)]))
    expect(mismatches).toEqual([])
  })

  it('従量電灯S は 217kWh 付近で従量電灯A と入れ替わる', () => {
    const cheaper = (kwh: number) => {
      const a = bill(jaDenkiJuryoA, { totalKwh: kwh }).total
      const s = bill(jaDenkiJuryoS, { totalKwh: kwh }).total
      return a.lessThan(s) ? 'A' : a.greaterThan(s) ? 'S' : '同額'
    }
    expect(cheaper(216)).toBe('S')
    expect(cheaper(217)).toBe('同額')
    expect(cheaper(218)).toBe('A')
  })
})

describe('出典（CLAUDE.md ルール4）', () => {
  it('すべてのプランが出典を持つ', () => {
    for (const plan of ALL_PLANS) {
      expect(plan.sources.length, plan.planId).toBeGreaterThan(0)
      for (const s of plan.sources) {
        expect(s.document.trim(), plan.planId).not.toBe('')
        expect(s.locator.trim(), plan.planId).not.toBe('')
        expect(s.verificationStatus, plan.planId).toBe('verified')
      }
    }
  })
})
