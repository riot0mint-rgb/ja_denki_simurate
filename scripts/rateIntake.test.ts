import { describe, it, expect, vi } from 'vitest'
import {
  CellRange,
  PlanUnderCheck,
  RangeReader,
  checkPlan,
  parseLocator,
  renderIntakeReport,
  runIntake
} from './rateIntake'

const XLSX = '①JAでんき試算表.xlsx'

const plan = (over: Partial<PlanUnderCheck> = {}): PlanUnderCheck => ({
  planId: 'ja_denki_juryo_a',
  planName: 'JAでんき 従量電灯A',
  values: ['759.68', '32.22', '38.04', '38.84'],
  sources: [{ document: XLSX, locator: '基本項目!E26:E29（規制料金）' }],
  ...over
})

/** 指定した範囲だけを返す読み取り器。それ以外は解決不能 */
const reader = (
  ranges: Record<string, { values: number[]; formulaLiterals?: number[] }>
): RangeReader =>
  vi.fn((_doc, sheet, range) => {
    const hit = ranges[`${sheet}!${range}`]
    return hit
      ? ({ sheet, values: hit.values, formulaLiterals: hit.formulaLiterals ?? [] } as CellRange)
      : null
  })

const E26 = { '基本項目!E26:E29': { values: [759.68, 32.22, 38.04, 38.84] } }

describe('出典の番地の解釈', () => {
  it('シート名と範囲に分解する', () => {
    expect(parseLocator('基本項目!E26:E29')).toEqual({ sheet: '基本項目', ranges: ['E26:E29'] })
  })

  // ファミリー系は単価がシート上で連続しておらず、飛び地の範囲で書かれている。
  // これを取りこぼすと3プランが黙って突合の対象外になる
  it('カンマ区切りの飛び地をすべて拾う', () => {
    expect(parseLocator("'ファミリーⅠ結果'!H7, E8, E10:E13, H15")).toEqual({
      sheet: 'ファミリーⅠ結果',
      ranges: ['H7', 'E8', 'E10:E13', 'H15']
    })
  })

  it('番地として読めない断片は落とす', () => {
    expect(parseLocator('基本項目!E8, 備考, E10')).toEqual({
      sheet: '基本項目',
      ranges: ['E8', 'E10']
    })
  })

  it('番地が1つも取れなければ null', () => {
    expect(parseLocator('基本項目!備考欄')).toBeNull()
  })

  it('シート名に空白があればクォートつきで書かれる', () => {
    expect(parseLocator("'シミュレーション結果明細 VSシンプル'!I20")).toEqual({
      sheet: 'シミュレーション結果明細 VSシンプル',
      ranges: ['I20']
    })
  })

  it('括弧書きの補足は番地の一部ではない', () => {
    expect(parseLocator('基本項目!E26:E29（規制料金）')).toEqual({
      sheet: '基本項目',
      ranges: ['E26:E29']
    })
    expect(parseLocator('基本項目!S62:S65(時間帯別単価)')).toEqual({
      sheet: '基本項目',
      ranges: ['S62:S65']
    })
  })

  it('単一セルも範囲として扱う', () => {
    expect(parseLocator('基本項目!E20')).toEqual({ sheet: '基本項目', ranges: ['E20'] })
  })

  it('URL や書名は番地ではない', () => {
    expect(parseLocator('https://www.energia.co.jp/elec/h_menu/pricelist/pricelist5.html')).toBeNull()
    expect(parseLocator('中国電力 電気料金単価表（電灯）')).toBeNull()
  })
})

