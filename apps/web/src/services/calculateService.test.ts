import { describe, it, expect } from 'vitest'
import { DEFAULT_PERIOD, Decimal, UsageInput, meterCalendarOf } from '@ja-denki-simulator/calc-core'
import type { ComparisonScenario } from '../data/rates'
import {
  ALL_PLANS,
  PRICE_SINCE,
  PRICE_TERMS,
  REVISED_PLANS,
  chugokuJuryoA,
  jaDenkiJuryoA,
  planForPeriod,
  providerOf,
  rateAvailability,
  unitPriceTermsOf
} from '../data/rates'
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
  computeDefaultRatePeriod,
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
  it('全15シナリオが引ける', () => {
    expect(SCENARIOS).toHaveLength(15)
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
  // 月次データは自動取得で毎月増えるので、特定の年月は書かない
  it('既定は全シナリオで計算できる最新の検針月', () => {
    const key = (p: { year: number; month: number }) => p.year * 12 + p.month
    for (const scenario of SCENARIOS) {
      const options = periodOptionsFor(scenario)
      expect(options, scenario.scenarioId).toContainEqual(DEFAULT_RATE_PERIOD)
    }
    const later = periodOptionsFor(SCENARIOS[0]).filter(p => key(p) > key(DEFAULT_RATE_PERIOD))
    for (const p of later) {
      expect(SCENARIOS.some(s => !periodOptionsFor(s).some(o => key(o) === key(p)))).toBe(true)
    }
  })

  it('共通の月が1か月も無ければ、calc-core の既定（燃調がそろう最新月）に倒す', () => {
    expect(computeDefaultRatePeriod([])).toEqual(DEFAULT_PERIOD)
  })

  it('改定待ち・日割りの月は検針月の選択肢に出さない', () => {
    const NOV = { year: 2026, month: 11 }
    for (const scenario of SCENARIOS) {
      expect(periodOptionsFor(scenario), scenario.scenarioId).not.toContainEqual(NOV)
    }
  })

  it('改定待ちの月を指定されたら、旧単価で計算せず unsupported と理由を返す', () => {
    const r = calculateComparison('chugoku_juryo_a', { totalKwh: 300 }, { period: { year: 2026, month: 11 } })
    expect(r.status).toBe('unsupported')
    if (r.status === 'unsupported') {
      expect(r.reason).toMatch(/日割り|改定後の単価がまだ公表されていない/)
      expect(r.nextSteps.length).toBeGreaterThan(0)
    }
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
    expect(v.unitPriceTerms).toBe('中国電力 2024年4月1日実施 ／ JAでんき 2024年5月検針分から')
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

// 単価は「その検針月に適用されている版」で計算し、画面にはその版の適用開始を書く。
// 試算表の「26年7月適用」は試算表を作った月であって、単価の適用開始ではない。
// 中国電力の約款・料金表の新旧を突き合わせると、2024年4月1日実施から2026年10月ご使用分まで
// 金額は同一（2025年4月1日実施版は再発行）、JAでんきも2024年5月検針分から同一だった
describe('検針月に適用されている単価の版', () => {
  it('検針月が変わっても、その月の単価の適用開始を書く（試算表の作成月を書かない）', () => {
    for (const [year, month] of [[2025, 1], [2025, 8], [2026, 7], [2026, 10]] as const) {
      const v = ok('chugoku_juryo_a', { totalKwh: 348 }, { period: { year, month } })
      expect(v.ratePeriodLabel).toBe(`${year}年${month}月`)
      expect(v.unitPriceTerms, `${year}-${month}`).toBe('中国電力 2024年4月1日実施 ／ JAでんき 2024年5月検針分から')
      expect(v.unitPriceTerms).not.toContain('2026年7月')
    }
  })

  it('auでんきは適用開始が公表されていないので、そう書く', () => {
    const v = ok('au_m_plan', { totalKwh: 348 }, { period: { year: 2026, month: 8 } })
    expect(v.unitPriceTerms).toBe('auでんき 公式サイト掲載の料金表 ／ JAでんき 2024年5月検針分から')
  })

  it('2026年11月1日の中国電力の改定は、12月検針分からの版として言う', () => {
    expect(unitPriceTermsOf([chugokuJuryoA], { year: 2026, month: 11 })).toBe('中国電力 2024年4月1日実施')
    expect(unitPriceTermsOf([chugokuJuryoA], { year: 2026, month: 12 })).toBe('中国電力 2026年11月1日実施')
    expect(unitPriceTermsOf([jaDenkiJuryoA], { year: 2026, month: 11 })).toBe('JAでんき 2026年11月検針分から')
  })

  it('単価を持っている最初の月より前の検針月は試算しない（いまの単価を当てて嘘の請求額にしない）', () => {
    expect(rateAvailability(chugokuJuryoA, { year: 2024, month: 3 }).ok).toBe(false)
    expect(rateAvailability(chugokuJuryoA, { year: 2024, month: 4 }).ok).toBe(true)
    expect(rateAvailability(jaDenkiJuryoA, { year: 2024, month: 4 }).ok).toBe(false)
    expect(rateAvailability(jaDenkiJuryoA, { year: 2024, month: 5 }).ok).toBe(true)
    const r = rateAvailability(jaDenkiJuryoA, { year: 2024, month: 4 })
    if (!r.ok) {
      expect(r.reason).toContain('JAでんきの単価は2024年5月分から')
      expect(r.nextSteps[0]).toContain('2024年5月以降')
    }
    const c = calculateComparison('chugoku_juryo_a', { totalKwh: 348 }, { period: { year: 2024, month: 3 } })
    expect(c.status).toBe('unsupported')
  })

  it('すべてのプランの出典に、その単価の適用開始が入っている（試算表の月を入れない）', () => {
    for (const plan of ALL_PLANS) {
      const provider = providerOf(plan)
      expect(plan.sources.some(s => s.effectiveFrom === PRICE_SINCE[provider]), plan.planId).toBe(true)
      if (provider !== 'au') {
        expect(plan.sources.every(s => s.effectiveFrom !== '2026-07'), plan.planId).toBe(true)
      }
    }
  })

  it('改定後の版の切替月は、単価の版（PRICE_TERMS）の切替月と一致する', () => {
    for (const plan of REVISED_PLANS) {
      const provider = providerOf(plan)
      const from = plan.sources[0].effectiveFrom
      expect(PRICE_TERMS[provider].map(t => t.from), plan.planId).toContain(from)
      const [y, m] = from.split('-').map(Number)
      const base = ALL_PLANS.find(p => p.planId === plan.planId)!
      const previous = planForPeriod(base, { year: m === 1 ? y - 1 : y, month: m === 1 ? 12 : m - 1 })
      expect(previous, plan.planId).not.toBe(plan)
      expect(planForPeriod(base, { year: y, month: m }), plan.planId).toBe(plan)
    }
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

  // 時間帯別プランも、12か月それぞれの燃料費調整額で積み上げる。
  // デイタイムが夏季単価かその他季単価かは使い方ではなくカレンダーで決まるので、月ごとに振り直す
  it('時間帯別プランも12か月ぶんを積み上げる（デイタイムの夏季／その他季は月ごとに振り直す）', () => {
    const usage = { contractKw: 6, tou: { daySummer: 100, dayOther: 0, night: 300, holiday: 50 } }
    const a = annual('chugoku_night_holiday', usage)
    expect(a.basis).toBe('rollup')
    expect(a.months).toHaveLength(12)
    expect(a.months.every(m => m.usageKwh === 450)).toBe(true)
    expect(a.months.reduce((sum, m) => sum + m.currentYen, 0)).toBe(a.currentYen)

    // 1月は夏季にかからないので、デイタイム100kWh はその他季として計算されている
    const jan = calculateComparison(
      'chugoku_night_holiday',
      { contractKw: 6, tou: { daySummer: 0, dayOther: 100, night: 300, holiday: 50 } },
      { period: { year: 2026, month: 1 } }
    )
    if (jan.status !== 'ok') throw new Error('unreachable')
    expect(a.months.find(m => m.month === 1)!.currentYen).toBe(jan.view.current.monthlyChargeYen)
    // 基準の8月は入力どおり（夏季）。夏季のほうが単価が高いので、1月とは請求額が違う
    expect(a.months.find(m => m.month === 8)!.currentYen).not.toBe(jan.view.current.monthlyChargeYen)
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

  describe('1年ぶんの見積もり方（毎月おなじ／季節で増減）', () => {
    it('既定は「毎月おなじ」で、どの月も入力どおりの使用量になる', () => {
      const a = annual('chugoku_juryo_a', { totalKwh: 348 })
      expect(a.method).toBe('flat')
      expect(a.seasonal).not.toBeNull() // 選べるが、選んでいない
      expect(a.months.every(m => m.usageKwh === 348)).toBe(true)
    })

    it('「季節で増減」を選ぶと月ごとの使用量が変わる', () => {
      const a = annual('chugoku_juryo_a', { totalKwh: 348 }, { method: 'seasonal' })
      expect(a.method).toBe('seasonal')
      expect(a.seasonal?.description).toContain('電灯')
      expect(a.seasonal?.source.document).toContain('電力・ガス取引監視等委員会')
      expect(new Set(a.months.map(m => m.usageKwh)).size).toBeGreaterThan(1)
    })

    it('基準にした検針月は、入力した使用量のまま動かさない', () => {
      const a = annual('chugoku_juryo_a', { totalKwh: 348 }, { method: 'seasonal' })
      const base = a.months.find(m => m.month === AUG.month)
      expect(base?.usageKwh).toBe(348)
    })

    it('冷暖房を使う1月は8月基準より多く、6月は少なくなる', () => {
      const a = annual('chugoku_juryo_a', { totalKwh: 348 }, { method: 'seasonal' })
      const at = (month: number) => a.months.find(m => m.month === month)!.usageKwh!
      expect(at(1)).toBeGreaterThan(348)
      expect(at(6)).toBeLessThan(348)
    })

    it('見積もり方を変えると年額も変わる', () => {
      const flat = annual('chugoku_juryo_a', { totalKwh: 348 })
      const seasonal = annual('chugoku_juryo_a', { totalKwh: 348 }, { method: 'seasonal' })
      expect(seasonal.currentYen).not.toBe(flat.currentYen)
      // 月ごとの合計は、どちらの見積もり方でも年額と一致していること
      expect(seasonal.months.reduce((s, m) => s + m.currentYen, 0)).toBe(seasonal.currentYen)
      expect(seasonal.months.reduce((s, m) => s + m.candidateYen, 0)).toBe(seasonal.candidateYen)
    })

    it('使用量0なら、季節で増減させても全部0のまま', () => {
      const a = annual('chugoku_juryo_a', { totalKwh: 0 }, { method: 'seasonal' })
      expect(a.months.every(m => m.usageKwh === 0)).toBe(true)
    })

    it('時間帯別のプランも季節で増減する。昼・夜・休日の割合は入力の月のまま', () => {
      const usage = { contractKw: 6, tou: { daySummer: 100, dayOther: 0, night: 300, holiday: 50 } }
      const a = annual('chugoku_night_holiday', usage, { method: 'seasonal' })
      expect(a.method).toBe('seasonal')
      expect(a.seasonal?.source.document).toContain('環境省')
      const total = (month: number) => a.months.find(m => m.month === month)!.usageKwh!
      // 基準の8月は入力のまま。冬の1月は、オール電化の指数の比（1.638 / 0.868）で増える
      expect(total(8)).toBe(450)
      expect(total(1)).toBeGreaterThan(total(8) * 1.8)
      expect(total(1)).toBeLessThan(total(8) * 2)
    })

    it('統計が無いプラン（深夜電力B）は「季節で変わる」を選べない', () => {
      const a = annual('chugoku_midnight_b', { totalKwh: 400, contractKw: 6 }, { method: 'seasonal' })
      expect(a.seasonal).toBeNull()
      expect(a.method).toBe('flat') // 指定されても毎月おなじに落とす（ルール8）
      expect(a.basis).toBe('rollup')
      expect(a.months.every(m => m.usageKwh === 400)).toBe(true)
    })
  })
})

describe('2026-10 追加のシナリオ', () => {
  const OCT = { year: 2026, month: 10 }

  it('中国電力 動力コース → JAでんき 低圧電力', () => {
    const v = ok('chugoku_power_course', { contractKw: 6, seasonal: { summerKwh: 0, otherKwh: 400 } }, { period: OCT })
    expect(v.candidates.map(c => c.planId)).toEqual(['ja_denki_low_voltage'])
    // 基本料金の差 (1,152.44 − 1,132.83) × 6kW = 117.66。従量料金は同じ。
    // 端数の切り捨てがそれぞれの請求額にかかるので、差は 118円
    expect(v.recommended.monthlySavingsYen).toBe(118)
  })

  it('中国電力 スマートBコース → JAでんき 従量電灯B（契約容量を聞く）', () => {
    const scenario = findScenario('chugoku_smart_b')!
    expect(scenario.contract).toBe('kva')
    const v = ok('chugoku_smart_b', { contractKva: 10, totalKwh: 400 }, { period: OCT })
    expect(v.candidates.map(c => c.planId)).toEqual(['ja_denki_juryo_b'])
  })

  it('auでんき 低圧電力 → JAでんき 低圧電力（auでんきの燃調を使う）', () => {
    const scenario = findScenario('au_low_voltage')!
    expect(scenario.fuelProvider).toBe('au')
    const v = ok('au_low_voltage', { contractKw: 6, seasonal: { summerKwh: 0, otherKwh: 400 } }, { period: OCT })
    expect(v.candidates.map(c => c.planId)).toEqual(['ja_denki_low_voltage'])
  })
})

describe('ファミリータイム・時間帯別電灯から 従量電灯A/S/B への比較', () => {
  const OCT = { year: 2026, month: 10 }
  const family = (contractKva: number) => ({
    contractKva,
    familyTime: { dayOther: 120, family: 80, night: 250 },
    calendar: sampleCalendar
  })

  it('6kVA以上は 夜トクプラン と 従量電灯B を比べる', () => {
    const v = ok('chugoku_family_1', family(10), { period: OCT })
    expect(v.candidates.map(c => c.planId).sort()).toEqual(['ja_denki_juryo_b', 'ja_denki_yotoku'])
  })

  it('6kVA未満は 夜トクプラン と 従量電灯A・S を比べる', () => {
    const v = ok('chugoku_family_2', family(5), { period: OCT })
    expect(v.candidates.map(c => c.planId).sort()).toEqual(['ja_denki_juryo_a', 'ja_denki_juryo_s', 'ja_denki_yotoku'])
  })

  it('50kVA以上は従量電灯の対象外なので 夜トクプラン だけ', () => {
    const v = ok('chugoku_family_1', family(50), { period: OCT })
    expect(v.candidates.map(c => c.planId)).toEqual(['ja_denki_yotoku'])
  })

  it('従量電灯B には時間帯の振替を通さず、入力の合計（450kWh）をそのまま渡す', () => {
    const v = ok('chugoku_family_1', family(10), { period: OCT })
    const b = v.candidates.find(c => c.planId === 'ja_denki_juryo_b')!
    // 段階は 120 / 180 / 150kWh（合計450kWh）。10月検針分は値下げ前の 447.97円/kVA
    expect(b.formula).toContain('447.97円 × 10kVA')
    expect(b.formula).toContain('× 120kWh')
    expect(b.formula).toContain('× 180kWh')
    expect(b.formula).toContain('× 150kWh')
  })

  it('時間帯別電灯（エコノミーナイト）でも昼間＋夜間の合計で比べる', () => {
    const v = ok(
      'chugoku_economy_night',
      { contractKva: 8, economyNight: { dayKwh: 200, nightKwh: 300 }, calendar: sampleCalendar },
      { period: OCT }
    )
    expect(v.candidates.map(c => c.planId).sort()).toEqual(['ja_denki_juryo_b', 'ja_denki_yotoku'])
  })

  it('契約容量が無ければ容量で決まる候補は出さない（推測しない）', () => {
    const r = calculateComparison(
      'chugoku_family_1',
      { familyTime: { dayOther: 120, family: 80, night: 250 }, calendar: sampleCalendar },
      { period: OCT }
    )
    // 夜トク側はご契約電力が要るので、それ自体が計算不可になる
    expect(r.status).toBe('unsupported')
  })
})

// 時間帯別・季節別のプランの年間試算。月ごとの使用量は、検針票の1か月から次のように組み立てる。
//   ・全体の量は、契約の種類に合った統計の指数で増減させる
//   ・昼・夜・休日の割合は入力の月のまま
//   ・夏季／その他季は検針日とカレンダーから月ごとに振り直す
//   ・夜トクへの振り替えは、月ごとの土日・祝日の日数で数え直す
describe('時間帯別・季節別プランの年間試算', () => {
  const OCT = { year: 2026, month: 10 }
  const rollup = (id: string, usage: UsageInput, opts: object = {}) => {
    const r = calculateComparison(id, usage, { period: OCT })
    if (r.status !== 'ok') throw new Error(`前提の月額が計算できていない: ${r.reason}`)
    return calculateAnnual(id, usage, r.view.recommended.planId, { period: OCT, ...opts })!
  }
  const monthly = (id: string, usage: UsageInput, month: number) => {
    const year = month <= 10 ? 2026 : 2025
    const r = calculateComparison(id, usage, { period: { year, month } })
    if (r.status !== 'ok') throw new Error(`月額が計算できていない: ${r.reason}`)
    return r.view
  }
  const at = (a: { months: Array<{ month: number; usageKwh: number | null }> }, month: number) =>
    a.months.find(m => m.month === month)!.usageKwh!

  describe('低圧電力（夏季／その他季）', () => {
    const base: UsageInput = { contractKw: 6, seasonal: { summerKwh: 0, otherKwh: 400 }, totalKwh: 400 }

    it('毎月おなじ量でも、8月・9月は夏季単価、ほかの月はその他季単価で計算する', () => {
      const a = rollup('chugoku_low_voltage', base)
      expect(a.basis).toBe('rollup')
      // 2026-08 の請求額は、同じ400kWh を夏季として直接計算した額に一致する
      const aug = monthly('chugoku_low_voltage', { contractKw: 6, seasonal: { summerKwh: 400, otherKwh: 0 }, totalKwh: 400 }, 8)
      expect(a.months.find(m => m.month === 8)!.currentYen).toBe(aug.current.monthlyChargeYen)
      // 基準の10月は入力のまま（その他季）
      const oct = monthly('chugoku_low_voltage', base, 10)
      expect(a.months.find(m => m.month === 10)!.currentYen).toBe(oct.current.monthlyChargeYen)
    })

    it('季節をまたぐ7月は、検針日から夏季の割合を数える（検針日6日なら 5/30）', () => {
      const a = rollup('chugoku_low_voltage', { ...base, readingDay: 6 })
      const jul = monthly(
        'chugoku_low_voltage',
        { contractKw: 6, seasonal: { summerKwh: 67, otherKwh: 333 }, totalKwh: 400 },
        7
      )
      expect(a.months.find(m => m.month === 7)!.currentYen).toBe(jul.current.monthlyChargeYen)
    })

    it('検針日を省略すると月の中ごろ（15日）とみなし、その旨を前提に書く', () => {
      const a = rollup('chugoku_low_voltage', base)
      expect(a.assumptionNote).toContain('毎月15日')
      expect(a.assumptionNote).toContain('月の中ごろ')
      expect(a.assumptionNote).not.toContain('昼・夜・休日') // 低圧電力に時間帯の割合は無い
    })

    it('検針日を入力すれば、前提にその日付が出る', () => {
      expect(rollup('chugoku_low_voltage', { ...base, readingDay: 6 }).assumptionNote).toContain('毎月6日として')
    })

    it('「季節で変わる」は低圧電力の指数で、夏（8月）が最大になる', () => {
      const a = rollup('chugoku_low_voltage', base, { method: 'seasonal' })
      expect(a.method).toBe('seasonal')
      expect(a.seasonal?.description).toContain('低圧電力')
      const totals = a.months.map(m => m.usageKwh!)
      expect(a.months[totals.indexOf(Math.max(...totals))].month).toBe(8)
      expect(at(a, 10)).toBe(400) // 基準月は入力のまま
    })

    it('検針日が2〜28日でなければ、月ごとの使用量を組み立てず月額×12に落とす', () => {
      const a = rollup('chugoku_low_voltage', { ...base, readingDay: 31 })
      expect(a.basis).toBe('times_twelve')
      expect(a.fallbackReason).toMatch(/組み立てられない/)
    })
  })

  describe('電化Style・ナイトホリデー（オール電化の時間帯別）', () => {
    const base: UsageInput = { contractKw: 6, tou: { daySummer: 0, dayOther: 100, night: 200, holiday: 50 } }

    it('夜トクプランと比べるので、候補側にも同じ月ごとの使用量が渡る', () => {
      const a = rollup('chugoku_denka_style', base, { method: 'seasonal' })
      expect(a.basis).toBe('rollup')
      expect(a.months).toHaveLength(12)
      expect(a.months.reduce((sum, m) => sum + m.candidateYen, 0)).toBe(a.candidateYen)
    })

    it('冬（1月）はオール電化の指数で大きく増え、10月基準の1.64/0.70倍', () => {
      const a = rollup('chugoku_denka_style', base, { method: 'seasonal' })
      expect(at(a, 10)).toBe(350)
      const ratio = at(a, 1) / 350
      expect(ratio).toBeGreaterThan(2.2)
      expect(ratio).toBeLessThan(2.5)
    })

    it('前提に「昼・夜・休日の割合は入力の月のまま」と書く', () => {
      const a = rollup('chugoku_denka_style', base)
      expect(a.assumptionNote).toContain('昼・夜・休日の割合は、検針票の月と同じ')
      expect(a.assumptionNote).not.toContain('土日・祝日') // 電化Styleは振り替えが要らない
    })
  })

  describe('ファミリータイム・時間帯別電灯（夜トクへ振り替える）', () => {
    const calendar = meterCalendarOf(2026, 10, 6, 'same')!
    const family: UsageInput = {
      contractKva: 10,
      readingDay: 6,
      calendar,
      familyTime: { daySummer: 0, dayOther: 120, family: 80, night: 250 }
    }

    it('月ごとの土日・祝日の日数で数え直して夜トクに振り替える', () => {
      const a = rollup('chugoku_family_1', family)
      expect(a.basis).toBe('rollup')
      // 2026年1月（検針日6日 = 前年12/6〜1/5）の内訳を、calc-core の公開関数だけで組み立てて比べる
      const jan = monthly(
        'chugoku_family_1',
        {
          contractKva: 10,
          calendar: meterCalendarOf(2026, 1, 6, 'same')!,
          familyTime: { daySummer: 0, dayOther: 120, family: 80, night: 250 }
        },
        1
      )
      const m = a.months.find(x => x.month === 1)!
      expect(m.currentYen).toBe(jan.current.monthlyChargeYen)
      expect(m.candidateYen).toBe(jan.recommended.monthlyChargeYen)
    })

    it('前提に、割合は入力のまま・土日祝日は月ごとに数え直すと書く', () => {
      const a = rollup('chugoku_family_1', family)
      expect(a.assumptionNote).toContain('昼・夜・休日の割合は、検針票の月と同じ')
      expect(a.assumptionNote).toContain('土日・祝日の日数で数え直')
      expect(a.assumptionNote).toContain('毎月6日として')
    })

    it('時間帯別電灯（エコノミーナイト）も同じ仕組みで積み上げる', () => {
      const a = rollup(
        'chugoku_economy_night',
        { contractKva: 8, readingDay: 6, calendar, economyNight: { dayKwh: 200, nightKwh: 300 } },
        { method: 'seasonal' }
      )
      expect(a.basis).toBe('rollup')
      expect(at(a, 10)).toBe(500)
      expect(at(a, 1)).toBeGreaterThan(800)
    })

    it('従量電灯A/S/B も、各月の使用量の合計で比べる', () => {
      const a = calculateAnnual(
        'chugoku_family_1',
        family,
        'ja_denki_juryo_b',
        { period: OCT, method: 'seasonal' }
      )!
      expect(a.planId).toBe('ja_denki_juryo_b')
      expect(a.basis).toBe('rollup')
      expect(a.months).toHaveLength(12)
    })
  })

  describe('全シナリオ', () => {
    it('中国電力の全シナリオで 12か月を積み上げ、合計が年額に一致する', () => {
      for (const scenario of SCENARIOS.filter(s => s.fuelProvider === 'chugoku')) {
        const usage: UsageInput = {
          ...sampleUsageFor(scenario.usageForm),
          readingDay: 6,
          ...(scenario.usageForm === 'family' || scenario.usageForm === 'economy_night'
            ? { calendar: meterCalendarOf(2026, 10, 6, 'same')! }
            : {})
        }
        for (const method of ['flat', 'seasonal'] as const) {
          const a = rollup(scenario.scenarioId, usage, { method })
          expect(a.basis, `${scenario.scenarioId}/${method}`).toBe('rollup')
          expect(a.months, scenario.scenarioId).toHaveLength(12)
          expect(a.months.reduce((sum, m) => sum + m.currentYen, 0)).toBe(a.currentYen)
          expect(a.months.reduce((sum, m) => sum + m.candidateYen, 0)).toBe(a.candidateYen)
          // 季節で変わるが選べるのは、統計があるプランだけ
          expect(a.method, `${scenario.scenarioId}/${method}`).toBe(
            method === 'seasonal' && scenario.demandProfile ? 'seasonal' : 'flat'
          )
        }
      }
    })

    it('どのシナリオも、季節で変わるを選べるかは demandProfile の有無と一致する', () => {
      const without = SCENARIOS.filter(s => s.demandProfile === null).map(s => s.scenarioId)
      expect(without).toEqual(['chugoku_midnight_b'])
    })

    it('auでんきの低圧電力は、燃調が12か月そろうまで月額×12', () => {
      const a = calculateAnnual(
        'au_low_voltage',
        { contractKw: 6, seasonal: { summerKwh: 0, otherKwh: 400 }, totalKwh: 400 },
        'ja_denki_low_voltage',
        { period: OCT }
      )!
      expect(a.basis).toBe('times_twelve')
      expect(a.fallbackReason).toMatch(/収録されていない/)
    })
  })
})

// 冬の検針票を「毎月おなじ」で12か月に広げると、年間を多く見込みすぎる。
// どちらに偏るかを、見積もり方を選ぶ手がかりとして出す
describe('「毎月おなじ」の偏りの注意', () => {
  const noteAt = (month: number, opts: object = {}, id = 'chugoku_juryo_a') => {
    const period = { year: 2026, month }
    const usage = { totalKwh: 300, contractKva: 6, contractKw: 6 }
    const r = calculateComparison(id, usage, { period })
    if (r.status !== 'ok') throw new Error('前提の月額が計算できていない')
    return calculateAnnual(id, usage, r.view.recommended.planId, { period, ...opts })!.flatBiasNote
  }

  it('冬の1月は、平均より約34%多く使う月と伝える', () => {
    const note = noteAt(1)
    expect(note).toContain('検針票の1月')
    expect(note).toContain('約34%多く')
    expect(note).toContain('多めに見込みます')
  })

  it('初夏の6月は、平均より約26%少なく使う月と伝える', () => {
    const note = noteAt(6)
    expect(note).toContain('約26%少なく')
    expect(note).toContain('少なめに見込みます')
  })

  it('平均に近い月（4月）は出さない', () => {
    expect(noteAt(4)).toBeNull()
  })

  it('「季節で変わる」を選んだら出さない（偏りを直しているため）', () => {
    expect(noteAt(1, { method: 'seasonal' })).toBeNull()
  })

  it('季節の形を示す統計が無いプランには出さない', () => {
    expect(noteAt(1, {}, 'chugoku_midnight_b')).toBeNull()
  })

  it('オール電化は冬の山が大きいので、冬の検針票ほど強く伝わる', () => {
    const period = { year: 2026, month: 1 }
    const usage = { contractKw: 6, tou: { dayOther: 100, night: 100, holiday: 100 } }
    const r = calculateComparison('chugoku_denka_style', usage, { period })
    if (r.status !== 'ok') throw new Error('unreachable')
    const note = calculateAnnual('chugoku_denka_style', usage, r.view.recommended.planId, { period })!.flatBiasNote
    expect(note).toContain('約64%多く')
  })
})
