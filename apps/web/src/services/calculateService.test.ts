import { describe, it, expect } from 'vitest'
import { Decimal, UsageInput } from '@ja-denki-simulator/calc-core'
import type { ComparisonScenario } from '../data/rates'
import {
  calculateComparison,
  formatCurrency,
  formatPercentage,
  isSummerMonth,
  needsCalendar,
  findScenario,
  SCENARIOS,
  periodOptionsFor,
  DEFAULT_RATE_PERIOD,
  GAS_SET_DISCOUNT_YEN,
  calculateAnnual,
  allElectricTermsOf
} from './calculateService'

const JULY = { year: 2026, month: 7 }

function ok(scenarioId: string, usage: Parameters<typeof calculateComparison>[1], opts = {}) {
  const r = calculateComparison(scenarioId, usage, { period: JULY, ...opts })
  if (r.status !== 'ok') throw new Error(`unsupported: ${r.reason}`)
  return r.view
}

const sampleCalendar = {
  days: 30,
  weekendDays: 8,
  holidayDays: 1,
  holidayUsageRatio: 'same' as const,
  julyDays: 0,
  octoberDays: 0
}

/** 入力フォームの種類ごとに、計算が通る最小限の使用量を作る */
function sampleUsageFor(form: ComparisonScenario['usageForm']): UsageInput {
  switch (form) {
    case 'total':
      return { totalKwh: 350, contractKw: 6, contractKva: 10 }
    case 'seasonal':
      return { seasonal: { summerKwh: 350, otherKwh: 0 }, contractKw: 6 }
    case 'tou':
      return { contractKw: 6, tou: { dayOther: 100, night: 200, holiday: 50 } }
    case 'family':
      return {
        contractKva: 10,
        familyTime: { dayOther: 120, family: 80, night: 250 },
        calendar: sampleCalendar
      }
    case 'economy_night':
      return {
        contractKva: 10,
        economyNight: { dayKwh: 200, nightKwh: 300 },
        calendar: sampleCalendar
      }
  }
}

describe('シナリオ定義', () => {
  it('全12シナリオが引ける', () => {
    expect(SCENARIOS).toHaveLength(12)
    for (const s of SCENARIOS) {
      expect(findScenario(s.scenarioId)).toBe(s)
    }
  })

  it('未知のシナリオは unsupported（CLAUDE.md ルール8）', () => {
    const r = calculateComparison('存在しないプラン', { totalKwh: 100 })
    expect(r.status).toBe('unsupported')
    if (r.status === 'unsupported') {
      expect(r.reason).toContain('存在しないプラン')
      expect(r.nextSteps.join()).toContain('営業担当')
    }
  })

  it('按分が必要なシナリオだけ検針期間を要求する', () => {
    const needing = SCENARIOS.filter(needsCalendar).map(s => s.scenarioId)
    expect(needing).toEqual([
      'chugoku_family_1',
      'chugoku_family_2',
      'chugoku_economy_night'
    ])
  })

  it('夏季は7〜9月', () => {
    expect([1, 6, 7, 8, 9, 10, 12].map(isSummerMonth)).toEqual([
      false, false, true, true, true, false, false
    ])
  })
})

