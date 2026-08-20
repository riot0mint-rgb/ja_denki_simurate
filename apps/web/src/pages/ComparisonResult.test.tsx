import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ComparisonResult from './ComparisonResult'

const JULY = { year: 2026, month: 7 }

function show(scenarioId: string, usage: object, onBack = vi.fn()) {
  render(<ComparisonResult scenarioId={scenarioId} usage={usage} period={JULY} onBack={onBack} />)
  return onBack
}

describe('結果画面', () => {
  it('安くなるときは「毎月のお得額」を出す', () => {
    show('chugoku_juryo_a', { totalKwh: 348 })
    expect(screen.getByText('毎月のお得額')).toBeInTheDocument()
    expect(screen.getByText(/年間削減額/)).toBeInTheDocument()
  })

  it('高くなるときは「現在の方が安い」と明示する（誤解を招かない）', () => {
    show('au_m_plan', { totalKwh: 348 })
    expect(screen.getByText('毎月の差額（現在の方が安い）')).toBeInTheDocument()
    expect(screen.getByText(/年間増加額/)).toBeInTheDocument()
  })

  it('比較表に現在プランと候補が並ぶ', () => {
    show('chugoku_juryo_a', { totalKwh: 348 })
    const table = screen.getByRole('table')
    expect(within(table).getByText(/中国電力 従量電灯A（現在）/)).toBeInTheDocument()
    expect(within(table).getByText(/JAでんき 従量電灯A/)).toBeInTheDocument()
    expect(within(table).getByText(/★推奨/)).toBeInTheDocument()
  })

  it('内訳を開くと計算式と出典が見える（CLAUDE.md ルール4）', async () => {
    show('chugoku_juryo_a', { totalKwh: 348 })
    await userEvent.click(screen.getByText('計算の内訳を表示'))
    expect(screen.getByText('単価の出典')).toBeInTheDocument()
    expect(screen.getAllByText(/基本項目!/).length).toBeGreaterThan(0)
  })

  it('ガスセット割を入れると年額が増える', async () => {
    show('chugoku_juryo_a', { totalKwh: 348 })
    const annualBefore = screen.getByText(/年間削減額/).textContent
    await userEvent.click(screen.getByRole('checkbox', { name: /ガスとでんきのセット割/ }))
    expect(screen.getByText(/年間削減額/).textContent).not.toBe(annualBefore)
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
  it('ガスセット割で年額が黒字に転じたら「削減額」と出す', async () => {
    // ナイトホリデー 442kWh 付近は月額がわずかにマイナス。
    // セット割 110円/月 を入れると年額は黒字になる
    show('chugoku_night_holiday', { contractKw: 6, tou: { night: 430 } })
    expect(screen.getByText(/年間増加額/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: /ガスとでんきのセット割/ }))
    expect(screen.getByText(/年間削減額/)).toBeInTheDocument()
    // 月額の見出しは月額のまま（現在の方が安い）
    expect(screen.getByText('毎月の差額（現在の方が安い）')).toBeInTheDocument()
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
    expect(screen.getByText(/2026年7月の燃料費調整額・再エネ賦課金/)).toBeInTheDocument()
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
