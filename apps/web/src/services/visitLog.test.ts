import { describe, it, expect } from 'vitest'
import {
  VisitLog,
  LOG_COLUMNS,
  MIN_SAMPLE,
  usageBand,
  savingsBand,
  headerRow,
  toRow,
  toTsv,
  parseTsv,
  summarize,
  assertNoIdentifyingColumn
} from './visitLog'

const log = (partial: Partial<VisitLog> = {}): VisitLog => ({
  date: '2026-08-22',
  reached: 'closing',
  interest: 'curious',
  household: 'small',
  daytime: 'away',
  allElectric: 'no',
  concern: 'price',
  scenarioId: 'chugoku_juryo_a',
  usageBand: '300〜500kWh',
  savingsBand: '3千〜1万円',
  objections: ['think'],
  outcome: 'applied',
  confidence: 'B',
  nextVisit: '1〜2週間のうちに',
  stoppedAt: '検討します／家族に相談します',
  ...partial
})

describe('個人にたどり着けないことを構造で担保する', () => {
  it('書き出す列に、個人を特定できるものが無い', () => {
    // ここが緩むと、無認証の画面が顧客名簿になる
    expect(() => headerRow()).not.toThrow()
  })

  it('個人を特定できる列を足そうとしたら落ちる', () => {
    expect(() => assertNoIdentifyingColumn(['日付', 'お客様のご住所'])).toThrow(/個人/)
    expect(() => assertNoIdentifyingColumn(['氏名'])).toThrow()
    expect(() => assertNoIdentifyingColumn(['訪問時刻'])).toThrow()
  })

  it('日付だけで、時刻は持たない', () => {
    // 時刻＋地域は、他の情報と突き合わせると絞り込みの手がかりになる
    expect(toRow(log())[0]).toBe('2026-08-22')
    expect(LOG_COLUMNS.some(c => c.label.includes('時刻'))).toBe(false)
  })
})

describe('使用量の帯', () => {
  it('実数ではなく帯にする', () => {
    expect(usageBand(100)).toBe('〜150kWh')
    expect(usageBand(150)).toBe('150〜300kWh')
    expect(usageBand(348)).toBe('300〜500kWh')
    expect(usageBand(700)).toBe('500〜1000kWh')
    expect(usageBand(9000)).toBe('1000kWh〜')
  })

  it('境界はそれぞれ上の帯に入る', () => {
    expect(usageBand(149)).toBe('〜150kWh')
    expect(usageBand(299)).toBe('150〜300kWh')
    expect(usageBand(499)).toBe('300〜500kWh')
    expect(usageBand(999)).toBe('500〜1000kWh')
    expect(usageBand(1000)).toBe('1000kWh〜')
  })

  it('無い・おかしい値は帯にしない', () => {
    expect(usageBand(null)).toBeNull()
    expect(usageBand(-1)).toBeNull()
    expect(usageBand(NaN)).toBeNull()
  })
})

describe('年間差額の帯', () => {
  it('高くなる側もまとめずに分ける', () => {
    expect(savingsBand(-9504)).toBe('高くなる')
    expect(savingsBand(0)).toBe('同額')
    expect(savingsBand(2999)).toBe('〜3千円')
    expect(savingsBand(5231)).toBe('3千〜1万円')
    expect(savingsBand(20000)).toBe('1万〜3万円')
    expect(savingsBand(111924)).toBe('3万円〜')
  })

  it('まだ試算していないときは帯にしない', () => {
    expect(savingsBand(null)).toBeNull()
    expect(savingsBand(NaN)).toBeNull()
  })
})

describe('書き出し', () => {
  it('Excel にそのまま貼れるタブ区切りで出す', () => {
    const tsv = toTsv([log()])
    expect(tsv.split('\t')).toHaveLength(LOG_COLUMNS.length)
    expect(tsv).toContain('2026-08-22')
    expect(tsv).toContain('applied')
  })

  it('見出しを付けられる', () => {
    const tsv = toTsv([log()], { header: true })
    expect(tsv.split('\n')[0]).toContain('日付')
    expect(tsv.split('\n')).toHaveLength(2)
  })

  it('複数の反論はセミコロンでつなぐ', () => {
    expect(toRow(log({ objections: ['think', 'no_need'] }))).toContain('think;no_need')
  })

  it('未回答の項目は空欄にする（勝手に埋めない）', () => {
    const row = toRow(log({ concern: null, outcome: null, savingsBand: null }))
    expect(row.filter(c => c === '').length).toBe(3)
  })

  it('タブや改行が混じってもセルを壊さない', () => {
    // シナリオIDに想定外の文字が来ても、貼り先の表がずれない
    const row = toRow(log({ scenarioId: 'a\tb\nc' }))
    expect(row.some(c => c.includes('\t') || c.includes('\n'))).toBe(false)
    expect(row).toContain('a b c')
  })
})