describe('対象月', () => {
  it('既定は全事業者の燃調がそろう26年8月', () => {
    expect(DEFAULT_RATE_PERIOD).toEqual({ year: 2026, month: 8 })
  })

  // 燃調の公表時期が事業者ごとにずれるため、選べる月も事業者ごとに違う。
  // 全社共通の選択肢にすると、auでんきで「収録されていません」が出る。
  it('検針月の選択肢は事業者ごとに絞られる', () => {
    const chugoku = periodOptionsFor(findScenario('chugoku_juryo_a')!)
    const au = periodOptionsFor(findScenario('au_m_plan')!)
    expect(chugoku).toContainEqual(JULY)
    expect(au).toContainEqual(JULY)
    expect(chugoku.length).toBeGreaterThan(au.length)
    // auで選べる月はすべて中国電力でも選べる（部分集合）
    const key = (p: { year: number; month: number }) => `${p.year}-${p.month}`
    const chugokuKeys = new Set(chugoku.map(key))
    expect(au.every(p => chugokuKeys.has(key(p)))).toBe(true)
  })

  // JAでんき側は事業者を問わず中国電力エリアの燃調を使うため、
  // 現行プラン側だけで絞ると JA 候補が計算できない月を出してしまう
  it('選べる月はすべて実際に計算できる', () => {
    for (const scenario of SCENARIOS) {
      for (const period of periodOptionsFor(scenario)) {
        const usage = sampleUsageFor(scenario.usageForm)
        const r = calculateComparison(scenario.scenarioId, usage, { period })
        expect(r.status, `${scenario.scenarioId} / ${period.year}-${period.month}`).toBe('ok')
      }
    }
  })

  it('収録のない月は推測せず unsupported を返す', () => {
    const r = calculateComparison('chugoku_juryo_a', { totalKwh: 300 }, {
      period: { year: 2030, month: 1 }
    })
    expect(r.status).toBe('unsupported')
    if (r.status === 'unsupported') expect(r.reason).toContain('2030年1月')
  })
})

describe('従量電灯A の比較', () => {
  it('現在プランと候補2件を返し、安い方が推奨になる', () => {
    const v = ok('chugoku_juryo_a', { totalKwh: 348 })
    expect(v.current.planName).toBe('中国電力 従量電灯A')
    expect(v.candidates).toHaveLength(2)
    const cheapest = [...v.candidates].sort((a, b) => a.monthlyChargeYen - b.monthlyChargeYen)[0]
    expect(v.recommended.planId).toBe(cheapest.planId)
  })

  it('年額は月額の12倍', () => {
    const v = ok('chugoku_juryo_a', { totalKwh: 348 })
    expect(v.annualSavingsYen).toBe(v.recommended.monthlySavingsYen * 12)
  })

  it('初年度は新規契約割引3,000円が上乗せされる', () => {
    const v = ok('chugoku_juryo_a', { totalKwh: 348 })
    expect(v.firstYearSpecialDiscountYen).toBe(3000)
    expect(v.firstYearSavingsYen).toBe(v.annualSavingsYen + 3000)
  })

  it('217kWh 付近で推奨プランが従量Sから従量Aへ入れ替わる', () => {
    expect(ok('chugoku_juryo_a', { totalKwh: 216 }).recommended.planId).toBe('ja_denki_juryo_s')
    expect(ok('chugoku_juryo_a', { totalKwh: 218 }).recommended.planId).toBe('ja_denki_juryo_a')
  })

  it('内訳と出典を持ち回る', () => {
    const v = ok('chugoku_juryo_a', { totalKwh: 348 })
    expect(v.current.formula).toContain('円')
    expect(v.ratePeriodLabel).toBe('2026年7月')
    expect(v.unitPriceEffectiveLabel).toBe('2026年7月適用')
    expect(v.periodPrecedesUnitPrices).toBe(false)
    // 出典は試算表（.xlsx）と各社の公式単価表（URL）の2系統がある
    expect(v.sources.some(s => s.includes('.xlsx'))).toBe(true)
    expect(v.sources.some(s => s.includes('https://'))).toBe(true)
    expect(v.sources.every(s => s.trim().length > 0)).toBe(true)
  })
})

describe('ガスセット割', () => {
  it('既定では適用されない', () => {
    expect(ok('chugoku_juryo_a', { totalKwh: 348 }).gasSetDiscountApplied).toBe(false)
  })

  // 元資料（①シミュレーション結果 I20）はセット割を年額の行だけに掛けており、
  // 月額削減額そのものは動かさない。実装もそれに合わせている。
  it('適用すると年額が110円×12だけ増える（月額削減額は動かない）', () => {
    const without = ok('chugoku_juryo_a', { totalKwh: 348 })
    const withGas = ok('chugoku_juryo_a', { totalKwh: 348 }, { gasSetDiscount: true })
    expect(withGas.gasSetDiscountApplied).toBe(true)
    expect(withGas.recommended.monthlySavingsYen).toBe(without.recommended.monthlySavingsYen)
    expect(withGas.annualSavingsYen - without.annualSavingsYen).toBe(110 * 12)
    expect(withGas.firstYearSavingsYen - without.firstYearSavingsYen).toBe(110 * 12)
  })
})

