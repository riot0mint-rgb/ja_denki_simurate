import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('画面遷移', () => {
  it('ホーム→入力→結果→入力→ホームと行き来できる', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('heading', { name: 'JAでんき料金比較' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '月の電気代を入力する' }))

    expect(screen.getByRole('heading', { name: '料金を試算' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('ご使用量 (kWh)'), '348')
    await user.click(screen.getByRole('button', { name: '詳しい結果を見る' }))

    expect(screen.getByRole('heading', { name: '料金比較結果' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '条件を変えて試算する' }))

    expect(screen.getByRole('heading', { name: '料金を試算' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '戻る' }))
    expect(screen.getByRole('heading', { name: 'JAでんき料金比較' })).toBeInTheDocument()
  })
})
