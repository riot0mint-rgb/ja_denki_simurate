import { describe, it, expect } from 'vitest'
import { Decimal } from '@ja-denki-simulator/calc-core'
import {
  ALL_ELECTRIC_PROFILE,
  DEMAND_PROFILES,
  EGC_LIGHTING,
  EGC_POWER,
  ENV_ELECTRICITY_ONLY,
  HOUSEHOLD_PROFILE,
  LOW_VOLTAGE_POWER_PROFILE
} from './demandProfile'

const fixed = (p: { monthlyIndex: Decimal[] }) => p.monthlyIndex.map(v => v.toFixed(3))

/**
 * 期待値は、取得した Excel を Python（浮動小数）で別に計算した値。
 * 本体は Decimal で、実装も別。2つの計算が3桁まで一致することで、
 * 指数の導出（年度ごとに平均を1とした倍率 → 年度平均 → 1月始まり）の取り違えを検知する。
 */
describe('指数（1月〜12月）', () => {
  it('電灯（直近3年度）', () => {
    expect(fixed(HOUSEHOLD_PROFILE)).toEqual([
      '1.344', '1.263', '1.080', '0.923', '0.783', '0.742',
      '0.887', '1.200', '1.145', '0.866', '0.805', '0.962'
    ])
  })

  it('低圧電力（直近3年度）', () => {
    expect(fixed(LOW_VOLTAGE_POWER_PROFILE)).toEqual([
      '1.119', '1.129', '0.990', '0.844', '0.739', '0.796',
      '1.033', '1.397', '1.321', '1.012', '0.772', '0.849'
    ])
  })

  it('オール電化（電気のみを使用・直近5年度）', () => {
    expect(fixed(ALL_ELECTRIC_PROFILE)).toEqual([
      '1.638', '1.455', '1.267', '1.061', '0.837', '0.685',
      '0.731', '0.868', '0.823', '0.700', '0.812', '1.123'
    ])
  })

  it('どれも12か月ぶんで、平均がちょうど 1', () => {
    for (const p of Object.values(DEMAND_PROFILES)) {
      expect(p.monthlyIndex).toHaveLength(12)
      const mean = p.monthlyIndex.reduce((a, b) => a.plus(b), new Decimal(0)).dividedBy(12)
      expect(mean.toFixed(12), p.id).toBe('1.000000000000')
    }
  })
})

describe('季節の形が契約の種類に合っている', () => {
  const month = (p: { monthlyIndex: Decimal[] }, m: number) => p.monthlyIndex[m - 1].toNumber()
  const peak = (p: { monthlyIndex: Decimal[] }) => {
    const v = p.monthlyIndex.map(x => x.toNumber())
    return v.indexOf(Math.max(...v)) + 1
  }

  it('一般のご家庭とオール電化は冬（1月）が年間のピーク', () => {
    // 暖房のほうが冷房より電気を食う。ここが夏になったら、写し間違いか統計の取り違えを疑う
    expect(peak(HOUSEHOLD_PROFILE)).toBe(1)
    expect(peak(ALL_ELECTRIC_PROFILE)).toBe(1)
  })

  it('低圧電力は夏（8月）が年間のピーク', () => {
    expect(peak(LOW_VOLTAGE_POWER_PROFILE)).toBe(8)
  })

  it('オール電化は一般のご家庭より冬の山が大きい（冬と春秋の比）', () => {
    const ratio = (p: { monthlyIndex: Decimal[] }) =>
      (month(p, 1) + month(p, 2)) / (month(p, 5) + month(p, 10))
    expect(ratio(ALL_ELECTRIC_PROFILE)).toBeGreaterThan(ratio(HOUSEHOLD_PROFILE) * 1.2)
  })
})

/**
 * 転記ミスの検知。年度ごとの合計は取得した Excel から出した値で、
 * 1件でも写し間違えたり、後で手が入ったりするとここで落ちる。
 */
describe('元の数値（取得した統計の転記）', () => {
  const sum = (values: ReadonlyArray<number>) => values.reduce((a, b) => a + b, 0)

  it('電灯: 販売電力量と契約口数の年度ごとの合計', () => {
    expect(EGC_LIGHTING.map(y => y.fiscalYear)).toEqual([2023, 2024, 2025])
    expect(EGC_LIGHTING.map(y => sum(y.rows.map(r => r[0])))).toEqual([3930051, 3843738, 3496878])
    expect(EGC_LIGHTING.map(y => sum(y.rows.map(r => r[1])))).toEqual([26562800, 25529617, 24449764])
  })

  it('電力: 販売電力量と契約口数の年度ごとの合計', () => {
    expect(EGC_POWER.map(y => y.fiscalYear)).toEqual([2023, 2024, 2025])
    expect(EGC_POWER.map(y => sum(y.rows.map(r => r[0])))).toEqual([957511, 930793, 827650])
    expect(EGC_POWER.map(y => sum(y.rows.map(r => r[1])))).toEqual([2559157, 2429309, 2258308])
  })

  it('オール電化: 年度ごとの集計世帯数と、月別消費量(GJ)の合計', () => {
    expect(ENV_ELECTRICITY_ONLY.map(y => y.fiscalYear)).toEqual([2019, 2020, 2021, 2022, 2023])
    expect(ENV_ELECTRICITY_ONLY.map(y => y.sample)).toEqual([163, 187, 186, 194, 175])
    expect(ENV_ELECTRICITY_ONLY.map(y => Number(sum(y.gj).toFixed(2)))).toEqual([27.36, 27.08, 26.92, 26.9, 24.75])
  })

  it('どの年度も12か月ぶん', () => {
    for (const y of [...EGC_LIGHTING, ...EGC_POWER]) expect(y.rows).toHaveLength(12)
    for (const y of ENV_ELECTRICITY_ONLY) expect(y.gj).toHaveLength(12)
  })
})

describe('出典（CLAUDE.md ルール4）', () => {
  it('どのプロファイルにも出典・確認日が入っている', () => {
    for (const p of Object.values(DEMAND_PROFILES)) {
      expect(p.source.document, p.id).not.toBe('')
      expect(p.source.locator, p.id).not.toBe('')
      expect(p.source.verificationStatus, p.id).toBe('verified')
      expect(p.source.verifiedAt, p.id).toBe('2026-10-14')
      expect(p.description, p.id).not.toBe('')
    }
  })

  it('出典の組織名が実際のデータ元と合っている', () => {
    expect(HOUSEHOLD_PROFILE.source.document).toContain('電力・ガス取引監視等委員会')
    expect(LOW_VOLTAGE_POWER_PROFILE.source.document).toContain('電力・ガス取引監視等委員会')
    expect(ALL_ELECTRIC_PROFILE.source.document).toContain('環境省')
  })

  it('低圧電力は電力区分全体（臨時電力・農事用電力を含む）であることを出典に明記している', () => {
    expect(LOW_VOLTAGE_POWER_PROFILE.source.locator).toContain('臨時電力・農事用電力を含む')
  })
})