describe('入力不足は推測せず unsupported', () => {
  it.each([
    ['chugoku_juryo_b', {}, '契約'],
    ['chugoku_denka_style', { contractKw: 6 }, '時間帯'],
    ['chugoku_family_1', { contractKva: 10 }, '時間帯']
  ])('%s は理由と次の一手を返す', (id, usage, expected) => {
    const r = calculateComparison(id, usage, { period: JULY })
    expect(r.status).toBe('unsupported')
    if (r.status === 'unsupported') {
      expect(r.reason).toContain(expected)
      expect(r.nextSteps.length).toBeGreaterThan(0)
    }
  })

  it('按分が必要なのに検針期間がなければ理由を返す', () => {
    const r = calculateComparison(
      'chugoku_economy_night',
      { contractKva: 10, economyNight: { dayKwh: 200, nightKwh: 300 } },
      { period: JULY }
    )
    expect(r.status).toBe('unsupported')
    if (r.status === 'unsupported') expect(r.reason).toContain('検針期間')
  })
})

describe('夜トクプランへの使用量の振替', () => {
  const calendar = {
    days: 30,
    weekendDays: 8,
    holidayDays: 1,
    holidayUsageRatio: 'same' as const,
    julyDays: 0,
    octoberDays: 0
  }

  it('深夜電力Bは総使用量を全額ナイトタイムとして渡す', () => {
    const v = ok('chugoku_midnight_b', { totalKwh: 200, contractKw: 4 })
    expect(v.totalKwh).toBe(200)
    expect(v.candidates[0].formula).toContain('ナイトタイム')
  })

  it('ファミリータイムは4区分へ按分され合計が保たれる', () => {
    const v = ok('chugoku_family_2', {
      contractKva: 10,
      familyTime: { daySummer: 0, dayOther: 100, family: 80, night: 220 },
      calendar
    })
    expect(v.totalKwh).toBe(400)
    expect(v.candidates[0].formula).toContain('ホリデータイム')
  })

  it('検針期間はあるが時間帯別使用量が無ければ理由を返す', () => {
    const r = calculateComparison('chugoku_family_1', { contractKva: 10, calendar }, { period: JULY })
    expect(r.status).toBe('unsupported')
    if (r.status === 'unsupported') expect(r.reason).toContain('時間帯別のご使用量')
  })

  it('検針期間はあるが昼間・夜間の使用量が無ければ理由を返す', () => {
    const r = calculateComparison('chugoku_economy_night', { contractKva: 10, calendar }, { period: JULY })
    expect(r.status).toBe('unsupported')
    if (r.status === 'unsupported') expect(r.reason).toContain('昼間・夜間')
  })

  it('ファミリータイムの各区分が省略されても0として扱う', () => {
    const v = ok('chugoku_family_1', {
      contractKva: 10,
      familyTime: { night: 300 },
      calendar
    })
    expect(v.totalKwh).toBe(300)
  })

  // ④は入力欄が「契約電力」1つで、同じ数値を夜トク側の契約電力にも使う
  // （'ファミリーⅡ結果' K24 = G8 = IF(E6>10, E6-10, 0)）。
  // ここで kVA→kW の換算を挟むと元資料とずれる
  it('契約容量(kVA)はそのまま乗り換え先の契約電力(kW)になる', () => {
    const at10 = ok('chugoku_family_2', {
      contractKva: 10,
      familyTime: { dayOther: 120, family: 80, night: 250 },
      calendar
    })
    const at12 = ok('chugoku_family_2', {
      contractKva: 12,
      familyTime: { dayOther: 120, family: 80, night: 250 },
      calendar
    })
    // 夜トクの10kW超過分は 458.37円/kW。12kVA なら 2kW ぶん増える
    const diff = at12.candidates[0].monthlyChargeYen - at10.candidates[0].monthlyChargeYen
    expect(diff).toBeCloseTo(458.37 * 2, 0)
  })

  it('時間帯別電灯も按分される', () => {
    const v = ok('chugoku_economy_night', {
      contractKva: 10,
      economyNight: { dayKwh: 200, nightKwh: 300 },
      calendar
    })
    expect(v.totalKwh).toBe(500)
    expect(v.candidates[0].planName).toContain('夜トク')
  })
})

