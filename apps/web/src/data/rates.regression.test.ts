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
import {
  ALL_PLANS,
  REVISED_PLANS,
  jaDenkiJuryoA,
  jaDenkiJuryoB,
  jaDenkiJuryoS,
  jaDenkiLowVoltage,
  planForPeriod
} from './rates'
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

/**
 * Decimal を文字列にしたうえで構造ごと比較できる形にする。
 *
 * 金額の集合として比べると**入れ替わりを見逃す**。実際、ファミリータイムⅠの
 * デイタイム夏季とその他季の単価を入れ替えても全テストが通っていた。
 * 項目の位置まで含めて突き合わせる。
 */
function shape(value: unknown): unknown {
  if (value instanceof Decimal) return value.toString()
  if (Array.isArray(value)) return value.map(shape)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, shape(v)])
    )
  }
  return value
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
      expect(shape(shipped)).toEqual(shape(copied))
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

// 2026年10月改定（値下げ）。適用は検針日基準で令和8年11月1日＝2026年11月検針分から。
// 出典: 家庭⑦-1【中国】ＪＡでんき料金メニュー定義書（家庭用）＜20261001＞.pdf 別表1 ほか
describe('2026年10月改定', () => {
  const at = (planId: string, year: number, month: number) => {
    const plan = ALL_PLANS.find(p => p.planId === planId)!
    return planForPeriod(plan, { year, month })
  }

  it('11月検針分から新単価に切り替わる', () => {
    const before = at('ja_denki_juryo_a', 2026, 10) as typeof jaDenkiJuryoA
    const after = at('ja_denki_juryo_a', 2026, 11) as typeof jaDenkiJuryoA
    expect(before.minimumCharge.toString()).toBe('759.68')
    expect(after.minimumCharge.toString()).toBe('704.68')
  })

  it('10月検針分までは改定前の単価のまま', () => {
    for (const [y, m] of [[2025, 1], [2026, 7], [2026, 10]] as const) {
      const p = at('ja_denki_juryo_a', y, m) as typeof jaDenkiJuryoA
      expect(p.minimumCharge.toString()).toBe('759.68')
      expect(p.tiers[2].unitPriceYenPerKwh.toString()).toBe('38.84')
    }
  })

  it('従量電灯A: 第3段階と最低月額料金だけが下がる', () => {
    const a = at('ja_denki_juryo_a', 2026, 11) as typeof jaDenkiJuryoA
    expect(a.minimumCharge.toString()).toBe('704.68')
    expect(a.tiers.map(t => t.unitPriceYenPerKwh.toString())).toEqual(['32.22', '38.04', '38.14'])
  })

  it('従量電灯S: 最低月額料金だけが下がり、従量料金は据え置き', () => {
    const s = at('ja_denki_juryo_s', 2026, 11) as typeof jaDenkiJuryoS
    expect(s.minimumCharge.toString()).toBe('614.92')
    expect(s.tiers.map(t => t.unitPriceYenPerKwh.toString())).toEqual(['31.79', '39.43', '41.44'])
  })

  it('従量電灯B: 基本料金と第3段階が下がる', () => {
    const b = at('ja_denki_juryo_b', 2026, 11) as typeof jaDenkiJuryoB
    expect(b.baseChargePerKva.toString()).toBe('434.22')
    expect(b.tiers.map(t => t.unitPriceYenPerKwh.toString())).toEqual(['30.06', '35.41', '36.01'])
  })

  it('低圧電力: 従量料金だけが下がり、基本料金は据え置き', () => {
    const l = at('ja_denki_low_voltage', 2026, 11) as typeof jaDenkiLowVoltage
    expect(l.baseChargePerKw.toString()).toBe('1132.83')
    expect(l.summerUnitPriceYenPerKwh.equals('26.50')).toBe(true)
    expect(l.otherUnitPriceYenPerKwh.equals('25.21')).toBe(true)
  })

  // 改定対象は4メニュー。夜トクプランは定義書も2024年4月版のまま
  it('夜トクプランと他社プランは改定の対象外', () => {
    for (const planId of ['ja_denki_yotoku', 'chugoku_juryo_a', 'au_m_plan']) {
      const plan = ALL_PLANS.find(p => p.planId === planId)
      if (!plan) continue
      expect(planForPeriod(plan, { year: 2026, month: 11 })).toBe(plan)
    }
  })

  it('改定後の単価にも出典が付いている（ルール4）', () => {
    for (const plan of REVISED_PLANS) {
      expect(plan.sources.length).toBeGreaterThan(0)
      for (const s of plan.sources) {
        expect(s.document).toMatch(/20261001/)
        expect(s.effectiveFrom).toBe('2026-11')
        expect(s.verificationStatus).toBe('verified')
      }
    }
  })
})

