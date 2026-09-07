import { describe, it, expect } from 'vitest'
import { diffFuelEntries, diffLevyEntries } from './monthlyRatesDiff'

describe('diffFuelEntries', () => {
  const current = {
    '2026-07': { minimumCharge: '-143.77', unitPriceYenPerKwh: '-9.57' },
    '2026-08': { minimumCharge: '-188.70', unitPriceYenPerKwh: '-12.56' }
  }

  it('未収録の年月は追加候補になる', () => {
    const r = diffFuelEntries(current, [{ period: '2026-09', minimumCharge: '-1', unitPriceYenPerKwh: '-1' }])
    expect(r.toAdd).toEqual([{ period: '2026-09', minimumCharge: '-1', unitPriceYenPerKwh: '-1' }])
    expect(r.conflicts).toEqual([])
    expect(r.unchanged).toEqual([])
  })

  it('既存と同じ値は変更なし扱い', () => {
    const r = diffFuelEntries(current, [{ period: '2026-07', minimumCharge: '-143.77', unitPriceYenPerKwh: '-9.57' }])
    expect(r.unchanged).toEqual(['2026-07'])
    expect(r.toAdd).toEqual([])
  })

  it('既存と値が違う場合はconflictとして報告し、追加はしない', () => {
    const r = diffFuelEntries(current, [{ period: '2026-07', minimumCharge: '-999', unitPriceYenPerKwh: '-9.57' }])
    expect(r.toAdd).toEqual([])
    expect(r.conflicts).toEqual([
      {
        period: '2026-07',
        current: { minimumCharge: '-143.77', unitPriceYenPerKwh: '-9.57' },
        fetched: { period: '2026-07', minimumCharge: '-999', unitPriceYenPerKwh: '-9.57' }
      }
    ])
  })
})

describe('diffLevyEntries', () => {
  const current = { '2026-08': '4.18' }

  it('未収録の年月は追加候補になる', () => {
    const r = diffLevyEntries(current, [{ period: '2026-09', unitPriceYenPerKwh: '4.18' }])
    expect(r.toAdd).toEqual([{ period: '2026-09', unitPriceYenPerKwh: '4.18' }])
  })

  it('既存と同じ値は変更なし扱い', () => {
    const r = diffLevyEntries(current, [{ period: '2026-08', unitPriceYenPerKwh: '4.18' }])
    expect(r.unchanged).toEqual(['2026-08'])
  })

  it('既存と値が違う場合はconflict', () => {
    const r = diffLevyEntries(current, [{ period: '2026-08', unitPriceYenPerKwh: '9.99' }])
    expect(r.conflicts).toEqual([{ period: '2026-08', current: '4.18', fetched: '9.99' }])
    expect(r.toAdd).toEqual([])
  })
})