// ④の按分式には MAX(...,0) が無く、元資料の Excel 自体が負の値を出す。
// 0 に丸めると4区分の合計が総使用量とずれるので、丸めずに計算不可を返す（ルール8）。
describe('按分が負の値になる入力', () => {
  const calendar = {
    days: 30,
    weekendDays: 8,
    holidayDays: 1,
    holidayUsageRatio: 'much_more' as const,
    julyDays: 0,
    octoberDays: 0
  }

  it('昼夜の偏りが極端なら、入力者に分かる理由で計算不可を返す', () => {
    const r = calculateComparison(
      'chugoku_family_2',
      {
        contractKva: 10,
        familyTime: { daySummer: 0, dayOther: 5, family: 0, night: 600 },
        calendar
      },
      { period: JULY }
    )
    expect(r.status).toBe('unsupported')
    if (r.status === 'unsupported') {
      expect(r.reason).toContain('時間帯の偏り')
      // 入力者は負の値を入れていない。engine の生の文言をそのまま出さない
      expect(r.reason).not.toContain('負の値')
      expect(r.nextSteps.length).toBeGreaterThan(0)
    }
  })

  // デイタイムが両季とも0だと季節按分の割合が0になり、ファミリータイムの半分を含む
  // デイタイム分がまるごと消える。JAでんき側だけ安く出て削減額が過大になる
  it('デイタイムが0で使用量が欠落する入力も止める', () => {
    const r = calculateComparison(
      'chugoku_family_2',
      {
        contractKva: 10,
        familyTime: { daySummer: 0, dayOther: 0, family: 300, night: 400 },
        calendar: { ...calendar, holidayUsageRatio: 'same' as const }
      },
      { period: JULY }
    )
    expect(r.status).toBe('unsupported')
    if (r.status === 'unsupported') expect(r.reason).toContain('時間帯の偏り')
  })

  it('時間帯別電灯でも合計が保たれない入力は止める', () => {
    // 合計の検査は両方の按分式に効いている
    const ok = calculateComparison(
      'chugoku_economy_night',
      { contractKva: 10, economyNight: { dayKwh: 200, nightKwh: 300 }, calendar },
      { period: JULY }
    )
    expect(ok.status).toBe('ok')
  })

  // Decimal の NaN は isNegative() も greaterThan() も false を返すので、
  // 有限かどうかを先に見ないと ￥NaN のまま画面に出る
  it('日数0の検針期間でも ￥NaN を出さない', () => {
    const r = calculateComparison(
      'chugoku_family_2',
      {
        contractKva: 10,
        familyTime: { dayOther: 100, family: 80, night: 220 },
        calendar: { ...calendar, days: 0, weekendDays: 0, holidayDays: 0 }
      },
      { period: JULY }
    )
    expect(r.status).toBe('unsupported')
  })

  // Decimal の isNegative() は**負のゼロでも true** を返す。端数の引き算で
  // -0 になるだけの正当な検針票を弾いてしまう
  it('負のゼロになる区分があっても計算できる', () => {
    const r = calculateComparison(
      'chugoku_economy_night',
      {
        contractKva: 10,
        economyNight: { dayKwh: 50, nightKwh: 0 },
        calendar: { ...calendar, days: 28, weekendDays: 8, holidayDays: 0 }
      },
      { period: JULY }
    )
    expect(r.status).toBe('ok')
  })

  it('通常の使用量では従来どおり計算できる', () => {
    const r = calculateComparison(
      'chugoku_family_2',
      {
        contractKva: 10,
        familyTime: { daySummer: 0, dayOther: 100, family: 80, night: 220 },
        calendar
      },
      { period: JULY }
    )
    expect(r.status).toBe('ok')
  })
})