/**
 * 時間帯別電灯（エコノミーナイト）の突合。
 *
 * ④の入力が全て0のため、元資料には金額の突合点が無かった。
 * 中国電力の公式シミュレーションの出力2件を期待値に据える。
 * 出典: 中国電力 電気料金計算シミュレーション（2026年8月単価）
 */
describe('時間帯別電灯（エコノミーナイト）— 中国電力公式シミュレーションとの突合', () => {
  const AUG = { year: 2026, month: 8 }
  const bill = (dayKwh: number, nightKwh: number, contractKva = 6) => {
    const plan = ALL_PLANS.find(p => p.planId === 'chugoku_economy_night')!
    const fuel = lookupFuelAdjustment(AUG)!
    const levy = lookupRenewableLevy(AUG)!
    const r = new BillingCalculator().calculate({
      usage: { contractKva, economyNight: { dayKwh, nightKwh } },
      plan,
      fuelAdjustment: fuel.value,
      renewableLevy: levy.value
    })
    if (r.status !== 'ok') throw new Error(r.reason)
    return r.bill
  }

  // 6kVA・0kWh → 789円。基本料金 ((1,578.72 + 0) × 1/2) = 789.36 → 789
  it('0kWh は 789円（基本料金が半額）', () => {
    const b = bill(0, 0)
    expect(b.baseCharge.toNumber()).toBe(789.36)
    expect(b.total.toNumber()).toBe(789)
  })

  // 6kVA・昼間100kWh（第1段階90 + 第2段階10）+ 夜間1,000kWh → 26,578円
  it('昼間100kWh + 夜間1,000kWh は 26,578円', () => {
    const b = bill(100, 1000)
    expect(b.baseCharge.toNumber()).toBe(1578.72)
    // 昼間 38.22×90 + 43.82×10 + 44.86×0 = 3,878.00
    expect(b.lines[0].amount.toNumber()).toBeCloseTo(3439.8, 6)
    expect(b.lines[1].amount.toNumber()).toBeCloseTo(438.2, 6)
    expect(b.lines[2].amount.toNumber()).toBe(0)
    // 夜間 30.34×1,000 = 30,340.00
    expect(b.lines[3].amount.toNumber()).toBeCloseTo(30340, 6)
    // 燃調 -12.56×1,100 / 再エネ 4.18×1,100（円未満切り捨て）
    expect(b.fuelAdjustment.toNumber()).toBeCloseTo(-13816, 6)
    expect(b.renewableLevy.toNumber()).toBe(4598)
    expect(b.total.toNumber()).toBe(26578)
  })
})

// 最低月額料金を下回ったときの請求額は 1,844円（円未満切り捨て）。
// ①明細の式は 1845 だが、約款どおりの切り捨てが正しいとJAに確認済み（2026-08-21）
describe('最低月額料金の請求額', () => {
  it('ナイトホリデーもシンプルコースも 1,844円', () => {
    const nightHoliday = ALL_PLANS.find(p => p.planId === 'chugoku_night_holiday')! as {
      minimumMonthly: { threshold: { toString(): string }; bill: { toString(): string } }
    }
    const simple = ALL_PLANS.find(p => p.planId === 'chugoku_simple')! as {
      minimumMonthlyThreshold: { toString(): string }
      minimumMonthlyBill: { toString(): string }
    }
    expect(nightHoliday.minimumMonthly.threshold.toString()).toBe('1844.7')
    expect(nightHoliday.minimumMonthly.bill.toString()).toBe('1844')
    expect(simple.minimumMonthlyThreshold.toString()).toBe('1844.7')
    expect(simple.minimumMonthlyBill.toString()).toBe('1844')
  })
})
