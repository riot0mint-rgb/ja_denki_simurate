import { describe, it, expect } from 'vitest'
import { diffRateMaster, renderDiffReport, RateMasterLike } from './rateMasterDiff'

const source = (locator: string) => ({
  document: '①JAでんき試算表.xlsx',
  locator,
  effectiveFrom: '2026-07',
  verificationStatus: 'verified',
  verifiedAt: '2026-08-20'
})

const plan = (over: Record<string, unknown> = {}) => ({
  planId: 'ja_denki_juryo_a',
  planName: 'JAでんき 従量電灯A',
  structure: 'tiered_minimum',
  minimumCharge: '759.68',
  tiers: [
    { tierNumber: 1, startKwh: 15, endKwh: 120, unitPriceYenPerKwh: '32.22' },
    { tierNumber: 2, startKwh: 120, endKwh: 300, unitPriceYenPerKwh: '38.04' }
  ],
  sources: [source('基本項目!E26:E29')],
  ...over
})

const month = (over: Record<string, unknown> = {}) => ({
  provider: 'chugoku',
  period: '2026-07',
  fuel_minimum_charge_yen: '-143.77',
  fuel_unit_price_yen_per_kwh: '-9.57',
  renewable_levy_yen_per_kwh: '4.18',
  source: source('燃料費調整額 2026-07'),
  ...over
})

const master = (plans: object[], monthly: object[] = [month()]): RateMasterLike =>
  ({ plans, monthly_rates: monthly } as RateMasterLike)

describe('改定差分', () => {
  it('変更がなければ差分なし', () => {
    const d = diffRateMaster(master([plan()]), master([plan()]))
    expect(d.hasChanges).toBe(false)
    expect(renderDiffReport(d)).toContain('変更はありません')
  })

  it('単価の変更を経路つきで拾う', () => {
    const after = plan({
      tiers: [
        { tierNumber: 1, startKwh: 15, endKwh: 120, unitPriceYenPerKwh: '33.00' },
        { tierNumber: 2, startKwh: 120, endKwh: 300, unitPriceYenPerKwh: '38.04' }
      ],
      sources: [source('基本項目!E26:E29（26年10月適用）')]
    })
    const d = diffRateMaster(master([plan()]), master([after]))
    const change = d.plans[0].changes.find(c => c.path === 'tiers[0].unitPriceYenPerKwh')
    expect(change).toEqual({
      path: 'tiers[0].unitPriceYenPerKwh',
      before: '32.22',
      after: '33.00'
    })
  })

  it('プランの追加と削除を区別する', () => {
    const added = diffRateMaster(master([]), master([plan()]))
    expect(added.plans[0].status).toBe('added')

    const removed = diffRateMaster(master([plan()]), master([]))
    expect(removed.plans[0].status).toBe('removed')
  })

  it('段階の増減も差分に出る', () => {
    const after = plan({
      tiers: [{ tierNumber: 1, startKwh: 15, endKwh: null, unitPriceYenPerKwh: '32.22' }]
    })
    const d = diffRateMaster(master([plan()]), master([after]))
    const paths = d.plans[0].changes.map(c => c.path)
    expect(paths).toContain('tiers[1].unitPriceYenPerKwh')
    expect(d.plans[0].changes.find(c => c.path === 'tiers[1].unitPriceYenPerKwh')?.after).toBeNull()
  })

  it('null は「なし」として比較する（未設定と 0 を取り違えない）', () => {
    const before = plan({ minimumCharge: null })
    const d = diffRateMaster(master([before]), master([plan({ minimumCharge: '0' })]))
    expect(d.plans[0].changes[0]).toEqual({ path: 'minimumCharge', before: 'なし', after: '0' })
  })

  it('燃料費調整額の改定を拾う', () => {
    const d = diffRateMaster(
      master([plan()], [month()]),
      master([plan()], [month({ fuel_unit_price_yen_per_kwh: '-8.00' })])
    )
    expect(d.monthly[0].key).toBe('chugoku/2026-07')
    expect(d.monthly[0].status).toBe('changed')
  })

  it('新しい月の追加を拾う', () => {
    const d = diffRateMaster(
      master([plan()], [month()]),
      master([plan()], [month(), month({ period: '2026-08' })])
    )
    expect(d.monthly.map(m => m.key)).toEqual(['chugoku/2026-08'])
    expect(d.monthly[0].status).toBe('added')
  })
})

