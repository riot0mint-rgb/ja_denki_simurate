import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  htmlToTokens,
  parseEnergiaFuelPage,
  parseAuFuelPage,
  findLevyNoticeLinks,
  parseLevyNotice
} from './monthlyRatesParse.js'
import { CHUGOKU_FUEL, AU_FUEL, RENEWABLE_LEVY } from '../packages/calc-core/src/monthlyRatesData.js'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/monthly-rates')
const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8')

const ENERGIA = fixture('energia-nencho-2026-10-14.html')
const AU = fixture('au-adjust-detail-2026-10-14.html')
const LEVY = fixture('energia-levy-notice-2026.html')
const INFO_INDEX = fixture('energia-info-index-2026-10-14.html')

describe('htmlToTokens', () => {
  it('タグ・スクリプト・コメントを除き、実体参照を戻す', () => {
    const html =
      '<p>A&amp;B&nbsp;C</p><script>x</script><style>y</style><!-- z --><td>&lt;1&gt; &quot;q&quot; &#39;s&#39; &#9650;</td>'
    expect(htmlToTokens(html)).toEqual(['A&B C', `<1> "q" 's' ▲`])
  })
})

describe('parseEnergiaFuelPage（中国電力 燃料費等調整単価一覧）', () => {
  const rows = parseEnergiaFuelPage(ENERGIA)

  it('2026-10-14 時点のページから 2024年11月分〜2026年11月分の25か月を読み取る', () => {
    expect(rows).toHaveLength(25)
    expect(rows[0]).toEqual({ period: '2026-11', minimumCharge: '-116.02', unitPriceYenPerKwh: '-7.73', from: 'energia' })
    expect(rows.find(r => r.period === '2026-10')).toEqual({
      period: '2026-10',
      minimumCharge: '-171.63',
      unitPriceYenPerKwh: '-11.43',
      from: 'energia'
    })
  })

  it('収録済みの値（試算表・全農エネルギー由来）とすべて一致する（二重の裏付け）', () => {
    for (const row of rows) {
      const recorded = CHUGOKU_FUEL[row.period]
      if (!recorded) continue
      expect({ period: row.period, min: row.minimumCharge, unit: row.unitPriceYenPerKwh }).toEqual({
        period: row.period,
        min: recorded.minimumCharge,
        unit: recorded.unitPriceYenPerKwh
      })
    }
  })

  it('表の見出しが無ければ失敗する（推測しない）', () => {
    expect(() => parseEnergiaFuelPage('<html><body>改装中</body></html>')).toThrow('2つの表が見つかりません')
  })

  it('表から1行も読めなければ失敗する', () => {
    const html =
      '<h4>電気サービス約款および選択約款のお客さま</h4><p>-</p><h4>電気特定小売供給約款のお客さま</h4><p>-</p>'
    expect(() => parseEnergiaFuelPage(html)).toThrow('1行も読み取れませんでした')
  })

  it('単価の列数が3でない行があれば失敗する', () => {
    const broken = ENERGIA.replace('<td width="12%" class="R">▲116.02</td>', '')
    expect(() => parseEnergiaFuelPage(broken)).toThrow('単価の列数が想定（3列）と違います')
  })

  it('15kWh超と「左記以外」の単価が違う月は、テーブルを分けるべきか人に回す', () => {
    // 自由料金の表の 2026年11月分「左記以外」だけを書き換える
    const broken = ENERGIA.replace(
      '<td width="12%" class="R">▲7.73</td>\n                    <td width="12%" class="R">▲7.73</td>',
      '<td width="12%" class="R">▲7.73</td>\n                    <td width="12%" class="R">▲7.70</td>'
    )
    expect(broken).not.toBe(ENERGIA)
    expect(() => parseEnergiaFuelPage(broken)).toThrow('左記以外の単価 -7.70 が違います')
  })

  it('自由料金と規制料金の表で値が違えば失敗する', () => {
    const regulatedStart = ENERGIA.indexOf('電気特定小売供給約款のお客さま')
    const broken =
      ENERGIA.slice(0, regulatedStart) + ENERGIA.slice(regulatedStart).replace('▲116.02', '▲116.03')
    expect(() => parseEnergiaFuelPage(broken)).toThrow('自由料金と規制料金の表で値が一致しません')
  })

  it('規制料金の表に無い月があっても失敗する', () => {
    const regulatedStart = ENERGIA.indexOf('電気特定小売供給約款のお客さま')
    const rest = ENERGIA.slice(regulatedStart)
    const firstRow = rest.slice(rest.indexOf('<tr class="odd">'), rest.indexOf('</tr>', rest.indexOf('<tr class="odd">')) + 5)
    expect(firstRow).toContain('2026年11月分')
    const broken = ENERGIA.slice(0, regulatedStart) + rest.replace(firstRow, '')
    expect(() => parseEnergiaFuelPage(broken)).toThrow('2026-11: 自由料金と規制料金の表で値が一致しません')
  })

  it('一覧の後ろに「推移」の節が続いていても、そこは読まない', () => {
    const withTrend = ENERGIA.replace(
      '</body>',
      '<h3>燃料費等調整単価の推移</h3><p>2026年11月分</p></body>'
    )
    expect(parseEnergiaFuelPage(withTrend)).toHaveLength(25)
  })

  it('小数2桁でない単価は受け付けない', () => {
    const broken = ENERGIA.replace(/▲116\.02/g, '▲116.0')
    expect(() => parseEnergiaFuelPage(broken)).toThrow('単価の列数')
  })

  it('正の値（▲なし）も読める', () => {
    const plus = ENERGIA.replace(/▲116\.02/g, '16.02').replace(/▲7\.73/g, '+0.73')
    expect(parseEnergiaFuelPage(plus)[0]).toMatchObject({ minimumCharge: '16.02', unitPriceYenPerKwh: '0.73' })
  })
})