describe('貼り戻して読む', () => {
  const header = headerRow().join('\t')

  it('見出しの名前で読む', () => {
    const parsed = parseTsv(`${header}\n${toTsv([log()])}`)
    expect(parsed.error).toBeNull()
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]['結果']).toBe('applied')
  })

  it('組織側が列を足していても読める', () => {
    // 現場の表は必ず育つ。位置で読んではいけない
    const parsed = parseTsv(`支店\t${header}\t担当\n中央\t${toTsv([log()])}\t山田`)
    expect(parsed.error).toBeNull()
    expect(parsed.rows[0]['支店']).toBe('中央')
    expect(parsed.rows[0]['日付']).toBe('2026-08-22')
  })

  it('列の順番が入れ替わっていても読める', () => {
    const parsed = parseTsv('結果\t日付\napplied\t2026-08-22')
    expect(parsed.rows[0]['結果']).toBe('applied')
    expect(parsed.rows[0]['日付']).toBe('2026-08-22')
  })

  it('足りない列は名前で知らせる', () => {
    const parsed = parseTsv('日付\t結果\n2026-08-22\tapplied')
    expect(parsed.error).toBeNull()
    expect(parsed.missing).toContain('出た反論')
  })

  it('カンマ区切りでも読める', () => {
    const parsed = parseTsv('日付,結果\n2026-08-22,applied')
    expect(parsed.rows[0]['結果']).toBe('applied')
  })

  it('見出しが無ければ、その旨を返す', () => {
    expect(parseTsv('あ\tい\nう\tえ').error).toMatch(/見出し/)
  })

  it('データが無ければ、その旨を返す', () => {
    expect(parseTsv(header).error).toMatch(/1行以上/)
    expect(parseTsv('').error).toMatch(/1行以上/)
  })

  it('セルが足りない行でも落ちない（現場の表は必ず崩れる）', () => {
    const parsed = parseTsv('日付\t結果\t出た反論\n2026-08-22')
    expect(parsed.error).toBeNull()
    expect(parsed.rows[0]['日付']).toBe('2026-08-22')
    expect(parsed.rows[0]['結果']).toBe('')
  })

  it('空行は読み飛ばす', () => {
    const parsed = parseTsv(`${header}\n\n${toTsv([log()])}\n\n`)
    expect(parsed.rows).toHaveLength(1)
  })
})

describe('集計', () => {
  const rows = (n: number, partial: Partial<VisitLog> = {}) =>
    Array.from({ length: n }, () => log(partial))
  const parse = (logs: VisitLog[]) => parseTsv(toTsv(logs, { header: true })).rows

  it('件数とお申し込み数を数える', () => {
    const s = summarize(parse([...rows(6), ...rows(4, { outcome: 'declined' })]))
    expect(s.total).toBe(10)
    expect(s.applied).toBe(6)
    expect(s.appliedRate).toBe(60)
  })

  it('母数が小さいときは割合を出さない', () => {
    // 1件2件の割合は判断を誤らせる
    const s = summarize(parse(rows(MIN_SAMPLE - 1)))
    expect(s.appliedRate).toBeNull()
  })

  it('差額の帯ごとの申込率を出す（いくら安くなると決まるのか）', () => {
    const s = summarize(
      parse([
        ...rows(6, { savingsBand: '3千〜1万円' }),
        ...rows(6, { savingsBand: '高くなる', outcome: 'not_suitable' })
      ])
    )
    const cheap = s.bySavingsBand.find(t => t.label === '3千〜1万円')!
    const pricey = s.bySavingsBand.find(t => t.label === '高くなる')!
    expect(cheap.appliedRate).toBe(100)
    expect(pricey.appliedRate).toBe(0)
  })

  it('複数の反論をそれぞれ1件として数える', () => {
    const s = summarize(parse(rows(6, { objections: ['think', 'no_need'] })))
    expect(s.byObjection.find(t => t.label === 'think')?.count).toBe(6)
    expect(s.byObjection.find(t => t.label === 'no_need')?.count).toBe(6)
  })

  it('多い順に並べる', () => {
    const s = summarize(
      parse([...rows(3, { concern: 'price' }), ...rows(7, { concern: 'satisfied' })])
    )
    expect(s.byConcern[0].label).toBe('satisfied')
  })

  it('未記入はまとめて数える（黙って捨てない）', () => {
    const s = summarize(parse(rows(6, { concern: null })))
    expect(s.byConcern[0].label).toBe('（未記入）')
    expect(s.byConcern[0].count).toBe(6)
  })

  it('集計したい列そのものが表に無くても落ちない', () => {
    const s = summarize([{ 結果: 'applied' }, { 結果: 'applied' }])
    expect(s.total).toBe(2)
    expect(s.byConcern[0].label).toBe('（未記入）')
  })

  it('セルが空白だけでも「未記入」にまとめる', () => {
    // Excel から貼ると空白セルが混じる
    const s = summarize([{ 気がかり: '  ', 結果: 'applied' }])
    expect(s.byConcern[0].label).toBe('（未記入）')
  })

  it('1件も無くても落ちない', () => {
    const s = summarize([])
    expect(s.total).toBe(0)
    expect(s.appliedRate).toBeNull()
    expect(s.byOutcome).toEqual([])
  })

  it('結果の列が日本語のラベルでも数える', () => {
    // 組織側で読みやすく置き換えられることがある
    const s = summarize(Array.from({ length: 6 }, () => ({ 結果: 'applied', 気がかり: 'price' })))
    expect(s.applied).toBe(6)
  })
})