describe('出典の据え置き検知（転記ミス対策）', () => {
  it('単価が動いたのに出典が同じなら警告する', () => {
    const after = plan({ minimumCharge: '800.00' })
    const d = diffRateMaster(master([plan()]), master([after]))
    expect(d.plans[0].sourceUnchanged).toBe(true)
    expect(renderDiffReport(d)).toContain('出典が据え置きのまま単価が動いています')
  })

  it('出典も一緒に変わっていれば警告しない', () => {
    const after = plan({
      minimumCharge: '800.00',
      sources: [source('基本項目!E26:E29（26年10月適用）')]
    })
    const d = diffRateMaster(master([plan()]), master([after]))
    expect(d.plans[0].sourceUnchanged).toBe(false)
    expect(renderDiffReport(d)).not.toContain('出典が据え置き')
  })

  it('新規プランは警告の対象にしない', () => {
    const d = diffRateMaster(master([]), master([plan()]))
    expect(d.plans[0].sourceUnchanged).toBe(false)
  })
})

describe('元資料が欠けていても落ちない', () => {
  it('planName が無ければ plan_id で表示する', () => {
    const nameless = { planId: 'unknown_plan', minimumCharge: '100' }
    const d = diffRateMaster(master([]), master([nameless]))
    expect(d.plans[0].planName).toBe('unknown_plan')
  })

  it('sources キーごと無くても空配列として扱う', () => {
    const { sources, ...noSources } = plan()
    void sources
    const d = diffRateMaster(master([]), master([noSources]))
    expect(d.plans[0].sources).toEqual([])
  })

  it('出典に document や locator が欠けていても表示できる', () => {
    const partial = plan({ sources: [{ locator: '基本項目!E26' }, { document: '①試算表.xlsx' }] })
    const d = diffRateMaster(master([]), master([partial]))
    expect(d.plans[0].sources).toEqual(['基本項目!E26', '①試算表.xlsx'])
  })

  it('月次の行が消えた場合は「削除」になる', () => {
    const d = diffRateMaster(master([plan()], [month()]), master([plan()], []))
    expect(d.monthly[0].status).toBe('removed')
    expect(renderDiffReport(d)).toContain('削除')
  })

  it('月次の行が増えた場合、変更前は「—」で埋める', () => {
    const d = diffRateMaster(
      master([plan()], [month()]),
      master([plan()], [month(), month({ period: '2026-08' })])
    )
    const report = renderDiffReport(d)
    expect(report).toContain('chugoku/2026-08')
    expect(report).toContain('| — |')
  })
})

describe('レポートの体裁', () => {
  it('承認が人の仕事であることを必ず書く（CLAUDE.md ルール10）', () => {
    const d = diffRateMaster(master([plan()]), master([plan({ minimumCharge: '800' })]))
    const report = renderDiffReport(d)
    expect(report).toContain('承認は人が行います')
    expect(report).toContain('ルール10')
  })

  it('変更後の出典を必ず載せる（ルール4）', () => {
    const d = diffRateMaster(master([plan()]), master([plan({ minimumCharge: '800' })]))
    expect(renderDiffReport(d)).toContain('基本項目!E26:E29')
  })

  it('燃料費調整額の改定も表にする', () => {
    const d = diffRateMaster(
      master([plan()], [month()]),
      master([plan()], [month({ fuel_unit_price_yen_per_kwh: '-8.00' })])
    )
    const report = renderDiffReport(d)
    expect(report).toContain('### 燃料費調整額・再エネ賦課金')
    expect(report).toContain('chugoku/2026-07')
    expect(report).toContain('-9.57')
    expect(report).toContain('-8.00')
  })

  it('削除されたプランは「削除」と出す', () => {
    const report = renderDiffReport(diffRateMaster(master([plan()]), master([])))
    expect(report).toContain('削除: JAでんき 従量電灯A')
  })

  it('新規プランは「新規」と出す', () => {
    const report = renderDiffReport(diffRateMaster(master([]), master([plan()])))
    expect(report).toContain('新規: JAでんき 従量電灯A')
  })

  it('出典を持たないプランでも落ちない', () => {
    const noSource = plan({ sources: [] })
    const report = renderDiffReport(
      diffRateMaster(master([noSource]), master([plan({ sources: [], minimumCharge: '800' })]))
    )
    expect(report).toContain('JAでんき 従量電灯A')
    expect(report).not.toContain('出典:')
  })

  it('プラン名と plan_id の両方を出す', () => {
    const d = diffRateMaster(master([plan()]), master([plan({ minimumCharge: '800' })]))
    const report = renderDiffReport(d)
    expect(report).toContain('JAでんき 従量電灯A')
    expect(report).toContain('ja_denki_juryo_a')
  })
})
