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
  PRORATED_PERIODS,
  UNPUBLISHED_REVISIONS,
  rateAvailability,
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
    for (const plan of REVISED_PLANS.filter(p => p.side === 'ja')) {
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

/**
 * 2026年11月1日 中国電力の料金見直し（託送料金見直しの反映）。
 * 出典: 中国電力 プレスリリース 2026-09-28 別紙・参考資料（電気料金単価表 2026年11月１日実施）。
 * ご使用分基準なので、全量が新単価になるのは12月検針分から。
 */
describe('2026年11月 中国電力の料金見直し', () => {
  const plan = (planId: string) => ALL_PLANS.find(p => p.planId === planId)!
  const DEC = { year: 2026, month: 12 }
  const NOV = { year: 2026, month: 11 }
  const OCT = { year: 2026, month: 10 }

  /** 参考資料「見直し後単価（Ｂ）」列。並びは単価表のとおり */
  const AFTER: Record<string, string[]> = {
    chugoku_juryo_a: ['983.37', '33.32', '40', '42.12'],
    chugoku_smart: ['893.61', '32.58', '40', '42.12'],
    chugoku_juryo_b: ['476.18', '30.63', '36.72', '38.59'],
    chugoku_smart_b: ['476.18', '29.61', '36.72', '38.59'],
    chugoku_simple: ['39.31', '2057.02', '2057'],
    chugoku_low_voltage: ['1228.07', '27.2', '25.91'],
    chugoku_power_course: ['1216.59', '27.2', '25.91'],
    chugoku_denka_style: ['2255.36', '519.81', '47.06', '45', '30.92', '30.92'],
    chugoku_night_holiday: ['2057.02', '2057', '50.73', '48.27', '35.91', '35.91'],
    chugoku_midnight_b: ['438.24', '30.89'],
    chugoku_family_1: ['2834.32', '524.63', '48.01', '43.2', '42.96', '30.94'],
    chugoku_family_2: ['1844.32', '524.63', '51.34', '46.21', '45.97', '30.94'],
    chugoku_economy_night: ['1815.36', '519.81', '38.8', '44.4', '45.44', '30.89']
  }

  /** 構造ごとに単価を単価表と同じ並びで取り出す */
  function unitPrices(p: RatePlan): string[] {
    const d = (v: Decimal) => v.toString()
    switch (p.structure) {
      case 'tiered_minimum':
        return [d(p.minimumCharge), ...p.tiers.map(t => d(t.unitPriceYenPerKwh))]
      case 'capacity_tiered':
        return [d(p.baseChargePerKva), ...p.tiers.map(t => d(t.unitPriceYenPerKwh))]
      case 'flat_rate':
        return [d(p.unitPriceYenPerKwh), d(p.minimumMonthlyThreshold), d(p.minimumMonthlyBill)]
      case 'demand_seasonal':
        return [d(p.baseChargePerKw), d(p.summerUnitPriceYenPerKwh), d(p.otherUnitPriceYenPerKwh)]
      case 'time_of_use':
        return [
          ...(p.baseChargeUpTo10Kw ? [d(p.baseChargeUpTo10Kw), d(p.baseChargePerKwOver10!)] : []),
          ...(p.minimumMonthly ? [d(p.minimumMonthly.threshold), d(p.minimumMonthly.bill)] : []),
          d(p.unitPrices.daySummer),
          d(p.unitPrices.dayOther),
          d(p.unitPrices.night),
          d(p.unitPrices.holiday)
        ]
      case 'demand_flat':
        return [d(p.baseChargePerKw), d(p.unitPriceYenPerKwh)]
      case 'family_time':
        return [
          d(p.baseChargeUpTo10Kva),
          d(p.baseChargePerKvaOver10),
          d(p.unitPrices.daySummer),
          d(p.unitPrices.dayOther),
          d(p.unitPrices.family),
          d(p.unitPrices.night)
        ]
      case 'economy_night':
        return [
          d(p.baseChargeUpTo10Kva),
          d(p.baseChargePerKvaOver10),
          ...p.dayTiers.map(t => d(t.unitPriceYenPerKwh)),
          d(p.nightUnitPriceYenPerKwh)
        ]
    }
  }

  it.each(Object.entries(AFTER))('%s: 12月検針分から見直し後単価', (planId, expected) => {
    expect(unitPrices(planForPeriod(plan(planId), DEC))).toEqual(expected)
  })

  it('中国電力の全プランが見直しの対象になっている（漏れが無い）', () => {
    const chugoku = ALL_PLANS.filter(p => p.planId.startsWith('chugoku_')).map(p => p.planId).sort()
    expect(Object.keys(AFTER).sort()).toEqual(chugoku)
  })

  it('改定後の単価の出典は単価表（2026年11月1日実施）', () => {
    for (const planId of Object.keys(AFTER)) {
      const docs = planForPeriod(plan(planId), DEC).sources.map(s => s.document)
      expect(docs.some(d => d.includes('2026年11月１日実施'))).toBe(true)
    }
  })

  it('10月検針分までは現行単価のまま', () => {
    for (const planId of Object.keys(AFTER)) {
      expect(planForPeriod(plan(planId), OCT)).toBe(plan(planId))
      expect(rateAvailability(plan(planId), OCT).ok).toBe(true)
    }
  })

  it('11月検針分は日割りになるため計算不可（推測で旧単価・新単価のどちらにも寄せない）', () => {
    for (const planId of Object.keys(AFTER)) {
      const r = rateAvailability(plan(planId), NOV)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toContain('日割り')
    }
    expect(PRORATED_PERIODS[0].planIds.sort()).toEqual(Object.keys(AFTER).sort())
  })

  it('auでんきは改定の公表が無いので据え置き・計算も止めない', () => {
    for (const planId of ['au_m_plan', 'au_low_voltage']) {
      expect(planForPeriod(plan(planId), DEC)).toBe(plan(planId))
      expect(rateAvailability(plan(planId), NOV).ok).toBe(true)
    }
  })

  /**
   * 別紙 3-1「モデル料金でのお客さまへの影響額」。2026年10月分の燃料費等調整額から
   * 国の支援（10月分 ▲3.50円/kWh）を除いた額で計算されている。
   *   15kWhまで: ▲171.63 + 3.50×15 = ▲119.13 ／ 15kWh超: ▲11.43 + 3.50 = ▲7.93
   */
  describe('モデル料金（別紙 3-1）を再現する', () => {
    const fuelWithoutSubsidy = { minimumCharge: new Decimal('-119.13'), unitPriceYenPerKwh: new Decimal('-7.93') }
    const levy = lookupRenewableLevy(OCT)!.value
    const total = (p: RatePlan, usage: UsageInput) => {
      const r = calculator.calculate({ usage, plan: p, fuelAdjustment: fuelWithoutSubsidy, renewableLevy: levy })
      if (r.status !== 'ok') throw new Error(r.reason)
      return r.bill.total.toNumber()
    }
    const both = (planId: string, usage: UsageInput) => [
      total(plan(planId), usage),
      total(planForPeriod(plan(planId), DEC), usage)
    ]

    it('従量電灯A 260kWh: 8,742円 → 9,105円', () => {
      expect(both('chugoku_juryo_a', { totalKwh: 260 })).toEqual([8742, 9105])
    })
    it('スマートコース 260kWh: 8,575円 → 8,938円', () => {
      expect(both('chugoku_smart', { totalKwh: 260 })).toEqual([8575, 8938])
    })
    it('シンプルコース 600kWh: 20,676円 → 21,336円', () => {
      expect(both('chugoku_simple', { totalKwh: 600 })).toEqual([20676, 21336])
    })
    it('電化Styleコース 10kW・デイ138/ナイト208/ホリデー184kWh: 18,055円 → 18,598円', () => {
      const usage = { contractKw: 10, tou: { dayOther: 138, night: 208, holiday: 184 } }
      expect(both('chugoku_denka_style', usage)).toEqual([18055, 18598])
    })
  })
})

describe('JAでんきの託送料金改定（公表済み・新単価は未公表）', () => {
  const NOV = { year: 2026, month: 11 }
  it('JAでんきの全プランが11月検針分以降は計算不可', () => {
    const ja = ALL_PLANS.filter(p => p.side === 'ja')
    expect(ja.length).toBeGreaterThan(0)
    for (const p of ja) {
      const r = rateAvailability(p, NOV)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toContain('改定後の単価がまだ公表されていない')
      expect(rateAvailability(p, { year: 2027, month: 3 }).ok).toBe(false)
      expect(rateAvailability(p, { year: 2026, month: 10 }).ok).toBe(true)
    }
  })

  it('止めている根拠（全農エネルギーのお知らせ）を出典として持つ', () => {
    for (const r of UNPUBLISHED_REVISIONS) {
      expect(r.source.locator).toMatch(/^https:\/\/zennoh-energy\.co\.jp\//)
      expect(r.source.verificationStatus).toBe('verified')
    }
  })
})

describe('追加したプラン', () => {
  const plan = (planId: string) => ALL_PLANS.find(p => p.planId === planId)!
  const OCT = { year: 2026, month: 10 }

  it('動力コース: 基本料金だけが規制料金の低圧電力より 11.48円/kW 安い', () => {
    const power = plan('chugoku_power_course') as typeof jaDenkiLowVoltage
    const low = plan('chugoku_low_voltage') as typeof jaDenkiLowVoltage
    expect(low.baseChargePerKw.minus(power.baseChargePerKw).toString()).toBe('11.48')
    expect(power.summerUnitPriceYenPerKwh.equals(low.summerUnitPriceYenPerKwh)).toBe(true)
    expect(power.otherUnitPriceYenPerKwh.equals(low.otherUnitPriceYenPerKwh)).toBe(true)
  })

  it('動力コース・スマートBは使用量0kWhで基本料金が半額（料金表 本則(１)）', () => {
    const power = bill(plan('chugoku_power_course'), { contractKw: 6, seasonal: { summerKwh: 0, otherKwh: 0 } }, OCT)
    expect(power.baseCharge.toNumber()).toBe(3457.32)
    const smartB = bill(plan('chugoku_smart_b'), { contractKva: 10, totalKwh: 0 }, OCT)
    expect(smartB.baseCharge.toNumber()).toBe(2239.85)
  })

  it('スマートB 10kVA・400kWh（10月）', () => {
    // 4,479.70 + 29.04×120 + 36.15×180 + 38.02×100 = 4,479.70 + 3,484.80 + 6,507.00 + 3,802.00 = 18,273.50
    // 燃調 ▲11.43×400 = ▲4,572 ／ 賦課金 4.18×400 = 1,672 → 15,373.50 → 15,373
    const b = bill(plan('chugoku_smart_b'), { contractKva: 10, totalKwh: 400 }, OCT)
    expect(b.total.toNumber()).toBe(15373)
  })

  // ☆低圧電力試算表 'シミュレーション結果明細' の基準ケース（6kW・0kWh）I14 = 6,983
  it('auでんき 低圧電力: 試算表の基準ケース 6kW・0kWh → 6,983円（半額規定なし）', () => {
    const fuel = lookupFuelAdjustment({ year: 2026, month: 7 }, 'au')!.value
    const levy = lookupRenewableLevy({ year: 2026, month: 7 })!.value
    const r = calculator.calculate({
      usage: { contractKw: 6, seasonal: { summerKwh: 0, otherKwh: 0 } },
      plan: plan('au_low_voltage'),
      fuelAdjustment: fuel,
      renewableLevy: levy
    })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.bill.total.toNumber()).toBe(6983)
  })

  it('auでんき 低圧電力: 燃調は auでんきの15kWh超の単価を全量に掛け、合計で1回だけ切り捨てる', () => {
    const fuel = lookupFuelAdjustment({ year: 2026, month: 7 }, 'au')!.value
    const levy = lookupRenewableLevy({ year: 2026, month: 7 })!.value
    const r = calculator.calculate({
      usage: { contractKw: 6, seasonal: { summerKwh: 333, otherKwh: 0 } },
      plan: plan('au_low_voltage'),
      fuelAdjustment: fuel,
      renewableLevy: levy
    })
    // 6,983.46 + 26.79×333 − 13.09×333 + 4.18×333 = 6,983.46 + 8,921.07 − 4,358.97 + 1,391.94 = 12,937.50
    expect(r.status === 'ok' && r.bill.total.toNumber()).toBe(12937)
  })
})