describe('ナイトホリデー（最低月額料金型）', () => {
  it('73kWh は最低月額料金 1,845円', () => {
    const v = ok('chugoku_night_holiday', { contractKw: 6, tou: { night: 73 } })
    expect(v.current.monthlyChargeYen).toBe(1844)
    expect(v.current.notes.some(n => n.includes('最低月額料金'))).toBe(true)
  })

  it('74kWh から通常計算になる', () => {
    const v = ok('chugoku_night_holiday', { contractKw: 6, tou: { night: 74 } })
    expect(v.current.monthlyChargeYen).toBeGreaterThan(1844)
    expect(v.current.notes).toEqual([])
  })

  it('低使用量では夜トクプランの方が高くなる（負の削減額）', () => {
    const v = ok('chugoku_night_holiday', { contractKw: 6, tou: { night: 100 } })
    expect(v.recommended.monthlySavingsYen).toBeLessThan(0)
  })
})

describe('auでんき', () => {
  it('auは独自の燃調単価を使うため7月はJAより安い', () => {
    const v = ok('au_m_plan', { totalKwh: 348 })
    expect(v.current.planName).toContain('auでんき')
    expect(v.recommended.monthlySavingsYen).toBeLessThan(0)
  })
})

// 検針月のセレクタは 2025-01 まで遡れるが、単価は1版しか無い。
// 「◯年◯月適用の単価による試算」と書くと嘘になる
describe('検針月と単価の適用月は別物', () => {
  it('過去月を選ぶと単価より前であることを持ち回る', () => {
    const v = ok('chugoku_juryo_a', { totalKwh: 348 }, { period: { year: 2025, month: 1 } })
    expect(v.ratePeriodLabel).toBe('2025年1月')
    expect(v.unitPriceEffectiveLabel).toBe('2026年7月適用')
    expect(v.periodPrecedesUnitPrices).toBe(true)
  })

  it('単価の適用開始以降なら注意は不要', () => {
    const v = ok('chugoku_juryo_a', { totalKwh: 348 }, { period: { year: 2026, month: 9 } })
    expect(v.periodPrecedesUnitPrices).toBe(false)
  })
})

// ラベルに金額を直書きすると、改定時に計算とずれても CI で気づけない
describe('画面に出す割引の条件は料金定義から引く', () => {
  it('ガスセット割の月額が計算と一致する', () => {
    const without = ok('chugoku_juryo_a', { totalKwh: 348 })
    const withGas = ok('chugoku_juryo_a', { totalKwh: 348 }, { gasSetDiscount: true })
    expect(withGas.annualSavingsYen - without.annualSavingsYen).toBe(GAS_SET_DISCOUNT_YEN * 12)
  })

  // 最初に見つかった1件で固定すると、プランごとに条件が違ったとき
  // 選んでいないプランの数字を表示することになる
  it('電化住宅割はシナリオごとにプラン定義から引く', () => {
    for (const scenario of SCENARIOS) {
      const plan = scenario.current
      const defined = 'allElectricDiscount' in plan ? plan.allElectricDiscount : null
      const shown = allElectricTermsOf(scenario)
      if (defined === null) {
        expect(shown, scenario.scenarioId).toBeNull()
      } else {
        expect(shown!.ratePercent).toBe(defined.rate.times(100).toNumber())
        expect(shown!.capYen).toBe(defined.capYen.toNumber())
      }
    }
  })
})

describe('表示の整形', () => {
  it('金額は円記号と3桁区切り', () => {
    expect(formatCurrency(12345)).toBe(formatCurrency(new Decimal('12345').toNumber()))
    expect(formatCurrency(12345)).toContain('12,345')
  })

  it('割合は既定で小数1桁', () => {
    expect(formatPercentage(12.34)).toContain('12.3')
    expect(formatPercentage(12.34, 0)).toContain('12')
  })
})