describe('突合', () => {
  it('すべての値が範囲にあれば一致', () => {
    const r = checkPlan(plan(), reader(E26))
    expect(r.status).toBe('match')
    expect(r.missingInSheet).toEqual([])
  })

  it('並び順が違っても一致とみなす', () => {
    const r = checkPlan(plan(), reader({ '基本項目!E26:E29': { values: [38.84, 759.68, 38.04, 32.22] } }))
    expect(r.status).toBe('match')
  })

  it('同じ値が範囲に何度も出てきても一致（シンプルコースの単価は3回並ぶ）', () => {
    const simple = plan({
      planId: 'chugoku_simple',
      values: ['1844.7', '38.21', '1845'],
      sources: [{ document: XLSX, locator: '基本項目!E52:E55' }]
    })
    const r = checkPlan(
      simple,
      reader({ '基本項目!E52:E55': { values: [1844.7, 38.21, 38.21, 38.21], formulaLiterals: [1845] } })
    )
    expect(r.status).toBe('match')
  })

  it('改定で単価が動いていれば不一致として拾う', () => {
    const r = checkPlan(plan({ values: ['759.68', '33.00', '38.04', '38.84'] }), reader(E26))
    expect(r.status).toBe('mismatch')
    expect(r.missingInSheet).toEqual(['33.00'])
    expect(r.extraInSheet).toEqual([32.22])
  })

  it('小数2桁までで比べる（33 と 33.00 を別物にしない）', () => {
    const r = checkPlan(
      plan({ values: ['759.68', '32.220', '38.04', '38.84'] }),
      reader(E26)
    )
    expect(r.status).toBe('match')
  })

  it('数値として読めない値はそのまま比べる（壊れたデータを黙って通さない）', () => {
    const r = checkPlan(plan({ values: ['未確認'] }), reader(E26))
    expect(r.status).toBe('mismatch')
    expect(r.missingInSheet).toEqual(['未確認'])
  })

  it('試算表にしかない値は「余剰」として報告する（段階が増えた場合）', () => {
    const r = checkPlan(
      plan(),
      reader({ '基本項目!E26:E29': { values: [759.68, 32.22, 38.04, 38.84, 41.0] } })
    )
    expect(r.status).toBe('match')
    expect(r.extraInSheet).toEqual([41])
  })
})

describe('飛び地の範囲', () => {
  const family = plan({
    planId: 'chugoku_family_2',
    planName: '中国電力 ファミリータイムⅡ',
    values: ['1578.72', '46.46', '30.35'],
    sources: [{ document: XLSX, locator: "'ファミリーⅡ結果'!E8, E10:E11" }]
  })

  it('複数の範囲を合わせて突合する', () => {
    const r = checkPlan(
      family,
      reader({ 'ファミリーⅡ結果!E8': { values: [1578.72] }, 'ファミリーⅡ結果!E10:E11': { values: [46.46, 30.35] } })
    )
    expect(r.status).toBe('match')
  })

  // 一部だけ読めた状態を「一致」と言い切ると、書式変更を単価改定と読み違えて
  // rates.ts を誤った値に「合わせて」しまう
  it('一部の範囲しか読めなければ partial として扱う', () => {
    const r = checkPlan(family, reader({ 'ファミリーⅡ結果!E8': { values: [1578.72] } }))
    expect(r.status).toBe('mismatch')
    expect(r.locators[0].status).toBe('partial')
    expect(r.locators[0].unreadRanges).toEqual(['E10:E11'])
    expect(r.missingInSheet).toEqual(['46.46', '30.35'])
  })

  it('値が揃って見えても、読めない範囲があれば一致とは言わない', () => {
    // 読めた範囲だけで実装の値がすべて説明できてしまうケース
    const plan2 = plan({
      values: ['1578.72'],
      sources: [{ document: XLSX, locator: "'ファミリーⅡ結果'!E8, E10:E11" }]
    })
    const r = checkPlan(plan2, reader({ 'ファミリーⅡ結果!E8': { values: [1578.72] } }))
    expect(r.missingInSheet).toEqual([])
    expect(r.status).toBe('mismatch')
    expect(r.locators[0].unreadRanges).toEqual(['E10:E11'])
  })

  it('どの範囲も読めなければ解決不能', () => {
    const r = checkPlan(family, reader({}))
    expect(r.status).toBe('unresolvable')
  })
})

describe('数式に埋まった値', () => {
  // 最低月額料金の請求額はセルの計算結果ではなく数式の定数として書かれている。
  // 計算結果だけを見ると、その月の試算額と比べてしまい誤検知になる。
  const nightHoliday = plan({
    planId: 'chugoku_night_holiday',
    planName: '中国電力 ナイトホリデー',
    values: ['1844.7', '1845'],
    sources: [{ document: XLSX, locator: "'明細 VSシンプル'!I20" }]
  })

  it('計算結果ではなく数式の定数と照合できる', () => {
    const r = checkPlan(
      nightHoliday,
      reader({ '明細 VSシンプル!I20': { values: [11420], formulaLiterals: [1844.7, 1845, 0] } })
    )
    expect(r.status).toBe('match')
  })

  it('数式の定数を読まなければ誤検知になる（回帰の見張り）', () => {
    const r = checkPlan(nightHoliday, reader({ '明細 VSシンプル!I20': { values: [11420] } }))
    expect(r.status).toBe('mismatch')
  })

  it('その月の試算額は「余剰」に出しても不一致にはしない', () => {
    const r = checkPlan(
      nightHoliday,
      reader({ '明細 VSシンプル!I20': { values: [11420], formulaLiterals: [1844.7, 1845] } })
    )
    expect(r.status).toBe('match')
    expect(r.extraInSheet).toEqual([11420])
  })
})