describe('parseAuFuelPage（auでんき 燃料費調整単価）', () => {
  const rows = parseAuFuelPage(AU)

  it('中国エリア でんきMプランの前月・当月の税込単価を読む', () => {
    expect(rows).toEqual([
      { period: '2026-09', minimumCharge: '-179.02', unitPriceYenPerKwh: '-11.94', from: 'au-site' },
      { period: '2026-10', minimumCharge: '-119.12', unitPriceYenPerKwh: '-7.95', from: 'au-site' }
    ])
  })

  it('収録済みの月と食い違わない', () => {
    for (const row of rows) {
      const recorded = AU_FUEL[row.period]
      if (recorded) {
        expect(row.minimumCharge).toBe(recorded.minimumCharge)
        expect(row.unitPriceYenPerKwh).toBe(recorded.unitPriceYenPerKwh)
      }
    }
  })

  it('見出しの月が2つ無ければ失敗する', () => {
    expect(() => parseAuFuelPage(AU.replace('2026年10月分', '当月'))).toThrow('表の見出し')
    expect(() => parseAuFuelPage('<p>メンテナンス中</p>')).toThrow('表の見出し')
  })

  it('中国の行が無ければ失敗する', () => {
    expect(() => parseAuFuelPage(AU.replace('<li>中国</li>', '<li>中国電力</li>'))).toThrow('でんきMプラン〔中国〕の行')
  })

  it('「最初の15kWhまで」でなければ（区分が変わったら）失敗する', () => {
    const broken = AU.replace(
      '<li>中国</li></ul></dd></dl><dl><dt>ecoMプラン</dt><dd> <ul><li>中国D</li></ul></dd></dl></th><td>最初の15kWhまで',
      '<li>中国</li></ul></dd></dl><dl><dt>ecoMプラン</dt><dd> <ul><li>中国D</li></ul></dd></dl></th><td>最初の20kWhまで'
    )
    expect(broken).not.toBe(AU)
    expect(() => parseAuFuelPage(broken)).toThrow('最初の15kWhまで')
  })

  it('「上記を超える」の行が無ければ失敗する', () => {
    const tail = AU.slice(AU.indexOf('<li>中国</li>'))
    const head = AU.slice(0, AU.indexOf('<li>中国</li>'))
    expect(() => parseAuFuelPage(head + tail.replace(/上記を超える/g, '超過分'))).toThrow('上記を超える')
  })

  it('単価が3列そろわなければ失敗する', () => {
    expect(() => parseAuFuelPage(AU.replace('-162.86（-179.02）', '-162.86'))).toThrow('3列')
  })
})

describe('findLevyNoticeLinks / parseLevyNotice（再エネ賦課金）', () => {
  it('お知らせ一覧から賦課金単価のお知らせを拾う', () => {
    expect(findLevyNoticeLinks(INFO_INDEX)).toEqual([{ href: '/info/2026/16387.html', fromYear: 2026 }])
  })

  it('年度がつながらない見出し・無関係なリンクは拾わない', () => {
    const html =
      '<a href="/a.html">2026年5月分から2028年4月分までの「再生可能エネルギー発電促進賦課金単価」について</a><a href="/b.html">森林イベント</a>'
    expect(findLevyNoticeLinks(html)).toEqual([])
  })

  it('新年度の単価を 5月分〜翌4月分の12か月に展開する', () => {
    const entries = parseLevyNotice(LEVY, 2026)
    expect(entries).toHaveLength(12)
    expect(entries[0]).toEqual({ period: '2026-05', unitPriceYenPerKwh: '4.18' })
    expect(entries[11]).toEqual({ period: '2027-04', unitPriceYenPerKwh: '4.18' })
    for (const e of entries) expect(RENEWABLE_LEVY[e.period]).toBe(e.unitPriceYenPerKwh)
  })

  it('年度が違えば失敗する（別年度のお知らせを取り違えない）', () => {
    expect(() => parseLevyNotice(LEVY, 2027)).toThrow('「適用期間」の表')
  })

  it('単価が読めなければ失敗する', () => {
    expect(() => parseLevyNotice(LEVY.replace('>4.18<', '>4.2<'), 2026)).toThrow('単価が読み取れません')
    expect(() => parseLevyNotice(LEVY.replace(/発電促進賦課金単価</g, '賦課金<'), 2026)).toThrow(
      '単価が読み取れません'
    )
  })
})
