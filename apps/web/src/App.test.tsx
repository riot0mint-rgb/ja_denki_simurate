import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('画面遷移', () => {
  // 条件を変えて試算し直すたびに入力が消えると、お客様の前で全部打ち直すことになる
  it('結果から戻っても入力が残っている', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '検針票から試算する' }))

    await user.selectOptions(screen.getByLabelText('現在のご契約プラン'), [
      screen.getByRole('option', { name: '中国電力 電化Style' }) as HTMLOptionElement
    ])
    await user.clear(screen.getByLabelText('ご契約電力'))
    await user.type(screen.getByLabelText('ご契約電力'), '8')
    await user.type(screen.getByLabelText('ナイトタイム kWh'), '345')
    await user.click(screen.getByRole('button', { name: '詳しい結果を見る' }))

    expect(screen.getByRole('heading', { name: '料金比較結果' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '条件を変えて試算する' }))

    expect(screen.getByLabelText('現在のご契約プラン')).toHaveValue('chugoku_denka_style')
    expect(screen.getByLabelText('ご契約電力')).toHaveValue(8)
    expect(screen.getByLabelText('ナイトタイム kWh')).toHaveValue(345)
  })

  it('ホーム→入力→結果→入力→ホームと行き来できる', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('heading', { name: /1年でいくら/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '検針票から試算する' }))

    expect(screen.getByRole('heading', { name: '料金を試算' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('ご使用量 (kWh)'), '348')
    await user.click(screen.getByRole('button', { name: '詳しい結果を見る' }))

    expect(screen.getByRole('heading', { name: '料金比較結果' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '条件を変えて試算する' }))

    expect(screen.getByRole('heading', { name: '料金を試算' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '戻る' }))
    expect(screen.getByRole('heading', { name: /1年でいくら/ })).toBeInTheDocument()
  })
})

// かんたん試算から結果まで通しで動くこと。結果には逆算だったことを残す
describe('かんたん試算の導線', () => {
  it('電気料金から試算し、結果に概算である旨を出す', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /かんたん試算/ }))

    expect(screen.getByRole('heading', { name: 'かんたん試算' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('1か月の電気料金'), '12000')
    await user.click(screen.getByRole('button', { name: '詳しい結果を見る' }))

    expect(screen.getByRole('heading', { name: '料金比較結果' })).toBeInTheDocument()
    expect(screen.getByText('かんたん試算の結果です')).toBeInTheDocument()
    expect(screen.getByText(/電気料金からの概算/)).toBeInTheDocument()

    // 戻ると、かんたん試算の入力に戻る（くわしい試算に飛ばされない）
    await user.click(screen.getByRole('button', { name: '条件を変えて試算する' }))
    expect(screen.getByRole('heading', { name: 'かんたん試算' })).toBeInTheDocument()
  })
})

describe('商談ナビと試算の行き来', () => {
  /** 段階の帯のボタン。記録するとナビは作り直されるので、そのつど取り直す */
  const stageButton = (short: string) =>
    within(screen.getByRole('navigation', { name: '商談の進み方' })).getByRole('button', {
      name: short
    })

  /** 商談ナビから 600kWh で試算して、結果まで進む */
  async function estimateFromCoach(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: '商談ナビをひらく' }))
    const rail = screen.getByRole('navigation', { name: '商談の進み方' })
    await user.click(within(rail).getByRole('button', { name: '試算' }))
    await user.click(screen.getByRole('button', { name: '検針票から試算する' }))
    await user.type(screen.getByLabelText('ご使用量 (kWh)'), '600')
    await user.click(screen.getByRole('button', { name: '詳しい結果を見る' }))
  }

  it('試算のあとナビに戻ると、試算ではなく説明の段階に出る', async () => {
    // 試算に戻しても、いま出した数字をどう伝えるかにたどり着けない
    const user = userEvent.setup()
    render(<App />)
    await estimateFromCoach(user)
    await user.click(screen.getByRole('button', { name: '商談ナビにもどる' }))
    expect(screen.getByText('今日の試算を、そのまま読む')).toBeInTheDocument()
    expect(screen.queryByText('どのプランで試算するか')).not.toBeInTheDocument()
  })

  it('記録すると、次のお客様のためにまっさらへ戻る', async () => {
    const user = userEvent.setup()
    render(<App />)
    await estimateFromCoach(user)
    await user.click(screen.getByRole('button', { name: '商談ナビにもどる' }))

    const rail = screen.getByRole('navigation', { name: '商談の進み方' })
    await user.click(within(rail).getByRole('button', { name: '振返' }))
    await user.click(screen.getByRole('button', { name: /お申し込みいただいた/ }))
    await user.click(screen.getByRole('button', { name: /この商談を記録して次のお客様へ/ }))

    // 最初の段階に戻り、記録が1件たまっている
    expect(screen.getByText('持っていくもの')).toBeInTheDocument()
    expect(screen.getByText('今日の記録 1 件')).toBeInTheDocument()
    // 前のお客様の試算を持ち越さない
    expect(screen.queryByText(/年間 .*円 おトク/)).not.toBeInTheDocument()
  })

  it('記録したあと、試算の入力もまっさらになる', async () => {
    // 前のお客様の使用量が残っていると、次のお客様の前で他人の数字を出す
    const user = userEvent.setup()
    render(<App />)
    await estimateFromCoach(user)
    await user.click(screen.getByRole('button', { name: '商談ナビにもどる' }))
    await user.click(stageButton('振返'))
    await user.click(screen.getByRole('button', { name: /ご不在/ }))
    await user.click(screen.getByRole('button', { name: /この商談を記録して次のお客様へ/ }))

    // 記録すると作り直されるので、帯は取り直す
    await user.click(stageButton('試算'))
    await user.click(screen.getByRole('button', { name: '検針票から試算する' }))
    expect(screen.getByLabelText('ご使用量 (kWh)')).toHaveValue(null)
  })

  it('2件めを記録すると、まとめて2件になる', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '商談ナビをひらく' }))
    for (const outcome of [/ご不在/, /^見送り/]) {
      await user.click(stageButton('振返'))
      await user.click(screen.getByRole('button', { name: outcome }))
      await user.click(screen.getByRole('button', { name: /この商談を記録して次のお客様へ/ }))
    }
    expect(screen.getByText('今日の記録 2 件')).toBeInTheDocument()
  })
})
