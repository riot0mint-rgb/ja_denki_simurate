import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ComparisonResult from './ComparisonResult'
import { GAS_SET_DISCOUNT_YEN } from '../services/calculateService'

const JULY = { year: 2026, month: 7 }

function show(scenarioId: string, usage: object, onBack = vi.fn()) {
  const r = render(
    <ComparisonResult scenarioId={scenarioId} usage={usage} period={JULY} onBack={onBack} />
  )
  return Object.assign(onBack, {
    /** 年間のおトク額。金額そのものは月によって動くので、値ではなく変化を見る */
    annual: () => r.container.querySelector('.hero-figure')!.textContent
  })
}

describe('結果画面', () => {
  // 年額を主役に出す。月額の12倍ではなく、12か月ぶんの燃調で積み上げる
  it('安くなるときは年間のおトク額を主役に出す', () => {
    show('chugoku_juryo_a', { totalKwh: 348 })
    expect(screen.getByText('年間の想定おトク額')).toBeInTheDocument()
    expect(screen.getByText('月あたり')).toBeInTheDocument()
    expect(screen.getAllByText(/おトク$/).length).toBeGreaterThan(0)
  })

  describe('1年ぶんの見積もり方の切り替え', () => {
    it('2つの選び方が両方見えていて、既定は「毎月おなじだけ使う」', () => {
      show('chugoku_juryo_a', { totalKwh: 348 })
      const group = screen.getByRole('group', { name: '1年ぶんの見積もり方' })
      const flat = within(group).getByRole('button', { name: '毎月おなじ' })
      const seasonal = within(group).getByRole('button', { name: '季節で変わる' })
      expect(flat).toHaveAttribute('aria-pressed', 'true')
      expect(seasonal).toHaveAttribute('aria-pressed', 'false')
    })

    it('「季節で増えたり減ったり」を押すと年額が変わる', async () => {
      const r = show('chugoku_juryo_a', { totalKwh: 348 })
      const before = r.annual()
      await userEvent.click(screen.getByRole('button', { name: '季節で変わる' }))
      expect(r.annual()).not.toBe(before)
      expect(
        screen.getByRole('button', { name: '季節で変わる' })
      ).toHaveAttribute('aria-pressed', 'true')
    })

    it('季節で増減させたときは、見込んだご使用量の幅を出す', async () => {
      show('chugoku_juryo_a', { totalKwh: 348 })
      // 毎月おなじなら「300kWh〜300kWh」は情報にならないので出さない
      expect(screen.queryByText(/見込んだご使用量は/)).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '季節で変わる' }))
      expect(screen.getByText(/見込んだご使用量は/)).toBeInTheDocument()
    })

    it('季節で増減させたときは、もとにした統計の出典を出す（ルール4）', async () => {
      show('chugoku_juryo_a', { totalKwh: 348 })
      expect(screen.queryByText('季節ごとの使われ方の出典')).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '季節で変わる' }))
      expect(screen.getByText('季節ごとの使われ方の出典')).toBeInTheDocument()
      expect(screen.getByText(/電気事業連合会/)).toBeInTheDocument()
    })

    it('積み上げができない（月額×12に落ちる）プランでは切り替えを出さない', () => {
      // 選んでも結果が変わらないボタンは、あるだけで誤解を招く
      show('chugoku_night_holiday', {
        tou: { night: 300 },
        contractKw: 6,
        calendar: {
          days: 30,
          weekendDays: 8,
          holidayDays: 1,
          holidayUsageRatio: 'same',
          julyDays: 0,
          octoberDays: 0
        }
      })
      expect(screen.queryByRole('group', { name: '1年ぶんの見積もり方' })).not.toBeInTheDocument()
    })
  })

  it('高くなるときは「ご負担増」と明示する（誤解を招かない）', () => {
    show('au_m_plan', { totalKwh: 348 })
    expect(screen.getByText('年間の想定ご負担増額')).toBeInTheDocument()
    expect(screen.getAllByText(/ご負担増$/).length).toBeGreaterThan(0)
  })

  it('比較表に現在プランと候補が並ぶ', () => {
    show('chugoku_juryo_a', { totalKwh: 348 })
    const table = screen.getByRole('table', { name: '料金比較表' })
    expect(within(table).getByText(/中国電力 従量電灯A（現在）/)).toBeInTheDocument()
    expect(within(table).getByText(/JAでんき 従量電灯A/)).toBeInTheDocument()
    expect(within(table).getByText('おすすめ')).toBeInTheDocument()
  })

  // 同額なのに「+￥0」を赤で出すと、高くなったように読める
  it('同額の候補は「同額」と出す', () => {
    // 0〜15kWh は中国電力もJAでんきも最低料金だけで同額になる
    show('chugoku_juryo_a', { totalKwh: 10 })
    const table = screen.getByRole('table', { name: '料金比較表' })
    expect(within(table).getAllByText('同額').length).toBeGreaterThan(0)
    expect(within(table).queryByText('+￥0')).not.toBeInTheDocument()
  })

  // 表は「同額」と出しているのに、見出しだけ「切り替えても安くなりません」に
  // なっていた。スマートコースは 1〜16kWh で最低料金が同額
  it('同額のときは見出しも「同額」と揃える', () => {
    show('chugoku_smart', { totalKwh: 10 })
    expect(screen.getByText('年間の料金は同額です')).toBeInTheDocument()
    expect(screen.queryByText(/切り替えても$/)).not.toBeInTheDocument()
    expect(screen.getByText(/同額です。ご使用量が変わると差が出ます/)).toBeInTheDocument()
  })

  it('内訳を開くと計算式と出典が見える（CLAUDE.md ルール4）', async () => {
    show('chugoku_juryo_a', { totalKwh: 348 })
    await userEvent.click(screen.getByText('計算の内訳を表示'))
    expect(screen.getByText('単価の出典')).toBeInTheDocument()
    expect(screen.getAllByText(/基本項目!/).length).toBeGreaterThan(0)
  })

  it('ガスセット割を入れると年額が増える', async () => {
    const r = show('chugoku_juryo_a', { totalKwh: 348 })
    const before = r.annual()
    await userEvent.click(screen.getByRole('radio', { name: /^あり/ }))
    expect(r.annual()).not.toBe(before)
  })

  it('計算できないときは理由と次の一手を出し、推測値を出さない（ルール8）', () => {
    show('chugoku_denka_style', { contractKw: 6 })
    expect(screen.getByText('自動計算に対応していません')).toBeInTheDocument()
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('未対応画面の「入力し直す」で戻れる', async () => {
    const onBack = show('chugoku_denka_style', { contractKw: 6 })
    await userEvent.click(screen.getByRole('button', { name: '入力し直す' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

// 年額はガスセット割を含むため、月額と符号が食い違うことがある。
// 月額の符号で年額のラベルを決めると「増加額 ￥720」のような表示になる
describe('年額のラベルは年額の符号で決める', () => {
  it('ガスセット割で年額が黒字に転じたら「おトク」と出す', async () => {
    // ナイトホリデー 442kWh 付近は月額がわずかにマイナス。
    // セット割 110円/月 を入れると年額は黒字になる
    show('chugoku_night_holiday', { contractKw: 6, tou: { night: 430 } })
    expect(screen.getByText('年間の想定ご負担増額')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: /^あり/ }))
    expect(screen.getByText('年間の想定おトク額')).toBeInTheDocument()
    // 月あたりの符号は月あたりで決める。年額が黒字でも月額は割高のまま
    const monthly = screen.getByText('月あたり').closest('div')!
    expect(monthly.textContent).toMatch(/^月あたり￥\d+ご負担増$/)
  })
})

describe('PDF保存・印刷', () => {
  it('印刷ボタンで window.print が呼ばれる', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })
    show('chugoku_juryo_a', { totalKwh: 348 })
    await userEvent.click(screen.getByRole('button', { name: 'PDFで保存・印刷' }))
    expect(print).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
  })

  it('畳んだままでも内訳が印刷に載るよう、印刷前に開く', async () => {
    vi.spyOn(window, 'print').mockImplementation(() => {})
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })
    show('chugoku_juryo_a', { totalKwh: 348 })
    const details = screen.getByText('計算の内訳を表示').closest('details')!
    expect(details.open).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'PDFで保存・印刷' }))
    expect(details.open).toBe(true)
    vi.restoreAllMocks()
  })

  it('操作用のボタンには print-hide が付き、紙には出ない', () => {
    show('chugoku_juryo_a', { totalKwh: 348 })
    const button = screen.getByRole('button', { name: 'PDFで保存・印刷' })
    expect(button.parentElement).toHaveClass('print-hide')
  })

  it('印刷物に個人情報が載らない（CLAUDE.md ルール7・9）', () => {
    show('chugoku_juryo_a', { totalKwh: 348 })
    const printed = document.body.textContent ?? ''
    // 氏名・住所・電話・メール・お客様番号を表す語がどこにも現れない
    for (const pii of ['お名前', '氏名', '住所', '電話', 'メール', 'お客様番号', '供給地点']) {
      expect(printed).not.toContain(pii)
    }
    // 入力フォーム自体にもそれらの欄が存在しない
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('試算日と適用単価を紙にだけ載せる', () => {
    show('chugoku_juryo_a', { totalKwh: 348 })
    const line = screen.getByText(/試算日:/)
    expect(line).toHaveClass('print-only')
    expect(line.textContent).toContain('検針月: 2026年7月')
    expect(line.textContent).toContain('単価: 2026年7月適用')
  })
})