describe('番地が解決できないとき（CLAUDE.md ルール8）', () => {
  it('近い値を探しに行かず、解決不能として返す', () => {
    const r = checkPlan(plan(), reader({}))
    expect(r.status).toBe('unresolvable')
    expect(r.missingInSheet).toEqual([])
    expect(r.locators[0].status).toBe('unresolvable')
  })

  it('読める出典が1つでもあれば突合は進めるが、読めなかった出典を残す', () => {
    const two = plan({
      sources: [
        { document: XLSX, locator: '基本項目!E26:E29' },
        { document: XLSX, locator: '基本項目!ZZ900:ZZ903' }
      ]
    })
    const r = checkPlan(two, reader(E26))
    // 出典まるごと読めないのは「別の出典」なので match のまま
    expect(r.status).toBe('match')
    expect(r.locators.map(l => l.status)).toEqual(['read', 'unresolvable'])
  })

  it('試算表を指していない出典だけのプランは突合の対象外', () => {
    const jaOnly = plan({
      sources: [{ document: 'JAでんき 料金メニュー定義書', locator: 'https://example.invalid/x.pdf' }]
    })
    const r = checkPlan(jaOnly, reader({}))
    expect(r.status).toBe('no-spreadsheet-source')
    expect(r.locators[0].status).toBe('not-a-spreadsheet')
  })
})

describe('集計', () => {
  it('状態ごとの件数を出す', () => {
    const report = runIntake(
      [
        plan(),
        plan({ planId: 'b', values: ['99.99'] }),
        plan({ planId: 'c', sources: [{ document: XLSX, locator: '基本項目!ZZ1' }] }),
        plan({ planId: 'd', sources: [{ document: 'PDF', locator: 'https://example.invalid' }] })
      ],
      reader(E26)
    )
    expect(report).toMatchObject({ matched: 1, mismatched: 1, unresolvable: 1, skipped: 1 })
  })
})

describe('レポート', () => {
  const label = '8ファイル / archive'

  it('一致だけなら改定が無いと明言する', () => {
    const report = runIntake([plan()], reader(E26))
    const out = renderIntakeReport(report, label)
    expect(out).toContain('すべて試算表と一致しています')
    expect(out).not.toContain('| 実装の値 |')
  })

  it('不一致は実装の値と試算表の値を並べる', () => {
    const report = runIntake([plan({ values: ['33.00'] })], reader(E26))
    const out = renderIntakeReport(report, label)
    expect(out).toContain('JAでんき 従量電灯A')
    expect(out).toContain('33.00')
    expect(out).toContain('32.22')
  })

  it('実装側と試算表側で件数が違っても表が崩れない', () => {
    // 実装に2件足りず、試算表側の余剰は1件しかないケース
    const report = runIntake(
      [plan({ values: ['33.00', '44.00'] })],
      reader({ '基本項目!E26:E29': { values: [32.22] } })
    )
    const out = renderIntakeReport(report, label)
    expect(out).toContain('| 33.00 | 32.22 |')
    expect(out).toContain('| 44.00 | — |')
  })

  it('数式の定数も内訳に出す', () => {
    const report = runIntake(
      [plan({ values: ['9.99'], sources: [{ document: XLSX, locator: "'明細'!I20" }] })],
      reader({ '明細!I20': { values: [11420], formulaLiterals: [1844.7, 1845] } })
    )
    expect(renderIntakeReport(report, label)).toContain('数式に現れる定数: 1844.7, 1845')
  })

  it('飛び地の一部が読めなければ番地を挙げて改定と読み違えないよう促す', () => {
    const partial = plan({
      sources: [{ document: XLSX, locator: '基本項目!E26:E29, ZZ900:ZZ903' }]
    })
    const out = renderIntakeReport(runIntake([partial], reader(E26)), label)
    expect(out).toContain('読めなかった番地があります')
    expect(out).toContain('ZZ900:ZZ903')
    expect(out).toContain('単価の改定と読み違えないでください')
  })

  it('解決不能は書式変更を疑うよう促す', () => {
    const out = renderIntakeReport(runIntake([plan()], reader({})), label)
    expect(out).toContain('シートの書式が変わった可能性があります')
    expect(out).toContain('近い値を探しに行くようなことはしません')
  })

  it('書き換えをしないことと、承認が人の仕事であることを必ず書く', () => {
    const out = renderIntakeReport(runIntake([plan()], reader(E26)), label)
    expect(out).toContain('書き換えは行っていません')
    expect(out).toContain('人が判断します')
    expect(out).toContain('ルール10')
  })
})
