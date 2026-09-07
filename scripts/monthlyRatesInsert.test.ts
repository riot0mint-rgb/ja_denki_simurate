import { describe, it, expect } from 'vitest'
import {
  findInsertionPoint,
  insertLines,
  formatFuelEntry,
  formatLevyEntry,
  insertFuelEntries,
  insertLevyEntries
} from './monthlyRatesInsert'

const SAMPLE = `export const CHUGOKU_FUEL: Record<string, FuelRow> = {
  '2025-01': { minimumCharge: '-130.31', unitPriceYenPerKwh: '-8.67' },
  // 出典コメント
  '2025-02': { minimumCharge: '-167.85', unitPriceYenPerKwh: '-11.17' }
};

export const AU_FUEL: Record<string, FuelRow> = {
  '2026-07': { minimumCharge: '-196.24', unitPriceYenPerKwh: '-13.09' }
};

export const RENEWABLE_LEVY: Record<string, string> = {
  '2025-01': '3.49', '2025-02': '3.49'
};
`

describe('findInsertionPoint', () => {
  it('対象の定数ブロックの閉じ括弧の行頭を返す', () => {
    const at = findInsertionPoint(SAMPLE, 'CHUGOKU_FUEL')
    expect(SAMPLE.slice(at)).toMatch(/^};/)
  })

  it('複数の定数がある場合も正しいブロックを選ぶ', () => {
    const at = findInsertionPoint(SAMPLE, 'AU_FUEL')
    expect(SAMPLE.slice(at, at + 30)).toContain('};')
    expect(SAMPLE.slice(0, at)).toContain("'2026-07'")
  })

  it('定数が見つからなければ例外', () => {
    expect(() => findInsertionPoint(SAMPLE, 'NO_SUCH_CONST')).toThrow('挿入先が見つかりません')
  })

  it('閉じ括弧が無ければ例外（推測しない）', () => {
    expect(() => findInsertionPoint('export const X = {', 'X')).toThrow('閉じ括弧')
  })
})

describe('insertLines', () => {
  it('末尾カンマが無ければ補ってから新しい行を足す', () => {
    const at = findInsertionPoint(SAMPLE, 'AU_FUEL')
    const out = insertLines(SAMPLE, at, ["'2026-08': { minimumCharge: '-1', unitPriceYenPerKwh: '-1' },"])
    expect(out).toContain("'2026-07': { minimumCharge: '-196.24', unitPriceYenPerKwh: '-13.09' },\n  '2026-08'")
  })

  it('既に末尾カンマがある場合は二重に付けない', () => {
    const at = findInsertionPoint(SAMPLE, 'CHUGOKU_FUEL')
    const out = insertLines(SAMPLE, at, ["'2025-03': { minimumCharge: '-1', unitPriceYenPerKwh: '-1' },"])
    expect(out).not.toContain(',,')
  })

  it('挿入する行が無ければ何もしない', () => {
    expect(insertLines(SAMPLE, 10, [])).toBe(SAMPLE)
  })

  it('空オブジェクトの直後（カンマ不要）にも挿入できる', () => {
    const empty = 'export const X: Record<string, string> = {\n};\n'
    const at = findInsertionPoint(empty, 'X')
    const out = insertLines(empty, at, ["'2026-01': 'x',"])
    expect(out).not.toMatch(/\{\s*,/)
  })
})

describe('formatFuelEntry / formatLevyEntry', () => {
  it('出典キーがあれば併記する', () => {
    expect(formatFuelEntry({ period: '2026-10', minimumCharge: '-1.00', unitPriceYenPerKwh: '-2.00', from: 'zennoh' })).toBe(
      "'2026-10': { minimumCharge: '-1.00', unitPriceYenPerKwh: '-2.00', from: 'zennoh' },"
    )
  })

  it('出典キーが無ければ省略する', () => {
    expect(formatFuelEntry({ period: '2026-10', minimumCharge: '-1.00', unitPriceYenPerKwh: '-2.00' })).toBe(
      "'2026-10': { minimumCharge: '-1.00', unitPriceYenPerKwh: '-2.00' },"
    )
  })

  it('賦課金は単純な文字列の行になる', () => {
    expect(formatLevyEntry('2026-10', '4.20')).toBe("'2026-10': '4.20',")
  })
})

describe('insertFuelEntries / insertLevyEntries', () => {
  it('複数件を年月順に並べて挿入する', () => {
    const out = insertFuelEntries(SAMPLE, 'CHUGOKU_FUEL', [
      { period: '2025-04', minimumCharge: '-1', unitPriceYenPerKwh: '-1' },
      { period: '2025-03', minimumCharge: '-2', unitPriceYenPerKwh: '-2' }
    ])
    const i03 = out.indexOf("'2025-03'")
    const i04 = out.indexOf("'2025-04'")
    expect(i03).toBeGreaterThan(0)
    expect(i04).toBeGreaterThan(i03)
  })

  it('追記が無ければ元のソースをそのまま返す', () => {
    expect(insertFuelEntries(SAMPLE, 'CHUGOKU_FUEL', [])).toBe(SAMPLE)
    expect(insertLevyEntries(SAMPLE, [])).toBe(SAMPLE)
  })

  it('賦課金テーブルへ追記できる', () => {
    const out = insertLevyEntries(SAMPLE, [{ period: '2025-03', unitPriceYenPerKwh: '3.49' }])
    expect(out).toContain("'2025-03': '3.49',")
  })
})