describe('結果画面（つづき）', () => {
  it('注意書きに検針月・単価の適用月・未計上項目を書く', () => {
    show('chugoku_juryo_a', { totalKwh: 348 })
    expect(screen.getByText(/2026年7月適用の単価に/)).toBeInTheDocument()
    expect(screen.getByText(/2026年7月の燃料費調整額・再エネ賦課金を/)).toBeInTheDocument()
    expect(screen.getByText(/検針票発行手数料/)).toBeInTheDocument()
  })

  // 単価は1版しか無いので、過去月を選ぶと実際の請求額とは違う
  it('単価の適用開始より前の月では注意を足す', () => {
    render(
      <ComparisonResult
        scenarioId="chugoku_juryo_a"
        usage={{ totalKwh: 348 }}
        period={{ year: 2025, month: 1 }}
        onBack={() => {}}
      />
    )
    expect(screen.getByText(/単価の適用開始より前のため、実際の請求額とは異なります/)).toBeInTheDocument()
  })
})

// 「入れ忘れ」と「なしと判断した」がチェックボックスでは区別できない。
// あり／なしを明示的に選ばせる（営業判断・2026-08-20）
describe('ガスセット割はあり／なしを選ぶ', () => {
  it('既定は「なし」が選ばれている', () => {
    show('chugoku_juryo_a', { totalKwh: 348 })
    expect(screen.getByRole('radio', { name: 'なし' })).toBeChecked()
    expect(screen.getByRole('radio', { name: /^あり/ })).not.toBeChecked()
  })

  it('「あり」に切り替えると月額の割引額がラベルに出る', async () => {
    show('chugoku_juryo_a', { totalKwh: 348 })
    const on = screen.getByRole('radio', { name: /^あり/ })
    expect(on).toHaveAccessibleName(`あり（月${GAS_SET_DISCOUNT_YEN}円割引）`)
    await userEvent.click(on)
    expect(on).toBeChecked()
    expect(screen.getByRole('radio', { name: 'なし' })).not.toBeChecked()
  })

  // 年額はこの選択を含む。紙に残らないと、あとから額の根拠が追えない
  it('選んだ側を紙に残す', async () => {
    show('chugoku_juryo_a', { totalKwh: 348 })
    const line = screen.getByText(/ガスとでんきのセット割:/)
    expect(line).toHaveClass('print-only')
    expect(line.textContent).toContain('なし')

    await userEvent.click(screen.getByRole('radio', { name: /^あり/ }))
    expect(screen.getByText(/ガスとでんきのセット割:/).textContent).toContain(
      `あり（月${GAS_SET_DISCOUNT_YEN}円割引）`
    )
  })
})