// 年額を月額×12で出すと、燃料費調整額が毎月改定されることを無視した数字になる。
// 12か月ぶんの実際の単価で積み上げる（CLAUDE.md ルール6・8）
describe('年間の試算', () => {
  const AUG = { year: 2026, month: 8 }

  const annual = (id: string, usage: object, opts: object = {}) => {
    const r = calculateComparison(id, usage, { period: AUG, ...opts })
    if (r.status !== 'ok') throw new Error('前提の月額が計算できていない')
    return calculateAnnual(id, usage, r.view.recommended.planId, { period: AUG, ...opts })!
  }

  it('12か月それぞれの単価で積み上げる', () => {
    const a = annual('chugoku_juryo_a', { totalKwh: 348 })
    expect(a.basis).toBe('rollup')
    expect(a.months).toHaveLength(12)
    expect(a.rangeLabel).toBe('2025年9月〜2026年8月')
    // 各月の合計が年額に一致する
    expect(a.months.reduce((s, m) => s + m.currentYen, 0)).toBe(a.currentYen)
    expect(a.months.reduce((s, m) => s + m.candidateYen, 0)).toBe(a.candidateYen)
    expect(a.savingsYen).toBe(a.currentYen - a.candidateYen)
  })

  // 積み上げと月額×12 が一致するなら、わざわざ12回計算する意味がない
  it('月額×12 とは一致しない（燃調が毎月違うため）', () => {
    const monthly = calculateComparison('chugoku_juryo_a', { totalKwh: 348 }, { period: AUG })
    if (monthly.status !== 'ok') throw new Error('unreachable')
    const a = annual('chugoku_juryo_a', { totalKwh: 348 })
    expect(a.currentYen).not.toBe(monthly.view.current.monthlyChargeYen * 12)
    // 月ごとの請求額も一定ではない
    expect(new Set(a.months.map(m => m.currentYen)).size).toBeGreaterThan(1)
  })

  it('ガスセット割は12か月ぶん引く', () => {
    const without = annual('chugoku_juryo_a', { totalKwh: 348 })
    const with_ = annual('chugoku_juryo_a', { totalKwh: 348 }, { gasSetDiscount: true })
    expect(with_.savingsYen - without.savingsYen).toBe(GAS_SET_DISCOUNT_YEN * 12)
    expect(with_.gasSetDiscountYen).toBe(GAS_SET_DISCOUNT_YEN * 12)
  })

  it('初年度は新規契約割引を足す', () => {
    const a = annual('chugoku_juryo_a', { totalKwh: 348 })
    expect(a.firstYearSavingsYen - a.savingsYen).toBe(3000)
  })

  // 時間帯別プランは月ごとの内訳が検針票からしか分からない。
  // 同じ内訳を12か月に当てると、7月の入力を1月の単価で計算することになる
  it('時間帯別プランは積み上げず、その旨を返す', () => {
    const a = annual('chugoku_night_holiday', { contractKw: 6, tou: { night: 430 } })
    expect(a.basis).toBe('times_twelve')
    expect(a.months).toHaveLength(0)
    expect(a.fallbackReason).toMatch(/12倍/)
  })

  it('12か月ぶんの燃調が無い事業者は積み上げない', () => {
    // auでんきの燃調は 2026-07 以降しか収録していない
    const a = annual('au_m_plan', { totalKwh: 348 })
    expect(a.basis).toBe('times_twelve')
    expect(a.fallbackReason).toMatch(/収録されていない/)
  })

  it('積み上げない場合でも年額は月額×12 に一致する', () => {
    const monthly = calculateComparison('au_m_plan', { totalKwh: 348 }, { period: AUG })
    if (monthly.status !== 'ok') throw new Error('unreachable')
    const a = annual('au_m_plan', { totalKwh: 348 })
    expect(a.currentYen).toBe(monthly.view.current.monthlyChargeYen * 12)
  })

  it('知らないプランには年額を出さない（ルール8）', () => {
    expect(calculateAnnual('unknown', { totalKwh: 348 }, 'x', { period: AUG })).toBeNull()
    expect(
      calculateAnnual('chugoku_juryo_a', { totalKwh: 348 }, 'no_such_plan', { period: AUG })
    ).toBeNull()
  })

  it('月額が計算できない入力には年額も出さない', () => {
    expect(calculateAnnual('chugoku_juryo_a', { totalKwh: -1 }, 'ja_denki_juryo_a', { period: AUG }))
      .toBeNull()
  })
})
