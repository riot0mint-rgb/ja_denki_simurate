import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SimpleInput from './SimpleInput'

/**
 * かんたん試算。検針票が無くても、1か月の電気料金から使用量を戻す。
 * 逆算した使用量は「およそ」であることを画面に出し、
 * その使用量での請求額も併記する（推測を黙って出さない・ルール8）。
 */
function setup() {
  const onComplete = vi.fn()
  const onBack = vi.fn()
  const onSwitchToDetailed = vi.fn()
  render(
    <SimpleInput
      onComplete={onComplete}
      onBack={onBack}
      onSwitchToDetailed={onSwitchToDetailed}
    />
  )
  return { user: userEvent.setup(), onComplete, onBack, onSwitchToDetailed }
}

describe('かんたん試算', () => {
  it('時間帯別のプランは選択肢に出さない', () => {
    setup()
    const select = screen.getByLabelText('いまのご契約プラン')
    const labels = Array.from(select.querySelectorAll('option')).map(o => o.textContent)
    expect(labels).toContain('中国電力 従量電灯A')
    expect(labels).not.toContain('中国電力 電化Style')
    expect(labels).not.toContain('中国電力 ファミリータイムⅡ')
  })

  it('電気料金を入れると、およその使用量を出す', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('1か月の電気料金'), '10000')
    expect(screen.getByText('この金額から見たご使用量')).toBeInTheDocument()
    expect(screen.getByText(/およそ/)).toBeInTheDocument()
  })

  // 1kWhあたり数十円動くので、入力額ぴったりにはならないことが多い。
  // ずれたまま黙って進めない
  it('入力額とずれる場合は、その使用量での請求額を併記する', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('1か月の電気料金'), '10000')
    expect(screen.getByText(/になります（ご入力は|ちょうどになるご使用量です/)).toBeInTheDocument()
  })

  it('未入力では次へ進めない', () => {
    setup()
    expect(screen.getByRole('button', { name: '詳しい結果を見る' })).toBeDisabled()
  })

  it('逆算できたら、使用量と逆算の内訳を渡して次へ進む', async () => {
    const { user, onComplete } = setup()
    await user.type(screen.getByLabelText('1か月の電気料金'), '10000')
    await user.click(screen.getByRole('button', { name: '詳しい結果を見る' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
    const [scenarioId, usage, , estimate] = onComplete.mock.calls[0]
    expect(scenarioId).toBe('chugoku_juryo_a')
    expect(usage.totalKwh).toBeGreaterThan(0)
    expect(estimate.billYen).toBe(10000)
    expect(estimate.kwh).toBe(usage.totalKwh)
  })

  // 基本料金や最低料金があるので、いくら安くてもそこまでしか下がらない
  it('下限を下回る金額は理由を出して止める', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('1か月の電気料金'), '10')
    expect(screen.getByText(/下回りません/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '詳しい結果を見る' })).toBeDisabled()
  })

  it('くわしい試算へ切り替えられる', async () => {
    const { user, onSwitchToDetailed } = setup()
    await user.click(screen.getByRole('button', { name: 'くわしい試算' }))
    expect(onSwitchToDetailed).toHaveBeenCalledTimes(1)
  })

  it('戻るで前の画面に戻れる', async () => {
    const { user, onBack } = setup()
    await user.click(screen.getByRole('button', { name: '戻る' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