// 安くならない試算も隠さず、そのまま出す（営業判断・2026-08-20）
describe('安くならないときも正直に出す', () => {
  it('JAでんきが高いシナリオでも比較表と金額をそのまま出す', () => {
    show('au_m_plan', { totalKwh: 348 })
    const table = screen.getByRole('table', { name: '料金比較表' })
    expect(within(table).getByText(/auでんき/)).toBeInTheDocument()
    expect(within(table).getAllByText(/JAでんき/).length).toBeGreaterThan(0)
    // 高い側は「+」付きで出す。伏せない
    expect(within(table).getAllByText(/^\+￥/).length).toBeGreaterThan(0)
    expect(screen.getByText(/現在のご契約のご継続をおすすめします/)).toBeInTheDocument()
  })

  it('高いプランを「おすすめ」と出さない', () => {
    show('au_m_plan', { totalKwh: 348 })
    expect(screen.queryByText('おすすめ')).not.toBeInTheDocument()
  })

  // 符号を落として「初年度 ￥5,000」と出すと、得だと読み違える
  it('初年度も負担増なら、負担増と書く', () => {
    show('au_m_plan', { totalKwh: 348 })
    const label = screen.getByText('新規契約割引 ￥3,000 込み').closest('dt')!
    expect(label.parentElement!.textContent).toMatch(/ご負担増$/)
  })
})

