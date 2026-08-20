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

  it('注意書きに対象月と未計上項目を書く', () => {
    show('chugoku_juryo_a', { totalKwh: 348 })
    expect(screen.getByText(/2026年7月適用の単価による試算です/)).toBeInTheDocument()
    expect(screen.getByText(/検針票発行手数料/)).toBeInTheDocument()
  })
})
