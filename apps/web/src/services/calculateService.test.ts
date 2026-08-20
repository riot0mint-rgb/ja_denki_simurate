import { describe, it, expect } from 'vitest'
import { Decimal } from '@ja-denki-simulator/calc-core'
import {
  calculateComparison,
  formatCurrency,
  formatPercentage,
  isSummerMonth,
  needsCalendar,
  findScenario,
  SCENARIOS,
  PERIOD_OPTIONS,
  DEFAULT_RATE_PERIOD
} from './calculateService'

const JULY = { year: 2026, month: 7 }

function ok(scenarioId: string, usage: Parameters<typeof calculateComparison>[1], opts = {}) {
  const r = calculateComparison(scenarioId, usage, { period: JULY, ...opts })
  if (r.status !== 'ok') throw new Error(`unsupported: ${r.reason}`)
  return r.view
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
  it('既定は26年7月で、選択肢に含まれる', () => {
    expect(DEFAULT_RATE_PERIOD).toEqual(JULY)
    expect(PERIOD_OPTIONS).toContainEqual(JULY)
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
    expect(v.sources.length).toBeGreaterThan(0)
    expect(v.sources.every(s => s.includes('.xlsx'))).toBe(true)
    expect(v.ratePeriodLabel).toBe('2026年7月適用')
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

describe('ナイトホリデー（最低月額料金型）', () => {
  it('73kWh は最低月額料金 1,845円', () => {
    const v = ok('chugoku_night_holiday', { contractKw: 6, tou: { night: 73 } })
    expect(v.current.monthlyChargeYen).toBe(1845)
    expect(v.current.notes.some(n => n.includes('最低月額料金'))).toBe(true)
  })

  it('74kWh から通常計算になる', () => {
    const v = ok('chugoku_night_holiday', { contractKw: 6, tou: { night: 74 } })
    expect(v.current.monthlyChargeYen).toBeGreaterThan(1845)
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