// 最低月額料金や基本料金半額のような「そのままでは読み取れない適用」は
// 内訳に ※ で必ず出す。伏せると請求額と食い違って見える
describe('適用した特例は内訳に出す', () => {
  it('最低月額料金を当てたら、その旨を注記する', async () => {
    show('chugoku_simple', { totalKwh: 0 })
    await userEvent.click(screen.getByText('計算の内訳を表示'))
    const note = screen.getByText(/に満たないため/)
    expect(note.textContent).toContain('※')
    expect(note.textContent).toContain('最低月額料金 1844.70円')
  })
})

// 「なぜ差が出るのか」は生成AIを使わず、計算の内訳の引き算で作っている。
// 内訳を足すと月額の差に必ず一致する（合わない説明は現場で使えない）
describe('差が出ている理由', () => {
  it('差の大きい順に理由を出す', () => {
    show('chugoku_juryo_a', { totalKwh: 348 })
    expect(screen.getByText('差が出ている理由')).toBeInTheDocument()
    const reason = screen.getByText(/電力量料金が月 .*安くなります/)
    // 文章の金額と内訳表の金額を食い違わせない
    expect(reason.textContent).toContain('436円')
    // どの段階の単価が効いているかまで書く
    // 348kWh では第2段階（180kWh分）がいちばん効く
    expect(screen.getByText(/第2段階の単価が .*円\/kWh 安い/)).toBeInTheDocument()
  })

  it('内訳の合計が月額の差と一致する', () => {
    show('chugoku_juryo_a', { totalKwh: 348 })
    const table = screen.getByRole('table', { name: '差額の内訳' })
    const rows = within(table).getAllByRole('row').slice(1)
    const sum = rows.reduce((total, row) => {
      const cell = within(row).getAllByRole('cell')[3].textContent!
      const value = Number(cell.replace(/[^\d]/g, ''))
      return total + (cell.startsWith('−') ? value : -value)
    }, 0)
    // 表に出ている差の合計 ＝ 比較表の月額差（端数は「その他」の行が吸収する）
    expect(sum).toBe(436)
    expect(screen.getByText(/この表の差を足すと、月額の差/).textContent).toContain('￥436')
  })

  // 燃調が違う相手では、そこが理由になる
  it('燃料費調整額の差も理由として出す', () => {
    show('au_m_plan', { totalKwh: 348 })
    expect(screen.getByText(/燃料費調整額が月 .*高くなります/)).toBeInTheDocument()
  })

  // 最低月額料金の月は内訳が請求額の内訳になっていない
  it('最低月額料金が効く月は内訳を出さず理由を書く', () => {
    show('chugoku_simple', { totalKwh: 10 })
    expect(screen.getByText(/最低月額料金が適用されているため/)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: '差額の内訳' })).not.toBeInTheDocument()
  })
})
