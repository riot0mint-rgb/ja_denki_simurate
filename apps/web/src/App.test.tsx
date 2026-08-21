import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
