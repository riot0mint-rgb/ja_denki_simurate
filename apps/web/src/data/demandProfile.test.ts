import { describe, it, expect } from 'vitest'
import { Decimal } from '@ja-denki-simulator/calc-core'
import {
  CHUGOKU_FY2015_TOTAL_THOUSAND_KWH,
  CHUGOKU_MONTHLY_SOURCE_ROWS,
  CHUGOKU_HOUSEHOLD_PROFILE
} from './demandProfile'

describe('中国エリアの使われ方（電気事業連合会 電灯・電力需要実績）', () => {
  it('12か月ぶん揃っている', () => {
    expect(CHUGOKU_MONTHLY_SOURCE_ROWS).toHaveLength(12)
    expect(CHUGOKU_HOUSEHOLD_PROFILE.monthlyIndex).toHaveLength(12)
  })

  it('月別の販売電力量を足すと、公表されている2015年度の年間値と一致する', () => {
    // 転記ミスの検算。1件でも写し間違えるとここで落ちる
    const sum = CHUGOKU_MONTHLY_SOURCE_ROWS.reduce((a, r) => a + r.thousandKwh, 0)
    expect(sum).toBe(CHUGOKU_FY2015_TOTAL_THOUSAND_KWH)
  })

  it('指数は「販売電力量 ÷ 契約口数」から計算した1口あたりkWhと一致する', () => {
    for (const row of CHUGOKU_MONTHLY_SOURCE_ROWS) {
      const expected = new Decimal(row.thousandKwh)
        .times(1000)
        .dividedBy(row.contracts)
        .toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
      const actual = CHUGOKU_HOUSEHOLD_PROFILE.monthlyIndex[row.month - 1]
      expect(actual.toString()).toBe(expected.toString())
    }
  })

  it('すべて0より大きい', () => {
    expect(CHUGOKU_HOUSEHOLD_PROFILE.monthlyIndex.every(v => v.greaterThan(0))).toBe(true)
  })

  it('いちばん多いのは1月、いちばん少ないのは6月', () => {
    // 暖房のほうが冷房より電気を食うため、冬が年間のピークになる。
    // ここが夏になったら、写し間違いか統計の差し替えを疑う
    const values = CHUGOKU_HOUSEHOLD_PROFILE.monthlyIndex.map(v => v.toNumber())
    expect(values.indexOf(Math.max(...values)) + 1).toBe(1)
    expect(values.indexOf(Math.min(...values)) + 1).toBe(6)
  })

  it('出典が入っている（CLAUDE.md ルール4）', () => {
    const s = CHUGOKU_HOUSEHOLD_PROFILE.source
    expect(s.document).toContain('電気事業連合会')
    expect(s.locator).not.toBe('')
    expect(s.verificationStatus).toBe('verified')
  })
})
